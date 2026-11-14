/**
 * RF107: ayudas para mostrar el resultado y las correcciones de una evaluación entregada.
 * Los datos vienen de la función `resultado_evaluacion` (ver la migración 20261113000300).
 */

export const ETIQUETA_NIVEL_RESULTADO = {
  logrado: 'Logrado',
  medianamente_logrado: 'Medianamente logrado',
  no_logrado: 'No logrado'
}

export const CLASE_NIVEL = { logrado: 'ok', medianamente_logrado: 'medio', no_logrado: 'bajo' }

/** Frase que explica el nivel con los umbrales de la evaluación (RF112). */
export function explicarNivel(nivel, umbralLogrado = 70, umbralMedio = 40) {
  if (nivel === 'logrado') return `Lograste el ${umbralLogrado} % o más del puntaje.`
  if (nivel === 'medianamente_logrado') return `Lograste entre el ${umbralMedio} % y menos del ${umbralLogrado} % del puntaje.`
  if (nivel === 'no_logrado') return `Lograste menos del ${umbralMedio} % del puntaje.`
  return ''
}

const textoOpcion = (pregunta, id) => {
  const opcion = (pregunta.opciones || []).find((o) => o.id === id)
  return opcion ? opcion.texto : String(id)
}

/** Respuesta del estudiante como texto legible. */
export function formatearRespuesta(pregunta) {
  if (!pregunta?.respondida) return 'Sin responder'
  const r = pregunta.respuesta
  if (pregunta.tipo === 'opcion_multiple') return textoOpcion(pregunta, r)
  if (pregunta.tipo === 'verdadero_falso') return r === true || r === 'true' ? 'Verdadero' : 'Falso'
  return String(r)
}

/** Respuesta correcta como texto legible; null si la pregunta no tiene clave (abierta). */
export function formatearCorrecta(pregunta) {
  const c = pregunta?.correcta
  if (c === null || c === undefined) return null
  if (pregunta.tipo === 'opcion_multiple') return textoOpcion(pregunta, c)
  if (pregunta.tipo === 'verdadero_falso') return c === true || c === 'true' ? 'Verdadero' : 'Falso'
  if (typeof c === 'object' && c !== null && 'valor' in c) {
    const tol = Number(c.tolerancia)
    return tol > 0 ? `${c.valor} (± ${tol})` : String(c.valor)
  }
  return String(c)
}

/** 'correcta' | 'incorrecta' | 'pendiente' (abierta, la revisa el profesor) | 'sin_responder' */
export function estadoPregunta(pregunta) {
  if (!pregunta?.respondida) return 'sin_responder'
  if (pregunta.es_correcta === true) return 'correcta'
  if (pregunta.es_correcta === false) return 'incorrecta'
  return 'pendiente'
}

export const ETIQUETA_ESTADO_PREGUNTA = {
  correcta: '✓ Correcta',
  incorrecta: '✗ Incorrecta',
  pendiente: '⏳ Pendiente de revisión',
  sin_responder: 'Sin responder'
}

/** Cuenta de preguntas por estado, para el resumen. */
export function resumenPreguntas(preguntas = []) {
  const cuenta = { correcta: 0, incorrecta: 0, pendiente: 0, sin_responder: 0 }
  for (const p of preguntas) cuenta[estadoPregunta(p)]++
  return { ...cuenta, total: preguntas.length }
}

/** Estado de un ejercicio: 'cumple' | 'parcial' | 'no_cumple' | 'sin_calificar'. */
export function estadoEjercicio(ejercicio) {
  if (!ejercicio?.calificado) return 'sin_calificar'
  if (ejercicio.cumple === true) return 'cumple'
  return Number(ejercicio.porcentaje) > 0 ? 'parcial' : 'no_cumple'
}

export const ETIQUETA_ESTADO_EJERCICIO = {
  cumple: '✓ Cumple el criterio',
  parcial: 'Cumple parcialmente',
  no_cumple: '✗ No cumple el criterio',
  sin_calificar: 'Sin calificar'
}

/** Redondea para mostrar (sin decimales sobrantes). */
export function formatearPorcentaje(valor) {
  const n = Number(valor)
  if (!Number.isFinite(n)) return '0'
  return Number.isInteger(n) ? String(n) : n.toFixed(1).replace(/\.0$/, '')
}
