// Lógica de la práctica para evaluaciones: armar un cuestionario y corregirlo explicando cada error.
// No guarda nada: es práctica libre, igual para quien tiene sesión y para quien no.

/** Baraja una copia del arreglo (Fisher-Yates). `azar` permite fijar el resultado en las pruebas. */
export function barajar(lista, azar = Math.random) {
  const copia = [...lista]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(azar() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }
  return copia
}

/**
 * Arma un cuestionario con preguntas (y opciones) en orden al azar.
 * @param {Array} banco - preguntas disponibles
 * @param {{cantidad?: number, leccion?: string, ids?: string[]}} opciones
 */
export function armarPractica(banco, { cantidad = 8, leccion = 'todas', ids = null } = {}, azar = Math.random) {
  let base = banco
  if (ids) base = banco.filter(p => ids.includes(p.id))
  else if (leccion && leccion !== 'todas') base = banco.filter(p => p.leccion === leccion)
  const n = Math.max(1, Math.min(Number(cantidad) || base.length, base.length))

  let elegidas
  if (!ids && (!leccion || leccion === 'todas')) {
    // Todos los temas: se reparte parejo (una pregunta de cada tema por vuelta) para que no queden temas fuera
    const porTema = {}
    barajar(base, azar).forEach(p => { (porTema[p.leccion] ||= []).push(p) })
    const colas = barajar(Object.values(porTema), azar)
    elegidas = []
    while (elegidas.length < n) {
      let agrego = false
      for (const cola of colas) {
        if (elegidas.length >= n) break
        if (cola.length) { elegidas.push(cola.shift()); agrego = true }
      }
      if (!agrego) break
    }
    elegidas = barajar(elegidas, azar)
  } else {
    elegidas = barajar(base, azar).slice(0, n)
  }
  return elegidas.map(p => ({ ...p, opciones: barajar(p.opciones, azar) }))
}

// Cantidades que se ofrecen: de 4 en 4, hasta 16 por tema o hasta 28 si son todos los temas
export const PASO_CANTIDAD = 4
export const MAXIMO_POR_TEMA = 16
export const MAXIMO_TODOS_LOS_TEMAS = 28

export function opcionesDeCantidad(banco, leccion = 'todas') {
  const todos = !leccion || leccion === 'todas'
  const disponibles = todos ? banco.length : banco.filter(p => p.leccion === leccion).length
  const tope = Math.min(disponibles, todos ? MAXIMO_TODOS_LOS_TEMAS : MAXIMO_POR_TEMA)
  const lista = []
  for (let n = PASO_CANTIDAD; n <= tope; n += PASO_CANTIDAD) lista.push(n)
  if (!lista.length && tope > 0) lista.push(tope)
  return lista
}

/**
 * Corrige las respuestas. `respuestas` es { [idPregunta]: indice de la opción elegida }.
 * Cada detalle explica por qué la respuesta elegida estaba mal y cuál era la correcta.
 */
export function corregirPractica(preguntas, respuestas = {}) {
  const detalle = preguntas.map(p => {
    const indiceCorrecto = p.opciones.findIndex(op => op.correcta)
    const elegido = Number.isInteger(respuestas[p.id]) ? respuestas[p.id] : null
    const sinResponder = elegido === null || !p.opciones[elegido]
    const ok = !sinResponder && elegido === indiceCorrecto
    return {
      id: p.id,
      leccion: p.leccion,
      enunciado: p.enunciado,
      ok,
      sinResponder,
      elegida: sinResponder ? null : p.opciones[elegido].texto,
      porQueFalla: ok || sinResponder ? '' : p.opciones[elegido].porQue,
      correcta: p.opciones[indiceCorrecto].texto,
      porQueCorrecta: p.opciones[indiceCorrecto].porQue
    }
  })
  const correctas = detalle.filter(d => d.ok).length
  const total = detalle.length
  return {
    correctas,
    incorrectas: detalle.filter(d => !d.ok && !d.sinResponder).length,
    sinResponder: detalle.filter(d => d.sinResponder).length,
    total,
    porcentaje: total ? Math.round((correctas / total) * 100) : 0,
    detalle,
    // Lecciones a repasar: las de las preguntas falladas o sin responder
    leccionesARepasar: [...new Set(detalle.filter(d => !d.ok).map(d => d.leccion))],
    idsFalladas: detalle.filter(d => !d.ok).map(d => d.id)
  }
}

/** Texto corto según el porcentaje. */
export function valoracion(porcentaje) {
  if (porcentaje >= 85) return 'Muy bien: dominas este contenido.'
  if (porcentaje >= 60) return 'Vas bien, repasa las preguntas que fallaste.'
  return 'Conviene repasar las lecciones antes de la evaluación.'
}
