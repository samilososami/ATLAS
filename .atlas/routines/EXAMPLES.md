# Ejemplos de rutinas

Este archivo es documentación; no se ejecuta. La rutina siguiente obtiene la
hora en el momento de la llamada y la inserta en la respuesta:

```json
{
  "id": "hora",
  "name": "Hora",
  "description": "El usuario pregunta por la hora actual",
  "thoughts": "date ofrece la hora local sin red; no hacen falta segundos.",
  "triggers": ["qué hora es"],
  "enabled": true,
  "requires_model": false,
  "steps": [
    {
      "type": "shell",
      "command": "date +%H:%M",
      "capture": "HORA",
      "timeout_seconds": 5
    },
    {
      "type": "say",
      "text": "Son $HORA"
    }
  ]
}
```

Una acción como encender una televisión puede no necesitar `say`: el éxito es
silencioso. Antes de guardarla, ATLAS debe comprobar el dispositivo autorizado
y escoger una orden directa; no debe almacenar un descubrimiento lento si ya
conoce y ha verificado la dirección correcta.
