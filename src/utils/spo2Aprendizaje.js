/**
 * SpO₂ medida que se muestra en el apartado de aprendizaje (RF115).
 *
 * Funciones puras (sin red ni pantalla) para decidir QUÉ medición se muestra y cómo se explica:
 *   - Solo cuentan las mediciones hechas con el sensor. Una señal simulada, un CSV, un conjunto de datos o una
 *     señal de referencia no es «tu saturación medida».
 *   - Se prefiere la medición más reciente con una señal de calidad aceptable; si hay una más nueva con mala
 *     calidad, se avisa en vez de mostrarla como si fuera confiable.
 *   - Se da el contexto para aprender: dónde cae el valor en la escala, cómo cambió y cómo se calculó con ese valor.
 */

import { esSpo2Valido, calcularRDesdeSpo2 } from '../services/spo2Service.js'

/** Escala visual: de 80 % a 100 %, cuatro zonas de 5 puntos con los umbrales de la plataforma. */
export const ESCALA_SPO2 = Object.freeze({
  min: 80,
  max: 100,
  zonas: Object.freeze([
    Object.freeze({ id: 'severa', desde: 80, hasta: 85, etiqueta: 'Menos de 85 %' }),
    Object.freeze({ id: 'moderada', desde: 85, hasta: 90, etiqueta: '85 a 89 %' }),
    Object.freeze({ id: 'leve', desde: 90, hasta: 95, etiqueta: '90 a 94 %' }),
    Object.freeze({ id: 'normal', desde: 95, hasta: 100, etiqueta: '95 % o más' })
  ])
})

/** Cuántas mediciones recientes se listan. */
export const MAX_ULTIMAS = 5

/** Diferencia (en puntos de SpO₂) por debajo de la cual se considera que no hubo cambio. */
export const UMBRAL_CAMBIO = 1

/** Rango en que el sensor limita el resultado (constrain(110 − 25·R, 70, 100) en el firmware). */
export const LIMITE_SENSOR = Object.freeze({ min: 70, max: 100 })

function aMedicion(item, { permitirSinFuente }) {
  if (!item) return null
  const spo2 = Number(item.spo2)
  if (item.spo2 === null || item.spo2 === undefined || item.spo2 === '' || !esSpo2Valido(spo2)) return null
  const fuente = item.fuente ?? null
  // Solo el sensor mide de verdad. Sin dato de origen (copia guardada en el dispositivo antes de registrarlo) solo
  // se acepta cuando se pide explícitamente.
  if (fuente === null ? !permitirSinFuente : fuente !== 'sensor') return null
  return {
    id: item.id ?? null,
    spo2,
    fecha: item.inicio || item.fecha || null,
    calidad: item.calidad || null,
    actividad: item.actividad || null,
    canal: item.canal ?? null,
    fuente,
    confiable: item.calidad !== 'mala'
  }
}

/** Mediciones con SpO₂ válida hechas con el sensor, de la más reciente a la más antigua. */
export function medicionesConSpo2(items = [], { permitirSinFuente = false } = {}) {
  return (Array.isArray(items) ? items : []).map(i => aMedicion(i, { permitirSinFuente })).filter(Boolean)
}

/**
 * Decide qué se muestra.
 * @returns {{
 *   medida: object|null,        la medición elegida (con `confiable`)
 *   omitidasPorCalidad: number, cuántas mediciones más nuevas se saltaron por mala calidad de señal
 *   ultimas: object[],          hasta MAX_ULTIMAS mediciones recientes
 *   cambio: {diferencia:number, sentido:'sube'|'baja'|'igual'}|null  respecto a la medición confiable anterior
 * }}
 */
export function seleccionarMedida(items = [], opciones = {}) {
  const lista = medicionesConSpo2(items, opciones)
  if (!lista.length) return { medida: null, omitidasPorCalidad: 0, ultimas: [], cambio: null }

  const indice = lista.findIndex(m => m.confiable)
  const medida = indice >= 0 ? lista[indice] : lista[0]
  const omitidasPorCalidad = indice > 0 ? indice : 0

  let cambio = null
  if (medida.confiable) {
    const anterior = lista.slice(indice + 1).find(m => m.confiable)
    if (anterior) {
      const diferencia = Math.round((medida.spo2 - anterior.spo2) * 10) / 10
      const sentido = Math.abs(diferencia) < UMBRAL_CAMBIO ? 'igual' : diferencia > 0 ? 'sube' : 'baja'
      cambio = { diferencia, sentido }
    }
  }
  return { medida, omitidasPorCalidad, ultimas: lista.slice(0, MAX_ULTIMAS), cambio }
}

/** Posición (0 a 100) del marcador en la escala de 80 % a 100 %. Fuera de la escala queda en el borde. */
export function posicionEnEscala(spo2) {
  const n = Number(spo2)
  if (!Number.isFinite(n)) return 0
  const { min, max } = ESCALA_SPO2
  const pos = ((Math.min(max, Math.max(min, n)) - min) / (max - min)) * 100
  return Math.round(pos * 10) / 10
}

const formato = (n, decimales) =>
  n.toLocaleString('es-CL', { minimumFractionDigits: decimales, maximumFractionDigits: decimales })

/**
 * Cómo se calculó el valor, con los números de la persona: SpO₂ ≈ 110 − 25 × R, despejando R.
 * Si el valor está en el límite del sensor (70 % o 100 %), R real pudo ser distinto y se avisa.
 */
export function explicarCalculo(spo2) {
  const n = Number(spo2)
  if (!esSpo2Valido(n)) return null
  const r = calcularRDesdeSpo2(n)
  const enLimite = n >= LIMITE_SENSOR.max || n <= LIMITE_SENSOR.min
  return {
    formula: 'SpO₂ ≈ 110 − 25 × R',
    r,
    rTexto: formato(r, 2),
    sustitucion: `110 − 25 × ${formato(r, 2)} = ${formato(n, 1)} %`,
    enLimite,
    nota: enLimite
      ? `El sensor limita el resultado entre ${LIMITE_SENSOR.min} % y ${LIMITE_SENSOR.max} %, así que la razón R real pudo ser distinta de la que sale al despejar.`
      : 'Es el valor promedio de tu medición, convertido con la curva aproximada de la plataforma; un oxímetro clínico usa su propia calibración.'
  }
}

/** 96.4 → «96,4» (con coma, como se escribe en Chile). */
export function formatearSpo2(spo2) {
  const n = Number(spo2)
  return Number.isFinite(n) ? formato(n, 1) : '—'
}

/** Texto corto para el cambio respecto a la medición anterior. */
export function textoCambio(cambio) {
  if (!cambio) return ''
  if (cambio.sentido === 'igual') return 'Sin cambios importantes respecto a tu medición anterior.'
  const puntos = formato(Math.abs(cambio.diferencia), 1)
  return cambio.sentido === 'sube'
    ? `Subió ${puntos} puntos respecto a tu medición anterior.`
    : `Bajó ${puntos} puntos respecto a tu medición anterior.`
}
