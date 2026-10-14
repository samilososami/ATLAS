let database;
function db() {
  return database ||= new Promise((resolve,reject) => {
    const request = indexedDB.open('atlas-private-chats', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('chats', {keyPath:'id'});
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error('No se puede guardar el historial en este navegador.'));
  });
}
async function transaction(mode, action) {
  const database = await db();
  return new Promise((resolve,reject) => {
    const tx = database.transaction('chats', mode);
    const request = action(tx.objectStore('chats'));
    tx.oncomplete = () => resolve(request.result);
    tx.onerror = tx.onabort = () => reject(new Error('No se pudo guardar el chat. Revisa el espacio del navegador.'));
  });
}
export const list = () => transaction('readonly', s => s.getAll());
export const save = chat => transaction('readwrite', s => s.put(chat));
export const remove = id => transaction('readwrite', s => s.delete(id));
