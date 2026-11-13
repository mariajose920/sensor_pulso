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

## Canal automático del estudiante (sin botones ni 5 canales)
- **Un canal siempre listo, sin elegir:** al entrar a medir, el estudiante ya no ve los 5 canales, ni la ronda, ni botones. Su canal se **asigna solo**, con los datos de su propia ficha: «✓ Tu canal: Canal N · Se te asignó automáticamente, con los datos de tu ficha: el paciente eres tú».
- **Qué usa:** la ficha que ya tiene guardada en la base (paso 2) y el consentimiento aceptado (paso 1). **No guarda ni modifica la ficha**: solo la usa. Si falta la ficha o el consentimiento, el panel lo dice y ofrece «Ir a mi ficha» o «Ir al consentimiento»; si la asignación falla, ofrece «Reintentar».
- **Base de datos:** la asignación ya no convierte la ficha propia en una ficha de sesión (`sesion_id` sigue nulo), así se sigue reconociendo como su ficha de siempre y no se le vuelve a pedir. La constancia queda en `sesion_canal_requisitos`.
- **Límite:** el ESP32 tiene 5 canales físicos. Si ya los ocupan 5 personas a la vez, el sistema avisa «No quedan canales libres» y hay que esperar a que se libere uno (el profesor sigue abriendo la siguiente ronda desde su perfil).

## La ficha del paciente se conserva en la base (todos los roles)
La ficha propia es la misma función para estudiante, profesor y administrador: se guarda cifrada en el servidor (RF116), se carga sola en cada sesión y **solo se modifica con «Modificar»**.
- **Cerrar sesión:** antes de salir se espera a que termine el guardado en curso y se reintenta el pendiente (hasta 8 s). Antes, la copia del dispositivo se borraba al salir aunque el servidor no la hubiera recibido.
- **Pasan los días:** migración `20261113000600_rf03_ficha_propia_persistente.sql`. La retención diaria (RF60) borraba las fichas 365 días después de crearlas, también la propia. Ahora solo borra las fichas ligadas a una sesión o canal; la ficha propia se elimina únicamente si la persona ejerce su derecho de supresión.
- **Requisito del servidor:** para que la ficha llegue a la base, el servidor necesita la clave de cifrado `CLAVE_CIFRADO_CAMPOS` (mínimo 16 caracteres, RF116). Sin ella el servidor se niega a cifrar y la ficha queda solo en el dispositivo. **Debe ser la misma clave que usa Vercel**: lo cifrado con otra clave no se puede leer en producción.

## Por qué la ficha no se guardaba en la base (y cómo se arregla en local)
Causa: el servidor cifra la ficha con `CLAVE_CIFRADO_CAMPOS` (RF116). En el equipo de desarrollo esa variable no existía, así que el servidor respondía 503 («cifrado no disponible»), la ficha quedaba solo en el dispositivo y se borraba al cerrar sesión. Nunca llegaba a la base.

Arreglo:
- Al iniciar `npm run dev`, si falta la clave, se **crea una clave aleatoria y se guarda en `.env.local`** (archivo fuera de git) para que sea la misma en cada arranque (`scripts/claveCifradoLocal.mjs`, usado por `vite.config.js`). Solo ocurre en el servidor de desarrollo: en `build`, en Vercel o con `NODE_ENV=production` nunca se genera nada y, sin clave, el servidor sigue negándose a cifrar.
- **No borres esa clave:** las fichas guardadas desde este equipo solo se pueden leer con ella.
- Si usas la misma base de Supabase que producción, reemplaza esa clave en `.env.local` por la `CLAVE_CIFRADO_CAMPOS` que tiene Vercel; así lo que se guarda desde local también se lee en producción. Lo cifrado con otra clave no se puede leer (el panel de la ficha lo avisa y no pierde otras fichas).
- Después de arreglarlo hay que **reiniciar el servidor y volver a llenar la ficha una vez** (la anterior nunca llegó a la base). Desde entonces se carga sola en cada sesión y solo cambia con «Modificar».
- Pruebas: `node scripts/test-ficha-persistente-local.mjs`.
