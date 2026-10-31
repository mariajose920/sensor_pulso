import { ref, reactive } from 'vue'
import { supabase } from './supabase'

// Estado reactivo global de la telemetría del ESP32
export const esp32State = reactive({
  conectado: false,
  ultimoContacto: null,
  tiempoTranscurridoSegundos: null,
  dispositivo: 'ESP32',
  ip: null,
  rssi: null,
  paquete: 0,
  canales: [],
  frecuenciaHz: 50,
  cargando: false,
  error: null
})

// Buffer circular de muestras de señal para graficar en tiempo real (RF06)
export const senalBuffer = reactive({
  canalSeleccionado: 1,
  // Soporta hasta 500 muestras (~10 segundos a 50 Hz)
  capacidadMaxima: 500,
  ir: [],
  rojo: [],
  congelado: false
})

let pollingInterval = null
let simuladorInterval = null
export const simuladorActivo = ref(false)

/**
 * Consulta el endpoint de la API para obtener el último paquete recibido del ESP32 por WiFi
 */
export async function consultarTelemetriaWiFi() {
  try {
    const res = await fetch('/api/esp32/telemetria', {
      headers: { 'Accept': 'application/json' }
    })
    if (!res.ok) throw new Error(`HTTP error ${res.status}`)
    const data = await res.json()

    esp32State.conectado = data.conectado
    esp32State.ultimoContacto = data.ultimoContacto
    esp32State.dispositivo = data.dispositivo || 'ESP32-Biomedico'
    esp32State.ip = data.ip
    esp32State.rssi = data.rssi
    esp32State.paquete = data.paquete || 0
    esp32State.canales = data.canales || []

    if (data.ultimoContacto) {
      const diffMs = Date.now() - new Date(data.ultimoContacto).getTime()
      esp32State.tiempoTranscurridoSegundos = Math.max(0, Math.round(diffMs / 1000))
    }

    // Actualizar buffer de muestras del canal actualmente visible si no está congelado (RF06)
    if (!senalBuffer.congelado) {
      actualizarBufferCanal()
    }

    esp32State.error = null
    return data
  } catch (err) {
    esp32State.error = err.message
    return null
  }
}

/**
 * Actualiza el buffer de graficación para el canal seleccionado
 */
export function actualizarBufferCanal() {
  const canalData = esp32State.canales.find(c => c.canal === senalBuffer.canalSeleccionado)
  if (!canalData) return

  if (Array.isArray(canalData.ir) && canalData.ir.length > 0) {
    canalData.ir.forEach(val => senalBuffer.ir.push(val))
    while (senalBuffer.ir.length > senalBuffer.capacidadMaxima) {
      senalBuffer.ir.shift()
    }
  }

  if (Array.isArray(canalData.rojo) && canalData.rojo.length > 0) {
    canalData.rojo.forEach(val => senalBuffer.rojo.push(val))
    while (senalBuffer.rojo.length > senalBuffer.capacidadMaxima) {
      senalBuffer.rojo.shift()
    }
  }
}

/**
 * Cambia el canal observado en el osciloscopio y limpia/recarga el buffer
 */
export function setCanalOsciloscopio(canalNum) {
  senalBuffer.canalSeleccionado = canalNum
  senalBuffer.ir = []
  senalBuffer.rojo = []
  actualizarBufferCanal()
}

/**
 * Inicia el sondeo periódico de recepción WiFi
 */
export function iniciarSondeoWiFi(intervaloMs = 1000) {
  detenerSondeoWiFi()
  consultarTelemetriaWiFi()
  pollingInterval = setInterval(consultarTelemetriaWiFi, intervaloMs)
}

/**
 * Detiene el sondeo periódico
 */
export function detenerSondeoWiFi() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

/**
 * Envía un paquete de prueba directamente al endpoint /api/esp32/telemetria
 * Simula el comportamiento del ESP32 enviando datos por WiFi (RF05)
 */
export async function emitirPaquetePruebaWiFi(token = 'esp_demotoken_unach_2026_rf05') {
  const now = Date.now()
  const canales = []

  const bpmBases = [72.0, 68.5, 80.0, 75.2, 65.0]
  const spo2Bases = [98.2, 97.5, 99.0, 98.0, 96.8]
  const calidades = ['buena', 'buena', 'buena', 'regular', 'buena']

  for (let c = 0; c < 5; c++) {
    const jitter = Math.sin((now + c * 300) / 4000) * 1.5
    const bpm = parseFloat((bpmBases[c] + jitter).toFixed(1))
    const spo2 = parseFloat((spo2Bases[c] + Math.cos((now + c * 500) / 6000) * 0.3).toFixed(1))

    const freqHz = bpm / 60.0
    const phaseStep = (2 * Math.PI * freqHz) / 50.0

    const ir = []
    const rojo = []
    for (let i = 0; i < 25; i++) {
      const t = (now / 1000 + i * (1 / 50)) * (2 * Math.PI * freqHz)
      const ph = t % (2 * Math.PI)
      const ppg = Math.exp(-Math.pow(ph - 1.2, 2) / 0.18) + 0.35 * Math.exp(-Math.pow(ph - 2.3, 2) / 0.12)
      const valIr = 24500 + c * 300 + 1400 * ppg + (Math.random() - 0.5) * 10
      const valRed = 21000 + c * 250 + 900 * ppg + (Math.random() - 0.5) * 10
      ir.push(parseFloat(valIr.toFixed(1)))
      rojo.push(parseFloat(valRed.toFixed(1)))
    }

    canales.push({
      canal: c + 1,
      activo: true,
      bpm,
      spo2,
      calidad: calidades[c],
      ir,
      rojo
    })
  }

  const payload = {
    dispositivo: 'ESP32-WebSimulator-WiFi',
    token,
    paquete: esp32State.paquete + 1,
    uptime_ms: now,
    wifi_rssi: -58,
    ip: '192.168.1.105',
    frecuencia_hz: 50,
    canales
  }

  const res = await fetch('/api/esp32/telemetria', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-ESP32-Token': token,
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify(payload)
  })

  if (!res.ok) {
    const errorJson = await res.json().catch(() => ({}))
    throw new Error(errorJson.error || `Error ${res.status}`)
  }

  // Refrescar inmediatamente el estado local
  await consultarTelemetriaWiFi()
  return await res.json()
}

/**
 * Inicia o detiene el simulador continuo de envío WiFi
 */
export function toggleSimuladorWiFi(token = 'esp_demotoken_unach_2026_rf05') {
  if (simuladorActivo.value) {
    clearInterval(simuladorInterval)
    simuladorInterval = null
    simuladorActivo.value = false
  } else {
    simuladorActivo.value = true
    emitirPaquetePruebaWiFi(token).catch(console.error)
    simuladorInterval = setInterval(() => {
      emitirPaquetePruebaWiFi(token).catch(console.error)
    }, 1000)
  }
}
