/**
 * RF104 / RF109: datos de la asignación de una evaluación (a qué curso y cuándo).
 * Al crear una evaluación o usar una plantilla, el profesor indica aquí a quién va dirigida
 * (toda el aula o un curso) y la fecha de inicio y de término, o la duración si es en vivo.
 */

export const MODOS_ASIGNACION = {
  ventana: { valor: 'ventana', etiqueta: 'Fechas de inicio y término' },
  en_vivo: { valor: 'en_vivo', etiqueta: 'En vivo (con tiempo límite)' }
}

export const DURACION_EN_VIVO = { min: 1, max: 600, porDefecto: 30 }

/** Estado inicial del formulario de asignación. */
export function asignacionVacia() {
  return { asignar: false, cursoId: '', modo: 'ventana', abreEn: '', cierraEn: '', duracionMin: DURACION_EN_VIVO.porDefecto }
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

/** Lista de errores (vacía si la asignación es válida). */
export function validarAsignacion(a, ahora = new Date()) {
  const errores = []
  if (!a || !MODOS_ASIGNACION[a.modo]) {
    errores.push('Elige cómo se aplica la evaluación.')
    return errores
  }
  if (a.modo === 'ventana') {
    if (!a.abreEn) errores.push('Indica la fecha y hora de inicio.')
    if (!a.cierraEn) errores.push('Indica la fecha y hora de término.')
    if (a.abreEn && a.cierraEn) {
      const abre = new Date(a.abreEn)
      const cierra = new Date(a.cierraEn)
      if (Number.isNaN(abre.getTime()) || Number.isNaN(cierra.getTime())) {
        errores.push('Las fechas no son válidas.')
      } else if (cierra <= abre) {
        errores.push('El término debe ser posterior al inicio.')
      } else if (cierra <= ahora) {
        errores.push('El término ya pasó: elige una fecha futura.')
      }
    }
  } else {
    const minutos = Number(a.duracionMin)
    if (!Number.isInteger(minutos) || minutos < DURACION_EN_VIVO.min || minutos > DURACION_EN_VIVO.max) {
      errores.push(`La duración debe ser de ${DURACION_EN_VIVO.min} a ${DURACION_EN_VIVO.max} minutos.`)
    }
  }
  return errores
}

/** Parámetros para `asignarEvaluacion` (sin el id de la evaluación). */
export function parametrosAsignacion(a) {
  const alcance = a.cursoId ? 'curso' : 'aula'
  if (a.modo === 'ventana') {
    return {
      modo: 'ventana',
      alcance,
      cursoId: a.cursoId || null,
      abreEn: new Date(a.abreEn).toISOString(),
      cierraEn: new Date(a.cierraEn).toISOString(),
      tiempoLimiteS: null
    }
  }
  return { modo: 'en_vivo', alcance, cursoId: a.cursoId || null, abreEn: null, cierraEn: null, tiempoLimiteS: Number(a.duracionMin) * 60 }
}

/** Texto corto de lo asignado, para mostrar en los avisos. */
export function describirAsignacion(a, cursos = []) {
  const curso = a.cursoId ? cursos.find((c) => c.id === a.cursoId) : null
  const destino = a.cursoId ? `el curso «${curso?.nombre || 'seleccionado'}»` : 'toda el aula'
  const formato = (v) => new Date(v).toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' })
  if (a.modo === 'ventana') return `${destino}, del ${formato(a.abreEn)} al ${formato(a.cierraEn)}`
  return `${destino}, en vivo con ${Number(a.duracionMin)} minutos de duración`
}
