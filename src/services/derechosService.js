/**
 * Derechos del titular (RF58, RF89, RF90) y gestión de incidentes y brechas (RF73, RF92).
 * ISO 27001 A.5.34 (privacidad) y A.5.24–A.5.26 (incidentes).
 *
 * Todo pasa por la sesión de la persona y por la RLS de la base: cada quien ve solo sus solicitudes y
 * solo el administrador ve las de todos y los incidentes. Las consultas piden únicamente las columnas
 * que cada pantalla necesita (minimización de datos).
 */
import { supabase } from './supabase.js'

export const TIPOS_DERECHO = [
  { valor: 'acceso', texto: 'Acceso: saber qué datos tuyos tratamos' },
  { valor: 'rectificacion', texto: 'Rectificación: corregir un dato incorrecto' },
  { valor: 'supresion', texto: 'Supresión: borrar mis datos' },
  { valor: 'oposicion', texto: 'Oposición: oponerme a un uso de mis datos' },
  { valor: 'portabilidad', texto: 'Portabilidad: recibir mis datos en un archivo' }
]

export const ESTADOS_SOLICITUD = {
  recibida: 'Recibida',
  en_proceso: 'En proceso',
  resuelta: 'Resuelta',
  rechazada: 'Rechazada'
}

export const SEVERIDADES = ['baja', 'media', 'alta', 'critica']
export const ESTADOS_INCIDENTE = { abierto: 'Abierto', en_analisis: 'En análisis', contenido: 'Contenido', resuelto: 'Resuelto', cerrado: 'Cerrado' }

const LARGO_DETALLE = 1000

/** Días que faltan para el plazo de respuesta (negativo si ya venció). */
export function diasParaVencer(venceEn, ahora = new Date()) {
  const ms = new Date(venceEn).getTime() - ahora.getTime()
  return Number.isNaN(ms) ? null : Math.ceil(ms / 86400000)
}

/** Texto de plazo para mostrar: «Vence en 12 días», «Vence hoy» o «Vencida hace 3 días». */
export function textoPlazo(venceEn, estado, ahora = new Date()) {
  if (estado === 'resuelta' || estado === 'rechazada') return ''
  const d = diasParaVencer(venceEn, ahora)
  if (d === null) return ''
  if (d < 0) return `Vencida hace ${-d} día${d === -1 ? '' : 's'}`
  if (d === 0) return 'Vence hoy'
  return `Vence en ${d} día${d === 1 ? '' : 's'}`
}

/** Valida el formulario de una solicitud antes de enviarla. */
export function validarSolicitud({ tipo, detalle }) {
  if (!TIPOS_DERECHO.some(t => t.valor === tipo)) return 'Elige el derecho que quieres ejercer.'
  if (String(detalle || '').length > LARGO_DETALLE) return `El detalle no puede superar los ${LARGO_DETALLE} caracteres.`
  if ((tipo === 'rectificacion' || tipo === 'oposicion') && String(detalle || '').trim().length < 10) {
    return 'Cuéntanos qué dato quieres corregir o a qué uso te opones (mínimo 10 caracteres).'
  }
  return ''
}

async function usuarioActual() {
  const { data: { session } } = await supabase.auth.getSession()
  return session?.user ? { id: session.user.id, token: session.access_token } : null
}

export const derechosService = {
  // ---------------------------------------------------------------- Titular
  async crearSolicitud({ tipo, detalle }) {
    const error = validarSolicitud({ tipo, detalle })
    if (error) return { ok: false, error }
    const u = await usuarioActual()
    if (!u) return { ok: false, error: 'Inicia sesión para enviar una solicitud.' }
    const { error: e } = await supabase.from('solicitudes_derechos')
      .insert({ usuario_id: u.id, tipo, detalle: String(detalle || '').trim() || null })
    if (e) return { ok: false, error: e.message || 'No se pudo enviar la solicitud.' }
    return { ok: true }
  },

  async misSolicitudes() {
    const u = await usuarioActual()
    if (!u) return []
    const { data } = await supabase.from('solicitudes_derechos')
      .select('id, tipo, estado, detalle, recibida_en, vence_en, resuelta_en, respuesta')
      .eq('usuario_id', u.id)
      .order('recibida_en', { ascending: false })
      .limit(50)
    return data || []
  },

  /** Descarga completa («mis datos»). El servidor descifra la ficha de salud porque el navegador no tiene claves. */
  async descargarMisDatos() {
    const u = await usuarioActual()
    if (!u) return { ok: false, error: 'Inicia sesión para descargar tus datos.' }
    try {
      const resp = await fetch('/api/derechos/exportar', { method: 'POST', headers: { Authorization: `Bearer ${u.token}` } })
      const json = await resp.json().catch(() => ({}))
      if (!resp.ok || !json.ok) return { ok: false, error: json.error || 'No se pudieron descargar tus datos.' }
      const blob = new Blob([JSON.stringify(json.exportacion, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = 'mis-datos-sensor-pulso.json'
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
      return { ok: true }
    } catch {
      return { ok: false, error: 'No hay conexión con el servidor. Inténtalo más tarde.' }
    }
  },

  async revocarConsentimiento() {
    const { error } = await supabase.rpc('revocar_consentimiento')
    return error ? { ok: false, error: 'No se pudo revocar el consentimiento.' } : { ok: true }
  },

  async eliminarMisDatos() {
    const { error } = await supabase.rpc('eliminar_mis_datos')
    return error ? { ok: false, error: 'No se pudieron eliminar tus datos.' } : { ok: true }
  },

  // ---------------------------------------------------------------- Administración (la RLS exige es_admin)
  async solicitudesAdmin({ soloAbiertas = true } = {}) {
    let q = supabase.from('solicitudes_derechos')
      .select('id, tipo, estado, detalle, recibida_en, vence_en, respuesta, perfil:perfiles!usuario_id(nombre, correo)')
      .order('vence_en', { ascending: true })
      .limit(200)
    if (soloAbiertas) q = q.in('estado', ['recibida', 'en_proceso'])
    const { data, error } = await q
    return error ? [] : (data || [])
  },

  async resolverSolicitud(id, estado, respuesta) {
    if (!Object.keys(ESTADOS_SOLICITUD).includes(estado)) return { ok: false, error: 'Estado no válido.' }
    if ((estado === 'resuelta' || estado === 'rechazada') && !String(respuesta || '').trim()) {
      return { ok: false, error: 'Escribe la respuesta para la persona.' }
    }
    const { error } = await supabase.from('solicitudes_derechos').update({ estado, respuesta: String(respuesta || '').trim() || null }).eq('id', id)
    return error ? { ok: false, error: error.message } : { ok: true }
  },

  async incidentes() {
    const { data, error } = await supabase.from('incidentes')
      .select('id, titulo, descripcion, severidad, estado, afecta_datos_personales, abierto_en, cerrado_en, lecciones, brecha:brechas(id, afectados_estimados, datos_comprometidos, medidas, afectados_notificados_en, autoridad_notificada_en)')
      .order('abierto_en', { ascending: false })
      .limit(100)
    return error ? [] : (data || [])
  },

  async crearIncidente({ titulo, descripcion, severidad, afectaDatosPersonales }) {
    const t = String(titulo || '').trim()
    if (t.length < 3 || t.length > 200) return { ok: false, error: 'El título debe tener entre 3 y 200 caracteres.' }
    if (!SEVERIDADES.includes(severidad)) return { ok: false, error: 'Elige la severidad.' }
    const { error } = await supabase.from('incidentes').insert({
      titulo: t, descripcion: String(descripcion || '').trim() || null, severidad, afecta_datos_personales: Boolean(afectaDatosPersonales)
    })
    return error ? { ok: false, error: error.message } : { ok: true }
  },

  async actualizarIncidente(id, cambios) {
    const permitido = {}
    if (cambios.estado) {
      if (!Object.keys(ESTADOS_INCIDENTE).includes(cambios.estado)) return { ok: false, error: 'Estado no válido.' }
      permitido.estado = cambios.estado
    }
    if (typeof cambios.lecciones === 'string') permitido.lecciones = cambios.lecciones.trim() || null
    if (typeof cambios.afectaDatosPersonales === 'boolean') permitido.afecta_datos_personales = cambios.afectaDatosPersonales
    const { error } = await supabase.from('incidentes').update(permitido).eq('id', id)
    return error ? { ok: false, error: error.message } : { ok: true }
  },

  /** Registra o actualiza la brecha formal del incidente (una por incidente). */
  async guardarBrecha(incidenteId, { afectadosEstimados, datosComprometidos, medidas, notificarAfectados, notificarAutoridad }) {
    const fila = { incidente_id: incidenteId, medidas: String(medidas || '').trim() || null, datos_comprometidos: String(datosComprometidos || '').trim() || null }
    if (afectadosEstimados !== '' && afectadosEstimados != null) {
      const n = Number(afectadosEstimados)
      if (!Number.isInteger(n) || n < 0) return { ok: false, error: 'Los afectados estimados deben ser un número entero.' }
      fila.afectados_estimados = n
    }
    const ahora = new Date().toISOString()
    if (notificarAfectados) fila.afectados_notificados_en = ahora
    if (notificarAutoridad) fila.autoridad_notificada_en = ahora
    const { error } = await supabase.from('brechas').upsert(fila, { onConflict: 'incidente_id' })
    return error ? { ok: false, error: error.message } : { ok: true }
  }
}
