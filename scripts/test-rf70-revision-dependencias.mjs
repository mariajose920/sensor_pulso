#!/usr/bin/env node
/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF70
 * Revisión de Dependencias Vulnerables y Lista Pre-despliegue
 * ============================================================================
 * Criterios de Aceptación:
 *   1. Un PR con una dependencia vulnerable grave falla la revisión (CI).
 *   2. Existe la lista corta de revisión antes del despliegue.
 *   3. Los avisos actuales están resueltos o justificados.
 * ============================================================================
 */

import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

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

console.log('\n============================================================')
console.log('🧪 Iniciando Pruebas Automatizadas de RF70: Revisión Dependencias')
console.log('============================================================\n')

// ----------------------------------------------------------------------------
// Grupo 1: Integración Continua (validar.yml)
// ----------------------------------------------------------------------------
console.log('📦 Grupo 1: Configuración de CI en GitHub Actions (.github/workflows/validar.yml)')

test('El archivo .github/workflows/validar.yml existe', () => {
  const rutaWorkflow = path.join(ROOT, '.github', 'workflows', 'validar.yml')
  assert.ok(fs.existsSync(rutaWorkflow), 'El archivo validar.yml debe existir')
})

test('validar.yml incluye el job o paso de auditoría con npm audit --audit-level=high', () => {
  const rutaWorkflow = path.join(ROOT, '.github', 'workflows', 'validar.yml')
  const contenido = fs.readFileSync(rutaWorkflow, 'utf8')
  assert.ok(
    /npm\s+audit\s+--audit-level=high/.test(contenido),
    'El workflow debe contener la instrucción "npm audit --audit-level=high"'
  )
  assert.ok(
    contenido.includes('auditoria-dependencias') || contenido.includes('RF70'),
    'El workflow debe identificar el paso o job de auditoría de dependencias (RF70)'
  )
})

test('validar.yml se ejecuta en pull_request hacia develop y main', () => {
  const rutaWorkflow = path.join(ROOT, '.github', 'workflows', 'validar.yml')
  const contenido = fs.readFileSync(rutaWorkflow, 'utf8')
  assert.ok(contenido.includes('pull_request'), 'El workflow debe escuchar eventos pull_request')
  assert.ok(contenido.includes('develop'), 'El workflow debe monitorear la rama develop')
})

// ----------------------------------------------------------------------------
// Grupo 2: Ejecución de Auditoría y Estado de Dependencias
// ----------------------------------------------------------------------------
console.log('\n🔒 Grupo 2: Estado de Seguridad de Dependencias (npm audit)')

test('npm audit --audit-level=high no reporta vulnerabilidades altas ni críticas', () => {
  try {
    execSync('npm audit --audit-level=high', { cwd: ROOT, stdio: 'pipe' })
  } catch (err) {
    const salida = err.stdout ? err.stdout.toString() : err.message
    assert.fail(`npm audit --audit-level=high falló indicando vulnerabilidades graves:\n${salida}`)
  }
})

test('npm audit --omit=dev reporta 0 vulnerabilidades en dependencias de producción', () => {
  try {
    const salida = execSync('npm audit --omit=dev --json', { cwd: ROOT, stdio: 'pipe' }).toString()
    const json = JSON.parse(salida)
    const numVulns = json.metadata?.vulnerabilities?.total ?? 0
    assert.strictEqual(numVulns, 0, `Las dependencias de producción deben tener 0 vulnerabilidades (reportadas: ${numVulns})`)
  } catch (err) {
    // Si npm audit sale con código distinto de 0 pero reporta json
    if (err.stdout) {
      try {
        const json = JSON.parse(err.stdout.toString())
        const numVulns = json.metadata?.vulnerabilities?.total ?? 0
        assert.strictEqual(numVulns, 0, `Las dependencias de producción tienen vulnerabilidades: ${numVulns}`)
      } catch {
        assert.fail(`Error al verificar dependencias de producción: ${err.message}`)
      }
    } else {
      assert.fail(`Error al ejecutar npm audit --omit=dev: ${err.message}`)
    }
  }
})

test('package.json incluye scripts auditar:dependencias y test:rf70', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
  assert.ok(pkg.scripts['auditar:dependencias'], 'Debe existir el script auditar:dependencias')
  assert.ok(pkg.scripts['test:rf70'], 'Debe existir el script test:rf70')
})

// ----------------------------------------------------------------------------
// Grupo 3: Lista de Revisión Pre-despliegue y Justificación de Avisos
// ----------------------------------------------------------------------------
console.log('\n📋 Grupo 3: Lista Corta Pre-Despliegue y Documentación (docs/RF70-revision-dependencias.md)')

test('Existe el documento docs/RF70-revision-dependencias.md', () => {
  const rutaDoc = path.join(ROOT, 'docs', 'RF70-revision-dependencias.md')
  assert.ok(fs.existsSync(rutaDoc), 'El archivo docs/RF70-revision-dependencias.md debe existir')
})

test('El documento incluye la lista corta de revisión antes de desplegar', () => {
  const rutaDoc = path.join(ROOT, 'docs', 'RF70-revision-dependencias.md')
  const contenido = fs.readFileSync(rutaDoc, 'utf8')
  assert.ok(
    /Lista (corta|pre-despliegue|de revisi[oó]n antes de desplegar)/i.test(contenido),
    'El documento debe contener la lista de revisión antes de desplegar'
  )
  assert.ok(contenido.includes('npm audit'), 'La lista debe incluir la verificación con npm audit')
  assert.ok(contenido.includes('npm run build'), 'La lista debe incluir la compilación')
})

test('El documento incluye la tabla de resolución y justificación de dependencias', () => {
  const rutaDoc = path.join(ROOT, 'docs', 'RF70-revision-dependencias.md')
  const contenido = fs.readFileSync(rutaDoc, 'utf8')
  assert.ok(contenido.includes('puppeteer-core'), 'El documento debe mencionar la actualización de puppeteer-core')
  assert.ok(/justifica|anÃ¡lisis|riesgo/i.test(contenido), 'El documento debe incluir la justificación técnica de avisos')
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
  console.error('❌ Algunas pruebas de RF70 fallaron.\n')
  process.exit(1)
} else {
  console.log('🎉 Todas las pruebas de RF70 pasaron exitosamente.\n')
  process.exit(0)
}
