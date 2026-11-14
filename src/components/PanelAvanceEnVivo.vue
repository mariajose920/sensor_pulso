<template>
  <div class="panel-en-vivo-card card" data-testid="panel-avance-en-vivo">
    <!-- Cabecera del Panel en Vivo -->
    <div class="live-panel-header">
      <div class="live-header-info">
        <div class="live-pill-group">
          <span class="live-indicator-pill" :class="{ 'live-active': conectadoRealtime }">
            <span class="live-pulsing-dot"></span>
            {{ conectadoRealtime ? 'EN VIVO' : 'CONECTANDO' }}
          </span>
          <span v-if="datosAvance?.modo === 'en_vivo'" class="badge badge-modo-vivo">
            ⏱️ Modo En Vivo
          </span>
          <span class="badge" :class="badgeEstadoClass">
            {{ estadoTexto }}
          </span>
        </div>
        <h2 class="live-panel-title">
          ⚡ Monitoreo de Avance en Tiempo Real
        </h2>
        <p class="live-panel-sub">
          Visualiza las respuestas emitidas y los estudiantes conectados sin recargar la página (RF113).
        </p>
      </div>

      <div class="live-header-actions">
        <!-- Controles de la Evaluación en Vivo (RF109) -->
        <button
          v-if="esProfesorOAdmin && datosAvance?.modo === 'en_vivo' && datosAvance?.estado === 'programada'"
          type="button"
          class="btn btn-success btn-sm"
          :disabled="controlando"
          @click="ejecutarControl('iniciar')"
          data-testid="btn-iniciar-evaluacion-en-vivo"
        >
          ▶ Iniciar Evaluación en Vivo
        </button>

        <button
          v-if="esProfesorOAdmin && datosAvance?.modo === 'en_vivo' && datosAvance?.estado === 'en_curso'"
          type="button"
          class="btn btn-danger btn-sm"
          :disabled="controlando"
          @click="ejecutarControl('cerrar')"
          data-testid="btn-cerrar-evaluacion-en-vivo"
        >
          ⏹ Cerrar Evaluación en Vivo
        </button>

        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="cargando"
          @click="forzarActualizacion"
          title="Actualizar métricas manualmente"
        >
          🔄 {{ cargando ? 'Actualizando…' : 'Refrescar' }}
        </button>

        <button
          v-if="permiteCerrar"
          type="button"
          class="btn-close-panel"
          @click="$emit('cerrar')"
          title="Cerrar panel en vivo"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- TARJETAS DE CONTADORES EN TIEMPO REAL (CRITERIO RF113) -->
    <div class="live-kpi-grid">
      <!-- 1. CONTADOR DE ESTUDIANTES CONECTADOS -->
      <div class="live-kpi-card kpi-conectados" data-testid="kpi-conectados">
        <div class="kpi-top">
          <span class="kpi-title">Estudiantes Conectados</span>
          <span class="kpi-icon-dot">●</span>
        </div>
        <div class="kpi-main-val">
          <span class="kpi-number" data-testid="contador-conectados">{{ datosAvance?.conectados || 0 }}</span>
          <span class="kpi-total">/ {{ datosAvance?.total_asignados || 0 }} asignados</span>
        </div>
        <div class="kpi-footer-detail">
          <span>🟡 {{ datosAvance?.en_progreso || 0 }} respondiendo</span>
          <span class="kpi-sep">•</span>
          <span>✅ {{ datosAvance?.finalizados || 0 }} entregaron</span>
        </div>
      </div>

      <!-- 2. CONTADOR DE RESPUESTAS EN TIEMPO REAL -->
      <div class="live-kpi-card kpi-respuestas" data-testid="kpi-respuestas">
        <div class="kpi-top">
          <span class="kpi-title">Contador de Respuestas</span>
          <span class="kpi-icon">📝</span>
        </div>
        <div class="kpi-main-val">
          <span class="kpi-number" data-testid="contador-respuestas">{{ datosAvance?.total_respuestas || 0 }}</span>
          <span class="kpi-total">guardadas sin pérdidas</span>
        </div>
        <div class="kpi-footer-detail">
          <span>Preguntas por examen: {{ datosAvance?.total_preguntas || 0 }}</span>
        </div>
      </div>

      <!-- 3. PORCENTAJE DE AVANCE GLOBAL -->
      <div class="live-kpi-card kpi-avance" data-testid="kpi-avance-global">
        <div class="kpi-top">
          <span class="kpi-title">Avance Global del Aula</span>
          <span class="kpi-icon">📊</span>
        </div>
        <div class="kpi-main-val">
          <span class="kpi-number" data-testid="porcentaje-avance">{{ datosAvance?.porcentaje_avance_global || 0 }}%</span>
        </div>
        <div class="kpi-progress-bar-wrap">
          <div
            class="kpi-progress-fill"
            :style="{ width: `${Math.min(100, datosAvance?.porcentaje_avance_global || 0)}%` }"
          ></div>
        </div>
      </div>

      <!-- 4. TIEMPO RESTANTE / ESTADO DE VIGENCIA -->
      <div class="live-kpi-card kpi-tiempo">
        <div class="kpi-top">
          <span class="kpi-title">Tiempo y Sincronización</span>
          <span class="kpi-icon">⏱️</span>
        </div>
        <div class="kpi-main-val">
          <span class="kpi-tiempo-val">{{ textoTiempoRestante }}</span>
        </div>
        <div class="kpi-footer-detail">
          <small>Último evento: {{ formatearHora(ultimoEventoEn) }}</small>
        </div>
      </div>
    </div>

    <!-- Filtros de lista de estudiantes -->
    <div class="live-toolbar">
      <div class="filter-pills">
        <button
          type="button"
          class="pill-btn"
          :class="{ active: filtroEstado === 'todos' }"
          @click="filtroEstado = 'todos'"
        >
          Todos ({{ listaEstudiantes.length }})
        </button>
        <button
          type="button"
          class="pill-btn"
          :class="{ active: filtroEstado === 'conectados' }"
          @click="filtroEstado = 'conectados'"
        >
          🟢 Conectados ({{ totalConectadosFiltro }})
        </button>
        <button
          type="button"
          class="pill-btn"
          :class="{ active: filtroEstado === 'en_progreso' }"
          @click="filtroEstado = 'en_progreso'"
        >
          🟡 En Progreso ({{ totalEnProgresoFiltro }})
        </button>
        <button
          type="button"
          class="pill-btn"
          :class="{ active: filtroEstado === 'finalizados' }"
          @click="filtroEstado = 'finalizados'"
        >
          ✅ Entregados ({{ totalFinalizadosFiltro }})
        </button>
      </div>

      <div class="search-wrap">
        <input
          v-model="busqueda"
          type="text"
          class="form-input form-input-sm search-input"
          placeholder="Buscar estudiante por nombre o correo…"
        />
      </div>
    </div>

    <!-- TABLA DE AVANCE DE ESTUDIANTES EN TIEMPO REAL -->
    <div class="table-responsive live-table-wrap">
      <div v-if="estudiantesFiltrados.length === 0" class="empty-state">
        <p>No hay estudiantes que coincidan con el filtro seleccionado.</p>
      </div>

      <table v-else class="data-table-modern live-data-table">
        <thead>
          <tr>
            <th>Estudiante</th>
            <th>Conexión en Vivo</th>
            <th>Estado</th>
            <th>Respuestas Guardadas</th>
            <th>Progreso</th>
            <th>Calificación</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="est in estudiantesFiltrados"
            :key="est.usuario_id"
            :class="{ 'row-conectado': est.conectado }"
          >
            <!-- Estudiante -->
            <td>
              <div class="student-profile-cell">
                <div class="student-avatar-circle" :class="{ 'avatar-conectado': est.conectado }">
                  {{ obtenerIniciales(est.nombre) }}
                </div>
                <div class="student-name-group">
                  <strong class="student-name">{{ est.nombre }}</strong>
                  <span class="student-email">{{ est.correo }}</span>
                </div>
              </div>
            </td>

            <!-- Conexión en Vivo (RF113) -->
            <td>
              <span
                class="status-indicator-badge"
                :class="est.conectado ? 'badge-online' : 'badge-offline'"
                data-testid="badge-conexion-estudiante"
              >
                <span class="dot"></span>
                {{ est.conectado ? 'Conectado' : 'Desconectado' }}
              </span>
            </td>

            <!-- Estado de Rendición -->
            <td>
              <span class="badge-estado-alumno" :class="'estado-' + est.estado">
                {{ {
                  no_iniciado: '⚪ Sin Iniciar',
                  en_progreso: '🟡 Rindiendo',
                  finalizado: '✅ Entregado'
                }[est.estado] || est.estado }}
              </span>
            </td>

            <!-- Contador de Respuestas Guardadas (RF113) -->
            <td>
              <span class="respuestas-chip" data-testid="respuestas-estudiante">
                📝 {{ est.respuestas_guardadas || 0 }} / {{ est.total_preguntas || datosAvance?.total_preguntas || 0 }}
              </span>
            </td>

            <!-- Barra de Progreso Individual -->
            <td>
              <div class="progress-cell">
                <div class="progress-bar-bg">
                  <div
                    class="progress-bar-fill"
                    :style="{ width: `${Math.min(100, est.porcentaje_avance || 0)}%` }"
                  ></div>
                </div>
                <span class="progress-pct">{{ est.porcentaje_avance || 0 }}%</span>
              </div>
            </td>

            <!-- Calificación (si ya entregó) -->
            <td>
              <div v-if="est.estado === 'finalizado'" class="score-pill">
                <strong>{{ est.porcentaje_calificacion || 0 }}%</strong>
                <small v-if="est.puntaje != null">({{ est.puntaje }} pts)</small>
              </div>
              <span v-else class="text-muted">—</span>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- FEED DE ACTIVIDAD EN TIEMPO REAL -->
    <div v-if="feedEventos.length > 0" class="live-activity-feed">
      <h4 class="feed-title">📡 Registro de Actividad en Vivo:</h4>
      <ul class="feed-list">
        <li v-for="(ev, idx) in feedEventos.slice(0, 5)" :key="idx" class="feed-item">
          <span class="feed-time">{{ ev.hora }}</span>
          <span class="feed-desc">{{ ev.mensaje }}</span>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { obtenerAvanceEnVivo, suscribirAvanceEnVivo } from '../services/panelEnVivoService.js'
import { controlarEvaluacionEnVivo } from '../services/evaluacionesService.js'

const props = defineProps({
  evaluacionId: {
    type: String,
    required: true
  },
  aulaId: {
    type: String,
    default: null
  },
  permiteCerrar: {
    type: Boolean,
    default: true
  },
  esProfesorOAdmin: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['cerrar', 'actualizado'])

const datosAvance = ref(null)
const cargando = ref(false)
const controlando = ref(false)
const conectadoRealtime = ref(false)
const ultimoEventoEn = ref(new Date())
const filtroEstado = ref('todos')
const busqueda = ref('')
const feedEventos = ref([])

let suscripcionRealtime = null
let temporizadorReloj = null
const ahora = ref(Date.now())

// Formateo de fecha y hora
const formatearHora = (fecha) => {
  if (!fecha) return '—'
  const d = new Date(fecha)
  return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const obtenerIniciales = (nombre) => {
  if (!nombre) return 'E'
  const partes = nombre.trim().split(/\s+/)
  if (partes.length === 1) return partes[0].substring(0, 2).toUpperCase()
  return (partes[0][0] + partes[1][0]).toUpperCase()
}

// Estados y etiquetas
const badgeEstadoClass = computed(() => {
  const est = datosAvance.value?.estado
  if (est === 'en_curso') return 'badge-success'
  if (est === 'programada') return 'badge-warning'
  if (est === 'cerrada') return 'badge-secondary'
  return 'badge-info'
})

const estadoTexto = computed(() => {
  const est = datosAvance.value?.estado
  const map = {
    borrador: 'Borrador',
    programada: 'Programada',
    en_curso: 'En Curso',
    cerrada: 'Cerrada'
  }
  return map[est] || (est || 'Estado desconocido')
})

const textoTiempoRestante = computed(() => {
  const d = datosAvance.value
  if (!d) return 'Sincronizando…'
  if (d.modo === 'en_vivo') {
    if (d.estado === 'programada') return 'Esperando inicio por docente'
    if (d.estado === 'cerrada') return 'Evaluación finalizada'
    if (d.iniciada_en && d.tiempo_limite_s) {
      const inicioMs = new Date(d.iniciada_en).getTime()
      const finMs = inicioMs + d.tiempo_limite_s * 1000
      const diffSeg = Math.max(0, Math.floor((finMs - ahora.value) / 1000))
      const min = Math.floor(diffSeg / 60)
      const sec = diffSeg % 60
      return `${min}:${sec < 10 ? '0' : ''}${sec} restante`
    }
    return 'En curso'
  }
  return 'Ventana de fechas'
})

const listaEstudiantes = computed(() => {
  return Array.isArray(datosAvance.value?.estudiantes) ? datosAvance.value.estudiantes : []
})

const totalConectadosFiltro = computed(() => {
  return listaEstudiantes.value.filter(e => e.conectado).length
})

const totalEnProgresoFiltro = computed(() => {
  return listaEstudiantes.value.filter(e => e.estado === 'en_progreso').length
})

const totalFinalizadosFiltro = computed(() => {
  return listaEstudiantes.value.filter(e => e.estado === 'finalizado').length
})

const estudiantesFiltrados = computed(() => {
  let res = listaEstudiantes.value

  // Filtro por estado
  if (filtroEstado.value === 'conectados') {
    res = res.filter(e => e.conectado)
  } else if (filtroEstado.value === 'en_progreso') {
    res = res.filter(e => e.estado === 'en_progreso')
  } else if (filtroEstado.value === 'finalizados') {
    res = res.filter(e => e.estado === 'finalizado')
  }

  // Búsqueda por texto
  if (busqueda.value.trim()) {
    const term = busqueda.value.toLowerCase().trim()
    res = res.filter(e =>
      (e.nombre && e.nombre.toLowerCase().includes(term)) ||
      (e.correo && e.correo.toLowerCase().includes(term))
    )
  }

  return res
})

// Acciones de actualización y control
const procesarActualizacionEnVivo = (nuevoEstado) => {
  const previo = datosAvance.value
  datosAvance.value = nuevoEstado
  ultimoEventoEn.value = new Date()
  conectadoRealtime.value = true

  // Registrar en feed de eventos si cambió el contador de respuestas o conexiones
  if (previo) {
    if (nuevoEstado.total_respuestas > (previo.total_respuestas || 0)) {
      const delta = nuevoEstado.total_respuestas - (previo.total_respuestas || 0)
      agregarFeedEvento(`+${delta} respuesta(s) nueva(s) guardada(s) sin pérdidas`)
    }
    if (nuevoEstado.conectados !== previo.conectados) {
      agregarFeedEvento(`Actualización de conexiones: ${nuevoEstado.conectados} alumnos conectados`)
    }
    if (nuevoEstado.finalizados > (previo.finalizados || 0)) {
      agregarFeedEvento(`Nueva entrega completada (${nuevoEstado.finalizados} en total)`)
    }
  }

  emit('actualizado', nuevoEstado)
}

const agregarFeedEvento = (mensaje) => {
  const hora = new Date().toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  feedEventos.value.unshift({ hora, mensaje })
  if (feedEventos.value.length > 20) feedEventos.value.pop()
}

const forzarActualizacion = async () => {
  cargando.value = true
  try {
    const res = await obtenerAvanceEnVivo(props.evaluacionId)
    if (res.success && res.data) {
      procesarActualizacionEnVivo(res.data)
    }
  } finally {
    cargando.value = false
  }
}

const ejecutarControl = async (accion) => {
  controlando.value = true
  try {
    const res = await controlarEvaluacionEnVivo(props.evaluacionId, accion)
    if (res.success) {
      agregarFeedEvento(accion === 'iniciar' ? 'Evaluación iniciada en vivo' : 'Evaluación cerrada en vivo')
      await forzarActualizacion()
    }
  } finally {
    controlando.value = false
  }
}

// Ciclo de vida
onMounted(() => {
  cargando.value = true
  // Iniciar suscripción Realtime + Polling resiliente
  suscripcionRealtime = suscribirAvanceEnVivo(props.evaluacionId, (estadoActualizado) => {
    cargando.value = false
    procesarActualizacionEnVivo(estadoActualizado)
  })

  // Timer para actualización del reloj de cuenta regresiva
  temporizadorReloj = setInterval(() => {
    ahora.value = Date.now()
  }, 1000)
})

onUnmounted(() => {
  if (suscripcionRealtime) {
    suscripcionRealtime.unsubscribe()
    suscripcionRealtime = null
  }
  if (temporizadorReloj) {
    clearInterval(temporizadorReloj)
    temporizadorReloj = null
  }
})

watch(() => props.evaluacionId, (nuevoId) => {
  if (nuevoId) {
    if (suscripcionRealtime) suscripcionRealtime.unsubscribe()
    suscripcionRealtime = suscribirAvanceEnVivo(nuevoId, procesarActualizacionEnVivo)
  }
})
</script>

<style scoped>
.panel-en-vivo-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
  margin-bottom: 2rem;
}

.live-panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1rem;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 1.25rem;
  margin-bottom: 1.25rem;
}

.live-pill-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.live-indicator-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.65rem;
  background: #f1f5f9;
  color: #64748b;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 9999px;
  letter-spacing: 0.05em;
}

.live-indicator-pill.live-active {
  background: #dcfce7;
  color: #15803d;
}

.live-pulsing-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background-color: #22c55e;
  box-shadow: 0 0 0 rgba(34, 197, 94, 0.4);
  animation: pulse-dot 1.5s infinite;
}

@keyframes pulse-dot {
  0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.7); }
  70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(34, 197, 94, 0); }
  100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
}

.live-panel-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0;
}

.live-panel-sub {
  font-size: 0.875rem;
  color: #64748b;
  margin: 0.25rem 0 0 0;
}

.live-header-actions {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-close-panel {
  background: transparent;
  border: 1px solid #cbd5e1;
  border-radius: 6px;
  width: 32px;
  height: 32px;
  font-size: 1rem;
  cursor: pointer;
  color: #64748b;
}

/* KPI CARDS */
.live-kpi-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.live-kpi-card {
  padding: 1.15rem;
  border-radius: 10px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.kpi-conectados {
  border-left: 4px solid #16a34a;
  background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%);
}

.kpi-respuestas {
  border-left: 4px solid #2563eb;
  background: linear-gradient(180deg, #eff6ff 0%, #ffffff 100%);
}

.kpi-avance {
  border-left: 4px solid #8b5cf6;
  background: linear-gradient(180deg, #f5f3ff 0%, #ffffff 100%);
}

.kpi-tiempo {
  border-left: 4px solid #d97706;
  background: linear-gradient(180deg, #fffbeb 0%, #ffffff 100%);
}

.kpi-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.kpi-title {
  font-size: 0.8rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #475569;
}

.kpi-icon-dot {
  color: #16a34a;
  font-size: 1.1rem;
  animation: pulse-dot 1.5s infinite;
}

.kpi-main-val {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.kpi-number {
  font-size: 2rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1;
}

.kpi-total {
  font-size: 0.85rem;
  color: #64748b;
}

.kpi-tiempo-val {
  font-size: 1.35rem;
  font-weight: 700;
  color: #0f172a;
}

.kpi-footer-detail {
  font-size: 0.8rem;
  color: #64748b;
  display: flex;
  gap: 0.5rem;
}

.kpi-sep {
  color: #cbd5e1;
}

.kpi-progress-bar-wrap {
  width: 100%;
  height: 8px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
}

.kpi-progress-fill {
  height: 100%;
  background: #8b5cf6;
  transition: width 0.3s ease;
}

/* TOOLBAR & FILTERS */
.live-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1rem;
}

.filter-pills {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.pill-btn {
  padding: 0.35rem 0.75rem;
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: 9999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #475569;
  cursor: pointer;
  transition: all 0.15s ease;
}

.pill-btn.active {
  background: #0284c7;
  color: #ffffff;
  border-color: #0284c7;
}

.search-wrap {
  flex: 1;
  max-width: 340px;
}

.search-input {
  width: 100%;
}

/* TABLA EN VIVO */
.live-table-wrap {
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  overflow: hidden;
}

.live-data-table {
  width: 100%;
  border-collapse: collapse;
}

.row-conectado {
  background-color: #f0fdf4 !important;
}

.student-avatar-circle.avatar-conectado {
  box-shadow: 0 0 0 2px #22c55e;
}

.status-indicator-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 600;
}

.badge-online {
  background: #dcfce7;
  color: #15803d;
}

.badge-online .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #16a34a;
}

.badge-offline {
  background: #f1f5f9;
  color: #64748b;
}

.badge-offline .dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #94a3b8;
}

.badge-estado-alumno {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
}

.estado-no_iniciado { background: #f1f5f9; color: #475569; }
.estado-en_progreso { background: #fef3c7; color: #b45309; }
.estado-finalizado { background: #dbeafe; color: #1e40af; }

.respuestas-chip {
  font-weight: 700;
  color: #0f172a;
  background: #f8fafc;
  padding: 0.25rem 0.5rem;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  font-size: 0.85rem;
}

.progress-cell {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.progress-bar-bg {
  flex: 1;
  height: 6px;
  background: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
  min-width: 60px;
}

.progress-bar-fill {
  height: 100%;
  background: #2563eb;
  border-radius: 9999px;
}

.progress-pct {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
  width: 35px;
}

.score-pill {
  font-size: 0.85rem;
  color: #15803d;
}

/* FEED */
.live-activity-feed {
  margin-top: 1.25rem;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.feed-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: #475569;
  margin: 0 0 0.5rem 0;
  text-transform: uppercase;
}

.feed-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.feed-item {
  font-size: 0.8rem;
  display: flex;
  gap: 0.5rem;
  color: #334155;
}

.feed-time {
  font-family: monospace;
  color: #64748b;
}

.badge-modo-vivo {
  background: #ffedd5;
  color: #c2410c;
  font-weight: 600;
}
</style>
