#!/usr/bin/env node
/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RNF13
 * Credenciales de administración con MFA en Supabase y Vercel (sin compartir)
 * ============================================================================
 * Criterios de Aceptación:
 *   1. Cada cuenta con acceso tiene MFA activo.
 *   2. No hay cuentas compartidas.
 *   3. El documento indica fecha y responsable.
 * ============================================================================
 */

import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'
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
console.log('🔐 Iniciando Pruebas Automatizadas de RNF13: MFA en Supabase y Vercel')
console.log('============================================================\n')

const rutaDocRNF13 = path.join(ROOT, 'docs', 'RNF13-mfa-supabase-vercel.md')
const rutaDoc01 = path.join(ROOT, 'docs', 'iso27001', '01-alcance-politica-y-riesgos.md')
const rutaDoc02 = path.join(ROOT, 'docs', 'iso27001', '02-declaracion-de-aplicabilidad.md')
const rutaDoc05 = path.join(ROOT, 'docs', 'iso27001', '05-proveedores.md')

// ----------------------------------------------------------------------------
// Grupo 1: Existencia e Integridad del Documento RNF13
// ----------------------------------------------------------------------------
console.log('📄 Grupo 1: Existencia e Integridad del Documento RNF13')

test('El documento docs/RNF13-mfa-supabase-vercel.md existe y no está vacío', () => {
  assert.ok(fs.existsSync(rutaDocRNF13), 'El archivo docs/RNF13-mfa-supabase-vercel.md debe existir')
  const stats = fs.statSync(rutaDocRNF13)
  assert.ok(stats.size > 500, 'El documento debe contener la justificación y evidencias completas')
})

test('El documento identifica explícitamente el requerimiento RNF13', () => {
  const contenido = fs.readFileSync(rutaDocRNF13, 'utf8')
  assert.ok(contenido.includes('RNF13'), 'Debe citar la clave RNF13')
  assert.ok(
    contenido.includes('Las credenciales de administración de Supabase y Vercel usan MFA y no se comparten'),
    'Debe contener la descripción textual del requerimiento'
  )
})

// ----------------------------------------------------------------------------
// Grupo 2: Criterio 1 - Cada cuenta con acceso tiene MFA activo
// ----------------------------------------------------------------------------
console.log('\n🛡️ Grupo 2: Criterio 1 - Cada cuenta con acceso tiene MFA activo')

test('Se especifica matriz de cuentas para Supabase y Vercel con MFA activo al 100%', () => {
  const contenido = fs.readFileSync(rutaDocRNF13, 'utf8')
  assert.ok(contenido.includes('Supabase'), 'Debe auditar accesos en Supabase')
  assert.ok(contenido.includes('Vercel'), 'Debe auditar accesos en Vercel')
  
  // Verificar que la matriz contiene estados activos
  const ocurrenciasActivo = (contenido.match(/\*\*Activo\*\*/g) || []).length
  assert.ok(ocurrenciasActivo >= 5, 'Cada una de las cuentas listadas debe marcar estado **Activo**')

  // Verificar métodos válidos de MFA
  assert.ok(contenido.includes('TOTP'), 'Debe especificar TOTP (Authenticator App) como factor')
})

test('Incluye esquema de evidencia de configuración de MFA para ambas plataformas', () => {
  const contenido = fs.readFileSync(rutaDocRNF13, 'utf8')
  assert.ok(contenido.includes('Multi-Factor Authentication'), 'Debe incluir verificación de MFA')
  assert.ok(contenido.includes('Two-Factor Authentication'), 'Debe incluir verificación de 2FA en Vercel')
})

// ----------------------------------------------------------------------------
// Grupo 3: Criterio 2 - No hay cuentas compartidas
// ----------------------------------------------------------------------------
console.log('\n👥 Grupo 3: Criterio 2 - Política de Cero Cuentas Compartidas')

test('Establece prohibición expresa de cuentas compartidas o genéricas', () => {
  const contenido = fs.readFileSync(rutaDocRNF13, 'utf8')
  assert.ok(
    /prohibición.*cuentas\s+genéricas/i.test(contenido) || contenido.includes('Cero Cuentas Compartidas'),
    'Debe estipular la prohibición de cuentas genéricas o compartidas'
  )
  assert.ok(
    contenido.includes('No (Individual)') || contenido.includes('individual'),
    'Debe certificar que cada cuenta es nominativa e individual'
  )
})

test('Garantiza no repudio y trazabilidad individual de acciones administrativas', () => {
  const contenido = fs.readFileSync(rutaDocRNF13, 'utf8')
  assert.ok(
    contenido.includes('no repudio') || contenido.includes('Trazabilidad'),
    'Debe fundamentar la trazabilidad o no repudio'
  )
})

// ----------------------------------------------------------------------------
// Grupo 4: Criterio 3 - Fecha y Responsable
// ----------------------------------------------------------------------------
console.log('\n📅 Grupo 4: Criterio 3 - Indicación de Fecha y Responsable')

test('El documento RNF13 explicita el Responsable asignado (Adán)', () => {
  const contenido = fs.readFileSync(rutaDocRNF13, 'utf8')
  assert.ok(
    /Responsable:?\s*\*?\*?\s*Adán/i.test(contenido),
    'Debe indicar formalmente que el responsable es Adán'
  )
})

test('El documento RNF13 explicita la Fecha de verificación', () => {
  const contenido = fs.readFileSync(rutaDocRNF13, 'utf8')
  assert.ok(
    /17 de noviembre de 2026/i.test(contenido),
    'Debe indicar la fecha de verificación (17 de noviembre de 2026)'
  )
})

test('Tabla de criterios de aceptación valida el cumplimiento de los 3 criterios', () => {
  const contenido = fs.readFileSync(rutaDocRNF13, 'utf8')
  assert.ok(
    contenido.includes('1. Cada cuenta con acceso tiene MFA activo'),
    'Debe listar el criterio 1 en la tabla final'
  )
  assert.ok(
    contenido.includes('2. No hay cuentas compartidas'),
    'Debe listar el criterio 2 en la tabla final'
  )
  assert.ok(
    contenido.includes('3. El documento indica fecha y responsable'),
    'Debe listar el criterio 3 en la tabla final'
  )
})

// ----------------------------------------------------------------------------
// Grupo 5: Coherencia y Actualización del SGSI ISO 27001
// ----------------------------------------------------------------------------
console.log('\n📑 Grupo 5: Coherencia con la Documentación ISO 27001')

test('01-alcance-politica-y-riesgos.md actualiza el tratamiento del riesgo R3 y objetivo de MFA', () => {
  const contenido01 = fs.readFileSync(rutaDoc01, 'utf8')
  assert.ok(
    contenido01.includes('RNF13') && contenido01.includes('docs/RNF13-mfa-supabase-vercel.md'),
    '01-alcance-politica-y-riesgos.md debe referenciar RNF13 en el tratamiento de riesgo o metas'
  )
})

test('02-declaracion-de-aplicabilidad.md actualiza controles 8.2 y 8.5 a Implementado con RNF13', () => {
  const contenido02 = fs.readFileSync(rutaDoc02, 'utf8')
  assert.ok(
    contenido02.includes('8.2 Accesos privilegiados') && contenido02.includes('RNF13'),
    'El control 8.2 debe reflejar la implementación de MFA mediante RNF13'
  )
  assert.ok(
    contenido02.includes('8.5 Autenticación segura') && contenido02.includes('RNF13'),
    'El control 8.5 debe reflejar autenticación segura implementada con RNF13'
  )
})

test('05-proveedores.md registra la activación de MFA y revisión de Adán Ramos', () => {
  const contenido05 = fs.readFileSync(rutaDoc05, 'utf8')
  assert.ok(
    contenido05.includes('☑ (RNF13)'),
    '05-proveedores.md debe marcar como chequeado el ítem de MFA para Supabase y Vercel'
  )
  assert.ok(
    contenido05.includes('Adán Ramos') && contenido05.includes('2026-11-17'),
    '05-proveedores.md debe registrar el cambio de Adán Ramos con fecha 2026-11-17'
  )
})

// ----------------------------------------------------------------------------
// Grupo 6: Prevención de Fuga de Secretos
// ----------------------------------------------------------------------------
console.log('\n🔒 Grupo 6: Prevención de Fuga de Secretos en la Documentación')

test('El documento RNF13 no expone contraseñas, tokens reales ni semillas TOTP', () => {
  const contenido = fs.readFileSync(rutaDocRNF13, 'utf8')
  const patronSecreto = /eyJ[a-zA-Z0-9_-]{20,}|otpauth:\/\/|sbp_[a-zA-Z0-9]{20,}/
  assert.ok(
    !patronSecreto.test(contenido),
    'El documento no debe contener JWTs reales, URLs de semilla TOTP ni API tokens de proveedor'
  )
})

// ----------------------------------------------------------------------------
// Resumen
// ----------------------------------------------------------------------------
console.log('\n============================================================')
console.log(`📊 Total: ${totalPruebas} | Pasadas: ${pruebasPasadas} | Falladas: ${pruebasFalladas}`)
console.log('============================================================\n')

if (pruebasFalladas > 0) {
  process.exit(1)
} else {
  console.log('🎉 Todas las verificaciones de RNF13 se ejecutaron exitosamente.\n')
  process.exit(0)
}
