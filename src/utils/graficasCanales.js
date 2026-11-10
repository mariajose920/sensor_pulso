/**
 * Gráficas de los canales propios del profesor/administrador (RF111, RF08)
 *
 * Reglas puras (sin pantalla) para poder probarlas con Node:
 * - Con un solo canal listo se ve solo su gráfica.
 * - Con dos o más canales listos se puede ver cada gráfica por separado o todas juntas,
 *   cada una con un color distinto.
 * - Un canal que aún no completó ficha + términos + consentimiento nunca se grafica.
 */

import { filtrarSenalPpg } from './filtroPpg.js'
import { detectarPicosParaGrafica } from './picosGrafica.js'

// Colores distinguibles entre sí (también para daltonismo) sobre fondo oscuro
export const COLORES_CANAL = {
  1: '#38bdf8', // celeste
  2: '#f59e0b', // ámbar
  3: '#a78bfa', // violeta
  4: '#f472b6', // rosado
  5: '#34d399'  // verde
}

// Un valor del dispositivo solo cuenta si es un número positivo (0 = «sin lectura»)
function numeroOnull(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

export function colorDeCanal(canal) {
  return COLORES_CANAL[canal] || '#94a3b8'
}

/**
 * Canales que se pueden graficar: los míos que ya están listos para medir.
 * @param {Array} misCanales  [{ canal, listo }] (canalesService.misCanales)
 * @param {Array} datosCanales [{ canal, ir: number[] }] (lo que llega del ESP32)
 * @param {Function} nombreDe  (canal) => string | undefined, nombre de la persona del canal
 */
export function canalesGraficables(misCanales, datosCanales, nombreDe = () => undefined) {
  return (misCanales || [])
    .filter(c => c.listo)
    .map(c => {
      const datos = (datosCanales || []).find(d => d.canal === c.canal)
      return {
        canal: c.canal,
        color: colorDeCanal(c.canal),
        nombre: nombreDe(c.canal) || '',
        // muestras = ir (compatibilidad); ir/rojo/bpm/spo2/calidad alimentan las métricas del canal
        muestras: Array.isArray(datos?.ir) ? datos.ir : [],
        ir: Array.isArray(datos?.ir) ? datos.ir : [],
        rojo: Array.isArray(datos?.rojo) ? datos.rojo : [],
        bpm: numeroOnull(datos?.bpm),
        spo2: numeroOnull(datos?.spo2),
        calidad: typeof datos?.calidad === 'string' ? datos.calidad : null
      }
    })
}

/** ¿Se ofrece elegir entre «por separado» y «juntas»? Solo con 2 o más canales graficables. */
export function ofreceElegirVista(graficables) {
  return (graficables || []).length >= 2
}

/** Vista efectiva: con un solo canal siempre es una sola gráfica. */
export function vistaEfectiva(graficables, vistaElegida) {
  if (!ofreceElegirVista(graficables)) return 'separadas'
  return vistaElegida === 'juntas' ? 'juntas' : 'separadas'
}

// ───────────────────────── Geometría compartida (polilínea y puntos de picos) ─────────────────────────

/** Margen vertical (unidades del viewBox) para que un punto de pico en la cresta no quede cortado */
export const MARGEN_GRAFICA = 8

const aFijo = (v, d) => Number(v.toFixed(d))

/**
 * ÚNICA conversión muestra → coordenadas. La polilínea y los puntos de los picos salen de aquí,
 * con la misma normalización (mín/máx de la serie mostrada) y los mismos márgenes: no puede haber desfase.
 * @returns {{x:number,y:number}[]} un punto por muestra (vacío con menos de 2 muestras)
 */
export function geometriaSerie(muestras, ancho, alto, { min, max, margen = 6, decimales = 2 } = {}) {
  if (!Array.isArray(muestras) || muestras.length < 2) return []
  const lo = min ?? Math.min(...muestras)
  const hi = max ?? Math.max(...muestras)
  const rango = hi - lo || 1
  const paso = ancho / (muestras.length - 1)
  const util = alto - margen * 2
  return muestras.map((v, i) => ({
    x: aFijo(i * paso, decimales),
    y: aFijo(margen + util - ((v - lo) / rango) * util, decimales)
  }))
}

/** Puntos «x,y» de una polilínea SVG; cada señal se normaliza a su propia altura, así se pueden superponer y comparar las formas de onda. */
export function puntosPolilinea(muestras, ancho, alto, { min, max, margen = 6 } = {}) {
  return geometriaSerie(muestras, ancho, alto, { min, max, margen, decimales: 1 })
    .map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`)
    .join(' ')
}

/**
 * Trazado completo de una serie: texto de la polilínea y marcas de los picos con las MISMAS coordenadas
 * de los vértices (cada marca es exactamente el vértice del índice del pico). xPct/yPct sirven para
 * colocar un punto HTML centrado (left/top en %) sobre un SVG con preserveAspectRatio="none".
 * @param {{indice:number}[]} picos índices sobre `serie` (los de detectarPicosParaGrafica(serie, hz))
 */
export function trazarSerie(serie, ancho, alto, { margen = MARGEN_GRAFICA, picos = [], decimales = 2 } = {}) {
  const puntos = geometriaSerie(serie, ancho, alto, { margen, decimales })
  const polilinea = puntos.map(p => `${p.x.toFixed(decimales)},${p.y.toFixed(decimales)}`).join(' ')
  const marcas = puntos.length
    ? (picos || [])
        .filter(p => p && Number.isInteger(p.indice) && p.indice >= 0 && p.indice < puntos.length)
        .map(p => ({
          indice: p.indice,
          x: puntos[p.indice].x,
          y: puntos[p.indice].y,
          xPct: (puntos[p.indice].x / ancho) * 100,
          yPct: (puntos[p.indice].y / alto) * 100
        }))
    : []
  return { puntos, polilinea, marcas }
}

/**
 * Serie que se dibuja: con «Filtro DSP» activado, la señal filtrada (pasa-banda 0,5–5 Hz sin retraso);
 * apagado, la cruda tal como llega. Siempre del mismo largo que `ir`.
 */
export function serieMostrada(ir, frecuenciaHz, dsp = true) {
  if (!Array.isArray(ir)) return []
  if (!dsp) return ir
  const f = filtrarSenalPpg(ir, frecuenciaHz)
  return f.length === ir.length ? f : ir
}

/** Picos de la serie mostrada (máximos locales exactos de ESA serie) */
export function picosDeSerie(serie, frecuenciaHz) {
  return detectarPicosParaGrafica(serie, frecuenciaHz)
}

// ───────────────────────── Ventana de muestras y métricas visibles ─────────────────────────

/** Segundos de señal que se grafican y analizan por canal */
export const SEGUNDOS_VENTANA_GRAFICA = 6

/**
 * Agrega las muestras nuevas al final de la ventana y conserva solo las últimas `max`.
 * Cada paquete del ESP32 trae pocas muestras (~0,5 s): para ver latidos y calcular HRV hay que acumularlas.
 */
export function acumularMuestras(ventana, nuevas, max = 300) {
  const base = Array.isArray(ventana) ? ventana : []
  const extra = Array.isArray(nuevas) ? nuevas.filter(v => typeof v === 'number' && Number.isFinite(v)) : []
  const todo = base.concat(extra)
  return todo.length > max ? todo.slice(todo.length - max) : todo
}

/** Posición (en %) de cada pico sobre la curva dibujada con puntosPolilinea (misma geometría: geometriaSerie). */
export function posicionesPicos(muestras, picos, { min, max, margen = 6, alto = 100 } = {}) {
  if (!Array.isArray(muestras) || muestras.length < 2 || !Array.isArray(picos)) return []
  const pts = geometriaSerie(muestras, 100, alto, { min, max, margen, decimales: 6 })
  return picos
    .filter(p => Number.isInteger(p.indice) && p.indice >= 0 && p.indice < muestras.length)
    .map(p => ({ indice: p.indice, x: pts[p.indice].x, y: (pts[p.indice].y / alto) * 100 }))
}

// ───────────────────────── SpO₂ en el tiempo, pausa y filtros del gráfico ─────────────────────────

export const RANGO_SPO2 = Object.freeze({ min: 70, max: 100 })

/** Cantidad de muestras que acumularMuestras realmente agrega (solo números finitos) */
export function contarMuestrasValidas(nuevas) {
  return Array.isArray(nuevas) ? nuevas.filter(v => typeof v === 'number' && Number.isFinite(v)).length : 0
}

/**
 * SpO₂ por muestra, en paralelo a la ventana de `ir` (mismo largo, mismo recorte).
 * Cada muestra nueva lleva el SpO₂ vigente del canal; sin lectura (0/ausente) = null, nunca un valor inventado.
 */
export function acumularSpo2(previo, cantidadNuevas, spo2Vigente, max = 300) {
  const base = Array.isArray(previo) ? previo : []
  const valor = numeroOnull(spo2Vigente)
  const todo = base.concat(new Array(Math.max(0, cantidadNuevas | 0)).fill(valor))
  return todo.length > max ? todo.slice(todo.length - max) : todo
}

/**
 * Trazado de la SpO₂ histórica (eje fijo 70–100 %): una polilínea por tramo con lectura;
 * donde no hay lectura queda un hueco (el tramo se corta).
 */
export function trazarSpo2(spo2, ancho, alto, { margen = 4, decimales = 2 } = {}) {
  const arr = Array.isArray(spo2) ? spo2 : []
  const ultimo = arr.length ? arr[arr.length - 1] : null
  const actual = typeof ultimo === 'number' && Number.isFinite(ultimo) ? ultimo : null
  const hayDatos = arr.some(v => typeof v === 'number' && Number.isFinite(v))
  const segmentos = []
  if (arr.length >= 2) {
    const paso = ancho / (arr.length - 1)
    const util = alto - margen * 2
    const yDe = (v) => {
      const c = Math.min(RANGO_SPO2.max, Math.max(RANGO_SPO2.min, v))
      return aFijo(margen + util - ((c - RANGO_SPO2.min) / (RANGO_SPO2.max - RANGO_SPO2.min)) * util, decimales)
    }
    let tramo = []
    const cerrar = () => {
      if (tramo.length === 1) tramo.push(tramo[0]) // lectura aislada: un punto (trazo con extremos redondeados)
      if (tramo.length) segmentos.push(tramo.map(p => `${p.x.toFixed(decimales)},${p.y.toFixed(decimales)}`).join(' '))
      tramo = []
    }
    arr.forEach((v, i) => {
      if (typeof v === 'number' && Number.isFinite(v) && v > 0) tramo.push({ x: aFijo(i * paso, decimales), y: yDe(v) })
      else cerrar()
    })
    cerrar()
  }
  return { segmentos, actual, hayDatos }
}

/** ¿Este canal acumula muestras ahora? No si terminó o está en pausa. */
export function debeAcumular({ terminada = false, pausada = false } = {}) {
  return !terminada && !pausada
}

/** Al reanudar (pausa o tras «Terminar») se sigue en la MISMA ventana; lo que llegó mientras tanto no se suma. */
export function reanudarVentana(ventana, paqueteActual) {
  return { ...ventana, ultimoIr: paqueteActual ?? null }
}

export const AJUSTES_POR_DEFECTO = Object.freeze({ picos: true, spo2: false, dsp: true })
export const CLAVES_AJUSTES = Object.freeze(['picos', 'spo2', 'dsp'])

/** Ajustes de un canal (completa con los valores por defecto) */
export function ajustesDe(mapa, canal) {
  const x = mapa && mapa[canal] ? mapa[canal] : {}
  const r = { ...AJUSTES_POR_DEFECTO }
  for (const k of CLAVES_AJUSTES) if (typeof x[k] === 'boolean') r[k] = x[k]
  return r
}

/** Devuelve un mapa nuevo con el ajuste invertido (claves desconocidas se ignoran) */
export function alternarAjuste(mapa, canal, clave) {
  if (!CLAVES_AJUSTES.includes(clave)) return mapa || {}
  const actual = ajustesDe(mapa, canal)
  return { ...(mapa || {}), [canal]: { ...actual, [clave]: !actual[clave] } }
}

const CLAVE_STORAGE = 'sensor_pulso.graficoCanal.ajustes'
let memoriaAjustes = {} // se recuerda mientras dure la sesión, aunque no haya sessionStorage

export function leerAjustes() {
  if (Object.keys(memoriaAjustes).length) return { ...memoriaAjustes }
  try {
    const raw = globalThis.sessionStorage?.getItem(CLAVE_STORAGE)
    if (raw) {
      const o = JSON.parse(raw)
      if (o && typeof o === 'object') {
        const limpio = {}
        for (const c of Object.keys(o)) limpio[c] = ajustesDe(o, c)
        memoriaAjustes = limpio
      }
    }
  } catch { /* sin sessionStorage: solo memoria */ }
  return { ...memoriaAjustes }
}

export function guardarAjustes(mapa) {
  memoriaAjustes = { ...(mapa || {}) }
  try { globalThis.sessionStorage?.setItem(CLAVE_STORAGE, JSON.stringify(memoriaAjustes)) } catch { /* ignorar */ }
}

/** Solo para pruebas */
export function _reiniciarAjustes() { memoriaAjustes = {} }

/** Texto para mostrar: «—» cuando no hay dato (nunca un valor inventado). */
export function textoMetrica(valor, unidad = '', decimales = 0) {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) return '—'
  return `${valor.toFixed(decimales)}${unidad ? ' ' + unidad : ''}`
}

export const ETIQUETA_RUIDO = { buena: 'Señal buena', regular: 'Ruido regular', mala: 'Ruido alto' }
// Insignias para fondo oscuro: el texto siempre acompaña al color
export const COLOR_RUIDO = {
  buena: { fondo: '#064e3b', texto: '#a7f3d0', borde: '#10b981' },
  regular: { fondo: '#78350f', texto: '#fde68a', borde: '#f59e0b' },
  mala: { fondo: '#7f1d1d', texto: '#fecaca', borde: '#ef4444' }
}
export const ETIQUETA_RITMO = { normal: 'Normal', taquicardia: 'Taquicardia', bradicardia: 'Bradicardia', irregular: 'Irregular' }
export const COLOR_RITMO = {
  normal: { fondo: '#064e3b', texto: '#a7f3d0', borde: '#10b981' },
  taquicardia: { fondo: '#7f1d1d', texto: '#fecaca', borde: '#ef4444' },
  bradicardia: { fondo: '#1e3a8a', texto: '#bfdbfe', borde: '#60a5fa' },
  irregular: { fondo: '#581c87', texto: '#e9d5ff', borde: '#c084fc' }
}

/**
 * Filas de texto de las métricas de un canal (para tarjeta, leyenda y aria-label).
 * @param {object} m resultado de calcularMetricasCanal
 */
export function resumenMetricas(m) {
  const x = m || {}
  const hrv = x.hrv || {}
  return {
    bpm: textoMetrica(x.bpm, 'BPM'),
    hrv: hrv.sdnn == null && hrv.rmssd == null
      ? '—'
      : `SDNN ${textoMetrica(hrv.sdnn, 'ms')} · RMSSD ${textoMetrica(hrv.rmssd, 'ms')}`,
    ruido: x.ruido ? ETIQUETA_RUIDO[x.ruido.nivel] || '—' : '—',
    ritmo: x.ritmo ? ETIQUETA_RITMO[x.ritmo.clase] || x.ritmo.nombre : '—',
    spo2: textoMetrica(x.spo2, '%', 0),
    pulso: textoMetrica(x.pulso, 'lpm'),
    picos: Array.isArray(x.picos) ? x.picos.length : 0
  }
}
