#!/usr/bin/env python3
"""Blind, self-hosted ATLAS relay. Place behind your HTTPS reverse proxy."""
import asyncio, contextlib, hashlib, hmac, json, os, secrets, time
from pathlib import Path
from aiohttp import web, WSMsgType

def application(devices):
    app=web.Application(client_max_size=2_000_000); rooms={}; peers={}
    async def presence(room,online):
        message={'presence':True,'online':online}
        for peer_room,peer_ws in list(peers.values()):
            if peer_room==room and not peer_ws.closed:
                with contextlib.suppress(ConnectionError,RuntimeError): await peer_ws.send_json(message)
    async def connect(request):
        ws=web.WebSocketResponse(heartbeat=20,max_msg_size=2_000_000)
        await ws.prepare(request); room=None; peer=None; role=None
        try:
            hello=await asyncio.wait_for(ws.receive_json(),10)
            if not isinstance(hello,dict): await ws.close(code=1008); return ws
            role=hello.get('role'); room=hello.get('room')
            if not isinstance(room,str) or room not in devices: await ws.close(code=1008); return ws
            if role=='pi':
                if not isinstance(hello.get('password'),str): await ws.close(code=1008); return ws
                given=hashlib.sha256(hello.get('password','').encode()).hexdigest()
                if not hmac.compare_digest(given,devices[room]): await ws.close(code=1008); return ws
                if room in rooms: await rooms[room].close(code=1012)
                rooms[room]=ws
            elif role=='app':
                if len(peers)>=64: await ws.close(code=1013); return ws
                peer=secrets.token_hex(16); peers[peer]=(room,ws)
            else: await ws.close(code=1008); return ws
            await ws.send_json({'ok':True,'online':room in rooms})
            if role=='pi': await presence(room,True)
            window=time.monotonic(); count=0
            async for event in ws:
                if event.type!=WSMsgType.TEXT: continue
                now=time.monotonic()
                if now-window>10: count=0; window=now
                count+=1
                if count>250: await ws.close(code=1008); break
                value=json.loads(event.data)
                if not isinstance(value,dict): await ws.close(code=1008); break
                box=value.get('box')
                if not isinstance(box,str): continue
                if role=='app':
                    target=rooms.get(room)
                    if target: await target.send_json({'peer':peer,'box':box})
                    else: await ws.send_json({'error':'A1 desconectado'})
                else:
                    target=peers.get(value.get('peer'))
                    if target and target[0]==room: await target[1].send_json({'box':box})
        except (ValueError,asyncio.TimeoutError,ConnectionError): pass
        finally:
            if peer: peers.pop(peer,None)
            if role=='pi' and rooms.get(room) is ws:
                rooms.pop(room,None);await presence(room,False)
        return ws
    app.router.add_get('/connect',connect)
    return app

if __name__=='__main__':
    config=json.loads(Path(os.environ.get('ATLAS_RELAY_CONFIG','/etc/atlas-relay/devices.json')).read_text())
    web.run_app(application(config),host='127.0.0.1',port=8444,access_log=None)
