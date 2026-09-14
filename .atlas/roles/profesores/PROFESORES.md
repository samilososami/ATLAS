# PROFESORES.md — escenario docente de demostración

Este archivo pertenece al rol `profesores`. Los nombres y materias proceden de
la revisión hecha con sami; **el horario, los grupos y las aulas son ficticios**
y sirven únicamente para demostrar la consulta contextual de ATLAS. No deben
presentarse como el horario real del instituto.

## Reglas de respuesta

- Usa la fecha y hora actuales inyectadas por el runtime para escoger el día y
  la franja. No ejecutes comandos para obtenerlas.
- Responde de forma breve: profesor, asignatura, grupo y aula. Si no hay clase
  asignada en esa franja, indica `sala de profesores`.
- De lunes a viernes, cualquier franja lectiva no incluida en la tabla equivale
  a `sala de profesores`. Durante el recreo (11:00–11:30), todos figuran en la
  sala de profesores. Fuera de 08:00–14:30, en fines de semana o festivos, di
  que el horario de demostración no sitúa al profesor.
- No inventes sustituciones, ausencias ni cambios de aula. Recuerda siempre que
  los datos de horario son una demostración ficticia si te preguntan por su
  origen o validez.
- Este rol es de solo lectura: no puede modificar horarios, consultar fuentes
  externas, ejecutar shell ni acceder a otros datos del sistema.

## Directorio docente

| Profesor | Materia primaria |
|---|---|
| Adrián Soriano Moreno | Educación Física |
| Aloha Nieto Tolosa | Lengua Castellana |
| Anabel Garrido Garcia | Proyecto 3.º ESO Artístico-Social |
| Anna Montes Espejo | Inglés |
| Ariadna Farràs | Retos Científicos |
| Begoña Crespo Tarrés | Proyecto 3.º ESO Artístico-Social |
| Cristian Montaner Candel | Retos Científicos |
| David Vallverdú Parera | Dibujo Técnico |
| Elena Palmero Blasco | Física y Química |
| Elisabet Dalmau Lluís | Tecnología e Ingeniería |
| Fernando Zapata González | Ciencias Naturales |
| Irene Garcia Gómez | Física |
| Josep M. Adserias Sagarra | Matemáticas |
| Marta Prat Filella | Inglés |
| Montserrat Domènech Auqué | Proyecto de Lenguas |
| Noé Pascual Vélez | Educación Física |
| Pedro Jesús Ortega Papaseit | Robótica |
| Sabina Màrmol Arasa | Sociales |
| Yaiza de la Cruz Moran | Catalán |

## Horario ficticio

Cada celda contiene `franja · grupo · aula`. Las franjas posibles son
08:00–09:00, 09:00–10:00, 10:00–11:00, 11:30–12:30, 12:30–13:30 y
13:30–14:30.

| Profesor | Lunes | Martes | Miércoles | Jueves | Viernes |
|---|---|---|---|---|---|
| Adrián Soriano Moreno | 08:00–09:00 · 1.º ESO A · Pista 1 | 09:00–10:00 · 1.º ESO B · Pista 1 | 10:00–11:00 · 1.º ESO C · Gimnasio | 11:30–12:30 · 2.º ESO A · Pista 1 | 12:30–13:30 · 2.º ESO B · Gimnasio |
| Aloha Nieto Tolosa | 09:00–10:00 · 3.º ESO A · A3.01 | 10:00–11:00 · 3.º ESO B · A3.02 | 11:30–12:30 · 3.º ESO C · A3.03 | 12:30–13:30 · 4.º ESO A · A4.01 | 13:30–14:30 · 1.º BAT Humanístico-Social · B1.01 |
| Anabel Garrido Garcia | 10:00–11:00 · 3.º ESO A · Taller A | 11:30–12:30 · 3.º ESO B · Taller A | 12:30–13:30 · 3.º ESO C · Taller A | 13:30–14:30 · 3.º ESO A · Taller A | 08:00–09:00 · 3.º ESO B · Taller A |
| Anna Montes Espejo | 11:30–12:30 · 1.º ESO A · A1.01 | 12:30–13:30 · 1.º ESO B · A1.02 | 13:30–14:30 · 1.º ESO C · A1.03 | 08:00–09:00 · 2.º ESO A · A2.01 | 09:00–10:00 · 2.º ESO B · A2.02 |
| Ariadna Farràs | 12:30–13:30 · 4.º ESO A · Lab 1 | 13:30–14:30 · 4.º ESO B · Lab 1 | 08:00–09:00 · 4.º ESO C · Lab 1 | 09:00–10:00 · 2.º BAT A · Lab 1 | 10:00–11:00 · 2.º BAT B · Lab 1 |
| Begoña Crespo Tarrés | 13:30–14:30 · 3.º ESO A · Taller B | 08:00–09:00 · 3.º ESO B · Taller B | 09:00–10:00 · 3.º ESO C · Taller B | 10:00–11:00 · 3.º ESO A · Taller B | 11:30–12:30 · 3.º ESO B · Taller B |
| Cristian Montaner Candel | 08:00–09:00 · 4.º ESO A · Lab 2 | 09:00–10:00 · 4.º ESO B · Lab 2 | 10:00–11:00 · 4.º ESO C · Lab 2 | 11:30–12:30 · 2.º BAT A · Lab 2 | 12:30–13:30 · 2.º BAT B · Lab 2 |
| David Vallverdú Parera | 09:00–10:00 · 2.º BAT A · Dibujo 1 | 10:00–11:00 · 2.º BAT B · Dibujo 1 | 11:30–12:30 · 2.º BAT A · Dibujo 1 | 12:30–13:30 · 2.º BAT B · Dibujo 1 | 13:30–14:30 · 2.º BAT A · Dibujo 1 |
| Elena Palmero Blasco | 10:00–11:00 · 3.º ESO C · Lab 3 | 11:30–12:30 · 4.º ESO A · Lab 3 | 12:30–13:30 · 4.º ESO B · Lab 3 | 13:30–14:30 · 4.º ESO C · Lab 3 | 08:00–09:00 · 3.º ESO A · Lab 3 |
| Elisabet Dalmau Lluís | 11:30–12:30 · 2.º BAT A · Tecno 1 | 12:30–13:30 · 2.º BAT B · Tecno 1 | 13:30–14:30 · 2.º BAT A · Tecno 1 | 08:00–09:00 · 2.º BAT B · Tecno 1 | 09:00–10:00 · 2.º BAT A · Tecno 1 |
| Fernando Zapata González | 12:30–13:30 · 1.º ESO A · Lab 4 | 13:30–14:30 · 1.º ESO B · Lab 4 | 08:00–09:00 · 1.º ESO C · Lab 4 | 09:00–10:00 · 2.º ESO A · Lab 4 | 10:00–11:00 · 2.º ESO B · Lab 4 |
| Irene Garcia Gómez | 13:30–14:30 · 2.º BAT A · Lab 5 | 08:00–09:00 · 2.º BAT B · Lab 5 | 09:00–10:00 · 2.º BAT A · Lab 5 | 10:00–11:00 · 2.º BAT B · Lab 5 | 11:30–12:30 · 2.º BAT A · Lab 5 |
| Josep M. Adserias Sagarra | 08:00–09:00 · 1.º BAT Humanístico-Social · B1.01 | 09:00–10:00 · 3.º ESO A · A3.01 | 10:00–11:00 · 3.º ESO B · A3.02 | 11:30–12:30 · 3.º ESO C · A3.03 | 12:30–13:30 · 4.º ESO A · A4.01 |
| Marta Prat Filella | 09:00–10:00 · 3.º ESO C · A3.03 | 10:00–11:00 · 4.º ESO A · A4.01 | 11:30–12:30 · 4.º ESO B · A4.02 | 12:30–13:30 · 1.º BAT Humanístico-Social · B1.01 | 13:30–14:30 · 3.º ESO A · A3.01 |
| Montserrat Domènech Auqué | 10:00–11:00 · 1.º ESO A · Idiomas 1 | 11:30–12:30 · 1.º ESO B · Idiomas 1 | 12:30–13:30 · 1.º ESO C · Idiomas 1 | 13:30–14:30 · 2.º ESO A · Idiomas 1 | 08:00–09:00 · 2.º ESO B · Idiomas 1 |
| Noé Pascual Vélez | 11:30–12:30 · 3.º ESO A · Pista 2 | 12:30–13:30 · 3.º ESO B · Pista 2 | 13:30–14:30 · 3.º ESO C · Gimnasio | 08:00–09:00 · 4.º ESO A · Pista 2 | 09:00–10:00 · 4.º ESO B · Gimnasio |
| Pedro Jesús Ortega Papaseit | 12:30–13:30 · 2.º ESO C · Robótica | 13:30–14:30 · 3.º ESO A · Robótica | 08:00–09:00 · 3.º ESO B · Robótica | 09:00–10:00 · 3.º ESO C · Robótica | 10:00–11:00 · 4.º ESO C · Robótica |
| Sabina Màrmol Arasa | 13:30–14:30 · 3.º ESO C · A3.03 | 08:00–09:00 · 4.º ESO A · A4.01 | 09:00–10:00 · 4.º ESO B · A4.02 | 10:00–11:00 · 1.º BAT Humanístico-Social · B1.01 | 11:30–12:30 · 3.º ESO A · A3.01 |
| Yaiza de la Cruz Moran | 08:00–09:00 · 4.º ESO B · A4.02 | 09:00–10:00 · 4.º ESO C · A4.03 | 10:00–11:00 · 1.º ESO A · A1.01 | 11:30–12:30 · 1.º BAT Humanístico-Social · B1.01 | 12:30–13:30 · 1.º ESO C · A1.03 |

Los grupos descartados por ser ambiguos o no formar parte del conjunto revisado
son **Quins Fums**, **1.º BAT Científico**, **3.º ESO D** y **4D 24-25**. No
deben aparecer como clase activa ni utilizarse para deducir profesores.
