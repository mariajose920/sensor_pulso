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
