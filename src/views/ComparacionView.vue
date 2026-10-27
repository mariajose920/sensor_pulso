<template>
  <div>
    <!-- Encabezado de la Seccion Comparacion (RF24) -->
    <div class="card" style="margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <h1 class="card-title" style="margin-bottom: 0.25rem;">Comparacion Frecuencia Cardiaca</h1>
          <p style="color: var(--color-muted); font-size: 0.9rem; margin-bottom: 0;">
            Comparacion contra la plantilla de pulso (PPG) normal en reposo y referencia educativa con ECG normal.
          </p>
        </div>
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

    <!-- 2. Comparacion de Parametros: BPM e Intervalos medidos en vivo vs Reposo (RF24) -->
    <MetricsCards
      :currentBpm="currentBpm"
      :currentIntervalMs="currentIntervalMs"
    />

    <!-- 3. Osciloscopio con Senal Superpuesta a la Plantilla de Reposo (RF24) -->
    <OscilloscopeCanvas
      ref="oscilloscopeRef"
      :isRunning="isSignalActive"
    />

    <!-- 4. Comparacion con Plantilla de Reposo y Referencia Educativa ECG (RF24) -->
    <TemplateComparator
      :currentBpm="currentBpm"
      :lastIntervalMs="currentIntervalMs"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useSerialSensor } from '../composables/useSerialSensor.js'

import Esp32Connection from '../components/Esp32Connection.vue'
import MetricsCards from '../components/MetricsCards.vue'
import OscilloscopeCanvas from '../components/OscilloscopeCanvas.vue'
import TemplateComparator from '../components/TemplateComparator.vue'

const oscilloscopeRef = ref(null)
const serialSensor = useSerialSensor()

// Variables dinamicas de BPM e intervalo calculados en vivo del sensor
const currentBpm = ref(72)
const currentIntervalMs = ref(833)

const isSignalActive = computed(() => {
  return serialSensor.isConnected.value && serialSensor.isReading.value
})

// Variables para calculo robusto de frecuencia cardiaca
let smoothedVal = null
let baseline = null
let prevVal = 0
let prevSlope = 0
let lastPeakTime = null
const recentIntervals = []

function trackHeartRate(tMs, rawVal) {
  if (smoothedVal === null) {
    smoothedVal = rawVal
    baseline = rawVal
    prevVal = rawVal
    return
  }

  // Suavizado EMA y seguimiento de linea base
  smoothedVal = smoothedVal * 0.70 + rawVal * 0.30
  baseline = baseline * 0.98 + smoothedVal * 0.02
  const currentSlope = smoothedVal - prevVal

  // Deteccion de cresta sistolica:
  // 1. Debe estar en la parte superior del pulso (por encima de la linea base)
  // 2. La pendiente pasa de positiva a negativa (maximo local)
  const isAboveBaseline = smoothedVal > baseline
  const isCrest = prevSlope > 0 && currentSlope <= 0 && isAboveBaseline

  if (isCrest) {
    if (lastPeakTime === null) {
      // Primer latido detectado: inicializamos referencia de tiempo
      lastPeakTime = tMs
    } else {
      const delta = tMs - lastPeakTime

      // Ventana fisiologica valida (350 ms a 1900 ms = 31 a 171 BPM)
      if (delta >= 350 && delta <= 1900) {
        lastPeakTime = tMs
        recentIntervals.push(delta)
        if (recentIntervals.length > 5) {
          recentIntervals.shift()
        }

        // Promedio movil para estabilidad
        const avgInterval = recentIntervals.reduce((a, b) => a + b, 0) / recentIntervals.length
        currentIntervalMs.value = Math.round(avgInterval)
        currentBpm.value = Math.round(60000 / avgInterval)
      } else if (delta > 1900) {
        // Si paso demasiado tiempo (dedo levantado o pausa), reiniciamos referencia
        lastPeakTime = tMs
      }
    }
  }

  prevSlope = currentSlope
  prevVal = smoothedVal
}

// Conexion de muestras entrantes del sensor
serialSensor.subscribe((sample) => {
  // 1. Calcular BPM e intervalo en tiempo real
  trackHeartRate(sample.tMs, sample.value)

  // 2. Enviar muestra al osciloscopio
  if (oscilloscopeRef.value) {
    oscilloscopeRef.value.addSample(sample.value)
  }
})

async function handleConnectUsb() {
  const ok = await serialSensor.connect()
  if (ok) {
    smoothedVal = null
    baseline = null
    prevVal = 0
    prevSlope = 0
    lastPeakTime = null
    recentIntervals.length = 0
    if (oscilloscopeRef.value) {
      oscilloscopeRef.value.clear()
    }
  }
}

async function handleDisconnectUsb() {
  await serialSensor.disconnect()
}
</script>
