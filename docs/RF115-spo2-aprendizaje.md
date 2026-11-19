# RF115 · Saturación de oxígeno medida en el apartado de aprendizaje

**Requerimiento:** el apartado de aprendizaje muestra la saturación de oxígeno medida.
**Se relaciona con:** RF38 (apartado de aprendizaje: qué es la SpO₂, cómo se mide y su valor medido), RF114 (medir SpO₂ con el MAX30102), RF15 y RF16 (calidad de la señal), RF30 (historial) y RF75 (aviso educativo).

## Qué había y qué faltaba

Ya existía una tarjeta de «SpO₂ medida», pero solo dentro de la lección de SpO₂ y con dos errores:

1. **Contaba mediciones que no son medidas de la persona.** Tomaba la última con SpO₂ sin mirar su origen, así que una señal simulada, un CSV, un conjunto de datos o una señal de referencia podían aparecer como «tu saturación medida».
2. **No miraba la calidad de la señal.** Una lectura de mala calidad se mostraba con el mismo color y estado que una buena (por ejemplo «Normal»), solo con una línea aparte.

Además, el inicio del apartado de aprendizaje no mostraba el valor, y la tarjeta no ayudaba a *aprender*: no situaba el valor en una escala, no comparaba con la medición anterior ni explicaba cómo se calculó.

## Qué se hizo

| Punto | Qué ocurre ahora |
|---|---|
| Qué cuenta como «medida» | Solo las mediciones hechas con el **sensor** y con una SpO₂ válida |
| Cuál se muestra | La más reciente con **señal confiable**; si una más nueva tuvo mala calidad, se avisa y se muestra la anterior |
| Solo hay lecturas malas | Se muestra la más reciente marcada «Lectura poco confiable», sin color de «normal», y con el consejo de repetir |
| Dónde se ve | **Inicio del apartado** (resumen con enlace) y **lección de SpO₂** (tarjeta completa) |
| Escala visual | Barra de 80 a 100 % con las cuatro zonas de la plataforma (normal, hipoxia leve, moderada, severa) y un marcador con el valor |
| Cambio | «Subió/Bajó X puntos respecto a tu medición anterior» (compara con la anterior confiable) |
| Cómo se calculó | Desplegable: `SpO₂ ≈ 110 − 25 × R` con la razón R de su medición; avisa si el valor está en el límite del sensor (70 % o 100 %) |
| Últimas mediciones | Las últimas 5 del sensor, con su estado, y enlace a «Mi evolución» |
| Estados | Sin sesión, cargando, error (con «Reintentar»), sin mediciones con sensor y sin conexión |
| Sin conexión | Se usa la copia guardada en el dispositivo y se avisa; ahora esa copia guarda también el origen de la medición (no es un dato personal) |
| Aviso | «Valor orientativo con fines educativos: no es un diagnóstico ni reemplaza un oxímetro clínico» |

## Archivos

- `src/utils/spo2Aprendizaje.js` (reglas puras: qué se muestra, escala, cambio, cálculo)
- `src/composables/spo2MedidaEstado.js` (estado y carga, con protección ante respuestas desordenadas) y `useSpo2Medida.js` (conexión con sesión e historial)
- `src/components/Spo2MedidaLeccion.vue` (tarjeta completa), `Spo2MedidaResumen.vue` (inicio del apartado), `EscalaSpo2.vue`
- `src/views/AprendizajeView.vue`, `src/data/lecciones.js`
- `src/pwa/medicionesOffline.js`, `src/services/medicionesService.js` (guardar el origen en la copia sin conexión)
- `scripts/test-rf115-spo2-aprendizaje.mjs` → `npm run test:rf115`

No hay migración de base de datos.

## Criterios de aceptación

1. Con sesión y una medición con el sensor, el inicio del apartado y la lección de SpO₂ muestran el valor medido y su estado.
2. Una medición simulada, de CSV, de dataset o de referencia no se muestra como medida.
3. Si la medición más reciente tuvo mala calidad, no se presenta como confiable.
4. La escala, el cambio y el cálculo usan los mismos umbrales y la misma curva que el resto de la plataforma.
5. Sin sesión, sin mediciones, con error o sin conexión, el apartado lo dice con claridad.

## Límites

- Se muestra la medición propia de la persona (las mediciones de varios canales del mismo usuario cuentan por separado, ordenadas por fecha).
- El valor es el promedio de la medición, no una lectura en vivo; la lectura en vivo está en la pantalla de Medición.
- Las copias guardadas en el dispositivo antes de este cambio no traen el origen; se aceptan solo sin conexión y se avisa.
