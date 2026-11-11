// RF30: guardar mediciones en la cuenta (Supabase) y consultar el historial.
//
// La seguridad la da el RLS de la tabla `mediciones` (cada usuario ve y escribe solo lo suyo, RNF12)
// y el trigger que exige un consentimiento vigente para medir con sensor (RF04, RF59).
import { supabase } from './supabase'
import {
  construirMedicion,
  clasificarErrorGuardado,
  resumirParaHistorial,
  MENSAJES_GUARDADO
} from '../utils/medicion.js'
import { listarPendientes, agregarPendiente, quitarPendiente } from '../pwa/medicionesPendientes.js'
import { guardarMedicionVista, listarMedicionesVistas } from '../pwa/medicionesOffline.js'
import { clasificarErrorPublicacion, mensajeErrorPublicacion, MENSAJES_TERMINAR } from '../utils/terminarMedicion.js'

export const TAMANO_PAGINA = 20

/** ¿El error dice que la columna no existe en la tabla (base sin la migración que la crea)? */
export function esErrorColumnaFaltante(error, columna) {
  if (!error) return false
  const texto = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  const codigo = String(error.code || '')
  return (codigo === 'PGRST204' || codigo === '42703' || texto.includes('schema cache') || texto.includes('does not exist'))
    && texto.includes(String(columna).toLowerCase())
}

/**
 * Inserta una fila de medición. Si la base todavía no tiene la columna `id_cliente` (RF30, migración
 * 20261102000100) se reintenta sin ella: la medición se guarda igual, solo sin la protección contra duplicados.
 */
async function insertarMedicion(fila) {
  let r = await supabase.from('mediciones').insert(fila).select('id').single()
  if (r.error && 'id_cliente' in fila && esErrorColumnaFaltante(r.error, 'id_cliente')) {
    const { id_cliente: _omitido, ...sinIdCliente } = fila
    r = await supabase.from('mediciones').insert(sinIdCliente).select('id').single()
  }
  return r
}

async function buscarIdPorIdCliente(idCliente) {
  try {
    const { data, error } = await supabase.from('mediciones').select('id').eq('id_cliente', idCliente).maybeSingle()
    return error ? undefined : (data?.id || undefined)
  } catch {
    return undefined
  }
}

function nuevoIdCliente() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  // Respaldo para navegadores sin crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

async function usuarioActualId() {
  try {
    const { data } = await supabase.auth.getSession()
    return data?.session?.user?.id || null
  } catch {
    return null
  }
}

/**
 * Guarda una medición en la cuenta del usuario con sesión.
 * @param {object} datos ver construirMedicion() en utils/medicion.js (sin usuarioId)
 * @returns {Promise<{ok: boolean, estado: 'guardada'|'pendiente'|'rechazada', motivo?: string, mensaje: string, id?: string}>}
 */
export async function guardarMedicion(datos) {
  const usuarioId = await usuarioActualId()
  const idCliente = datos.idCliente || nuevoIdCliente()
  const armada = construirMedicion({ ...datos, usuarioId, idCliente })

  if (!armada.ok) {
    return { ok: false, estado: 'rechazada', motivo: armada.motivo, mensaje: armada.mensaje }
  }

  try {
    const { data, error } = await insertarMedicion(armada.fila)

    if (error) throw error
    return { ok: true, estado: 'guardada', id: data?.id, mensaje: 'Medición guardada en tu historial.' }
  } catch (error) {
    const motivo = clasificarErrorGuardado(error)

    if (motivo === 'duplicada') {
      // Se recupera el id de la medición ya guardada para poder publicarla (si la base no tiene id_cliente, no hay duplicados)
      return { ok: true, estado: 'guardada', id: await buscarIdPorIdCliente(idCliente), mensaje: 'Esta medición ya estaba guardada en tu historial.' }
    }
    if (motivo === 'conexion') {
      // RNF03: sin internet se conserva en el dispositivo y se reenvía después
      const guardada = agregarPendiente(armada.fila)
      return guardada
        ? { ok: true, estado: 'pendiente', motivo, mensaje: MENSAJES_GUARDADO.conexion }
        : { ok: false, estado: 'rechazada', motivo: 'generico', mensaje: MENSAJES_GUARDADO.generico }
    }
    return {
      ok: false, estado: 'rechazada', motivo,
      mensaje: MENSAJES_GUARDADO[motivo] || MENSAJES_GUARDADO.generico,
      // Para no esconder la causa real cuando el motivo es genérico (ayuda a quien administra la base)
      detalle: motivo === 'generico' ? (error?.message || null) : null
    }
  }
}

/**
 * RF31 + RF57: publica una medición ya guardada. La base (función `publicar_medicion`) exige sesión, el permiso
 * de RF98 al profesor, un consentimiento vigente y una medición de sensor, y guarda solo una vista anonimizada.
 * La confirmación explícita (`p_confirmar`) la da quien pulsó «Sí, publicar» en el diálogo de la pantalla.
 * @returns {Promise<{ok: boolean, motivo?: string, mensaje: string, publicacionId?: string}>}
 */
export async function publicarMedicion(medicionId, titulo = null) {
  if (!medicionId) return { ok: false, motivo: 'sin_id', mensaje: MENSAJES_TERMINAR.publicar_sin_id }
  try {
    const { data, error } = await supabase.rpc('publicar_medicion', {
      p_medicion: medicionId,
      p_confirmar: true,
      p_titulo: titulo
    })
    if (error) throw error
    return { ok: true, publicacionId: data || undefined, mensaje: MENSAJES_TERMINAR.guardada_publicada }
  } catch (error) {
    const motivo = clasificarErrorPublicacion(error)
    return { ok: false, motivo, mensaje: mensajeErrorPublicacion(motivo) }
  }
}

/**
 * Lo que la base dice de la sesión y del consentimiento de quien va a publicar (solo lectura, con su propia sesión).
 * Cada valor es true/false, o null si no se pudo comprobar (sin conexión o error): en ese caso decide la base al publicar.
 * @returns {Promise<{sesionReal: boolean|null, consentimientoVigente: boolean|null, usuarioId: string|null}>}
 */
export async function consultarCondicionesPublicar() {
  let sesionReal = null
  let consentimientoVigente = null
  let usuarioId = null
  try {
    const { data, error } = await supabase.auth.getSession()
    if (!error) {
      usuarioId = data?.session?.user?.id || null
      sesionReal = Boolean(usuarioId)
    }
    if (usuarioId) {
      const r = await supabase
        .from('consentimientos_aceptados')
        .select('id')
        .eq('usuario_id', usuarioId)
        .is('revocado_en', null)
        .limit(1)
      if (!r.error) consentimientoVigente = (r.data || []).length > 0
    }
  } catch { /* sin conexión: queda null */ }
  return { sesionReal, consentimientoVigente, usuarioId }
}

/** Retira una publicación propia (RF90). Usa la función `retirar_publicacion` de la base. */
export async function retirarPublicacion(medicionId) {
  if (!medicionId) return { ok: false, motivo: 'sin_id' }
  try {
    const { error } = await supabase.rpc('retirar_publicacion', { p_medicion: medicionId })
    if (error) throw error
    return { ok: true }
  } catch (error) {
    const motivo = clasificarErrorPublicacion(error)
    return { ok: false, motivo }
  }
}

const CLAVE_PUBLICACIONES_ANONIMAS_LOCALES = 'sensor_publicaciones_anonimas_locales'

function leerPublicacionesAnonimasLocales() {
  try {
    const crudo = typeof localStorage !== 'undefined' ? localStorage.getItem(CLAVE_PUBLICACIONES_ANONIMAS_LOCALES) : null
    const lista = crudo ? JSON.parse(crudo) : []
    return Array.isArray(lista) ? lista : []
  } catch {
    return []
  }
}

/**
 * Registra localmente una medición publicada de forma estrictamente anonimizada (RF31 y RF57),
 * sin almacenar jamás nombre, correo ni identificador de usuario.
 */
export function registrarPublicacionAnonimaLocal({
  titulo = null,
  rangoEdad = '18-24',
  actividadNombre = 'Reposo Basal',
  bpm = 74,
  spo2 = 98,
  calidad = 'buena',
  ritmo = 'normal',
  dentroDeRango = true
} = {}) {
  try {
    if (typeof localStorage === 'undefined') return null
    const actual = leerPublicacionesAnonimasLocales()
    const nueva = {
      id: `pub-local-${Date.now()}`,
      medicionId: null,
      titulo: (titulo && String(titulo).trim()) || `Medición Comunitaria (${rangoEdad} años)`,
      rangoEdad: String(rangoEdad || '18-24'),
      actividadNombre: String(actividadNombre || 'Reposo Basal'),
      bpm: Number(bpm) || 74,
      spo2: Number(spo2) || 98,
      calidad: String(calidad || 'buena'),
      ritmo: String(ritmo || 'normal'),
      dentroDeRango: Boolean(dentroDeRango),
      creadaEn: new Date().toISOString(),
      autorAnonimo: 'Participante UNACH (Anónimo)'
    }
    const actualizada = [nueva, ...actual].slice(0, 30)
    localStorage.setItem(CLAVE_PUBLICACIONES_ANONIMAS_LOCALES, JSON.stringify(actualizada))
    return nueva
  } catch {
    return null
  }
}

/**
 * Obtiene las mediciones publicadas vigentes desde la tabla `publicaciones` (anonimizadas, RF31 y RF57).
 * Accesible para cualquier usuario con o sin sesión iniciada (RLS `publicaciones_publicas`).
 * Nunca solicita `autor_id` ni datos personales identificables.
 */
export async function listarPublicacionesPublicas() {
  const locales = leerPublicacionesAnonimasLocales()
  try {
    const { data, error } = await supabase
      .from('publicaciones')
      .select('id, medicion_id, titulo, rango_edad, ritmo, calidad, bpm_promedio, spo2_promedio, dentro_de_rango, confirmada_en, creada_en, actividad:actividades(nombre)')
      .is('retirada_en', null)
      .order('creada_en', { ascending: false })
      .limit(50)

    if (!error && Array.isArray(data)) {
      const remotas = data
        .filter(p => Number(p.bpm_promedio) > 0)
        .map(p => ({
          id: `pub-bd-${p.id}`,
          medicionId: p.medicion_id,
          titulo: p.titulo || `Medición Comunitaria (${p.rango_edad || '18-24'} años)`,
          rangoEdad: p.rango_edad || '18-24',
          actividadNombre: p.actividad?.nombre || 'Reposo Basal',
          bpm: Number(p.bpm_promedio),
          spo2: Number(p.spo2_promedio) > 0 ? Number(p.spo2_promedio) : 98.0,
          calidad: p.calidad || 'buena',
          ritmo: p.ritmo || 'normal',
          dentroDeRango: typeof p.dentro_de_rango === 'boolean' ? p.dentro_de_rango : true,
          creadaEn: p.creada_en || p.confirmada_en || null,
          autorAnonimo: 'Participante UNACH (Anónimo)'
        }))
      return [...locales, ...remotas]
    }
  } catch (_) {}
  return locales
}

/** Reenvía las mediciones pendientes de la cuenta con sesión. Devuelve cuántas se enviaron y cuántas quedan. */
export async function sincronizarPendientes() {
  const usuarioId = await usuarioActualId()
  if (!usuarioId) return { enviadas: 0, quedan: 0 }

  let enviadas = 0
  for (const p of listarPendientes(usuarioId)) {
    const { error } = await insertarMedicion(p.fila)
    const motivo = error ? clasificarErrorGuardado(error) : null
    if (!error || motivo === 'duplicada') {
      quitarPendiente(p.fila.id_cliente)
      enviadas++
    } else if (motivo === 'conexion') {
      break // sigue sin internet: se intenta más tarde
    } else {
      quitarPendiente(p.fila.id_cliente) // no se podrá guardar nunca (consentimiento, permiso o calidad)
    }
  }
  return { enviadas, quedan: listarPendientes(usuarioId).length }
}

export function contarPendientes(usuarioId = null) {
  return listarPendientes(usuarioId).length
}

const COLUMNAS_HISTORIAL =
  'id, inicio, duracion_s, fuente, canal, bpm_promedio, spo2_promedio, hrv_rmssd_ms, ritmo, calidad, ' +
  'causa_calidad, dentro_de_rango, usuario_id, fin, publica, actividad:actividades(nombre)'

/**
 * Historial de mediciones de la cuenta, de la más reciente a la más antigua.
 * Sin conexión devuelve las últimas mediciones vistas, guardadas en el dispositivo (RNF03).
 * @param {{pagina?: number, fuente?: 'sensor'|'simulador'|null}} opciones
 */
export async function listarHistorial({ pagina = 0, fuente = null } = {}) {
  const desde = pagina * TAMANO_PAGINA
  try {
    let consulta = supabase
      .from('mediciones')
      .select(COLUMNAS_HISTORIAL, { count: 'exact' })
      .order('inicio', { ascending: false })
      .range(desde, desde + TAMANO_PAGINA - 1)
    if (fuente) consulta = consulta.eq('fuente', fuente)

    const { data, error, count } = await consulta
    if (error) throw error

    // usuarioId / fin / publica: para ofrecer «Publicar» o «Retirar publicación» solo donde corresponde
    const items = (data || []).map((m) => ({ ...resumirParaHistorial(m), usuarioId: m.usuario_id || null, fin: m.fin || null, publica: m.publica === true }))
    if (pagina === 0 && !fuente) {
      for (const m of items.slice(0, 10)) {
        await guardarMedicionVista({
          id: m.id, fecha: m.inicio, actividad: m.actividad, bpm: m.bpm, spo2: m.spo2,
          ritmo: m.ritmo, calidad: m.calidad, dentroDeRango: m.dentroDeRango
        })
      }
    }
    return { items, total: count ?? items.length, hayMas: desde + items.length < (count ?? 0), sinConexion: false }
  } catch (error) {
    if (clasificarErrorGuardado(error) !== 'conexion') {
      return { items: [], total: 0, hayMas: false, sinConexion: false, error: 'No se pudo cargar el historial.' }
    }
    const vistas = await listarMedicionesVistas()
    const items = vistas.map((v) => ({
      id: v.id, inicio: v.fecha, fuente: null, canal: null, actividad: v.actividad || null,
      bpm: v.bpm ?? null, spo2: v.spo2 ?? null, hrv: null, ritmo: v.ritmo || null,
      calidad: v.calidad || null, causaCalidad: null, dentroDeRango: v.dentroDeRango ?? null, duracionS: null
    }))
    return { items, total: items.length, hayMas: false, sinConexion: true }
  }
}
