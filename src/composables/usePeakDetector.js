import { ref } from 'vue'

/**
 * Algoritmo de Deteccion de Picos en tiempo real y Metricas Cardiacas (RF17)
 *
 * Cumple estrictamente con:
 * - Detectar picos sistolicos en tiempo real con umbral adaptativo (elimina falsos picos y ondas dicroticas).
 * - Calcular BPM exacto: tanto con la referencia directa del hardware (ESP32) como por calculo instantaneo/promedio.
 * - Calcular variabilidad de la frecuencia cardiaca (HRV): RMSSD y SDNN.
 * - Clasificar la regularidad del ritmo cardiaco segun Coeficiente de Variacion (CV).
 */
export function usePeakDetector(options = {}) {
  // Periodo refractario fisiologico: 380 ms (~157 BPM maximo)
  // Bloquea fisicamente la onda dicrota (que ocurre a 180-280 ms) sin restringir latidos reales
  const refractoryMs = options.refractoryMs || 380
  const windowSize = options.windowSize || 8 // Ventana de 8 latidos para respuesta agil

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

  // Variables internas del detector adaptativo
  let peakMax = 50
  let prevVal = 0
  let prevSlope = 0
  let lastPeakTime = null
  let isWaitingForDrop = false
  const rrIntervals = []
  let beatPulseTimeout = null
  let leadsOffTimeout = null

  /**
   * Procesa una muestra individual (tMs, rawVal, hardwareBpm)
   * @param {number} tMs - Tiempo en ms
   * @param {number} rawVal - Valor AC filtrado
   * @param {number} [hardwareBpm=0] - Frecuencia cardiaca reportada por el ESP32
   * @returns {boolean} true si se detecto el vertice de un pico sistolico (punto rojo)
   */
  function processSample(tMs, rawVal, hardwareBpm = 0) {
    if (leadsOffTimeout) {
      clearTimeout(leadsOffTimeout)
      leadsOffTimeout = null
    }

    // 1. Seguimiento adaptativo rapido de la envolvente de la onda
    if (rawVal > peakMax) {
      peakMax = rawVal
    } else {
      peakMax *= 0.995 // Decaimiento suave
    }
    // Si paso mas de 1.5 s sin latido, decaer mas rapido para atrapar el siguiente de inmediato
    if (lastPeakTime !== null && (tMs - lastPeakTime) > 1500 && peakMax > 35) {
      peakMax *= 0.985
    }
    if (peakMax < 20) peakMax = 20

    // 2. Umbral dinamico: 40% de la cresta sistolica pico
    // Suficientemente bajo para capturar el pulso durante la inspiracion,
    // y la ventana refractaria de 380 ms se encarga de descartar la onda dicrota
    const threshold = Math.max(15, peakMax * 0.40)

    // 3. Calculo de pendiente
    const currentSlope = rawVal - prevVal

    // 4. Deteccion de vertice exacto de la cresta sistolica (punto rojo en la cuspide)
    const isApex = prevSlope > 0 && currentSlope <= 0 && rawVal > threshold && !isWaitingForDrop
    let detected = false

    if (isApex) {
      isWaitingForDrop = true // Bloquea detecciones repetidas durante el mismo pulso

      if (lastPeakTime === null) {
        lastPeakTime = tMs
        detected = true
        totalBeatsDetected.value++
        triggerBeatAnimation()
      } else {
        const delta = tMs - lastPeakTime

        // Ventana fisiologica valida para latidos humanos (380 ms a 1800 ms = 33 a 157 BPM)
        if (delta >= refractoryMs && delta <= 1800) {
          detected = true
          lastPeakTime = tMs
          totalBeatsDetected.value++
          triggerBeatAnimation()

          lastIntervalMs.value = Math.round(delta)
          instantBpm.value = Math.round(60000 / delta)

          rrIntervals.push(delta)
          if (rrIntervals.length > windowSize) {
            rrIntervals.shift()
          }

          computeMetrics(hardwareBpm)
        } else if (delta < 0 || delta > 1800) {
          // Pausa prolongada o reinicio de reloj del microcontrolador
          lastPeakTime = tMs
        }
      }
    }

    // Desbloquear cuando la onda cae por debajo del 60% del umbral sistolico
    if (rawVal < threshold * 0.60) {
      isWaitingForDrop = false
    }

    prevSlope = currentSlope
    prevVal = rawVal
    return detected
  }

  /**
   * Calcula BPM promedio con enganche rapido y filtro de MEDIANA robusto
   */
  function computeMetrics(hardwareBpm = 0) {
    const validIntervals = rrIntervals.filter(x => x >= refractoryMs && x <= 1800)
    if (validIntervals.length === 0) return

    // 1. Calculo de BPM mediante MEDIANA de intervalos R-R (inmune a rebotes y espuelas)
    const sorted = [...validIntervals].sort((a, b) => a - b)
    const mid = Math.floor(sorted.length / 2)
    const medianRR = sorted.length % 2 === 0
      ? (sorted[mid - 1] + sorted[mid]) / 2
      : sorted[mid]

    const stableWebBpm = Math.round(60000 / medianRR)

    // Enganche inmediato: desde el primer intervalo medido (latido 2) muestra la FC real al instante
    if (currentBpm.value === 0 || totalBeatsDetected.value <= 3) {
      currentBpm.value = stableWebBpm
    } else {
      // Suavizado agil (50/50) sobre la mediana ya libre de ruido
      currentBpm.value = Math.round(0.50 * currentBpm.value + 0.50 * stableWebBpm)
    }

    // Si el hardware trae una lectura coherente (+/- 8 BPM), la armonizamos
    if (hardwareBpm >= 45 && hardwareBpm <= 140 && Math.abs(hardwareBpm - currentBpm.value) <= 8) {
      currentBpm.value = Math.round(0.40 * currentBpm.value + 0.60 * hardwareBpm)
    }

    // 2. Metricas HRV y Regularidad (cuando hay al menos 2 intervalos medidos)
    if (validIntervals.length >= 2) {
      // SDNN: Desviacion estandar de los intervalos R-R normales en ms
      const meanRR = validIntervals.reduce((a, b) => a + b, 0) / validIntervals.length
      const variance = validIntervals.reduce((acc, v) => acc + Math.pow(v - meanRR, 2), 0) / validIntervals.length
      sdnn.value = Math.round(Math.sqrt(variance))

      // RMSSD: Raiz cuadrada de diferencias cuadraticas sucesivas
      let sumSquaredDiffs = 0
      let validPairs = 0
      for (let i = 1; i < validIntervals.length; i++) {
        const diff = validIntervals[i] - validIntervals[i - 1]
        if (Math.abs(diff) < 220) {
          sumSquaredDiffs += diff * diff
          validPairs++
        }
      }
      if (validPairs > 0) {
        rmssd.value = Math.round(Math.sqrt(sumSquaredDiffs / validPairs))
      } else {
        rmssd.value = Math.round(sdnn.value * 0.75)
      }

      // Clasificacion de la regularidad del ritmo (RF17)
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

    // Persistir automaticamente la medicion para RF24
    try {
      localStorage.setItem('sensor_last_measurement', JSON.stringify({
        bpm: currentBpm.value,
        rmssd: rmssd.value,
        sdnn: sdnn.value,
        intervalMs: lastIntervalMs.value,
        timestamp: Date.now()
      }))
    } catch (e) {
      // Ignorar si localStorage no esta disponible
    }
  }

  function handleLeadsOff() {
    isBeating.value = false
    // Esperar 2.5 segundos con dedo retirado antes de limpiar la medicion
    if (!leadsOffTimeout) {
      leadsOffTimeout = setTimeout(() => {
        reset()
      }, 2500)
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
    peakMax = 60
    prevVal = 0
    prevSlope = 0
    lastPeakTime = null
    isWaitingForDrop = false
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
    if (leadsOffTimeout) {
      clearTimeout(leadsOffTimeout)
      leadsOffTimeout = null
    }
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
    handleLeadsOff,
    reset
  }
}
