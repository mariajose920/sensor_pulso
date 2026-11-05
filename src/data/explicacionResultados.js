/**
 * Explicación de cómo se obtienen el BPM y la SpO₂ (RF22)
 *
 * Datos puros, sin pantalla ni red, para poder probarlos con Node y leerlos sin conexión (RNF03).
 * Los números son los mismos que usa la aplicación: BPM = 60 000 ÷ intervalo (bpmService) y
 * SpO₂ ≈ 110 − 25·R (spo2Service). La curva es aproximada y la explicación lo dice.
 */

export const LONGITUD_ONDA_IR_NM = 880
export const LONGITUD_ONDA_ROJO_NM = 660

/** Aclaración que pide el requerimiento: el sensor entrega intensidad, no nanómetros. */
export const NOTA_INTENSIDAD =
  'Los nanómetros (nm) son la longitud de onda de la luz de cada LED. Lo que el sensor entrega es intensidad: ' +
  'un número por cada muestra. Los BPM y la SpO₂ se calculan después a partir de cómo cambia esa intensidad.'

/** Cadena luz → intensidad → picos → intervalos → BPM. */
export const PASOS_BPM = [
  {
    titulo: `Luz infrarroja (${LONGITUD_ONDA_IR_NM} nm)`,
    texto: 'El LED infrarrojo del MAX30102 ilumina la yema del dedo.'
  },
  {
    titulo: 'Intensidad reflejada',
    texto: 'El fotodetector mide cuánta luz vuelve. Con cada latido llega más sangre al dedo, la sangre absorbe luz y la intensidad baja; entre latidos sube. Esa subida y bajada es la señal de pulso.'
  },
  {
    titulo: 'Picos',
    texto: 'El algoritmo detecta los picos de la onda (uno por latido) y espera un tiempo mínimo antes de aceptar otro, para no contar dos veces el mismo latido.'
  },
  {
    titulo: 'Intervalos',
    texto: 'Mide el tiempo en milisegundos entre dos picos seguidos.'
  },
  {
    titulo: 'BPM',
    texto: 'Convierte el intervalo en latidos por minuto y promedia varios latidos para que el valor sea estable.',
    formula: 'BPM = 60 000 ÷ intervalo (ms)'
  }
]

/** Cadena luz roja e infrarroja → absorción distinta → razón R → porcentaje. */
export const PASOS_SPO2 = [
  {
    titulo: `Luz roja (${LONGITUD_ONDA_ROJO_NM} nm) e infrarroja (${LONGITUD_ONDA_IR_NM} nm)`,
    texto: 'El sensor enciende los dos LED y mide la intensidad que vuelve de cada uno.'
  },
  {
    titulo: 'Absorción distinta de la hemoglobina',
    texto: 'La hemoglobina con oxígeno (HbO₂) absorbe más luz infrarroja y la hemoglobina sin oxígeno (Hb) absorbe más luz roja. Según cuánto oxígeno lleve la sangre, cambia la proporción de luz roja e infrarroja que vuelve.'
  },
  {
    titulo: 'Razón entre las dos señales (R)',
    texto: 'De cada señal se toma su parte pulsátil (AC, la que cambia con el latido) y su parte continua (DC, el nivel base) y se comparan.',
    formula: 'R = (AC rojo ÷ DC rojo) ÷ (AC infrarrojo ÷ DC infrarrojo)'
  },
  {
    titulo: 'Porcentaje de SpO₂',
    texto: 'Una curva de calibración convierte R en porcentaje. Es una curva empírica aproximada: un oxímetro clínico usa la calibración de su fabricante y puede diferir unos puntos.',
    formula: 'SpO₂ ≈ 110 − 25 × R'
  }
]

const esNumero = (n) => typeof n === 'number' && Number.isFinite(n)

/**
 * Ejemplo con el BPM de la persona: el intervalo entre picos que da ese BPM.
 * @returns {{ bpm: number, intervaloMs: number } | null} null si el BPM no sirve
 */
export function ejemploBpm(bpm) {
  if (!esNumero(bpm) || bpm <= 0) return null
  const intervaloMs = Math.round(60000 / bpm)
  return { bpm: Math.round(bpm), intervaloMs }
}

/**
 * Ejemplo con la SpO₂ de la persona: la razón R que le corresponde en la curva SpO₂ = 110 − 25·R.
 * Si se conoce la R medida y es coherente con la SpO₂ (±1 punto) se usa; si no, se calcula la R
 * equivalente a partir de la SpO₂. `medida` dice cuál de las dos se usó.
 * @returns {{ spo2: number, r: number, medida: boolean } | null} null si la SpO₂ no sirve
 */
export function ejemploSpo2(spo2, ratioR) {
  if (!esNumero(spo2) || spo2 <= 0 || spo2 > 100) return null
  const redondeada = Math.round(spo2)
  if (esNumero(ratioR) && ratioR > 0 && Math.abs(110 - 25 * ratioR - spo2) <= 1) {
    return { spo2: redondeada, r: Number(ratioR.toFixed(2)), medida: true }
  }
  return { spo2: redondeada, r: Number(((110 - spo2) / 25).toFixed(2)), medida: false }
}

/** Número con coma decimal, como en el resto de la interfaz en español. */
export function formatoDecimal(n, decimales = 2) {
  return Number(n).toFixed(decimales).replace('.', ',')
}
