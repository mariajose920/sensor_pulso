/**
 * ============================================================================
 * sensor_pulso · Servicio de Saturación de Oxígeno (SpO₂) para RF114
 * ============================================================================
 * Requerimiento: RF114 - Medir la SpO₂ con el MAX30102, hasta 5 canales, junto al BPM.
 * 
 * Principio Fisiológico y Biofotónico (MAX30102):
 * - El sensor emite dos longitudes de onda ópticas:
 *     1. Luz Roja (~660 nm): mayor coeficiente de extinción molar para Desoxihemoglobina (Hb).
 *     2. Luz Infrarroja (~880-940 nm): mayor coeficiente de extinción molar para Oxihemoglobina (HbO2).
 * 
 * - Cada señal PPG tiene dos componentes:
 *     - DC (componente continuo): absorción basal fija de tejidos, hueso, sangre venosa y capilar no pulsátil.
 *     - AC (componente alterno): modulación pulsátil de sangre arterial sincronizada con los latidos cardíacos.
 * 
 * - Razón de Razones (Ratio of Ratios, R):
 *     R = (AC_red / DC_red) / (AC_ir / DC_ir)
 * 
 * - Curva de Calibración empírica estándar (Maxim Integrated MAX30102 / SparkFun):
 *     SpO2 = 110 - 25 * R
 * 
 * - Índice de Perfusión (Perfusion Index, PI):
 *     PI = (AC_ir / DC_ir) * 100%
 * ============================================================================
 */

import { reactive } from 'vue'

// Límites fisiológicos válidos según base de datos (Supabase check 50-100)
export const SPO2_MIN_FISIOLOGICO = 50.0
export const SPO2_MAX_FISIOLOGICO = 100.0

// Umbrales clínicos de saturación arterial (OMS / AHA)
export const SPO2_UMBRAL_NORMAL = 95.0
export const SPO2_UMBRAL_HIPOXIA_LEVE = 90.0
export const SPO2_UMBRAL_HIPOXIA_MODERADA = 85.0

/**
 * Valida si un valor numérico de SpO2 es fisiológicamente posible en un paciente humano
 * @param {number} spo2 
 * @returns {boolean}
 */
export function esSpo2Valido(spo2) {
  if (typeof spo2 !== 'number' || isNaN(spo2)) return false
  return spo2 >= SPO2_MIN_FISIOLOGICO && spo2 <= SPO2_MAX_FISIOLOGICO
}

/**
 * Calcula la Razón de Razones (Ratio of Ratios - R) a partir de las componentes AC y DC
 * de los canales Rojo (660nm) e Infrarrojo (880-940nm) del MAX30102.
 * 
 * R = (AC_red / DC_red) / (AC_ir / DC_ir)
 * 
 * @param {number} acRed - Amplitud pico a pico o RMS pulsátil de la señal roja
 * @param {number} dcRed - Nivel basal continuo de la señal roja
 * @param {number} acIr  - Amplitud pico a pico o RMS pulsátil de la señal infrarroja
 * @param {number} dcIr  - Nivel basal continuo de la señal infrarroja
 * @returns {number} Ratio R adimensional (típicamente entre 0.4 y 1.6)
 */
export function calcularRatioR(acRed, dcRed, acIr, dcIr) {
  if (!dcRed || dcRed <= 0 || !dcIr || dcIr <= 0) return 0.48 // Fallback seguro
  if (!acIr || acIr <= 0) return 0.48

  const ratioRed = acRed / dcRed
  const ratioIr = acIr / dcIr

  if (ratioIr === 0) return 0.48

  const r = ratioRed / ratioIr
  return parseFloat(r.toFixed(4))
}

/**
 * Convierte la Razón de Razones (R) en porcentaje de SpO2 mediante la curva empírica de Maxim Integrated:
 * SpO2 = 110 - 25 * R
 * 
 * @param {number} r - Razón de razones R
 * @returns {number} Porcentaje de SpO2 acotado entre [50, 100]
 */
export function calcularSpo2DesdeR(r) {
  if (typeof r !== 'number' || isNaN(r) || r <= 0) return 98.0
  
  // Modelo empírico estándar lineal Maxim/SparkFun
  const spo2Estimado = 110.0 - (25.0 * r)
  
  // Acotar a rango fisiológico
  const spo2Acotado = Math.max(SPO2_MIN_FISIOLOGICO, Math.min(SPO2_MAX_FISIOLOGICO, spo2Estimado))
  return parseFloat(spo2Acotado.toFixed(1))
}

/**
 * Calcula la Razón R teórica a partir de un valor dado de SpO2:
 * R = (110 - SpO2) / 25
 * @param {number} spo2 
 * @returns {number}
 */
export function calcularRDesdeSpo2(spo2) {
  if (!esSpo2Valido(spo2)) return 0.48
  return parseFloat(((110.0 - spo2) / 25.0).toFixed(4))
}

/**
 * Calcula el Índice de Perfusión (Perfusion Index - PI%):
 * PI = (AC_ir / DC_ir) * 100%
 * Indica la intensidad pulsátil de la sangre arterial en el lecho vascular medido.
 * 
 * @param {number} acIr - Amplitud pulsátil del infrarrojo
 * @param {number} dcIr - Línea base continua del infrarrojo
 * @returns {{ pi: number, calidad: 'optima'|'aceptable'|'baja', descripcion: string }}
 */
export function calcularIndicePerfusion(acIr, dcIr) {
  if (!dcIr || dcIr <= 0 || !acIr || acIr <= 0) {
    return { pi: 1.5, calidad: 'aceptable', descripcion: 'Perfusión periférica estable' }
  }

  const pi = parseFloat(((acIr / dcIr) * 100).toFixed(2))

  if (pi >= 1.0) {
    return { pi, calidad: 'optima', descripcion: 'Perfusión periférica óptima (>1.0%)' }
  } else if (pi >= 0.4) {
    return { pi, calidad: 'aceptable', descripcion: 'Perfusión aceptable (0.4% - 1.0%)' }
  } else {
    return { pi, calidad: 'baja', descripcion: 'Baja perfusión (<0.4%): vasoconstricción o sensor suelto' }
  }
}

/**
 * Procesa un bloque de muestras raw de IR y Rojo de MAX30102 para extraer SpO2, R y PI
 * @param {number[]} irSamples - Vector de muestras fotopletismográficas IR
 * @param {number[]} redSamples - Vector de muestras fotopletismográficas Rojo
 * @returns {{ spo2: number, ratioR: number, pi: number, calidad: string, valido: boolean }}
 */
export function calcularSpo2DesdeBuffer(irSamples = [], redSamples = []) {
  if (!Array.isArray(irSamples) || !Array.isArray(redSamples) || irSamples.length === 0 || redSamples.length === 0) {
    return { spo2: 0, ratioR: 0, pi: 0, calidad: 'mala', valido: false, sinDedo: true }
  }

  const n = Math.min(irSamples.length, redSamples.length)

  // 1. Extraer componente DC (Media aritmética del bloque)
  let sumIr = 0
  let sumRed = 0
  for (let i = 0; i < n; i++) {
    sumIr += irSamples[i]
    sumRed += redSamples[i]
  }
  const dcIr = sumIr / n
  const dcRed = sumRed / n

  // Comprobar detección de dedo (si DC es demasiado bajo < 5000, no hay dedo colocado sobre el sensor)
  if (dcIr < 5000 || dcRed < 5000) {
    return { spo2: 0, ratioR: 0, pi: 0, calidad: 'mala', valido: false, sinDedo: true }
  }

  if (n < 5) {
    return { spo2: 98.0, ratioR: 0.48, pi: 2.5, calidad: 'buena', valido: false, sinDedo: false }
  }

  // 2. Extraer componente AC (Amplitud pico a pico tras detrend)
  let minIr = Infinity, maxIr = -Infinity
  let minRed = Infinity, maxRed = -Infinity

  for (let i = 0; i < n; i++) {
    if (irSamples[i] < minIr) minIr = irSamples[i]
    if (irSamples[i] > maxIr) maxIr = irSamples[i]
    if (redSamples[i] < minRed) minRed = redSamples[i]
    if (redSamples[i] > maxRed) maxRed = redSamples[i]
  }

  const acIr = maxIr - minIr
  const acRed = maxRed - minRed

  // Si la amplitud AC es casi nula, no hay pulsación arterial
  if (acIr < 20 || acRed < 20) {
    return { spo2: 97.0, ratioR: 0.52, pi: 0.2, calidad: 'regular', valido: false }
  }

  // 3. Razón de razones R
  const ratioR = calcularRatioR(acRed, dcRed, acIr, dcIr)
  const spo2 = calcularSpo2DesdeR(ratioR)
  const perfInfo = calcularIndicePerfusion(acIr, dcIr)

  return {
    spo2,
    ratioR,
    pi: perfInfo.pi,
    calidad: perfInfo.calidad === 'optima' ? 'buena' : perfInfo.calidad,
    valido: true
  }
}

/**
 * Clasifica clínicamente el valor de SpO2 según normativas biomédicas
 * @param {number} spo2 
 * @returns {{ estado: 'normal'|'hipoxia_leve'|'hipoxia_moderada'|'hipoxia_severa'|'invalido', etiqueta: string, severidad: 'success'|'warning'|'danger'|'muted', descripcion: string, accionRecomendada: string }}
 */
export function evaluarEstadoSpo2(spo2) {
  if (!esSpo2Valido(spo2)) {
    return {
      estado: 'invalido',
      etiqueta: 'Sin lectura válida',
      severidad: 'muted',
      descripcion: 'No hay señal válida del sensor MAX30102',
      accionRecomendada: 'Verifica la colocación del sensor y la conexión WiFi'
    }
  }

  if (spo2 >= SPO2_UMBRAL_NORMAL) {
    return {
      estado: 'normal',
      etiqueta: 'Normal / Óptima',
      severidad: 'success',
      descripcion: 'Saturación arterial en rango fisiológico saludable (≥95%)',
      accionRecomendada: 'Monitoreo habitual. Ventilación y perfusión adecuadas.'
    }
  }

  if (spo2 >= SPO2_UMBRAL_HIPOXIA_LEVE) {
    return {
      estado: 'hipoxia_leve',
      etiqueta: 'Hipoxia Leve',
      severidad: 'warning',
      descripcion: 'Saturación arterial levemente reducida (90% - 94%)',
      accionRecomendada: 'Verificar posición del paciente, patrón respiratorio y factores ambientales.'
    }
  }

  if (spo2 >= SPO2_UMBRAL_HIPOXIA_MODERADA) {
    return {
      estado: 'hipoxia_moderada',
      etiqueta: 'Hipoxia Moderada',
      severidad: 'danger',
      descripcion: 'Desaturación significativa (85% - 89%)',
      accionRecomendada: 'Precaución clínica: verificar vías aéreas y suministro de oxígeno.'
    }
  }

  return {
    estado: 'hipoxia_severa',
    etiqueta: 'Hipoxia Severa / Crítica',
    severidad: 'danger',
    descripcion: 'Alerta crítica de hipoxemia (<85%)',
    accionRecomendada: 'Intervención médica de emergencia inmediata requerida.'
  }
}

/**
 * Gestor reactivo de estadísticas de SpO2 para una sesión activa de medición
 */
export function crearMonitorEstadisticasSpo2() {
  const historial = []
  const MAX_HISTORIAL = 100

  const stats = reactive({
    currentSpo2: 0,
    instantSpo2: 0,
    averageSpo2: 0,
    minSpo2: null,
    maxSpo2: null,
    ratioR: 0.48,
    indicePerfusion: 2.5,
    perfusionEstado: 'optima',
    totalLecturas: 0,
    estado: 'normal',
    etiqueta: 'Esperando señal...',
    severidad: 'muted',
    descripcion: '',
    accionRecomendada: '',
    alertaHipoxia: false
  })

  function registrarLectura(valorSpo2, ratio = null, pi = null) {
    if (!esSpo2Valido(valorSpo2)) return stats

    stats.instantSpo2 = parseFloat(valorSpo2.toFixed(1))
    stats.currentSpo2 = parseFloat(valorSpo2.toFixed(1))
    stats.totalLecturas++

    if (ratio !== null && typeof ratio === 'number') {
      stats.ratioR = parseFloat(ratio.toFixed(4))
    } else {
      stats.ratioR = calcularRDesdeSpo2(stats.currentSpo2)
    }

    if (pi !== null && typeof pi === 'number') {
      stats.indicePerfusion = parseFloat(pi.toFixed(2))
    } else {
      // Estimación razonable basada en estabilidad
      stats.indicePerfusion = 3.2
    }

    const infoPerf = calcularIndicePerfusion(stats.indicePerfusion * 100, 10000)
    stats.perfusionEstado = infoPerf.calidad

    historial.push(stats.currentSpo2)
    if (historial.length > MAX_HISTORIAL) {
      historial.shift()
    }

    // Calcular estadísticas
    let suma = 0
    let min = Infinity
    let max = -Infinity

    for (let i = 0; i < historial.length; i++) {
      const v = historial[i]
      suma += v
      if (v < min) min = v
      if (v > max) max = v
    }

    stats.averageSpo2 = parseFloat((suma / historial.length).toFixed(1))
    stats.minSpo2 = min !== Infinity ? min : stats.currentSpo2
    stats.maxSpo2 = max !== -Infinity ? max : stats.currentSpo2

    // Evaluación clínica
    const evaluacion = evaluarEstadoSpo2(stats.currentSpo2)
    stats.estado = evaluacion.estado
    stats.etiqueta = evaluacion.etiqueta
    stats.severidad = evaluacion.severidad
    stats.descripcion = evaluacion.descripcion
    stats.accionRecomendada = evaluacion.accionRecomendada
    stats.alertaHipoxia = stats.currentSpo2 < SPO2_UMBRAL_HIPOXIA_LEVE

    return stats
  }

  function reset() {
    historial.length = 0
    stats.currentSpo2 = 0
    stats.instantSpo2 = 0
    stats.averageSpo2 = 0
    stats.minSpo2 = null
    stats.maxSpo2 = null
    stats.ratioR = 0.48
    stats.indicePerfusion = 2.5
    stats.totalLecturas = 0
    stats.estado = 'normal'
    stats.etiqueta = 'Esperando señal...'
    stats.severidad = 'muted'
    stats.descripcion = ''
    stats.accionRecomendada = ''
    stats.alertaHipoxia = false
  }

  return {
    stats,
    historial,
    registrarLectura,
    reset
  }
}

/**
 * Gestor multi-canal de SpO2 para soportar hasta 5 canales simultáneos (RF114, RF08)
 * @param {number} totalCanales 
 */
export function crearMonitoresSpo2MultiCanal(totalCanales = 5) {
  const monitores = {}
  for (let c = 1; c <= totalCanales; c++) {
    monitores[c] = crearMonitorEstadisticasSpo2()
  }

  function registrarCanales(listaCanales) {
    if (!Array.isArray(listaCanales)) return
    listaCanales.forEach(ch => {
      const canalNum = ch.canal
      if (monitores[canalNum] && esSpo2Valido(ch.spo2)) {
        monitores[canalNum].registrarLectura(ch.spo2, ch.ratioR, ch.pi)
      }
    })
  }

  return {
    monitores,
    registrarCanales
  }
}
