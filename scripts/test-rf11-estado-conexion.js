/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF11
 * Indicar el estado de conexión (activa, pérdida, finalizada)
 * ============================================================================
 */
import assert from 'node:assert'

// Mock de localStorage para entorno Node sin navegador
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
  ESTADOS_CONEXION,
  MOTIVOS_FIN,
  ETIQUETAS_ESTADO_CONEXION,
  COLORES_ESTADO_CONEXION,
  DESCRIPCIONES_ESTADO_CONEXION,
  sesionState,
  estadoConexionActual,
  esConexionActiva,
  esConexionPerdida,
  esConexionFinalizada,
  cambiarEstadoConexion,
  iniciarSesion,
  finalizarSesion
} from '../src/services/sesionMedicionService.js'

import { resumirParaHistorial } from '../src/utils/medicion.js'

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

async function itAsync(desc, fn) {
  try {
    await fn()
    console.log(`  ✅ [PASS] ${desc}`)
    passed++
  } catch (err) {
    console.error(`  ❌ [FAIL] ${desc}`)
    console.error(`     Error: ${err.message}`)
    failed++
  }
}

async function runTests() {
  console.log('='.repeat(78))
  console.log('TEST SUITE: RF11 - Indicar el estado de conexión (activa, perdida, finalizada)')
  console.log('='.repeat(78))

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 1] Constantes y Enum canónico de la base de datos (RF11)...')
  // --------------------------------------------------------------------------
  it('1.1 Define los 3 estados canónicos del enum público de Supabase + inactiva', () => {
    assert.strictEqual(ESTADOS_CONEXION.ACTIVA, 'activa')
    assert.strictEqual(ESTADOS_CONEXION.PERDIDA, 'perdida')
    assert.strictEqual(ESTADOS_CONEXION.FINALIZADA, 'finalizada')
    assert.strictEqual(ESTADOS_CONEXION.INACTIVA, 'inactiva')
  })

  it('1.2 Contiene etiquetas amigables en español para cada estado', () => {
    assert.strictEqual(ETIQUETAS_ESTADO_CONEXION.activa, 'Conexión Activa')
    assert.strictEqual(ETIQUETAS_ESTADO_CONEXION.perdida, 'Conexión Perdida')
    assert.strictEqual(ETIQUETAS_ESTADO_CONEXION.finalizada, 'Finalizada')
    assert.strictEqual(ETIQUETAS_ESTADO_CONEXION.inactiva, 'En Espera')
  })

  it('1.3 Provee paleta cromática completa (texto, bg, borde, punto) para badges', () => {
    assert.ok(COLORES_ESTADO_CONEXION.activa.punto)
    assert.ok(COLORES_ESTADO_CONEXION.perdida.punto)
    assert.ok(COLORES_ESTADO_CONEXION.finalizada.punto)
    assert.ok(COLORES_ESTADO_CONEXION.inactiva.punto)
  })

  it('1.4 Provee descripciones claras para accesibilidad y tooltip de ayuda', () => {
    assert(DESCRIPCIONES_ESTADO_CONEXION.activa.includes('estiramiento continuo') || DESCRIPCIONES_ESTADO_CONEXION.activa.includes('estable'))
    assert(DESCRIPCIONES_ESTADO_CONEXION.perdida.includes('Interrupción') || DESCRIPCIONES_ESTADO_CONEXION.perdida.includes('pérdida'))
    assert(DESCRIPCIONES_ESTADO_CONEXION.finalizada.includes('Medición') || DESCRIPCIONES_ESTADO_CONEXION.finalizada.includes('concluida'))
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 2] Helpers reactivos de estado de conexión...')
  // --------------------------------------------------------------------------
  it('2.1 Por defecto sin sesión activa reporta inactiva', () => {
    sesionState.sesionActiva = null
    assert.strictEqual(estadoConexionActual.value, ESTADOS_CONEXION.INACTIVA)
    assert.strictEqual(esConexionActiva.value, false)
    assert.strictEqual(esConexionPerdida.value, false)
    assert.strictEqual(esConexionFinalizada.value, false)
  })

  await itAsync('2.2 Al iniciar sesión pasa a estado ACTIVA', async () => {
    const sesion = await iniciarSesion({
      estudianteId: 'test-estudiante-rf11',
      canal: 2,
      tipo: 'automatica'
    })
    assert.ok(sesion)
    assert.strictEqual(estadoConexionActual.value, ESTADOS_CONEXION.ACTIVA)
    assert.strictEqual(esConexionActiva.value, true)
    assert.strictEqual(esConexionPerdida.value, false)
    assert.strictEqual(esConexionFinalizada.value, false)
  })

  await itAsync('2.3 cambiarEstadoConexion permite transicionar a PERDIDA', async () => {
    const res = await cambiarEstadoConexion(ESTADOS_CONEXION.PERDIDA, 'Interrupción de señal WiFi')
    assert.strictEqual(res.ok, true)
    assert.strictEqual(estadoConexionActual.value, ESTADOS_CONEXION.PERDIDA)
    assert.strictEqual(esConexionActiva.value, false)
    assert.strictEqual(esConexionPerdida.value, true)
    assert.strictEqual(esConexionFinalizada.value, false)
  })

  await itAsync('2.4 cambiarEstadoConexion permite recuperar a ACTIVA', async () => {
    const res = await cambiarEstadoConexion(ESTADOS_CONEXION.ACTIVA)
    assert.strictEqual(res.ok, true)
    assert.strictEqual(estadoConexionActual.value, ESTADOS_CONEXION.ACTIVA)
    assert.strictEqual(esConexionActiva.value, true)
    assert.strictEqual(esConexionPerdida.value, false)
  })

  await itAsync('2.5 finalizarSesion pasa a estado FINALIZADA con su respectivo motivo', async () => {
    const fin = await finalizarSesion(MOTIVOS_FIN.SENSOR_DESCONECTADO)
    assert.strictEqual(fin.ok, true)
    assert.strictEqual(estadoConexionActual.value, ESTADOS_CONEXION.FINALIZADA)
    assert.strictEqual(esConexionActiva.value, false)
    assert.strictEqual(esConexionPerdida.value, false)
    assert.strictEqual(esConexionFinalizada.value, true)
    assert.strictEqual(sesionState.sesionActiva.motivo_fin, MOTIVOS_FIN.SENSOR_DESCONECTADO)
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 3] Resumen para Historial (src/utils/medicion.js)...')
  // --------------------------------------------------------------------------
  it('3.1 resumirParaHistorial proyecta estadoConexion y motivoFin', () => {
    const m = {
      id: 'med-001',
      estudiante_id: 'est-123',
      bpm: 75,
      spo2: 98,
      estado_conexion: 'perdida',
      motivo_fin: 'perdida_comunicacion',
      created_at: new Date().toISOString()
    }
    const resumen = resumirParaHistorial(m)
    assert.strictEqual(resumen.estadoConexion, 'perdida')
    assert.strictEqual(resumen.motivoFin, 'perdida_comunicacion')
  })

  it('3.2 resumirParaHistorial asigna "finalizada" como fallback por defecto si no viene', () => {
    const m = {
      id: 'med-002',
      bpm: 80,
      spo2: 97,
      created_at: new Date().toISOString()
    }
    const resumen = resumirParaHistorial(m)
    assert.strictEqual(resumen.estadoConexion, 'finalizada')
    assert.strictEqual(resumen.motivoFin, null)
  })

  // --------------------------------------------------------------------------
  console.log('\n' + '='.repeat(78))
  console.log(`Pruebas RF11: ${passed} pasadas, ${failed} fallidas`)
  console.log('='.repeat(78))

  if (failed > 0) {
    process.exit(1)
  } else {
    process.exit(0)
  }
}

runTests().catch((err) => {
  console.error('Fatal error en suite RF11:', err)
  process.exit(1)
})
