#!/usr/bin/env node
/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF69
 * Manejo Seguro de Secretos y Escáner de Repositorio e Historial
 * ============================================================================
 * Criterios de Aceptación:
 *   1. No hay claves en el código ni en el historial nuevo.
 *   2. Las variables de entorno sensibles no se guardan en el repositorio.
 *   3. El escáner detecta y bloquea cualquier intento de commit con secretos.
 * ============================================================================
 */

import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  ARCHIVOS_PROHIBIDOS,
  PATRONES_SECRETOS,
  escanearTexto,
  escanearArchivos,
  escanearRepositorio,
  escanearHistorial
} from './revisar-secretos.mjs'

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

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF69')
console.log('  Manejo de Secretos y Escáner de Repositorio e Historial')
console.log('================================================================')

// ----------------------------------------------------------------------------
// 1. DETECCIÓN DE ARCHIVOS PROHIBIDOS DE ENTORNO Y LLAVES
// ----------------------------------------------------------------------------
console.log('\n--- 1. Detección de Archivos Prohibidos de Entorno y Llaves ---')

test('Archivos: Detecta y rechaza archivo .env raíz y en subdirectorios', () => {
  assert(ARCHIVOS_PROHIBIDOS.some(r => r.test('.env')), 'Debe detectar .env')
  assert(ARCHIVOS_PROHIBIDOS.some(r => r.test('config/.env')), 'Debe detectar config/.env')
})

test('Archivos: Detecta y rechaza variantes .env.local, .env.production y .env.staging', () => {
  assert(ARCHIVOS_PROHIBIDOS.some(r => r.test('.env.local')), 'Debe detectar .env.local')
  assert(ARCHIVOS_PROHIBIDOS.some(r => r.test('.env.production')), 'Debe detectar .env.production')
  assert(ARCHIVOS_PROHIBIDOS.some(r => r.test('.env.staging')), 'Debe detectar .env.staging')
})

test('Archivos: Permite explícitamente la plantilla de ejemplo .env.example', () => {
  assert(!ARCHIVOS_PROHIBIDOS.some(r => r.test('.env.example')), '.env.example no debe ser prohibido')
})

test('Archivos: Detecta y rechaza llaves privadas y certificados (.pem, .key, .p12, .crt)', () => {
  assert(ARCHIVOS_PROHIBIDOS.some(r => r.test('server.pem')), 'Debe detectar .pem')
  assert(ARCHIVOS_PROHIBIDOS.some(r => r.test('certs/private.key')), 'Debe detectar .key')
  assert(ARCHIVOS_PROHIBIDOS.some(r => r.test('cert.p12')), 'Debe detectar .p12')
  assert(ARCHIVOS_PROHIBIDOS.some(r => r.test('cert.crt')), 'Debe detectar .crt')
  assert(ARCHIVOS_PROHIBIDOS.some(r => r.test('id_rsa')), 'Debe detectar id_rsa')
  assert(ARCHIVOS_PROHIBIDOS.some(r => r.test('id_ed25519')), 'Debe detectar id_ed25519')
})

test('Archivos: Detecta y rechaza archivos JSON con credenciales de servicios en la nube', () => {
  assert(ARCHIVOS_PROHIBIDOS.some(r => r.test('credentials.json')), 'Debe detectar credentials.json')
  assert(ARCHIVOS_PROHIBIDOS.some(r => r.test('service-account.json')), 'Debe detectar service-account.json')
  assert(ARCHIVOS_PROHIBIDOS.some(r => r.test('client_secret_google.json')), 'Debe detectar client_secret*.json')
})

// ----------------------------------------------------------------------------
// 2. DETECCIÓN DE PATRONES DE SECRETOS EN CONTENIDO
// ----------------------------------------------------------------------------
console.log('\n--- 2. Detección de Patrones de Secretos en Contenido ---')

test('Patrones: Detecta clave secreta de Supabase (sb_secret_...)', () => {
  // Construido por partes para evitar falso positivo estático del escáner en este archivo de test
  const claveSintetica = ['sb_', 'secret_', 'ABCDefgh1234567890_XYZ'].join('')
  const hallazgos = escanearTexto(`const key = "${claveSintetica}"`, 'test.js')
  assert(hallazgos.some(h => h.regla === 'supabase_secret'), 'Debe detectar sb_secret_...')
})

test('Patrones: Detecta cabecera de llave privada criptográfica', () => {
  const bloqueLlave = ['-----BEGIN ', 'RSA ', 'PRIVATE KEY-----', '\nContenido...\n', '-----END RSA PRIVATE KEY-----'].join('')
  const hallazgos = escanearTexto(bloqueLlave, 'test.js')
  assert(hallazgos.some(h => h.regla === 'llave_privada'), 'Debe detectar BEGIN PRIVATE KEY')
})

test('Patrones: Detecta JSON Web Tokens (JWT) de tres segmentos', () => {
  const jwtSintetico = ['eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9', 'eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ', 'sflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c'].join('.')
  const hallazgos = escanearTexto(`const token = "${jwtSintetico}"`, 'test.js')
  assert(hallazgos.some(h => h.regla === 'jwt_secreto'), 'Debe detectar JWT sospechoso')
})

test('Patrones: Detecta API Key de Resend (re_...)', () => {
  const resendSintetica = ['re_', '1234567890abcdef12345678'].join('')
  const hallazgos = escanearTexto(`const apiKey = "${resendSintetica}"`, 'test.js')
  assert(hallazgos.some(h => h.regla === 'resend_api_key'), 'Debe detectar clave de Resend')
})

test('Patrones: Ignora placeholder de Resend permitido en .env.example', () => {
  const hallazgos = escanearTexto('RESEND_API_KEY=re_tu_clave_de_resend_aqui', '.env.example')
  assert.strictEqual(hallazgos.length, 0, 'No debe alertar con el placeholder documentado de ejemplo')
})

test('Patrones: Detecta asignación de variable sensible de entorno con valor real', () => {
  const asignacion = ['SUPABASE_SECRET_', 'KEY=clave_secreta_real_en_claro_12345'].join('')
  const hallazgos = escanearTexto(asignacion, 'config.js')
  assert(hallazgos.some(h => h.regla === 'variable_secreta_asignada'), 'Debe detectar variable sensible con valor real')
})

test('Patrones: Detecta variable secreta con prefijo público prohibido VITE_', () => {
  const viteVariable = ['VITE_', 'SUPABASE_SECRET_KEY'].join('')
  const hallazgos = escanearTexto(`export const url = process.env.${viteVariable}`, 'api.js')
  assert(hallazgos.some(h => h.regla === 'prefijo_vite_prohibido'), 'Debe prohibir prefijo VITE_ en variables secretas')
})

test('Patrones: Detecta token personal de GitHub (ghp_... o github_pat_...)', () => {
  const ghpToken = ['ghp_', '123456789012345678901234567890123456'].join('')
  const hallazgos = escanearTexto(`const token = "${ghpToken}"`, 'ci.js')
  assert(hallazgos.some(h => h.regla === 'github_token'), 'Debe detectar token de GitHub')
})

test('Patrones: Detecta credencial de AWS (AKIA...)', () => {
  const awsKey = ['AKIA', 'IOSFODNN7EXAMPLE'].join('')
  const hallazgos = escanearTexto(`const aws = "${awsKey}"`, 's3.js')
  assert(hallazgos.some(h => h.regla === 'aws_access_key'), 'Debe detectar Access Key de AWS')
})

test('Patrones: Permite claves publicables inocuas de Supabase (sb_publishable_...)', () => {
  const pubKey = 'sb_publishable_CD_KR_pwQQQ1e_HR2aQemw_mNjM2_ml'
  const hallazgos = escanearTexto(`const pub = "${pubKey}"`, 'supabase.js')
  assert.strictEqual(hallazgos.length, 0, 'Clave publishable no es secreta y no debe alertar')
})

// ----------------------------------------------------------------------------
// 3. CRITERIO DE ACEPTACIÓN 1: NO HAY CLAVES EN EL CÓDIGO ACTUAL
// ----------------------------------------------------------------------------
console.log('\n--- 3. Criterio de Aceptación 1: No hay Claves en el Código del Repositorio ---')

test('Criterio 1: Escaneo completo del repositorio actual reporta 0 secretos', () => {
  const problemas = escanearRepositorio()
  if (problemas.length > 0) {
    console.error('     Problemas encontrados:', problemas)
  }
  assert.strictEqual(problemas.length, 0, `El repositorio contiene ${problemas.length} secreto(s) no permitido(s)`)
})

test('Criterio 1: .env.example no contiene claves reales ni secretos en claro', () => {
  const envExamplePath = path.join(ROOT, '.env.example')
  assert(fs.existsSync(envExamplePath), '.env.example debe existir')
  const contenido = fs.readFileSync(envExamplePath, 'utf8')
  assert(contenido.includes('SUPABASE_SECRET_KEY='), 'SUPABASE_SECRET_KEY debe estar vacía')
  assert(contenido.includes('CLAVE_CIFRADO_CAMPOS='), 'CLAVE_CIFRADO_CAMPOS debe estar vacía')
  assert(!contenido.includes('sb_secret_'), 'No debe contener sb_secret_')
  assert(!contenido.includes('-----BEGIN PRIVATE KEY-----'), 'No debe contener llaves privadas')
})

test('Criterio 1: Los servicios de api/ y src/services/ no tienen secretos hardcodeados', () => {
  const archivosVerificar = [
    'src/services/supabase.js',
    'src/services/cifradoService.js',
    'src/services/emailService.js',
    'api/esp32/telemetria.js',
    'api/invitaciones/enviar.js',
    'api/declaraciones/cifrar.js',
    'api/declaraciones/descifrar.js',
    'api/derechos/exportar.js'
  ]

  for (const archivo of archivosVerificar) {
    const rutaCompleta = path.join(ROOT, archivo)
    if (fs.existsSync(rutaCompleta)) {
      const contenido = fs.readFileSync(rutaCompleta, 'utf8')
      const hallazgos = escanearTexto(contenido, archivo)
      assert.strictEqual(hallazgos.length, 0, `Archivo ${archivo} tiene hallazgos de secretos`)
    }
  }
})

// ----------------------------------------------------------------------------
// 4. CRITERIO DE ACEPTACIÓN 2: NO HAY CLAVES EN EL HISTORIAL NUEVO
// ----------------------------------------------------------------------------
console.log('\n--- 4. Criterio de Aceptación 2: No hay Claves en el Historial Nuevo ---')

test('Criterio 2: Escaneo de los últimos 20 commits del historial reporta 0 secretos', () => {
  const problemasHistorial = escanearHistorial({ cantidad: 20 })
  if (problemasHistorial.length > 0) {
    console.error('     Problemas en historial:', problemasHistorial)
  }
  assert.strictEqual(problemasHistorial.length, 0, `El historial reciente contiene ${problemasHistorial.length} secreto(s)`)
})

// ----------------------------------------------------------------------------
// 5. CONFIGURACIÓN DE SEGURIDAD (.gitignore, HOOKS Y CI)
// ----------------------------------------------------------------------------
console.log('\n--- 5. Configuración de Seguridad (.gitignore, Hooks y CI) ---')

test('.gitignore: Bloquea archivos .env, certificados y llaves privadas', () => {
  const gitignorePath = path.join(ROOT, '.gitignore')
  const gitignore = fs.readFileSync(gitignorePath, 'utf8')
  assert(gitignore.includes('.env'), 'Debe ignorar .env')
  assert(gitignore.includes('*.pem'), 'Debe ignorar *.pem')
  assert(gitignore.includes('*.key'), 'Debe ignorar *.key')
  assert(gitignore.includes('*.p12'), 'Debe ignorar *.p12')
  assert(gitignore.includes('id_rsa'), 'Debe ignorar id_rsa')
})

test('Segregación Cliente/Servidor: api/invitaciones/enviar.js no lee variables VITE_', () => {
  const rutaEnviar = path.join(ROOT, 'api/invitaciones/enviar.js')
  const contenido = fs.readFileSync(rutaEnviar, 'utf8')
  const correo = fs.readFileSync(path.join(ROOT, 'api/_lib/correo.js'), 'utf8')
  assert(!contenido.includes('VITE_GMAIL') && !correo.includes('VITE_GMAIL'), 'No debe usar variables GMAIL con prefijo VITE_')
  assert(correo.includes('process.env.GMAIL_APP_PASSWORD') && correo.includes('process.env.GMAIL_USER'), 'Debe usar las variables de servidor GMAIL_USER y GMAIL_APP_PASSWORD')
})

test('Pre-commit Hook: Ejecuta activamente scripts/revisar-secretos.mjs', () => {
  const hookPath = path.join(ROOT, '.githooks/pre-commit')
  assert(fs.existsSync(hookPath), 'Hook pre-commit debe existir')
  const contenido = fs.readFileSync(hookPath, 'utf8')
  assert(contenido.includes('revisar-secretos.mjs'), 'pre-commit debe invocar revisar-secretos.mjs')
})

test('GitHub Actions CI: .github/workflows/validar.yml incluye escáner de secretos', () => {
  const workflowPath = path.join(ROOT, '.github/workflows/validar.yml')
  assert(fs.existsSync(workflowPath), 'Workflow validar.yml debe existir')
  const contenido = fs.readFileSync(workflowPath, 'utf8')
  assert(contenido.includes('revisar-secretos.mjs'), 'CI debe ejecutar revisar-secretos.mjs')
})

// ----------------------------------------------------------------------------
// RESUMEN FINAL
// ----------------------------------------------------------------------------
console.log('\n================================================================')
console.log(`  RESUMEN DE PRUEBAS RF69:`)
console.log(`  Total: ${totalPruebas} | Pasadas: ${pruebasPasadas} | Falladas: ${pruebasFalladas}`)
console.log('================================================================\n')

if (pruebasFalladas > 0) {
  process.exit(1)
}
