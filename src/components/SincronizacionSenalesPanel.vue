<template>
  <section class="sync-panel-wrapper" aria-labelledby="titulo-sincronizacion-senales">
    <!-- 1. Encabezado y Selector de Fase -->
    <div class="sync-header-card">
      <div class="sync-header-left">
        <h2 id="titulo-sincronizacion-senales" class="sync-title">
          Sincronización Temporal de Bioseñales
        </h2>
        <p class="sync-subtitle">
          Alineación automática de ondas fotopletismográficas según el método configurado por la administración.
        </p>
        <div class="sync-badge-row">
          <span class="metodo-activo-pill">
            Método activo: {{ resultadoSync.nombreMetodo }}
          </span>
        </div>
      </div>

      <div class="sync-toggle-pill" role="group" aria-label="Modo de alineación temporal">
        <button
          type="button"
          class="sync-toggle-btn"
          :class="{ 'sync-toggle-btn--active': sincronizada }"
          @click="cambiarEstadoSync(true)"
        >
          Señales Sincronizadas (En Fase)
        </button>
        <button
          type="button"
          class="sync-toggle-btn"
          :class="{ 'sync-toggle-btn--active': !sincronizada }"
          @click="cambiarEstadoSync(false)"
        >
          Sin Sincronizar (Original)
        </button>
      </div>
    </div>

    <!-- 2. Franja de 4 Indicadores de Sincronización -->
    <div class="sync-kpis-grid">
      <div class="sync-kpi-card">
        <span class="kpi-label">Método del Sistema</span>
        <div class="kpi-value">{{ resultadoSync.nombreMetodo }}</div>
      </div>

      <div class="sync-kpi-card">
        <span class="kpi-label">Desfase Corregido (Δt)</span>
        <div class="kpi-value">
          <strong>{{ resultadoSync.desfaseMs }} ms</strong>
          <span class="kpi-sub">({{ sincronizada ? 'Alineado a 0 ms' : 'Sin corregir' }})</span>
        </div>
      </div>

      <div class="sync-kpi-card">
        <span class="kpi-label">Índice de Similitud</span>
        <div class="kpi-value">
          <strong>{{ resultadoSync.similitudPorcentaje.toFixed(1) }}%</strong>
          <span class="kpi-sub">({{ etiquetaCorrelacion }})</span>
        </div>
      </div>

      <div class="sync-kpi-card">
        <span class="kpi-label">Diferencia de Frecuencia</span>
        <div class="kpi-value">
          <strong>{{ signoDeltaBpm }}{{ resultadoSync.diferenciaBpm }} BPM</strong>
          <span class="kpi-sub">({{ bpmActual }} vs {{ bpmReferencia }} BPM)</span>
        </div>
      </div>
    </div>

    <!-- 3. Osciloscopio de Alineación Temporal -->
    <div class="sync-oscilloscope-card">
      <div class="sync-osc-canvas-box">
        <svg
          viewBox="0 0 920 230"
          width="100%"
          height="100%"
          preserveAspectRatio="none"
          role="img"
          aria-label="Gráfico de sincronización temporal entre la medición tomada y la señal de referencia"
        >
          <defs>
            <pattern id="sync-grid-pattern" width="46" height="28" patternUnits="userSpaceOnUse">
              <path d="M 46 0 L 0 0 0 28" fill="none" stroke="#131c31" stroke-width="0.9" />
            </pattern>
            <filter id="glow-green" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="2.2" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
            <filter id="glow-cyan" x="-10%" y="-10%" width="120%" height="120%">
              <feGaussianBlur stdDeviation="1.8" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>

          <!-- Fondo oscuro del osciloscopio -->
          <rect x="42" y="10" width="864" height="190" fill="#070b14" rx="6" />
          <rect x="42" y="10" width="864" height="190" fill="url(#sync-grid-pattern)" rx="6" />

          <!-- Etiquetas eje Y (mV) -->
          <g fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="end">
            <text x="36" y="24">8 mV</text>
            <text x="36" y="54">6 mV</text>
            <text x="36" y="84">4 mV</text>
            <text x="36" y="114">2 mV</text>
            <text x="36" y="144">0 mV</text>
            <text x="36" y="174">-2 mV</text>
            <text x="36" y="196">-4 mV</text>
          </g>

          <!-- Línea base 0 mV -->
          <line x1="42" y1="142" x2="906" y2="142" stroke="#1e293b" stroke-width="1" />

          <!-- Marcador vertical del pico sistólico alineado -->
          <line
            :x1="xPicoMarcador"
            y1="14"
            :x2="xPicoMarcador"
            y2="196"
            stroke="#94a3b8"
            stroke-width="1.2"
            stroke-dasharray="4,4"
          />
          <text
            :x="xPicoMarcador + 8"
            y="32"
            fill="#e2e8f0"
            font-size="11.5"
            font-weight="600"
            font-family="system-ui, -apple-system, sans-serif"
          >
            {{ sincronizada
              ? 'Pico Sistólico Alineado (Δt = 0 ms)'
              : `Desfase Temporal Original (Δt = ${resultadoSync.desfaseMs} ms)` }}
          </text>

          <!-- Onda de Referencia (Cyan punteada) -->
          <path
            :d="pathReferencia"
            fill="none"
            stroke="#22d3ee"
            stroke-width="2.3"
            stroke-dasharray="6,4"
            stroke-linecap="round"
            filter="url(#glow-cyan)"
          />

          <!-- Onda de Medición Tomada (Verde continua) -->
          <path
            :d="pathMedicion"
            fill="none"
            stroke="#22c55e"
            stroke-width="2.6"
            stroke-linecap="round"
            filter="url(#glow-green)"
          />

          <!-- Etiquetas eje X (ms) -->
          <g fill="#94a3b8" font-size="10" font-family="monospace" text-anchor="middle">
            <text x="55" y="218">0 ms</text>
            <text x="175" y="218">500 ms</text>
            <text x="295" y="218">1000 ms</text>
            <text x="415" y="218">1500 ms</text>
            <text x="535" y="218">2000 ms</text>
            <text x="655" y="218">2500 ms</text>
            <text x="775" y="218">3000 ms</text>
            <text x="888" y="218">3500 ms</text>
          </g>
        </svg>

        <!-- Leyenda superior derecha dentro del osciloscopio -->
        <div class="sync-osc-legend">
          <div class="legend-row">
            <span class="legend-line legend-line--green"></span>
            <span>{{ nombreMedicion }} ({{ bpmActual }} BPM)</span>
          </div>
          <div class="legend-row">
            <span class="legend-line legend-line--cyan"></span>
            <span>{{ nombreReferencia }} ({{ bpmReferencia }} BPM)</span>
          </div>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { obtenerMetodoSincronizacion } from '../services/panelAdminService.js'
import { METODO_POR_DEFECTO } from '../utils/panelAdmin.js'
import { sincronizarSenalesComparadas } from '../utils/sincronizacionSenales.js'

const props = defineProps({
  bpmActual: { type: Number, default: 78 },
  bpmReferencia: { type: Number, default: 72 },
  amplitudActual: { type: Number, default: 100 },
  nombreMedicion: { type: String, default: 'Medición Tomada' },
  nombreReferencia: { type: String, default: 'Señal de Referencia' }
})

const emit = defineEmits(['cambio-sincronizacion'])

const metodoActivo = ref(METODO_POR_DEFECTO)
const sincronizada = ref(true)

const resultadoSync = computed(() =>
  sincronizarSenalesComparadas({
    metodo: metodoActivo.value,
    sincronizada: sincronizada.value,
    bpmBase: props.bpmActual,
    bpmComparada: props.bpmReferencia,
    amplitudBase: props.amplitudActual,
    amplitudComparada: 100,
    duracionSegundos: 3.5,
    frecuenciaHz: 100,
    desfaseInicialMs: -42
  })
)

const etiquetaCorrelacion = computed(() => {
  const p = resultadoSync.value.similitudPorcentaje
  if (p >= 90) return 'Correlación Alta'
  if (p >= 78) return 'Correlación Moderada'
  return 'Sin Alinear'
})

const signoDeltaBpm = computed(() => (resultadoSync.value.diferenciaBpm > 0 ? '+' : ''))

function construirPath(muestras = []) {
  if (!muestras.length) return ''
  const xInicio = 46
  const anchoUtil = 856
  const yBase = 166
  const escalaY = 122
  const pasoX = anchoUtil / Math.max(1, muestras.length - 1)

  const puntos = muestras.map((v, idx) => {
    const x = (xInicio + idx * pasoX).toFixed(1)
    const y = (yBase - v * escalaY).toFixed(1)
    return `${x},${y}`
  })
  return `M ${puntos.join(' L ')}`
}

const pathMedicion = computed(() => construirPath(resultadoSync.value.senalBase))
const pathReferencia = computed(() => construirPath(resultadoSync.value.senalComparadaActiva))

const xPicoMarcador = computed(() => {
  const total = Math.max(1, resultadoSync.value.senalBase.length - 1)
  const idx = resultadoSync.value.picoAlineadoIdx || 38
  return Math.round(46 + (idx / total) * 856)
})

function emitirEstado() {
  emit('cambio-sincronizacion', {
    metodo: resultadoSync.value.metodo,
    nombreMetodo: resultadoSync.value.nombreMetodo,
    sincronizada: sincronizada.value,
    desfaseMs: resultadoSync.value.desfaseMs,
    similitud: resultadoSync.value.similitud,
    similitudPorcentaje: resultadoSync.value.similitudPorcentaje
  })
}

function cambiarEstadoSync(valor) {
  sincronizada.value = Boolean(valor)
  emitirEstado()
}

async function cargarMetodoConfigurado() {
  try {
    const res = await obtenerMetodoSincronizacion()
    if (res?.success && res?.data?.metodo) {
      metodoActivo.value = res.data.metodo
      emitirEstado()
    }
  } catch {
    // usa el método por defecto
  }
}

function alActualizarMetodo(ev) {
  const nuevo = ev?.detail?.metodo
  if (nuevo) {
    metodoActivo.value = nuevo
    emitirEstado()
  } else {
    cargarMetodoConfigurado()
  }
}

watch(
  () => [props.bpmActual, props.bpmReferencia, props.amplitudActual],
  () => emitirEstado()
)

onMounted(() => {
  cargarMetodoConfigurado()
  if (typeof window !== 'undefined') {
    window.addEventListener('metodo-sincronizacion-actualizado', alActualizarMetodo)
  }
})

onUnmounted(() => {
  if (typeof window !== 'undefined') {
    window.removeEventListener('metodo-sincronizacion-actualizado', alActualizarMetodo)
  }
})
</script>

<style scoped>
.sync-panel-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  margin-bottom: 1.25rem;
}

.sync-header-card {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 0.75rem;
  padding: 1.15rem 1.35rem;
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}

.sync-header-left {
  flex: 1;
  min-width: 260px;
}

.sync-title {
  font-size: 1.2rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.25rem 0;
}

.sync-subtitle {
  font-size: 0.875rem;
  color: #475569;
  margin: 0 0 0.65rem 0;
}

.sync-badge-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.metodo-activo-pill {
  display: inline-flex;
  align-items: center;
  background: #002b49;
  color: #e0f2fe;
  border: 1.5px solid #38bdf8;
  border-radius: 999px;
  padding: 0.28rem 0.85rem;
  font-size: 0.8rem;
  font-weight: 700;
  box-shadow: 0 0 0 2px rgba(56, 189, 248, 0.15);
}

.sync-toggle-pill {
  display: inline-flex;
  align-items: center;
  background: #f8fafc;
  border: 1px solid #94a3b8;
  border-radius: 999px;
  padding: 0.2rem;
  gap: 0.2rem;
}

.sync-toggle-btn {
  border: none;
  background: transparent;
  color: #1e293b;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.42rem 0.9rem;
  border-radius: 999px;
  cursor: pointer;
  transition: all 0.15s ease;
  white-space: nowrap;
}

.sync-toggle-btn--active {
  background: #002b49;
  color: #ffffff;
  box-shadow: 0 1px 4px rgba(0, 43, 73, 0.25);
}

.sync-kpis-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 0.75rem;
}

@media (max-width: 900px) {
  .sync-kpis-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}

@media (max-width: 520px) {
  .sync-kpis-grid {
    grid-template-columns: 1fr;
  }
}

.sync-kpi-card {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 0.65rem;
  padding: 0.85rem 1rem;
  box-shadow: 0 1px 2px rgba(15, 23, 42, 0.03);
}

.kpi-label {
  display: block;
  font-size: 0.78rem;
  color: #475569;
  font-weight: 600;
  margin-bottom: 0.3rem;
}

.kpi-value {
  font-size: 1.05rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.3;
}

.kpi-sub {
  font-size: 0.82rem;
  font-weight: 500;
  color: #334155;
  margin-left: 0.25rem;
}

.sync-oscilloscope-card {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 0.75rem;
  padding: 0.7rem;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.05);
}

.sync-osc-canvas-box {
  position: relative;
  width: 100%;
  height: 230px;
  background: #070b14;
  border-radius: 0.55rem;
  overflow: hidden;
}

.sync-osc-legend {
  position: absolute;
  top: 14px;
  right: 18px;
  background: rgba(15, 23, 42, 0.86);
  border: 1px solid #1e293b;
  border-radius: 0.45rem;
  padding: 0.45rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
  font-size: 0.76rem;
  color: #e2e8f0;
}

.legend-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.legend-line {
  display: inline-block;
  width: 16px;
  height: 0;
}

.legend-line--green {
  border-top: 3px solid #22c55e;
}

.legend-line--cyan {
  border-top: 2.5px dashed #22d3ee;
}
</style>
