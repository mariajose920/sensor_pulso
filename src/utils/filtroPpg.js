/**
 * Filtro de la señal PPG para mostrarla y detectar latidos (RF06, RF17)
 *
 * CONTRATO (lo usan varios módulos; mantener la firma):
 *   filtrarSenalPpg(muestras, frecuenciaHz, opciones?) → number[] del mismo largo
 *     - Pasa-banda de 0,5 a 5 Hz: quita la línea de base que se mueve (respiración, presión del dedo) y el ruido rápido.
 *     - SIN retraso (cero fase): los latidos quedan en el mismo instante que en la señal original.
 *     - La salida está centrada en 0 (es la componente pulsátil); si hace falta dibujarla, se normaliza al dibujar.
 *     - Devuelve [] si la entrada no es un arreglo de números finitos o tiene menos de 3 muestras.
 *
 * Implementación: dos filtros Butterworth de 2.º orden (pasa-altas y pasa-bajas), cada uno aplicado
 * hacia adelante y hacia atrás (filtfilt): fase cero y 4.º orden efectivo por lado. Para que no aparezcan
 * transitorios en los extremos de la ventana se resta la media y se prolonga la señal con reflexión impar
 * (la prolongación continúa la tendencia en los bordes) antes de filtrar.
 *
 * Datos puros (sin Vue ni DOM): se prueba con Node.
 */

export const BANDA_PPG = Object.freeze({ bajaHz: 0.5, altaHz: 5 })

const esFinito = (x) => typeof x === 'number' && Number.isFinite(x)

/** Coeficientes de un biquad Butterworth (Q = 1/√2) por transformada bilineal. tipo: 'baja' | 'alta'. */
function biquad(tipo, fc, fs) {
  const w0 = 2 * Math.PI * fc / fs
  const cos = Math.cos(w0)
  const alfa = Math.sin(w0) / (2 * Math.SQRT1_2)
  const a0 = 1 + alfa
  let b0, b1, b2
  if (tipo === 'baja') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = b0 } else { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = b0 }
  return { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: (-2 * cos) / a0, a2: (1 - alfa) / a0 }
}

function aplicarBiquad(x, c) {
  const y = new Array(x.length)
  let x1 = x[0], x2 = x[0]
  // estado inicial en régimen estacionario para entrada constante x[0] (evita el salto del arranque)
  let y1 = x[0] * (c.b0 + c.b1 + c.b2) / (1 + c.a1 + c.a2), y2 = y1
  for (let i = 0; i < x.length; i++) {
    const v = c.b0 * x[i] + c.b1 * x1 + c.b2 * x2 - c.a1 * y1 - c.a2 * y2
    y[i] = v
    x2 = x1; x1 = x[i]; y2 = y1; y1 = v
  }
  return y
}

function filtfilt(x, c) {
  const adelante = aplicarBiquad(x, c)
  adelante.reverse()
  const atras = aplicarBiquad(adelante, c)
  return atras.reverse()
}

export function filtrarSenalPpg(muestras, frecuenciaHz = 50, opciones = {}) {
  if (!Array.isArray(muestras) || muestras.length < 3 || !muestras.every(esFinito)) return []
  const fs = esFinito(frecuenciaHz) && frecuenciaHz > 0 ? frecuenciaHz : 50
  const { bajaHz = BANDA_PPG.bajaHz, altaHz = BANDA_PPG.altaHz } = opciones
  const n = muestras.length
  const media = muestras.reduce((s, v) => s + v, 0) / n
  const x = muestras.map((v) => v - media)

  // Prolongación por reflexión impar en ambos extremos
  const pad = Math.min(n - 1, Math.max(3, Math.round(3 * fs)))
  const ext = new Array(n + 2 * pad)
  for (let i = 0; i < pad; i++) {
    ext[pad - 1 - i] = 2 * x[0] - x[i + 1]
    ext[pad + n + i] = 2 * x[n - 1] - x[n - 2 - i]
  }
  for (let i = 0; i < n; i++) ext[pad + i] = x[i]

  let y = ext
  const altaSegura = Math.min(altaHz, fs / 2.5)
  if (altaSegura > 0) y = filtfilt(y, biquad('baja', altaSegura, fs))
  if (bajaHz > 0 && bajaHz < altaSegura) y = filtfilt(y, biquad('alta', bajaHz, fs))
  return y.slice(pad, pad + n)
}
