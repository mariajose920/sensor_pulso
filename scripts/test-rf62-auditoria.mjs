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

// 4. Registro append-only de las 6 categorías y listado completo
await probarAsync('4. registrarEventoAuditoria agrega eventos sin sobrescribir los anteriores y cubre las 6 categorías', async () => {
  const listaInicial = await listarEventosAuditoria()
  const totalInicial = listaInicial.length
  assert.ok(totalInicial >= 6, 'Debe contar con eventos base para las 6 categorías')

  const nuevoLogin = await registrarEventoAuditoria({
    accion: 'login',
    actorNombre: 'Estudiante Prueba',
    actorCorreo: 'prueba@alu.unach.cl',
    entidad: 'sesiones',
    entidadNombre: 'Acceso Institucional',
    resumen: 'Inicio de sesión verificado en prueba automatizada'
  })
  assert.equal(nuevoLogin.ok, true)
  assert.equal(Object.isFrozen(nuevoLogin.evento), true)

  const nuevoRango = await registrarEventoAuditoria({
    accion: 'cambio_rangos',
    actorNombre: 'Administrador Inicial',
    actorCorreo: 'admin.general@unach.cl',
    entidad: 'rangos_fisiologicos',
    entidadNombre: 'Reposo · 18-24 años',
    resumen: 'Actualización de umbral BPM: 60–100 BPM'
  })
  assert.equal(nuevoRango.ok, true)

  const listaPosterior = await listarEventosAuditoria()
  assert.equal(listaPosterior.length, totalInicial + 2)
})

// 5. Filtrado por categoría y término de búsqueda + conteos en vivo
await probarAsync('5. filtrarEventosAuditoria y contarPorCategoria filtran y contabilizan las 6 categorías', async () => {
  const todos = await listarEventosAuditoria()
  const conteos = contarPorCategoria(todos)

  assert.equal(conteos.todos, todos.length)
  assert.ok(conteos.login >= 1)
  assert.ok(conteos.cambio_rol >= 1)
  assert.ok(conteos.cambio_rangos >= 1)
  assert.ok(conteos.descarga >= 1)
  assert.ok(conteos.publicacion >= 1)
  assert.ok(conteos.eliminacion >= 1)

  const soloRangos = filtrarEventosAuditoria(todos, { categoria: 'cambio_rangos' })
  assert.equal(soloRangos.length, conteos.cambio_rangos)
  assert.ok(soloRangos.every(e => e.categoria === 'cambio_rangos'))

  const porCorreo = filtrarEventosAuditoria(todos, {
    categoria: 'todos',
    busqueda: 'prueba@alu.unach.cl'
  })
  assert.ok(porCorreo.length >= 1)
  assert.equal(porCorreo[0].actorCorreo, 'prueba@alu.unach.cl')
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
