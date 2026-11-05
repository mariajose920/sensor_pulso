/**
 * sensor_pulso · Pruebas automatizadas de RF23
 * Requerimiento: interpretación textual de cada resultado y posibles causas de variación.
 * Ejecutar: node scripts/test-rf23-interpretacion.mjs
 */
import assert from 'node:assert'
import fs from 'node:fs'
import {
  interpretarBpm,
  interpretarSpo2,
  interpretarResultados,
  AVISO_INTERPRETACION
} from '../src/utils/interpretacionResultados.js'

let ok = 0
let fallos = 0
function it(desc, fn) {
  try {
    fn()
    console.log(`  ✅ ${desc}`)
    ok++
  } catch (e) {
    console.error(`  ❌ ${desc}\n     ${e.message}`)
    fallos++
  }
}
const claves = (r) => r.causas.map((c) => c.clave)

console.log('\nRF23 · Interpretación de resultados y causas de variación\n')

console.log('▶ BPM')
it('BPM dentro de rango: interpreta y da causas de variación normales', () => {
  const r = interpretarBpm({ bpm: 72, edad: 25, actividad: 'reposo' })
  assert.strictEqual(r.estado, 'dentro')
  assert.match(r.interpretacion, /72 BPM/)
  assert.ok(r.causas.length >= 1)
})
it('BPM alto: menciona cuánto se pasa y lista causas', () => {
  const r = interpretarBpm({ bpm: 115, edad: 25, actividad: 'reposo' })
  assert.strictEqual(r.estado, 'alto')
  assert.match(r.interpretacion, /15 BPM sobre el límite/)
  assert.ok(claves(r).includes('estres') && claves(r).includes('cafeina'))
})
it('BPM bajo: menciona cuánto baja y lista causas', () => {
  const r = interpretarBpm({ bpm: 52, edad: 25, actividad: 'reposo' })
  assert.strictEqual(r.estado, 'bajo')
  assert.match(r.interpretacion, /8 BPM bajo el límite/)
  assert.ok(claves(r).includes('condicion'))
})
it('Las causas del contexto declarado van primero y marcadas como personales', () => {
  const r = interpretarBpm({
    bpm: 115,
    paciente: { nivelEstres: 'muy_alto', cafeina: 'alta', suenoHoras: 'menos_5', medicacionTipo: 'inhalador_asma' }
  })
  const personales = r.causas.filter((c) => c.personal)
  assert.deepStrictEqual(personales.map((c) => c.clave), ['estres', 'cafeina', 'sueno', 'medicacion'])
  assert.ok(r.causas.slice(0, personales.length).every((c) => c.personal))
})
it('No repite una causa personal y su versión general', () => {
  const r = interpretarBpm({ bpm: 115, paciente: { nivelEstres: 'alto' } })
  assert.strictEqual(claves(r).filter((c) => c === 'estres').length, 1)
})
it('Con medicación para el corazón y pulso bajo, la causa personal es la medicación', () => {
  const r = interpretarBpm({ bpm: 50, paciente: { medicacionTipo: 'presion_corazon' } })
  assert.strictEqual(r.causas[0].clave, 'medicacion')
  assert.strictEqual(r.causas[0].personal, true)
})
it('El rango se ajusta a la actividad: 110 BPM en ejercicio es normal', () => {
  assert.strictEqual(interpretarBpm({ bpm: 110, actividad: 'ejercicio' }).estado, 'dentro')
})
it('BPM inválido no interpreta: pide repetir', () => {
  for (const bpm of [0, NaN, undefined, 300]) {
    const r = interpretarBpm({ bpm })
    assert.strictEqual(r.estado, 'invalido')
    assert.match(r.interpretacion, /Repite la medición/)
  }
})

console.log('\n▶ SpO₂')
it('SpO₂ normal: interpreta y da causas de variación', () => {
  const r = interpretarSpo2({ spo2: 98 })
  assert.strictEqual(r.estado, 'dentro')
  assert.match(r.interpretacion, /98 %/)
  assert.ok(r.causas.length >= 1)
})
it('SpO₂ algo baja (90-94): sugiere repetir y lista causas', () => {
  const r = interpretarSpo2({ spo2: 92 })
  assert.strictEqual(r.estado, 'bajo')
  assert.match(r.interpretacion, /repítela/)
  assert.ok(claves(r).includes('senal') && claves(r).includes('esmalte') && claves(r).includes('frio'))
})
it('SpO₂ bajo 90 %: advierte buscar atención médica', () => {
  const r = interpretarSpo2({ spo2: 86 })
  assert.match(r.titulo, /claramente baja/)
  assert.match(r.interpretacion, /atención médica/)
})
it('Calidad regular o mala se agrega como causa personal', () => {
  const r = interpretarSpo2({ spo2: 92, calidad: 'mala' })
  assert.strictEqual(r.causas[0].clave, 'senal')
  assert.strictEqual(r.causas[0].personal, true)
  assert.strictEqual(claves(r).filter((c) => c === 'senal').length, 1)
})
it('SpO₂ inválida no interpreta', () => {
  for (const spo2 of [0, 101, NaN, null]) assert.strictEqual(interpretarSpo2({ spo2 }).estado, 'invalido')
})

console.log('\n▶ Conjunto')
it('interpretarResultados entrega BPM, SpO₂ y aviso educativo', () => {
  const r = interpretarResultados({ bpm: 72, spo2: 98, paciente: { edad: 30, actividadNombre: 'Reposo' } })
  assert.ok(r.bpm && r.spo2)
  assert.strictEqual(r.aviso, AVISO_INTERPRETACION)
  assert.match(r.aviso, /no reemplaza una evaluación médica/i)
})
it('Toma actividad y edad del paciente', () => {
  const r = interpretarResultados({ bpm: 110, spo2: 98, paciente: { edad: 25, actividadNombre: 'ejercicio' } })
  assert.strictEqual(r.bpm.estado, 'dentro')
})

console.log('\n▶ Integración')
it('MedicionView muestra el componente de interpretación', () => {
  const vista = fs.readFileSync(new URL('../src/views/MedicionView.vue', import.meta.url), 'utf8')
  assert.match(vista, /<InterpretacionResultados/)
  assert.match(vista, /import InterpretacionResultados/)
})

console.log(`\nResultado: ${ok} correctas, ${fallos} con fallo\n`)
process.exit(fallos ? 1 : 0)
