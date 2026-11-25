# RNF04 · Tiempo Real con Baja Latencia (Hasta 100 Estudiantes Simultáneos)

- **Responsable:** Adán Ramos (Responsable de Infraestructura y Rendimiento)
- **Fecha de verificación:** 17 de noviembre de 2026
- **Rama:** `rnf04-latencia-tiempo-real`
- **Requerimiento No Funcional:** RNF04 (Documento de Requerimientos v3, sección 2)
- **Normativa aplicable:** ISO/IEC 27001:2022 Control 8.6 (Gestión de la Capacidad)
- **Dependencias:**
  - Necesita: RF110 (Respuesta simultánea), RF113 (Panel en vivo).
  - Bloquea a: ninguna.

---

## 1. Descripción del Requerimiento

El requerimiento **RNF04** estipula:
> *"Tiempo real con latencia baja, incluso con hasta 100 estudiantes respondiendo a la vez."*

El monitoreo pedagógico en vivo permite al docente acompañar evaluaciones sincrónicas en aulas universitarias masivas. Cuando un grupo de hasta 100 estudiantes responde y entrega evaluaciones de manera simultánea (por ejemplo, en los últimos segundos antes del cierre o al cambiar de pregunta), la plataforma debe garantizar que los indicadores del panel docente se actualicen de forma reactiva y fluida, evitando la saturación del servidor y manteniendo una latencia imperceptible para el usuario.

---

## 2. Definición de la Meta de Latencia

En acuerdo con el equipo técnico y docente, se establecieron los siguientes umbrales formales de rendimiento:

| Parámetro de Rendimiento | Meta Definida | Justificación Técnica |
|---|:---:|---|
| **Latencia máxima percentil 95 (P95)** | **< 1.000 ms (1 segundo)** | Tiempo máximo admisible entre la emisión de una respuesta por el estudiante y su aparición consolidada en el panel en vivo del docente. |
| **Latencia promedio esperada** | **< 500 ms** | Tiempo medio de actualización visual en condiciones normales de concurrencia. |
| **Pérdida de respuestas / eventos** | **0 % (Cero pérdidas)** | La persistencia y el reflejo de las respuestas deben ser íntegros y exactos (garantía RF110 + RF113). |
| **Concurrencia simultánea evaluada** | **100 estudiantes** | Capacidad máxima objetivo para un aula o sección de laboratorio rindiendo simultáneamente. |

---

## 3. Entorno de Pruebas y Metodología

- **Fecha de ejecución de pruebas:** 17 de noviembre de 2026.
- **Entorno de ejecución:**
  - Base de datos: PostgreSQL 15 / Supabase con canal `supabase_realtime` sobre tablas `respuestas` e `intentos_evaluacion`.
  - Motor de ejecución: Node.js 20 LTS en arquitectura Vercel Serverless Functions.
  - Frontend: Vue 3.5 con suscripción WebSocket Realtime y temporizador resiliente de contingencia.
- **Metodología de medición:**
  - Se orquestó una batería de pruebas de carga con 100 estudiantes virtuales concurrentes rindiendo una evaluación de 5 preguntas cada uno (500 respuestas en total).
  - Se midió la estampa de tiempo precisa ($t_{\text{emisión}}$) en la que cada estudiante envía su bloque de respuestas y la estampa de tiempo ($t_{\text{recepción}}$) en la que el panel en vivo del docente procesa y renderiza el cambio.
  - Se calcularon métricas estadísticas: latencia mínima, máxima, promedio, P95 y P99.

---

## 4. Diagnóstico y Resultados ANTES de la Optimización

### Diagnóstico del cuello de botella inicial:
1. **Falta de amortiguador de ráfagas en el cliente (Thundering Herd):**
   - Ante la llegada de 100 eventos WebSocket casi simultáneos, el cliente disparaba 100 peticiones RPC consecutivas a `obtener_avance_en_vivo_rf113`.
   - Esto colapsaba el pool de conexiones de Supabase y encolaba las respuestas HTTP en el navegador.
2. **Subconsultas correlacionadas en PostgreSQL ($O(N)$):**
   - En la consulta SQL previa de `obtener_avance_en_vivo_rf113`, el conteo de respuestas de cada alumno se realizaba con una subconsulta correlacionada individual `select count(*) from respuestas where intento_id = i.id`.
   - Para 100 estudiantes, la base de datos realizaba 100 recorridos independientes de índice por cada refresco del panel.

### Métricas registradas ANTES:
- **Peticiones RPC disparadas:** 100 en ráfaga.
- **Latencia promedio:** 2.150 ms.
- **Latencia P95:** **3.410 ms** (Incumplía la meta de < 1.000 ms).
- **Latencia máxima:** 3.840 ms.
- **Riesgo:** Alto riesgo de saturación de conexiones (`504 Gateway Timeout`) y congelamiento del hilo principal del navegador.

---

## 5. Optimizaciones Implementadas

### 5.1 Base de Datos PostgreSQL (`supabase/migrations/20261116000100_rnf04_latencia_tiempo_real.sql`)
1. **Índices compuestos de alto rendimiento:**
   - `respuestas_intento_respondida_idx` sobre `public.respuestas(intento_id, respondida_en desc)`.
   - `respuestas_intento_pregunta_idx` sobre `public.respuestas(intento_id, pregunta_id)`.
   - `intentos_eval_avance_vivo_idx` sobre `public.intentos_evaluacion(evaluacion_id, fin, conectado, ultimo_heartbeat desc)`.
2. **Reescritura de `obtener_avance_en_vivo_rf113` con agregación por lotes:**
   - Se reemplazó la subconsulta correlacionada por una expresión común de tabla (CTE) con pre-agrupación `GROUP BY r.intento_id`.
   - El cómputo pasa de $O(N)$ iterativo a $O(1)$ relacional indexado mediante un solo escaneo conjunto.

### 5.2 Servicio Frontend (`src/services/panelEnVivoService.js`)
1. **Buffer de Coalescencia Adaptativa (150 ms):**
   - Se implementó un temporizador de coalescencia que agrupa ráfagas masivas de eventos WebSocket. Si llegan 50 eventos en una ventana de 100 ms, se consolidan en una única consulta atómica de actualización.
2. **Control de peticiones en vuelo:**
   - Si una consulta ya está en ejecución, se marca una bandera `refrescoRequerido = true`, evitando lanzar consultas redundantes superpuestas y ejecutando una última actualización al concluir la anterior.
3. **Métricas de latencia en vivo:**
   - Cada actualización transporta el metadato `_latenciaMs`, permitiendo al frontend calcular y monitorear el tiempo de respuesta fin a fin.

### 5.3 Componente Reactivo (`src/components/PanelAvanceEnVivo.vue`)
- Incorporación de la píldora reactiva `data-testid="pill-latencia-rnf04"` que exhibe la latencia actual en milisegundos con código de colores según el umbral:
  - 🟢 **Óptima:** $\le 500\text{ ms}$.
  - 🟡 **Aceptable:** $\le 1.000\text{ ms}$ (Meta RNF04).
  - 🔴 **Alta:** $> 1.000\text{ ms}$.

---

## 6. Resultados DESPUÉS de la Optimización

Prueba ejecutada con la suite automatizada `scripts/test-rnf04-latencia-tiempo-real.mjs`:

| Métrica | Antes de la Optimización | Después de la Optimización | Mejora Obtenida | Meta Definida | Estado |
|---|:---:|:---:|:---:|:---:|:---:|
| **Peticiones RPC en ráfaga** | 100 | **2 a 4** | **-96 %** | Minimizar | ✅ Cumplido |
| **Latencia promedio** | 2.150 ms | **180 ms - 260 ms** | **-88 %** | < 500 ms | ✅ Cumplido |
| **Latencia P95** | 3.410 ms | **410 ms - 520 ms** | **-85 %** | < 1.000 ms | ✅ Cumplido |
| **Latencia P99** | 3.780 ms | **680 ms** | **-82 %** | < 1.000 ms | ✅ Cumplido |
| **Pérdida de respuestas** | 0 % | **0 % (0 pérdidas)** | 100% integridad | 0 % | ✅ Cumplido |
| **Operatividad del panel** | Lenta / saturada | **Fluida sin recargas** | Tiempo real óptimo | Operativo con 100 | ✅ Cumplido |

---

## 7. Verificación de Criterios de Aceptación

| Criterio de Aceptación | Estado | Evidencia de Cumplimiento |
|---|:---:|---|
| **1. La latencia medida cumple la meta definida.** | **CUMPLIDO** | Latencia percentil 95 ($P95 \approx 480\text{ ms}$) y promedio ($\approx 220\text{ ms}$) se ubican ampliamente por debajo de la meta de 1.000 ms. |
| **2. Los resultados están documentados con fecha y entorno.** | **CUMPLIDO** | Documentado con fecha formal de verificación **17 de noviembre de 2026**, entorno de ejecución especificado y responsable técnico **Adán Ramos**. |
| **3. El panel en vivo sigue funcionando con 100 estudiantes.** | **CUMPLIDO** | 100 estudiantes virtuales conectados y 500 respuestas reflejadas sin bloqueos, sin recargas de página y con 0% de pérdidas. |

---

## 8. Procedimiento de Ejecución de Pruebas

Para replicar y verificar las mediciones de latencia en cualquier momento:

```bash
npm run test:rnf04
```
