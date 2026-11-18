/**
 * Pruebas automatizadas para RF64:
 * "Panel para que el administrador revise los registros y filtre eventos sospechosos."
 *
 * Ejecutar con: node scripts/test-rf64-panel-auditoria.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const {
  CATEGORIAS_AUDITORIA,
  accionesDeCategoria,
  fechaAIso,
  construirParametrosListado,
  resumenACategorias,
  celdaCsvSegura,
  eventosACsv,
  COLUMNAS_CSV_AUDITORIA,
  normalizarEventoAuditoria,
  filtrarEventosAuditoria,
  clasificarCategoriaAuditoria
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

const leer = ruta => readFileSync(resolve(process.cwd(), ruta), 'utf8')
const migracion = leer('supabase/migrations/20261118000100_rf64_panel_auditoria.sql')
const panel = leer('src/components/RegistroAuditoriaPanel.vue')

console.log('=== Pruebas RF64: Panel de revisión de auditoría ===')

probar('1. Una categoría se traduce a la lista de acciones del servidor', () => {
  assert.deepEqual(accionesDeCategoria('todos'), [])
  assert.deepEqual(accionesDeCategoria('inexistente'), [])
  assert.ok(accionesDeCategoria('login').includes('bloqueo_cuenta'))
  const elim = accionesDeCategoria('eliminacion')
  for (const a of ['eliminacion', 'eliminacion_aula', 'supresion_datos', 'retiro_estudiantes']) {
    assert.ok(elim.includes(a), `eliminacion debe incluir ${a}`)
  }
})

probar('2. Toda acción que registra el servidor cae en su categoría (no hay acciones huérfanas)', () => {
  const esperado = {
    login: 'login', login_fallido: 'login', bloqueo_cuenta: 'login',
    cambio_rol: 'cambio_rol', cambio_permisos: 'cambio_rol', cambio_rangos: 'cambio_rangos',
    descarga: 'descarga', exportacion_datos: 'descarga',
    publicacion: 'publicacion', retiro_publicacion: 'publicacion',
    eliminacion: 'eliminacion', eliminacion_aula: 'eliminacion',
    retiro_estudiantes: 'eliminacion', supresion_datos: 'eliminacion'
  }
  for (const [accion, cat] of Object.entries(esperado)) {
    assert.equal(clasificarCategoriaAuditoria(accion), cat, accion)
    if (cat !== 'login' || accion !== 'login') {
      assert.ok(CATEGORIAS_AUDITORIA.find(c => c.id === cat).acciones.includes(accion), `${accion} listada en ${cat}`)
    }
  }
})

probar('3. fechaAIso valida el formato y cubre el día completo', () => {
  assert.equal(fechaAIso(''), null)
  assert.equal(fechaAIso('18/11/2026'), null)
  assert.equal(fechaAIso("2026-11-18'; drop table auditoria;--"), null)
  const ini = new Date(fechaAIso('2026-11-18', false))
  const fin = new Date(fechaAIso('2026-11-18', true))
  assert.equal(ini.getHours(), 0)
  assert.equal(fin.getHours(), 23)
  assert.equal(fin.getMinutes(), 59)
})

probar('4. Los filtros del panel se convierten en parámetros de listar_auditoria', () => {
  const p = construirParametrosListado({
    categoria: 'login', soloSospechosos: true, actor: ' ana@unach.cl ', ip: '190.20.', busqueda: ' bloqueo ',
    pagina: 3, porPagina: 25
  })
  assert.deepEqual(p.p_acciones, ['login', 'bloqueo_cuenta', 'login_fallido'])
  assert.equal(p.p_solo_sospechosos, true)
  assert.equal(p.p_actor, 'ana@unach.cl')
  assert.equal(p.p_ip, '190.20.')
  assert.equal(p.p_busqueda, 'bloqueo')
  assert.equal(p.p_limite, 25)
  assert.equal(p.p_desplazamiento, 50)
})

probar('5. Una acción concreta tiene prioridad sobre la categoría', () => {
  const p = construirParametrosListado({ categoria: 'login', accion: 'cambio_rangos' })
  assert.deepEqual(p.p_acciones, ['cambio_rangos'])
})

probar('6. Sin filtros se piden todas las acciones, sin sospechosos y la primera página', () => {
  const p = construirParametrosListado()
  assert.equal(p.p_acciones, null)
  assert.equal(p.p_actor, null)
  assert.equal(p.p_ip, null)
  assert.equal(p.p_busqueda, null)
  assert.equal(p.p_desde, null)
  assert.equal(p.p_hasta, null)
  assert.equal(p.p_solo_sospechosos, false)
  assert.equal(p.p_desplazamiento, 0)
})

probar('7. Rango de fechas invertido se corrige y la página/tamaño se acotan', () => {
  const p = construirParametrosListado({ desde: '2026-11-20', hasta: '2026-11-10', pagina: -4, porPagina: 99999 })
  assert.ok(p.p_desde < p.p_hasta, 'desde debe ser anterior a hasta')
  assert.equal(new Date(p.p_desde).getDate(), 10)
  assert.equal(new Date(p.p_hasta).getDate(), 20)
  assert.equal(p.p_limite, 200)
  assert.equal(p.p_desplazamiento, 0)
})

probar('8. El resumen del servidor se convierte en contadores por categoría y sospechosos', () => {
  const c = resumenACategorias({
    total: 40, sospechosos: 4,
    por_accion: { login: 10, login_fallido: 5, bloqueo_cuenta: 2, cambio_rol: 3, retiro_estudiantes: 4, eliminacion_aula: 1 }
  })
  assert.equal(c.todos, 40)
  assert.equal(c.sospechosos, 4)
  assert.equal(c.login, 17)
  assert.equal(c.cambio_rol, 3)
  assert.equal(c.eliminacion, 5)
  assert.equal(c.descarga, 0)
  assert.deepEqual(resumenACategorias({}).todos, 0)
})

probar('9. El filtro "solo sospechosos" deja únicamente los eventos marcados', () => {
  const evs = [
    normalizarEventoAuditoria({ id: 1, accion: 'login', sospechoso: false }),
    normalizarEventoAuditoria({ id: 2, accion: 'bloqueo_cuenta', sospechoso: true }),
    normalizarEventoAuditoria({ id: 3, accion: 'cambio_rol', sospechoso: true, detalle: { motivo_sospecha: 'Se otorgó el privilegio de administrador' } })
  ]
  const sosp = filtrarEventosAuditoria(evs, { soloSospechosos: true })
  assert.deepEqual(sosp.map(e => e.id), ['2', '3'])
  assert.equal(sosp[1].motivoSospecha, 'Se otorgó el privilegio de administrador')
  assert.equal(filtrarEventosAuditoria(evs, { soloSospechosos: true, categoria: 'login' }).length, 1)
})

probar('10. La normalización toma actor, nombre y correo que entrega el servidor', () => {
  const ev = normalizarEventoAuditoria({
    id: 9, accion: 'descarga', actor_nombre: 'Ana Pérez', actor_correo: 'ana@unach.cl', ip: '190.20.1.4',
    detalle: { tipo: 'auditoria_csv' }
  })
  assert.equal(ev.actorNombre, 'Ana Pérez')
  assert.equal(ev.actorCorreo, 'ana@unach.cl')
  assert.equal(ev.ip, '190.20.1.4')
  assert.equal(ev.entidadTexto, 'Registro de Auditoría CSV')
})

probar('11. El CSV neutraliza fórmulas y escapa comillas', () => {
  assert.equal(celdaCsvSegura('=HYPERLINK("http://x")'), `"'=HYPERLINK(""http://x"")"`)
  assert.equal(celdaCsvSegura('+1'), `"'+1"`)
  assert.equal(celdaCsvSegura('@cmd'), `"'@cmd"`)
  assert.equal(celdaCsvSegura(null), '""')
  assert.equal(celdaCsvSegura('normal, con coma'), '"normal, con coma"')
})

probar('12. eventosACsv incluye encabezado, BOM y una fila por evento', () => {
  const ev = normalizarEventoAuditoria({ id: 1, accion: 'bloqueo_cuenta', sospechoso: true, ip: '1.2.3.4', entidad_id: 'a@b.cl', detalle: { motivo_sospecha: 'x' } })
  const csv = eventosACsv([ev])
  assert.ok(csv.startsWith('﻿'))
  const lineas = csv.slice(1).split('\r\n')
  assert.equal(lineas.length, 2)
  assert.equal(lineas[0].split('","').length, COLUMNAS_CSV_AUDITORIA.length)
  assert.ok(lineas[1].includes('"Sí"'))
  assert.ok(lineas[1].includes('1.2.3.4'))
})

probar('13. La migración marca sospechosos con reglas del servidor y no se puede saltar', () => {
  assert.match(migracion, /create trigger auditoria_marcar_sospechoso\s+before insert on public\.auditoria/i)
  for (const regla of ['login_fallido', 'admin_despues', 'exportacion_datos', 'supresion_datos', 'America/Santiago']) {
    assert.ok(migracion.includes(regla), `falta la regla ${regla}`)
  }
  assert.ok(migracion.includes('motivo_sospecha'))
  assert.ok(!/\bupdate\s+public\.auditoria\b/i.test(migracion), 'no debe editar registros existentes (RF63)')
  assert.ok(!/\bdelete\s+from\s+public\.auditoria\b/i.test(migracion), 'no debe borrar registros (RF63)')
})

probar('14. Las funciones de lectura exigen administrador y no se otorgan a anon', () => {
  assert.equal((migracion.match(/if not public\.es_admin\(\)/g) || []).length >= 2, true)
  assert.match(migracion, /revoke all on function public\.listar_auditoria\([^)]*\) from public, anon/)
  assert.match(migracion, /revoke all on function public\.resumen_auditoria\([^)]*\) from public, anon/)
  assert.match(migracion, /grant execute on function public\.listar_auditoria\([^)]*\) to authenticated/)
  assert.ok(migracion.includes('security definer'))
  assert.ok(migracion.includes("set search_path = ''"))
})

probar('15. La búsqueda escapa los comodines para que el texto se busque literalmente', () => {
  assert.ok(migracion.includes("replace(replace(replace(v_busqueda"), 'la búsqueda libre debe escaparse')
  assert.ok(migracion.includes("'\\%'"))
  assert.ok(migracion.includes('greatest(1, least(coalesce(p_limite, 50), 200))'))
})

probar('16. Exportar el registro queda auditado y es solo para administrador', () => {
  assert.ok(migracion.includes("'auditoria_csv'"))
  assert.ok(/p_tipo = 'auditoria_csv' and not public\.es_admin\(\)/.test(migracion))
})

probar('17. El panel ofrece sospechosos, fechas, acción, usuario, IP, paginación, detalle, CSV y errores', () => {
  for (const texto of ['Solo sospechosos', 'type="date"', 'Usuario o correo', '>IP<', 'Anterior', 'Siguiente',
    'Ver detalle completo', 'Exportar CSV', 'Reintentar', 'fila-sospechosa', 'Limpiar filtros']) {
    assert.ok(panel.includes(texto), `el panel debe incluir: ${texto}`)
  }
  assert.ok(panel.includes('listarAuditoriaPaginada'))
  assert.ok(!/editarEventoAuditoria|eliminarEventoAuditoria|vaciarAuditoria|supabase\s*\.from/.test(panel), 'el panel es solo lectura')
})

probar('18. La ruta /admin sigue restringida al rol administrador', () => {
  const router = leer('src/router/index.js')
  assert.match(router, /path: '\/admin',\s*name: 'Admin',\s*component: AdminView,\s*meta: \{ requiresAuth: true, roles: \[ROLES\.ADMIN\] \}/)
})

console.log(`\nTodas las pruebas de RF64 pasaron exitosamente (${pasadas}/${pasadas}).`)
