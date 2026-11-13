# RF100 y RF102 · Invitar y retirar estudiantes en grupo, y eliminar el aula

Rama: `rf100-102-aulas-masivo` (sale de `rf107-calificacion-automatica`, porque `AulasView.vue` ya incluye el botón de regreso a la evaluación de esa rama).

## Qué hace
- **Invitar varios correos a la vez (RF100):** el cuadro de invitación acepta correos separados por coma, punto y coma, espacio o salto de línea, y el formato «Nombre <correo>». Muestra cada correo como etiqueta con una × para quitarlo. Los que no son `@alu.unach.cl` salen en rojo y se omiten; los repetidos se envían una vez. Hasta 30 por envío. **Toda la lista viaja en una sola petición** a `/api/invitaciones/enviar`, y el servidor la manda a la vez desde Gmail: cada estudiante recibe su propio correo, sin ver a los demás. Un correo rechazado no frena a los demás: al terminar se ve el detalle de enviadas y fallidas con su motivo, y quedan en el cuadro solo las fallidas para reintentar. El endpoint sigue aceptando un solo correo (`correo`) por compatibilidad. Si el aula no existe, no hay permiso o el código está desactivado, no se envía nada y los correos quedan como fallidos con ese motivo.
- **Retirar varios estudiantes (RF102):** en el mismo modal hay una lista con casillas, «Seleccionar todos» y «Retirar seleccionados (n)», con confirmación. Usa `retirarEstudiantesAula` (función `retirar_estudiantes`, con auditoría). El estudiante retirado deja de ver el aula; su cuenta y sus mediciones personales no se borran.
- **Eliminar el aula:** botón «Eliminar aula» en cada tarjeta. El modal muestra cuántos estudiantes y evaluaciones se perderán y exige escribir el nombre del aula. Solo el profesor dueño o un administrador (en Supabase lo exige también la política `aulas_borrar`).

## El correo que recibe el estudiante
- Dice quién lo invita (el profesor) y a qué aula, y muestra el código.
- Botón **«Unirme al aula»**: lleva a `/aulas?unirse=CODIGO`. Si el estudiante no tiene sesión, entra al inicio de sesión y vuelve a esa dirección; en *Aulas* ve el aviso «Tu profesor te invitó a un aula» con el código ya escrito y pulsa «Unirme al Aula» (no se une solo con solo abrir el enlace).
- Enlace **«Ver la sala en el sitio web»**: lleva a `/aulas`.
- Las direcciones salen de `APP_URL` (producción); en local, de `http://localhost:5173`; en cualquier otro caso, de la web publicada. Nunca se toma un origen externo de la petición.

## Configuración del correo (Gmail)
Las invitaciones salen desde una cuenta de Gmail (`sensorpulso@gmail.com`) por SMTP, con `nodemailer` en `api/_lib/correo.js`. No se usa ningún servicio externo de correo pago ni claves de terceros.
- `GMAIL_USER`: la dirección de Gmail que envía.
- `GMAIL_APP_PASSWORD`: la **contraseña de aplicación** de esa cuenta. No es la contraseña normal de Gmail: Google no deja usar esa por SMTP.
- `APP_URL` (recomendada en producción): web a la que apuntan los botones del correo.
- En local van en `.env.local` y hay que **reiniciar** `npm run dev`; en producción, en las variables de entorno de Vercel (Production) y volver a desplegar.

Cómo crear la contraseña de aplicación: entrar a la cuenta de Google → Seguridad → activar la **verificación en dos pasos** → https://myaccount.google.com/apppasswords → crear una («Sensor Pulso») y copiar las 16 letras (se pueden pegar con espacios).

Límites de Gmail a tener en cuenta: unos 500 destinatarios por día en una cuenta gratuita (los que pasen quedan como fallidos con el motivo «límite diario»), y el remitente siempre es la cuenta de Gmail. Cada estudiante recibe su propio correo; se envían todos a la vez con hasta 5 conexiones paralelas.

## Eliminar el aula es definitivo
El borrado en cascada elimina cursos, invitaciones, evaluaciones y los resultados de los estudiantes. Las mediciones personales no se borran (la columna queda en `null`). Si más adelante se prefiere un «archivar» reversible, la tabla `aulas` ya tiene la columna `archivada`.

## Archivos
- `src/utils/correosInvitacion.js`: lectura, validación, repetidos, máximo y quitar un correo.
- `src/services/aulasService.js`: `enviarInvitacionesVarias` y `eliminarAula`.
- `src/services/emailService.js`: `enviarCorreosInvitacion` (una petición con toda la lista).
- `api/invitaciones/enviar.js`: acepta `correos` (lista), arma el correo y lo envía.
- `api/_lib/correo.js`: conexión SMTP con Gmail, errores traducidos y envío en paralelo.
- `src/components/InvitacionMasivaForm.vue`: cuadro de correos con los separadores a la vista, etiquetas con ×, resultado del envío. Lo usan la lista de aulas y la página del aula.
- `src/views/AulasView.vue` y `src/views/AulaDetalleView.vue`: abren el formulario; `AulasView` suma el retiro múltiple y el modal de eliminación.
- `scripts/test-aulas-masivo.mjs`: pruebas (`npm run test:aulas-masivo`).
- `scripts/test-invitaciones-lote.mjs`: pruebas del envío desde Gmail con el transporte simulado (`npm run test:invitaciones-lote`).

## Límites
- Los envíos reales por Gmail no se probaron: las pruebas simulan el transporte SMTP.
- No hay cambios de base de datos: usa `retirar_estudiantes` y la política `aulas_borrar` que ya existían.
