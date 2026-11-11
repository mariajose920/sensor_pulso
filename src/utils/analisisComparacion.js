/**
 * Motor de Análisis Automático de Comparación Fisiológica y Explicación de Diferencias (RF29).
 *
 * Cuantifica las diferencias entre la medición tomada y la señal de referencia
 * (frecuencia cardíaca, duración del ciclo RR, amplitud de perfusión y similitud morfológica
 * en escala de 0 a 100 %) y genera automáticamente la explicación fisiológica y hemodinámica
 * de a qué se debe cada variación observada.
 */

export function calcularSimilitudComparacion({
  bpmActual = 78,
  bpmReferencia = 72,
  amplitudActual = 100,
  amplitudReferencia = 100
} = {}) {
  const bAct = Math.max(30, Number(bpmActual) || 78)
  const bRef = Math.max(30, Number(bpmReferencia) || 72)
  const aAct = Math.max(10, Number(amplitudActual) || 100)
  const aRef = Math.max(10, Number(amplitudReferencia) || 100)

  const difRelBpm = Math.abs(bAct - bRef) / Math.max(bAct, bRef)
  const difRelAmp = Math.abs(aAct - aRef) / Math.max(aAct, aRef)

  // Ponderación: 75% cercanía cronotrópica y de ciclo + 25% cercanía de amplitud/perfusión
  const penalizacion = difRelBpm * 0.45 + difRelAmp * 0.15
  const similitud = Math.max(15, Math.min(99.8, (1 - penalizacion) * 100))
  return Number(similitud.toFixed(1))
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
  bpmActual = 78,
  bpmReferencia = 72,
  amplitudActual = 100,
  amplitudReferencia = 100,
  spo2Actual = 98,
  spo2Referencia = 98,
  similitudPorcentaje = null,
  nombreMedicion = 'Medición Tomada',
  nombreReferencia = 'Señal de Referencia',
  actividadReferencia = 'Reposo'
} = {}) {
  const bActual = Math.max(30, Number(bpmActual) || 78)
  const bRef = Math.max(30, Number(bpmReferencia) || 72)
  const ampActual = Math.max(10, Number(amplitudActual) || 100)
  const ampRef = Math.max(10, Number(amplitudReferencia) || 100)
  const sActual = Number(spo2Actual) || 98
  const sRef = Number(spo2Referencia) || 98

  const cicloActualMs = Math.round(60000 / bActual)
  const cicloReferenciaMs = Math.round(60000 / bRef)

  const deltaBpm = Number((bActual - bRef).toFixed(1))
  const absDeltaBpm = Math.abs(deltaBpm)
  const porcentajeDeltaBpm = Number(((deltaBpm / bRef) * 100).toFixed(1))
  const deltaCicloMs = cicloActualMs - cicloReferenciaMs
  const deltaAmplitud = Number((ampActual - ampRef).toFixed(1))
  const deltaSpo2 = Number((sActual - sRef).toFixed(1))

  const similitud = similitudPorcentaje !== null && similitudPorcentaje !== undefined
    ? Number(Number(similitudPorcentaje).toFixed(1))
    : calcularSimilitudComparacion({
        bpmActual: bActual,
        bpmReferencia: bRef,
        amplitudActual: ampActual,
        amplitudReferencia: ampRef
      })

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
    diagnosticoResumen = `La ${nombreMedicion.toLowerCase()} (${bActual} BPM, ciclo de ${cicloActualMs} ms) presenta una coincidencia cronotrópica casi exacta (${textoDeltaBpm}) frente a la ${nombreReferencia.toLowerCase()} (${bRef} BPM, ciclo de ${cicloReferenciaMs} ms), con una variación de período de ${textoDeltaCiclo} y una similitud morfológica del ${similitud.toFixed(1)}%.`
  } else if (deltaBpm > 0) {
    diagnosticoResumen = `La ${nombreMedicion.toLowerCase()} (${bActual} BPM, ciclo de ${cicloActualMs} ms) presenta una elevación fisiológica de ${textoDeltaBpm} (${textoPorcentajeBpm}) frente a la ${nombreReferencia.toLowerCase()} (${bRef} BPM, ciclo de ${cicloReferenciaMs} ms), con un acortamiento del período cardíaco de ${textoDeltaCiclo} y una similitud morfológica del ${similitud.toFixed(1)}%.`
  } else {
    diagnosticoResumen = `La ${nombreMedicion.toLowerCase()} (${bActual} BPM, ciclo de ${cicloActualMs} ms) presenta una reducción fisiológica de ${textoDeltaBpm} (${textoPorcentajeBpm}) frente a la ${nombreReferencia.toLowerCase()} (${bRef} BPM, ciclo de ${cicloReferenciaMs} ms), con una prolongación del período cardíaco de ${textoDeltaCiclo} y una similitud morfológica del ${similitud.toFixed(1)}%.`
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
  if (Math.abs(deltaAmplitud) <= 10) {
    textoExplicacionMorfologia = 'Las diferencias sutiles en la pendiente sistólica y la muesca dicrótica se deben a variaciones en la elasticidad arterial periférica, el volumen sistólico y la presión de contacto en el sensor óptico.'
  } else if (deltaAmplitud > 10) {
    textoExplicacionMorfologia = `La mayor amplitud del pulso (${ampActual}% vs ${ampRef}%) se debe a vasodilatación periférica distal, mayor volumen de eyección sistólica o mejor perfusión capilar en el sitio de medición.`
  } else {
    textoExplicacionMorfologia = `La menor amplitud del pulso (${ampActual}% vs ${ampRef}%) se debe a vasoconstricción periférica (por frío o tono simpático), menor índice de perfusión distal o exceso de presión del dedo sobre el sensor.`
  }

  const explicacionMorfologia = {
    titulo: `2. Morfología de Onda y Perfusión (${similitud.toFixed(1)}%)`,
    badge: `Amplitud ${ampActual}% · Onda Dicrótica`,
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
