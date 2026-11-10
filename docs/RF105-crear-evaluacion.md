# RF105 · Crear evaluación o usar precargada

Rama: `rf105-crear-evaluacion` (desde `develop`).

## Qué hace
- El profesor crea evaluaciones para sus aulas virtuales desde cero o utilizando plantillas oficiales precargadas.
- Permite configurar el título, descripción, tipo (preguntas o ejercicio aplicado, integrando RF106) y preguntas con alternativas y puntajes.
- Se siembran 4 evaluaciones precargadas oficiales:
  1. **Medición de Pulso y Ritmo Cardíaco en Reposo** (Ejercicio aplicado: `medir_pulso`, criterio `bpm_en_rango` 60 a 100 BPM, con preguntas teóricas de soporte).
  2. **Saturación de Oxígeno (SpO₂) y Detección de Hipoxia** (Ejercicio aplicado: `medir_spo2`, criterio `spo2_en_rango` 95 a 100 %, con preguntas de soporte).
  3. **Control Teórico: Ciberseguridad y Privacidad en IoT Médico** (Preguntas teóricas sobre normativas Ley 19.628 / 20.584, TLS 1.3 y RLS).
  4. **Control Práctico: Morfología y Comparación de Señales PPG** (Ejercicio aplicado: `comparar_senales`, criterio `similitud_minima` 75 %).
- Permite duplicar cualquier evaluación existente o precargada con un solo clic asignándola al aula seleccionada.

## Criterios de aceptación
- **Se guarda la evaluación con su tipo:** persiste en la tabla `public.evaluaciones` con tipo, ejercicio, criterio y sus preguntas asociadas.
- **Se puede crear desde cero o desde una precargada:** el profesor puede diseñar una evaluación manual o cargar una plantilla y personalizarla.
- **Seguridad y RLS:** las tablas `evaluaciones`, `preguntas` y `evaluacion_preguntas` cuentan con Row Level Security (RLS) habilitado en la migración oficial `20261027000500_evaluaciones.sql`.

## Archivos
- `src/services/evaluacionesService.js`: sembrado de plantillas precargadas, guardado con preguntas, listado y duplicación.
- `src/views/EvaluacionesView.vue`: interfaz con pestañas para crear desde cero o elegir precargadas, editor interactivo de preguntas y botón duplicar.
- `scripts/test-rf105-crear-evaluacion.mjs`: pruebas automatizadas del requerimiento (`node scripts/test-rf105-crear-evaluacion.mjs`).
