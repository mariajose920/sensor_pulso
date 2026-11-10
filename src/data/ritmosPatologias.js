/**
 * ============================================================================
 * sensor_pulso · Catálogo de Patologías y Arritmias Precargadas (RF25)
 * ============================================================================
 * Biblioteca de ritmos fisiopatológicos y arritmias clínicas con generación
 * matemática dual sincronizada: onda fotopletismográfica periférica (PPG) y
 * trazado electrocardiográfico equivalente de referencia didáctica (ECG).
 * ============================================================================
 */

import { ppgWaveform, ecgEducationalWaveform } from '../utils/ppgMath.js'

/**
 * Catálogo canónico de ritmos y arritmias precargadas del sistema.
 */
export const RITMOS_PATOLOGIAS = [
  {
    id: 'sinusal_normal',
    nombre: 'Ritmo Sinusal Normal',
    categoria: 'sinusal',
    categoriaEtiqueta: 'Sinusales',
    bpm: 72.0,
    regularidad: 'regular',
    regularidadTexto: 'Isócrono (Regular)',
    severidad: 'normal',
    severidadTexto: 'Normal / Control',
    descripcionCorta: 'Frecuencia basal esperada en reposo con conducción auriculoventricular íntegra.',
    fisiopatologia: 'El marcapasos fisiológico del corazón (nodo sinoauricular) despolariza a frecuencia normal (60-100 BPM). La contracción auricular precede a la eyección ventricular con llenado diastólico óptimo.',
    criterioPpg: 'Onda de pulso uniforme con ascenso sistólico empinado, escotadura dícrota nítida por cierre aórtico y onda diastólica por rebote elástico vascular.',
    criterioEcg: 'Ondas P positivas precediendo a cada complejo QRS estrecho (<120 ms), intervalo PR constante (120-200 ms) e intervalos R-R uniformes.',
    colorHex: '#16a34a',
    bgHex: '#dcfce7',
    badgeClass: 'badge-success'
  },
  {
    id: 'taquicardia_sinusal',
    nombre: 'Taquicardia Sinusal',
    categoria: 'sinusal',
    categoriaEtiqueta: 'Sinusales',
    bpm: 125.0,
    regularidad: 'regular',
    regularidadTexto: 'Acelerado Regular',
    severidad: 'leve',
    severidadTexto: 'Precaución / Frecuente',
    descripcionCorta: 'Frecuencia cardíaca acelerada (>100 BPM) originada en el nodo SA por demanda metabólica o simpática.',
    fisiopatologia: 'Aumento del automatismo del nodo sinusal ante ejercicio, fiebre, dolor, estrés o cafeína. El tiempo de llenado diastólico se reduce considerablemente.',
    criterioPpg: 'Ciclos de pulso compactos en el tiempo. La diástole acortada atenúa la onda dícrota, que tiende a fusionarse con el pie de la sístole siguiente.',
    criterioEcg: 'Morfología P-QRS-T idéntica a la sinusal normal pero con acortamiento notable del segmento T-P entre latidos consecutivos.',
    colorHex: '#d97706',
    bgHex: '#fef3c7',
    badgeClass: 'badge-warning'
  },
  {
    id: 'bradicardia_sinusal',
    nombre: 'Bradicardia Sinusal',
    categoria: 'sinusal',
    categoriaEtiqueta: 'Sinusales',
    bpm: 48.0,
    regularidad: 'regular',
    regularidadTexto: 'Lento Regular',
    severidad: 'leve',
    severidadTexto: 'Precaución / Lento',
    descripcionCorta: 'Frecuencia cardíaca en reposo bajo 60 BPM con activación sinusal regular.',
    fisiopatologia: 'Descenso del tono simpático o predominio vagal fisiológico (frecuente en deportistas de alto rendimiento o atletas de fondo).',
    criterioPpg: 'Intervalos entre pulsos ampliamente espaciados (>1.2 s). Llenado ventricular completo que produce crestas sistólicas amplias y escotadura dícrota muy pronunciada.',
    criterioEcg: 'Ondas P normales seguidas de complejos QRS estrechos con intervalos R-R muy prolongados (>1000 ms).',
    colorHex: '#0284c7',
    bgHex: '#e0f2fe',
    badgeClass: 'badge-info'
  },
  {
    id: 'fibrilacion_auricular',
    nombre: 'Fibrilación Auricular (AFib)',
    categoria: 'auricular',
    categoriaEtiqueta: 'Arritmias Auriculares',
    bpm: 118.0,
    regularidad: 'irregular',
    regularidadTexto: 'Irregularmente Irregular',
    severidad: 'moderada',
    severidadTexto: 'Moderada / Clínica',
    descripcionCorta: 'Desorganización eléctrica auricular total sin contracción mecánica coordinada.',
    fisiopatologia: 'Múltiples frentes de onda caóticos reentrantes en las aurículas (350-600 cpm) bombardean el nodo AV. La falta de patada auricular genera volúmenes sistólicos fluctuantes latido a latido.',
    criterioPpg: 'Variabilidad aperiódica total en los intervalos pico a pico (RR) y amplitud pulsátil fluctuante (pulsus irregularis): latidos con eyección débil seguidos de latidos fuertes.',
    criterioEcg: 'Ausencia completa de ondas P reconocibles; la línea base presenta microoscilaciones rápidas continuas (ondas "f") con respuesta ventricular caótica.',
    colorHex: '#dc2626',
    bgHex: '#fee2e2',
    badgeClass: 'badge-danger'
  },
  {
    id: 'extrasistoles_pvc',
    nombre: 'Extrasístoles Ventriculares (PVC)',
    categoria: 'ectopico',
    categoriaEtiqueta: 'Ectópicos Ventriculares',
    bpm: 76.0,
    regularidad: 'parcialmente_irregular',
    regularidadTexto: 'Pausa Compensatoria',
    severidad: 'moderada',
    severidadTexto: 'Moderada / Ectópica',
    descripcionCorta: 'Latido prematuro originado en un foco ectópico ventricular antes de la despolarización sinusal.',
    fisiopatologia: 'Despolarización ventricular anticipada y asincrónica. Debido al llenado incompleto previo, la contracción eyecta poco volumen, seguida de una pausa compensatoria y un latido posterior aumentado.',
    criterioPpg: 'Aparición súbita de una onda de pulso prematura de baja amplitud, seguida de una pausa diastólica prolongada y un pulso post-extrasistólico hiperdinámico de gran amplitud.',
    criterioEcg: 'Complejo QRS prematuro, ancho (>120 ms) y abigarrado, sin onda P previa, con alteración de la repolarización (onda T opuesta) y pausa compensatoria completa.',
    colorHex: '#b45309',
    bgHex: '#ffedd5',
    badgeClass: 'badge-warning'
  },
  {
    id: 'bigeminismo_ventricular',
    nombre: 'Bigeminismo Ventricular',
    categoria: 'ectopico',
    categoriaEtiqueta: 'Ectópicos Ventriculares',
    bpm: 80.0,
    regularidad: 'parcialmente_irregular',
    regularidadTexto: 'Alternancia en Pares (1:1)',
    severidad: 'alta',
    severidadTexto: 'Alta / Arritmia Sostenida',
    descripcionCorta: 'Patrón repetitivo acoplado donde cada latido sinusal normal va seguido inmediatamente de un latido ectópico.',
    fisiopatologia: 'Acoplamiento fijo de reentrada ventricular tras cada latido normal. Genera un patrón hemodinámico clásico de pulso alternante.',
    criterioPpg: 'Pulsus alternans característico: una onda de pulso alta normal seguida de una onda baja prematura de eyección reducida, repitiéndose en ciclo binario.',
    criterioEcg: 'Alternancia rítmica estricta de un complejo QRS estrecho sinusal seguido de un complejo QRS ancho y mellado de origen ventricular.',
    colorHex: '#991b1b',
    bgHex: '#fee2e2',
    badgeClass: 'badge-danger'
  },
  {
    id: 'flutter_auricular',
    nombre: 'Flutter Auricular (2:1)',
    categoria: 'auricular',
    categoriaEtiqueta: 'Arritmias Auriculares',
    bpm: 150.0,
    regularidad: 'regular',
    regularidadTexto: 'Taquiarritmia Regular (2:1)',
    severidad: 'alta',
    severidadTexto: 'Alta / Taquiarritmia',
    descripcionCorta: 'Macrorreentrada auricular rápida (~300 lpm) con conducción ventricular fija (bloqueo AV 2:1 a 150 BPM).',
    fisiopatologia: 'Circuito de reentrada que viaja alrededor del anillo tricúspide. El nodo AV filtra la mitad de los impulsos, respondiendo exactamente a 150 BPM regulares.',
    criterioPpg: 'Tren de pulsos rápidos regulares con tiempo diastólico muy acortado y morfología homogénea de amplitud ligeramente deprimida.',
    criterioEcg: 'Ondas auriculares "F" en dientes de sierra continuas y regulares a 300/min en derivaciones inferiores (II, III, aVF) con un complejo QRS tras cada segunda onda F.',
    colorHex: '#7c3aed',
    bgHex: '#ede9fe',
    badgeClass: 'badge-primary'
  }
]

/**
 * Obtiene la configuración de una patología o arritmia por su ID.
 * @param {string} id
 * @returns {object}
 */
export function obtenerRitmoPatologia(id) {
  return RITMOS_PATOLOGIAS.find(r => r.id === id) || RITMOS_PATOLOGIAS[0]
}

/**
 * Generador de puntos sincronizados de PPG y ECG para una patología dada.
 *
 * Simula fielmente la hemodinámica periférica (PPG) y la electrofisiología (ECG)
 * con retardo fisiológico de tránsito del pulso (PTT ~190 ms).
 *
 * @param {string} patologiaId - ID de la patología
 * @param {number} duracionSegundos - Duración de la ventana (ej: 3.5 segundos)
 * @param {number} tasaMuestreo - Frecuencia de muestreo en Hz (ej: 100 Hz)
 * @returns {{ tiempos: number[], ppg: number[], ecg: number[], puntosPpg: Array, puntosEcg: Array }}
 */
export function generarTrazadoDualPatologia(patologiaId = 'sinusal_normal', duracionSegundos = 3.5, tasaMuestreo = 100) {
  const totalMuestras = Math.round(duracionSegundos * tasaMuestreo)
  const tiempos = []
  const ppg = []
  const ecg = []
  const puntosPpg = []
  const puntosEcg = []

  // Retardo fisiológico PTT (Pulse Transit Time): el pico R en ECG precede a la cresta sistólica PPG
  const pttSegundos = 0.19

  for (let i = 0; i < totalMuestras; i++) {
    const t = i / tasaMuestreo
    tiempos.push(t)

    let valPpg = 0
    let valEcg = 0

    switch (patologiaId) {
      case 'taquicardia_sinusal': {
        // 125 BPM -> T = 0.48 s
        const T = 60 / 125
        const faseEcg = (t / T) % 1.0
        const fasePpg = ((t - pttSegundos) / T) % 1.0

        valEcg = ecgEducationalWaveform(faseEcg)
        // En taquicardia la onda dícrota se atenúa y se fusiona
        valPpg = Math.max(0, ppgWaveform(fasePpg) * 0.95)
        break
      }

      case 'bradicardia_sinusal': {
        // 48 BPM -> T = 1.25 s
        const T = 60 / 48
        const faseEcg = (t / T) % 1.0
        const fasePpg = ((t - pttSegundos) / T) % 1.0

        valEcg = ecgEducationalWaveform(faseEcg)
        // En bradicardia la diástole es larga y la muesca dícrota es prominente
        valPpg = ppgWaveform(fasePpg) * 1.08
        break
      }

      case 'fibrilacion_auricular': {
        // Frecuencia caótica e irregular: intervalos variables [0.42 s, 0.72 s]
        // Modelado con función determinista pseudo-caótica para consistencia visual
        const modulacionRitmo = 0.52 + 0.16 * Math.sin(t * 3.8) + 0.08 * Math.cos(t * 7.1)
        const faseEcg = (t / modulacionRitmo) % 1.0
        const fasePpg = ((t - pttSegundos) / modulacionRitmo) % 1.0

        // Ruido fibrilatorio basal 'ondas f' (350-500 cpm)
        const ondasF = 0.08 * Math.sin(2 * Math.PI * 7.5 * t) + 0.05 * Math.sin(2 * Math.PI * 13.2 * t)

        // En AFib no hay onda P en ECG
        const ecgSinP = ecgSinOndaP(faseEcg) + ondasF
        valEcg = ecgSinP

        // Amplitud variable en PPG dependiente del intervalo diastólico
        const factorLlenado = Math.max(0.45, Math.min(1.25, modulacionRitmo / 0.52))
        valPpg = ppgWaveform(fasePpg) * factorLlenado
        break
      }

      case 'extrasistoles_pvc': {
        // Ciclo basal de 76 BPM (T ~ 0.79 s).
        // Cada ~3 latidos aparece una extrasístole ventricular prematura
        const periodoCicloGrupo = 0.79 * 3.2
        const tEnGrupo = t % periodoCicloGrupo

        if (tEnGrupo < 0.79) {
          // Latido 1: Normal
          const faseEcg = (tEnGrupo / 0.79) % 1.0
          const fasePpg = ((tEnGrupo - pttSegundos) / 0.79) % 1.0
          valEcg = ecgEducationalWaveform(faseEcg)
          valPpg = ppgWaveform(fasePpg)
        } else if (tEnGrupo < 1.34) {
          // Latido 2: Extrasístole anticipada (a los 0.55s, eyecta poco)
          const tEctopico = tEnGrupo - 0.79
          const faseEctopica = (tEctopico / 0.55) % 1.0
          valEcg = ecgComplejoQrsAncho(faseEctopica)
          // Menor volumen sistólico por llenado ventricular incompleto
          valPpg = ppgWaveform(((tEctopico - pttSegundos) / 0.55) % 1.0) * 0.48
        } else {
          // Latido 3: Post-pausa compensatoria (hiperdinámico por mayor llenado diastólico)
          const tPostPausa = tEnGrupo - 1.34
          const duracionPost = periodoCicloGrupo - 1.34
          const faseEcg = (tPostPausa / duracionPost) % 1.0
          const fasePpg = ((tPostPausa - pttSegundos) / duracionPost) % 1.0
          valEcg = ecgEducationalWaveform(faseEcg)
          valPpg = ppgWaveform(fasePpg) * 1.25
        }
        break
      }

      case 'bigeminismo_ventricular': {
        // Pares continuos: 1 latido sinusal (0.68s) + 1 latido PVC (0.50s)
        const cicloPar = 1.18
        const tEnPar = t % cicloPar

        if (tEnPar < 0.68) {
          // Latido normal (onda fuerte)
          const fEcg = (tEnPar / 0.68) % 1.0
          const fPpg = ((tEnPar - pttSegundos) / 0.68) % 1.0
          valEcg = ecgEducationalWaveform(fEcg)
          valPpg = ppgWaveform(fPpg) * 1.05
        } else {
          // Latido PVC prematuro (onda débil)
          const tPvc = tEnPar - 0.68
          const fEcg = (tPvc / 0.50) % 1.0
          const fPpg = ((tPvc - pttSegundos) / 0.50) % 1.0
          valEcg = ecgComplejoQrsAncho(fEcg)
          valPpg = ppgWaveform(fPpg) * 0.52 // Pulsus alternans
        }
        break
      }

      case 'flutter_auricular': {
        // Ventrículo a 150 BPM (T = 0.40 s), Aurícula a 300 cpm (ondas F a 0.20 s)
        const T = 60 / 150
        const faseV = (t / T) % 1.0
        const fasePpg = ((t - pttSegundos) / T) % 1.0

        // Ondas F en dientes de sierra clásicas continuas
        const faseF = (t / 0.20) % 1.0
        const ondaDientesSierra = 0.16 * (2 * (faseF - 0.5))

        valEcg = ecgSinOndaP(faseV) + ondaDientesSierra
        valPpg = ppgWaveform(fasePpg) * 0.90
        break
      }

      case 'sinusal_normal':
      default: {
        // 72 BPM -> T = 0.833 s
        const T = 60 / 72
        const faseEcg = (t / T) % 1.0
        const fasePpg = ((t - pttSegundos) / T) % 1.0

        valEcg = ecgEducationalWaveform(faseEcg)
        valPpg = ppgWaveform(fasePpg)
        break
      }
    }

    const valPpgNorm = Number(Math.max(0, valPpg).toFixed(4))
    const valEcgNorm = Number(valEcg.toFixed(4))

    ppg.push(valPpgNorm)
    ecg.push(valEcgNorm)

    puntosPpg.push({ tMs: Math.round(t * 1000), val: valPpgNorm })
    puntosEcg.push({ tMs: Math.round(t * 1000), val: valEcgNorm })
  }

  return {
    tiempos,
    ppg,
    ecg,
    puntosPpg,
    puntosEcg
  }
}

/**
 * Forma de onda ECG sin onda P (para arritmias auriculares como AFib o Flutter).
 */
function ecgSinOndaP(phase) {
  const t = ((phase % 1) + 1) % 1
  const q = -0.15 * Math.exp(-Math.pow(t - 0.135, 2) / (2 * 0.007 * 0.007))
  const r = 1.0 * Math.exp(-Math.pow(t - 0.15, 2) / (2 * 0.010 * 0.010))
  const s = -0.25 * Math.exp(-Math.pow(t - 0.17, 2) / (2 * 0.008 * 0.008))
  const tWave = 0.28 * Math.exp(-Math.pow(t - 0.29, 2) / (2 * 0.038 * 0.038))
  return q + r + s + tWave
}

/**
 * Complejo QRS ancho y mellado característico de extrasístoles ventriculares (PVC).
 */
function ecgComplejoQrsAncho(phase) {
  const t = ((phase % 1) + 1) % 1
  // QRS ensanchado (>120ms) y bizarro con onda T invertida
  const rWide = 0.9 * Math.exp(-Math.pow(t - 0.16, 2) / (2 * 0.025 * 0.025))
  const sDeep = -0.6 * Math.exp(-Math.pow(t - 0.22, 2) / (2 * 0.030 * 0.030))
  const tInverted = -0.32 * Math.exp(-Math.pow(t - 0.38, 2) / (2 * 0.050 * 0.050))
  return rWide + sDeep + tInverted
}

/**
 * Compara de forma educativa una medición real con el ritmo de referencia precargado (no es un diagnóstico).
 *
 * @param {object} params
 * @param {number} params.medicionBpm - BPM medido del paciente
 * @param {number} [params.medicionIntervaloMs] - Intervalo RR promedio medido en ms
 * @param {string} params.patologiaId - ID de la patología a comparar
 * @returns {object} Métricas y diagnósticos comparativos
 */
export function calcularMetricasComparacionPatologia({
  medicionBpm = 75,
  medicionIntervaloMs = null,
  patologiaId = 'sinusal_normal'
}) {
  const patologia = obtenerRitmoPatologia(patologiaId)
  const bpmMedido = Number(medicionBpm) || 75
  const intMedido = medicionIntervaloMs || Math.round(60000 / bpmMedido)
  const intPatologia = Math.round(60000 / patologia.bpm)

  const deltaBpm = parseFloat((bpmMedido - patologia.bpm).toFixed(1))
  const deltaIntervalo = intMedido - intPatologia

  // Similitud de frecuencia normalizada (0 a 100%)
  const difRelativa = Math.abs(bpmMedido - patologia.bpm) / Math.max(bpmMedido, patologia.bpm)
  const similitudFrecuencia = Math.max(10, Math.min(100, Math.round((1 - difRelativa) * 100)))

  // Parecido con el ritmo de referencia (ejercicio educativo, no es un diagnóstico)
  let compatibilidad = 'baja'
  let conclusionClinica = ''

  if (patologia.id === 'sinusal_normal') {
    if (Math.abs(deltaBpm) <= 12) {
      compatibilidad = 'alta'
      conclusionClinica = 'Tu medición se parece mucho al ritmo sinusal normal de reposo de referencia.'
    } else {
      compatibilidad = 'media'
      conclusionClinica = `Tu frecuencia (${bpmMedido} BPM) se aleja ${Math.abs(deltaBpm)} BPM del valor de referencia del ritmo sinusal normal (72 BPM).`
    }
  } else if (patologia.id === 'taquicardia_sinusal') {
    if (bpmMedido > 100) {
      compatibilidad = 'alta'
      conclusionClinica = `Tu frecuencia (${bpmMedido} BPM) se parece a los parámetros del patrón taquicárdico de referencia (más de 100 BPM): tiende a ese rango, sin que esto sea un diagnóstico.`
    } else {
      compatibilidad = 'baja'
      conclusionClinica = `Tu frecuencia en reposo (${bpmMedido} BPM) no se parece a los parámetros de la taquicardia sinusal de referencia.`
    }
  } else if (patologia.id === 'bradicardia_sinusal') {
    if (bpmMedido < 60) {
      compatibilidad = 'alta'
      conclusionClinica = `Tu frecuencia (${bpmMedido} BPM) se parece a los parámetros del patrón bradicárdico de referencia (menos de 60 BPM): tiende a ese rango, sin que esto sea un diagnóstico.`
    } else {
      compatibilidad = 'baja'
      conclusionClinica = `Tu frecuencia (${bpmMedido} BPM) está en el rango normocárdico: no se parece al patrón bradicárdico de referencia.`
    }
  } else if (patologia.id === 'fibrilacion_auricular') {
    if (Math.abs(deltaBpm) <= 18) {
      compatibilidad = 'media'
      conclusionClinica = 'La frecuencia se parece a la del ejemplo de fibrilación auricular (AFib) de referencia; para distinguirlos hay que mirar la regularidad de los intervalos, algo que aquí solo se muestra de forma educativa.'
    } else {
      compatibilidad = 'baja'
      conclusionClinica = 'En tu medición el ritmo es regular y se ve la muesca dícrota: características que no se parecen al ejemplo de fibrilación auricular de referencia.'
    }
  } else {
    compatibilidad = similitudFrecuencia > 80 ? 'media' : 'baja'
    conclusionClinica = `Comparación educativa activa: analizando morfología dícrota y PTT respecto a ${patologia.nombre}.`
  }

  return {
    patologia,
    medicionBpm: bpmMedido,
    patologiaBpm: patologia.bpm,
    deltaBpm,
    medicionIntervaloMs: intMedido,
    patologiaIntervaloMs: intPatologia,
    deltaIntervalo,
    similitudFrecuencia,
    compatibilidad,
    conclusionClinica
  }
}
