/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF09
 * Iniciar una sesión de medición en tiempo real
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
  generarUuid,
  formatearDuracion,
  iniciarSesion,
  finalizarSesion,
  marcarConexionPerdida,
  avanzarRondaSesion,
  restaurarSesionActiva,
  obtenerSesionActiva,
  actualizarLatido,
  sesionState,
  estaSesionActiva,
  LOCAL_SESION_KEY
} from '../src/services/sesionMedicionService.js'

import { construirMedicion, resumirParaHistorial } from '../src/utils/medicion.js'

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
  console.log('  sensor_pulso · Pruebas Automatizadas de RF09')
  console.log('  Iniciar una Sesión de Medición en Tiempo Real')
  console.log('================================================================\n')

  // Limpiar almacenamiento previo
  globalThis.localStorage.clear()

  // --------------------------------------------------------------------------
  console.log('▶ [Prueba 1] Verificación de Constantes y Generador de UUID...')
  // --------------------------------------------------------------------------
  it('Define los 4 estados canónicos de sesión (activa, perdida, finalizada, inactiva)', () => {
    assert.strictEqual(ESTADOS_CONEXION.ACTIVA, 'activa')
    assert.strictEqual(ESTADOS_CONEXION.PERDIDA, 'perdida')
    assert.strictEqual(ESTADOS_CONEXION.FINALIZADA, 'finalizada')
    assert.strictEqual(ESTADOS_CONEXION.INACTIVA, 'inactiva')
  })

  it('Define los motivos canónicos de finalización según esquema PostgreSQL', () => {
    assert.strictEqual(MOTIVOS_FIN.USUARIO, 'usuario')
    assert.strictEqual(MOTIVOS_FIN.PERDIDA_COMUNICACION, 'perdida_comunicacion')
    assert.strictEqual(MOTIVOS_FIN.SENSOR_DESCONECTADO, 'sensor_desconectado')
  })

  it('Genera un UUID v4 válido con formato estándar de 36 caracteres', () => {
    const uuid = generarUuid()
    assert.strictEqual(typeof uuid, 'string')
    assert.strictEqual(uuid.length, 36)
    const regex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    assert.ok(regex.test(uuid), `UUID "${uuid}" no cumple formato v4`)
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 2] Formateador de Cronómetro y Duración Clínica...')
  // --------------------------------------------------------------------------
  it('Formatea 0 segundos como "00:00"', () => {
    assert.strictEqual(formatearDuracion(0), '00:00')
  })

  it('Formatea 45 segundos como "00:45"', () => {
    assert.strictEqual(formatearDuracion(45), '00:45')
  })

  it('Formatea 135 segundos como "02:15"', () => {
    assert.strictEqual(formatearDuracion(135), '02:15')
  })

  it('Formatea 3672 segundos como "01:01:12" con horas', () => {
    assert.strictEqual(formatearDuracion(3672), '01:01:12')
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 3] Inicio Oficial de Sesión de Medición (RF09)...')
  // --------------------------------------------------------------------------
  await itAsync('Inicia una sesión oficial con estado activa, inicio y usuario', async () => {
    const res = await iniciarSesion({
      dispositivoNombre: 'ESP32-Biomedico-01',
      ronda: 1,
      canalInicial: 1,
      usuario: { id: 'usr-test-adan', nombre: 'Adán Ramos', email: 'adan@unach.cl' }
    })

    assert.strictEqual(res.ok, true)
    assert.ok(res.sesion)
    assert.strictEqual(res.sesion.estado, 'activa')
    assert.strictEqual(res.sesion.ronda, 1)
    assert.strictEqual(res.sesion.dispositivo_nombre, 'ESP32-Biomedico-01')
    assert.strictEqual(res.sesion.iniciada_por, 'usr-test-adan')
    assert.ok(res.sesion.inicio)
    assert.ok(res.sesion.ultimo_latido)
    assert.strictEqual(res.sesion.fin, null)
    assert.strictEqual(estaSesionActiva.value, true)
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 4] Aprovisionamiento Automático de Canales 1 a 5 (RF12/RF111)...')
  // --------------------------------------------------------------------------
  it('Aprovisiona exactamente 5 canales para la sesión', () => {
    const sesion = obtenerSesionActiva()
    assert.ok(sesion)
    assert.strictEqual(sesion.canales.length, 5)
    assert.deepStrictEqual(sesion.canales.map(c => c.canal), [1, 2, 3, 4, 5])
  })

  it('Asigna el Canal 1 al usuario iniciador y deja libres los canales 2 a 5', () => {
    const sesion = obtenerSesionActiva()
    const ch1 = sesion.canales.find(c => c.canal === 1)
    const ch2 = sesion.canales.find(c => c.canal === 2)
    const ch5 = sesion.canales.find(c => c.canal === 5)

    assert.strictEqual(ch1.usuario_id, 'usr-test-adan')
    assert.strictEqual(ch2.usuario_id, null)
    assert.strictEqual(ch5.usuario_id, null)
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 5] Actualización de Latido y Estados de Conexión (RF11)...')
  // --------------------------------------------------------------------------
  await itAsync('Actualiza el timestamp de ultimo_latido en la sesión activa', async () => {
    const sesion = obtenerSesionActiva()
    const latidoPrevio = sesion.ultimo_latido
    await new Promise(r => setTimeout(r, 10))
    await actualizarLatido(sesion.id)
    assert.ok(new Date(sesion.ultimo_latido).getTime() >= new Date(latidoPrevio).getTime())
  })

  await itAsync('Permite registrar pérdida temporal de comunicación (RF11)', async () => {
    await marcarConexionPerdida(MOTIVOS_FIN.PERDIDA_COMUNICACION)
    const sesion = obtenerSesionActiva()
    assert.strictEqual(sesion.estado, 'perdida')
    assert.strictEqual(sesion.motivo_fin, 'perdida_comunicacion')
    // Restaurar a activa para siguientes pruebas
    sesion.estado = 'activa'
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 6] Gestión de Rondas Multiusuario (RF111)...')
  // --------------------------------------------------------------------------
  await itAsync('Avanza a la Ronda 2 y libera los 5 canales para el siguiente grupo', async () => {
    const res = await avanzarRondaSesion()
    assert.strictEqual(res.ok, true)
    assert.strictEqual(res.ronda, 2)

    const sesion = obtenerSesionActiva()
    assert.strictEqual(sesion.ronda, 2)
    // Todos los 5 canales deben estar libres
    assert.ok(sesion.canales.every(c => c.usuario_id === null))
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 7] Vinculación de sesion_id en la Medición Guardada (RF09/RF30)...')
  // --------------------------------------------------------------------------
  it('construirMedicion asocia sesion_id de la sesión oficial en curso', () => {
    const sesion = obtenerSesionActiva()
    const resultado = construirMedicion({
      usuarioId: 'usr-test-adan',
      sesionId: sesion.id,
      bpm: 76.5,
      spo2: 98.0,
      calidad: 'buena',
      fuente: 'sensor',
      canal: 1
    })

    assert.strictEqual(resultado.ok, true)
    assert.strictEqual(resultado.fila.sesion_id, sesion.id)
    assert.strictEqual(resultado.fila.canal, 1)
  })

  it('resumirParaHistorial proyecta sesionId para consulta y trazabilidad', () => {
    const sesion = obtenerSesionActiva()
    const resumen = resumirParaHistorial({
      id: 'med-001',
      sesion_id: sesion.id,
      inicio: new Date().toISOString(),
      fuente: 'sensor',
      canal: 1,
      bpm_promedio: 76.5,
      spo2_promedio: 98.0
    })

    assert.strictEqual(resumen.sesionId, sesion.id)
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 8] Persistencia Local y Recuperación ante Recargas (RNF03)...')
  // --------------------------------------------------------------------------
  it('Persiste la sesión activa en localStorage', () => {
    const guardada = globalThis.localStorage.getItem(LOCAL_SESION_KEY)
    assert.ok(guardada)
    const parsed = JSON.parse(guardada)
    assert.strictEqual(parsed.id, sesionState.sesionActiva.id)
    assert.strictEqual(parsed.estado, 'activa')
  })

  it('Restaura la sesión activa conservando ID y ronda ante recarga simulada', () => {
    const sesionOriginalId = sesionState.sesionActiva.id
    // Simular reinicio de sesión en memoria
    sesionState.sesionActiva = null
    assert.strictEqual(estaSesionActiva.value, false)

    const restaurada = restaurarSesionActiva()
    assert.ok(restaurada)
    assert.strictEqual(restaurada.id, sesionOriginalId)
    assert.strictEqual(restaurada.ronda, 2)
    assert.strictEqual(estaSesionActiva.value, true)
  })

  // --------------------------------------------------------------------------
  console.log('\n▶ [Prueba 9] Finalización Oficial de Sesión (RF10)...')
  // --------------------------------------------------------------------------
  await itAsync('Finaliza la sesión activa registrando fecha de fin y motivo', async () => {
    const res = await finalizarSesion({ motivo: MOTIVOS_FIN.USUARIO })
    assert.strictEqual(res.ok, true)
    assert.strictEqual(res.sesion.estado, 'finalizada')
    assert.strictEqual(res.sesion.motivo_fin, 'usuario')
    assert.ok(res.sesion.fin)
    assert.strictEqual(estaSesionActiva.value, false)

    // Debe haberse removido de la clave de sesión activa
    assert.strictEqual(globalThis.localStorage.getItem(LOCAL_SESION_KEY), null)
  })

  // --------------------------------------------------------------------------
  // RESUMEN
  // --------------------------------------------------------------------------
  console.log('\n----------------------------------------------------------------')
  if (failed === 0) {
    console.log(`🎉 TODAS LAS PRUEBAS DE RF09 PASARON SATISFACTORIAMENTE (${passed}/${passed})`)
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
