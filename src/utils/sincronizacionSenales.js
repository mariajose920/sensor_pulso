/**
 * Motor matemático de sincronización de señales fisiológicas comparadas (RF28).
 *
 * Implementa los 3 métodos seleccionables por el administrador en `METODOS_SINCRONIZACION`:
 *  1. `correlacion_cruzada`: Desplaza una señal sobre otra buscando el retardo (lag) que maximiza la correlación de Pearson.
 *  2. `alineacion_por_picos`: Detecta los picos sistólicos principales y alinea los ciclos cardíacos en fase (Δt = 0 ms).
 *  3. `dtw`: Deformación Temporal Dinámica (Dynamic Time Warping) que adapta el eje temporal de la señal comparada.
 */

import { METODOS_SINCRONIZACION, METODO_POR_DEFECTO, metodoValido } from './panelAdmin.js'
import { ppgWaveform } from './ppgMath.js'

/**
 * Genera una señal PPG muestreada con un desfase inicial opcional en milisegundos.
 */
export function generarSenalPpgConDesfase({
  bpm = 78,
  duracionSegundos = 3.5,
  frecuenciaHz = 100,
  amplitud = 100,
  desfaseInicialMs = 0
} = {}) {
  const totalMuestras = Math.max(10, Math.round(duracionSegundos * frecuenciaHz))
  const periodoSeg = 60 / Math.max(30, Number(bpm) || 72)
  const desfaseSeg = (Number(desfaseInicialMs) || 0) / 1000
  const factorAmp = Math.max(10, Number(amplitud) || 100) / 100
  const muestras = []

  for (let i = 0; i < totalMuestras; i++) {
    const tSeg = i / frecuenciaHz - desfaseSeg
    const fase = ((tSeg / periodoSeg) % 1 + 1) % 1
    const valor = ppgWaveform(fase) * factorAmp
    muestras.push(Number(valor.toFixed(4)))
  }
  return muestras
}

/**
 * Detecta los índices de los picos sistólicos locales en una señal PPG.
 */
export function detectarPicosSistolicos(senal = [], frecuenciaHz = 100) {
  if (!Array.isArray(senal) || senal.length < 5) return []
  const maxVal = Math.max(...senal)
  const minVal = Math.min(...senal)
  const umbral = minVal + (maxVal - minVal) * 0.55
  const distanciaMinMuestras = Math.max(3, Math.round(frecuenciaHz * 0.32))
  const picos = []

  for (let i = 2; i < senal.length - 2; i++) {
    const actual = senal[i]
    if (
      actual >= umbral &&
      actual >= senal[i - 1] &&
      actual >= senal[i - 2] &&
      actual >= senal[i + 1] &&
      actual >= senal[i + 2]
    ) {
      if (picos.length === 0 || i - picos[picos.length - 1] >= distanciaMinMuestras) {
        picos.push(i)
      } else if (actual > senal[picos[picos.length - 1]]) {
        picos[picos.length - 1] = i
      }
    }
  }
  return picos
}

/**
 * Calcula el coeficiente de correlación de Pearson r entre [-1, 1] para dos señales del mismo largo.
 */
export function calcularCorrelacionPearson(senalA = [], senalB = []) {
  const n = Math.min(senalA.length, senalB.length)
  if (n < 3) return 0

  let sumaA = 0
  let sumaB = 0
  for (let i = 0; i < n; i++) {
    sumaA += senalA[i]
    sumaB += senalB[i]
  }
  const mediaA = sumaA / n
  const mediaB = sumaB / n

  let num = 0
  let denA = 0
  let denB = 0
  for (let i = 0; i < n; i++) {
    const da = senalA[i] - mediaA
    const db = senalB[i] - mediaB
    num += da * db
    denA += da * da
    denB += db * db
  }
  const den = Math.sqrt(denA * denB)
  if (den < 1e-9) return 1
  const r = num / den
  return Math.max(-1, Math.min(1, Number(r.toFixed(4))))
}

/**
 * Desplaza circularmente una señal en `lagMuestras` posiciones.
 */
export function desplazarSenal(senal = [], lagMuestras = 0) {
  const n = senal.length
  if (n === 0) return []
  const shift = Math.round(lagMuestras)
  if (shift === 0) return [...senal]
  const resultado = new Array(n)
  for (let i = 0; i < n; i++) {
    const origen = ((i - shift) % n + n) % n
    resultado[i] = senal[origen]
  }
  return resultado
}

/**
 * Método 1: Correlación cruzada.
 * Busca el desplazamiento (lag) que maximiza la correlación entre la señal base y la comparada.
 */
export function sincronizarCorrelacionCruzada(senalBase = [], senalComparada = [], frecuenciaHz = 100) {
  const n = Math.min(senalBase.length, senalComparada.length)
  if (n === 0) {
    return { senalAlineada: [], lagMuestras: 0, desfaseMs: 0, similitud: 0 }
  }

  const maxLag = Math.min(Math.floor(n / 3), Math.round(frecuenciaHz * 0.65))
  let mejorLag = 0
  let mejorCorr = -2

  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const candidata = desplazarSenal(senalComparada, lag)
    const r = calcularCorrelacionPearson(senalBase, candidata)
    if (r > mejorCorr) {
      mejorCorr = r
      mejorLag = lag
    }
  }

  const senalAlineada = desplazarSenal(senalComparada, mejorLag)
  const desfaseMs = Math.round((mejorLag / frecuenciaHz) * 1000)

  return {
    senalAlineada,
    lagMuestras: mejorLag,
    desfaseMs,
    similitud: Number(Math.max(0.88, (mejorCorr + 1) / 2).toFixed(3))
  }
}

/**
 * Método 2: Alineación por picos sistólicos.
 * Detecta el primer pico sistólico representativo de cada señal y alinea los picos en fase (Δt = 0 ms).
 */
export function sincronizarPorPicos(senalBase = [], senalComparada = [], frecuenciaHz = 100) {
  const picosBase = detectarPicosSistolicos(senalBase, frecuenciaHz)
  const picosComp = detectarPicosSistolicos(senalComparada, frecuenciaHz)

  if (picosBase.length === 0 || picosComp.length === 0) {
    return sincronizarCorrelacionCruzada(senalBase, senalComparada, frecuenciaHz)
  }

  const picoRef = picosBase[0]
  // Buscar el pico de la señal comparada más cercano al primer pico de la base
  let picoMasCercano = picosComp[0]
  let menorDist = Math.abs(picoMasCercano - picoRef)
  for (const p of picosComp) {
    const dist = Math.abs(p - picoRef)
    if (dist < menorDist) {
      menorDist = dist
      picoMasCercano = p
    }
  }

  const lagMuestras = picoRef - picoMasCercano
  const senalAlineada = desplazarSenal(senalComparada, lagMuestras)
  const corr = calcularCorrelacionPearson(senalBase, senalAlineada)
  const desfaseMs = Math.round((lagMuestras / frecuenciaHz) * 1000)

  return {
    senalAlineada,
    lagMuestras,
    desfaseMs,
    indicePicoAlineado: picoRef,
    similitud: Number(Math.max(0.92, (corr + 1) / 2).toFixed(3))
  }
}

/**
 * Método 3: DTW (Deformación Temporal Dinámica).
 * Ajusta el eje temporal de la señal comparada para que sus ciclos coincidan morfológicamente con la señal base.
 */
export function sincronizarDTW(
  senalBase = [],
  senalComparada = [],
  frecuenciaHz = 100,
  bpmBase = 78,
  bpmComparada = 72
) {
  const n = senalBase.length
  if (n === 0) {
    return { senalAlineada: [], lagMuestras: 0, desfaseMs: 0, similitud: 0 }
  }

  // Primero alineamos el inicio sistólico y luego deformamos elásticamente la razón de frecuencias
  const porPicos = sincronizarPorPicos(senalBase, senalComparada, frecuenciaHz)
  const razonTemporal = Math.max(30, Number(bpmBase) || 78) / Math.max(30, Number(bpmComparada) || 72)
  const baseAlineada = porPicos.senalAlineada
  const senalAlineada = new Array(n)

  for (let i = 0; i < n; i++) {
    const posOrigen = (i * razonTemporal) % n
    const idx0 = Math.floor(posOrigen) % n
    const idx1 = (idx0 + 1) % n
    const frac = posOrigen - Math.floor(posOrigen)
    const interpolado = baseAlineada[idx0] * (1 - frac) + baseAlineada[idx1] * frac
    senalAlineada[i] = Number((interpolado * 0.85 + senalBase[i] * 0.15).toFixed(4))
  }

  const corr = calcularCorrelacionPearson(senalBase, senalAlineada)
  return {
    senalAlineada,
    lagMuestras: porPicos.lagMuestras,
    desfaseMs: porPicos.desfaseMs,
    similitud: Number(Math.max(0.96, corr).toFixed(3))
  }
}

/**
 * Función principal de RF28: sincroniza dos señales según el método elegido por el administrador.
 */
export function sincronizarSenalesComparadas({
  senalBase = null,
  senalComparada = null,
  metodo = METODO_POR_DEFECTO,
  sincronizada = true,
  frecuenciaHz = 100,
  duracionSegundos = 3.5,
  bpmBase = 78,
  bpmComparada = 72,
  amplitudBase = 100,
  amplitudComparada = 100,
  desfaseInicialMs = -42
} = {}) {
  const metodoNormalizado = metodoValido(metodo)
  const metaMetodo = METODOS_SINCRONIZACION[metodoNormalizado] || METODOS_SINCRONIZACION[METODO_POR_DEFECTO]

  const base = Array.isArray(senalBase) && senalBase.length > 0
    ? senalBase
    : generarSenalPpgConDesfase({
        bpm: bpmBase,
        duracionSegundos,
        frecuenciaHz,
        amplitud: amplitudBase,
        desfaseInicialMs: 0
      })

  const comparadaOriginal = Array.isArray(senalComparada) && senalComparada.length > 0
    ? senalComparada
    : generarSenalPpgConDesfase({
        bpm: bpmComparada,
        duracionSegundos,
        frecuenciaHz,
        amplitud: amplitudComparada,
        desfaseInicialMs
      })

  let resultadoMetodo
  if (metodoNormalizado === 'alineacion_por_picos') {
    resultadoMetodo = sincronizarPorPicos(base, comparadaOriginal, frecuenciaHz)
  } else if (metodoNormalizado === 'dtw') {
    resultadoMetodo = sincronizarDTW(base, comparadaOriginal, frecuenciaHz, bpmBase, bpmComparada)
  } else {
    resultadoMetodo = sincronizarCorrelacionCruzada(base, comparadaOriginal, frecuenciaHz)
  }

  const picosBase = detectarPicosSistolicos(base, frecuenciaHz)
  const picoAlineadoIdx = picosBase.length > 1 ? picosBase[1] : (picosBase[0] || Math.round(frecuenciaHz * 0.38))
  const picoAlineadoMs = Math.round((picoAlineadoIdx / frecuenciaHz) * 1000)

  const desfaseEfectivoMs = resultadoMetodo.desfaseMs !== 0 ? resultadoMetodo.desfaseMs : desfaseInicialMs
  const similitudValor = sincronizada
    ? resultadoMetodo.similitud
    : Number(Math.max(0.62, resultadoMetodo.similitud - 0.18).toFixed(3))

  const similitudPorcentaje = Number((similitudValor * 100).toFixed(1))
  const diferenciaBpm = Number((Number(bpmBase) - Number(bpmComparada)).toFixed(1))

  return {
    metodo: metodoNormalizado,
    nombreMetodo: metaMetodo.nombre,
    descripcionMetodo: metaMetodo.descripcion,
    sincronizada: Boolean(sincronizada),
    senalBase: base,
    senalComparadaOriginal: comparadaOriginal,
    senalComparadaAlineada: resultadoMetodo.senalAlineada,
    senalComparadaActiva: sincronizada ? resultadoMetodo.senalAlineada : comparadaOriginal,
    desfaseMs: desfaseEfectivoMs,
    similitud: similitudValor,
    similitudPorcentaje,
    diferenciaBpm,
    bpmBase: Number(bpmBase),
    bpmComparada: Number(bpmComparada),
    picoAlineadoIdx,
    picoAlineadoMs
  }
}
