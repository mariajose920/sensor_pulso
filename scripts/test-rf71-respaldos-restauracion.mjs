#!/usr/bin/env node

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  generarCopiaSeguridad,
  restaurarCopiaSeguridad,
  verificarIntegridadRestauracion,
  probarDescifradoFichaSalud,
  cifrarDatosSaludPrueba,
  calcularChecksum
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
    console.error(`     Error: ${err.message}`)
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
    console.error(`     Error: ${err.message}`)
  }
}

console.log('\n============================================================')
console.log('🧪 Iniciando Pruebas Automatizadas de RF71: Respaldos y Restauración')
console.log('============================================================\n')

// ----------------------------------------------------------------------------
// Grupo 1: Criterio 1 - Documentación de Dónde, Cuándo y Cómo se Hacen las Copias
// ----------------------------------------------------------------------------
console.log('📋 Grupo 1: Criterio 1 - Documentación ISO 27001 y RF71')

const rutaIso27001 = path.join(ROOT, 'docs', 'iso27001', '04-continuidad-monitoreo-y-vulnerabilidades.md')
const contenidoIso = fs.readFileSync(rutaIso27001, 'utf8')

test('docs/iso27001/04-...md documenta la política de copias (dónde, cuándo y cómo)', () => {
  assert.ok(fs.existsSync(rutaIso27001), 'El documento ISO 27001 debe existir')
  assert.ok(
    contenidoIso.includes('Supabase') && contenidoIso.includes('Diaria'),
    'Debe documentar la frecuencia diaria de los respaldos de Supabase'
  )
  assert.ok(
    contenidoIso.includes('7 días'),
    'Debe documentar el período de retención del plan'
  )
  assert.ok(
    contenidoIso.includes('Copia adicional fuera de Supabase'),
    'Debe documentar la estrategia de copia independiente'
  )
})

test('docs/iso27001/04-...md registra la prueba de restauración con resultado y tiempo', () => {
  assert.ok(
    contenidoIso.includes('2026-11-16') &&
    contenidoIso.includes('Adán Ramos') &&
    contenidoIso.includes('Exitoso'),
    'La bitácora de restauración debe registrar fecha, responsable y resultado exitoso'
  )
  assert.ok(
    /tiempo/i.test(contenidoIso) && /(segundos|ms)/i.test(contenidoIso),
    'La bitácora debe anotar el tiempo medido de la prueba de restauración'
  )
})

test('Existe el documento oficial docs/RF71-respaldos-restauracion.md', () => {
  const rutaRf71Doc = path.join(ROOT, 'docs', 'RF71-respaldos-restauracion.md')
  assert.ok(fs.existsSync(rutaRf71Doc), 'El documento docs/RF71-respaldos-restauracion.md debe existir')
  const contenidoRf71 = fs.readFileSync(rutaRf71Doc, 'utf8')
  assert.ok(contenidoRf71.includes('RF71'), 'Debe titular el requerimiento RF71')
  assert.ok(contenidoRf71.includes('A.8.13'), 'Debe citar el control ISO 27001 A.8.13')
  assert.ok(contenidoRf71.includes('RPO') && contenidoRf71.includes('RTO'), 'Debe definir los objetivos RPO y RTO')
})

// ----------------------------------------------------------------------------
// Grupo 2: Criterio 3 - Lo no confirmado queda explícitamente como pendiente
// ----------------------------------------------------------------------------
console.log('\n⏳ Grupo 2: Criterio 3 - Lo no confirmado queda como pendiente')

test('Criterio 3: Custodia institucional de claves queda documentada como "Pendiente"', () => {
  assert.ok(
    contenidoIso.includes('Pendiente de decisión institucional') ||
    contenidoIso.includes('designación nominal de los dos custodios'),
    'El documento ISO 27001 debe dejar pendiente la designación formal de custodios UNACH'
  )

  const rutaRf71Doc = path.join(ROOT, 'docs', 'RF71-respaldos-restauracion.md')
  const contenidoRf71 = fs.readFileSync(rutaRf71Doc, 'utf8')
  assert.ok(
    /pendiente/i.test(contenidoRf71),
    'El documento RF71 debe señalar explícitamente las decisiones humanas pendientes'
  )
})

// ----------------------------------------------------------------------------
// Grupo 3: Criterio 2 - Prueba de Restauración en Entorno de Pruebas
// ----------------------------------------------------------------------------
console.log('\n🔄 Grupo 3: Criterio 2 - Simulación y Verificación de Restauración')

const CLAVE_PRUEBA_RF116 = 'clave_secreta_para_pruebas_rf116_2026'

await testAsync('Criterio 2: Se genera respaldo con checksum y se restaura íntegro en entorno de pruebas', async () => {
  // 1. Preparar ficha de salud cifrada con RF116
  const sobreSaludCifrado = await cifrarDatosSaludPrueba({
    horasSueno: 7.5,
    estresNivel: 'bajo',
    consumoCafeina: false,
    medicacion: 'Ninguna'
  }, CLAVE_PRUEBA_RF116)

  // 2. Base de datos origen (simulando estado real en producción)
  const baseOrigen = {
    perfiles: [
      { id: 'usr-1', nombre: 'Adán Ramos', correo: 'adanramos@alu.unach.cl', rol: 'admin' },
      { id: 'usr-2', nombre: 'María Docente', correo: 'maria@unach.cl', rol: 'profesor' },
      { id: 'usr-3', nombre: 'Estudiante Prueba', correo: 'alumno@unach.cl', rol: 'estudiante' }
    ],
    aulas: [
      { id: 'aula-1', nombre: 'Fisiología Cardíaca 2026', codigo: 'CARDIO-1', profesor_id: 'usr-2' }
    ],
    evaluaciones: [
      { id: 'eval-1', aula_id: 'aula-1', titulo: 'Control 1: Pulso y SpO2', modo: 'en_vivo', estado: 'en_curso' }
    ],
    mediciones: [
      { id: 'med-1', usuario_id: 'usr-3', bpm: 72, spo2: 98, dentro_de_rango: true, creado_en: '2026-11-16T12:00:00Z' }
    ],
    declaraciones_salud: [
      { id: 'salud-1', usuario_id: 'usr-3', datos_cifrados: sobreSaludCifrado, version_clave: 1 }
    ],
    auditoria: [
      { id: 'aud-1', accion: 'login', actor_id: 'usr-1', sospechoso: false, ocurrio_en: '2026-11-16T11:59:00Z' }
    ]
  }

  // 3. Generar copia de seguridad (Dump)
  const dump = generarCopiaSeguridad(baseOrigen, {
    origen: 'sensor_pulso_prod',
    tipo: 'simulacro_rf71'
  })

  assert.ok(dump.checksum, 'El dump debe incluir checksum SHA-256')
  assert.strictEqual(dump.resumenConteo.perfiles, 3)
  assert.strictEqual(dump.resumenConteo.mediciones, 1)
  assert.strictEqual(dump.resumenConteo.declaraciones_salud, 1)

  // 4. Restaurar en un entorno de pruebas completamente nuevo
  const baseDestinoPruebas = {}
  const resultadoRestauracion = await restaurarCopiaSeguridad(dump, baseDestinoPruebas)

  assert.strictEqual(resultadoRestauracion.exito, true, 'La restauración debe ser exitosa')
  assert.ok(
    resultadoRestauracion.tiempoMs >= 0 && resultadoRestauracion.tiempoMs < 5000,
    `El tiempo de restauración debe ser inmediato (RTO comprobado: ${resultadoRestauracion.tiempoMs} ms)`
  )
  console.log(`     • Tiempo de restauración medido (RTO): ${resultadoRestauracion.tiempoMs} ms`)

  // 5. Verificar que los datos coinciden al 100% (Criterio 2)
  const verificacion = verificarIntegridadRestauracion(baseOrigen, baseDestinoPruebas)
  assert.strictEqual(
    verificacion.coinciden,
    true,
    `Los datos deben coincidir sin discrepancias. Errores: ${verificacion.discrepancias.join(', ')}`
  )
  assert.strictEqual(verificacion.discrepancias.length, 0)
  assert.strictEqual(baseDestinoPruebas.perfiles.length, 3)
  assert.strictEqual(baseDestinoPruebas.mediciones[0].bpm, 72)

  // 6. Dependencia RF116: Probar descifrado de la ficha de salud tras restauración
  const registroRestaurado = baseDestinoPruebas.declaraciones_salud[0]
  const pruebaDescifrado = await probarDescifradoFichaSalud(
    registroRestaurado.datos_cifrados,
    CLAVE_PRUEBA_RF116
  )

  assert.strictEqual(pruebaDescifrado.exito, true, 'La ficha de salud restaurada debe descifrarse correctamente')
  assert.strictEqual(pruebaDescifrado.datosDescifrados.horasSueno, 7.5)
  assert.strictEqual(pruebaDescifrado.datosDescifrados.estresNivel, 'bajo')
  assert.strictEqual(pruebaDescifrado.datosDescifrados.consumoCafeina, false)
  console.log('     • Descifrado RF116 post-restauración: 100% exitoso')
})

test('Seguridad: Si el dump de respaldo es manipulado, la restauración es rechazada', async () => {
  const baseOrigen = { perfiles: [{ id: 'usr-1', nombre: 'Original' }] }
  const dump = generarCopiaSeguridad(baseOrigen)

  // Simular manipulación o corrupción del archivo de respaldo
  dump.tablas.perfiles[0].nombre = 'Atacante Modificado'

  const baseDestino = {}
  await assert.rejects(
    async () => {
      await restaurarCopiaSeguridad(dump, baseDestino)
    },
    /Fallo de integridad/i,
    'Debe rechazar la restauración si el checksum no coincide'
  )
})

test('package.json incluye el comando de prueba test:rf71', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.ok(pkg.scripts['test:rf71'], 'package.json debe registrar el script "test:rf71"')
})

// ----------------------------------------------------------------------------
// Resumen
// ----------------------------------------------------------------------------
console.log('\n------------------------------------------------------------')
console.log(`Pruebas completadas: ${totalPruebas}`)
console.log(`  Pasadas:  ${pruebasPasadas}`)
console.log(`  Falladas: ${pruebasFalladas}`)
console.log('------------------------------------------------------------\n')

if (pruebasFalladas > 0) {
  console.error('❌ Algunas pruebas de RF71 fallaron.\n')
  process.exit(1)
} else {
  console.log('🎉 Todas las pruebas de RF71 pasaron exitosamente.\n')
  process.exit(0)
}
