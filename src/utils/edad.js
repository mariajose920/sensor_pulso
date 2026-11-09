/**
 * Edad a partir de la fecha de nacimiento (RF03). Funciones puras, sin red ni DOM.
 *
 * Regla de negocio: solo se miden personas mayores de edad, de 18 a 100 años.
 * Las fichas antiguas guardaron solo la edad (18 a 120): para ellas se conserva ese rango (EDAD_MAXIMA_LEGADO).
 */
export const EDAD_MINIMA = 18
export const EDAD_MAXIMA = 100
export const EDAD_MAXIMA_LEGADO = 120

const FORMATO_ISO = /^(\d{4})-(\d{2})-(\d{2})$/

/** Separa «AAAA-MM-DD» en números. Devuelve null si el formato o el día no existen (p. ej. 2023-02-29). */
export function parsearFechaIso(fechaIso) {
  if (typeof fechaIso !== 'string') return null
  const m = FORMATO_ISO.exec(fechaIso.trim())
  if (!m) return null
  const anio = Number(m[1])
  const mes = Number(m[2])
  const dia = Number(m[3])
  const f = new Date(Date.UTC(anio, mes - 1, dia))
  if (f.getUTCFullYear() !== anio || f.getUTCMonth() !== mes - 1 || f.getUTCDate() !== dia) return null
  return { anio, mes, dia }
}

/** Fecha de hoy en «AAAA-MM-DD» (hora local): sirve de `max` del input type=date. */
export function fechaHoyIso(hoy = new Date()) {
  const p = (n, l = 2) => String(n).padStart(l, '0')
  return `${p(hoy.getFullYear(), 4)}-${p(hoy.getMonth() + 1)}-${p(hoy.getDate())}`
}

/**
 * Años cumplidos a `hoy`. Devuelve null si la fecha no es válida o es futura.
 * Quien nació un 29 de febrero cumple en 28-feb / 1-mar según el año: aquí cumple el 1 de marzo en años no bisiestos.
 */
export function calcularEdad(fechaIso, hoy = new Date()) {
  const f = parsearFechaIso(fechaIso)
  if (!f) return null
  const ha = hoy.getFullYear()
  const hm = hoy.getMonth() + 1
  const hd = hoy.getDate()
  if (f.anio > ha || (f.anio === ha && (f.mes > hm || (f.mes === hm && f.dia > hd)))) return null
  let edad = ha - f.anio
  if (hm < f.mes || (hm === f.mes && hd < f.dia)) edad -= 1
  return edad
}

/** Valida la fecha de nacimiento y la regla 18 a 100 años. Devuelve { valido, edad, error }. */
export function validarFechaNacimiento(fechaIso, hoy = new Date()) {
  if (fechaIso === undefined || fechaIso === null || String(fechaIso).trim() === '') {
    return { valido: false, edad: null, error: 'La fecha de nacimiento es obligatoria.' }
  }
  const f = parsearFechaIso(fechaIso)
  if (!f) {
    return { valido: false, edad: null, error: 'La fecha de nacimiento no es válida (usa el formato día/mes/año).' }
  }
  const edad = calcularEdad(fechaIso, hoy)
  if (edad === null) {
    return { valido: false, edad: null, error: 'La fecha de nacimiento no puede ser futura.' }
  }
  if (edad < EDAD_MINIMA || edad > EDAD_MAXIMA) {
    return {
      valido: false,
      edad,
      error: `Según la fecha de nacimiento la edad es ${edad} años: debe estar entre ${EDAD_MINIMA} y ${EDAD_MAXIMA} años. Solo se miden personas mayores de edad.`
    }
  }
  return { valido: true, edad, error: null }
}

/** Valida una edad numérica de fichas antiguas (18 a 120, entero). */
export function validarEdadLegado(edad) {
  const n = Number(edad)
  return Boolean(edad) && Number.isInteger(n) && n >= EDAD_MINIMA && n <= EDAD_MAXIMA_LEGADO
}

/** «34 años», «1 año» o cadena vacía si no hay edad. */
export function textoEdad(edad) {
  const n = Number(edad)
  if (!Number.isFinite(n) || n < 0) return ''
  return `${n} ${n === 1 ? 'año' : 'años'}`
}
