/**
 * ============================================================================
 * sensor_pulso · Fuente de medición (WiFi o USB) y procesamiento de muestras seriales
 * ============================================================================
 * Lógica PURA (sin Vue, sin navegador): se puede probar en Node.
 *
 * 1) Fuente de medición: el usuario debe elegir entre 'wifi' y 'usb' (Web Serial).
 * 2) Parseo de una línea del puerto serie a muestras por canal, tolerante a líneas
 *    vacías, texto de depuración, líneas corruptas o truncadas.
 * 3) Agregador por canal: mantiene una ventana (~10 s) de muestras, estima la
 *    frecuencia de muestreo con los timestamps (o 50 Hz por defecto) y calcula
 *    BPM (picos) y SpO2 (razón de razones R) REALES a partir de las muestras.
 *    Si no hay datos suficientes devuelve null: nunca se inventan valores.
 *
 * ----------------------------------------------------------------------------
 * FORMATOS DE LÍNEA POR USB (115200 baudios, una línea por muestra/trama)
 * ----------------------------------------------------------------------------
 * Formatos heredados (cuentan como CANAL 1):
 *   "ir"                      (1 valor)
 *   "ir,red"                  (2 valores)   <- firmware/esp32_max30102.ino
 *   "t_ms,ir,red"             (3 valores)
 *   "t_ms,ecg_raw,leads_off,bpm" (4 valores) <- MAX30100 (sin rojo; leads_off=1: sin dedo)
 *
 * Formato MULTICANAL (hasta 5 sensores MAX30102; canales 1..5):
 *   A) Una línea por muestra y canal (RECOMENDADO, lleva timestamp):
 *        CH<n>,t_ms,ir,red          ej.:  CH2,15230,84210,70311
 *   A+) Igual que A con los valores que calcula la propia placa (los mismos que envía por WiFi):
 *        CH<n>,t_ms,ir,red,bpm,spo2,dedo    ej.:  CH1,15230,24480,20990,72.0,97.5,1
 *        bpm/spo2 = 0 significa «sin lectura»; dedo = 0 significa «sin dedo» (la placa manda ir=0).
 *        Es el formato que usa el firmware esp32_wifi_prueba.ino por USB.
 *   B) Una trama con varios canales en la misma línea (timestamp opcional):
 *        [T:t_ms;]CH1:ir,red;CH2:ir,red;...   ej.:  T:15230;CH1:84210,70311;CH2:80100,66200
 *
 * Reglas: las líneas que empiezan por '#' son depuración y se ignoran; todo valor
 * debe ser numérico (0..262143, 18 bits del MAX30102); "0,0" / ir=0 significa
 * «sin dedo» (el canal existe pero no hay señal). t_ms es el reloj del ESP32 (millis()).
 * Si el firmware no envía t_ms se asume 50 Hz (limitación: el BPM puede salir
 * escalado si la frecuencia real es otra; por eso se recomienda el formato A).
 * ============================================================================
 */

import { evaluarCalidad, MAXIMO_MAX30102 } from './calidadSenal.js'
import { calcularRatioR, calcularSpo2DesdeR } from '../services/spo2Service.js'

// ---------------------------------------------------------------------------
// 1) Fuente de medición
// ---------------------------------------------------------------------------
export const FUENTES = Object.freeze({ wifi: 'wifi', usb: 'usb' })
export const FUENTES_LISTA = Object.freeze(['wifi', 'usb'])
export const MENSAJE_USB_NO_SOPORTADO = 'USB requiere Chrome o Edge'
export const MENSAJE_ELEGIR_FUENTE = 'Elige cómo medir: por WiFi o por USB.'

export function esFuenteValida(fuente) {
  return FUENTES_LISTA.includes(fuente)
}

/**
 * Valida la fuente elegida.
 * @param {*} fuente valor elegido por el usuario (o null si aún no eligió)
 * @param {{usbSoportado?: boolean}} opciones
 * @returns {{valida: boolean, fuente: ('wifi'|'usb'|null), motivo: string|null}}
 */
export function validarFuente(fuente, { usbSoportado = true } = {}) {
  if (fuente === null || fuente === undefined || fuente === '') {
    return { valida: false, fuente: null, motivo: MENSAJE_ELEGIR_FUENTE }
  }
  if (!esFuenteValida(fuente)) {
    return { valida: false, fuente: null, motivo: `Fuente desconocida: «${String(fuente)}».` }
  }
  if (fuente === FUENTES.usb && !usbSoportado) {
    return { valida: false, fuente: null, motivo: MENSAJE_USB_NO_SOPORTADO }
  }
  return { valida: true, fuente, motivo: null }
}

// ---------------------------------------------------------------------------
// 2) Parseo de líneas seriales
// ---------------------------------------------------------------------------
export const MAX_CANALES_USB = 5
export const VALOR_MAXIMO_MUESTRA = MAXIMO_MAX30102 // 262143 (18 bits)
const LARGO_MAXIMO_LINEA = 200

const NUMERO = /^-?\d+(?:\.\d+)?$/

function aNumero(token) {
  const t = String(token).trim()
  return NUMERO.test(t) ? Number(t) : NaN
}

function muestraValida(m) {
  const enRango = (v) => Number.isFinite(v) && v >= 0 && v <= VALOR_MAXIMO_MUESTRA
  if (!Number.isInteger(m.canal) || m.canal < 1 || m.canal > MAX_CANALES_USB) return false
  if (m.tMs !== null && !(Number.isFinite(m.tMs) && m.tMs >= 0)) return false
  if (!enRango(m.ir)) return false
  if (m.rojo !== null && !enRango(m.rojo)) return false
  return true
}

function crearMuestra(canal, tMs, ir, rojo, extra = {}) {
  return { canal, tMs, ir, rojo, leadsOff: false, hardwareBpm: 0, ...extra }
}

/**
 * Convierte UNA línea serial en muestras por canal.
 * @param {string} linea
 * @returns {{canal:number, tMs:number|null, ir:number, rojo:number|null, leadsOff:boolean, hardwareBpm:number}[]}
 *          [] si la línea está vacía, es depuración, está corrupta o truncada.
 */
export function parsearLineaSerial(linea) {
  if (typeof linea !== 'string') return []
  const s = linea.trim()
  if (!s || s[0] === '#' || s.length > LARGO_MAXIMO_LINEA) return []

  let muestras = []

  // B) Trama multicanal: [T:ms;]CH1:ir,red;CH2:ir,red
  if (/^(?:T:[^;]*;)?CH\d+:/i.test(s)) {
    const segmentos = s.split(';')
    let tMs = null
    let inicio = 0
    if (/^T:/i.test(segmentos[0])) {
      tMs = aNumero(segmentos[0].slice(2))
      if (Number.isNaN(tMs)) return []
      inicio = 1
    }
    for (let i = inicio; i < segmentos.length; i++) {
      const m = /^CH(\d+):(.*)$/i.exec(segmentos[i].trim())
      if (!m) return [] // un segmento roto invalida toda la trama (probable truncado)
      const valores = m[2].split(',').map(aNumero)
      if (valores.length !== 2 || valores.some(Number.isNaN)) return []
      muestras.push(crearMuestra(Number(m[1]), tMs, valores[0], valores[1]))
    }
  } else if (/^CH\d+,/i.test(s)) {
    // A) CH<n>,t_ms,ir,red  (4 campos)  ·  A+) CH<n>,t_ms,ir,red,bpm,spo2,dedo  (7 campos).
    // Cualquier otra cantidad se descarta entera: un truncado no se confunde con otro formato.
    const partes = s.split(',')
    if (partes.length !== 4 && partes.length !== 7) return []
    const nums = partes.slice(1).map(aNumero)
    if (nums.some(Number.isNaN)) return []
    if (partes.length === 7) {
      const [t, ir, rojo, bpmPlaca, spo2Placa, dedo] = nums
      if (!(bpmPlaca >= 0 && bpmPlaca <= 300) || !(spo2Placa >= 0 && spo2Placa <= 100) || (dedo !== 0 && dedo !== 1)) return []
      muestras.push(crearMuestra(Number(partes[0].slice(2)), t, ir, rojo, {
        hardwareBpm: bpmPlaca, hardwareSpo2: spo2Placa, dePlaca: true, leadsOff: dedo === 0
      }))
    } else {
      muestras.push(crearMuestra(Number(partes[0].slice(2)), nums[0], nums[1], nums[2]))
    }
  } else {
    // Formatos heredados numéricos -> canal 1
    const partes = s.split(/[,;\s]+/).filter((p) => p !== '')
    if (partes.length < 1 || partes.length > 4) return []
    const n = partes.map(aNumero)
    if (n.some(Number.isNaN)) return []
    if (n.length === 4) {
      muestras.push(crearMuestra(1, n[0], n[1], null, { leadsOff: n[2] === 1, hardwareBpm: n[3] }))
    } else if (n.length === 3) {
      muestras.push(crearMuestra(1, n[0], n[1], n[2]))
    } else if (n.length === 2) {
      muestras.push(crearMuestra(1, null, n[0], n[1]))
    } else {
      muestras.push(crearMuestra(1, null, n[0], null))
    }
  }

  return muestras.every(muestraValida) ? muestras : []
}

// ---------------------------------------------------------------------------
// 3) Procesamiento de señal (BPM y SpO2 reales)
// ---------------------------------------------------------------------------
export const FRECUENCIA_DEFECTO_HZ = 50
export const VENTANA_SEGUNDOS = 10
const SEGUNDOS_MIN_BPM = 4
const SEGUNDOS_MIN_SPO2 = 3
const BPM_MIN = 30
const BPM_MAX = 220
const PERFUSION_MIN = 0.0003 // AC/DC mínimo del IR para considerar que hay pulso
const DC_MIN = 1000

function mediana(arr) {
  if (!arr.length) return NaN
  const o = [...arr].sort((a, b) => a - b)
  const m = o.length >> 1
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

/** Media móvil centrada con ventana w (los bordes usan la ventana disponible). */
function mediaMovil(x, w) {
  const n = x.length
  const acum = new Float64Array(n + 1)
  for (let i = 0; i < n; i++) acum[i + 1] = acum[i] + x[i]
  const mitad = Math.max(0, Math.floor(w / 2))
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - mitad)
    const b = Math.min(n, i + mitad + 1)
    out[i] = (acum[b] - acum[a]) / (b - a)
  }
  return out
}

/** Frecuencia de muestreo estimada (Hz) con los timestamps (ms) de la ventana. */
export function estimarFrecuenciaHz(tMs, porDefecto = FRECUENCIA_DEFECTO_HZ) {
  if (!Array.isArray(tMs) || tMs.length < 10) return porDefecto
  const dts = []
  for (let i = 1; i < tMs.length; i++) {
    const d = tMs[i] - tMs[i - 1]
    if (d > 0) dts.push(d)
  }
  if (dts.length < 5) return porDefecto
  let dt = mediana(dts)
  const total = (tMs[tMs.length - 1] - tMs[0]) / (tMs.length - 1)
  // Si el reloj tiene resolución de 1 ms y muestras repetidas, el promedio es más fiel
  if (dt <= 1 && total > dt) dt = total
  const hz = 1000 / dt
  return Number.isFinite(hz) && hz >= 5 && hz <= 1000 ? hz : porDefecto
}

/**
 * BPM a partir de los picos de una señal PPG.
 * @param {number[]} senal muestras (IR)
 * @param {number[]} tMs  timestamps en ms (misma longitud)
 * @param {number} fs     frecuencia de muestreo en Hz
 * @returns {number|null} null si no hay señal periódica suficiente
 */
export function calcularBpmDesdePicos(senal, tMs, fs) {
  const n = senal.length
  if (n < SEGUNDOS_MIN_BPM * fs) return null
  const rapida = mediaMovil(senal, Math.max(1, Math.round(0.08 * fs)))
  const lenta = mediaMovil(senal, Math.max(3, Math.round(1.5 * fs)))
  const f = rapida.map((v, i) => v - lenta[i])

  const orden = [...f].sort((a, b) => a - b)
  const p95 = orden[Math.min(n - 1, Math.floor(n * 0.95))]
  const p5 = orden[Math.floor(n * 0.05)]
  const amplitud = p95 - p5
  if (!(amplitud > 0)) return null
  // Sin pulsación apreciable respecto al nivel DC (solo ruido): no hay BPM
  const dc = lenta.reduce((acc, v) => acc + v, 0) / n
  if (!(dc > 0) || amplitud / dc < PERFUSION_MIN) return null
  const umbral = p5 + 0.5 * amplitud

  // Máximos locales (±0,18 s) por encima del umbral
  const r = Math.max(1, Math.round(0.18 * fs))
  let picos = []
  for (let i = r; i < n - r; i++) {
    if (f[i] < umbral) continue
    let esMax = true
    for (let k = 1; k <= r; k++) {
      if (f[i - k] > f[i] || f[i + k] >= f[i]) { esMax = false; break }
    }
    if (esMax) picos.push(i)
  }

  // Distancia mínima entre picos (0,3 s = 200 lpm): se conserva el más alto
  const dMin = 0.3
  const depurados = []
  for (const i of picos) {
    const ult = depurados[depurados.length - 1]
    if (ult !== undefined && (tMs[i] - tMs[ult]) / 1000 < dMin) {
      if (f[i] > f[ult]) depurados[depurados.length - 1] = i
    } else {
      depurados.push(i)
    }
  }
  if (depurados.length < 3) return null

  const intervalos = []
  for (let k = 1; k < depurados.length; k++) {
    intervalos.push((tMs[depurados[k]] - tMs[depurados[k - 1]]) / 1000)
  }
  const med = mediana(intervalos)
  if (!(med > 0)) return null
  const consistentes = intervalos.filter((d) => Math.abs(d - med) <= 0.25 * med).length
  if (consistentes < 2 || consistentes / intervalos.length < 0.6) return null

  const bpm = 60 / med
  if (bpm < BPM_MIN || bpm > BPM_MAX) return null
  return Math.round(bpm * 10) / 10
}

/**
 * SpO2 con la razón de razones R = (AC_rojo/DC_rojo) / (AC_ir/DC_ir) y la curva
 * estándar MAX30102 (SpO2 = 110 - 25·R, acotada a 0-100 por el servicio spo2).
 * @returns {{spo2:number, ratioR:number, indicePerfusion:number}|null} null si no hay datos fiables
 */
export function calcularSpo2DesdeVentana(ir, rojo, fs) {
  const n = Math.min(ir.length, rojo.length)
  if (!rojo.length || n < SEGUNDOS_MIN_SPO2 * fs) return null
  const base = Math.max(3, Math.round(1.5 * fs))
  const rapidaIr = mediaMovil(ir, Math.max(1, Math.round(0.08 * fs)))
  const rapidaRo = mediaMovil(rojo, Math.max(1, Math.round(0.08 * fs)))
  const lentaIr = mediaMovil(ir, base)
  const lentaRo = mediaMovil(rojo, base)

  // Se descartan los bordes, donde la media móvil está truncada
  const ini = Math.floor(base / 2)
  const fin = n - ini
  if (fin - ini < SEGUNDOS_MIN_SPO2 * fs * 0.5) return null

  let sIr = 0, sRo = 0, qIr = 0, qRo = 0
  const m = fin - ini
  for (let i = ini; i < fin; i++) {
    sIr += ir[i]; sRo += rojo[i]
    const aI = rapidaIr[i] - lentaIr[i]
    const aR = rapidaRo[i] - lentaRo[i]
    qIr += aI * aI; qRo += aR * aR
  }
  const dcIr = sIr / m
  const dcRo = sRo / m
  const acIr = Math.sqrt(qIr / m)
  const acRo = Math.sqrt(qRo / m)
  if (dcIr < DC_MIN || dcRo < DC_MIN) return null
  if (!(acIr > 0) || !(acRo > 0)) return null
  const perfusion = acIr / dcIr
  if (perfusion < PERFUSION_MIN) return null

  const ratioR = calcularRatioR(acRo, dcRo, acIr, dcIr)
  // Fuera de 0.2..2.0 (SpO2 > 100 o < 60) no es una medida creíble: se descarta
  if (!(ratioR >= 0.2 && ratioR <= 2.0)) return null
  return { spo2: calcularSpo2DesdeR(ratioR), ratioR, indicePerfusion: Math.round(perfusion * 10000) / 100 }
}

// ---------------------------------------------------------------------------
// 4) Agregador por canal
// ---------------------------------------------------------------------------
function nuevoCanal() {
  return {
    t: [], ir: [], rojo: [], nuevasIr: [], nuevasRojo: [],
    tsReales: false, ultimaT: null, contador: 0, visto: 0,
    sinDedo: false, hardwareBpm: 0, hardwareSpo2: null, dePlaca: false,
    cache: null, cacheEn: -Infinity
  }
}

/**
 * Crea un agregador de muestras seriales.
 * @param {{ventanaSegundos?:number, frecuenciaDefectoHz?:number, timeoutCanalMs?:number,
 *          intervaloCalculoMs?:number, ahora?:()=>number}} opciones
 */
export function crearAgregadorSerial(opciones = {}) {
  const {
    ventanaSegundos = VENTANA_SEGUNDOS,
    frecuenciaDefectoHz = FRECUENCIA_DEFECTO_HZ,
    timeoutCanalMs = 5000,
    intervaloCalculoMs = 1000,
    ahora = () => Date.now()
  } = opciones

  let canales = new Map()

  function reiniciar() { canales = new Map() }

  function reiniciarVentana(c) {
    c.t = []; c.ir = []; c.rojo = []; c.tsReales = false; c.ultimaT = null
    c.cache = null; c.cacheEn = -Infinity
  }

  function agregarMuestra(m) {
    if (!m || !muestraValida(m)) return false
    let c = canales.get(m.canal)
    if (!c) { c = nuevoCanal(); canales.set(m.canal, c) }
    c.visto = ahora()
    c.hardwareBpm = m.hardwareBpm || 0
    // Si la placa informa sus propios valores (formato A+) se usan los mismos que por WiFi
    c.dePlaca = Boolean(m.dePlaca)
    c.hardwareSpo2 = m.dePlaca ? (m.hardwareSpo2 || 0) : null

    // Sin dedo: ir=0 (firmware «0,0») o leads_off=1 -> el canal existe pero sin señal
    if (m.ir <= 0 || m.leadsOff) {
      c.sinDedo = true
      reiniciarVentana(c)
      return true
    }
    c.sinDedo = false

    let t
    if (m.tMs !== null && m.tMs !== undefined) {
      if (c.ultimaT !== null && c.tsReales && m.tMs < c.ultimaT) {
        // El reloj retrocedió (el ESP32 se reinició): se empieza de cero
        reiniciarVentana(c)
      }
      t = m.tMs
      c.tsReales = true
    } else {
      t = c.ultimaT === null ? 0 : c.ultimaT + 1000 / frecuenciaDefectoHz
    }
    c.ultimaT = t
    c.contador++
    c.t.push(t)
    c.ir.push(m.ir)
    if (m.rojo !== null) c.rojo.push(m.rojo)
    else if (c.rojo.length) c.rojo.push(c.rojo[c.rojo.length - 1]) // mantiene alineación (no debería ocurrir)
    c.nuevasIr.push(m.ir)
    if (m.rojo !== null) c.nuevasRojo.push(m.rojo)

    // Ventana temporal
    const limite = t - ventanaSegundos * 1000
    let corte = 0
    while (corte < c.t.length - 1 && c.t[corte] < limite) corte++
    if (corte > 0) {
      c.t.splice(0, corte); c.ir.splice(0, corte)
      if (c.rojo.length) c.rojo.splice(0, Math.min(corte, c.rojo.length))
    }
    // Tope de seguridad por si el reloj va muy rápido
    const tope = 20000
    if (c.t.length > tope) {
      const exceso = c.t.length - tope
      c.t.splice(0, exceso); c.ir.splice(0, exceso)
      if (c.rojo.length) c.rojo.splice(0, Math.min(exceso, c.rojo.length))
    }
    return true
  }

  /** Procesa una línea; devuelve cuántas muestras se aceptaron. */
  function agregarLinea(linea) {
    let aceptadas = 0
    for (const m of parsearLineaSerial(linea)) if (agregarMuestra(m)) aceptadas++
    return aceptadas
  }

  function frecuenciaCanal(c) {
    return c.tsReales ? estimarFrecuenciaHz(c.t, frecuenciaDefectoHz) : frecuenciaDefectoHz
  }

  function calcularMetricas(c) {
    const fs = frecuenciaCanal(c)
    const hayRojo = c.rojo.length === c.ir.length && c.rojo.length > 0
    let bpm
    let bpmOrigen
    if (c.dePlaca) {
      // Formato A+: pulso de la placa (el mismo que se ve por WiFi); 0 = sin lectura
      bpm = c.hardwareBpm >= BPM_MIN && c.hardwareBpm <= BPM_MAX ? c.hardwareBpm : null
      bpmOrigen = bpm === null ? null : 'dispositivo'
    } else {
      bpm = calcularBpmDesdePicos(c.ir, c.t, fs)
      bpmOrigen = bpm === null ? null : 'muestras'
      if (bpm === null && c.hardwareBpm >= BPM_MIN && c.hardwareBpm <= BPM_MAX) {
        bpm = c.hardwareBpm // BPM informado por el propio dispositivo (formato MAX30100)
        bpmOrigen = 'dispositivo'
      }
    }
    // Con formato A+ la SpO2 es la que mide la placa (el rojo que viaja es solo para el trazo): no se recalcula
    const sp = c.dePlaca
      ? (c.hardwareSpo2 > 0 ? { spo2: c.hardwareSpo2, ratioR: null, indicePerfusion: null } : null)
      : (hayRojo ? calcularSpo2DesdeVentana(c.ir, c.rojo, fs) : null)

    // Calidad con los últimos ~3 s de IR
    const n3 = Math.round(3 * fs)
    const calidad = evaluarCalidad(c.ir.slice(-n3), { frecuenciaHz: fs, maximo: VALOR_MAXIMO_MUESTRA })
    return {
      bpm, bpmOrigen,
      spo2: sp ? sp.spo2 : null,
      ratioR: sp ? sp.ratioR : null,
      indicePerfusion: sp ? sp.indicePerfusion : null,
      calidad: calidad.nivel,
      frecuenciaHz: fs
    }
  }

  /**
   * Instantánea: una entrada por canal activo (visto en los últimos timeoutCanalMs).
   * `ir`/`rojo` son SOLO las muestras nuevas desde la instantánea anterior (como un
   * paquete WiFi); se consumen al llamar.
   */
  function instantanea() {
    const t0 = ahora()
    const salida = []
    for (const [canal, c] of [...canales.entries()].sort((a, b) => a[0] - b[0])) {
      if (t0 - c.visto > timeoutCanalMs) continue
      let met
      if (c.sinDedo || c.ir.length === 0) {
        met = { bpm: null, bpmOrigen: null, spo2: null, ratioR: null, indicePerfusion: null, calidad: 'sin_senal', frecuenciaHz: frecuenciaCanal(c) }
      } else {
        if (!c.cache || t0 - c.cacheEn >= intervaloCalculoMs) {
          c.cache = calcularMetricas(c)
          c.cacheEn = t0
        }
        met = c.cache
      }
      salida.push({
        canal,
        activo: true,
        sinDedo: c.sinDedo,
        bpm: met.bpm,
        bpmOrigen: met.bpmOrigen,
        spo2: met.spo2,
        ratioR: met.ratioR,
        indicePerfusion: met.indicePerfusion,
        calidad: met.calidad,
        frecuenciaHz: met.frecuenciaHz,
        ir: c.nuevasIr,
        rojo: c.nuevasRojo
      })
      c.nuevasIr = []
      c.nuevasRojo = []
    }
    return salida
  }

  /** Frecuencia de muestreo estimada global (mediana de la de los canales con datos). */
  function frecuenciaHz() {
    const fs = [...canales.values()].filter((c) => c.ir.length > 0).map(frecuenciaCanal)
    return fs.length ? mediana(fs) : frecuenciaDefectoHz
  }

  function canalesDetectados() {
    const t0 = ahora()
    return [...canales.entries()].filter(([, c]) => t0 - c.visto <= timeoutCanalMs).map(([n]) => n).sort((a, b) => a - b)
  }

  return { agregarMuestra, agregarLinea, instantanea, frecuenciaHz, canalesDetectados, reiniciar }
}
