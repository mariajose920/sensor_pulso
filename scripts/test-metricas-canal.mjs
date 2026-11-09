// RF111 · Pruebas de las métricas de un canal (picos, BPM, HRV, ruido, ritmo, SpO₂, pulso)
//   node scripts/test-metricas-canal.mjs
import { calcularMetricasCanal, detectarPicosSistolicos } from '../src/utils/metricasCanal.js'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }

// Generador pseudoaleatorio con semilla (pruebas reproducibles)
function rng(semilla) { let s = semilla >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296) }

/** Señal PPG sintética: un pulso (cresta + onda dícrota) en cada instante de `tiempos` (s), sobre un DC de MAX30102. */
function ppg({ tiempos, hz, seg, ruido = 0, amp = 3000, dc = 90000, semilla = 7 }) {
  const rnd = rng(semilla)
  const n = Math.round(seg * hz)
  const out = new Array(n)
  for (let i = 0; i < n; i++) {
    const t = i / hz
    let v = 0
    for (const tp of tiempos) {
      const d = t - tp
      v += Math.exp(-(d * d) / (2 * 0.06 * 0.06)) + 0.3 * Math.exp(-((d - 0.28) ** 2) / (2 * 0.07 * 0.07))
    }
    const gauss = (rnd() + rnd() + rnd() + rnd() - 2) * 1.7
    out[i] = dc + amp * v + gauss * ruido * amp
  }
  return out
}
const regular = (bpm, seg) => { const p = 60 / bpm; const a = []; for (let t = 0.4; t < seg; t += p) a.push(t); return a }
const irregular = (seg) => { const rnd = rng(3); const a = []; let t = 0.4; while (t < seg) { a.push(t); t += 0.45 + rnd() * 0.75 } return a }
const sinNaN = (o) => !JSON.stringify(o, (k, v) => (typeof v === 'number' && !Number.isFinite(v) ? '__NAN__' : v)).includes('__NAN__')

console.log('BPM y picos con señales regulares')
for (const hz of [50, 100]) {
  for (const bpm of [60, 72, 110]) {
    const seg = 12
    const t = regular(bpm, seg)
    const m = calcularMetricasCanal({ ir: ppg({ tiempos: t, hz, seg }), frecuenciaHz: hz })
    prueba(`${bpm} BPM a ${hz} Hz → bpm ${m.bpm}`, m.bpm !== null && Math.abs(m.bpm - bpm) <= 3)
    prueba(`  picos contados coherentes (${m.picos.length} de ${t.length})`, Math.abs(m.picos.length - t.length) <= 1)
    prueba('  pulso por picos ≈ bpm y sin NaN', m.pulso !== null && Math.abs(m.pulso - bpm) <= 3 && sinNaN(m))
    prueba('  picos dentro de la señal y con su valor', m.picos.every(p => p.indice > 0 && p.indice < seg * hz - 1 && Number.isFinite(p.valor)))
  }
}

console.log('Con ruido moderado')
{
  const m = calcularMetricasCanal({ ir: ppg({ tiempos: regular(72, 12), hz: 50, seg: 12, ruido: 0.04 }), frecuenciaHz: 50 })
  prueba(`72 BPM con ruido leve → bpm ${m.bpm}`, m.bpm !== null && Math.abs(m.bpm - 72) <= 3)
}

console.log('HRV')
{
  const reg = calcularMetricasCanal({ ir: ppg({ tiempos: regular(72, 15), hz: 100, seg: 15 }), frecuenciaHz: 100 })
  const irr = calcularMetricasCanal({ ir: ppg({ tiempos: irregular(15), hz: 100, seg: 15 }), frecuenciaHz: 100 })
  prueba(`intervalos regulares: SDNN bajo (${reg.hrv.sdnn} ms)`, reg.hrv.sdnn !== null && reg.hrv.sdnn < 25)
  prueba(`intervalos irregulares: SDNN más alto (${irr.hrv.sdnn} ms)`, irr.hrv.sdnn !== null && irr.hrv.sdnn > reg.hrv.sdnn * 3)
  prueba('RMSSD y pNN50 presentes', reg.hrv.rmssd !== null && irr.hrv.rmssd !== null && irr.hrv.pnn50 !== null)
}

console.log('Ritmo')
{
  const clase = (bpm) => calcularMetricasCanal({ ir: ppg({ tiempos: regular(bpm, 12), hz: 50, seg: 12 }), frecuenciaHz: 50 }).ritmo?.clase
  prueba('72 BPM → normal', clase(72) === 'normal')
  prueba('120 BPM → taquicardia', clase(120) === 'taquicardia')
  prueba('48 BPM → bradicardia', clase(48) === 'bradicardia')
  const irr = calcularMetricasCanal({ ir: ppg({ tiempos: irregular(15), hz: 100, seg: 15 }), frecuenciaHz: 100 })
  prueba('intervalos desiguales → irregular', irr.ritmo?.clase === 'irregular')
  prueba('el ritmo trae nombre y explicación', typeof irr.ritmo?.nombre === 'string' && irr.ritmo.explicacion.length > 10)
}

console.log('BPM del dispositivo y pulso')
{
  const ir = ppg({ tiempos: regular(72, 12), hz: 50, seg: 12 })
  const igual = calcularMetricasCanal({ ir, frecuenciaHz: 50, bpmDispositivo: 73 })
  prueba('dispositivo ≈ picos: no se distinguen (pulsoDifiere=false)', igual.bpm === 73 && igual.pulso !== null && !igual.pulsoDifiere)
  const dif = calcularMetricasCanal({ ir, frecuenciaHz: 50, bpmDispositivo: 95 })
  prueba('dispositivo muy distinto de los picos: pulsoDifiere=true', dif.bpm === 95 && dif.pulsoDifiere && Math.abs(dif.pulso - 72) <= 3)
  const inval = calcularMetricasCanal({ ir, frecuenciaHz: 50, bpmDispositivo: 0, spo2Dispositivo: 0 })
  prueba('BPM/SpO₂ de 0 del dispositivo no se toman como dato', inval.spo2 === null && Math.abs(inval.bpm - 72) <= 3)
  prueba('SpO₂ válida del dispositivo se conserva', calcularMetricasCanal({ ir, frecuenciaHz: 50, spo2Dispositivo: 97.4 }).spo2 === 97.4)
}

console.log('Sin datos suficientes → null (nada inventado)')
{
  const plana = calcularMetricasCanal({ ir: new Array(600).fill(90000), frecuenciaHz: 50 })
  prueba('señal plana: sin picos, bpm, hrv ni ritmo', plana.picos.length === 0 && plana.bpm === null && plana.hrv.sdnn === null && plana.ritmo === null && plana.pulso === null)
  prueba('señal plana: sin NaN', sinNaN(plana))
  const corta = calcularMetricasCanal({ ir: ppg({ tiempos: [0.4, 1.2], hz: 50, seg: 2 }), frecuenciaHz: 50 })
  prueba('señal muy corta: todo null', corta.bpm === null && corta.picos.length === 0 && corta.ruido === null && corta.ritmo === null && corta.hrv.rmssd === null)
  const vacia = calcularMetricasCanal({})
  prueba('sin argumentos: todo null y sin NaN', vacia.bpm === null && vacia.spo2 === null && vacia.ruido === null && sinNaN(vacia))
  prueba('ir null / con NaN no revienta', calcularMetricasCanal({ ir: null }).bpm === null && calcularMetricasCanal({ ir: [NaN, 1, 2] }).bpm === null)
  const soloDisp = calcularMetricasCanal({ ir: [], bpmDispositivo: 80, spo2Dispositivo: 96 })
  prueba('sin señal pero con lectura del dispositivo: solo esa lectura', soloDisp.bpm === 80 && soloDisp.spo2 === 96 && soloDisp.picos.length === 0 && soloDisp.hrv.sdnn === null)
  prueba('detectarPicosSistolicos con entrada inválida → []', detectarPicosSistolicos(null).length === 0 && detectarPicosSistolicos([1, 2]).length === 0)
}

console.log('Ruido y recorte')
{
  const limpia = calcularMetricasCanal({ ir: ppg({ tiempos: regular(72, 12), hz: 50, seg: 12 }), frecuenciaHz: 50 })
  prueba(`señal limpia → buena (${limpia.ruido?.nivel})`, limpia.ruido?.nivel === 'buena')
  const ruidosa = calcularMetricasCanal({ ir: ppg({ tiempos: regular(72, 12), hz: 50, seg: 12, ruido: 0.9 }), frecuenciaHz: 50 })
  prueba(`ruido alto → mala (${ruidosa.ruido?.nivel})`, ruidosa.ruido?.nivel === 'mala')
  prueba('ruido alto: sin NaN', sinNaN(ruidosa))
  const sat = ppg({ tiempos: regular(72, 12), hz: 50, seg: 12, dc: 262000, amp: 30000 }).map(v => Math.min(v, 262143))
  const rec = calcularMetricasCanal({ ir: sat, frecuenciaHz: 50 })
  prueba('saturación del sensor detectada como recorte', rec.ruido?.causas.some(c => c.tipo === 'recorte') && rec.ruido.nivel === 'mala')
}

console.log(`\n${ok} bien, ${mal} mal`)
process.exit(mal ? 1 : 0)
