// RF111 · El estudiante recibe su canal automáticamente con un botón (igual que el profesor), sin elegir el número.
// Uso: node scripts/test-rf111-canal-automatico-estudiante.mjs
import { readFileSync } from 'node:fs'
import { evaluarAsignacionEstudiante, siguienteCanalLibre } from '../src/utils/canalesMultiples.js'
import { supabase } from '../src/services/supabase.js'
import { canalesState, usuarioActual, miCanalAsignado, asignarmeCanalAutomatico, estadoAsignacionEstudiante } from '../src/services/canalesService.js'

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

// --- Asignación automática (sin base: en memoria)
const rpcOriginal = supabase.rpc
supabase.rpc = async () => { throw new Error('sin red') }
usuarioActual.id = 'usr-estudiante-01'
usuarioActual.rol = 'estudiante'
canalesState.canales = ocupar(ocupar(libres(), 1, 'otro-1'), 2, 'otro-2')
const r = await asignarmeCanalAutomatico()
marcar(r.ok && r.canal === 3 && miCanalAsignado.value === 3, 'El sistema le asigna el siguiente canal libre (el 3, porque el 1 y el 2 están ocupados)')
marcar(canalesState.canales.find((c) => c.canal === 3).usuario_id === usuarioActual.id, 'El canal queda a nombre de su cuenta')
let error = null
try { await asignarmeCanalAutomatico() } catch (err) { error = err }
marcar(error && /Ya tienes asignado el Canal 3/.test(error.message), 'No se le asigna un segundo canal')
marcar(estadoAsignacionEstudiante.value.visible && !estadoAsignacionEstudiante.value.puede, 'El estado del botón se actualiza al tener canal')
canalesState.canales = todos
error = null
try { await asignarmeCanalAutomatico() } catch (err) { error = err }
marcar(error && /No quedan canales libres/.test(error.message), 'Si no queda ningún canal libre, avisa en vez de asignar')
supabase.rpc = rpcOriginal

// --- Si otro estudiante toma el canal justo antes, se prueba con el siguiente
const servicio = readFileSync(new URL('../src/services/canalesService.js', import.meta.url), 'utf8')
marcar(/tomado === false/.test(servicio) && /continue/.test(servicio) && /intento < 5/.test(servicio), 'Si la base dice que otro tomó ese canal, se actualiza la lista y se prueba el siguiente libre')

// --- La pantalla
const vista = readFileSync(new URL('../src/components/VinculacionCanales.vue', import.meta.url), 'utf8')
marcar(/data-testid="asignarme-canal"/.test(vista) && /Asignarme un canal/.test(vista) && /asignarmeCanalAutomatico\(\)/.test(vista), 'La pantalla del estudiante tiene el botón «Asignarme un canal»')
marcar(!/Tomar este Canal|Tomar este canal|(?<!des)vincular\(ch\.canal\)/.test(vista), 'Ya no hay un botón «Tomar este Canal» por cada canal')
marcar(/const canalesVisibles = computed\(\(\) => canalesState\.canales\.filter\(c => c\.usuario_id\)\)/.test(vista), 'Como en el perfil del profesor, solo se listan los canales ya tomados')
marcar(/v-if="esProfesorOAdmin" class="docente-controls"/.test(vista), 'El control de rondas («Abrir siguiente ronda») solo lo ve el profesor o el administrador')
marcar(/solicitar-consentimiento', \(\) => asignarmeCanal\(\)\)/.test(vista), 'Antes de asignar se pide el consentimiento informado si hace falta (RF04)')

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(fallos ? 1 : 0)
