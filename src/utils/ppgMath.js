/**
 * Utilidades matematicas para el Requerimiento Funcional 24 (RF24)
 * Modelo morfologico de pulso PPG de reposo, curvas de medicion y ECG didactico.
 */

/**
 * Forma de onda fisiologica estandar de un pulso PPG en reposo.
 * Genera la morfologia normal de 1 latido:
 * - Pico sistolico principal (eyeccion ventricular y llegada periferica)
 * - Escotadura dicrota (cierre valvula aortica)
 * - Onda dicrota diastolica (rebote elastico arterial periferico)
 *
 * Se calibra con retardo fisiologico PTT (~190 ms) respecto al pico R del ECG.
 *
 * @param {number} phase - Fase del ciclo en el intervalo [0, 1)
 * @returns {number} Amplitud normalizada entre [0, 1]
 */
export function ppgWaveform(phase) {
  const t = ((phase % 1) + 1) % 1

  // 1. Pico sistolico principal (centrado en t = 0.38 para mostrar el retardo PTT respecto a la onda R)
  const a1 = 1.0
  const mu1 = 0.38
  const s1 = 0.08
  const systolic = a1 * Math.exp(-Math.pow(t - mu1, 2) / (2 * s1 * s1))

  // 2. Onda dicrota diastolica (rebote vascular elastico)
  const a2 = 0.35
  const mu2 = 0.60
  const s2 = 0.085
  const dicrotic = a2 * Math.exp(-Math.pow(t - mu2, 2) / (2 * s2 * s2))

  // 3. Escotadura dicrota (cierre valvula aortica)
  const a3 = -0.10
  const mu3 = 0.50
  const s3 = 0.035
  const notch = a3 * Math.exp(-Math.pow(t - mu3, 2) / (2 * s3 * s3))

  return Math.max(0, systolic + dicrotic + notch)
}

/**
 * Forma de onda ECG educativa de referencia normal (P-Q-R-S-T)
 * - Onda P: Despolarizacion auricular (~0.06)
 * - Complejo QRS: Despolarizacion ventricular (Pico R en ~0.15)
 * - Onda T: Repolarizacion ventricular (~0.30)
 *
 * @param {number} phase - Fase en el intervalo [0, 1)
 * @returns {number} Valor relativo didactico
 */
export function ecgEducationalWaveform(phase) {
  const t = ((phase % 1) + 1) % 1

  // Onda P (auricular)
  const p = 0.18 * Math.exp(-Math.pow(t - 0.06, 2) / (2 * 0.02 * 0.02))
  // Complejo QRS (ventricular)
  const q = -0.15 * Math.exp(-Math.pow(t - 0.135, 2) / (2 * 0.007 * 0.007))
  const r = 1.0 * Math.exp(-Math.pow(t - 0.15, 2) / (2 * 0.010 * 0.010))
  const s = -0.25 * Math.exp(-Math.pow(t - 0.17, 2) / (2 * 0.008 * 0.008))
  // Onda T (repolarizacion)
  const tWave = 0.28 * Math.exp(-Math.pow(t - 0.29, 2) / (2 * 0.038 * 0.038))

  return p + q + r + s + tWave
}

/**
 * Genera los puntos de una senal PPG en funcion del tiempo absoluto y su BPM
 *
 * @param {number} bpm - Frecuencia de la senal
 * @param {number} durationSeconds - Duracion en segundos de la ventana
 * @param {number} sampleRate - Frecuencia de muestreo (Hz)
 * @param {number} amplitude - Porcentaje de amplitud (100 = normal)
 */
export function generatePpgWindow(bpm, durationSeconds = 4, sampleRate = 100, amplitude = 100) {
  const totalSamples = Math.round(durationSeconds * sampleRate)
  const beatPeriodSeconds = 60 / Math.max(30, bpm)
  const points = []

  for (let i = 0; i < totalSamples; i++) {
    const tSeconds = i / sampleRate
    const phase = (tSeconds / beatPeriodSeconds) % 1.0
    const val = ppgWaveform(phase) * (amplitude / 100)
    points.push({
      tMs: Math.round(tSeconds * 1000),
      val: Number(val.toFixed(4))
    })
  }
  return points
}

/**
 * Plantilla estatica de reposo a 72 BPM (RF24)
 */
export function generateRestingTemplate(pointsPerCycle = 100, cycles = 2) {
  const total = pointsPerCycle * cycles
  const data = []
  for (let i = 0; i < total; i++) {
    const globalPhase = (i / total) * cycles
    const phaseInCycle = globalPhase % 1.0
    data.push({
      phase: Number(globalPhase.toFixed(3)),
      ppg: Number(ppgWaveform(phaseInCycle).toFixed(4)),
      ecg: Number(ecgEducationalWaveform(phaseInCycle).toFixed(4))
    })
  }
  return data
}
