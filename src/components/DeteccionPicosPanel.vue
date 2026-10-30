<template>
  <div>
    <!-- Encabezado de la sección (RF17) -->
    <div style="margin-bottom: 1rem;">
      <h2 class="card-title" style="margin-bottom: 0.25rem;">Detección de picos, BPM y HRV (RF17)</h2>
      <p style="color: var(--color-muted); font-size: 0.9rem; margin-bottom: 0;">
        Detección de picos en tiempo real, cálculo de BPM, variabilidad de la frecuencia cardíaca (HRV) y regularidad del ritmo, con el sensor por USB o con el simulador.
      </p>
    </div>

    <!-- 1. Conexion del Sensor ESP32 -->
    <Esp32Connection
      :isConnected="serialSensor.isConnected.value"
      :isSimulating="isSimulating"
      :portInfo="serialSensor.portInfo.value"
      :rawLine="serialSensor.rawLine.value"
      :errorMessage="serialSensor.errorMessage.value"
      @connectUsb="handleConnectUsb"
      @disconnect="handleDisconnectUsb"
      @toggleSim="handleToggleSim"
    />

    <!-- Barra de Accion: Enviar Medicion a Comparacion (RF24) -->
    <div
      v-if="peakDetector.currentBpm.value > 0"
      class="card"
      style="margin-bottom: 1rem; padding: 0.75rem 1.25rem; background: #f0fdf4; border-color: #86efac; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem;"
    >
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="color: var(--color-success); font-weight: bold;">●</span>
        <span style="font-size: 0.9rem; color: #166534; font-weight: 600;">
          Medicion Registrada: {{ peakDetector.currentBpm.value }} BPM (Guardada en almacenamiento local)
        </span>
      </div>

      <router-link
        to="/comparacion"
        class="btn btn-primary"
        style="font-size: 0.85rem; padding: 0.4rem 1rem; text-decoration: none;"
      >
        Comparar esta Medicion con ECG (RF24) &rarr;
      </router-link>
    </div>

    <!-- 2. Metricas en Tiempo Real (RF17: BPM, HRV, Regularidad, Picos) -->
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

    <!-- 3. Osciloscopio con Senal Filtrada y Picos Sistolicos (Puntos Rojos) -->
    <PeakOscilloscopeCanvas
      ref="oscilloscopeRef"
      :isRunning="isSignalActive"
    />
  </div>
</template>

<script setup>
const emit = defineEmits(['solicitar-consentimiento'])
import { ref, computed, onUnmounted } from 'vue'
import { consentimientoEstado } from '../services/consentimientoService'
import { useSerialSensor } from '../composables/useSerialSensor.js'
import { usePeakDetector } from '../composables/usePeakDetector.js'
import { PpgDcFilter } from '../utils/ppgFilter.js'

import Esp32Connection from './Esp32Connection.vue'
import PeakMetricsCards from './PeakMetricsCards.vue'
import PeakOscilloscopeCanvas from './PeakOscilloscopeCanvas.vue'

const oscilloscopeRef = ref(null)
const serialSensor = useSerialSensor()
const isSimulating = ref(false)
let simTimer = null
let simTimeMs = 0

// Filtro de remocion de linea base DC
const dcFilter = new PpgDcFilter({
  alphaBaseline: 0.02,
  alphaSmooth: 0.35
})

// Algoritmo de deteccion de picos, BPM y HRV (RF17)
const peakDetector = usePeakDetector({
  refractoryMs: 380,
  windowSize: 8
})

const isSignalActive = computed(() => {
  return (serialSensor.isConnected.value && serialSensor.isReading.value) || isSimulating.value
})

function processSampleData(tMs, rawValue, leadsOff = false, hardwareBpm = 0) {
  // Si no hay dedo sobre el sensor
  if (leadsOff) {
    dcFilter.reset()
    peakDetector.handleLeadsOff()
    if (oscilloscopeRef.value) {
      oscilloscopeRef.value.addSample(0.5, false)
    }
    return
  }

  // 1. Filtrar la senal
  const filtered = dcFilter.process(rawValue)

  // 2. Detectar picos sistolicos en tiempo real y actualizar metricas (RF17)
  const isPeak = peakDetector.processSample(tMs, filtered.ac, hardwareBpm)

  // 3. Enviar muestra normalizada y marcador de pico al osciloscopio
  if (oscilloscopeRef.value) {
    oscilloscopeRef.value.addSample(filtered.normalized, isPeak)
  }
}

// Procesar cada muestra entrante del sensor fisico USB
serialSensor.subscribe((sample) => {
  processSampleData(sample.tMs, sample.value, sample.leadsOff, sample.hardwareBpm)
})

async function handleConnectUsb() {
  // RF04: El consentimiento informado emerge cuando uno conecta el sensor por USB
  if (!consentimientoEstado.value.vigente) {
    emit('solicitar-consentimiento', () => handleConnectUsb())
    return
  }

  if (isSimulating.value) {
    stopSimulation()
  }
  const ok = await serialSensor.connect()
  if (ok) {
    dcFilter.reset()
    peakDetector.reset()
    if (oscilloscopeRef.value) {
      oscilloscopeRef.value.clear()
    }
  }
}

async function handleDisconnectUsb() {
  await serialSensor.disconnect()
}

// Modo Simulador de Prueba
function handleToggleSim() {
  if (isSimulating.value) {
    stopSimulation()
  } else {
    startSimulation()
  }
}

function startSimulation() {
  isSimulating.value = true
  dcFilter.reset()
  peakDetector.reset()
  if (oscilloscopeRef.value) {
    oscilloscopeRef.value.clear()
  }
  simTimeMs = 0

  // 100 Hz = muestra cada 10 ms (~78 BPM normal)
  simTimer = setInterval(() => {
    simTimeMs += 10
    const period = 769 // 78 BPM fisiologico
    const phase = (simTimeMs % period) / period
    const s = Math.exp(-Math.pow(phase - 0.25, 2) / 0.008)
    const d = 0.30 * Math.exp(-Math.pow(phase - 0.48, 2) / 0.010)
    const pulse = s + d
    const rawVal = 2048 + pulse * 1200 + (Math.random() - 0.5) * 20

    processSampleData(simTimeMs, rawVal, false)
  }, 10)
}

function stopSimulation() {
  isSimulating.value = false
  if (simTimer) {
    clearInterval(simTimer)
    simTimer = null
  }
}

onUnmounted(() => {
  stopSimulation()
})
</script>
