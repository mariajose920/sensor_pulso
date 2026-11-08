import { supabase } from './supabase'
import { camposTipoParaGuardar, validarTipoEvaluacion } from '../utils/tiposEvaluacion.js'

// RF106: guardado del tipo de evaluación. Las preguntas (RF105/RF108) y la asignación (RF104) son de otras tareas.
// Cuando no hay sesión de Supabase (p. ej. el administrador inicial del RF44), se guarda solo en este navegador
// y se avisa con `origen: 'local'`, para no hacer creer que quedó en la base.
const STORAGE_EVALUACIONES = 'sensor_pulso_evaluaciones_locales'

function cargarLocales() {
  if (typeof window === 'undefined' || !window.localStorage) return []
  try {
    return JSON.parse(localStorage.getItem(STORAGE_EVALUACIONES) || '[]')
  } catch (_) {
    return []
  }
}

function guardarLocales(lista) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    localStorage.setItem(STORAGE_EVALUACIONES, JSON.stringify(lista))
  } catch (_) {}
}

const CODIGO_VIOLA_CHECK = '23514'

/**
 * Crea una evaluación con su tipo, ejercicio y criterio.
 * Solo el profesor del aula puede crearla (la RLS `evaluaciones_crear` también lo exige).
 */
export async function crearEvaluacion({ aulaId, creadorId, titulo, descripcion, modelo, puedeGestionar }) {
  if (!puedeGestionar) return { success: false, error: 'No tienes permiso para crear evaluaciones.' }
  if (!aulaId) return { success: false, error: 'Elige el aula de la evaluación.' }
  if (!titulo || !titulo.trim()) return { success: false, error: 'El título es obligatorio.' }
  const errores = validarTipoEvaluacion(modelo)
  if (errores.length) return { success: false, error: errores[0] }

  const fila = {
    aula_id: aulaId,
    creador_id: creadorId,
    titulo: titulo.trim(),
    descripcion: (descripcion || '').trim() || null,
    ...camposTipoParaGuardar(modelo)
  }

  try {
    const { data, error } = await supabase.from('evaluaciones').insert(fila).select().single()
    if (!error && data) return { success: true, origen: 'supabase', data }
    if (error?.code === CODIGO_VIOLA_CHECK) return { success: false, error: 'La base rechazó el tipo o el criterio de la evaluación.' }
  } catch (_) {}

  const local = { ...fila, id: `eval-local-${Date.now()}`, precargada: false, creado_en: new Date().toISOString() }
  guardarLocales([local, ...cargarLocales()])
  return { success: true, origen: 'local', data: local }
}

/** Cuántos intentos de estudiantes tiene una evaluación (0 si no se puede consultar). */
export async function contarIntentos(evaluacionId) {
  try {
    const { count, error } = await supabase
      .from('intentos_evaluacion')
      .select('id', { count: 'exact', head: true })
      .eq('evaluacion_id', evaluacionId)
    if (!error) return count || 0
  } catch (_) {}
  return 0
}

/** Cambia el tipo, el ejercicio y el criterio, salvo que ya existan intentos de estudiantes. */
export async function actualizarTipoEvaluacion({ evaluacionId, modelo, puedeGestionar }) {
  if (!puedeGestionar) return { success: false, error: 'No tienes permiso para editar evaluaciones.' }
  const errores = validarTipoEvaluacion(modelo)
  if (errores.length) return { success: false, error: errores[0] }
  if ((await contarIntentos(evaluacionId)) > 0) {
    return { success: false, error: 'La evaluación ya tiene intentos de estudiantes: no se puede cambiar el tipo.' }
  }

  const campos = camposTipoParaGuardar(modelo)
  try {
    const { data, error } = await supabase.from('evaluaciones').update(campos).eq('id', evaluacionId).select().single()
    if (!error && data) return { success: true, origen: 'supabase', data }
    if (error?.code === CODIGO_VIOLA_CHECK) return { success: false, error: 'La base rechazó el tipo o el criterio de la evaluación.' }
  } catch (_) {}

  const locales = cargarLocales()
  const i = locales.findIndex((e) => e.id === evaluacionId)
  if (i === -1) return { success: false, error: 'No se pudo guardar el cambio en la base.' }
  locales[i] = { ...locales[i], ...campos }
  guardarLocales(locales)
  return { success: true, origen: 'local', data: locales[i] }
}

/** Evaluaciones de un aula (base y, aparte, las guardadas solo en este navegador). */
export async function obtenerEvaluacionesAula(aulaId) {
  let remotas = []
  try {
    const { data, error } = await supabase
      .from('evaluaciones')
      .select('*')
      .eq('aula_id', aulaId)
      .order('creado_en', { ascending: false })
    if (!error && data) remotas = data.map((e) => ({ ...e, origen: 'supabase' }))
  } catch (_) {}
  const locales = cargarLocales().filter((e) => e.aula_id === aulaId).map((e) => ({ ...e, origen: 'local' }))
  return { success: true, data: [...locales, ...remotas] }
}
