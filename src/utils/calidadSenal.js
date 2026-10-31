/**
 * Indicador de calidad de la señal (RF15)
 *
 * Mide tres cosas en la ventana reciente de muestras y las combina en un nivel
 * buena / regular / mala (siempre manda la peor de las tres):
 *   - ruido:      residuo de alta frecuencia respecto a la amplitud del pulso
 *   - movimiento: desplazamientos bruscos de la línea base respecto a la amplitud del pulso
 *   - recorte:    fracción de muestras pegadas al máximo (o mínimo) del sensor. Es la saturación
 *                 del conversor, distinta de la saturación de oxígeno (SpO₂).
 *
 * Los umbrales están en UMBRALES_CALIDAD para ajustarlos sin tocar el cálculo.
 * Funciona con cualquier escala: se indica el máximo del sensor en `maximo`
 * (4095 en el simulador y el puerto serie; 262143 en las cuentas crudas del MAX30102 por WiFi).
 */

export const UMBRALES_CALIDAD = {
  // ruido / amplitud del pulso (adimensional)
  ruido: { regular: 0.12, mala: 0.25 },
  // variación de la línea base / amplitud del pulso (adimensional)
  movimiento: { regular: 0.6, mala: 1.2 },
  // fracción de muestras en el tope del sensor: con recorte la señal es mala
  recorte: { regular: 0.003, mala: 0.01 },
  // margen bajo el máximo que se considera "pegado" (fracción del rango)
  margenRecorte: 0.01,
  // muestras mínimas para evaluar (a menos, no hay señal suficiente)
  minMuestras: 50
}

export const MAXIMO_SIMULADOR = 4095
export const MAXIMO_MAX30102 = 262143 // 18 bits

const ORDEN = { buena: 0, regular: 1, mala: 2 }

const TEXTOS = {
  ruido: {
    regular: 'Hay algo de ruido en la señal.',
    mala: 'Mucho ruido: la onda está muy irregular.'
  },
  movimiento: {
    regular: 'Hay movimiento: la línea base se desplaza.',
    mala: 'Mucho movimiento: la línea base cambia de golpe.'
  },
  recorte: {
    regular: 'El sensor roza su límite máximo.',
    mala: 'El sensor está saturado: la señal se corta en el máximo.'
  }
}

function nivelPara(valor, { regular, mala }) {
  if (valor >= mala) return 'mala'
  if (valor >= regular) return 'regular'
  return 'buena'
}

function mediaMovil(muestras, ventana) {
  const n = muestras.length
  const out = new Array(n)
  const mitad = Math.floor(ventana / 2)
  let suma = 0
  let cuenta = 0
  let ini = 0
  let fin = -1 // ventana [ini, fin] inclusive
  for (let i = 0; i < n; i++) {
    const nuevoIni = Math.max(0, i - mitad)
    const nuevoFin = Math.min(n - 1, i + mitad)
    while (fin < nuevoFin) { fin++; suma += muestras[fin]; cuenta++ }
    while (ini < nuevoIni) { suma -= muestras[ini]; ini++; cuenta-- }
    out[i] = suma / cuenta
  }
  return out
}

/**
 * Evalúa la calidad de una ventana de muestras.
 * @param {number[]} muestras ventana reciente (más antigua primero)
 * @param {{frecuenciaHz?: number, maximo?: number, minimo?: number, umbrales?: object}} opciones
 * @returns {{nivel: 'buena'|'regular'|'mala'|'sin_senal', ruido: number, movimiento: number,
 *            recorte: number, causas: {tipo: string, nivel: string, texto: string}[]}}
 */
export function evaluarCalidad(muestras, opciones = {}) {
  const {
    frecuenciaHz = 100,
    maximo = MAXIMO_SIMULADOR,
    minimo = 0,
    umbrales = UMBRALES_CALIDAD
  } = opciones

  if (!Array.isArray(muestras) || muestras.length < umbrales.minMuestras) {
    return { nivel: 'sin_senal', ruido: 0, movimiento: 0, recorte: 0, causas: [] }
  }

  const n = muestras.length

  // Recorte: muestras en el tope (o en el piso) del sensor
  const margen = (maximo - minimo) * umbrales.margenRecorte
  let pegadas = 0
  for (let i = 0; i < n; i++) {
    if (muestras[i] >= maximo - margen || muestras[i] <= minimo + margen) pegadas++
  }
  const recorte = pegadas / n

  // Amplitud del pulso: pico a pico de la señal sin la línea base lenta
  const base = mediaMovil(muestras, Math.max(3, Math.round(frecuenciaHz * 1.0)))
  const suave = mediaMovil(muestras, Math.max(3, Math.round(frecuenciaHz * 0.05)))
  const ac = suave.map((v, i) => v - base[i])
  const ordenado = [...ac].sort((a, b) => a - b)
  const p5 = ordenado[Math.floor(n * 0.05)]
  const p95 = ordenado[Math.min(n - 1, Math.floor(n * 0.95))]
  const amplitud = Math.max(p95 - p5, 1e-6)

  // Ruido: residuo entre la señal y su versión suavizada
  let energia = 0
  for (let i = 0; i < n; i++) {
    const r = muestras[i] - suave[i]
    energia += r * r
  }
  const ruido = Math.sqrt(energia / n) / amplitud

  // Movimiento: cuánto se desplaza la línea base dentro de la ventana
  let bmin = Infinity
  let bmax = -Infinity
  for (let i = 0; i < n; i++) {
    if (base[i] < bmin) bmin = base[i]
    if (base[i] > bmax) bmax = base[i]
  }
  const movimiento = (bmax - bmin) / amplitud

  const niveles = {
    ruido: nivelPara(ruido, umbrales.ruido),
    movimiento: nivelPara(movimiento, umbrales.movimiento),
    recorte: nivelPara(recorte, umbrales.recorte)
  }

  const causas = Object.entries(niveles)
    .filter(([, nivel]) => nivel !== 'buena')
    .map(([tipo, nivel]) => ({ tipo, nivel, texto: TEXTOS[tipo][nivel] }))
    .sort((a, b) => ORDEN[b.nivel] - ORDEN[a.nivel])

  const nivel = Object.values(niveles).reduce((peor, x) => (ORDEN[x] > ORDEN[peor] ? x : peor), 'buena')

  return {
    nivel,
    ruido: Number(ruido.toFixed(3)),
    movimiento: Number(movimiento.toFixed(3)),
    recorte: Number(recorte.toFixed(4)),
    causas
  }
}
