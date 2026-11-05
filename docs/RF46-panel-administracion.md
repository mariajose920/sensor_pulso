# RF46 · Panel de administración: rangos, sincronización y contenidos

**Requerimiento:** el administrador modifica los rangos, el método de sincronización y los contenidos precargados. Los profesores con permiso (RF98) proponen cambios y el administrador los aprueba antes de que apliquen a toda la plataforma.
**Responsable:** María José.

## Qué hace
En `/admin` (solo administrador) hay cuatro secciones de configuración:
- **Rangos de BPM y SpO₂** (ya existía por RF19): el administrador edita; las propuestas de rango se aprueban allí.
- **Método de sincronización** (`MetodoSincronizacionPanel.vue`): elige entre correlación cruzada, alineación por picos y DTW. Cambia para toda la plataforma.
- **Contenidos precargados** (`ContenidosPanel.vue`): edita título, resumen, categoría, minutos y bloques de cada lección del apartado de aprendizaje. Se publica de inmediato.
- **Propuestas de profesores** (`PropuestasPanel.vue`): lista las propuestas pendientes de método de sincronización y de lecciones, con **Aprobar** / **Rechazar**.

El profesor con el permiso **editar contenidos** (RF98) entra a `/contenidos`, donde propone cambios de lecciones y de método (con motivo obligatorio) y ve el estado de sus propuestas. Sin el permiso no puede proponer (lo valida la pantalla y la RLS `propuestas_crear`).

El apartado de aprendizaje (`/aprendizaje`) muestra las lecciones precargadas **más** los cambios aprobados; si la base no responde, muestra las precargadas (RNF03).

## Base de datos
Migración `supabase/migrations/20261105000100_panel_administracion.sql`:
- `resolver_propuesta` ahora identifica las lecciones por `slug` (crea o actualiza la fila) y valida que el método de sincronización esté en `metodos_sincronizacion_disponibles`. Solo el administrador puede ejecutarla.
- Triggers que dejan en `auditoria` (`cambio_config`) cada cambio de `config_plataforma` y de `lecciones`. Las aprobaciones ya quedaban como `resolver_propuesta`.

## Archivos
- `src/utils/panelAdmin.js` — validación y combinación de lecciones, métodos, descripción de propuestas (lógica pura).
- `src/services/panelAdminService.js` — acceso a Supabase.
- `scripts/test-rf46-panel.mjs` — prueba: `node scripts/test-rf46-panel.mjs`.

## Pendiente
- Aplicar la migración en el proyecto de Supabase.
- El método elegido queda guardado en `config_plataforma`; el comparador de señales aún no lo consume.
- El editor de bloques de lección es JSON; un editor visual queda para después.
