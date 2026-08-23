# ATLAS OS 1.0

ATLAS OS 1.0 es la primera imagen pública del sistema utilizado por ATLAS A1. Está basada en Debian 13.5 (`trixie`) para arquitectura `aarch64` y preparada para Raspberry Pi 5.

## Estado de esta imagen

Esta versión se publica inicialmente como prerelease. La estructura de disco, los filesystems y el contenido se han validado offline, pero la imagen reconstruida todavía debe grabarse y arrancarse en una microSD de prueba antes de considerarse validada en hardware.

## Contenido

- Identidad `ATLAS OS 1.0 (Debian 13)`.
- Hostname inicial `atlas-a1`.
- Fastfetch y Neofetch personalizados.
- OpenClaw y sus dependencias instalados, sin configuración privada.
- Workspace público con la identidad de ATLAS y templates limpios.
- Comandos `atlas-*` para audio, casting, escritorio, estado, prioridades, TTS y webscreen.
- Entorno de escritorio y componentes de ATLAS A1 presentes en el sistema de origen.
- Expansión automática de la partición root y generación de un Disk ID nuevo durante el primer arranque.

## Requisitos

- Raspberry Pi 5.
- microSD de 16 GB o más.
- Lector de tarjetas.
- Ethernet o acceso local mediante teclado y pantalla para la configuración inicial de esta versión.

## Primer acceso

La imagen no contiene perfiles Wi-Fi. La cuenta inicial es `sami`, con home directory `/home/atlas`. La contraseña temporal es `atlas` y debe cambiarse obligatoriamente en el primer login.

Después del primer acceso:

1. Configura la red mediante `nmtui` o las herramientas de Raspberry Pi.
2. Ejecuta `openclaw onboard` para configurar modelos, credenciales y channels.
3. Instala o activa el Gateway después del onboarding.
4. Comprueba el sistema con `openclaw gateway status --deep` y `atlas-pistatus`.

## Verificación de la descarga

Descarga `SHA256SUMS` junto con la imagen y ejecuta:

```bash
sha256sum -c SHA256SUMS
```

No grabes una imagen cuyo checksum no coincida.

## Grabación

Raspberry Pi Imager permite seleccionar una imagen personalizada. También puede grabarse desde Linux, verificando antes con mucho cuidado cuál es el dispositivo de destino:

```bash
xz -dc ATLAS-OS-1.0.img.xz | sudo dd of=/dev/sdX bs=4M status=progress conv=fsync
```

El comando `dd` sobrescribe el dispositivo seleccionado. Sustituye `/dev/sdX` únicamente después de identificar la microSD y nunca utilices el disco del sistema.

## Saneamiento aplicado

La imagen pública se construyó desde una copia de solo lectura del sistema de origen. En la copia se eliminaron o regeneraron:

- Configuración y estado privado de OpenClaw.
- API keys, tokens, cookies y sesiones almacenadas en las rutas privadas excluidas.
- Perfiles Wi-Fi, leases y estado de NetworkManager.
- Claves SSH del usuario y host keys del sistema.
- GPG keyrings, historiales de shell y estado de navegadores.
- Logs, caches de usuario, machine-id, cloud-init state y datos de dispositivos conectados.
- Contenido personal de `USER.md`, `MEMORY.md`, `TDR.md`, `ENVIRONMENT.md` y `HEARTBEAT.md`, sustituido por templates públicos.

La Raspberry Pi de origen no fue modificada durante la creación de la imagen.

## ATLAS Imager

Una futura aplicación ATLAS Imager para Windows y Linux automatizará la descarga, verificación, descompresión y grabación. También permitirá preparar Wi-Fi, hostname, usuario, contraseña y claves SSH antes del primer arranque sin incorporar esos datos a la imagen pública.
