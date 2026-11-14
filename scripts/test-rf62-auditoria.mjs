/**
 * Pruebas automatizadas para RF62:
 * "Registro de auditoría de inicios de sesión, cambios de rol, cambios de rangos,
 *  descargas, publicaciones y eliminaciones."
 *
 * Ejecutar con: node scripts/test-rf62-auditoria.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

// Simulación de localStorage en Node para probar persistencia e inmutabilidad local
const store = new Map()
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
  clear: () => store.clear()
}

const {
  CATEGORIAS_AUDITORIA,
  ETIQUETAS_ACCION_AUDITORIA,
  clasificarCategoriaAuditoria,
  normalizarEventoAuditoria,
  registrarEventoAuditoria,
  listarEventosAuditoria,
  filtrarEventosAuditoria,
  contarPorCategoria
} = await import('../src/services/auditoriaService.js')

let pasadas = 0
function probar(nombre, fn) {
  try {
    fn()
    pasadas++
    console.log(`  [OK] ${nombre}`)
  } catch (err) {
    console.error(`  [FALLO] ${nombre}`)
    console.error(err)
    process.exit(1)
  }
}

async function probarAsync(nombre, fn) {
  try {
    await fn()
    pasadas++
    console.log(`  [OK] ${nombre}`)
  } catch (err) {
    console.error(`  [FALLO] ${nombre}`)
    console.error(err)
    process.exit(1)
  }
}

console.log('=== Pruebas RF62: Registro General de Auditoría del Sistema ===')

// 1. Categorías obligatorias de RF62
probar('1. CATEGORIAS_AUDITORIA define las 6 categorías exigidas por RF62 más "todos"', () => {
  const ids = CATEGORIAS_AUDITORIA.map(c => c.id)
  assert.deepEqual(ids, [
    'todos',
    'login',
    'cambio_rol',
    'cambio_rangos',
    'descarga',
    'publicacion',
    'eliminacion'
  ])
})

// 2. Clasificación exacta de acciones en las 6 categorías
probar('2. clasificarCategoriaAuditoria agrupa cada tipo de evento en su categoría RF62', () => {
  assert.equal(clasificarCategoriaAuditoria('login'), 'login')
  assert.equal(clasificarCategoriaAuditoria('login_fallido'), 'login')
  assert.equal(clasificarCategoriaAuditoria('bloqueo_cuenta'), 'login')

  assert.equal(clasificarCategoriaAuditoria('cambio_rol'), 'cambio_rol')
  assert.equal(clasificarCategoriaAuditoria('cambio_permisos'), 'cambio_rol')

  assert.equal(clasificarCategoriaAuditoria('cambio_rangos'), 'cambio_rangos')

  assert.equal(clasificarCategoriaAuditoria('descarga'), 'descarga')
  assert.equal(clasificarCategoriaAuditoria('exportacion_datos'), 'descarga')

  assert.equal(clasificarCategoriaAuditoria('publicacion'), 'publicacion')
  assert.equal(clasificarCategoriaAuditoria('retiro_publicacion'), 'publicacion')

  assert.equal(clasificarCategoriaAuditoria('eliminacion'), 'eliminacion')
  assert.equal(clasificarCategoriaAuditoria('supresion_datos'), 'eliminacion')
  assert.equal(clasificarCategoriaAuditoria('retiro_estudiante'), 'eliminacion')
})

// 3. Inmutabilidad de objetos normalizados (Object.freeze)
probar('3. normalizarEventoAuditoria entrega registros congelados e inmutables (solo lectura)', () => {
  const ev = normalizarEventoAuditoria({
    id: 'test-inmutable-1',
    ocurrio_en: '2026-11-11T15:00:00.000Z',
    accion: 'cambio_rol',
    actor_nombre: 'Administrador Inicial',
    actor_correo: 'admin.general@unach.cl',
    entidad: 'perfiles',
    entidad_nombre: 'Docente Demo',
    detalle: { antes: { rol: 'usuario' }, despues: { rol: 'profesor' } }
  })

  assert.equal(Object.isFrozen(ev), true)
  assert.equal(Object.isFrozen(ev.detalle), true)
  assert.equal(ev.categoria, 'cambio_rol')
  assert.equal(ev.etiquetaAccion, ETIQUETAS_ACCION_AUDITORIA.cambio_rol)
  assert.throws(() => {
    ev.accion = 'login'
  }, TypeError)
})

// 4. Auditoría solo por el servidor: nada en localStorage, sin eventos de ejemplo ni actor por defecto
await probarAsync('4. registrarEventoAuditoria no escribe en el navegador y delega en el servidor', async () => {
  store.clear()

  // Acciones que el servidor ya registra solo (trigger o función): no se duplican desde el navegador
  const login = await registrarEventoAuditoria({ accion: 'login', actorCorreo: 'prueba@alu.unach.cl' })
  assert.equal(login.ok, true)
  assert.equal(login.origen, 'servidor')
  const rango = await registrarEventoAuditoria({ accion: 'cambio_rangos', entidad: 'rangos_fisiologicos' })
  assert.equal(rango.origen, 'servidor')

  // Una acción desconocida se rechaza
  const raro = await registrarEventoAuditoria({ accion: 'accion_inventada' })
  assert.equal(raro.ok, false)
  assert.equal(raro.motivo, 'accion_no_permitida')
  const vacia = await registrarEventoAuditoria({})
  assert.equal(vacia.ok, false)

  // Una acción del navegador va a la función del servidor; sin servidor o sin sesión falla y no deja copia local
  const eliminacion = await registrarEventoAuditoria({ accion: 'eliminacion', entidad: 'mediciones', entidadId: 'x1' })
  assert.equal(eliminacion.ok, false)
  assert.equal(store.size, 0, 'No debe guardarse nada en localStorage')
})

await probarAsync('5. listarEventosAuditoria no inventa eventos de ejemplo sin servidor', async () => {
  store.clear()
  const lista = await listarEventosAuditoria()
  assert.equal(lista.length, 0, 'Sin datos del servidor no hay registros')
  assert.equal(store.size, 0)
})

probar('5b. filtrarEventosAuditoria y contarPorCategoria trabajan sobre eventos normalizados', () => {
  const eventos = [
    { id: '1', accion: 'login', ocurrio_en: '2026-11-11T10:00:00Z', entidad: 'perfiles', entidad_id: 'prueba@alu.unach.cl' },
    { id: '2', accion: 'cambio_rol', ocurrio_en: '2026-11-11T11:00:00Z', entidad: 'perfiles', detalle: { actor_correo: 'jefe@unach.cl' } },
    { id: '3', accion: 'cambio_rangos', ocurrio_en: '2026-11-11T12:00:00Z', entidad: 'rangos' },
    { id: '4', accion: 'descarga', ocurrio_en: '2026-11-11T13:00:00Z', entidad: 'descargas' },
    { id: '5', accion: 'publicacion', ocurrio_en: '2026-11-11T14:00:00Z', entidad: 'mediciones' },
    { id: '6', accion: 'eliminacion', ocurrio_en: '2026-11-11T15:00:00Z', entidad: 'mediciones' }
  ].map(normalizarEventoAuditoria)
  const conteos = contarPorCategoria(eventos)

  assert.equal(conteos.todos, eventos.length)
  for (const cat of ['login', 'cambio_rol', 'cambio_rangos', 'descarga', 'publicacion', 'eliminacion']) {
    assert.equal(conteos[cat], 1, 'Debe contar la categoría ' + cat)
  }
  const soloRangos = filtrarEventosAuditoria(eventos, { categoria: 'cambio_rangos' })
  assert.equal(soloRangos.length, 1)
  const porCorreo = filtrarEventosAuditoria(eventos, { categoria: 'todos', busqueda: 'jefe@unach.cl' })
  assert.equal(porCorreo.length, 1)
  assert.equal(porCorreo[0].actorCorreo, 'jefe@unach.cl')
})

probar('5c. El servicio ya no trae eventos de ejemplo ni actor por defecto', () => {
  const texto = readFileSync(resolve(process.cwd(), 'src/services/auditoriaService.js'), 'utf8')
  assert.equal(texto.includes('admin.general@unach.cl'), false)
  assert.equal(texto.includes('EVENTOS_SEMILLA'), false)
  assert.equal(texto.includes('localStorage'), false)
})

probar('5d. La migración registrar_evento_cliente usa auth.uid() y una lista cerrada de acciones', () => {
  const sql = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261114000100_rf62_auditoria_cliente.sql'), 'utf8')
  assert.ok(sql.includes('registrar_evento_cliente'))
  assert.ok(sql.includes('auth.uid()'))
  assert.ok(sql.includes("'eliminacion', 'eliminacion_aula', 'cambio_permisos'"))
  assert.ok(sql.includes('revoke all on function public.registrar_evento_cliente'))
  const completo = readFileSync(resolve(process.cwd(), 'supabase/sensor_pulso_base_de_datos_completa.sql'), 'utf8')
  assert.ok(completo.includes('registrar_evento_cliente'), 'La base completa debe incluir la función')
})

// 6. Integración en servicios de inicio de sesión, roles, rangos, descargas, publicaciones y eliminaciones
probar('6. Los servicios del sistema invocan registrarEventoAuditoria en las 6 categorías de RF62', () => {
  const archivosServicios = [
    ['src/services/seguridadLoginService.js', ['login_fallido', 'login']],
    ['src/services/adminService.js', ['cambio_rol', 'cambio_permisos']],
    ['src/services/rangosService.js', ['cambio_rangos']],
    ['src/utils/descargas.js', ['descarga']],
    ['src/services/informePdfService.js', ['descarga']],
    ['src/services/medicionesService.js', ['publicacion', 'retiro_publicacion', 'eliminacion']],
    ['src/services/derechosService.js', ['exportacion_datos', 'supresion_datos']]
  ]

  for (const [rutaRel, accionesEsperadas] of archivosServicios) {
    const contenido = readFileSync(resolve(process.cwd(), rutaRel), 'utf8')
    assert.ok(
      contenido.includes('registrarEventoAuditoria'),
      `El archivo ${rutaRel} debe importar e invocar registrarEventoAuditoria`
    )
    for (const acc of accionesEsperadas) {
      assert.ok(
        contenido.includes(`'${acc}'`),
        `El archivo ${rutaRel} debe auditar la acción '${acc}'`
      )
    }
  }

  const useAuthTxt = readFileSync(resolve(process.cwd(), 'src/composables/useAuth.js'), 'utf8')
  assert.ok(
    useAuthTxt.includes('registrarIntentoLogin'),
    'useAuth.js debe registrar inicios de sesión e intentos fallidos mediante registrarIntentoLogin'
  )
})

// 7. Verificación de migraciones SQL de auditoría inmutable
probar('7. Las migraciones SQL definen la tabla public.auditoria inmutable y sus triggers/RPCs', () => {
  const sqlBase = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20261027000200_auditoria_consentimiento_catalogos.sql'),
    'utf8'
  )
  const sqlTriggers = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/20261027000900_automatizaciones_vistas_derechos.sql'),
    'utf8'
  )

  assert.ok(sqlBase.includes('create table public.auditoria'))
  assert.ok(sqlBase.includes('auditoria_no_update'))
  assert.ok(sqlBase.includes('auditoria_no_truncate'))
  assert.ok(sqlBase.includes('auditar_cambio_rol'))
  assert.ok(sqlBase.includes('registrar_descarga'))
  assert.ok(sqlTriggers.includes('auditar_cambio_rangos'))
  assert.ok(sqlTriggers.includes('auditar_eliminacion'))
})

// 8. Verificación de interfaz gráfica sin códigos RF visibles ni emojis
probar('8. RegistroAuditoriaPanel.vue y AdminView.vue cumplen reglas de interfaz (sin RFxx en template y cero emojis)', () => {
  const panelVue = readFileSync(resolve(process.cwd(), 'src/components/RegistroAuditoriaPanel.vue'), 'utf8')
  const adminVue = readFileSync(resolve(process.cwd(), 'src/views/AdminView.vue'), 'utf8')

  assert.ok(panelVue.includes('Registro General de Auditoría del Sistema'))
  assert.ok(panelVue.includes('Registro Inmutable Activo'))
  assert.ok(adminVue.includes('<RegistroAuditoriaPanel'))

  for (const [nombre, codigo] of [
    ['RegistroAuditoriaPanel.vue', panelVue],
    ['AdminView.vue', adminVue]
  ]) {
    const matchTemplate = codigo.match(/<template>([\s\S]*?)<\/template>/)
    assert.ok(matchTemplate, `${nombre} debe tener bloque <template>`)
    assert.equal(
      /\bRF\d+\b/i.test(matchTemplate[1]),
      false,
      `${nombre} no debe mostrar etiquetas RFxx dentro de <template>`
    )
  }

  const regexEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}]/u
  const archivosRevisados = [
    'src/services/auditoriaService.js',
    'src/components/RegistroAuditoriaPanel.vue',
    'src/views/AdminView.vue',
    'src/services/seguridadLoginService.js',
    'src/services/adminService.js',
    'src/services/rangosService.js',
    'src/services/medicionesService.js',
    'src/services/derechosService.js',
    'src/utils/descargas.js',
    'src/services/informePdfService.js'
  ]
  for (const ruta of archivosRevisados) {
    const texto = readFileSync(resolve(process.cwd(), ruta), 'utf8')
    assert.equal(
      regexEmoji.test(texto),
      false,
      `El archivo ${ruta} no debe contener emojis`
    )
  }
})

console.log(`\nTodas las pruebas de RF62 pasaron exitosamente (${pasadas}/${pasadas}).`)
