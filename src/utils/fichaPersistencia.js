/**
 * Lógica pura de persistencia de la ficha del paciente (RF03): fusionar cambios sin perder campos y elegir
 * cuál de varias filas es la ficha vigente. Sin red ni almacenamiento, para poder probarla en Node.
 */
import { calcularEdad } from './edad.js'

/** Copia solo los campos con valor (ni undefined ni null): un objeto parcial no borra lo ya guardado. */
export function sinVacios(obj) {
  const salida = {}
  for (const [k, v] of Object.entries(obj || {})) {
    if (v !== undefined && v !== null) salida[k] = v
  }
  return salida
}

/** Parte del estado actual completo y le aplica los cambios: nunca se pierde un campo que el formulario no envió. */
export function fusionarFicha(actual, cambios) {
  return { ...sinVacios(actual), ...sinVacios(cambios) }
}

/**
 * Recalcula `edad` desde `fechaNacimiento` si existe (así la edad avanza sola con los cumpleaños);
 * en fichas antiguas sin fecha se conserva la edad guardada.
 */
export function aplicarEdadCalculada(ficha, hoy = new Date()) {
  const calculada = ficha?.fechaNacimiento ? calcularEdad(ficha.fechaNacimiento, hoy) : null
  return calculada === null ? { ...ficha } : { ...ficha, edad: calculada }
}

/** Una ficha es utilizable cuando tiene los tres datos obligatorios del RF03. */
export function fichaCompleta(f) {
  return Boolean(f && f.nombre && f.edad && f.nivelEstres)
}

/** Campos que el usuario puede cambiar en la ficha (todo lo demás son metadatos). */
const CAMPOS_FICHA = ['nombre', 'fechaNacimiento', 'nivelEstres', 'suenoHoras', 'suenoCalidad', 'cafeina', 'medicacionTipo',
  'medicacionDetalle', 'medicacion', 'actividadPrevia', 'actividadId', 'condicionSalud', 'observaciones']

const canon = (v) => (v === undefined || v === null ? '' : typeof v === 'string' ? v.trim() : String(v))

/**
 * ¿Dos fichas tienen el mismo contenido? Ignora metadatos (id, fechas, origen). Con fecha de nacimiento la edad
 * se deriva de ella; sin fecha (ficha antigua) se compara la edad.
 */
export function fichaIgual(a, b) {
  if (!a || !b) return false
  if (!CAMPOS_FICHA.every(k => canon(a[k]) === canon(b[k]))) return false
  return a.fechaNacimiento ? true : canon(a.edad) === canon(b.edad)
}

const marca = (f) => {
  const t = Date.parse(f?.actualizadoEn || f?.creadoEn || '')
  return Number.isNaN(t) ? 0 : t
}

/**
 * Elige la ficha vigente.
 *  - filas: filas del servidor de la más nueva a la más antigua, cada una { id, nombre, edad, creadoEn, factores }
 *    con `factores` = {} si no se pudo descifrar.
 *  - local: copia de trabajo de la pestaña (o null).
 * Reglas:
 *  1. La primera fila LEGIBLE (con factores) es la del servidor: una fila ilegible más nueva no oculta una válida.
 *  2. Si la copia local está pendiente de sincronizar y es más nueva que la fila elegida, gana la local
 *     (el usuario la guardó pero el servidor no la recibió).
 *  3. Si ninguna fila es legible pero la copia local es de una de ellas, se usa la local (tiene todos los campos).
 *  4. Si no hay nada legible se devuelve la fila más nueva con lo que tiene (nombre y edad), marcada `incompleta`.
 */
export function elegirFichaVigente(filas, local, hoy = new Date()) {
  const lista = Array.isArray(filas) ? filas : []
  const legible = lista.find(f => f && f.factores && Object.keys(f.factores).length > 0)

  const desdeFila = (f) => aplicarEdadCalculada({
    ...f.factores,
    id: f.id,
    nombre: f.nombre,
    edad: f.edad,
    creadoEn: f.creadoEn,
    actualizadoEn: f.factores?.actualizadoEn || f.creadoEn,
    origen: 'supabase'
  }, hoy)

  if (legible) {
    if (local?.pendienteSync && marca(local) > marca({ creadoEn: legible.creadoEn, actualizadoEn: legible.factores?.actualizadoEn })) {
      return { ...aplicarEdadCalculada(local, hoy), origen: 'local', estadoLectura: 'completa' }
    }
    // La copia de la pestaña es de una fila MÁS NUEVA que ahora no se puede leer (otra clave, sesión...): se usa la copia
    // completa en vez de retroceder a una ficha anterior con el estrés viejo.
    if (local && !local.pendienteSync && local.id && local.id !== legible.id
        && lista.some(f => f.id === local.id) && fichaCompleta(local)) {
      return { ...aplicarEdadCalculada(local, hoy), origen: 'supabase_cache', estadoLectura: 'completa' }
    }
    return { ...desdeFila(legible), estadoLectura: 'completa' }
  }

  if (local && (local.pendienteSync || lista.some(f => f.id === local.id))) {
    return { ...aplicarEdadCalculada(local, hoy), origen: local.id && !local.pendienteSync ? 'supabase_cache' : 'local', estadoLectura: 'completa' }
  }

  if (lista.length > 0) {
    const f = lista[0]
    return { ...desdeFila({ ...f, factores: {} }), incompleta: true, estadoLectura: 'incompleta' }
  }

  return local ? { ...aplicarEdadCalculada(local, hoy), origen: local.id ? 'supabase_cache' : 'local', estadoLectura: 'completa' } : null
}

/**
 * ¿Hay que pedir la fecha de nacimiento? Solo si de verdad no existe ningún dato de edad.
 *  - 'registrada': hay fecha guardada. No se vuelve a pedir ni se muestra ningún aviso.
 *  - 'solo_edad' : ficha antigua con edad válida y sin fecha. Se puede continuar; la fecha es solo una sugerencia discreta.
 *  - 'falta'     : no hay ni fecha ni edad válida: ahí sí se pide.
 */
export function estadoFechaNacimiento(ficha) {
  if (ficha?.fechaNacimiento && calcularEdad(ficha.fechaNacimiento) !== null) return 'registrada'
  const e = Number(ficha?.edad)
  return Number.isInteger(e) && e >= 18 && e <= 120 ? 'solo_edad' : 'falta'
}
