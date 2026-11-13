# RF100 y RF102 · Invitar y retirar estudiantes en grupo, y eliminar el aula

Rama: `rf100-102-aulas-masivo` (sale de `rf107-calificacion-automatica`, porque `AulasView.vue` ya incluye el botón de regreso a la evaluación de esa rama).

## Qué hace
- **Invitar varios correos a la vez (RF100):** el cuadro de invitación acepta correos separados por coma, punto y coma, espacio o salto de línea, y el formato «Nombre <correo>». Muestra cada correo como etiqueta con una × para quitarlo. Los que no son `@alu.unach.cl` salen en rojo y se omiten; los repetidos se envían una vez. Hasta 30 por envío. **Toda la lista viaja en una sola petición** a `/api/invitaciones/enviar`, y el servidor la manda de una vez con el endpoint de lote de Resend (`/emails/batch`): cada estudiante recibe su propio correo, sin ver a los demás. Con `x-batch-validation: permissive`, un correo rechazado no frena a los demás: al terminar se ve el detalle de enviadas y fallidas con su motivo, y quedan en el cuadro solo las fallidas para reintentar. El endpoint sigue aceptando un solo correo (`correo`) por compatibilidad. Si el aula no existe, no hay permiso o el código está desactivado, no se envía nada y los correos quedan como fallidos con ese motivo.
- **Retirar varios estudiantes (RF102):** en el mismo modal hay una lista con casillas, «Seleccionar todos» y «Retirar seleccionados (n)», con confirmación. Usa `retirarEstudiantesAula` (función `retirar_estudiantes`, con auditoría). El estudiante retirado deja de ver el aula; su cuenta y sus mediciones personales no se borran.
- **Eliminar el aula:** botón «Eliminar aula» en cada tarjeta. El modal muestra cuántos estudiantes y evaluaciones se perderán y exige escribir el nombre del aula. Solo el profesor dueño o un administrador (en Supabase lo exige también la política `aulas_borrar`).

## El correo que recibe el estudiante
- Dice quién lo invita (el profesor) y a qué aula, y muestra el código.
- Botón **«Unirme al aula»**: lleva a `/aulas?unirse=CODIGO`. Si el estudiante no tiene sesión, entra al inicio de sesión y vuelve a esa dirección; en *Aulas* ve el aviso «Tu profesor te invitó a un aula» con el código ya escrito y pulsa «Unirme al Aula» (no se une solo con solo abrir el enlace).
- Enlace **«Ver la sala en el sitio web»**: lleva a `/aulas`.
- Las direcciones salen de `APP_URL` (producción); en local, de `http://localhost:5173`; en cualquier otro caso, de la web publicada. Nunca se toma un origen externo de la petición.

## Configuración del correo (Resend)
- `RESEND_API_KEY` (obligatoria): en local va en `.env.local` y en producción en las variables de entorno de Vercel. Sin ella el envío falla con «Falta la variable RESEND_API_KEY». Tras agregarla hay que **reiniciar** `npm run dev`.
- `APP_URL` (recomendada en producción): web a la que apuntan los botones del correo.
- `RESEND_FROM` (opcional): remitente. Por defecto se usa `onboarding@resend.dev`, el remitente de pruebas de Resend, que **solo entrega al correo de la cuenta de Resend**. Para invitar a estudiantes reales hay que verificar un dominio en Resend y definir aquí un remitente de ese dominio.

## Eliminar el aula es definitivo
El borrado en cascada elimina cursos, invitaciones, evaluaciones y los resultados de los estudiantes. Las mediciones personales no se borran (la columna queda en `null`). Si más adelante se prefiere un «archivar» reversible, la tabla `aulas` ya tiene la columna `archivada`.

## Archivos
- `src/utils/correosInvitacion.js`: lectura, validación, repetidos, máximo y quitar un correo.
- `src/services/aulasService.js`: `enviarInvitacionesVarias` y `eliminarAula`.
- `src/services/emailService.js`: `enviarCorreosInvitacion` (una petición con toda la lista).
- `api/invitaciones/enviar.js`: acepta `correos` (lista) y envía en lote.
- `src/views/AulasView.vue`: cuadro de correos, etiquetas, resultado del envío, retiro múltiple y modal de eliminación.
- `scripts/test-aulas-masivo.mjs`: pruebas (`npm run test:aulas-masivo`).
- `scripts/test-invitaciones-lote.mjs`: pruebas del envío en lote con la red simulada (`npm run test:invitaciones-lote`).

## Límites
- Los envíos reales por Resend no se probaron: las pruebas simulan la red.
- No hay cambios de base de datos: usa `retirar_estudiantes` y la política `aulas_borrar` que ya existían.
