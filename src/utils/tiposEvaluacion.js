/**
 * RF106: tipos de evaluación.
 * Una evaluación es de preguntas o un ejercicio aplicado (medir pulso, medir SpO₂ o comparar señales).
 * Los valores coinciden con los CHECK de la tabla `evaluaciones` (migración 20261027000500_evaluaciones.sql).
 * La calificación automática es del RF107: aquí solo se captura y valida el criterio.
 */

export const TIPOS_EVALUACION = {
  preguntas: {
    valor: 'preguntas',
    etiqueta: 'Preguntas',
    descripcion: 'El estudiante responde preguntas del banco o de la evaluación.'
  },
  ejercicio_aplicado: {
    valor: 'ejercicio_aplicado',
    etiqueta: 'Ejercicio aplicado',
    descripcion: 'El estudiante realiza una medición o comparación y se califica con un criterio.'
  }
}

// Escala de la similitud entre señales: 0 a 100 (%). Pendiente de confirmar con el análisis de comparación (RF29).
export const EJERCICIOS = {
  medir_pulso: {
    valor: 'medir_pulso',
    etiqueta: 'Medir el pulso',
    instruccion: 'Mide tu pulso con el sensor o con el simulador.',
    criterio: 'bpm_en_rango',
    forma: 'rango',
    unidad: 'BPM',
    limites: { min: 30, max: 220 },
    porDefecto: { min: 60, max: 100 }
  },
  medir_spo2: {
    valor: 'medir_spo2',
    etiqueta: 'Medir la SpO₂',
    instruccion: 'Mide tu saturación de oxígeno (SpO₂) con el sensor o con el simulador.',
    criterio: 'spo2_en_rango',
    forma: 'rango',
    unidad: '%',
    limites: { min: 70, max: 100 },
    porDefecto: { min: 95, max: 100 }
  },
  comparar_senales: {
    valor: 'comparar_senales',
    etiqueta: 'Comparar señales',
    instruccion: 'Compara tu señal con la señal de referencia de la evaluación.',
    criterio: 'similitud_minima',
    forma: 'minimo',
    unidad: '%',
    limites: { min: 1, max: 100 },
    porDefecto: { valor: 70 }
  }
}

export const LISTA_TIPOS = Object.values(TIPOS_EVALUACION)
export const LISTA_EJERCICIOS = Object.values(EJERCICIOS)

/** Modelo del formulario: lo que el profesor está configurando. */
export function modeloVacio() {
  return { tipo: 'preguntas', ejercicio: null, criterio: null }
}

/** Criterio inicial de un ejercicio, con los valores por defecto. */
export function criterioPorDefecto(ejercicio) {
  const ej = EJERCICIOS[ejercicio]
  if (!ej) return null
  return { tipo: ej.criterio, ...ej.porDefecto }
}

/** Cambia el tipo. "Preguntas" no guarda ejercicio ni criterio. */
export function cambiarTipo(modelo, tipo) {
  if (!TIPOS_EVALUACION[tipo]) return { ...modelo }
  if (tipo === 'preguntas') return { tipo, ejercicio: null, criterio: null }
  return { ...modelo, tipo, ejercicio: modelo.ejercicio, criterio: modelo.criterio }
}

/** Cambia el ejercicio y deja el criterio por defecto de ese ejercicio. */
export function cambiarEjercicio(modelo, ejercicio) {
  if (!EJERCICIOS[ejercicio]) return { ...modelo, ejercicio: null, criterio: null }
  const nuevo = { tipo: 'ejercicio_aplicado', ejercicio, criterio: criterioPorDefecto(ejercicio) }
  if (modelo?.reintentos !== undefined) nuevo.reintentos = modelo.reintentos
  return nuevo
}

const esNumero = (v) => v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v))

export const ORIGENES_REFERENCIA = ['plantilla', 'medicion']
export const REINTENTOS = { min: 1, max: 5, porDefecto: 1 }

/**
 * Devuelve la lista de errores (vacía si el modelo es válido).
 * RF107: con `exigirReferencia` la comparación de señales debe traer su señal de referencia.
 */
export function validarTipoEvaluacion(modelo, { exigirReferencia = false } = {}) {
  const errores = []
  if (!modelo || !TIPOS_EVALUACION[modelo.tipo]) {
    errores.push('Elige el tipo de evaluación.')
    return errores
  }
  if (modelo.tipo === 'preguntas') {
    if (modelo.ejercicio) errores.push('Una evaluación de preguntas no lleva ejercicio.')
    if (modelo.criterio) errores.push('Una evaluación de preguntas no lleva criterio.')
    return errores
  }
  const ej = EJERCICIOS[modelo.ejercicio]
  if (!ej) {
    errores.push('Elige el ejercicio: medir el pulso, medir la SpO₂ o comparar señales.')
    return errores
  }
  const c = modelo.criterio
  if (!c || c.tipo !== ej.criterio) {
    errores.push(`El criterio debe ser de tipo «${ej.criterio}».`)
    return errores
  }
  const { min: lmin, max: lmax } = ej.limites
  if (ej.forma === 'rango') {
    if (!esNumero(c.min) || !esNumero(c.max)) {
      errores.push('Indica el mínimo y el máximo del criterio.')
      return errores
    }
    const min = Number(c.min)
    const max = Number(c.max)
    if (min < lmin || max > lmax) errores.push(`Los valores deben estar entre ${lmin} y ${lmax} ${ej.unidad}.`)
    if (min >= max) errores.push('El mínimo debe ser menor que el máximo.')
  } else {
    if (!esNumero(c.valor)) {
      errores.push('Indica la similitud mínima.')
      return errores
    }
    const valor = Number(c.valor)
    if (valor < lmin || valor > lmax) errores.push(`La similitud mínima debe estar entre ${lmin} y ${lmax} ${ej.unidad}.`)
    const ref = c.referencia
    if (ref) {
      if (!ORIGENES_REFERENCIA.includes(ref.origen) || !ref.id) errores.push('La señal de referencia no es válida.')
    } else if (exigirReferencia) {
      errores.push('Elige la señal de referencia para comparar.')
    }
  }
  if (modelo.reintentos !== undefined && modelo.reintentos !== null && modelo.reintentos !== '') {
    const r = Number(modelo.reintentos)
    if (!Number.isInteger(r) || r < REINTENTOS.min || r > REINTENTOS.max) {
      errores.push(`Los intentos permitidos deben estar entre ${REINTENTOS.min} y ${REINTENTOS.max}.`)
    }
  }
  return errores
}

/** Campos que se guardan en `evaluaciones` (números ya convertidos). Lanza si el modelo es inválido. */
export function camposTipoParaGuardar(modelo, opciones = {}) {
  const errores = validarTipoEvaluacion(modelo, opciones)
  if (errores.length) throw new Error(errores[0])
  if (modelo.tipo === 'preguntas') return { tipo: 'preguntas', ejercicio: null, criterio: null }
  const ej = EJERCICIOS[modelo.ejercicio]
  const criterio = ej.forma === 'rango'
    ? { tipo: ej.criterio, min: Number(modelo.criterio.min), max: Number(modelo.criterio.max) }
    : { tipo: ej.criterio, valor: Number(modelo.criterio.valor) }
  if (ej.forma === 'minimo' && modelo.criterio.referencia) {
    criterio.referencia = { origen: modelo.criterio.referencia.origen, id: modelo.criterio.referencia.id }
  }
  const campos = { tipo: 'ejercicio_aplicado', ejercicio: modelo.ejercicio, criterio }
  if (modelo.reintentos !== undefined && modelo.reintentos !== null && modelo.reintentos !== '') {
    campos.max_reintentos = Number(modelo.reintentos) // RF107
  }
  return campos
}

/** Modelo de formulario a partir de una fila de la base. */
export function modeloDesdeFila(fila) {
  if (!fila || !TIPOS_EVALUACION[fila.tipo]) return modeloVacio()
  if (fila.tipo === 'preguntas') return modeloVacio()
  const modelo = { tipo: fila.tipo, ejercicio: fila.ejercicio || null, criterio: fila.criterio ? { ...fila.criterio } : null }
  if (fila.max_reintentos) modelo.reintentos = fila.max_reintentos
  return modelo
}

/** Texto del criterio para mostrarlo, por ejemplo «BPM entre 60 y 100». */
export function describirCriterio(ejercicio, criterio) {
  const ej = EJERCICIOS[ejercicio]
  if (!ej || !criterio) return ''
  if (ej.forma === 'rango') {
    const nombre = ejercicio === 'medir_spo2' ? 'SpO₂' : 'BPM'
    return `${nombre} entre ${criterio.min} y ${criterio.max}${ejercicio === 'medir_spo2' ? ' %' : ''}`
  }
  return `Similitud de al menos ${criterio.valor} %${criterio.referencia ? '' : ' (falta elegir la señal de referencia)'}`
}

export function etiquetaTipo(tipo, ejercicio) {
  if (tipo === 'ejercicio_aplicado') {
    return EJERCICIOS[ejercicio] ? `Ejercicio aplicado: ${EJERCICIOS[ejercicio].etiqueta.toLowerCase()}` : 'Ejercicio aplicado'
  }
  return TIPOS_EVALUACION[tipo]?.etiqueta || 'Evaluación'
}

/** Lo que ve el estudiante: qué se le pide. */
export function instruccionParaEstudiante(tipo, ejercicio) {
  if (tipo === 'ejercicio_aplicado') return EJERCICIOS[ejercicio]?.instruccion || 'Realiza el ejercicio indicado por tu profesor.'
  return 'Responde las preguntas de la evaluación.'
}
