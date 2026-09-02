import importlib.machinery
import importlib.util
from pathlib import Path
import unittest
from unittest.mock import patch

loader=importlib.machinery.SourceFileLoader('rafas',str(Path(__file__).resolve().parents[1]/'atlas-commands/atlas-rafas'))
spec=importlib.util.spec_from_loader(loader.name,loader)
r=importlib.util.module_from_spec(spec); loader.exec_module(r)

class RafasTests(unittest.TestCase):
    def test_nmcli_escaping(self):
        self.assertEqual(r.split_nm(r'AA\:BB\:CC:casa\:red\\wifi:80:WPA2'),['AA:BB:CC','casa:red\\wifi','80','WPA2'])
    def test_missing_command_is_diagnostic(self):
        self.assertEqual(r.run(['/does-not-exist'])[0],127)
    def test_check_never_mutates(self):
        with patch.object(r,'health',return_value={'ok':True}), patch.object(r,'display'), patch.object(r,'run') as call:
            self.assertEqual(r.doctor(True),0); call.assert_not_called()
    def test_doctor_does_not_start_screen_or_disabled_services(self):
        h={'ok':True,'network':{'defaultRoutes':[{}],'https':True},'ntpSynchronized':True,'services':[
            {'name':'atlas-screen-kiosk.service','load':'loaded','active':'failed','enabled':'enabled','scope':'system'},
            {'name':'atlas-webscreen.service','load':'loaded','active':'inactive','enabled':'disabled','scope':'system'}]}
        with patch.object(r,'health',return_value=h),patch.object(r,'display'),patch.object(r.os,'geteuid',return_value=0),patch.object(r,'run') as call:
            self.assertEqual(r.doctor(),0); call.assert_not_called()
    def test_doctor_starts_enabled_failed_service_only(self):
        h={'ok':False,'network':{'defaultRoutes':[{}],'https':True},'ntpSynchronized':True,'services':[
            {'name':'atlas-webscreen.service','load':'loaded','active':'failed','enabled':'enabled','scope':'system'}]}
        with patch.object(r,'health',return_value=h),patch.object(r,'display'),patch.object(r.os,'geteuid',return_value=0),patch.object(r,'run',return_value=(0,'','')) as call:
            r.doctor(); call.assert_called_once_with(['systemctl','start','atlas-webscreen.service'],20)
if __name__=='__main__': unittest.main()
