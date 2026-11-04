/**
 * ============================================================================
 * sensor_pulso · Motor de Comparación de Valores con Rangos Fisiológicos (RF20)
 * ============================================================================
 * Compara los biomarcadores medidos (frecuencia cardíaca en BPM y saturación de
 * oxígeno en SpO₂) contra los rangos de referencia aplicables según la edad y
 * contexto del participante (AHA y catálogo de rangos del sistema).
 * ============================================================================
 */

import { obtenerRangosBpmEsperados, esBpmValido } from '../services/bpmService.js'
import { esSpo2Valido, SPO2_UMBRAL_NORMAL } from '../services/spo2Service.js'

/**
 * Obtiene el rango de referencia integrado (BPM y SpO₂) para una edad y actividad dadas.
 * @param {number} edad - Edad del paciente en años
 * @param {string|number} actividad - Nombre o código de la actividad
 * @param {object|null} rangoPersonalizado - Rango opcional desde la base de datos
 * @returns {{ bpm_min: number, bpm_max: number, spo2_min: number, spo2_max: number, descripcion: string }}
 */
export function obtenerRangoReferencia(edad = 25, actividad = 'reposo', rangoPersonalizado = null) {
  if (rangoPersonalizado && typeof rangoPersonalizado === 'object') {
    const bMin = Number(rangoPersonalizado.bpm_min)
    const bMax = Number(rangoPersonalizado.bpm_max)
    const sMin = Number(rangoPersonalizado.spo2_min)
    const sMax = Number(rangoPersonalizado.spo2_max || 100)

    if (!isNaN(bMin) && !isNaN(bMax) && !isNaN(sMin)) {
      return {
        bpm_min: bMin,
        bpm_max: bMax,
        spo2_min: sMin,
        spo2_max: sMax,
        descripcion: rangoPersonalizado.descripcion || `Rango configurado (${bMin}-${bMax} BPM, SpO₂ ≥${sMin}%)`
      }
    }
  }

  // Rango fisiológico según la American Heart Association
  const rangoBpm = obtenerRangosBpmEsperados(edad, actividad)

  return {
    bpm_min: rangoBpm.min,
    bpm_max: rangoBpm.max,
    spo2_min: 95,
    spo2_max: 100,
    descripcion: rangoBpm.descripcion
  }
}

/**
 * Evalúa cuantitativa y cualitativamente si los valores medidos se encuentran
 * dentro o fuera del rango de referencia.
 *
 * @param {object} params
 * @param {number} params.bpm - Frecuencia cardíaca observada en BPM
 * @param {number} [params.spo2] - Saturación de oxígeno en %
 * @param {object} [params.rango] - Rango explícito { bpm_min, bpm_max, spo2_min, spo2_max }
 * @param {number} [params.edad=25] - Edad del participante
 * @param {string} [params.actividad='reposo'] - Actividad o contexto basal
 * @returns {object} Resultado estructurado de la comparación
 */
export function evaluarComparacionRango({
  bpm,
  spo2 = null,
  rango = null,
  edad = 25,
  actividad = 'reposo'
}) {
  const ref = obtenerRangoReferencia(edad, actividad, rango)
  const numBpm = Number(bpm)
  const tieneBpm = esBpmValido(numBpm)
  const numSpo2 = spo2 !== null && spo2 !== undefined ? Number(spo2) : null
  const tieneSpo2 = numSpo2 !== null && esSpo2Valido(numSpo2)

  // 1. Evaluación de Frecuencia Cardíaca (BPM)
  const evalBpm = {
    valor: tieneBpm ? numBpm : null,
    min: ref.bpm_min,
    max: ref.bpm_max,
    dentro: false,
    estado: 'invalido', // 'dentro' | 'alto' | 'bajo' | 'invalido'
    diferencia: 0,
    diagnostico: 'Sin lectura válida de pulso',
    porcentajeEscala: 50
  }

  if (tieneBpm) {
    if (numBpm > ref.bpm_max) {
      evalBpm.dentro = false
      evalBpm.estado = 'alto'
      evalBpm.diferencia = parseFloat((numBpm - ref.bpm_max).toFixed(1))
      evalBpm.diagnostico = `Frecuencia elevada (+${evalBpm.diferencia} BPM sobre el límite superior de ${ref.bpm_max} BPM)`
    } else if (numBpm < ref.bpm_min) {
      evalBpm.dentro = false
      evalBpm.estado = 'bajo'
      evalBpm.diferencia = parseFloat((numBpm - ref.bpm_min).toFixed(1))
      evalBpm.diagnostico = `Frecuencia reducida (${Math.abs(evalBpm.diferencia)} BPM bajo el límite inferior de ${ref.bpm_min} BPM)`
    } else {
      evalBpm.dentro = true
      evalBpm.estado = 'dentro'
      evalBpm.diferencia = 0
      evalBpm.diagnostico = `Normocardia dentro de rango (${ref.bpm_min} - ${ref.bpm_max} BPM)`
    }

    // Cálculo de posición en escala visual continua (escala de 40 a 160 BPM)
    const escalaMin = Math.max(30, ref.bpm_min - 20)
    const escalaMax = Math.min(200, ref.bpm_max + 35)
    const rawPct = ((numBpm - escalaMin) / (escalaMax - escalaMin)) * 100
    evalBpm.porcentajeEscala = Math.max(4, Math.min(96, parseFloat(rawPct.toFixed(1))))
  }

  // 2. Evaluación de Saturación de Oxígeno (SpO₂)
  const evalSpo2 = {
    valor: tieneSpo2 ? numSpo2 : null,
    min: ref.spo2_min,
    max: ref.spo2_max,
    dentro: false,
    estado: 'invalido', // 'dentro' | 'bajo' | 'invalido'
    diferencia: 0,
    diagnostico: 'Sin lectura óptica de SpO₂',
    porcentajeEscala: 90
  }

  if (tieneSpo2) {
    if (numSpo2 < ref.spo2_min) {
      evalSpo2.dentro = false
      evalSpo2.estado = 'bajo'
      evalSpo2.diferencia = parseFloat((ref.spo2_min - numSpo2).toFixed(1))
      evalSpo2.diagnostico = `Desaturación arterial (${evalSpo2.diferencia}% bajo el umbral normoxémico de ${ref.spo2_min}%)`
    } else {
      evalSpo2.dentro = true
      evalSpo2.estado = 'dentro'
      evalSpo2.diferencia = 0
      evalSpo2.diagnostico = `Normoxemia adecuada (≥${ref.spo2_min}%)`
    }

    // Escala SpO₂ (de 80% a 100%)
    const rawPctSpo2 = ((numSpo2 - 80) / (100 - 80)) * 100
    evalSpo2.porcentajeEscala = Math.max(4, Math.min(96, parseFloat(rawPctSpo2.toFixed(1))))
  }

  // 3. Determinación de Estado Global (RF20)
  // Si no hay BPM válido, no se puede certificar rango
  let estadoGlobal = 'sin_datos'
  let dentroDeRango = null
  let resumenClinico = 'En espera de bioseñales válidas para contrastar con el rango.'

  if (tieneBpm) {
    // Si hay SpO₂, ambos deben cumplir; si solo hay BPM, se evalúa BPM
    const spo2Cumple = !tieneSpo2 || evalSpo2.dentro
    dentroDeRango = evalBpm.dentro && spo2Cumple

    if (dentroDeRango) {
      estadoGlobal = 'dentro'
      resumenClinico = `Los biomarcadores registrados coinciden con los rangos esperados para el participante en ${actividad}.`
    } else {
      estadoGlobal = 'fuera'
      const motivos = []
      if (!evalBpm.dentro) motivos.push(evalBpm.diagnostico)
      if (tieneSpo2 && !evalSpo2.dentro) motivos.push(evalSpo2.diagnostico)
      resumenClinico = `Biomarcador fuera de rango: ${motivos.join(' · ')}.`
    }
  }

  return {
    dentroDeRango,
    estadoGlobal, // 'dentro' | 'fuera' | 'sin_datos'
    etiquetaGlobal: dentroDeRango === true ? 'Dentro de rango' : dentroDeRango === false ? 'Fuera de rango' : 'Sin señal',
    rangoAplicado: ref,
    bpm: evalBpm,
    spo2: evalSpo2,
    resumenClinico
  }
}
