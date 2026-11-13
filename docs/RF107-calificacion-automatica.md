# RF107 · Calificación automática del ejercicio aplicado

Rama: `rf107-calificacion-automatica` (desde `develop`, con RF106 ya unido).

> **RF107:** el ejercicio aplicado se califica de forma automática con un criterio definido por el profesor (por ejemplo, BPM dentro de un rango o similitud mínima con una señal de referencia).

## Qué hace
El estudiante entrega una medición guardada y **el servidor** la califica con el criterio de la evaluación. Nada del cálculo depende del navegador.

| Ejercicio | Criterio | Cumple si… | Valor que se compara |
|---|---|---|---|
| Medir pulso | `bpm_en_rango` | `min` ≤ BPM promedio ≤ `max` | BPM promedio |
| Medir SpO₂ | `spo2_en_rango` | `min` ≤ SpO₂ promedio ≤ `max` | SpO₂ promedio |
| Comparar señales | `similitud_minima` | similitud ≥ `valor` | similitud con la referencia (0 a 100 %) |

### Puntaje parcial
- **Rango:** dentro = 100. Fuera, baja en línea recta con la distancia al borde, relativa al ancho del rango (`100 × (1 − distancia / (max − min))`, mínimo 0). Ejemplo: rango 60 a 100 BPM, pulso 120 → 50.
- **Similitud:** cumple = 100; si no, `100 × similitud / mínimo`. Ejemplo: similitud 50 con mínimo 80 → 62,5.
- El puntaje es el porcentaje del intento; el **nivel** (logrado, medianamente logrado, no logrado) sale de los umbrales de la evaluación (RF112, por defecto 70 % y 40 %).

### Señal de referencia (comparar señales)
El criterio guarda de dónde sale la referencia:
```json
{"tipo":"similitud_minima","valor":75,"referencia":{"origen":"plantilla","id":"<uuid>"}}
```
- `plantilla`: una señal aprobada de `senales_referencia` (usa su `bpm_referencia` y `ritmo`).
- `medicion`: una medición guardada **del propio profesor creador**. Nunca se puede apuntar a datos de otro estudiante (RF117).

### Similitud calculada en el servidor
Las mediciones no guardan la señal cruda, así que la similitud (`similitud_rasgos`) compara rasgos: **BPM (peso 0,60)**, **regularidad (0,25)** y **ritmo (0,15)**. Solo cuentan los rasgos presentes en ambas partes. La diferencia relativa de BPM se duplica: una diferencia de 50 % o más deja ese rasgo en 0. Es una versión simple de la similitud morfológica del RF29; si más adelante se guarda la señal cruda, solo hay que reemplazar esta función.

### Validaciones de la medición
La base rechaza la entrega si la medición:
- no es del estudiante,
- tiene calidad de señal **mala** (RF15),
- es anterior a la apertura de la evaluación (`iniciada_en` en modo en vivo; `abre_en` en ventana de fechas; sin fecha, hasta 1 día antes del intento) o tiene fecha futura,
- no trae el dato que pide el ejercicio (BPM o SpO₂),
- llega con la evaluación cerrada o con todos los intentos usados.

### Retroalimentación
`calificar_ejercicio` devuelve valor obtenido, si cumple, puntaje, nivel, intentos restantes y un **motivo** en español («Tu pulso (120 BPM) está por encima del rango pedido (60 a 100 BPM)»). Se guarda en `intentos_evaluacion.detalle` y la pantalla *Mis evaluaciones* lo muestra.

### Reintentos y recalificación
- `evaluaciones.max_reintentos` (1 a 5, por defecto 1): cuántas veces el estudiante puede entregar una medición. Cada entrega reemplaza el resultado anterior. El profesor lo configura en el formulario del tipo de evaluación.
- `recalificar_intento(p_intento)`: el profesor de la evaluación vuelve a calcular la nota con el criterio y la referencia actuales sobre la medición ya entregada (no vuelve a validar la ventana). Está en *Evaluaciones → Resultados del ejercicio*.

## Cambios en la base de datos
Migración `supabase/migrations/20261113000100_rf107_calificacion_ejercicio.sql` (también agregada a `sensor_pulso_base_de_datos_completa.sql`):
- `evaluaciones.max_reintentos`.
- `intentos_evaluacion`: `valor_obtenido`, `similitud`, `criterio_cumplido`, `detalle`, `calificaciones`, `calificado_en`.
- Funciones: `similitud_rasgos`, `puntaje_rango`, `puntaje_similitud`, `evaluar_ejercicio` (interna, sin acceso para usuarios), `calificar_ejercicio(uuid, uuid)` y `recalificar_intento(uuid)`.
- **Se elimina** `calificar_ejercicio(uuid, uuid, numeric)`: el cliente ya no puede enviar la similitud.

## Archivos
- `src/utils/calificacionEjercicio.js`: espejo en JS de las fórmulas, niveles y mensajes (vista previa y pruebas).
- `src/services/calificacionEjercicioService.js`: entregar, recalificar, resultados y opciones de referencia. Se reexporta desde `evaluacionesService.js`.
- `src/utils/tiposEvaluacion.js`: criterio con referencia, intentos permitidos y `exigirReferencia`.
- `src/components/TipoEvaluacionForm.vue`: elegir la referencia y los intentos.
- `src/views/EvaluacionesView.vue`: resultados por estudiante y botón *Recalificar*.
- `src/views/MisEvaluacionesView.vue`: entrega con el servicio, resultado con nivel y motivo, *Repetir medición*. Se quitó el aviso de que la comparación de señales no estaba disponible.
- `scripts/test-rf107-calificacion.mjs`: pruebas (`npm run test:rf107`).

## Límites y decisiones
- Las evaluaciones precargadas de comparación (RF105) no traen referencia: al duplicarlas el profesor debe elegirla antes de que los estudiantes rindan; si no, la entrega falla con «La evaluación no tiene señal de referencia definida». La descripción del criterio avisa «falta elegir la señal de referencia».
- Con tipo ejercicio aplicado, la nota del ejercicio reemplaza el puntaje de las preguntas de apoyo (comportamiento ya existente en la función).
- La migración no se puede probar contra una base en este entorno: las fórmulas SQL se validan por su espejo JS y por pruebas de contenido de la migración. Falta ejecutarla en Supabase y probar el flujo de punta a punta.

## Evaluación mixta: preguntas + uno o más ejercicios aplicados
Nuevo tipo `mixta` (migración `20261113000200_rf107_evaluacion_mixta.sql`, también en la base completa).

- **Qué es:** una misma evaluación con preguntas y de 1 a 10 ejercicios aplicados, cada uno con su criterio, su referencia (si compara señales) y su puntaje (por defecto 20 puntos). Las preguntas siguen valiendo su propio puntaje.
- **Datos:** `evaluacion_ejercicios` (los ejercicios de la evaluación, con RLS: el profesor los gestiona y el estudiante los lee solo si la evaluación le está asignada y abierta) e `intento_ejercicios` (resultado de cada ejercicio por intento: puntos, valor, motivo, intentos usados).
- **Puntaje:** un trigger (`intento_a_total_mixta`) recalcula siempre el total del intento = puntos de las preguntas + puntos de los ejercicios, y el máximo posible. Corre antes de `intento_nivel`, así que el nivel (RF112) sale del total. Sirve también para la entrega simultánea del RF110 sin tocar sus funciones.
- **Cada ejercicio:** puntos = porcentaje del ejercicio (misma fórmula parcial de arriba) × puntaje del ejercicio. `calificar_ejercicio_mixto(intento, ejercicio, medición)` valida lo mismo que el ejercicio simple y limita los intentos **por ejercicio** (`max_reintentos`).
- **Profesor:** el formulario del tipo permite agregar y quitar ejercicios, con editor propio (`EjercicioCriterioEditor.vue`) y su puntaje. En *Resultados del ejercicio* ve el total y el detalle por ejercicio; «Recalificar» vuelve a calcular todos los ejercicios.
- **Estudiante:** en *Mis evaluaciones* ve las preguntas y, debajo, cada ejercicio con su selector de medición y su botón «Calificar», con el resultado al instante. Debe calificar todos los ejercicios antes de entregar. Esa regla se aplica en la pantalla; la base solo suma lo que esté calificado.
- **Límite:** la evaluación mixta no tiene plantilla precargada.

## Crear aula desde la creación de una evaluación
- En *Evaluaciones* hay un botón **«Crear aula»** (junto al selector de aula, y en el aviso cuando aún no hay aulas).
- Al pulsarlo se guarda un borrador de lo escrito (título, descripción, tipo, ejercicios y preguntas) en la pestaña (`sessionStorage`) y se va a *Aulas* con el formulario de crear aula ya abierto.
- Al terminar, *Aulas* muestra «Aula creada» y el botón **«Volver a la creación de la evaluación»**. Ese botón también aparece mientras se crea el aula, por si se cambia de idea.
- *Evaluaciones* vuelve con el aula nueva elegida y el borrador recuperado. Si no hay borrador, igual avisa y deja seguir.
- Archivos: `EvaluacionesView.vue` (borrador y botón) y `AulasView.vue` (parámetros `crear` y `volver`, y botón de regreso).

## Resultado y correcciones al entregar
Al entregar (y después, con «Ver correcciones» en el listado), el estudiante ve su calificación automática. Migración `20261113000300_rf107_resultado_evaluacion.sql` (también en la base completa) y util `src/utils/correccionEvaluacion.js`.

- **Resumen:** porcentaje logrado, puntos obtenidos de los posibles, barra y el **nivel** (logrado, medianamente logrado o no logrado) con una frase que lo explica con los umbrales de la evaluación (RF112, por defecto 70 % y 40 %). Cuenta además las preguntas correctas, incorrectas, por revisar y sin responder.
- **Cada pregunta:** su estado (✓ correcta, ✗ incorrecta, ⏳ pendiente de revisión o sin responder), los puntos obtenidos, **su respuesta**, la **respuesta correcta** cuando falló (alternativa con su texto, verdadero/falso en palabras, o número con su tolerancia) y la **explicación** si la pregunta la tiene. Las preguntas abiertas las revisa el profesor: no suman puntos hasta entonces.
- **Cada ejercicio aplicado:** si cumple, cumple parcialmente o no cumple el criterio, los puntos (o el porcentaje en el ejercicio simple) y el motivo («Tu pulso (120 BPM) está por encima del rango pedido…»).
- **Seguridad de la clave:** las claves siguen sin ser legibles para el estudiante. Solo la función `resultado_evaluacion(intento)` las devuelve, y únicamente al **dueño del intento** y **después de entregarlo**. Hasta entonces no hay correcciones.
- **Sin conexión:** si la entrega quedó en cola (RF110), se avisa y el resultado se puede ver cuando se envíe.
- **Límite:** apenas se entrega, se ven las respuestas correctas. Si el profesor no quiere que se vean mientras otros estudiantes aún no rinden la evaluación, habría que ocultarlas hasta el cierre. Se puede agregar como opción de la evaluación.

## Cambiar el tipo de una evaluación ya creada
- En *Evaluaciones*, cada evaluación guardada tiene **«✏️ Cambiar tipo»**. Abre el mismo formulario del tipo y permite dejarla como **solo preguntas**, **solo ejercicio aplicado** o **ambas** (preguntas + ejercicios), con su criterio, referencia, puntajes e intentos. Al guardar se reemplazan sus ejercicios.
- Si ya tiene intentos de estudiantes, el tipo queda bloqueado (cambiarlo alteraría notas ya puestas). Para tipos con preguntas (solo preguntas o ambas), la evaluación debe tener preguntas; si no, se avisa.
- Al cargar una **plantilla precargada** en el formulario también se respeta su tipo. Las plantillas que traen preguntas y un ejercicio (pulso, SpO₂ y comparación de señales) ahora son de tipo **mixta**, y se pueden cambiar a solo preguntas o solo ejercicio antes de guardar.

## Error «La base rechazó el tipo o el criterio de la evaluación»
Casi siempre significa que **la base de Supabase no tiene aplicadas las migraciones de RF107** (la restricción del tipo no conoce «mixta»). Ahora el mensaje lo dice y nombra la migración que falta. Solución: en Supabase → SQL Editor, ejecutar `supabase/rf107_aplicar_en_supabase.sql` (junta las tres migraciones) o los tres archivos de `supabase/migrations/` en orden (\`20261113000100\`, \`20261113000200\`, \`20261113000300\`). Al crear una evaluación mixta, si falla guardar sus ejercicios, la evaluación creada se elimina para no dejarla a medias.
