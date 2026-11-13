# RF111 · El estudiante recibe su canal automáticamente y deja los datos del paciente

Rama: `rf111-canal-automatico-estudiante` (desde `develop`).

## Qué cambia
Antes, el estudiante veía los 5 canales y debía pulsar «Tomar este Canal» en uno libre. Ahora funciona igual que en el perfil del profesor y del administrador: **un botón y el sistema asigna solo**, y además se **guardan los datos del paciente**.

- **Botón «➕ Agregar mi canal»:** abre el mismo asistente de «Agregar canal» del profesor, en dos pasos:
  1. **Ficha del paciente (RF03):** nombre, fecha de nacimiento (edad calculada), nivel de estrés, sueño, cafeína, medicación, actividad previa y condición de salud. Parte de la ficha que el estudiante ya tiene guardada para no escribirla de nuevo, y puede corregirla.
  2. **Términos, política de privacidad (RF88) y consentimiento informado (RF04, RF59):** una sola aceptación.
- **Al aceptar:** se guarda la ficha (cifrada en el servidor, RF116), se registra el consentimiento, y el sistema asigna el **siguiente canal libre** (el de número más bajo). El estudiante no elige el número.
- **Se guarda con el canal:** la ficha, la versión de la política y la del consentimiento quedan ligadas al canal (`sesion_canal_requisitos`), y la ficha se usa al guardar sus mediciones, igual que en el profesor.
- **Un solo canal por estudiante:** con canal asignado, el bloque muestra «Tu canal: Canal N» y el botón desaparece. «Liberar mi canal» sigue disponible para pedir otro.
- **Sin canales libres:** el botón se desactiva y explica que hay que esperar a que el profesor abra la siguiente ronda.
- **Lista de canales:** como en el perfil del profesor, solo se muestran los canales ya tomados. Se quitó el botón «Tomar este Canal» de cada canal.
- **Control de rondas:** «Abrir Siguiente Ronda» ahora solo lo ven el profesor y el administrador (antes también lo veía el estudiante).

## Base de datos
Migración `supabase/migrations/20261113000500_rf111_canal_estudiante_con_ficha.sql` (también en la base completa): función `asignar_canal_estudiante(sesión, ficha, política, consentimiento)`.
- Exige que la persona pertenezca al aula de la sesión, que la ficha sea suya, la política vigente y un consentimiento activo.
- Toma el siguiente canal libre con `for update skip locked` (dos estudiantes nunca toman el mismo) y rechaza un segundo canal.
- Deja constancia en `sesion_canal_requisitos` y liga la ficha a la sesión y al canal.
- **Hay que ejecutarla en Supabase (SQL Editor)** para que funcione con la base real; requiere la migración `20261109000200` (canales múltiples).

## Archivos
- `src/components/AgregarCanalModal.vue`: ahora sirve a profesor (`modo="docente"`) y a estudiante (`modo="estudiante"`).
- `src/components/VinculacionCanales.vue`: bloque del estudiante, lista de canales tomados y control de rondas solo docente.
- `src/services/canalesService.js`: `asignarmeCanalConFicha` y `estadoAsignacionEstudiante` (reutilizan `agregarOtroCanal`).
- `src/utils/canalesMultiples.js`: `evaluarAsignacionEstudiante`.
- `scripts/test-rf111-canal-automatico-estudiante.mjs` (`npm run test:rf111-estudiante`).

## Límites
- Sin sesión real de Supabase (modo de demostración), la asignación y la ficha quedan en memoria y no se comparten entre dispositivos.
- Cada vez que el estudiante toma un canal se piden de nuevo la ficha, los términos y el consentimiento, como en el profesor.

## En Medición: un solo canal y un solo paciente, el propio estudiante
- **Mismo panel simple que el profesor:** en *Medición*, el estudiante ve el botón **«➕ Agregar mi canal»** (el profesor ve «Agregar canal»). Antes veía el panel grande de la ronda.
- **Un solo canal:** al agregar su canal, el botón desaparece y aparece «✓ Tu canal: Canal N» con «Liberar mi canal» para volver a empezar. El panel explica: «Tienes un solo canal y el paciente eres tú».
- **Paciente = el mismo estudiante:** en el asistente, el nombre de la ficha es el de su cuenta y **no se puede editar** («El paciente eres tú: solo puedes medirte a ti mismo»). Aunque se manipule la pantalla, el servicio fuerza el nombre de la ficha al de la cuenta. El resto de los datos (fecha de nacimiento, nivel de estrés, sueño, cafeína, medicación, actividad y condición de salud) parten de la ficha que ya tenía guardada y se pueden corregir.
- **Datos guardados con el canal:** igual que antes: ficha cifrada, política y consentimiento quedan ligados al canal y se usan al guardar las mediciones.
- **Detalle de la ronda:** quien quiera ver quién ocupa cada canal lo encuentra en el desplegable «Canales de la ronda» (solo consulta; no repite el botón de agregar).
- **Archivos:** `CanalesPacientesPanel.vue` (modo estudiante), `AgregarCanalModal.vue` (nombre fijo), `VinculacionCanales.vue` (`solo-lectura`), `MedicionView.vue` y `canalesService.js`.
- **Límite:** el nombre «de la cuenta» sale del perfil; si el perfil no tiene nombre, el estudiante lo escribe una vez en la ficha.
