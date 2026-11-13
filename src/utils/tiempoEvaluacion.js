/**
 * RF109: cuánto falta para que una evaluación esté disponible o se cierre, para mostrarlo al estudiante.
 * Usa lo que devuelve `mis_evaluaciones_rf109`: modo, abre_en, cierra_en y disponibilidad.
 */

const SEGUNDO = 1000
const MINUTO = 60 * SEGUNDO
const HORA = 60 * MINUTO
const DIA = 24 * HORA

/** Duración legible: «2 d 3 h 15 min», «3 h 05 min», «12 min 05 s» o «45 s». */
export function formatearDuracion(ms) {
  const total = Math.max(0, Math.floor(Number(ms) / SEGUNDO) || 0)
  const d = Math.floor(total / 86400)
  const h = Math.floor((total % 86400) / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const dos = (n) => String(n).padStart(2, '0')
  if (d > 0) return `${d} d ${h} h ${m} min`
  if (h > 0) return `${h} h ${dos(m)} min`
  if (m > 0) return `${m} min ${dos(s)} s`
  return `${s} s`
}

const marca = (valor) => {
  const t = valor ? new Date(valor).getTime() : NaN
  return Number.isFinite(t) ? t : null
}

/**
 * Qué decir del tiempo de una evaluación.
 * @returns {{ texto: string, tipo: 'espera'|'abierta'|'urgente'|'agotada' } | null}
 *   null cuando no hay nada útil que mostrar (ya entregada o cerrada).
 */
export function tiempoEvaluacion(ev, ahora = Date.now()) {
  if (!ev) return null
  const abre = marca(ev.abre_en)
  const cierra = marca(ev.cierra_en)

  if (ev.disponibilidad === 'pendiente') {
    if (abre !== null && abre > ahora) {
      return { texto: `Estará disponible en ${formatearDuracion(abre - ahora)}`, tipo: 'espera' }
    }
    if (ev.modo === 'en_vivo') {
      return { texto: 'Se abrirá cuando tu profesor la inicie', tipo: 'espera' }
    }
    return { texto: 'Se abrirá en unos instantes', tipo: 'espera' }
  }

  if (ev.disponibilidad === 'disponible') {
    if (cierra === null) return { texto: 'Disponible ahora', tipo: 'abierta' }
    const falta = cierra - ahora
    if (falta <= 0) return { texto: 'Se acabó el tiempo', tipo: 'agotada' }
    return {
      texto: `Disponible ahora · se cierra en ${formatearDuracion(falta)}`,
      tipo: falta <= 10 * MINUTO ? 'urgente' : 'abierta'
    }
  }
  return null
}

/** Tiempo que queda mientras se rinde (solo si la evaluación tiene cierre). */
export function tiempoParaEntregar(ev, ahora = Date.now()) {
  const cierra = marca(ev?.cierra_en)
  if (cierra === null) return null
  const falta = cierra - ahora
  if (falta <= 0) return { texto: 'Se acabó el tiempo: entrega ahora', tipo: 'agotada' }
  return { texto: `Tiempo restante: ${formatearDuracion(falta)}`, tipo: falta <= 5 * MINUTO ? 'urgente' : 'abierta' }
}

/** ¿Hay que volver a pedir el listado porque cambió el estado de esta evaluación por el paso del tiempo? */
export function cambioPorTiempo(ev, ahora = Date.now()) {
  const abre = marca(ev.abre_en)
  const cierra = marca(ev.cierra_en)
  if (ev.disponibilidad === 'pendiente' && abre !== null && abre <= ahora) return 'abrio'
  if (ev.disponibilidad === 'disponible' && cierra !== null && cierra <= ahora) return 'cerro'
  return null
}

export const _UNIDADES = { SEGUNDO, MINUTO, HORA, DIA }
