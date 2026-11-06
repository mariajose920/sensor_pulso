<template>
  <div>
    <!-- Encabezado de la sección (RF17) -->
    <div style="margin-bottom: 1rem;">
      <h2 class="card-title" style="margin-bottom: 0.25rem;">Detección de picos, BPM y HRV (RF17)</h2>
      <p style="color: var(--color-muted); font-size: 0.9rem; margin-bottom: 0;">
        Detección de picos en tiempo real, cálculo de BPM, variabilidad de la frecuencia cardíaca (HRV) y regularidad del ritmo, con el sensor por WiFi, USB o con el simulador.
      </p>
    </div>

    <!-- 1. Conexion del Sensor ESP32 -->
    <Esp32Connection
      :isConnected="serialSensor.isConnected.value"
      :isSimulating="isSimulating"
      :isWifiConnected="esp32State.conectado"
      :wifiDevice="esp32State.dispositivo"
      :portInfo="serialSensor.portInfo.value"
      :rawLine="serialSensor.rawLine.value"
      :errorMessage="serialSensor.errorMessage.value"
      @connectUsb="handleConnectUsb"
      @disconnect="handleDisconnectUsb"
      @toggleSim="handleToggleSim"
    />

    <!-- Barra de Accion: Enviar Medicion a Comparacion (RF24) -->
    <div
      v-if="peakDetector.currentBpm.value > 0 && calidadSenal.nivel !== 'mala'"
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

    <!-- RF30: guardar la medición en la cuenta y consultarla en el historial -->
    <GuardarMedicionCard
      v-if="peakDetector.currentBpm.value > 0"
      :bpm="peakDetector.currentBpm.value"
      :rmssd="peakDetector.rmssd.value"
      :sdnn="peakDetector.sdnn.value"
      :ritmo="clasificacionParaGuardar.id"
      :explicacionRitmo="clasificacionParaGuardar.explicacionPorque"
      :calidad="calidadSenal.nivel"
      :causasCalidad="calidadSenal.causas"
      :fuente="fuenteMedicion"
      :paciente="paciente"
      @solicitar-consentimiento="(accion) => emit('solicitar-consentimiento', accion)"
    />

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
      :calidad="calidadSenal.nivel"
    />

    <!-- Calidad de la señal (RF15) con la causa y la sugerencia de repetir (RF16) -->
    <div style="display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.5rem;">
      <strong style="font-size: 0.85rem;">Calidad de la señal:</strong>
      <CalidadSenalBadge :nivel="calidadSenal.nivel" :causas="calidadSenal.causas" mostrar-causa />
    </div>
    <AvisoCalidadSenal :nivel="calidadSenal.nivel" :causas="calidadSenal.causas" @repetir="repetirMedicion" />

    <!-- 3. Osciloscopio con Senal Filtrada y Picos Sistolicos (Puntos Rojos) -->
    <PeakOscilloscopeCanvas
      ref="oscilloscopeRef"
      :isRunning="isSignalActive"
    />

    <!-- 4. Clasificación del Ritmo Cardíaco y Explicación Fisiológica (RF18) - Ubicado debajo de la onda -->
    <ClasificacionRitmoCard
      style="margin-top: 1rem;"
      :bpm="peakDetector.currentBpm.value"
      :instantBpm="peakDetector.instantBpm.value"
      :sdnn="peakDetector.sdnn.value"
      :rmssd="peakDetector.rmssd.value"
      :lastIntervalMs="peakDetector.lastIntervalMs.value"
      :regularityLevel="peakDetector.regularityLevel.value"
      :totalBeats="peakDetector.totalBeatsDetected.value"
      :paciente="paciente"
      :calidad="calidadSenal.nivel"
    />
  </div>
</template>

<script setup>
const emit = defineEmits(['solicitar-consentimiento'])

const props = defineProps({
  paciente: { type: Object, default: null },
  canal: { type: Number, default: 1 }
})
import { ref, computed, watch, onUnmounted } from 'vue'
import { consentimientoEstado } from '../services/consentimientoService'
import { useSerialSensor } from '../composables/useSerialSensor.js'
import { usePeakDetector } from '../composables/usePeakDetector.js'
import { PpgDcFilter } from '../utils/ppgFilter.js'
import { esp32State } from '../services/esp32Service.js'

import Esp32Connection from './Esp32Connection.vue'
import PeakMetricsCards from './PeakMetricsCards.vue'
import PeakOscilloscopeCanvas from './PeakOscilloscopeCanvas.vue'
import ClasificacionRitmoCard from './ClasificacionRitmoCard.vue'
import CalidadSenalBadge from './CalidadSenalBadge.vue'
import AvisoCalidadSenal from './AvisoCalidadSenal.vue'
import { evaluarCalidad, MAXIMO_SIMULADOR } from '../utils/calidadSenal.js'
import GuardarMedicionCard from './GuardarMedicionCard.vue'
import { clasificarRitmo } from '../services/ritmoService.js'

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

// Fuente de la medición para RF30
const fuenteMedicion = computed(() => {
  if (isSimulating.value) return 'simulador'
  if (serialSensor.isConnected.value) return 'sensor_usb'
  if (esp32State.conectado) return 'sensor_wifi'
  return 'sensor'
})

// RF30: ritmo (RF18) y su explicación para guardarlos junto a la medición
const clasificacionParaGuardar = computed(() => clasificarRitmo({
  bpm: peakDetector.currentBpm.value,
  instantBpm: peakDetector.instantBpm.value,
  sdnn: peakDetector.sdnn.value,
  rmssd: peakDetector.rmssd.value,
  lastIntervalMs: peakDetector.lastIntervalMs.value,
  regularityLevel: peakDetector.regularityLevel.value,
  totalBeats: peakDetector.totalBeatsDetected.value,
  paciente: props.paciente
}))

const isSignalActive = computed(() => {
  return (serialSensor.isConnected.value && serialSensor.isReading.value) ||
         isSimulating.value ||
         Boolean(esp32State.conectado)
})

// RF15: ventana de ~3 s del valor crudo (100 Hz) para evaluar la calidad cada 0,25 s
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
  peakDetector.setCalidad(r.nivel) // RF16: con calidad mala no se guarda como válida
}

function reiniciarCalidad() {
  ventanaCalidad.length = 0
  muestrasDesdeCalidad = 0
  calidadSenal.value = { nivel: 'sin_senal', causas: [] }
  peakDetector.setCalidad('sin_senal')
}

// RF16: repetir la medición: se descarta lo medido y se vuelve a evaluar desde cero
function repetirMedicion() {
  reiniciarCalidad()
  dcFilter.reset()
  peakDetector.reset()
  if (oscilloscopeRef.value) {
    oscilloscopeRef.value.clear()
  }
}

function processSampleData(tMs, rawValue, leadsOff = false, hardwareBpm = 0) {
  // Si no hay dedo sobre el sensor
  if (leadsOff) {
    reiniciarCalidad()
    dcFilter.reset()
    peakDetector.handleLeadsOff()
    if (oscilloscopeRef.value) {
      oscilloscopeRef.value.addSample(0.5, false)
    }
    return
  }

  actualizarCalidad(rawValue)

  // 1. Filtrar la senal
  const filtered = dcFilter.process(rawValue)

  // 2. Detectar picos sistolicos en tiempo real y actualizar metricas (RF17)
  const isPeak = peakDetector.processSample(tMs, filtered.ac, hardwareBpm)

  // 3. Enviar muestra normalizada y marcador de pico al osciloscopio
  if (oscilloscopeRef.value) {
    oscilloscopeRef.value.addSample(filtered.normalized, isPeak)
  }
}

// Procesar cada muestra entrante del sensor fisico USB (Web Serial)
serialSensor.subscribe((sample) => {
  processSampleData(sample.tMs, sample.value, sample.leadsOff, sample.hardwareBpm)
})

// Procesar telemetría inalámbrica WiFi del ESP32 (RF05, RF17)
watch(() => esp32State.paquete, () => {
  // Si está conectado por USB o en simulador, priorizar esa fuente local
  if (serialSensor.isConnected.value || isSimulating.value) return
  if (!esp32State.conectado) return

  const canalActivo = esp32State.canales.find(c => c.canal === (props.canal || 1)) || esp32State.canales[0]
  if (!canalActivo) return

  const leadsOff = canalActivo.calidad === 'sin_dedo' || canalActivo.bpm === 0
  const muestras = Array.isArray(canalActivo.ir) ? canalActivo.ir : []

  if (muestras.length === 0) {
    if (leadsOff) {
      processSampleData(Date.now(), 2048, true, 0)
    }
    return
  }

  // Distribuir temporalmente las muestras recibidas (25 muestras/s -> ~40 ms entre puntos)
  const stepMs = Math.max(10, Math.round(1000 / muestras.length))
  let t = Date.now() - (muestras.length * stepMs)
  for (const rawVal of muestras) {
    t += stepMs
    processSampleData(t, rawVal, leadsOff, canalActivo.bpm)
  }
})

// Limpiar si el WiFi se desconecta
watch(() => esp32State.conectado, (estaConectado) => {
  if (!estaConectado && !serialSensor.isConnected.value && !isSimulating.value) {
    reiniciarCalidad()
    dcFilter.reset()
    peakDetector.handleLeadsOff()
  }
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
    reiniciarCalidad()
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
  reiniciarCalidad()
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
