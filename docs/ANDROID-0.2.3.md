# ATLAS Android 0.2.3-preview

Actualización instalable que afina el flujo de control del teléfono:

- «Controla mi teléfono» inicia Android Use una sola vez, responde `Listo` y
  espera la siguiente instrucción sin navegar ni inspeccionar por su cuenta.
- La sesión explícita permanece disponible entre mensajes hasta que el usuario
  la detiene, cierra el cliente, pulsa el botón rojo o vence el tiempo de espera.
- Abrir una aplicación conocida sigue usando `apps.launch`; las coordenadas se
  reservan para acciones dentro de la aplicación.
- Ni el cliente ni el backend fuerzan una inspección visual inmediatamente
  después de `androiduse.start`; una tarea posterior solicita la captura cuando
  realmente la necesita.
