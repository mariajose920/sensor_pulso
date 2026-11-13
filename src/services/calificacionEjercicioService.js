import { supabase } from './supabase.js'
import { mensajeErrorCalificacion } from '../utils/calificacionEjercicio.js'
import { faltaFuncionResultado, resultadoDesdeTablas } from '../utils/ejercicioEvaluacion.js'

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

/**
 * Resultado de respaldo con lo que el estudiante puede leer por sí mismo (intento, respuestas y preguntas), para cuando la base
 * aún no tiene la función `resultado_evaluacion`. Marca cada pregunta como correcta o incorrecta; no trae la respuesta
 * correcta ni la explicación (ocultas hasta aplicar la migración).
 */
async function resultadoDeRespaldo(intentoId) {
  const { data: intento } = await supabase.from('intentos_evaluacion').select('*').eq('id', intentoId).maybeSingle()
  if (!intento) return null
  const [{ data: evaluacion }, { data: preguntas }, { data: respuestas }] = await Promise.all([
    supabase.from('evaluaciones').select('*').eq('id', intento.evaluacion_id).maybeSingle(),
    supabase.from('evaluacion_preguntas').select('orden, puntaje, preguntas(id, enunciado, tipo, opciones, puntaje)')
      .eq('evaluacion_id', intento.evaluacion_id).order('orden'),
    supabase.from('respuestas').select('pregunta_id, respuesta, es_correcta, puntaje').eq('intento_id', intentoId)
  ])

  let ejercicios = []
  if (evaluacion?.tipo === 'ejercicio_aplicado') {
    ejercicios = [{
      orden: 1, ejercicio: evaluacion.ejercicio, calificado: Boolean(intento.medicion_id),
      puntaje: Number(intento.puntaje || 0), puntaje_maximo: Number(intento.puntaje_maximo || 0), porcentaje: Number(intento.porcentaje || 0),
      cumple: intento.criterio_cumplido ?? null, valor: intento.valor_obtenido ?? null,
      motivo: intento.detalle?.motivo || null, criterio: evaluacion.criterio ? { ...evaluacion.criterio, referencia: undefined } : null
    }]
  } else if (evaluacion?.tipo === 'mixta') {
    try {
      const { data: filas } = await supabase.from('intento_ejercicios')
        .select('puntaje, puntaje_maximo, porcentaje, criterio_cumplido, valor_obtenido, detalle, evaluacion_ejercicios(orden, ejercicio, criterio)')
        .eq('intento_id', intentoId)
      ejercicios = (filas || []).map((f) => ({
        orden: f.evaluacion_ejercicios?.orden || 1, ejercicio: f.evaluacion_ejercicios?.ejercicio, calificado: true,
        puntaje: Number(f.puntaje || 0), puntaje_maximo: Number(f.puntaje_maximo || 0), porcentaje: Number(f.porcentaje || 0),
        cumple: f.criterio_cumplido, valor: f.valor_obtenido, motivo: f.detalle?.motivo || null, criterio: f.evaluacion_ejercicios?.criterio || null
      })).sort((x, y) => x.orden - y.orden)
    } catch (_) { /* tabla aún no creada: sin detalle de ejercicios */ }
  }
  return resultadoDesdeTablas({ intento, evaluacion, preguntas: preguntas || [], respuestas: respuestas || [], ejercicios })
}

/** El estudiante ve el resultado y las correcciones de su evaluación ya entregada (RPC resultado_evaluacion). */
export async function obtenerResultadoEvaluacion(intentoId) {
  if (!intentoId) return { success: false, error: 'No se encontró tu intento.' }
  const { data, error } = await supabase.rpc('resultado_evaluacion', { p_intento: intentoId })
  if (error && faltaFuncionResultado(error)) {
    // La base no tiene la migración del resultado: se muestra lo que se puede leer y se avisa qué falta
    try {
      const respaldo = await resultadoDeRespaldo(intentoId)
      if (respaldo) return { success: true, resultado: respaldo, respaldo: true }
    } catch (_) { /* se informa el error original */ }
    return { success: false, error: 'Tu base de datos aún no tiene la función del resultado de la evaluación. Falta aplicar la migración 20261113000300_rf107_resultado_evaluacion.sql en Supabase.' }
  }
  if (error) return { success: false, error: error.message }
  return { success: true, resultado: data }
}
