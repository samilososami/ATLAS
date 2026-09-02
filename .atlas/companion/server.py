#!/usr/bin/env python3
"""Authenticated ATLAS mobile companion. Independent from WebScreen lifecycle."""
import asyncio, contextlib, fcntl, hashlib, importlib.machinery, importlib.util
import json, os, pathlib, pty, secrets, signal, ssl, struct, subprocess, sys, termios, time
from aiohttp import web, ClientSession, ClientTimeout, WSMsgType
from crypto import Cipher

ROOT=pathlib.Path(os.environ.get('ATLAS_HOME','/home/atlas'))
STATE=ROOT/'.atlas/companion/state'
CONFIG=STATE/'config.json'
WEB='http://127.0.0.1:5000'

class Companion:
    def __init__(self, config):
        self.config=config; self.cipher=Cipher(config['key'],'pi')
        self.http=None; self.access=None; self.owner=None; self.touched=0
        self.terminals={}; self.pending={}; self.clients={}; self.relay='disabled'
        self.lock=asyncio.Lock(); self.health_cache=(0,{})
    async def request(self,path,data=None):
        headers={'X-Atlas-Access':'1'}
        if self.access: headers['X-Atlas-Client']=self.access
        async with self.http.request('GET' if data is None else 'POST',WEB+path,json=data,headers=headers) as r:
            value=await r.json()
            if r.status>=400: raise ValueError(value.get('error',f'WebScreen HTTP {r.status}'))
            return value
    async def release(self):
        if self.access:
            with contextlib.suppress(Exception):
                state=await self.request('/api/access/heartbeat',{'idle':True})
                if state.get('owner'): await self.request('/api/access/activate-atlas-a1',{})
            with contextlib.suppress(Exception): await self.request('/api/access/release',{})
        self.access=None; self.owner=None
    async def acquire(self,client):
        if self.owner and self.owner!=client: raise ValueError('Otro móvil tiene la conversación activa')
        if not self.access:
            self.access=(await self.request('/api/access/connect',{'idle':True,'clientKind':'browser'}))['token']
            await self.request('/api/access/takeover',{})
        self.owner=client; self.touched=time.monotonic()
    async def command(self,cmd,timeout=30):
        p=await asyncio.create_subprocess_exec('/bin/bash','-lc',cmd,cwd=ROOT,
            stdout=asyncio.subprocess.PIPE,stderr=asyncio.subprocess.STDOUT,start_new_session=True,
            env={**os.environ,'PATH':'/usr/local/bin:/usr/bin:/bin:/home/atlas/.npm-global/bin'})
        output=bytearray(); overflow=False
        async def collect():
            nonlocal overflow
            while chunk:=await p.stdout.read(4096):
                remaining=65536-len(output)
                if len(chunk)>remaining: overflow=True
                output.extend(chunk[:remaining])
            await p.wait()
        timed_out=False
        try: await asyncio.wait_for(collect(),timeout)
        except asyncio.TimeoutError:
            timed_out=True
            with contextlib.suppress(ProcessLookupError): os.killpg(p.pid,signal.SIGKILL)
            await p.wait()
        return {'output':output.decode(errors='replace'), 'exitCode':p.returncode,
                'timedOut':timed_out,'truncated':overflow}
    async def quota(self):
        # CLI uses the existing Gateway auth. Never return raw provider errors.
        result=await self.command('openclaw gateway call usage.status --json',12)
        try:
            raw=json.loads(result['output'][result['output'].index('{'):])
            import sys
            sys.path.insert(0,str(ROOT/'.atlas/webscreen'))
            from codex_usage import normalize_usage
            q=normalize_usage(raw)
            return {**q,'available':bool(q['fiveHour'] or q['weekly'])}
        except Exception: return {'available':False,'message':'Cuota no disponible; no significa cero'}
    async def status(self):
        if time.monotonic()-self.health_cache[0]<10: return self.health_cache[1]
        result=await self.command('atlas-rafas --json',15)
        try: h=json.loads(result['output'])
        except ValueError: h={'ok':False,'issues':['No se pudo ejecutar atlas-rafas']}
        h['companion']={'version':'0.1.0','relay':self.relay,'clients':len(self.clients),
                        'voiceActive':bool(self.owner),'terminalCount':len(self.terminals)}
        h['usage']=await self.quota()
        self.health_cache=(time.monotonic(),h); return h
    def open_terminal(self,client,cols,rows):
        if len(self.terminals)>=3: raise ValueError('Máximo tres terminales activas')
        fd,slave=pty.openpty()
        # Start a fresh interpreter before TIOCSCTTY/exec. No Python preexec_fn
        # or forkpty in aiohttp's potentially multithreaded parent process.
        try:
            process=subprocess.Popen([sys.executable,__file__,'--pty-child'],cwd=ROOT,
                stdin=slave,stdout=slave,stderr=slave,start_new_session=True,
                env={**os.environ,'TERM':'xterm-256color','PATH':'/usr/local/bin:/usr/bin:/bin:/home/atlas/.npm-global/bin'})
        except Exception:
            os.close(fd);raise
        finally:os.close(slave)
        os.set_blocking(fd,False)
        key=secrets.token_hex(12)
        self.terminals[key]={'pid':process.pid,'process':process,'fd':fd,'client':client,'touched':time.monotonic()}
        self.resize(key,cols,rows); return {'terminal':key}
    def resize(self,key,cols,rows):
        cols=max(20,min(300,int(cols))); rows=max(5,min(150,int(rows)))
        fcntl.ioctl(self.terminals[key]['fd'],termios.TIOCSWINSZ,struct.pack('HHHH',rows,cols,0,0))
    def close_terminal(self,key):
        t=self.terminals.pop(key,None)
        if t:
            with contextlib.suppress(OSError): os.killpg(t['pid'],signal.SIGHUP)
            with contextlib.suppress(OSError): os.close(t['fd'])
            try:t['process'].wait(timeout=.3)
            except subprocess.TimeoutExpired:
                with contextlib.suppress(OSError):os.killpg(t['pid'],signal.SIGKILL)
                t['process'].wait(timeout=1)
    async def rpc(self,msg,peer):
        if not isinstance(msg,dict): raise ValueError('Petición inválida')
        client=msg.get('client','')
        if not isinstance(client,str) or not 8<=len(client)<=80: raise ValueError('Cliente inválido')
        self.clients[client]={'lastSeen':time.time(),'transport':peer}
        method=msg.get('method'); p=msg.get('params') or {}
        if not isinstance(method,str) or not isinstance(p,dict): raise ValueError('Petición inválida')
        if method=='ping':
            if self.owner==client: self.touched=time.monotonic()
            return {'ok':True,'voiceOwner':self.owner==client}
        if method=='status': return await self.status()
        if method=='session.open':
            async with self.lock:
                await self.acquire(client)
                return await self.request('/api/realtime/session',p)
        if method=='session.close':
            if self.owner==client: await self.release()
            return {'ok':True}
        if method in ('search','context.turn','event'):
            if self.owner!=client: raise ValueError('Abre primero una sesión de ATLAS')
            routes={'search':'/api/realtime/web-search','context.turn':'/api/realtime/context-turn','event':'/api/realtime/event'}
            return await self.request(routes[method],p)
        if method=='command.prepare':
            cmd=p.get('command','')
            if not isinstance(cmd,str) or not cmd.strip() or len(cmd)>4096: raise ValueError('Comando inválido')
            nonce=secrets.token_hex(24)
            self.pending[nonce]={'command':cmd,'client':client,'time':time.monotonic()}
            return {'nonce':nonce,'command':cmd,'expiresIn':60}
        if method=='command.execute':
            prepared=self.pending.pop(p.get('nonce',''),None)
            if not prepared or prepared['client']!=client or time.monotonic()-prepared['time']>60:
                raise ValueError('Confirmación inexistente o caducada')
            return await self.command(prepared['command'])
        if method=='terminal.open': return self.open_terminal(client,p.get('cols',80),p.get('rows',24))
        if method.startswith('terminal.'):
            key=p.get('terminal',''); t=self.terminals.get(key)
            if not t or t['client']!=client: raise ValueError('Terminal cerrada')
            t['touched']=time.monotonic()
            if method=='terminal.close': self.close_terminal(key); return {'ok':True}
            if method=='terminal.resize': self.resize(key,p['cols'],p['rows']); return {'ok':True}
            if method=='terminal.write':
                data=p.get('data','').encode()
                if len(data)>8192: raise ValueError('Entrada demasiado larga')
                os.write(t['fd'],data); return {'ok':True}
            if method=='terminal.read':
                chunks=[]
                try:
                    for _ in range(16): chunks.append(os.read(t['fd'],4096))
                except BlockingIOError: pass
                except OSError: self.close_terminal(key)
                return {'data':b''.join(chunks).decode(errors='replace'),'closed':key not in self.terminals}
        raise ValueError('Operación desconocida')
    async def dispatch(self,box,peer):
        msg=self.cipher.open(box)
        if not isinstance(msg,dict) or not isinstance(msg.get('id'),str): raise ValueError('Petición inválida')
        try: result=await self.rpc(msg,peer); response={'id':msg['id'],'result':result}
        except Exception as e:
            # Don't serialize traceback, auth headers or upstream session material.
            response={'id':msg.get('id'),'error':str(e)[:240] if isinstance(e,ValueError) else 'No se pudo completar la operación'}
        return self.cipher.seal(response)
    async def housekeeping(self):
        while True:
            await asyncio.sleep(4)
            now=time.monotonic()
            if self.access:
                if now-self.touched>40: await self.release()
                else:
                    try:
                        state=await self.request('/api/access/heartbeat',{'idle':True})
                        if not state.get('owner',True): self.access=None; self.owner=None
                    except Exception: await self.release()
            for key,t in list(self.terminals.items()):
                if now-t['touched']>90: self.close_terminal(key)
            self.clients={k:v for k,v in self.clients.items() if time.time()-v['lastSeen']<60}
            self.pending={k:v for k,v in self.pending.items() if now-v['time']<60}
            tmp=STATE/'status.tmp'
            tmp.write_text(json.dumps({'updatedAt':time.time(),'relay':self.relay,'clients':self.clients,
                'voiceActive':bool(self.owner),'terminals':len(self.terminals)}))
            os.replace(tmp,STATE/'status.json')
    async def relay_loop(self):
        delay=1
        while self.config.get('relay'):
            tasks=set()
            try:
                self.relay='connecting'
                async with self.http.ws_connect(self.config['relay'],heartbeat=20,max_msg_size=2_000_000) as ws:
                    await ws.send_json({'role':'pi','room':self.config['room'],'password':self.config['relayPassword']})
                    hello=await ws.receive_json(timeout=10)
                    if not hello.get('ok'): raise ValueError('Relay authentication failed')
                    self.relay='online'; delay=1
                    async def respond(v):
                        try:
                            result=await self.dispatch(v['box'],'relay')
                            await ws.send_json({'peer':v['peer'],'box':result})
                        except Exception: pass
                    async for event in ws:
                        if event.type==WSMsgType.TEXT:
                            v=json.loads(event.data)
                            if len(tasks)<16 and 'box' in v:
                                task=asyncio.create_task(respond(v)); tasks.add(task); task.add_done_callback(tasks.discard)
            except Exception: self.relay='offline'
            finally:
                for task in tasks: task.cancel()
                await asyncio.gather(*tasks,return_exceptions=True)
            await asyncio.sleep(delay); delay=min(30,delay*2)

def application(config):
    app=web.Application(client_max_size=2_000_000)
    c=Companion(config); app['companion']=c
    async def rpc(request):
        if request.content_length and request.content_length>2_000_000: raise web.HTTPRequestEntityTooLarge(max_size=2_000_000,actual_size=request.content_length)
        try:
            data=await request.json()
            return web.json_response({'box':await c.dispatch(data['box'],'lan')},headers={'Cache-Control':'no-store'})
        except Exception: raise web.HTTPUnauthorized(text='Invalid or expired encrypted request')
    async def health(request): return web.json_response({'service':'atlas-companion','version':'0.1.0'})
    app.router.add_get('/health',health); app.router.add_post('/rpc',rpc)
    async def lifecycle(app):
        c.http=ClientSession(timeout=ClientTimeout(total=35))
        jobs=[asyncio.create_task(c.housekeeping()),asyncio.create_task(c.relay_loop())]
        yield
        for job in jobs: job.cancel()
        await asyncio.gather(*jobs,return_exceptions=True)
        await c.release()
        for key in list(c.terminals): c.close_terminal(key)
        await c.http.close()
    app.cleanup_ctx.append(lifecycle); return app

if __name__=='__main__':
    if sys.argv[1:]==['--pty-child']:
        fcntl.ioctl(0,termios.TIOCSCTTY,0)
        os.execv('/bin/bash',['bash','-il'])
    cfg=json.loads(CONFIG.read_text()); tls=ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.minimum_version=ssl.TLSVersion.TLSv1_2
    tls.load_cert_chain(STATE/'certificate.pem',STATE/'private.key')
    web.run_app(application(cfg),host=os.environ.get('ATLAS_APP_BIND','0.0.0.0'),port=5010,
                ssl_context=tls,access_log=None,print=None)
