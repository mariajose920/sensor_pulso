/**
 * Servicio de Consentimiento Informado (RF04, RF59, RF76, RF90)
 *
 * Cumple con:
 * - Consulta de versión activa de consentimiento en Supabase (tabla consentimientos_version).
 * - Verificación de consentimiento aceptado y no revocado (tabla consentimientos_aceptados).
 * - Registro inmutable de la versión aceptada, con fecha y hora exacta (RF59).
 * - Persistencia local en localStorage para soporte sin conexión / PWA (RNF03).
 * - Control de bloqueo previo a la captura del sensor (RF04).
 */
import { ref } from 'vue'
import { supabase } from './supabase'

const LOCAL_CONSENT_KEY = 'sensor_consentimiento_aceptado_rf04'
const LOCAL_HISTORIAL_KEY = 'sensor_consentimiento_historial_rf59'

/**
 * Formatea una estampa ISO a fecha y hora completa en formato chileno (RF59)
 * Ej: "30-10-2026, 15:35:10"
 */
export function formatearFechaHora(isoString) {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return String(isoString)
    return d.toLocaleString('es-CL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  } catch {
    return String(isoString)
  }
}

/**
 * Formatea una estampa ISO a solo hora (HH:mm:ss) para etiquetas compactas
 */
export function formatearFechaHoraCorta(isoString) {
  if (!isoString) return ''
  try {
    const d = new Date(isoString)
    if (isNaN(d.getTime())) return ''
    return d.toLocaleTimeString('es-CL', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    })
  } catch {
    return ''
  }
}

// Para fines pedagógicos (RF04), cada recarga de página exige validar el consentimiento
try {
  if (typeof localStorage !== 'undefined') {
    localStorage.removeItem(LOCAL_CONSENT_KEY)
  }
} catch (e) {}

// Texto oficial estandarizado de respaldo (según migración 20261027000800_datos_iniciales.sql)
export const CONSENTIMIENTO_BASE = {
  version: '1.0',
  titulo: 'Consentimiento Informado para Medición de Pulso y SpO₂',
  finalidad: 'Actividad educativa de laboratorio: medir, visualizar, analizar y comparar la frecuencia cardíaca y saturación de oxígeno mediante fotopletismografía (PPG).',
  advertenciaMedica: 'Esta plataforma web y el dispositivo ESP32 son herramientas estrictamente didácticas y educativas. No constituyen un dispositivo médico de diagnóstico ni sustituyen la evaluación de un profesional de la salud.',
  datosRecogidos: 'Señal de pulso fotopletismográfica (infrarroja y roja), frecuencia cardíaca (BPM), saturación de oxígeno (% SpO₂), variabilidad R-R, edad, nombre y factores fisiológicos declarados (estrés, sueño, medicación, cafeína, actividad previa y condición de salud).',
  responsable: 'Equipo del proyecto sensor_pulso — Universidad Adventista de Chile (UNACH).',
  plazoConservacion: 'Hasta 12 meses desde la última medición, salvo solicitud previa de eliminación por parte del titular (Derecho de Supresión / RF90).',
  textoLegal: 'Consiento de forma libre, previa, expresa e informada la captura y procesamiento de mis datos fisiológicos con fines estrictamente académicos. Entiendo que puedo revocar este consentimiento en cualquier momento.'
}

// Estado reactivo global del consentimiento en la sesión activa (RF59: incluye fechaHoraTexto)
export const consentimientoEstado = ref({
  cargando: false,
  vigente: false,
  version: '1.0',
  aceptadoEn: null,
  fechaHoraTexto: '',
  registroPrevio: null, // Guarda la vez anterior que entró (RF59)
  origen: 'local'
})

export const consentimientoService = {
  /**
   * Obtiene la versión oficial activa del consentimiento informado
   */
  async obtenerVersionActiva() {
    try {
      const { data, error } = await supabase
        .from('consentimientos_version')
        .select('*')
        .eq('activa', true)
        .maybeSingle()

      if (!error && data) {
        return {
          version: data.version,
          titulo: 'Consentimiento Informado para Medición de Pulso y SpO₂',
          finalidad: data.finalidad || CONSENTIMIENTO_BASE.finalidad,
          advertenciaMedica: CONSENTIMIENTO_BASE.advertenciaMedica,
          datosRecogidos: data.datos_recogidos || CONSENTIMIENTO_BASE.datosRecogidos,
          responsable: data.responsable || CONSENTIMIENTO_BASE.responsable,
          plazoConservacion: data.plazo_conservacion || CONSENTIMIENTO_BASE.plazoConservacion,
          textoLegal: data.texto || CONSENTIMIENTO_BASE.textoLegal
        }
      }
    } catch (e) {
      // Si falla la red o no hay conexión, usamos la base estándar
    }
    return CONSENTIMIENTO_BASE
  },

  /**
   * Verifica si el usuario actual tiene el consentimiento vigente (no revocado)
   */
  async verificarConsentimientoVigente() {
    // Para RF04: cada recarga de página reinicia la vigencia activa
    // para que el anuncio salte y requiera consentimiento explícito
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.removeItem(LOCAL_CONSENT_KEY)
      }
    } catch (e) {}

    // RF59: Recuperar el registro de la vez anterior para no perder el historial al recargar
    let previo = null
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        const { data } = await supabase
          .from('consentimientos_aceptados')
          .select('id, version, aceptado_en, revocado_en')
          .eq('usuario_id', session.user.id)
          .is('revocado_en', null)
          .order('aceptado_en', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (data) {
          previo = {
            version: data.version,
            aceptadoEn: data.aceptado_en,
            fechaHoraTexto: formatearFechaHora(data.aceptado_en),
            origen: 'supabase'
          }
        }
      }
    } catch (e) {}

    if (!previo) {
      try {
        const raw = localStorage.getItem(LOCAL_HISTORIAL_KEY)
        if (raw) {
          const list = JSON.parse(raw)
          if (list.length > 0) {
            previo = {
              version: list[0].version,
              aceptadoEn: list[0].aceptado_en,
              fechaHoraTexto: list[0].fecha_hora_texto || formatearFechaHora(list[0].aceptado_en),
              origen: 'local'
            }
          }
        }
      } catch (e) {}
    }

    consentimientoEstado.value = {
      cargando: false,
      vigente: false,
      version: previo?.version || '1.0',
      aceptadoEn: null,
      fechaHoraTexto: '',
      registroPrevio: previo,
      origen: previo?.origen || 'local'
    }
    return false
  },

  /**
   * Registra la aceptación del consentimiento informado con versión, fecha y hora (RF04, RF59)
   */
  async aceptarConsentimiento(version = '1.0') {
    const ahora = new Date().toISOString()
    const fechaHoraTexto = formatearFechaHora(ahora)

    const nuevoEstado = {
      cargando: false,
      vigente: true,
      version,
      aceptadoEn: ahora,
      fechaHoraTexto,
      origen: 'local'
    }

    // 1. Guardar en localStorage siempre (estado activo + historial de auditoría RF59)
    try {
      localStorage.setItem(LOCAL_CONSENT_KEY, JSON.stringify(nuevoEstado))

      // Historial de auditoría local (RF59)
      const rawHistorial = localStorage.getItem(LOCAL_HISTORIAL_KEY)
      const historial = rawHistorial ? JSON.parse(rawHistorial) : []
      historial.unshift({
        id: (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : 'local-' + Date.now(),
        version,
        aceptado_en: ahora,
        fecha_hora_texto: fechaHoraTexto,
        origen: 'local'
      })
      // Mantener los últimos 50 registros para auditoría
      localStorage.setItem(LOCAL_HISTORIAL_KEY, JSON.stringify(historial.slice(0, 50)))
    } catch (e) {
      console.warn('Error guardando consentimiento local (RF59):', e)
    }

    // 2. Si hay sesión iniciada en Supabase, registrar en la tabla consentimientos_aceptados
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        const { error } = await supabase
          .from('consentimientos_aceptados')
          .insert({
            usuario_id: session.user.id,
            version,
            aceptado_en: ahora,
            revocado_en: null
          })

        if (!error) {
          nuevoEstado.origen = 'supabase'
          localStorage.setItem(LOCAL_CONSENT_KEY, JSON.stringify(nuevoEstado))
        } else {
          console.warn('No se pudo registrar en Supabase (se mantiene local):', error.message)
        }
      }
    } catch (err) {
      console.warn('Error de red al registrar consentimiento en Supabase:', err)
    }

    consentimientoEstado.value = nuevoEstado
    return { ok: true, data: nuevoEstado }
  },

  /**
   * Obtiene el historial de registros de consentimientos aceptados (RF59)
   */
  async obtenerHistorialRegistros() {
    // 1. Intentar consultar desde Supabase si hay sesión
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        const { data, error } = await supabase
          .from('consentimientos_aceptados')
          .select('id, version, aceptado_en, revocado_en')
          .eq('usuario_id', session.user.id)
          .order('aceptado_en', { ascending: false })

        if (!error && Array.isArray(data) && data.length > 0) {
          return data.map(item => ({
            id: item.id,
            version: item.version,
            aceptadoEn: item.aceptado_en,
            fechaHoraTexto: formatearFechaHora(item.aceptado_en),
            revocadoEn: item.revocado_en,
            vigente: !item.revocado_en,
            origen: 'supabase'
          }))
        }
      }
    } catch (e) {
      console.warn('Aviso: no se pudo consultar historial en Supabase, recurriendo a local:', e)
    }

    // 2. Consultar historial local
    try {
      const raw = localStorage.getItem(LOCAL_HISTORIAL_KEY)
      if (raw) {
        const items = JSON.parse(raw)
        return items.map(item => ({
          id: item.id,
          version: item.version,
          aceptadoEn: item.aceptado_en,
          fechaHoraTexto: item.fecha_hora_texto || formatearFechaHora(item.aceptado_en),
          revocadoEn: null,
          vigente: true,
          origen: 'local'
        }))
      }
    } catch (e) {}

    return []
  },

  /**
   * Revoca el consentimiento informado (RF90)
   */
  async revocarConsentimiento() {
    const ahora = new Date().toISOString()

    // 1. Actualizar Supabase si hay sesión
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        await supabase
          .from('consentimientos_aceptados')
          .update({ revocado_en: ahora })
          .eq('usuario_id', session.user.id)
          .is('revocado_en', null)
      }
    } catch (e) {
      console.warn('Error revocando en Supabase:', e)
    }

    // 2. Limpiar o actualizar localStorage
    try {
      localStorage.removeItem(LOCAL_CONSENT_KEY)
    } catch (e) {}

    consentimientoEstado.value = {
      cargando: false,
      vigente: false,
      version: '1.0',
      aceptadoEn: null,
      fechaHoraTexto: '',
      revocadoEn: ahora,
      origen: 'local'
    }

    return { ok: true }
  }
}
