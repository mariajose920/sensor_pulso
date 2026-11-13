/**
 * RF104 / RF109: datos de la asignación de una evaluación (a qué curso y cuándo).
 * Al crear una evaluación o usar una plantilla, el profesor indica aquí a quién va dirigida
 * (toda el aula o un curso) y cuándo empieza: en una fecha y hora, dentro de N minutos, o (solo en vivo)
 * cuando él la inicie. Llegada la hora, la evaluación se abre sola (ver la migración 20261113000400).
 */

export const MODOS_ASIGNACION = {
  ventana: { valor: 'ventana', etiqueta: 'Fechas de inicio y término' },
  en_vivo: { valor: 'en_vivo', etiqueta: 'En vivo (con tiempo límite)' }
}

export const TIPOS_INICIO = {
  fecha: { valor: 'fecha', etiqueta: 'En una fecha y hora' },
  minutos: { valor: 'minutos', etiqueta: 'Dentro de unos minutos' },
  manual: { valor: 'manual', etiqueta: 'Cuando yo la inicie' }
}

/** Formas de empezar que admite cada modo: «manual» solo existe en vivo. */
export const INICIOS_POR_MODO = {
  ventana: ['fecha', 'minutos'],
  en_vivo: ['fecha', 'minutos', 'manual']
}

export const DURACION_EN_VIVO = { min: 1, max: 600, porDefecto: 30 }
export const INICIO_EN_MINUTOS = { min: 1, max: 43200, porDefecto: 15 } // hasta 30 días

/** Estado inicial del formulario de asignación. */
export function asignacionVacia() {
  return {
    asignar: false,
    cursoId: '',
    modo: 'ventana',
    inicioTipo: 'fecha',
    inicioMin: INICIO_EN_MINUTOS.porDefecto,
    abreEn: '',
    cierraEn: '',
    duracionMin: DURACION_EN_VIVO.porDefecto
  }
}

/** Fecha para un <input type="datetime-local"> (hora local, sin segundos). */
export function fechaParaInput(fecha) {
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  if (Number.isNaN(d.getTime())) return ''
  const dos = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}T${dos(d.getHours())}:${dos(d.getMinutes())}`
}

/** Propuesta de fechas: empieza dentro de una hora y dura una semana. */
export function fechasSugeridas(ahora = new Date()) {
  const inicio = new Date(ahora.getTime() + 60 * 60 * 1000)
  inicio.setMinutes(0, 0, 0)
  const termino = new Date(inicio.getTime() + 7 * 24 * 60 * 60 * 1000)
  return { abreEn: fechaParaInput(inicio), cierraEn: fechaParaInput(termino) }
}

const esEntero = (v, min, max) => {
  const n = Number(v)
  return v !== '' && v !== null && v !== undefined && Number.isInteger(n) && n >= min && n <= max
}

/**
 * Momento en que empieza la evaluación según lo elegido. null si lo inicia el profesor a mano
 * o si lo ingresado no es válido.
 */
export function inicioCalculado(a, ahora = new Date()) {
  if (!a) return null
  if (a.inicioTipo === 'minutos') {
    return esEntero(a.inicioMin, INICIO_EN_MINUTOS.min, INICIO_EN_MINUTOS.max)
      ? new Date(ahora.getTime() + Number(a.inicioMin) * 60 * 1000)
      : null
  }
  if (a.inicioTipo === 'fecha' && a.abreEn) {
    const d = new Date(a.abreEn)
    return Number.isNaN(d.getTime()) ? null : d
  }
  return null
}

/** Lista de errores (vacía si la asignación es válida). */
export function validarAsignacion(a, ahora = new Date()) {
  const errores = []
  if (!a || !MODOS_ASIGNACION[a.modo]) {
    errores.push('Elige cómo se aplica la evaluación.')
    return errores
  }
  if (!(INICIOS_POR_MODO[a.modo] || []).includes(a.inicioTipo)) {
    errores.push(a.inicioTipo === 'manual'
      ? 'Una evaluación con fechas no puede iniciarla el profesor a mano: indica cuándo empieza.'
      : 'Elige cuándo empieza la evaluación.')
    return errores
  }

  // Cuándo empieza
  if (a.inicioTipo === 'minutos' && !esEntero(a.inicioMin, INICIO_EN_MINUTOS.min, INICIO_EN_MINUTOS.max)) {
    errores.push(`Indica en cuántos minutos empieza (de ${INICIO_EN_MINUTOS.min} a ${INICIO_EN_MINUTOS.max}).`)
  }
  if (a.inicioTipo === 'fecha') {
    if (!a.abreEn) errores.push('Indica la fecha y hora de inicio.')
    else if (Number.isNaN(new Date(a.abreEn).getTime())) errores.push('La fecha de inicio no es válida.')
  }
  const inicio = inicioCalculado(a, ahora)

  if (a.modo === 'ventana') {
    if (!a.cierraEn) {
      errores.push('Indica la fecha y hora de término.')
    } else {
      const cierra = new Date(a.cierraEn)
      if (Number.isNaN(cierra.getTime())) errores.push('La fecha de término no es válida.')
      else if (inicio && cierra <= inicio) errores.push('El término debe ser posterior al inicio.')
      else if (cierra <= ahora) errores.push('El término ya pasó: elige una fecha futura.')
    }
  } else {
    if (!esEntero(a.duracionMin, DURACION_EN_VIVO.min, DURACION_EN_VIVO.max)) {
      errores.push(`La duración debe ser de ${DURACION_EN_VIVO.min} a ${DURACION_EN_VIVO.max} minutos.`)
    } else if (a.inicioTipo === 'fecha' && inicio && inicio.getTime() + Number(a.duracionMin) * 60000 <= ahora.getTime()) {
      errores.push('La hora de inicio ya pasó: elige una hora futura.')
    }
  }
  return errores
}

/** Parámetros para `asignarEvaluacion` (sin el id de la evaluación). El inicio «en N minutos» se fija aquí. */
export function parametrosAsignacion(a, ahora = new Date()) {
  const alcance = a.cursoId ? 'curso' : 'aula'
  const inicio = inicioCalculado(a, ahora)
  if (a.modo === 'ventana') {
    return {
      modo: 'ventana',
      alcance,
      cursoId: a.cursoId || null,
      abreEn: inicio.toISOString(),
      cierraEn: new Date(a.cierraEn).toISOString(),
      tiempoLimiteS: null
    }
  }
  return {
    modo: 'en_vivo',
    alcance,
    cursoId: a.cursoId || null,
    abreEn: a.inicioTipo === 'manual' || !inicio ? null : inicio.toISOString(), // null = la inicia el profesor
    cierraEn: null,
    tiempoLimiteS: Number(a.duracionMin) * 60
  }
}

const formato = (v) => new Date(v).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })

/** Texto corto de lo asignado, para mostrar en los avisos. `parametros` fija la hora cuando fue «en N minutos». */
export function describirAsignacion(a, cursos = [], parametros = null) {
  const curso = a.cursoId ? cursos.find((c) => c.id === a.cursoId) : null
  const destino = a.cursoId ? `el curso «${curso?.nombre || 'seleccionado'}»` : 'toda el aula'
  const abre = parametros?.abreEn || inicioCalculado(a)?.toISOString() || null
  if (a.modo === 'ventana') return `${destino}, del ${formato(abre || a.abreEn)} al ${formato(a.cierraEn)}`
  const duracion = `${Number(a.duracionMin)} minutos de duración`
  if (a.inicioTipo === 'manual' || !abre) return `${destino}, en vivo (la inicias tú) con ${duracion}`
  return `${destino}, en vivo: se inicia sola el ${formato(abre)} con ${duracion}`
}
