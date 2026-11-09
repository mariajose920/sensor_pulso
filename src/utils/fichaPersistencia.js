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
    actualizadoEn: f.creadoEn,
    origen: 'supabase'
  }, hoy)

  if (legible) {
    if (local?.pendienteSync && marca(local) > marca({ creadoEn: legible.creadoEn })) {
      return { ...aplicarEdadCalculada(local, hoy), origen: 'local' }
    }
    return desdeFila(legible)
  }

  if (local && (local.pendienteSync || lista.some(f => f.id === local.id))) {
    return { ...aplicarEdadCalculada(local, hoy), origen: local.id && !local.pendienteSync ? 'supabase_cache' : 'local' }
  }

  if (lista.length > 0) {
    const f = lista[0]
    return { ...desdeFila({ ...f, factores: {} }), incompleta: true }
  }

  return local ? { ...aplicarEdadCalculada(local, hoy), origen: local.id ? 'supabase_cache' : 'local' } : null
}
