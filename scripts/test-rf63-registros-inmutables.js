#!/usr/bin/env node
/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF63
 * Registros de Auditoría Inmutables y Sello de Tiempo del Servidor
 * ============================================================================
 * Criterios de Aceptación:
 *   1. Intentar editar o borrar un registro de auditoría falla.
 *   2. Todos los registros llevan sello de tiempo oficial del servidor.
 *   3. La base de datos y la capa de servicios bloquean UPDATE, DELETE y TRUNCATE.
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
  PROPIEDADES_SEGURIDAD_RF63,
  normalizarEventoAuditoria,
  registrarEventoAuditoria,
  listarEventosAuditoria,
  editarEventoAuditoria,
  eliminarEventoAuditoria,
  vaciarAuditoria,
  intentarModificarRegistroAuditoria,
  intentarEliminarRegistroAuditoria,
  validarInmutabilidad,
  validarSelloTiempoServidor
} = await import('../src/services/auditoriaService.js')

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
console.log('  sensor_pulso · Pruebas Automatizadas de RF63')
console.log('  Registros Inmutables y Sello de Tiempo del Servidor')
console.log('================================================================')

// ----------------------------------------------------------------------------
// 1. INTENTAR EDITAR UN REGISTRO FALLA (Criterio de Aceptación)
// ----------------------------------------------------------------------------
console.log('\n--- 1. Intentar Editar un Registro Falla (Criterio de Aceptación 1) ---')

test('Criterio: Invocación de editarEventoAuditoria arroja error denegando modificación', () => {
  assert.throws(
    () => {
      editarEventoAuditoria('aud-001', { accion: 'login_falsificado' })
    },
    /inmutables y no pueden ser modificados/i,
    'Debe lanzar excepción indicando que la auditoría es inmutable'
  )
})

await testAsync('Criterio: intentarModificarRegistroAuditoria retorna bloqueo activo', async () => {
  const resultado = await intentarModificarRegistroAuditoria('aud-001', { detalle: { editado: true } })
  assert.strictEqual(resultado.ok, false, 'No debe permitir la edición')
  assert.strictEqual(resultado.bloqueado, true, 'Debe indicar que la operación fue bloqueada')
  assert(resultado.error.includes('modificar') || resultado.error.includes('inmutable'), 'Debe reportar inmutabilidad')
})

test('Inmutabilidad de Objeto: Intentar mutar propiedades directas arroja TypeError', () => {
  const evento = normalizarEventoAuditoria({
    id: 'aud-test-edit-1',
    accion: 'cambio_rol',
    ocurrio_en: '2026-11-11T18:00:00Z',
    detalle: { rol_anterior: 'usuario', rol_nuevo: 'profesor' }
  })

  assert.strictEqual(Object.isFrozen(evento), true, 'El evento normalizado debe estar congelado')
  assert.throws(
    () => {
      evento.accion = 'cambio_ilegítimo'
    },
    TypeError,
    'Mutar propiedad de objeto congelado debe lanzar TypeError'
  )
})

test('Inmutabilidad de Objeto: Intentar mutar propiedades anidadas en detalle arroja TypeError', () => {
  const evento = normalizarEventoAuditoria({
    id: 'aud-test-edit-2',
    accion: 'login',
    ocurrio_en: '2026-11-11T18:00:00Z',
    detalle: { ip: '127.0.0.1', agente: 'Navegador' }
  })

  assert.strictEqual(Object.isFrozen(evento.detalle), true, 'El detalle del evento debe estar congelado')
  assert.throws(
    () => {
      evento.detalle.ip = '10.0.0.99'
    },
    TypeError,
    'Mutar detalle de objeto congelado debe lanzar TypeError'
  )
})

test('Función validarInmutabilidad confirma el blindaje contra manipulaciones', () => {
  const evento = normalizarEventoAuditoria({
    id: 'aud-test-check',
    accion: 'descarga',
    ocurrio_en: '2026-11-11T18:00:00Z'
  })
  assert.strictEqual(validarInmutabilidad(evento), true, 'Debe certificar la inmutabilidad del evento')
  assert.strictEqual(validarInmutabilidad({ mutable: true }), false, 'Objeto no congelado debe fallar validación')
})

// ----------------------------------------------------------------------------
// 2. INTENTAR BORRAR UN REGISTRO FALLA (Criterio de Aceptación)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Intentar Borrar un Registro Falla (Criterio de Aceptación 1) ---')

test('Criterio: Invocación de eliminarEventoAuditoria arroja error denegando borrado', () => {
  assert.throws(
    () => {
      eliminarEventoAuditoria('aud-001')
    },
    /inmutables y no pueden ser eliminados/i,
    'Debe lanzar excepción indicando que la auditoría no se puede borrar'
  )
})

await testAsync('Criterio: intentarEliminarRegistroAuditoria retorna bloqueo activo', async () => {
  const resultado = await intentarEliminarRegistroAuditoria('aud-001')
  assert.strictEqual(resultado.ok, false, 'No debe permitir la eliminación')
  assert.strictEqual(resultado.bloqueado, true, 'Debe indicar que el borrado fue bloqueado')
  assert(resultado.error.includes('borrar') || resultado.error.includes('eliminad'), 'Debe reportar prohibición de borrado')
})

test('Criterio: Invocación de vaciarAuditoria (truncado) arroja error denegando purga', () => {
  assert.throws(
    () => {
      vaciarAuditoria()
    },
    /no puede truncarse ni vaciarse/i,
    'Debe denegar cualquier intento de vaciar la bitácora'
  )
})

// ----------------------------------------------------------------------------
// 3. SELLO DE TIEMPO DEL SERVIDOR (ocurrio_en)
// ----------------------------------------------------------------------------
console.log('\n--- 3. Sello de Tiempo del Servidor (Criterio 2) ---')

test('Sello de Tiempo: validarSelloTiempoServidor valida fechas ISO 8601 legítimas', () => {
  assert.strictEqual(validarSelloTiempoServidor('2026-11-11T18:00:00.000Z'), true)
  assert.strictEqual(validarSelloTiempoServidor(new Date().toISOString()), true)
  assert.strictEqual(validarSelloTiempoServidor('invalido'), false)
  assert.strictEqual(validarSelloTiempoServidor(null), false)
})

test('Sello de Tiempo: normalizarEventoAuditoria asegura que todo registro posee ocurrioEn válido', () => {
  const evento = normalizarEventoAuditoria({
    id: 'aud-tiempo-1',
    accion: 'login',
    ocurrio_en: '2026-11-11T18:30:15Z'
  })
  assert(evento.ocurrioEn, 'Debe contener ocurrioEn')
  assert.strictEqual(validarSelloTiempoServidor(evento.ocurrioEn), true)
})

await testAsync('Sello de Tiempo: registrarEventoAuditoria genera sello de tiempo válido del sistema', async () => {
  const res = await registrarEventoAuditoria({
    accion: 'login',
    actorCorreo: 'docente@unach.cl',
    resumen: 'Prueba de sello de tiempo servidor'
  })
  assert.strictEqual(res.ok, true)
  assert(res.evento.ocurrioEn, 'El evento registrado debe incluir sello temporal')
  assert.strictEqual(validarSelloTiempoServidor(res.evento.ocurrioEn), true)
  const ahora = Date.now()
  const fechaRegistro = new Date(res.evento.ocurrioEn).getTime()
  // El sello de tiempo debe ser coherente con el momento de ejecución (delta < 5s)
  assert(Math.abs(ahora - fechaRegistro) < 5000, 'El sello debe corresponder al momento actual')
})

// ----------------------------------------------------------------------------
// 4. CONFIGURACIÓN EN BASE DE DATOS POSTGRESQL (TRIGGERS, RLS Y FUNCIONES)
// ----------------------------------------------------------------------------
console.log('\n--- 4. Configuración en Base de Datos PostgreSQL (Triggers y RLS) ---')

const migracionInicial = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261027000200_auditoria_consentimiento_catalogos.sql'), 'utf8')
const migracionRf63 = fs.readFileSync(path.join(ROOT, 'supabase/migrations/20261111000300_rf63_registros_inmutables.sql'), 'utf8')
const bdCompleta = fs.readFileSync(path.join(ROOT, 'supabase/sensor_pulso_base_de_datos_completa.sql'), 'utf8')

test('PostgreSQL: Tabla auditoria define ocurrio_en timestamptz con default now()', () => {
  assert(
    /ocurrio_en\s+timestamptz\s+not\s+null\s+default\s+now\(\)/i.test(migracionInicial),
    'La columna ocurrio_en debe tener default now() en la tabla'
  )
  assert(
    /ocurrio_en\s+timestamptz\s+not\s+null\s+default\s+now\(\)/i.test(bdCompleta),
    'La base de datos completa debe incluir el default now() en ocurrio_en'
  )
})

test('PostgreSQL: Trigger auditoria_no_update bloquea BEFORE UPDATE OR DELETE', () => {
  assert(
    /create trigger auditoria_no_update\s+before update or delete on public\.auditoria/i.test(migracionRf63),
    'Migración RF63 debe definir trigger auditoria_no_update para BEFORE UPDATE OR DELETE'
  )
  assert(
    /create trigger auditoria_no_update\s+before update or delete on public\.auditoria/i.test(bdCompleta),
    'Base de datos completa debe contener el trigger auditoria_no_update'
  )
})

test('PostgreSQL: Trigger auditoria_no_truncate bloquea BEFORE TRUNCATE', () => {
  assert(
    /create trigger auditoria_no_truncate\s+before truncate on public\.auditoria/i.test(migracionRf63),
    'Migración RF63 debe definir trigger auditoria_no_truncate'
  )
  assert(
    /create trigger auditoria_no_truncate\s+before truncate on public\.auditoria/i.test(bdCompleta),
    'Base de datos completa debe contener trigger auditoria_no_truncate'
  )
})

test('PostgreSQL: Función auditoria_inmutable arroja excepción con código 42501', () => {
  assert(migracionRf63.includes("raise exception 'La auditoría no se puede modificar ni borrar"), 'Debe lanzar excepción explícita')
  assert(migracionRf63.includes("using errcode = '42501'"), 'Debe emplear código de seguridad 42501')
})

test('PostgreSQL: Trigger auditoria_sello_servidor fuerza clock_timestamp() en inserción', () => {
  assert(
    /create or replace function public\.auditoria_forzar_sello_servidor\(\)/i.test(migracionRf63),
    'Debe definir función auditoria_forzar_sello_servidor'
  )
  assert(
    /new\.ocurrio_en\s*:=\s*clock_timestamp\(\)/i.test(migracionRf63),
    'Debe sobreescribir el campo con el tiempo real del motor'
  )
  assert(
    /create trigger auditoria_sello_servidor\s+before insert on public\.auditoria/i.test(migracionRf63),
    'Debe ligar el trigger before insert'
  )
})

test('PostgreSQL: Privilegios de UPDATE, DELETE y TRUNCATE están revocados a todos los roles', () => {
  assert(
    /revoke update, delete, truncate on public\.auditoria from public, anon, authenticated/i.test(migracionRf63),
    'Debe revocar explícitamente UPDATE, DELETE y TRUNCATE'
  )
})

test('PostgreSQL: RLS está activo y solo otorga permiso de SELECT a administradores', () => {
  assert(migracionInicial.includes('alter table public.auditoria enable row level security;'))
  assert(migracionInicial.includes('create policy auditoria_admin_lee on public.auditoria'))
  assert(!migracionInicial.includes('create policy auditoria_update'), 'No debe haber política de UPDATE')
  assert(!migracionInicial.includes('create policy auditoria_delete'), 'No debe haber política de DELETE')
})

// ----------------------------------------------------------------------------
// 5. INTERFAZ DE USUARIO: PROTECCIÓN DE SOLO LECTURA EN PANEL
// ----------------------------------------------------------------------------
console.log('\n--- 5. Interfaz de Usuario: Solo Lectura y Distintivo Inmutable ---')

const panelVue = fs.readFileSync(path.join(ROOT, 'src/components/RegistroAuditoriaPanel.vue'), 'utf8')

test('UI: RegistroAuditoriaPanel exhibe el distintivo oficial de Registro Inmutable Activo', () => {
  assert(panelVue.includes('Registro Inmutable Activo'), 'El panel debe mostrar el distintivo inmutable')
  assert(panelVue.includes('inmutable-badge'), 'Debe contar con la clase badge inmutable')
})

test('UI: RegistroAuditoriaPanel NO expone botones de editar ni borrar registros', () => {
  assert(!panelVue.includes('btn-delete'), 'No debe haber botón de eliminación')
  assert(!panelVue.includes('btn-editar'), 'No debe haber botón de edición')
  assert(!panelVue.includes('@click="eliminar'), 'No debe haber manejador de clic de eliminación')
  assert(!panelVue.includes('@click="editar'), 'No debe haber manejador de clic de edición')
})

// ----------------------------------------------------------------------------
// RESUMEN FINAL
// ----------------------------------------------------------------------------
console.log('\n================================================================')
console.log(`  RESUMEN DE PRUEBAS RF63:`)
console.log(`  Total: ${totalPruebas} | Pasadas: ${pruebasPasadas} | Falladas: ${pruebasFalladas}`)
console.log('================================================================\n')

if (pruebasFalladas > 0) {
  process.exit(1)
}
