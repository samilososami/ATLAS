# ATLAS WhatsApp Sami absent

`atlas-whatsapp-samiabsent` gestiona el redactor automático que escribe como
Sami en privados o grupos seleccionados explícitamente.

```bash
atlas-whatsapp-samiabsent
atlas-whatsapp-samiabsent --person "Xavi"
atlas-whatsapp-samiabsent --person "Xavi" --off
atlas-whatsapp-samiabsent --group "Los mantitos"
atlas-whatsapp-samiabsent --group "Los mantitos" --off
atlas-whatsapp-samiabsent --delay on
atlas-whatsapp-samiabsent probe
```

Mantiene su propia sesión Realtime caliente, aislada de Guardian y del contexto
general de ATLAS. No se identifica como ATLAS y puede devolver silencio, varias
burbujas o una respuesta nativa a un mensaje anterior. Su única capacidad es
la búsqueda SGK tipada y de solo lectura; no tiene shell, rutas, dispositivos ni
acceso general a archivos. Cualquier otra tool se rechaza.

El perfil completo está en `sami/SAMI-IDENTITY.md`. Los corpus limpiados y su
índice permanecen privados y fuera de Git. La búsqueda devuelve siempre la
fuente del ejemplo y favorece de forma moderada el chat activo.
