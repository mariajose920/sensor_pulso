/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF10
 * Finalizar la medición al perder la comunicación o desconectar el sensor
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
  iniciarSesion,
  finalizarSesion,
  sesionState,
  estaSesionActiva
} from '../src/services/sesionMedicionService.js'

import {
  vigilanteState,
  UMBRALES_VIGILANTE,
  evaluarSensorDesconectado,
  cicloVerificacionVigilante,
  forzarSimulacionPerdidaWiFi,
  forzarSimulacionSensorDesconectado,
  cancelarSimulacion,
  descartarAlertaModal
} from '../src/services/vigilanteConexionService.js'

import { esp32State } from '../src/services/esp32Service.js'

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
  console.log('================================================================')
  console.log('  sensor_pulso · Pruebas Automatizadas de RF10')
  console.log('  Finalizar Medición por Pérdida de Comunicación o Sensor')
  console.log('================================================================\n')

  globalThis.localStorage.clear()

  // --------------------------------------------------------------------------
  console.log('▶ [Prueba 1] Verificación de Motivos y Umbrales Canónicos (RF10)...')
  // --------------------------------------------------------------------------
  it('Define los motivos oficiales de cierre: perdida_comunicacion y sensor_desconectado', () => {
    assert.strictEqual(MOTIVOS_FIN.PERDIDA_COMUNICACION, 'perdida_comunicacion')
    assert.strictEqual(MOTIVOS_FIN.SENSOR_DESCONECTADO, 'sensor_desconectado')
    assert.strictEqual(MOTIVOS_FIN.USUARIO, 'usuario')
  })

  it('Define umbrales clínicos de tolerancia: 10s para WiFi y 8s para sensor', () => {
    assert.strictEqual(UMBRALES_VIGILANTE.TIMEOUT_COMUNICACION_MS, 10000)
    assert.strictEqual(UMBRALES_VIGILANTE.TIMEOUT_SENSOR_MS, 8000)
    assert.strictEqual(UMBRALES_VIGILANTE.GRACIA_RECONEXION_MS, 5000)
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 2] Criterios de Detección de Sensor Óptico Desconectado...')
  // --------------------------------------------------------------------------
  it('Detecta desconexión si canal tiene flag sensor_conectado = false', () => {
    assert.strictEqual(evaluarSensorDesconectado({ sensor_conectado: false }), true)
  })

  it('Detecta desconexión si canal reporta estado "sin_dedo" o "desconectado"', () => {
    assert.strictEqual(evaluarSensorDesconectado({ estado: 'sin_dedo' }), true)
    assert.strictEqual(evaluarSensorDesconectado({ estado: 'desconectado' }), true)
  })

  it('Detecta desconexión si calidad es "sin_senal" y BPM es 0', () => {
    assert.strictEqual(evaluarSensorDesconectado({ calidad: 'sin_senal', bpm: 0 }), true)
  })

  it('Detecta desconexión si todas las muestras infrarrojas son 0 (caída I2C)', () => {
    assert.strictEqual(evaluarSensorDesconectado({ ir: [0, 0, 0, 0] }), true)
  })

  it('Identifica sensor activo correctamente cuando hay pulso y muestras ópticas', () => {
    const canalActivo = {
      canal: 1,
      activo: true,
      bpm: 74.5,
      calidad: 'buena',
      ir: [24100, 24250, 24300]
    }
    assert.strictEqual(evaluarSensorDesconectado(canalActivo), false)
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 3] Tolerancia ante Desconexiones Breves (Sin Falsos Positivos)...')
  // --------------------------------------------------------------------------
  await itAsync('Una desconexión de solo 2 segundos no finaliza la sesión activa', async () => {
    await iniciarSesion({
      dispositivoNombre: 'ESP32-Test-Tolerancia',
      usuario: { id: 'usr-test-1', nombre: 'Test Tolerancia' }
    })
    assert.strictEqual(estaSesionActiva.value, true)

    // Simular último contacto hace 2 segundos (menor a los 10s requeridos)
    esp32State.ultimoContacto = new Date(Date.now() - 2000).toISOString()
    cancelarSimulacion()

    await cicloVerificacionVigilante()

    assert.strictEqual(sesionState.sesionActiva.estado, ESTADOS_CONEXION.ACTIVA)
    assert.strictEqual(estaSesionActiva.value, true)
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 4] Finalización Automática por Pérdida de Comunicación WiFi (RF10)...')
  // --------------------------------------------------------------------------
  await itAsync('Transiciona a "perdida" (RF11) y finaliza con "perdida_comunicacion" al superar gracia', async () => {
    forzarSimulacionPerdidaWiFi()

    // 1. Primer ciclo: detecta timeout > 10s y pasa a estado 'perdida' con cuenta regresiva
    await cicloVerificacionVigilante()
    assert.strictEqual(sesionState.sesionActiva.estado, ESTADOS_CONEXION.PERDIDA)
    assert.strictEqual(vigilanteState.estadoAlerta, 'perdida')

    // 2. Agotar cuenta regresiva de gracia
    vigilanteState.segundosGraciaRestantes = 0
    await cicloVerificacionVigilante()

    // 3. Debe haber finalizado automáticamente la sesión
    assert.strictEqual(sesionState.sesionActiva.estado, ESTADOS_CONEXION.FINALIZADA)
    assert.strictEqual(sesionState.sesionActiva.motivo_fin, MOTIVOS_FIN.PERDIDA_COMUNICACION)
    assert.ok(sesionState.sesionActiva.fin, 'Debe registrar estampa de tiempo fin')
    assert.strictEqual(estaSesionActiva.value, false)

    // 4. Modal de alerta debe haberse poblado con el motivo exacto
    assert.ok(vigilanteState.alertaModal)
    assert.strictEqual(vigilanteState.alertaModal.motivo, 'perdida_comunicacion')
    assert.strictEqual(vigilanteState.estadoAlerta, 'finalizada_auto')

    descartarAlertaModal()
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 5] Finalización Automática por Desconexión del Sensor Óptico (RF10)...')
  // --------------------------------------------------------------------------
  await itAsync('Finaliza la sesión con "sensor_desconectado" al superar umbral continuo', async () => {
    // Iniciar nueva sesión para probar sensor
    await iniciarSesion({
      dispositivoNombre: 'ESP32-Test-Sensor',
      usuario: { id: 'usr-test-2', nombre: 'Test Sensor' }
    })
    assert.strictEqual(estaSesionActiva.value, true)

    // Simular que el sensor óptico fue retirado
    forzarSimulacionSensorDesconectado()

    // Llevar el acumulador al umbral de 8000 ms
    vigilanteState.tiempoSinSensorMs = UMBRALES_VIGILANTE.TIMEOUT_SENSOR_MS + 1000

    await cicloVerificacionVigilante()

    assert.strictEqual(sesionState.sesionActiva.estado, ESTADOS_CONEXION.FINALIZADA)
    assert.strictEqual(sesionState.sesionActiva.motivo_fin, MOTIVOS_FIN.SENSOR_DESCONECTADO)
    assert.ok(sesionState.sesionActiva.fin)
    assert.strictEqual(estaSesionActiva.value, false)

    // Verificar modal con causa de sensor
    assert.ok(vigilanteState.alertaModal)
    assert.strictEqual(vigilanteState.alertaModal.motivo, 'sensor_desconectado')

    descartarAlertaModal()
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 6] Registro en Historial de Eventos de Desconexión...')
  // --------------------------------------------------------------------------
  it('Registra ambos eventos en el historial de desconexiones para auditoría', () => {
    assert.ok(vigilanteState.historialDesconexiones.length >= 2)
    const tipos = vigilanteState.historialDesconexiones.map(e => e.tipo)
    assert.ok(tipos.includes(MOTIVOS_FIN.PERDIDA_COMUNICACION))
    assert.ok(tipos.includes(MOTIVOS_FIN.SENSOR_DESCONECTADO))
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 7] Cierre Manual por el Usuario no se confunde con Desconexión...')
  // --------------------------------------------------------------------------
  await itAsync('Un cierre normal voluntario registra motivo "usuario"', async () => {
    await iniciarSesion({
      dispositivoNombre: 'ESP32-Test-Normal',
      usuario: { id: 'usr-test-3', nombre: 'Test Normal' }
    })
    assert.strictEqual(estaSesionActiva.value, true)

    const res = await finalizarSesion({ motivo: MOTIVOS_FIN.USUARIO })
    assert.strictEqual(res.ok, true)
    assert.strictEqual(res.sesion.estado, ESTADOS_CONEXION.FINALIZADA)
    assert.strictEqual(res.sesion.motivo_fin, 'usuario')
  })

  // --------------------------------------------------------------------------
  // RESUMEN
  // --------------------------------------------------------------------------
  console.log('\n----------------------------------------------------------------')
  if (failed === 0) {
    console.log(`🎉 TODAS LAS PRUEBAS DE RF10 PASARON SATISFACTORIAMENTE (${passed}/${passed})`)
  } else {
    console.error(`💥 PRUEBAS FINALIZADAS CON ERRORES: ${passed} pasaron, ${failed} fallaron`)
    process.exit(1)
  }
  console.log('----------------------------------------------------------------\n')
}

runTests().catch(err => {
  console.error('Error fatal ejecutando pruebas:', err)
  process.exit(1)
})
