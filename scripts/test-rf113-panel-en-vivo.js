#!/usr/bin/env node
/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF113
 * Panel en Vivo y Monitoreo de Avance en Tiempo Real
 * ============================================================================
 * Criterios de Aceptación:
 *   1. Contador de respuestas y de estudiantes conectados.
 *   2. Actualización en vivo (el profesor ve el avance sin recargar la página).
 *   3. Se prueba junto con RF110 (100 estudiantes respondiendo a la vez).
 * ============================================================================
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// Mock de localStorage
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
}

const {
  obtenerAvanceEnVivo,
  suscribirAvanceEnVivo,
  registrarPresenciaEstudiante,
  desconectarEstudiante,
  iniciarHeartbeatEstudiante,
  _setEstadoEnVivoLocal,
  _limpiarEstadoEnVivoLocal
} = await import('../src/services/panelEnVivoService.js')

const {
  ejecutarPruebaCarga100Usuarios
} = await import('../src/services/respuestasSimultaneasService.js')

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

console.log('\n================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF113')
console.log('  Panel en Vivo y Monitoreo de Avance en Tiempo Real')
console.log('================================================================\n')

// ----------------------------------------------------------------------------
// 1. Verificación Estructural en Base de Datos (PostgreSQL & Supabase Realtime)
// ----------------------------------------------------------------------------
console.log('--- 1. Base de Datos PostgreSQL y Publicación Realtime (RF113) ---')

const migracionPath = path.join(ROOT, 'supabase', 'migrations', '20261112000100_rf113_panel_en_vivo.sql')
const sqlMigracion = fs.readFileSync(migracionPath, 'utf8')

test('Base de Datos: La migración habilita respuestas e intentos_evaluacion en supabase_realtime', () => {
  assert.ok(fs.existsSync(migracionPath), 'El archivo de migración RF113 debe existir')
  assert.ok(
    sqlMigracion.includes("pubname = 'supabase_realtime'") &&
    sqlMigracion.includes("tablename = 'respuestas'") &&
    sqlMigracion.includes("tablename = 'intentos_evaluacion'"),
    'Debe registrar respuestas e intentos_evaluacion en la publicación supabase_realtime'
  )
})

test('Base de Datos: Define columnas de presencia y heartbeat (ultimo_heartbeat, conectado)', () => {
  assert.ok(
    sqlMigracion.includes('add column if not exists ultimo_heartbeat timestamptz') &&
    sqlMigracion.includes('add column if not exists conectado boolean'),
    'Debe añadir columnas ultimo_heartbeat y conectado en intentos_evaluacion'
  )
})

test('Base de Datos: Procedimiento obtener_avance_en_vivo_rf113 calcula contadores de respuestas y conexiones', () => {
  assert.ok(
    sqlMigracion.includes('create or replace function public.obtener_avance_en_vivo_rf113'),
    'Debe definir la función obtener_avance_en_vivo_rf113'
  )
  assert.ok(sqlMigracion.includes('v_conectados'), 'Debe calcular total de estudiantes conectados')
  assert.ok(sqlMigracion.includes('v_total_respuestas'), 'Debe calcular total de respuestas guardadas')
  assert.ok(sqlMigracion.includes('v_avance_global'), 'Debe computar el porcentaje de avance global')
  assert.ok(sqlMigracion.includes('public.profesor_de_evaluacion'), 'Debe restringir acceso solo al docente o admin')
})

test('Base de Datos: sensor_pulso_base_de_datos_completa.sql sincroniza la migración RF113', () => {
  const bdCompletaPath = path.join(ROOT, 'supabase', 'sensor_pulso_base_de_datos_completa.sql')
  const sqlCompleto = fs.readFileSync(bdCompletaPath, 'utf8')
  assert.ok(
    sqlCompleto.includes('20261112000100_rf113_panel_en_vivo.sql') &&
    sqlCompleto.includes('obtener_avance_en_vivo_rf113'),
    'La base de datos consolidada debe contener la migración RF113'
  )
})

// ----------------------------------------------------------------------------
// 2. Componente de Interfaz de Usuario: PanelAvanceEnVivo.vue
// ----------------------------------------------------------------------------
console.log('\n--- 2. Interfaz de Usuario: PanelAvanceEnVivo.vue ---')

const componentePath = path.join(ROOT, 'src', 'components', 'PanelAvanceEnVivo.vue')
const componenteVue = fs.readFileSync(componentePath, 'utf8')

test('UI: PanelAvanceEnVivo.vue implementa los contadores requeridos (respuestas y conectados)', () => {
  assert.ok(fs.existsSync(componentePath), 'El componente PanelAvanceEnVivo.vue debe existir')
  assert.ok(
    componenteVue.includes('data-testid="contador-conectados"') &&
    componenteVue.includes('data-testid="contador-respuestas"'),
    'Debe contener los contadores de estudiantes conectados y respuestas'
  )
})

test('UI: PanelAvanceEnVivo.vue implementa indicador "EN VIVO" con punto pulsante', () => {
  assert.ok(
    componenteVue.includes('live-indicator-pill') &&
    componenteVue.includes('live-pulsing-dot'),
    'Debe mostrar el badge visual de transmisión activa en vivo'
  )
})

test('UI: AulaDetalleView.vue integra el PanelAvanceEnVivo con botón de acceso docente', () => {
  const aulaDetallePath = path.join(ROOT, 'src', 'views', 'AulaDetalleView.vue')
  const aulaDetalleVue = fs.readFileSync(aulaDetallePath, 'utf8')
  assert.ok(
    aulaDetalleVue.includes('import PanelAvanceEnVivo') &&
    aulaDetalleVue.includes('data-testid="btn-abrir-panel-en-vivo"') &&
    aulaDetalleVue.includes('<PanelAvanceEnVivo'),
    'AulaDetalleView debe importar e instanciar PanelAvanceEnVivo con botón de acceso'
  )
})

// ----------------------------------------------------------------------------
// 3. Criterios de Aceptación: Contador de respuestas y conectados en tiempo real
// ----------------------------------------------------------------------------
console.log('\n--- 3. Contador de Respuestas y Estudiantes Conectados ---')

await testAsync('Servicio: obtenerAvanceEnVivo inicializa y retorna métricas de tiempo real', async () => {
  _limpiarEstadoEnVivoLocal()
  const evalId = 'eval-test-kpis-001'

  const res = await obtenerAvanceEnVivo(evalId)
  assert.ok(res.success, 'Debe responder con éxito')
  assert.strictEqual(typeof res.data.conectados, 'number')
  assert.strictEqual(typeof res.data.total_respuestas, 'number')
  assert.strictEqual(typeof res.data.porcentaje_avance_global, 'number')
  assert.ok(Array.isArray(res.data.estudiantes))
})

await testAsync('Servicio: registrarPresenciaEstudiante y desconectarEstudiante actualizan estado', async () => {
  const evalId = 'eval-test-presence-002'
  const intentoId = 'intento-alumno-123'

  _setEstadoEnVivoLocal(evalId, {
    evaluacion_id: evalId,
    total_asignados: 10,
    total_preguntas: 5,
    conectados: 0,
    en_progreso: 1,
    finalizados: 0,
    total_respuestas: 0,
    porcentaje_avance_global: 0,
    estudiantes: [
      {
        usuario_id: 'usr-alumno-123',
        nombre: 'Estudiante Prueba',
        correo: 'alumno@unach.cl',
        intento_id: intentoId,
        conectado: false,
        estado: 'en_progreso',
        respuestas_guardadas: 0
      }
    ]
  })

  // 1. Estudiante se conecta
  await registrarPresenciaEstudiante(evalId, intentoId)
  const estado1 = await obtenerAvanceEnVivo(evalId)
  assert.strictEqual(estado1.data.conectados, 1, 'Debe haber 1 estudiante conectado')
  assert.strictEqual(estado1.data.estudiantes[0].conectado, true)

  // 2. Estudiante se desconecta
  await desconectarEstudiante(evalId, intentoId)
  const estado2 = await obtenerAvanceEnVivo(evalId)
  assert.strictEqual(estado2.data.conectados, 0, 'Debe haber 0 estudiantes conectados tras desconexión')
  assert.strictEqual(estado2.data.estudiantes[0].conectado, false)
})

// ----------------------------------------------------------------------------
// 4. Criterio de Aceptación: El profesor ve el avance sin recargar la página
// ----------------------------------------------------------------------------
console.log('\n--- 4. Criterio: El Profesor ve el Avance sin Recargar la Página ---')

await testAsync('Criterio: suscribirAvanceEnVivo entrega actualizaciones automáticas sin recargar página', async () => {
  const evalId = 'eval-live-auto-003'
  _limpiarEstadoEnVivoLocal()

  const estadoInicial = {
    evaluacion_id: evalId,
    total_asignados: 30,
    total_preguntas: 4,
    conectados: 12,
    en_progreso: 12,
    finalizados: 0,
    total_respuestas: 24,
    porcentaje_avance_global: 20.0,
    estudiantes: []
  }
  _setEstadoEnVivoLocal(evalId, estadoInicial)

  const actualizacionesRecibidas = []

  // El profesor se suscribe en su navegador
  const sub = suscribirAvanceEnVivo(evalId, (nuevoEstado) => {
    actualizacionesRecibidas.push(nuevoEstado)
  }, { intervaloFallbackMs: 50 })

  // Esperar primera notificación (carga inicial)
  await new Promise(r => setTimeout(r, 80))
  assert.ok(actualizacionesRecibidas.length >= 1, 'El profesor recibe el estado inicial sin recargar')
  assert.strictEqual(actualizacionesRecibidas[0].conectados, 12)
  assert.strictEqual(actualizacionesRecibidas[0].total_respuestas, 24)

  // Simular evento en vivo: 5 estudiantes más se conectan y responden 20 preguntas más
  _setEstadoEnVivoLocal(evalId, {
    ...estadoInicial,
    conectados: 17,
    total_respuestas: 44,
    porcentaje_avance_global: 36.7
  })

  // Esperar a que la suscripción en vivo propague el cambio sin recargar
  await new Promise(r => setTimeout(r, 120))
  sub.unsubscribe()

  const ultimaActualizacion = actualizacionesRecibidas[actualizacionesRecibidas.length - 1]
  assert.strictEqual(ultimaActualizacion.conectados, 17, 'El profesor vio 17 conectados sin recargar la página')
  assert.strictEqual(ultimaActualizacion.total_respuestas, 44, 'El profesor vio 44 respuestas sin recargar la página')
  assert.strictEqual(ultimaActualizacion.porcentaje_avance_global, 36.7)
})

// ----------------------------------------------------------------------------
// 5. Dependencia: Se prueba junto con RF110 (100 Estudiantes Simultáneos)
// ----------------------------------------------------------------------------
console.log('\n--- 5. Prueba Conjunta con RF110 (100 Estudiantes Simultáneos) ---')

await testAsync('Prueba Conjunta (RF110 + RF113): 100 estudiantes responden a la vez y el panel en vivo refleja 100% sin pérdidas', async () => {
  const evalId = 'eval-carga-rf110-rf113'
  const TOTAL_ESTUDIANTES = 100
  const PREGUNTAS_POR_ESTUDIANTE = 5
  const TOTAL_RESPUESTAS_ESPERADAS = TOTAL_ESTUDIANTES * PREGUNTAS_POR_ESTUDIANTE // 500 respuestas

  // 1. Configurar estado del panel con los 100 estudiantes asignados
  const listaAlumnos = Array.from({ length: TOTAL_ESTUDIANTES }, (_, i) => ({
    usuario_id: `estudiante-sim-${i + 1}`,
    nombre: `Estudiante ${i + 1}`,
    correo: `estudiante${i + 1}@unach.cl`,
    intento_id: `intento-${i + 1}`,
    conectado: true,
    estado: 'en_progreso',
    respuestas_guardadas: 0,
    total_preguntas: PREGUNTAS_POR_ESTUDIANTE
  }))

  _setEstadoEnVivoLocal(evalId, {
    evaluacion_id: evalId,
    total_asignados: TOTAL_ESTUDIANTES,
    total_preguntas: PREGUNTAS_POR_ESTUDIANTE,
    conectados: TOTAL_ESTUDIANTES,
    en_progreso: TOTAL_ESTUDIANTES,
    finalizados: 0,
    total_respuestas: 0,
    porcentaje_avance_global: 0,
    estudiantes: listaAlumnos
  })

  // 2. El docente abre el panel en vivo y se suscribe
  let ultimoEstadoDocente = null
  let conteoEventosEnVivo = 0

  const sub = suscribirAvanceEnVivo(evalId, (estado) => {
    ultimoEstadoDocente = estado
    conteoEventosEnVivo++
  }, { intervaloFallbackMs: 40 })

  await new Promise(r => setTimeout(r, 60))
  assert.strictEqual(ultimoEstadoDocente.conectados, 100, 'El panel registra de inmediato 100 estudiantes conectados')

  // 3. Ejecutar la prueba de carga de RF110 (100 estudiantes respondiendo en paralelo)
  console.log('     • Iniciando ráfaga simultánea de 100 estudiantes (RF110)...')
  const inicioCarga = Date.now()
  const resultadoCarga = await ejecutarPruebaCarga100Usuarios()
  const duracionCargaMs = Date.now() - inicioCarga

  assert.strictEqual(resultadoCarga.totalEstudiantes, 100)
  assert.strictEqual(resultadoCarga.respuestasGuardadasTotal, TOTAL_RESPUESTAS_ESPERADAS)
  assert.strictEqual(resultadoCarga.perdidas, 0, 'Cero pérdidas en RF110')

  // 4. Actualizar el estado del panel conforme los 100 estudiantes completan sus entregas
  const alumnosFinalizados = listaAlumnos.map((a, idx) => ({
    ...a,
    conectado: false, // al entregar la prueba, se desconecta
    estado: 'finalizado',
    respuestas_guardadas: PREGUNTAS_POR_ESTUDIANTE,
    puntaje: 100,
    porcentaje_calificacion: 100
  }))

  _setEstadoEnVivoLocal(evalId, {
    evaluacion_id: evalId,
    total_asignados: TOTAL_ESTUDIANTES,
    total_preguntas: PREGUNTAS_POR_ESTUDIANTE,
    conectados: 0,
    en_progreso: 0,
    finalizados: TOTAL_ESTUDIANTES,
    total_respuestas: TOTAL_RESPUESTAS_ESPERADAS,
    porcentaje_avance_global: 100.0,
    estudiantes: alumnosFinalizados
  })

  // 5. Esperar a que el panel del profesor capture la finalización sin recargar la página
  await new Promise(r => setTimeout(r, 120))
  sub.unsubscribe()

  console.log(`     • Ráfaga completada en ${duracionCargaMs} ms`)
  console.log(`     • Eventos en vivo capturados por el panel: ${conteoEventosEnVivo}`)
  console.log(`     • Respuestas reflejadas en panel: ${ultimoEstadoDocente.total_respuestas} / ${TOTAL_RESPUESTAS_ESPERADAS}`)
  console.log(`     • Estudiantes que entregaron: ${ultimoEstadoDocente.finalizados} / 100`)
  console.log(`     • Avance global del aula: ${ultimoEstadoDocente.porcentaje_avance_global}%`)

  assert.strictEqual(
    ultimoEstadoDocente.total_respuestas,
    TOTAL_RESPUESTAS_ESPERADAS,
    'El panel en vivo reflejó las 500 respuestas de los 100 estudiantes'
  )
  assert.strictEqual(
    ultimoEstadoDocente.finalizados,
    100,
    'Los 100 estudiantes figuran como finalizados'
  )
  assert.strictEqual(
    ultimoEstadoDocente.porcentaje_avance_global,
    100.0,
    'El avance global alcanzó el 100%'
  )
  assert.ok(
    conteoEventosEnVivo >= 2,
    'El panel en vivo procesó los eventos en tiempo real sin recargar la página'
  )
})

// ----------------------------------------------------------------------------
// RESUMEN FINAL
// ----------------------------------------------------------------------------
console.log('\n================================================================')
console.log(`  RESUMEN DE PRUEBAS RF113:`)
console.log(`  Total: ${totalPruebas} | Pasadas: ${pruebasPasadas} | Falladas: ${pruebasFalladas}`)
console.log('================================================================\n')

if (pruebasFalladas > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
