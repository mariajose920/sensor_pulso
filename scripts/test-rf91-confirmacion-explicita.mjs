/**
 * Suite de Pruebas Automatizadas — RF91:
 * "Ninguna medición se publica sin una confirmación adicional y explícita del titular."
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  MENSAJES_TERMINAR,
  clasificarErrorPublicacion,
  mensajeErrorPublicacion,
  mensajeErrorHistorial,
  formatearFechaConfirmacionTitular,
  validarConfirmacionExplicitaTitular
} from '../src/utils/terminarMedicion.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const rootDir = path.resolve(__dirname, '..')

let passed = 0
let failed = 0

function test(nombre, fn) {
  try {
    fn()
    passed++
    console.log(`[PASS] ${nombre}`)
  } catch (err) {
    failed++
    console.error(`[FAIL] ${nombre}`)
    console.error(`       Detalle: ${err.message}`)
  }
}

console.log('======================================================================')
console.log('EJECUTANDO SUITE DE PRUEBAS RF91: CONFIRMACION EXPLICITA DEL TITULAR')
console.log('======================================================================\n')

console.log('--- 1. Validación de Confirmación Explícita del Titular (Lógica de Dominio) ---')

test('Rechaza publicar cuando la casilla de confirmación explícita NO está marcada (false, null, undefined)', () => {
  const sinMarcar = validarConfirmacionExplicitaTitular({
    confirmado: false,
    titularCorreo: 'javiera.rail@alu.unach.cl'
  })
  assert.equal(sinMarcar.puedePublicar, false)
  assert.equal(sinMarcar.confirmado, false)
  assert.equal(sinMarcar.codigo, 'falta_confirmacion')
  assert.equal(sinMarcar.mensaje, MENSAJES_TERMINAR.publicar_falta_confirmacion)

  assert.equal(validarConfirmacionExplicitaTitular({ confirmado: null }).puedePublicar, false)
  assert.equal(validarConfirmacionExplicitaTitular({}).puedePublicar, false)
})

test('Aprueba publicar únicamente cuando confirmado === true y registra titular y marca temporal', () => {
  const fechaFija = new Date('2026-11-11T16:30:00Z')
  const confirmada = validarConfirmacionExplicitaTitular({
    confirmado: true,
    titularCorreo: 'javiera.rail@alu.unach.cl',
    fechaConfirmacion: fechaFija
  })
  assert.equal(confirmada.puedePublicar, true)
  assert.equal(confirmada.confirmado, true)
  assert.equal(confirmada.codigo, 'confirmacion_verificada')
  assert.equal(confirmada.titular, 'javiera.rail@alu.unach.cl')
  assert.ok(confirmada.fechaIso.startsWith('2026-11-11'))
  assert.ok(confirmada.fechaTexto.endsWith('hrs'))
})

test('Clasifica errores de falta de confirmación explícita desde el servidor / RPC', () => {
  const motivo = clasificarErrorPublicacion({
    message: 'Falta la confirmación explícita del titular',
    code: '22023'
  })
  assert.equal(motivo, 'falta_confirmacion')
  assert.ok(mensajeErrorPublicacion('falta_confirmacion').includes('confirmación adicional y explícita'))
  assert.ok(mensajeErrorHistorial('falta_confirmacion', 'publicar').includes('confirmación adicional y explícita'))
})

console.log('\n--- 2. Capa de Servicio y Base de Datos (Bloqueo sin Confirmación) ---')

test('medicionesService.js exige confirmarExplicito === true en publicarMedicion y registrarPublicacionAnonimaLocal', () => {
  const servicioCode = fs.readFileSync(path.join(rootDir, 'src/services/medicionesService.js'), 'utf8')
  assert.ok(servicioCode.includes('if (confirmarExplicito !== true)'))
  assert.ok(servicioCode.includes("motivo: 'falta_confirmacion'"))
  assert.ok(servicioCode.includes('if (confirmacionExplicita !== true) return null'))
  assert.ok(servicioCode.includes('export function retirarPublicacionAnonimaLocal'))
})

test('La migración SQL de Supabase exige p_confirmar = true y guarda confirmada_en', () => {
  const migCode = fs.readFileSync(
    path.join(rootDir, 'supabase/migrations/20261027000600_comparacion_galeria_aprendizaje.sql'),
    'utf8'
  )
  assert.ok(migCode.includes('if not coalesce(p_confirmar, false) then'))
  assert.ok(migCode.includes("raise exception 'Falta la confirmación explícita del titular'"))
  assert.ok(migCode.includes('confirmada_en'))
})

console.log('\n--- 3. Componente ConfirmacionExplicitaTitular.vue y Vistas de Publicación ---')

test('ConfirmacionExplicitaTitular.vue implementa ambos estados (bloqueado por defecto y verificado con titular)', () => {
  const compCode = fs.readFileSync(path.join(rootDir, 'src/components/ConfirmacionExplicitaTitular.vue'), 'utf8')
  assert.ok(compCode.includes('Confirmación Adicional y Explícita del Titular'))
  assert.ok(compCode.includes('Protección del Titular · Privada por Defecto'))
  assert.ok(compCode.includes('Confirmación Registrada'))
  assert.ok(compCode.includes('Confirmo de forma explícita y voluntaria como titular de esta medición'))
  assert.ok(compCode.includes('Ninguna medición se publica automáticamente.'))
  assert.ok(compCode.includes('Confirmación explícita verificada'))

  const templateMatch = compCode.match(/<template>([\s\S]*?)<\/template>/)
  const templateSinComentarios = templateMatch ? templateMatch[1].replace(/<!--[\s\S]*?-->/g, '') : ''
  assert.equal(/RF\d+/i.test(templateSinComentarios), false, 'No debe haber siglas RF visibles en ConfirmacionExplicitaTitular.vue')
})

test('MedicionView.vue, PublicarDesdeHistorialModal.vue y TerminarMedicionModal.vue integran ConfirmacionExplicitaTitular y bloquean el botón hasta confirmar', () => {
  const medicionCode = fs.readFileSync(path.join(rootDir, 'src/views/MedicionView.vue'), 'utf8')
  const historialModalCode = fs.readFileSync(path.join(rootDir, 'src/components/PublicarDesdeHistorialModal.vue'), 'utf8')
  const terminarModalCode = fs.readFileSync(path.join(rootDir, 'src/components/TerminarMedicionModal.vue'), 'utf8')

  assert.ok(medicionCode.includes('<ConfirmacionExplicitaTitular'))
  assert.ok(medicionCode.includes('Confirmar y Publicar de Forma Anónima (Bloqueado)'))
  assert.ok(medicionCode.includes(':disabled="publicandoPaso5 || !confirmacionExplicitaPaso5"'))
  assert.ok(medicionCode.includes('Retirar Publicación Ahora'))

  assert.ok(historialModalCode.includes('<ConfirmacionExplicitaTitular'))
  assert.ok(historialModalCode.includes(':disabled="trabajando || !autoriza"'))

  assert.ok(terminarModalCode.includes('<ConfirmacionExplicitaTitular'))
  assert.ok(terminarModalCode.includes('!confirmacionTitularModal'))
})

console.log('\n--- 4. Auditoría de CERO EMOJIS en Módulos de RF91 ---')

const filesToCheck = [
  'src/utils/terminarMedicion.js',
  'src/services/medicionesService.js',
  'src/components/ConfirmacionExplicitaTitular.vue',
  'src/components/PublicarDesdeHistorialModal.vue',
  'src/components/TerminarMedicionModal.vue',
  'src/views/MedicionView.vue',
  'scripts/test-rf91-confirmacion-explicita.mjs'
]

const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}]/u

for (const relPath of filesToCheck) {
  test(`Archivo sin emojis gráficos: ${relPath}`, () => {
    const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8')
    assert.equal(emojiRegex.test(content), false, `Se detectó un emoji prohibido en ${relPath}`)
  })
}

console.log('\n======================================================================')
console.log(`RESULTADO DE LA SUITE RF91: ${passed} APROBADAS / ${failed} FALLADAS`)
console.log('======================================================================')

if (failed > 0) {
  process.exit(1)
}
