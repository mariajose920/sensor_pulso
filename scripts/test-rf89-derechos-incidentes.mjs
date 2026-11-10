// RF89 / RF90 / RF92 · ISO 27001 A.5.34, A.5.26: derechos del titular, descarga de datos, incidentes y brechas,
// con la regla de entregar solo lo necesario a estudiantes y profesores sin permiso.
// Uso: node scripts/test-rf89-derechos-incidentes.mjs
import { readFileSync } from 'node:fs'

let fallos = 0
const marcar = (ok, texto) => { if (!ok) fallos++; console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`) }
const lee = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')
process.env.CLAVE_CIFRADO_CAMPOS = (await import('node:crypto')).randomBytes(24).toString('base64') // aleatoria en cada ejecución

const D = await import('../src/services/derechosService.js')
const { cifrarFactores } = await import('../api/_lib/cifradoSalud.js')
const E = await import('../api/derechos/exportar.js')

// ---------------------------------------------------------------- Validación y plazos
marcar(D.validarSolicitud({ tipo: '', detalle: '' }) !== '', 'Sin elegir un derecho no se puede enviar')
marcar(D.validarSolicitud({ tipo: 'acceso', detalle: '' }) === '', 'Acceso no exige detalle')
marcar(D.validarSolicitud({ tipo: 'rectificacion', detalle: 'corto' }) !== '', 'Rectificación exige explicar qué se corrige')
marcar(D.validarSolicitud({ tipo: 'supresion', detalle: 'x'.repeat(1001) }) !== '', 'El detalle no puede superar 1000 caracteres')
marcar(D.TIPOS_DERECHO.map(t => t.valor).sort().join() === 'acceso,oposicion,portabilidad,rectificacion,supresion', 'Ofrece los cinco derechos del titular')
const hoy = new Date('2026-11-08T12:00:00Z')
marcar(D.textoPlazo('2026-11-20T12:00:00Z', 'recibida', hoy) === 'Vence en 12 días', 'Muestra los días que faltan para el plazo')
marcar(D.textoPlazo('2026-11-05T12:00:00Z', 'en_proceso', hoy) === 'Vencida hace 3 días', 'Marca como vencida una solicitud fuera de plazo')
marcar(D.textoPlazo('2026-11-05T12:00:00Z', 'resuelta', hoy) === '', 'Una solicitud resuelta no muestra plazo')

// ---------------------------------------------------------------- Exportación: completa para el titular, mínima en lo demás
const sobre = await cifrarFactores({ medicacion: 'Propranolol', suenoHoras: '6' })
const base64 = Buffer.from(sobre.hex.replace('\\x', ''), 'hex').toString('base64')
const crudo = {
  generado_en: '2026-11-08T12:00:00Z',
  perfil: { id: 'u1', correo: 'ana@alu.unach.cl', nombre: 'Ana', rol: 'usuario', es_admin: false, mfa_requerido: true, creado_en: '2026-01-01' },
  consentimientos: [{ usuario_id: 'u1', version: '1.0', aceptado_en: '2026-02-01' }],
  declaraciones: [{ id: 'd1', nombre: 'Ana', edad: 20, datos_cifrados_base64: base64, clave_version: 1, creado_en: '2026-02-02' }],
  mediciones: [{ id: 'm1', usuario_id: 'u1', bpm_promedio: 72 }],
  alertas: [], comparaciones: [], progreso: [], aulas: [{ usuario_id: 'u1', aula_id: 'a1' }], evaluaciones: [], solicitudes: []
}
const sal = await E.armarExportacion(crudo, { env: process.env })
marcar(E.base64AHex(base64) === sobre.hex, 'Convierte bien el bytea de base64 a hexadecimal')
marcar(sal.declaraciones_de_salud[0].ficha_de_salud?.medicacion === 'Propranolol', 'Entrega la ficha de salud descifrada en el servidor')
marcar(!('es_admin' in sal.perfil) && !('mfa_requerido' in sal.perfil) && !('id' in sal.perfil), 'El perfil no trae banderas internas ni identificadores')
marcar(sal.perfil.correo === 'ana@alu.unach.cl' && sal.perfil.nombre === 'Ana', 'El perfil sí trae lo que le sirve a la persona')
marcar(!JSON.stringify(sal).includes('usuario_id'), 'Ninguna fila repite identificadores de usuario')
marcar(sal.mediciones[0].bpm_promedio === 72, 'Entrega sus mediciones')
const sinClave = await E.armarExportacion(crudo, { env: {} })
marcar(sinClave.declaraciones_de_salud[0].ficha_de_salud === null && sinClave.ficha_no_disponible === true && !JSON.stringify(sinClave).includes('Propranolol'), 'Sin clave en el servidor no entrega la ficha ni la inventa')

// Handler de exportación
const resp = () => ({ statusCode: 200, headers: {}, cuerpo: '', setHeader(n, v) { this.headers[n.toLowerCase()] = v }, end(d) { this.cuerpo = d || '' } })
let res = resp(); await E.crearHandler({ verificar: async () => null })({ method: 'POST', headers: {} }, res)
marcar(res.statusCode === 401, 'La exportación exige sesión (401)')
res = resp(); await E.crearHandler({ verificar: async () => null })({ method: 'GET', headers: {} }, res)
marcar(res.statusCode === 405, 'La exportación solo acepta POST (405)')
let rpcLlamado = ''
res = resp()
await E.crearHandler({ verificar: async () => ({ usuario: { id: 'u1' }, db: { rpc: async (n) => { rpcLlamado = n; return { data: crudo, error: null } } } }) })({ method: 'POST', headers: {} }, res)
marcar(res.statusCode === 200 && rpcLlamado === 'exportar_mis_datos' && JSON.parse(res.cuerpo).exportacion.perfil.nombre === 'Ana', 'Con sesión exporta usando la función de la base que audita la descarga')
marcar(/attachment/.test(res.headers['content-disposition']) && res.headers['cache-control'] === 'no-store', 'La descarga es un archivo y no se guarda en cachés')
res = resp()
await E.crearHandler({ verificar: async () => ({ usuario: { id: 'u1' }, db: { rpc: async () => ({ data: null, error: { message: 'detalle interno de la base' } }) } }) })({ method: 'POST', headers: {} }, res)
marcar(res.statusCode === 500 && !res.cuerpo.includes('detalle interno'), 'Un error de la base no se filtra al usuario')

// ---------------------------------------------------------------- Mínimo necesario: consultas, rutas y menús
const servicio = lee('../src/services/derechosService.js')
marcar(!/select\(\s*['"`]\*['"`]/.test(servicio), 'Ninguna consulta pide todas las columnas (select *)')
const adminSel = servicio.slice(servicio.indexOf('async solicitudesAdmin'), servicio.indexOf('async resolverSolicitud'))
marcar(/perfiles!usuario_id\(nombre, correo\)/.test(adminSel) && !/es_admin|rol|mfa/.test(adminSel), 'El administrador ve de quien pide solo nombre y correo')
marcar(/\.eq\('usuario_id', u\.id\)/.test(servicio), 'El titular consulta únicamente sus propias solicitudes')

const router = lee('../src/router/index.js')
const bloqueRuta = (nombre) => { const i = router.indexOf(`name: '${nombre}'`); return i < 0 ? '' : router.slice(router.lastIndexOf('{', i), router.indexOf('},', i) + 2) }
marcar(/requiresAuth: true/.test(bloqueRuta('MisDatos')) && !/roles:/.test(bloqueRuta('MisDatos')), '«Mis datos» exige sesión y sirve a cualquier rol (solo ve lo suyo)')
marcar(/roles: \[ROLES\.ADMIN\]/.test(bloqueRuta('SeguridadAdmin')) && !/PROFESOR/.test(bloqueRuta('SeguridadAdmin')), 'Seguridad e incidentes es solo del administrador (ni profesores ni estudiantes)')
const app = lee('../src/App.vue')
marcar(/if \(isAdmin\.value\) lista\.push\(\{ to: '\/admin\/seguridad'/.test(app), 'El menú de seguridad solo aparece al administrador')
marcar(/v-if="isAuthenticated"> · <router-link to="\/mis-datos"/.test(app), 'El enlace «Mis datos» solo aparece con sesión')

// ---------------------------------------------------------------- Pantallas y base de datos
const misDatos = lee('../src/views/MisDatosView.vue')
for (const id of ['descargar-datos', 'nueva-solicitud', 'mis-solicitudes', 'acciones-delicadas', 'eliminar-confirmar']) {
  marcar(misDatos.includes(`data-testid="${id}"`), `«Mis datos» tiene ${id}`)
}
marcar(/textoConfirmar !== 'BORRAR'/.test(misDatos), 'Borrar los datos exige escribir BORRAR')
const admin = lee('../src/views/SeguridadAdminView.vue')
marcar(/data-testid="panel-solicitudes"/.test(admin) && /data-testid="panel-incidentes"/.test(admin), 'La pantalla de administración tiene solicitudes e incidentes')
marcar(/v-if="i\.afecta_datos_personales"/.test(admin) && /autoridad_notificada_en/.test(admin), 'La brecha se registra solo si afecta datos personales y guarda la notificación a la autoridad')
const mig = lee('../supabase/migrations/20261108000200_derechos_incidentes_integridad.sql')
marcar(/derechos_resolver/.test(mig) && /No se puede modificar el contenido de la solicitud/.test(mig), 'La base impide que se reescriba lo que pidió la persona')
marcar(/derechos_limite/.test(mig) && />= 5/.test(mig), 'La base limita a 5 las solicitudes abiertas por persona')
marcar(/brechas_un_registro_por_incidente/.test(mig) && /incidentes_auditoria/.test(mig) && /brechas_auditoria/.test(mig), 'Incidentes y brechas quedan auditados, una brecha por incidente')
const rls = lee('../supabase/migrations/20261027000700_seguridad_cumplimiento.sql')
marcar(/incidentes_admin[^;]*es_admin/s.test(rls) && /brechas_admin[^;]*es_admin/s.test(rls), 'La base ya restringe incidentes y brechas al administrador (RLS)')
marcar(/derechos_propios_ver[^;]*usuario_id = \(select auth\.uid\(\)\) or/s.test(rls), 'La base ya limita cada solicitud a su titular o al administrador (RLS)')

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1) }
console.log('\nRF89/RF92: todas las pruebas pasaron')
