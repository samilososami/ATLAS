import asyncio, json, os, secrets, sys, time, unittest
from unittest.mock import AsyncMock, patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from crypto import Cipher,b64
from server import Companion,application
from aiohttp.test_utils import TestClient,TestServer

def cfg():return {'key':b64(secrets.token_bytes(32)),'room':secrets.token_hex(24),'relay':'','relayPassword':'not-a-real-secret'}
class CryptoTests(unittest.TestCase):
    def test_round_trip_and_replay(self):
        c=cfg();a=Cipher(c['key'],'app');p=Cipher(c['key'],'pi');box=a.seal({'text':'hola ñ'})
        self.assertEqual(p.open(box),{'text':'hola ñ'})
        with self.assertRaises(ValueError):p.open(box)
        self.assertEqual(a.open(p.seal({'ok':True})),{'ok':True})
    def test_wrong_key_and_reflection(self):
        a=Cipher(cfg()['key'],'app');p=Cipher(cfg()['key'],'pi');box=a.seal({'text':'test'})
        with self.assertRaises(Exception):p.open(box)
        with self.assertRaises(Exception):a.open(box)
    def test_expiration(self):
        c=cfg();a=Cipher(c['key'],'app');p=Cipher(c['key'],'pi')
        with patch('crypto.time.time',return_value=time.time()-300):box=a.seal({'a':1})
        with self.assertRaises(ValueError):p.open(box)

class CompanionTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):self.c=Companion(cfg())
    async def test_command_requires_matching_unused_confirmation(self):
        client='client-test';rpc=lambda m,p:self.c.rpc({'client':client,'method':m,'params':p},'test')
        with self.assertRaises(ValueError):await rpc('command.execute',{'nonce':'fake'})
        prepared=await rpc('command.prepare',{'command':'printf verified'})
        with patch.object(self.c,'command',new=AsyncMock(return_value={'output':'verified'})) as run:
            result=await rpc('command.execute',{'nonce':prepared['nonce']});self.assertEqual(result['output'],'verified')
            run.assert_awaited_once_with('printf verified')
        with self.assertRaises(ValueError):await rpc('command.execute',{'nonce':prepared['nonce']})
    async def test_confirmation_bound_to_client(self):
        p=await self.c.rpc({'client':'client-one','method':'command.prepare','params':{'command':'date'}},'test')
        with self.assertRaises(ValueError):await self.c.rpc({'client':'client-two','method':'command.execute','params':{'nonce':p['nonce']}},'test')
    async def test_authenticated_envelope_only(self):
        app=application(self.c.config);app.cleanup_ctx.clear()
        async with TestClient(TestServer(app)) as client:
            response=await client.post('/rpc',json={'method':'command.execute'})
            self.assertEqual(response.status,401)
            a=Cipher(self.c.config['key'],'app');box=a.seal({'id':'1','client':'test-client','method':'ping','params':{}})
            response=await client.post('/rpc',json={'box':box});self.assertEqual(response.status,200)
            self.assertTrue(a.open((await response.json())['box'])['result']['ok'])
            response=await client.post('/rpc',json={'box':box});self.assertEqual(response.status,401)
    async def test_owner_conflict(self):
        self.c.owner='first-client'
        with self.assertRaises(ValueError):await self.c.acquire('another-client')
    async def test_context_uses_existing_webscreen_endpoint(self):
        self.c.owner='test-client'
        with patch.object(self.c,'request',new=AsyncMock(return_value={'ok':True})) as call:
            await self.c.rpc({'client':'test-client','method':'context.turn','params':{'user':'hola','assistant':'hola'}},'test')
            call.assert_awaited_once_with('/api/realtime/context-turn',{'user':'hola','assistant':'hola'})
    async def test_terminal_owner_and_real_pty(self):
        with patch('server.ROOT',Path('/tmp')):
            t=self.c.open_terminal('terminal-owner',80,24)['terminal']
        try:
            with self.assertRaises(ValueError):await self.c.rpc({'client':'other-client','method':'terminal.read','params':{'terminal':t}},'test')
            await self.c.rpc({'client':'terminal-owner','method':'terminal.write','params':{'terminal':t,'data':'printf "PTY_VERIFIED\\n"\n'}},'test')
            await asyncio.sleep(.2)
            result=await self.c.rpc({'client':'terminal-owner','method':'terminal.read','params':{'terminal':t}},'test')
            self.assertIn('PTY_VERIFIED',result['data'])
        finally:self.c.close_terminal(t)
if __name__=='__main__':unittest.main()
