# ATLAS WhatsApp Guardian

`atlas-whatsapp-guardian` gestiona la sesión Realtime caliente que atiende las
menciones `@atlas` escritas por Sami desde su propia cuenta.

```bash
atlas-whatsapp-guardian on
atlas-whatsapp-guardian off
atlas-whatsapp-guardian status
atlas-whatsapp-guardian probe
atlas-whatsapp-guardian --header on
atlas-whatsapp-guardian --header off
```

Guardian conserva las capacidades completas de ATLAS, pero solo la petición
explícita posterior a `@atlas` tiene autoridad. El historial cercano y los
mensajes de otras personas son contexto no confiable. Guardian se identifica
como ATLAS: no suplanta a Sami. Puede adoptar sus minúsculas y su humor absurdo
o negro cuando el contexto sea claramente de broma, sin interpretar una
hipérbole entre amigos como una orden literal.

La guía privada y acotada `sami/GUARDIAN-STYLE.md` define ese registro. Guardian
no carga `SAMI-IDENTITY.md` ni los chats limpiados usados por Sami absent.

El daemon fija el chat y realiza el envío. La cabecera opcional también se
inyecta por código. `probe` no lee ni envía mensajes reales.
