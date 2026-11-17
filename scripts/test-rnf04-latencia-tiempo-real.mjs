#!/usr/bin/env node
/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RNF04
 * Tiempo Real con Baja Latencia (Hasta 100 Estudiantes Simultáneos)
 * ============================================================================
 * Criterios de Aceptación:
 *   1. La latencia medida cumple la meta definida (< 1.000 ms P95, < 500 ms promedio).
 *   2. Los resultados están documentados con fecha y entorno.
 *   3. El panel en vivo sigue funcionando con 100 estudiantes (cero pérdidas).
 * ============================================================================
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Mock básico de localStorage para compatibilidad en Node
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
}

const {
  CONFIG_TIEMPO_REAL_RNF04,
  obtenerAvanceEnVivo,
  suscribirAvanceEnVivo,
  medirLatenciaTiempoReal100Estudiantes,
  compararRendimientoAntesYDespues,
  _setEstadoEnVivoLocal,
  _limpiarEstadoEnVivoLocal
} = await import('../src/services/panelEnVivoService.js')

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

let totalPruebas = 0
let pruebasPasadas = 0
let pruebasFalladas = 0

function test(nombre, fn) {
  totalPruebas++
  try {
    fn()
    pruebasPasadas++
    console.log(`  ✅ [PASS] ${nombre}`)
  } catch (err) {
    pruebasFalladas++
    console.error(`  ❌ [FAIL] ${nombre}`)
    console.error(`     Detalle: ${err.message}\n`)
  }
}

async function testAsync(nombre, fn) {
  totalPruebas++
  try {
    await fn()
    pruebasPasadas++
    console.log(`  ✅ [PASS] ${nombre}`)
  } catch (err) {
    pruebasFalladas++
    console.error(`  ❌ [FAIL] ${nombre}`)
    console.error(`     Detalle: ${err.message}\n`)
  }
}

console.log('\n================================================================')
console.log('⚡ sensor_pulso · Pruebas Automatizadas de RNF04')
console.log('   Tiempo Real con Baja Latencia (Hasta 100 Estudiantes Simultáneos)')
console.log('================================================================\n')

const rutaDocRNF04 = path.join(ROOT, 'docs', 'RNF04-latencia-tiempo-real.md')
const rutaMigracionRNF04 = path.join(ROOT, 'supabase', 'migrations', '20261116000100_rnf04_latencia_tiempo_real.sql')
const rutaBdCompleta = path.join(ROOT, 'supabase', 'sensor_pulso_base_de_datos_completa.sql')
const rutaDocIso02 = path.join(ROOT, 'docs', 'iso27001', '02-declaracion-de-aplicabilidad.md')
const rutaComponentePanel = path.join(ROOT, 'src', 'components', 'PanelAvanceEnVivo.vue')

// ----------------------------------------------------------------------------
// Grupo 1: Documentación Oficial de RNF04 y Criterio 2 (Fecha, Entorno y Resultados)
// ----------------------------------------------------------------------------
console.log('📄 Grupo 1: Documentación Oficial de RNF04 y Criterio 2')

test('El documento docs/RNF04-latencia-tiempo-real.md existe y está completo', () => {
  assert.ok(fs.existsSync(rutaDocRNF04), 'Debe existir docs/RNF04-latencia-tiempo-real.md')
  const stats = fs.statSync(rutaDocRNF04)
  assert.ok(stats.size > 1000, 'El documento debe contener la justificación técnica completa')
})

test('El documento define la meta de latencia (< 1.000 ms P95 y < 500 ms promedio)', () => {
  const contenido = fs.readFileSync(rutaDocRNF04, 'utf8')
  assert.ok(contenido.includes('1.000 ms') || contenido.includes('1000 ms'), 'Debe especificar la meta de 1.000 ms')
  assert.ok(contenido.includes('500 ms'), 'Debe especificar la meta promedio de 500 ms')
  assert.ok(contenido.includes('100 estudiantes'), 'Debe especificar la capacidad de 100 estudiantes simultáneos')
})

test('Criterio 2: Los resultados están documentados con fecha, entorno y responsable', () => {
  const contenido = fs.readFileSync(rutaDocRNF04, 'utf8')
  assert.ok(
    /17 de noviembre de 2026/.test(contenido),
    'Debe registrar la fecha formal de verificación (17 de noviembre de 2026)'
  )
  assert.ok(
    /Adán Ramos/i.test(contenido),
    'Debe registrar al responsable asignado (Adán Ramos)'
  )
  assert.ok(
    contenido.includes('PostgreSQL') && contenido.includes('Realtime'),
    'Debe documentar el entorno de ejecución'
  )
})

test('El documento registra la comparativa de resultados ANTES y DESPUÉS de la optimización', () => {
  const contenido = fs.readFileSync(rutaDocRNF04, 'utf8')
  assert.ok(
    contenido.includes('ANTES') || contenido.includes('Antes de la Optimización'),
    'Debe incluir la sección o tabla de resultados ANTES'
  )
  assert.ok(
    contenido.includes('DESPUÉS') || contenido.includes('Después de la Optimización'),
    'Debe incluir la sección o tabla de resultados DESPUÉS'
  )
})

// ----------------------------------------------------------------------------
// Grupo 2: Migración de Base de Datos e Índices Compuestos
// ----------------------------------------------------------------------------
console.log('\n🗄️ Grupo 2: Migración de Base de Datos e Índices Compuestos')

test('La migración 20261116000100_rnf04_latencia_tiempo_real.sql existe', () => {
  assert.ok(fs.existsSync(rutaMigracionRNF04), 'Debe existir la migración SQL de RNF04')
})

test('La migración define los índices compuestos de alta concurrencia', () => {
  const sql = fs.readFileSync(rutaMigracionRNF04, 'utf8')
  assert.ok(sql.includes('respuestas_intento_respondida_idx'), 'Debe crear respuestas_intento_respondida_idx')
  assert.ok(sql.includes('respuestas_intento_pregunta_idx'), 'Debe crear respuestas_intento_pregunta_idx')
  assert.ok(sql.includes('intentos_eval_avance_vivo_idx'), 'Debe crear intentos_eval_avance_vivo_idx')
})

test('La migración optimiza la función RPC obtener_avance_en_vivo_rf113 con GROUP BY relacional', () => {
  const sql = fs.readFileSync(rutaMigracionRNF04, 'utf8')
  assert.ok(sql.includes('obtener_avance_en_vivo_rf113'), 'Debe redefinir obtener_avance_en_vivo_rf113')
  assert.ok(
    sql.includes('group by r.intento_id') || sql.includes('GROUP BY r.intento_id'),
    'Debe utilizar pre-agrupación GROUP BY para reducir la complejidad relacional'
  )
})

test('sensor_pulso_base_de_datos_completa.sql sincroniza la migración de RNF04', () => {
  const sqlCompleta = fs.readFileSync(rutaBdCompleta, 'utf8')
  assert.ok(
    sqlCompleta.includes('RNF04: Latencia Baja en Tiempo Real') ||
    sqlCompleta.includes('respuestas_intento_respondida_idx'),
    'El esquema consolidado debe incluir las optimizaciones de RNF04'
  )
})

// ----------------------------------------------------------------------------
// Grupo 3: Servicio de Panel en Vivo y Coalescencia Adaptativa
// ----------------------------------------------------------------------------
console.log('\n⚙️ Grupo 3: Servicio de Panel en Vivo y Coalescencia Adaptativa')

test('CONFIG_TIEMPO_REAL_RNF04 define las metas y parámetros de concurrencia', () => {
  assert.ok(CONFIG_TIEMPO_REAL_RNF04, 'Debe exportar CONFIG_TIEMPO_REAL_RNF04')
  assert.strictEqual(CONFIG_TIEMPO_REAL_RNF04.META_LATENCIA_MAX_MS, 1000)
  assert.strictEqual(CONFIG_TIEMPO_REAL_RNF04.META_LATENCIA_PROMEDIO_MS, 500)
  assert.strictEqual(CONFIG_TIEMPO_REAL_RNF04.MAX_ESTUDIANTES_SIMULTANEOS, 100)
  assert.strictEqual(CONFIG_TIEMPO_REAL_RNF04.TIEMPO_COALESCENCIA_DEFECTO_MS, 150)
})

testAsync('suscribirAvanceEnVivo entrega metadato de latencia (_latenciaMs)', async () => {
  _limpiarEstadoEnVivoLocal()
  const evalId = 'eval-test-latencia'
  _setEstadoEnVivoLocal(evalId, { evaluacion_id: evalId, total_respuestas: 10 })

  let latenciaCapturada = null
  const sub = suscribirAvanceEnVivo(evalId, (estado) => {
    if (typeof estado._latenciaMs === 'number') {
      latenciaCapturada = estado._latenciaMs
    }
  }, { intervaloFallbackMs: 0, tiempoCoalescenciaMs: 0 })

  await new Promise(r => setTimeout(r, 50))
  sub.unsubscribe()

  assert.ok(latenciaCapturada !== null, 'Debe incluir metadato _latenciaMs')
  assert.ok(latenciaCapturada >= 0, 'La latencia debe ser un número no negativo')
})

// ----------------------------------------------------------------------------
// Grupo 4: Criterio 1 - Medición de Latencia Cumple la Meta (< 1.000 ms)
// ----------------------------------------------------------------------------
console.log('\n⏱️ Grupo 4: Criterio 1 - Medición de Latencia Cumple la Meta (< 1.000 ms)')

await testAsync('Ejecuta medición de latencia con 100 estudiantes y valida meta P95 < 1.000 ms', async () => {
  const resultado = await medirLatenciaTiempoReal100Estudiantes({
    evaluacionId: 'eval-medicion-100-rnf04',
    cantidadEstudiantes: 100,
    preguntasPorExamen: 5,
    tiempoCoalescenciaMs: 150,
    latenciaRedSimuladaMs: 20
  })

  console.log(`     • Cantidad de estudiantes: ${resultado.cantidadEstudiantes}`)
  console.log(`     • Respuestas reflejadas: ${resultado.respuestasReflejadas} / ${resultado.respuestasEsperadas}`)
  console.log(`     • Latencia mínima: ${resultado.latenciaMinMs} ms`)
  console.log(`     • Latencia máxima: ${resultado.latenciaMaxMs} ms`)
  console.log(`     • Latencia promedio: ${resultado.latenciaPromedioMs} ms (Meta: < 500 ms)`)
  console.log(`     • Latencia P95: ${resultado.latenciaP95Ms} ms (Meta: < 1.000 ms)`)
  console.log(`     • Cumple meta formal: ${resultado.cumpleMeta ? 'SÍ' : 'NO'}`)

  assert.strictEqual(resultado.cantidadEstudiantes, 100)
  assert.strictEqual(resultado.perdidas, 0, 'Cero pérdidas de respuestas')
  assert.ok(resultado.latenciaP95Ms <= 1000, `La latencia P95 (${resultado.latenciaP95Ms} ms) debe ser <= 1000 ms`)
  assert.ok(resultado.latenciaPromedioMs <= 500, `La latencia promedio (${resultado.latenciaPromedioMs} ms) debe ser <= 500 ms`)
  assert.strictEqual(resultado.cumpleMeta, true, 'Debe cumplir la meta definida')
})

await testAsync('compararRendimientoAntesYDespues valida reducción de latencia y peticiones', async () => {
  const comparativa = await compararRendimientoAntesYDespues({
    latenciaRedSimuladaMs: 15
  })

  console.log(`     • Reducción de latencia P95: ${comparativa.mejoras.reduccionLatenciaP95Pct}%`)
  console.log(`     • Reducción de consultas RPC en ráfaga: ${comparativa.mejoras.reduccionConsultasPct}%`)

  assert.ok(comparativa.mejoras.reduccionLatenciaP95Pct > 50, 'La reducción de latencia P95 debe superar el 50%')
  assert.ok(comparativa.mejoras.reduccionConsultasPct >= 80, 'La reducción de consultas en ráfaga debe superar el 80%')
  assert.strictEqual(comparativa.mejoras.metaCumplida, true)
})

// ----------------------------------------------------------------------------
// Grupo 5: Criterio 3 - El panel en vivo sigue funcionando con 100 estudiantes
// ----------------------------------------------------------------------------
console.log('\n👥 Grupo 5: Criterio 3 - El Panel en Vivo Opera Fluidamente con 100 Estudiantes')

await testAsync('El panel en vivo registra a los 100 estudiantes y sus 500 respuestas sin pérdidas', async () => {
  const res = await medirLatenciaTiempoReal100Estudiantes({
    evaluacionId: 'eval-panel-100-funcional',
    cantidadEstudiantes: 100,
    preguntasPorExamen: 5,
    tiempoCoalescenciaMs: 150
  })

  assert.strictEqual(res.panelOperativoCon100Estudiantes, true)
  assert.strictEqual(res.respuestasReflejadas, 500)
  assert.strictEqual(res.perdidas, 0)
})

// ----------------------------------------------------------------------------
// Grupo 6: Interfaz Gráfica y Píldora de Latencia en PanelAvanceEnVivo.vue
// ----------------------------------------------------------------------------
console.log('\n🖥️ Grupo 6: Interfaz Gráfica y Píldora de Latencia en PanelAvanceEnVivo.vue')

test('PanelAvanceEnVivo.vue renderiza el indicador de latencia en vivo (pill-latencia-rnf04)', () => {
  const vueContent = fs.readFileSync(rutaComponentePanel, 'utf8')
  assert.ok(
    vueContent.includes('pill-latencia-rnf04'),
    'Debe contener el atributo data-testid="pill-latencia-rnf04"'
  )
  assert.ok(
    vueContent.includes('badge-latencia'),
    'Debe definir el estilo visual badge-latencia'
  )
  assert.ok(
    vueContent.includes('claseLatencia'),
    'Debe vincular la propiedad computada claseLatencia'
  )
})

test('PanelAvanceEnVivo.vue define estilos para latencia óptima, aceptable y alta', () => {
  const vueContent = fs.readFileSync(rutaComponentePanel, 'utf8')
  assert.ok(vueContent.includes('.badge-latencia-optima'), 'Debe definir estilo para latencia óptima')
  assert.ok(vueContent.includes('.badge-latencia-aceptable'), 'Debe definir estilo para latencia aceptable')
  assert.ok(vueContent.includes('.badge-latencia-alta'), 'Debe definir estilo para latencia alta')
})

// ----------------------------------------------------------------------------
// Grupo 7: Coherencia SGSI ISO/IEC 27001 (Control 8.6 Gestión de la Capacidad)
// ----------------------------------------------------------------------------
console.log('\n📑 Grupo 7: Coherencia SGSI ISO 27001 (Control 8.6)')

test('02-declaracion-de-aplicabilidad.md actualiza el control 8.6 a Implementado citando RNF04', () => {
  const contenidoIso = fs.readFileSync(rutaDocIso02, 'utf8')
  assert.ok(
    contenidoIso.includes('8.6 Gestión de la capacidad') &&
    contenidoIso.includes('RNF04') &&
    contenidoIso.includes('Implementado'),
    'El control 8.6 debe registrarse como Implementado referenciando RNF04'
  )
})

// ----------------------------------------------------------------------------
// RESUMEN FINAL
// ----------------------------------------------------------------------------
console.log('\n================================================================')
console.log(`📊 Total: ${totalPruebas} | Pasadas: ${pruebasPasadas} | Falladas: ${pruebasFalladas}`)
console.log('================================================================\n')

if (pruebasFalladas > 0) {
  process.exit(1)
} else {
  console.log('🎉 Todas las verificaciones de RNF04 se ejecutaron exitosamente.\n')
  process.exit(0)
}
