<template>
  <div class="bpm-card-container card">
    <div class="bpm-card-header">
      <div class="header-title-box">
        <div class="tag-badge">RF07 · Frecuencia Cardíaca en Tiempo Real</div>
        <h3 class="card-main-title">Monitor de Frecuencia Cardíaca (BPM)</h3>
      </div>

      <div class="channel-indicator-badge">
        <span class="pulse-indicator-dot" :class="{ beating: pulsando }"></span>
        <span>Canal {{ canal }} · ESP32</span>
      </div>
    </div>

    <div class="bpm-main-grid">
      <!-- Sección Izquierda: Valor Principal Digital y Corazón Pulsátil -->
      <div class="bpm-hero-box">
        <div class="heart-pulse-wrapper">
          <div 
            class="heart-icon" 
            :class="{ active: tieneLecturaValida }"
            :style="animacionCorazonStyle"
          >
            ❤️
          </div>
          <span v-if="tieneLecturaValida" class="pulse-wave-ring"></span>
        </div>

        <div class="bpm-readout-group">
          <div class="bpm-number-display font-mono">
            {{ tieneLecturaValida ? bpmActual.toFixed(1) : '--.-' }}
          </div>
          <div class="bpm-unit-label">
            <span class="unit-text">BPM</span>
            <span class="sub-text">latidos por minuto</span>
          </div>
        </div>

        <div class="bpm-status-badge-container">
          <span 
            class="status-pill"
            :class="'pill-' + estadoRitmo"
          >
            {{ etiquetaEstadoRitmo }}
          </span>
          <span 
            v-if="tieneLecturaValida"
            class="range-pill"
            :class="dentroDeRango ? 'in-range' : 'out-of-range'"
          >
            {{ dentroDeRango ? '✓ Dentro de rango' : '⚠️ Fuera de rango' }}
          </span>
        </div>
      </div>

      <!-- Sección Derecha: Estadísticas en Tiempo Real y Rango Esperado -->
      <div class="bpm-metrics-panel">
        <div class="metric-item card-sub">
          <span class="metric-title">Instantáneo</span>
          <span class="metric-val font-mono">{{ instantBpm > 0 ? instantBpm.toFixed(1) : '--' }} <small>BPM</small></span>
          <span class="metric-sub">Último pulso</span>
        </div>

        <div class="metric-item card-sub">
          <span class="metric-title">Promedio Sesión</span>
          <span class="metric-val font-mono">{{ promedioBpm > 0 ? promedioBpm.toFixed(1) : '--' }} <small>BPM</small></span>
          <span class="metric-sub">{{ totalLecturas }} lecturas</span>
        </div>

        <div class="metric-item card-sub">
          <span class="metric-title">Mínimo / Máximo</span>
          <span class="metric-val font-mono">
            {{ minBpm ? minBpm.toFixed(0) : '--' }} / {{ maxBpm ? maxBpm.toFixed(0) : '--' }}
          </span>
          <span class="metric-sub">Rango observado</span>
        </div>

        <div class="metric-item card-sub">
          <span class="metric-title">Intervalo Interlatido (IBI)</span>
          <span class="metric-val font-mono text-primary">{{ ibiMs > 0 ? ibiMs : '--' }} <small>ms</small></span>
          <span class="metric-sub">Tiempo entre picos R-R</span>
        </div>
      </div>
    </div>

    <!-- Barra de Rango Fisiológico y Estabilidad del Pulso -->
    <div class="bpm-footer-bar">
      <div class="footer-col">
        <span class="footer-lbl">Rango fisiológico esperado (AHA):</span>
        <span class="footer-val font-mono">
          {{ rangoEsperado.min }} - {{ rangoEsperado.max }} BPM
          <small class="text-muted">({{ rangoEsperado.descripcion }})</small>
        </span>
      </div>

      <div class="footer-col">
        <span class="footer-lbl">Estabilidad de la señal:</span>
        <div class="stability-box">
          <span class="stability-dot" :class="'stability-' + estabilidadNivel"></span>
          <span class="footer-val">{{ estabilidadTexto }}</span>
        </div>
      </div>

      <div class="footer-col actions-col">
        <button 
          type="button" 
          class="btn-explain" 
          @click="mostrarExplicacion = !mostrarExplicacion"
          title="Ver cómo se obtiene el BPM según RF22"
        >
          🔬 ¿Cómo se calcula? (RF22)
        </button>
      </div>
    </div>

    <!-- Panel Educativo Desplegable: Explicación de Obtención del BPM (RF22) -->
    <div v-if="mostrarExplicacion" class="educational-panel alert alert-info">
      <div class="educational-header">
        <strong>Fisiología e Ingeniería de la Medición de BPM (RF22):</strong>
        <button type="button" class="btn-close-sm" @click="mostrarExplicacion = false">✕</button>
      </div>
      <div class="pipeline-steps">
        <div class="step-card">
          <span class="step-num">1</span>
          <strong>Emisión IR (880 nm)</strong>
          <p>El sensor MAX30102 emite luz infrarroja hacia el lecho vascular digital.</p>
        </div>
        <div class="step-arrow">→</div>
        <div class="step-card">
          <span class="step-num">2</span>
          <strong>Reflexión & Fotodiodo</strong>
          <p>La intensidad de luz reflejada varía en cada contracción cardíaca (eyección sistólica).</p>
        </div>
        <div class="step-arrow">→</div>
        <div class="step-card">
          <span class="step-num">3</span>
          <strong>Detección de Picos</strong>
          <p>El algoritmo identifica los picos sistólicos ($P_{sys}$) y calcula el intervalo $\Delta t$ (ms).</p>
        </div>
        <div class="step-arrow">→</div>
        <div class="step-card">
          <span class="step-num">4</span>
          <strong>Fórmula de Conversión</strong>
          <p><code>BPM = 60000 / Intervalo_ms</code></p>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  obtenerRangosBpmEsperados,
  evaluarRangoBpm,
  esBpmValido,
  calcularIbiMs
} from '../services/bpmService'

const props = defineProps({
  canal: {
    type: Number,
    default: 1
  },
  bpm: {
    type: Number,
    default: 0
  },
  instantBpm: {
    type: Number,
    default: 0
  },
  promedioBpm: {
    type: Number,
    default: 0
  },
  minBpm: {
    type: Number,
    default: null
  },
  maxBpm: {
    type: Number,
    default: null
  },
  totalLecturas: {
    type: Number,
    default: 0
  },
  estabilidadTexto: {
    type: String,
    default: 'Ritmo Estable'
  },
  estabilidadNivel: {
    type: String,
    default: 'alta' // 'alta' | 'normal' | 'moderada'
  },
  edadPaciente: {
    type: Number,
    default: 25
  },
  actividadPaciente: {
    type: String,
    default: 'reposo'
  }
})

const mostrarExplicacion = ref(false)
const pulsando = ref(true)

const bpmActual = computed(() => Number(props.bpm) || 0)
const tieneLecturaValida = computed(() => esBpmValido(bpmActual.value))

const ibiMs = computed(() => {
  return calcularIbiMs(bpmActual.value)
})

const rangoEsperado = computed(() => {
  return obtenerRangosBpmEsperados(props.edadPaciente, props.actividadPaciente)
})

const evaluacion = computed(() => {
  return evaluarRangoBpm(bpmActual.value, rangoEsperado.value)
})

const dentroDeRango = computed(() => evaluacion.value.dentroDeRango)
const estadoRitmo = computed(() => evaluacion.value.estado)

const etiquetaEstadoRitmo = computed(() => {
  if (!tieneLecturaValida.value) return 'Sin señal'
  if (estadoRitmo.value === 'taquicardia') return 'Taquicardia (>100)'
  if (estadoRitmo.value === 'bradicardia') return 'Bradicardia (<60)'
  return 'Normocardia (Normal)'
})

// Animación de latido sincronizada con el valor en BPM
const animacionCorazonStyle = computed(() => {
  if (!tieneLecturaValida.value) return {}
  const periodoSegundos = 60 / Math.max(30, Math.min(200, bpmActual.value))
  return {
    animation: `heartbeatAnim ${periodoSegundos}s infinite ease-in-out`
  }
})
</script>

<style scoped>
.bpm-card-container {
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
}

.bpm-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.tag-badge {
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-primary);
  background: #dbeafe;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  display: inline-block;
  margin-bottom: 0.25rem;
}

.card-main-title {
  font-size: 1.25rem;
  font-weight: 800;
  margin: 0;
  color: var(--color-text);
}

.channel-indicator-badge {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  padding: 0.35rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.8rem;
  font-weight: 600;
}

.pulse-indicator-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: #10b981;
}

.pulse-indicator-dot.beating {
  box-shadow: 0 0 6px #10b981;
}

.bpm-main-grid {
  display: grid;
  grid-template-columns: 1fr 1.35fr;
  gap: 1.25rem;
  margin-bottom: 1.25rem;
}

@media (max-width: 768px) {
  .bpm-main-grid {
    grid-template-columns: 1fr;
  }
}

.bpm-hero-box {
  background: #f8fafc;
  border: 2px solid #e2e8f0;
  border-radius: 0.75rem;
  padding: 1.5rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}

.heart-pulse-wrapper {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 0.5rem;
}

.heart-icon {
  font-size: 2.25rem;
  transform-origin: center;
  user-select: none;
}

@keyframes heartbeatAnim {
  0% { transform: scale(1); }
  15% { transform: scale(1.28); }
  28% { transform: scale(1.05); }
  42% { transform: scale(1.18); }
  60% { transform: scale(1); }
  100% { transform: scale(1); }
}

.bpm-readout-group {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.bpm-number-display {
  font-size: 3.5rem;
  font-weight: 900;
  line-height: 1;
  color: var(--color-text);
  letter-spacing: -0.05em;
}

.bpm-unit-label {
  display: flex;
  flex-direction: column;
}

.unit-text {
  font-size: 1.2rem;
  font-weight: 800;
  color: #dc2626;
  line-height: 1;
}

.sub-text {
  font-size: 0.72rem;
  color: var(--color-muted);
}

.bpm-status-badge-container {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  justify-content: center;
}

.status-pill {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
}

.pill-normal { background: #dcfce7; color: #15803d; border: 1px solid #bbf7d0; }
.pill-taquicardia { background: #fee2e2; color: #b91c1c; border: 1px solid #fecaca; }
.pill-bradicardia { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
.pill-invalido { background: #f1f5f9; color: #64748b; }

.range-pill {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
}

.range-pill.in-range { background: #eff6ff; color: #1d4ed8; }
.range-pill.out-of-range { background: #fff7ed; color: #c2410c; }

.bpm-metrics-panel {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.card-sub {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.metric-title {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-muted);
}

.metric-val {
  font-size: 1.45rem;
  font-weight: 800;
  color: var(--color-text);
  line-height: 1.2;
  margin: 0.2rem 0;
}

.metric-val small {
  font-size: 0.75rem;
  color: var(--color-muted);
  font-weight: 600;
}

.metric-sub {
  font-size: 0.7rem;
  color: var(--color-muted);
}

.text-primary {
  color: var(--color-primary);
}

.bpm-footer-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #f8fafc;
  border: 1px dashed var(--color-border);
  border-radius: 0.5rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.footer-col {
  display: flex;
  flex-direction: column;
}

.footer-lbl {
  font-size: 0.72rem;
  color: var(--color-muted);
  font-weight: 600;
}

.footer-val {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text);
}

.stability-box {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.stability-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.stability-alta { background: #10b981; }
.stability-normal { background: #3b82f6; }
.stability-moderada { background: #f59e0b; }

.btn-explain {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: var(--color-text);
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.35rem 0.65rem;
  border-radius: 0.35rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-explain:hover {
  background: #f1f5f9;
  border-color: var(--color-primary);
  color: var(--color-primary);
}

.educational-panel {
  margin-top: 1rem;
  padding: 1rem;
  border-radius: 0.5rem;
}

.educational-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.btn-close-sm {
  background: none;
  border: none;
  font-size: 1rem;
  cursor: pointer;
  color: var(--color-muted);
}

.pipeline-steps {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.step-card {
  flex: 1;
  min-width: 140px;
  background: #ffffff;
  padding: 0.65rem;
  border-radius: 0.4rem;
  border: 1px solid #cbd5e1;
  font-size: 0.75rem;
}

.step-num {
  display: inline-block;
  width: 18px;
  height: 18px;
  line-height: 18px;
  text-align: center;
  border-radius: 50%;
  background: var(--color-primary);
  color: #ffffff;
  font-weight: 800;
  font-size: 0.65rem;
  margin-bottom: 0.25rem;
}

.step-card p {
  margin: 0.25rem 0 0 0;
  color: var(--color-muted);
  font-size: 0.72rem;
}

.step-arrow {
  color: #94a3b8;
  font-weight: 800;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
