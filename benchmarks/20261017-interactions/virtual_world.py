"""Pure bounded simulator. No subprocess, networking, filesystem reads/writes or eval.

Shell strings are parsed as DATA into explicit handlers, never executed. Unsupported
commands fail closed. State and fixtures are fictional and private to each group.
"""
import copy
import json
import re
import shlex

class InjectedFixtureFailure(ValueError):
    """An intentional outage, not missing simulator coverage."""

BASE = {
    'audio': {'volume': 40, 'muted': False, 'output': 'speaker'},
    'spotify': {'playing': False, 'volume': 25, 'device': 'a1', 'track': None, 'queue': []},
    'phone': {'connected': True, 'app': None, 'battery': 80,
              'location': {'latitude': 41.3851, 'longitude': 2.1734, 'label': 'Barcelona (ubicación ficticia de prueba)'}},
    'android': {'active': False, 'text': ''},
    'display': {'mode': 'face', 'persistent': False}, 'face': {'expression': 'neutral'},
    'cast': {'active': False, 'target': None, 'browser_url': None},
    'system': {'temperature': 46.5, 'disk_free_gb': 28, 'ram_used_mb': 1024, 'uptime_hours': 12, 'usage_remaining_pct': 63},
    'routines': {}, 'files': {}, 'faults': {},
}

def merge(target, source):
    for key, value in source.items():
        if isinstance(value, dict) and isinstance(target.get(key), dict):
            merge(target[key], value)
        else:
            target[key] = copy.deepcopy(value)

class VirtualWorld:
    def __init__(self, initial=None, manuals=None, expressions=None, web_results=None):
        self.state = copy.deepcopy(BASE)
        merge(self.state, initial or {})
        self.manuals = dict(manuals or {})
        self.expressions = set(expressions or ['neutral', 'angry', 'happy', 'asleep'])
        self.web_results = web_results or []
        self.trace = []
        self.track_lookup = {}

    def snapshot(self):
        return copy.deepcopy(self.state)

    def call(self, name, args):
        before = self.snapshot()
        try:
            if not isinstance(args, dict) or len(json.dumps(args)) > 16384:
                raise ValueError('Invalid bounded arguments')
            result = self._call(name, args)
        except InjectedFixtureFailure as error:
            result = {'ok': False, 'error': str(error)[:200], 'fixture_injected_failure': True}
        except (ValueError, KeyError, TypeError, IndexError) as error:
            result = {'ok': False, 'error': str(error)[:200], 'unsupported_in_fixture': True}
        result['simulation'] = True
        self.trace.append({'name': name, 'args': copy.deepcopy(args), 'result': copy.deepcopy(result), 'before': before, 'after': self.snapshot()})
        return result

    def _call(self, name, args):
        if name == 'atlas_shell':
            result = self.shell(str(args.get('command', '')))
            result.setdefault('exitCode', 0 if result.get('ok') else 1)
            if 'output' not in result:
                result['output'] = json.dumps(result, ensure_ascii=False)
            return result
        if name == 'atlas_capabilities':
            manual = args.get('manual')
            if manual:
                if manual not in self.manuals: raise ValueError('Manual no disponible')
                offset = int(args.get('offset', 0))
                if not 0 <= offset <= 128000: raise ValueError('Offset inválido')
                content = self.manuals[manual]
                return {'ok': True, 'readOnly': True, 'manual': manual, 'text': content[offset:offset+6000], 'nextOffset': offset+6000 if offset+6000 < len(content) else None}
            query = str(args.get('query', '')).lower()
            ranked = sorted(self.manuals, key=lambda x: -sum(w in (x+' '+self.manuals[x]).lower() for w in query.split()))[:4]
            return {'ok': True, 'readOnly': True, 'catalog': self.manuals.get('CAPABILITIES.md',''), 'manuals': [{'manual': x} for x in self.manuals], 'matches': [{'manual': x, 'excerpt': self.manuals[x][:2400]} for x in ranked]}
        if name == 'atlas_face':
            expression = args.get('expression')
            if expression not in self.expressions: raise ValueError('Expresión desconocida')
            self.state['face']['expression'] = expression
            return {'ok': True, 'expression': expression}
        if name == 'atlas_display_mode':
            mode = args.get('mode')
            if mode not in ('clock', 'face'): raise ValueError('Modo no válido')
            self.state['display'].update(mode=mode, persistent=True)
            return {'ok': True, **self.state['display']}
        if name == 'atlas_phone': return self.phone(args)
        if name == 'atlas_android': return self.android(args)
        if name == 'atlas_routine': return self.routine(args)
        if name == 'atlas_web_search':
            return {'ok': True, 'query': args.get('query'), 'results': copy.deepcopy(self.web_results), 'notice': 'Fuentes ficticias de prueba; sin acceso web real.'}
        if name == 'atlas_actions':
            actions = args.get('actions', [])
            if not isinstance(actions, list) or not 2 <= len(actions) <= 8: raise ValueError('Lote de 2 a 8 pasos')
            output = []
            for action in actions:
                kind = action.get('tool')
                if kind not in ('shell', 'phone', 'android'): raise ValueError('Herramienta de lote no admitida')
                result = self.call('atlas_'+kind, {k:v for k,v in action.items() if k != 'tool'})
                output.append(result)
                if not result['ok']: break
            return {'ok': len(output) == len(actions) and all(x['ok'] for x in output), 'results': output}
        raise ValueError('Unknown tool; no fallback executor')

    def shell(self, command):
        if len(command) > 4096 or any(c in command for c in ('\n', '`', '$', '|', '&', ';', '<', '\x00')):
            raise ValueError('Shell syntax unsupported; use an explicit action batch')
        parts = shlex.split(command)
        if not parts: raise ValueError('Empty command')
        if parts[0] in ('echo', 'printf') and '>' in parts:
            index = parts.index('>')
            if index != len(parts)-2: raise ValueError('Only one virtual redirect is supported')
            path = self.path(parts[-1])
            text = ' '.join(parts[1:index])
            if parts[0] == 'printf' and len(parts[1:index]) >= 2 and parts[1] in ('%s', '%s\\n'):
                text = ' '.join(parts[2:index]) + ('\n' if parts[1] == '%s\\n' else '')
            elif parts[0] == 'echo': text += '\n'
            self.state['files'][path] = text
            return {'ok': True, 'output': ''}
        if '>' in command: raise ValueError('Redirect unsupported')
        command_name, tokens = parts[0], parts[1:]
        if command_name == 'atlas-audio': return self.audio(tokens)
        if command_name == 'atlas-spotify': return self.spotify(tokens)
        if command_name == 'atlas-cast': return self.cast(tokens)
        if command_name == 'atlas-routines':
            op=tokens[0] if tokens else 'list'
            if op not in ('list','show','enable','disable','delete','run'):raise ValueError('Unsupported routine CLI operation')
            return self.routine({'action':op,'name':tokens[1] if len(tokens)>1 else None})
        if command_name == 'atlas-face':
            if not tokens or tokens[0] in ('status', 'list'): return {'ok': True, **self.state['face'], 'expressions': sorted(self.expressions)}
            return self._call('atlas_face', {'expression': {'happy':'delighted','sleep':'asleep','thinking':'focused'}.get(tokens[0],tokens[0])})
        if command_name in ('atlas-screen', 'atlas-display'):
            if not tokens or tokens[0] == 'status': return {'ok': True, **self.state['display']}
            mode = tokens[0].lstrip('-')
            return self._call('atlas_display_mode', {'mode': 'face' if mode == 'atlas' else mode})
        if command_name in ('atlas-usage', 'atlas-status', 'atlas-diagnostics'):
            return {'ok': True, **self.state['system'], 'output': json.dumps(self.state['system'])}
        if command_name == 'vcgencmd' and tokens == ['measure_temp']:
            return {'ok': True, 'output': "temp=%s'C" % self.state['system']['temperature']}
        if command_name == 'df': return {'ok': True, 'output': 'Filesystem Size Used Avail Use% Mounted on\nvirtual 64G 36G '+str(self.state['system']['disk_free_gb'])+'G 56% /'}
        if command_name == 'free': return {'ok': True, 'output': 'Mem: 4096 %s 3072 0 0 3072' % self.state['system']['ram_used_mb']}
        if command_name == 'uptime': return {'ok': True, 'output': 'up %s hours' % self.state['system']['uptime_hours']}
        if command_name == 'date': return {'ok': True, 'output': '2026-10-17 12:30:00 Europe/Madrid'}
        if command_name == 'cat' and tokens == ['/sys/class/thermal/thermal_zone0/temp']:
            return {'ok': True, 'output': str(int(self.state['system']['temperature']*1000))}
        if command_name in ('cat', 'ls', 'mkdir', 'cp', 'mv', 'rm', 'cmp', 'diff'):
            paths = [self.path(p) for p in tokens if p not in ('-p', '-l', '-a', '-la','-s','-q')]
            if command_name == 'ls': return {'ok': True, 'output': '\n'.join(self.state['files'])}
            if command_name == 'mkdir': return {'ok': True}
            if not paths: raise ValueError('Path required')
            if command_name == 'cat':
                if paths[0] not in self.state['files']: raise ValueError('Virtual file not found')
                return {'ok': True, 'output': self.state['files'][paths[0]]}
            if command_name in ('cmp','diff'):
                if len(paths)!=2 or any(p not in self.state['files'] for p in paths):raise ValueError('Two existing virtual files required')
                same=self.state['files'][paths[0]]==self.state['files'][paths[1]]
                return {'ok':same,'exitCode':0 if same else 1,'output':'' if same else 'Files differ','equal':same}
            if command_name == 'rm':
                if any(p not in self.state['files'] for p in paths): raise ValueError('Virtual file not found')
                for p in paths: del self.state['files'][p]
                return {'ok': True}
            if len(paths) != 2 or paths[0] not in self.state['files']: raise ValueError('Two virtual paths required')
            self.state['files'][paths[1]] = self.state['files'][paths[0]]
            if command_name == 'mv': del self.state['files'][paths[0]]
            return {'ok': True}
        raise ValueError('Unsupported command in virtual fixture; never executed')

    @staticmethod
    def path(value):
        if not isinstance(value,str) or not (value=='/sandbox/atlas-bench' or value.startswith('/sandbox/atlas-bench/')) or '..' in value.split('/') or '\\' in value or '*' in value or value.startswith('-'):
            raise ValueError('Only bounded virtual /sandbox/atlas-bench/ paths allowed')
        return value

    def fault(self, name):
        if self.state['faults'].get(name): raise InjectedFixtureFailure(name + ' fixture unavailable')

    def audio(self, a):
        self.fault('audio')
        a=list(a)
        aliases={'altavoz a1':'speaker','altavoz integrado':'speaker','auriculares':'headphones','pantalla hdmi':'hdmi'}
        if '--device' in a:
            index=a.index('--device')
            if index+1<len(a):a[index+1]=aliases.get(a[index+1].casefold(),a[index+1])
            if index+1>=len(a) or a[index+1] not in ('speaker','headphones','hdmi'): raise ValueError('Unknown virtual audio device')
            if a[index+1]!=self.state['audio']['output']: raise ValueError('Nondefault output state unsupported in fixture')
            del a[index:index+2]
        state = self.state['audio']; op = a[0] if a else 'status'
        if op in ('status', 'outputs', 'devices'): return {'ok': True, **state, 'outputs': [{'id':'speaker','name':'Altavoz A1'}, {'id':'headphones','name':'Auriculares'},{'id':'hdmi','name':'Pantalla HDMI'}]}
        if op in ('mute', 'unmute', 'toggle-mute'): state['muted'] = not state['muted'] if op == 'toggle-mute' else op == 'mute'
        elif op == 'volume':
            if len(a) == 1: return {'ok': True, **state}
            relative=a[1]=='--delta' or a[1].startswith(('+','-'))
            token=a[2] if a[1]=='--delta' else a[1]
            if not re.fullmatch(r'[+-]?\d{1,4}',token): raise ValueError('Integer volume required')
            value=int(token)
            if relative:value=max(0,min(150,value+state['volume']))
            if not 0 <= value <= 150: raise ValueError('Volume 0..150')
            state['volume'] = value
        elif op in ('default','connect'):
            a[1]=aliases.get(a[1].casefold(),a[1])
            if a[1] not in ('speaker','headphones','hdmi'): raise ValueError('Unknown virtual output')
            state['output'] = a[1]
        else: raise ValueError('Unsupported audio operation')
        return {'ok': True, **state}

    def spotify(self, a):
        self.fault('spotify')
        a=list(a);device=None
        if '--device' in a:
            index=a.index('--device');device=a[index+1]
            if device not in ('a1','s23u'):raise ValueError('Unknown virtual Spotify device')
            del a[index:index+2]
        state = self.state['spotify']; op = a[0] if a else 'status'
        if op in ('status','devices'): return {'ok': True, **state, 'devices':[{'id':'a1','name':'a1'},{'id':'s23u','name':'s23u'}]}
        if op == 'search':
            query=a[1];uri='spotify:track:fixture'+str(len(self.track_lookup)+1)
            self.track_lookup[uri]=query
            return {'ok':True,'tracks':[{'name':query,'uri':uri,'artist':'Artista de prueba'}]}
        if op == 'play':
            if a[1:] and not a[1].startswith(('spotify:track:','spotify:album:','spotify:playlist:')):raise ValueError('Play requires a Spotify URI; search first')
            state['playing'] = True
            if a[1:]: state['track'] = self.track_lookup.get(a[1],a[1])
            if device:state['device']=device
        elif op in ('resume','pause'): state['playing'] = op == 'resume'
        elif op == 'volume':
            relative=a[1]=='--delta';token=a[2] if relative else a[1]
            if not re.fullmatch(r'[+-]?\d+',token):raise ValueError('Integer volume required')
            value=int(token)
            if relative:value=max(0,min(100,value+state['volume']))
            if not 0 <= value <= 100: raise ValueError('Spotify volume 0..100')
            state['volume'] = value
        elif op in ('device','transfer'):
            if op=='device' and a[1]!='connect':raise ValueError('Use device connect TARGET')
            if a[-1] not in ('a1','s23u'):raise ValueError('Unknown virtual Spotify device')
            state['device'] = a[-1]
        elif op == 'queue':
            if len(a)>1:
                if not a[1].startswith('spotify:track:'):raise ValueError('Queue requires Spotify URI')
                state['queue'].append(self.track_lookup.get(a[1],a[1]))
        else: raise ValueError('Unsupported Spotify operation')
        if device:state['device']=device
        return {'ok':True,**state}

    def cast(self, a):
        self.fault('cast'); state=self.state['cast']; op=a[0] if a else 'status'
        if op == 'status': return {'ok':True,**state}
        if op == 'list':return {'ok':True,'devices':[{'name':'SONY-KD'}]}
        if op == 'start': state.update(active=True,target=a[1])
        elif op == 'stop': state['active']=False
        elif op == 'webscreen':
            if not state['active']: raise ValueError('Cast not active')
            state['browser_url']='http://localhost:5000/'
        else: raise ValueError('Unsupported cast operation')
        return {'ok':True,**state}

    def phone(self,args):
        self.fault('phone')
        if not self.state['phone']['connected']: return {'ok':False,'error':'Error: Android device not connected'}
        op=args.get('operation'); p=args.get('params') or {}
        if op=='capabilities': return {'ok':True,'operations':['apps.launch','location.get','sensors.summary','calendar.list','notifications.list']}
        if op=='apps.launch': self.state['phone']['app']=self.app_name(p.get('app') or p.get('package')); return {'ok':True,**self.state['phone']}
        if op in ('location.get','get_location'): return {'ok':True,**self.state['phone']['location'],'formattedAddress':self.state['phone']['location']['label']}
        if op=='sensors.summary': return {'ok':True,'battery':self.state['phone']['battery']}
        if op in ('calendar.list','notifications.list','contacts.search','sms.unread','sms.list','calls.recent'): return {'ok':True,'items':[]}
        if op in ('calls.place','sms.send','calendar.create','calendar.update','calendar.delete','camera.photo','camera.video','notifications.show','wifi.connect','wifi.panel','files.move','files.delete','media.delete'):
            return {'ok':False,'error':'requires_user_action: operation intentionally disabled in this fixture'}
        raise ValueError('Unsupported phone fixture')

    @staticmethod
    def app_name(value):
        value=str(value or '').lower()
        if 'amazon' in value and 'alexa' not in value:return 'amazon'
        if 'chrome' in value:return 'chrome'
        if 'calendar' in value or 'calendario' in value:return 'calendar'
        return value

    def android(self,args):
        self.fault('phone')
        if not self.state['phone']['connected']: return {'ok':False,'error':'Error: Android device not connected'}
        op=str(args.get('operation','')).removeprefix('androiduse.'); p=args.get('params') or {}
        state=self.state['android']
        if op=='start': state['active']=True
        elif op=='stop': state['active']=False
        elif op=='text': state['text']=str(p.get('text',''))
        elif op=='launch': self.state['phone']['app']=self.app_name(p.get('app') or p.get('package'))
        elif op=='batch':
            actions=p.get('actions',[])
            if not isinstance(actions,list) or not 1<=len(actions)<=16: raise ValueError('Bounded Android batch required')
            was_active=state['active']; state['active']=True
            results=[]
            for action in actions:
                if action.get('action')=='batch': raise ValueError('Nested batch disabled')
                result=self.android({'operation':action.get('action'),'params':action.get('params') or {}})
                results.append(result)
                if not result.get('ok'): break
            if not was_active and p.get('autoStop',True): state['active']=False
            return {'ok':all(r['ok'] for r in results),'results':results,'ui':copy.deepcopy(state),'no_real_screenshot':True}
        elif op in ('click','tap','long_press','swipe','key','back','home','recents','wait','wait_for'):
            state['last_action']={'action':op,'params':p}
            if op=='home':self.state['phone']['app']='home'
        elif op not in ('status','tree','screenshot'): raise ValueError('Unsupported Android operation')
        return {'ok':True,**state,'ui':{'search_field':'Buscar','typed_text':state['text']},'no_real_screenshot':True}

    def routine(self,args):
        op=args.get('action'); name=args.get('name'); state=self.state['routines']
        if op=='list': return {'ok':True,'routines':list(state.values())}
        if op=='upsert':
            routine=args.get('routine') or {}; key=routine.get('id') or routine.get('name')
            if not isinstance(key,str) or len(json.dumps(routine))>8192: raise ValueError('Invalid virtual routine')
            if key in state and not args.get('replace'): raise ValueError('Routine exists; replace required')
            state[key]=copy.deepcopy(routine); return {'ok':True,'routine':state[key]}
        if name not in state:
            names=[key for key,value in state.items() if value.get('name')==name]
            if len(names)==1:name=names[0]
            else:raise ValueError('Virtual routine not found')
        if op=='show': return {'ok':True,'routine':state[name]}
        if op=='delete': del state[name]; return {'ok':True}
        if op in ('enable','disable'): state[name]['enabled']=op=='enable'; return {'ok':True,'routine':state[name]}
        if op=='run':
            results=[]
            for step in state[name].get('steps',[])[:16]:
                result=self.call('atlas_shell',{'command':step.get('command')}) if step.get('type')=='shell' else {'ok':True,'text':step.get('text','')}
                results.append(result)
                if not result.get('ok'): break
            return {'ok':all(r['ok'] for r in results),'results':results}
        raise ValueError('Unsupported routine operation')
