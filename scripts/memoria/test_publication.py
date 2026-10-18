import json
import hashlib
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

from build import identifier, validate_docx
from publish_branch import validate_bundle


class PublicationTests(unittest.TestCase):
    def test_rename_is_reader_identifier(self):
        self.assertEqual(identifier('nombrecambiado.docx'), 'nombrecambiado')
        self.assertEqual(identifier('Teórico final.docx'), 'teorico-final')

    def test_unsafe_names_fail(self):
        for filename in ('../a.docx', '.hidden.docx', 'x%20y.docx', '?.docx', 'index.docx', '~$teorico.docx'):
            with self.subTest(filename=filename), self.assertRaises(ValueError):
                identifier(filename)

    def make_docx(self, directory, extra=None):
        path = Path(directory) / 'test.docx'
        with ZipFile(path, 'w') as archive:
            if 'word/document.xml' not in (extra or {}):
                archive.writestr('word/document.xml', '<document/>')
            for key, value in (extra or {}).items():
                archive.writestr(key, value)
        return path

    def test_plain_docx_is_valid(self):
        with tempfile.TemporaryDirectory() as directory:
            validate_docx(self.make_docx(directory))

    def test_external_link_is_allowed_but_external_image_is_not(self):
        template = '<Relationships><Relationship Type="https://example.org/{}" TargetMode="External" Target="https://example.org"/></Relationships>'
        with tempfile.TemporaryDirectory() as directory:
            validate_docx(self.make_docx(directory, {'word/_rels/document.xml.rels': template.format('hyperlink')}))
            with self.assertRaises(ValueError):
                validate_docx(self.make_docx(directory, {'word/_rels/document.xml.rels': template.format('image')}))

    def test_macros_traversal_and_entities_fail(self):
        fixtures = [
            {'word/vbaProject.bin': 'macro'},
            {'word/embeddings/example.bin': 'object'},
            {'../evil': 'bad'},
            {'bad.xml': '<!DOCTYPE x [<!ENTITY leak SYSTEM "file:///etc/passwd">]><x>&leak;</x>'},
            {'word/document.xml': '<document><instrText>DDEAUTO attack</instrText></document>'},
        ]
        with tempfile.TemporaryDirectory() as directory:
            for fixture in fixtures:
                with self.subTest(fixture=fixture), self.assertRaises(ValueError):
                    validate_docx(self.make_docx(directory, fixture))

    def test_publication_rejects_executable_and_missing_documents(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / 'manifest.json').write_text(json.dumps({'schemaVersion': 1, 'documents': [{'id': 'teorico', 'filename': 'teorico.docx'}]}))
            with self.assertRaises(ValueError):
                validate_bundle(root)
            (root / 'teorico').mkdir()
            (root / 'teorico.docx').touch()
            (root / 'teorico/document.json').write_text('{}')
            (root / 'teorico/teorico.pdf').touch()
            manifest = json.loads((root / 'manifest.json').read_text())
            manifest['files'] = [{'path': p.relative_to(root).as_posix(), 'size': p.stat().st_size, 'sha256': hashlib.sha256(p.read_bytes()).hexdigest()} for p in root.rglob('*') if p.is_file() and p.name != 'manifest.json']
            (root / 'manifest.json').write_text(json.dumps(manifest))
            validate_bundle(root)
            (root / 'run.sh').write_text('bad')
            with self.assertRaises(ValueError):
                validate_bundle(root)


if __name__ == '__main__':
    unittest.main()
