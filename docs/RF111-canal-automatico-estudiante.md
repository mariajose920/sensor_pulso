# RF111 · El estudiante recibe su canal automáticamente

Rama: `rf111-canal-automatico-estudiante` (desde `develop`).

## Qué cambia
Antes, el estudiante veía los 5 canales y debía pulsar «Tomar este Canal» en uno libre. Ahora funciona igual que en el perfil del profesor y del administrador: **un botón y el sistema asigna solo**.

- **Botón «➕ Asignarme un canal»:** asigna el **siguiente canal libre** (el de número más bajo). El estudiante no elige el número.
- **Un solo canal por estudiante:** con canal asignado, el bloque muestra «Tu canal: Canal N» y el botón desaparece. «Liberar mi canal» sigue disponible para pedir otro.
- **Sin canales libres:** el botón se desactiva y explica que hay que esperar a que el profesor abra la siguiente ronda.
- **Carrera entre estudiantes:** si otro estudiante toma ese canal justo antes (la base responde que ya no está libre), se actualiza la lista y se prueba con el siguiente libre, hasta 5 intentos. Sin conexión a la base se asigna en memoria con la misma regla.
- **Consentimiento (RF04):** si hace falta, se pide el consentimiento informado antes de asignar, como antes.
- **Lista de canales:** como en el perfil del profesor, solo se muestran los canales ya tomados; los libres no se listan. Se quitó el botón «Tomar este Canal» de cada canal.
- **Control de rondas:** el recuadro «Modo Ronda de Aula» con «Abrir Siguiente Ronda de 5 Estudiantes» ahora solo lo ven el profesor y el administrador (antes también lo veía el estudiante).

## Archivos
- `src/utils/canalesMultiples.js`: `evaluarAsignacionEstudiante` (estado del botón).
- `src/services/canalesService.js`: `asignarmeCanalAutomatico` y `estadoAsignacionEstudiante`.
- `src/components/VinculacionCanales.vue`: bloque del estudiante, lista de canales tomados y control de rondas solo docente.
- `scripts/test-rf111-canal-automatico-estudiante.mjs` (`npm run test:rf111-estudiante`).

## Límites
- No hay cambios de base de datos: usa la función `elegir_canal` que ya existía, que toma el canal de forma atómica.
- La asignación en memoria (sin sesión real de Supabase) es de prueba y no se comparte entre dispositivos.
