/**
 * Filtro de Remocion de Componente DC y Suavizado para sensor MAX30102 (RF17)
 *
 * Resuelve los problemas biofisicos del sensor optico:
 * 1. Sustrae la linea base DC (tejido, hueso, luz ambiental) que causa derivas.
 * 2. Invierte la polaridad optica: absorcion de luz -> mas sangre = menor luz.
 * 3. Aplica un filtro paso bajo suave para eliminar artefactos de alta frecuencia.
 * 4. Normaliza la amplitud de forma adaptativa para visualizacion centrada.
 */
export class PpgDcFilter {
  constructor({ alphaBaseline = 0.02, alphaSmooth = 0.35, invert = true } = {}) {
    this.alphaBaseline = alphaBaseline // Constante para la linea base DC
    this.alphaSmooth = alphaSmooth     // Suavizado paso bajo
    this.invert = invert               // Inversion de absorcion optica
    this.reset()
  }

  reset() {
    this.baseline = null
    this.smoothed = 0
    this.maxAc = 200 // Amplitud minima de referencia para autoscale
  }

  /**
   * Procesa una lectura cruda de ADC del MAX30102
   * @param {number} rawValue - Valor de luz IR o Rojo
   * @returns {{ ac: number, normalized: number, baseline: number }}
   */
  process(rawValue) {
    if (this.baseline === null) {
      this.baseline = rawValue
      this.smoothed = 0
      return { ac: 0, normalized: 0.5, baseline: rawValue }
    }

    // 1. Rastreador de linea base DC (Exponential Moving Average lento)
    this.baseline = this.baseline * (1 - this.alphaBaseline) + rawValue * this.alphaBaseline

    // 2. Extraccion del componente pulsante AC
    let ac = rawValue - this.baseline

    // 3. Inversion optica: cuando el corazon late, el volumen de sangre sube,
    // por lo que absorbe MAS luz y el sensor recibe MENOS cuentas.
    // Invertimos para que la sistole apunte hacia arriba (como en monitores medicos).
    if (this.invert) {
      ac = -ac
    }

    // 4. Filtro paso bajo para suprimir ruido muscular y temblores
    this.smoothed = this.smoothed * (1 - this.alphaSmooth) + ac * this.alphaSmooth

    // 5. Decaimiento y seguimiento del pico maximo para normalizacion
    this.maxAc *= 0.998
    if (Math.abs(this.smoothed) > this.maxAc) {
      this.maxAc = Math.abs(this.smoothed)
    }
    if (this.maxAc < 50) this.maxAc = 50

    // Normalizado entre 0.05 y 0.95 (centrado en 0.5)
    const normRatio = this.smoothed / this.maxAc
    const clamped = Math.max(-1, Math.min(1, normRatio))
    const normalized = 0.5 + clamped * 0.42

    return {
      ac: this.smoothed,
      normalized,
      baseline: this.baseline
    }
  }
}
