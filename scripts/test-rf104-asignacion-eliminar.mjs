// RF104 / RF109 · Pruebas de asignar al crear (curso y fechas) y de eliminar una evaluación.
// Uso: node scripts/test-rf104-asignacion-eliminar.mjs
import { readFileSync } from 'node:fs'
import {
  asignacionVacia, validarAsignacion, parametrosAsignacion, describirAsignacion, fechasSugeridas, fechaParaInput, DURACION_EN_VIVO,
  inicioCalculado, INICIOS_POR_MODO, INICIO_EN_MINUTOS
} from '../src/utils/asignacionEvaluacion.js'
import { supabase } from '../src/services/supabase.js'
import { crearEvaluacion, eliminarEvaluacion, asignarEvaluacion, obtenerEvaluacionesAula } from '../src/services/evaluacionesService.js'
import { modeloVacio } from '../src/utils/tiposEvaluacion.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}

const ahora = new Date('2026-11-13T12:00:00')
const base = { ...asignacionVacia(), asignar: true, abreEn: '2026-11-16T09:00', cierraEn: '2026-11-20T18:00' }

// --- Validación de la asignación
marcar(validarAsignacion(base, ahora).length === 0, 'Con inicio y término futuros y en orden la asignación es válida')
marcar(validarAsignacion({ ...base, abreEn: '' }, ahora).some((e) => /inicio/.test(e)), 'Sin fecha de inicio se pide')
marcar(validarAsignacion({ ...base, cierraEn: '' }, ahora).some((e) => /término/.test(e)), 'Sin fecha de término se pide')
marcar(validarAsignacion({ ...base, cierraEn: '2026-11-15T09:00' }, ahora).some((e) => /posterior/.test(e)), 'El término debe ser posterior al inicio')
marcar(validarAsignacion({ ...base, abreEn: '2026-11-01T09:00', cierraEn: '2026-11-05T09:00' }, ahora).some((e) => /ya pasó/.test(e)), 'Un término que ya pasó se rechaza')
marcar(validarAsignacion({ ...base, abreEn: 'x', cierraEn: 'y' }, ahora).some((e) => /no es válida/.test(e)), 'Fechas ilegibles se rechazan')
marcar(validarAsignacion({ ...asignacionVacia(), modo: 'en_vivo', inicioTipo: 'manual', duracionMin: 45 }, ahora).length === 0, 'En vivo con duración válida es válido (no pide fechas)')
marcar(validarAsignacion({ ...asignacionVacia(), modo: 'en_vivo', inicioTipo: 'manual', duracionMin: 0 }, ahora).length === 1 && validarAsignacion({ ...asignacionVacia(), modo: 'en_vivo', inicioTipo: 'manual', duracionMin: DURACION_EN_VIVO.max + 1 }, ahora).length === 1, 'En vivo con duración 0 o excesiva se rechaza')
marcar(validarAsignacion({ ...asignacionVacia(), modo: 'otro' }, ahora).length === 1, 'Un modo desconocido se rechaza')

// --- Parámetros que se envían a la base
let p = parametrosAsignacion(base)
marcar(p.alcance === 'aula' && p.cursoId === null && p.modo === 'ventana' && p.abreEn === new Date(base.abreEn).toISOString() && p.cierraEn === new Date(base.cierraEn).toISOString() && p.tiempoLimiteS === null, 'Sin curso se asigna a toda el aula, con las fechas en formato ISO')
p = parametrosAsignacion({ ...base, cursoId: 'curso-1' })
marcar(p.alcance === 'curso' && p.cursoId === 'curso-1', 'Con curso elegido se asigna a ese curso')
p = parametrosAsignacion({ ...asignacionVacia(), modo: 'en_vivo', inicioTipo: 'manual', duracionMin: 20, cursoId: 'curso-2' })
marcar(p.modo === 'en_vivo' && p.tiempoLimiteS === 1200 && p.abreEn === null && p.cierraEn === null && p.alcance === 'curso', 'En vivo manual envía la duración en segundos y sin fecha de inicio')
marcar(/curso «Sección 1»/.test(describirAsignacion({ ...base, cursoId: 'c1' }, [{ id: 'c1', nombre: 'Sección 1' }])) && /toda el aula/.test(describirAsignacion(base)), 'La descripción dice a qué curso o a toda el aula')

// --- Inicio automático: en una fecha o dentro de N minutos
const vivo = { ...asignacionVacia(), asignar: true, modo: 'en_vivo', duracionMin: 30 }
marcar(JSON.stringify(INICIOS_POR_MODO.ventana) === '["fecha","minutos"]' && INICIOS_POR_MODO.en_vivo.includes('manual'), 'El inicio manual solo existe en vivo')
marcar(validarAsignacion({ ...base, inicioTipo: 'manual' }, ahora).some((e) => /no puede iniciarla el profesor/.test(e)), 'Una evaluación con fechas no admite inicio manual')
let a = { ...vivo, inicioTipo: 'minutos', inicioMin: 10 }
marcar(validarAsignacion(a, ahora).length === 0, 'En vivo que empieza dentro de 10 minutos es válida')
marcar(inicioCalculado(a, ahora).getTime() === ahora.getTime() + 10 * 60000, 'El inicio «dentro de N minutos» se calcula desde el momento de guardar')
p = parametrosAsignacion(a, ahora)
marcar(p.modo === 'en_vivo' && p.abreEn === new Date(ahora.getTime() + 600000).toISOString() && p.tiempoLimiteS === 1800 && p.cierraEn === null, 'En vivo con inicio en N minutos envía la hora de inicio y la duración')
a = { ...vivo, inicioTipo: 'fecha', abreEn: '2026-11-16T10:00' }
p = parametrosAsignacion(a, ahora)
marcar(validarAsignacion(a, ahora).length === 0 && p.abreEn === new Date('2026-11-16T10:00').toISOString(), 'En vivo con fecha de inicio envía esa fecha como inicio automático')
marcar(parametrosAsignacion({ ...vivo, inicioTipo: 'manual' }, ahora).abreEn === null, 'En vivo manual no envía fecha: la inicia el profesor')
marcar(validarAsignacion({ ...vivo, inicioTipo: 'minutos', inicioMin: 0 }, ahora).length === 1 && validarAsignacion({ ...vivo, inicioTipo: 'minutos', inicioMin: INICIO_EN_MINUTOS.max + 1 }, ahora).length === 1 && validarAsignacion({ ...vivo, inicioTipo: 'minutos', inicioMin: '' }, ahora).length === 1, 'Los minutos hasta el inicio deben ser un entero válido')
marcar(validarAsignacion({ ...vivo, inicioTipo: 'fecha', abreEn: '' }, ahora).some((e) => /fecha y hora de inicio/.test(e)), 'Con inicio en una fecha, se exige la fecha')
marcar(validarAsignacion({ ...vivo, inicioTipo: 'fecha', abreEn: '2026-11-10T08:00' }, ahora).some((e) => /ya pasó/.test(e)), 'Un inicio automático ya vencido se rechaza')
const ventanaMin = { ...asignacionVacia(), asignar: true, inicioTipo: 'minutos', inicioMin: 30, cierraEn: '2026-11-20T18:00' }
marcar(validarAsignacion(ventanaMin, ahora).length === 0 && parametrosAsignacion(ventanaMin, ahora).abreEn === new Date(ahora.getTime() + 1800000).toISOString(), 'Con fechas también se puede empezar «dentro de N minutos»')
marcar(validarAsignacion({ ...ventanaMin, cierraEn: '2026-11-13T12:10' }, ahora).some((e) => /posterior al inicio/.test(e)), 'El término debe quedar después del inicio calculado')
marcar(/se inicia sola el/.test(describirAsignacion({ ...vivo, inicioTipo: 'minutos', inicioMin: 10 }, [], parametrosAsignacion({ ...vivo, inicioTipo: 'minutos', inicioMin: 10 }, ahora))) && /la inicias tú/.test(describirAsignacion({ ...vivo, inicioTipo: 'manual' })), 'La descripción dice si se inicia sola o la inicia el profesor')

// --- La migración del inicio automático
const sqlAuto = readFileSync(new URL('../supabase/migrations/20261113000400_rf109_inicio_automatico.sql', import.meta.url), 'utf8')
marcar(sqlAuto.includes('coalesce(e.iniciada_en, e.abre_en)') && sqlAuto.includes('create or replace function public.evaluacion_abierta'), 'La base abre una evaluación en vivo a la hora programada (reloj de la base)')
marcar(sqlAuto.includes('create or replace function public.activar_evaluaciones_programadas') && sqlAuto.includes('grant execute on function public.activar_evaluaciones_programadas() to authenticated'), 'Existe la función que ordena el estado de las programadas')
marcar(/abre_en = p_abre_en,/.test(sqlAuto) && /La fecha de inicio ya pasó/.test(sqlAuto), 'Asignar en vivo guarda el inicio automático y rechaza uno vencido')
marcar(sqlAuto.includes('La evaluación ya está en curso.') && sqlAuto.includes('public.evaluacion_abierta(e.id)'), 'Iniciar a mano no reinicia una evaluación ya abierta automáticamente, y se puede cerrar')
marcar(sqlAuto.includes('coalesce(e.iniciada_en, e.abre_en) + make_interval(secs => e.tiempo_limite_s) <= statement_timestamp()'), 'El estudiante ve como cerrada una evaluación en vivo cuyo tiempo ya terminó')
marcar(readFileSync(new URL('../supabase/sensor_pulso_base_de_datos_completa.sql', import.meta.url), 'utf8').includes('inicio automático de la evaluación en vivo'), 'La base completa incluye la migración del inicio automático')

// --- Fechas sugeridas
const sug = fechasSugeridas(ahora)
marcar(new Date(sug.abreEn) > ahora && new Date(sug.cierraEn) > new Date(sug.abreEn) && validarAsignacion({ ...base, ...sug }, ahora).length === 0, 'Las fechas sugeridas son futuras y válidas')
marcar(fechaParaInput(new Date('2026-11-16T09:05:00')) === '2026-11-16T09:05' && fechaParaInput('nada') === '', 'El formato para el campo de fecha es local y sin segundos')

// --- Eliminar una evaluación (modo local)
const memoria = new Map()
globalThis.window = { localStorage: { getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k) } }
globalThis.localStorage = globalThis.window.localStorage
const aulaId = 'aula-eliminar'
const crear = (titulo) => crearEvaluacion({ aulaId, creadorId: '00000000-0000-0000-0000-0000000000aa', titulo, modelo: modeloVacio(), preguntas: [{ enunciado: '¿?', tipo: 'abierta', puntaje: 1 }], puedeGestionar: true })
const e1 = (await crear('Para eliminar')).data
const e2 = (await crear('Para conservar')).data
let res = await eliminarEvaluacion({ evaluacionId: e1.id, puedeGestionar: false })
marcar(!res.success, 'Sin permiso de gestión no se elimina')
res = await eliminarEvaluacion({ evaluacionId: e1.id, puedeGestionar: true })
let lista = (await obtenerEvaluacionesAula(aulaId)).data
marcar(res.success && !lista.some((e) => e.id === e1.id) && lista.some((e) => e.id === e2.id), 'Se elimina solo la evaluación elegida y la otra se conserva')
res = await eliminarEvaluacion({ evaluacionId: e1.id, puedeGestionar: true })
marcar(!res.success && /No se encontró/.test(res.error), 'Eliminar una evaluación que ya no existe no se da por hecho')
marcar(!(await eliminarEvaluacion({ evaluacionId: '', puedeGestionar: true })).success, 'Sin id no se elimina nada')
delete globalThis.window
delete globalThis.localStorage

// --- Eliminar una evaluación de la base: se confirma con la respuesta real
const rpcOriginal = supabase.rpc
const fromOriginal = supabase.from
const uuid = '11111111-2222-3333-4444-555555555555'
const borrado = (respuesta) => ({ delete: () => ({ eq: () => ({ select: async () => respuesta }) }) })
supabase.from = () => borrado({ data: [{ id: uuid }], error: null })
res = await eliminarEvaluacion({ evaluacionId: uuid, puedeGestionar: true })
marcar(res.success, 'Si la base confirma el borrado, se da por eliminada')
supabase.from = () => borrado({ data: [], error: null })
res = await eliminarEvaluacion({ evaluacionId: uuid, puedeGestionar: true })
marcar(!res.success && /no existe o no tienes permiso/.test(res.error), 'Si la base no borra nada (sin permiso o inexistente), no se dice que se eliminó')
supabase.from = () => borrado({ data: null, error: { message: 'violación de política' } })
res = await eliminarEvaluacion({ evaluacionId: uuid, puedeGestionar: true })
marcar(!res.success && /violación de política/.test(res.error), 'El error real de la base se muestra')

// --- Asignar: el error de la base ya no se oculta
supabase.rpc = async () => ({ data: null, error: { message: 'Indica una fecha de cierre posterior a la apertura.' } })
const params = { evaluacionId: uuid, modo: 'ventana', alcance: 'aula', abreEn: '2026-11-16T12:00:00Z', cierraEn: '2026-11-20T12:00:00Z', puedeGestionar: true }
res = await asignarEvaluacion(params)
marcar(!res.success && /fecha de cierre posterior/.test(res.error), 'Si la base rechaza la asignación de una evaluación guardada, se muestra el error en vez de darla por asignada')
supabase.rpc = async () => ({ data: { id: uuid, estado: 'programada' }, error: null })
res = await asignarEvaluacion(params)
marcar(res.success, 'Si la base confirma, la asignación queda hecha')
supabase.rpc = async () => { throw new Error('sin red') }
res = await asignarEvaluacion(params)
marcar(!res.success && /sin red/.test(res.error), 'Sin conexión a la base no se da por asignada una evaluación guardada')
res = await asignarEvaluacion({ ...params, evaluacionId: 'eval-local-1', alcance: 'curso', cursoId: 'c1' })
marcar(res.success && res.data[0].curso_id === 'c1', 'Una evaluación solo local (sesión demo) sí se asigna en el respaldo')
supabase.rpc = rpcOriginal
supabase.from = fromOriginal

// --- Las pantallas usan todo esto
const vista = readFileSync(new URL('../src/views/EvaluacionesView.vue', import.meta.url), 'utf8')
const detalle = readFileSync(new URL('../src/views/AulaDetalleView.vue', import.meta.url), 'utf8')
const formulario = readFileSync(new URL('../src/components/AsignacionEvaluacionForm.vue', import.meta.url), 'utf8')
marcar(/<AsignacionEvaluacionForm\s+v-model="asignacion"/.test(vista) && /con-interruptor/.test(vista), 'Al crear una evaluación o usar una plantilla se ofrece asignarla (curso y fechas)')
marcar(/validarAsignacion\(asignacion\.value\)\.length/.test(vista) && /asignarEvaluacion\(\{\s*evaluacionId: res\.data\.id/.test(vista), 'Si se pide asignar, se exigen curso y fechas antes de guardar y se asigna al guardar')
marcar(/data-testid="asignar-evaluacion"/.test(vista) && /data-testid="guardar-asignacion"/.test(vista), 'Cada evaluación guardada tiene el botón «Asignar» con su curso y fechas')
marcar(/data-testid="eliminar-evaluacion"/.test(vista) && /window\.confirm/.test(vista), 'La lista de evaluaciones tiene «Eliminar» con confirmación')
marcar(/data-testid="eliminar-evaluacion-aula"/.test(detalle) && /confirmarEliminarEvaluacionAsignada/.test(detalle), 'Las evaluaciones asignadas en la página del aula tienen «Eliminar» con confirmación')
marcar(/data-testid="asignacion-curso"/.test(formulario) && /data-testid="asignacion-abre"/.test(formulario) && /data-testid="asignacion-cierra"/.test(formulario), 'El formulario pide el curso y las fechas de inicio y término')

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(fallos ? 1 : 0)
