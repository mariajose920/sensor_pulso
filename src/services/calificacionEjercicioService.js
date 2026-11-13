import { supabase } from './supabase.js'
import { mensajeErrorCalificacion } from '../utils/calificacionEjercicio.js'

/**
 * RF107: calificación automática del ejercicio aplicado.
 * La calificación la hace el servidor (funciones calificar_ejercicio y recalificar_intento): aquí solo
 * se llama a esas funciones y se leen las opciones de referencia y los resultados.
 */

/** Plantillas aprobadas y mediciones propias del profesor que sirven como señal de referencia. */
export async function obtenerOpcionesReferencia(usuarioId) {
  const plantillas = []
  const mediciones = []
  try {
    const { data } = await supabase
      .from('senales_referencia')
      .select('id, nombre, tipo, bpm_referencia, ritmo')
      .eq('aprobada', true)
      .order('nombre')
    for (const fila of data || []) plantillas.push(fila)
  } catch (_) { /* sin conexión: queda vacío */ }
  if (usuarioId) {
    try {
      const { data } = await supabase
        .from('mediciones')
        .select('id, inicio, bpm_promedio, calidad')
        .eq('usuario_id', usuarioId)
        .neq('calidad', 'mala')
        .not('bpm_promedio', 'is', null)
        .order('inicio', { ascending: false })
        .limit(30)
      for (const fila of data || []) mediciones.push(fila)
    } catch (_) { /* sin conexión: queda vacío */ }
  }
  return { plantillas, mediciones }
}

/** El estudiante entrega una medición. Devuelve { success, resultado } o { success:false, error }. */
export async function calificarEjercicioAplicado({ intentoId, medicionId }) {
  if (!intentoId || !medicionId) return { success: false, error: 'Elige una medición para entregar.' }
  const { data, error } = await supabase.rpc('calificar_ejercicio', {
    p_intento: intentoId,
    p_medicion: medicionId
  })
  if (error) return { success: false, error: mensajeErrorCalificacion(error) }
  return { success: true, resultado: data }
}

/** Evaluación mixta: el estudiante entrega una medición para uno de sus ejercicios. */
export async function calificarEjercicioMixto({ intentoId, ejercicioId, medicionId }) {
  if (!intentoId || !ejercicioId || !medicionId) return { success: false, error: 'Elige una medición para entregar.' }
  const { data, error } = await supabase.rpc('calificar_ejercicio_mixto', {
    p_intento: intentoId,
    p_ejercicio: ejercicioId,
    p_medicion: medicionId
  })
  if (error) return { success: false, error: mensajeErrorCalificacion(error) }
  return { success: true, resultado: data }
}

/** El profesor vuelve a calcular la nota de un intento con el criterio y la referencia actuales. */
export async function recalificarIntento(intentoId) {
  const { data, error } = await supabase.rpc('recalificar_intento', { p_intento: intentoId })
  if (error) return { success: false, error: mensajeErrorCalificacion(error) }
  return { success: true, resultado: data }
}

/** Resultados de los estudiantes en un ejercicio aplicado (el profesor solo ve lo de su aula por RLS). */
export async function obtenerResultadosEjercicio(evaluacionId) {
  const { data, error } = await supabase
    .from('intentos_evaluacion')
    .select('id, usuario_id, medicion_id, puntaje, puntaje_maximo, porcentaje, nivel, valor_obtenido, similitud, criterio_cumplido, detalle, calificaciones, calificado_en, perfiles(nombre), intento_ejercicios(ejercicio_id, puntaje, puntaje_maximo, porcentaje, detalle, evaluacion_ejercicios(orden, ejercicio))')
    .eq('evaluacion_id', evaluacionId)
    .order('calificado_en', { ascending: false, nullsFirst: false })
  if (error) return { success: false, error: error.message, data: [] }
  return { success: true, data: data || [] }
}
