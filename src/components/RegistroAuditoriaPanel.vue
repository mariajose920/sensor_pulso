<template>
  <section class="auditoria-panel" aria-labelledby="titulo-registro-auditoria">
    <div class="auditoria-header">
      <div class="auditoria-title-group">
        <div class="auditoria-title-row">
          <h2 id="titulo-registro-auditoria" class="section-title">
            Registro General de Auditoría del Sistema
          </h2>
          <span class="inmutable-badge" title="Protegido por reglas de base de datos contra edición y borrado">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
              <polyline points="9 12 11 14 15 10" />
            </svg>
            Registro Inmutable Activo
          </span>
        </div>
        <p class="section-desc">
          Trazabilidad inmutable de eventos críticos de seguridad y operación (solo lectura, protegido contra edición y borrado).
        </p>
      </div>

      <button
        type="button"
        class="btn btn-secondary btn-sm btn-refresh"
        :disabled="cargando"
        @click="cargarEventos"
      >
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <polyline points="23 4 23 10 17 10" />
          <polyline points="1 20 1 14 7 14" />
          <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
        </svg>
        {{ cargando ? 'Actualizando...' : 'Actualizar Registro' }}
      </button>
    </div>

    <!-- Barra de filtros por categoría y búsqueda -->
    <div class="auditoria-toolbar">
      <div class="categorias-pills" role="tablist" aria-label="Filtrar eventos por categoría">
        <button
          v-for="cat in CATEGORIAS_AUDITORIA"
          :key="cat.id"
          type="button"
          role="tab"
          :aria-selected="categoriaActiva === cat.id"
          class="cat-pill"
          :class="[`cat-pill--${cat.id}`, { 'cat-pill--activa': categoriaActiva === cat.id }]"
          @click="categoriaActiva = cat.id"
        >
          <!-- Icono SVG según categoría -->
          <svg v-if="cat.id === 'todos'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <line x1="8" y1="6" x2="21" y2="6" />
            <line x1="8" y1="12" x2="21" y2="12" />
            <line x1="8" y1="18" x2="21" y2="18" />
            <line x1="3" y1="6" x2="3.01" y2="6" />
            <line x1="3" y1="12" x2="3.01" y2="12" />
            <line x1="3" y1="18" x2="3.01" y2="18" />
          </svg>
          <svg v-else-if="cat.id === 'login'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
          </svg>
          <svg v-else-if="cat.id === 'cambio_rol'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7" r="4" />
            <polyline points="17 11 19 13 23 9" />
          </svg>
          <svg v-else-if="cat.id === 'cambio_rangos'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
          </svg>
          <svg v-else-if="cat.id === 'descarga'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
            <polyline points="7 10 12 15 17 10" />
            <line x1="12" y1="15" x2="12" y2="3" />
          </svg>
          <svg v-else-if="cat.id === 'publicacion'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="2" y1="12" x2="22" y2="12" />
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
          </svg>
          <svg v-else-if="cat.id === 'eliminacion'" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <polyline points="3 6 5 6 21 6" />
            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
          </svg>

          <span>{{ cat.etiqueta }}</span>
          <span class="cat-count">{{ conteos[cat.id] || 0 }}</span>
        </button>
      </div>

      <div class="auditoria-search">
        <svg class="search-icon" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
        <input
          v-model="busqueda"
          type="search"
          class="form-input search-input"
          placeholder="Buscar por usuario, correo, acción o entidad..."
          aria-label="Buscar en el registro de auditoría"
        />
      </div>
    </div>

    <!-- Estado de carga / vacío -->
    <div v-if="cargando && eventos.length === 0" class="loading-state">
      Cargando eventos del registro inmutable de auditoría...
    </div>

    <div v-else-if="eventosFiltrados.length === 0" class="empty-state">
      No se encontraron eventos auditados que coincidan con el filtro seleccionado.
    </div>

    <!-- Tabla de Eventos Auditados -->
    <div v-else class="table-responsive">
      <table class="auditoria-general-table">
        <colgroup>
          <col class="col-w-fecha" />
          <col class="col-w-categoria" />
          <col class="col-w-actor" />
          <col class="col-w-entidad" />
          <col class="col-w-detalle" />
        </colgroup>
        <thead>
          <tr>
            <th>Fecha y Hora</th>
            <th>Categoría / Acción</th>
            <th>Usuario / Actor</th>
            <th>Entidad Afectada</th>
            <th>Detalle Técnico Registrado</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="ev in eventosFiltrados" :key="ev.id">
            <td class="col-fecha">
              <div class="fecha-badge">
                <span class="fecha-dia">{{ separarFechaHora(ev.ocurrioEn).fecha }}</span>
                <span class="fecha-hora">{{ separarFechaHora(ev.ocurrioEn).hora }}</span>
              </div>
            </td>
            <td class="col-categoria">
              <span class="cat-badge" :class="claseBadgeAccion(ev)">
                {{ ev.etiquetaAccion }}
              </span>
            </td>
            <td class="col-actor">
              <strong class="actor-nombre">{{ ev.actorNombre }}</strong>
              <div v-if="ev.actorCorreo" class="actor-correo">
                <code>{{ ev.actorCorreo }}</code>
              </div>
            </td>
            <td class="col-entidad">
              <span class="entidad-pill">{{ ev.entidadNombre }}</span>
            </td>
            <td class="col-detalle">
              <div class="detalle-box" :class="`detalle-box--${ev.categoria}`">
                <span class="detalle-resumen">{{ formatearResumen(ev.resumen) }}</span>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="auditoria-footer">
      <span class="auditoria-footer-note">
        Mostrando <strong>{{ eventosFiltrados.length }}</strong> de <strong>{{ eventos.length }}</strong> eventos registrados · Solo lectura (sin permisos de edición ni eliminación).
      </span>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import {
  CATEGORIAS_AUDITORIA,
  listarEventosAuditoria,
  filtrarEventosAuditoria,
  contarPorCategoria
} from '../services/auditoriaService.js'

const eventos = ref([])
const cargando = ref(false)
const categoriaActiva = ref('todos')
const busqueda = ref('')

const conteos = computed(() => contarPorCategoria(eventos.value))

const eventosFiltrados = computed(() =>
  filtrarEventosAuditoria(eventos.value, {
    categoria: categoriaActiva.value,
    busqueda: busqueda.value
  })
)

function claseBadgeAccion(ev) {
  if (ev.accion === 'login_fallido' || ev.accion === 'bloqueo_cuenta') {
    return 'cat-badge--alerta'
  }
  return `cat-badge--${ev.categoria}`
}

function separarFechaHora(isoStr) {
  if (!isoStr) return { fecha: '—', hora: '' }
  try {
    const fechaObj = new Date(isoStr)
    const yyyy = fechaObj.getFullYear()
    const mm = String(fechaObj.getMonth() + 1).padStart(2, '0')
    const dd = String(fechaObj.getDate()).padStart(2, '0')
    const hh = String(fechaObj.getHours()).padStart(2, '0')
    const mi = String(fechaObj.getMinutes()).padStart(2, '0')
    const ss = String(fechaObj.getSeconds()).padStart(2, '0')
    return {
      fecha: `${yyyy}-${mm}-${dd}`,
      hora: `${hh}:${mi}:${ss}`
    }
  } catch {
    return { fecha: String(isoStr), hora: '' }
  }
}

function formatearResumen(texto) {
  if (!texto) return '—'
  return String(texto).replace(/\s*->\s*/g, ' → ')
}

async function cargarEventos() {
  cargando.value = true
  try {
    eventos.value = await listarEventosAuditoria({ limite: 200 })
  } finally {
    cargando.value = false
  }
}

function alActualizarAuditoria() {
  cargarEventos()
}

onMounted(() => {
  cargarEventos()
  if (typeof window !== 'undefined') {
    window.addEventListener('auditoria-actualizada', alActualizarAuditoria)
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('auditoria-actualizada', alActualizarAuditoria)
  }
})

defineExpose({ cargarEventos })
</script>

<style scoped>
.auditoria-panel {
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 0.75rem;
  padding: 1.35rem;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}

.auditoria-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.15rem;
}

.auditoria-title-group {
  flex: 1;
  min-width: 260px;
}

.auditoria-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  margin-bottom: 0.3rem;
}

.section-title {
  font-size: 1.18rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.section-desc {
  font-size: 0.875rem;
  color: var(--color-muted, #64748b);
  margin: 0;
}

.inmutable-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.38rem;
  background: #ecfdf5;
  color: #047857;
  border: 1px solid #a7f3d0;
  font-size: 0.76rem;
  font-weight: 700;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
  letter-spacing: 0.01em;
}

.btn-refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  white-space: nowrap;
}

.auditoria-toolbar {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-bottom: 1.1rem;
  padding: 0.85rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.65rem;
}

.categorias-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.cat-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.72rem;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cat-pill:hover {
  border-color: #94a3b8;
  background: #f1f5f9;
}

.cat-pill--activa {
  background: #003366;
  color: #ffffff;
  border-color: #003366;
  box-shadow: 0 2px 6px rgba(0, 51, 102, 0.2);
}

.cat-pill--activa:hover {
  background: #00264d;
  border-color: #00264d;
}

.cat-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.35rem;
  height: 1.2rem;
  padding: 0 0.35rem;
  border-radius: 999px;
  font-size: 0.72rem;
  font-weight: 700;
  background: #e2e8f0;
  color: #1e293b;
}

.cat-pill--activa .cat-count {
  background: rgba(255, 255, 255, 0.22);
  color: #ffffff;
}

.auditoria-search {
  position: relative;
  width: 100%;
}

.search-icon {
  position: absolute;
  left: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: #64748b;
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding-left: 2.3rem !important;
  background: #ffffff;
  font-size: 0.875rem;
}

.table-responsive {
  overflow-x: auto;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
}

.auditoria-general-table {
  width: 100%;
  table-layout: fixed;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.col-w-fecha {
  width: 13%;
}

.col-w-categoria {
  width: 15%;
}

.col-w-actor {
  width: 20%;
}

.col-w-entidad {
  width: 18%;
}

.col-w-detalle {
  width: 34%;
}

.auditoria-general-table th,
.auditoria-general-table td {
  padding: 0.75rem 0.65rem;
  border-bottom: 1px solid #e2e8f0;
  text-align: left;
  vertical-align: middle;
}

.auditoria-general-table th {
  background: #f8fafc;
  color: #475569;
  font-weight: 700;
  font-size: 0.74rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  line-height: 1.3;
}

.auditoria-general-table tbody tr:hover {
  background: #f8fafc;
}

.auditoria-general-table tbody tr:last-child td {
  border-bottom: none;
}

.fecha-badge {
  display: inline-flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.1rem;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background: #f1f5f9;
  color: #334155;
  padding: 0.28rem 0.5rem;
  border-radius: 0.35rem;
  border: 1px solid #e2e8f0;
  line-height: 1.2;
}

.fecha-dia {
  font-size: 0.76rem;
  font-weight: 700;
  color: #1e293b;
}

.fecha-hora {
  font-size: 0.72rem;
  color: #64748b;
}

.cat-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.26rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.25;
}

.cat-badge--login {
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.cat-badge--cambio_rol {
  background: #f3e8ff;
  color: #6d28d9;
  border: 1px solid #ddd6fe;
}

.cat-badge--cambio_rangos {
  background: #ccfbf1;
  color: #0f766e;
  border: 1px solid #99f6e4;
}

.cat-badge--descarga {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
}

.cat-badge--publicacion {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #bbf7d0;
}

.cat-badge--eliminacion,
.cat-badge--alerta {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.actor-nombre {
  color: #0f172a;
  font-weight: 600;
  display: block;
  word-break: break-word;
}

.actor-correo {
  font-size: 0.73rem;
  color: #64748b;
  margin-top: 0.12rem;
  word-break: break-all;
}

.entidad-pill {
  display: inline-block;
  font-size: 0.78rem;
  font-weight: 600;
  color: #1e293b;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 0.28rem 0.55rem;
  border-radius: 0.38rem;
  line-height: 1.35;
  word-break: break-word;
}

.detalle-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 3px solid #94a3b8;
  border-radius: 0.4rem;
  padding: 0.42rem 0.65rem;
}

.detalle-box--login {
  border-left-color: #0284c7;
}

.detalle-box--cambio_rol {
  border-left-color: #7c3aed;
}

.detalle-box--cambio_rangos {
  border-left-color: #0d9488;
}

.detalle-box--descarga {
  border-left-color: #d97706;
}

.detalle-box--publicacion {
  border-left-color: #16a34a;
}

.detalle-box--eliminacion {
  border-left-color: #dc2626;
}

.detalle-resumen {
  display: block;
  color: #1e293b;
  font-size: 0.81rem;
  line-height: 1.45;
  word-break: break-word;
  overflow-wrap: anywhere;
}

.auditoria-footer {
  margin-top: 0.75rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.78rem;
  color: #64748b;
}

.loading-state,
.empty-state {
  text-align: center;
  padding: 2rem 1rem;
  color: #64748b;
  font-size: 0.9rem;
}
</style>
