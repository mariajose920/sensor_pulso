/**
 * Explicación de la causa de una mala señal (RF16)
 *
 * Toma el resultado de evaluarCalidad() (RF15) y, si la calidad es regular o mala,
 * devuelve un mensaje con la causa dominante, por qué pasa, qué hacer y la
 * sugerencia de repetir la medición. Con calidad buena no devuelve ningún aviso.
 *
 * Cada causa (ruido, movimiento, recorte) tiene su propio mensaje.
 * Con calidad mala la medición no se clasifica ni se guarda como válida (ver
 * puedeClasificar y puedeGuardarComoValida, que usan la clasificación y el guardado de RF30).
 */

const ORDEN = { buena: 0, regular: 1, mala: 2 }

export const MENSAJES_CAUSA = {
  ruido: {
    titulo: 'Señal con ruido',
    explicacion:
      'La onda está irregular por pequeñas variaciones rápidas que no son latidos. ' +
      'Suele deberse a luz externa que llega al sensor, a un dedo mal apoyado o a temblor.',
    consejos: [
      'Mantén el dedo quieto y apoyado con suavidad sobre el sensor.',
      'Evita la luz directa sobre el sensor (cúbrelo con la otra mano o aléjate de la ventana).',
      'Apoya la mano sobre una superficie firme para que no tiemble.'
    ]
  },
  movimiento: {
    titulo: 'Movimiento detectado',
    explicacion:
      'La línea base de la señal se desplaza de golpe. ' +
      'Casi siempre es porque la mano, el dedo o el cable se movieron durante la medición.',
    consejos: [
      'Mantén el dedo y la mano quietos durante toda la medición.',
      'Apoya el antebrazo sobre la mesa y respira con calma.',
      'Revisa que el cable del sensor no se tire ni se mueva.'
    ]
  },
  recorte: {
    titulo: 'Sensor saturado',
    explicacion:
      'La señal llega al máximo que puede leer el sensor y se corta (no confundir con la saturación de oxígeno, SpO₂). ' +
      'Suele pasar por presionar demasiado, por mucha luz o por una ganancia muy alta.',
    consejos: [
      'Afloja la presión: el dedo debe apoyarse, no apretar el sensor.',
      'Evita la luz directa del sol o de una lámpara sobre el sensor.',
      'Si tus dedos están fríos, caliéntalos frotando las manos antes de repetir la medición.'
    ]
  }
}

/**
 * Causa dominante: la de peor nivel; si empatan, la primera que entregó evaluarCalidad().
 * @param {{tipo: string, nivel: string}[]} causas
 */
export function causaDominante(causas) {
  if (!Array.isArray(causas) || causas.length === 0) return null
  return causas.reduce((peor, c) => (ORDEN[c.nivel] > ORDEN[peor.nivel] ? c : peor), causas[0])
}

/**
 * Aviso para el usuario según la calidad de la señal.
 * @param {string} nivel 'buena' | 'regular' | 'mala' | 'sin_senal'
 * @param {{tipo: string, nivel: string}[]} causas causas de evaluarCalidad()
 * @returns {null | {nivel: string, tipo: string, titulo: string, explicacion: string,
 *   consejos: string[], sugerencia: string, consecuencia: string|null, causaGuardable: string}}
 *   null si la calidad es buena o no hay señal suficiente (no se muestra ningún aviso).
 */
export function explicarCalidad(nivel, causas = []) {
  if (nivel !== 'regular' && nivel !== 'mala') return null

  const dominante = causaDominante(causas)
  const mensaje = dominante && MENSAJES_CAUSA[dominante.tipo]
  if (!mensaje) return null

  const mala = nivel === 'mala'
  return {
    nivel,
    tipo: dominante.tipo,
    titulo: mensaje.titulo,
    explicacion: mensaje.explicacion,
    consejos: mensaje.consejos,
    sugerencia: mala
      ? 'Te sugerimos repetir la medición antes de continuar.'
      : 'Puedes continuar, pero te sugerimos repetir la medición para un resultado más confiable.',
    consecuencia: mala
      ? 'Con esta calidad la medición no se clasifica ni se guarda como válida.'
      : null,
    // Texto corto para la columna mediciones.causa_calidad (RF30)
    causaGuardable: `${dominante.tipo}: ${mensaje.titulo}`
  }
}

/** Con calidad mala no se clasifica el ritmo (RF18). */
export function puedeClasificar(nivel) {
  return nivel !== 'mala'
}

/** Con calidad mala la medición no se guarda como válida (RF30). */
export function puedeGuardarComoValida(nivel) {
  return nivel !== 'mala'
}
