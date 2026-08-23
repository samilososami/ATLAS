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

## Reportar un problema

Si encuentras una credencial o dato privado publicado por error, no lo reutilices ni lo difundas. Comunícalo al propietario del repositorio para que pueda revocarlo y retirar el contenido.
