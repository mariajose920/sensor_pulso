# RF106 · Tipos de evaluación

Rama: `rf106-tipos-evaluacion` (desde `develop`).

## Qué hace
- El profesor elige el tipo de evaluación: **Preguntas** o **Ejercicio aplicado**.
- En el ejercicio aplicado elige el ejercicio (**medir pulso**, **medir SpO₂** o **comparar señales**) y define el criterio de calificación:

| Ejercicio | Criterio guardado | Límites |
|---|---|---|
| Medir pulso | `bpm_en_rango` con `min` y `max` | 30 a 220 BPM |
| Medir SpO₂ | `spo2_en_rango` con `min` y `max` | 70 a 100 % |
| Comparar señales | `similitud_minima` con `valor` | 1 a 100 % |

- Validaciones: el mínimo debe ser menor que el máximo, los valores deben estar dentro de los límites, y "Preguntas" no guarda ejercicio ni criterio.
- Los valores coinciden con los CHECK de `evaluaciones` y con `calificar_ejercicio` (migración `20261027000500_evaluaciones.sql`). No hace falta migración nueva.

## Archivos
- `src/utils/tiposEvaluacion.js`: constantes, validaciones y armado de los campos a guardar.
- `src/components/TipoEvaluacionForm.vue`: formulario reutilizable (`v-model`), para el RF105.
- `src/components/TipoEvaluacionBadge.vue`: muestra el tipo (modo docente con criterio, modo estudiante con la instrucción).
- `src/services/evaluacionesService.js`: crear, actualizar el tipo (bloqueado si ya hay intentos) y listar.
- `src/views/EvaluacionesView.vue` y ruta `/evaluaciones` (profesor y administrador): pantalla para configurar y ver el tipo.
- `scripts/test-rf106-tipos.mjs`: pruebas (`node scripts/test-rf106-tipos.mjs`).

## Límites
- La calificación automática es del RF107, el modo en vivo o con ventana del RF109 y los niveles del RF112.
- Las preguntas y las evaluaciones precargadas son del RF105; la asignación, del RF104.
- Sin sesión de Supabase (por ejemplo el administrador inicial del RF44) la evaluación se guarda solo en el navegador y la pantalla lo avisa.

## Pendiente de decidir
- Escala de la similitud entre señales: se usa 0 a 100 %. Hay que confirmarla con el análisis de comparación (RF29).
