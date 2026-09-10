import asyncio, base64, json, os, secrets, sys, time, unittest
from unittest.mock import AsyncMock, patch
from pathlib import Path
sys.path.insert(0,str(Path(__file__).parent))
from crypto import Cipher,b64
from server import Companion,application
import ble_pair
from aiohttp.test_utils import TestClient,TestServer

def cfg():return {'key':b64(secrets.token_bytes(32)),'room':secrets.token_hex(24),'relay':'','relayPassword':'not-a-real-secret'}

class PairingPayloadTests(unittest.TestCase):
    def test_payload_fits_one_gatt_value_and_has_direct_credentials(self):
        configuration=cfg()
        with patch.object(ble_pair,'tailscale_identity',return_value={'host':'atlas-a1','ip':'100.112.71.111'}), \
             patch.object(ble_pair.ssl,'PEM_cert_to_DER_cert',return_value=b'certificate-der'), \
             patch.object(Path,'read_text',return_value='certificate'):
            payload=ble_pair.pairing_payload(configuration)
        self.assertLessEqual(len(payload),ble_pair.MAX_PAIRING_VALUE_BYTES)
        self.assertTrue(payload.startswith(b'atlas2:'))
        encoded=payload.split(b':',1)[1]
        decoded=json.loads(base64.urlsafe_b64decode(encoded+b'='*((-len(encoded))%4)))
        self.assertEqual(decoded['endpoint'],'wss://100.112.71.111:5010/app')
        self.assertEqual(decoded['key'],configuration['key'])
        self.assertRegex(decoded['pin'],r'^[0-9a-f]{64}$')
        self.assertNotIn('room',decoded)
        self.assertNotIn('relay',decoded)
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
    async def test_tailscale_status_endpoint_prefers_private_ipv4(self):
        status={'BackendState':'Running','Self':{'Online':True,'HostName':'atlas-a1',
            'TailscaleIPs':['100.112.71.111','fd7a:115c:a1e0::1']},'Peer':{}}
        with patch.object(self.c,'command',new=AsyncMock(return_value={'output':json.dumps(status)})):
            result=await self.c.tailscale()
        self.assertEqual(result['host'],'atlas-a1')
        self.assertEqual(result['endpoint'],'wss://100.112.71.111:5010/app')
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
    async def test_direct_websocket_starts_encrypted_and_supports_server_requests(self):
        configuration=cfg();configuration['pairedDevice']='s23u'
        app=application(configuration);app.cleanup_ctx.clear();companion=app['companion']
        async with TestClient(TestServer(app)) as client:
            ws=await client.ws_connect('/app');phone=Cipher(configuration['key'],'app')
            await ws.send_json({'box':phone.seal({
                'id':'connect-test','client':'direct-test-client','device':'s23u',
                'method':'ping','params':{},
            })})
            hello=phone.open((await ws.receive_json(timeout=2))['box'])
            self.assertEqual(hello['id'],'connect-test');self.assertTrue(hello['result']['ok'])
            pending=asyncio.create_task(companion.send_mobile(
                'control.phone.capabilities',{'probe':True},timeout=2,
            ))
            request=phone.open((await ws.receive_json(timeout=2))['box'])
            self.assertTrue(request['serverRequest'])
            self.assertEqual(request['method'],'control.phone.capabilities')
            await ws.send_json({'box':phone.seal({
                'id':'reply-test','client':'direct-test-client','device':'s23u',
                'method':'app.reply','params':{
                    'requestId':request['id'],'result':{'available':True},
                },
            })})
            acknowledgement=phone.open((await ws.receive_json(timeout=2))['box'])
            self.assertTrue(acknowledgement['result']['ok'])
            self.assertEqual(await pending,{'available':True})
    async def test_socket_close_fails_bound_phone_request_without_full_timeout(self):
        configuration=cfg();configuration['pairedDevice']='s23u'
        app=application(configuration);app.cleanup_ctx.clear();companion=app['companion']
        async with TestClient(TestServer(app)) as client:
            ws=await client.ws_connect('/app');phone=Cipher(configuration['key'],'app')
            await ws.send_json({'box':phone.seal({
                'id':'connect-close','client':'close-client','device':'s23u',
                'method':'ping','params':{},
            })})
            phone.open((await ws.receive_json(timeout=2))['box'])
            pending=asyncio.create_task(companion.send_mobile(
                'control.androiduse.screenshot',{},timeout=30,
            ))
            phone.open((await ws.receive_json(timeout=2))['box'])
            await ws.close()
            with self.assertRaisesRegex(ValueError,'Android device not connected'):
                await asyncio.wait_for(pending,timeout=.75)
    async def test_direct_websocket_allows_reentrant_phone_tool_during_command(self):
        configuration=cfg();configuration['pairedDevice']='s23u'
        app=application(configuration);app.cleanup_ctx.clear();companion=app['companion']
        async def command_which_calls_phone(_command):
            result=await companion.send_mobile('control.location.get',{},timeout=2)
            return {'output':json.dumps(result),'exitCode':0,'timedOut':False,'truncated':False}
        with patch.object(companion,'command',new=command_which_calls_phone):
            async with TestClient(TestServer(app)) as client:
                ws=await client.ws_connect('/app');phone=Cipher(configuration['key'],'app')
                await ws.send_json({'box':phone.seal({'id':'connect-reentrant','client':'reentrant-client',
                    'device':'s23u','method':'ping','params':{}})})
                phone.open((await ws.receive_json(timeout=2))['box'])
                await ws.send_json({'box':phone.seal({'id':'prepare-reentrant','client':'reentrant-client',
                    'device':'s23u','method':'command.prepare','params':{'command':'atlas-app control location.get'}})})
                prepared=phone.open((await ws.receive_json(timeout=2))['box'])['result']
                await ws.send_json({'box':phone.seal({'id':'execute-reentrant','client':'reentrant-client',
                    'device':'s23u','method':'command.execute','params':{'nonce':prepared['nonce']}})})
                request=phone.open((await ws.receive_json(timeout=2))['box'])
                self.assertEqual(request['method'],'control.location.get')
                await ws.send_json({'box':phone.seal({'id':'reply-reentrant','client':'reentrant-client',
                    'device':'s23u','method':'app.reply','params':{'requestId':request['id'],
                    'result':{'accuracy':12.0}}})})
                replies=[phone.open((await ws.receive_json(timeout=2))['box']) for _ in range(2)]
                by_id={reply['id']:reply for reply in replies}
                self.assertTrue(by_id['reply-reentrant']['result']['ok'])
                self.assertIn('12.0',by_id['execute-reentrant']['result']['output'])
    async def test_multiple_voice_clients_can_coexist(self):
        self.c.access='test-lease'
        await self.c.acquire('first-client')
        await self.c.acquire('another-client')
        self.assertEqual(self.c.voice_clients,{'first-client','another-client'})
    async def test_failed_session_releases_voice_immediately(self):
        with patch.object(self.c,'acquire',new=AsyncMock()),patch.object(self.c,'request',new=AsyncMock(side_effect=ValueError('Provider unavailable'))),patch.object(self.c,'release',new=AsyncMock()) as release:
            with self.assertRaises(ValueError):
                await self.c.rpc({'client':'test-client','method':'session.open','params':{}},'test')
            release.assert_awaited_once_with('test-client')
    async def test_context_uses_existing_webscreen_endpoint(self):
        self.c.voice_clients.add('test-client')
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
