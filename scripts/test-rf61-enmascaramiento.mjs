/**
 * Pruebas automatizadas para RF61:
 * "Enmascaramiento de datos personales en pantallas e informes donde no sean necesarios."
 *
 * Ejecutar con: node scripts/test-rf61-enmascaramiento.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { leerEsquemaDeMigraciones } from './lib-esquema-sql.mjs'

const leer = ruta => readFileSync(resolve(process.cwd(), ruta), 'utf8')

const m = await import('../src/utils/enmascarar.js')
const auditoria = await import('../src/services/auditoriaService.js')
const { useRevelarDatos } = await import('../src/composables/useRevelarDatos.js')

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

console.log('=== Pruebas RF61: Enmascaramiento de datos personales ===')

// ------------------------------------------------------------ reglas
probar('1. El correo muestra la primera letra y el dominio, sin revelar el largo', () => {
  assert.equal(m.enmascararCorreo('ana.perez@alu.unach.cl'), 'a***@alu.unach.cl')
  assert.equal(m.enmascararCorreo('a@unach.cl'), 'a***@unach.cl')
  assert.equal(m.enmascararCorreo('un.correo.muy.largo.de.verdad@unach.cl'), 'u***@unach.cl')
  assert.equal(m.enmascararCorreo('sin-arroba'), 's***')
  assert.equal(m.enmascararCorreo(''), '')
  assert.equal(m.enmascararCorreo(null), '')
  assert.equal(m.enmascararCorreo(undefined), '')
})

probar('2. El nombre muestra solo la inicial de cada palabra', () => {
  assert.equal(m.enmascararNombre('María José Vilches'), 'M*** J*** V***')
  assert.equal(m.enmascararNombre('Ñancupil'), 'Ñ***')
  assert.equal(m.enmascararNombre('  Pedro   Soto  '), 'P*** S***')
  assert.equal(m.enmascararNombre(''), '')
  assert.equal(m.enmascararNombre('A B C D E F'), 'A*** B*** C*** D***', 'se limita a 4 palabras')
})

probar('3. La IP conserva la red y oculta el equipo (IPv4 e IPv6)', () => {
  assert.equal(m.enmascararIp('190.20.1.4'), '190.20.*.*')
  assert.equal(m.enmascararIp('2800:3f0:1:2:3:4:5:6'), '2800:3f0:*:*:*:*:*:*')
  assert.equal(m.enmascararIp('rara'), '***')
  assert.equal(m.enmascararIp(''), '')
})

probar('4. El token muestra solo los últimos 4 caracteres', () => {
  assert.equal(m.enmascararToken('abcdef1234567890'), '****7890')
  assert.equal(m.enmascararToken('corto'), '****')
  assert.equal(m.enmascararToken(''), '')
})

probar('5. Los correos y las IP dentro de un texto también se enmascaran', () => {
  const t = 'Cuenta (ana@alu.unach.cl) bloqueada tras 5 intentos · IP: 190.20.1.4'
  const r = m.enmascararTextoLibre(t)
  assert.equal(r, 'Cuenta (a***@alu.unach.cl) bloqueada tras 5 intentos · IP: 190.20.*.*')
  assert.ok(!r.includes('ana@') && !r.includes('1.4'))
  assert.equal(m.enmascararTextoLibre('sin datos personales'), 'sin datos personales')
})

probar('6. Un objeto se enmascara según el nombre de sus claves, sin modificar el original', () => {
  const original = {
    actor_nombre: 'María José', actor_correo: 'mj@unach.cl', usuario_correo: 'pedro@alu.unach.cl',
    entidad_nombre: 'Aula de Fisiología', ip: '10.1.2.3', rol: 'profesor', fallos: 5,
    anidado: { nombre: 'Pedro Soto', nota: 'escribió a ana@unach.cl' }, lista: ['x@y.cl']
  }
  const copia = JSON.parse(JSON.stringify(original))
  const r = m.enmascararObjeto(original)
  assert.deepEqual(original, copia, 'no debe modificar el original')
  assert.equal(r.actor_nombre, 'M*** J***')
  assert.equal(r.actor_correo, 'm***@unach.cl')
  assert.equal(r.usuario_correo, 'p***@alu.unach.cl')
  assert.equal(r.ip, '10.1.*.*')
  assert.equal(r.entidad_nombre, 'Aula de Fisiología', 'un nombre de aula no es un dato personal')
  assert.equal(r.rol, 'profesor')
  assert.equal(r.fallos, 5)
  assert.equal(r.anidado.nombre, 'P*** S***')
  assert.equal(r.anidado.nota, 'escribió a a***@unach.cl')
  assert.deepEqual(r.lista, ['x***@y.cl'])
})

probar('7. mostrarDato respeta si la persona pidió ver el dato completo', () => {
  assert.equal(m.mostrarDato('ana@unach.cl', 'correo', false), 'a***@unach.cl')
  assert.equal(m.mostrarDato('ana@unach.cl', 'correo', true), 'ana@unach.cl')
  assert.equal(m.mostrarDato('', 'correo'), '')
  assert.equal(m.mostrarDato(null, 'nombre'), '')
})

// ------------------------------------------------------------ coherencia con la clasificación (RF56)
probar('8. Las columnas marcadas «enmascarar» en el catálogo tienen una regla, y solo esas', () => {
  const sql = leer('supabase/migrations/20261119000100_rf56_clasificacion_datos.sql')
  const marcadas = []
  const re = /\(\s*'(\w+)'\s*,\s*'(\w+)'\s*,\s*'(?:publico|privado|sensible_salud)'\s*,\s*(?:true|false)\s*,\s*(true|false)\s*\)/g
  let x
  while ((x = re.exec(sql))) if (x[3] === 'true') marcadas.push(`${x[1]}.${x[2]}`)
  assert.ok(marcadas.length >= 10, 'el catálogo debe marcar varias columnas (' + marcadas.length + ')')
  assert.deepEqual(Object.keys(m.MASCARA_POR_COLUMNA).sort(), [...marcadas].sort(),
    'las reglas de enmascaramiento y el catálogo deben marcar las mismas columnas')
  const esquema = leerEsquemaDeMigraciones(resolve(process.cwd(), 'supabase/migrations'))
  for (const k of marcadas) {
    const [t, c] = k.split('.')
    assert.ok(esquema.get(t)?.has(c), `${k} debe existir en la base`)
  }
  const tiposValidos = new Set([...Object.values(m.TIPOS_MASCARA), 'oculto'])
  for (const [k, tipo] of Object.entries(m.MASCARA_POR_COLUMNA)) assert.ok(tiposValidos.has(tipo), `${k}: tipo ${tipo} no válido`)
})

// ------------------------------------------------------------ auditoría: pantalla, ficha y exportación
const evCambioRol = auditoria.normalizarEventoAuditoria({
  id: 40, ocurrio_en: '2026-11-18T15:10:00Z', actor_id: 'u1', actor_nombre: 'María José Vilches', actor_correo: 'mj@unach.cl',
  accion: 'cambio_rol', entidad: 'perfiles', entidad_id: 'abc', ip: '190.20.1.4',
  detalle: { rol_antes: 'usuario', rol_despues: 'profesor', admin_antes: false, admin_despues: false,
    usuario_nombre: 'Pedro Soto Rojas', usuario_correo: 'pedro@alu.unach.cl' }
})
const evLogin = auditoria.normalizarEventoAuditoria({
  id: 41, ocurrio_en: '2026-11-18T15:20:00Z', accion: 'bloqueo_cuenta', entidad: 'perfiles',
  entidad_id: 'ana@alu.unach.cl', ip: '190.20.1.4', sospechoso: true, detalle: { fallos_correo: 5 }
})
const PERSONALES = ['María José', 'Vilches', 'mj@unach.cl', 'Pedro Soto', 'Rojas', 'pedro@alu.unach.cl', 'ana@alu.unach.cl', '190.20.1.4']

probar('9. La vista de un evento enmascara actor, usuario afectado, IP y textos', () => {
  const real = auditoria.vistaEventoAuditoria(evCambioRol, { enmascarar: false })
  assert.equal(real.actorCorreo, 'mj@unach.cl')
  assert.equal(real.ip, '190.20.1.4')
  const v = auditoria.vistaEventoAuditoria(evCambioRol, { enmascarar: true })
  assert.equal(v.actorNombre, 'M*** J*** V***')
  assert.equal(v.actorCorreo, 'm***@unach.cl')
  assert.equal(v.entidad, 'P*** S*** R*** (p***@alu.unach.cl)')
  assert.equal(v.ip, '190.20.*.*')
  assert.equal(v.detalle.usuario_correo, 'p***@alu.unach.cl')
  const l = auditoria.vistaEventoAuditoria(evLogin, { enmascarar: true })
  assert.ok(!JSON.stringify(l).includes('ana@alu'), 'el correo de un inicio de sesión no debe verse')
  assert.ok(!l.resumen.includes('190.20.1.4'))
})

probar('10. La ficha de detalle enmascarada no deja ver datos personales', () => {
  for (const ev of [evCambioRol, evLogin]) {
    const texto = JSON.stringify(auditoria.detalleLegible(ev, { enmascarar: true }))
    for (const dato of PERSONALES) assert.ok(!texto.includes(dato), `la ficha enmascarada no debe contener ${dato}`)
  }
  const completa = JSON.stringify(auditoria.detalleLegible(evCambioRol, { enmascarar: false }))
  assert.ok(completa.includes('mj@unach.cl'), 'sin enmascarar sí se ve (cuando el administrador lo muestra)')
})

probar('11. Las exportaciones salen enmascaradas salvo que el administrador haya mostrado los datos', () => {
  const csvMasc = auditoria.eventosACsv([evCambioRol, evLogin], { enmascarar: true })
  for (const dato of PERSONALES) assert.ok(!csvMasc.includes(dato), `el CSV enmascarado no debe contener ${dato}`)
  assert.ok(csvMasc.includes('m***@unach.cl'))
  const csvReal = auditoria.eventosACsv([evCambioRol, evLogin], { enmascarar: false })
  assert.ok(csvReal.includes('mj@unach.cl') && csvReal.includes('190.20.1.4'))

  const xlsx = Buffer.from(auditoria.eventosAXlsx([evCambioRol, evLogin], { enmascarar: true, generadoPor: 'Admin' })).toString('utf8')
  for (const dato of PERSONALES) assert.ok(!xlsx.includes(dato), `el Excel enmascarado no debe contener ${dato}`)
  assert.ok(xlsx.includes('Datos personales enmascarados.'))
  const xlsxReal = Buffer.from(auditoria.eventosAXlsx([evCambioRol], { enmascarar: false })).toString('utf8')
  assert.ok(xlsxReal.includes('SIN enmascarar'), 'el archivo advierte cuando trae datos reales')
})

probar('12. Mostrar datos personales es una acción auditada y de la categoría de accesos a datos', () => {
  assert.ok(auditoria.ACCIONES_AUDITADAS_DESDE_CLIENTE.includes('revelacion_datos'))
  assert.equal(auditoria.clasificarCategoriaAuditoria('revelacion_datos'), 'descarga')
  assert.equal(auditoria.ETIQUETAS_ACCION_AUDITORIA.revelacion_datos, 'Datos Personales Mostrados')
})

// ------------------------------------------------------------ mostrar datos: control con registro y tiempo
await probarAsync('13. Mostrar los datos se registra primero; si no se puede registrar, siguen enmascarados', async () => {
  const llamadas = []
  const ok = useRevelarDatos('Cuentas y roles', { duracionS: 30, registrar: async (e) => { llamadas.push(e); return { ok: true } } })
  assert.equal(ok.revelado.value, false)
  await ok.alternar()
  assert.equal(ok.revelado.value, true)
  assert.equal(ok.restante.value, 30)
  assert.equal(llamadas.length, 1)
  assert.equal(llamadas[0].accion, 'revelacion_datos')
  assert.ok(llamadas[0].resumen.includes('Cuentas y roles'))
  await ok.alternar()
  assert.equal(ok.revelado.value, false, 'se vuelve a ocultar al pedirlo')

  const falla = useRevelarDatos('X', { registrar: async () => ({ ok: false, motivo: 'servidor_rechazo' }) })
  await falla.alternar()
  assert.equal(falla.revelado.value, false)
  assert.ok(falla.error.value.includes('auditoría'))

  const explota = useRevelarDatos('X', { registrar: async () => { throw new Error('sin red') } })
  await explota.alternar()
  assert.equal(explota.revelado.value, false)
  assert.equal(explota.error.value, 'sin red')
})

await probarAsync('14. Los datos vuelven a ocultarse solos al terminar el tiempo', async () => {
  const c = useRevelarDatos('Prueba', { duracionS: 1, registrar: async () => ({ ok: true }) })
  await c.revelar()
  assert.equal(c.revelado.value, true)
  await new Promise(r => setTimeout(r, 1400))
  assert.equal(c.revelado.value, false)
  assert.equal(c.restante.value, 0)
})

// ------------------------------------------------------------ servidor
probar('15. El servidor solo deja mostrar datos al administrador y marca la repetición como sospechosa', () => {
  const sql = leer('supabase/migrations/20261120000100_rf61_enmascaramiento.sql')
  assert.match(sql, /p_accion not in \('eliminacion', 'eliminacion_aula', 'cambio_permisos', 'revelacion_datos'\)/)
  assert.match(sql, /if p_accion = 'revelacion_datos' and not public\.es_admin\(\) then/)
  assert.match(sql, /revoke all on function public\.registrar_evento_cliente\(text, text, text, jsonb\) from public, anon/)
  assert.match(sql, /grant execute on function public\.registrar_evento_cliente\(text, text, text, jsonb\) to authenticated/)
  assert.ok(sql.includes('security definer') && sql.includes("set search_path = ''"))
  assert.match(sql, /create trigger auditoria_marcar_revelaciones\s+before insert on public\.auditoria/)
  assert.ok(sql.includes('v_previas >= 4'), 'la quinta revelación en 10 minutos se marca como sospechosa')
  assert.ok(!/\b(update|delete)\s+(from\s+)?public\.auditoria\b/i.test(sql), 'la auditoría es inmutable')
  // El actor lo pone el servidor, no el navegador
  assert.ok(sql.includes("- 'actor_nombre' - 'actor_correo'"))
})

// ------------------------------------------------------------ pantallas
const sinMarcar = (texto, patron) => !patron.test(texto)

probar('16. Las pantallas del administrador usan el enmascaramiento y el control para mostrar', () => {
  const admin = leer('src/views/AdminView.vue')
  assert.ok(admin.includes('useRevelarDatos(') && admin.includes('<BotonRevelarDatos') && admin.includes('<DatoEnmascarado'))
  assert.equal(sinMarcar(admin, /\{\{\s*cuenta\.correo\s*\}\}/), true, 'la tabla de cuentas no debe mostrar el correo tal cual')
  assert.equal(sinMarcar(admin, /\{\{\s*item\.(actor|usuario)_(nombre|correo)\s*\}\}/), true, 'el historial de roles no debe mostrar datos tal cual')
  assert.equal(sinMarcar(admin, /\{\{\s*cuenta\.nombre \|\|/), true)
  const seg = leer('src/views/SeguridadAdminView.vue')
  assert.ok(seg.includes('<DatoEnmascarado') && seg.includes('useRevelarDatos('))
  assert.equal(sinMarcar(seg, /\{\{\s*s\.perfil\?\.(nombre|correo)/), true, 'las solicitudes no deben mostrar al titular tal cual')
  const panel = leer('src/components/RegistroAuditoriaPanel.vue')
  assert.ok(panel.includes('<BotonRevelarDatos') && panel.includes('vistaEventoAuditoria'))
  assert.equal(sinMarcar(panel, /\{\{\s*ev\.(actorNombre|actorCorreo|entidadNombre|ip)\s*\}\}/), true, 'el panel de auditoría debe pasar por la vista enmascarada')
  assert.ok(panel.includes('enmascarar: enmascarar.value'), 'las exportaciones siguen el estado de enmascaramiento')
})

probar('17. El profesor ve el nombre de sus estudiantes pero no su correo completo', () => {
  for (const ruta of ['src/views/AulaDetalleView.vue', 'src/views/AulasView.vue', 'src/components/PanelAvanceEnVivo.vue']) {
    const v = leer(ruta)
    assert.ok(v.includes('<DatoEnmascarado'), ruta + ' debe usar DatoEnmascarado')
    assert.equal(sinMarcar(v, /\{\{\s*(est|e|inv|intento)\.(estudiante_)?correo\s*\}\}/), true, ruta + ' no debe mostrar el correo tal cual')
    assert.equal(sinMarcar(v, /\{\{\s*\w+\.estudiante_correo\s*\}\}/), true)
  }
  const detalle = leer('src/views/AulaDetalleView.vue')
  assert.ok(/\{\{\s*est\.nombre\s*\}\}/.test(detalle), 'el nombre se sigue mostrando: el profesor lo necesita para evaluar')
})

probar('18. Ninguna pantalla nueva muestra correos sin enmascarar (salvo los datos propios y casos justificados)', () => {
  const carpeta = ['src/views', 'src/components']
  const permitidos = new Map([
    ['src/components/UserIdentifier.vue', 'datos propios de quien tiene la sesión'],
    ['src/views/MisDatosView.vue', 'datos propios de quien tiene la sesión'],
    ['src/components/InvitacionMasivaForm.vue', 'correos que el profesor acaba de escribir y debe corregir'],
    ['src/views/AdminView.vue', 'confirmación al cambiar el rol: debe verse a qué cuenta exacta se aplica'],
    ['src/components/RegistroAuditoriaPanel.vue', 'ya pasa por la vista enmascarada (vista(ev))']
  ])
  const ofensores = []
  for (const dir of carpeta) {
    for (const archivo of leerDirectorio(dir)) {
      if (!archivo.endsWith('.vue')) continue
      const ruta = `${dir}/${archivo}`
      const plantilla = leer(ruta).match(/<template>([\s\S]*)<\/template>/)
      if (!plantilla) continue
      const crudas = plantilla[1].match(/\{\{[^}]*(?:correo|email|Correo)[^}]*\}\}/g) || []
      const reales = crudas.filter(c => !c.includes('DatoEnmascarado'))
      if (reales.length && !permitidos.has(ruta)) ofensores.push(`${ruta}: ${reales.join(' ')}`)
    }
  }
  assert.deepEqual(ofensores, [], 'pantallas con correos sin enmascarar:\n' + ofensores.join('\n'))
})

probar('19. La auditoría no guarda el nombre del paciente al descargar el informe', () => {
  const pdf = leer('src/services/informePdfService.js')
  assert.ok(!/resumen:\s*`Archivo exportado: informe_pdf \(\$\{paciente/.test(pdf))
  assert.ok(pdf.includes("resumen: 'Archivo exportado: informe_pdf'"))
})

probar('20. Los componentes nuevos no usan emojis ni muestran códigos RFxx', () => {
  const regexEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}]/u
  for (const ruta of ['src/utils/enmascarar.js', 'src/composables/useRevelarDatos.js', 'src/components/DatoEnmascarado.vue',
    'src/components/BotonRevelarDatos.vue']) {
    const texto = leer(ruta)
    assert.equal(regexEmoji.test(texto), false, `${ruta} no debe tener emojis`)
    const plantilla = texto.match(/<template>([\s\S]*)<\/template>/)
    if (plantilla) assert.equal(/\bRF\d+\b/i.test(plantilla[1]), false, `${ruta} no debe mostrar RFxx`)
  }
})

import { readdirSync } from 'node:fs'
function leerDirectorio(ruta) {
  return readdirSync(resolve(process.cwd(), ruta))
}

console.log(`\nTodas las pruebas de RF61 pasaron exitosamente (${pasadas}/${pasadas}).`)
