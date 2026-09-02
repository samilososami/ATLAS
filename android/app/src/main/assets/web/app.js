'use strict';
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const calls=new Map();let config={},currentTab='atlas',toastTimer;
function native(method,params={}){return new Promise((resolve,reject)=>{
  if(!window.AtlasNative){reject(new Error('Abre ATLAS desde la app Android'));return;}
  const id=crypto.randomUUID();const timer=setTimeout(()=>{calls.delete(id);reject(new Error('La operación no respondió. No se repite automáticamente.'));},95000);
  calls.set(id,{resolve,reject,timer});AtlasNative.request(id,method,JSON.stringify(params));
});}
window.nativeReply=(id,result,error)=>{const p=calls.get(id);if(!p)return;clearTimeout(p.timer);calls.delete(id);error?p.reject(new Error(error)):p.resolve(result);};
function toast(text){$('#toast').textContent=text;$('#toast').classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('show'),5000);}
function safe(fn){return (...args)=>{try{return Promise.resolve(fn(...args)).catch(e=>toast(e.message));}catch(e){toast(e.message);}};}
const paths={
 spark:'m12 3 2.7 6.3L21 12l-6.3 2.7L12 21l-2.7-6.3L3 12l6.3-2.7Z',
 mic:'M8 6a4 4 0 0 1 8 0v6a4 4 0 0 1-8 0Zm-3 5v1a7 7 0 0 0 14 0v-1M12 19v3m-3 0h6',
 stop:'M7 6h10a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1Z',
 arrow:'M12 19V5m-6 6 6-6 6 6',
 grid:'M4 4h6v6H4Zm10 0h6v6h-6ZM4 14h6v6H4Zm10 0h6v6h-6Z',
 terminal:'m5 6 5 5-5 5m8 1h6',
 activity:'M2 12h4l3-8 6 16 3-8h4',
 settings:'M4 7h16M4 17h16M8 4v6m8 4v6',
 device:'M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Zm4 15h4',
 power:'M12 2v9M6 5a9 9 0 1 0 12 0',
 refresh:'M20 11a8 8 0 0 0-14-5L3 9m0-5v5h5m-4 4a8 8 0 0 0 14 5l3-3m0 5v-5h-5',
 plus:'M12 5v14M5 12h14',
 volume:'m3 9 5 0 5-4v14l-5-4H3Zm13-1a6 6 0 0 1 0 8m3-11a10 10 0 0 1 0 14',
 monitor:'M3 4h18v13H3Zm9 13v4m-4 0h8',
 moon:'M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z',
 music:'M9 17V5l11-2v12M9 17c0 4-6 4-6 0s6-4 6 0Zm11-2c0 4-6 4-6 0s6-4 6 0Z',
 wifi:'M3 8a15 15 0 0 1 18 0M6 12a10 10 0 0 1 12 0m-9 4a5 5 0 0 1 6 0m-3 4h0',
 folder:'M3 5h7l2 3h9v12H3Z',
 home:'m3 10 9-8 9 8v11h-6v-7H9v7H3Z',
 bolt:'m13 2-9 12h7l-1 8 10-13h-8Z',
 shield:'m12 2 8 3v7c0 5-8 10-8 10S4 17 4 12V5Zm-4 10 3 3 5-6',
 heart:'M12 20 3 11C-2 2 10 0 12 7c2-7 14-5 9 4Z',
 sun:'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M5 5l1 1m12 12 1 1M5 19l1-1M18 6l1-1',
 bluetooth:'M7 7l10 10-5 4V3l5 4L7 17',
 code:'m8 6-6 6 6 6m8-12 6 6-6 6m-3-14-2 16',
 clock:'M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0ZM12 7v5l3 2'
};
function icon(name){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 24 24');svg.setAttribute('aria-hidden','true');const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[name]||paths.bolt);svg.append(path);return svg;}
$$('[data-icon]').forEach(el=>el.append(icon(el.dataset.icon)));
function renderConfig(c){config=c;$('#device-name').textContent=c.name||'ATLAS A1';$('#pair-state').textContent=c.paired?'Emparejado · clave protegida por Android':'Sin emparejar';
for(const k of ['lock','danger','pairAuth'])$('#'+k).checked=Boolean(c[k]);$('#transport').value=c.transport||'auto';$('#connection-text').textContent=c.paired?'A1 emparejado':'Sin conectar';}
window.nativeEvent=(kind,data)=>{
 if(kind==='ready')renderConfig(data);
 if(kind==='speech')window.voice?.speech(data);
 if(kind==='speechError')window.voice?.speechError(data);
 if(kind==='suspend'){window.voice?.close();closeTerminal();}
};
function showTab(name){currentTab=name;$$('.page').forEach(p=>p.classList.toggle('active',p.id==='tab-'+name));$$('#tabs button').forEach(b=>b.classList.toggle('active',b.dataset.tab===name));
 if(name==='status')safe(refreshStatus)();if(name==='terminal')setTimeout(()=>fit?.fit(),50);window.scrollTo(0,0);}
$$('#tabs button').forEach(b=>b.onclick=()=>showTab(b.dataset.tab));$('#connection').onclick=()=>showTab('settings');
$('#pair').onclick=safe(async()=>{const b=$('#pair');b.disabled=true;try{renderConfig(await native('pair',{code:$('#pair-code').value}));$('#pair-code').value='';toast('A1 conectado. Bienvenido a ATLAS.');showTab('atlas');}finally{b.disabled=false;}});
$('#forget').onclick=safe(async()=>{if(!confirm('¿Olvidar este A1? Tendrás que volver a emparejarlo.'))return;await window.voice?.close();await closeTerminal();renderConfig(await native('forget'));});
for(const k of ['lock','danger','pairAuth','transport'])$('#'+k).onchange=safe(async()=>{try{renderConfig(await native('settings',{[k]:k==='transport'?$('#'+k).value:$('#'+k).checked}));}catch(e){renderConfig(config);throw e;}});
for(const k of ['voice','reasoning']){const v=localStorage.getItem(k);if(v&&[...$('#'+k).options].some(o=>o.value===v))$('#'+k).value=v;$('#'+k).onchange=()=>{localStorage.setItem(k,$('#'+k).value);toast('Se aplicará al preparar una nueva sesión.');};}

function bubble(text,role='assistant'){const area=$('#messages');$('.welcome')?.remove();const el=document.createElement('div');el.className='message '+role;el.textContent=text;area.append(el);area.scrollTop=area.scrollHeight;return el;}
function output(value){$('#command-output').textContent=(value.output||'Sin salida')+'\n\n'+(value.timedOut?'Tiempo máximo alcanzado':`Salida: ${value.exitCode}`)+(value.truncated?' · salida recortada':'');}
let actions;try{actions=JSON.parse(localStorage.getItem('actions'))}catch{}if(!Array.isArray(actions))actions=[
 {name:'Estado de A1',icon:'activity',color:'#53adff',command:'atlas-rafas'},
 {name:'Abrir Atlas',icon:'spark',color:'#6389ff',command:'atlas-screen --atlas'},
 {name:'Pantalla apagada',icon:'moon',color:'#b49cef',command:'atlas-screen off'},
 {name:'Audio al 50%',icon:'volume',color:'#64c7b0',command:'atlas-audio volume 50'}];
let editIndex=-1,editIcon='bolt',editColor='#53adff';
function renderActions(){const parent=$('#actions');parent.replaceChildren();actions.forEach((a,i)=>{
 const b=document.createElement('button');b.className='action-card';b.style.setProperty('--accent',/^#[0-9a-f]{6}$/i.test(a.color)?a.color:'#53adff');
 const glyph=document.createElement('span');glyph.className='tile-icon';glyph.append(icon(a.icon));const title=document.createElement('strong');title.textContent=a.name;b.append(glyph,title);
 let hold,long=false;b.onpointerdown=()=>{long=false;hold=setTimeout(()=>{long=true;editAction(i);},550);};b.onpointerup=b.onpointerleave=b.onpointercancel=()=>clearTimeout(hold);
 b.onclick=safe(async()=>{if(long)return;b.disabled=true;try{output(await native('execute',{command:a.command}));}finally{b.disabled=false;}});b.oncontextmenu=e=>{e.preventDefault();editAction(i)};parent.append(b);
});}
function persistActions(){localStorage.setItem('actions',JSON.stringify(actions));renderActions();}
function editAction(index){editIndex=index;const a=actions[index]||{};$('#action-name').value=a.name||'';$('#action-command').value=a.command||'';editIcon=a.icon||'bolt';editColor=a.color||'#53adff';$('#delete-action').hidden=index<0;renderPickers();$('#action-editor').showModal();}
function renderPickers(){const ip=$('#icon-picker');ip.replaceChildren();for(const k of Object.keys(paths).filter(k=>!['stop','arrow','plus'].includes(k))){const b=document.createElement('button');b.type='button';b.title=k;b.classList.toggle('chosen',k===editIcon);b.append(icon(k));b.onclick=()=>{editIcon=k;renderPickers()};ip.append(b);}
 const cp=$('#color-picker');cp.replaceChildren();for(const c of ['#53adff','#6389ff','#b49cef','#64c7b0','#ef7488','#e6b36b','#c2cad8']){const b=document.createElement('button');b.type='button';b.style.background=c;b.classList.toggle('chosen',c===editColor);b.title=c;b.onclick=()=>{editColor=c;renderPickers()};cp.append(b);}}
$('#add-action').onclick=()=>editAction(-1);$('#action-form').onsubmit=e=>{if(e.submitter?.value!=='save')return;if(!$('#action-name').value.trim()||!$('#action-command').value.trim()){e.preventDefault();toast('Añade un nombre y un comando');return;}const a={name:$('#action-name').value.trim(),command:$('#action-command').value.trim(),icon:editIcon,color:editColor};if(editIndex>=0)actions[editIndex]=a;else actions.push(a);persistActions();};
$('#delete-action').onclick=()=>{if(editIndex>=0){actions.splice(editIndex,1);persistActions();$('#action-editor').close();}};renderActions();
let terminal,fit,terminalId,terminalTimer,polling=false;
function initTerminal(){if(terminal)return;terminal=new Terminal({fontFamily:'monospace',fontSize:13,cursorBlink:true,scrollback:3000,theme:{background:'#050c19',foreground:'#cedcf2',cursor:'#53adff',selectionBackground:'#234776'}});fit=new FitAddon.FitAddon();terminal.loadAddon(fit);terminal.open($('#terminal'));fit.fit();terminal.onData(data=>{if(terminalId)native('terminal.write',{terminal:terminalId,data}).catch(e=>toast(e.message));});}
async function openTerminal(){initTerminal();if(terminalId)return;const t=await native('terminal.open',{cols:terminal.cols,rows:terminal.rows});terminalId=t.terminal;$('#terminal-status').textContent='Conectada';terminal.focus();pollTerminal();}
async function pollTerminal(){if(!terminalId||polling)return;polling=true;try{const data=await native('terminal.read',{terminal:terminalId});terminal.write(data.data||'');if(data.closed){terminalId=null;$('#terminal-status').textContent='Cerrada';}}catch(e){terminalId=null;$('#terminal-status').textContent='Sin conexión';toast(e.message);}finally{polling=false;if(terminalId)terminalTimer=setTimeout(pollTerminal,200);}}
async function closeTerminal(){clearTimeout(terminalTimer);const id=terminalId;terminalId=null;$('#terminal-status').textContent='Desconectada';if(id)try{await native('terminal.close',{terminal:id});}catch{}}
$('#terminal-open').onclick=safe(openTerminal);$('#terminal-close').onclick=safe(closeTerminal);
const keys={esc:'\x1b',tab:'\t',ctrlc:'\x03',up:'\x1b[A',down:'\x1b[B',left:'\x1b[D',right:'\x1b[C'};
$$('#terminal-keys button').forEach(b=>b.onclick=safe(async()=>{if(terminalId)await native('terminal.write',{terminal:terminalId,data:keys[b.dataset.key]});terminal?.focus();}));
window.addEventListener('resize',()=>{if(terminal){fit.fit();if(terminalId)native('terminal.resize',{terminal:terminalId,cols:terminal.cols,rows:terminal.rows}).catch(()=>{});}});
function row(parent,name,value,good=false){const r=document.createElement('div');r.className='status-row';const label=document.createElement('b');label.textContent=name;const v=document.createElement('span');v.textContent=value;v.className=good?'ok':'';r.append(label,v);parent.append(r);}
function metric(parent,name,value,detail,percent){const el=document.createElement('div');el.className='metric';const label=document.createElement('small');label.textContent=name;const val=document.createElement('b');val.textContent=value;el.append(label,val);if(percent!=null){const meter=document.createElement('div');meter.className='meter';const bar=document.createElement('i');bar.style.width=Math.min(100,Math.max(0,percent))+'%';meter.append(bar);el.append(meter);}const hint=document.createElement('em');hint.textContent=detail;el.append(hint);parent.append(el);}
async function refreshStatus(){const b=$('#refresh');b.disabled=true;try{const s=await native('status');$('#connection').classList.add('online');$('#connection-text').textContent='A1 conectado';const root=$('#status-content');root.replaceChildren();const metrics=document.createElement('div');metrics.className='metrics';root.append(metrics);
for(const [key,name] of [['fiveHour','Cuota · 5 horas'],['weekly','Cuota · semanal']]){const q=s.usage?.[key];metric(metrics,name,q?`${q.remainingPercent}%`:'—',q?.resetAt?'Renueva '+new Date(q.resetAt).toLocaleString('es-ES',{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'}):'Límites no disponibles',q?.remainingPercent);}
metric(metrics,'Temperatura',s.temperatureC==null?'—':`${s.temperatureC.toFixed(1)}°`,'Procesador');metric(metrics,'RAM libre',s.memory?.MemAvailable?`${(s.memory.MemAvailable/2**30).toFixed(1)} GB`:'—','Disponible');
const network=document.createElement('div');network.className='status-list';root.append(network);row(network,'Dispositivo',s.hostname||'A1');row(network,'Wi-Fi',s.network?.wifi?.ssid||'No conectado');row(network,'Internet',s.network?.https?'Disponible':'Sin confirmar',s.network?.https);row(network,'Relay propio',s.companion?.relay||'Sin configurar',s.companion?.relay==='online');for(const d of s.disks||[])if(d.path==='/')row(network,'Almacenamiento',`${(d.freeBytes/2**30).toFixed(1)} GB libres`);
const services=document.createElement('div');services.className='status-list';root.append(services);for(const v of s.services||[])row(services,v.name.replace(/\.service$/,'').replace(/^atlas-/,''),v.active,v.active==='active');for(const issue of s.issues||[]){const p=document.createElement('p');p.className='issue';p.textContent=issue;root.append(p);}const foot=document.createElement('p');foot.className='footnote';foot.textContent='Lectura real de A1 · '+new Date(s.timestamp*1000).toLocaleTimeString('es-ES');root.append(foot);
}catch(e){$('#connection').classList.remove('online');$('#connection-text').textContent='Sin conexión';throw e;}finally{b.disabled=false;}}
$('#refresh').onclick=safe(refreshStatus);
setInterval(()=>{if(config.paired&&!document.hidden)native('ping').then(()=>{$('#connection').classList.add('online');$('#connection-text').textContent='A1 conectado';}).catch(()=>{$('#connection').classList.remove('online');$('#connection-text').textContent='Sin conexión';});},10000);
if(window.AtlasNative)native('config').then(renderConfig).catch(()=>{});
