<template>
  <div class="comparador-mediciones-card card">
    <!-- Encabezado de la Sección Comparativa de Mediciones -->
    <div class="card-head-bar">
      <div>
        <h3 class="card-title">
          {{ isAuthenticated ? 'Comparación contra Mediciones Propias y Galería Pública' : 'Comparación contra la Galería Pública' }}
        </h3>
        <p class="card-desc">
          {{ isAuthenticated
            ? 'Contraste de tu medición actual contra registros anteriores de tu historial o casos de referencia validados en la comunidad docente.'
            : 'Contraste de la medición actual contra casos de referencia validados en la comunidad docente.' }}
        </p>
      </div>

      <div class="view-mode-buttons">
        <button
          type="button"
          class="btn btn-sm"
          :class="modoVisualizacion === 'superpuesto' ? 'btn-primary' : 'btn-secondary'"
          @click="modoVisualizacion = 'superpuesto'"
        >
          Vista Superpuesta
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :class="modoVisualizacion === 'carriles' ? 'btn-primary' : 'btn-secondary'"
          @click="modoVisualizacion = 'carriles'"
        >
          Carriles Paralelos
        </button>
      </div>
    </div>

    <!-- 1. Barra de Selección de Origen (Propias vs Públicas) y Filtros -->
    <div class="source-filter-bar">
      <div class="origin-toggle">
        <!-- Las mediciones propias solo existen con sesión: sin ella no hay forma de saber de quién serían -->
        <button
          v-if="isAuthenticated"
          type="button"
          class="btn-origin"
          :class="{ active: origenSeleccionado === 'propias' }"
          data-testid="origen-propias"
          @click="cambiarOrigen('propias')"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 5px;">
            <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
            <circle cx="12" cy="7" r="4"></circle>
          </svg>
          Mis Guardadas ({{ listaPropias.length }})
        </button>

        <button
          type="button"
          class="btn-origin"
          :class="{ active: origenSeleccionado === 'publicas' }"
          @click="cambiarOrigen('publicas')"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 5px;">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          Galería Pública Docente ({{ listaPublicas.length }})
        </button>
      </div>

      <p v-if="!isAuthenticated" class="nota-sin-sesion" data-testid="nota-sin-sesion">
        Sin sesión no hay mediciones propias: compara con los casos de referencia de la galería docente.
        <router-link to="/login">Inicia sesión</router-link> para comparar con tus mediciones guardadas.
      </p>

      <!-- Filtro por Actividad y Botón Refrescar -->
      <div class="filter-controls">
        <div class="activity-chips">
          <button
            type="button"
            class="chip-filter"
            :class="{ active: filtroActividad === 'todas' }"
            @click="filtroActividad = 'todas'"
          >
            Todas
          </button>
          <button
            type="button"
            class="chip-filter"
            :class="{ active: filtroActividad === 'reposo' }"
            @click="filtroActividad = 'reposo'"
          >
            Reposo
          </button>
          <button
            type="button"
            class="chip-filter"
            :class="{ active: filtroActividad === 'caminata' }"
            @click="filtroActividad = 'caminata'"
          >
            Caminata
          </button>
          <button
            type="button"
            class="chip-filter"
            :class="{ active: filtroActividad === 'ejercicio' }"
            @click="filtroActividad = 'ejercicio'"
          >
            Ejercicio
          </button>
        </div>

        <button
          type="button"
          class="btn btn-sm btn-outline-refresh"
          :disabled="cargando"
          @click="recargarListas"
          title="Actualizar mediciones de la nube o dispositivo"
        >
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" :class="{ 'spin-icon': cargando }">
            <polyline points="23 4 23 10 17 10"></polyline>
            <polyline points="1 20 1 14 7 14"></polyline>
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
          </svg>
          {{ cargando ? 'Cargando…' : 'Actualizar' }}
        </button>
      </div>
    </div>

    <!-- 2. Cuadrícula de Tarjetas Seleccionables -->
    <div class="measurements-grid">
      <div
        v-for="med in medicionesFiltradas"
        :key="med.id"
        class="measurement-card"
        :class="{ selected: med.id === medicionSeleccionadaId }"
        @click="seleccionarMedicion(med.id)"
        role="button"
        tabindex="0"
        @keydown.enter="seleccionarMedicion(med.id)"
      >
        <div class="card-top-row">
          <strong class="med-name">{{ med.titulo }}</strong>
          <span
            class="source-badge"
            :class="med.origen === 'propia' ? 'badge-propia' : 'badge-publica'"
          >
            {{ med.origen === 'propia' ? 'Propia' : 'Pública' }}
          </span>
        </div>

        <div class="med-meta-text">
          <span>{{ med.fechaTexto }}</span>
          <span class="meta-dot">·</span>
          <span>{{ med.actividad }}</span>
        </div>

        <div class="med-metrics-row">
          <div class="metric-bpm-box">
            <span class="bpm-num font-mono">{{ med.bpm.toFixed(1) }}</span>
            <span class="bpm-unit">BPM</span>
          </div>

          <div class="metric-sub-box">
            <span class="spo2-tag font-mono">{{ med.spo2.toFixed(1) }}% SpO2</span>
            <span class="quality-tag">{{ med.calidadTexto }}</span>
          </div>
        </div>

        <div class="card-select-footer">
          <span class="select-hint">
            {{ med.id === medicionSeleccionadaId ? 'Activa en Osciloscopio' : 'Clic para contrastar' }}
          </span>
        </div>
      </div>

      <div v-if="medicionesFiltradas.length === 0 && origenSeleccionado === 'propias' && listaPropias.length === 0" class="empty-state-box" data-testid="sin-mediciones-propias">
        <p>Aún no tienes mediciones guardadas. Cuando midas con tu sensor y guardes, aparecerán aquí; mientras tanto puedes comparar con la galería docente.</p>
        <button type="button" class="btn btn-sm btn-secondary" @click="cambiarOrigen('publicas')">
          Ver galería docente
        </button>
      </div>
      <div v-else-if="medicionesFiltradas.length === 0" class="empty-state-box">
        <p>No se encontraron mediciones para el filtro seleccionado.</p>
        <button type="button" class="btn btn-sm btn-secondary" @click="filtroActividad = 'todas'">
          Ver todas las mediciones
        </button>
      </div>
    </div>

    <!-- 3. Ficha Resumen de la Medición de Contraste Activa -->
    <div class="active-contrast-banner" v-if="medicionActualContraste">
      <div class="sel-info-col">
        <div class="contrast-header-line">
          <span class="contrast-pill">Medición de Contraste Activa</span>
          <strong class="contrast-name">{{ medicionActualContraste.titulo }}</strong>
        </div>
        <p class="contrast-desc">
          {{ medicionActualContraste.descripcion }}
        </p>
      </div>

      <div class="sel-meta-col">
        <div class="contrast-badge-wrapper">
          <span class="contrast-live-tag">
            Comparando vs {{ measurementName }} ({{ currentBpm }} BPM)
          </span>
        </div>
      </div>
    </div>

    <!-- 4. Osciloscopio Multicanal Sincronizado (RF26) -->
    <div class="oscilloscope-container">
      <div class="osc-header-bar">
        <div class="osc-title-group">
          <h4 class="osc-canvas-title">Osciloscopio Multicanal de Bioseñales (Ventana de 3.5 s)</h4>
          <span class="osc-hz-badge font-mono">100 Hz</span>
        </div>

        <!-- Controles de Capas Activas -->
        <div class="layer-toggles">
          <label class="layer-chk">
            <input type="checkbox" v-model="mostrarMedicion" />
            <span class="layer-dot dot-medicion"></span>
            <span>Medición Tomada ({{ currentBpm }} BPM)</span>
          </label>

          <label class="layer-chk">
            <input type="checkbox" v-model="mostrarContraste" />
            <span class="layer-dot dot-contraste"></span>
            <span>{{ medicionActualContraste?.titulo.split('(')[0] || 'Contraste' }} ({{ medicionActualContraste?.bpm.toFixed(1) }} BPM)</span>
          </label>
        </div>
      </div>

      <!-- MODO A: VISTA SUPERPUESTA -->
      <div v-if="modoVisualizacion === 'superpuesto'" class="canvas-viewport viewport-single">
        <svg viewBox="0 0 900 240" width="100%" height="100%" preserveAspectRatio="none">
          <defs>
            <pattern id="grid-superpuesto" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" stroke-width="0.8" />
            </pattern>
          </defs>

          <rect width="900" height="240" fill="url(#grid-superpuesto)" />

          <!-- Línea base horizontal -->
          <line x1="0" y1="180" x2="900" y2="180" stroke="#334155" stroke-width="1" stroke-dasharray="2,2" />

          <!-- Onda 1: Medición Tomada del Sensor (Verde) -->
          <path
            v-if="mostrarMedicion"
            :d="pathSvgMedicion"
            fill="none"
            stroke="#22c55e"
            stroke-width="2.6"
            stroke-linecap="round"
          />

          <!-- Onda 2: Medición de Contraste Guardada o Pública (Púrpura/Violeta) -->
          <path
            v-if="mostrarContraste"
            :d="pathSvgContraste"
            fill="none"
            stroke="#a855f7"
            stroke-width="2.6"
            stroke-linecap="round"
            stroke-dasharray="4,2"
          />
        </svg>

        <div class="axis-legend-bottom">
          <span>0.0 s</span>
          <span>0.5 s</span>
          <span>1.0 s</span>
          <span>1.5 s</span>
          <span>2.0 s</span>
          <span>2.5 s</span>
          <span>3.0 s</span>
          <span>3.5 s</span>
        </div>
      </div>

      <!-- MODO B: CARRILES PARALELOS -->
      <div v-else class="canvas-viewport viewport-carriles">
        <!-- Carril 1: Medición Actual Tomada -->
        <div class="carril-box">
          <div class="carril-label">
            <span class="layer-dot dot-medicion"></span>
            <strong>Medición Tomada (Canal 1):</strong> {{ measurementName }} ({{ currentBpm }} BPM)
          </div>
          <svg viewBox="0 0 900 130" width="100%" height="100%" preserveAspectRatio="none">
            <defs>
              <pattern id="grid-c1" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" stroke-width="0.7" />
              </pattern>
            </defs>
            <rect width="900" height="130" fill="url(#grid-c1)" />
            <path
              v-if="mostrarMedicion"
              :d="generarPathSvg(ondaMedicion.ppg, 900, 130, 105, 85)"
              fill="none"
              stroke="#22c55e"
              stroke-width="2.4"
              stroke-linecap="round"
            />
          </svg>
        </div>

        <!-- Carril 2: Medición de Contraste Guardada o Pública -->
        <div class="carril-box" style="margin-top: 0.5rem;">
          <div class="carril-label">
            <span class="layer-dot dot-contraste"></span>
            <strong>Medición de Contraste (Canal 2):</strong> {{ medicionActualContraste?.titulo }} ({{ medicionActualContraste?.bpm.toFixed(1) }} BPM)
          </div>
          <svg viewBox="0 0 900 130" width="100%" height="100%" preserveAspectRatio="none">
            <defs>
              <pattern id="grid-c2" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" stroke-width="0.7" />
              </pattern>
            </defs>
            <rect width="900" height="130" fill="url(#grid-c2)" />
            <path
              v-if="mostrarContraste"
              :d="generarPathSvg(ondaContraste.ppg, 900, 130, 105, 85)"
              fill="none"
              stroke="#a855f7"
              stroke-width="2.4"
              stroke-linecap="round"
            />
          </svg>
        </div>

        <div class="axis-legend-bottom">
          <span>0.0 s</span>
          <span>0.5 s</span>
          <span>1.0 s</span>
          <span>1.5 s</span>
          <span>2.0 s</span>
          <span>2.5 s</span>
          <span>3.0 s</span>
          <span>3.5 s</span>
        </div>
      </div>
    </div>

    <!-- 5. Cuadro Cuantitativo de Biomarcadores Comparativos -->
    <div class="metrics-grid">
      <!-- Diferencia BPM -->
      <div class="metric-card">
        <div class="met-label">Diferencia Frecuencia (ΔBPM)</div>
        <div
          class="met-value font-mono"
          :class="metricas.deltaBpm > 0 ? 'text-amber' : (metricas.deltaBpm < 0 ? 'text-blue' : 'text-green')"
        >
          {{ metricas.deltaBpm > 0 ? '+' : '' }}{{ metricas.deltaBpm.toFixed(1) }}
          <span class="met-unit">BPM</span>
        </div>
        <div class="met-sub-info font-mono">
          {{ metricas.bpmActual }} vs {{ metricas.bpmContraste }} BPM ({{ metricas.cambioPorcentualBpm > 0 ? '+' : '' }}{{ metricas.cambioPorcentualBpm }}%)
        </div>
      </div>

      <!-- Diferencia Intervalo RR -->
      <div class="metric-card">
        <div class="met-label">Variación Intervalo RR (ΔT)</div>
        <div class="met-value font-mono">
          {{ metricas.deltaIntervaloMs > 0 ? '+' : '' }}{{ metricas.deltaIntervaloMs }}
          <span class="met-unit">ms</span>
        </div>
        <div class="met-sub-info font-mono">
          {{ metricas.intActualMs }} ms vs {{ metricas.intContrasteMs }} ms por ciclo
        </div>
      </div>

      <!-- Saturación de Oxígeno -->
      <div class="metric-card">
        <div class="met-label">Saturación de Oxígeno (ΔSpO2)</div>
        <div class="met-value font-mono text-green">
          {{ metricas.deltaSpo2 > 0 ? '+' : '' }}{{ metricas.deltaSpo2.toFixed(1) }}
          <span class="met-unit">%</span>
        </div>
        <div class="met-sub-info font-mono">
          {{ metricas.spo2Actual.toFixed(1) }}% vs {{ metricas.spo2Contraste.toFixed(1) }}% (Normoxemia)
        </div>
      </div>

      <!-- Similitud Morfológica -->
      <div class="metric-card">
        <div class="met-label">Índice de Similitud Morfológica</div>
        <div class="met-value font-mono text-purple">
          {{ metricas.similitudPorcentaje }}%
        </div>
        <div class="met-sub-info">
          {{ metricas.concordancia === 'alta' ? 'Alta concordancia de perfil' : (metricas.concordancia === 'media' ? 'Concordancia moderada' : 'Variación adaptativa') }}
        </div>
      </div>
    </div>

    <!-- 6. Fundamento Fisiológico y Conclusión Docente UNACH -->
    <div class="analysis-box">
      <div class="analysis-head">
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" style="margin-right: 6px;">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <strong>Interpretación Fisiológica del Contraste Temporal</strong>
      </div>
      <p class="analysis-text">
        {{ metricas.conclusion }}
      </p>
      <div class="analysis-meta">
        <span>Evaluación pedagógica para la carrera de Enfermería y Ciencias de la Salud · UNACH</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuth } from '../composables/useAuth'
import {
  obtenerMedicionesPropias,
  obtenerMedicionesPublicas,
  calcularMetricasComparacionMediciones,
  generarPuntosOndaMedicion
} from '../data/galeriaPublica.js'

const props = defineProps({
  currentBpm: {
    type: Number,
    default: 78
  },
  lastIntervalMs: {
    type: Number,
    default: 769
  },
  amplitude: {
    type: Number,
    default: 100
  },
  measurementName: {
    type: String,
    default: 'Medición Tomada'
  }
})

// Estado de visualización y origen
// Sin sesión no se sabe de quién serían las mediciones: solo se comparan los casos de la galería docente
const { isAuthenticated } = useAuth()
const origenSeleccionado = ref(isAuthenticated.value ? 'propias' : 'publicas') // 'propias' | 'publicas'
const filtroActividad = ref('todas') // 'todas' | 'reposo' | 'caminata' | 'ejercicio'
const modoVisualizacion = ref('superpuesto') // 'superpuesto' | 'carriles'
const cargando = ref(false)

const mostrarMedicion = ref(true)
const mostrarContraste = ref(true)

// Listas de datos
const listaPropias = ref([])
const listaPublicas = ref([])
const medicionSeleccionadaId = ref('')

onMounted(async () => {
  await recargarListas()
})

// Si se entra o se sale de la sesión con la pantalla abierta, se rehacen las listas y el origen
watch(isAuthenticated, async (conSesion) => {
  origenSeleccionado.value = conSesion ? 'propias' : 'publicas'
  medicionSeleccionadaId.value = ''
  await recargarListas()
})

async function recargarListas() {
  cargando.value = true
  try {
    const [propias, publicas] = await Promise.all([
      obtenerMedicionesPropias(),
      obtenerMedicionesPublicas()
    ])
    listaPropias.value = isAuthenticated.value ? propias : []
    listaPublicas.value = publicas

    // Seleccionar por defecto la primera disponible
    if (!medicionSeleccionadaId.value) {
      if (listaPropias.value.length > 0) {
        medicionSeleccionadaId.value = listaPropias.value[0].id
      } else if (publicas.length > 0) {
        medicionSeleccionadaId.value = publicas[0].id
      }
    }
  } finally {
    cargando.value = false
  }
}

function cambiarOrigen(nuevoOrigen) {
  origenSeleccionado.value = nuevoOrigen
  const lista = nuevoOrigen === 'propias' ? listaPropias.value : listaPublicas.value
  if (lista.length > 0 && !lista.some(m => m.id === medicionSeleccionadaId.value)) {
    medicionSeleccionadaId.value = lista[0].id
  }
}

function seleccionarMedicion(id) {
  medicionSeleccionadaId.value = id
}

// Mediciones filtradas por actividad y origen
const medicionesFiltradas = computed(() => {
  const base = origenSeleccionado.value === 'propias' ? listaPropias.value : listaPublicas.value
  if (filtroActividad.value === 'todas') {
    return base
  }
  return base.filter(m => m.categoria === filtroActividad.value)
})

// Medición de contraste actualmente seleccionada
const medicionActualContraste = computed(() => {
  const todas = [...listaPropias.value, ...listaPublicas.value]
  return todas.find(m => m.id === medicionSeleccionadaId.value) || listaPropias.value[0] || listaPublicas.value[0]
})

// Métricas de comparación calculadas
const metricas = computed(() => {
  return calcularMetricasComparacionMediciones({
    medicionActualBpm: props.currentBpm,
    medicionActualSpo2: 98.0,
    medicionContraste: medicionActualContraste.value
  })
})

// Generación de ondas para osciloscopio (3.5 s a 100 Hz = 350 puntos)
const ondaMedicion = computed(() => {
  return generarPuntosOndaMedicion({
    bpm: props.currentBpm,
    duracionSegundos: 3.5,
    tasaMuestreo: 100,
    amplitud: props.amplitude
  })
})

const ondaContraste = computed(() => {
  const bpmContraste = medicionActualContraste.value?.bpm || 70.5
  return generarPuntosOndaMedicion({
    bpm: bpmContraste,
    duracionSegundos: 3.5,
    tasaMuestreo: 100,
    amplitud: 100
  })
})

function generarPathSvg(valores, anchoTotal = 900, altoTotal = 240, yBaseline = 180, alturaMax = 120) {
  if (!valores || valores.length === 0) return ''
  const stepX = anchoTotal / (valores.length - 1)
  const coords = valores.map((v, idx) => {
    const x = (idx * stepX).toFixed(1)
    const y = (yBaseline - v * alturaMax).toFixed(1)
    return `${x},${y}`
  })
  return `M ${coords.join(' L ')}`
}

const pathSvgMedicion = computed(() => {
  return generarPathSvg(ondaMedicion.value.ppg, 900, 240, 185, 125)
})

const pathSvgContraste = computed(() => {
  return generarPathSvg(ondaContraste.value.ppg, 900, 240, 185, 125)
})
</script>

<style scoped>
.nota-sin-sesion {
  margin: 0.5rem 0 0;
  font-size: 0.85rem;
  color: #92400e;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 8px;
  padding: 0.5rem 0.75rem;
}
.comparador-mediciones-card {
  margin-top: 1rem;
}

.card-head-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.85rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.card-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 0.2rem;
}

.card-desc {
  font-size: 0.88rem;
  color: var(--color-muted);
  margin: 0;
}

.view-mode-buttons {
  display: flex;
  gap: 0.4rem;
}

/* Barra de Origen y Filtros */
.source-filter-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  background: var(--color-bg);
  padding: 0.65rem 0.85rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.origin-toggle {
  display: flex;
  gap: 0.35rem;
  background: #e2e8f0;
  padding: 0.25rem;
  border-radius: 0.4rem;
}

.btn-origin {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.75rem;
  font-size: 0.82rem;
  font-weight: 600;
  border-radius: 0.3rem;
  border: none;
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-origin.active {
  background: #ffffff;
  color: #1e40af;
  box-shadow: 0 1px 2px rgba(0,0,0,0.08);
}

.filter-controls {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.activity-chips {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.chip-filter {
  padding: 0.25rem 0.65rem;
  font-size: 0.78rem;
  font-weight: 600;
  border-radius: 9999px;
  border: 1px solid var(--color-border);
  background: #ffffff;
  color: var(--color-muted);
  cursor: pointer;
  transition: all 0.15s ease;
}

.chip-filter.active {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
}

.btn-outline-refresh {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.28rem 0.65rem;
  font-size: 0.78rem;
  background: #ffffff;
  border: 1px solid var(--color-border);
  color: var(--color-muted);
  border-radius: 0.35rem;
  cursor: pointer;
}

.spin-icon {
  animation: spin 1s linear infinite;
}

@keyframes spin {
  100% { transform: rotate(360deg); }
}

/* Cuadrícula de Mediciones */
.measurements-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.measurement-card {
  border: 1px solid var(--color-border);
  background: #ffffff;
  border-radius: 0.5rem;
  padding: 0.85rem;
  cursor: pointer;
  transition: all 0.15s ease;
  position: relative;
  display: flex;
  flex-direction: column;
}

.measurement-card:hover {
  border-color: #93c5fd;
  transform: translateY(-1px);
}

.measurement-card.selected {
  border-color: #7c3aed;
  background: #faf5ff;
  box-shadow: 0 0 0 2px #7c3aed;
}

.card-top-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.35rem;
  gap: 0.5rem;
}

.med-name {
  font-size: 0.9rem;
  font-weight: 700;
  color: #0f172a;
}

.source-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 0.25rem;
  flex-shrink: 0;
}

.badge-propia { background: #dcfce7; color: #15803d; }
.badge-publica { background: #ede9fe; color: #6d28d9; }

.med-meta-text {
  font-size: 0.75rem;
  color: var(--color-muted);
  margin-bottom: 0.5rem;
}

.meta-dot {
  margin: 0 0.25rem;
}

.med-metrics-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 0.35rem;
  border-top: 1px dashed var(--color-border);
}

.bpm-num {
  font-size: 1.3rem;
  font-weight: 800;
  color: #0f172a;
}

.bpm-unit {
  font-size: 0.75rem;
  color: var(--color-muted);
  margin-left: 0.2rem;
}

.metric-sub-box {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.15rem;
}

.spo2-tag {
  font-size: 0.8rem;
  font-weight: 700;
  color: #0284c7;
}

.quality-tag {
  font-size: 0.7rem;
  color: #16a34a;
  font-weight: 600;
}

.card-select-footer {
  margin-top: 0.45rem;
  font-size: 0.72rem;
  font-weight: 600;
  color: #7c3aed;
  text-align: right;
}

.empty-state-box {
  grid-column: 1 / -1;
  text-align: center;
  padding: 1.5rem;
  background: var(--color-bg);
  border-radius: 0.5rem;
  color: var(--color-muted);
  font-size: 0.88rem;
}

/* Ficha Activa de Contraste */
.active-contrast-banner {
  background: #faf5ff;
  border: 1px solid #ddd6fe;
  border-left: 4px solid #7c3aed;
  border-radius: 0.5rem;
  padding: 0.85rem 1.15rem;
  margin-bottom: 1.25rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}

.contrast-pill {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #7c3aed;
  letter-spacing: 0.04em;
  margin-right: 0.5rem;
}

.contrast-name {
  font-size: 0.95rem;
  color: #5b21b6;
}

.contrast-desc {
  font-size: 0.82rem;
  color: #64748b;
  margin: 0.25rem 0 0 0;
}

.contrast-live-tag {
  display: inline-block;
  font-size: 0.8rem;
  font-weight: 600;
  color: #6d28d9;
  background: #ede9fe;
  padding: 0.35rem 0.75rem;
  border-radius: 0.35rem;
}

/* Osciloscopio */
.oscilloscope-container {
  background: #0f172a;
  border-radius: 0.6rem;
  padding: 1rem;
  margin-bottom: 1.25rem;
  border: 1px solid #1e293b;
}

.osc-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
  gap: 1rem;
  flex-wrap: wrap;
}

.osc-canvas-title {
  font-size: 0.85rem;
  font-weight: 600;
  color: #94a3b8;
  margin: 0;
  display: inline;
}

.osc-hz-badge {
  font-size: 0.72rem;
  color: #38bdf8;
  background: #082f49;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  margin-left: 0.5rem;
}

.layer-toggles {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.layer-chk {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #e2e8f0;
  cursor: pointer;
  user-select: none;
}

.layer-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  flex-shrink: 0;
}

.dot-medicion { background: #22c55e; }
.dot-contraste { background: #a855f7; }

.canvas-viewport {
  width: 100%;
  background: #090d16;
  border-radius: 0.4rem;
  border: 1px solid #1e293b;
  position: relative;
  overflow: hidden;
}

.viewport-single {
  height: 240px;
}

.viewport-carriles {
  padding: 0.5rem;
}

.carril-box {
  background: #0a0f1d;
  border-radius: 0.35rem;
  border: 1px solid #1e293b;
  padding: 0.4rem;
  height: 140px;
}

.carril-label {
  font-size: 0.75rem;
  color: #cbd5e1;
  margin-bottom: 0.25rem;
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.axis-legend-bottom {
  display: flex;
  justify-content: space-between;
  padding: 0.35rem 0.5rem 0;
  font-family: monospace;
  font-size: 0.72rem;
  color: #64748b;
}

/* Grid de Métricas */
.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 0.85rem;
  margin-bottom: 1.25rem;
}

.metric-card {
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.9rem;
  text-align: center;
}

.met-label {
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-muted);
  margin-bottom: 0.3rem;
}

.met-value {
  font-size: 1.45rem;
  font-weight: 800;
  color: #0f172a;
}

.met-unit {
  font-size: 0.85rem;
  color: var(--color-muted);
  font-weight: 600;
}

.met-sub-info {
  font-size: 0.74rem;
  color: var(--color-muted);
  margin-top: 0.25rem;
}

.text-amber { color: #d97706; }
.text-blue { color: #0284c7; }
.text-green { color: #16a34a; }
.text-purple { color: #7c3aed; }

/* Análisis Fisiológico Docente */
.analysis-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
  padding: 1.15rem;
}

.analysis-head {
  font-size: 0.95rem;
  color: #1e293b;
  margin-bottom: 0.4rem;
  display: flex;
  align-items: center;
}

.analysis-text {
  font-size: 0.86rem;
  color: #475569;
  line-height: 1.55;
  margin: 0;
}

.analysis-meta {
  margin-top: 0.65rem;
  padding-top: 0.5rem;
  border-top: 1px solid #e2e8f0;
  font-size: 0.75rem;
  color: #94a3b8;
}
</style>
