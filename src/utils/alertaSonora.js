/**
 * ============================================================================
 * sensor_pulso · Generador de Alertas Sonoras Biomédicas (RF21)
 * ============================================================================
 * Sintetiza alarmas audibles diferenciadas mediante la API nativa Web Audio API.
 * Modula frecuencias y patrones según el biomarcador fuera de rango (taquicardia,
 * bradicardia, desaturación de oxígeno), con control voluntario de silenciamiento.
 * ============================================================================
 */

import { ref } from 'vue'

const STORAGE_KEY_SONIDO = 'sensor_alerta_sonora_habilitada'

// Estado reactivo global del sonido
export const sonidoHabilitado = ref(
  typeof localStorage !== 'undefined'
    ? localStorage.getItem(STORAGE_KEY_SONIDO) !== 'false'
    : true
)

export const alarmaSonando = ref(false)
export const silenciadoTemporalmente = ref(false)

let audioCtx = null
let ultimoTonoTimestamp = 0
const COOLDOWN_MS = 7500 // Repetición cada 7.5 segundos si persiste fuera de rango

/**
 * Inicializa o recupera el contexto de audio del navegador de forma perezosa.
 */
function obtenerAudioContext() {
  if (typeof window === 'undefined') return null
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null

  if (!audioCtx) {
    audioCtx = new AudioContextClass()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

/**
 * Genera un beep sonoro con frecuencia, duración y envolvente exponencial.
 * @param {number} freq - Frecuencia en Hz
 * @param {number} duracionS - Duración en segundos
 * @param {number} delayS - Retardo de inicio en segundos
 * @param {string} tipoOnda - 'sine' | 'square' | 'triangle'
 */
function emitirTono(freq, duracionS, delayS = 0, tipoOnda = 'sine') {
  const ctx = obtenerAudioContext()
  if (!ctx) return

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()

  osc.type = tipoOnda
  osc.frequency.setValueAtTime(freq, ctx.currentTime + delayS)

  // Envolvente de volumen suave para evitar clics acústicos
  gain.gain.setValueAtTime(0.001, ctx.currentTime + delayS)
  gain.gain.exponentialRampToValueAtTime(0.28, ctx.currentTime + delayS + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delayS + duracionS)

  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.start(ctx.currentTime + delayS)
  osc.stop(ctx.currentTime + delayS + duracionS)
}

/**
 * Reproduce la secuencia sonora biomédica según el tipo de alarma.
 * @param {'bpm_alto'|'bpm_bajo'|'spo2_bajo'|'senal_mala'|'prueba'} tipo
 * @param {boolean} forzar - Si es true, ignora el cooldown (para pruebas)
 * @returns {boolean} true si se emitió el sonido
 */
export function reproducirAlertaSonora(tipo = 'bpm_alto', forzar = false) {
  if (!sonidoHabilitado.value || silenciadoTemporalmente.value) {
    return false
  }

  const ahora = Date.now()
  if (!forzar && ahora - ultimoTonoTimestamp < COOLDOWN_MS) {
    return false // Respeta cooldown entre ráfagas
  }

  ultimoTonoTimestamp = ahora
  alarmaSonando.value = true

  try {
    switch (tipo) {
      case 'bpm_alto':
        // Taquicardia: Dos beeps agudos rápidos (880 Hz / A5 - estándar hospitalario)
        emitirTono(880, 0.12, 0, 'sine')
        emitirTono(880, 0.12, 0.18, 'sine')
        break

      case 'bpm_bajo':
        // Bradicardia: Tono grave de precaución sostenido (440 Hz / A4)
        emitirTono(440, 0.28, 0, 'triangle')
        break

      case 'spo2_bajo':
        // Desaturación / Hipoxia: Tono dual descendente urgente (784 Hz -> 659 Hz)
        emitirTono(784, 0.16, 0, 'sine')
        emitirTono(659, 0.22, 0.18, 'sine')
        break

      case 'senal_mala':
        // Mala calidad de contacto: Un pulso breve bajo
        emitirTono(330, 0.15, 0, 'sine')
        break

      case 'prueba':
      default:
        // Tono de prueba
        emitirTono(660, 0.18, 0, 'sine')
        emitirTono(880, 0.18, 0.22, 'sine')
        break
    }
  } catch (err) {
    console.warn('No se pudo reproducir la alarma sonora en este entorno:', err)
  }

  setTimeout(() => {
    alarmaSonando.value = false
  }, 1000)

  return true
}

/**
 * Silencia voluntariamente las alarmas por un lapso o hasta que el usuario reanude.
 */
export function silenciarAlarma() {
  silenciadoTemporalmente.value = true
  alarmaSonando.value = false
}

/**
 * Reanuda las alarmas sonoras.
 */
export function reanudarAlarma() {
  silenciadoTemporalmente.value = false
}

/**
 * Habilita o deshabilita la preferencia global de alertas sonoras.
 * @param {boolean} habilitar
 */
export function alternarHabilitacionSonido(habilitar) {
  sonidoHabilitado.value = typeof habilitar === 'boolean' ? habilitar : !sonidoHabilitado.value
  if (typeof localStorage !== 'undefined') {
    localStorage.setItem(STORAGE_KEY_SONIDO, String(sonidoHabilitado.value))
  }
}
