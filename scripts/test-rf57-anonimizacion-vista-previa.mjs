/**
 * Suite de Pruebas Automatizadas — RF57:
 * "Al publicar una medición, se anonimizan nombre y datos identificativos;
 *  el usuario ve una vista previa antes de confirmar."
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  rangoDeEdad,
  armarRegistroTerminado,
  vistaPreviaPublica,
  vistaPreviaSinDatosIdentificables,
  construirTransformacionPrivacidad,
  generarCurvaPpgVistaPrevia
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
console.log('EJECUTANDO SUITE DE PRUEBAS RF57: ANONIMIZACION Y VISTA PREVIA')
console.log('======================================================================\n')

console.log('--- 1. Anonimización de Nombre y Datos Identificativos ---')

const registroReal = armarRegistroTerminado({
  canal: 1,
  paciente: {
    nombre: 'Javiera Belén Rail Astudillo',
    edad: 21,
    actividad: 'reposo',
    declaracionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  },
  metricas: {
    bpm: 76,
    spo2: 98,
    hrv: { sdnn: 42, rmssd: 36 },
    ritmo: { clase: 'normal', explicacion: 'Ritmo sinusal regular' },
    ruido: { nivel: 'buena', causas: [] }
  },
  fuente: 'sensor'
})

test('Vista previa refleja los datos reales tomados en la medición (BPM, SpO2, ritmo, calidad, actividad)', () => {
  const vista = vistaPreviaPublica(registroReal)
  assert.ok(vista.tarjeta, 'Debe incluir el objeto tarjeta para la vista previa visual')
  assert.equal(vista.tarjeta.bpmTexto, '76 BPM')
  assert.equal(vista.tarjeta.spo2Texto, '98 %')
  assert.equal(vista.tarjeta.rangoEdad, '18-24 años')
  assert.equal(vista.tarjeta.actividad, 'Reposo')
  assert.equal(vista.tarjeta.calidad, 'Buena')
  assert.equal(vista.tarjeta.insignia, 'Pública · Anónima')
  assert.equal(vista.tarjeta.autor, 'Participante UNACH (Anónimo)')
})

test('Vista previa elimina por completo el nombre real, edad exacta e ID de ficha del paciente', () => {
  const vista = vistaPreviaPublica(registroReal)
  assert.equal(vistaPreviaSinDatosIdentificables(vista, 'Javiera Belén Rail Astudillo'), true)
  assert.equal(vistaPreviaSinDatosIdentificables(vista, 'Javiera'), true)
  const serializado = JSON.stringify(vista)
  assert.ok(!serializado.includes('Javiera'), 'No debe aparecer el nombre en ningún campo de la vista previa')
  assert.ok(!serializado.includes('21'), 'No debe aparecer la edad exacta (21) sino el rango (18-24)')
  assert.ok(!serializado.includes('f47ac10b'), 'No debe aparecer el ID de la ficha privada')
})

test('Transformación de privacidad detalla cómo se anonimiza cada dato identificativo antes de confirmar', () => {
  const filas = construirTransformacionPrivacidad({
    nombre: 'Javiera Rail Astudillo',
    correo: 'javiera.rail@alu.unach.cl',
    edad: 21,
    declaracionId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479'
  })
  assert.equal(filas.length, 4)
  const filaNombre = filas.find(f => f.clave === 'nombre')
  const filaCorreo = filas.find(f => f.clave === 'correo')
  const filaEdad = filas.find(f => f.clave === 'edad')
  const filaFicha = filas.find(f => f.clave === 'ficha')

  assert.equal(filaNombre.estadoBadge, 'Eliminado')
  assert.equal(filaNombre.valorPublico, 'Participante UNACH (Anónimo)')
  assert.equal(filaCorreo.estadoBadge, 'Oculto (No se envía)')
  assert.equal(filaEdad.estadoBadge, 'Agrupado en Rango: 18-24 años')
  assert.equal(filaFicha.estadoBadge, 'Desvinculado permanentemente')
})

test('Generador de curva PPG de vista previa construye un trazado SVG válido acorde al BPM medido', () => {
  const curva = generarCurvaPpgVistaPrevia(76)
  assert.ok(curva.linea.startsWith('M 0,'))
  assert.ok(curva.area.endsWith('Z'))
  assert.equal(curva.ancho, 360)
  assert.equal(curva.alto, 54)
})

console.log('\n--- 2. Integración de Vista Previa antes de Confirmar en Componentes ---')

test('VistaPreviaAnonimizacion.vue presenta las 2 columnas (Transformación y Tarjeta Pública) sin siglas RF visibles', () => {
  const compCode = fs.readFileSync(path.join(rootDir, 'src/components/VistaPreviaAnonimizacion.vue'), 'utf8')
  assert.ok(compCode.includes('1. Transformación de Privacidad'))
  assert.ok(compCode.includes('2. Vista Previa Exacta antes de Confirmar'))
  assert.ok(compCode.includes('data-testid="tarjeta-vista-previa-publica"'))
  assert.ok(compCode.includes('Ningún dato personal ni tu nombre aparecerán asociados a este registro.'))

  const templateMatch = compCode.match(/<template>([\s\S]*?)<\/template>/)
  const templateSinComentarios = templateMatch ? templateMatch[1].replace(/<!--[\s\S]*?-->/g, '') : ''
  assert.equal(/RF\d+/i.test(templateSinComentarios), false, 'No debe haber etiquetas RF visibles en VistaPreviaAnonimizacion.vue')
})

test('TerminarMedicionModal, PublicarDesdeHistorialModal y MedicionView muestran la vista previa antes de confirmar', () => {
  const terminarCode = fs.readFileSync(path.join(rootDir, 'src/components/TerminarMedicionModal.vue'), 'utf8')
  const historialCode = fs.readFileSync(path.join(rootDir, 'src/components/PublicarDesdeHistorialModal.vue'), 'utf8')
  const medicionCode = fs.readFileSync(path.join(rootDir, 'src/views/MedicionView.vue'), 'utf8')

  assert.ok(terminarCode.includes('<VistaPreviaAnonimizacion'))
  assert.ok(historialCode.includes('<VistaPreviaAnonimizacion'))
  assert.ok(medicionCode.includes('<VistaPreviaAnonimizacion'))
  assert.ok(medicionCode.includes('Vista Previa de Anonimización antes de Confirmar Publicación'))
  assert.ok(medicionCode.includes('Confirmar y Publicar de Forma Anónima'))
  assert.ok(medicionCode.includes('Cancelar / Solo guardar en privado'))
})

console.log('\n--- 3. Auditoría de CERO EMOJIS en Módulos de RF57 ---')

const filesToCheck = [
  'src/utils/terminarMedicion.js',
  'src/components/VistaPreviaAnonimizacion.vue',
  'src/components/TerminarMedicionModal.vue',
  'src/components/PublicarDesdeHistorialModal.vue',
  'src/views/MedicionView.vue',
  'scripts/test-rf57-anonimizacion-vista-previa.mjs'
]

const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{1FA00}-\u{1FAFF}]/u

for (const relPath of filesToCheck) {
  test(`Archivo sin emojis gráficos: ${relPath}`, () => {
    const content = fs.readFileSync(path.join(rootDir, relPath), 'utf8')
    assert.equal(emojiRegex.test(content), false, `Se detectó un emoji prohibido en ${relPath}`)
  })
}

console.log('\n======================================================================')
console.log(`RESULTADO DE LA SUITE RF57: ${passed} APROBADAS / ${failed} FALLADAS`)
console.log('======================================================================')

if (failed > 0) {
  process.exit(1)
}
