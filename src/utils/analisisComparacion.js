import { calcularCorrelacionPearson, desplazarSenal } from './sincronizacionSenales.js'

/**
 * Motor de Análisis Automático de Comparación Fisiológica y Explicación de Diferencias (RF29).
 *
 * Cuantifica las diferencias entre la medición tomada y la señal de referencia
 * (frecuencia cardíaca, duración del ciclo RR, amplitud de perfusión y similitud morfológica
 * en escala de 0 a 100 %) y genera automáticamente la explicación fisiológica y hemodinámica
 * de a qué se debe cada variación observada.
 */

const esNumero = (v) => typeof v === 'number' && Number.isFinite(v)

/**
 * Cercanía entre dos pares de valores sueltos (BPM y amplitud). NO es una similitud de forma de onda:
 * solo sirve de dato auxiliar. Si falta un valor devuelve null; no se rellena con números inventados.
 */
export function calcularSimilitudComparacion({
  bpmActual = null,
  bpmReferencia = null,
  amplitudActual = null,
  amplitudReferencia = null
} = {}) {
  if (!esNumero(bpmActual) || !esNumero(bpmReferencia) || bpmActual <= 0 || bpmReferencia <= 0) return null
  const difRelBpm = Math.abs(bpmActual - bpmReferencia) / Math.max(bpmActual, bpmReferencia)
  let penalizacion = difRelBpm * 0.45
  if (esNumero(amplitudActual) && esNumero(amplitudReferencia) && amplitudActual > 0 && amplitudReferencia > 0) {
    penalizacion += (Math.abs(amplitudActual - amplitudReferencia) / Math.max(amplitudActual, amplitudReferencia)) * 0.15
  }
  return Number(Math.max(0, Math.min(100, (1 - penalizacion) * 100)).toFixed(1))
}

/** Lleva una señal a la escala 0 a 1. Devuelve null si no es una señal usable (vacía, con valores no numéricos o plana). */
export function normalizarSenal(muestras) {
  if (!Array.isArray(muestras) || muestras.length < 2) return null
  let min = Infinity
  let max = -Infinity
  for (const v of muestras) {
    if (!esNumero(v)) return null
    if (v < min) min = v
    if (v > max) max = v
  }
  if (!(max > min)) return null
  return muestras.map((v) => (v - min) / (max - min))
}

/**
 * Similitud (0 a 100) entre la FORMA de dos señales: correlación de Pearson de las señales normalizadas,
 * tomando el mejor desfase de hasta 0,65 s. Un valor negativo cuenta como 0.
 * Necesita al menos 1 s de señal en cada una; si no hay señal usable devuelve null (no inventa un valor).
 */
export function calcularSimilitudForma(senalActual, senalReferencia, frecuenciaHz = 100) {
  if (!Array.isArray(senalActual) || !Array.isArray(senalReferencia)) return null
  if (!esNumero(frecuenciaHz) || frecuenciaHz <= 0) return null
  const n = Math.min(senalActual.length, senalReferencia.length, Math.round(frecuenciaHz * 5))
  if (n < frecuenciaHz) return null
  const a = normalizarSenal(senalActual.slice(0, n))
  const b = normalizarSenal(senalReferencia.slice(0, n))
  if (!a || !b) return null

  const maxLag = Math.min(Math.floor(n / 3), Math.round(frecuenciaHz * 0.65))
  let mejor = -1
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    const r = calcularCorrelacionPearson(a, desplazarSenal(b, lag))
    if (Number.isFinite(r) && r > mejor) mejor = r
  }
  return Number((Math.max(0, mejor) * 100).toFixed(1))
}

function formatearConSigno(valor, decimales = 0) {
  const num = Number(valor) || 0
  const fijo = decimales > 0 ? num.toFixed(decimales) : String(Math.round(num))
  if (num > 0) return `+${fijo}`
  return fijo
}

/**
 * Genera el análisis automático completo de la comparación y explica a qué se debe la diferencia (RF29).
 */
export function generarAnalisisAutomaticoComparacion({
  bpmActual = null,
  bpmReferencia = null,
  amplitudActual = null,
  amplitudReferencia = null,
  spo2Actual = null,
  spo2Referencia = null,
  similitudPorcentaje = null,
  senalActual = null,
  senalReferencia = null,
  frecuenciaHz = 100,
  nombreMedicion = 'Medición Tomada',
  nombreReferencia = 'Señal de Referencia',
  actividadReferencia = 'Reposo'
} = {}) {
  // Sin la frecuencia de ambos registros no hay nada que comparar: no se rellena con valores supuestos.
  const bpmValido = (v) => esNumero(v) && v >= 20 && v <= 300
  const faltantes = []
  if (!bpmValido(bpmActual)) faltantes.push('BPM de la medición')
  if (!bpmValido(bpmReferencia)) faltantes.push('BPM de la referencia')
  if (faltantes.length) {
    return {
      disponible: false,
      faltantes,
      motivo: `Falta información para analizar: ${faltantes.join(' y ')}.`
    }
  }

  const bActual = bpmActual
  const bRef = bpmReferencia
  // La amplitud y la saturación son opcionales: si no se midieron quedan en null.
  const tieneAmp = esNumero(amplitudActual) && esNumero(amplitudReferencia) && amplitudActual > 0 && amplitudReferencia > 0
  const ampActual = tieneAmp ? amplitudActual : null
  const ampRef = tieneAmp ? amplitudReferencia : null
  const tieneSpo2 = esNumero(spo2Actual) && esNumero(spo2Referencia)

  const cicloActualMs = Math.round(60000 / bActual)
  const cicloReferenciaMs = Math.round(60000 / bRef)

  const deltaBpm = Number((bActual - bRef).toFixed(1))
  const absDeltaBpm = Math.abs(deltaBpm)
  const porcentajeDeltaBpm = Number(((deltaBpm / bRef) * 100).toFixed(1))
  const deltaCicloMs = cicloActualMs - cicloReferenciaMs
  const deltaAmplitud = tieneAmp ? Number((ampActual - ampRef).toFixed(1)) : null
  const deltaSpo2 = tieneSpo2 ? Number((spo2Actual - spo2Referencia).toFixed(1)) : null

  // Similitud de la FORMA de la señal: la indicada, la calculada con las señales, o ninguna (null).
  let similitud = null
  let fuenteSimilitud = 'no_disponible'
  if (esNumero(similitudPorcentaje)) {
    similitud = Number(similitudPorcentaje.toFixed(1))
    fuenteSimilitud = 'indicada'
  } else {
    const calculada = calcularSimilitudForma(senalActual, senalReferencia, frecuenciaHz)
    if (calculada !== null) {
      similitud = calculada
      fuenteSimilitud = 'senal'
    }
  }
  const textoSimilitud = similitud !== null ? ` y una similitud morfológica del ${similitud.toFixed(1)}%` : ''

  const textoDeltaBpm = `${formatearConSigno(deltaBpm, Number.isInteger(deltaBpm) ? 0 : 1)} BPM`
  const textoPorcentajeBpm = `${formatearConSigno(porcentajeDeltaBpm, 1)}%`
  const textoDeltaCiclo = `${formatearConSigno(deltaCicloMs, 0)} ms`

  // 1. Clasificación del nivel de concordancia y diferencia
  let nivelConcordancia = 'alta'
  let claseEstado = 'estado-alta'
  let etiquetaEstado = ''

  if (absDeltaBpm <= 8) {
    nivelConcordancia = 'alta'
    claseEstado = 'estado-alta'
    etiquetaEstado = absDeltaBpm <= 2
      ? `Concordancia Alta · Ritmos Equivalentes (${textoDeltaBpm})`
      : `Concordancia Alta · Diferencia Leve (${textoDeltaBpm})`
  } else if (absDeltaBpm <= 20) {
    nivelConcordancia = 'moderada'
    claseEstado = 'estado-moderada'
    etiquetaEstado = `Concordancia Moderada · Variación Media (${textoDeltaBpm})`
  } else {
    nivelConcordancia = 'baja'
    claseEstado = 'estado-baja'
    etiquetaEstado = `Concordancia Baja · Diferencia Marcada (${textoDeltaBpm})`
  }

  // 2. Resumen diagnóstico automático del contraste
  let diagnosticoResumen = ''
  if (absDeltaBpm <= 2) {
    diagnosticoResumen = `La ${nombreMedicion.toLowerCase()} (${bActual} BPM, ciclo de ${cicloActualMs} ms) presenta una coincidencia cronotrópica casi exacta (${textoDeltaBpm}) frente a la ${nombreReferencia.toLowerCase()} (${bRef} BPM, ciclo de ${cicloReferenciaMs} ms), con una variación de período de ${textoDeltaCiclo}${textoSimilitud}.`
  } else if (deltaBpm > 0) {
    diagnosticoResumen = `La ${nombreMedicion.toLowerCase()} (${bActual} BPM, ciclo de ${cicloActualMs} ms) presenta una elevación fisiológica de ${textoDeltaBpm} (${textoPorcentajeBpm}) frente a la ${nombreReferencia.toLowerCase()} (${bRef} BPM, ciclo de ${cicloReferenciaMs} ms), con un acortamiento del período cardíaco de ${textoDeltaCiclo}${textoSimilitud}.`
  } else {
    diagnosticoResumen = `La ${nombreMedicion.toLowerCase()} (${bActual} BPM, ciclo de ${cicloActualMs} ms) presenta una reducción fisiológica de ${textoDeltaBpm} (${textoPorcentajeBpm}) frente a la ${nombreReferencia.toLowerCase()} (${bRef} BPM, ciclo de ${cicloReferenciaMs} ms), con una prolongación del período cardíaco de ${textoDeltaCiclo}${textoSimilitud}.`
  }

  // 3. Explicación 1: Variación de Frecuencia y Ciclo
  let textoExplicacionFrecuencia = ''
  if (absDeltaBpm <= 2) {
    textoExplicacionFrecuencia = 'Ambos registros comparten un equilibrio autonómico basal equivalente sobre el nodo sinusal, manteniendo tiempos de eyección sistólica y relajación diastólica prácticamente idénticos.'
  } else if (deltaBpm > 0) {
    textoExplicacionFrecuencia = 'Se debe a una mayor modulación del sistema nervioso simpático sobre el nodo sinusal, lo que acelera la despolarización espontánea y acorta la fase de relajación diastólica.'
  } else {
    textoExplicacionFrecuencia = 'Se debe a un predominio del tono vagal (sistema nervioso parasimpático) sobre el nodo sinusal, lo que enlentece la descarga marcapasos y prolonga la fase de llenado diastólico ventricular.'
  }

  const explicacionFrecuencia = {
    titulo: `1. Variación de Frecuencia y Ciclo (${textoDeltaCiclo})`,
    badge: `${textoDeltaBpm} (${bActual} vs ${bRef} BPM)`,
    explicacion: textoExplicacionFrecuencia
  }

  // 4. Explicación 2: Morfología de Onda y Perfusión
  let textoExplicacionMorfologia = ''
  if (deltaAmplitud === null) {
    textoExplicacionMorfologia = 'No se midió la amplitud del pulso en ambos registros, así que no se puede explicar la diferencia de perfusión; solo se compara la frecuencia.'
  } else if (Math.abs(deltaAmplitud) <= 10) {
    textoExplicacionMorfologia = 'Las diferencias sutiles en la pendiente sistólica y la muesca dicrótica se deben a variaciones en la elasticidad arterial periférica, el volumen sistólico y la presión de contacto en el sensor óptico.'
  } else if (deltaAmplitud > 10) {
    textoExplicacionMorfologia = `La mayor amplitud del pulso (${ampActual}% vs ${ampRef}%) se debe a vasodilatación periférica distal, mayor volumen de eyección sistólica o mejor perfusión capilar en el sitio de medición.`
  } else {
    textoExplicacionMorfologia = `La menor amplitud del pulso (${ampActual}% vs ${ampRef}%) se debe a vasoconstricción periférica (por frío o tono simpático), menor índice de perfusión distal o exceso de presión del dedo sobre el sensor.`
  }

  const explicacionMorfologia = {
    titulo: `2. Morfología de Onda y Perfusión${similitud !== null ? ` (${similitud.toFixed(1)}%)` : ''}`,
    badge: tieneAmp ? `Amplitud ${ampActual}%` : 'Amplitud no medida',
    explicacion: textoExplicacionMorfologia
  }

  // 5. Explicación 3: Factores Basales y Contexto Probable
  const causas = []
  if (deltaBpm > 15) {
    causas.push('Actividad física reciente, esfuerzo muscular o aumento de la demanda metabólica de oxígeno')
    causas.push('Activación simpática aguda por estrés, alerta cognitiva o consumo reciente de estimulantes (cafeína)')
    causas.push('Transición postural ortostática o ajuste hemodinámico del retorno venoso')
  } else if (deltaBpm > 2) {
    causas.push('Transición postural o actividad física reciente')
    causas.push('Efecto de estrés basal, alerta o consumo de cafeína')
    causas.push('Variabilidad fisiológica natural entre registros')
  } else if (deltaBpm < -10) {
    causas.push('Reposo prolongado con predominio parasimpático (tono vagal elevado)')
    causas.push('Adaptación cardiovascular por entrenamiento aeróbico o relajación profunda')
    causas.push('Diferencia de estado basal respecto a la condición de la señal comparada')
  } else if (deltaBpm < -2) {
    causas.push('Mayor grado de reposo físico y estabilización respiratoria durante la toma')
    causas.push('Reducción de estímulos simpáticos ambientales o recuperación post-actividad')
    causas.push('Variabilidad fisiológica natural entre registros')
  } else {
    causas.push('Condiciones basales de reposo equivalentes entre ambos registros')
    causas.push('Estabilidad térmica y hemodinámica periférica durante la captura óptica')
    causas.push('Variabilidad fisiológica natural latido a latido (arritmia sinusal respiratoria)')
  }

  const factoresCausales = {
    titulo: '3. Factores Basales y Contexto Probable',
    badge: 'Causas Contribuyentes',
    causas
  }

  return {
    disponible: true,
    fuenteSimilitud,
    bpmActual: bActual,
    bpmReferencia: bRef,
    cicloActualMs,
    cicloReferenciaMs,
    deltaBpm,
    porcentajeDeltaBpm,
    deltaCicloMs,
    amplitudActual: ampActual,
    amplitudReferencia: ampRef,
    deltaAmplitud,
    deltaSpo2,
    similitudPorcentaje: similitud,
    nivelConcordancia,
    claseEstado,
    etiquetaEstado,
    diagnosticoResumen,
    explicacionFrecuencia,
    explicacionMorfologia,
    factoresCausales,
    actividadReferencia
  }
}
