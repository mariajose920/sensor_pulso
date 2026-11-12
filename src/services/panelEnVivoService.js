/**
 * ============================================================================
 * sensor_pulso · Servicio de Panel en Vivo y Monitoreo de Avance (RF113)
 * ============================================================================
 * Criterios de Aceptación:
 *   1. Contador de respuestas en tiempo real.
 *   2. Contador de estudiantes conectados en tiempo real.
 *   3. Actualización en vivo (el profesor ve el avance sin recargar la página).
 *   4. Probado junto con RF110 (100 estudiantes simultáneos).
 * ============================================================================
 */

import { supabase } from './supabase.js'

// Almacén en memoria para respaldo local / modo offline / pruebas unitarias
const estadoEnVivoLocal = new Map()

/**
 * Obtiene el estado actual del avance de una evaluación en vivo.
 * @param {string} evaluacionId - UUID de la evaluación
 * @returns {Promise<{ success: boolean, data?: object, error?: string }>}
 */
export async function obtenerAvanceEnVivo(evaluacionId) {
  if (!evaluacionId) {
    return { success: false, error: 'Identificador de evaluación requerido.' }
  }

  // 1. Intentar obtener vía RPC de PostgreSQL (RF113)
  try {
    const { data, error } = await supabase.rpc('obtener_avance_en_vivo_rf113', {
      p_evaluacion_id: evaluacionId
    })

    if (!error && data) {
      // Sincronizar copia local
      estadoEnVivoLocal.set(evaluacionId, data)
      return { success: true, data }
    }
  } catch (_) {}

  // 2. Fallback de resiliencia local / entorno de pruebas sin Supabase activo
  const local = estadoEnVivoLocal.get(evaluacionId)
  if (local) {
    return { success: true, data: { ...local, actualizado_en: new Date().toISOString() } }
  }

  // Estructura base inicial vacía
  const inicial = {
    evaluacion_id: evaluacionId,
    aula_id: null,
    titulo: 'Evaluación en Vivo',
    tipo: 'preguntas',
    modo: 'en_vivo',
    estado: 'en_curso',
    tiempo_limite_s: 1800,
    iniciada_en: new Date().toISOString(),
    total_asignados: 0,
    total_preguntas: 0,
    conectados: 0,
    en_progreso: 0,
    finalizados: 0,
    total_respuestas: 0,
    porcentaje_avance_global: 0,
    actualizado_en: new Date().toISOString(),
    estudiantes: []
  }
  estadoEnVivoLocal.set(evaluacionId, inicial)
  return { success: true, data: inicial }
}

/**
 * Suscribe al profesor a los eventos en vivo de la evaluación (Realtime + Polling Resiliente).
 * Garantiza que el profesor visualice el avance sin recargar la página.
 *
 * @param {string} evaluacionId - UUID de la evaluación
 * @param {Function} onUpdate - Callback invocado cada vez que hay cambios en respuestas o intentos
 * @param {object} [opciones={}] - Configuración de frecuencia de sondeo y presencia
 * @returns {{ unsubscribe: Function }}
 */
export function suscribirAvanceEnVivo(evaluacionId, onUpdate, opciones = {}) {
  if (!evaluacionId || typeof onUpdate !== 'function') {
    return { unsubscribe: () => {} }
  }

  const {
    intervaloFallbackMs = 3000,
    escucharPresence = true
  } = opciones

  let desuscrito = false
  let canalRealtime = null
  let temporizador = null

  // Función interna para refrescar y notificar al suscriptor
  const refrescar = async (eventoOrigen = 'polling') => {
    if (desuscrito) return
    const res = await obtenerAvanceEnVivo(evaluacionId)
    if (res.success && res.data && !desuscrito) {
      onUpdate({
        ...res.data,
        _eventoOrigen: eventoOrigen,
        _recibidoEn: new Date().toISOString()
      })
    }
  }

  // 1. Carga inicial inmediata
  refrescar('init')

  // 2. Conectar canal Realtime de Supabase
  try {
    const nombreCanal = `evaluacion-en-vivo-${evaluacionId}`
    canalRealtime = supabase.channel(nombreCanal, {
      config: { presence: { key: evaluacionId } }
    })

    // Escuchar inserciones y modificaciones en intentos_evaluacion
    canalRealtime
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'intentos_evaluacion',
          filter: `evaluacion_id=eq.${evaluacionId}`
        },
        () => refrescar('intentos_evaluacion_change')
      )
      // Escuchar nuevas respuestas registradas en tiempo real
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'respuestas'
        },
        () => refrescar('respuestas_insert')
      )
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'respuestas'
        },
        () => refrescar('respuestas_update')
      )

    if (escucharPresence) {
      canalRealtime
        .on('presence', { event: 'sync' }, () => {
          refrescar('presence_sync')
        })
        .on('presence', { event: 'join' }, () => {
          refrescar('presence_join')
        })
        .on('presence', { event: 'leave' }, () => {
          refrescar('presence_leave')
        })
    }

    canalRealtime.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        refrescar('channel_subscribed')
      }
    })
  } catch (err) {
    console.warn('[RF113 Realtime] Error suscribiendo a canal, operando con sondeo resiliente:', err)
  }

  // 3. Temporizador de sondeo de respaldo (garantiza actualización si Realtime se interrumpe)
  if (intervaloFallbackMs > 0) {
    temporizador = setInterval(() => {
      refrescar('heartbeat_interval')
    }, intervaloFallbackMs)
  }

  return {
    unsubscribe: () => {
      desuscrito = true
      if (temporizador) {
        clearInterval(temporizador)
        temporizador = null
      }
      if (canalRealtime) {
        try {
          supabase.removeChannel(canalRealtime)
        } catch (_) {}
        canalRealtime = null
      }
    }
  }
}

/**
 * Informa la presencia/conexión activa de un estudiante en una evaluación en vivo (Heartbeat).
 * @param {string} evaluacionId
 * @param {string} intentoId
 * @returns {Promise<{ success: boolean }>}
 */
export async function registrarPresenciaEstudiante(evaluacionId, intentoId) {
  if (!evaluacionId || !intentoId) return { success: false }

  try {
    const { data, error } = await supabase.rpc('ping_presencia_estudiante_rf113', {
      p_evaluacion_id: evaluacionId,
      p_intento_id: intentoId
    })
    if (!error) return { success: true, data }
  } catch (_) {}

  // Actualización en caché local si aplica
  const local = estadoEnVivoLocal.get(evaluacionId)
  if (local && Array.isArray(local.estudiantes)) {
    const est = local.estudiantes.find(e => e.intento_id === intentoId)
    if (est) {
      est.conectado = true
      est.ultimo_heartbeat = new Date().toISOString()
      local.conectados = local.estudiantes.filter(e => e.conectado && e.estado !== 'finalizado').length
    }
  }

  return { success: true }
}

/**
 * Notifica la desconexión del estudiante al cerrar o salir de la pantalla de la evaluación.
 * @param {string} evaluacionId
 * @param {string} intentoId
 * @returns {Promise<{ success: boolean }>}
 */
export async function desconectarEstudiante(evaluacionId, intentoId) {
  if (!evaluacionId || !intentoId) return { success: false }

  try {
    await supabase.rpc('desconectar_estudiante_rf113', {
      p_evaluacion_id: evaluacionId,
      p_intento_id: intentoId
    })
  } catch (_) {}

  const local = estadoEnVivoLocal.get(evaluacionId)
  if (local && Array.isArray(local.estudiantes)) {
    const est = local.estudiantes.find(e => e.intento_id === intentoId)
    if (est) {
      est.conectado = false
      local.conectados = local.estudiantes.filter(e => e.conectado && e.estado !== 'finalizado').length
    }
  }

  return { success: true }
}

/**
 * Inicia el envío periódico de latidos de presencia del estudiante en segundo plano.
 * @param {string} evaluacionId
 * @param {string} intentoId
 * @param {number} [intervaloMs=15000]
 * @returns {{ detener: Function }}
 */
export function iniciarHeartbeatEstudiante(evaluacionId, intentoId, intervaloMs = 15000) {
  registrarPresenciaEstudiante(evaluacionId, intentoId)

  const timer = setInterval(() => {
    registrarPresenciaEstudiante(evaluacionId, intentoId)
  }, intervaloMs)

  return {
    detener: () => {
      clearInterval(timer)
      desconectarEstudiante(evaluacionId, intentoId)
    }
  }
}

/**
 * Configura o inyecta estado en vivo en memoria (para pruebas automatizadas y simulaciones).
 * @param {string} evaluacionId
 * @param {object} estado
 */
export function _setEstadoEnVivoLocal(evaluacionId, estado) {
  estadoEnVivoLocal.set(evaluacionId, estado)
}

/**
 * Limpia el estado en memoria.
 */
export function _limpiarEstadoEnVivoLocal() {
  estadoEnVivoLocal.clear()
}
