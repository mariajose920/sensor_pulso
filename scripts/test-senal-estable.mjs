// Pulso ESTABLE y PRECISO con señales PPG sintéticas realistas (Node puro)
//   node scripts/test-senal-estable.mjs
// Simula lo que hace la app: cada segundo calcula el pulso con la ventana de los últimos 8 s y lo estabiliza.
// Criterios: ver las pruebas (error mediano, picos que son máximos locales, nunca un número muy erróneo con confianza alta...).
// Con señal SIMULADA: no sustituye una validación con personas.
import { generarPpg } from './lib-ppg-sintetico.mjs'
import { evaluar } from './lib-evaluar-pulso.mjs'
import * as metricas from '../src/utils/metricasCanal.js'
import { filtrarSenalPpg, BANDA_PPG } from '../src/utils/filtroPpg.js'
import { detectarPicosParaGrafica } from '../src/utils/picosGrafica.js'
import { crearEstabilizadorPulso } from '../src/utils/estabilizadorPulso.js'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }

const BPMS = [45, 60, 72, 100, 150]
const FRECS = [25, 50, 100]

console.log('Filtro pasa-banda sin retraso')
{
  const { x, hz, instantes } = generarPpg({ bpm: 72, hz: 50, seg: 20, ruido: 0.05, derivaAmp: 1, semilla: 5 })
  const y = filtrarSenalPpg(x, hz)
  prueba('mismo largo y sin NaN', y.length === x.length && y.every(Number.isFinite))
  prueba(`banda ${BANDA_PPG.bajaHz}–${BANDA_PPG.altaHz} Hz y centrada en 0`, Math.abs(y.reduce((s, v) => s + v, 0) / y.length) < 50)
  // cero fase: el máximo de cada latido cae en la misma muestra (±1) que en la señal original suavizada
  let desfases = 0, n = 0
  for (const t of instantes.filter((t) => t > 2 && t < 18)) {
    const c = Math.round(t * hz)
    let mx = c, my = c
    for (let i = c - 3; i <= c + 3; i++) { if (x[i] > x[mx]) mx = i; if (y[i] > y[my]) my = i }
    desfases += Math.abs(mx - my); n++
  }
  prueba(`sin retraso: desfase medio de los máximos ${(desfases / n).toFixed(2)} muestras (≤ 1)`, desfases / n <= 1)
  prueba('entrada inválida → []', filtrarSenalPpg(null).length === 0 && filtrarSenalPpg([1, 2]).length === 0 && filtrarSenalPpg([1, 2, NaN, 4]).length === 0)
  // sin transitorio en los extremos: la amplitud en los bordes es comparable a la del centro
  const amp = (a) => Math.max(...a) - Math.min(...a)
  prueba('sin transitorios en los bordes', amp(y.slice(0, 50)) < 2 * amp(y.slice(400, 450)) && amp(y.slice(-50)) < 2 * amp(y.slice(400, 450)))
}

console.log('Ruido moderado (0,08): error mediano del BPM por frecuencia de muestreo')
const resumenModerado = {}
for (const hz of FRECS) {
  const limite = hz === 25 ? 2 : 1.5
  for (const bpm of BPMS) {
    const r = evaluar(metricas, { bpm, hz, ruido: 0.08, seg: 40, semilla: 3 }, { estabilizar: true })
    resumenModerado[`${hz}/${bpm}`] = r
    prueba(`${bpm} BPM a ${hz} Hz: error mediano ${r.errMed.toFixed(2)} ≤ ${limite} · sin lectura ${r.nulos}/${r.total}`, r.errMed <= limite && r.nulos <= 3)
  }
}

console.log('Estabilidad (desv. estándar del BPM mostrado en ventanas de 6 s) y picos con ruido moderado')
for (const hz of FRECS) {
  const sds = BPMS.map((b) => resumenModerado[`${hz}/${b}`].sdVentana6s)
  prueba(`${hz} Hz: desviación estándar máx. ${Math.max(...sds).toFixed(2)} BPM ≤ 0,5`, Math.max(...sds) <= 0.5)
  const falsos = BPMS.reduce((s, b) => s + resumenModerado[`${hz}/${b}`].falsos, 0)
  const perdidos = BPMS.reduce((s, b) => s + resumenModerado[`${hz}/${b}`].perdidos, 0)
  const total = BPMS.reduce((s, b) => s + resumenModerado[`${hz}/${b}`].verdaderos, 0)
  prueba(`${hz} Hz: picos falsos ${falsos} y latidos perdidos ${perdidos} de ${total} (≤ 1 % cada uno)`, falsos <= total * 0.01 && perdidos <= total * 0.01)
  const ub = BPMS.map((b) => resumenModerado[`${hz}/${b}`].errUbicMuestras)
  const ms = (Math.max(...ub) / hz) * 1000
  prueba(`${hz} Hz: error de ubicación del pico ≤ 15 ms (peor caso ${Math.max(...ub).toFixed(2)} muestras = ${ms.toFixed(1)} ms)`, ms <= 15)
}

console.log('Ruido alto (0,30): error ≤ 4 BPM o sin lectura; nunca un número muy erróneo con confianza alta')
for (const hz of FRECS) {
  for (const bpm of BPMS) {
    const r = evaluar(metricas, { bpm, hz, ruido: 0.3, seg: 40, semilla: 4 }, { estabilizar: true })
    const sinLectura = r.nulos === r.total
    prueba(`${bpm} BPM a ${hz} Hz: ${sinLectura ? 'sin lectura' : `error mediano ${r.errMed.toFixed(2)}`}, error máx. con confianza alta ${r.errMaxAlta.toFixed(1)}`,
      (sinLectura || r.errMed <= 4) && r.errMaxAlta <= 4)
  }
}

console.log('Otros escenarios (25 y 50 Hz): nunca un número muy erróneo con confianza alta')
const escenarios = {
  'deriva de la respiración 0,25 Hz': { ruido: 0.04, derivaAmp: 1, derivaHz: 0.25 },
  'deriva fuerte (3 veces el pulso) 0,3 Hz': { ruido: 0.04, derivaAmp: 3, derivaHz: 0.3 },
  'dícrota alta': { ruido: 0.04, dicrota: 0.7 },
  'amplitud variable 50 %': { ruido: 0.04, modAmp: 0.5, derivaHz: 0.25 },
  'latido ectópico': { ruido: 0.04, ectopicos: [14, 30] },
  'variabilidad real 5 %': { ruido: 0.04, hrv: 0.05 },
  'ráfagas de movimiento': { ruido: 0.04, rafagas: [{ t: 10, dur: 1.5, amp: 3 }, { t: 25, dur: 2, amp: 3 }] },
  'saturación del conversor': { ruido: 0.04, saturar: 90000 + 3000 * 0.9 }
}
for (const [nombre, esc] of Object.entries(escenarios)) {
  for (const hz of [25, 50]) {
    let peorAlta = 0, peorMed = 0
    for (const bpm of BPMS) {
      const r = evaluar(metricas, { ...esc, bpm, hz, seg: 40, semilla: 11 }, { estabilizar: true })
      peorAlta = Math.max(peorAlta, r.errMaxAlta)
      if (Number.isFinite(r.errMed)) peorMed = Math.max(peorMed, r.errMed)
    }
    const limiteAlta = nombre.startsWith('variabilidad') ? 6 : 4
    prueba(`${nombre} a ${hz} Hz: error mediano peor caso ${peorMed.toFixed(2)} ≤ 3 y error máx. con confianza alta ${peorAlta.toFixed(1)} ≤ ${limiteAlta}`, peorMed <= 3 && peorAlta <= limiteAlta)
  }
}

console.log('Señal plana y sin dedo → sin lectura (nada inventado)')
for (const hz of FRECS) {
  const r = evaluar(metricas, { bpm: 72, hz, plana: true, seg: 20 }, { estabilizar: true })
  prueba(`señal plana a ${hz} Hz: siempre sin lectura`, r.nulos === r.total)
  const m = metricas.calcularMetricasCanal({ ir: generarPpg({ bpm: 72, hz, plana: true, seg: 10 }).x, frecuenciaHz: hz })
  prueba(`  confianza baja y sin picos (${m.confianza}, ${m.picos.length})`, m.confianza === 'baja' && m.picos.length === 0)
}

console.log('Los picos marcados son máximos locales EXACTOS de la serie dibujada')
for (const hz of FRECS) {
  for (const [nombre, esc] of [['limpia', {}], ['ruido moderado', { ruido: 0.08 }], ['ruido alto', { ruido: 0.3 }], ['deriva', { ruido: 0.04, derivaAmp: 1 }], ['movimiento', { ruido: 0.04, rafagas: [{ t: 4, dur: 1.5, amp: 3 }] }]]) {
    const { x } = generarPpg({ bpm: 80, hz, seg: 10, semilla: 9, ...esc })
    const filtrada = filtrarSenalPpg(x, hz)
    let bien = true
    let cuantos = 0
    for (const serie of [x, filtrada]) {
      const picos = detectarPicosParaGrafica(serie, hz, { referencia: filtrada })
      cuantos += picos.length
      for (let k = 0; k < picos.length; k++) {
        const { indice, valor } = picos[k]
        const maximoLocal = indice > 0 && indice < serie.length - 1 && serie[indice] >= serie[indice - 1] && serie[indice] >= serie[indice + 1]
        if (!maximoLocal || valor !== serie[indice] || (k > 0 && indice <= picos[k - 1].indice)) bien = false
      }
    }
    prueba(`${nombre} a ${hz} Hz: ${cuantos} picos, todos máximos locales, únicos y crecientes`, bien)
  }
}

console.log('El pulso mostrado no salta (estabilizador)')
{
  const e = crearEstabilizadorPulso()
  const salida = []
  let pico = 0
  // 70 BPM estable, luego un valor aislado erróneo de 120, luego vuelve a 70
  for (const b of [70, 70, 71, 120, 70, 70, 69, 70]) { pico += 20; salida.push(e.actualizar({ bpm: b, ultimoPico: pico })) }
  const saltos = salida.slice(1).map((v, i) => Math.abs(v - salida[i]))
  prueba(`salto máximo entre actualizaciones ${Math.max(...saltos)} ≤ 3 BPM`, Math.max(...saltos) <= 3)
  // sin latido nuevo el valor no cambia
  const e2 = crearEstabilizadorPulso()
  e2.actualizar({ bpm: 70, ultimoPico: 100 })
  prueba('sin latido nuevo no cambia', e2.actualizar({ bpm: 74, ultimoPico: 100 }) === 70)
  // cambio sostenido: llega al nuevo valor
  const e3 = crearEstabilizadorPulso()
  let v = null, p = 0
  for (let i = 0; i < 4; i++) { p += 20; v = e3.actualizar({ bpm: 70, ultimoPico: p }) }
  for (let i = 0; i < 12; i++) { p += 20; v = e3.actualizar({ bpm: 100, ultimoPico: p }) }
  prueba(`cambio sostenido 70→100 BPM: llega (${v})`, v === 100)
  // confianza baja: aguanta 2 actualizaciones y luego «sin lectura»
  const e4 = crearEstabilizadorPulso()
  e4.actualizar({ bpm: 70, ultimoPico: 10 })
  const a = e4.actualizar({ bpm: null }), b = e4.actualizar({ bpm: null }), c = e4.actualizar({ bpm: null })
  prueba(`sin lectura tras 3 actualizaciones sin pulso (${a}, ${b}, ${c})`, a === 70 && b === 70 && c === null)
}

console.log(`\n${ok} bien, ${mal} mal`)
process.exit(mal ? 1 : 0)
