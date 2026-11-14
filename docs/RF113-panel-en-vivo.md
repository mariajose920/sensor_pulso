# RF113 · Panel en Vivo y Monitoreo de Avance en Tiempo Real

Requerimiento: *Panel que muestra en tiempo real el avance de los estudiantes.*  
Responsable: **Adán**  
Fecha de vencimiento: **12 de noviembre de 2026**  
Rama: `rf113-panel-en-vivo`  
Dependencias:
- **Necesita:** RF109 (Modos de aplicación: en vivo y ventana de fechas).
- **Se prueba junto con:** RF110 (Respuesta simultánea de 100 estudiantes sin pérdidas).
- **Bloquea a:** Nadie.

---

## 1. Alcance y Objetivos de Tiempo Real

El requerimiento **RF113** provee a los docentes de un panel de control interactivo que refleja en vivo y en tiempo real el progreso de los estudiantes mientras rinden una evaluación, eliminando la necesidad de refrescar o recargar la página:

1. **Contador de Respuestas en Tiempo Real:** Visualización instantánea del número total de respuestas registradas en el aula, con cálculo automático del porcentaje de avance global.
2. **Contador de Estudiantes Conectados:** Indicador en vivo de cuántos alumnos se encuentran en el examen rindiendo activamente (`presencia` y `heartbeat`), cuántos entregaron y cuántos aún no inician.
3. **Actualización en Vivo sin Recargar la Página (Criterio de Aceptación):** Transmisión continua mediante Supabase Realtime (`postgres_changes` y `presence`) complementada con sondeo (*polling*) resiliente ante desconexiones de red.
4. **Prueba Conjunta con RF110:** Capacidad comprobada de reflejar ráfagas masivas de hasta **100 estudiantes respondiendo en paralelo** (500 respuestas procesadas), reflejándolas en el panel del docente con 0% pérdida de datos.

---

## 2. Arquitectura de Transmisión en Tiempo Real

```
  [ 100 Estudiantes Rindiendo ]                     [ Docente en AulaDetalleView ]
          │            │                                           ▲
          │ (Heartbeat)│ (Respuestas en bloque)                    │
          ▼            ▼                                           │
  ┌──────────────────────────────────────────────────┐             │
  │     Capa Cliente (MisEvaluacionesView.vue)       │             │
  │  - Heartbeat de presencia periódica (RF113)      │             │
  │  - Envío resiliente con stash local (RF110)      │             │
  └───────────────────────┬──────────────────────────┘             │
                          │                                        │
                          ▼ (RPC / HTTP)                           │
  ┌──────────────────────────────────────────────────┐             │
  │         Motor de Base de Datos PostgreSQL        │             │
  │  - ping_presencia_estudiante_rf113               │             │
  │  - guardar_respuestas_simultaneas_rf110          │             │
  │  - obtener_avance_en_vivo_rf113                  │             │
  └───────────────────────┬──────────────────────────┘             │
                          │ (Eventos CDC / WAL)                    │
                          ▼                                        │
  ┌──────────────────────────────────────────────────┐             │
  │     Supabase Realtime (WebSockets & Presence)    │             │
  │  - Publicación: supabase_realtime                │             │
  │  - Canales: intentos_evaluacion & respuestas     │             │
  └───────────────────────┬──────────────────────────┘             │
                          │ (Actualización instantánea push)       │
                          └────────────────────────────────────────┘
                                           │
                                           ▼
                 ┌───────────────────────────────────────────────────┐
                 │       Componente PanelAvanceEnVivo.vue            │
                 │  - Contador de respuestas en vivo                 │
                 │  - Contador de alumnos conectados                 │
                 │  - Indicador pulsante "● EN VIVO"                 │
                 │  - Tabla filtrable y feed de actividad en vivo    │
                 └───────────────────────────────────────────────────┘
```

---

## 3. Implementación Técnica

### 3.1. Base de Datos PostgreSQL (`supabase/migrations/20261112000100_rf113_panel_en_vivo.sql`)

#### 1. Publicación Realtime para Respuestas e Intentos
```sql
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'respuestas'
    ) then
      alter publication supabase_realtime add table public.respuestas;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'intentos_evaluacion'
    ) then
      alter publication supabase_realtime add table public.intentos_evaluacion;
    end if;
  end if;
end $$;
```

#### 2. Columnas de Presencia y Heartbeat
```sql
alter table public.intentos_evaluacion
  add column if not exists ultimo_heartbeat timestamptz default now(),
  add column if not exists conectado boolean default false;

create index if not exists intentos_eval_heartbeat_idx
  on public.intentos_evaluacion (evaluacion_id, ultimo_heartbeat desc);
```

#### 3. Procedimiento Almacenado de Avance Agregado (`obtener_avance_en_vivo_rf113`)
Retorna de forma atómica:
- `conectados`: Alumnos con intento abierto y heartbeat reciente (< 60 segundos).
- `en_progreso`: Alumnos que han iniciado pero no han finalizado.
- `finalizados`: Alumnos que ya han entregado su evaluación.
- `total_respuestas`: Conteo global de respuestas registradas en `public.respuestas`.
- `porcentaje_avance_global`: Porcentaje relacional de respuestas logradas vs total asignado.
- `estudiantes`: Arreglo JSONB con detalle individual de cada alumno elegible en el aula.

---

### 3.2. Servicio Frontend (`src/services/panelEnVivoService.js`)

- `suscribirAvanceEnVivo(evaluacionId, onUpdate, opciones)`: Se conecta al canal WebSocket de Supabase y escucha eventos de inserción/actualización en `intentos_evaluacion`, `respuestas` y `presence`. Dispone de sondeo de respaldo automático (*polling fallback*) ante caídas de WebSocket.
- `iniciarHeartbeatEstudiante(evaluacionId, intentoId)`: Emite periódicamente señales de presencia desde el navegador del estudiante.
- `desconectarEstudiante(evaluacionId, intentoId)`: Actualiza el estado a desconectado al cerrar o salir de la vista.

---

### 3.3. Componente Reactivo (`src/components/PanelAvanceEnVivo.vue`)

- **Indicador "EN VIVO" con punto pulsante:** Confirma conexión activa al flujo de eventos.
- **KPI Cards en Tiempo Real:**
  - `data-testid="contador-conectados"`: Estudiantes conectados / asignados.
  - `data-testid="contador-respuestas"`: Respuestas guardadas en la base de datos sin pérdidas.
  - `data-testid="porcentaje-avance"`: Avance porcentual con barra animada.
  - Tiempo restante y sincronización horaria.
- **Filtros Dinámicos:** Conectados, En progreso, Entregados y búsqueda por nombre/correo.
- **Feed de Actividad en Vivo:** Registro de novedades en tiempo real con marca de tiempo.

---

### 3.4. Integración en Aulas y Evaluaciones

- **`src/views/AulaDetalleView.vue`:** Botón destacado `⚡ Monitoreo en Vivo` en cada tarjeta de evaluación e inclusión directa del panel reactivo en la vista detallada de la evaluación.
- **`src/views/MisEvaluacionesView.vue`:** Inicia automáticamente el latido de presencia en vivo cuando el alumno abre una evaluación (`iniciarHeartbeatEstudiante`) y lo finaliza al entregar o salir.
- **`src/views/EvaluacionesView.vue`:** Acceso directo mediante enlace `⚡ Monitoreo en Vivo` desde el catálogo de evaluaciones del aula.

---

## 4. Pruebas y Resultados de Rendimiento

Se desarrolló la suite automatizada `scripts/test-rf113-panel-en-vivo.js`, ejecutable mediante:
```bash
npm run test:rf113
```

### Resultados de la Prueba Conjunta con RF110 (100 Estudiantes Simultáneos):
- **Estudiantes simultáneos simulados:** 100 estudiantes conectados en paralelo.
- **Preguntas por estudiante:** 5 preguntas (500 respuestas totales).
- **Ráfaga completada en:** ~3.7 segundos.
- **Eventos en vivo capturados por el panel sin recargar:** 78 eventos.
- **Respuestas reflejadas en el panel del docente:** 500 / 500 respuestas (**100% capturadas, 0 pérdidas**).
- **Estudiantes que entregaron:** 100 / 100 finalizados.
- **Avance global del aula:** 100.0%.

---

## 5. Checklist de Criterios de Aceptación

| Criterio de la Ficha | Estado | Evidencia |
|---|:---:|---|
| Contador de respuestas | Cumplido | KPI card `data-testid="contador-respuestas"` en `PanelAvanceEnVivo.vue` |
| Contador de estudiantes conectados | Cumplido | KPI card `data-testid="contador-conectados"` en `PanelAvanceEnVivo.vue` |
| Actualización en vivo (sin recargar la página) | Cumplido | `suscribirAvanceEnVivo` con WebSockets + sondeo resiliente |
| El profesor ve el avance sin recargar la página | Cumplido | Validado en prueba unitaria de suscripción reactiva |
| Se prueba junto con RF110 | Cumplido | Prueba de carga de 100 estudiantes en paralelo (`test-rf113-panel-en-vivo.js`) |
| Regresión y Build Limpio | Cumplido | Suite RF110, RF69, RF68, RF63 y compilación de producción PWA |
