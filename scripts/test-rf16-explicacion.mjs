// RF16 · Prueba de la explicación de la causa de una mala señal.
// Uso: node scripts/test-rf16-explicacion.mjs
import { useSignalSimulator } from '../src/composables/useSignalSimulator.js'
import { evaluarCalidad, MAXIMO_SIMULADOR } from '../src/utils/calidadSenal.js'
import {
  explicarCalidad,
  MENSAJES_CAUSA,
  puedeClasificar,
  puedeGuardarComoValida
} from '../src/utils/explicacionCalidad.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}

function capturar({ amplitud = 100, ruido }) {
  return new Promise((resolve) => {
    const sim = useSignalSimulator({ bpm: 72, amplitude: amplitud, noiseLevel: ruido, arrhythmia: 'normal' })
    const muestras = []
    sim.subscribe((s) => {
      muestras.push(s.value)
      if (muestras.length >= 500) {
        sim.pause()
        resolve(muestras.slice(-300))
      }
    })
    sim.start()
  })
}
const evaluar = (m) => evaluarCalidad(m, { frecuenciaHz: 100, maximo: MAXIMO_SIMULADOR })

console.log('RF16 · explicación de la causa de una mala señal\n')

// Calidad buena: ningún aviso
const limpia = await capturar({ ruido: 3 })
const rl = evaluar(limpia)
marcar(rl.nivel === 'buena' && explicarCalidad(rl.nivel, rl.causas) === null, 'Calidad buena → ningún aviso')
marcar(explicarCalidad('sin_senal', []) === null, 'Sin señal suficiente → ningún aviso')

// Cada causa tiene su propio mensaje, con explicación, consejos y sugerencia de repetir
const saturada = limpia.map((v) => Math.min(4095, 2048 + (v - 2048) * 2.6))
const movida = limpia.map((v, i) => (i > 150 ? v + 1500 : v))
const ruidosa = await capturar({ ruido: 50 })
const casos = [
  ['ruido', evaluar(ruidosa)],
  ['movimiento', evaluar(movida)],
  ['recorte', evaluar(saturada)]
]
const titulos = new Set()
for (const [tipo, r] of casos) {
  const causa = r.causas.find((c) => c.tipo === tipo)
  marcar(Boolean(causa), `Se detecta la causa "${tipo}" (calidad ${r.nivel})`)
  const aviso = explicarCalidad(causa?.nivel || r.nivel, [causa])
  marcar(
    aviso && aviso.tipo === tipo && aviso.explicacion && aviso.consejos.length >= 2 &&
      /repetir/i.test(aviso.sugerencia),
    `"${tipo}" → mensaje propio con explicación, consejos y sugerencia de repetir`
  )
  if (aviso) titulos.add(aviso.titulo)
}
marcar(titulos.size === 3, 'Las tres causas tienen mensajes distintos')
marcar(Object.keys(MENSAJES_CAUSA).length === 3, 'Hay un mensaje por cada causa de RF15')

// Causa dominante: la de peor nivel
const mixta = explicarCalidad('mala', [
  { tipo: 'ruido', nivel: 'regular' },
  { tipo: 'recorte', nivel: 'mala' }
])
marcar(mixta?.tipo === 'recorte', 'Con varias causas se explica la dominante (la de peor nivel)')

// Regular: avisa y deja continuar; mala: avisa y bloquea clasificar y guardar como válida
const regular = explicarCalidad('regular', [{ tipo: 'ruido', nivel: 'regular' }])
const mala = explicarCalidad('mala', [{ tipo: 'ruido', nivel: 'mala' }])
marcar(regular && regular.consecuencia === null, 'Regular → avisa sin bloquear')
marcar(mala && /no se clasifica ni se guarda/i.test(mala.consecuencia), 'Mala → avisa que no se clasifica ni se guarda como válida')
marcar(puedeClasificar('regular') && puedeGuardarComoValida('regular'), 'Regular → se puede clasificar y guardar')
marcar(!puedeClasificar('mala') && !puedeGuardarComoValida('mala'), 'Mala → no se clasifica ni se guarda como válida')
marcar(puedeClasificar('buena') && puedeGuardarComoValida('buena'), 'Buena → se puede clasificar y guardar')

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(fallos ? 1 : 0)
