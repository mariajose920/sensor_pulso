/**
 * Gráficas de los canales propios del profesor/administrador (RF111, RF08)
 *
 * Reglas puras (sin pantalla) para poder probarlas con Node:
 * - Con un solo canal listo se ve solo su gráfica.
 * - Con dos o más canales listos se puede ver cada gráfica por separado o todas juntas,
 *   cada una con un color distinto.
 * - Un canal que aún no completó ficha + términos + consentimiento nunca se grafica.
 */

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

/** Puntos «x,y» de una polilínea SVG; cada señal se normaliza a su propia altura, así se pueden superponer y comparar las formas de onda. */
export function puntosPolilinea(muestras, ancho, alto, { min, max, margen = 6 } = {}) {
  if (!Array.isArray(muestras) || muestras.length < 2) return ''
  const lo = min ?? Math.min(...muestras)
  const hi = max ?? Math.max(...muestras)
  const rango = hi - lo || 1
  const paso = ancho / (muestras.length - 1)
  const util = alto - margen * 2
  return muestras
    .map((v, i) => `${(i * paso).toFixed(1)},${(margen + util - ((v - lo) / rango) * util).toFixed(1)}`)
    .join(' ')
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

/** Posición (en %) de cada pico sobre la curva dibujada con puntosPolilinea (misma normalización). */
export function posicionesPicos(muestras, picos, { min, max, margen = 6, alto = 100 } = {}) {
  if (!Array.isArray(muestras) || muestras.length < 2 || !Array.isArray(picos)) return []
  const lo = min ?? Math.min(...muestras)
  const hi = max ?? Math.max(...muestras)
  const rango = hi - lo || 1
  const util = alto - margen * 2
  return picos
    .filter(p => Number.isInteger(p.indice) && p.indice >= 0 && p.indice < muestras.length)
    .map(p => ({
      indice: p.indice,
      x: (p.indice / (muestras.length - 1)) * 100,
      y: ((margen + util - ((muestras[p.indice] - lo) / rango) * util) / alto) * 100
    }))
}

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
