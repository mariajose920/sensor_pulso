/**
 * Servicio de la política de retención (RF60).
 *
 * Lee el estado y la vista previa desde funciones del servidor (solo administrador con MFA), cambia plazos,
 * aplica la retención a mano y lista las ejecuciones anteriores desde la auditoría. Las funciones puras
 * (normalizar, resumir) no tocan la red, para poder probarlas.
 */

import { supabase } from './supabase.js'
import { infoPolitica, formatearPlazo, validarDias, describirHorario } from '../data/retencion.js'

export function normalizarPolitica(raw = {}) {
  const info = infoPolitica(raw.tabla)
  const dias = Number(raw.dias) || 0
  return Object.freeze({
    tabla: String(raw.tabla || ''),
    nombre: info.nombre,
    clase: info.clase,
    detalle: info.detalle,
    dias,
    plazoTexto: formatearPlazo(dias),
    accion: raw.accion === 'anonimizar' ? 'anonimizar' : 'borrar',
    activa: Boolean(raw.activa),
    pendientes: Math.max(0, Number(raw.pendientes) || 0),
    ultimaEjecucion: raw.ultima_ejecucion || null,
    ultimasFilas: raw.ultimas_filas === null || raw.ultimas_filas === undefined ? null : Number(raw.ultimas_filas)
  })
}

/** Totales para los indicadores del panel. */
export function resumirPoliticas(politicas = []) {
  const activas = politicas.filter(p => p.activa)
  const ejecutadas = politicas.filter(p => p.ultimaEjecucion).map(p => new Date(p.ultimaEjecucion).getTime())
  return {
    total: politicas.length,
    activas: activas.length,
    pendientes: activas.reduce((s, p) => s + p.pendientes, 0),
    ultimaEjecucion: ejecutadas.length ? new Date(Math.max(...ejecutadas)).toISOString() : null
  }
}

export function normalizarEstado(raw = {}) {
  return {
    cronDisponible: Boolean(raw?.cron_disponible),
    programada: Boolean(raw?.programada),
    horario: raw?.horario || '',
    horarioTexto: describirHorario(raw?.horario)
  }
}

/** Una ejecución guardada en la auditoría: cuándo, quién la pidió y cuántas filas por tabla. */
export function normalizarEjecucion(raw = {}) {
  const det = raw.detalle || {}
  const porTabla = Object.entries(det.por_tabla || {})
    .map(([tabla, filas]) => ({ tabla, nombre: infoPolitica(tabla).nombre, filas: Number(filas) || 0 }))
    .sort((a, b) => b.filas - a.filas || a.nombre.localeCompare(b.nombre, 'es'))
  return Object.freeze({
    id: String(raw.id),
    fecha: raw.ocurrio_en,
    origen: det.origen === 'manual' ? 'manual' : 'automatica',
    filas: Number(det.filas) || 0,
    porTabla
  })
}

async function llamar(nombre, args) {
  try {
    const { data, error } = await supabase.rpc(nombre, args)
    if (error) return { ok: false, error: error.message || 'No se pudo completar la operación' }
    return { ok: true, data }
  } catch (err) {
    return { ok: false, error: err?.message || 'Sin conexión con el servidor' }
  }
}

/** Políticas con cuántos registros están pendientes hoy. */
export async function listarPoliticas() {
  const res = await llamar('vista_previa_retencion')
  if (!res.ok) return { ok: false, politicas: [], error: res.error }
  return { ok: true, politicas: (res.data || []).map(normalizarPolitica) }
}

export async function obtenerEstadoRetencion() {
  const res = await llamar('estado_retencion')
  if (!res.ok) return { ok: false, estado: normalizarEstado({}), error: res.error }
  return { ok: true, estado: normalizarEstado(res.data || {}) }
}

/** Cambia el plazo y si está activa. El servidor lo valida y lo deja en la auditoría. */
export async function actualizarPolitica({ tabla, dias, activa }) {
  const v = validarDias(dias)
  if (!v.ok) return { ok: false, error: v.error }
  return llamar('actualizar_politica_retencion', { p_tabla: tabla, p_dias: v.dias, p_activa: Boolean(activa) })
}

/** Aplica ahora las políticas activas. Devuelve cuántos registros se eliminaron o anonimizaron. */
export async function aplicarRetencionAhora() {
  const res = await llamar('ejecutar_retencion_ahora')
  if (!res.ok) return res
  return { ok: true, filas: Number(res.data) || 0 }
}

/** Últimas ejecuciones (automáticas y manuales), leídas del registro de auditoría. */
export async function listarEjecuciones(limite = 8) {
  try {
    const { data, error } = await supabase
      .from('auditoria')
      .select('id, ocurrio_en, detalle')
      .eq('accion', 'retencion')
      .order('ocurrio_en', { ascending: false })
      .limit(limite)
    if (error) return { ok: false, ejecuciones: [], error: error.message }
    return { ok: true, ejecuciones: (data || []).map(normalizarEjecucion) }
  } catch (err) {
    return { ok: false, ejecuciones: [], error: err?.message || 'Sin conexión con el servidor' }
  }
}
