# ATLAS Usage

`atlas-usage` consulta en directo la cuenta de ChatGPT y las cuotas compartidas
de Work/Codex mediante el Native Broker. Reutiliza el OAuth de Codex; no lee ni
imprime tokens, IDs internos ni secretos.

```bash
atlas-usage
atlas-usage --json
atlas-usage --refresh
```

La salida humana muestra:

- correo de la cuenta de ChatGPT autenticada;
- plan detectado;
- porcentaje libre y usado de cada ventana aplicable;
- fecha y hora de renovación en `Europe/Madrid`.

En cuentas Pro puede existir únicamente la ventana semanal. No presentes una
ventana ausente como `0 %`: significa que no aplica o que el proveedor no la
ha devuelto. Las cifras no representan un número fijo de mensajes; el consumo
varía con el modelo, razonamiento y tamaño de cada tarea.

Cuando Sami pregunte «¿cuánto uso me queda?», «¿cuánto me queda libre?» o una
variante equivalente, ejecuta `atlas-usage --json` y responde brevemente con el
porcentaje restante y la renovación. Añade el correo o el plan solo si lo pide
o si ayuda a confirmar qué cuenta se está consultando. Nunca respondas con una
cuota memorizada: siempre consulta el comando.

El wrapper funciona como `sami` y como root, pero en ambos casos baja al usuario
del runtime y usa `/home/atlas/.codex`. Así no crea una segunda sesión OAuth en
`/root`.
