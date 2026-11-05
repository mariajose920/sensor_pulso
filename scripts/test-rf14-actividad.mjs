/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF14
 * Registrar la actividad o contexto (reposo, movimiento, etc.) y asociarlo a la medición.
 * ============================================================================
 */
import assert from 'node:assert'

// Mock para entorno Node sin navegador
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map()
  globalThis.localStorage = {
    getItem: (k) => store.get(k) ?? null,
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear()
  }
}

import {
  ACTIVIDADES_CANONICAS,
  obtenerActividadPorId,
  obtenerActividadPorCodigo,
  normalizarActividadId,
  obtenerNombreActividad
} from '../src/services/actividadesService.js'
import { obtenerRangosBpmEsperados } from '../src/services/bpmService.js'
import { construirMedicion, resumirParaHistorial } from '../src/utils/medicion.js'
import { pacienteService, OPCIONES_ACTIVIDAD } from '../src/services/pacienteService.js'

let passed = 0
let failed = 0

function it(desc, fn) {
  try {
    fn()
    console.log(`  ✅ [PASS] ${desc}`)
    passed++
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`)
    console.error(`     Error: ${err.message}`)
    failed++
  }
}

async function runTests() {
  console.log('================================================================')
  console.log('  sensor_pulso · Pruebas Automatizadas de RF14')
  console.log('  Registro de Actividad/Contexto y Asociación a la Medición')
  console.log('================================================================\n')

  // --------------------------------------------------------------------------
  console.log('▶ [Prueba 1] Verificación del Catálogo Canónico de Actividades...')
  // --------------------------------------------------------------------------
  it('El catálogo canónico define exactamente 6 actividades oficiales (IDs 1 al 6)', () => {
    assert.strictEqual(ACTIVIDADES_CANONICAS.length, 6)
    const ids = ACTIVIDADES_CANONICAS.map(a => a.id)
    assert.deepStrictEqual(ids, [1, 2, 3, 4, 5, 6])
  })

  it('Incluye reposo basal como actividad ID 1', () => {
    const act = obtenerActividadPorId(1)
    assert.strictEqual(act.codigo, 'reposo')
    assert.strictEqual(act.nombre, 'Reposo basal')
    assert.strictEqual(act.bpmEsperadoMin, 60)
    assert.strictEqual(act.bpmEsperadoMax, 100)
  })

  it('Incluye caminata como actividad ID 3', () => {
    const act = obtenerActividadPorId(3)
    assert.strictEqual(act.codigo, 'caminata')
    assert.strictEqual(act.nombre, 'Caminata leve')
  })

  it('Incluye ejercicio moderado (ID 4) y ejercicio intenso (ID 5)', () => {
    const mod = obtenerActividadPorId(4)
    const int = obtenerActividadPorId(5)
    assert.strictEqual(mod.codigo, 'ejercicio_moderado')
    assert.strictEqual(int.codigo, 'ejercicio_intenso')
  })

  it('Incluye fase de recuperación post-ejercicio como actividad ID 6', () => {
    const post = obtenerActividadPorId(6)
    assert.strictEqual(post.codigo, 'post_ejercicio')
    assert.strictEqual(post.nombre, 'Recuperación post-ejercicio')
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 2] Normalización y Resolución de IDs y Nombres...')
  // --------------------------------------------------------------------------
  it('Normaliza código string "reposo" al ID 1', () => {
    assert.strictEqual(normalizarActividadId('reposo'), 1)
  })

  it('Normaliza código string "caminata" al ID 3', () => {
    assert.strictEqual(normalizarActividadId('caminata'), 3)
  })

  it('Normaliza código string "ejercicio_moderado" al ID 4', () => {
    assert.strictEqual(normalizarActividadId('ejercicio_moderado'), 4)
  })

  it('Devuelve 1 por defecto ante valor nulo o no reconocido', () => {
    assert.strictEqual(normalizarActividadId(null), 1)
    assert.strictEqual(normalizarActividadId(undefined), 1)
    assert.strictEqual(normalizarActividadId('desconocido_xyz'), 1)
  })

  it('Obtiene nombre legible de la actividad según el ID o código', () => {
    assert.strictEqual(obtenerNombreActividad(1), 'Reposo basal')
    assert.strictEqual(obtenerNombreActividad('caminata'), 'Caminata leve')
    assert.strictEqual(obtenerNombreActividad(4), 'Ejercicio moderado')
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 3] Integración con Ficha del Paciente (RF03 / RF14)...')
  // --------------------------------------------------------------------------
  it('OPCIONES_ACTIVIDAD expone las actividades sincronizadas con el catálogo oficial', () => {
    assert.ok(OPCIONES_ACTIVIDAD.length >= 5)
    const ids = OPCIONES_ACTIVIDAD.map(o => o.actividadId)
    assert.ok(ids.includes(1))
    assert.ok(ids.includes(3))
    assert.ok(ids.includes(4))
  })

  it('pacienteService normaliza la actividad con ID y Nombre oficial', async () => {
    const res = await pacienteService.guardarDeclaracion({
      nombre: 'Participante Prueba RF14',
      edad: 24,
      nivelEstres: 'bajo',
      actividadPrevia: 'caminata'
    })
    assert.strictEqual(res.ok, true)
    assert.strictEqual(res.data.actividadId, 3)
    assert.strictEqual(res.data.actividadNombre, 'Caminata leve')
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 4] Vinculación en el Guardado de la Medición (RF14 / RF30)...')
  // --------------------------------------------------------------------------
  it('construirMedicion asigna actividad_id a la fila de la base de datos', () => {
    const res = construirMedicion({
      usuarioId: 'usr-unach-test-123',
      bpm: 76,
      spo2: 98,
      calidad: 'buena',
      actividadId: 3
    })
    assert.strictEqual(res.ok, true)
    assert.strictEqual(res.fila.actividad_id, 3)
  })

  it('construirMedicion acepta actividad_id de reposo (1)', () => {
    const res = construirMedicion({
      usuarioId: 'usr-unach-test-123',
      bpm: 72,
      spo2: 98,
      calidad: 'buena',
      actividadId: 1
    })
    assert.strictEqual(res.ok, true)
    assert.strictEqual(res.fila.actividad_id, 1)
  })

  it('resumirParaHistorial proyecta el nombre de la actividad asociada', () => {
    const resumen = resumirParaHistorial({
      id: 'med-123',
      inicio: new Date().toISOString(),
      fuente: 'sensor',
      canal: 1,
      bpm_promedio: 78,
      spo2_promedio: 98,
      calidad: 'buena',
      actividad: { nombre: 'Caminata leve' }
    })
    assert.strictEqual(resumen.actividad, 'Caminata leve')
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 5] Calibración de Rangos Fisiológicos de BPM por Contexto (RF14/RF19)...')
  // --------------------------------------------------------------------------
  it('Rango fisiológico de reposo es 60 - 100 BPM para adulto', () => {
    const rango = obtenerRangosBpmEsperados(25, 'reposo')
    assert.strictEqual(rango.min, 60)
    assert.strictEqual(rango.max, 100)
    assert.ok(rango.descripcion.includes('reposo'))
  })

  it('Rango fisiológico de caminata se calibra a 75 - 120 BPM', () => {
    const rango = obtenerRangosBpmEsperados(25, 'caminata')
    assert.strictEqual(rango.min, 75)
    assert.strictEqual(rango.max, 120)
    assert.ok(rango.descripcion.includes('Caminata'))
  })

  it('Rango fisiológico de ejercicio moderado se calibra a 90 - 150 BPM', () => {
    const rango = obtenerRangosBpmEsperados(25, 'ejercicio_moderado')
    assert.strictEqual(rango.min, 90)
    assert.strictEqual(rango.max, 150)
  })

  it('Rango fisiológico de ejercicio intenso se calibra a 120 - 185 BPM', () => {
    const rango = obtenerRangosBpmEsperados(25, 'ejercicio_intenso')
    assert.strictEqual(rango.min, 120)
    assert.strictEqual(rango.max, 185)
  })

  it('Rango fisiológico de recuperación post-ejercicio se calibra a 80 - 130 BPM', () => {
    const rango = obtenerRangosBpmEsperados(25, 'post_ejercicio')
    assert.strictEqual(rango.min, 80)
    assert.strictEqual(rango.max, 130)
  })

  // --------------------------------------------------------------------------
  console.log('----------------------------------------------------------------')
  if (failed === 0) {
    console.log(`🎉 TODAS LAS PRUEBAS DE RF14 PASARON SATISFACTORIAMENTE (${passed}/${passed})`)
  } else {
    console.log(`❌ ALGUNAS PRUEBAS FALLARON: ${failed} fallidas, ${passed} aprobadas.`)
    process.exit(1)
  }
  console.log('----------------------------------------------------------------\n')
}

runTests().catch(err => {
  console.error('Error fatal ejecutando pruebas:', err)
  process.exit(1)
})
