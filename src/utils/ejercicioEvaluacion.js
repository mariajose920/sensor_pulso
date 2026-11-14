/**
 * RF107: ayudas del estudiante para los ejercicios aplicados de una evaluación.
 *  - A dónde ir a hacer el ejercicio (medición o comparación) y cómo volver a la evaluación.
 *  - Borrador de lo avanzado (respuestas y mediciones elegidas) para no perderlo al ir a medir.
 *  - Qué medición es nueva al volver, y el resultado de respaldo cuando la base aún no tiene la función del resultado.
 */

export const ACCION_EJERCICIO = {
  medir_pulso: { texto: 'Realizar medición', icono: '🫀', ruta: 'Medicion', ayuda: 'Mide tu pulso y guarda la medición; después vuelve aquí y súbela.' },
  medir_spo2: { texto: 'Realizar medición', icono: '🫁', ruta: 'Medicion', ayuda: 'Mide tu SpO₂ y guarda la medición; después vuelve aquí y súbela.' },
  comparar_senales: { texto: 'Hacer comparación', icono: '📈', ruta: 'Comparacion', ayuda: 'Haz la comparación de señales y guárdala; después vuelve aquí y súbela.' }
}

/** Texto del botón para ir a hacer el ejercicio. */
export function textoAccionEjercicio(ejercicio) {
  return (ACCION_EJERCICIO[ejercicio] || ACCION_EJERCICIO.medir_pulso).texto
}

/** Ruta (para router.push) de la pantalla donde se hace el ejercicio. Lleva el id y el título para poder volver. */
export function rutaParaEjercicio(ejercicio, evaluacion) {
  const accion = ACCION_EJERCICIO[ejercicio] || ACCION_EJERCICIO.medir_pulso
  return { name: accion.ruta, query: { evaluacion: evaluacion.id, titulo: evaluacion.titulo || '' } }
}

/** Ruta para volver a la evaluación: Mis evaluaciones la abre sola con `abrir`. */
export function rutaVolverEvaluacion(evaluacionId) {
  return { name: 'MisEvaluaciones', query: { abrir: evaluacionId } }
}

// ---------------------------------------------------------------- borrador (sessionStorage de la pestaña)
const PREFIJO = 'sensor_pulso_borrador_evaluacion_estudiante:'
export const claveBorradorEvaluacion = (id) => `${PREFIJO}${id}`

/** Guarda lo avanzado. `almacen` es sessionStorage (o un doble en las pruebas). Nunca lanza. */
export function guardarBorradorEvaluacion(almacen, id, datos) {
  try {
    almacen.setItem(claveBorradorEvaluacion(id), JSON.stringify({ ...datos, guardadoEn: new Date().toISOString() }))
    return true
  } catch (_) {
    return false
  }
}

/** Lee el borrador, o null si no hay o está dañado. */
export function leerBorradorEvaluacion(almacen, id) {
  try {
    const crudo = almacen.getItem(claveBorradorEvaluacion(id))
    return crudo ? JSON.parse(crudo) : null
  } catch (_) {
    return null
  }
}

export function borrarBorradorEvaluacion(almacen, id) {
  try { almacen.removeItem(claveBorradorEvaluacion(id)) } catch (_) { /* nada */ }
}

/**
 * Medición guardada después de `desdeIso` (cuando el estudiante salió a medir): la más reciente, para dejarla elegida
 * al volver. null si no hay ninguna nueva.
 */
export function medicionNuevaDesde(mediciones, desdeIso) {
  const desde = desdeIso ? new Date(desdeIso).getTime() : NaN
  if (!Number.isFinite(desde)) return null
  const nuevas = (mediciones || [])
    .filter((m) => new Date(m.creado_en || m.inicio).getTime() >= desde)
    .sort((a, b) => new Date(b.creado_en || b.inicio) - new Date(a.creado_en || a.inicio))
  return nuevas[0] || null
}

export const ETIQUETA_CALIDAD = { buena: 'señal buena', regular: 'señal regular', mala: 'señal mala' }

/** ¿La base no tiene la función del resultado (migración sin aplicar)? */
export function faltaFuncionResultado(error) {
  const texto = String(error?.message || error || '')
  const codigo = String(error?.code || '')
  return codigo === 'PGRST202' || codigo === '42883' || /could not find the function|function .*resultado_evaluacion.* does not exist/i.test(texto)
}

/**
 * Resultado de respaldo con lo que el estudiante SÍ puede leer (su intento, sus respuestas y las preguntas), cuando la base
 * aún no tiene `resultado_evaluacion`. Marca cada pregunta como correcta o incorrecta, pero no trae la respuesta correcta ni la
 * explicación (esas están ocultas hasta aplicar la migración).
 */
export function resultadoDesdeTablas({ intento, evaluacion, preguntas = [], respuestas = [], ejercicios = [] }) {
  const porPregunta = new Map(respuestas.map((r) => [r.pregunta_id, r]))
  return {
    intento_id: intento?.id || null,
    titulo: evaluacion?.titulo || 'Evaluación',
    tipo: evaluacion?.tipo || 'preguntas',
    puntaje: Number(intento?.puntaje || 0),
    puntaje_maximo: Number(intento?.puntaje_maximo || 0),
    porcentaje: Number(intento?.porcentaje || 0),
    nivel: intento?.nivel || null,
    umbral_logrado: Number(evaluacion?.umbral_logrado ?? 70),
    umbral_medio: Number(evaluacion?.umbral_medio ?? 40),
    respaldo: true,
    preguntas: preguntas.map((fila, i) => {
      const q = fila.preguntas || fila
      const r = porPregunta.get(q.id)
      return {
        pregunta_id: q.id,
        orden: fila.orden ?? i + 1,
        enunciado: q.enunciado,
        tipo: q.tipo,
        opciones: q.opciones || null,
        respondida: Boolean(r),
        respuesta: r ? r.respuesta : null,
        es_correcta: r ? r.es_correcta : null,
        puntaje: Number(r?.puntaje || 0),
        puntaje_maximo: Number(fila.puntaje ?? q.puntaje ?? 0),
        correcta: null,
        explicacion: null
      }
    }),
    ejercicios
  }
}
