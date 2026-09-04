# Assets del onboarding de ATLAS

Los 25 recursos están en `android/app/src/main/assets/web/onboarding/`. La aplicación los muestra en este orden:

| Pantalla | PNG | Concepto |
| --- | --- | --- |
| 01 | `01-welcome.png` | ATLAS saluda |
| 02 | `02-agentic-arms.png` | Asistente agéntico con “brazos” |
| 03 | `03-raspberry-pi.png` | ATLAS sostiene una Raspberry Pi |
| 04 | `04-help-tasks.png` | Control remoto, tareas y entorno |
| 05 | `05-app-control.png` | Aplicación móvil de ATLAS |
| 06 | `06-phone-control.png` | Control directo del teléfono |
| 07 | `07-reminders.png` | Recordatorios |
| 08 | `08-phone-calls.png` | Llamadas telefónicas |
| 09 | `09-file-organizer.png` | Organización de archivos |
| 10 | `10-permissions.png` | Introducción a los permisos |
| 11 | `11-microphone.png` | Micrófono |
| 12 | `12-notifications.png` | Notificaciones |
| 13 | `13-bluetooth.png` | Bluetooth y emparejamiento con A1 |
| 14 | `14-overlay.png` | Aparecer encima de otras apps |
| 15 | `15-location.png` | Ubicación |
| 16 | `16-camera.png` | Cámara |
| 17 | `17-contacts.png` | Contactos |
| 18 | `18-calendar.png` | Calendario |
| 19 | `19-phone.png` | Teléfono |
| 20 | `20-call-log.png` | Registro de llamadas |
| 21 | `21-sms.png` | SMS y mensajes |
| 22 | `22-wifi.png` | Wi-Fi |
| 23 | `23-gallery-audio.png` | Galería y audio |
| 24 | `24-storage.png` | Almacenamiento |
| 25 | `25-activity-sensors.png` | Actividad física y sensores |

## Prompt visual base

Cada imagen generada utilizó una llamada independiente a ImageGen y esta dirección visual común:

> Ilustración 3D pulida para el onboarding de ATLAS. Mantener exactamente la identidad del personaje de referencia: robot blanco, redondeado y adorable; visor negro brillante; ojos ovalados y sonrisa azul; collar en V azul; manos y pies blancos; asa superior redondeada azul. Sin antena, bola ni orejas. Estética minimalista y cuidada de producto, iluminación suave de estudio y materiales ligeramente brillantes. Personaje completo y centrado en lienzo cuadrado, con margen generoso, sin cortes, marcos, texto, letras ni números. PNG con fondo alfa realmente transparente.

A ese bloqueo visual se añadió únicamente la escena descrita en la tabla. Cuando el generador rasterizó un damero, se extrajo el primer plano con BRIA-RMBG 2.0 y se comprobó el canal alfa sobre el fondo azul oscuro de la aplicación.
