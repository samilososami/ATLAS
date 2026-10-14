import {session, post, stream, logout} from './api.js';
import * as store from './store.js';
import {icon, mountIcons, markdown, messageView, setMessageActivity, finishMessageView} from './render.js';
const $=selector=>document.querySelector(selector);
mountIcons();
let chats=[], active=null, images=[], running=null, quota=null, renderTimer;
const list=$('#chat-list'), messages=$('#messages'), scroll=$('#message-scroll'), prompt=$('#prompt');
function toast(text) {$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toast.timer);toast.timer=setTimeout(()=>$('#toast').hidden=true,6000);}
function current() {return chats.find(chat=>chat.id===active);}
function persist(chat) {return store.save(chat).catch(e=>toast(e.message));}
function newChat() {
  const existing=chats.find(chat=>!chat.messages.length);
  if(existing){select(existing.id);return;}
  const chat={id:crypto.randomUUID(),title:'Nuevo chat',messages:[],updated:Date.now()};chats.unshift(chat);void persist(chat);select(chat.id);prompt.focus();
}
function select(id) {active=id;localStorage.setItem('atlas-active-chat',id);images=[];renderAttachments();renderList();renderMessages();closeSidebar();updateSend();}
function renderList() {
  const query=$('#search').value.toLocaleLowerCase();list.replaceChildren();
  chats.slice().sort((a,b)=>b.updated-a.updated).filter(c=>c.title.toLocaleLowerCase().includes(query)||c.messages.some(m=>m.text.toLocaleLowerCase().includes(query))).forEach(chat=>{
    const row=document.createElement('div');row.className='chat-row'+(chat.id===active?' selected':'');
    const button=document.createElement('button');button.className='chat-select';button.setAttribute('aria-current',chat.id===active?'page':'false');button.innerHTML=icon('chat');
    const title=document.createElement('span');title.textContent=chat.title;button.append(title);button.title=chat.title;button.onclick=()=>select(chat.id);row.append(button);
    const actions=document.createElement('div');actions.className='row-actions';
    for(const [name,label,callback] of [['edit','Renombrar',()=>rename(chat)],['trash','Eliminar',()=>deleteChat(chat)]]) {const b=document.createElement('button');b.className='icon-button';b.innerHTML=icon(name);b.setAttribute('aria-label',`${label} ${chat.title}`);b.onclick=callback;actions.append(b);}
    row.append(actions);list.append(row);
  });
  if(!list.children.length){const hint=document.createElement('p');hint.className='history-empty';hint.textContent='No hay conversaciones que coincidan.';list.append(hint);}
}
function renderMessages() {
  messages.replaceChildren();const chat=current();$('#empty-state').hidden=!!chat?.messages.length;
  for(const message of chat?.messages||[]) messages.append(messageView(message,running?.answer.id===message.id?running.activity:null).article);
  document.title=chat?.title && chat.title!=='Nuevo chat'?`${chat.title} · ATLAS`:'Chat · ATLAS';
  updateMetrics(chat?.usage);requestAnimationFrame(()=>{scroll.scrollTop=scroll.scrollHeight;});
}
function closeSidebar(){if(innerWidth<=760){document.body.classList.remove('mobile-sidebar');$('#sidebar-backdrop').hidden=true;$('#sidebar-toggle').setAttribute('aria-expanded','false');}}
$('#sidebar-toggle').onclick=()=>{if(innerWidth<=760){const open=document.body.classList.toggle('mobile-sidebar');$('#sidebar-backdrop').hidden=!open;$('#sidebar-toggle').setAttribute('aria-expanded',String(open));}else{const closed=document.body.classList.toggle('sidebar-collapsed');$('#sidebar-toggle').setAttribute('aria-expanded',String(!closed));}};
$('#sidebar-backdrop').onclick=closeSidebar;
$('#new-chat').onclick=newChat;$('#search').oninput=renderList;
$('#logout').onclick=async()=>{try{if(running)await stop();await logout();}catch(e){toast(e.message);}};
async function modal({title,message='',value='',danger=false}) {
  const dialog=$('#manage-dialog');$('#dialog-title').textContent=title;$('#dialog-message').textContent=message;
  const input=$('#dialog-input');input.hidden=danger;input.value=value;
  const button=$('#dialog-confirm');button.textContent=danger?'Eliminar':'Guardar';button.className=danger?'danger':'primary';
  dialog.returnValue='';dialog.showModal();if(!danger){input.focus();input.select();}
  return new Promise(resolve=>dialog.addEventListener('close',()=>resolve(dialog.returnValue==='confirm'?(danger?true:input.value.trim()):null),{once:true}));
}
async function rename(chat){const title=await modal({title:'Renombrar chat',value:chat.title});if(title){chat.title=title;await persist(chat);renderList();document.title=title+' · ATLAS';}}
async function deleteChat(chat){if(!await modal({title:'¿Eliminar este chat?',message:'Se borrará de este navegador. Esta acción no se puede deshacer.',danger:true}))return;if(running?.chat.id===chat.id)await stop();await post('cancel',{id:chat.id}).catch(()=>{});await store.remove(chat.id);chats=chats.filter(c=>c.id!==chat.id);if(active===chat.id){if(chats.length)select(chats[0].id);else newChat();}else renderList();}

function updateSend(){const busy=!!running;$('#send').disabled=!busy&&!prompt.value.trim()&&!images.length;$('#send').innerHTML=icon(busy?'stop':'up');$('#send').setAttribute('aria-label',busy?'Detener respuesta':'Enviar mensaje');$('#send').classList.toggle('is-stopping',busy);$('#attach').disabled=busy;}
prompt.addEventListener('input',()=>{prompt.style.height='auto';prompt.style.height=Math.min(prompt.scrollHeight,220)+'px';updateSend();});
prompt.addEventListener('keydown',e=>{if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&innerWidth>760){e.preventDefault();if(!running)$('#composer').requestSubmit();}});
$('#attach').onclick=()=>$('#image-input').click();
$('#image-input').onchange=e=>{void addImages([...e.target.files]);e.target.value='';};
document.addEventListener('paste',e=>{if(document.activeElement!==prompt)return;const files=[...e.clipboardData.items].filter(i=>i.kind==='file').map(i=>i.getAsFile());if(files.length){e.preventDefault();void addImages(files);}});
let dragDepth=0;
document.addEventListener('dragenter',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();dragDepth++;$('#composer').classList.add('dragging');}});
document.addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files'))e.preventDefault();});
document.addEventListener('dragleave',()=>{if(--dragDepth<=0)$('#composer').classList.remove('dragging');});
document.addEventListener('drop',e=>{if(e.dataTransfer.files.length){e.preventDefault();dragDepth=0;$('#composer').classList.remove('dragging');void addImages([...e.dataTransfer.files]);}});
async function resizeImage(file) {
  if(!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>15*1024*1024)throw new Error('Usa imágenes JPG, PNG o WebP de hasta 15 MB.');
  const image=await createImageBitmap(file);const scale=Math.min(1,1536/Math.max(image.width,image.height));
  const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
  const ctx=canvas.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,canvas.width,canvas.height);ctx.drawImage(image,0,0,canvas.width,canvas.height);image.close();
  let quality=.86,data=canvas.toDataURL('image/jpeg',quality);while(data.length>650000&&quality>.3){quality-=.12;data=canvas.toDataURL('image/jpeg',quality);}
  if(data.length>1000000)throw new Error('La imagen es demasiado compleja. Prueba con una más pequeña.');
  return data;
}
async function addImages(files){if(running)return;for(const file of files){if(images.length>=4){toast('Puedes adjuntar hasta 4 imágenes por mensaje.');break;}try{images.push(await resizeImage(file));}catch(e){toast(e.message);}}renderAttachments();updateSend();prompt.focus();}
function renderAttachments() {const box=$('#attachments');box.replaceChildren();images.forEach((src,index)=>{const item=document.createElement('div');item.className='attachment';const img=document.createElement('img');img.src=src;img.alt=`Imagen adjunta ${index+1}`;const button=document.createElement('button');button.type='button';button.innerHTML=icon('close');button.setAttribute('aria-label',`Quitar imagen ${index+1}`);button.onclick=()=>{images.splice(index,1);renderAttachments();updateSend();};item.append(img,button);box.append(item);});}
function historyPayload(chat){
  let chars=0,remainingImages=8,bytes=0;const selected=[];
  for(const item of [...chat.messages].reverse()){
    if(item.role==='assistant'&&(!item.text||item.error))continue;
    if(selected.length>=59||chars+item.text.length>110000)break;
    chars+=item.text.length;
    const attached=(item.images||[]).filter(img=>{if(!remainingImages||bytes+img.length>3000000)return false;remainingImages--;bytes+=img.length;return true;});
    if(!item.text&&!attached.length)continue;
    selected.unshift({role:item.role,text:item.text,images:attached});
  }
  return selected;
}
function showActivity(run, state, label='', symbol='spark') {
  if(run.activity?.state==='stopping' && ['connecting','thinking','tool','writing'].includes(state))return;
  if(run.activity?.state===state && run.activity.label===label && run.activity.icon===symbol)return;
  run.activity={state,label,icon:symbol};
  const article=messages.querySelector(`[data-id="${run.answer.id}"]`);
  if(article)setMessageActivity(article,run.activity);
}
const toolActivity={
  atlas_shell:['Usando herramientas…','terminal'], atlas_actions:['Realizando acciones…','terminal'],
  atlas_web_search:['Buscando en la web…','search'], atlas_phone:['Consultando el teléfono…','phone'],
  atlas_capabilities:['Consultando capacidades…','compass'], atlas_routine:['Ejecutando la rutina…','spark'],
};
async function stop(){if(!running)return;const run=running;showActivity(run,'stopping','Deteniendo…','stop');await post('cancel',{id:run.chat.id}).catch(e=>toast(e.message));run.controller.abort();}
$('#composer').addEventListener('submit',async e=>{
  e.preventDefault();if(running){await stop();return;}
  const text=prompt.value.trim();if(!text&&!images.length)return;
  const chat=current();const user={id:crypto.randomUUID(),role:'user',text,images:[...images],at:Date.now()};chat.messages.push(user);
  if(chat.title==='Nuevo chat')chat.title=(text||'Conversación con imágenes').slice(0,50);
  chat.updated=Date.now();const payload=historyPayload(chat);prompt.value='';prompt.style.height='auto';images=[];renderAttachments();
  const answer={id:crypto.randomUUID(),role:'assistant',text:'',at:Date.now()};chat.messages.push(answer);
  running={chat,answer,controller:new AbortController(),activity:{state:'thinking',label:'Pensando…',icon:'spark'}};const run=running;
  renderList();renderMessages();updateSend();
  function draw(){if(active!==chat.id)return;const article=messages.querySelector(`[data-id="${answer.id}"]`);if(!article)return;
    const follow=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<150;
    markdown(article.querySelector('.message-body'),answer.text);
    if(follow)scroll.scrollTop=scroll.scrollHeight;
  }
  try {
    await persist(chat);
    if(run.controller.signal.aborted)throw new DOMException('Respuesta detenida.','AbortError');
    await stream({id:chat.id,messages:payload},(event,data)=>{
      if(event==='delta'){answer.text+=data.text;if(data.text)showActivity(run,'writing');if(!renderTimer)renderTimer=setTimeout(()=>{renderTimer=null;draw();},35);}
      if(event==='replace'){answer.text=data.text;showActivity(run,data.text?'writing':'thinking',data.text?'':'Pensando…');draw();}
      if(event==='status')showActivity(run,'connecting',String(data.message||'Conectando…').slice(0,160));
      if(event==='tool'){const [label,symbol]=toolActivity[data.name]||['Trabajando…','spark'];showActivity(run,'tool',label,symbol);}
      if(event==='meta'){chat.model=data.model;chat.usage={estimated:true,input_tokens:data.context?.combinedInstructionEstimatedTokens||data.context?.offerEstimatedTokens||data.context?.estimatedTokens,contextLimit:data.context?.limitTokens||128000};if(active===chat.id)updateMetrics(chat.usage);showActivity(run,'thinking','Pensando…');}
      if(event==='done'){answer.text=data.text;chat.usage={...data.usage,contextLimit:data.contextLimit,estimated:false};if(active===chat.id)updateMetrics(chat.usage);showActivity(run,'complete');}
      if(event==='error'){answer.error=data.message;showActivity(run,'error');toast(data.message);}
      if(event==='cancelled'){answer.error='Respuesta detenida.';answer.cancelled=true;showActivity(run,'cancelled');}
    },run.controller.signal);
  } catch(error){answer.cancelled=error.name==='AbortError';answer.error=answer.cancelled?'Respuesta detenida.':error.message;showActivity(run,answer.cancelled?'cancelled':'error');if(!answer.cancelled)toast(error.message);}
  finally {
    clearTimeout(renderTimer);renderTimer=null;await persist(chat);if(running===run)running=null;
    // Keep the avatar and message node mounted so finishing does not replay
    // every message's entrance animation or reset the avatar transition.
    const article=messages.querySelector(`[data-id="${answer.id}"]`);
    const follow=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<150;
    if(article)finishMessageView(article,answer);
    if(article && follow)scroll.scrollTop=scroll.scrollHeight;
    renderList();updateSend();
  }
});
scroll.addEventListener('scroll',()=>$('#scroll-bottom').hidden=scroll.scrollHeight-scroll.scrollTop-scroll.clientHeight<250);
$('#scroll-bottom').onclick=()=>scroll.scrollTo({top:scroll.scrollHeight,behavior:'smooth'});
$('#metrics').onclick=()=>$('#metrics-panel').hidden=!$('#metrics-panel').hidden;
document.addEventListener('keydown',e=>{if(e.key==='Escape'){closeSidebar();$('#metrics-panel').hidden=true;}});
function updateMetrics(usage=current()?.usage){
  const window=quota?.weekly||quota?.fiveHour;
  const remaining=window?.remainingPercent;
  $('#quota-value').textContent=typeof remaining==='number'?`${Math.round(remaining)}%`:'—';
  $('#quota-ring').style.setProperty('--value',typeof remaining==='number'?`${remaining}%`:'0%');
  $('#quota-detail').textContent=window?`${quota.weekly?'Semanal':'5 horas'}: ${remaining}% libre.${quota.stale?' Última lectura, pendiente de actualizar.':''}${window.resetAt?' Se renueva '+new Date(window.resetAt<1e12?window.resetAt*1000:window.resetAt).toLocaleString('es-ES')+'.':''}`:'Cuota no disponible en este momento.';
  const used=(usage?.input_tokens||0)+(usage?.output_tokens||0),limit=usage?.contextLimit||128000;
  const free=usage?.input_tokens?Math.max(0,100-used/limit*100):null;
  $('#context-value').textContent=free!==null?`${Math.floor(free)}%`:'—';
  $('#context-ring').style.setProperty('--value',free!==null?`${free}%`:'0%');
  $('#context-detail').textContent=free!==null?`${Math.round(limit-used).toLocaleString('es-ES')} de ${limit.toLocaleString('es-ES')} tokens libres${usage.estimated?' (estimación inicial)':''}. Incluye instrucciones, herramientas y conversación.`:'El contexto se calcula al empezar la conversación.';
}
async function refreshUsage(){if(document.hidden)return;try{const response=await fetch('/portal/api/usage',{cache:'no-store'});if(response.ok){quota=await response.json();updateMetrics();}}catch{/* Keep the last reading without invented values. */}}
try {await session();chats=await store.list();active=localStorage.getItem('atlas-active-chat');if(!chats.length)newChat();else select(chats.some(c=>c.id===active)?active:chats.sort((a,b)=>b.updated-a.updated)[0].id);}
catch(e){toast(e.message);if(!chats.length)newChat();}
void refreshUsage();setInterval(refreshUsage,60000);document.addEventListener('visibilitychange',()=>{if(!document.hidden)void refreshUsage();});
window.addEventListener('pagehide',()=>{if(running)void post('cancel',{id:running.chat.id}).catch(()=>{});});
