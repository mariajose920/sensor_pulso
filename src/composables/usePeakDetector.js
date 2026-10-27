import { ref } from 'vue'

/**
 * Algoritmo de Deteccion de Picos en tiempo real y Metricas Cardiacas (RF17)
 *
 * Cumple con:
 * - Detectar picos sistolicos en tiempo real.
 * - Calcular BPM instantaneo y promedio suavizado.
 * - Calcular variabilidad de la frecuencia cardiaca (HRV): RMSSD y SDNN.
 * - Clasificar la regularidad del ritmo (Normal, Moderada, Irregular / Arritmia).
 */
export function usePeakDetector(options = {}) {
  const refractoryMs = options.refractoryMs || 360 // Periodo refractario (~166 BPM maximo)
  const windowSize = options.windowSize || 15      // Ventana de latidos para calculo de HRV

  // Metricas reactivas expuestas a la UI (RF17)
  const currentBpm = ref(0)
  const instantBpm = ref(0)
  const rmssd = ref(0) // Root Mean Square of Successive Differences (ms)
  const sdnn = ref(0)  // Standard Deviation of NN intervals (ms)
  const regularityStatus = ref('Esperando latidos...')
  const regularityLevel = ref('normal') // 'normal' | 'moderate' | 'irregular'
  const isBeating = ref(false)
  const totalBeatsDetected = ref(0)
  const lastIntervalMs = ref(0)

  // Variables internas
  let smoothedVal = null
  let baseline = null
  let prevVal = 0
  let prevSlope = 0
  let lastPeakTime = null
  const rrIntervals = []
  let beatPulseTimeout = null

  /**
   * Procesa una muestra individual (tMs, val)
   * @param {number} tMs - Tiempo en ms
   * @param {number} rawVal - Valor filtrado o normalizado
   * @returns {boolean} true si se detecto un pico sistolico
   */
  function processSample(tMs, rawVal) {
    if (smoothedVal === null) {
      smoothedVal = rawVal
      baseline = rawVal
      prevVal = rawVal
      return false
    }

    // Suavizado EMA y seguimiento de linea base
    smoothedVal = smoothedVal * 0.70 + rawVal * 0.30
    baseline = baseline * 0.98 + smoothedVal * 0.02
    const currentSlope = smoothedVal - prevVal

    // Deteccion de cresta sistolica:
    // 1. Debe estar en la mitad superior del pulso (por encima de la linea base)
    // 2. La pendiente pasa de positiva a negativa (maximo local)
    const isAboveBaseline = smoothedVal > baseline
    const isCrest = prevSlope > 0 && currentSlope <= 0 && isAboveBaseline
    let detected = false

    if (isCrest) {
      if (lastPeakTime === null) {
        // Primer latido: guardamos punto de inicio
        lastPeakTime = tMs
        detected = true
        totalBeatsDetected.value++
        triggerBeatAnimation()
      } else {
        const delta = tMs - lastPeakTime

        // Ventana fisiologica valida para latidos humanos (350 ms a 1900 ms = 31 a 171 BPM)
        if (delta >= refractoryMs && delta <= 1900) {
          detected = true
          lastPeakTime = tMs
          totalBeatsDetected.value++
          triggerBeatAnimation()

          lastIntervalMs.value = Math.round(delta)
          rrIntervals.push(delta)
          if (rrIntervals.length > windowSize) {
            rrIntervals.shift()
          }

          // BPM instantaneo
          instantBpm.value = Math.round(60000 / delta)

          // Calcular HRV y Regularidad del ritmo (RF17)
          computeMetrics()
        } else if (delta > 1900) {
          // Si paso demasiado tiempo sin senal (pausa o dedo levantado), reiniciamos referencia
          lastPeakTime = tMs
        }
      }
    }

    prevSlope = currentSlope
    prevVal = smoothedVal
    return detected
  }

  /**
   * Calcula BPM promedio, HRV (RMSSD y SDNN) y evalua regularidad del ritmo (RF17)
   */
  function computeMetrics() {
    if (rrIntervals.length < 2) return

    // Media de intervalos R-R / P-P
    const sum = rrIntervals.reduce((acc, v) => acc + v, 0)
    const meanRR = sum / rrIntervals.length

    // BPM promedio suavizado
    currentBpm.value = Math.round(60000 / meanRR)

    // SDNN (Desviacion estandar de los intervalos R-R en ms)
    const variance = rrIntervals.reduce((acc, v) => acc + Math.pow(v - meanRR, 2), 0) / rrIntervals.length
    sdnn.value = Math.round(Math.sqrt(variance))

    // RMSSD: Raiz cuadrada de la media de diferencias sucesivas al cuadrado (ms)
    let sumSquaredDiffs = 0
    for (let i = 1; i < rrIntervals.length; i++) {
      const diff = rrIntervals[i] - rrIntervals[i - 1]
      sumSquaredDiffs += diff * diff
    }
    const rmssdVal = Math.sqrt(sumSquaredDiffs / (rrIntervals.length - 1))
    rmssd.value = Math.round(rmssdVal)

    // Clasificacion de la regularidad del ritmo (RF17)
    // Coeficiente de variacion CV = (SDNN / media) * 100
    const cv = (sdnn.value / meanRR) * 100

    if (cv < 12) {
      regularityStatus.value = 'Ritmo Regular (Normal)'
      regularityLevel.value = 'normal'
    } else if (cv < 22) {
      regularityStatus.value = 'Variabilidad fisiologica moderada'
      regularityLevel.value = 'moderate'
    } else {
      regularityStatus.value = 'Ritmo Irregular (Posible arritmia)'
      regularityLevel.value = 'irregular'
    }
  }

  function triggerBeatAnimation() {
    isBeating.value = true
    if (beatPulseTimeout) clearTimeout(beatPulseTimeout)
    beatPulseTimeout = setTimeout(() => {
      isBeating.value = false
    }, 120)
  }

  function reset() {
    smoothedVal = null
    baseline = null
    prevVal = 0
    prevSlope = 0
    lastPeakTime = null
    rrIntervals.length = 0
    currentBpm.value = 0
    instantBpm.value = 0
    rmssd.value = 0
    sdnn.value = 0
    totalBeatsDetected.value = 0
    lastIntervalMs.value = 0
    regularityStatus.value = 'Esperando latidos...'
    regularityLevel.value = 'normal'
    isBeating.value = false
  }

  return {
    currentBpm,
    instantBpm,
    rmssd,
    sdnn,
    regularityStatus,
    regularityLevel,
    isBeating,
    totalBeatsDetected,
    lastIntervalMs,
    processSample,
    reset
  }
}
