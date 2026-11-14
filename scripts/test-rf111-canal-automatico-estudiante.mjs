// RF111 · El estudiante recibe su canal automáticamente con un botón (igual que el profesor), sin elegir el número.
// Uso: node scripts/test-rf111-canal-automatico-estudiante.mjs
import { readFileSync, existsSync } from 'node:fs'
import { evaluarAsignacionEstudiante, siguienteCanalLibre } from '../src/utils/canalesMultiples.js'
import { supabase } from '../src/services/supabase.js'
import { canalesState, usuarioActual, miCanalAsignado, asignarmeCanalConFicha, estadoAsignacionEstudiante, requisitosCanales, asignarCanalAutomaticoEstudiante, FaltaRequisitoCanal } from '../src/services/canalesService.js'
import { pacienteService } from '../src/services/pacienteService.js'
import { consentimientoEstado } from '../src/services/consentimientoService.js'
import { POLITICA_VERSION } from '../src/data/politicaPrivacidad.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}

const libres = () => [1, 2, 3, 4, 5].map((canal) => ({ canal, usuario_id: null, usuario_nombre: null, usuario_email: null, asignado_en: null }))
const ocupar = (canales, canal, id) => canales.map((c) => (c.canal === canal ? { ...c, usuario_id: id, asignado_en: '2026-11-13T10:00:00Z' } : c))

// --- Estado del botón
let e = evaluarAsignacionEstudiante({ rol: 'estudiante', canales: libres(), usuarioId: 'u1' })
marcar(e.visible && e.puede, 'Un estudiante sin canal ve el botón y puede usarlo')
e = evaluarAsignacionEstudiante({ rol: 'usuario', canales: libres(), usuarioId: 'u1' })
marcar(e.visible && e.puede, 'También con el rol «usuario» de la base')
e = evaluarAsignacionEstudiante({ rol: 'estudiante', canales: ocupar(libres(), 2, 'u1'), usuarioId: 'u1' })
marcar(e.visible && !e.puede && e.asignado === 2 && /Ya tienes el Canal 2/.test(e.motivo), 'Con un canal ya asignado, el botón no sirve y lo dice')
let todos = libres()
for (const n of [1, 2, 3, 4, 5]) todos = ocupar(todos, n, 'otro-' + n)
e = evaluarAsignacionEstudiante({ rol: 'estudiante', canales: todos, usuarioId: 'u1' })
marcar(e.visible && !e.puede && /No quedan canales libres/.test(e.motivo), 'Sin canales libres, se explica que hay que esperar la siguiente ronda')
marcar(!evaluarAsignacionEstudiante({ rol: 'profesor', canales: libres(), usuarioId: 'p1' }).visible && !evaluarAsignacionEstudiante({ rol: 'admin', canales: libres(), usuarioId: 'a1' }).visible, 'Profesor y administrador no ven el botón del estudiante (tienen «Agregar canal»)')
marcar(siguienteCanalLibre(ocupar(ocupar(libres(), 1, 'x'), 2, 'y')) === 3, 'Se toma siempre el siguiente canal libre, el de número más bajo')

// --- Asignación automática con la ficha del paciente (sin base: en memoria)
const rpcOriginal = supabase.rpc
supabase.rpc = async () => { throw new Error('sin red') }
usuarioActual.id = 'usr-estudiante-01'
usuarioActual.rol = 'estudiante'
const ficha = { nombre: 'María Vilches', edad: 22, fechaNacimiento: '2004-03-10', nivelEstres: 'bajo', suenoHoras: '7_8', cafeina: 'ninguna', medicacionTipo: 'ninguna', medicacionDetalle: '', actividadPrevia: 'reposo', condicionSalud: 'Ninguna conocida' }
const datos = { ficha, politicaVersion: POLITICA_VERSION, consentimientoVersion: '1.0' }
const intentar = async (args) => { try { return { r: await asignarmeCanalConFicha(args) } } catch (err) { return { error: err } } }

canalesState.canales = ocupar(ocupar(libres(), 1, 'otro-1'), 2, 'otro-2')
let res = await intentar({ ...datos, ficha: { ...ficha, nivelEstres: '' } })
marcar(res.error && !miCanalAsignado.value, 'Sin el nivel de estrés tampoco')
res = await intentar({ ...datos, politicaVersion: '0.0' })
marcar(res.error && /términos|política/.test(res.error.message) && !miCanalAsignado.value, 'Sin aceptar los términos y la política vigente no se asigna')
res = await intentar({ ...datos, consentimientoVersion: '' })
marcar(res.error && /consentimiento/.test(res.error.message) && !miCanalAsignado.value, 'Sin el consentimiento informado no se asigna')

usuarioActual.nombre = 'Adán Ramos'
res = await intentar({ ...datos, ficha: { ...ficha, nombre: 'Otra Persona' } })
marcar(res.r?.ok && requisitosCanales[res.r.canal]?.ficha?.nombre === 'Adán Ramos', 'El estudiante no puede medir a otra persona: el nombre de la ficha se fuerza al de su cuenta')
// se libera para seguir con el resto de las pruebas
for (const c of canalesState.canales) if (c.usuario_id === usuarioActual.id) { c.usuario_id = null }
delete requisitosCanales[res.r.canal]
res = await intentar(datos)
marcar(res.r?.ok && res.r.canal === 3 && miCanalAsignado.value === 3, 'Con ficha, términos y consentimiento, el sistema le asigna el siguiente canal libre (el 3)')
marcar(canalesState.canales.find((c) => c.canal === 3).usuario_id === usuarioActual.id, 'El canal queda a nombre de su cuenta')
marcar(requisitosCanales[3]?.ficha?.nombre === usuarioActual.nombre && requisitosCanales[3]?.politicaVersion === POLITICA_VERSION && requisitosCanales[3]?.consentimientoVersion === '1.0', 'Quedan guardados los datos del paciente, la política y el consentimiento de ese canal')
marcar(requisitosCanales[3]?.ficha?.nombre === usuarioActual.nombre, 'Aunque escriba otro nombre, la ficha queda a nombre del propio estudiante')
res = await intentar(datos)
marcar(res.error && /Ya tienes el Canal 3|Ya tienes/.test(res.error.message), 'No se le asigna un segundo canal')
marcar(estadoAsignacionEstudiante.value.visible && !estadoAsignacionEstudiante.value.puede, 'El estado del botón se actualiza al tener canal')
canalesState.canales = todos
delete requisitosCanales[3]
res = await intentar(datos)
marcar(res.error && /No quedan canales libres/.test(res.error.message), 'Si no queda ningún canal libre, avisa en vez de asignar')
usuarioActual.rol = 'profesor'
canalesState.canales = libres()
res = await intentar(datos)
marcar(res.error && /Agregar canal/.test(res.error.message), 'El profesor no usa este botón: tiene «Agregar canal»')
usuarioActual.rol = 'estudiante'
supabase.rpc = rpcOriginal

// --- La base: función del estudiante
const sql = readFileSync(new URL('../supabase/migrations/20261113000500_rf111_canal_estudiante_con_ficha.sql', import.meta.url), 'utf8')
marcar(sql.includes('create or replace function public.asignar_canal_estudiante'), 'Existe la función de la base para que el estudiante tome su canal')
marcar(sql.includes('Falta la ficha del paciente de este canal (RF03)') && sql.includes('política de privacidad vigente (RF88)') && sql.includes('consentimiento informado vigente (RF04)'), 'La base exige la ficha, la política y el consentimiento')
marcar(sql.includes('d.usuario_id = v_uid') && sql.includes('es_miembro_activo(v_aula)'), 'La ficha debe ser del propio estudiante y debe pertenecer al aula de la sesión')
marcar(sql.includes('for update skip locked') && sql.includes('order by canal limit 1'), 'Toma el siguiente canal libre sin que dos estudiantes tomen el mismo')
marcar(sql.includes('Ya tienes un canal en esta sesión'), 'Un estudiante solo puede tener un canal por sesión')
marcar(sql.includes('insert into public.sesion_canal_requisitos'), 'Deja constancia de los requisitos del canal')
marcar(sql.includes('revoke all on function public.asignar_canal_estudiante(uuid, uuid, text, text) from public, anon') && sql.includes('to authenticated'), 'La función solo se ofrece a usuarios con sesión')
marcar(readFileSync(new URL('../supabase/sensor_pulso_base_de_datos_completa.sql', import.meta.url), 'utf8').includes('asignar_canal_estudiante'), 'La base completa incluye la función del estudiante')

// --- La pantalla
marcar(!existsSync(new URL('../src/components/VinculacionCanales.vue', import.meta.url)), 'El panel antiguo «Asignación de Canales ESP32 por Cuenta» (los 5 canales con «Tomar este Canal» y la ronda) ya no existe')
const modal = readFileSync(new URL('../src/components/AgregarCanalModal.vue', import.meta.url), 'utf8')
marcar(/precargarFichaPropia/.test(modal) && /obtenerDeclaracionActiva/.test(modal), 'La ficha del estudiante parte de la que ya tiene guardada para no escribirla de nuevo')

// --- Canal automático del estudiante: sin botones, con su ficha ya guardada
const rpcOriginal2 = supabase.rpc
supabase.rpc = async () => { throw new Error('sin red') }
const fichaOriginal = pacienteService.obtenerDeclaracionActiva
usuarioActual.rol = 'estudiante'
usuarioActual.id = 'usr-estudiante-01'
usuarioActual.nombre = 'Adán Ramos'
const fichaGuardada = { ...ficha, id: 'ficha-local-1', nombre: 'Adán Ramos', estadoLectura: 'completa' }
const fallaCon = async () => { try { await asignarCanalAutomaticoEstudiante(); return null } catch (err) { return err } }
const quitarCanal = () => { for (const c of canalesState.canales) if (c.usuario_id === usuarioActual.id) c.usuario_id = null; for (const k of Object.keys(requisitosCanales)) delete requisitosCanales[k] }

canalesState.canales = ocupar(libres(), 1, 'otro-1')
consentimientoEstado.value = { ...consentimientoEstado.value, vigente: true, version: '1.0' }

pacienteService.obtenerDeclaracionActiva = async () => null
let err2 = await fallaCon()
marcar(err2 instanceof FaltaRequisitoCanal && err2.requisito === 'ficha' && !miCanalAsignado.value, 'Sin ficha guardada no se asigna el canal y se pide completar la ficha (paso 2)')
pacienteService.obtenerDeclaracionActiva = async () => ({ ...fichaGuardada, incompleta: true, estadoLectura: 'incompleta' })
err2 = await fallaCon()
marcar(err2 instanceof FaltaRequisitoCanal && err2.requisito === 'ficha', 'Con la ficha guardada pero ilegible tampoco se asigna')
pacienteService.obtenerDeclaracionActiva = async () => fichaGuardada
consentimientoEstado.value = { ...consentimientoEstado.value, vigente: false }
err2 = await fallaCon()
marcar(err2 instanceof FaltaRequisitoCanal && err2.requisito === 'consentimiento' && !miCanalAsignado.value, 'Sin el consentimiento informado no se asigna y se lleva a ese paso')
consentimientoEstado.value = { ...consentimientoEstado.value, vigente: true }

const guardarOriginal = pacienteService.guardarDeclaracion
let seGuardoOtraFicha = false
pacienteService.guardarDeclaracion = async () => { seGuardoOtraFicha = true; return { ok: true } }
const auto = await asignarCanalAutomaticoEstudiante()
marcar(auto.ok && auto.canal === 2 && miCanalAsignado.value === 2, 'Con su ficha y el consentimiento, el canal se asigna solo (el siguiente libre: el 2)')
marcar(requisitosCanales[2]?.ficha?.nombre === 'Adán Ramos' && requisitosCanales[2]?.declaracionId === null, 'El canal queda con los datos de su propia ficha')
marcar(!seGuardoOtraFicha, 'No guarda ni modifica la ficha: solo la usa')
const otraVez = await asignarCanalAutomaticoEstudiante()
marcar(otraVez.yaTenia && otraVez.canal === 2, 'Si ya tiene canal no se le asigna otro')
pacienteService.guardarDeclaracion = guardarOriginal
quitarCanal()
usuarioActual.rol = 'profesor'
err2 = await fallaCon()
marcar(err2 && /Agregar canal/.test(err2.message), 'El profesor no usa la asignación automática del estudiante')
usuarioActual.rol = 'estudiante'
canalesState.canales = todos
err2 = await fallaCon()
marcar(err2 && /No quedan canales libres/.test(err2.message), 'Si no queda ningún canal libre, avisa que hay que esperar en vez de asignar')
pacienteService.obtenerDeclaracionActiva = fichaOriginal
supabase.rpc = rpcOriginal2

// --- La base: la ficha propia no se liga a la sesión y la retención no la borra
const sqlEst = readFileSync(new URL('../supabase/migrations/20261113000500_rf111_canal_estudiante_con_ficha.sql', import.meta.url), 'utf8')
marcar(!/update public\.declaraciones_paciente set sesion_id/.test(sqlEst), 'Asignar el canal no convierte la ficha propia en una ficha de sesión (sigue siendo su ficha de siempre)')
const sqlRet = readFileSync(new URL('../supabase/migrations/20261113000600_rf03_ficha_propia_persistente.sql', import.meta.url), 'utf8')
marcar(sqlRet.includes('and sesion_id is not null') && sqlRet.includes('create or replace function public.aplicar_retencion'), 'La retención diaria ya no borra la ficha propia (solo las fichas ligadas a una sesión)')
marcar(readFileSync(new URL('../supabase/sensor_pulso_base_de_datos_completa.sql', import.meta.url), 'utf8').includes('ficha propia del paciente se conserva'), 'La base completa incluye la migración de la ficha persistente')

// --- Cerrar sesión no pierde la ficha
const auth = readFileSync(new URL('../src/composables/useAuth.js', import.meta.url), 'utf8')
marcar(/pacienteService\.esperarGuardado\(\)/.test(auth) && /pacienteService\.reintentarSincronizacion\(\)/.test(auth) && auth.indexOf('await supabase.auth.signOut()', auth.indexOf('esperarGuardado')) > auth.indexOf('esperarGuardado'), 'Al cerrar sesión primero se termina de guardar la ficha en la base y recién después se sale')

// --- Medición: el estudiante no ve los 5 canales ni botones; el canal se asigna solo
const medicion = readFileSync(new URL('../src/views/MedicionView.vue', import.meta.url), 'utf8')
const panel = readFileSync(new URL('../src/components/CanalesPacientesPanel.vue', import.meta.url), 'utf8')
marcar(/<CanalesPacientesPanel @agregado="alAgregarCanal" @ir-a-paso=/.test(medicion), 'En Medición el estudiante usa el panel simple, que lo lleva a su ficha o consentimiento si falta algo')
marcar(!/VinculacionCanales/.test(medicion), 'En Medición el estudiante ya no ve el panel de los 5 canales ni de las rondas')
marcar(/data-testid="canal-automatico"/.test(panel) && /onMounted\(\(\) => \{ asegurarCanal\(\) \}\)/.test(panel), 'El canal del estudiante se asigna solo al entrar a medir')
marcar(!/data-testid="agregar-mi-canal"/.test(panel), 'El estudiante ya no tiene botón para agregar canal')
marcar(/data-testid="liberar-mi-canal"/.test(panel) && /data-testid="un-solo-canal"/.test(panel) && /el paciente eres tú/.test(panel), 'Muestra su único canal, que el paciente es él mismo, y permite liberarlo')
marcar(/data-testid="ir-a-ficha"/.test(panel) && /data-testid="reintentar-canal"/.test(panel), 'Si falta la ficha lo lleva a ella; si falló la asignación ofrece reintentar')

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(fallos ? 1 : 0)
