/**
 * ============================================================================
 * sensor_pulso · Servicio de Frecuencia Cardíaca (BPM) para RF07
 * ============================================================================
 * Requerimiento: RF07 - Mostrar el valor de frecuencia (BPM).
 * Procesa la frecuencia instantánea, estadísticas dinámicas (promedio, mín, máx),
 * intervalos interlatido (IBI / RR), estabilidad del ritmo y comparación de rangos.
 * ============================================================================
 */

import { reactive } from 'vue'

// Límites fisiológicos válidos según base de datos (Supabase check 20-250)
export const BPM_MIN_FISIOLOGICO = 20
export const BPM_MAX_FISIOLOGICO = 250

/**
 * Rangos normales esperados de BPM en reposo según edad y perfil (RF19/RF20)
 * Fuentes: American Heart Association (AHA)
 */
export function obtenerRangosBpmEsperados(edad = 25, actividad = 'reposo') {
  if (actividad === 'ejercicio') {
    return { min: 90, max: 170, descripcion: 'En actividad física / ejercicio moderado' }
  }

  // Adultos mayores (65+)
  if (edad >= 65) {
    return { min: 58, max: 95, descripcion: 'Adulto mayor en reposo (AHA)' }
  }
  // Adultos estándar (18 - 64)
  if (edad >= 18) {
    return { min: 60, max: 100, descripcion: 'Adulto en reposo (Normocardia estándar AHA: 60-100 BPM)' }
  }
  // Adolescentes (12 - 17)
  return { min: 65, max: 105, descripcion: 'Adolescente en reposo' }
}

/**
 * Valida si un valor numérico de BPM se encuentra dentro de los límites fisiológicos humanos
 * @param {number} bpm
 * @returns {boolean}
 */
export function esBpmValido(bpm) {
  if (typeof bpm !== 'number' || isNaN(bpm)) return false
  return bpm >= BPM_MIN_FISIOLOGICO && bpm <= BPM_MAX_FISIOLOGICO
}

/**
 * Convierte un valor de BPM al Intervalo Interlatido (IBI / RR) en milisegundos
 * @param {number} bpm
 * @returns {number} Intervalo en ms
 */
export function calcularIbiMs(bpm) {
  if (!esBpmValido(bpm) || bpm <= 0) return 0
  return Math.round(60000 / bpm)
}

/**
 * Convierte un intervalo interlatido (IBI en ms) a BPM
 * @param {number} ibiMs 
 * @returns {number}
 */
export function ibiABpm(ibiMs) {
  if (typeof ibiMs !== 'number' || ibiMs <= 240 || ibiMs >= 3000) return 0
  return parseFloat((60000 / ibiMs).toFixed(1))
}

/**
 * Evalúa si el BPM actual se encuentra dentro del rango esperado
 * @param {number} bpm 
 * @param {{ min: number, max: number }} rango 
 * @returns {{ dentroDeRango: boolean, estado: 'normal'|'taquicardia'|'bradicardia'|'invalido' }}
 */
export function evaluarRangoBpm(bpm, rango = { min: 60, max: 100 }) {
  if (!esBpmValido(bpm)) {
    return { dentroDeRango: false, estado: 'invalido' }
  }
  if (bpm > rango.max) {
    return { dentroDeRango: false, estado: 'taquicardia' }
  }
  if (bpm < rango.min) {
    return { dentroDeRango: false, estado: 'bradicardia' }
  }
  return { dentroDeRango: true, estado: 'normal' }
}

/**
 * Gestor reactivo de estadísticas de BPM para una sesión activa de medición
 */
export function crearMonitorEstadisticasBpm() {
  const historial = []
  const MAX_HISTORIAL = 100

  const stats = reactive({
    currentBpm: 0,
    instantBpm: 0,
    averageBpm: 0,
    minBpm: null,
    maxBpm: null,
    ibiMs: 0,
    totalLecturas: 0,
    estabilidad: 'Esperando señal...',
    estabilidadNivel: 'normal', // 'alta' | 'moderada' | 'baja'
    dentroDeRango: true,
    estadoRitmo: 'normal'
  })

  function registrarLectura(valorBpm, edad = 25, actividad = 'reposo') {
    if (!esBpmValido(valorBpm)) return stats

    stats.instantBpm = parseFloat(valorBpm.toFixed(1))
    stats.currentBpm = parseFloat(valorBpm.toFixed(1))
    stats.ibiMs = calcularIbiMs(stats.currentBpm)
    stats.totalLecturas++

    historial.push(stats.currentBpm)
    if (historial.length > MAX_HISTORIAL) {
      historial.shift()
    }

    // Calcular estadísticas
    let suma = 0
    let min = Infinity
    let max = -Infinity

    for (let i = 0; i < historial.length; i++) {
      const v = historial[i]
      suma += v
      if (v < min) min = v
      if (v > max) max = v
    }

    stats.averageBpm = parseFloat((suma / historial.length).toFixed(1))
    stats.minBpm = min !== Infinity ? min : stats.currentBpm
    stats.maxBpm = max !== -Infinity ? max : stats.currentBpm

    // Evaluación de rango esperado
    const rango = obtenerRangosBpmEsperados(edad, actividad)
    const evaluacion = evaluarRangoBpm(stats.currentBpm, rango)
    stats.dentroDeRango = evaluacion.dentroDeRango
    stats.estadoRitmo = evaluacion.estado

    // Evaluación de estabilidad de la frecuencia (desviación típica en la ventana)
    if (historial.length >= 5) {
      let sumaDiffSq = 0
      for (let i = 0; i < historial.length; i++) {
        sumaDiffSq += Math.pow(historial[i] - stats.averageBpm, 2)
      }
      const desviacion = Math.sqrt(sumaDiffSq / historial.length)

      if (desviacion < 3.0) {
        stats.estabilidad = 'Ritmo Muy Estable'
        stats.estabilidadNivel = 'alta'
      } else if (desviacion < 7.0) {
        stats.estabilidad = 'Ritmo Estable'
        stats.estabilidadNivel = 'normal'
      } else {
        stats.estabilidad = 'Ritmo Fluctuante'
        stats.estabilidadNivel = 'moderada'
      }
    }

    return stats
  }

  function reiniciar() {
    historial.length = 0
    stats.currentBpm = 0
    stats.instantBpm = 0
    stats.averageBpm = 0
    stats.minBpm = null
    stats.maxBpm = null
    stats.ibiMs = 0
    stats.totalLecturas = 0
    stats.estabilidad = 'Esperando señal...'
    stats.estabilidadNivel = 'normal'
    stats.dentroDeRango = true
    stats.estadoRitmo = 'normal'
  }

  return {
    stats,
    registrarLectura,
    reiniciar
  }
}
