# RF100 y RF102 · Invitar y retirar estudiantes en grupo, y eliminar el aula

Rama: `rf100-102-aulas-masivo` (sale de `rf107-calificacion-automatica`, porque `AulasView.vue` ya incluye el botón de regreso a la evaluación de esa rama).

## Qué hace
- **Invitar varios correos a la vez (RF100):** el cuadro de invitación acepta correos separados por coma, punto y coma, espacio o salto de línea, y el formato «Nombre <correo>». Muestra cada correo como etiqueta con una × para quitarlo. Los que no son `@alu.unach.cl` salen en rojo y se omiten; los repetidos se envían una vez. Hasta 30 por envío. Se envía de a uno (el servicio de correo limita el ritmo), con avance «Enviando 3 de 10». Un fallo no detiene al resto: al terminar se ve el detalle de enviadas y fallidas con su motivo, y quedan en el cuadro solo las fallidas para reintentar. Si el aula no existe, no hay permiso o el código está desactivado, se corta de una vez porque el error sería el mismo para todos.
- **Retirar varios estudiantes (RF102):** en el mismo modal hay una lista con casillas, «Seleccionar todos» y «Retirar seleccionados (n)», con confirmación. Usa `retirarEstudiantesAula` (función `retirar_estudiantes`, con auditoría). El estudiante retirado deja de ver el aula; su cuenta y sus mediciones personales no se borran.
- **Eliminar el aula:** botón «Eliminar aula» en cada tarjeta. El modal muestra cuántos estudiantes y evaluaciones se perderán y exige escribir el nombre del aula. Solo el profesor dueño o un administrador (en Supabase lo exige también la política `aulas_borrar`).

## Eliminar el aula es definitivo
El borrado en cascada elimina cursos, invitaciones, evaluaciones y los resultados de los estudiantes. Las mediciones personales no se borran (la columna queda en `null`). Si más adelante se prefiere un «archivar» reversible, la tabla `aulas` ya tiene la columna `archivada`.

## Archivos
- `src/utils/correosInvitacion.js`: lectura, validación, repetidos, máximo y quitar un correo.
- `src/services/aulasService.js`: `enviarInvitacionesVarias` y `eliminarAula`.
- `src/views/AulasView.vue`: cuadro de correos, etiquetas, resultado del envío, retiro múltiple y modal de eliminación.
- `scripts/test-aulas-masivo.mjs`: pruebas (`npm run test:aulas-masivo`).

## Límites
- Los envíos reales por Resend no se probaron automáticamente.
- No hay cambios de base de datos: usa `retirar_estudiantes` y la política `aulas_borrar` que ya existían.
