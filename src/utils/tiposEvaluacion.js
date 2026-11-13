/**
 * RF106: tipos de evaluación.
 * Una evaluación es de preguntas, un ejercicio aplicado (medir pulso, medir SpO₂ o comparar señales)
 * o mixta (preguntas + uno o más ejercicios aplicados, RF107).
 * Los valores coinciden con los CHECK de la tabla `evaluaciones` (migraciones 20261027000500 y 20261113000200).
 * La calificación automática es del RF107 (ver calificacionEjercicio.js): aquí se captura y valida el criterio.
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
  },
  mixta: {
    valor: 'mixta',
    etiqueta: 'Preguntas + ejercicios aplicados',
    descripcion: 'El estudiante responde preguntas y además realiza uno o más ejercicios aplicados.'
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

export const ORIGENES_REFERENCIA = ['plantilla', 'medicion']
export const REINTENTOS = { min: 1, max: 5, porDefecto: 1 }
// Puntos que vale cada ejercicio de una evaluación mixta (las preguntas usan su propio puntaje).
export const PUNTAJE_EJERCICIO = { min: 1, max: 1000, porDefecto: 20 }
export const MAX_EJERCICIOS_MIXTA = 10

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

/** Un ejercicio nuevo para la lista de una evaluación mixta (aún sin elegir cuál). */
export function ejercicioMixtoVacio() {
  return { ejercicio: null, criterio: null, puntaje: PUNTAJE_EJERCICIO.porDefecto }
}

/** Cambia el tipo. "Preguntas" no guarda ejercicio ni criterio; "mixta" guarda una lista de ejercicios. */
export function cambiarTipo(modelo, tipo) {
  if (!TIPOS_EVALUACION[tipo]) return { ...modelo }
  if (tipo === 'preguntas') return { tipo, ejercicio: null, criterio: null }
  if (tipo === 'mixta') {
    // Si venía de un ejercicio aplicado, ese ejercicio pasa a ser el primero de la lista
    const primero = modelo.ejercicio
      ? [{ ejercicio: modelo.ejercicio, criterio: modelo.criterio, puntaje: PUNTAJE_EJERCICIO.porDefecto }]
      : null
    const lista = modelo.ejercicios?.length ? modelo.ejercicios : (primero || [ejercicioMixtoVacio()])
    const nuevo = { tipo, ejercicio: null, criterio: null, ejercicios: lista }
    if (modelo.reintentos !== undefined) nuevo.reintentos = modelo.reintentos
    return nuevo
  }
  const { ejercicios: _descartados, ...resto } = modelo
  return { ...resto, tipo, ejercicio: modelo.ejercicio ?? null, criterio: modelo.criterio ?? null }
}

/** Cambia el ejercicio y deja el criterio por defecto de ese ejercicio. */
export function cambiarEjercicio(modelo, ejercicio) {
  if (!EJERCICIOS[ejercicio]) return { ...modelo, ejercicio: null, criterio: null }
  const nuevo = { tipo: 'ejercicio_aplicado', ejercicio, criterio: criterioPorDefecto(ejercicio) }
  if (modelo?.reintentos !== undefined) nuevo.reintentos = modelo.reintentos
  return nuevo
}

/** Agrega un ejercicio a una evaluación mixta (hasta MAX_EJERCICIOS_MIXTA). */
export function agregarEjercicioMixto(modelo) {
  const lista = modelo.ejercicios || []
  if (lista.length >= MAX_EJERCICIOS_MIXTA) return { ...modelo }
  return { ...modelo, ejercicios: [...lista, ejercicioMixtoVacio()] }
}

/** Quita un ejercicio de la lista (siempre queda al menos uno). */
export function quitarEjercicioMixto(modelo, indice) {
  const lista = modelo.ejercicios || []
  if (lista.length <= 1) return { ...modelo }
  return { ...modelo, ejercicios: lista.filter((_, i) => i !== indice) }
}

/** Cambia el ejercicio de una posición de la lista y deja su criterio por defecto. */
export function cambiarEjercicioMixto(modelo, indice, ejercicio) {
  const lista = (modelo.ejercicios || []).map((e, i) => {
    if (i !== indice) return e
    return EJERCICIOS[ejercicio]
      ? { ...e, ejercicio, criterio: criterioPorDefecto(ejercicio) }
      : { ...e, ejercicio: null, criterio: null }
  })
  return { ...modelo, ejercicios: lista }
}

const esNumero = (v) => v !== null && v !== '' && v !== undefined && Number.isFinite(Number(v))

/** Errores de un ejercicio con su criterio (vacía si es válido). Lo usan el ejercicio simple y cada ejercicio de la mixta. */
export function validarEjercicioCriterio(ejercicio, criterio, { exigirReferencia = false } = {}) {
  const errores = []
  const ej = EJERCICIOS[ejercicio]
  if (!ej) {
    errores.push('Elige el ejercicio: medir el pulso, medir la SpO₂ o comparar señales.')
    return errores
  }
  const c = criterio
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
  return errores
}

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

  if (modelo.tipo === 'mixta') {
    if (modelo.ejercicio || modelo.criterio) errores.push('En una evaluación mixta los ejercicios van en la lista de ejercicios.')
    const lista = modelo.ejercicios
    if (!Array.isArray(lista) || !lista.length) {
      errores.push('Agrega al menos un ejercicio aplicado.')
    } else if (lista.length > MAX_EJERCICIOS_MIXTA) {
      errores.push(`Una evaluación mixta admite hasta ${MAX_EJERCICIOS_MIXTA} ejercicios.`)
    } else {
      lista.forEach((e, i) => {
        for (const msg of validarEjercicioCriterio(e.ejercicio, e.criterio, { exigirReferencia })) {
          errores.push(`Ejercicio ${i + 1}: ${msg}`)
        }
        const pts = Number(e.puntaje)
        if (!esNumero(e.puntaje) || pts < PUNTAJE_EJERCICIO.min || pts > PUNTAJE_EJERCICIO.max) {
          errores.push(`Ejercicio ${i + 1}: el puntaje debe estar entre ${PUNTAJE_EJERCICIO.min} y ${PUNTAJE_EJERCICIO.max}.`)
        }
      })
    }
  } else {
    errores.push(...validarEjercicioCriterio(modelo.ejercicio, modelo.criterio, { exigirReferencia }))
    if (errores.length) return errores
  }

  if (modelo.reintentos !== undefined && modelo.reintentos !== null && modelo.reintentos !== '') {
    const r = Number(modelo.reintentos)
    if (!Number.isInteger(r) || r < REINTENTOS.min || r > REINTENTOS.max) {
      errores.push(`Los intentos permitidos deben estar entre ${REINTENTOS.min} y ${REINTENTOS.max}.`)
    }
  }
  return errores
}

/** Criterio listo para guardar (números ya convertidos). */
function criterioParaGuardar(clave, criterio) {
  const ej = EJERCICIOS[clave]
  const salida = ej.forma === 'rango'
    ? { tipo: ej.criterio, min: Number(criterio.min), max: Number(criterio.max) }
    : { tipo: ej.criterio, valor: Number(criterio.valor) }
  if (ej.forma === 'minimo' && criterio.referencia) {
    salida.referencia = { origen: criterio.referencia.origen, id: criterio.referencia.id }
  }
  return salida
}

/** Campos que se guardan en `evaluaciones` (números ya convertidos). Lanza si el modelo es inválido. */
export function camposTipoParaGuardar(modelo, opciones = {}) {
  const errores = validarTipoEvaluacion(modelo, opciones)
  if (errores.length) throw new Error(errores[0])
  if (modelo.tipo === 'preguntas') return { tipo: 'preguntas', ejercicio: null, criterio: null }
  const campos = modelo.tipo === 'mixta'
    ? { tipo: 'mixta', ejercicio: null, criterio: null }
    : { tipo: 'ejercicio_aplicado', ejercicio: modelo.ejercicio, criterio: criterioParaGuardar(modelo.ejercicio, modelo.criterio) }
  if (modelo.reintentos !== undefined && modelo.reintentos !== null && modelo.reintentos !== '') {
    campos.max_reintentos = Number(modelo.reintentos) // RF107
  }
  return campos
}

/**
 * Filas de `evaluacion_ejercicios` de una evaluación mixta (sin evaluacion_id).
 * Vacío si la evaluación no es mixta. Lanza si el modelo es inválido.
 */
export function ejerciciosParaGuardar(modelo, opciones = {}) {
  if (modelo?.tipo !== 'mixta') return []
  const errores = validarTipoEvaluacion(modelo, opciones)
  if (errores.length) throw new Error(errores[0])
  return modelo.ejercicios.map((e, i) => ({
    orden: i + 1,
    ejercicio: e.ejercicio,
    criterio: criterioParaGuardar(e.ejercicio, e.criterio),
    puntaje: Number(e.puntaje)
  }))
}

/** Modelo de formulario a partir de una fila de la base. */
export function modeloDesdeFila(fila) {
  if (!fila || !TIPOS_EVALUACION[fila.tipo]) return modeloVacio()
  if (fila.tipo === 'preguntas') return modeloVacio()
  let modelo
  if (fila.tipo === 'mixta') {
    const lista = [...(fila.evaluacion_ejercicios || fila.ejercicios || [])]
      .sort((a, b) => (a.orden || 0) - (b.orden || 0))
      .map((e) => ({ ejercicio: e.ejercicio, criterio: e.criterio ? { ...e.criterio } : null, puntaje: Number(e.puntaje) }))
    modelo = { tipo: 'mixta', ejercicio: null, criterio: null, ejercicios: lista.length ? lista : [ejercicioMixtoVacio()] }
  } else {
    modelo = { tipo: fila.tipo, ejercicio: fila.ejercicio || null, criterio: fila.criterio ? { ...fila.criterio } : null }
  }
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

export function etiquetaTipo(tipo, ejercicio, cantidadEjercicios = 0) {
  if (tipo === 'ejercicio_aplicado') {
    return EJERCICIOS[ejercicio] ? `Ejercicio aplicado: ${EJERCICIOS[ejercicio].etiqueta.toLowerCase()}` : 'Ejercicio aplicado'
  }
  if (tipo === 'mixta') {
    return cantidadEjercicios > 0
      ? `Preguntas + ${cantidadEjercicios} ejercicio${cantidadEjercicios === 1 ? '' : 's'} aplicado${cantidadEjercicios === 1 ? '' : 's'}`
      : 'Preguntas + ejercicios aplicados'
  }
  return TIPOS_EVALUACION[tipo]?.etiqueta || 'Evaluación'
}

/** Lo que ve el estudiante: qué se le pide. */
export function instruccionParaEstudiante(tipo, ejercicio) {
  if (tipo === 'ejercicio_aplicado') return EJERCICIOS[ejercicio]?.instruccion || 'Realiza el ejercicio indicado por tu profesor.'
  if (tipo === 'mixta') return 'Responde las preguntas y realiza los ejercicios aplicados de la evaluación.'
  return 'Responde las preguntas de la evaluación.'
}
