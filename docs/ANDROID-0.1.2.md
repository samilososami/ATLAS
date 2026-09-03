# ATLAS Android 0.1.2 preview · 2026-09-03

Actualización instalable sobre 0.1.1, con la misma firma de desarrollo y versionCode 3.
Android 11 o posterior. APK publicada para pruebas del propietario mientras
continúa la revisión visual en emulador; no es una versión de producción auditada.

## Cambios

- Tema **Claro** por defecto, blanco suave, con **Oscuro** seleccionable en
  Ajustes → Apariencia. Se conserva al cerrar la app y no cambia los acentos azules.
- Barras de Android y menús nativos adaptados al tema.
- Icono del launcher algo más pequeño: margen del 22% al 25%.
- Silueta SVG de ATLAS en navegación y antiguos iconos de destello. Engranaje
  relleno en Ajustes y rótulo ATLAS vectorial blanco en cabecera/pie.
- Los dos logos originales a color de cabecera y zona de voz no se sustituyen.
- Conversación, historial y campo de texto únicamente en **Chat**. Elegir chat
  sin voz ya no puede silenciar inadvertidamente Pulsar o «Atlas».
- Companion, `atlas-app`, `atlas-rafas` y sus documentos instalados en la Pi.
  RAFAS también avisa de unidades fallidas fuera de la lista de servicios principales.

## Comprobado antes de publicar

- Compilación de la APK y 10 pruebas de apariencia, modalidades y terminal.
- 13 pruebas de Companion/cifrado/relay/PTY y 8 de RAFAS.
- En A1 real: servicio activo, claves privadas con permisos restringidos,
  identidad TLS, RPC cifrado, diagnóstico/cuotas, comando inocuo con permiso
  de un solo uso, rechazo de permiso reutilizado y terminal interactiva.
- WebScreen y kiosko siguen activos, sin reiniciarlos durante la instalación.

## Pruebas pendientes al publicar

- Revisión visual final del tema y navegación en Android, en curso.
- Micrófono de un teléfono físico y conversación Android → Realtime completa.
- Relay público y conexión desde datos móviles: aún no desplegados. En la misma
  Wi-Fi ya se puede emparejar con `atlas-app pair` desde una terminal privada.

Hay un fallo registrado del servicio de arranque de pantalla: el kiosko no estuvo
listo dentro del plazo al arrancar. El kiosko y WebScreen están activos ahora;
no se ha borrado el registro ni forzado un reinicio para ocultarlo.

El código de emparejamiento concede administración de A1: no publicarlo. Las
credenciales biométricas no salen de Android. Sin Tailscale. Opciones de
alojamiento y pasos pendientes: [Relay](RELAY-HOSTING.md).
