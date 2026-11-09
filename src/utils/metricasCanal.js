/**
 * Métricas de un canal a partir de su señal PPG (RF111, RF17, RF18)
 *
 * Función pura, sin Vue ni DOM (se prueba con Node). A partir de la ventana de muestras IR
 * (y opcionalmente las del rojo) obtiene: picos sistólicos, BPM, HRV (SDNN/RMSSD/pNN50),
 * ruido de la señal, ritmo cardíaco, SpO₂ y pulso.
 *
 * Regla de oro: NUNCA se inventan valores. Si no hay señal suficiente el campo es null
 * y la pantalla muestra «—».
 *
 * Los picos se buscan como máximos de la curva tal como se dibuja (señal IR sin invertir),
 * de modo que los marcadores caen exactamente sobre las crestas que ve la persona.
 */
import { evaluarCalidad, MAXIMO_MAX30102 } from './calidadSenal.js'
import { filtroMediaMovil } from './dspFiltros.js'
import { clasificarRitmo } from '../services/ritmoService.js'
import { esBpmValido } from '../services/bpmService.js'
import { esSpo2Valido } from '../services/spo2Service.js'

export const PARAMETROS_METRICAS = {
  segundosMinimos: 3,       // menos de esto no se calcula nada
  refractarioS: 0.3,        // separación mínima entre picos (≈200 BPM máx.)
  umbralPico: 0.35,         // fracción de la amplitud del pulso que debe superar un pico
  intervaloMinMs: 270,      // intervalos fisiológicos válidos (≈222 a 30 BPM)
  intervaloMaxMs: 2000,
  intervalosParaHrv: 3,     // intervalos mínimos para HRV y ritmo
  diferenciaPulsoBpm: 5     // si el BPM del dispositivo y el de los picos difieren menos, son «lo mismo»
}

const finito = (x) => typeof x === 'number' && Number.isFinite(x)

function mediana(v) {
  const o = [...v].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

function vacio() {
  return {
    picos: [], bpm: null, hrv: { sdnn: null, rmssd: null, pnn50: null },
    ruido: null, ritmo: null, spo2: null, pulso: null, pulsoDifiere: false,
    intervalosMs: [], muestrasValidas: false
  }
}

const impar = (n) => (n % 2 === 0 ? n + 1 : n)

/**
 * Detecta picos sistólicos. Devuelve el índice entero, su valor en la señal original y el
 * instante refinado `t` (en muestras, con interpolación parabólica) para medir intervalos con más precisión.
 * @returns {{indice:number, valor:number, t:number}[]}
 */
export function detectarPicosSistolicos(muestras, frecuenciaHz = 50) {
  if (!Array.isArray(muestras) || muestras.length < 3 || !muestras.every(finito)) return []
  const n = muestras.length
  const suave = filtroMediaMovil(muestras, Math.max(3, impar(Math.round(frecuenciaHz * 0.1))))
  const base = filtroMediaMovil(suave, Math.max(5, impar(Math.round(frecuenciaHz * 1.2))))
  const ac = suave.map((v, i) => v - base[i])

  const orden = [...ac].sort((a, b) => a - b)
  const p5 = orden[Math.floor(n * 0.05)]
  const p95 = orden[Math.min(n - 1, Math.floor(n * 0.95))]
  const amplitud = p95 - p5
  const escala = Math.max(Math.abs(suave.reduce((s, v) => s + v, 0) / n), 1)
  // Señal plana (sin pulsación): no hay picos que marcar
  if (!(amplitud > 1e-4 * escala) || amplitud < 1e-9) return []

  const umbral = Math.max(p95 * PARAMETROS_METRICAS.umbralPico, amplitud * 0.1)
  const dist = Math.max(2, Math.round(PARAMETROS_METRICAS.refractarioS * frecuenciaHz))
  const picos = []
  for (let i = 1; i < n - 1; i++) {
    if (!(ac[i] > ac[i - 1] && ac[i] >= ac[i + 1] && ac[i] > umbral)) continue
    const ultimo = picos[picos.length - 1]
    if (ultimo && i - ultimo.indice < dist) {
      if (ac[i] > ac[ultimo.indice]) picos[picos.length - 1] = { indice: i }
      continue
    }
    picos.push({ indice: i })
  }
  return picos.map(({ indice }) => {
    const a = ac[indice - 1], b = ac[indice], c = ac[indice + 1]
    const den = a - 2 * b + c
    const delta = den !== 0 ? Math.max(-0.5, Math.min(0.5, (0.5 * (a - c)) / den)) : 0
    return { indice, valor: muestras[indice], t: indice + delta }
  })
}

/**
 * @param {{ir:number[], rojo?:number[], frecuenciaHz?:number, bpmDispositivo?:number, spo2Dispositivo?:number,
 *          edad?:number, maximo?:number}} entrada
 * @returns {{picos:{indice:number,valor:number}[], bpm:number|null, hrv:{sdnn:number|null,rmssd:number|null,pnn50:number|null},
 *   ruido:{nivel:'buena'|'regular'|'mala', causas:object[], valor:number}|null,
 *   ritmo:{clase:'normal'|'taquicardia'|'bradicardia'|'irregular', nombre:string, explicacion:string, color:string}|null,
 *   spo2:number|null, pulso:number|null, pulsoDifiere:boolean, intervalosMs:number[], muestrasValidas:boolean}}
 */
export function calcularMetricasCanal({
  ir, rojo, frecuenciaHz = 50, bpmDispositivo, spo2Dispositivo, edad, maximo = MAXIMO_MAX30102
} = {}) {
  const r = vacio()
  const fs = finito(frecuenciaHz) && frecuenciaHz > 0 ? frecuenciaHz : 50

  // SpO₂: solo la que mide el dispositivo (sin valores de relleno)
  if (finito(spo2Dispositivo) && esSpo2Valido(spo2Dispositivo)) r.spo2 = Math.round(spo2Dispositivo * 10) / 10
  const bpmDisp = finito(bpmDispositivo) && bpmDispositivo > 0 && esBpmValido(bpmDispositivo) ? Math.round(bpmDispositivo) : null

  const senalOk = Array.isArray(ir) && ir.length >= fs * PARAMETROS_METRICAS.segundosMinimos && ir.every(finito)
  if (!senalOk) {
    // Sin señal suficiente: solo lo que reporta el dispositivo, sin picos ni derivados
    r.bpm = bpmDisp
    return r
  }
  r.muestrasValidas = true

  // Ruido / calidad de la señal (RF15)
  const cal = evaluarCalidad(ir, { frecuenciaHz: fs, maximo })
  if (cal.nivel !== 'sin_senal') {
    r.ruido = { nivel: cal.nivel, causas: cal.causas, valor: cal.ruido }
  }

  // Picos sistólicos
  const picos = detectarPicosSistolicos(ir, fs)
  r.picos = picos.map(({ indice, valor }) => ({ indice, valor }))

  // Intervalos entre picos (ms), solo los fisiológicos
  const rr = []
  for (let i = 1; i < picos.length; i++) {
    const ms = ((picos[i].t - picos[i - 1].t) / fs) * 1000
    if (ms >= PARAMETROS_METRICAS.intervaloMinMs && ms <= PARAMETROS_METRICAS.intervaloMaxMs) rr.push(ms)
  }
  r.intervalosMs = rr.map(x => Math.round(x))

  if (rr.length >= 2) {
    const bpmPicos = Math.round(60000 / mediana(rr))
    r.pulso = esBpmValido(bpmPicos) ? bpmPicos : null
  }
  r.bpm = bpmDisp ?? r.pulso
  r.pulsoDifiere = bpmDisp !== null && r.pulso !== null && Math.abs(bpmDisp - r.pulso) >= PARAMETROS_METRICAS.diferenciaPulsoBpm

  // HRV
  if (rr.length >= PARAMETROS_METRICAS.intervalosParaHrv) {
    const media = rr.reduce((s, x) => s + x, 0) / rr.length
    const sdnn = Math.sqrt(rr.reduce((s, x) => s + (x - media) ** 2, 0) / rr.length)
    let suma = 0, nn50 = 0
    for (let i = 1; i < rr.length; i++) {
      const d = rr[i] - rr[i - 1]
      suma += d * d
      if (Math.abs(d) > 50) nn50++
    }
    const rmssd = Math.sqrt(suma / (rr.length - 1))
    r.hrv = { sdnn: Math.round(sdnn), rmssd: Math.round(rmssd), pnn50: Math.round((nn50 / (rr.length - 1)) * 100) }

    // Ritmo (RF18): reutiliza el clasificador de la app
    if (r.bpm !== null) {
      const cv = (sdnn / media) * 100
      const c = clasificarRitmo({
        bpm: r.bpm, sdnn: r.hrv.sdnn, rmssd: r.hrv.rmssd,
        lastIntervalMs: Math.round(media),
        regularityLevel: cv >= 22 ? 'irregular' : cv >= 12 ? 'moderate' : 'normal',
        totalBeats: picos.length
      })
      if (['normal', 'taquicardia', 'bradicardia', 'irregular'].includes(c.id)) {
        r.ritmo = { clase: c.id, nombre: c.nombre, explicacion: c.criterioNumerico, color: c.colorHex }
      }
    }
  }
  return r
}
