/**
 * Servicio del panel de administración (RF46): método de sincronización, contenidos precargados
 * y aprobación de propuestas de profesores.
 *
 * - El administrador cambia directo (RLS config_admin y lecciones_admin).
 * - El profesor con permiso (RF98) crea una propuesta en `propuestas_cambio`; el administrador la
 *   aprueba o rechaza con `resolver_propuesta`, que aplica el cambio y deja auditoría.
 * - Los rangos viven en rangosService.js (RF19).
 */
import { supabase } from './supabase'
import { LECCIONES } from '../data/lecciones.js'
import {
  METODOS_SINCRONIZACION, METODO_POR_DEFECTO, metodoValido, validarLeccion, combinarLecciones
} from '../utils/panelAdmin.js'

const fallo = (error, texto) => ({ success: false, error: error?.message || texto })

/** Método de sincronización vigente (si la base no responde, el de por defecto). */
export async function obtenerMetodoSincronizacion() {
  try {
    const { data, error } = await supabase
      .from('config_plataforma')
      .select('clave, valor')
      .in('clave', ['metodo_sincronizacion', 'metodos_sincronizacion_disponibles'])
    if (error) throw error
    const cfg = Object.fromEntries((data || []).map((f) => [f.clave, f.valor]))
    const disponibles = Array.isArray(cfg.metodos_sincronizacion_disponibles)
      ? cfg.metodos_sincronizacion_disponibles.filter((m) => m in METODOS_SINCRONIZACION)
      : Object.keys(METODOS_SINCRONIZACION)
    return { success: true, data: { metodo: metodoValido(cfg.metodo_sincronizacion, disponibles), disponibles } }
  } catch (_) {
    return { success: true, data: { metodo: METODO_POR_DEFECTO, disponibles: Object.keys(METODOS_SINCRONIZACION) }, local: true }
  }
}

/** Administrador: cambia el método de sincronización para toda la plataforma. */
export async function guardarMetodoSincronizacion(metodo, usuarioId) {
  if (!(metodo in METODOS_SINCRONIZACION)) return { success: false, error: 'Elige un método disponible.' }
  const { error } = await supabase
    .from('config_plataforma')
    .upsert({ clave: 'metodo_sincronizacion', valor: metodo, actualizado_por: usuarioId, actualizado_en: new Date().toISOString() })
  if (error) return fallo(error, 'No se pudo guardar el método de sincronización.')
  return { success: true }
}

async function crearPropuesta({ profesorId, tipo, entidadId = null, propuesta, motivo }) {
  if (!motivo || !motivo.trim()) return { success: false, error: 'Explica el motivo de la propuesta.' }
  const { data, error } = await supabase
    .from('propuestas_cambio')
    .insert({ proponente_id: profesorId, tipo, entidad_id: entidadId, propuesta, motivo: motivo.trim() })
    .select()
    .single()
  if (error) return fallo(error, 'No se pudo enviar la propuesta.')
  return { success: true, data }
}

/** Profesor: propone otro método de sincronización para todos. */
export function proponerMetodoSincronizacion({ profesorId, metodo, motivo }) {
  if (!(metodo in METODOS_SINCRONIZACION)) return Promise.resolve({ success: false, error: 'Elige un método disponible.' })
  return crearPropuesta({ profesorId, tipo: 'metodo_sync', propuesta: { metodo }, motivo })
}

/** Lecciones de la plataforma: las precargadas con los cambios aprobados por el administrador. */
export async function obtenerLeccionesPlataforma() {
  try {
    const { data, error } = await supabase
      .from('lecciones')
      .select('slug, titulo, categoria, contenido, orden, publicada')
    if (error) throw error
    return combinarLecciones(LECCIONES, data || [])
  } catch (_) {
    return LECCIONES
  }
}

/** Forma que se guarda en la columna `contenido` (jsonb) de la tabla lecciones. */
function contenidoDe(l) {
  return { resumen: String(l.resumen).trim(), minutos: Number(l.minutos), bloques: l.bloques }
}

/** Administrador: guarda los cambios de una lección precargada. */
export async function guardarLeccion(leccion, usuarioId) {
  const errores = validarLeccion(leccion)
  if (errores.length) return { success: false, error: errores.join(' ') }
  const indice = LECCIONES.findIndex((x) => x.slug === leccion.slug)
  const { error } = await supabase.from('lecciones').upsert(
    {
      slug: leccion.slug,
      titulo: leccion.titulo.trim(),
      categoria: leccion.categoria,
      contenido: contenidoDe(leccion),
      orden: Math.max(indice, 0),
      publicada: true,
      actualizado_por: usuarioId
    },
    { onConflict: 'slug' }
  )
  if (error) return fallo(error, 'No se pudo guardar la lección.')
  return { success: true }
}

/** Profesor con permiso editar_contenidos: propone cambios a una lección. */
export function proponerCambioLeccion({ profesorId, leccion, motivo }) {
  const errores = validarLeccion(leccion)
  if (errores.length) return Promise.resolve({ success: false, error: errores.join(' ') })
  const indice = LECCIONES.findIndex((x) => x.slug === leccion.slug)
  return crearPropuesta({
    profesorId,
    tipo: 'leccion',
    entidadId: leccion.slug,
    propuesta: { titulo: leccion.titulo.trim(), categoria: leccion.categoria, orden: Math.max(indice, 0), contenido: contenidoDe(leccion) },
    motivo
  })
}

/**
 * Propuestas distintas de las de rango (esas se ven en el panel de rangos, RF19).
 * El administrador ve todas; el profesor solo las suyas (RLS).
 */
export async function listarPropuestas({ soloPendientes = false } = {}) {
  let q = supabase
    .from('propuestas_cambio')
    .select('id, proponente_id, tipo, entidad_id, propuesta, motivo, estado, creado_en, revisado_en')
    .neq('tipo', 'rango')
    .order('creado_en', { ascending: false })
  if (soloPendientes) q = q.eq('estado', 'pendiente')
  const { data, error } = await q
  if (error) return fallo(error, 'No se pudieron cargar las propuestas.')
  return { success: true, data }
}

/** Administrador: aprueba o rechaza una propuesta (aplica el cambio y deja auditoría). */
export async function resolverPropuesta(propuestaId, aprobar) {
  const { error } = await supabase.rpc('resolver_propuesta', { p_propuesta: propuestaId, p_aprobar: aprobar })
  if (error) return fallo(error, 'No se pudo resolver la propuesta.')
  return { success: true }
}
