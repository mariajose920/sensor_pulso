// Generador de señal PPG sintética realista para las pruebas de frecuencia cardíaca (Node puro, sin dependencias).
//   Forma del latido: onda sistólica (gaussiana) + muesca/onda dícrota (gaussiana más pequeña 0,28 s después).
//   Opciones: bpm, hz, seg, ruido (σ del ruido blanco como fracción de la amplitud del pulso), derivaAmp/derivaHz
//   (respiración sobre la línea de base), rafagas [{t, dur, amp}] (movimiento), ectopicos [índices de latido],
//   dicrota (amplitud de la onda dícrota, 0,3 normal), modAmp (profundidad de la modulación de amplitud por la respiración), hrv (desviación relativa del intervalo R-R), saturar (tope del ADC), plana (sin pulso), semilla.

export function rng(semilla) { let s = semilla >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }

const SIGMA_SISTOLE = 0.06
const AMP_DICROTA = 0.3
const RETRASO_DICROTA = 0.28
const SIGMA_DICROTA = 0.07

const latido = (d, dicrota = AMP_DICROTA) => Math.exp(-(d * d) / (2 * SIGMA_SISTOLE ** 2)) + dicrota * Math.exp(-((d - RETRASO_DICROTA) ** 2) / (2 * SIGMA_DICROTA ** 2))

// Desfase (s) entre el instante nominal del latido y el máximo real de la forma de onda (la onda dícrota lo desplaza un poco)
export const DESFASE_MAXIMO_S = (() => {
  let mejor = 0, vm = -Infinity
  for (let d = -0.1; d <= 0.1; d += 0.0005) { const v = latido(d); if (v > vm) { vm = v; mejor = d } }
  return mejor
})()

/**
 * @returns {{x:number[], hz:number, instantes:number[], bpmReal:number}}
 *   instantes = momento (s) del máximo verdadero de cada latido
 */
export function generarPpg({
  bpm = 72, hz = 50, seg = 30, ruido = 0, amp = 3000, dc = 90000, derivaAmp = 0, derivaHz = 0.25,
  rafagas = [], dicrota = AMP_DICROTA, modAmp = 0, ectopicos = [], hrv = 0, saturar = null, plana = false, semilla = 7
} = {}) {
  const rnd = rng(semilla)
  const gauss = () => (rnd() + rnd() + rnd() + rnd() - 2) * 1.7
  const instantes = []
  let t = 0.5
  let k = 0
  const periodo = 60 / bpm
  while (t < seg + 1) {
    let rr = periodo * (1 + hrv * gauss())
    if (ectopicos.includes(k + 1)) rr = periodo * 0.6 // el latido ectópico llega prematuro...
    else if (ectopicos.includes(k)) rr = periodo * 1.4 // ...y la pausa siguiente compensa
    instantes.push(t)
    t += rr
    k++
  }
  const n = Math.round(seg * hz)
  const x = new Array(n)
  for (let i = 0; i < n; i++) {
    const ti = i / hz
    let v = 0
    if (!plana) for (const tp of instantes) { if (Math.abs(ti - tp) < 1) v += latido(ti - tp, dicrota) * (1 + modAmp * Math.sin(2 * Math.PI * derivaHz * ti)) }
    let y = dc + amp * v + gauss() * ruido * amp
    if (derivaAmp) y += derivaAmp * amp * Math.sin(2 * Math.PI * derivaHz * ti)
    for (const r of rafagas) {
      if (ti >= r.t && ti < r.t + r.dur) {
        // movimiento: oscilación fuerte y desordenada de la línea de base
        y += r.amp * amp * (Math.sin(2 * Math.PI * 1.3 * (ti - r.t)) * 0.7 + gauss() * 0.6)
      }
    }
    if (saturar !== null) y = Math.min(y, saturar)
    x[i] = y
  }
  return { x, hz, instantes: instantes.map((p) => p + DESFASE_MAXIMO_S).filter((p) => p < seg), bpmReal: bpm }
}
