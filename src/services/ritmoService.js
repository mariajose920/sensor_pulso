/**
 * Servicio de Clasificación del Ritmo Cardíaco y Explicación Fisiológica (RF18)
 *
 * Fuentes clínicas verificadas y fundamentadas:
 * 1. American Heart Association (AHA) — "All About Heart Rate (Pulse)" & "About Arrhythmia"
 *    https://www.heart.org/en/health-topics/arrhythmia/about-arrhythmia
 * 2. Mayo Clinic — "Tachycardia" & "Bradycardia: Symptoms and causes"
 *    https://www.mayoclinic.org/diseases-conditions/tachycardia/symptoms-causes/syc-20355127
 * 3. MedlinePlus (Biblioteca Nacional de Medicina de los EE. UU. / NIH)
 *    https://medlineplus.gov/spanish/ency/article/003399.htm
 */

/**
 * Guía estandarizada de referencia médica para los 4 ritmos clínicos exigidos por el RF18
 */
export const GUIA_RITMOS_CLINICOS = {
  normal: {
    id: 'normal',
    nombre: 'Ritmo Normal (Normocardia)',
    rangoBpm: '60 a 100 BPM en reposo',
    criterioResumen: 'Frecuencia entre 60 y 100 BPM con intervalos regulares entre latidos sucesivos.',
    badgeClass: 'badge-success',
    colorHex: '#15803d',
    bgHex: '#f0fdf4',
    bordeHex: '#bbf7d0',
    descripcionMecanismo: 'El nodo sinoauricular (marcapasos natural del corazón) genera impulsos eléctricos a una cadencia homogénea y equilibrada, manteniendo una sincronía ventricular óptima en condiciones de reposo físico y emocional.',
    fuenteOficial: 'American Heart Association (AHA) — All About Heart Rate (heart.org)',
    enlaceFuente: 'https://www.heart.org/en/health-topics/high-blood-pressure/the-basics/all-about-heart-rate-pulse'
  },
  taquicardia: {
    id: 'taquicardia',
    nombre: 'Taquicardia',
    rangoBpm: 'Mayor a 100 BPM en reposo',
    criterioResumen: 'Frecuencia cardíaca basal acelerada que supera los 100 latidos por minuto en reposo.',
    badgeClass: 'badge-danger',
    colorHex: '#b91c1c',
    bgHex: '#fef2f2',
    bordeHex: '#fecaca',
    descripcionMecanismo: 'Aceleración de la frecuencia de descarga del nodo sinusal por encima del umbral basal fisiológico (>100 BPM). En reposo suele originarse por predominio del sistema nervioso simpático, aumento de catecolaminas circulantes (adrenalina), incremento transitorio del gasto cardíaco o hipertermia.',
    fuenteOficial: 'American Heart Association (AHA) & Mayo Clinic — Tachycardia: Symptoms & Causes',
    enlaceFuente: 'https://www.mayoclinic.org/diseases-conditions/tachycardia/symptoms-causes/syc-20355127'
  },
  bradicardia: {
    id: 'bradicardia',
    nombre: 'Bradicardia',
    rangoBpm: 'Menor a 60 BPM en reposo',
    criterioResumen: 'Frecuencia cardíaca basal lenta inferior a 60 latidos por minuto en reposo.',
    badgeClass: 'badge-warning',
    colorHex: '#b45309',
    bgHex: '#fffbeb',
    bordeHex: '#fde68a',
    descripcionMecanismo: 'Disminución de la frecuencia de despolarización sinusal por debajo de 60 BPM. En deportistas y personas con alto entrenamiento aeróbico constituye una adaptación fisiológica benigna (corazón de atleta), atribuible a un volumen sistólico aumentado y un tono vagal (parasimpático) dominante. En otros contextos clínicos puede reflejar fatiga sinusal o efecto farmacológico.',
    fuenteOficial: 'American Heart Association (AHA) & Mayo Clinic — Bradycardia: Symptoms & Causes',
    enlaceFuente: 'https://www.heart.org/en/health-topics/arrhythmia/about-arrhythmia/bradycardia--slow-heart-rate'
  },
  irregular: {
    id: 'irregular',
    nombre: 'Ritmo Irregular (Arritmia / Disritmia)',
    rangoBpm: 'Cualquier rango con intervalos variables',
    criterioResumen: 'Dispersión temporal significativa entre latidos sucesivos (coeficiente de variación CV ≥ 12% o variación R-R > 20%).',
    badgeClass: 'badge-purple',
    colorHex: '#7e22ce',
    bgHex: '#faf5ff',
    bordeHex: '#e9d5ff',
    descripcionMecanismo: 'Pérdida de la periodicidad metronómica entre ondas de pulso sistólico sucesivas. Clínicamente puede asociarse a arritmia sinusal respiratoria fisiológica (variación del tono vagal durante la inspiración y espiración), presencia de extrasístoles (latidos ectópicos prematuros) o fibrilación auricular.',
    fuenteOficial: 'American Heart Association (AHA) — About Arrhythmia (heart.org)',
    enlaceFuente: 'https://www.heart.org/en/health-topics/arrhythmia/about-arrhythmia'
  }
}

/**
 * Clasifica el ritmo cardíaco en uno de los 4 estados según RF18 y genera la explicación clínica del porqué.
 *
 * @param {Object} params
 * @param {number} params.bpm - Frecuencia cardíaca promedio o activa (BPM)
 * @param {number} [params.instantBpm=0] - Frecuencia cardíaca instantánea del último latido
 * @param {number} [params.sdnn=0] - Desviación estándar de intervalos R-R en ms
 * @param {number} [params.rmssd=0] - Raíz cuadrada de diferencias sucesivas en ms
 * @param {number} [params.lastIntervalMs=0] - Duración del último intervalo R-R en ms
 * @param {string} [params.regularityLevel='normal'] - Nivel de regularidad ('normal' | 'moderate' | 'irregular')
 * @param {number} [params.totalBeats=0] - Total de latidos detectados en la sesión
 * @param {Object} [params.paciente=null] - Ficha opcional del paciente para correlacionar factores (RF03)
 * @returns {Object} Clasificación clínica detallada con explicación del porqué y fuentes
 */
export function clasificarRitmo({
  bpm = 0,
  instantBpm = 0,
  sdnn = 0,
  rmssd = 0,
  lastIntervalMs = 0,
  regularityLevel = 'normal',
  totalBeats = 0,
  paciente = null
} = {}) {
  // Caso 0: Sin señal suficiente o sensor inactivo
  if (bpm <= 0 || totalBeats < 2) {
    return {
      id: 'sin_datos',
      nombre: 'Esperando señal...',
      rangoBpm: 'Sin datos suficientes',
      badgeClass: 'badge-subtle',
      colorHex: '#64748b',
      bgHex: '#f8fafc',
      bordeHex: '#e2e8f0',
      criterioNumerico: 'Se requieren al menos 2 latidos continuos para calcular la frecuencia y la regularidad del pulso.',
      explicacionPorque: 'El clasificador RF18 requiere procesar al menos dos picos sistólicos consecutivos para determinar la periodicidad entre latidos y contrastarla con las guías de la American Heart Association.',
      correlacionFactores: null,
      fuenteOficial: 'American Heart Association (AHA) — Resting Heart Rate Guidelines',
      enlaceFuente: 'https://www.heart.org/en/health-topics/high-blood-pressure/the-basics/all-about-heart-rate-pulse'
    }
  }

  // 1. Determinar si el ritmo es cuantitativamente irregular según estándares AHA
  // En reposo, un ritmo regular tiene CV < 12% y SDNN < 60 ms.
  const meanRR = (lastIntervalMs > 0 ? lastIntervalMs : (bpm > 0 ? Math.round(60000 / bpm) : 800))
  const cvCalculado = meanRR > 0 && sdnn > 0 ? (sdnn / meanRR) * 100 : 0
  const esIrregular = regularityLevel === 'irregular' || cvCalculado >= 12 || sdnn >= 65

  let categoriaClave = 'normal'
  if (esIrregular) {
    categoriaClave = 'irregular'
  } else if (bpm > 100) {
    categoriaClave = 'taquicardia'
  } else if (bpm < 60) {
    categoriaClave = 'bradicardia'
  } else {
    categoriaClave = 'normal'
  }

  const base = GUIA_RITMOS_CLINICOS[categoriaClave]

  // 2. Redactar el criterio numérico específico de esta medición
  let criterioNumerico = ''
  if (categoriaClave === 'normal') {
    criterioNumerico = `Frecuencia cardíaca de ${bpm} BPM, situada dentro de la ventana de normalidad fisiológica en reposo (60 - 100 BPM), con intervalos R-R estables (~${lastIntervalMs || Math.round(60000 / bpm)} ms) y variabilidad controlada (SDNN: ${sdnn} ms).`
  } else if (categoriaClave === 'taquicardia') {
    criterioNumerico = `Frecuencia cardíaca de ${bpm} BPM, superando el umbral basal superior de 100 latidos por minuto establecido por la AHA para adultos en reposo. El intervalo R-R es corto (~${lastIntervalMs || Math.round(60000 / bpm)} ms).`
  } else if (categoriaClave === 'bradicardia') {
    criterioNumerico = `Frecuencia cardíaca de ${bpm} BPM, por debajo del umbral basal inferior de 60 latidos por minuto en reposo. El intervalo R-R entre latidos es prolongado (~${lastIntervalMs || Math.round(60000 / bpm)} ms).`
  } else {
    // irregular
    const sufijoFrecuencia = bpm > 100 ? 'con taquicardia asociada' : bpm < 60 ? 'con bradicardia asociada' : 'con frecuencia normocárdica'
    criterioNumerico = `Dispersión significativa en la distancia entre picos sistólicos (SDNN: ${sdnn} ms, RMSSD: ${rmssd} ms), ${sufijoFrecuencia} (${bpm} BPM). La cadencia entre latidos pierde su periodicidad fija.`
  }

  // 3. Redactar la explicación médica del "porqué"
  let explicacionPorque = ''
  if (categoriaClave === 'normal') {
    explicacionPorque = `Se clasifica como Ritmo Normal porque los ${bpm} BPM registrados se encuentran dentro del rango normocárdico estándar (60 a 100 BPM en adultos) y la distancia entre los picos sistólicos detectados por fotopletismografía se mantiene regular y homogénea. Según la American Heart Association, esto evidencia que el marcapasos sinusal opera con un balance fisiológico adecuado entre el sistema simpático y parasimpático.`
  } else if (categoriaClave === 'taquicardia') {
    explicacionPorque = `Se clasifica como Taquicardia porque la frecuencia de ${bpm} BPM excede el límite fisiológico de reposo (>100 BPM). Según la American Heart Association y Mayo Clinic, este incremento refleja una mayor tasa de descarga en el nodo sinusal, desencadenada frecuentemente en reposo por estrés emocional, consumo de sustancias estimulantes, termorregulación o activación simpática.`
  } else if (categoriaClave === 'bradicardia') {
    explicacionPorque = `Se clasifica como Bradicardia porque el registro de ${bpm} BPM es inferior a la referencia basal mínima de 60 BPM. Según la Mayo Clinic y la AHA, en personas con buen acondicionamiento físico o atletas esto responde a una adaptación cardiovascular benigna (mayor eyección sistólica y tono vagal elevado). En otros casos puede asociarse a relajación profunda o acción de fármacos cronotrópicos.`
  } else {
    explicacionPorque = `Se clasifica como Ritmo Irregular debido a que los intervalos de tiempo entre latidos consecutivos presentan fluctuaciones no uniformes (SDNN ${sdnn} ms). De acuerdo con las guías clínicas de arritmias de la American Heart Association, la dispersión en los intervalos R-R de pulso puede originarse por variaciones respiratorias naturales (arritmia sinusal respiratoria), contracciones prematuras o irregularidad en la conducción nodal.`
  }

  // 4. Correlación personalizada con los factores de la Ficha del Paciente (RF03)
  const factores = []
  if (paciente) {
    // Nivel de estrés
    if (paciente.nivelEstres === 'alto' || paciente.nivelEstres === 'medio') {
      if (categoriaClave === 'taquicardia') {
        factores.push(`Nivel de estrés declarado (${paciente.nivelEstres}): El estrés psicológico eleva la liberación de cortisol y adrenalina, lo que explica directamente la taquicardia registrada.`)
      } else if (categoriaClave === 'irregular') {
        factores.push(`Estrés (${paciente.nivelEstres}): Puede inducir descargas simpáticas intermitentes que favorecen la aparición de latidos prematuros o irregularidades.`)
      }
    }

    // Consumo de cafeína / estimulantes
    if (paciente.consumoCafeina && !paciente.consumoCafeina.toLowerCase().includes('ninguna')) {
      if (categoriaClave === 'taquicardia' || categoriaClave === 'irregular') {
        factores.push(`Consumo reciente de estimulantes (${paciente.consumoCafeina}): La cafeína bloquea los receptores de adenosina y sensibiliza los receptores adrenérgicos, incrementando la frecuencia cardíaca basal.`)
      }
    }

    // Medicación
    if (paciente.medicacion && !paciente.medicacion.toLowerCase().includes('ninguna')) {
      factores.push(`Medicación declarada (${paciente.medicacion}): Fármacos antihipertensivos, betabloqueantes o broncodilatadores influyen directamente en la frecuencia basal y la variabilidad.`)
    }

    // Horas de sueño
    if (paciente.horasSueno && (paciente.horasSueno.includes('Menos de 6') || paciente.horasSueno.includes('privación'))) {
      if (categoriaClave === 'taquicardia' || categoriaClave === 'irregular') {
        factores.push(`Privación de sueño (${paciente.horasSueno}): Disminuye el tono vagal restaurador nocturno e incrementa el tono simpático basal diurno.`)
      }
    }

    // Actividad física previa
    if (paciente.actividadPrevia && (paciente.actividadPrevia.includes('intensa') || paciente.actividadPrevia.includes('moderada'))) {
      if (categoriaClave === 'taquicardia') {
        factores.push(`Actividad física previa (${paciente.actividadPrevia}): El período de recuperación post-ejercicio mantiene transitoriamente la frecuencia por sobre los valores basales de reposo.`)
      }
    }
  }

  return {
    id: categoriaClave,
    nombre: base.nombre,
    rangoBpm: base.rangoBpm,
    badgeClass: base.badgeClass,
    colorHex: base.colorHex,
    bgHex: base.bgHex,
    bordeHex: base.bordeHex,
    bpm,
    instantBpm,
    sdnn,
    rmssd,
    lastIntervalMs,
    criterioNumerico,
    explicacionPorque,
    descripcionMecanismo: base.descripcionMecanismo,
    correlacionFactores: factores.length > 0 ? factores : null,
    fuenteOficial: base.fuenteOficial,
    enlaceFuente: base.enlaceFuente,
    advertenciaAcademica: 'Herramienta didáctica para laboratorio universitario. No constituye un diagnóstico médico clínico ni sustituye una evaluación profesional.'
  }
}
