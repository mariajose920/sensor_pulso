/**
 * Pruebas automatizadas para RF29:
 * "Generar un análisis automático de la comparación y explicar a qué se debe la diferencia"
 *
 * Ejecutar con: node scripts/test-rf29-analisis-comparacion.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const {
  calcularSimilitudComparacion,
  generarAnalisisAutomaticoComparacion
} = await import('../src/utils/analisisComparacion.js')

let pasadas = 0
function probar(nombre, fn) {
  try {
    fn()
    pasadas++
    console.log(`  [OK] ${nombre}`)
  } catch (err) {
    console.error(`  [FALLO] ${nombre}`)
    console.error(err)
    process.exit(1)
  }
}

console.log('=== Pruebas RF29: Análisis Automático de Comparación y Explicación de Diferencias ===')

// 1. Caso base (78 vs 72 BPM -> +6 BPM, -64 ms, concordancia alta y explicación simpática)
probar('1. Genera el diagnóstico automático y explica la diferencia para elevación leve (+6 BPM)', () => {
  const res = generarAnalisisAutomaticoComparacion({
    bpmActual: 78,
    bpmReferencia: 72,
    amplitudActual: 100,
    amplitudReferencia: 100,
    similitudPorcentaje: 96.4
  })

  assert.equal(res.deltaBpm, 6)
  assert.equal(res.cicloActualMs, 769)
  assert.equal(res.cicloReferenciaMs, 833)
  assert.equal(res.deltaCicloMs, -64)
  assert.equal(res.nivelConcordancia, 'alta')
  assert.ok(res.etiquetaEstado.includes('Concordancia Alta'))
  assert.ok(res.diagnosticoResumen.includes('+6 BPM'))
  assert.ok(res.diagnosticoResumen.includes('-64 ms'))
  assert.ok(res.explicacionFrecuencia.explicacion.includes('sistema nervioso simpático'))
  assert.ok(res.explicacionMorfologia.explicacion.includes('elasticidad arterial'))
  assert.equal(res.factoresCausales.causas.length, 3)
})

// 2. Caso de frecuencia menor (58 vs 72 BPM -> -14 BPM, predominio vagal/parasimpático)
probar('2. Explica correctamente cuando la medición tiene menor frecuencia (-14 BPM, tono parasimpático)', () => {
  const res = generarAnalisisAutomaticoComparacion({
    bpmActual: 58,
    bpmReferencia: 72
  })

  assert.equal(res.deltaBpm, -14)
  assert.ok(res.deltaCicloMs > 0, 'El ciclo cardíaco se prolonga cuando disminuye el BPM')
  assert.equal(res.nivelConcordancia, 'moderada')
  assert.ok(res.explicacionFrecuencia.explicacion.includes('parasimpático'))
  assert.ok(res.diagnosticoResumen.includes('reducción fisiológica'))
})

// 3. Caso de diferencia marcada (110 vs 72 BPM -> +38 BPM, concordancia baja)
probar('3. Clasifica como concordancia baja una diferencia marcada (+38 BPM) y detalla causas de esfuerzo/estrés', () => {
  const res = generarAnalisisAutomaticoComparacion({
    bpmActual: 110,
    bpmReferencia: 72
  })

  assert.equal(res.deltaBpm, 38)
  assert.equal(res.nivelConcordancia, 'baja')
  assert.ok(res.etiquetaEstado.includes('Diferencia Marcada'))
  assert.ok(res.factoresCausales.causas.some(c => c.includes('Actividad física') || c.includes('demanda metabólica')))
})

// 4. Explicación de diferencias de amplitud de perfusión (vasodilatación vs vasoconstricción)
probar('4. Explica las variaciones de amplitud de perfusión (mayor y menor amplitud)', () => {
  const altaAmp = generarAnalisisAutomaticoComparacion({
    bpmActual: 75,
    bpmReferencia: 72,
    amplitudActual: 135,
    amplitudReferencia: 100
  })
  assert.ok(altaAmp.explicacionMorfologia.explicacion.includes('vasodilatación periférica'))

  const bajaAmp = generarAnalisisAutomaticoComparacion({
    bpmActual: 75,
    bpmReferencia: 72,
    amplitudActual: 65,
    amplitudReferencia: 100
  })
  assert.ok(bajaAmp.explicacionMorfologia.explicacion.includes('vasoconstricción periférica'))
})

// 5. Escala de similitud de 0 a 100 %
probar('5. calcularSimilitudComparacion devuelve valores en escala 0 a 100 % coherentes con la discrepancia', () => {
  const sIgual = calcularSimilitudComparacion({ bpmActual: 72, bpmReferencia: 72, amplitudActual: 100, amplitudReferencia: 100 })
  const sCercana = calcularSimilitudComparacion({ bpmActual: 78, bpmReferencia: 72, amplitudActual: 100, amplitudReferencia: 100 })
  const sLejana = calcularSimilitudComparacion({ bpmActual: 125, bpmReferencia: 72, amplitudActual: 60, amplitudReferencia: 100 })

  assert.ok(sIgual >= 99)
  assert.ok(sCercana > sLejana)
  assert.ok(sLejana >= 15 && sLejana <= 100)
})

// 6. Verificación de interfaz gráfica sin códigos RFxx en template ni emojis
probar('6. AnalisisAutomaticoComparacionPanel.vue e integración en ComparacionView.vue cumplen todas las reglas visuales', () => {
  const panelVue = readFileSync(resolve(process.cwd(), 'src/components/AnalisisAutomaticoComparacionPanel.vue'), 'utf8')
  const compVue = readFileSync(resolve(process.cwd(), 'src/views/ComparacionView.vue'), 'utf8')

  assert.ok(panelVue.includes('Análisis Automático de la Comparación Fisiológica'))
  assert.ok(panelVue.includes('Diagnóstico Automático del Contraste'))
  assert.ok(panelVue.includes('¿A qué se debe la diferencia observada?'))
  assert.ok(compVue.includes('<AnalisisAutomaticoComparacionPanel'))

  const matchTemplate = panelVue.match(/<template>([\s\S]*?)<\/template>/)
  assert.ok(matchTemplate)
  assert.equal(/\bRF\d+\b/i.test(matchTemplate[1]), false, 'No debe mostrar códigos RFxx en el template')

  const regexEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}]/u
  for (const ruta of [
    'src/utils/analisisComparacion.js',
    'src/components/AnalisisAutomaticoComparacionPanel.vue'
  ]) {
    const txt = readFileSync(resolve(process.cwd(), ruta), 'utf8')
    assert.equal(regexEmoji.test(txt), false, `El archivo ${ruta} no debe contener emojis`)
  }
})

console.log(`\nTodas las pruebas de RF29 pasaron exitosamente (${pasadas}/${pasadas}).`)
