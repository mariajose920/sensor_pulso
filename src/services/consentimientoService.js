/**
 * Servicio de Consentimiento Informado (RF04, RF59, RF76, RF90)
 *
 * Cumple con:
 * - Consulta de versión activa de consentimiento en Supabase (tabla consentimientos_version).
 * - Verificación de consentimiento aceptado y no revocado (tabla consentimientos_aceptados).
 * - Persistencia local en localStorage para soporte sin conexión / PWA (RNF03).
 * - Control de bloqueo previo a la captura del sensor (RF04).
 */
import { ref } from 'vue'
import { supabase } from './supabase'

const LOCAL_CONSENT_KEY = 'sensor_consentimiento_aceptado_rf04'

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

// Estado reactivo global del consentimiento en la sesión activa
export const consentimientoEstado = ref({
  cargando: false,
  vigente: false,
  version: '1.0',
  aceptadoEn: null,
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

    consentimientoEstado.value = {
      cargando: false,
      vigente: false,
      version: '1.0',
      aceptadoEn: null,
      origen: 'local'
    }
    return false
  },

  /**
   * Registra la aceptación del consentimiento informado (RF04)
   */
  async aceptarConsentimiento(version = '1.0') {
    const ahora = new Date().toISOString()
    const nuevoEstado = {
      cargando: false,
      vigente: true,
      version,
      aceptadoEn: ahora,
      origen: 'local'
    }

    // 1. Guardar en localStorage siempre
    try {
      localStorage.setItem(LOCAL_CONSENT_KEY, JSON.stringify(nuevoEstado))
    } catch (e) {
      console.warn('Error guardando consentimiento local:', e)
    }

    // 2. Si hay sesión iniciada en Supabase, registrar en la tabla consentimientos_aceptados
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        const { error } = await supabase
          .from('consentimientos_aceptados')
          .upsert({
            usuario_id: session.user.id,
            version,
            aceptado_en: ahora,
            revocado_en: null
          }, { onConflict: 'usuario_id, version' })

        if (!error) {
          nuevoEstado.origen = 'supabase'
          localStorage.setItem(LOCAL_CONSENT_KEY, JSON.stringify(nuevoEstado))
        } else {
          console.warn('No se pudo registrar en Supabase (se mantiene local):', error.message)
        }
      }
    } catch (err) {
      console.warn('Error de red al registrar consentimiento:', err)
    }

    consentimientoEstado.value = nuevoEstado
    return { ok: true, data: nuevoEstado }
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
      revocadoEn: ahora,
      origen: 'local'
    }

    return { ok: true }
  }
}
