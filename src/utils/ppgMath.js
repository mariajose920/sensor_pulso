/**
 * Utilidades matematicas para el Requerimiento Funcional 24 (RF24)
 * Modelo morfologico de pulso PPG de reposo y ECG didactico.
 */

/**
 * Forma de onda fisiologica estandar de un pulso PPG en reposo.
 * Genera la morfologia normal de 1 latido:
 * - Pico sistolico principal
 * - Escotadura dicrota
 * - Onda dicrota diastolica
 *
 * @param {number} phase - Fase del ciclo en el intervalo [0, 1)
 * @returns {number} Amplitud normalizada entre [0, 1]
 */
export function ppgWaveform(phase) {
  const t = ((phase % 1) + 1) % 1

  // 1. Pico sistolico principal (eyeccion ventricular)
  const a1 = 1.0
  const mu1 = 0.22
  const s1 = 0.08
  const systolic = a1 * Math.exp(-Math.pow(t - mu1, 2) / (2 * s1 * s1))

  // 2. Onda dicrota diastolica (rebote elastico arterial)
  const a2 = 0.35
  const mu2 = 0.44
  const s2 = 0.09
  const dicrotic = a2 * Math.exp(-Math.pow(t - mu2, 2) / (2 * s2 * s2))

  // 3. Escotadura dicrota (cierre subito de la valvula aortica)
  const a3 = -0.10
  const mu3 = 0.33
  const s3 = 0.035
  const notch = a3 * Math.exp(-Math.pow(t - mu3, 2) / (2 * s3 * s3))

  return Math.max(0, systolic + dicrotic + notch)
}

/**
 * Forma de onda ECG educativa de referencia (P-Q-R-S-T)
 * Se muestra para comparar BPM e intervalos, evidenciando que el sensor
 * mide pulso por luz (PPG) y no actividad electrica (ECG).
 *
 * @param {number} phase - Fase en el intervalo [0, 1)
 * @returns {number} Valor relativo didactico
 */
export function ecgEducationalWaveform(phase) {
  const t = ((phase % 1) + 1) % 1

  // Onda P (auricular)
  const p = 0.15 * Math.exp(-Math.pow(t - 0.08, 2) / (2 * 0.02 * 0.02))
  // Complejo QRS (ventricular rapido)
  const q = -0.12 * Math.exp(-Math.pow(t - 0.18, 2) / (2 * 0.008 * 0.008))
  const r = 1.0 * Math.exp(-Math.pow(t - 0.20, 2) / (2 * 0.012 * 0.012))
  const s = -0.22 * Math.exp(-Math.pow(t - 0.22, 2) / (2 * 0.009 * 0.009))
  // Onda T (repolarizacion ventricular)
  const tWave = 0.25 * Math.exp(-Math.pow(t - 0.38, 2) / (2 * 0.045 * 0.045))

  return p + q + r + s + tWave
}

/**
 * Plantilla estatica de pulso en reposo a 72 BPM (833 ms por ciclo)
 *
 * @param {number} pointsPerCycle - Puntos por ciclo
 * @param {number} cycles - Cantidad de ciclos a generar
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
