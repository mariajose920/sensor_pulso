import { ref } from 'vue'

/**
 * Composable para el Simulador Interactivo de Senal PPG (RF41)
 *
 * Genera en tiempo real una senal fotopletismografica (PPG) sintetica
 * fisiologicamente realista a 100 Hz (1 muestra cada 10 ms), con
 * controles interactivos en vivo de:
 * - Frecuencia cardiaca (BPM)
 * - Amplitud de pulso
 * - Nivel de ruido / artefactos de movimiento
 * - Patrones de arritmia y variabilidad del ritmo
 *
 * Diseñado para el apartado de Aprendizaje y pruebas sin ESP32 fisico.
 */
export function useSignalSimulator(options = {}) {
  // Parametros interactivos (RF41)
  const bpm = ref(options.bpm || 72)
  const amplitude = ref(options.amplitude || 100) // 20% a 150%
  const noiseLevel = ref(options.noiseLevel || 3) // 0% a 50%
  const arrhythmia = ref(options.arrhythmia || 'normal')
  const isRunning = ref(false)

  // Estado interno del sintetizador
  let timerId = null
  let timeMs = 0
  let lastBeatTime = 0
  let currentPeriod = 60000 / bpm.value
  let beatCounter = 0
  let currentBeatAmp = 1.0

  const listeners = new Set()

  function subscribe(callback) {
    listeners.add(callback)
    return () => listeners.delete(callback)
  }

  function emitSample(sample) {
    for (const cb of listeners) {
      cb(sample)
    }
  }

  /**
   * Cambia el patron de arritmia y ajusta instantaneamente los parametros
   * para que el cambio sea visible inmediatamente en la grafica y en las metricas.
   */
  function setArrhythmia(type) {
    arrhythmia.value = type
    const basePeriod = 60000 / bpm.value

    switch (type) {
      case 'extrasystole':
        // Forzar que el siguiente latido sea inmediatamente el prematuro
        beatCounter = 4
        currentPeriod = basePeriod * 0.52
        currentBeatAmp = 0.65
        break

      case 'tachycardia':
        bpm.value = 135
        currentPeriod = 60000 / 135
        currentBeatAmp = 1.15
        break

      case 'bradycardia':
        bpm.value = 48
        currentPeriod = 60000 / 48
        currentBeatAmp = 1.10
        break

      case 'atrial_fibrillation':
        bpm.value = 88
        currentPeriod = (60000 / 88) * (0.55 + Math.random() * 0.85)
        currentBeatAmp = 0.60 + Math.random() * 0.55
        break

      case 'respiratory':
        bpm.value = 75
        currentPeriod = 60000 / 75
        currentBeatAmp = 1.0
        break

      case 'normal':
      default:
        bpm.value = 72
        currentPeriod = 60000 / 72
        currentBeatAmp = 1.0
        break
    }
  }

  /**
   * Genera el siguiente punto de la senal a 100 Hz con morfologia PPG real
   */
  function step(dt = 10) {
    timeMs += dt
    const timeSinceLast = timeMs - lastBeatTime

    // Inicio de un nuevo ciclo cardiaco
    if (timeSinceLast >= currentPeriod) {
      lastBeatTime = timeMs
      beatCounter++

      const basePeriod = 60000 / Math.max(35, Math.min(220, bpm.value))
      const userAmp = amplitude.value / 100

      switch (arrhythmia.value) {
        case 'normal':
          currentPeriod = basePeriod
          currentBeatAmp = userAmp
          break

        case 'respiratory': {
          // Arritmia Sinusal Respiratoria: periodo y amplitud se modulan armonicamente con la respiracion
          const resp = Math.sin(timeMs * 0.0016)
          currentPeriod = basePeriod * (1 + 0.14 * resp)
          currentBeatAmp = userAmp * (1 + 0.14 * resp)
          break
        }

        case 'extrasystole':
          // Extrasistole ventricular (PVC):
          // Latido 5 prematuro y de menor amplitud
          // Latido 6 pausa compensatoria amplia con mayor amplitud
          if (beatCounter % 5 === 0) {
            currentPeriod = basePeriod * 0.52 // Prematuro rapido
            currentBeatAmp = userAmp * 0.65   // Menor eyeccion
          } else if (beatCounter % 5 === 1) {
            currentPeriod = basePeriod * 1.48 // Pausa compensatoria
            currentBeatAmp = userAmp * 1.25   // Pulso fuerte post-pausa
          } else {
            currentPeriod = basePeriod
            currentBeatAmp = userAmp
          }
          break

        case 'atrial_fibrillation':
          // Fibrilacion auricular: caotico en cadencia y en amplitud de pulso
          currentPeriod = basePeriod * (0.55 + Math.random() * 0.85)
          currentBeatAmp = userAmp * (0.60 + Math.random() * 0.55)
          break

        case 'tachycardia':
          currentPeriod = 60000 / Math.max(120, bpm.value)
          currentBeatAmp = userAmp * 1.15
          break

        case 'bradycardia':
          currentPeriod = 60000 / Math.min(52, bpm.value)
          currentBeatAmp = userAmp * 1.10
          break

        default:
          currentPeriod = basePeriod
          currentBeatAmp = userAmp
      }
    }

    // Fase del ciclo cardiaco actual [0, 1)
    const phase = Math.min(1, Math.max(0, (timeMs - lastBeatTime) / currentPeriod))

    // 1. Cresta sistolica principal
    const s = Math.exp(-Math.pow(phase - 0.22, 2) / 0.008)

    // 2. Onda dicrota secundaria (en extrasistoles se atenua)
    const isEctopic = arrhythmia.value === 'extrasystole' && (beatCounter % 5 === 0)
    const dicCoeff = isEctopic ? 0.12 : 0.28
    const d = dicCoeff * Math.exp(-Math.pow(phase - 0.44, 2) / 0.010)

    const pulseSignal = (s + d) * currentBeatAmp

    // Oscilacion lenta de linea base por respiracion
    const respWander = 0.05 * Math.sin(timeMs * 0.0012)

    // Ruido e interferencia de alta frecuencia / temblor de dedo
    const noiseAmp = (noiseLevel.value / 100) * 1.3
    const noise = (Math.random() - 0.5) * 2 * noiseAmp

    // Mapeo a rango 0-4095 centrado en 2048 (mismo formato que el firmware del sensor)
    const rawValue = Math.round(2048 + (pulseSignal + respWander + noise) * 1200)
    const clampedValue = Math.max(0, Math.min(4095, rawValue))

    // Se envia hardwareBpm: 0 para que el detector web calcule y muestre
    // en vivo la variabilidad y frecuencia real de la onda generada
    const sample = {
      tMs: timeMs,
      value: clampedValue,
      leadsOff: false,
      hardwareBpm: 0,
      isPhysical: false
    }

    emitSample(sample)
  }

  function start() {
    if (isRunning.value) return
    isRunning.value = true
    timerId = setInterval(() => {
      step(10) // 100 Hz
    }, 10)
  }

  function pause() {
    isRunning.value = false
    if (timerId) {
      clearInterval(timerId)
      timerId = null
    }
  }

  function toggle() {
    if (isRunning.value) pause()
    else start()
  }

  function reset() {
    pause()
    timeMs = 0
    lastBeatTime = 0
    beatCounter = 0
    currentPeriod = 60000 / bpm.value
  }

  /**
   * Carga presets de un clic
   */
  function applyPreset(name) {
    switch (name) {
      case 'normal':
        setArrhythmia('normal')
        bpm.value = 72
        amplitude.value = 100
        noiseLevel.value = 3
        break

      case 'exercise':
        setArrhythmia('tachycardia')
        bpm.value = 135
        amplitude.value = 125
        noiseLevel.value = 7
        break

      case 'athlete':
        setArrhythmia('bradycardia')
        bpm.value = 48
        amplitude.value = 120
        noiseLevel.value = 2
        break

      case 'respiratory_arrhythmia':
        setArrhythmia('respiratory')
        bpm.value = 76
        amplitude.value = 100
        noiseLevel.value = 4
        break

      case 'extrasystole':
        setArrhythmia('extrasystole')
        bpm.value = 80
        amplitude.value = 100
        noiseLevel.value = 4
        break

      case 'atrial_fib':
        setArrhythmia('atrial_fibrillation')
        bpm.value = 92
        amplitude.value = 90
        noiseLevel.value = 6
        break

      case 'noisy':
        setArrhythmia('normal')
        bpm.value = 78
        amplitude.value = 75
        noiseLevel.value = 35
        break
    }
  }

  return {
    bpm,
    amplitude,
    noiseLevel,
    arrhythmia,
    isRunning,
    setArrhythmia,
    start,
    pause,
    toggle,
    reset,
    applyPreset,
    subscribe
  }
}
