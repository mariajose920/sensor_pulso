/**
 * ============================================================================
 * sensor_pulso · Procesamiento Digital de Señal (DSP) para RF06
 * ============================================================================
 * Utilidades de filtrado digital, extracción morfológica y métricas en tiempo real
 * para la señal fotopletismográfica (PPG) del sensor MAX30102 / ESP32.
 * ============================================================================
 */

/**
 * Filtro de media móvil exponencial (EMA) para suavizado y reducción de ruido de alta frecuencia
 * @param {Array<number>} muestras - Arreglo de muestras crudas
 * @param {number} alpha - Factor de suavizado entre 0.0 (máximo suavizado) y 1.0 (sin filtrado)
 * @returns {Array<number>} Muestras filtradas
 */
export function filtroSuavizadoEMA(muestras, alpha = 0.25) {
  if (!muestras || muestras.length === 0) return []
  const filtradas = new Array(muestras.length)
  filtradas[0] = muestras[0]
  for (let i = 1; i < muestras.length; i++) {
    filtradas[i] = alpha * muestras[i] + (1 - alpha) * filtradas[i - 1]
  }
  return filtradas
}

/**
 * Filtro pasa-bajas de media móvil simple (SMA) con ventana configurable
 * @param {Array<number>} muestras 
 * @param {number} ventana - Tamaño de la ventana de promediado (ej. 3 o 5 puntos)
 * @returns {Array<number>}
 */
export function filtroMediaMovil(muestras, ventana = 3) {
  if (!muestras || muestras.length < ventana) return [...(muestras || [])]
  const resultado = new Array(muestras.length)
  const radio = Math.floor(ventana / 2)

  for (let i = 0; i < muestras.length; i++) {
    let suma = 0
    let conteo = 0
    for (let j = Math.max(0, i - radio); j <= Math.min(muestras.length - 1, i + radio); j++) {
      suma += muestras[j]
      conteo++
    }
    resultado[i] = suma / conteo
  }
  return resultado
}

/**
 * Separa la componente continua (DC baseline) de la pulsátil (AC)
 * Permite eliminar la deriva de línea base por respiración o presión del dedo
 * @param {Array<number>} muestras 
 * @param {number} tasaAprendizajeDC - Velocidad de adaptación de la línea base (ej. 0.02)
 * @returns {{ ac: Array<number>, dc: number }}
 */
export function extraerComponenteAC(muestras, tasaAprendizajeDC = 0.02) {
  if (!muestras || muestras.length === 0) return { ac: [], dc: 0 }
  
  let dcEstimado = muestras[0]
  const ac = new Array(muestras.length)

  for (let i = 0; i < muestras.length; i++) {
    dcEstimado = dcEstimado + tasaAprendizajeDC * (muestras[i] - dcEstimado)
    ac[i] = muestras[i] - dcEstimado
  }

  return { ac, dc: dcEstimado }
}

/**
 * Detecta componentes morfológicos clave de la onda PPG en la ventana actual:
 * - Pico Sistólico (P_sys): Máximo local prominente
 * - Escotadura Dícrota (N_dic): Mínimo relativo posterior a la sístole (cierre de válvula aórtica)
 * - Pico Diastólico (P_dia): Onda secundaria tras la incisura
 * @param {Array<number>} muestras 
 * @returns {Array<{ index: number, tipo: 'sistolico'|'escotadura'|'diastolico', valor: number }>}
 */
export function detectarMorfologiaPPG(muestras) {
  if (!muestras || muestras.length < 15) return []
  const puntos = []

  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < muestras.length; i++) {
    if (muestras[i] < min) min = muestras[i]
    if (muestras[i] > max) max = muestras[i]
  }
  const rango = max - min
  if (rango < 50) return [] // Amplitud insuficiente para análisis morfológico confiable

  const umbralSistolico = min + rango * 0.65

  // Búsqueda de picos sistólicos locales
  for (let i = 2; i < muestras.length - 2; i++) {
    const val = muestras[i]
    if (val > umbralSistolico &&
        val >= muestras[i - 1] && val >= muestras[i - 2] &&
        val >= muestras[i + 1] && val >= muestras[i + 2]) {
      
      // Evitar picos duplicados muy cercanos (período refractario mínimo ~10 muestras)
      const ultimo = puntos[puntos.length - 1]
      if (!ultimo || (i - ultimo.index > 12)) {
        puntos.push({ index: i, tipo: 'sistolico', valor: val })
      }
    }
  }

  // Búsqueda de escotadura dícrota e inflexión diastólica entre picos sistólicos
  for (let k = 0; k < puntos.length - 1; k++) {
    const i1 = puntos[k].index
    const i2 = puntos[k + 1].index
    const longitud = i2 - i1
    if (longitud > 15 && longitud < 80) {
      // La escotadura suele ocurrir entre el 25% y el 55% del intervalo sistólico
      const start = Math.floor(i1 + longitud * 0.25)
      const end = Math.floor(i1 + longitud * 0.60)
      let minVal = Infinity
      let minIdx = -1

      for (let j = start; j <= end; j++) {
        if (muestras[j] < minVal) {
          minVal = muestras[j]
          minIdx = j
        }
      }

      if (minIdx !== -1) {
        puntos.push({ index: minIdx, tipo: 'escotadura', valor: minVal })

        // El pico diastólico viene inmediatamente después de la escotadura
        let maxDia = -Infinity
        let diaIdx = -1
        for (let j = minIdx + 1; j < Math.min(muestras.length, minIdx + Math.floor(longitud * 0.35)); j++) {
          if (muestras[j] > maxDia) {
            maxDia = muestras[j]
            diaIdx = j
          }
        }
        if (diaIdx !== -1 && maxDia > minVal) {
          puntos.push({ index: diaIdx, tipo: 'diastolico', valor: maxDia })
        }
      }
    }
  }

  return puntos.sort((a, b) => a.index - b.index)
}

/**
 * Calcula métricas físicas de la señal en tiempo real:
 * - Amplitud pico a pico (Vpp en unidades ADC)
 * - Nivel medio de línea base DC
 * - Índice de Perfusión estimado (PI% = (AC / DC) * 100)
 * - Relación Señal/Ruido (SNR estimada en dB)
 * @param {Array<number>} muestras 
 * @param {number} frecuenciaMuestreoHz 
 * @returns {{ vpp: number, dc: number, pi: number, snrDb: number, calidad: string }}
 */
export function calcularMetricasSenal(muestras, frecuenciaMuestreoHz = 50) {
  if (!muestras || muestras.length < 5) {
    return { vpp: 0, dc: 0, pi: 0, snrDb: 0, calidad: 'sin_senal' }
  }

  let min = Infinity
  let max = -Infinity
  let suma = 0

  for (let i = 0; i < muestras.length; i++) {
    const val = muestras[i]
    if (val < min) min = val
    if (val > max) max = val
    suma += val
  }

  const vpp = parseFloat((max - min).toFixed(1))
  const dc = parseFloat((suma / muestras.length).toFixed(1))
  
  // Índice de Perfusión (PI): Relación entre componente pulsátil AC y nivel DC
  const pi = dc > 0 ? parseFloat(((vpp / dc) * 100).toFixed(2)) : 0

  // Estimación de SNR comparando señal filtrada contra residuos
  const filtradas = filtroMediaMovil(muestras, 5)
  let energiaSenal = 0
  let energiaRuido = 0

  for (let i = 0; i < muestras.length; i++) {
    energiaSenal += Math.pow(filtradas[i] - dc, 2)
    energiaRuido += Math.pow(muestras[i] - filtradas[i], 2)
  }

  const snrDb = energiaRuido > 0 && energiaSenal > 0
    ? parseFloat((10 * Math.log10(energiaSenal / energiaRuido)).toFixed(1))
    : 25.0

  let calidad = 'buena'
  if (vpp < 100 || snrDb < 10) calidad = 'mala'
  else if (vpp < 300 || snrDb < 18) calidad = 'regular'

  return {
    vpp,
    dc,
    pi,
    snrDb,
    calidad,
    frecuenciaHz: frecuenciaMuestreoHz
  }
}

/**
 * Genera el contenido de un archivo CSV con las muestras del osciloscopio en tiempo real
 * @param {Array<number>} muestrasIr 
 * @param {Array<number>} muestrasRojo 
 * @param {number} frecuenciaHz 
 * @param {number} canal 
 * @returns {string} Contenido CSV listo para descargar
 */
export function generarCsvOsciloscopio(muestrasIr, muestrasRojo, frecuenciaHz = 50, canal = 1) {
  const lineas = [
    '# sensor_pulso · Registro de Senal en Tiempo Real (RF06)',
    `# Canal: ${canal}`,
    `# Frecuencia de Muestreo: ${frecuenciaHz} Hz`,
    `# Fecha de Exportacion: ${new Date().toISOString()}`,
    'indice,tiempo_ms,ir_raw,rojo_raw,ir_filtrado,rojo_filtrado'
  ]

  const maxLen = Math.max(muestrasIr?.length || 0, muestrasRojo?.length || 0)
  const dtMs = 1000 / frecuenciaHz
  const irFilt = filtroSuavizadoEMA(muestrasIr || [], 0.3)
  const rojoFilt = filtroSuavizadoEMA(muestrasRojo || [], 0.3)

  for (let i = 0; i < maxLen; i++) {
    const tMs = Math.round(i * dtMs)
    const irRaw = muestrasIr && muestrasIr[i] !== undefined ? muestrasIr[i] : ''
    const rojoRaw = muestrasRojo && muestrasRojo[i] !== undefined ? muestrasRojo[i] : ''
    const irF = irFilt[i] !== undefined ? irFilt[i].toFixed(1) : ''
    const rojoF = rojoFilt[i] !== undefined ? rojoFilt[i].toFixed(1) : ''

    lineas.push(`${i},${tMs},${irRaw},${rojoRaw},${irF},${rojoF}`)
  }

  return lineas.join('\n')
}
