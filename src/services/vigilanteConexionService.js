/**
 * ============================================================================
 * sensor_pulso · Servicio Vigilante de Conexión y Desconexión (RF10, RF11)
 * ============================================================================
 *
 * Supervisa en segundo plano la integridad de la medición en tiempo real:
 * - RF10: Finalizar automáticamente la medición al perder la comunicación WiFi
 *         o al desconectar físicamente el sensor óptico del paciente.
 * - RF11: Notificar y transicionar los estados de conexión ('activa', 'perdida', 'finalizada').
 * - Registra la causa exacta en PostgreSQL/Supabase ('perdida_comunicacion' o 'sensor_desconectado').
 * - Preserva los datos válidos capturados hasta el momento del corte.
 */

import { reactive, computed, watch } from 'vue'
import {
  sesionState,
  estaSesionActiva,
  finalizarSesion,
  marcarConexionPerdida,
  MOTIVOS_FIN,
  ESTADOS_CONEXION
} from './sesionMedicionService.js'
import { esp32State } from './esp32Service.js'

export const UMBRALES_VIGILANTE = {
  // Tiempo sin recibir paquetes WiFi antes de marcar pérdida (RF11)
  TIMEOUT_COMUNICACION_MS: 10000,
  // Período de gracia adicional en estado 'perdida' antes del cierre definitivo de la sesión (RF10)
  GRACIA_RECONEXION_MS: 5000,
  // Tiempo continuo con sensor desconectado / sin señal biológica antes de finalizar medición (RF10)
  TIMEOUT_SENSOR_MS: 8000,
  // Frecuencia de verificación del vigilante
  INTERVALO_SONDEO_MS: 1000
}

/**
 * Estado reactivo del vigilante de conexión (RF10, RF11)
 */
export const vigilanteState = reactive({
  activo: false,
  estadoAlerta: 'normal', // 'normal' | 'advertencia' | 'perdida' | 'finalizada_auto'
  tiempoSinContactoMs: 0,
  tiempoSinSensorMs: 0,
  segundosGraciaRestantes: 5,
  simulacionForzada: null, // null | 'comunicacion' | 'sensor'
  alertaModal: null, // null | { tipo, titulo, mensaje, motivo, timestamp, datosPrevios }
  historialDesconexiones: []
})

let timerVigilante = null
let callbackFinalizacion = null

/**
 * Computed helpers
 */
export const hayAlertaDesconexion = computed(() => {
  return vigilanteState.alertaModal !== null
})

/**
 * Evalúa si el sensor óptico está desconectado físicamente o no detecta tejido vivo
 */
export function evaluarSensorDesconectado(canalData = null) {
  // Si no se especifica canal, se evalúa el primer canal o el activo
  const canal = canalData || esp32State.canales[0]
  if (!canal) return false

  // Criterios objetivos de desconexión del sensor óptico (MAX30102 / MAX30100):
  // 1. Flag explícito de sensor desconectado o sin dedo
  if (canal.sensor_conectado === false || canal.estado === 'sin_dedo' || canal.estado === 'desconectado') {
    return true
  }

  // 2. Calidad evaluada como 'sin_senal' y BPM en 0
  if (canal.calidad === 'sin_senal' && (!canal.bpm || canal.bpm === 0)) {
    return true
  }

  // 3. Amplitud óptica infrarroja en 0 o vacía
  if (Array.isArray(canal.ir) && canal.ir.length > 0) {
    const todosCero = canal.ir.every(v => Number(v) === 0)
    if (todosCero) return true
  }

  return false
}

/**
 * Ciclo de verificación ejecutado cada segundo
 */
export async function cicloVerificacionVigilante() {
  const sesion = sesionState.sesionActiva
  const enCurso = sesion && (sesion.estado === ESTADOS_CONEXION.ACTIVA || sesion.estado === ESTADOS_CONEXION.PERDIDA)
  if (!enCurso) {
    vigilanteState.tiempoSinContactoMs = 0
    vigilanteState.tiempoSinSensorMs = 0
    vigilanteState.estadoAlerta = 'normal'
    return
  }

  const ahora = Date.now()

  // --------------------------------------------------------------------------
  // 1. VERIFICACIÓN DE PÉRDIDA DE COMUNICACIÓN WIFI (RF10 / RF11)
  // --------------------------------------------------------------------------
  let diffContacto = 0
  if (vigilanteState.simulacionForzada === 'comunicacion') {
    diffContacto = UMBRALES_VIGILANTE.TIMEOUT_COMUNICACION_MS + 2000
  } else if (esp32State.ultimoContacto) {
    diffContacto = Math.max(0, ahora - new Date(esp32State.ultimoContacto).getTime())
  } else {
    // Si la sesión está activa y nunca hubo contacto, evaluar desde el inicio de la sesión
    const inicioSesion = new Date(sesionState.sesionActiva.inicio).getTime()
    diffContacto = Math.max(0, ahora - inicioSesion)
  }

  vigilanteState.tiempoSinContactoMs = diffContacto

  if (diffContacto >= UMBRALES_VIGILANTE.TIMEOUT_COMUNICACION_MS) {
    // Entrar en fase de advertencia / pérdida (RF11)
    if (sesionState.sesionActiva.estado !== ESTADOS_CONEXION.PERDIDA) {
      await marcarConexionPerdida(MOTIVOS_FIN.PERDIDA_COMUNICACION)
      vigilanteState.estadoAlerta = 'perdida'
      vigilanteState.segundosGraciaRestantes = Math.round(UMBRALES_VIGILANTE.GRACIA_RECONEXION_MS / 1000)
    }

    // Cuenta regresiva de gracia
    if (vigilanteState.segundosGraciaRestantes > 0) {
      vigilanteState.segundosGraciaRestantes--
    } else {
      // Tiempo de gracia agotado: FINALIZAR MEDICIÓN AUTOMÁTICAMENTE (RF10)
      await dispararFinalizacionAutomatica({
        motivo: MOTIVOS_FIN.PERDIDA_COMUNICACION,
        titulo: 'Medición Finalizada por Pérdida de Comunicación (RF10)',
        mensaje: `Se ha interrumpido la comunicación WiFi con el dispositivo ESP32 durante más de ${Math.round(UMBRALES_VIGILANTE.TIMEOUT_COMUNICACION_MS / 1000)} segundos continuos.`
      })
      return
    }
  } else {
    // Si se recuperó el contacto a tiempo, restaurar a activa
    if (sesionState.sesionActiva.estado === ESTADOS_CONEXION.PERDIDA) {
      sesionState.sesionActiva.estado = ESTADOS_CONEXION.ACTIVA
      sesionState.sesionActiva.motivo_fin = null
      vigilanteState.estadoAlerta = 'normal'
    }
  }

  // --------------------------------------------------------------------------
  // 2. VERIFICACIÓN DE DESCONEXIÓN DEL SENSOR ÓPTICO (RF10)
  // --------------------------------------------------------------------------
  const sensorCaido = vigilanteState.simulacionForzada === 'sensor' || evaluarSensorDesconectado()

  if (sensorCaido) {
    vigilanteState.tiempoSinSensorMs += UMBRALES_VIGILANTE.INTERVALO_SONDEO_MS
    if (vigilanteState.tiempoSinSensorMs >= 3000) {
      vigilanteState.estadoAlerta = 'advertencia'
    }

    if (vigilanteState.tiempoSinSensorMs >= UMBRALES_VIGILANTE.TIMEOUT_SENSOR_MS) {
      // Umbral superado: FINALIZAR MEDICIÓN POR SENSOR DESCONECTADO (RF10)
      await dispararFinalizacionAutomatica({
        motivo: MOTIVOS_FIN.SENSOR_DESCONECTADO,
        titulo: 'Medición Finalizada por Desconexión del Sensor (RF10)',
        mensaje: `El sensor óptico de pulso (MAX30102) ha sido desconectado o se ha retirado el dedo durante más de ${Math.round(UMBRALES_VIGILANTE.TIMEOUT_SENSOR_MS / 1000)} segundos continuos.`
      })
      return
    }
  } else {
    vigilanteState.tiempoSinSensorMs = 0
    if (vigilanteState.estadoAlerta === 'advertencia') {
      vigilanteState.estadoAlerta = 'normal'
    }
  }
}

/**
 * Ejecuta la finalización automática exigida por el RF10
 */
async function dispararFinalizacionAutomatica({ motivo, titulo, mensaje }) {
  const duracionFinal = sesionState.duracionSegundos
  const idSesion = sesionState.sesionActiva?.id

  // Detener vigilante temporalmente para evitar loops
  detenerVigilante()

  // Finalizar sesión oficial con el motivo estricto
  const res = await finalizarSesion({ motivo })

  const eventoDesconexion = {
    tipo: motivo,
    titulo,
    mensaje,
    motivo,
    idSesion,
    duracionSegundos: duracionFinal,
    timestamp: new Date().toISOString()
  }

  vigilanteState.alertaModal = eventoDesconexion
  vigilanteState.estadoAlerta = 'finalizada_auto'
  vigilanteState.historialDesconexiones.unshift(eventoDesconexion)
  vigilanteState.simulacionForzada = null

  if (typeof callbackFinalizacion === 'function') {
    callbackFinalizacion(eventoDesconexion)
  }

  return res
}

/**
 * Inicia la supervisión activa del vigilante (RF10)
 */
export function iniciarVigilante(opciones = {}) {
  detenerVigilante()

  if (opciones.onAutoFinalizada) {
    callbackFinalizacion = opciones.onAutoFinalizada
  }

  vigilanteState.activo = true
  vigilanteState.simulacionForzada = null

  timerVigilante = setInterval(cicloVerificacionVigilante, UMBRALES_VIGILANTE.INTERVALO_SONDEO_MS)
}

/**
 * Detiene el vigilante
 */
export function detenerVigilante() {
  if (timerVigilante) {
    clearInterval(timerVigilante)
    timerVigilante = null
  }
  vigilanteState.activo = false
}

/**
 * Cierra y descarta el modal de alerta de desconexión
 */
export function descartarAlertaModal() {
  vigilanteState.alertaModal = null
  vigilanteState.estadoAlerta = 'normal'
}

/**
 * Simulación de prueba de pérdida de comunicación WiFi (RF10)
 */
export function forzarSimulacionPerdidaWiFi() {
  vigilanteState.simulacionForzada = 'comunicacion'
}

/**
 * Simulación de prueba de desconexión física de sensor (RF10)
 */
export function forzarSimulacionSensorDesconectado() {
  vigilanteState.simulacionForzada = 'sensor'
}

/**
 * Cancela cualquier simulación activa
 */
export function cancelarSimulacion() {
  vigilanteState.simulacionForzada = null
  vigilanteState.tiempoSinContactoMs = 0
  vigilanteState.tiempoSinSensorMs = 0
}

// Iniciar vigilante automáticamente si hay sesión activa en el cliente
if (typeof window !== 'undefined') {
  watch(() => sesionState.sesionActiva?.estado, (estado) => {
    if (estado === ESTADOS_CONEXION.ACTIVA || estado === ESTADOS_CONEXION.PERDIDA) {
      iniciarVigilante()
    } else {
      detenerVigilante()
    }
  }, { immediate: true })
}
