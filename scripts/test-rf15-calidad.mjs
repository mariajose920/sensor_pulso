// RF15 · Prueba del indicador de calidad con el simulador del RF41 (100 Hz, escala 0-4095).
// Uso: node scripts/test-rf15-calidad.mjs [--valores]   (--valores imprime las medidas para ajustar umbrales)
import { useSignalSimulator } from '../src/composables/useSignalSimulator.js'
import { evaluarCalidad, MAXIMO_SIMULADOR } from '../src/utils/calidadSenal.js'

const VENTANA = 300 // 3 s a 100 Hz
const imprimir = process.argv.includes('--valores')

function capturar({ amplitud, ruido, bpm = 72 }) {
  return new Promise((resolve) => {
    const sim = useSignalSimulator({ bpm, amplitude: amplitud, noiseLevel: ruido, arrhythmia: 'normal' })
    const muestras = []
    sim.subscribe((s) => {
      muestras.push(s.value)
      if (muestras.length >= 500) {
        sim.pause()
        resolve(muestras.slice(-VENTANA))
      }
    })
    sim.start()
  })
}

const casos = [
  // [nombre, parámetros del simulador, niveles aceptados]
  ['Señal limpia (ruido 3 %, amplitud 100 %)', { amplitud: 100, ruido: 3 }, ['buena']],
  ['Reposo con algo de ruido (ruido 7 %)', { amplitud: 100, ruido: 7 }, ['buena', 'regular']],
  ['Ruido alto (35 %)', { amplitud: 100, ruido: 35 }, ['regular', 'mala']],
  ['Ruido máximo (50 %)', { amplitud: 100, ruido: 50 }, ['regular', 'mala']],
  ['Amplitud alta con ruido (150 %, ruido 50 %)', { amplitud: 150, ruido: 50 }, ['mala']],
  ['Amplitud alta con ruido medio (150 %, ruido 35 %)', { amplitud: 150, ruido: 35 }, ['mala']]
]

let fallos = 0
const marcar = (ok, texto, extra = '') => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}${extra}`)
}

console.log('RF15 · calidad de la señal con el simulador del RF41\n')
for (const [nombre, params, aceptados] of casos) {
  const m = await capturar(params)
  const r = evaluarCalidad(m, { frecuenciaHz: 100, maximo: MAXIMO_SIMULADOR })
  const tope = m.filter((v) => v >= 4095).length
  marcar(aceptados.includes(r.nivel), `${nombre} → ${r.nivel}`,
    imprimir ? `  [ruido ${r.ruido}, mov ${r.movimiento}, recorte ${r.recorte}, en tope ${tope}/${m.length}]` : '')
}

// Recorte: la misma señal limpia con el sensor saturado en el máximo
const limpia = await capturar({ amplitud: 100, ruido: 3 })
const saturada = limpia.map((v) => Math.min(4095, 2048 + (v - 2048) * 2.6))
const rs = evaluarCalidad(saturada, { frecuenciaHz: 100, maximo: MAXIMO_SIMULADOR })
marcar(rs.nivel === 'mala' && rs.causas[0]?.tipo === 'recorte', `Con recorte → ${rs.nivel}`,
  imprimir ? `  [recorte ${rs.recorte}]` : '')

// Movimiento: cambio brusco de nivel a mitad de la ventana
const movida = limpia.map((v, i) => (i > VENTANA / 2 ? v + 1500 : v))
const rm = evaluarCalidad(movida, { frecuenciaHz: 100, maximo: MAXIMO_SIMULADOR })
marcar(rm.nivel !== 'buena' && rm.causas.some((c) => c.tipo === 'movimiento'), `Con movimiento → ${rm.nivel}`,
  imprimir ? `  [mov ${rm.movimiento}]` : '')

// En vivo: la calidad cambia al subir el ruido sobre el mismo simulador
const antes = evaluarCalidad(await capturar({ amplitud: 100, ruido: 3 }), { frecuenciaHz: 100 })
const despues = evaluarCalidad(await capturar({ amplitud: 100, ruido: 50 }), { frecuenciaHz: 100 })
marcar(antes.nivel === 'buena' && despues.nivel !== 'buena', `Cambia en vivo: ${antes.nivel} → ${despues.nivel}`)

// Pocas muestras: no se inventa un nivel
marcar(evaluarCalidad([2048, 2050], {}).nivel === 'sin_senal', 'Pocas muestras → sin_senal')

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(fallos ? 1 : 0)
