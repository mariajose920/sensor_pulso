/**
 * ============================================================================
 * sensor_pulso · Servicio de Alertas Fuera de Rango (RF21)
 * ============================================================================
 * Gestiona el registro, persistencia y consulta del historial de alertas
 * clínicas emitidas cuando los biomarcadores exceden los límites fisiológicos.
 * Integra persistencia en Supabase (tabla 'alertas' y vista 'historial_alertas')
 * con respaldo local reactivo en localStorage (RNF03).
 * ============================================================================
 */

import { supabase } from './supabase.js'

export const STORAGE_KEY_ALERTAS = 'sensor_historial_alertas_cache'
const COOLDOWN_REGISTRO_MS = 20000 // Evita saturar el historial con la misma alerta dentro de 20s

// Registro en memoria de la última emisión por tipo y medición para deduplicación
const ultimasEmisiones = new Map()

export const TIPOS_ALERTA_VALIDOS = [
  'bpm_alto',
  'bpm_bajo',
  'spo2_bajo',
  'irregular',
  'senal_mala'
]

/**
 * Metadatos educativos de los tipos de alerta. Los títulos hablan de tendencia o parecido con un patrón de referencia, nunca de un diagnóstico (RF94).
 */
export const METADATOS_ALERTAS = {
  bpm_alto: {
    clave: 'bpm_alto',
    titulo: 'Tendencia a taquicardia (BPM alto)',
    parametro: 'Frecuencia Cardíaca',
    unidad: 'BPM',
    severidad: 'alta', // 'alta' | 'media' | 'baja'
    descripcion: 'Frecuencia cardíaca por sobre el límite superior de referencia para la edad y actividad: se parece a los parámetros de taquicardia (orientativo, no es un diagnóstico).'
  },
  bpm_bajo: {
    clave: 'bpm_bajo',
    titulo: 'Tendencia a bradicardia (BPM bajo)',
    parametro: 'Frecuencia Cardíaca',
    unidad: 'BPM',
    severidad: 'media',
    descripcion: 'Frecuencia cardíaca por debajo del límite inferior de referencia: se parece a los parámetros de bradicardia (orientativo, no es un diagnóstico).'
  },
  spo2_bajo: {
    clave: 'spo2_bajo',
    titulo: 'Tendencia a desaturación de oxígeno (SpO₂ baja)',
    parametro: 'Saturación de Oxígeno',
    unidad: '%',
    severidad: 'alta',
    descripcion: 'Saturación periférica de oxígeno bajo el umbral de referencia (95%): se parece a los parámetros de desaturación (orientativo, no es un diagnóstico).'
  },
  irregular: {
    clave: 'irregular',
    titulo: 'Tendencia a ritmo irregular (variabilidad R-R)',
    parametro: 'Ritmo Cardíaco',
    unidad: '',
    severidad: 'media',
    descripcion: 'Variabilidad alta entre los intervalos de los latidos (R-R): se parece a un ritmo irregular (orientativo, no es un diagnóstico).'
  },
  senal_mala: {
    clave: 'senal_mala',
    titulo: 'Señal PPG Deficiente',
    parametro: 'Calidad de Señal',
    unidad: '',
    severidad: 'baja',
    descripcion: 'Contacto óptico inestable o interferencia por movimiento en el sensor.'
  }
}

/**
 * Obtiene metadatos de un tipo de alerta.
 * @param {string} tipo
 */
export function obtenerMetadatosAlerta(tipo) {
  return METADATOS_ALERTAS[tipo] || {
    clave: tipo,
    titulo: 'Alerta Fisiológica',
    parametro: 'Biomarcador',
    unidad: '',
    severidad: 'media',
    descripcion: 'Parámetro fuera de rango fisiológico de referencia.'
  }
}

/**
 * Recupera las alertas almacenadas en el caché local.
 * @returns {Array<object>}
 */
export function obtenerAlertasLocales() {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ALERTAS)
    return raw ? JSON.parse(raw) : []
  } catch {
    return []
  }
}

/**
 * Guarda una alerta en el caché local con límite máximo de retención.
 * @param {object} alerta
 */
function guardarAlertaLocal(alerta) {
  if (typeof localStorage === 'undefined') return
  try {
    const previas = obtenerAlertasLocales()
    const actualizadas = [alerta, ...previas.filter(a => a.id !== alerta.id)].slice(0, 100)
    localStorage.setItem(STORAGE_KEY_ALERTAS, JSON.stringify(actualizadas))
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('sensor:alerta_guardada', { detail: alerta }))
    }
  } catch (e) {
    console.warn('No se pudo guardar la alerta en localStorage:', e)
  }
}

/**
 * Obtiene el ID del usuario autenticado actual, si existe.
 */
async function obtenerUsuarioActualId() {
  try {
    const { data } = await supabase.auth.getSession()
    return data?.session?.user?.id || null
  } catch {
    return null
  }
}

/**
 * Registra una alerta fuera de rango en la base de datos y en el almacenamiento local.
 * Aplica deduplicación para evitar registrar spam acústico/visual repetitivo dentro de la ventana de cooldown.
 *
 * @param {object} params
 * @param {string} [params.medicionId] - UUID de la medición actual (opcional)
 * @param {string} [params.usuarioId] - UUID del usuario (si no se indica, se obtiene de la sesión)
 * @param {'bpm_alto'|'bpm_bajo'|'spo2_bajo'|'irregular'|'senal_mala'} params.tipo - Tipo de alerta
 * @param {number|null} params.valor - Valor cuantificado del biomarcador
 * @param {number|null} params.limite - Límite de referencia transgredido
 * @param {boolean} [params.sonora=true] - Si se emitió alarma sonora
 * @param {boolean} [params.forzar=false] - Ignora deduplicación temporal
 * @returns {Promise<{ ok: boolean, alerta: object|null, guardadaRemota: boolean, motivo?: string }>}
 */
export async function registrarAlerta({
  medicionId = null,
  usuarioId = null,
  tipo,
  valor = null,
  limite = null,
  sonora = true,
  forzar = false
}) {
  if (!TIPOS_ALERTA_VALIDOS.includes(tipo)) {
    return { ok: false, alerta: null, guardadaRemota: false, motivo: `Tipo de alerta inválido: ${tipo}` }
  }

  const claveCooldown = `${medicionId || 'live'}_${tipo}`
  const ahora = Date.now()
  const ultimaVez = ultimasEmisiones.get(claveCooldown) || 0

  if (!forzar && ahora - ultimaVez < COOLDOWN_REGISTRO_MS) {
    return { ok: false, alerta: null, guardadaRemota: false, motivo: 'cooldown_activo' }
  }
  ultimasEmisiones.set(claveCooldown, ahora)

  const uid = usuarioId || (await obtenerUsuarioActualId())
  const idGenerado = typeof crypto !== 'undefined' && crypto.randomUUID
    ? crypto.randomUUID()
    : 'alt_' + Math.random().toString(36).substring(2, 11)

  const nuevaAlerta = {
    id: idGenerado,
    medicion_id: medicionId,
    usuario_id: uid,
    tipo,
    valor: valor !== null ? Number(Number(valor).toFixed(1)) : null,
    limite: limite !== null ? Number(Number(limite).toFixed(1)) : null,
    sonora: Boolean(sonora),
    creada_en: new Date().toISOString()
  }

  // Guardado en caché local inmediato para visualización instantánea y modo offline
  guardarAlertaLocal(nuevaAlerta)

  // Si hay usuario y supabase disponible, persistir en tabla 'alertas'
  let guardadaRemota = false
  if (uid && medicionId) {
    try {
      const { data, error } = await supabase
        .from('alertas')
        .insert({
          id: idGenerado,
          medicion_id: medicionId,
          usuario_id: uid,
          tipo,
          valor: nuevaAlerta.valor,
          limite: nuevaAlerta.limite,
          sonora: nuevaAlerta.sonora
        })
        .select()
        .single()

      if (!error && data) {
        guardadaRemota = true
      }
    } catch (err) {
      // Si falla por red u RLS, la alerta permanece en local
      console.warn('Persistencia remota de alerta en Supabase diferida:', err.message)
    }
  }

  return {
    ok: true,
    alerta: nuevaAlerta,
    guardadaRemota
  }
}

/**
 * Consulta el historial de alertas recientes del usuario (RF21).
 * Lee de la vista 'historial_alertas' en Supabase y combina con las del almacenamiento local.
 *
 * @param {object} opciones
 * @param {string} [opciones.medicionId] - Filtrar por medición específica
 * @param {number} [opciones.limite=50] - Cantidad máxima de registros
 * @returns {Promise<{ ok: boolean, alertas: Array<object>, fuente: 'remota'|'local', total: number }>}
 */
export async function listarHistorialAlertas({ medicionId = null, limite = 50 } = {}) {
  const uid = await obtenerUsuarioActualId()
  const locales = obtenerAlertasLocales()

  // Si no está autenticado, devuelve las locales
  if (!uid) {
    let filtradas = locales
    if (medicionId) filtradas = filtradas.filter(a => a.medicion_id === medicionId)
    return {
      ok: true,
      alertas: filtradas.slice(0, limite),
      fuente: 'local',
      total: filtradas.length
    }
  }

  try {
    let consulta = supabase
      .from('historial_alertas')
      .select('*')
      .order('creada_en', { ascending: false })
      .limit(limite)

    if (medicionId) {
      consulta = consulta.eq('medicion_id', medicionId)
    }

    const { data, error } = await consulta

    if (error) throw error

    // Mezcla registros remotos con los locales recientes para no perder datos offline
    const mapa = new Map()
    for (const item of (data || [])) {
      mapa.set(item.id, item)
    }
    for (const loc of locales) {
      if (!mapa.has(loc.id)) {
        if (!medicionId || loc.medicion_id === medicionId) {
          mapa.set(loc.id, loc)
        }
      }
    }

    const combinadas = Array.from(mapa.values())
      .sort((a, b) => new Date(b.creada_en) - new Date(a.creada_en))
      .slice(0, limite)

    return {
      ok: true,
      alertas: combinadas,
      fuente: 'remota',
      total: combinadas.length
    }
  } catch (err) {
    // Modo de degradación elegante (RNF03)
    let filtradas = locales
    if (medicionId) filtradas = filtradas.filter(a => a.medicion_id === medicionId)
    return {
      ok: true,
      alertas: filtradas.slice(0, limite),
      fuente: 'local',
      total: filtradas.length
    }
  }
}

/**
 * Limpia el historial de alertas locales (útil para pruebas y reinicio).
 */
export function limpiarAlertasLocales() {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(STORAGE_KEY_ALERTAS)
  }
  ultimasEmisiones.clear()
}
