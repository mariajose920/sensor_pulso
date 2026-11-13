/**
 * sensor_pulso · Galería de mediciones públicas (RF34)
 *
 * Lógica de la galería: filtros por actividad, edad y estado. Son datos anonimizados;
 * aquí nunca se usan nombres ni identificadores de personas.
 */

export const ACTIVIDADES = [
  { valor: 'reposo', etiqueta: 'Reposo' },
  { valor: 'caminata', etiqueta: 'Caminata' },
  { valor: 'ejercicio', etiqueta: 'Ejercicio' }
]

/** Mismos rangos de edad con que se publican las mediciones. */
export const RANGOS_EDAD = ['<18', '18-24', '25-34', '35-49', '50+']

export const ESTADOS = [
  { valor: 'dentro', etiqueta: 'Dentro del rango' },
  { valor: 'fuera', etiqueta: 'Fuera del rango' }
]

// BPM esperado según la actividad; es una referencia educativa, no un diagnóstico.
const BPM_ESPERADO = {
  reposo: [60, 100],
  caminata: [70, 120],
  ejercicio: [90, 180]
}
const SPO2_MINIMA = 95

/**
 * Estado de una medición: 'dentro' o 'fuera' del rango esperado.
 * Si la publicación ya trae el dato calculado por la base (`dentroDeRango`), se respeta.
 */
export function estadoDeMedicion(m) {
  if (typeof m?.dentroDeRango === 'boolean') return m.dentroDeRango ? 'dentro' : 'fuera'
  const [min, max] = BPM_ESPERADO[m?.categoria] || BPM_ESPERADO.reposo
  const bpm = Number(m?.bpm)
  const spo2 = Number(m?.spo2)
  if (!Number.isFinite(bpm)) return 'fuera'
  const bpmOk = bpm >= min && bpm <= max
  const spo2Ok = !Number.isFinite(spo2) || spo2 >= SPO2_MINIMA
  return bpmOk && spo2Ok ? 'dentro' : 'fuera'
}

/** Deja solo mediciones públicas y les agrega el campo `estado`. */
export function prepararGaleria(lista) {
  return (Array.isArray(lista) ? lista : [])
    .filter((m) => m && m.origen === 'publica')
    .map((m) => ({ ...m, estado: estadoDeMedicion(m) }))
}

/** Filtra por actividad, edad y estado. 'todas' (o vacío) no restringe. */
export function filtrarGaleria(lista, { actividad = 'todas', edad = 'todas', estado = 'todas' } = {}) {
  return (lista || []).filter((m) => {
    if (actividad !== 'todas' && m.categoria !== actividad) return false
    if (edad !== 'todas' && m.rangoEdad !== edad) return false
    if (estado !== 'todas' && (m.estado || estadoDeMedicion(m)) !== estado) return false
    return true
  })
}

/** Cuántas mediciones hay por valor de cada filtro, para mostrarlo junto a las opciones. */
export function contarPorFiltro(lista) {
  const cuenta = { actividad: {}, edad: {}, estado: {} }
  for (const m of lista || []) {
    cuenta.actividad[m.categoria] = (cuenta.actividad[m.categoria] || 0) + 1
    cuenta.edad[m.rangoEdad] = (cuenta.edad[m.rangoEdad] || 0) + 1
    const e = m.estado || estadoDeMedicion(m)
    cuenta.estado[e] = (cuenta.estado[e] || 0) + 1
  }
  return cuenta
}
