# RF104 · Asignar evaluación al aula, curso o estudiante

Rama: `rf104-asignar-evaluacion` (desde `develop`).

## Qué hace
- El profesor asigna una evaluación disponible a los estudiantes de su aula virtual mediante tres alcances (`alcance`):
  1. **Toda el aula (`aula`):** visible y habilitada para todos los estudiantes activos inscritos en el aula (`curso_id = null`, `usuario_id = null`).
  2. **Por curso o sección (`curso`):** visible únicamente para los estudiantes que forman parte de la sección o curso especificado (`curso_id = uuid`, `usuario_id = null`).
  3. **Estudiantes concretos (`estudiante`):** visible únicamente para los estudiantes específicos seleccionados por el docente (`usuario_id = uuid`, `curso_id = null`).
- Interfaz en la página del aula (`src/views/AulaDetalleView.vue`), dentro de la pestaña de Evaluaciones, con:
  - Botón **"🎯 Asignar Evaluación"** en el encabezado y en cada tarjeta de evaluación.
  - Modal interactivo con selector de alcance (radio buttons y selectores dinámicos).
  - Insignia de estado de asignación en cada tarjeta de evaluación (`Toda el Aula`, `Curso: X`, `N Estudiantes`, `Sin asignar`).
  - Filtro de visibilidad por rol: el estudiante ve **únicamente** las evaluaciones que le corresponden.

## Criterios de aceptación
1. **Las tres modalidades funcionan:** se persiste correctamente en la tabla `public.evaluacion_asignaciones` de Supabase con los campos correspondientes a las reglas CHECK de la base de datos.
2. **El estudiante ve solo las evaluaciones que le corresponden:**
   - La función PostgreSQL `public.evaluacion_asignada_a_mi(evaluacion_id)` y la política RLS `evaluaciones_ver` garantizan aislamiento estricto en la base de datos.
   - En el frontend, el listado del estudiante aplica el filtro reactivo sobre el alcance y secciones asignadas.

## Archivos modificados y creados
- `src/services/evaluacionesService.js`: funciones `asignarEvaluacion`, `obtenerAsignacionesEvaluacion`, `obtenerAsignacionesAula`.
- `src/services/aulasService.js`: vinculación de asignaciones en `obtenerEvaluacionesAula`.
- `src/views/AulaDetalleView.vue`: botón y modal de asignación RF104, badges de alcance y filtro para estudiantes.
- `scripts/test-rf104-asignar.mjs`: pruebas automatizadas de validación y aislamiento de las tres modalidades.
