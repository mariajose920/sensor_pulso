// Evaluación del detector de pulso sobre señal sintética (la usan test-senal-estable.mjs y el comparador antes/ahora).
// Simula lo que hace la app: cada segundo calcula las métricas con la ventana de los últimos 8 s.
import { generarPpg } from './lib-ppg-sintetico.mjs'
import { crearEstabilizadorPulso } from '../src/utils/estabilizadorPulso.js'

export const mediana = (v) => { if (!v.length) return NaN; const o = [...v].sort((a, b) => a - b); const m = o.length >> 1; return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2 }
const media = (v) => (v.length ? v.reduce((s, x) => s + x, 0) / v.length : NaN)
const desv = (v) => { const m = media(v); return Math.sqrt(media(v.map((x) => (x - m) ** 2))) }

/**
 * @param {{calcularMetricasCanal:Function, detectarPicosSistolicos:Function}} mod módulo a evaluar (nuevo o antiguo)
 * @param {object} esc opciones de generarPpg
 * @param {{estabilizar?:boolean, ventanaS?:number}} op
 */
export function evaluar(mod, esc, { estabilizar = false, ventanaS = 8 } = {}) {
  const seg = esc.seg ?? 40
  const { x, hz, instantes, bpmReal } = generarPpg({ ...esc, seg })
  const estab = crearEstabilizadorPulso()
  const serie = [] // un valor por segundo: {crudo, mostrado, confianza}
  for (let fin = ventanaS; fin <= seg; fin++) {
    const v = x.slice(Math.round((fin - ventanaS) * hz), Math.round(fin * hz))
    const m = mod.calcularMetricasCanal({ ir: v, frecuenciaHz: hz })
    const crudo = m.bpm ?? null
    const ult = m.picos?.length ? Math.round(fin * hz) - v.length + m.picos[m.picos.length - 1].indice : undefined
    const mostrado = estabilizar ? estab.actualizar({ bpm: crudo, ultimoPico: ult }) : crudo
    // referencia: mediana de los últimos 8 intervalos verdaderos (la misma definición que usa el detector)
    const verd = instantes.filter((t) => t <= fin - 0.3 && t >= fin - ventanaS)
    const rrVerd = verd.slice(1).map((t, i) => t - verd[i]).slice(-8)
    const ref = rrVerd.length >= 2 ? 60 / mediana(rrVerd) : bpmReal
    serie.push({ crudo, mostrado, confianza: m.confianza ?? null, ref })
  }
  const errores = serie.filter((s) => s.mostrado !== null).map((s) => Math.abs(s.mostrado - s.ref))
  const erroresAlta = serie.filter((s) => s.confianza === 'alta' && s.mostrado !== null).map((s) => Math.abs(s.mostrado - s.ref))
  // estabilidad: desviación estándar del BPM mostrado en ventanas deslizantes de 6 s (1 valor por segundo)
  const sds = []
  for (let i = 0; i + 6 <= serie.length; i++) {
    const w = serie.slice(i, i + 6).map((s) => s.mostrado).filter((v) => v !== null)
    if (w.length >= 4) sds.push(desv(w))
  }
  // picos: ventana de 8 s cada 4 s; solo se cuentan los latidos a más de 0,6 s de los bordes
  let falsos = 0, perdidos = 0, verdaderos = 0
  const errUbic = []
  for (let fin = ventanaS; fin <= seg; fin += 4) {
    const t0 = fin - ventanaS
    const v = x.slice(Math.round(t0 * hz), Math.round(fin * hz))
    const det = mod.detectarPicosSistolicos(v, hz)
    const lo = t0 + 0.6, hi = fin - 0.6
    const reales = instantes.filter((t) => t >= lo && t <= hi)
    const dets = det.map((p) => ({ t: t0 + (p.t ?? p.indice) / hz })).filter((p) => p.t >= lo && p.t <= hi)
    const usados = new Set()
    for (const tr of reales) {
      let mejor = -1, md = Infinity
      dets.forEach((p, i) => { const d = Math.abs(p.t - tr); if (!usados.has(i) && d < md) { md = d; mejor = i } })
      verdaderos++
      if (mejor >= 0 && md <= 0.12) { usados.add(mejor); errUbic.push(md * hz) } else perdidos++
    }
    falsos += dets.length - usados.size
  }
  return {
    bpmReal,
    nulos: serie.filter((s) => s.mostrado === null).length, total: serie.length,
    errMed: errores.length ? mediana(errores) : NaN,
    errMax: errores.length ? Math.max(...errores) : NaN,
    errMaxAlta: erroresAlta.length ? Math.max(...erroresAlta) : 0,
    sdVentana6s: sds.length ? media(sds) : NaN,
    falsos, perdidos, verdaderos,
    errUbicMuestras: errUbic.length ? mediana(errUbic) : NaN,
    serie
  }
}
