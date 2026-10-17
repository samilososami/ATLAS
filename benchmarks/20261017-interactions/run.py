#!/usr/bin/env python3
"""Isolated, silent ATLAS Realtime benchmark. Only tools in VirtualWorld exist.

No imports of atlas_chat and no WebScreen request endpoints. NativeBroker is used
only for subscription-backed ephemeral credentials; model tool data never reaches
it. Every scenario gets a fresh socket and Python state, without persistent memory.
"""
import argparse
import concurrent.futures
import copy
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import threading
import time
from uuid import uuid4
from virtual_world import VirtualWorld

HERE = Path(__file__).resolve().parent
ISOLATION = '''ENTORNO DE PRUEBA AISLADO: Esta sesión usa las capacidades normales de ATLAS,
pero todas sus herramientas son dobles virtuales. Ninguna acción afecta a dispositivos,
cuentas, archivos o personas reales. No uses datos privados del contexto para inferir el
estado de estos dispositivos ficticios. Consulta las herramientas y conserva referencias
entre mensajes. Las rutas virtuales de archivos están bajo /sandbox/atlas-bench/.
Responde con normalidad y concisión, sin repetir que es una simulación en cada turno.
No inventes éxito ante un error o una función no soportada. Los mensajes se devuelven
solo como texto: no hay reproducción de audio ni ventana de micrófono en esta batería.'''

def partial_equal(actual, expected):
    if isinstance(expected, dict):
        return isinstance(actual, dict) and all(k in actual and partial_equal(actual[k], v) for k,v in expected.items())
    return actual == expected

def at_path(state, key):
    if not isinstance(state,dict):return None
    if key in state:return state[key]
    head,separator,tail=key.partition('.')
    if not separator or head not in state:return None
    return at_path(state[head],tail)

def grade(question, before, after, trace, answer, error=None):
    expected=question.get('expect',{}); checks=[]
    checks.append({'criterion':'completed_with_response','passed': bool(answer.strip()) and not error})
    for path, value in expected.get('state',{}).items():
        checks.append({'criterion':'state:'+path,'passed':partial_equal(at_path(after,path),value)})
    for path in expected.get('state_absent',[]):
        checks.append({'criterion':'state_absent:'+path,'passed':at_path(after,path) is None})
    names=[x['name'] for x in trace]
    if expected.get('tools_any'):
        checks.append({'criterion':'required_tool','passed':any(x in names for x in expected['tools_any'])})
    if expected.get('answer_any'):
        checks.append({'criterion':'answer_contains_any','passed':any(str(x).casefold() in answer.casefold() for x in expected['answer_any'])})
    for index,alternatives in enumerate(expected.get('answer_groups',[])):
        checks.append({'criterion':'answer_group:'+str(index+1),'passed':any(str(x).casefold() in answer.casefold() for x in alternatives)})
    for word in expected.get('answer_none',[]):
        checks.append({'criterion':'answer_excludes:'+str(word),'passed':str(word).casefold() not in answer.casefold()})
    if expected.get('no_mutations'):
        b=copy.deepcopy(before); a=copy.deepcopy(after)
        b.pop('face',None); a.pop('face',None)
        checks.append({'criterion':'no_noncosmetic_mutation','passed':a==b})
    unsupported=[x for x in trace if x.get('result',{}).get('unsupported_in_fixture')]
    return {'score':round(10*sum(x['passed'] for x in checks)/len(checks),2), 'checks':checks,
            'scoring':'Objective fixture checks only, not a human quality verdict.',
            'semantic_quality_score':None,
            'scoring_coverage':'functional_assertions' if any(expected.get(k) for k in ('state','state_absent','answer_any','answer_groups','tools_any')) else 'response_and_safety_only',
            'fixture_unsupported_count':len(unsupported), 'human_review_required':bool(question.get('rubric')) or bool(unsupported)}

class TextSession:
    def __init__(self, broker, contract, instructions, world, timeout=60):
        self.broker=broker; self.contract=contract; self.instructions=instructions; self.world=world; self.timeout=timeout; self.ws=None

    def send(self, value):
        self.ws.send(json.dumps(value,ensure_ascii=False,separators=(',',':')))

    def connect(self):
        from websockets.sync.client import connect
        start=time.perf_counter()
        reservation=self.broker.create_talk_session({'provider':'openai','transport':'webrtc','model':self.contract['model'],'voice':'marin','sessionKey':'bench-20261017-'+uuid4().hex})
        self.ws=connect('wss://api.openai.com/v1/realtime?model='+self.contract['model'],additional_headers={'Authorization':'Bearer '+reservation['clientSecret']},open_timeout=20,close_timeout=2,max_size=8*1024*1024)
        reservation.clear()
        self.send({'type':'session.update','session':{'type':'realtime','output_modalities':['text'],'instructions':self.instructions,'tools':self.contract['tools'],'tool_choice':'auto','truncation':{'type':'retention_ratio','retention_ratio':0.8}}})
        deadline=time.monotonic()+15
        while time.monotonic()<deadline:
            event=json.loads(self.ws.recv(timeout=max(.1,deadline-time.monotonic())))
            if event.get('type')=='session.updated': return round((time.perf_counter()-start)*1000,1)
            if event.get('type')=='error': raise RuntimeError('Provider rejected session update')
        raise TimeoutError('Session setup timeout')

    def ask(self,prompt):
        started=time.perf_counter(); first=None; parts=[]; final=[]; calls=0; rounds=0; pending=False; usage=[]; trace_start=len(self.world.trace)
        self.send({'type':'conversation.item.create','item':{'type':'message','role':'user','content':[{'type':'input_text','text':prompt}]}})
        self.send({'type':'response.create','response':{'output_modalities':['text']}})
        deadline=time.monotonic()+self.timeout
        try:
            while time.monotonic()<deadline:
                event=json.loads(self.ws.recv(timeout=max(.1,deadline-time.monotonic())))
                kind=event.get('type','')
                if kind in ('response.output_audio.delta','response.audio.delta'):
                    raise RuntimeError('Audio event forbidden in silent benchmark')
                if kind=='response.output_text.delta':
                    delta=str(event.get('delta',''))
                    if delta and first is None:first=round((time.perf_counter()-started)*1000,1)
                    parts.append(delta);final.append(delta)
                elif kind=='response.function_call_arguments.done':
                    calls+=1
                    if calls>16: raise RuntimeError('Bounded tool-call limit exceeded')
                    try: args=json.loads(event.get('arguments') or '{}')
                    except (ValueError,TypeError):args=None
                    result=self.world.call(str(event.get('name','')),args)
                    self.send({'type':'conversation.item.create','item':{'type':'function_call_output','call_id':event.get('call_id'),'output':json.dumps(result,ensure_ascii=False)}})
                    pending=True
                elif kind=='response.done':
                    response=event.get('response',{});usage.append(response.get('usage',{}))
                    if response.get('status')!='completed': raise RuntimeError('Provider response not completed')
                    if pending:
                        rounds+=1
                        if rounds>8:raise RuntimeError('Continuation limit exceeded')
                        pending=False;final=[]
                        self.send({'type':'response.create','response':{'output_modalities':['text']}})
                    else:
                        return {'answer':''.join(final).strip(),'all_text':''.join(parts).strip(),'first_text_ms':first,'total_ms':round((time.perf_counter()-started)*1000,1),'tools':copy.deepcopy(self.world.trace[trace_start:]),'usage':usage,'error':None}
                elif kind=='error':
                    raise RuntimeError('Provider error: '+str(event.get('error',{}).get('code','unknown')))
            raise TimeoutError('Turn deadline exceeded')
        except Exception as error:
            # No automatic retry: an action can have already changed virtual state.
            return {'answer':''.join(final).strip(),'all_text':''.join(parts).strip(),'first_text_ms':first,'total_ms':round((time.perf_counter()-started)*1000,1),'tools':copy.deepcopy(self.world.trace[trace_start:]),'usage':usage,'error':type(error).__name__+': '+str(error)[:200]}

    def close(self):
        if self.ws:
            try:self.ws.close()
            except Exception:pass
            self.ws=None

def group_questions(questions):
    groups={}
    for q in questions:
        key=q.get('group') or q['id']
        groups.setdefault(key,[]).append(q)
    return [sorted(items,key=lambda q:q.get('turn',1)) for items in groups.values()]

def main():
    os.umask(0o077)
    parser=argparse.ArgumentParser()
    parser.add_argument('--runtime',default='/home/atlas');parser.add_argument('--questions',type=Path,default=HERE/'questions.json')
    parser.add_argument('--contract',type=Path,default=HERE/'contract.json');parser.add_argument('--output',type=Path,required=True)
    parser.add_argument('--workers',type=int,default=2);parser.add_argument('--limit',type=int,default=0)
    parser.add_argument('--authorize-model-run',action='store_true');parser.add_argument('--timeout',type=int,default=60)
    args=parser.parse_args()
    if not args.authorize_model_run:parser.error('Explicit --authorize-model-run required; offline tests do not consume quota')
    if not 1<=args.workers<=3:parser.error('workers must be 1..3')
    if args.output.exists():parser.error('Output already exists; choose a fresh result file')
    root=Path(args.runtime).resolve();os.environ['ATLAS_HOME']=str(root)
    contract=json.loads(args.contract.read_text());bank=json.loads(args.questions.read_text());questions=bank['questions']
    if args.limit:questions=questions[:args.limit]
    if len({q['id'] for q in questions})!=len(questions):raise ValueError('Duplicate question IDs')
    # Fixed trusted helper, constant executable, no model data.
    context=json.loads(subprocess.check_output([sys.executable,str(HERE/'read_context.py'),str(root)],text=True,timeout=20))
    instructions='\n\n'.join([context['instructions'],context['context'],contract['instructions'],ISOLATION])
    sys.path.insert(0,str(root/'.atlas/broker'))
    from native_broker import NativeBroker
    manuals={}
    knowledge=root/'.atlas/context/knowledge'
    for path in [knowledge/'CAPABILITIES.md',*sorted((knowledge/'atlas-commands').glob('ATLAS-*.md'))]:
        if path.is_file() and not path.is_symlink() and path.stat().st_size<512000:
            manuals[path.relative_to(knowledge).as_posix()]=path.read_text()[:128000]
    face=next(t for t in contract['tools'] if t['name']=='atlas_face')['parameters']['properties']['expression']['enum']
    args.output.parent.mkdir(parents=True,exist_ok=True)
    lock=threading.Lock();done=0
    metadata={'model':contract['model'],'count':len(questions),'workers':args.workers,'text_only':True,'real_device_actions':False,'persistent_memory':False,
              'instructions_sha256':hashlib.sha256(instructions.encode()).hexdigest(),'contract_sha256':hashlib.sha256(args.contract.read_bytes()).hexdigest(),
              'questions_sha256':hashlib.sha256(args.questions.read_bytes()).hexdigest(),'metric':'first streamed text, NOT first audible word',
              'context_estimated_tokens':context['stats'].get('estimatedTokens'),
              'harness_sha256':{name:hashlib.sha256((HERE/name).read_bytes()).hexdigest() for name in ('run.py','virtual_world.py','read_context.py')},
              'face_expression_count':len(face)}
    args.output.with_suffix('.metadata.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    def run_group(items):
        nonlocal done
        world=VirtualWorld(items[0].get('initial_state'),manuals,face,items[0].get('web_results'))
        broker=NativeBroker(); session=TextSession(broker,contract,instructions,world,args.timeout)
        setup=None;failure=None
        try:
            try:setup=session.connect()
            except Exception as error:failure='session_setup_failed:'+type(error).__name__
            for question in items:
                before=world.snapshot()
                result=session.ask(question['prompt']) if failure is None else {'answer':'','all_text':'','first_text_ms':None,'total_ms':0,'tools':[],'usage':[],'error':failure,'skipped':True}
                after=world.snapshot()
                row={'id':question['id'],'group':question.get('group'),'turn':question.get('turn',1),'difficulty':question.get('difficulty'),'category':question.get('category'),'prompt':question['prompt'],'setup_ms':setup,**result,'before':before,'after':after}
                row['validation']=grade(question,before,after,result['tools'],result['answer'],result['error'])
                with lock:
                    with args.output.open('a') as out:out.write(json.dumps(row,ensure_ascii=False)+'\n')
                    done+=1;print(json.dumps({'completed':done,'id':question['id'],'score':row['validation']['score'],'error':bool(result['error'])}),flush=True)
                if result['error']:failure='group_aborted_after_failed_turn'
        finally:
            session.close();broker.close()
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.workers) as pool:
        futures=[pool.submit(run_group,items) for items in group_questions(questions)]
        for future in concurrent.futures.as_completed(futures):future.result()
    return 0

if __name__=='__main__':raise SystemExit(main())
