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
  COLUMNAS_EXPORTACION,
  partesFechaLocal,
  formatearFechaLocal,
  describirActor,
  describirFiltros,
  resumirEventosExportados,
  eventosAXlsx,
  nombreArchivoExportacion,
  exportarAuditoria,
  detalleLegible,
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
const { construirXlsx, construirZip, letraColumna, serialExcel, nombreHojaSeguro } = await import('../src/utils/exportarXlsx.js')
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

probar('12. eventosACsv usa ; como separador, BOM, fecha de Chile y títulos legibles', () => {
  const ev = normalizarEventoAuditoria({
    id: 1, ocurrio_en: '2026-11-18T15:30:05Z', accion: 'bloqueo_cuenta', sospechoso: true, ip: '1.2.3.4',
    entidad_id: 'a@b.cl', detalle: { motivo_sospecha: 'x; con punto y coma' }
  })
  const csv = eventosACsv([ev])
  assert.ok(csv.startsWith('\ufeff'))
  const lineas = csv.slice(1).split('\r\n')
  assert.equal(lineas.length, 2)
  assert.equal(lineas[0].split('";"').length, COLUMNAS_EXPORTACION.length)
  assert.ok(lineas[0].includes('"Fecha y hora";"Categoría"'))
  assert.ok(lineas[1].startsWith('"18-11-2026 12:30:05"'), 'hora de Chile: ' + lineas[1].slice(0, 25))
  assert.ok(lineas[1].includes('"Sí"') && lineas[1].includes('1.2.3.4'))
  assert.ok(lineas[1].includes('"x; con punto y coma"'), 'el ; dentro de un campo queda entre comillas')
})

probar('12b. Fechas en hora de Chile y actor legible', () => {
  assert.deepEqual(partesFechaLocal('2026-11-18T15:30:05Z'), { anio: 2026, mes: 11, dia: 18, hora: 12, minuto: 30, segundo: 5 })
  assert.equal(formatearFechaLocal('2026-07-01T04:00:00Z'), '01-07-2026 00:00:00')
  assert.equal(formatearFechaLocal('no-es-fecha'), '')
  const auto = normalizarEventoAuditoria({ id: 5, accion: 'cambio_rangos', detalle: {} })
  assert.deepEqual(describirActor(auto), { nombre: 'Sistema', correo: '' })
  const persona = normalizarEventoAuditoria({ id: 6, accion: 'descarga', actor_id: 'u1', actor_nombre: 'Ana', actor_correo: 'ana@unach.cl' })
  assert.deepEqual(describirActor(persona), { nombre: 'Ana', correo: 'ana@unach.cl' })
})

probar('12c. Los filtros se describen en el informe', () => {
  assert.equal(describirFiltros({}), 'Sin filtros (todos los eventos)')
  const t = describirFiltros({ categoria: 'login', desde: '2026-11-01', soloSospechosos: true, actor: 'ana' })
  assert.ok(t.includes('Categoría: Inicios de Sesión') && t.includes('Desde: 01-11-2026') && t.includes('Usuario: ana') && t.includes('Solo eventos sospechosos'))
})

probar('12d. El resumen cuenta por categoría y por motivo', () => {
  const evs = [
    normalizarEventoAuditoria({ id: 1, accion: 'bloqueo_cuenta', sospechoso: true, ocurrio_en: '2026-11-18T10:00:00Z', detalle: { motivo_sospecha: 'Ráfaga' } }),
    normalizarEventoAuditoria({ id: 2, accion: 'login', ocurrio_en: '2026-11-17T10:00:00Z' }),
    normalizarEventoAuditoria({ id: 3, accion: 'descarga', ocurrio_en: '2026-11-18T11:00:00Z' })
  ]
  const r = resumirEventosExportados(evs)
  assert.equal(r.total, 3)
  assert.equal(r.sospechosos, 1)
  assert.equal(r.porCategoria.find(c => c.categoria === 'Inicio de Sesión').total, 2)
  assert.deepEqual(r.porMotivo, [{ motivo: 'Ráfaga', total: 1 }])
  assert.equal(r.primero, '17-11-2026 07:00:00')
})

probar('12e. El generador de Excel produce un ZIP válido con las partes obligatorias', () => {
  const bytes = construirXlsx([{ nombre: 'Hoja: 1/?', anchos: [10], filas: [{ celdas: [{ v: 'a & <b>' }, { v: 5 }] }] }])
  assert.ok(bytes instanceof Uint8Array)
  assert.equal(new DataView(bytes.buffer, bytes.byteOffset).getUint32(0, true), 0x04034b50, 'firma de ZIP')
  const texto = Buffer.from(bytes).toString('latin1')
  for (const parte of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']) {
    assert.ok(texto.includes(parte), 'falta ' + parte)
  }
  assert.ok(texto.includes('a &amp; &lt;b&gt;'), 'el texto se escapa')
  assert.equal(nombreHojaSeguro('a/b\\c?d*e[f]g:h'), 'a b c d e f g h')
  assert.equal(nombreHojaSeguro('x'.repeat(50)).length, 31)
  assert.equal(letraColumna(0), 'A')
  assert.equal(letraColumna(25), 'Z')
  assert.equal(letraColumna(26), 'AA')
  assert.equal(letraColumna(701), 'ZZ')
  assert.equal(serialExcel({ anio: 1970, mes: 1, dia: 1 }), 25569)
  assert.throws(() => construirXlsx([]))
  assert.ok(construirZip([{ nombre: 'a.txt', bytes: new TextEncoder().encode('hola') }]).length > 30)
})

probar('12f. eventosAXlsx arma las hojas Eventos y Resumen con filas sospechosas resaltadas', () => {
  const evs = [
    normalizarEventoAuditoria({ id: 1, accion: 'bloqueo_cuenta', sospechoso: true, ocurrio_en: '2026-11-18T10:00:00Z', ip: '1.2.3.4', detalle: { motivo_sospecha: 'Ráfaga' } }),
    normalizarEventoAuditoria({ id: 2, accion: 'login', ocurrio_en: '2026-11-18T09:00:00Z' })
  ]
  const bytes = eventosAXlsx(evs, { filtros: { soloSospechosos: true }, generadoPor: 'Admin Uno', generadoEn: new Date('2026-11-18T15:00:00Z'), truncadoDe: 40 })
  const texto = Buffer.from(bytes).toString('utf8')
  for (const esperado of ['name="Eventos"', 'name="Resumen"', 'Registro de auditoría', 'Admin Uno', 'Solo eventos sospechosos',
    'Se exportan los 2 más recientes de 40', 'Motivo de la alerta', '<pane ySplit="5"', '<autoFilter ref="A5:K7"', 's="7"', 'Ráfaga']) {
    assert.ok(texto.includes(esperado), 'falta ' + esperado)
  }
  assert.equal(COLUMNAS_EXPORTACION.length, 11)
  assert.match(nombreArchivoExportacion('xlsx', new Date('2026-11-18T15:30:00Z')), /^auditoria-sensor_pulso-2026-11-18_1230\.xlsx$/)
})

probar('12k. El detalle se muestra como texto legible, sin claves técnicas ni JSON', () => {
  const rol = normalizarEventoAuditoria({
    id: 40, ocurrio_en: '2026-11-18T15:10:00Z', actor_id: 'u1', actor_nombre: 'María José', actor_correo: 'mj@unach.cl',
    accion: 'cambio_rol', entidad: 'perfiles', entidad_id: 'abc',
    detalle: { rol_antes: 'usuario', rol_despues: 'profesor', admin_antes: false, admin_despues: true, motivo_sospecha: 'x', actor_nombre: 'María José' }
  })
  const f = detalleLegible(rol)
  const mapa = Object.fromEntries(f.map(c => [c.etiqueta, c.valor]))
  assert.equal(mapa['Fecha y hora'], '18-11-2026 12:10:10'.replace('12:10:10', '12:10:00'))
  assert.equal(mapa['Realizado por'], 'María José (mj@unach.cl)')
  assert.equal(mapa['Rol anterior'], 'Estudiante')
  assert.equal(mapa['Rol nuevo'], 'Profesor')
  assert.equal(mapa['Era administrador'], 'No')
  assert.equal(mapa['Es administrador ahora'], 'Sí')
  assert.equal(mapa['N.º de registro'], '40')
  for (const oculto of ['motivo_sospecha', 'actor_nombre', 'rol_antes', 'admin_despues']) {
    assert.ok(!f.some(c => c.etiqueta === oculto), 'no debe mostrarse la clave técnica ' + oculto)
  }
  const bloqueo = normalizarEventoAuditoria({ id: 41, accion: 'bloqueo_cuenta', ip: '190.20.1.4', entidad_id: 'a@b.cl', detalle: { fallos_correo: 5, fallos_ip: 6, bloqueado_hasta: '2026-11-18T15:35:00Z' } })
  const m2 = Object.fromEntries(detalleLegible(bloqueo).map(c => [c.etiqueta, c.valor]))
  assert.equal(m2['Intentos fallidos con ese correo'], '5')
  assert.equal(m2['Bloqueada hasta'], '18-11-2026 12:35:00')
  assert.equal(m2['Dirección IP'], '190.20.1.4')
  assert.equal(m2['Realizado por'], 'a (a@b.cl)')
  const rangos = normalizarEventoAuditoria({ id: 42, accion: 'cambio_rangos', detalle: { operacion: 'UPDATE', antes: { bpm_min: 60 }, despues: { bpm_min: 55, bpm_max: 100 } } })
  const m3 = Object.fromEntries(detalleLegible(rangos).map(c => [c.etiqueta, c.valor]))
  assert.equal(m3['Antes · BPM mínimo'], '60')
  assert.equal(m3['Después · BPM máximo'], '100')
  assert.equal(m3['Realizado por'], 'Sistema')
  const descarga = normalizarEventoAuditoria({ id: 43, accion: 'descarga', detalle: { tipo: 'auditoria_xlsx' } })
  assert.equal(Object.fromEntries(detalleLegible(descarga).map(c => [c.etiqueta, c.valor]))['Tipo de archivo'], 'Registro de auditoría (Excel)')
  assert.ok(!detalleLegible(descarga).some(c => /[{}\[\]"]/.test(c.valor)), 'ningún valor debe parecer JSON')
})

// Flujo completo de exportación con simulación de servidor y de descarga
const eventosDemo = [
  normalizarEventoAuditoria({ id: 1, accion: 'bloqueo_cuenta', sospechoso: true, ocurrio_en: '2026-11-18T10:00:00Z', ip: '1.2.3.4', detalle: { motivo_sospecha: 'Ráfaga' } }),
  normalizarEventoAuditoria({ id: 2, accion: 'login', ocurrio_en: '2026-11-18T09:00:00Z' })
]
const obtenerDemo = async () => ({ ok: true, eventos: eventosDemo, total: 2 })

{
  const llamadas = []
  const descargas = []
  const res = await exportarAuditoria({
    formato: 'xlsx', generadoPor: 'Admin',
    rpc: async (n, a) => { llamadas.push([n, a]); return { error: null } },
    obtener: obtenerDemo,
    descargar: (contenido, tipo, nombre) => descargas.push({ contenido, tipo, nombre })
  })
  probar('12g. Exportar Excel registra la descarga y entrega un .xlsx', () => {
    assert.equal(res.ok, true)
    assert.equal(res.cantidad, 2)
    assert.deepEqual(llamadas, [['registrar_descarga', { p_tipo: 'auditoria_xlsx', p_entidad_id: null }]])
    assert.equal(descargas.length, 1)
    assert.match(descargas[0].nombre, /^auditoria-sensor_pulso-.*\.xlsx$/)
    assert.equal(descargas[0].tipo, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    assert.ok(descargas[0].contenido instanceof Uint8Array && descargas[0].contenido.length > 1000)
  })
}
{
  const llamadas = []
  const descargas = []
  const res = await exportarAuditoria({
    formato: 'xlsx',
    rpc: async (n, a) => {
      llamadas.push(a)
      return a.p_tipo === 'auditoria_xlsx' ? { error: { message: 'Tipo de descarga no válido' } } : { error: null }
    },
    obtener: obtenerDemo,
    descargar: (c, t, nombre) => descargas.push(nombre)
  })
  probar('12h. Con la migración antigua en la base, igual se exporta y queda auditado como auditoria_csv', () => {
    assert.equal(res.ok, true)
    assert.equal(llamadas.length, 2)
    assert.deepEqual(llamadas[1], { p_tipo: 'auditoria_csv', p_entidad_id: 'xlsx' })
    assert.equal(descargas.length, 1)
  })
}
{
  const descargas = []
  const res = await exportarAuditoria({
    formato: 'xlsx',
    rpc: async () => ({ error: { message: 'permission denied for function registrar_descarga' } }),
    obtener: obtenerDemo,
    descargar: () => descargas.push(1)
  })
  probar('12i. Si el servidor no registra la descarga, no se entrega el archivo y se informa el motivo', () => {
    assert.equal(res.ok, false)
    assert.equal(res.motivo, 'auditoria_rechazada')
    assert.ok(res.error.includes('permission denied'))
    assert.equal(descargas.length, 0)
  })
}
{
  const resVacio = await exportarAuditoria({ obtener: async () => ({ ok: true, eventos: [], total: 0 }), rpc: async () => ({ error: null }) })
  const resFalla = await exportarAuditoria({ obtener: async () => ({ ok: false, error: 'sin red' }), rpc: async () => ({ error: null }) })
  const resBoom = await exportarAuditoria({
    formato: 'csv', obtener: obtenerDemo, rpc: async () => ({ error: null }),
    descargar: () => { throw new Error('el navegador bloqueó la descarga') }
  })
  const resCsv = []
  await exportarAuditoria({ formato: 'csv', obtener: obtenerDemo, rpc: async (n, a) => { resCsv.push(a.p_tipo); return { error: null } }, descargar: () => {} })
  probar('12j. Los errores se devuelven (nunca se pierden en silencio) y el CSV se registra como auditoria_csv', () => {
    assert.deepEqual([resVacio.ok, resVacio.motivo], [false, 'sin_eventos'])
    assert.deepEqual([resFalla.ok, resFalla.motivo, resFalla.error], [false, 'consulta_fallida', 'sin red'])
    assert.deepEqual([resBoom.ok, resBoom.motivo], [false, 'error_inesperado'])
    assert.ok(resBoom.error.includes('bloqueó'))
    assert.deepEqual(resCsv, ['auditoria_csv'])
  })
}

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
  assert.ok(migracion.includes("'auditoria_csv'") && migracion.includes("'auditoria_xlsx'"))
  assert.ok(/p_tipo in \('auditoria_csv','auditoria_xlsx'\) and not public\.es_admin\(\)/.test(migracion))
})

probar('17. El panel ofrece sospechosos, fechas, acción, usuario, IP, paginación, detalle, CSV y errores', () => {
  for (const texto of ['Solo sospechosos', 'type="date"', 'Usuario o correo', '>IP<', 'Anterior', 'Siguiente',
    'Ver detalle completo', 'detalle-lista', 'Ver datos técnicos', 'Exportar Excel', 'Reintentar', 'errorExportacion', 'fila-sospechosa', 'Limpiar filtros']) {
    assert.ok(panel.includes(texto), `el panel debe incluir: ${texto}`)
  }
  assert.ok(panel.includes('listarAuditoriaPaginada'))
  assert.ok(!/editarEventoAuditoria|eliminarEventoAuditoria|vaciarAuditoria|supabase\s*\.from/.test(panel), 'el panel es solo lectura')
})

probar('17b. El panel de administración se divide en pestañas y recuerda la sección en la URL', () => {
  const vista = leer('src/views/AdminView.vue')
  for (const texto of ['role="tablist"', 'role="tab"', 'role="tabpanel"', "id: 'cuentas'", "id: 'auditoria'", "id: 'rangos'", "id: 'contenidos'",
    'ruta.query.seccion', 'enrutador.replace', 'ArrowRight']) {
    assert.ok(vista.includes(texto), 'la vista debe incluir: ' + texto)
  }
  assert.ok(/v-if="seccionActiva === 'auditoria'"/.test(vista))
  assert.ok(/<RegistroAuditoriaPanel/.test(vista))
})

probar('18. La ruta /admin sigue restringida al rol administrador', () => {
  const router = leer('src/router/index.js')
  assert.match(router, /path: '\/admin',\s*name: 'Admin',\s*component: AdminView,\s*meta: \{ requiresAuth: true, roles: \[ROLES\.ADMIN\] \}/)
})

console.log(`\nTodas las pruebas de RF64 pasaron exitosamente (${pasadas}/${pasadas}).`)
