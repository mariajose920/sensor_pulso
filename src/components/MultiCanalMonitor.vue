<template>
  <div class="multicanal-container card">
    <!-- Encabezado del Monitor Multi-Canal (RF08) -->
    <div class="multicanal-header">
      <div class="header-titles">
        <div class="header-tags">
          <span class="tag-badge">RF08 · Visualización Multi-Canal</span>
          <span class="badge-total-canales">5 Canales Simultáneos</span>
        </div>
        <h2 class="multicanal-title">Central de Monitoreo Fisiológico (ESP32)</h2>
        <p class="multicanal-subtitle">
          Supervisión concurrente de hasta 5 canales en tiempo real, cada uno con frecuencia cardíaca (BPM) y saturación de oxígeno (SpO₂).
        </p>
      </div>

      <!-- Barra de herramientas: Modos de Vista y Filtros -->
      <div class="header-controls">
        <div class="view-mode-selector">
          <button 
            type="button" 
            class="mode-btn" 
            :class="{ active: modoVista === 'tarjetas' }"
            @click="modoVista = 'tarjetas'"
            title="Vista de cuadrícula con mini-trazas PPG"
          >
            🗂️ Tarjetas
          </button>
          <button 
            type="button" 
            class="mode-btn" 
            :class="{ active: modoVista === 'central' }"
            @click="modoVista = 'central'"
            title="Vista panorámica multiparámetro estilo monitor hospitalario"
          >
            🖥️ Central Clínica
          </button>
          <button 
            type="button" 
            class="mode-btn" 
            :class="{ active: modoVista === 'tabla' }"
            @click="modoVista = 'tabla'"
            title="Vista tabla comparativa de los 5 canales"
          >
            📋 Tabla Comparativa
          </button>
        </div>
      </div>
    </div>

    <!-- Barra de Telemetría Grupal y Alertas Fisiológicas (RF08) -->
    <div class="telemetria-grupal-bar">
      <div class="telemetria-stat-pill">
        <span class="stat-icon">📡</span>
        <div class="stat-info">
          <span class="stat-label">Canales Activos:</span>
          <strong class="stat-value font-mono">{{ metricasGrupales.activosCount }} / {{ canales.length }}</strong>
        </div>
      </div>

      <div class="telemetria-stat-pill">
        <span class="stat-icon">❤️</span>
        <div class="stat-info">
          <span class="stat-label">BPM Promedio Grupal:</span>
          <strong class="stat-value font-mono text-primary">{{ metricasGrupales.promedioBpm > 0 ? metricasGrupales.promedioBpm.toFixed(1) : '--' }} <small>BPM</small></strong>
        </div>
      </div>

      <div class="telemetria-stat-pill">
        <span class="stat-icon">🫁</span>
        <div class="stat-info">
          <span class="stat-label">SpO₂ Promedio Grupal:</span>
          <strong class="stat-value font-mono text-cyan">{{ metricasGrupales.promedioSpo2 > 0 ? metricasGrupales.promedioSpo2.toFixed(1) : '--' }} <small>%</small></strong>
        </div>
      </div>

      <div class="telemetria-stat-pill" :class="{ 'stat-alerta': metricasGrupales.alertasCount > 0 }">
        <span class="stat-icon">{{ metricasGrupales.alertasCount > 0 ? '⚠️' : '✅' }}</span>
        <div class="stat-info">
          <span class="stat-label">Alertas Clínicas:</span>
          <strong class="stat-value font-mono" :class="metricasGrupales.alertasCount > 0 ? 'text-danger' : 'text-success'">
            {{ metricasGrupales.alertasCount > 0 ? `${metricasGrupales.alertasCount} en atención` : 'Estables' }}
          </strong>
        </div>
      </div>

      <!-- Filtro rápido -->
      <div class="filtros-container">
        <span class="filtro-label">Filtrar:</span>
        <div class="filtros-pills">
          <button 
            type="button" 
            class="filtro-btn" 
            :class="{ active: filtroActivo === 'todos' }" 
            @click="filtroActivo = 'todos'"
          >
            Todos ({{ canales.length }})
          </button>
          <button 
            type="button" 
            class="filtro-btn" 
            :class="{ active: filtroActivo === 'activos' }" 
            @click="filtroActivo = 'activos'"
          >
            Activos
          </button>
          <button 
            v-if="metricasGrupales.alertasCount > 0"
            type="button" 
            class="filtro-btn btn-alerta" 
            :class="{ active: filtroActivo === 'alertas' }" 
            @click="filtroActivo = 'alertas'"
          >
            ⚠️ Alertas ({{ metricasGrupales.alertasCount }})
          </button>
          <button 
            v-if="miCanalAsignado" 
            type="button" 
            class="filtro-btn btn-mi-canal" 
            :class="{ active: filtroActivo === 'mi_canal' }" 
            @click="filtroActivo = 'mi_canal'"
          >
            ⭐ Mi Canal
          </button>
        </div>
      </div>
    </div>

    <!-- VISTA 1: CUADRÍCULA DE TARJETAS MULTI-CANAL -->
    <div v-if="modoVista === 'tarjetas'" class="canales-grid-view">
      <div 
        v-for="c in canalesFiltrados" 
        :key="c.canal"
        class="canal-card-enhanced"
        :class="{
          'selected': canalSeleccionado === c.canal,
          'es-mi-canal': miCanalAsignado === c.canal,
          'en-alerta': tieneAlertaCanal(c),
          'inactivo': !c.activo
        }"
        @click="$emit('select', c.canal)"
      >
        <!-- Top bar de la tarjeta -->
        <div class="card-header-row">
          <div class="canal-tag-wrapper">
            <span class="canal-title-badge">Canal {{ c.canal }}</span>
            <span v-if="miCanalAsignado === c.canal" class="badge-mi-canal">⭐ Mi Canal</span>
            <span v-if="tieneAlertaCanal(c)" class="badge-alerta-chip" :title="obtenerTextoAlerta(c)">⚠️ Alerta</span>
          </div>
          <CalidadSenalBadge :nivel="c.calidad || 'buena'" :causas="c.causasCalidad || []" />
        </div>

        <!-- Asignación de Estudiante (RF12 / RF111) -->
        <div v-if="obtenerNombreAsignado(c.canal)" class="user-assigned-badge font-mono">
          👤 {{ obtenerNombreAsignado(c.canal) }}
        </div>
        <div v-else class="free-channel-badge font-mono">
          🟢 Canal Libre (RF12)
        </div>

        <!-- Mini Traza PPG en Tiempo Real del Canal -->
        <div class="mini-wave-wrapper" title="Onda pulsátil fotopletismográfica en tiempo real">
          <canvas 
            :ref="el => setCanvasRef(c.canal, el)" 
            class="mini-wave-canvas" 
            width="220" 
            height="48"
          ></canvas>
          <span class="mini-wave-label">PPG {{ c.canal }}</span>
        </div>

        <!-- Métricas Fisiológicas Concurrente: BPM y SpO2 -->
        <div class="metricas-fisiologicas-row">
          <!-- Métrica 1: Frecuencia Cardíaca (BPM) -->
          <div class="metrica-box bpm-box">
            <div class="metrica-header">
              <span class="heart-pulse-dot" :class="{ beating: c.bpm > 0 }">❤️</span>
              <span class="metrica-label">BPM</span>
            </div>
            <div class="metrica-valor font-mono">
              {{ c.bpm ? c.bpm.toFixed(1) : '--.-' }}
            </div>
            <span class="metrica-badge" :class="'badge-bpm-' + evaluarBpm(c.bpm)">
              {{ etiquetaBpm(c.bpm) }}
            </span>
          </div>

          <!-- Métrica 2: Saturación de Oxígeno (SpO₂) -->
          <div class="metrica-box spo2-box">
            <div class="metrica-header">
              <span class="oximeter-dot">🫁</span>
              <span class="metrica-label">SpO₂</span>
            </div>
            <div class="metrica-valor font-mono">
              {{ c.spo2 ? c.spo2.toFixed(1) : '--.-' }}<small>%</small>
            </div>
            <span class="metrica-badge" :class="'badge-spo2-' + evaluarSpo2(c.spo2)">
              {{ etiquetaSpo2(c.spo2) }}
            </span>
          </div>
        </div>

        <!-- Footer interactivo de la tarjeta -->
        <div class="card-action-footer">
          <span v-if="canalSeleccionado === c.canal" class="active-focus-tag">
            ● Enfocado en osciloscopio
          </span>
          <span v-else class="inactive-focus-tag">
            🔍 Clic para enfocar osciloscopio
          </span>
        </div>
      </div>
    </div>

    <!-- VISTA 2: CENTRAL DE TELEMETRÍA MULTIPARÁMETRO (ESTILO MONITOR UCI) -->
    <div v-else-if="modoVista === 'central'" class="central-telemetria-view">
      <div class="central-rack">
        <div 
          v-for="c in canalesFiltrados" 
          :key="c.canal"
          class="central-track-row"
          :class="{
            'track-selected': canalSeleccionado === c.canal,
            'track-mi-canal': miCanalAsignado === c.canal,
            'track-alerta': tieneAlertaCanal(c)
          }"
          @click="$emit('select', c.canal)"
        >
          <!-- Info del Canal y Asignación -->
          <div class="track-info-col">
            <div class="track-header">
              <span class="track-title font-mono">CH-0{{ c.canal }}</span>
              <span v-if="miCanalAsignado === c.canal" class="badge-mi-canal-sm">MI CANAL</span>
            </div>
            <div class="track-user font-mono">
              {{ obtenerNombreAsignado(c.canal) || '🟢 Libre' }}
            </div>
            <CalidadSenalBadge :nivel="c.calidad || 'buena'" :causas="c.causasCalidad || []" />
          </div>

          <!-- Traza PPG Panorámica a lo Ancho -->
          <div class="track-waveform-col">
            <canvas 
              :ref="el => setCanvasRef(c.canal, el)" 
              class="panoramic-wave-canvas" 
              width="500" 
              height="60"
            ></canvas>
            <div class="wave-overlay-info">
              <span class="wave-tag">IR / LED ROJO (50 Hz)</span>
              <span v-if="canalSeleccionado === c.canal" class="wave-focused-tag">EN OSCILOSCOPIO</span>
            </div>
          </div>

          <!-- Métrica Digital BPM -->
          <div class="track-metric-col metric-bpm">
            <div class="metric-top">
              <span class="heart-pulse-dot" :class="{ beating: c.bpm > 0 }">❤️</span>
              <span class="metric-kind">HR / PULSO</span>
            </div>
            <div class="metric-huge font-mono">
              {{ c.bpm ? c.bpm.toFixed(1) : '--.-' }}
            </div>
            <div class="metric-pill" :class="'pill-' + evaluarBpm(c.bpm)">
              {{ etiquetaBpm(c.bpm) }}
            </div>
          </div>

          <!-- Métrica Digital SpO2 -->
          <div class="track-metric-col metric-spo2">
            <div class="metric-top">
              <span class="oximeter-dot">🫁</span>
              <span class="metric-kind">SPO₂ ARTERIAL</span>
            </div>
            <div class="metric-huge font-mono text-cyan">
              {{ c.spo2 ? c.spo2.toFixed(1) : '--.-' }}<small>%</small>
            </div>
            <div class="metric-pill" :class="'pill-' + evaluarSpo2(c.spo2)">
              {{ etiquetaSpo2(c.spo2) }}
            </div>
          </div>

          <!-- Botón de enfoque -->
          <div class="track-btn-col">
            <button 
              type="button" 
              class="btn-track-focus" 
              :class="{ 'btn-focus-active': canalSeleccionado === c.canal }"
              @click.stop="$emit('select', c.canal)"
            >
              {{ canalSeleccionado === c.canal ? '✓ Activo' : 'Enfocar' }}
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- VISTA 3: TABLA COMPARATIVA DE LOS 5 CANALES -->
    <div v-else-if="modoVista === 'tabla'" class="tabla-comparativa-view">
      <div class="table-responsive">
        <table class="comparativa-table">
          <thead>
            <tr>
              <th>Canal</th>
              <th>Asignación (RF12)</th>
              <th>Frecuencia Cardíaca (RF07)</th>
              <th>Saturación SpO₂ (RF114)</th>
              <th>Estado Fisiológico</th>
              <th>Calidad de Señal</th>
              <th>Acción</th>
            </tr>
          </thead>
          <tbody>
            <tr 
              v-for="c in canalesFiltrados" 
              :key="c.canal"
              :class="{
                'row-selected': canalSeleccionado === c.canal,
                'row-mi-canal': miCanalAsignado === c.canal,
                'row-alerta': tieneAlertaCanal(c)
              }"
            >
              <td class="font-mono">
                <strong>Canal {{ c.canal }}</strong>
                <span v-if="miCanalAsignado === c.canal" class="badge-mi-canal-xs">⭐ Tuyo</span>
              </td>
              <td>
                <span v-if="obtenerNombreAsignado(c.canal)" class="user-chip">
                  👤 {{ obtenerNombreAsignado(c.canal) }}
                </span>
                <span v-else class="free-chip">
                  🟢 Libre
                </span>
              </td>
              <td>
                <div class="table-metric-cell">
                  <span class="heart-pulse-dot" :class="{ beating: c.bpm > 0 }">❤️</span>
                  <strong class="font-mono">{{ c.bpm ? c.bpm.toFixed(1) : '--' }} BPM</strong>
                  <span class="mini-pill" :class="'pill-' + evaluarBpm(c.bpm)">{{ etiquetaBpm(c.bpm) }}</span>
                </div>
              </td>
              <td>
                <div class="table-metric-cell">
                  <span>🫁</span>
                  <strong class="font-mono text-cyan">{{ c.spo2 ? c.spo2.toFixed(1) : '--' }}%</strong>
                  <span class="mini-pill" :class="'pill-' + evaluarSpo2(c.spo2)">{{ etiquetaSpo2(c.spo2) }}</span>
                </div>
              </td>
              <td>
                <span v-if="tieneAlertaCanal(c)" class="alerta-badge-cell">
                  ⚠️ {{ obtenerTextoAlerta(c) }}
                </span>
                <span v-else class="ok-badge-cell">
                  ✓ Fisiológicamente Estable
                </span>
              </td>
              <td>
                <CalidadSenalBadge :nivel="c.calidad || 'buena'" :causas="c.causasCalidad || []" />
              </td>
              <td>
                <button 
                  type="button" 
                  class="btn btn-sm"
                  :class="canalSeleccionado === c.canal ? 'btn-primary' : 'btn-secondary'"
                  style="padding: 0.25rem 0.6rem; font-size: 0.75rem;"
                  @click="$emit('select', c.canal)"
                >
                  {{ canalSeleccionado === c.canal ? '● En Pantalla' : 'Ver Onda' }}
                </button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import CalidadSenalBadge from './CalidadSenalBadge.vue'
import {
  multiCanalState,
  calcularMetricasGrupales,
  filtrarCanales,
  evaluarSaludCanal,
  renderizarMiniTrazaPPG
} from '../services/multiCanalService'

const props = defineProps({
  canales: {
    type: Array,
    required: true,
    default: () => []
  },
  canalSeleccionado: {
    type: Number,
    default: 1
  },
  miCanalAsignado: {
    type: Number,
    default: null
  },
  obtenerNombreAsignado: {
    type: Function,
    default: () => null
  }
})

defineEmits(['select'])

const modoVista = ref('tarjetas')
const filtroActivo = ref('todos')

const canvasRefs = new Map()

function setCanvasRef(canalNum, el) {
  if (el) {
    canvasRefs.set(canalNum, el)
  } else {
    canvasRefs.delete(canalNum)
  }
}

// Métricas agregadas de los 5 canales
const metricasGrupales = computed(() => {
  return calcularMetricasGrupales(props.canales)
})

// Canales según filtro
const canalesFiltrados = computed(() => {
  return filtrarCanales(props.canales, filtroActivo.value, props.miCanalAsignado)
})

// Evaluación de salud por canal
function tieneAlertaCanal(canalData) {
  return evaluarSaludCanal(canalData).tieneAlerta
}

function obtenerTextoAlerta(canalData) {
  return evaluarSaludCanal(canalData).tipoAlerta || 'Alerta Fisiológica'
}

function evaluarBpm(bpm) {
  if (!bpm || bpm <= 0) return 'desconocido'
  if (bpm > 100) return 'taquicardia'
  if (bpm < 60) return 'bradicardia'
  return 'normal'
}

function etiquetaBpm(bpm) {
  if (!bpm || bpm <= 0) return '--'
  if (bpm > 100) return 'Rango de taquicardia'
  if (bpm < 60) return 'Rango de bradicardia'
  return 'Rango normal'
}

function evaluarSpo2(spo2) {
  if (!spo2 || spo2 <= 0) return 'desconocido'
  if (spo2 < 90) return 'severa'
  if (spo2 < 95) return 'leve'
  return 'normal'
}

function etiquetaSpo2(spo2) {
  if (!spo2 || spo2 <= 0) return '--'
  if (spo2 < 90) return 'Tendencia a hipoxia severa'
  if (spo2 < 95) return 'Tendencia a hipoxia leve'
  return 'Normal'
}

// Actualización continua de las mini-trazas PPG de los 5 canales
let animFrameId = null

function dibujarTrazas() {
  canvasRefs.forEach((canvas, canalNum) => {
    const ch = props.canales.find(c => c.canal === canalNum)
    const muestras = (ch && Array.isArray(ch.ir)) ? ch.ir : []
    const esActivo = props.canalSeleccionado === canalNum
    const strokeColor = esActivo ? '#0284c7' : '#10b981'
    const fillColor = esActivo ? 'rgba(2, 132, 199, 0.12)' : 'rgba(16, 185, 129, 0.08)'

    renderizarMiniTrazaPPG(canvas, muestras, { strokeColor, fillColor })
  })
}

// Redibujar periódicamente cuando cambien los datos de los canales
watch(() => props.canales, () => {
  dibujarTrazas()
}, { deep: true })

onMounted(() => {
  dibujarTrazas()
})

onBeforeUnmount(() => {
  if (animFrameId) cancelAnimationFrame(animFrameId)
})
</script>

<style scoped>
.multicanal-container {
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
}

.multicanal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  padding-bottom: 1rem;
  margin-bottom: 1rem;
}

.header-tags {
  display: flex;
  gap: 0.4rem;
  align-items: center;
  margin-bottom: 0.35rem;
}

.tag-badge {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #2563eb;
  background: #eff6ff;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
}

.badge-total-canales {
  font-size: 0.72rem;
  font-weight: 700;
  color: #047857;
  background: #ecfdf5;
  padding: 0.2rem 0.5rem;
  border-radius: 6px;
}

.multicanal-title {
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--color-text, #1e293b);
  margin: 0 0 0.25rem 0;
}

.multicanal-subtitle {
  font-size: 0.85rem;
  color: var(--color-muted, #64748b);
  margin: 0;
  max-width: 680px;
}

.view-mode-selector {
  display: flex;
  background: #f1f5f9;
  padding: 0.25rem;
  border-radius: 8px;
  gap: 0.25rem;
}

.mode-btn {
  background: transparent;
  border: none;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s ease;
}

.mode-btn.active {
  background: #ffffff;
  color: #0f172a;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.08);
}

/* Barra de Telemetría Grupal */
.telemetria-grupal-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  margin-bottom: 1.25rem;
}

.telemetria-stat-pill {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  background: #ffffff;
  padding: 0.35rem 0.75rem;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
  font-size: 0.8rem;
}

.stat-icon {
  font-size: 1rem;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-label {
  font-size: 0.68rem;
  color: #64748b;
  line-height: 1;
}

.stat-value {
  font-size: 0.95rem;
  font-weight: 700;
  color: #1e293b;
}

.stat-value small {
  font-size: 0.7rem;
  font-weight: normal;
  color: #64748b;
}

.stat-alerta {
  border-color: #fca5a5;
  background: #fff1f2;
}

.filtros-container {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-left: auto;
  flex-wrap: wrap;
}

.filtro-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: #64748b;
}

.filtros-pills {
  display: flex;
  gap: 0.3rem;
}

.filtro-btn {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.25rem 0.55rem;
  border-radius: 9999px;
  cursor: pointer;
  color: #475569;
  transition: all 0.15s ease;
}

.filtro-btn.active {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
}

.filtro-btn.btn-alerta {
  border-color: #f87171;
  color: #b91c1c;
}

.filtro-btn.btn-alerta.active {
  background: #ef4444;
  color: #ffffff;
}

.filtro-btn.btn-mi-canal.active {
  background: #4f46e5;
  color: #ffffff;
}

/* VISTA 1: GRID DE TARJETAS MEJORADAS */
.canales-grid-view {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 1rem;
}

.canal-card-enhanced {
  background: #ffffff;
  border: 2px solid #e2e8f0;
  border-radius: 10px;
  padding: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.canal-card-enhanced:hover {
  transform: translateY(-2px);
  border-color: #3b82f6;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.08);
}

.canal-card-enhanced.selected {
  border-color: #2563eb;
  background: #f0f7ff;
  box-shadow: 0 0 0 2px rgba(37, 99, 235, 0.25);
}

.canal-card-enhanced.es-mi-canal {
  border-color: #4f46e5;
  background: #faf5ff;
}

.canal-card-enhanced.en-alerta {
  border-color: #ef4444;
  animation: pulse-border 2s infinite;
}

@keyframes pulse-border {
  0% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.4); }
  70% { box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
  100% { box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
}

.card-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.35rem;
}

.canal-tag-wrapper {
  display: flex;
  align-items: center;
  gap: 0.3rem;
}

.canal-title-badge {
  font-size: 0.85rem;
  font-weight: 800;
  color: #1e293b;
}

.badge-mi-canal {
  font-size: 0.65rem;
  font-weight: 700;
  color: #ffffff;
  background: #4f46e5;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  text-transform: uppercase;
}

.badge-alerta-chip {
  font-size: 0.65rem;
  font-weight: 700;
  color: #991b1b;
  background: #fee2e2;
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}

.user-assigned-badge {
  font-size: 0.72rem;
  color: #1e40af;
  background: #dbeafe;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  margin-bottom: 0.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.free-channel-badge {
  font-size: 0.72rem;
  color: #15803d;
  background: #dcfce7;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  margin-bottom: 0.5rem;
}

/* Mini Canvas Wave */
.mini-wave-wrapper {
  position: relative;
  width: 100%;
  height: 48px;
  background: #0f172a;
  border-radius: 6px;
  overflow: hidden;
  margin-bottom: 0.65rem;
}

.mini-wave-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.mini-wave-label {
  position: absolute;
  top: 2px;
  right: 5px;
  font-size: 0.62rem;
  font-family: monospace;
  color: #64748b;
}

/* Métricas en Tarjeta */
.metricas-fisiologicas-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.metrica-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.metrica-header {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: 0.68rem;
  font-weight: 700;
  color: #64748b;
}

.metrica-valor {
  font-size: 1.2rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.1;
  margin: 0.15rem 0;
}

.metrica-valor small {
  font-size: 0.7rem;
  font-weight: 500;
  color: #64748b;
}

.metrica-badge {
  font-size: 0.62rem;
  font-weight: 700;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
}

.badge-bpm-normal { background: #dcfce7; color: #15803d; }
.badge-bpm-taquicardia { background: #fee2e2; color: #b91c1c; }
.badge-bpm-bradicardia { background: #fef3c7; color: #b45309; }

.badge-spo2-normal { background: #e0f2fe; color: #0369a1; }
.badge-spo2-leve { background: #fef3c7; color: #b45309; }
.badge-spo2-severa { background: #fee2e2; color: #b91c1c; }

.card-action-footer {
  text-align: center;
  border-top: 1px dashed #e2e8f0;
  padding-top: 0.4rem;
  font-size: 0.72rem;
}

.active-focus-tag {
  color: #2563eb;
  font-weight: 700;
}

.inactive-focus-tag {
  color: #64748b;
}

/* VISTA 2: CENTRAL DE TELEMETRÍA (MONITOR UCI) */
.central-rack {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.central-track-row {
  display: grid;
  grid-template-columns: 160px 1fr 110px 110px 90px;
  align-items: center;
  gap: 0.75rem;
  background: #0b1120;
  border: 1px solid #1e293b;
  border-radius: 8px;
  padding: 0.65rem 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  color: #ffffff;
}

@media (max-width: 900px) {
  .central-track-row {
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }
}

.central-track-row:hover {
  border-color: #38bdf8;
  background: #0f172a;
}

.central-track-row.track-selected {
  border-color: #38bdf8;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.3);
}

.central-track-row.track-alerta {
  border-color: #ef4444;
}

.track-info-col {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.track-header {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.track-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: #38bdf8;
}

.badge-mi-canal-sm {
  font-size: 0.6rem;
  font-weight: 800;
  color: #ffffff;
  background: #6366f1;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
}

.track-user {
  font-size: 0.72rem;
  color: #94a3b8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.track-waveform-col {
  position: relative;
  height: 60px;
  background: #020617;
  border-radius: 6px;
  overflow: hidden;
}

.panoramic-wave-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.wave-overlay-info {
  position: absolute;
  bottom: 2px;
  right: 6px;
  display: flex;
  gap: 0.4rem;
  font-size: 0.6rem;
  font-family: monospace;
}

.wave-tag {
  color: #475569;
}

.wave-focused-tag {
  color: #38bdf8;
  font-weight: 700;
}

.track-metric-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  background: #020617;
  border: 1px solid #1e293b;
  border-radius: 6px;
  padding: 0.4rem;
}

.metric-top {
  display: flex;
  align-items: center;
  gap: 0.2rem;
  font-size: 0.62rem;
  font-weight: 700;
  color: #64748b;
}

.metric-huge {
  font-size: 1.4rem;
  font-weight: 800;
  line-height: 1.1;
  color: #f8fafc;
}

.metric-huge small {
  font-size: 0.75rem;
  color: #94a3b8;
}

.metric-pill {
  font-size: 0.62rem;
  font-weight: 700;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  margin-top: 0.15rem;
}

.btn-track-focus {
  width: 100%;
  padding: 0.4rem 0.6rem;
  background: #1e293b;
  border: 1px solid #334155;
  color: #f1f5f9;
  border-radius: 6px;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-track-focus:hover {
  background: #334155;
  border-color: #38bdf8;
}

.btn-focus-active {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
}

/* VISTA 3: TABLA COMPARATIVA */
.comparativa-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.comparativa-table th {
  background: #f8fafc;
  padding: 0.6rem 0.75rem;
  border-bottom: 2px solid #e2e8f0;
  text-align: left;
  font-weight: 700;
  color: #475569;
}

.comparativa-table td {
  padding: 0.65rem 0.75rem;
  border-bottom: 1px solid #e2e8f0;
}

.table-metric-cell {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.mini-pill {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
}

.pill-normal { background: #dcfce7; color: #15803d; }
.pill-taquicardia { background: #fee2e2; color: #b91c1c; }
.pill-bradicardia { background: #fef3c7; color: #b45309; }
.pill-leve { background: #fef3c7; color: #b45309; }
.pill-severa { background: #fee2e2; color: #b91c1c; }

.alerta-badge-cell {
  color: #b91c1c;
  font-weight: 700;
}

.ok-badge-cell {
  color: #15803d;
  font-weight: 600;
}

.user-chip {
  background: #dbeafe;
  color: #1e40af;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.free-chip {
  background: #dcfce7;
  color: #15803d;
  padding: 0.15rem 0.4rem;
  border-radius: 4px;
  font-size: 0.75rem;
}

.badge-mi-canal-xs {
  font-size: 0.65rem;
  font-weight: 700;
  color: #4f46e5;
  background: #e0e7ff;
  padding: 0.1rem 0.3rem;
  border-radius: 4px;
  margin-left: 0.3rem;
}

/* Animación del corazón */
.heart-pulse-dot {
  display: inline-block;
}

.heart-pulse-dot.beating {
  animation: pulse-heart 0.9s infinite;
}

@keyframes pulse-heart {
  0% { transform: scale(1); }
  15% { transform: scale(1.3); }
  30% { transform: scale(1); }
  45% { transform: scale(1.15); }
  60% { transform: scale(1); }
  100% { transform: scale(1); }
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.text-primary { color: #2563eb; }
.text-cyan { color: #0284c7; }
.text-danger { color: #dc2626; }
.text-success { color: #16a34a; }
</style>
