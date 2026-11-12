#!/usr/bin/env node
/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF110
 * Respuestas Simultáneas y Soporte de Alta Concurrencia (100 Estudiantes)
 * ============================================================================
 * Criterios de Aceptación:
 *   1. Soportar hasta 100 estudiantes respondiendo a la vez.
 *   2. 100 respuestas simultáneas se guardan sin pérdidas.
 *   3. Optimización de escrituras en lote (Set-Based Bulk Upsert e Índices).
 * ============================================================================
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Mock de localStorage para simular entorno de ejecución en Node
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
}

const {
  CONFIG_SIMULTANEIDAD_RF110,
  guardarEnStashSeguro,
  obtenerDeStashSeguro,
  limpiarStashSeguro,
  calcularTiempoBackoffConJitter,
  enviarRespuestasConResiliencia,
  ejecutarPruebaCarga100Usuarios
} = await import('../src/services/respuestasSimultaneasService.js')

const {
  entregarRespuestasEvaluacion
} = await import('../src/services/evaluacionesService.js')

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

async function testAsync(nombre, fn) {
  totalPruebas++
  try {
    await fn()
    pruebasPasadas++
    console.log(`  ✅ [PASS] ${nombre}`)
  } catch (err) {
    pruebasFalladas++
    console.error(`  ❌ [FAIL] ${nombre}`)
    console.error(`     Detalle: ${err.message}\n`)
  }
}

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF110')
console.log('  Respuestas Simultáneas y Soporte de Alta Concurrencia')
console.log('================================================================')

// ----------------------------------------------------------------------------
// 1. OPTIMIZACIÓN DE ESCRITURAS EN BASE DE DATOS (MIGRACIONES E ÍNDICES)
// ----------------------------------------------------------------------------
console.log('\n--- 1. Optimización de Escrituras en Base de Datos PostgreSQL ---')

const migracionRf110Path = path.join(ROOT, 'supabase/migrations/20261111000400_rf110_respuesta_simultanea.sql')
assert(fs.existsSync(migracionRf110Path), 'La migración RF110 debe existir')
const migracionRf110 = fs.readFileSync(migracionRf110Path, 'utf8')
const bdCompleta = fs.readFileSync(path.join(ROOT, 'supabase/sensor_pulso_base_de_datos_completa.sql'), 'utf8')

test('Base de Datos: Define índices de alto rendimiento para escrituras concurrentes', () => {
  assert(migracionRf110.includes('respuestas_intento_idx'), 'Debe indexar respuestas por intento_id')
  assert(migracionRf110.includes('respuestas_pregunta_idx'), 'Debe indexar respuestas por pregunta_id')
  assert(migracionRf110.includes('intentos_evaluacion_eval_usuario_idx'), 'Debe indexar intentos por evaluación y usuario')
})

test('Base de Datos: guardar_respuestas_simultaneas_rf110 implementa inserción en lote (Set-Based)', () => {
  assert(migracionRf110.includes('guardar_respuestas_simultaneas_rf110'), 'Debe definir la función en bloque')
  assert(migracionRf110.includes('insert into public.respuestas'), 'Debe realizar insert set-based')
  assert(migracionRf110.includes('on conflict (intento_id, pregunta_id) do update'), 'Debe manejar upsert atómico')
  assert(!migracionRf110.includes('for v_pregunta_id in'), 'No debe contener loops iterativos procedimentales')
})

test('Base de Datos: Actualiza el puntaje consolidado e intento fin una sola vez por entrega', () => {
  assert(migracionRf110.includes('update public.intentos_evaluacion'), 'Debe actualizar intentos_evaluacion')
  assert(migracionRf110.includes('fin = statement_timestamp()'), 'Debe sellar el término atómicamente')
})

test('Base de Datos: entregar_evaluacion_rf109 delega en el motor de bloque optimizado', () => {
  assert(migracionRf110.includes('perform public.guardar_respuestas_simultaneas_rf110'), 'entregar_evaluacion_rf109 debe delegar')
  assert(bdCompleta.includes('guardar_respuestas_simultaneas_rf110'), 'La base de datos completa debe incluir RF110')
})

// ----------------------------------------------------------------------------
// 2. RESGUARDO LOCAL PREVENTIVO (STASH) Y RETROCESO EXPONENCIAL (BACKOFF)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Resguardo Local Preventivo y Retroceso Exponencial con Jitter ---')

test('Resguardo Local: guardarEnStashSeguro y obtenerDeStashSeguro protegen respuestas antes de red', () => {
  const intentoId = 'intento-test-stash-01'
  const payload = { 'preg-01': 'a', 'preg-02': 'b' }
  guardarEnStashSeguro(intentoId, payload)

  const recuperado = obtenerDeStashSeguro(intentoId)
  assert(recuperado, 'Debe existir registro en stash')
  assert.strictEqual(recuperado.intentoId, intentoId)
  assert.deepStrictEqual(recuperado.payload, payload)

  limpiarStashSeguro(intentoId)
  assert.strictEqual(obtenerDeStashSeguro(intentoId), null, 'Debe limpiarse tras confirmación')
})

test('Retroceso Exponencial: calcularTiempoBackoffConJitter genera pausas crecientes y no deterministas', () => {
  const t0 = calcularTiempoBackoffConJitter(0, 100, 50)
  const t1 = calcularTiempoBackoffConJitter(1, 100, 50)
  const t2 = calcularTiempoBackoffConJitter(2, 100, 50)

  // t0: ~100-150ms, t1: ~200-250ms, t2: ~400-450ms
  assert(t0 >= 100 && t0 <= 160, `t0 fuera de rango esperado: ${t0}`)
  assert(t1 >= 200 && t1 <= 260, `t1 fuera de rango esperado: ${t1}`)
  assert(t2 >= 400 && t2 <= 460, `t2 fuera de rango esperado: ${t2}`)
  assert(t2 > t1 && t1 > t0, 'Los retardos deben ser estrictamente crecientes')
})

test('Configuración: CONFIG_SIMULTANEIDAD_RF110 establece cuota para 100 estudiantes y 4 reintentos', () => {
  assert.strictEqual(CONFIG_SIMULTANEIDAD_RF110.MAX_ESTUDIANTES_SIMULTANEOS, 100)
  assert.strictEqual(CONFIG_SIMULTANEIDAD_RF110.REINTENTOS_MAXIMOS, 4)
  assert(CONFIG_SIMULTANEIDAD_RF110.TIEMPO_BASE_MS > 0)
  assert(CONFIG_SIMULTANEIDAD_RF110.JITTER_MAX_MS > 0)
})

// ----------------------------------------------------------------------------
// 3. PRUEBA DE CARGA CON 100 USUARIOS SIMULTÁNEOS (Criterio de Aceptación)
// ----------------------------------------------------------------------------
console.log('\n--- 3. Prueba de Carga con 100 Usuarios Simultáneos (Criterio de Aceptación) ---')

await testAsync('Criterio: 100 estudiantes responden a la vez y se guardan 100% sin pérdidas', async () => {
  // Simulador de motor de persistencia concurrente con contención y latencia variable
  const respuestasPersistidasEnServidor = new Map()

  const simuladorBackend = async (estudiante) => {
    // Simular latencia de red fluctuante entre 5ms y 35ms por estudiante
    const latenciaRed = Math.floor(Math.random() * 30) + 5
    await new Promise((r) => setTimeout(r, latenciaRed))

    // Guardar en base de datos simulada (set-based)
    respuestasPersistidasEnServidor.set(estudiante.intentoId, {
      estudianteId: estudiante.id,
      evaluacionId: estudiante.evaluacionId,
      respuestas: estudiante.respuestas,
      guardadoEn: Date.now()
    })

    return {
      success: true,
      data: {
        ok: true,
        intento_id: estudiante.intentoId,
        respuestas_guardadas: Object.keys(estudiante.respuestas).length
      }
    }
  }

  const resultado = await ejecutarPruebaCarga100Usuarios({
    cantidadEstudiantes: 100,
    preguntasPorExamen: 5,
    simuladorRpc: simuladorBackend
  })

  // Validaciones del informe de carga
  assert.strictEqual(resultado.totalEstudiantes, 100, 'Debe procesar exactamente 100 estudiantes')
  assert.strictEqual(resultado.exitosos, 100, 'Los 100 estudiantes deben completar su entrega con éxito')
  assert.strictEqual(resultado.fallidos, 0, 'No debe haber envíos fallidos')
  assert.strictEqual(resultado.perdidas, 0, 'CRITERIO: 0 pérdidas de respuestas')
  assert.strictEqual(resultado.tasaExitoPct, 100, 'Tasa de éxito debe ser del 100%')
  assert.strictEqual(resultado.sinPerdidas, true, 'Propiedad sinPerdidas debe ser verdadera')
  assert.strictEqual(resultado.respuestasGuardadasTotal, 500, 'Deben guardarse las 500 respuestas (100 * 5)')
  assert.strictEqual(respuestasPersistidasEnServidor.size, 100, 'El servidor debe tener los 100 intentos completos')

  console.log(`     • Rendimiento: 100 estudiantes en ${resultado.tiempoTotalMs} ms`)
  console.log(`     • Latencia Promedio: ${resultado.latenciaPromedioMs} ms (P95: ${resultado.latenciaP95Ms} ms, P99: ${resultado.latenciaP99Ms} ms)`)
  console.log(`     • Respuestas guardadas en total: ${resultado.respuestasGuardadasTotal}`)
})

await testAsync('Resiliencia: Prueba de carga con 100 usuarios ante fallos transitorios de red simulados', async () => {
  // Simulador donde el primer intento falla en un 20% de los estudiantes (simulando congestión WiFi del aula)
  // pero el reintento con backoff exponencial y stash local rescata el 100%
  const intentosFallidosContador = new Map()
  const servidorFinal = new Map()

  const simuladorConFallosTransitorios = async (estudiante) => {
    const fallosPrevios = intentosFallidosContador.get(estudiante.intentoId) || 0

    if (fallosPrevios === 0 && Math.random() < 0.20) {
      intentosFallidosContador.set(estudiante.intentoId, 1)
      // Simular fallo transitorio de conexión por saturación
      await new Promise((r) => setTimeout(r, 10))
      // El cliente resiliente enviará reintento con backoff
      const reintento = await enviarRespuestasConResiliencia({
        evaluacionId: estudiante.evaluacionId,
        intentoId: estudiante.intentoId,
        respuestas: estudiante.respuestas,
        opciones: { maxReintentos: 3 }
      })
      servidorFinal.set(estudiante.intentoId, estudiante.respuestas)
      return reintento
    }

    servidorFinal.set(estudiante.intentoId, estudiante.respuestas)
    return {
      success: true,
      data: { ok: true, intento_id: estudiante.intentoId }
    }
  }

  const resultado = await ejecutarPruebaCarga100Usuarios({
    cantidadEstudiantes: 100,
    preguntasPorExamen: 4,
    simuladorRpc: simuladorConFallosTransitorios
  })

  assert.strictEqual(resultado.totalEstudiantes, 100)
  assert.strictEqual(resultado.perdidas, 0, 'Cero pérdidas a pesar de fallos transitorios de red')
  assert.strictEqual(resultado.exitosos, 100)
  assert.strictEqual(resultado.tasaExitoPct, 100)
  assert.strictEqual(servidorFinal.size, 100, 'Todos los 100 estudiantes fueron registrados')
})

// ----------------------------------------------------------------------------
// 4. INTEGRACIÓN CON EVALUACIONES SERVICE Y VISTAS
// ----------------------------------------------------------------------------
console.log('\n--- 4. Integración con EvaluacionesService y Vistas ---')

test('EvaluacionesService: Exporta entregarRespuestasEvaluacion con resiliencia', () => {
  assert(typeof entregarRespuestasEvaluacion === 'function', 'Debe exportar entregarRespuestasEvaluacion')
})

const misEvaluacionesVue = fs.readFileSync(path.join(ROOT, 'src/views/MisEvaluacionesView.vue'), 'utf8')

test('MisEvaluacionesView.vue: Utiliza enviarRespuestasConResiliencia en entregar()', () => {
  assert(misEvaluacionesVue.includes('enviarRespuestasConResiliencia'), 'Debe importar y usar enviarRespuestasConResiliencia')
  assert(misEvaluacionesVue.includes('resultado.success'), 'Debe verificar el resultado resiliente')
})

// ----------------------------------------------------------------------------
// RESUMEN FINAL
// ----------------------------------------------------------------------------
console.log('\n================================================================')
console.log(`  RESUMEN DE PRUEBAS RF110:`)
console.log(`  Total: ${totalPruebas} | Pasadas: ${pruebasPasadas} | Falladas: ${pruebasFalladas}`)
console.log('================================================================\n')

if (pruebasFalladas > 0) {
  process.exit(1)
}
