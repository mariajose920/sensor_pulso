/**
 * Pruebas automatizadas para RF60:
 * "Política de retención: borrado o anonimización automática de datos tras un periodo definido."
 *
 * Ejecutar con: node scripts/test-rf60-politica-retencion.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { leerEsquemaDeMigraciones } from './lib-esquema-sql.mjs'

const leer = ruta => readFileSync(resolve(process.cwd(), ruta), 'utf8')

const datos = await import('../src/data/retencion.js')
const servicio = await import('../src/services/retencionService.js')
const auditoria = await import('../src/services/auditoriaService.js')
const politica = await import('../src/data/politicaPrivacidad.js')
const clasif = await import('../src/data/clasificacionDatos.js')

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

const sql = leer('supabase/migrations/20261121000100_rf60_politica_retencion.sql')
const esquema = leerEsquemaDeMigraciones(resolve(process.cwd(), 'supabase/migrations'))

// Políticas sembradas por la migración
const bloqueSiembra = sql.slice(sql.indexOf('insert into public.politicas_retencion'), sql.indexOf('on conflict (tabla) do nothing'))
const politicas = [...bloqueSiembra.matchAll(/\('(\w+)',\s*(\d+),\s*'(borrar|anonimizar)'\)/g)]
  .map(m => ({ tabla: m[1], dias: Number(m[2]), accion: m[3] }))
const porTabla = new Map(politicas.map(p => [p.tabla, p]))

// Columna de fecha que decide si un registro venció, por tabla
const COLUMNA_FECHA = {
  lecturas: ['lecturas', 't'],
  bloques_senal: ['mediciones', 'inicio'],
  declaraciones_paciente: ['declaraciones_paciente', 'creado_en'],
  alertas: ['alertas', 'creada_en'],
  comparaciones: ['comparaciones', 'creada_en'],
  mediciones: ['mediciones', 'inicio'],
  intentos_login: ['intentos_login', 'ocurrio_en'],
  limites_peticiones: ['limites_peticiones', 'ventana'],
  bloqueos_cuenta: ['bloqueos_cuenta', 'bloqueado_hasta'],
  invitaciones_aula: ['invitaciones_aula', 'enviada_en']
}

console.log('=== Pruebas RF60: Política de retención ===')

// ------------------------------------------------------------ políticas
probar('1. La migración define una política para cada tipo de dato con vencimiento', () => {
  assert.equal(politicas.length, 10, 'se esperan 10 políticas (hay ' + politicas.length + ')')
  assert.deepEqual([...porTabla.keys()].sort(), Object.keys(COLUMNA_FECHA).sort())
  for (const p of politicas) {
    assert.ok(p.dias >= datos.LIMITE_DIAS.min && p.dias <= datos.LIMITE_DIAS.max, `${p.tabla}: plazo fuera de rango`)
  }
})

probar('2. Se puede borrar y anonimizar, y solo las mediciones se anonimizan', () => {
  const acciones = new Set(politicas.map(p => p.accion))
  assert.deepEqual([...acciones].sort(), ['anonimizar', 'borrar'], 'deben existir las dos acciones')
  assert.deepEqual(politicas.filter(p => p.accion === 'anonimizar').map(p => p.tabla), ['mediciones'])
  assert.match(sql, /check \(\(tabla = 'mediciones'\) = \(accion = 'anonimizar'\)\)/)
  assert.match(sql, /check \(dias <= 3650\)/)
  assert.match(sql, /alter table public\.mediciones alter column usuario_id drop not null/, 'una medición anonimizada queda sin titular')
})

probar('3. Cada política tiene su implementación y usa una columna de fecha que existe en la base', () => {
  const fn = sql.slice(sql.indexOf('create or replace function public.retencion_filas'), sql.indexOf('-- 3. ejecución'))
  for (const p of politicas) {
    assert.ok(fn.includes(`p_tabla = '${p.tabla}' and p_accion = '${p.accion}'`), `falta la rama de ${p.tabla}/${p.accion}`)
    const [tabla, col] = COLUMNA_FECHA[p.tabla]
    assert.ok(esquema.get(tabla)?.has(col), `${tabla}.${col} debe existir`)
    assert.ok(new RegExp(`\\b${col}\\s*<\\s*v_corte`).test(fn), `la rama de ${p.tabla} debe comparar ${col} con el corte`)
    assert.ok(esquema.get(p.tabla), `la tabla ${p.tabla} debe existir`)
  }
})

probar('4. La vista previa y la ejecución usan la misma regla (lo pendiente es lo que se aplicará)', () => {
  assert.ok(/public\.retencion_filas\(p\.tabla, p\.dias, p\.accion, false\)/.test(sql), 'la vista previa cuenta con retencion_filas')
  assert.ok(/public\.retencion_filas\(r\.tabla, r\.dias, r\.accion, true\)/.test(sql), 'la ejecución aplica con retencion_filas')
  assert.equal((sql.match(/create or replace function public\.retencion_filas/g) || []).length, 1, 'una sola definición de la regla')
})

probar('5. No se toca la auditoría, lo publicado ni la ficha propia', () => {
  const fn = sql.slice(sql.indexOf('create or replace function public.retencion_filas'), sql.indexOf('-- 3. ejecución'))
  assert.ok(!/public\.auditoria\b/.test(fn), 'la regla de retención no debe referirse a la auditoría')
  const bloques = fn.slice(fn.indexOf("p_tabla = 'bloques_senal'"), fn.indexOf("p_tabla = 'declaraciones_paciente'"))
  assert.ok(bloques.includes('not m.publica'), 'la señal de lo publicado se conserva')
  const medic = fn.slice(fn.indexOf("p_tabla = 'mediciones'"), fn.indexOf("p_tabla = 'intentos_login'"))
  assert.ok(medic.includes('not publica'), 'las mediciones publicadas no se anonimizan')
  const fichas = fn.slice(fn.indexOf("p_tabla = 'declaraciones_paciente'"), fn.indexOf("p_tabla = 'alertas'"))
  assert.ok(fichas.includes('sesion_id is not null'), 'la ficha propia (sesion_id nulo) se conserva')
  // Anonimizar corta el vínculo con la persona y limpia lo identificable
  for (const campo of ['usuario_id = null', 'nota = null', 'id_cliente = null', 'declaracion_id = null', 'sesion_id = null']) {
    assert.ok(medic.includes(campo), `anonimizar debe dejar ${campo}`)
  }
  assert.ok(!/delete from public\.mediciones/.test(sql), 'las mediciones se anonimizan, no se borran')
})

// ------------------------------------------------------------ ejecución, auditoría y permisos
probar('6. Cada ejecución queda en la auditoría con origen y detalle por tabla', () => {
  assert.match(sql, /insert into public\.auditoria \(actor_id, accion, entidad, detalle\)\s+values \(auth\.uid\(\), 'retencion', 'sistema',/)
  assert.ok(sql.includes("'origen', p_origen") && sql.includes("'por_tabla', v_por_tabla") && sql.includes("'filas', total"))
  assert.ok(sql.includes("retencion_ejecutar('automatica')") && sql.includes("retencion_ejecutar('manual')"))
  assert.ok(sql.includes('set ultima_ejecucion = now(), ultimas_filas = n'))
})

probar('7. La ejecución diaria queda agendada a las 04:00', () => {
  assert.match(sql, /cron\.schedule\('sensor_pulso_retencion', '0 4 \* \* \*', 'select public\.aplicar_retencion\(\)'\)/)
  assert.ok(sql.includes("exists (select 1 from pg_extension where extname = 'pg_cron')"), 'debe funcionar aunque pg_cron no esté activado')
})

probar('8. Solo el administrador puede ver, cambiar y aplicar la retención', () => {
  for (const fn of ['vista_previa_retencion\\(\\)', 'estado_retencion\\(\\)', 'ejecutar_retencion_ahora\\(\\)', 'actualizar_politica_retencion\\(text, integer, boolean\\)']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn} from public, anon`), fn)
    assert.match(sql, new RegExp(`grant execute on function public\\.${fn} to authenticated`), fn)
  }
  assert.ok((sql.match(/if not public\.es_admin\(\)/g) || []).length >= 4, 'cada función de administración exige es_admin()')
  for (const fn of ['retencion_filas\\(text, integer, text, boolean\\)', 'retencion_ejecutar\\(text\\)', 'aplicar_retencion\\(\\)']) {
    assert.match(sql, new RegExp(`revoke all on function public\\.${fn} from public, anon, authenticated`), `${fn} no se otorga a nadie`)
  }
  assert.ok((sql.match(/security definer/g) || []).length >= 8)
  assert.equal((sql.match(/set search_path = ''/g) || []).length, (sql.match(/security definer/g) || []).length)
})

probar('9. El plazo se valida y todo cambio de política queda auditado', () => {
  assert.ok(sql.includes('p_dias < 1 or p_dias > 3650'))
  assert.match(sql, /create trigger politicas_retencion_auditar\s+after update of dias, accion, activa on public\.politicas_retencion/)
  assert.ok(sql.includes("'cambio_retencion', 'politicas_retencion', new.tabla"))
  assert.ok(sql.includes("'antes', jsonb_build_object('dias', old.dias"))
  assert.ok(!/\b(update|delete)\s+(from\s+)?public\.auditoria\b/i.test(sql), 'la auditoría es inmutable')
})

// ------------------------------------------------------------ lo prometido a las personas coincide con la base
probar('10. La política de privacidad dice los mismos plazos que la base', () => {
  const items = politica.SECCIONES.find(s => s.id === 'plazos').lista
  const tema = {
    lecturas: /lecturas de la señal/i, bloques_senal: /Señal completa/i, alertas: /alertas fuera de rango/i,
    mediciones: /Resumen de cada medición/i, comparaciones: /comparaciones guardadas/i,
    declaraciones_paciente: /Ficha declarada/i, intentos_login: /inicio de sesión/i,
    limites_peticiones: /Contadores técnicos/i, bloqueos_cuenta: /Bloqueos temporales/i, invitaciones_aula: /Invitaciones a aulas/i
  }
  for (const p of politicas) {
    const linea = items.find(i => tema[p.tabla].test(i))
    assert.ok(linea, `la política de privacidad debe mencionar ${p.tabla}`)
    const aceptables = [datos.formatearPlazo(p.dias), `${p.dias} días`, `${Math.round(p.dias / 30.42)} meses`, `${Math.round(p.dias / 30.42)} meses`]
    assert.ok(aceptables.some(a => linea.includes(a)), `${p.tabla}: la política dice «${linea}» y la base ${p.dias} días (${aceptables[0]})`)
  }
  const texto = items.join(' ')
  assert.match(texto, /anonimiza/i)
  assert.match(texto, /galería/i, 'debe decir que lo publicado se conserva')
})

probar('11. El tratamiento por tipo (clasificación) coincide con los plazos de lo sensible y lo privado', () => {
  const t = Object.fromEntries(clasif.TRATAMIENTOS.map(x => [x.id, x]))
  assert.ok(t.conservacion.sensible_salud.includes(`${porTabla.get('lecturas').dias} días`))
  assert.match(t.conservacion.sensible_salud, /2 años/)
  assert.ok(t.conservacion.privado.includes(`${porTabla.get('intentos_login').dias} días`))
})

probar('12. Todas las políticas tienen nombre, tipo y explicación para el administrador', () => {
  for (const p of politicas) {
    const info = datos.POLITICAS_INFO[p.tabla]
    assert.ok(info?.nombre && info.detalle, `${p.tabla} necesita nombre y detalle`)
    assert.ok(['sensible_salud', 'privado'].includes(info.clase))
  }
  const sensibles = ['lecturas', 'bloques_senal', 'declaraciones_paciente', 'alertas', 'comparaciones', 'mediciones']
  for (const t of sensibles) assert.equal(datos.POLITICAS_INFO[t].clase, 'sensible_salud', t)
  assert.ok(datos.NUNCA_SE_ELIMINA.some(x => /auditor/i.test(x.titulo)), 'la auditoría figura como lo que nunca se toca')
  assert.ok(datos.NUNCA_SE_ELIMINA.some(x => /galería/i.test(x.titulo)))
})

// ------------------------------------------------------------ funciones de apoyo
probar('13. Los plazos se muestran en lenguaje natural', () => {
  assert.equal(datos.formatearPlazo(1), '1 día')
  assert.equal(datos.formatearPlazo(2), '2 días')
  assert.equal(datos.formatearPlazo(30), '30 días')
  assert.equal(datos.formatearPlazo(90), '3 meses')
  assert.equal(datos.formatearPlazo(180), '6 meses')
  assert.equal(datos.formatearPlazo(365), '12 meses')
  assert.equal(datos.formatearPlazo(730), '2 años')
  assert.equal(datos.formatearPlazo(400), '400 días')
  assert.equal(datos.formatearPlazo(0), '—')
  assert.equal(datos.formatearPlazo('x'), '—')
})

probar('14. El plazo que escribe el administrador se valida', () => {
  assert.deepEqual(datos.validarDias('365'), { ok: true, dias: 365 })
  assert.equal(datos.validarDias(' 90 ').ok, true)
  for (const malo of ['', 'abc', '0', '-5', '1.5', '3651', '99999', '12 días', null, undefined]) {
    const r = datos.validarDias(malo)
    assert.equal(r.ok, false, `«${malo}» no debe aceptarse`)
    assert.ok(r.error)
  }
  assert.equal(datos.validarDias('3650').ok, true)
  assert.equal(datos.validarDias('1').ok, true)
  assert.equal(datos.describirHorario('0 4 * * *'), 'todos los días a las 04:00')
  assert.equal(datos.describirHorario('30 23 * * *'), 'todos los días a las 23:30')
  assert.equal(datos.describirHorario('*/5 * * * *'), '*/5 * * * *')
  assert.equal(datos.describirHorario(''), '')
})

probar('15. El servicio interpreta las respuestas del servidor con valores seguros', () => {
  const p = servicio.normalizarPolitica({ tabla: 'mediciones', dias: 730, accion: 'anonimizar', activa: true, pendientes: 12, ultima_ejecucion: '2026-11-18T07:00:00Z', ultimas_filas: 3 })
  assert.deepEqual([p.nombre, p.clase, p.plazoTexto, p.accion, p.pendientes, p.ultimasFilas],
    ['Resumen de las mediciones', 'sensible_salud', '2 años', 'anonimizar', 12, 3])
  const rara = servicio.normalizarPolitica({ tabla: 'tabla_nueva', dias: '90', accion: 'otra', pendientes: -4 })
  assert.deepEqual([rara.accion, rara.pendientes, rara.activa, rara.ultimasFilas, rara.clase], ['borrar', 0, false, null, 'privado'])

  const r = servicio.resumirPoliticas([
    servicio.normalizarPolitica({ tabla: 'lecturas', dias: 365, accion: 'borrar', activa: true, pendientes: 10, ultima_ejecucion: '2026-11-17T07:00:00Z' }),
    servicio.normalizarPolitica({ tabla: 'alertas', dias: 365, accion: 'borrar', activa: false, pendientes: 99, ultima_ejecucion: '2026-11-18T07:00:00Z' }),
    servicio.normalizarPolitica({ tabla: 'mediciones', dias: 730, accion: 'anonimizar', activa: true, pendientes: 5 })
  ])
  assert.deepEqual([r.total, r.activas, r.pendientes], [3, 2, 15], 'las políticas en pausa no cuentan como pendientes')
  assert.equal(r.ultimaEjecucion, '2026-11-18T07:00:00.000Z')
  assert.equal(servicio.resumirPoliticas([]).ultimaEjecucion, null)

  const e = servicio.normalizarEstado({ cron_disponible: true, programada: true, horario: '0 4 * * *' })
  assert.deepEqual([e.cronDisponible, e.programada, e.horarioTexto], [true, true, 'todos los días a las 04:00'])
  assert.equal(servicio.normalizarEstado(null).programada, false)

  const x = servicio.normalizarEjecucion({ id: 9, ocurrio_en: '2026-11-18T07:00:00Z', detalle: { origen: 'manual', filas: 5, por_tabla: { lecturas: 3, alertas: 2, mediciones: 0 } } })
  assert.deepEqual([x.origen, x.filas, x.porTabla.map(t => t.nombre)], ['manual', 5, ['Lecturas de la medición', 'Alertas fuera de rango', 'Resumen de las mediciones']])
  assert.equal(servicio.normalizarEjecucion({ id: 1, detalle: {} }).origen, 'automatica')
})

// No requiere red: el plazo inválido se rechaza antes de llamar al servidor
const rechazado = await servicio.actualizarPolitica({ tabla: 'lecturas', dias: '0', activa: true })
const rechazado2 = await servicio.actualizarPolitica({ tabla: 'lecturas', dias: '9999', activa: true })
probar('16. El servicio rechaza un plazo inválido antes de llamar al servidor', () => {
  assert.equal(rechazado.ok, false)
  assert.match(rechazado.error, /entre 1 y 3650/)
  assert.equal(rechazado2.ok, false)
})

// ------------------------------------------------------------ auditoría
probar('17. Las ejecuciones y los cambios de retención se ven bien en la auditoría', () => {
  assert.equal(auditoria.clasificarCategoriaAuditoria('retencion'), 'eliminacion')
  assert.equal(auditoria.clasificarCategoriaAuditoria('cambio_retencion'), 'cambio_rangos')
  const ej = auditoria.normalizarEventoAuditoria({ id: 1, accion: 'retencion', entidad: 'sistema', detalle: { origen: 'automatica', filas: 120, por_tabla: { lecturas: 120 } } })
  assert.equal(ej.entidadTexto, 'Política de retención')
  assert.equal(ej.detalleTexto, 'Retención automática: 120 registro(s) eliminados o anonimizados')
  assert.equal(ej.etiquetaAccion, 'Retención de Datos')
  assert.equal(auditoria.describirActor(ej).nombre, 'Sistema', 'la ejecución diaria no tiene persona')
  const man = auditoria.normalizarEventoAuditoria({ id: 2, accion: 'retencion', entidad: 'sistema', actor_id: 'u1', detalle: { origen: 'manual', filas: 4 } })
  assert.match(man.detalleTexto, /manual \(pedida por el administrador\)/)
  const cambio = auditoria.normalizarEventoAuditoria({
    id: 3, accion: 'cambio_retencion', entidad: 'politicas_retencion', entidad_id: 'mediciones',
    detalle: { antes: { dias: 730, accion: 'anonimizar', activa: true }, despues: { dias: 365, accion: 'anonimizar', activa: false } }
  })
  assert.equal(cambio.entidadTexto, 'Retención: Mediciones')
  assert.equal(cambio.detalleTexto, 'Retención de Mediciones: plazo 730 → 365 días, política desactivada')
})

// ------------------------------------------------------------ pantalla
probar('18. El administrador tiene la pestaña Retención con plazos, pendientes, historial y excepciones', () => {
  const panel = leer('src/components/RetencionPanel.vue')
  for (const t of ['Retención de datos', 'Plazos de conservación', 'Políticas activas', 'Registros pendientes hoy', 'Última ejecución',
    'Ejecución automática', 'Aplicar la retención ahora', 'Últimas ejecuciones', 'Lo que la retención nunca toca',
    'retencion-sin-agenda', 'retencion-error', 'Reintentar', 'Editar:']) {
    assert.ok(panel.includes(t), 'el panel debe incluir: ' + t)
  }
  const vista = leer('src/views/AdminView.vue')
  assert.ok(vista.includes("id: 'retencion'") && vista.includes('<RetencionPanel') && /v-if="seccionActiva === 'retencion'"/.test(vista))
})

probar('19. Aplicar a mano exige confirmación explícita, y cambiar el plazo advierte si se acorta', () => {
  const panel = leer('src/components/RetencionPanel.vue')
  assert.ok(panel.includes(':disabled="resumen.pendientes === 0 || aplicando"'), 'no se puede aplicar si no hay pendientes')
  assert.ok(panel.includes(':disabled="!entiendo || aplicando"'), 'el botón final exige marcar la casilla')
  assert.ok(panel.includes('no se puede deshacer'))
  assert.ok(panel.includes('retencion-advertencia-acortar') && panel.includes('diasAcortados'))
  assert.ok(panel.includes('validarDias(formDias.value)'), 'el plazo se valida antes de guardar')
  assert.ok(!/supabase\s*\./.test(panel), 'el panel solo habla con el servicio, nunca directo con la base')
})

probar('20. Los textos nuevos no usan emojis ni muestran códigos RFxx', () => {
  const regexEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}]/u
  for (const ruta of ['src/data/retencion.js', 'src/services/retencionService.js', 'src/components/RetencionPanel.vue']) {
    const texto = leer(ruta)
    assert.equal(regexEmoji.test(texto), false, `${ruta} no debe tener emojis`)
    const plantilla = texto.match(/<template>([\s\S]*)<\/template>/)
    if (plantilla) assert.equal(/\bRF\d+\b/i.test(plantilla[1]), false, `${ruta} no debe mostrar RFxx`)
  }
  assert.equal(/\bRF\d+\b/i.test(JSON.stringify([datos.POLITICAS_INFO, datos.NUNCA_SE_ELIMINA, datos.ACCIONES_RETENCION])), false)
})

console.log(`\nTodas las pruebas de RF60 pasaron exitosamente (${pasadas}/${pasadas}).`)
