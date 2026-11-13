/**
 * sensor_pulso · Biblioteca de casos precargados (RF33)
 *
 * Casos de patologías y arritmias listos para explorar, con su señal PPG y el
 * ECG equivalente de referencia. Es contenido educativo: no sirve para diagnosticar.
 * Reutiliza el catálogo de RF25 y el generador de señales, sin duplicar datos.
 */

import {
  RITMOS_PATOLOGIAS,
  generarTrazadoDualPatologia
} from '../data/ritmosPatologias.js'

export const SEVERIDADES = [
  { valor: 'normal', etiqueta: 'Normal / control' },
  { valor: 'leve', etiqueta: 'Leve' },
  { valor: 'moderada', etiqueta: 'Moderada' },
  { valor: 'alta', etiqueta: 'Alta' }
]

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** Todos los casos precargados. */
export function listarCasos() {
  return RITMOS_PATOLOGIAS.map((r) => ({ ...r }))
}

/** Categorías disponibles, sin repetir, para el filtro. */
export function listarCategorias() {
  const vistas = new Map()
  for (const r of RITMOS_PATOLOGIAS) {
    if (!vistas.has(r.categoria)) vistas.set(r.categoria, r.categoriaEtiqueta)
  }
  return [...vistas].map(([valor, etiqueta]) => ({ valor, etiqueta }))
}

/**
 * Filtra por categoría, severidad y texto libre (nombre y descripción, sin importar tildes).
 * Un filtro vacío o 'todas' no restringe.
 */
export function filtrarCasos({ categoria = 'todas', severidad = 'todas', texto = '' } = {}) {
  const q = sinTildes(texto).trim()
  return listarCasos().filter((c) => {
    if (categoria !== 'todas' && c.categoria !== categoria) return false
    if (severidad !== 'todas' && c.severidad !== severidad) return false
    if (q && !sinTildes(`${c.nombre} ${c.descripcionCorta}`).includes(q)) return false
    return true
  })
}

/** Un caso por id, o null si no existe. */
export function obtenerCaso(id) {
  const c = RITMOS_PATOLOGIAS.find((r) => r.id === id)
  return c ? { ...c } : null
}

/**
 * Señales del caso: PPG y ECG alineados en el tiempo.
 * @returns {{ tiempos:number[], ppg:number[], ecg:number[] } | null}
 */
export function obtenerSenalesCaso(id, duracionSegundos = 4, tasaMuestreo = 100) {
  if (!obtenerCaso(id)) return null
  const { tiempos, ppg, ecg } = generarTrazadoDualPatologia(id, duracionSegundos, tasaMuestreo)
  return { tiempos, ppg, ecg }
}

/** Convierte una serie en los puntos de un polyline SVG (ajustada a ancho x alto). */
export function serieAPuntosSvg(serie, ancho = 600, alto = 100, margen = 6) {
  if (!serie || serie.length < 2) return ''
  let min = Infinity
  let max = -Infinity
  for (const v of serie) {
    if (v < min) min = v
    if (v > max) max = v
  }
  const rango = max - min || 1
  const util = alto - margen * 2
  return serie
    .map((v, i) => {
      const x = (i / (serie.length - 1)) * ancho
      const y = margen + util - ((v - min) / rango) * util
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
}
