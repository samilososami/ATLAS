const form = document.querySelector('#login-form');
const input = document.querySelector('#password');
const error = document.querySelector('#login-error');
document.querySelector('#toggle-password').addEventListener('click', event => {
  input.type = input.type === 'password' ? 'text' : 'password';
  event.currentTarget.textContent = input.type === 'password' ? 'Mostrar' : 'Ocultar';
  event.currentTarget.setAttribute('aria-label', `${event.currentTarget.textContent} contraseña`);
});
form.addEventListener('submit', async event => {
  event.preventDefault();
  const button = form.querySelector('[type=submit]');
  button.disabled = true; error.textContent = '';
  try {
    const response = await fetch('/portal/api/login', {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({password:input.value})});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'No se pudo iniciar sesión');
    input.value = '';
    location.replace(location.pathname.startsWith('/try') ? '/try/' : '/chat/');
  } catch (e) { error.textContent = e.message || 'No se puede conectar con el A1.'; }
  finally { button.disabled = false; }
});
