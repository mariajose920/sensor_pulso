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
 * UN SOLO PULSO PARA TODA LA APP
 *   `bpm` es el pulso calculado por la app a partir de LOS MISMOS picos que se marcan en el gráfico
 *   (mediana de los últimos ≤ 8 intervalos R-R válidos). El BPM que manda la placa se devuelve solo
 *   como información en `bpmPlaca`; nunca se usa para rellenar `bpm` (dos detectores distintos que no
 *   coinciden eran justamente la causa de que la frecuencia pareciera inestable). Si la app no puede
 *   calcularlo con confianza (señal corta, ruidosa o saturada) `bpm` es null.
 *
 * DETECTOR DE LATIDOS (analizarLatidos)
 *   1. Pasa-banda 0,5–5 Hz de fase cero (filtroPpg.js): no desplaza los latidos y quita la deriva de la línea base.
 *   2. Periodo típico por autocorrelación → periodo refractario adaptativo = 0,55 × intervalo mediano
 *      (acotado a 0,25–0,6 s), así no se cuenta la muesca dícrota ni el ruido.
 *   3. Crestas reales (máximos locales) con umbral adaptativo: 40 % de la amplitud típica (mediana) de los latidos de la ventana.
 *   4. Artefactos de movimiento: tramos donde la señal filtrada supera 3,5 × la amplitud típica se descartan (±0,4 s).
 *   5. Latido perdido (intervalo ≈ 2 × mediana): se busca un latido débil en medio (umbral 25 %); pico doble
 *      (dos intervalos cortos que suman ≈ 1 intervalo, con el del medio más bajo): se elimina el sobrante.
 *   6. R-R depurados: fuera de ±30 % de la mediana local (7 intervalos) se rechazan para el BPM; con ±50 % para la HRV
 *      (que sí necesita conservar la variabilidad real). Un cambio sostenido de ritmo mueve la mediana local y se acepta.
 *   7. BPM = 60000 / mediana de los últimos ≤ 8 R-R válidos.
 *   8. confianza: 'alta' (≥ 6 R-R consistentes y señal no mala), 'media' (3 a 5), 'baja' (menos): con 'baja', o con
 *      calidad «mala» por ruido o saturación, bpm = null.
 *
 * PRECISIÓN DEL TIEMPO
 *   El instante de cada cresta se refina con interpolación parabólica sobre la señal filtrada, de modo que los R-R no
 *   quedan cuantizados a la muestra (a 25 Hz una muestra son 40 ms). Con señal sintética sin ruido el instante del pico
 *   tiene un error típico < 0,2 muestras (≈ 8 ms a 25 Hz, ≈ 4 ms a 50 Hz); el BPM de una ventana de 8 s tiene un error
 *   mediano ≤ 1 BPM con ruido moderado (ver scripts/test-senal-estable.mjs). Los valores se obtienen con señal
 *   simulada: no sustituyen una validación con personas.
 */
import { evaluarCalidad, MAXIMO_MAX30102 } from './calidadSenal.js'
import { filtrarSenalPpg, BANDA_PPG } from './filtroPpg.js'
import { clasificarRitmo } from '../services/ritmoService.js'
import { esBpmValido } from '../services/bpmService.js'
import { esSpo2Valido } from '../services/spo2Service.js'

export const PARAMETROS_METRICAS = {
  segundosMinimos: 3,       // menos de esto no se calcula nada
  refractarioS: 0.3,        // separación mínima entre picos si no se conoce el periodo (≈200 BPM máx.)
  refractarioFraccion: 0.55,// periodo refractario = fracción del intervalo mediano reciente
  refractarioMinS: 0.25,
  refractarioMaxS: 0.6,
  cortePasaAltasFraccion: 0.35, // en detección, el pasa-altas sube hasta esta fracción de la frecuencia del latido
  cortePasaAltasMaxHz: 1.0,
  umbralPico: 0.4,          // fracción de la amplitud típica de los latidos que debe superar una cresta
  umbralRescate: 0.25,      // idem para buscar un latido perdido entre dos picos distantes
  umbralArtefacto: 3.5,     // picos de la señal filtrada mayores que esto × amplitud típica = movimiento
  intervaloMinMs: 270,      // intervalos fisiológicos válidos (≈222 a 30 BPM)
  intervaloMaxMs: 2000,
  toleranciaBpm: 0.3,       // R-R fuera de ±30 % de la mediana local no entran al BPM
  toleranciaHrv: 0.5,       // ±50 % para la HRV (conserva la variabilidad real)
  ventanaLocal: 3,          // mediana local con ±3 intervalos
  intervalosBpm: 8,         // el BPM es la mediana de los últimos 8 R-R válidos
  intervalosAlta: 6,
  intervalosMedia: 3,
  intervalosParaHrv: 3,     // intervalos mínimos para HRV y ritmo
  diferenciaPulsoBpm: 5     // si el BPM de la placa y el de los picos difieren menos, son «lo mismo»
}

const finito = (x) => typeof x === 'number' && Number.isFinite(x)
const acotar = (x, a, b) => Math.max(a, Math.min(b, x))

function mediana(v) {
  const o = [...v].sort((a, b) => a - b)
  const m = Math.floor(o.length / 2)
  return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2
}

function vacio() {
  return {
    picos: [], bpm: null, bpmPlaca: null, confianza: 'baja',
    hrv: { sdnn: null, rmssd: null, pnn50: null },
    ruido: null, ritmo: null, spo2: null, pulso: null, pulsoDifiere: false,
    intervalosMs: [], muestrasValidas: false
  }
}

/** Periodo del latido (s) por autocorrelación de la señal filtrada; {periodoS, fuerza} (0..1). */
function estimarPeriodo(y, fs) {
  const n = y.length
  const lagMin = Math.max(2, Math.round(0.3 * fs))
  const lagMax = Math.min(n - 2, Math.round(1.6 * fs))
  if (lagMax <= lagMin + 2) return { periodoS: null, fuerza: 0 }
  let e0 = 0
  for (let i = 0; i < n; i++) e0 += y[i] * y[i]
  if (!(e0 > 0)) return { periodoS: null, fuerza: 0 }
  const ac = new Array(lagMax + 2).fill(0)
  for (let lag = lagMin - 1; lag <= lagMax + 1; lag++) {
    let s = 0
    for (let i = 0; i + lag < n; i++) s += y[i] * y[i + lag]
    // corrige el menor número de términos al crecer el desfase
    ac[lag] = (s / e0) * (n / (n - lag))
  }
  let mejor = -Infinity
  const maximos = []
  for (let lag = lagMin; lag <= lagMax; lag++) {
    if (ac[lag] > ac[lag - 1] && ac[lag] >= ac[lag + 1]) {
      maximos.push(lag)
      if (ac[lag] > mejor) mejor = ac[lag]
    }
  }
  if (!maximos.length || mejor < 0.15) return { periodoS: null, fuerza: Math.max(0, mejor) }
  // el desfase más corto casi tan bueno como el mejor (evita quedarse con un submúltiplo del periodo)
  const lag = maximos.find((l) => ac[l] >= 0.8 * mejor)
  return { periodoS: lag / fs, fuerza: Math.min(1, mejor) }
}

/** Máximos locales positivos de y. */
function crestas(y) {
  const c = []
  for (let i = 1; i < y.length - 1; i++) if (y[i] > 0 && y[i] > y[i - 1] && y[i] >= y[i + 1]) c.push(i)
  return c
}

/** Supresión de no-máximos: gana la cresta más alta y descarta las que quedan a menos de `dist` muestras. */
function supresion(cands, y, dist, minAltura = 0) {
  const orden = [...cands].filter((i) => y[i] >= minAltura).sort((a, b) => y[b] - y[a])
  const aceptados = []
  for (const i of orden) {
    if (aceptados.every((j) => Math.abs(j - i) >= dist)) aceptados.push(i)
  }
  return aceptados.sort((a, b) => a - b)
}

function parabola(y, i) {
  const a = y[i - 1], b = y[i], c = y[i + 1]
  const den = a - 2 * b + c
  return den !== 0 ? acotar((0.5 * (a - c)) / den, -0.5, 0.5) : 0
}

const mediaDe = (v) => v.reduce((s, x) => s + x, 0) / v.length

/**
 * Detector robusto de latidos. Devuelve los picos depurados y los intervalos R-R con su validez.
 * @returns {{picos:{indice:number,valor:number,t:number}[], rr:{ms:number, bpm:boolean, hrv:boolean}[],
 *   periodicidad:number, y:number[]}}
 */
export function analizarLatidos(muestras, frecuenciaHz = 50) {
  const res = { picos: [], rr: [], periodicidad: 0, y: [] }
  if (!Array.isArray(muestras) || muestras.length < 3 || !muestras.every(finito)) return res
  const fs = finito(frecuenciaHz) && frecuenciaHz > 0 ? frecuenciaHz : 50
  const n = muestras.length
  let y = filtrarSenalPpg(muestras, fs)
  if (!y.length) return res

  // Señal plana (sin pulsación): no hay picos que marcar
  const orden = [...y].sort((a, b) => a - b)
  const amplitud = orden[Math.min(n - 1, Math.floor(n * 0.95))] - orden[Math.floor(n * 0.05)]
  const escala = Math.max(Math.abs(mediaDe(muestras)), 1)
  if (!(amplitud > 1e-4 * escala) || amplitud < 1e-9) return res

  const P = PARAMETROS_METRICAS
  const per = estimarPeriodo(y, fs)
  res.periodicidad = per.fuerza
  // Con pulso rápido el pasa-altas puede subir: corta la deriva de la respiración sin tocar el latido (la fundamental queda > 2,5 × el corte)
  if (per.periodoS && per.fuerza >= 0.4) {
    const corte = Math.min(P.cortePasaAltasMaxHz, P.cortePasaAltasFraccion / per.periodoS)
    if (corte > BANDA_PPG.bajaHz) y = filtrarSenalPpg(muestras, fs, { bajaHz: corte })
  }
  res.y = y
  const dist = (periodoS) => Math.max(2, Math.round(acotar(P.refractarioFraccion * periodoS, P.refractarioMinS, P.refractarioMaxS) * fs))

  const cands = crestas(y)
  if (cands.length < 2) return res

  // Paso 1: refractario según el periodo de la autocorrelación (o fijo si no hay periodicidad clara)
  let picos = supresion(cands, y, per.periodoS ? dist(per.periodoS) : Math.max(2, Math.round(P.refractarioS * fs)))
  if (picos.length < 2) return res

  // Amplitud típica de los latidos: mediana de la mitad más alta; umbral adaptativo = fracción de ella
  const tipica = (lista) => {
    const h = lista.map((i) => y[i]).sort((a, b) => b - a)
    return mediana(h.slice(0, Math.max(1, Math.ceil(h.length / 2))))
  }
  let amp = tipica(picos)
  picos = picos.filter((i) => y[i] >= P.umbralPico * amp)
  if (picos.length < 2) return res
  amp = mediana(picos.map((i) => y[i]))

  // Paso 2: se repite con el refractario basado en el intervalo mediano ya observado
  const medianoDe = (lista) => mediana(lista.slice(1).map((v, k) => (v - lista[k]) / fs))
  const M1 = medianoDe(picos)
  picos = supresion(cands, y, dist(M1), P.umbralPico * amp)
  if (picos.length < 2) return res

  // Artefactos de movimiento: espigas enormes respecto a la amplitud típica
  const mascara = new Uint8Array(n)
  const mitad = Math.round(0.4 * fs)
  for (let i = 0; i < n; i++) {
    if (Math.abs(y[i]) > P.umbralArtefacto * amp) {
      for (let k = Math.max(0, i - mitad); k <= Math.min(n - 1, i + mitad); k++) mascara[k] = 1
    }
  }
  picos = picos.filter((i) => !mascara[i])
  if (picos.length < 2) return res
  const hayEnMascara = (a, b) => { for (let k = a; k <= b; k++) if (mascara[k]) return true; return false }

  // Latidos perdidos y picos dobles (se repite hasta que no cambie nada)
  for (let vuelta = 0; vuelta < 4; vuelta++) {
    let cambio = false
    const M = medianoDe(picos) * fs // muestras
    // pico doble: dos intervalos cortos que suman ≈ un intervalo normal y el pico de en medio es más bajo
    for (let k = 0; k + 2 < picos.length; k++) {
      const a = picos[k + 1] - picos[k], b = picos[k + 2] - picos[k + 1]
      const sobra = Math.min(a, b) < 0.6 * M && Math.abs(a + b - M) < 0.25 * M &&
        y[picos[k + 1]] < 0.75 * 0.5 * (y[picos[k]] + y[picos[k + 2]])
      if (sobra) { picos.splice(k + 1, 1); cambio = true; break }
    }
    if (cambio) continue
    // latido perdido: un intervalo ≈ 2 × mediana → se busca una cresta débil entre medias
    for (let k = 0; k + 1 < picos.length; k++) {
      const g = picos[k + 1] - picos[k]
      if (g < 1.6 * M || g > 2.7 * M || hayEnMascara(picos[k], picos[k + 1])) continue
      const lo = picos[k] + Math.round(0.55 * M), hi = picos[k + 1] - Math.round(0.55 * M)
      let mejor = -1
      for (const i of cands) if (i >= lo && i <= hi && y[i] >= P.umbralRescate * amp && (mejor < 0 || y[i] > y[mejor])) mejor = i
      if (mejor >= 0) { picos.splice(k + 1, 0, mejor); cambio = true; break }
    }
    if (!cambio) break
  }

  res.picos = picos.map((indice) => ({ indice, valor: muestras[indice], t: indice + parabola(y, indice) }))

  // Intervalos R-R y su validez frente a la mediana local
  const ms = []
  for (let k = 1; k < res.picos.length; k++) ms.push(((res.picos[k].t - res.picos[k - 1].t) / fs) * 1000)
  const W = P.ventanaLocal
  res.rr = ms.map((v, k) => {
    const vecinos = ms.slice(Math.max(0, k - W), Math.min(ms.length, k + W + 1)).filter((x) => x >= P.intervaloMinMs && x <= P.intervaloMaxMs)
    const local = vecinos.length ? mediana(vecinos) : v
    const fisio = v >= P.intervaloMinMs && v <= P.intervaloMaxMs
    const desv = Math.abs(v - local) / local
    // no se acepta un intervalo que cruce un tramo con artefacto
    const limpio = !hayEnMascara(res.picos[k].indice, res.picos[k + 1].indice)
    return { ms: v, bpm: fisio && limpio && desv <= P.toleranciaBpm, hrv: fisio && limpio && desv <= P.toleranciaHrv }
  })
  return res
}

/**
 * Detecta picos sistólicos. Devuelve el índice entero, su valor en la señal original y el
 * instante refinado `t` (en muestras, con interpolación parabólica) para medir intervalos con más precisión.
 * @returns {{indice:number, valor:number, t:number}[]}
 */
export function detectarPicosSistolicos(muestras, frecuenciaHz = 50) {
  return analizarLatidos(muestras, frecuenciaHz).picos
}

/**
 * @param {{ir:number[], rojo?:number[], frecuenciaHz?:number, bpmDispositivo?:number, spo2Dispositivo?:number,
 *          edad?:number, maximo?:number}} entrada
 * @returns {{picos:{indice:number,valor:number}[], bpm:number|null, bpmPlaca:number|null, confianza:'alta'|'media'|'baja',
 *   hrv:{sdnn:number|null,rmssd:number|null,pnn50:number|null},
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
  // BPM de la placa: solo informativo (no se usa para rellenar `bpm`)
  r.bpmPlaca = finito(bpmDispositivo) && bpmDispositivo > 0 && esBpmValido(bpmDispositivo) ? Math.round(bpmDispositivo) : null

  const senalOk = Array.isArray(ir) && ir.length >= fs * PARAMETROS_METRICAS.segundosMinimos && ir.every(finito)
  if (!senalOk) return r
  r.muestrasValidas = true

  // Ruido / calidad de la señal (RF15)
  const cal = evaluarCalidad(ir, { frecuenciaHz: fs, maximo })
  if (cal.nivel !== 'sin_senal') {
    r.ruido = { nivel: cal.nivel, causas: cal.causas, valor: cal.ruido }
  }

  // Picos sistólicos y R-R depurados
  const an = analizarLatidos(ir, fs)
  r.picos = an.picos.map(({ indice, valor }) => ({ indice, valor }))
  const P = PARAMETROS_METRICAS

  const rrBpm = an.rr.filter((x) => x.bpm).map((x) => x.ms)
  const rrHrv = an.rr.filter((x) => x.hrv).map((x) => x.ms)
  r.intervalosMs = rrHrv.map((x) => Math.round(x))

  // Pulso de la app: mediana de los últimos ≤ 8 R-R válidos
  const ultimos = rrBpm.slice(-P.intervalosBpm)
  if (ultimos.length >= 2) {
    const bpmPicos = Math.round(60000 / mediana(ultimos))
    r.pulso = esBpmValido(bpmPicos) ? bpmPicos : null
  }
  r.pulsoDifiere = r.bpmPlaca !== null && r.pulso !== null && Math.abs(r.bpmPlaca - r.pulso) >= P.diferenciaPulsoBpm

  // Confianza
  const mediaUlt = ultimos.length ? mediana(ultimos) : 0
  const dispersion = ultimos.length ? mediana(ultimos.map((x) => Math.abs(x - mediaUlt))) / mediaUlt : 1
  const proporcion = an.rr.length ? rrBpm.length / an.rr.length : 0
  const malaPorRuidoORecorte = cal.causas.some((c) => c.nivel === 'mala' && c.tipo !== 'movimiento')
  const malaPorMovimiento = cal.nivel === 'mala' && !malaPorRuidoORecorte
  let confianza = 'baja'
  if (r.pulso !== null && !malaPorRuidoORecorte && proporcion >= 0.5 && dispersion < 0.2) {
    if (rrBpm.length >= P.intervalosAlta && proporcion >= 0.6 && !malaPorMovimiento) confianza = 'alta'
    else if (rrBpm.length >= P.intervalosMedia) confianza = 'media'
  }
  r.confianza = confianza
  r.bpm = confianza === 'baja' ? null : r.pulso

  // HRV con los R-R depurados
  if (rrHrv.length >= P.intervalosParaHrv) {
    const media = mediaDe(rrHrv)
    const sdnn = Math.sqrt(rrHrv.reduce((s, x) => s + (x - media) ** 2, 0) / rrHrv.length)
    let suma = 0, nn50 = 0
    for (let i = 1; i < rrHrv.length; i++) {
      const d = rrHrv[i] - rrHrv[i - 1]
      suma += d * d
      if (Math.abs(d) > 50) nn50++
    }
    const rmssd = Math.sqrt(suma / (rrHrv.length - 1))
    r.hrv = { sdnn: Math.round(sdnn), rmssd: Math.round(rmssd), pnn50: Math.round((nn50 / (rrHrv.length - 1)) * 100) }

    // Ritmo (RF18): reutiliza el clasificador de la app. Solo con señal que no sea mala por ruido o saturación.
    const bpmRitmo = r.bpm ?? Math.round(60000 / media)
    if (!malaPorRuidoORecorte && esBpmValido(bpmRitmo)) {
      const cv = (sdnn / media) * 100
      const c = clasificarRitmo({
        bpm: bpmRitmo, sdnn: r.hrv.sdnn, rmssd: r.hrv.rmssd,
        lastIntervalMs: Math.round(media),
        regularityLevel: cv >= 22 ? 'irregular' : cv >= 12 ? 'moderate' : 'normal',
        totalBeats: an.picos.length
      })
      if (['normal', 'taquicardia', 'bradicardia', 'irregular'].includes(c.id)) {
        r.ritmo = { clase: c.id, nombre: c.nombre, explicacion: c.criterioNumerico, color: c.colorHex }
      }
    }
  }
  return r
}
