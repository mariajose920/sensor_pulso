/**
 * RF107: calificación automática del ejercicio aplicado.
 * Espejo en JavaScript de las funciones SQL de la migración 20261113000100_rf107_calificacion_ejercicio.sql
 * (puntaje_rango, puntaje_similitud, similitud_rasgos, evaluar_ejercicio). La calificación oficial la hace
 * el servidor; esto sirve para mostrar una vista previa al profesor y para probar las fórmulas.
 */

const redondear = (valor, decimales) => {
  const f = 10 ** decimales
  return Math.round(valor * f) / f
}

/** Rango: dentro = 100. Fuera, baja linealmente con la distancia, relativa al ancho del rango. */
export function puntajeRango(valor, min, max) {
  if (valor >= min && valor <= max) return 100
  const distancia = valor < min ? min - valor : valor - max
  return Math.max(0, redondear(100 * (1 - distancia / (max - min)), 2))
}

/** Similitud mínima: cumple = 100; si no, proporcional a lo que alcanzó. */
export function puntajeSimilitud(similitud, minimo) {
  if (similitud >= minimo) return 100
  return Math.max(0, redondear((100 * similitud) / minimo, 2))
}

const hay = (v) => v !== null && v !== undefined && v !== ''

/**
 * Similitud (0 a 100) entre dos mediciones o una medición y una plantilla, con sus rasgos:
 * BPM (0,60), regularidad (0,25) y ritmo (0,15). Solo cuentan los rasgos presentes en ambas partes.
 * Devuelve null si no hay BPM en alguna de las dos.
 */
export function similitudRasgos(a, b) {
  const bpmA = Number(a?.bpm)
  const bpmB = Number(b?.bpm)
  if (!hay(a?.bpm) || !hay(b?.bpm) || !(bpmA > 0) || !(bpmB > 0)) return null
  let num = 0.6 * Math.min(1, (2 * Math.abs(bpmA - bpmB)) / Math.max(bpmA, bpmB))
  let den = 0.6
  if (hay(a.regularidad) && hay(b.regularidad)) {
    num += 0.25 * Math.min(1, Math.abs(Number(a.regularidad) - Number(b.regularidad)))
    den += 0.25
  }
  if (hay(a.ritmo) && hay(b.ritmo)) {
    num += 0.15 * (a.ritmo === b.ritmo ? 0 : 1)
    den += 0.15
  }
  return redondear(Math.max(0, 100 * (1 - num / den)), 1)
}

/**
 * Calificación de una medición contra el criterio de una evaluación (sin las validaciones de ventana).
 * evaluacion: { criterio }, medicion: { bpm_promedio, spo2_promedio, regularidad, ritmo },
 * referencia: { bpm, regularidad, ritmo, nombre } (solo para similitud_minima).
 * Devuelve { valor, similitud, cumple, puntaje, motivo } o lanza Error si falta un dato.
 */
export function calificarEjercicio({ criterio, medicion, referencia = null }) {
  const tipo = criterio?.tipo
  if (tipo === 'bpm_en_rango' || tipo === 'spo2_en_rango') {
    const esBpm = tipo === 'bpm_en_rango'
    const valor = esBpm ? medicion?.bpm_promedio : medicion?.spo2_promedio
    if (!hay(valor)) throw new Error(esBpm ? 'La medición no tiene BPM' : 'La medición no tiene SpO₂')
    const v = Number(valor)
    const min = Number(criterio.min)
    const max = Number(criterio.max)
    const cumple = v >= min && v <= max
    const unidad = esBpm ? 'BPM' : '%'
    const nombre = esBpm ? 'pulso' : 'SpO₂'
    const motivo = cumple
      ? `Tu ${nombre} (${v} ${unidad}) está dentro del rango pedido (${min} a ${max} ${unidad}).`
      : `Tu ${nombre} (${v} ${unidad}) está ${v < min ? 'por debajo' : 'por encima'} del rango pedido (${min} a ${max} ${unidad}).`
    return { valor: v, similitud: null, cumple, puntaje: puntajeRango(v, min, max), motivo }
  }
  if (tipo === 'similitud_minima') {
    if (!referencia) throw new Error('La evaluación no tiene señal de referencia definida')
    const sim = similitudRasgos(
      { bpm: medicion?.bpm_promedio, regularidad: medicion?.regularidad, ritmo: medicion?.ritmo },
      referencia
    )
    if (sim === null) throw new Error('No hay BPM suficiente para comparar con la referencia')
    const minimo = Number(criterio.valor)
    const cumple = sim >= minimo
    const nombre = referencia.nombre || 'la referencia'
    const motivo = cumple
      ? `Tu señal tiene ${sim} % de similitud con «${nombre}» (mínimo ${minimo} %).`
      : `Tu señal tiene ${sim} % de similitud con «${nombre}»; el mínimo era ${minimo} %.`
    return { valor: sim, similitud: sim, cumple, puntaje: puntajeSimilitud(sim, minimo), motivo }
  }
  throw new Error('La evaluación no tiene un criterio válido')
}

/** Misma regla de calcular_nivel (RF112). Umbrales por defecto: 70 y 40. */
export function nivelPorPorcentaje(porcentaje, logrado = 70, medio = 40) {
  if (porcentaje >= logrado) return 'logrado'
  if (porcentaje >= medio) return 'medianamente_logrado'
  return 'no_logrado'
}

export const ETIQUETA_NIVEL = {
  logrado: 'Logrado',
  medianamente_logrado: 'Medianamente logrado',
  no_logrado: 'No logrado'
}

/** Texto corto para mostrar el resultado al estudiante. */
export function resumenResultado(r) {
  if (!r) return ''
  const nivel = ETIQUETA_NIVEL[r.nivel] || ''
  const partes = [r.motivo, `Puntaje: ${Number(r.puntaje)} %`]
  if (nivel) partes.push(`Nivel: ${nivel}`)
  if (r.intentos_restantes > 0) partes.push(`Te quedan ${r.intentos_restantes} intento(s).`)
  return partes.join(' ')
}

/** Mensajes de la base más claros para el estudiante. */
export function mensajeErrorCalificacion(error) {
  const texto = String(error?.message || error || '')
  if (/Ya usaste todos tus intentos/i.test(texto)) return texto
  if (/anterior a la apertura/i.test(texto)) return 'Esa medición es anterior a la apertura de la evaluación. Haz una medición nueva.'
  if (/calidad de se(ñ|n)al mala/i.test(texto)) return 'La señal de esa medición es mala. Repite la medición con el dedo quieto.'
  if (/est(á|a) cerrada/i.test(texto)) return 'La evaluación ya está cerrada.'
  return texto || 'No se pudo calificar el ejercicio.'
}
