# ATLAS Android 0.2.0-preview

Actualización mayor de conexión, control del teléfono y experiencia móvil.

## Novedades

- Sustituye Cloudflare como transporte principal por un WebSocket privado sobre
  Tailscale, normalmente directo, con fallback heredado y migración transparente
  de emparejamientos 0.1.x.
- Mantiene el enlace cifrado a A1 en un foreground service, reacciona a cambios de
  red y vuelve a probar Tailscale cada 90 segundos si tuvo que usar el relay.
- Precarga Realtime al abrir, muestra su estado y renueva la sesión antes del
  límite del proveedor.
- Corrige `Could not start audio source` con un fallback PCM basado en AudioRecord.
- Añade APIs nativas para teléfono, SMS, contactos, calendario, ubicación,
  notificaciones, archivos, galería, cámara, sensores y Wi-Fi.
- Añade `atlas-androiduse`: captura, árbol de accesibilidad, toque, pulsación larga,
  swipe, texto, navegación y apertura de apps. Durante el control hay notificación,
  aura azul, bloqueo de entrada y parada manual inmediata.
- Incorpora la página ilustrada de Accesibilidad y **Comprobar permisos**, que abre
  únicamente los permisos pendientes sin repetir el tutorial ni borrar datos.
- Rehace Chat, Acciones, Terminal, Estado y Ajustes con la identidad visual oscura
  de ATLAS, animaciones acotadas y feedback táctil.
- El chat es siempre texto, optimista y progresivo; alterna 50 sugerencias cortas.
- Los botones de Acciones se seleccionan sin flicker y se crean mediante presets
  funcionales, manteniendo el comando interno fuera del formulario.
- La terminal conserva la PTY cinco minutos, reanuda la misma sesión, pausa el
  polling fuera del tab, ofrece fullscreen y pellizco para el tamaño de letra.
- Estado conserva la última lectura válida, actualiza al entrar y añade
  pull-to-refresh.
- Añade desemparejado criptográfico real: A1 rota la clave y cierra el móvil.
- Conserva widgets desde el selector del launcher y el actualizador GitHub con
  validación de hash, package, versionCode y firma.

## Verificación

- Companion, WebScreen, rutinas, audio, Bluetooth, pantalla y comandos: pruebas
  automatizadas completas.
- Tailscale `razer` → `atlas-a1`: ruta directa verificada; Companion 0.2.0 responde
  por HTTPS/WSS privado.
- APK compilada con la misma identidad que 0.1.12 y probada como actualización
  sobre esa versión en el emulador.
- Quedan como aceptación física en S23 Ultra: BLE real, micrófono/AudioRecord,
  telefonía, servicio bajo One UI, Tailscale Android y control de Accesibilidad.
