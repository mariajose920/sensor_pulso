/**
 * Filtro de Remocion de Componente DC y Suavizado para sensor PPG (RF17)
 * Extrae la componente pulsante AC y normaliza la senal para visualizacion en el osciloscopio.
 */
export class PpgDcFilter {
  constructor({ alphaBaseline = 0.02, alphaSmooth = 0.35 } = {}) {
    this.alphaBaseline = alphaBaseline
    this.alphaSmooth = alphaSmooth
    this.reset()
  }

  reset() {
    this.baseline = null
    this.smoothed = 0
    this.maxAc = 80
  }

  /**
   * Procesa una lectura entrante del sensor
   * @param {number} rawValue - Valor de la muestra
   * @returns {{ ac: number, normalized: number }}
   */
  process(rawValue) {
    if (!rawValue || rawValue <= 0) {
      return { ac: 0, normalized: 0.5 }
    }

    if (this.baseline === null) {
      this.baseline = rawValue
      this.smoothed = 0
      this.maxAc = 80
      return { ac: 0, normalized: 0.5 }
    }

    // Caso A: Senal ya filtrada/centrada en ~2048 (rango 0-4095 del firmware MAX30100)
    if (rawValue >= 100 && rawValue <= 4095) {
      this.baseline = this.baseline * (1 - this.alphaBaseline) + rawValue * this.alphaBaseline
      const ac = rawValue - this.baseline
      this.smoothed = this.smoothed * (1 - this.alphaSmooth) + ac * this.alphaSmooth

      this.maxAc *= 0.998
      if (Math.abs(this.smoothed) > this.maxAc) this.maxAc = Math.abs(this.smoothed)
      if (this.maxAc < 35) this.maxAc = 35

      const normRatio = this.smoothed / this.maxAc
      const clamped = Math.max(-1, Math.min(1, normRatio))
      const normalized = 0.5 + clamped * 0.42

      return {
        ac: this.smoothed,
        normalized
      }
    }

    // Caso B: Cuentas ADC directas de alta resolucion (>5000)
    this.baseline = this.baseline * (1 - this.alphaBaseline) + rawValue * this.alphaBaseline
    const ac = -(rawValue - this.baseline) // Invertir absorcion fotometrica
    this.smoothed = this.smoothed * (1 - this.alphaSmooth) + ac * this.alphaSmooth

    this.maxAc *= 0.998
    if (Math.abs(this.smoothed) > this.maxAc) this.maxAc = Math.abs(this.smoothed)
    if (this.maxAc < 50) this.maxAc = 50

    const normRatio = this.smoothed / this.maxAc
    const clamped = Math.max(-1, Math.min(1, normRatio))
    const normalized = 0.5 + clamped * 0.42

    return {
      ac: this.smoothed,
      normalized
    }
  }
}
