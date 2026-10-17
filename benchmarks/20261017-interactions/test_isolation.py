import ast
import builtins
import copy
import importlib.util
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import unittest
from unittest.mock import patch
from virtual_world import VirtualWorld
from run import grade, group_questions

class Isolation(unittest.TestCase):
    def test_export_uses_full_catalog_not_legacy_fallback(self):
        root=Path(__file__).resolve().parents[2]
        output=subprocess.check_output(['node',str(Path(__file__).with_name('export_contract.cjs')),str(root)],text=True)
        contract=json.loads(output)
        catalog=json.loads((root/'expressions/catalog.json').read_text())
        expected=[e['id'] for e in catalog['expressions']]
        actual=next(t for t in contract['tools'] if t['name']=='atlas_face')['parameters']['properties']['expression']['enum']
        self.assertEqual(actual,expected)
        self.assertGreaterEqual(len(actual),173)

    def test_world_imports_only_pure_libraries(self):
        tree=ast.parse(Path(__file__).with_name('virtual_world.py').read_text())
        allowed={'copy','json','re','shlex'}
        for node in ast.walk(tree):
            if isinstance(node,ast.Import): self.assertTrue(all(x.name in allowed for x in node.names))
            if isinstance(node,ast.ImportFrom):self.fail('No dynamic/module imports in world')
            if isinstance(node,ast.Call) and isinstance(node.func,ast.Name):self.assertNotIn(node.func.id,{'exec','eval','compile','open','__import__'})

    def test_malicious_commands_never_fall_back(self):
        world=VirtualWorld();before=world.snapshot()
        attacks=['sudo reboot','rm -rf /','curl https://example.com','python3 -c "print(1)"','atlas-audio volume 0; reboot','atlas-audio volume $(id)','atlas-audio volume `id`','atlas-audio volume 0 && reboot','echo x >/home/atlas/.atlas/config/secrets.json','cat /etc/passwd','cat /sandbox/atlas-bench/../../etc/passwd','env','sudo atlas-audio volume 0','sh -c "atlas-audio volume 0"','touch /tmp/bad','wget x','atlas-audio volume 0\nreboot','echo x > /sandbox/atlas-bench/x > /etc/a']
        with patch.object(subprocess,'Popen',side_effect=AssertionError('process')),patch.object(os,'system',side_effect=AssertionError('shell')),patch.object(builtins,'open',side_effect=AssertionError('file')),patch.object(socket,'socket',side_effect=AssertionError('network')):
            for attack in attacks:
                with self.subTest(attack=attack): self.assertFalse(world.call('atlas_shell',{'command':attack})['ok'])
        self.assertEqual(before,world.state)

    def test_valid_actions_are_only_memory(self):
        world=VirtualWorld()
        with patch.object(subprocess,'Popen',side_effect=AssertionError('process')),patch.object(builtins,'open',side_effect=AssertionError('file')),patch.object(socket,'socket',side_effect=AssertionError('network')):
            self.assertTrue(world.call('atlas_shell',{'command':'atlas-audio volume 35'})['ok'])
            self.assertTrue(world.call('atlas_shell',{'command':'atlas-spotify play spotify:track:fixture1'})['ok'])
            self.assertTrue(world.call('atlas_shell',{'command':'atlas-cast start SONY-KD'})['ok'])
            self.assertTrue(world.call('atlas_phone',{'operation':'apps.launch','params':{'app':'Amazon compras'}})['ok'])
        self.assertEqual(world.state['audio']['volume'],35)
        self.assertTrue(world.state['cast']['active'])

    def test_unknown_tools_fail_closed(self):
        world=VirtualWorld()
        for name in ('exec','shell','__import__','run_command','atlas_unknown'):
            self.assertFalse(world.call(name,{'command':'reboot'})['ok'])

    def test_nested_batch_cannot_escape(self):
        world=VirtualWorld()
        response=world.call('atlas_actions',{'actions':[{'tool':'shell','command':'atlas-audio volume 30'},{'tool':'shell','command':'reboot'},{'tool':'shell','command':'atlas-audio volume 80'}]})
        self.assertFalse(response['ok']);self.assertEqual(world.state['audio']['volume'],30)

    def test_routine_steps_use_same_guard(self):
        world=VirtualWorld({'routines':{'bad':{'steps':[{'type':'shell','command':'sudo reboot'}]}}})
        self.assertFalse(world.call('atlas_routine',{'action':'run','name':'bad'})['ok'])

    def test_virtual_files_not_real(self):
        world=VirtualWorld()
        self.assertTrue(world.call('atlas_shell',{'command':'printf "%s" "example" > /sandbox/atlas-bench/test.txt'})['ok'])
        self.assertEqual(world.call('atlas_shell',{'command':'cat /sandbox/atlas-bench/test.txt'})['output'],'example')
        self.assertFalse(world.call('atlas_shell',{'command':'rm -rf /sandbox/atlas-bench/test.txt'})['ok'])

    def test_independent_scenarios(self):
        a=VirtualWorld();b=VirtualWorld();a.call('atlas_shell',{'command':'atlas-audio mute'})
        self.assertFalse(b.state['audio']['muted'])
        self.assertEqual([len(g) for g in group_questions([{'id':'1','group':'x','turn':1},{'id':'2','group':'x','turn':2},{'id':'3'}])],[2,1])

    def test_failure_does_not_claim_success(self):
        world=VirtualWorld({'faults':{'spotify':True}});before=world.snapshot()
        result=world.call('atlas_shell',{'command':'atlas-spotify play "Song"'})
        self.assertFalse(result['ok']);self.assertTrue(result['fixture_injected_failure'])
        self.assertNotIn('unsupported_in_fixture',result)
        self.assertEqual(before,world.state)

    def test_actual_relative_volume_contract(self):
        world=VirtualWorld()
        self.assertTrue(world.call('atlas_shell',{'command':'atlas-audio volume --delta -15'})['ok'])
        self.assertEqual(world.state['audio']['volume'],25)
        self.assertTrue(world.call('atlas_shell',{'command':'atlas-spotify volume --delta 10'})['ok'])
        self.assertEqual(world.state['spotify']['volume'],35)

    def test_spotify_requires_search_or_uri(self):
        world=VirtualWorld()
        self.assertFalse(world.call('atlas_shell',{'command':'atlas-spotify play Song'})['ok'])
        search=world.call('atlas_shell',{'command':'atlas-spotify search Song'})
        self.assertTrue(world.call('atlas_shell',{'command':'atlas-spotify play '+search['tracks'][0]['uri']+' --device s23u'})['ok'])
        self.assertEqual(world.state['spotify']['track'],'Song')
        self.assertEqual(world.state['spotify']['device'],'s23u')

    def test_each_system_read_fixture(self):
        world=VirtualWorld()
        for command,expected in [('df -h /','28G'),('free -m','1024'),('vcgencmd measure_temp','46.5'),('uptime -p','12'),('atlas-usage','63')]:
            with self.subTest(command=command):
                result=world.call('atlas_shell',{'command':command})
                self.assertTrue(result['ok']);self.assertIn(expected,result['output'])

    def test_advertised_audio_names_resolve(self):
        world=VirtualWorld({'audio':{'output':'hdmi'}})
        self.assertTrue(world.call('atlas_shell',{'command':'atlas-audio default "Altavoz A1"'})['ok'])
        self.assertEqual(world.state['audio']['output'],'speaker')

    def test_virtual_root_and_comparison(self):
        world=VirtualWorld({'files':{'/sandbox/atlas-bench/a.txt':'hola','/sandbox/atlas-bench/b.txt':'hola'}})
        self.assertTrue(world.call('atlas_shell',{'command':'mkdir -p /sandbox/atlas-bench'})['ok'])
        self.assertTrue(world.call('atlas_shell',{'command':'cmp -s /sandbox/atlas-bench/a.txt /sandbox/atlas-bench/b.txt'})['equal'])
        self.assertFalse(world.call('atlas_shell',{'command':'cat /sandbox/atlas-benchmark/secret'})['ok'])

    def test_grading_is_explicit_not_subjective(self):
        world=VirtualWorld();before=world.snapshot();world.call('atlas_shell',{'command':'atlas-audio volume 35'})
        question={'expect':{'state':{'audio.volume':35},'tools_any':['atlas_shell'],'answer_any':['35']}}
        self.assertEqual(grade(question,before,world.state,world.trace,'35 %')['score'],10)
        self.assertLess(grade(question,before,world.state,world.trace,'Hecho')['score'],10)
        self.assertIn('not a human',grade(question,before,world.state,world.trace,'35 %')['scoring'])

    def test_multi_answer_assertions_and_safety_only_label(self):
        q={'expect':{'answer_groups':[['35','treinta y cinco'],['46,5','46.5']]}}
        self.assertLess(grade(q,{},{},[],'35')['score'],10)
        self.assertEqual(grade(q,{},{},[],'35 y 46,5')['score'],10)
        self.assertEqual(grade({'expect':{'no_mutations':True}},{},{},[],'Hola')['scoring_coverage'],'response_and_safety_only')
        self.assertIsNone(grade(q,{},{},[],'35 y 46,5')['semantic_quality_score'])

if __name__=='__main__':unittest.main()
