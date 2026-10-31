<template>
  <div>
    <!-- Encabezado del Requerimiento Funcional 41 (RF41) en Apartado de Aprendizaje -->
    <div class="card" style="margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <h1 class="card-title" style="margin-bottom: 0.25rem;">Simulador de Señal</h1>
          <p style="color: var(--color-muted); font-size: 0.9rem; margin-bottom: 0;">
            Simulador de señal interactivo: controles de BPM, ruido, amplitud y arritmia con la onda en vivo. También sirve para pruebas sin ESP32.
          </p>
        </div>
        <span class="badge badge-usuario" style="font-size: 0.8rem;">
          Rama: rf41-simulador-senal
        </span>
      </div>
    </div>

    <!-- 1. Presets Rápidos de Casos Clínicos y Educativos -->
    <div class="card" style="margin-bottom: 1rem; padding: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
        <span style="font-size: 0.85rem; font-weight: 600; color: var(--color-text);">
          Casos Predefinidos de un Clic (Presets Educativos):
        </span>
        <span style="font-size: 0.75rem; color: var(--color-muted);">
          Ajustan instantáneamente la frecuencia, la amplitud y el patrón de ritmo
        </span>
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: 0.5rem;">
        <button
          @click="selectPreset('normal')"
          class="btn btn-secondary"
          :class="{ 'btn-preset-active': activePreset === 'normal' }"
          style="font-size: 0.8rem; padding: 0.4rem 0.75rem;"
        >
          Reposo Normal (72 BPM)
        </button>

        <button
          @click="selectPreset('exercise')"
          class="btn btn-secondary"
          :class="{ 'btn-preset-active': activePreset === 'exercise' }"
          style="font-size: 0.8rem; padding: 0.4rem 0.75rem;"
        >
          Taquicardia en Esfuerzo (135 BPM)
        </button>

        <button
          @click="selectPreset('athlete')"
          class="btn btn-secondary"
          :class="{ 'btn-preset-active': activePreset === 'athlete' }"
          style="font-size: 0.8rem; padding: 0.4rem 0.75rem;"
        >
          Bradicardia de Reposo (48 BPM)
        </button>

        <button
          @click="selectPreset('respiratory_arrhythmia')"
          class="btn btn-secondary"
          :class="{ 'btn-preset-active': activePreset === 'respiratory_arrhythmia' }"
          style="font-size: 0.8rem; padding: 0.4rem 0.75rem;"
        >
          Arritmia Respiratoria (HRV)
        </button>

        <button
          @click="selectPreset('extrasystole')"
          class="btn btn-secondary"
          :class="{ 'btn-preset-active': activePreset === 'extrasystole' }"
          style="font-size: 0.8rem; padding: 0.4rem 0.75rem;"
        >
          Extrasístole Ventricular (PVC)
        </button>

        <button
          @click="selectPreset('atrial_fib')"
          class="btn btn-secondary"
          :class="{ 'btn-preset-active': activePreset === 'atrial_fib' }"
          style="font-size: 0.8rem; padding: 0.4rem 0.75rem;"
        >
          Fibrilación Auricular (Caótico)
        </button>

        <button
          @click="selectPreset('noisy')"
          class="btn btn-secondary"
          :class="{ 'btn-preset-active': activePreset === 'noisy' }"
          style="font-size: 0.8rem; padding: 0.4rem 0.75rem;"
        >
          Artefacto de Movimiento (Ruido)
        </button>
      </div>
    </div>

    <!-- 2. Panel de Controles Interactivos de Señal (RF41: BPM, Ruido, Amplitud y Arritmia) -->
    <div class="card" style="margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem; margin-bottom: 1rem; flex-wrap: wrap; gap: 0.5rem;">
        <h2 style="font-size: 1rem; font-weight: 600; margin-bottom: 0;">Controles de Parámetros de Señal en Vivo</h2>
        <div style="display: flex; align-items: center; gap: 0.75rem;">
          <button
            @click="simulator.toggle()"
            class="btn"
            :style="{ backgroundColor: simulator.isRunning.value ? '#f59e0b' : 'var(--color-primary)', color: 'white', padding: '0.4rem 0.9rem', fontSize: '0.85rem' }"
          >
            {{ simulator.isRunning.value ? 'Pausar Simulación' : 'Reanudar Simulación' }}
          </button>
          <button
            @click="handleResetSim"
            class="btn btn-secondary"
            style="padding: 0.4rem 0.8rem; font-size: 0.85rem;"
          >
            Reiniciar
          </button>
        </div>
      </div>

      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 1.25rem;">
        <!-- Control 1: Frecuencia Cardiaca (BPM) -->
        <div class="control-box">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
            <label class="form-label" style="margin-bottom: 0;">1. Frecuencia Cardíaca</label>
            <div style="display: flex; align-items: baseline; gap: 0.35rem;">
              <span style="font-size: 1.25rem; font-weight: 700; font-family: monospace; color: var(--color-primary);">
                {{ simulator.bpm.value }}
              </span>
              <span style="font-size: 0.75rem; color: var(--color-muted);">BPM</span>
            </div>
          </div>
          <input
            type="range"
            min="40"
            max="180"
            step="1"
            v-model.number="simulator.bpm.value"
            @input="activePreset = 'custom'"
            class="slider"
          />
          <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--color-muted); margin-top: 0.25rem;">
            <span>40 (Bradicardia)</span>
            <span>100 (Límite normal)</span>
            <span>180 (Taquicardia)</span>
          </div>
          <div style="margin-top: 0.4rem;">
            <span
              class="badge"
              :class="bpmBadgeClass"
              style="font-size: 0.7rem;"
            >
              {{ bpmCategoryText }}
            </span>
          </div>
        </div>

        <!-- Control 2: Amplitud del Pulso -->
        <div class="control-box">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
            <label class="form-label" style="margin-bottom: 0;">2. Amplitud del Pulso</label>
            <div style="display: flex; align-items: baseline; gap: 0.35rem;">
              <span style="font-size: 1.25rem; font-weight: 700; font-family: monospace; color: var(--color-text);">
                {{ simulator.amplitude.value }}%
              </span>
            </div>
          </div>
          <input
            type="range"
            min="20"
            max="150"
            step="5"
            v-model.number="simulator.amplitude.value"
            @input="activePreset = 'custom'"
            class="slider"
          />
          <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--color-muted); margin-top: 0.25rem;">
            <span>20% (Pulso débil / hipotensión)</span>
            <span>100% (Normal)</span>
            <span>150% (Fuerte)</span>
          </div>
          <p style="font-size: 0.75rem; color: var(--color-muted); margin-top: 0.4rem; margin-bottom: 0;">
            Modula la altura y volumen de cada onda en la gráfica.
          </p>
        </div>

        <!-- Control 3: Nivel de Ruido e Interferencia -->
        <div class="control-box">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
            <label class="form-label" style="margin-bottom: 0;">3. Ruido y Artefacto de Movimiento</label>
            <div style="display: flex; align-items: baseline; gap: 0.35rem;">
              <span
                style="font-size: 1.25rem; font-weight: 700; font-family: monospace;"
                :style="{ color: simulator.noiseLevel.value > 20 ? 'var(--color-danger)' : 'var(--color-text)' }"
              >
                {{ simulator.noiseLevel.value }}%
              </span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="50"
            step="1"
            v-model.number="simulator.noiseLevel.value"
            @input="activePreset = 'custom'"
            class="slider"
          />
          <div style="display: flex; justify-content: space-between; font-size: 0.7rem; color: var(--color-muted); margin-top: 0.25rem;">
            <span>0% (Limpio)</span>
            <span>15% (Leve)</span>
            <span>50% (Movimiento brusco)</span>
          </div>
          <p style="font-size: 0.75rem; color: var(--color-muted); margin-top: 0.4rem; margin-bottom: 0;">
            Simula interferencias ópticas y temblor de dedo sobre el sensor.
          </p>
        </div>

        <!-- Control 4: Patrón de Ritmo y Arritmia -->
        <div class="control-box">
          <div style="display: flex; justify-content: space-between; align-items: baseline; margin-bottom: 0.35rem;">
            <label class="form-label" style="margin-bottom: 0;">4. Patrón de Ritmo y Arritmia</label>
          </div>
          <select
            :value="simulator.arrhythmia.value"
            @change="handleArrhythmiaSelect($event.target.value)"
            class="form-select"
            style="font-size: 0.85rem; padding: 0.45rem 0.6rem; font-weight: 600;"
          >
            <option value="normal">Ritmo Sinusal Regular (Normal)</option>
            <option value="respiratory">Arritmia Sinusal Respiratoria (Variabilidad normal)</option>
            <option value="extrasystole">Extrasístole Ventricular (Latidos prematuros PVC)</option>
            <option value="tachycardia">Taquicardia Paroxística (> 125 BPM)</option>
            <option value="bradycardia">Bradicardia Sinusal (< 50 BPM)</option>
            <option value="atrial_fibrillation">Fibrilación Auricular (Ritmo caótico / irregular)</option>
          </select>
          <p style="font-size: 0.75rem; color: var(--color-primary); font-weight: 500; margin-top: 0.4rem; margin-bottom: 0;">
            {{ arrhythmiaDescription }}
          </p>
        </div>
      </div>
    </div>

    <!-- 3. Metricas en Tiempo Real (Calculadas a partir de la senal simulada) -->
    <PeakMetricsCards
      :currentBpm="peakDetector.currentBpm.value"
      :instantBpm="peakDetector.instantBpm.value"
      :rmssd="peakDetector.rmssd.value"
      :sdnn="peakDetector.sdnn.value"
      :regularityStatus="peakDetector.regularityStatus.value"
      :regularityLevel="peakDetector.regularityLevel.value"
      :isBeating="peakDetector.isBeating.value"
      :totalBeats="peakDetector.totalBeatsDetected.value"
      :lastIntervalMs="peakDetector.lastIntervalMs.value"
    />

    <!-- Calidad de la señal simulada (RF15): ruido, movimiento y recorte, en vivo -->
    <div class="calidad-simulador" style="display:flex; align-items:center; gap:0.75rem; flex-wrap:wrap; margin-bottom:0.5rem;">
      <strong style="font-size:0.85rem;">Calidad de la señal:</strong>
      <CalidadSenalBadge :nivel="calidadSenal.nivel" :causas="calidadSenal.causas" mostrar-causa />
    </div>

    <!-- 4. Osciloscopio con Senal Simulada y Marcadores de Picos Sistolicos (Puntos Rojos) -->
    <PeakOscilloscopeCanvas
      ref="oscilloscopeRef"
      :isRunning="simulator.isRunning.value"
    />

    <!-- Clasificación del Ritmo Cardíaco en el Simulador (RF18) - Ubicado debajo de la onda -->
    <ClasificacionRitmoCard
      style="margin-top: 1rem;"
      :bpm="peakDetector.currentBpm.value"
      :instantBpm="peakDetector.instantBpm.value"
      :sdnn="peakDetector.sdnn.value"
      :rmssd="peakDetector.rmssd.value"
      :lastIntervalMs="peakDetector.lastIntervalMs.value"
      :regularityLevel="peakDetector.regularityLevel.value"
      :totalBeats="peakDetector.totalBeatsDetected.value"
    />
  </div>

      <!-- 5. Acciones de Integracion ("Pruebas sin ESP32") -->
    <div
      class="card"
      style="margin-bottom: 1rem; padding: 0.75rem 1.25rem; background: #eff6ff; border-color: #bfdbfe; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;"
    >
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="color: var(--color-primary); font-weight: bold;">●</span>
        <span style="font-size: 0.85rem; color: #1e40af; font-weight: 500;">
          Modo Pruebas sin ESP32: La simulación alimenta el detector en vivo con telemetría a 100 Hz.
        </span>
      </div>

      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button
          @click="copyTelemetrySample"
          class="btn btn-secondary"
          style="font-size: 0.8rem; padding: 0.35rem 0.75rem;"
        >
          {{ copyStatusText }}
        </button>

        <router-link
          to="/comparacion"
          class="btn btn-primary"
          style="font-size: 0.8rem; padding: 0.35rem 0.85rem; text-decoration: none;"
        >
          Transferir esta Simulación a Comparación (RF24) &rarr;
        </router-link>
      </div>
    </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useSignalSimulator } from '../composables/useSignalSimulator.js'
import CalidadSenalBadge from '../components/CalidadSenalBadge.vue'
import { evaluarCalidad, MAXIMO_SIMULADOR } from '../utils/calidadSenal.js'
import { usePeakDetector } from '../composables/usePeakDetector.js'
import { PpgDcFilter } from '../utils/ppgFilter.js'

import PeakMetricsCards from '../components/PeakMetricsCards.vue'
import PeakOscilloscopeCanvas from '../components/PeakOscilloscopeCanvas.vue'
import ClasificacionRitmoCard from '../components/ClasificacionRitmoCard.vue'

const oscilloscopeRef = ref(null)
const activePreset = ref('normal')
const copyStatusText = ref('Copiar Trama CSV de Muestra')

// Filtro de componente DC e inversion optica
const dcFilter = new PpgDcFilter({
  alphaBaseline: 0.02,
  alphaSmooth: 0.35
})

// Algoritmo de deteccion de picos, BPM y HRV (RF17)
const peakDetector = usePeakDetector({
  refractoryMs: 380,
  windowSize: 8
})

// Sintetizador fisiologico interactivo de senal PPG (RF41)
const simulator = useSignalSimulator({
  bpm: 72,
  amplitude: 100,
  noiseLevel: 3,
  arrhythmia: 'normal'
})

// RF15: ventana de ~3 s del valor crudo (0-4095) para evaluar la calidad cada 0,25 s
const VENTANA_CALIDAD = 300
const ventanaCalidad = []
let muestrasDesdeCalidad = 0
const calidadSenal = ref({ nivel: 'sin_senal', causas: [] })

function actualizarCalidad(valor) {
  ventanaCalidad.push(valor)
  if (ventanaCalidad.length > VENTANA_CALIDAD) ventanaCalidad.shift()
  if (++muestrasDesdeCalidad < 25) return
  muestrasDesdeCalidad = 0
  const r = evaluarCalidad(ventanaCalidad, { frecuenciaHz: 100, maximo: MAXIMO_SIMULADOR })
  calidadSenal.value = { nivel: r.nivel, causas: r.causas }
}

// Conectar el flujo continuo de 100 Hz del simulador al filtro y detector
simulator.subscribe((sample) => {
  actualizarCalidad(sample.value)

  // 1. Filtrar componente DC
  const filtered = dcFilter.process(sample.value)

  // 2. Deteccion de picos sistolicos en tiempo real (hardwareBpm 0 en simulador para medir la onda directamente)
  const isPeak = peakDetector.processSample(sample.tMs, filtered.ac, sample.hardwareBpm)

  // 3. Pintar en osciloscopio
  if (oscilloscopeRef.value) {
    oscilloscopeRef.value.addSample(filtered.normalized, isPeak)
  }
})

function selectPreset(presetName) {
  activePreset.value = presetName
  simulator.applyPreset(presetName)
  peakDetector.reset()
}

function handleArrhythmiaSelect(type) {
  activePreset.value = 'custom'
  simulator.setArrhythmia(type)
  peakDetector.reset()
}

function handleResetSim() {
  ventanaCalidad.length = 0
  calidadSenal.value = { nivel: 'sin_senal', causas: [] }
  simulator.reset()
  dcFilter.reset()
  peakDetector.reset()
  if (oscilloscopeRef.value) {
    oscilloscopeRef.value.clear()
  }
  simulator.start()
}

function copyTelemetrySample() {
  const t = Math.round(performance.now())
  const raw = 2048 + Math.round((Math.random() - 0.5) * 40)
  const line = `${t},${raw},0,${simulator.bpm.value}.0`

  if (navigator.clipboard) {
    navigator.clipboard.writeText(line).then(() => {
      copyStatusText.value = '¡Copiado: ' + line + '!'
      setTimeout(() => {
        copyStatusText.value = 'Copiar Trama CSV de Muestra'
      }, 2500)
    }).catch(() => {})
  }
}

const bpmBadgeClass = computed(() => {
  const b = simulator.bpm.value
  if (b < 60) return 'badge-profesor' // Bradicardia
  if (b <= 100) return 'badge-usuario' // Normal
  return 'badge-admin' // Taquicardia
})

const bpmCategoryText = computed(() => {
  const b = simulator.bpm.value
  if (b < 60) return 'Bradicardia (< 60 BPM)'
  if (b <= 100) return 'Frecuencia Normal (60 - 100 BPM)'
  return 'Taquicardia (> 100 BPM)'
})

const arrhythmiaDescription = computed(() => {
  switch (simulator.arrhythmia.value) {
    case 'normal':
      return 'Intervalos R-R regulares y homogéneos (variabilidad basal mínima).'
    case 'respiratory':
      return 'El intervalo y la amplitud se modulan armónicamente con la respiración (fisiológico normal).'
    case 'extrasystole':
      return 'Latidos ectópicos prematuros de menor amplitud seguidos de una pausa compensatoria marcada.'
    case 'tachycardia':
      return 'Cadencia rápida con acortamiento diastólico pronunciado.'
    case 'bradycardia':
      return 'Cadencia lenta con pausas diastólicas prolongadas (típico de reposo profundo o deportistas).'
    case 'atrial_fibrillation':
      return 'Pérdida absoluta de periodicidad: intervalos R-R y amplitudes de pulso completamente caóticos.'
    default:
      return 'Patrón de ritmo seleccionado.'
  }
})

onMounted(() => {
  simulator.start()
})

onUnmounted(() => {
  simulator.pause()
})
</script>

<style scoped>
.control-box {
  padding: 0.85rem;
  background: var(--color-bg);
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
}

.slider {
  width: 100%;
  height: 6px;
  border-radius: 3px;
  background: #cbd5e1;
  outline: none;
  cursor: pointer;
  accent-color: var(--color-primary);
}

.btn-preset-active {
  background-color: #dbeafe !important;
  color: var(--color-primary) !important;
  border-color: #93c5fd !important;
  font-weight: 700 !important;
}
</style>
