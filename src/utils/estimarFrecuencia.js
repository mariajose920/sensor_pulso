/**
 * Frecuencia de muestreo de la señal que llega por WiFi
 *
 * La app graficaba y calculaba los picos suponiendo 50 muestras por segundo, pero la placa envía 25 (1 de cada 4
 * lecturas de 100 Hz). Con la frecuencia equivocada la escala de tiempo se estira y el pulso por picos sale doble.
 *
 * Orden de preferencia:
 *   1) la frecuencia que informa la placa en el paquete (`frecuencia_hz`);
 *   2) la que se deduce de los propios paquetes: muestras recibidas / tiempo entre paquetes consecutivos.
 *
 * Datos puros (sin pantalla ni red) para poder probarlos con Node.
 */

export const FRECUENCIA_MIN_HZ = 10
export const FRECUENCIA_MAX_HZ = 200
const PAQUETES_PARA_ESTIMAR = 6
const PAQUETES_EN_VENTANA = 12

/** ¿Es una frecuencia utilizable? */
export function frecuenciaValida(hz) {
  return typeof hz === 'number' && Number.isFinite(hz) && hz >= FRECUENCIA_MIN_HZ && hz <= FRECUENCIA_MAX_HZ
}

/**
 * Crea un estimador que se alimenta con cada paquete nuevo.
 * @returns {{agregar:(p:{paquete:number, ultimoContacto:string, muestras:number})=>void, estimar:()=>number|null, reiniciar:()=>void}}
 */
export function crearEstimadorFrecuencia() {
  let ventana = []

  function agregar({ paquete, ultimoContacto, muestras } = {}) {
    const t = Date.parse(ultimoContacto)
    if (!Number.isFinite(t) || !Number.isFinite(paquete) || !(muestras > 0)) return
    const ultimo = ventana[ventana.length - 1]
    if (ultimo) {
      if (t <= ultimo.t) return                  // el mismo paquete u otro más viejo
      if (paquete !== ultimo.paquete + 1) ventana = [] // se perdió un paquete (o la placa se reinició): se empieza de nuevo
    }
    ventana.push({ t, paquete, muestras })
    if (ventana.length > PAQUETES_EN_VENTANA) ventana.shift()
  }

  /** Muestras por segundo, o null si aún no hay datos suficientes. */
  function estimar() {
    if (ventana.length < PAQUETES_PARA_ESTIMAR) return null
    const primero = ventana[0]
    const ultimo = ventana[ventana.length - 1]
    const segundos = (ultimo.t - primero.t) / 1000
    if (!(segundos > 0)) return null
    // Las muestras del primer paquete son anteriores a la ventana medida: se cuentan solo las siguientes
    const muestras = ventana.slice(1).reduce((s, p) => s + p.muestras, 0)
    const hz = Math.round((muestras / segundos) * 10) / 10
    return frecuenciaValida(hz) ? hz : null
  }

  function reiniciar() { ventana = [] }

  return { agregar, estimar, reiniciar }
}

/**
 * Frecuencia a usar con un paquete recién recibido: la informada por la placa si existe; si no, la estimada.
 * @param {number|undefined} informada `frecuenciaHz` del paquete
 * @param {number|null} estimada resultado de estimar()
 * @param {number} actual frecuencia que se usaba hasta ahora
 */
export function elegirFrecuencia(informada, estimada, actual) {
  if (frecuenciaValida(informada)) return informada
  if (frecuenciaValida(estimada)) return estimada
  return actual
}
