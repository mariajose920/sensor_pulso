# RF43 — Avance docente

En **Aulas → Evaluaciones → Ver Desempeño**, el profesor titular puede consultar quién entregó, su puntaje y su nivel. En **Monitoreo de Avance en Tiempo Real**, el selector **Toda el aula / Curso** filtra los estudiantes asignados a la evaluación y resume las entregas y los pendientes. El panel usa las actualizaciones de RF113 para recibir cambios sin recargar.

## Comprobaciones

- **Desempeño.** En la prueba con una entrega real, el panel mostró cinco respuestas, un puntaje de 60 % y el nivel «Medianamente logrado».
- **Monitoreo.** Después de aplicar la migración de RF113 en Supabase, se dejó abierto el panel con un curso seleccionado y se entregó una evaluación de preguntas desde la sesión del estudiante. Se confirmó que el avance se actualizó sin pulsar **Refrescar**.
- **Acceso.** Se revisó el control de titularidad en el detalle del aula y en la función de avance de Supabase. Ambos restringen el acceso al profesor titular o a un administrador.
