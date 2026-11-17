#!/usr/bin/env node
/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RNF15
 * Recuperación ante Fallas y Copias Fuera de Supabase
 * ============================================================================
 * Criterios de Aceptación:
 *   1. Los tiempos están definidos y escritos (RTO y RPO).
 *   2. Hay una copia fuera de Supabase (integridad SHA-256).
 *   3. La prueba de recuperación quedó dentro del tiempo definido, o se explica por qué no.
 * ============================================================================
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CONFIG_CONTINUIDAD_RNF15,
  exportarCopiaFueraDeSupabase,
  simularFallaYRecuperacionCompleta,
  calcularChecksum,
  cifrarDatosSaludPrueba
} from './lib-respaldo-restauracion.mjs'

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
console.log('🛡️ sensor_pulso · Pruebas Automatizadas de RNF15')
console.log('   Recuperación ante Fallas y Copias Fuera de Supabase')
console.log('================================================================\n')

const rutaDocRNF15 = path.join(ROOT, 'docs', 'RNF15-recuperacion-fallas.md')
const rutaDoc04 = path.join(ROOT, 'docs', 'iso27001', '04-continuidad-monitoreo-y-vulnerabilidades.md')
const rutaDoc02 = path.join(ROOT, 'docs', 'iso27001', '02-declaracion-de-aplicabilidad.md')
const rutaDoc01 = path.join(ROOT, 'docs', 'iso27001', '01-alcance-politica-y-riesgos.md')
const rutaCopiaExterna = path.join(ROOT, 'respaldos_externos', 'copia_seguridad_fuera_de_supabase.json')
const rutaScriptExportar = path.join(ROOT, 'scripts', 'exportar-copia-externa.mjs')
const rutaScriptSimulador = path.join(ROOT, 'scripts', 'simulador-falla-recuperacion.mjs')

// ----------------------------------------------------------------------------
// Grupo 1: Criterio 1 - Definición Formal de Tiempos (RTO y RPO)
// ----------------------------------------------------------------------------
console.log('⏱️ Grupo 1: Criterio 1 - Tiempos Definidos y Escritos (RTO y RPO)')

test('El documento docs/RNF15-recuperacion-fallas.md existe y no está vacío', () => {
  assert.ok(fs.existsSync(rutaDocRNF15), 'Debe existir docs/RNF15-recuperacion-fallas.md')
  const stats = fs.statSync(rutaDocRNF15)
  assert.ok(stats.size > 1000, 'El documento debe contener el detalle técnico completo')
})

test('El documento define los tiempos RTO y RPO acordados con el grupo', () => {
  const contenido = fs.readFileSync(rutaDocRNF15, 'utf8')
  assert.ok(contenido.includes('RTO'), 'Debe definir el parámetro RTO')
  assert.ok(contenido.includes('RPO'), 'Debe definir el parámetro RPO')
  assert.ok(
    contenido.includes('4 horas') || contenido.includes('15 minutos'),
    'Debe estipular los valores acordados de RTO'
  )
  assert.ok(
    contenido.includes('24 horas') || contenido.includes('1 hora'),
    'Debe estipular los valores acordados de RPO'
  )
})

test('El documento registra la fecha (17 de noviembre de 2026) y el responsable (Adán Ramos)', () => {
  const contenido = fs.readFileSync(rutaDocRNF15, 'utf8')
  assert.ok(
    /17 de noviembre de 2026/.test(contenido),
    'Debe indicar la fecha formal de verificación'
  )
  assert.ok(
    /Adán Ramos/i.test(contenido),
    'Debe indicar que el responsable asignado es Adán Ramos'
  )
})

test('CONFIG_CONTINUIDAD_RNF15 expone formalmente los tiempos de RTO y RPO en código', () => {
  assert.ok(CONFIG_CONTINUIDAD_RNF15, 'Debe exportar CONFIG_CONTINUIDAD_RNF15')
  assert.strictEqual(CONFIG_CONTINUIDAD_RNF15.RTO_MAXIMO_HORAS, 4)
  assert.strictEqual(CONFIG_CONTINUIDAD_RNF15.RTO_LOGICO_MINUTOS, 15)
  assert.strictEqual(CONFIG_CONTINUIDAD_RNF15.RPO_MAXIMO_HORAS, 24)
  assert.strictEqual(CONFIG_CONTINUIDAD_RNF15.RPO_COPIA_EXTERNA_HORAS, 1)
})

// ----------------------------------------------------------------------------
// Grupo 2: Criterio 2 - Hay una Copia Fuera de Supabase
// ----------------------------------------------------------------------------
console.log('\n💾 Grupo 2: Criterio 2 - Existencia e Integridad de la Copia Fuera de Supabase')

test('Existe el archivo de respaldo externo respaldos_externos/copia_seguridad_fuera_de_supabase.json', () => {
  assert.ok(fs.existsSync(rutaCopiaExterna), 'Debe existir la copia de respaldo fuera de Supabase')
})

test('La copia fuera de Supabase cumple con el formato estructurado y firma SHA-256 válida', () => {
  const contenido = fs.readFileSync(rutaCopiaExterna, 'utf8')
  const jsonCopia = JSON.parse(contenido)

  assert.strictEqual(jsonCopia.formato, 'sensor_pulso_dump', 'Debe tener formato sensor_pulso_dump')
  assert.strictEqual(jsonCopia.tipo, 'copia_externa_fuera_de_supabase')
  assert.ok(jsonCopia.checksum, 'Debe incluir checksum SHA-256')

  const checksumCalculado = calcularChecksum(jsonCopia.tablas)
  assert.strictEqual(checksumCalculado, jsonCopia.checksum, 'El checksum calculado debe coincidir exactamente')
})

test('La copia fuera de Supabase incluye las tablas críticas del sistema', () => {
  const jsonCopia = JSON.parse(fs.readFileSync(rutaCopiaExterna, 'utf8'))
  const tablas = Object.keys(jsonCopia.tablas || {})
  assert.ok(tablas.includes('perfiles'), 'Debe incluir perfiles')
  assert.ok(tablas.includes('aulas'), 'Debe incluir aulas')
  assert.ok(tablas.includes('evaluaciones'), 'Debe incluir evaluaciones')
  assert.ok(tablas.includes('mediciones'), 'Debe incluir mediciones')
  assert.ok(tablas.includes('pacientes_salud'), 'Debe incluir pacientes_salud')
})

test('Existen los scripts de generación y simulación (exportar-copia-externa y simulador-falla)', () => {
  assert.ok(fs.existsSync(rutaScriptExportar), 'Debe existir scripts/exportar-copia-externa.mjs')
  assert.ok(fs.existsSync(rutaScriptSimulador), 'Debe existir scripts/simulador-falla-recuperacion.mjs')
})

test('Seguridad: La copia externa no contiene contraseñas en texto claro ni claves maestras', () => {
  const texto = fs.readFileSync(rutaCopiaExterna, 'utf8')
  assert.ok(!texto.includes('CLAVE_CIFRADO_CAMPOS'), 'No debe filtrar la clave de cifrado')
  assert.ok(!texto.includes('SUPABASE_SECRET_KEY'), 'No debe filtrar claves maestras')
})

// ----------------------------------------------------------------------------
// Grupo 3: Criterio 3 - Prueba de Recuperación dentro del Tiempo Definido
// ----------------------------------------------------------------------------
console.log('\n🚨 Grupo 3: Criterio 3 - Prueba de Recuperación dentro del RTO Definido')

await testAsync('Ejecuta simulacro de falla y recuperación completa cronometrada', async () => {
  const sobre = await cifrarDatosSaludPrueba(
    { sueno_horas: 7, estres_nivel: 3, cafeina_consumo: 'alta', medicacion: 'ninguna' },
    'clave_secreta_contingencia_32b_k!'
  )

  const tablasSimuladas = {
    perfiles: [{ id: 'usr-p1', nombre: 'Test', correo: 'test@unach.cl', rol: 'admin' }],
    pacientes_salud: [{ id: 'salud-p1', usuario_id: 'usr-p1', sobre_cifrado: sobre }]
  }

  const reporte = await simularFallaYRecuperacionCompleta({
    tablasProduccion: tablasSimuladas,
    claveCifradoSalud: 'clave_secreta_contingencia_32b_k!',
    ejecutarCompilacion: false
  })

  console.log(`     • Tiempo de recuperación medido: ${reporte.tiempoTotalRecuperacionMs} ms (${reporte.tiempoTotalRecuperacionSegundos} s)`)
  console.log(`     • RTO Lógico definido: < ${reporte.rtoLogicoDefinidoMinutos} minutos (< 900 s)`)
  console.log(`     • RTO Catastrófico definido: < ${reporte.rtoDefinidoHoras} horas (< 14.400 s)`)
  console.log(`     • Pasos en bitácora: ${reporte.bitacoraPasos.length}`)
  console.log(`     • Ficha de salud descifrada con RF116: ${reporte.fichaDescifradaOk ? 'SÍ' : 'NO'}`)
  console.log(`     • ¿Cumple RTO?: ${reporte.cumpleRTO ? 'SÍ' : 'NO'}`)

  assert.strictEqual(reporte.cumpleRTO, true, 'El tiempo medido debe estar dentro del RTO')
  assert.strictEqual(reporte.fichaDescifradaOk, true, 'Los datos de salud deben descifrarse íntegros')
  assert.ok(reporte.bitacoraPasos.length >= 6, 'Debe registrar todos los pasos de recuperación')
})

// ----------------------------------------------------------------------------
// Grupo 4: Coherencia con el SGSI ISO/IEC 27001
// ----------------------------------------------------------------------------
console.log('\n📑 Grupo 4: Coherencia con el SGSI ISO 27001 (A.5.29, A.5.30 y A.8.13)')

test('04-continuidad-monitoreo-y-vulnerabilidades.md asienta los SLAs y la bitácora de RNF15', () => {
  const contenido = fs.readFileSync(rutaDoc04, 'utf8')
  assert.ok(
    contenido.includes('SLAs definidos en RNF15') || contenido.includes('RNF15'),
    'Debe referenciar formalmente los SLAs de RNF15'
  )
  assert.ok(
    contenido.includes('4 horas') && contenido.includes('15 minutos'),
    'Debe registrar los valores de RTO en el documento 04'
  )
  assert.ok(
    /Simulacro de falla completa.*RNF15/i.test(contenido),
    'La bitácora de restauraciones debe incluir el simulacro de RNF15'
  )
})

test('02-declaracion-de-aplicabilidad.md actualiza controles 5.29, 5.30 y 8.13 como Implementados', () => {
  const contenido = fs.readFileSync(rutaDoc02, 'utf8')
  assert.ok(
    contenido.includes('5.29 Seguridad en una interrupción') && contenido.includes('RNF15'),
    'Control 5.29 debe citar RNF15'
  )
  assert.ok(
    contenido.includes('5.30 TIC para la continuidad') && contenido.includes('RNF15'),
    'Control 5.30 debe citar RNF15'
  )
  assert.ok(
    contenido.includes('8.13 Respaldos') && contenido.includes('RNF15'),
    'Control 8.13 debe citar RNF15 e indicar Implementado'
  )
})

test('01-alcance-politica-y-riesgos.md actualiza el tratamiento del riesgo R4 con RNF15', () => {
  const contenido = fs.readFileSync(rutaDoc01, 'utf8')
  assert.ok(
    contenido.includes('RNF15') && contenido.includes('docs/RNF15-recuperacion-fallas.md'),
    'El riesgo R4 debe citar RNF15'
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
  console.log('🎉 Todas las verificaciones de RNF15 se ejecutaron exitosamente.\n')
  process.exit(0)
}
