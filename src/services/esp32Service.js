import { ref, reactive, computed } from 'vue'
import { evaluarCalidad, MAXIMO_MAX30102 } from '../utils/calidadSenal.js'
import { calcularMetricasCanal } from '../utils/metricasCanal.js'
import { crearEstabilizadorPulso } from '../utils/estabilizadorPulso.js'
import { crearEstabilizadorSpo2 } from '../utils/estabilizadorSpo2.js'
import { actualizarBuffersMultiCanal } from './multiCanalService.js'
import { useSerialSensor } from '../composables/useSerialSensor.js'
import {
  FUENTES, validarFuente, crearAgregadorSerial, MENSAJE_USB_NO_SOPORTADO
} from '../utils/fuenteMedicion.js'
import { codificarComando, parsearLinea, BAUDIOS } from '../utils/provisionWifi.js'
import { decidirAnteRespuesta, esRespuestaVieja } from '../utils/toleranciaConexion.js'
import { crearEstimadorFrecuencia, elegirFrecuencia } from '../utils/estimarFrecuencia.js'

// Frecuencia real de la señal por WiFi: la que informa la placa o, si no, la que se deduce de los paquetes
const estimadorFrecuenciaWifi = crearEstimadorFrecuencia()

/**
 * FUENTE DE MEDICIÓN: el usuario debe elegir 'wifi' o 'usb' (esp32State.fuente).
 *  - null  : aún no eligió -> no se sondea WiFi ni se abre USB.
 *  - 'wifi': sondeo HTTP de /api/esp32/telemetria (comportamiento de siempre) y simulador.
 *  - 'usb' : Web Serial (conectarUsb desde un clic); las muestras llenan el MISMO
 *            esp32State.canales / senalBuffer que usa el resto de la app.
 */
const CLAVE_FUENTE = 'sensor_pulso_fuente_medicion'

function usbSoportado() {
  return typeof navigator !== 'undefined' && 'serial' in navigator
}

function leerFuenteGuardada() {
  try {
    const guardada = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(CLAVE_FUENTE) : null
    // 'usb' guardada solo vale si este navegador soporta Web Serial
    return validarFuente(guardada, { usbSoportado: usbSoportado() }).fuente
  } catch {
    return null
  }
}

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
  error: null,
  fuente: null // 'wifi' | 'usb' | null (null = el usuario aún no eligió)
})
esp32State.fuente = leerFuenteGuardada()
if (esp32State.fuente === FUENTES.usb) esp32State.dispositivo = 'ESP32 (USB)'

// true cuando el usuario ya eligió WiFi o USB
export const fuenteElegida = computed(() => esp32State.fuente !== null)

// Estado de la conexión USB (Web Serial)
export const usbState = reactive({
  soportado: usbSoportado(),
  mensajeNoSoportado: MENSAJE_USB_NO_SOPORTADO,
  conectando: false,
  conectado: false,
  puerto: '',
  puertoAuto: false, // true si el puerto se identificó solo (sin elegirlo a mano)
  error: null,
  ultimaLinea: '',
  lineasInvalidas: 0
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

// RF15: ventana reciente de muestras IR por canal (~3 s) para medir la calidad de cada uno
const SEGUNDOS_VENTANA_CALIDAD = 3
const ventanasCalidad = new Map()

// UN SOLO PULSO PARA TODA LA APP (igual por WiFi y por USB): por canal se acumulan ~8 s de muestras ir/rojo y,
// ~1 vez por segundo, calcularMetricasCanal obtiene el pulso a partir de los mismos picos que se dibujan.
// `bpm` del canal = ese pulso estabilizado (null = sin lectura); `bpmPlaca` = lo que mandó la placa (solo informativo).
const SEGUNDOS_VENTANA_PULSO = 8
const INTERVALO_PULSO_MS = 1000
const HUECO_MAX_MS = 3000 // sin datos durante más que esto la ventana acumulada ya no es continua: se reinicia
const estadosPulso = new Map() // canal -> { ir, rojo, total, hz, ultimoDato, ultimoCalculo, estab, confianza, bpm }

function reiniciarPulsos() {
  estadosPulso.clear()
}

function estadoPulso(canal, hz, ahora) {
  let e = estadosPulso.get(canal)
  const cambioHz = e && Math.abs(e.hz - hz) / e.hz > 0.15
  if (!e || cambioHz || ahora - e.ultimoDato > HUECO_MAX_MS) {
    e = { ir: [], rojo: [], total: 0, hz, ultimoDato: ahora, ultimoCalculo: -Infinity, estab: crearEstabilizadorPulso(), estabSpo2: crearEstabilizadorSpo2(), confianza: 'baja', bpm: null }
    estadosPulso.set(canal, e)
  }
  e.hz = hz
  return e
}

function pulsoDelCanal(c, hz) {
  const ahora = Date.now()
  const e = estadoPulso(c.canal, hz, ahora)
  // SpO2 de la placa estabilizada (mediana de lecturas válidas; 0 = sin lectura, nunca se inventa un valor)
  const spo2 = e.estabSpo2.actualizar(c.spo2, ahora)
  const nuevas = Array.isArray(c.ir) ? c.ir : []
  if (nuevas.length > 0) {
    e.ultimoDato = ahora
    e.ir.push(...nuevas)
    e.total += nuevas.length
    if (Array.isArray(c.rojo) && c.rojo.length) e.rojo.push(...c.rojo)
    const max = Math.round(SEGUNDOS_VENTANA_PULSO * hz)
    if (e.ir.length > max) e.ir.splice(0, e.ir.length - max)
    if (e.rojo.length > max) e.rojo.splice(0, e.rojo.length - max)
    if (ahora - e.ultimoCalculo >= INTERVALO_PULSO_MS) {
      e.ultimoCalculo = ahora
      const m = calcularMetricasCanal({ ir: e.ir, rojo: e.rojo.length === e.ir.length ? e.rojo : undefined, frecuenciaHz: hz })
      const ultimo = m.picos.length ? m.picos[m.picos.length - 1].indice : null
      e.bpm = e.estab.actualizar({ bpm: m.bpm, ultimoPico: ultimo === null ? undefined : e.total - e.ir.length + ultimo })
      e.confianza = e.bpm === null ? 'baja' : m.confianza
    }
  }
  return { bpm: e.bpm, confianza: e.confianza, spo2 }
}

function calidadPorCanal(canales) {
  const hz = esp32State.frecuenciaHz || 50
  const maxMuestras = Math.round(SEGUNDOS_VENTANA_CALIDAD * hz)
  const bpmDePlaca = (c) => (typeof c.bpm === 'number' && Number.isFinite(c.bpm) && c.bpm > 0 ? c.bpm : null)
  const presentes = new Set(canales.map((c) => c.canal))
  for (const k of [...estadosPulso.keys()]) if (!presentes.has(k)) estadosPulso.delete(k)
  return canales.map((c) => {
    // Sin dedo no hay señal que evaluar: se descarta la ventana vieja y no hay pulso
    if (c.calidad === 'sin_dedo') {
      ventanasCalidad.delete(c.canal)
      estadosPulso.delete(c.canal)
      return { ...c, bpm: null, bpmPlaca: bpmDePlaca(c), spo2: null, spo2Placa: bpmDePlaca({ bpm: c.spo2 }), confianza: 'baja', causasCalidad: [] }
    }
    const ventana = ventanasCalidad.get(c.canal) || []
    if (Array.isArray(c.ir)) ventana.push(...c.ir)
    if (ventana.length > maxMuestras) ventana.splice(0, ventana.length - maxMuestras)
    ventanasCalidad.set(c.canal, ventana)

    const pulso = pulsoDelCanal(c, hz)
    const base = { ...c, bpm: pulso.bpm, bpmPlaca: bpmDePlaca(c), spo2: pulso.spo2, spo2Placa: bpmDePlaca({ bpm: c.spo2 }), confianza: pulso.confianza }

    const r = evaluarCalidad(ventana, { frecuenciaHz: hz, maximo: MAXIMO_MAX30102 })
    // Sin muestras suficientes se conserva la calidad que informó el dispositivo.
    if (r.nivel === 'sin_senal') return { ...base, causasCalidad: [] }
    return { ...base, calidad: r.nivel, causasCalidad: r.causas }
  })
}

let pollingInterval = null
let intervaloSolicitadoMs = null // intervalo pedido con iniciarSondeoWiFi (null = nadie lo pidió)
let simuladorInterval = null
export const simuladorActivo = ref(false)

/**
 * Consulta el endpoint de la API para obtener el último paquete recibido del ESP32 por WiFi
 * (solo si la fuente elegida es 'wifi').
 */
// Última vez (hora de este equipo) que el servidor confirmó datos frescos del ESP32; sirve para tolerar huecos cortos
let ultimoOkMs = null
let consultando = false

// Hueco corto o consulta fallida: se conservan canales y estado; pasada la tolerancia, se pasa a «desconectado»
function aplicarHueco(decision) {
  if (decision === 'perder') {
    esp32State.conectado = false
    esp32State.canales = []
  } else if (esp32State.ultimoContacto) {
    const diffMs = Date.now() - new Date(esp32State.ultimoContacto).getTime()
    esp32State.tiempoTranscurridoSegundos = Math.max(0, Math.round(diffMs / 1000))
  }
}

export async function consultarTelemetriaWiFi() {
  // Con USB o sin fuente elegida no se sondea
  if (esp32State.fuente !== FUENTES.wifi) return null
  // Una consulta a la vez: si la anterior sigue en vuelo no se apilan respuestas desordenadas
  if (consultando) return null
  consultando = true
  try {
    const res = await fetch('/api/esp32/telemetria', {
      headers: { 'Accept': 'application/json' }
    })
    if (!res.ok) throw new Error(`HTTP error ${res.status}`)
    const data = await res.json()
    // El usuario pudo cambiar de fuente mientras la petición estaba en vuelo
    if (esp32State.fuente !== FUENTES.wifi) return null

    // Una instancia del servidor sin datos recientes puede contestar con algo más viejo que lo que ya se muestra
    if (esRespuestaVieja(esp32State.ultimoContacto, data.ultimoContacto)) return null

    const decision = decidirAnteRespuesta({
      conectadoAhora: esp32State.conectado,
      ultimoOkMs,
      ahoraMs: Date.now(),
      servidorConectado: Boolean(data.conectado)
    })
    if (decision !== 'aplicar') {
      aplicarHueco(decision)
      esp32State.error = null
      return data
    }
    ultimoOkMs = Date.now()

    esp32State.conectado = data.conectado
    esp32State.ultimoContacto = data.ultimoContacto
    esp32State.dispositivo = data.dispositivo || 'ESP32-Biomedico'
    esp32State.ip = data.ip
    esp32State.rssi = data.rssi
    esp32State.paquete = data.paquete || 0
    estimadorFrecuenciaWifi.agregar({
      paquete: data.paquete,
      ultimoContacto: data.ultimoContacto,
      muestras: Array.isArray(data.canales?.[0]?.ir) ? data.canales[0].ir.length : 0
    })
    esp32State.frecuenciaHz = elegirFrecuencia(data.frecuenciaHz, estimadorFrecuenciaWifi.estimar(), esp32State.frecuenciaHz)
    esp32State.canales = calidadPorCanal(data.canales || [])
    actualizarBuffersMultiCanal(esp32State.canales)

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
    // Sin respuesta (red caída, servidor lento): mismo criterio, no se vacía la pantalla por un fallo aislado
    if (esp32State.fuente === FUENTES.wifi) {
      aplicarHueco(decidirAnteRespuesta({
        conectadoAhora: esp32State.conectado, ultimoOkMs, ahoraMs: Date.now(), servidorConectado: null
      }))
    }
    return null
  } finally {
    consultando = false
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

// RF16: repetir la medición del canal en pantalla: se descarta lo recibido y se vuelve a evaluar la calidad
export function repetirMedicionCanal() {
  ventanasCalidad.clear()
  reiniciarPulsos()
  senalBuffer.ir = []
  senalBuffer.rojo = []
}

// Finalizar la medición: la señal en pantalla se congela con lo último recibido
export function finalizarMedicionCanal() {
  senalBuffer.congelado = true
}

// Nueva medición del canal: se descarta lo anterior y la señal vuelve a graficarse en vivo
export function iniciarNuevaMedicionCanal() {
  repetirMedicionCanal()
  senalBuffer.congelado = false
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
 * Inicia el sondeo periódico de recepción WiFi.
 * Se recuerda la petición: si aún no hay fuente elegida (o es USB) NO sondea y el
 * sondeo arranca solo cuando el usuario elija WiFi (ver seleccionarFuente).
 */
export function iniciarSondeoWiFi(intervaloMs = 1000) {
  detenerSondeoWiFi()
  intervaloSolicitadoMs = intervaloMs
  if (esp32State.fuente !== FUENTES.wifi) return
  arrancarTimerSondeo()
}

function arrancarTimerSondeo() {
  pararTimerSondeo()
  consultarTelemetriaWiFi()
  pollingInterval = setInterval(consultarTelemetriaWiFi, intervaloSolicitadoMs || 1000)
}

function pararTimerSondeo() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

/**
 * Detiene el sondeo periódico (y olvida la petición de iniciarlo)
 */
export function detenerSondeoWiFi() {
  intervaloSolicitadoMs = null
  pararTimerSondeo()
}

/**
 * Envía un paquete de prueba directamente al endpoint /api/esp32/telemetria
 * Simula el comportamiento del ESP32 enviando datos por WiFi (RF05)
 */
// Fase acumulada de la onda simulada por canal: la señal es continua de un paquete al siguiente
// (25 muestras por paquete a 25 Hz = 1 s de señal), así el pulso calculado por la app es el simulado.
const fasesSimulador = [0, 0, 0, 0, 0]
const HZ_SIMULADOR = 25

export async function emitirPaquetePruebaWiFi(token = 'esp_demotoken_unach_2026_rf05', customCanal1 = null) {
  const now = Date.now()
  const canales = []

  const bpmBases = [72.0, 68.5, 80.0, 75.2, 65.0]
  const spo2Bases = [98.2, 97.5, 99.0, 98.0, 96.8]
  const calidades = ['buena', 'buena', 'buena', 'regular', 'buena']

  for (let c = 0; c < 5; c++) {
    const jitter = Math.sin((now + c * 300) / 4000) * 1.5
    let bpm = parseFloat((bpmBases[c] + jitter).toFixed(1))
    let spo2 = parseFloat((spo2Bases[c] + Math.cos((now + c * 500) / 6000) * 0.3).toFixed(1))
    if (c === 0 && customCanal1) {
      if (typeof customCanal1.bpm === 'number') bpm = customCanal1.bpm
      if (typeof customCanal1.spo2 === 'number') spo2 = customCanal1.spo2
    }

    const freqHz = bpm / 60.0

    const ir = []
    const rojo = []
    for (let i = 0; i < HZ_SIMULADOR; i++) {
      fasesSimulador[c] = (fasesSimulador[c] + (2 * Math.PI * freqHz) / HZ_SIMULADOR) % (2 * Math.PI)
      const ph = fasesSimulador[c]
      const ppg = Math.exp(-Math.pow(ph - 1.2, 2) / 0.18) + 0.35 * Math.exp(-Math.pow(ph - 2.3, 2) / 0.12)
      // Modelo de absorción óptica del MAX30102 (RF114)
      const ratioSpO2 = (110.0 - spo2) / 25.0
      const valIr = 24500 + c * 300 + 1400 * ppg + (Math.random() - 0.5) * 8
      const valRed = 21000 + c * 250 + (1400 * ppg * ratioSpO2 * ((21000 + c * 250) / (24500 + c * 300))) + (Math.random() - 0.5) * 8
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
    frecuencia_hz: HZ_SIMULADOR,
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
 * Inicia o detiene el simulador continuo de envío WiFi.
 * El simulador envía por HTTP, o sea que es la ruta WiFi: al activarlo, si la fuente
 * era USB o no estaba elegida, se cambia a 'wifi' (deteniendo el puerto serie).
 */
export function toggleSimuladorWiFi(token = 'esp_demotoken_unach_2026_rf05') {
  if (simuladorActivo.value) {
    clearInterval(simuladorInterval)
    simuladorInterval = null
    simuladorActivo.value = false
  } else {
    if (esp32State.fuente !== FUENTES.wifi) seleccionarFuente(FUENTES.wifi)
    simuladorActivo.value = true
    emitirPaquetePruebaWiFi(token).catch(console.error)
    simuladorInterval = setInterval(() => {
      emitirPaquetePruebaWiFi(token).catch(console.error)
    }, 1000)
  }
}

// ============================================================================
// Selección de fuente y recepción por USB (Web Serial)
// ============================================================================
let serial = null // instancia perezosa de useSerialSensor
const agregadorUsb = crearAgregadorSerial()
let timerUsb = null
let desuscribirLinea = null
let desuscribirDesconexion = null
const INTERVALO_PUBLICACION_USB_MS = 200

function limpiarEstadoMedicion() {
  ultimoOkMs = null
  estimadorFrecuenciaWifi.reiniciar()
  esp32State.conectado = false
  esp32State.ultimoContacto = null
  esp32State.tiempoTranscurridoSegundos = null
  esp32State.ip = null
  esp32State.rssi = null
  esp32State.paquete = 0
  esp32State.canales = []
  esp32State.frecuenciaHz = 50
  esp32State.error = null
  ventanasCalidad.clear()
  reiniciarPulsos()
  senalBuffer.ir = []
  senalBuffer.rojo = []
  agregadorUsb.reiniciar()
}

function detenerLecturaUsb() {
  if (timerUsb) { clearInterval(timerUsb); timerUsb = null }
  if (desuscribirLinea) { desuscribirLinea(); desuscribirLinea = null }
  if (desuscribirDesconexion) { desuscribirDesconexion(); desuscribirDesconexion = null }
}

/**
 * Elige la fuente de medición ('wifi' | 'usb'). Detiene la anterior (sondeo WiFi /
 * simulador / puerto serie) y limpia canales y buffers.
 * Con 'wifi' reanuda el sondeo si alguien lo había pedido (iniciarSondeoWiFi).
 * Con 'usb' NO abre el puerto: eso exige un clic del usuario (conectarUsb).
 * @returns {boolean} true si la fuente quedó seleccionada (también si ya lo estaba)
 */
export function seleccionarFuente(fuente) {
  const v = validarFuente(fuente, { usbSoportado: usbSoportado() })
  if (!v.valida) {
    if (fuente === FUENTES.usb) usbState.error = v.motivo
    return false
  }
  if (esp32State.fuente === v.fuente) return true

  // Detener la fuente anterior
  pararTimerSondeo()
  if (simuladorActivo.value) {
    clearInterval(simuladorInterval)
    simuladorInterval = null
    simuladorActivo.value = false
  }
  detenerLecturaUsb()
  usbState.conectado = false
  usbState.conectando = false
  usbState.puerto = ''
  if (serial) serial.disconnect().catch(() => {})

  esp32State.fuente = v.fuente
  esp32State.dispositivo = v.fuente === FUENTES.usb ? 'ESP32 (USB)' : 'ESP32'
  usbState.error = null
  limpiarEstadoMedicion()

  try {
    if (typeof sessionStorage !== 'undefined') sessionStorage.setItem(CLAVE_FUENTE, v.fuente)
  } catch { /* sessionStorage puede no estar disponible: la elección vale igual en memoria */ }

  if (v.fuente === FUENTES.wifi && intervaloSolicitadoMs) arrancarTimerSondeo()
  return true
}

/**
 * Procesa una línea recibida por USB (exportada para pruebas). Devuelve cuántas
 * muestras válidas aportó. Solo hace efecto con la fuente 'usb'.
 */
export function procesarLineaSerial(linea) {
  if (esp32State.fuente !== FUENTES.usb) return 0
  // Mensajes del protocolo de configuración del WiFi ("@SP ..."): no son muestras ni líneas inválidas
  if (typeof linea === 'string' && linea.startsWith('@SP ')) return 0
  const n = agregadorUsb.agregarLinea(linea)
  usbState.ultimaLinea = linea
  if (n === 0) usbState.lineasInvalidas++
  return n
}

/**
 * Pasa lo acumulado por USB a esp32State / senalBuffer (como si fuera un paquete WiFi).
 * Se ejecuta cada ~200 ms mientras el puerto está abierto (exportada para pruebas).
 */
export function publicarMuestrasUsb() {
  if (esp32State.fuente !== FUENTES.usb) return null
  const instantanea = agregadorUsb.instantanea()
  const hayMuestras = instantanea.some((c) => c.ir.length > 0)
  if (instantanea.length > 0) {
    // Hay canales que están enviando líneas (aunque sea «sin dedo»): hay contacto
    esp32State.frecuenciaHz = Math.round(agregadorUsb.frecuenciaHz() * 10) / 10
    // Igual que por WiFi: un canal sin dedo informa calidad «sin_dedo» (la pantalla avisa que apoye el dedo)
    esp32State.canales = calidadPorCanal(instantanea.map((c) => (c.sinDedo ? { ...c, calidad: 'sin_dedo' } : c)))
    esp32State.ultimoContacto = new Date().toISOString()
    if (hayMuestras) {
      esp32State.paquete += 1
      actualizarBuffersMultiCanal(esp32State.canales)
      if (!senalBuffer.congelado) actualizarBufferCanal()
    }
  } else if (esp32State.canales.length > 0) {
    // Ningún canal envía desde hace unos segundos: sensor no detectado
    esp32State.canales = []
  }
  if (esp32State.ultimoContacto) {
    const diffMs = Date.now() - new Date(esp32State.ultimoContacto).getTime()
    esp32State.tiempoTranscurridoSegundos = Math.max(0, Math.round(diffMs / 1000))
  }
  return instantanea
}

/**
 * Abre el puerto serie (Web Serial). DEBE llamarse desde un gesto del usuario (clic):
 * el navegador muestra su selector de puerto. Si la fuente no es 'usb', la selecciona.
 * @returns {Promise<boolean>}
 */
export async function conectarUsb({ manual = false } = {}) {
  if (!usbSoportado()) {
    usbState.error = MENSAJE_USB_NO_SOPORTADO
    return false
  }
  if (configUsbState.abierto && !configUsbState.compartido) {
    usbState.error = 'Termina o cierra el asistente de WiFi antes de conectar por USB.'
    return false
  }
  if (esp32State.fuente !== FUENTES.usb && !seleccionarFuente(FUENTES.usb)) return false
  if (usbState.conectado || usbState.conectando) return usbState.conectado

  usbState.conectando = true
  usbState.error = null
  if (!serial) serial = useSerialSensor()
  const sp = serial
  let ok = false
  try {
    ok = await sp.connect(115200, { manual })
  } finally {
    usbState.conectando = false
  }

  // El usuario pudo cambiar de fuente mientras elegía el puerto
  if (ok && esp32State.fuente !== FUENTES.usb) {
    await sp.disconnect()
    return false
  }
  if (!ok) {
    usbState.error = sp.errorMessage.value || null // sin mensaje si canceló el selector
    return false
  }

  limpiarEstadoMedicion()
  usbState.conectado = true
  usbState.puerto = sp.portInfo.value
  usbState.puertoAuto = Boolean(sp.autoDetectado?.value)
  usbState.lineasInvalidas = 0
  esp32State.conectado = true
  esp32State.dispositivo = 'ESP32 (USB)'

  detenerLecturaUsb()
  desuscribirLinea = sp.subscribeLinea(procesarLineaSerial)
  // Cable desenchufado o lectura terminada sin pedirlo: conectado=false
  desuscribirDesconexion = sp.onDesconexion((mensaje) => {
    detenerLecturaUsb()
    usbState.conectado = false
    usbState.puerto = ''
    usbState.error = mensaje
    esp32State.conectado = false
    esp32State.canales = []
  })
  timerUsb = setInterval(publicarMuestrasUsb, INTERVALO_PUBLICACION_USB_MS)
  return true
}

/** Cierra el puerto serie; conectado=false y se limpian los canales. La fuente sigue siendo 'usb'. */
export async function desconectarUsb() {
  detenerLecturaUsb()
  if (serial) {
    try { await serial.disconnect() } catch { /* ya cerrado */ }
  }
  usbState.conectado = false
  usbState.conectando = false
  usbState.puerto = ''
  if (esp32State.fuente === FUENTES.usb) {
    esp32State.conectado = false
    esp32State.canales = []
    esp32State.paquete = 0
  }
}

// ============================================================================
// Configuración del WiFi del ESP32 por cable USB (asistente)
// ============================================================================
// Usa el protocolo "@SP {json}" de src/utils/provisionWifi.js sobre Web Serial.
//  - Si la fuente USB de medición ya tiene el puerto abierto, el asistente usa ESE puerto
//    (compartido=true) y NO lo cierra al terminar.
//  - Si no, abre uno propio y lo cierra al terminar (cerrarPuertoConfiguracion), dejándolo
//    libre para la fuente USB o el Monitor Serie.
//  - usbState / esp32State no cambian de significado: aquí solo se añade configUsbState.

/** Estado del puerto del asistente de configuración (solo lectura desde la interfaz). */
export const configUsbState = reactive({
  soportado: usbSoportado(),
  abriendo: false,
  abierto: false,
  compartido: false, // true si se reutiliza el puerto de la fuente USB (no se cierra)
  puerto: '',
  puertoAuto: false
})

let serialConfig = null // instancia propia del asistente (cuando no se comparte)
let serialConfigActivo = null // instancia que se usa para escribir/leer (propia o compartida)
let configDesuscribirLinea = null
let configDesuscribirDesconexion = null
const oyentesEventosConfig = new Set()
const oyentesPerdidaConfig = new Set()

function limpiarConfig() {
  if (configDesuscribirLinea) { configDesuscribirLinea(); configDesuscribirLinea = null }
  if (configDesuscribirDesconexion) { configDesuscribirDesconexion(); configDesuscribirDesconexion = null }
  serialConfigActivo = null
  configUsbState.abriendo = false
  configUsbState.abierto = false
  configUsbState.compartido = false
  configUsbState.puerto = ''
  configUsbState.puertoAuto = false
}

/**
 * Abre (o reutiliza) el puerto serie para configurar el WiFi. DEBE llamarse desde un clic.
 * Identifica el ESP32 solo; con { manual: true } el navegador deja elegir cualquier puerto.
 * @returns {Promise<{ok:boolean, error?:string, cancelado?:boolean, compartido?:boolean, puerto?:string, auto?:boolean}>}
 *   Nunca lanza: los motivos de fallo vienen en `error` (texto en español) o `cancelado`.
 */
export async function abrirPuertoConfiguracion({ manual = false } = {}) {
  if (!usbSoportado()) return { ok: false, error: MENSAJE_USB_NO_SOPORTADO + '. Puedes configurar el WiFi de otra forma o usar la fuente USB directa.' }
  if (configUsbState.abierto) {
    return { ok: true, compartido: configUsbState.compartido, puerto: configUsbState.puerto, auto: configUsbState.puertoAuto }
  }
  if (configUsbState.abriendo || usbState.conectando) {
    return { ok: false, error: 'El puerto USB se está abriendo. Espera un momento y vuelve a intentar.' }
  }

  // Puerto de la fuente USB ya abierto: se reutiliza
  if (usbState.conectado && serial) {
    serialConfigActivo = serial
    configUsbState.compartido = true
    configUsbState.puerto = usbState.puerto
    configUsbState.puertoAuto = usbState.puertoAuto
  } else {
    configUsbState.abriendo = true
    const sp = useSerialSensor()
    let ok = false
    try {
      ok = await sp.connect(BAUDIOS, { manual })
    } finally {
      configUsbState.abriendo = false
    }
    if (!ok) {
      const error = sp.errorMessage.value || ''
      return error ? { ok: false, error } : { ok: false, cancelado: true }
    }
    serialConfig = sp
    serialConfigActivo = sp
    configUsbState.compartido = false
    configUsbState.puerto = sp.portInfo.value
    configUsbState.puertoAuto = Boolean(sp.autoDetectado?.value)
  }

  const activo = serialConfigActivo
  configUsbState.abierto = true
  configDesuscribirLinea = activo.subscribeLinea((linea) => {
    const ev = parsearLinea(linea)
    if (!ev) return
    for (const cb of [...oyentesEventosConfig]) {
      try { cb(ev) } catch { /* un oyente roto no debe afectar al resto */ }
    }
  })
  configDesuscribirDesconexion = activo.onDesconexion((mensaje) => {
    limpiarConfig()
    serialConfig = null
    for (const cb of [...oyentesPerdidaConfig]) {
      try { cb(mensaje) } catch { /* idem */ }
    }
  })
  return { ok: true, compartido: configUsbState.compartido, puerto: configUsbState.puerto, auto: configUsbState.puertoAuto }
}

/** Recibe cada evento del ESP32 ya interpretado ({ev:'hello'|'scan'|'wifi'|...}). Devuelve la función para dejar de escuchar. */
export function suscribirEventosConfiguracion(callback) {
  oyentesEventosConfig.add(callback)
  return () => oyentesEventosConfig.delete(callback)
}

/** Avisa si el puerto se pierde (cable desenchufado) mientras el asistente lo usa. */
export function alPerderPuertoConfiguracion(callback) {
  oyentesPerdidaConfig.add(callback)
  return () => oyentesPerdidaConfig.delete(callback)
}

/** Escribe una línea ya codificada (ver codificarComando). Lanza Error en español si el puerto no está abierto. */
export async function escribirConfiguracion(texto) {
  if (!configUsbState.abierto || !serialConfigActivo) throw new Error('El ESP32 no está conectado por USB.')
  await serialConfigActivo.write(texto)
}

/**
 * Codifica y envía un comando del protocolo: 'hello' | 'scan' | 'status' | 'forget' | 'wifi' | 'server'.
 * Valida los datos (p. ej. ssid 1-32 bytes, clave 0-63) y lanza Error en español sin incluir la clave.
 */
export async function enviarComandoWifi(cmd, datos) {
  await escribirConfiguracion(codificarComando(cmd, datos))
}

/**
 * Libera el puerto del asistente. Solo lo cierra si lo abrió el asistente; si era el de la fuente USB
 * de medición lo deja abierto. Se puede llamar varias veces.
 */
export async function cerrarPuertoConfiguracion() {
  const propio = serialConfig
  const eraCompartido = configUsbState.compartido
  oyentesEventosConfig.clear()
  oyentesPerdidaConfig.clear()
  limpiarConfig()
  serialConfig = null
  if (propio && !eraCompartido) {
    try { await propio.disconnect() } catch { /* ya cerrado */ }
  }
}
