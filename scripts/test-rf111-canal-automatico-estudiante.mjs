// RF111 · El estudiante recibe su canal automáticamente con un botón (igual que el profesor), sin elegir el número.
// Uso: node scripts/test-rf111-canal-automatico-estudiante.mjs
import { readFileSync } from 'node:fs'
import { evaluarAsignacionEstudiante, siguienteCanalLibre } from '../src/utils/canalesMultiples.js'
import { supabase } from '../src/services/supabase.js'
import { canalesState, usuarioActual, miCanalAsignado, asignarmeCanalConFicha, estadoAsignacionEstudiante, requisitosCanales } from '../src/services/canalesService.js'
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
let res = await intentar({ ...datos, ficha: { ...ficha, nombre: '' } })
marcar(res.error && !miCanalAsignado.value, 'Sin los datos del paciente (nombre) no se asigna ningún canal')
res = await intentar({ ...datos, ficha: { ...ficha, nivelEstres: '' } })
marcar(res.error && !miCanalAsignado.value, 'Sin el nivel de estrés tampoco')
res = await intentar({ ...datos, politicaVersion: '0.0' })
marcar(res.error && /términos|política/.test(res.error.message) && !miCanalAsignado.value, 'Sin aceptar los términos y la política vigente no se asigna')
res = await intentar({ ...datos, consentimientoVersion: '' })
marcar(res.error && /consentimiento/.test(res.error.message) && !miCanalAsignado.value, 'Sin el consentimiento informado no se asigna')

res = await intentar(datos)
marcar(res.r?.ok && res.r.canal === 3 && miCanalAsignado.value === 3, 'Con ficha, términos y consentimiento, el sistema le asigna el siguiente canal libre (el 3)')
marcar(canalesState.canales.find((c) => c.canal === 3).usuario_id === usuarioActual.id, 'El canal queda a nombre de su cuenta')
marcar(requisitosCanales[3]?.ficha?.nombre === 'María Vilches' && requisitosCanales[3]?.politicaVersion === POLITICA_VERSION && requisitosCanales[3]?.consentimientoVersion === '1.0', 'Quedan guardados los datos del paciente, la política y el consentimiento de ese canal')
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
const vista = readFileSync(new URL('../src/components/VinculacionCanales.vue', import.meta.url), 'utf8')
marcar(/data-testid="asignarme-canal"/.test(vista) && /Asignarme un canal/.test(vista) && /@click="abrirAsignarmeCanal"/.test(vista), 'La pantalla del estudiante tiene el botón «Asignarme un canal»')
const modal = readFileSync(new URL('../src/components/AgregarCanalModal.vue', import.meta.url), 'utf8')
marcar(/:modo="esProfesorOAdmin \? 'docente' : 'estudiante'"/.test(vista) && /asignarmeCanalConFicha\(datos\)/.test(modal), 'El botón abre la ficha del paciente, los términos y el consentimiento, y al aceptar asigna el canal')
marcar(/precargarFichaPropia/.test(modal) && /obtenerDeclaracionActiva/.test(modal), 'La ficha del estudiante parte de la que ya tiene guardada para no escribirla de nuevo')
marcar(!/Tomar este Canal|Tomar este canal|(?<!des)vincular\(ch\.canal\)/.test(vista), 'Ya no hay un botón «Tomar este Canal» por cada canal')
marcar(/const canalesVisibles = computed\(\(\) => canalesState\.canales\.filter\(c => c\.usuario_id\)\)/.test(vista), 'Como en el perfil del profesor, solo se listan los canales ya tomados')
marcar(/v-if="esProfesorOAdmin" class="docente-controls"/.test(vista), 'El control de rondas («Abrir siguiente ronda») solo lo ve el profesor o el administrador')

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(fallos ? 1 : 0)
