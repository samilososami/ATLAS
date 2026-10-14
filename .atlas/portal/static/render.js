import {marked, DOMPurify} from './vendor.js';
export const icons = {
 plus:'M12 5v14M5 12h14', search:'M21 21l-5-5M19 10a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
 panel:'M9 3v18M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1',
 attach:'m8 13 6-6a3 3 0 0 1 4 4l-8 8a5 5 0 0 1-7-7L13 2', up:'m6 10 6-6 6 6M12 4v16', down:'m6 14 6 6 6-6M12 20V4',
 chat:'M21 11a9 9 0 0 1-9 9H3l2-5a9 9 0 1 1 16-4', copy:'M9 8h11v13H9zM15 8V3H3v13h6',
 external:'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7', logout:'M9 4H3v16h6m6-13 5 5-5 5M8 12h12',
 more:'M5 12h.01M12 12h.01M19 12h.01', edit:'m4 16-1 5 5-1L21 7l-4-4ZM14 6l4 4',
 trash:'M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7', close:'m6 6 12 12M6 18 18 6', stop:'M6 6h12v12H6z', check:'m5 12 4 4L19 6',
 spark:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z',
 terminal:'m4 6 5 6-5 6M12 18h8', phone:'M8 2h8a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2ZM11 18h2',
 compass:'m16 8-3 5-5 3 3-5ZM22 12a10 10 0 1 1-20 0 10 10 0 0 1 20 0',
};
export function icon(name) {return `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${icons[name] || icons.chat}"/></svg>`;}
export function mountIcons(root=document) {root.querySelectorAll('[data-icon]').forEach(el => el.innerHTML = icon(el.dataset.icon));}
export function markdown(target, text) {
  target.innerHTML = DOMPurify.sanitize(marked.parse(text || '', {gfm:true, breaks:true}), {FORBID_TAGS:['img','video','audio','iframe','form','input','style','svg','math'], FORBID_ATTR:['style','id','name'], ALLOW_DATA_ATTR:false});
  target.querySelectorAll('a').forEach(a => { a.target='_blank'; a.rel='noopener noreferrer'; });
  target.querySelectorAll('pre').forEach(pre => {
    const button=document.createElement('button'); button.className='code-copy'; button.type='button';button.textContent='Copiar código';
    button.addEventListener('click', async()=>{await navigator.clipboard.writeText(pre.querySelector('code')?.textContent || ''); button.textContent='Copiado';});
    pre.append(button);
  });
}
const activeStates = new Set(['connecting','thinking','tool','writing','stopping']);
export function setMessageActivity(article, activity={state:'complete'}) {
  const state=activity.state || 'complete', previous=article.dataset.state;
  if(previous!==state) article.dataset.state=state;
  article.querySelector('.message-body')?.setAttribute('aria-busy',String(activeStates.has(state)));
  const status=article.querySelector('.message-activity');
  if(!status)return;
  const label=activity.label || '';
  const visible=activeStates.has(state) && state!=='writing' && !!label;
  if(status.hidden===visible)status.hidden=!visible;
  const text=status.querySelector('.activity-label');
  if(text.textContent!==label)text.textContent=label;
  const symbol=status.querySelector('.activity-icon'), name=activity.icon || 'spark';
  if(symbol.dataset.icon!==name){symbol.dataset.icon=name;symbol.innerHTML=icon(name);}
  if(previous && activeStates.has(previous) && state==='complete')article.classList.add('just-completed');
}
function messageFooter(footer, message) {
  footer.replaceChildren();
  if(message.role==='assistant' && message.text) {const button=document.createElement('button');button.className='icon-button';button.title='Copiar respuesta';button.setAttribute('aria-label','Copiar respuesta');button.innerHTML=icon('copy');button.onclick=async()=>{await navigator.clipboard.writeText(message.text);button.innerHTML=icon('check');setTimeout(()=>button.innerHTML=icon('copy'),1500);};footer.append(button);}
  if(message.error){const e=document.createElement('span');e.className='message-error';e.textContent=message.error;footer.append(e);}
}
function settledActivity(message) {
  return {state:message.error?(message.cancelled || message.error==='Respuesta detenida.'?'cancelled':'error'):'complete'};
}
export function finishMessageView(article, message) {
  markdown(article.querySelector('.message-body'),message.text);
  messageFooter(article.querySelector('.message-footer'),message);
  setMessageActivity(article,settledActivity(message));
}
export function messageView(message, activity=null) {
  const article=document.createElement('article'); article.className=`message message-${message.role}`; article.dataset.id=message.id;
  if(message.role==='assistant') {
    const avatar=document.createElement('div');avatar.className='assistant-avatar';avatar.setAttribute('role','img');avatar.setAttribute('aria-label','ATLAS');
    const image=document.createElement('img');image.src='/portal/assets/logo.png';image.alt='';image.className='avatar-mark';image.width=24;image.height=28;avatar.append(image);
    const dots=document.createElement('span');dots.className='avatar-dots';dots.setAttribute('aria-hidden','true');
    for(let i=0;i<3;i++)dots.append(document.createElement('i'));
    avatar.append(dots);article.append(avatar);
  }
  const content=document.createElement('div');content.className='message-content';article.append(content);
  if(message.role==='assistant') {
    const status=document.createElement('div');status.className='message-activity';status.hidden=true;status.setAttribute('role','status');status.setAttribute('aria-live','polite');status.setAttribute('aria-atomic','true');
    const symbol=document.createElement('span');symbol.className='activity-icon';symbol.setAttribute('aria-hidden','true');
    const label=document.createElement('span');label.className='activity-label';status.append(symbol,label);content.append(status);
  }
  if(message.images?.length) {const images=document.createElement('div');images.className='message-images';message.images.forEach(src=>{const img=document.createElement('img');img.src=src;img.alt='Imagen adjunta';img.loading='lazy';images.append(img);});content.append(images);}
  const body=document.createElement('div');body.className='message-body';content.append(body);
  if(message.role==='assistant') markdown(body,message.text);else body.textContent=message.text;
  const footer=document.createElement('div');footer.className='message-footer';content.append(footer);
  messageFooter(footer,message);
  if(message.role==='assistant')setMessageActivity(article,activity || settledActivity(message));
  return {article,body,footer};
}
