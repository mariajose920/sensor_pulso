/**
 * Servicio de rangos de BPM y SpO₂ por actividad y edad (RF19)
 *
 * - Rangos globales (tabla `rangos`): los edita el administrador (RLS rangos_admin).
 * - Rangos personales (tabla `rangos_personales`): los edita el profesor con permiso `editar_rangos`
 *   y solo valen para su cuenta.
 * - Cambio global pedido por un profesor: propuesta (`propuestas_cambio`, tipo 'rango') que el
 *   administrador aprueba o rechaza con la función `resolver_propuesta`.
 *
 * Valores orientativos de uso educativo; no son criterios clínicos.
 */
import { supabase } from './supabase'

export const LIMITES = {
  edadMin: 0,
  edadMax: 120,
  bpmMin: 20,
  bpmMax: 250,
  spo2Min: 50,
  spo2Max: 100
}

/**
 * Valida un rango antes de enviarlo a la base (espejo de los `check` de la tabla).
 * Devuelve la lista de errores; vacía si es válido.
 */
export function validarRango(r) {
  const errores = []
  const num = (v) => (v === '' || v === null || v === undefined ? NaN : Number(v))
  const edadMin = num(r.edad_min), edadMax = num(r.edad_max)
  const bpmMin = num(r.bpm_min), bpmMax = num(r.bpm_max)
  const spo2Min = num(r.spo2_min), spo2Max = num(r.spo2_max)

  if (!r.actividad_id) errores.push('Elige una actividad.')
  for (const [nombre, v] of [['Edad mínima', edadMin], ['Edad máxima', edadMax], ['BPM mínimo', bpmMin],
    ['BPM máximo', bpmMax], ['SpO₂ mínimo', spo2Min], ['SpO₂ máximo', spo2Max]]) {
    if (!Number.isInteger(v)) errores.push(`${nombre} debe ser un número entero.`)
  }
  if (errores.length) return errores

  if (edadMin < LIMITES.edadMin || edadMax > LIMITES.edadMax) {
    errores.push(`La edad debe estar entre ${LIMITES.edadMin} y ${LIMITES.edadMax} años.`)
  }
  if (edadMax < edadMin) errores.push('La edad máxima no puede ser menor que la mínima.')
  if (bpmMin < LIMITES.bpmMin || bpmMax > LIMITES.bpmMax) {
    errores.push(`Los BPM deben estar entre ${LIMITES.bpmMin} y ${LIMITES.bpmMax}.`)
  }
  if (bpmMax <= bpmMin) errores.push('El BPM máximo debe ser mayor que el mínimo.')
  if (spo2Min < LIMITES.spo2Min || spo2Max > LIMITES.spo2Max) {
    errores.push(`El SpO₂ debe estar entre ${LIMITES.spo2Min} y ${LIMITES.spo2Max} %.`)
  }
  if (spo2Max < spo2Min) errores.push('El SpO₂ máximo no puede ser menor que el mínimo.')
  return errores
}

/** Convierte el formulario en el objeto que se guarda (todo entero). */
function normalizar(r) {
  return {
    actividad_id: Number(r.actividad_id),
    edad_min: Number(r.edad_min),
    edad_max: Number(r.edad_max),
    bpm_min: Number(r.bpm_min),
    bpm_max: Number(r.bpm_max),
    spo2_min: Number(r.spo2_min),
    spo2_max: Number(r.spo2_max)
  }
}

/**
 * Elige el rango que corresponde a una actividad y una edad.
 * Un rango personal tiene prioridad sobre el global. Devuelve null si no hay ninguno.
 */
export function rangoParaActividadYEdad({ globales = [], personales = [], actividadId, edad }) {
  const coincide = (r) => r.actividad_id === actividadId && edad >= r.edad_min && edad <= r.edad_max
  return personales.find(coincide) || globales.find((r) => r.vigente !== false && coincide(r)) || null
}

const fallo = (error, texto) => ({ success: false, error: error?.message || texto })

export async function listarActividades() {
  const { data, error } = await supabase
    .from('actividades')
    .select('id, codigo, nombre, descripcion')
    .eq('activa', true)
    .order('id')
  if (error) return fallo(error, 'No se pudieron cargar las actividades.')
  return { success: true, data }
}

/** Rangos globales. Por defecto solo los vigentes; el administrador puede pedir todos. */
export async function listarRangos({ incluirInactivos = false } = {}) {
  let q = supabase
    .from('rangos')
    .select('id, actividad_id, edad_min, edad_max, bpm_min, bpm_max, spo2_min, spo2_max, vigente, actualizado_en')
    .order('actividad_id')
    .order('edad_min')
  if (!incluirInactivos) q = q.eq('vigente', true)
  const { data, error } = await q
  if (error) return fallo(error, 'No se pudieron cargar los rangos.')
  return { success: true, data }
}

/** Administrador: crea un rango global. */
export async function crearRango(rango, usuarioId) {
  const errores = validarRango(rango)
  if (errores.length) return { success: false, error: errores.join(' ') }
  const { data, error } = await supabase
    .from('rangos')
    .insert({ ...normalizar(rango), actualizado_por: usuarioId })
    .select()
    .single()
  if (error) return fallo(error, 'No se pudo crear el rango.')
  return { success: true, data }
}

/** Administrador: edita un rango global. */
export async function actualizarRango(id, rango, usuarioId) {
  const errores = validarRango(rango)
  if (errores.length) return { success: false, error: errores.join(' ') }
  const { data, error } = await supabase
    .from('rangos')
    .update({ ...normalizar(rango), actualizado_por: usuarioId, actualizado_en: new Date().toISOString() })
    .eq('id', id)
    .select()
    .single()
  if (error) return fallo(error, 'No se pudo actualizar el rango.')
  return { success: true, data }
}

/** Administrador: desactiva o reactiva un rango (no se borra, queda en la auditoría). */
export async function cambiarVigencia(id, vigente, usuarioId) {
  const { error } = await supabase
    .from('rangos')
    .update({ vigente, actualizado_por: usuarioId, actualizado_en: new Date().toISOString() })
    .eq('id', id)
  if (error) return fallo(error, 'No se pudo cambiar el estado del rango.')
  return { success: true }
}

/** Profesor: sus rangos personales. */
export async function listarRangosPersonales(profesorId) {
  const { data, error } = await supabase
    .from('rangos_personales')
    .select('id, actividad_id, edad_min, edad_max, bpm_min, bpm_max, spo2_min, spo2_max, actualizado_en')
    .eq('profesor_id', profesorId)
    .order('actividad_id')
    .order('edad_min')
  if (error) return fallo(error, 'No se pudieron cargar tus rangos personales.')
  return { success: true, data }
}

/** Profesor: crea (sin `id`) o edita (con `id`) un rango personal. */
export async function guardarRangoPersonal(profesorId, rango, id = null) {
  const errores = validarRango(rango)
  if (errores.length) return { success: false, error: errores.join(' ') }
  const payload = { ...normalizar(rango), profesor_id: profesorId }
  const q = id
    ? supabase.from('rangos_personales').update(payload).eq('id', id)
    : supabase.from('rangos_personales').insert(payload)
  const { data, error } = await q.select().single()
  if (error?.code === '23505') {
    return { success: false, error: 'Ya tienes un rango personal para esa actividad y ese tramo de edad.' }
  }
  if (error) return fallo(error, 'No se pudo guardar el rango.')
  return { success: true, data }
}

/** Profesor: vuelve al rango global quitando su rango personal. */
export async function eliminarRangoPersonal(id) {
  const { error } = await supabase.from('rangos_personales').delete().eq('id', id)
  if (error) return fallo(error, 'No se pudo quitar el rango personal.')
  return { success: true }
}

/**
 * Profesor: propone cambiar un rango global (o crear uno nuevo si `rangoId` es null).
 * Queda pendiente hasta que el administrador lo resuelva.
 */
export async function proponerCambioRango({ profesorId, rangoId = null, rango, motivo }) {
  const errores = validarRango(rango)
  if (errores.length) return { success: false, error: errores.join(' ') }
  if (!motivo || !motivo.trim()) return { success: false, error: 'Explica el motivo de la propuesta.' }
  const { data, error } = await supabase
    .from('propuestas_cambio')
    .insert({
      proponente_id: profesorId,
      tipo: 'rango',
      entidad_id: rangoId,
      propuesta: normalizar(rango),
      motivo: motivo.trim()
    })
    .select()
    .single()
  if (error) return fallo(error, 'No se pudo enviar la propuesta.')
  return { success: true, data }
}

/** Propuestas de rangos: el administrador ve todas; el profesor, solo las suyas (RLS). */
export async function listarPropuestasRango({ soloPendientes = false } = {}) {
  let q = supabase
    .from('propuestas_cambio')
    .select('id, proponente_id, entidad_id, propuesta, motivo, estado, creado_en')
    .eq('tipo', 'rango')
    .order('creado_en', { ascending: false })
  if (soloPendientes) q = q.eq('estado', 'pendiente')
  const { data, error } = await q
  if (error) return fallo(error, 'No se pudieron cargar las propuestas.')
  return { success: true, data }
}

/** Administrador: aprueba o rechaza una propuesta (aplica el cambio y deja auditoría). */
export async function resolverPropuestaRango(propuestaId, aprobar) {
  const { error } = await supabase.rpc('resolver_propuesta', { p_propuesta: propuestaId, p_aprobar: aprobar })
  if (error) return fallo(error, 'No se pudo resolver la propuesta.')
  return { success: true }
}
