<template>
  <div class="comparador-patologias-card card">
    <!-- Encabezado de la sección de ritmos de referencia (RF25, RF94) -->
    <div class="card-head-bar">
      <div>
        <h3 class="card-title">
          Comparación con ritmos de referencia: patologías y arritmias para aprender
        </h3>
        <p class="card-desc">
          Compara la forma de tu señal fotopletismográfica (PPG) con una biblioteca de ritmos de referencia (con su trazado electrocardiográfico, ECG, equivalente) para entender cómo se ve cada patología o arritmia.
        </p>
        <p class="card-desc aviso-referencia" data-testid="aviso-referencia"><strong>Material educativo:</strong> {{ AVISO_REFERENCIA }}</p>
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

    <!-- 1. Catálogo Selector de Patologías y Arritmias -->
    <div class="catalog-section">
      <div class="catalog-top-bar">
        <span class="catalog-title">Selecciona una Patología o Arritmia Precargada:</span>
        <div class="filter-chips">
          <button
            type="button"
            class="chip-filter"
            :class="{ active: filtroCategoria === 'todas' }"
            @click="filtroCategoria = 'todas'"
          >
            Todas ({{ RITMOS_PATOLOGIAS.length }})
          </button>
          <button
            type="button"
            class="chip-filter"
            :class="{ active: filtroCategoria === 'sinusal' }"
            @click="filtroCategoria = 'sinusal'"
          >
            Sinusales
          </button>
          <button
            type="button"
            class="chip-filter"
            :class="{ active: filtroCategoria === 'auricular' }"
            @click="filtroCategoria = 'auricular'"
          >
            Arritmias Auriculares
          </button>
          <button
            type="button"
            class="chip-filter"
            :class="{ active: filtroCategoria === 'ectopico' }"
            @click="filtroCategoria = 'ectopico'"
          >
            Ectópicos Ventriculares
          </button>
        </div>
      </div>

      <!-- Cuadrícula de Botones de Patología -->
      <div class="pathologies-grid">
        <div
          v-for="ritmo in patologiasFiltradas"
          :key="ritmo.id"
          class="pathology-card"
          :class="{ selected: ritmo.id === patologiaSeleccionadaId }"
          @click="seleccionarPatologia(ritmo.id)"
          role="button"
          tabindex="0"
          @keydown.enter="seleccionarPatologia(ritmo.id)"
        >
          <strong class="path-card-name">{{ ritmo.nombre }}</strong>
          <div class="path-card-footer">
            <span class="path-card-bpm font-mono">{{ ritmo.bpm.toFixed(1) }} BPM</span>
            <span class="path-card-tag" :class="'tag-' + ritmo.severidad">
              {{ ritmo.id === patologiaSeleccionadaId ? 'Seleccionado' : ritmo.regularidadTexto.split(' ')[0] }}
            </span>
          </div>
        </div>
      </div>

      <!-- Banner Ficha Clínica de la Patología Seleccionada -->
      <div class="selected-pathology-banner" :style="{ borderColor: patologiaActual.colorHex }">
        <div class="sel-banner-head">
          <div class="sel-left-info">
            <strong class="sel-title" :style="{ color: patologiaActual.colorHex }">
              {{ patologiaActual.nombre }}
            </strong>
            <span class="sel-desc">{{ patologiaActual.descripcionCorta }}</span>
          </div>
          <div class="sel-chips-row">
            <span class="chip chip-badge" :class="'chip-' + patologiaActual.severidad">
              Severidad: {{ patologiaActual.severidadTexto }}
            </span>
            <span class="chip chip-neutral">
              Ritmo: {{ patologiaActual.regularidadTexto }}
            </span>
            <span class="chip chip-info font-mono">
              Frecuencia: {{ patologiaActual.bpm.toFixed(1) }} BPM
            </span>
          </div>
        </div>

        <div class="sel-criteria-grid">
          <div class="crit-card">
            <div class="crit-head crit-ppg">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
              </svg>
              Criterio en Señal Fotopletismográfica (PPG)
            </div>
            <p class="crit-text">{{ patologiaActual.criterioPpg }}</p>
          </div>

          <div class="crit-card">
            <div class="crit-head crit-ecg">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
              </svg>
              Criterio en Trazado Electrocardiográfico Equivalente (ECG)
            </div>
            <p class="crit-text">{{ patologiaActual.criterioEcg }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. Visualizador Osciloscopio Multicanal Sincronizado -->
    <div class="scope-display-card">
      <div class="scope-header-controls">
        <div class="scope-title-badge">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
          Osciloscopio Multicanal Sincronizado (Ventana: 3.5 s)
        </div>

        <!-- Toggles de Capas de Señales -->
        <div class="scope-layer-toggles">
          <label class="layer-toggle-lbl" style="color: #4ade80;">
            <input type="checkbox" v-model="mostrarMedicion" />
            <span>Medición Tomada (Sensor, {{ currentBpm }} BPM)</span>
          </label>
          <label class="layer-toggle-lbl" style="color: #fbbf24;">
            <input type="checkbox" v-model="mostrarPatologiaPpg" />
            <span>Patología: {{ patologiaActual.nombre }} (PPG)</span>
          </label>
          <label class="layer-toggle-lbl" style="color: #818cf8;">
            <input type="checkbox" v-model="mostrarEcgRef" />
            <span>Referencia: {{ patologiaActual.nombre }} (ECG)</span>
          </label>
        </div>
      </div>

      <!-- Pantalla del Osciloscopio: Vista Superpuesta -->
      <div v-if="modoVisualizacion === 'superpuesto'" class="scope-screen-wrapper">
        <div class="scope-grid-bg"></div>
        <svg class="scope-svg" viewBox="0 0 900 280" preserveAspectRatio="none">
          <!-- 1. Medición del Paciente (Verde) -->
          <path
            v-if="mostrarMedicion"
            :d="pathSvgMedicion"
            fill="none"
            stroke="#22c55e"
            stroke-width="2.5"
            stroke-linecap="round"
          />

          <!-- 2. PPG de la Patología Precargada (Ámbar) -->
          <path
            v-if="mostrarPatologiaPpg"
            :d="pathSvgPatologiaPpg"
            fill="none"
            stroke="#f59e0b"
            stroke-width="2.2"
            stroke-linecap="round"
          />

          <!-- 3. ECG Equivalente de Referencia (Índigo) -->
          <path
            v-if="mostrarEcgRef"
            :d="pathSvgPatologiaEcg"
            fill="none"
            stroke="#818cf8"
            stroke-width="1.8"
            stroke-linecap="round"
            opacity="0.9"
          />
        </svg>
      </div>

      <!-- Pantalla del Osciloscopio: Vista en Carriles Paralelos -->
      <div v-else class="scope-split-channels">
        <!-- Carril 1: Medición Tomada -->
        <div class="split-channel-box" v-if="mostrarMedicion">
          <div class="channel-lbl-row">
            <span class="channel-tag" style="color: #4ade80;">Canal 1: Medición Tomada (Sensor MAX30102)</span>
            <span class="channel-freq font-mono">{{ currentBpm }} BPM</span>
          </div>
          <div class="channel-screen-mini">
            <div class="scope-grid-bg"></div>
            <svg class="scope-svg" viewBox="0 0 900 120" preserveAspectRatio="none">
              <path :d="pathSvgMedicionMini" fill="none" stroke="#22c55e" stroke-width="2.2" stroke-linecap="round" />
            </svg>
          </div>
        </div>

        <!-- Carril 2: Patología PPG -->
        <div class="split-channel-box" v-if="mostrarPatologiaPpg">
          <div class="channel-lbl-row">
            <span class="channel-tag" style="color: #fbbf24;">Canal 2: {{ patologiaActual.nombre }} (PPG Precargado)</span>
            <span class="channel-freq font-mono">{{ patologiaActual.bpm }} BPM</span>
          </div>
          <div class="channel-screen-mini">
            <div class="scope-grid-bg"></div>
            <svg class="scope-svg" viewBox="0 0 900 120" preserveAspectRatio="none">
              <path :d="pathSvgPatologiaPpgMini" fill="none" stroke="#f59e0b" stroke-width="2.2" stroke-linecap="round" />
            </svg>
          </div>
        </div>

        <!-- Carril 3: ECG Equivalente -->
        <div class="split-channel-box" v-if="mostrarEcgRef">
          <div class="channel-lbl-row">
            <span class="channel-tag" style="color: #818cf8;">Canal 3: {{ patologiaActual.nombre }} (ECG Equivalente de Referencia)</span>
            <span class="channel-freq font-mono">Retardo PTT: ~190 ms</span>
          </div>
          <div class="channel-screen-mini">
            <div class="scope-grid-bg"></div>
            <svg class="scope-svg" viewBox="0 0 900 120" preserveAspectRatio="none">
              <path :d="pathSvgPatologiaEcgMini" fill="none" stroke="#818cf8" stroke-width="1.8" stroke-linecap="round" />
            </svg>
          </div>
        </div>
      </div>

      <!-- Barra de Estado Inferior y Leyenda del Osciloscopio -->
      <div class="scope-footer-bar">
        <div class="scope-legends-wrap">
          <div class="leg-item" v-if="mostrarMedicion">
            <span class="leg-dot" style="background: #22c55e;"></span>
            <span>Medición Tomada (Sensor)</span>
          </div>
          <div class="leg-item" v-if="mostrarPatologiaPpg">
            <span class="leg-dot" style="background: #f59e0b;"></span>
            <span>{{ patologiaActual.nombre }} (PPG)</span>
          </div>
          <div class="leg-item" v-if="mostrarEcgRef">
            <span class="leg-dot" style="background: #818cf8;"></span>
            <span>ECG Equivalente (Referencia Eléctrica)</span>
          </div>
        </div>

        <div class="scope-ptt-note">
          Acoplamiento electromecánico: Retardo PTT fisiológico calibrado a ~190 ms (Pico R precede cresta sistólica).
        </div>
      </div>
    </div>

    <!-- 3. Cuadrícula Comparativa de Métricas Cuantitativas y Clínicas -->
    <div class="metrics-comp-grid">
      <!-- Métrica 1: Frecuencia Cardíaca -->
      <div class="metric-comp-card">
        <span class="m-comp-title">Frecuencia Cardíaca</span>
        <div class="m-comp-value-row">
          <span class="m-comp-val font-mono">{{ currentBpm.toFixed(1) }}</span>
          <span class="m-comp-sub">vs {{ metricas.patologiaBpm.toFixed(1) }} BPM</span>
        </div>
        <div class="m-comp-delta" :class="metricas.deltaBpm > 0 ? 'text-delta-pos' : 'text-delta-neg'">
          {{ metricas.deltaBpm > 0 ? '+' : '' }}{{ metricas.deltaBpm }} BPM respecto a patología
        </div>
      </div>

      <!-- Métrica 2: Regularidad de Intervalos RR -->
      <div class="metric-comp-card">
        <span class="m-comp-title">Regularidad de Intervalos (RR)</span>
        <div class="m-comp-value-row">
          <span class="m-comp-val" style="font-size: 1.15rem; color: #16a34a;">Isócrono</span>
          <span class="m-comp-sub">vs {{ patologiaActual.regularidadTexto }}</span>
        </div>
        <div class="m-comp-delta text-neutral">
          Intervalo promedio: {{ metricas.medicionIntervaloMs }} ms
        </div>
      </div>

      <!-- Métrica 3: Morfología Dícrota -->
      <div class="metric-comp-card">
        <span class="m-comp-title">Muesca Dícrota (Cierre Aórtico)</span>
        <div class="m-comp-value-row">
          <span class="m-comp-val" style="font-size: 1.15rem; color: #16a34a;">Presente</span>
          <span class="m-comp-sub">en pulso basal</span>
        </div>
        <div class="m-comp-delta text-neutral">
          Elasticidad vascular y tono arterial íntegro
        </div>
      </div>

      <!-- Métrica 4: Parecido con el ritmo de referencia (educativo, no diagnóstico) -->
      <div class="metric-comp-card">
        <span class="m-comp-title">Parecido con el ritmo de referencia (RF25)</span>
        <div class="m-comp-value-row">
          <span class="m-comp-val font-mono" style="color: #2563eb;">{{ metricas.similitudFrecuencia }}%</span>
          <span class="m-comp-sub">Parecido de la frecuencia (educativo)</span>
        </div>
        <div class="m-comp-delta text-conclusion">
          {{ metricas.conclusionClinica }}
        </div>
      </div>
    </div>

    <!-- 4. Tabla de Comparación Detallada de Parámetros -->
    <div class="tabla-comparativa-box">
      <h4 class="subhead-title">Tabla Comparativa de Criterios Diagnósticos: Medición vs Patología</h4>
      <div class="tabla-scroll">
        <table class="tabla-criterios">
          <thead>
            <tr>
              <th>Criterio Fisiológico</th>
              <th style="color: #16a34a;">Medición Tomada (Sensor)</th>
              <th style="color: #d97706;">Versión PPG Patológica (RF25)</th>
              <th style="color: #4f46e5;">Versión ECG Equivalente</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Frecuencia Cardíaca</td>
              <td class="font-mono">{{ currentBpm }} BPM</td>
              <td class="font-mono">{{ patologiaActual.bpm }} BPM</td>
              <td class="font-mono">{{ patologiaActual.bpm }} BPM</td>
            </tr>
            <tr>
              <td>Intervalo entre Latidos</td>
              <td class="font-mono">{{ metricas.medicionIntervaloMs }} ms (Uniforme)</td>
              <td class="font-mono">{{ metricas.patologiaIntervaloMs }} ms ({{ patologiaActual.regularidad }})</td>
              <td class="font-mono">{{ metricas.patologiaIntervaloMs }} ms</td>
            </tr>
            <tr>
              <td>Ascenso Sistólico</td>
              <td>Empinado normal (~100 ms)</td>
              <td>{{ patologiaActual.categoria === 'ectopico' ? 'Variable según origen ectópico' : 'Acorde al gasto cardíaco' }}</td>
              <td>Onda R estrecha (&lt;100 ms)</td>
            </tr>
            <tr>
              <td>Escotadura Dícrota</td>
              <td>Presente y bien definida</td>
              <td>{{ patologiaActual.id === 'taquicardia_sinusal' ? 'Atenuada / fusionada' : patologiaActual.id === 'fibrilacion_auricular' ? 'Variable por latido' : 'Conforme a patología' }}</td>
              <td>Corresponde al fin de la onda T</td>
            </tr>
            <tr>
              <td>Actividad Eléctrica Asociada</td>
              <td>Normal (Sinusal presunta)</td>
              <td>Reflejo hemodinámico periférico</td>
              <td>{{ patologiaActual.criterioEcg }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- 5. Bloques Didácticos de Fisiopatología y Acoplamiento Electromecánico -->
    <div class="didactic-grid">
      <div class="didactic-card">
        <div class="didactic-head">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="16" x2="12" y2="12"></line>
            <line x1="12" y1="8" x2="12.01" y2="8"></line>
          </svg>
          1. Fisiopatología en la Señal PPG
        </div>
        <p class="didactic-text">
          {{ patologiaActual.fisiopatologia }}
        </p>
      </div>

      <div class="didactic-card">
        <div class="didactic-head">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
          </svg>
          2. Correlación con el ECG Equivalente
        </div>
        <p class="didactic-text">
          La onda mecánica de pulso (PPG) es la consecuencia hidrodinámica directa de la despolarización ventricular reflejada en el ECG. Cada pico R precede a la cresta sistólica del dedo por un retardo fisiológico de tránsito del pulso (PTT) de ~180 a 220 ms.
        </p>
      </div>

      <div class="didactic-card">
        <div class="didactic-head">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          3. Enfoque Educativo UNACH
        </div>
        <p class="didactic-text">
          Permite a los estudiantes distinguir arritmias verdaderas de artefactos mecánicos generados por movimiento en el sensor óptico MAX30102, entrenando el criterio clínico de monitoreo no invasivo.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { AVISO_REFERENCIA } from '../data/avisoEducativo.js'
import {
  RITMOS_PATOLOGIAS,
  obtenerRitmoPatologia,
  generarTrazadoDualPatologia,
  calcularMetricasComparacionPatologia
} from '../data/ritmosPatologias.js'
import { ppgWaveform } from '../utils/ppgMath.js'

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

const patologiaSeleccionadaId = ref('sinusal_normal')
const filtroCategoria = ref('todas')
const modoVisualizacion = ref('superpuesto') // 'superpuesto' | 'carriles'

const mostrarMedicion = ref(true)
const mostrarPatologiaPpg = ref(true)
const mostrarEcgRef = ref(true)

const patologiasFiltradas = computed(() => {
  if (filtroCategoria.value === 'todas') {
    return RITMOS_PATOLOGIAS
  }
  return RITMOS_PATOLOGIAS.filter(r => r.categoria === filtroCategoria.value)
})

const patologiaActual = computed(() => {
  return obtenerRitmoPatologia(patologiaSeleccionadaId.value)
})

const metricas = computed(() => {
  return calcularMetricasComparacionPatologia({
    medicionBpm: props.currentBpm,
    medicionIntervaloMs: props.lastIntervalMs,
    patologiaId: patologiaSeleccionadaId.value
  })
})

function seleccionarPatologia(id) {
  patologiaSeleccionadaId.value = id
}

// Ventana de tiempo de 3.5 segundos a 100 Hz = 350 puntos
const trazadoPatologia = computed(() => {
  return generarTrazadoDualPatologia(patologiaSeleccionadaId.value, 3.5, 100)
})

/**
 * Convierte un arreglo de valores Y en un string de comando 'path' para SVG
 * @param {number[]} valores - Puntos Y normalizados
 * @param {number} anchoTotal - Ancho del viewBox
 * @param {number} altoTotal - Alto del viewBox
 * @param {number} yMin - Valor mínimo
 * @param {number} yMax - Valor máximo
 * @param {number} yBaseline - Nivel Y base
 */
function generarPathSvg(valores, anchoTotal = 900, altoTotal = 280, yBaseline = 220, alturaMax = 180) {
  if (!valores || valores.length === 0) return ''
  const stepX = anchoTotal / (valores.length - 1)
  const coords = valores.map((v, idx) => {
    const x = (idx * stepX).toFixed(1)
    const y = (yBaseline - v * alturaMax).toFixed(1)
    return `${x},${y}`
  })
  return `M ${coords.join(' L ')}`
}

// 1. Path SVG de la Medición del Paciente (Verde, 78 BPM, 3.5 segundos)
const pathSvgMedicion = computed(() => {
  const duracionS = 3.5
  const puntos = 350
  const beatPeriod = 60 / Math.max(30, props.currentBpm)
  const pttS = 0.19
  const valores = []

  for (let i = 0; i < puntos; i++) {
    const t = (i / puntos) * duracionS
    const fasePpg = ((t - pttS) / beatPeriod) % 1.0
    const val = ppgWaveform(fasePpg) * (props.amplitude / 100)
    valores.push(val)
  }
  return generarPathSvg(valores, 900, 280, 220, 175)
})

// 2. Path SVG del PPG de la Patología (Ámbar)
const pathSvgPatologiaPpg = computed(() => {
  return generarPathSvg(trazadoPatologia.value.ppg, 900, 280, 220, 175)
})

// 3. Path SVG del ECG de la Patología (Índigo)
const pathSvgPatologiaEcg = computed(() => {
  // El ECG tiene valores entre -0.4 y 1.0, se escala en torno a yBaseline = 150
  const valoresEcg = trazadoPatologia.value.ecg
  if (!valoresEcg || valoresEcg.length === 0) return ''
  const anchoTotal = 900
  const yBaseline = 145
  const escalaEcg = 85
  const stepX = anchoTotal / (valoresEcg.length - 1)
  const coords = valoresEcg.map((v, idx) => {
    const x = (idx * stepX).toFixed(1)
    const y = (yBaseline - v * escalaEcg).toFixed(1)
    return `${x},${y}`
  })
  return `M ${coords.join(' L ')}`
})

// Versiones Mini para Carriles Paralelos
const pathSvgMedicionMini = computed(() => {
  const duracionS = 3.5
  const puntos = 350
  const beatPeriod = 60 / Math.max(30, props.currentBpm)
  const pttS = 0.19
  const valores = []
  for (let i = 0; i < puntos; i++) {
    const t = (i / puntos) * duracionS
    const fasePpg = ((t - pttS) / beatPeriod) % 1.0
    valores.push(ppgWaveform(fasePpg) * (props.amplitude / 100))
  }
  return generarPathSvg(valores, 900, 120, 95, 75)
})

const pathSvgPatologiaPpgMini = computed(() => {
  return generarPathSvg(trazadoPatologia.value.ppg, 900, 120, 95, 75)
})

const pathSvgPatologiaEcgMini = computed(() => {
  const valoresEcg = trazadoPatologia.value.ecg
  if (!valoresEcg || valoresEcg.length === 0) return ''
  const stepX = 900 / (valoresEcg.length - 1)
  const coords = valoresEcg.map((v, idx) => {
    const x = (idx * stepX).toFixed(1)
    const y = (60 - v * 40).toFixed(1)
    return `${x},${y}`
  })
  return `M ${coords.join(' L ')}`
})
</script>

<style scoped>
.comparador-patologias-card {
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: 0.75rem;
}

.card-head-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.85rem;
}

.card-title {
  font-size: 1.18rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 0.25rem 0;
}

.card-desc {
  font-size: 0.86rem;
  color: var(--color-muted);
  margin: 0;
  line-height: 1.4;
}

.view-mode-buttons {
  display: flex;
  gap: 0.4rem;
}

/* 1. Catálogo */
.catalog-section {
  margin-bottom: 1.25rem;
}

.catalog-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-bottom: 0.75rem;
}

.catalog-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #1e293b;
}

.filter-chips {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.chip-filter {
  padding: 0.22rem 0.65rem;
  border-radius: 9999px;
  font-size: 0.76rem;
  font-weight: 600;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #475569;
  cursor: pointer;
  transition: all 0.2s;
}

.chip-filter:hover {
  background: #f1f5f9;
}

.chip-filter.active {
  background: #2563eb;
  color: #ffffff;
  border-color: #2563eb;
}

.pathologies-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.65rem;
  margin-bottom: 1rem;
}

.pathology-card {
  border: 1.5px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.65rem 0.75rem;
  background: #ffffff;
  cursor: pointer;
  transition: all 0.2s ease;
  user-select: none;
}

.pathology-card:hover {
  border-color: #93c5fd;
  background: #f8fafc;
}

.pathology-card.selected {
  border-color: #f59e0b;
  background: #fffbeb;
  box-shadow: 0 0 0 1px #f59e0b;
}

.path-card-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: #0f172a;
  display: block;
  margin-bottom: 0.3rem;
  line-height: 1.25;
}

.path-card-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.75rem;
}

.path-card-bpm {
  font-weight: 700;
  color: #b45309;
}

.path-card-tag {
  font-size: 0.7rem;
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
  background: #f1f5f9;
  font-weight: 600;
  color: #475569;
}

/* Banner de Ficha Clínica */
.selected-pathology-banner {
  background: #fffbeb;
  border: 1.5px solid #fcd34d;
  border-radius: 0.65rem;
  padding: 0.9rem 1.15rem;
  margin-bottom: 1.25rem;
  box-shadow: 0 1px 3px rgba(245, 158, 11, 0.08);
}

.sel-banner-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.65rem;
  flex-wrap: wrap;
  gap: 0.6rem;
}

.sel-title {
  font-size: 1.08rem;
  font-weight: 700;
  display: block;
}

.sel-desc {
  font-size: 0.82rem;
  color: #78350f;
  margin-top: 0.15rem;
  display: block;
}

.sel-chips-row {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.chip-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
}

.chip-normal { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
.chip-leve { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
.chip-moderada { background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5; }
.chip-alta { background: #fee2e2; color: #991b1b; border: 1px solid #ef4444; }

.chip-neutral {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  background: #ffffff;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.chip-info {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.sel-criteria-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.75rem;
}

.crit-card {
  background: rgba(255, 255, 255, 0.85);
  padding: 0.6rem 0.85rem;
  border-radius: 0.45rem;
  border: 1px solid rgba(0, 0, 0, 0.06);
}

.crit-head {
  font-size: 0.82rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
}

.crit-ppg { color: #b45309; }
.crit-ecg { color: #4338ca; }

.crit-text {
  font-size: 0.8rem;
  color: #334155;
  line-height: 1.4;
  margin: 0;
}

/* 2. Osciloscopio */
.scope-display-card {
  background: #090d16;
  border: 1px solid #1e293b;
  border-radius: 0.75rem;
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
  color: #e2e8f0;
}

.scope-header-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}

.scope-title-badge {
  font-size: 0.92rem;
  font-weight: 700;
  color: #f8fafc;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.scope-layer-toggles {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
}

.layer-toggle-lbl {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  user-select: none;
}

.scope-screen-wrapper {
  position: relative;
  background: #050811;
  border: 1px solid #1e293b;
  border-radius: 0.5rem;
  height: 280px;
  overflow: hidden;
}

.scope-grid-bg {
  position: absolute;
  top: 0; left: 0; right: 0; bottom: 0;
  background-image:
    linear-gradient(to right, rgba(30, 41, 59, 0.4) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(30, 41, 59, 0.4) 1px, transparent 1px);
  background-size: 40px 40px;
}

.scope-svg {
  width: 100%;
  height: 100%;
  position: relative;
  z-index: 2;
}

/* Carriles Paralelos */
.scope-split-channels {
  display: flex;
  flex-direction: column;
  gap: 0.65rem;
}

.split-channel-box {
  background: #050811;
  border: 1px solid #1e293b;
  border-radius: 0.45rem;
  padding: 0.5rem 0.75rem;
}

.channel-lbl-row {
  display: flex;
  justify-content: space-between;
  font-size: 0.78rem;
  margin-bottom: 0.25rem;
  font-weight: 600;
}

.channel-screen-mini {
  position: relative;
  height: 100px;
  overflow: hidden;
}

.scope-footer-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-top: 0.75rem;
  font-size: 0.78rem;
  color: #94a3b8;
}

.scope-legends-wrap {
  display: flex;
  gap: 1.25rem;
  flex-wrap: wrap;
}

.leg-item {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.leg-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.scope-ptt-note {
  font-size: 0.75rem;
  color: #64748b;
}

/* 3. Cuadrícula de Métricas */
.metrics-comp-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.25rem;
}

.metric-comp-card {
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  padding: 0.85rem 1rem;
}

.m-comp-title {
  font-size: 0.75rem;
  color: var(--color-muted);
  text-transform: uppercase;
  font-weight: 700;
  display: block;
  margin-bottom: 0.3rem;
}

.m-comp-value-row {
  display: flex;
  align-items: baseline;
  gap: 0.45rem;
}

.m-comp-val {
  font-size: 1.35rem;
  font-weight: 800;
  color: #0f172a;
}

.m-comp-sub {
  font-size: 0.8rem;
  color: var(--color-muted);
}

.m-comp-delta {
  font-size: 0.75rem;
  font-weight: 700;
  margin-top: 0.25rem;
}

.text-delta-pos { color: #dc2626; }
.text-delta-neg { color: #0284c7; }
.text-neutral { color: #475569; }
.text-conclusion { color: #16a34a; }

/* 4. Tabla */
.tabla-comparativa-box {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.65rem;
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
}

.subhead-title {
  font-size: 0.92rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0 0 0.75rem 0;
}

.tabla-scroll {
  overflow-x: auto;
}

.tabla-criterios {
  width: 100%;
  min-width: 580px;
  border-collapse: collapse;
  font-size: 0.82rem;
  text-align: left;
}

.tabla-criterios th {
  padding: 0.6rem;
  background: #f8fafc;
  border-bottom: 2px solid var(--color-border);
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--color-muted);
}

.tabla-criterios td {
  padding: 0.55rem 0.6rem;
  border-bottom: 1px solid var(--color-border);
  color: #1e293b;
}

/* 5. Bloques Didácticos */
.didactic-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.85rem;
}

.didactic-card {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  padding: 0.9rem 1.15rem;
}

.didactic-head {
  font-size: 0.88rem;
  font-weight: 700;
  color: #0f172a;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.35rem;
}

.didactic-text {
  font-size: 0.8rem;
  color: #475569;
  line-height: 1.45;
  margin: 0;
}

@media (max-width: 768px) {
  .sel-criteria-grid {
    grid-template-columns: 1fr;
  }
  .scope-screen-wrapper {
    height: 220px;
  }
}
</style>
