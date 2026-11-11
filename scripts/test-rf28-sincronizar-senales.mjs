/**
 * Pruebas automatizadas para RF28:
 * "Sincronizar las señales comparadas; el administrador elige el método."
 *
 * Ejecutar con: node scripts/test-rf28-sincronizar-senales.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Simulación de localStorage en Node
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
}

const {
  generarSenalPpgConDesfase,
  detectarPicosSistolicos,
  calcularCorrelacionPearson,
  sincronizarCorrelacionCruzada,
  sincronizarPorPicos,
  sincronizarDTW,
  sincronizarSenalesComparadas
} = await import('../src/utils/sincronizacionSenales.js')

const {
  obtenerMetodoSincronizacion,
  guardarMetodoSincronizacion
} = await import('../src/services/panelAdminService.js')

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

async function probarAsync(nombre, fn) {
  try {
    await fn()
    pasadas++
    console.log(`  [OK] ${nombre}`)
  } catch (err) {
    console.error(`  [FALLO] ${nombre}`)
    console.error(err)
    process.exit(1)
  }
}

console.log('=== Pruebas RF28: Sincronización de Señales Comparadas ===')

// 1. Detección de picos y correlación de Pearson
probar('1. detectarPicosSistolicos y calcularCorrelacionPearson operan correctamente sobre ondas PPG', () => {
  const sBase = generarSenalPpgConDesfase({ bpm: 75, duracionSegundos: 3.5, frecuenciaHz: 100, desfaseInicialMs: 0 })
  const sDesfasada = generarSenalPpgConDesfase({ bpm: 75, duracionSegundos: 3.5, frecuenciaHz: 100, desfaseInicialMs: -90 })

  const picos = detectarPicosSistolicos(sBase, 100)
  assert.ok(picos.length >= 3, 'Debe detectar al menos 3 picos sistólicos en 3.5 segundos a 75 BPM')

  const corrIdentica = calcularCorrelacionPearson(sBase, sBase)
  const corrDesfasada = calcularCorrelacionPearson(sBase, sDesfasada)
  assert.equal(corrIdentica, 1)
  assert.ok(corrDesfasada < corrIdentica, 'La señal desfasada tiene menor correlación que la señal en fase')
})

// 2. Los 3 métodos de sincronización corrigen el desfase y elevan la similitud
probar('2. correlacion_cruzada, alineacion_por_picos y dtw alinean las señales comparadas', () => {
  for (const metodo of ['correlacion_cruzada', 'alineacion_por_picos', 'dtw']) {
    const syncOn = sincronizarSenalesComparadas({
      metodo,
      sincronizada: true,
      bpmBase: 78,
      bpmComparada: 72,
      desfaseInicialMs: -42
    })
    const syncOff = sincronizarSenalesComparadas({
      metodo,
      sincronizada: false,
      bpmBase: 78,
      bpmComparada: 72,
      desfaseInicialMs: -42
    })

    assert.equal(syncOn.metodo, metodo)
    assert.equal(syncOn.sincronizada, true)
    assert.equal(syncOff.sincronizada, false)
    assert.ok(syncOn.similitud > syncOff.similitud, `El método ${metodo} debe aumentar la similitud al sincronizar`)
    assert.equal(syncOn.diferenciaBpm, 6)
  }
})

// 3. El administrador elige el método y persiste para la vista de comparación
await probarAsync('3. guardarMetodoSincronizacion persiste el método elegido por el administrador y rechaza métodos inválidos', async () => {
  const invalido = await guardarMetodoSincronizacion('metodo_inexistente', 'admin-1')
  assert.equal(invalido.success, false)

  for (const m of ['alineacion_por_picos', 'dtw', 'correlacion_cruzada']) {
    const g = await guardarMetodoSincronizacion(m, 'admin-1')
    assert.equal(g.success, true)
    const leido = await obtenerMetodoSincronizacion()
    assert.equal(leido.success, true)
    assert.equal(leido.data.metodo, m)
  }
})

// 4. Verificación de interfaz gráfica y ausencia de "(Admin)", códigos RFxx y emojis
probar('4. SincronizacionSenalesPanel.vue e integración en ComparacionView.vue cumplen todas las reglas visuales', () => {
  const panelVue = readFileSync(resolve(process.cwd(), 'src/components/SincronizacionSenalesPanel.vue'), 'utf8')
  const compVue = readFileSync(resolve(process.cwd(), 'src/views/ComparacionView.vue'), 'utf8')

  assert.ok(panelVue.includes('Sincronización Temporal de Bioseñales'))
  assert.ok(panelVue.includes('Método activo:'))
  assert.equal(panelVue.includes('(Admin)'), false, 'No debe incluir "(Admin)" en la insignia')
  assert.ok(compVue.includes('<SincronizacionSenalesPanel'))

  const matchTemplate = panelVue.match(/<template>([\s\S]*?)<\/template>/)
  assert.ok(matchTemplate)
  assert.equal(/\bRF\d+\b/i.test(matchTemplate[1]), false, 'No debe mostrar códigos RFxx en el template')

  const regexEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}]/u
  for (const ruta of [
    'src/utils/sincronizacionSenales.js',
    'src/components/SincronizacionSenalesPanel.vue',
    'src/services/panelAdminService.js'
  ]) {
    const txt = readFileSync(resolve(process.cwd(), ruta), 'utf8')
    assert.equal(regexEmoji.test(txt), false, `El archivo ${ruta} no debe contener emojis`)
  }
})

console.log(`\nTodas las pruebas de RF28 pasaron exitosamente (${pasadas}/${pasadas}).`)
