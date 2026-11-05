/**
 * Lógica pura del panel de administración (RF46): método de sincronización y contenidos precargados.
 * Sin red ni pantalla, para poder probarla con Node (scripts/test-rf46-panel.mjs).
 */
import { CATEGORIAS, LECCIONES, TIPOS_BLOQUE } from '../data/lecciones.js'

export const METODOS_SINCRONIZACION = {
  correlacion_cruzada: {
    nombre: 'Correlación cruzada',
    descripcion: 'Desplaza una señal sobre otra hasta encontrar el retardo con mayor parecido. Es el método por defecto.'
  },
  alineacion_por_picos: {
    nombre: 'Alineación por picos',
    descripcion: 'Alinea las señales haciendo coincidir los picos (latidos) detectados en cada una.'
  },
  dtw: {
    nombre: 'DTW (deformación temporal dinámica)',
    descripcion: 'Permite que una señal se estire o comprima en el tiempo para adaptarse a la otra.'
  }
}

export const METODO_POR_DEFECTO = 'correlacion_cruzada'

/** Devuelve el método si es válido; si no, el de por defecto. */
export function metodoValido(metodo, disponibles = Object.keys(METODOS_SINCRONIZACION)) {
  return typeof metodo === 'string' && disponibles.includes(metodo) ? metodo : METODO_POR_DEFECTO
}

export const TIPOS_PROPUESTA = {
  rango: 'Rango de BPM / SpO₂',
  metodo_sync: 'Método de sincronización',
  leccion: 'Contenido de lección',
  contenido: 'Contenido',
  caso: 'Caso'
}

const LIM = { titulo: 120, resumen: 300, minutosMax: 120, bloquesMax: 40 }

/**
 * Valida una lección editable. Devuelve la lista de errores (vacía si es válida).
 * Espejo de lo que la pantalla de aprendizaje sabe dibujar (tipos de bloque de data/lecciones.js).
 */
export function validarLeccion(l) {
  const errores = []
  if (!l || typeof l !== 'object') return ['La lección no es válida.']
  if (!l.slug || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(l.slug)) errores.push('El identificador de la lección no es válido.')
  const titulo = String(l.titulo ?? '').trim()
  if (!titulo) errores.push('El título es obligatorio.')
  if (titulo.length > LIM.titulo) errores.push(`El título no puede pasar de ${LIM.titulo} caracteres.`)
  const resumen = String(l.resumen ?? '').trim()
  if (!resumen) errores.push('El resumen es obligatorio.')
  if (resumen.length > LIM.resumen) errores.push(`El resumen no puede pasar de ${LIM.resumen} caracteres.`)
  if (!(l.categoria in CATEGORIAS)) errores.push('La categoría no existe.')
  const min = Number(l.minutos)
  if (!Number.isInteger(min) || min < 1 || min > LIM.minutosMax) errores.push(`Los minutos de lectura deben ser un entero entre 1 y ${LIM.minutosMax}.`)
  if (!Array.isArray(l.bloques) || l.bloques.length < 1) {
    errores.push('La lección necesita al menos un bloque de contenido.')
  } else {
    if (l.bloques.length > LIM.bloquesMax) errores.push(`Máximo ${LIM.bloquesMax} bloques por lección.`)
    l.bloques.forEach((b, i) => {
      if (!b || typeof b !== 'object' || !TIPOS_BLOQUE.includes(b.tipo)) {
        errores.push(`El bloque ${i + 1} tiene un tipo desconocido (válidos: ${TIPOS_BLOQUE.join(', ')}).`)
      }
    })
  }
  return errores
}

/** Convierte el texto JSON del editor en una lista de bloques. Devuelve { bloques } o { error }. */
export function parsearBloques(texto) {
  let valor
  try {
    valor = JSON.parse(texto)
  } catch (_) {
    return { error: 'Los bloques no son un JSON válido.' }
  }
  if (!Array.isArray(valor)) return { error: 'Los bloques deben ser una lista (entre corchetes).' }
  return { bloques: valor }
}

/**
 * Junta las lecciones precargadas (código) con los cambios guardados en la base (tabla `lecciones`).
 * Un cambio en la base reemplaza a la lección con el mismo slug; una lección no publicada se oculta.
 * @param {Array} base lecciones precargadas
 * @param {Array} filas filas de la tabla lecciones: { slug, titulo, categoria, contenido: {resumen, minutos, bloques}, orden, publicada }
 */
export function combinarLecciones(base = LECCIONES, filas = []) {
  const porSlug = new Map((filas || []).map((f) => [f.slug, f]))
  return base
    .map((l) => {
      const f = porSlug.get(l.slug)
      if (!f) return l
      if (f.publicada === false) return null
      const c = f.contenido && typeof f.contenido === 'object' && !Array.isArray(f.contenido) ? f.contenido : {}
      return {
        ...l,
        titulo: f.titulo || l.titulo,
        categoria: f.categoria in CATEGORIAS ? f.categoria : l.categoria,
        resumen: c.resumen || l.resumen,
        minutos: Number.isInteger(c.minutos) ? c.minutos : l.minutos,
        bloques: Array.isArray(c.bloques) && c.bloques.length ? c.bloques : l.bloques
      }
    })
    .filter(Boolean)
}

/** Texto corto para mostrar una propuesta pendiente al administrador. */
export function describirPropuesta(p) {
  const x = p?.propuesta || {}
  switch (p?.tipo) {
    case 'metodo_sync':
      return `Cambiar el método de sincronización a «${METODOS_SINCRONIZACION[x.metodo]?.nombre || x.metodo}»`
    case 'leccion':
      return `Editar la lección «${x.titulo || p.entidad_id}»${Array.isArray(x.contenido?.bloques) ? ` (${x.contenido.bloques.length} bloques)` : ''}`
    case 'rango':
      return `Rango ${x.edad_min}–${x.edad_max} años: BPM ${x.bpm_min}–${x.bpm_max}, SpO₂ ${x.spo2_min}–${x.spo2_max}`
    default:
      return TIPOS_PROPUESTA[p?.tipo] || 'Propuesta'
  }
}
