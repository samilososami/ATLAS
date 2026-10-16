import ast
import json
import re
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, Mock

import capabilities
import server as app

ROOT = Path(__file__).resolve().parents[2]
KNOWLEDGE = ROOT / '.atlas/context/knowledge'


class CapabilityTests(unittest.TestCase):
    def test_index_matches_all_installed_manuals_and_no_personal_files(self):
        with patch.object(capabilities.shutil, 'which', return_value=None):
            result = capabilities.discover(KNOWLEDGE, {})
        self.assertEqual({p.name for p in (KNOWLEDGE / 'atlas-commands').glob('ATLAS-*.md')},
                         {Path(item['manual']).name for item in result['manuals'] if item['command']})
        self.assertFalse(result['liveStateChecked'])
        self.assertTrue(result['readOnly'])
        self.assertTrue(all(item['installed'] is False for item in result['manuals'] if item['command']))
        self.assertNotIn('USER.md', json.dumps(result))

    def test_every_executable_family_is_in_the_map(self):
        catalog = (KNOWLEDGE / 'CAPABILITIES.md').read_text()
        for path in (ROOT / 'atlas-commands').glob('atlas-*'):
            if path.is_file():
                with self.subTest(command=path.name):
                    self.assertIn(path.name, catalog)
        for target in re.findall(r'\]\(([^)]+\.md)\)', catalog):
            self.assertTrue((KNOWLEDGE / target).is_file(), target)

    def test_natural_queries_find_the_expected_contract(self):
        for query, expected in [
            ('número cuenta autenticada whatsapp', 'ATLAS-WHATSAPP.md'),
            ('volumen altavoz silencio', 'ATLAS-AUDIO.md'),
            ('música canción teléfono spotify', 'ATLAS-SPOTIFY.md'),
            ('cuota restante correo ChatGPT', 'ATLAS-USAGE.md'),
            ('televisión pantalla transmitir cast', 'ATLAS-CAST.md'),
            ('automatizar rutinas', 'ATLAS-ROUTINES.md'),
            ('Android ubicación calendario permisos', 'ATLAS-APP.md'),
        ]:
            with self.subTest(query=query):
                result = capabilities.discover(KNOWLEDGE, {'query': query})
                self.assertIn(expected, [Path(item['manual']).name for item in result['matches']])
                self.assertLessEqual(sum(len(item['excerpt']) for item in result['matches']), 9600)

    def test_rejects_private_paths_and_malformed_arguments(self):
        for args in [{'manual': '/etc/passwd'}, {'manual': '../secrets.json'},
                     {'manual': 'USER.md'}, {'manual': 'atlas-commands/../../USER.md'},
                     {'query': 'x' * 401}, {'query': []}, {'offset': True},
                     {'offset': -1}, {'command': 'date'}, None]:
            with self.subTest(args=args), self.assertRaises(ValueError):
                capabilities.discover(KNOWLEDGE, args)

    def test_symlink_and_oversized_files_never_expose_content(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'atlas-commands').mkdir()
            (root / 'USER.md').write_text('PRIVATE_SENTINEL')
            (root / 'atlas-commands/ATLAS-SECRET.md').symlink_to(root / 'USER.md')
            (root / 'CAPABILITIES.md').write_text('x' * (capabilities.MAX_DOCUMENT_CHARS + 1))
            self.assertEqual(capabilities.documents(root), {})

    def test_full_manual_paginates_without_gaps(self):
        manual = 'atlas-commands/ATLAS-WHATSAPP.md'
        chunks, offset = [], 0
        while offset is not None:
            result = capabilities.discover(KNOWLEDGE, {'manual': manual, 'offset': offset})
            chunks.append(result['text'])
            self.assertLessEqual(len(result['text']), capabilities.PAGE_CHARS)
            offset = result['nextOffset']
        self.assertEqual(''.join(chunks), (KNOWLEDGE / manual).read_text())

    def test_unknown_query_is_not_a_capability_denial(self):
        result = capabilities.discover(KNOWLEDGE, {'query': 'zzzzquux'})
        self.assertEqual(result['matches'], [])
        self.assertTrue(result['noMatchDoesNotProveUnsupported'])
        self.assertGreater(len(result['manuals']), 15)

    def test_old_manifest_and_long_history_cannot_push_out_the_map(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'CAPABILITIES.md').write_text('always-check-marker')
            (root / 'IDENTITY.md').write_text('large ' * 20000)
            (root / 'manifest.json').write_text(json.dumps({'groups': [
                {'name': 'core', 'paths': ['IDENTITY.md']},
                {'name': 'conversation', 'virtual': 'conversation'}]}))
            result, stats = app.build_realtime_context(root, root / 'missing',
                persistent_context='history ' * 20000, maximum_chars=2048)
            self.assertIn('always-check-marker', result)
            self.assertFalse(stats['sources'][0]['truncated'])
            self.assertEqual(stats['sources'][0]['name'], 'CAPABILITIES.md')
            self.assertLessEqual(stats['availableFillerTokens'], 30000)
            self.assertLessEqual(stats['autoCompactAtTokens'], 27000)

    def test_endpoint_reads_documents_without_executing_shell(self):
        handler = object.__new__(app.AtlasScreenHandler)
        handler.read_json_payload = Mock(return_value={'args': {'query': 'cuota'}})
        handler.send_json = Mock()
        with patch.object(app, 'resolve_knowledge_dir', return_value=KNOWLEDGE), \
             patch.object(app, 'execute_realtime_shell') as shell:
            handler.handle_realtime_capabilities()
        shell.assert_not_called()
        self.assertEqual(handler.send_json.call_args.args[0], 200)

    def test_tool_contract_is_registered_in_both_normal_surfaces(self):
        tree = ast.parse((ROOT / '.atlas/chat/atlas_chat.py').read_text())
        tool = next(ast.literal_eval(node.value.elts[0]) for node in tree.body
                     if isinstance(node, ast.AnnAssign) and getattr(node.target, 'id', '') == 'REALTIME_TOOLS')
        self.assertEqual(tool['name'], 'atlas_capabilities')
        self.assertFalse(tool['parameters']['additionalProperties'])
        self.assertEqual(set(tool['parameters']['properties']), {'query', 'manual', 'offset'})
        self.assertIn('name: "atlas_capabilities"', (ROOT / '.atlas/webscreen/static/realtime.js').read_text())

    def test_lookup_requires_authentication_and_same_origin(self):
        for headers, status in [({'Host': 'localhost:5000'}, 401),
                                ({'Host': 'localhost:5000', 'Origin': 'https://untrusted.invalid'}, 403)]:
            with self.subTest(status=status):
                handler = object.__new__(app.AtlasScreenHandler)
                handler.path = '/api/realtime/capabilities'
                handler.headers = headers
                handler.send_json = Mock()
                handler.handle_controlled_post = Mock()
                with patch.object(app, 'ACCESS', app.AccessControl()):
                    handler.do_POST()
                self.assertEqual(handler.send_json.call_args.args[0], status)
                handler.handle_controlled_post.assert_not_called()


if __name__ == '__main__':
    unittest.main()
