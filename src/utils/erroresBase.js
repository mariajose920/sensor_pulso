/**
 * RF107: traduce los errores de la base de datos al guardar una evaluación en frases que digan qué hacer.
 * Lo más común es que la base de Supabase no tenga aplicadas las migraciones de RF107.
 */

export const MIGRACION_CALIFICACION = '20261113000100_rf107_calificacion_ejercicio.sql'
export const MIGRACION_MIXTA = '20261113000200_rf107_evaluacion_mixta.sql'
export const MIGRACION_RESULTADO = '20261113000300_rf107_resultado_evaluacion.sql'

const COMO_APLICAR = 'Ábrelas en Supabase → SQL Editor, pega su contenido y ejecútalas en ese orden.'

export const MSG_FALTA_MIXTA =
  `Tu base de datos aún no acepta evaluaciones de «Preguntas + ejercicios aplicados». Falta aplicar la migración supabase/migrations/${MIGRACION_MIXTA} (y antes la ${MIGRACION_CALIFICACION}). ${COMO_APLICAR}`

export const MSG_FALTA_CALIFICACION =
  `Tu base de datos aún no tiene la calificación automática de RF107. Falta aplicar la migración supabase/migrations/${MIGRACION_CALIFICACION}. ${COMO_APLICAR}`

/**
 * @param {{code?: string, message?: string, details?: string}} error error devuelto por Supabase
 * @param {string} tipo tipo de evaluación que se intentaba guardar
 */
export function explicarErrorBase(error, tipo) {
  const codigo = String(error?.code || '')
  const detalle = String(error?.message || '')

  // La restricción del tipo no conoce «mixta»: falta la migración de la evaluación mixta
  if (codigo === '23514' && /evaluaciones_tipo_check/.test(detalle) && tipo === 'mixta') return MSG_FALTA_MIXTA
  if (codigo === '23514') {
    return `La base rechazó el tipo o el criterio de la evaluación${detalle ? ` (${detalle})` : ''}. Revisa el criterio; si acabas de actualizar el programa, puede faltar aplicar las migraciones de RF107.`
  }
  // Tabla de ejercicios inexistente
  if (codigo === '42P01' || codigo === 'PGRST205' || /evaluacion_ejercicios/.test(detalle)) return MSG_FALTA_MIXTA
  // Columna max_reintentos inexistente
  if (codigo === '42703' || codigo === 'PGRST204' || /max_reintentos/.test(detalle)) return MSG_FALTA_CALIFICACION
  return detalle || 'No se pudo guardar la evaluación.'
}
