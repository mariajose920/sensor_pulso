/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF117
 * Requerimiento: Visibilidad del profesor sobre evaluaciones de su aula
 * - Ve de cada estudiante solo: nombre, respuestas, calificación, nivel y mediciones.
 * - NUNCA ve los datos declarados cifrados del RF116.
 * - Las estadísticas del panel se calculan sobre datos no cifrados o agregados.
 * - Al eliminar a un estudiante del aula (RF102), el profesor pierde ese acceso.
 * ============================================================================
 */

import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

// Mock para entorno Node sin browser
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => store.get(k) || null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  }
}
if (typeof globalThis.window === 'undefined') {
  globalThis.window = { localStorage: globalThis.localStorage }
}

import {
  obtenerIntentosEvaluacionAula,
  obtenerEstadisticasEvaluacionAula,
  retirarEstudiantesAula,
  obtenerEstudiantesAula
} from '../src/services/aulasService.js'

let passed = 0
let failed = 0

function it(description, fn) {
  try {
    fn()
    console.log(`[PASS] ${description}`)
    passed++
  } catch (err) {
    console.error(`[FAIL] ${description}`)
    console.error(`       Error: ${err.message}`)
    failed++
  }
}

async function itAsync(description, fn) {
  try {
    await fn()
    console.log(`[PASS] ${description}`)
    passed++
  } catch (err) {
    console.error(`[FAIL] ${description}`)
    console.error(`       Error: ${err.message}`)
    failed++
  }
}

console.log('======================================================================')
console.log('EJECUTANDO SUITE DE PRUEBAS RF117: VISIBILIDAD DEL PROFESOR EN AULA')
console.log('======================================================================\n')

// ----------------------------------------------------------------------------
// PILAR 1: VISIBILIDAD ACADÉMICA Y DE MEDICIONES ASIGNADAS
// ----------------------------------------------------------------------------
console.log('--- 1. Visibilidad Académica de Estudiantes Activos en Evaluación ---')

await itAsync('Profesor ve nombre, calificación, porcentaje y nivel de logro de cada estudiante', async () => {
  const res = await obtenerIntentosEvaluacionAula('aula-001', 'eval-001')
  assert.strictEqual(res.success, true)
  assert.ok(res.data.length >= 1, 'Debe retornar intentos de estudiantes del aula')

  const primerIntento = res.data[0]
  assert.ok(typeof primerIntento.estudiante_nombre === 'string' && primerIntento.estudiante_nombre.length > 0)
  assert.ok(typeof primerIntento.puntaje === 'number')
  assert.ok(typeof primerIntento.porcentaje === 'number')
  assert.ok(['logrado', 'medianamente_logrado', 'no_logrado'].includes(primerIntento.nivel))
})

await itAsync('Profesor ve las respuestas entregadas en la evaluación asignada', async () => {
  const res = await obtenerIntentosEvaluacionAula('aula-001', 'eval-001')
  const primerIntento = res.data[0]
  assert.ok(Array.isArray(primerIntento.respuestas), 'Debe incluir lista de respuestas')
  assert.ok(primerIntento.respuestas.length > 0, 'Debe tener preguntas respondidas')

  const resp = primerIntento.respuestas[0]
  assert.ok(resp.pregunta && typeof resp.pregunta === 'string')
  assert.ok(resp.respuesta && typeof resp.respuesta === 'string')
  assert.ok(typeof resp.es_correcta === 'boolean')
  assert.ok(typeof resp.puntaje === 'number')
})

await itAsync('Profesor ve las mediciones fisiológicas asignadas a la evaluación (BPM, SpO2, señal)', async () => {
  const res = await obtenerIntentosEvaluacionAula('aula-001', 'eval-001')
  const intentoConMedicion = res.data.find(i => i.medicion)
  assert.ok(intentoConMedicion, 'Debe haber al menos un intento con medición asignada')

  const med = intentoConMedicion.medicion
  assert.ok(typeof med.bpm === 'number' && med.bpm > 0, 'BPM debe ser numérico positivo')
  assert.ok(typeof med.spo2 === 'number' && med.spo2 > 0, 'SpO2 debe ser numérico positivo')
  assert.ok(Array.isArray(med.muestrasPpg) || med.bpm, 'Debe contar con datos de onda PPG o frecuencia')
})

// ----------------------------------------------------------------------------
// PILAR 2: BLINDAJE CRIPTOGRÁFICO DE SALUD (CERO ACCESO A DATOS RF116)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Blindaje de Privacidad: Cero Acceso a Datos de Salud RF116 ---')

await itAsync('El profesor NUNCA recibe datos cifrados ni factores de salud declarados del RF116', async () => {
  const res = await obtenerIntentosEvaluacionAula('aula-001', 'eval-001')

  for (const intento of res.data) {
    // Prohibido estrictamente exponer datos_cifrados o campos personales de salud
    assert.strictEqual(intento.datos_cifrados, undefined, 'datos_cifrados no debe existir en la vista docente')
    assert.strictEqual(intento.condicionSalud, undefined, 'condicionSalud no debe existir en la vista docente')
    assert.strictEqual(intento.medicacion, undefined, 'medicacion no debe existir en la vista docente')
    assert.strictEqual(intento.sueno, undefined, 'sueno no debe existir en la vista docente')
    assert.strictEqual(intento.cafeina, undefined, 'cafeina no debe existir en la vista docente')
    assert.strictEqual(intento.estres, undefined, 'estres no debe existir en la vista docente')
  }
})

// ----------------------------------------------------------------------------
// PILAR 3: ESTADÍSTICAS AGREGADAS DEL AULA (SIN IDENTIFICAR A LA PERSONA)
// ----------------------------------------------------------------------------
console.log('\n--- 3. Métricas Agregadas del Aula sin Identificación Personal ---')

await itAsync('Calcula promedio de notas, distribución de logro y promedios grupales de BPM y SpO2', async () => {
  const res = await obtenerEstadisticasEvaluacionAula('aula-001', 'eval-001')
  assert.strictEqual(res.success, true)

  const stats = res.data
  assert.ok(typeof stats.promedioCalificacion === 'number', 'Promedio de calificación debe ser numérico')
  assert.ok(typeof stats.tasaAprobacion === 'number', 'Tasa de aprobación debe ser numérica')
  assert.ok(typeof stats.distribucionNiveles === 'object', 'Distribución de niveles debe ser un objeto')
  assert.ok(typeof stats.distribucionNiveles.logrado === 'number')
  assert.ok(typeof stats.distribucionNiveles.medianamente_logrado === 'number')

  assert.ok(typeof stats.promedioBpm === 'number' && stats.promedioBpm > 0, 'Promedio grupal de BPM debe ser positivo')
  assert.ok(typeof stats.promedioSpo2 === 'number' && stats.promedioSpo2 > 0, 'Promedio grupal de SpO2 debe ser positivo')
})

// ----------------------------------------------------------------------------
// PILAR 4: PÉRDIDA INMEDIATA DE ACCESO AL RETIRAR ESTUDIANTE DEL AULA (RF102)
// ----------------------------------------------------------------------------
console.log('\n--- 4. Pérdida Inmediata de Acceso al Retirar Estudiante del Aula (RF102) ---')

await itAsync('Al retirar a un estudiante del aula (RF102), el profesor pierde todo acceso a sus intentos', async () => {
  const idMatias = '00000000-0000-0000-0000-000000000004'

  // 1. Verificar que inicialmente estaba presente
  const inicial = await obtenerIntentosEvaluacionAula('aula-001', 'eval-001')
  const estabaPresente = inicial.data.some(i => i.usuario_id === idMatias)
  assert.strictEqual(estabaPresente, true, 'Matías debe estar presente antes de ser retirado')

  // 2. Ejecutar retiro del aula con RF102
  const retiroRes = await retirarEstudiantesAula({
    aulaId: 'aula-001',
    estudiantesIds: [idMatias],
    profesorId: '00000000-0000-0000-0000-000000000001',
    esAdmin: true
  })
  assert.strictEqual(retiroRes.success, true)

  // 3. Consultar nuevamente los intentos del aula
  const despuesRetiro = await obtenerIntentosEvaluacionAula('aula-001', 'eval-001')
  const siguePresente = despuesRetiro.data.some(i => i.usuario_id === idMatias)
  assert.strictEqual(siguePresente, false, 'El estudiante retirado debe desaparecer de la vista docente (RF117)')
})

// ----------------------------------------------------------------------------
// PILAR 5: AUDITORÍA DE CERO EMOJIS EN CÓDIGO DEL REQUERIMIENTO
// ----------------------------------------------------------------------------
console.log('\n--- 5. Auditoría de CERO EMOJIS en Código de RF117 ---')

const EMOJI_REGEX = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}]/u

const archivosAuditados = [
  'src/services/aulasService.js',
  'src/views/AulaDetalleView.vue'
]

for (const relPath of archivosAuditados) {
  it(`Archivo libre de emojis: ${relPath}`, () => {
    const fullPath = path.resolve(relPath)
    assert.ok(fs.existsSync(fullPath), `El archivo debe existir: ${relPath}`)
    const contenido = fs.readFileSync(fullPath, 'utf8')
    const match = contenido.match(EMOJI_REGEX)
    assert.strictEqual(match, null, `Se encontró un emoji prohibido en ${relPath}: ${match ? match[0] : ''}`)
  })
}

// ----------------------------------------------------------------------------
// RESUMEN FINAL
// ----------------------------------------------------------------------------
console.log('\n======================================================================')
console.log(`RESULTADO DE LA SUITE RF117: ${passed} APROBADAS / ${failed} FALLADAS`)
console.log('======================================================================')

if (failed > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
