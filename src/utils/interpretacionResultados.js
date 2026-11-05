/**
 * Interpretación textual de cada resultado y posibles causas de variación (RF23)
 *
 * Función pura, sin pantalla ni red, para poder probarla con Node y usarla sin conexión (RNF03).
 * Recibe el BPM y la SpO₂ medidos, la edad y la actividad, y devuelve para cada resultado:
 *  - una interpretación en lenguaje sencillo (qué significa el número),
 *  - las posibles causas de variación, ordenadas con las del contexto de la persona primero
 *    (estrés, sueño, cafeína, medicación, actividad, calidad de la señal).
 *
 * Es material educativo: no es un diagnóstico y las causas son posibles, no seguras.
 */

import { obtenerRangoReferencia } from './comparacionRangos.js'

export const AVISO_INTERPRETACION =
  'Esta interpretación es educativa y orientativa. No reemplaza una evaluación médica: si te sientes mal o el valor se repite fuera de rango, consulta a un profesional de salud.'

const esNumero = (n) => typeof n === 'number' && Number.isFinite(n)

/** Quita tildes y pasa a minúsculas para comparar nombres de actividad. */
const normalizar = (t) =>
  String(t || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Dice si la actividad es de esfuerzo o movimiento (no es reposo basal). */
function esActividadFisica(actividad) {
  const a = normalizar(actividad)
  if (!a || a.includes('reposo') || a.includes('sentad') || a.includes('basal')) return false
  return true
}

// ---------------------------------------------------------------------------
// Causas generales por situación. `clave` identifica la causa para las pruebas.
// ---------------------------------------------------------------------------

const CAUSAS_BPM_ALTO = [
  { clave: 'actividad', texto: 'Esfuerzo o movimiento reciente: al caminar, subir escaleras o ejercitarse el corazón late más rápido.' },
  { clave: 'estres', texto: 'Estrés, nervios o ansiedad: la adrenalina acelera el pulso, incluso al saber que te están midiendo.' },
  { clave: 'cafeina', texto: 'Cafeína u otros estimulantes (café, mate, bebidas cola o energéticas).' },
  { clave: 'sueno', texto: 'Poco sueño o cansancio: el cuerpo compensa la falta de descanso con más latidos.' },
  { clave: 'medicacion', texto: 'Algunos medicamentos (broncodilatadores, descongestionantes, estimulantes) elevan el pulso.' },
  { clave: 'fiebre', texto: 'Fiebre, calor, deshidratación o haber tomado poco líquido.' },
  { clave: 'senal', texto: 'Una señal con ruido o movimiento puede hacer que se cuenten picos de más.' }
]

const CAUSAS_BPM_BAJO = [
  { clave: 'condicion', texto: 'Buena condición física: en personas que hacen deporte con frecuencia el pulso en reposo suele ser más bajo.' },
  { clave: 'relajacion', texto: 'Relajación profunda o sueño reciente: el pulso baja cuando el cuerpo está muy tranquilo.' },
  { clave: 'medicacion', texto: 'Algunos medicamentos (por ejemplo para la presión o el corazón) disminuyen el pulso.' },
  { clave: 'frio', texto: 'Dedos fríos o poca circulación: la señal es débil y el sensor puede perder latidos.' },
  { clave: 'senal', texto: 'Presión excesiva o mala colocación del dedo: el sensor puede dejar de detectar algunos picos.' }
]

const CAUSAS_BPM_NORMAL = [
  { clave: 'variacion', texto: 'Aun dentro de rango, el pulso varía de una medición a otra: respiración, postura y hora del día lo cambian unos pocos latidos.' },
  { clave: 'respiracion', texto: 'Al inspirar el pulso sube un poco y al espirar baja (arritmia sinusal respiratoria, normal sobre todo en jóvenes).' }
]

const CAUSAS_SPO2_BAJA = [
  { clave: 'senal', texto: 'Señal débil o con movimiento: es la causa más común de una lectura baja falsa. Repite la medición con el dedo quieto.' },
  { clave: 'frio', texto: 'Dedos fríos o poca circulación: llega menos sangre al dedo y la lectura baja.' },
  { clave: 'esmalte', texto: 'Esmalte de uñas oscuro, uñas postizas o dedo sucio: bloquean parte de la luz del sensor.' },
  { clave: 'luz', texto: 'Luz ambiental fuerte sobre el sensor: altera la luz roja e infrarroja medida.' },
  { clave: 'altura', texto: 'Estar en altura: hay menos oxígeno en el aire y la saturación baja de forma natural.' },
  { clave: 'respiratoria', texto: 'Problemas respiratorios o circulatorios (asma, resfrío fuerte, apnea del sueño, tabaquismo): si se repite, consulta a un profesional.' }
]

const CAUSAS_SPO2_NORMAL = [
  { clave: 'variacion', texto: 'La SpO₂ normal fluctúa uno o dos puntos entre mediciones; 96 % y 99 % son igual de normales.' },
  { clave: 'precision', texto: 'Un oxímetro de este tipo puede diferir unos puntos de uno clínico, porque usa una curva de calibración aproximada.' }
]

// ---------------------------------------------------------------------------
// Causas personales: salen de lo que la persona declaró antes de medir.
// ---------------------------------------------------------------------------

/**
 * Causas que se activan por el contexto declarado de la persona y que explican un BPM alto o bajo.
 * @returns {{ clave: string, texto: string, personal: true }[]}
 */
function causasPersonalesBpm(estado, paciente, actividad) {
  const p = paciente || {}
  const salida = []
  const add = (clave, texto) => salida.push({ clave, texto, personal: true })

  if (estado === 'alto') {
    if (esActividadFisica(actividad)) {
      add('actividad', `Declaraste actividad previa de "${actividad}": el esfuerzo reciente eleva el pulso y tarda unos minutos en bajar.`)
    }
    if (p.nivelEstres === 'alto' || p.nivelEstres === 'muy_alto') {
      add('estres', 'Declaraste un nivel de estrés alto: el estrés acelera el pulso.')
    }
    if (p.cafeina === 'moderada' || p.cafeina === 'alta') {
      add('cafeina', 'Declaraste consumo de cafeína moderado o alto: es un estimulante que sube el pulso.')
    }
    if (p.suenoHoras === 'menos_5' || p.suenoHoras === '5_6') {
      add('sueno', 'Declaraste pocas horas de sueño: el cansancio puede subir el pulso en reposo.')
    }
    if (['inhalador_asma', 'antigripal_descongestionante', 'tdah_estimulante'].includes(p.medicacionTipo)) {
      add('medicacion', 'Declaraste una medicación que suele elevar el pulso.')
    }
  }

  if (estado === 'bajo') {
    if (p.medicacionTipo === 'presion_corazon') {
      add('medicacion', 'Declaraste medicación para la presión o el corazón: estos fármacos disminuyen el pulso.')
    }
    if (p.suenoHoras === 'mas_8') {
      add('relajacion', 'Declaraste haber dormido bien: el cuerpo descansado suele tener un pulso más bajo.')
    }
    if (p.nivelEstres === 'bajo') {
      add('relajacion', 'Declaraste un estrés bajo: un estado tranquilo favorece un pulso más bajo.')
    }
  }

  return salida
}

/** Junta las causas personales con las generales, sin repetir claves (las personales ganan). */
function combinarCausas(personales, generales) {
  const vistas = new Set(personales.map((c) => c.clave))
  return [...personales, ...generales.filter((c) => !vistas.has(c.clave)).map((c) => ({ ...c, personal: false }))]
}

// ---------------------------------------------------------------------------
// Interpretación de cada resultado
// ---------------------------------------------------------------------------

/**
 * Interpretación del BPM.
 * @returns {{ estado: 'alto'|'bajo'|'dentro'|'invalido', titulo: string, interpretacion: string, causas: object[] }}
 */
export function interpretarBpm({ bpm, edad = 25, actividad = 'reposo', paciente = null, rango = null } = {}) {
  if (!esNumero(bpm) || bpm < 20 || bpm > 250) {
    return {
      estado: 'invalido',
      titulo: 'Sin lectura de pulso válida',
      interpretacion: 'No hay un BPM confiable para interpretar. Repite la medición manteniendo el dedo quieto sobre el sensor.',
      causas: [{ clave: 'senal', texto: 'La señal fue muy débil, con ruido o con movimiento, y no se pudieron detectar latidos claros.', personal: false }]
    }
  }

  const ref = obtenerRangoReferencia(edad, actividad, rango)
  const valor = Math.round(bpm)
  const rangoTxt = `${ref.bpm_min} a ${ref.bpm_max} BPM`

  if (valor > ref.bpm_max) {
    return {
      estado: 'alto',
      titulo: 'Pulso por encima del rango',
      interpretacion:
        `Tu pulso es de ${valor} BPM y el rango esperado para tu edad y actividad es de ${rangoTxt}. ` +
        `Está ${valor - ref.bpm_max} BPM sobre el límite. Un pulso alto una sola vez suele ser pasajero; ` +
        'importa más si se mantiene en reposo o aparece con mareo, dolor de pecho o falta de aire.',
      causas: combinarCausas(causasPersonalesBpm('alto', paciente, actividad), CAUSAS_BPM_ALTO)
    }
  }

  if (valor < ref.bpm_min) {
    return {
      estado: 'bajo',
      titulo: 'Pulso por debajo del rango',
      interpretacion:
        `Tu pulso es de ${valor} BPM y el rango esperado para tu edad y actividad es de ${rangoTxt}. ` +
        `Está ${ref.bpm_min - valor} BPM bajo el límite. En personas deportistas o muy relajadas puede ser normal; ` +
        'importa más si aparece con cansancio, mareo o desmayo.',
      causas: combinarCausas(causasPersonalesBpm('bajo', paciente, actividad), CAUSAS_BPM_BAJO)
    }
  }

  return {
    estado: 'dentro',
    titulo: 'Pulso dentro del rango',
    interpretacion:
      `Tu pulso es de ${valor} BPM, dentro del rango esperado de ${rangoTxt} para tu edad y actividad. ` +
      'El corazón late a un ritmo que corresponde a lo que estabas haciendo.',
    causas: combinarCausas([], CAUSAS_BPM_NORMAL)
  }
}

/**
 * Interpretación de la SpO₂.
 * @returns {{ estado: 'bajo'|'limite'|'dentro'|'invalido', titulo: string, interpretacion: string, causas: object[] }}
 */
export function interpretarSpo2({ spo2, rango = null, edad = 25, actividad = 'reposo', calidad = null } = {}) {
  if (!esNumero(spo2) || spo2 <= 0 || spo2 > 100) {
    return {
      estado: 'invalido',
      titulo: 'Sin lectura de SpO₂ válida',
      interpretacion: 'No hay una SpO₂ confiable para interpretar. Repite la medición con el dedo quieto, caliente y sin esmalte oscuro.',
      causas: [{ clave: 'senal', texto: 'Las señales roja e infrarroja no fueron lo bastante claras para calcular la razón R.', personal: false }]
    }
  }

  const ref = obtenerRangoReferencia(edad, actividad, rango)
  const minimo = ref.spo2_min
  const valor = Math.round(spo2)

  const personales = []
  if (calidad === 'regular' || calidad === 'mala') {
    personales.push({
      clave: 'senal',
      texto: `La calidad de la señal de esta medición fue ${calidad}: la SpO₂ es la lectura que más se afecta con el ruido y el movimiento.`,
      personal: true
    })
  }

  if (valor < minimo) {
    const grave = valor < 90
    return {
      estado: 'bajo',
      titulo: grave ? 'Saturación claramente baja' : 'Saturación algo baja',
      interpretacion:
        `Tu SpO₂ es de ${valor} %, por debajo del mínimo esperado de ${minimo} %. ` +
        (grave
          ? 'Un valor bajo 90 % no se debe dar por bueno: repite la medición y, si se confirma o hay falta de aire, busca atención médica.'
          : 'Una lectura aislada ligeramente baja suele deberse a la medición; repítela antes de preocuparte.'),
      causas: combinarCausas(personales, CAUSAS_SPO2_BAJA)
    }
  }

  return {
    estado: 'dentro',
    titulo: 'Saturación normal',
    interpretacion:
      `Tu SpO₂ es de ${valor} %, igual o sobre el mínimo esperado de ${minimo} %. ` +
      'Significa que la hemoglobina de tu sangre lleva oxígeno de forma adecuada.',
    causas: combinarCausas(personales, CAUSAS_SPO2_NORMAL)
  }
}

/**
 * Interpretación completa de una medición: BPM y SpO₂ cada uno con sus causas de variación.
 * @returns {{ bpm: object, spo2: object, aviso: string }}
 */
export function interpretarResultados({ bpm, spo2, edad, actividad, paciente = null, calidad = null, rango = null } = {}) {
  const act = actividad || paciente?.actividadNombre || paciente?.actividadPrevia || 'reposo'
  const anios = esNumero(edad) ? edad : paciente?.edad || 25
  return {
    bpm: interpretarBpm({ bpm, edad: anios, actividad: act, paciente, rango }),
    spo2: interpretarSpo2({ spo2, edad: anios, actividad: act, calidad, rango }),
    aviso: AVISO_INTERPRETACION
  }
}
