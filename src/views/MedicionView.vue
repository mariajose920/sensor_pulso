<template>
  <div>
    <!-- Encabezado de la Seccion Medicion (RF17) -->
    <div class="card" style="margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <h1 class="card-title" style="margin-bottom: 0.25rem;">Requerimiento Funcional 17 (RF17)</h1>
          <p style="color: var(--color-muted); font-size: 0.9rem; margin-bottom: 0;">
            Deteccion de picos en tiempo real, calculo de BPM, variabilidad de la frecuencia cardiaca (HRV) y regularidad del ritmo.
          </p>
        </div>
        <span class="badge badge-usuario" style="font-size: 0.8rem;">
          Rama: rf17-deteccion-picos
        </span>
      </div>
    </div>

    <!-- 1. Conexion del Sensor ESP32 (MAX30102) -->
    <Esp32Connection
      :isConnected="serialSensor.isConnected.value"
      :portInfo="serialSensor.portInfo.value"
      :rawLine="serialSensor.rawLine.value"
      :errorMessage="serialSensor.errorMessage.value"
      @connectUsb="handleConnectUsb"
      @disconnect="handleDisconnectUsb"
    />

    <!-- 2. Metricas en Tiempo Real (RF17: BPM, HRV, Regularidad, Picos) -->
    <MetricsCards
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

    <!-- 3. Osciloscopio con Senal Filtrada (DC Removido) y Picos Sistolicos (Puntos Rojos) -->
    <OscilloscopeCanvas
      ref="oscilloscopeRef"
      :isRunning="isSignalActive"
    />

    <!-- 4. Informacion de Calibracion y Factores de Correccion (MAX30102) -->
    <CalibrationInfo />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useSerialSensor } from '../composables/useSerialSensor.js'
import { usePeakDetector } from '../composables/usePeakDetector.js'
import { PpgDcFilter } from '../utils/ppgFilter.js'

import Esp32Connection from '../components/Esp32Connection.vue'
import MetricsCards from '../components/MetricsCards.vue'
import OscilloscopeCanvas from '../components/OscilloscopeCanvas.vue'
import CalibrationInfo from '../components/CalibrationInfo.vue'

const oscilloscopeRef = ref(null)
const serialSensor = useSerialSensor()

// Filtro de remocion de linea base DC e inversion optica
const dcFilter = new PpgDcFilter({
  alphaBaseline: 0.02,
  alphaSmooth: 0.35,
  invert: true
})

// Algoritmo de deteccion de picos, BPM y HRV (RF17)
const peakDetector = usePeakDetector({
  refractoryMs: 360,
  windowSize: 15
})

const isSignalActive = computed(() => {
  return serialSensor.isConnected.value && serialSensor.isReading.value
})

// Procesar cada muestra entrante del sensor fisico
serialSensor.subscribe((sample) => {
  // 1. Filtrar la senal cruda del sensor: remover DC e invertir polaridad
  const filtered = dcFilter.process(sample.value)

  // 2. Detectar picos sistolicos en tiempo real sobre la senal AC limpia (RF17)
  const isPeak = peakDetector.processSample(sample.tMs, filtered.ac)

  // 3. Enviar muestra normalizada y marcador de pico al osciloscopio
  if (oscilloscopeRef.value) {
    oscilloscopeRef.value.addSample(filtered.normalized, isPeak)
  }
})

async function handleConnectUsb() {
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
</script>
