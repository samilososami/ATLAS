# Seguridad

## Imágenes y configuraciones públicas

Las versiones públicas de ATLAS no deben incluir:

- API keys, access tokens o refresh tokens.
- Passwords, cookies, sesiones o credenciales guardadas.
- Configuraciones Wi-Fi o certificados privados.
- Claves privadas SSH ni host keys reutilizadas.
- Historiales de shell, logs personales o conversaciones.
- Archivos `USER.md`, `MEMORY.md` o `TDR.md` de una instalación real.

Las imágenes de ATLAS OS se generan desde una copia de trabajo y se sanea esa copia. El sistema de origen no debe modificarse durante el proceso de publicación.

La sincronización de código usa una selección explícita de archivos. Excluye
`.runtime`, `.certs`, `.models`, `.venv`, logs, backups, perfiles de Google Chrome,
sesiones de OpenClaw y proyectos personales generados. Los templates privados
no deben sustituirse por las copias reales de una Raspberry Pi.

## Superficies de desarrollo

WebScreen escucha en la red local y no incluye autenticación propia del
navegador. Puede ejecutar acciones a través de OpenClaw: no lo expongas a
Internet y limita su acceso a una red de confianza. Las credenciales se leen
en el backend y no deben enviarse al cliente.

El acceso exclusivo utiliza permisos efímeros por pestaña y valida el control
en el backend. Esto evita peticiones de otros clientes sin el permiso actual,
pero no identifica a una persona: el primero que llega cuando está libre
obtiene el control. Los permisos viajan por HTTP sin cifrar en esta versión.

Los modos `atlas-screen --terminal` y `atlas-screen --rafas` abren una shell root
física sin pedir una contraseña adicional. RAFAS también se activa con Ctrl y la
secuencia W, O, W en un teclado USB. Son funciones de desarrollo para un equipo
bajo control de su propietario; el atajo no es autenticación. El servicio no
registra pulsaciones ni escucha en la red. La autenticación de RAFAS queda pendiente.

## Reportar un problema

Si encuentras una credencial o dato privado publicado por error, no lo reutilices ni lo difundas. Comunícalo al propietario del repositorio para que pueda revocarlo y retirar el contenido.
