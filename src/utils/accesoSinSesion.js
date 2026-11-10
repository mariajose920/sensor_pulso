/**
 * Qué se puede hacer sin iniciar sesión: solo estudiar (Aprendizaje) o comparar (Comparación).
 * Medir, gestionar sensores y entrar a las aulas exigen sesión.
 */

// Pantallas que exigen sesión → motivo que se muestra en el login
const MOTIVO_POR_RUTA = {
  Medicion: 'medicion',
  Dispositivos: 'medicion',
  Aulas: 'aulas',
  AulaDetalle: 'aulas'
}

export const MENSAJES_SESION_REQUERIDA = {
  medicion: 'Para medir necesitas iniciar sesión: sin sesión no hay sensor. Mientras tanto puedes estudiar en Aprendizaje o comparar señales en Comparación.',
  aulas: 'Para entrar a las aulas necesitas iniciar sesión. Mientras tanto puedes estudiar en Aprendizaje o comparar señales en Comparación.'
}

/** Motivo para el login según la pantalla que se pidió (undefined si no hay uno propio). */
export function motivoDeRuta(nombreRuta) {
  return MOTIVO_POR_RUTA[nombreRuta]
}

/** Texto del aviso del login para un motivo ('' si no corresponde). */
export function mensajeSesionRequerida(motivo) {
  return MENSAJES_SESION_REQUERIDA[motivo] || ''
}

// Enlaces del menú que solo ve quien tiene sesión
export const ENLACES_SOLO_CON_SESION = ['/medicion', '/dispositivos', '/aulas']
