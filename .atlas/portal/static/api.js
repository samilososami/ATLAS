let csrf = null;
export async function session() {
  const response = await fetch('/portal/api/session', {cache:'no-store'});
  const data = await response.json();
  if (!data.authenticated) { location.reload(); throw new Error('La sesión ha caducado'); }
  csrf = data.csrf; return data;
}
export async function post(path, data, signal) {
  if (!csrf) await session();
  const response = await fetch('/portal/api/' + path, {method:'POST', headers:{'Content-Type':'application/json','X-Atlas-CSRF':csrf}, body:JSON.stringify(data), signal});
  if (response.status === 401) { location.reload(); throw new Error('La sesión ha caducado'); }
  if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.error || `No se pudo completar la petición (${response.status})`); }
  return response;
}
export async function logout() { await post('logout', {}); location.reload(); }
export async function stream(data, onEvent, signal) {
  const response = await post('chat', data, signal);
  const reader = response.body.getReader();
  const decoder = new TextDecoder(); let buffer = '', complete = false;
  try {
    while (true) {
      const {done, value} = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, {stream:true});
      let boundary;
      while ((boundary = buffer.indexOf('\n\n')) !== -1) {
        const block = buffer.slice(0, boundary); buffer = buffer.slice(boundary + 2);
        if (block.startsWith(':')) continue;
        const event = block.match(/^event: (.+)$/m)?.[1];
        const payload = block.match(/^data: (.+)$/m)?.[1];
        if (event && payload) { onEvent(event, JSON.parse(payload)); if (['done','error','cancelled'].includes(event)) complete = true; }
      }
    }
    if (!complete) throw new Error('La conexión se interrumpió. No se ha reenviado tu mensaje.');
  } finally { reader.releaseLock(); }
}
