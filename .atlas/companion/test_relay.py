import asyncio, hashlib, unittest
from aiohttp import WSMsgType
from aiohttp.test_utils import TestClient, TestServer
from relay import application
from crypto import Cipher,b64

class RelayTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.client=TestClient(TestServer(application({'room-one':hashlib.sha256(b'pi-password').hexdigest(),'room-two':hashlib.sha256(b'other-password').hexdigest()})))
        await self.client.start_server()
    async def asyncTearDown(self):await self.client.close()
    async def join(self,role,room='room-one',password='pi-password'):
        ws=await self.client.ws_connect('/connect')
        await ws.send_json({'role':role,'room':room,'password':password})
        self.assertTrue((await ws.receive_json(timeout=2))['ok']);return ws
    async def test_encrypted_round_trip_and_room_isolation(self):
        pi=await self.join('pi');app=await self.join('app');other=await self.join('pi','room-two','other-password')
        key=b64(bytes(range(32)));phone=Cipher(key,'app');device=Cipher(key,'pi')
        box=phone.seal({'message':'hola'})
        await app.send_json({'box':box});forward=await pi.receive_json(timeout=2)
        self.assertEqual(forward['box'],box);self.assertEqual(device.open(box)['message'],'hola')
        await other.send_json({'peer':forward['peer'],'box':'must-not-cross-rooms'})
        reply=device.seal({'answer':'ok'});await pi.send_json({'peer':forward['peer'],'box':reply})
        result=await app.receive_json(timeout=2);self.assertEqual(result['box'],reply)
        self.assertEqual(phone.open(reply)['answer'],'ok')
    async def test_invalid_registration(self):
        for hello in ([],{'room':[]},{'role':'pi','room':'room-one','password':'wrong'}):
            ws=await self.client.ws_connect('/connect');await ws.send_json(hello)
            result=await ws.receive(timeout=2);self.assertEqual(result.type,WSMsgType.CLOSE)
    async def test_offline_is_explicit(self):
        app=await self.join('app');await app.send_json({'box':'opaque'})
        self.assertIn('error',await app.receive_json(timeout=2))

if __name__=='__main__':unittest.main()
