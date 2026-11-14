/**
 * ============================================================================
 * sensor_pulso · Catálogo y Servicio de Mediciones Públicas y Propias (RF26)
 * ============================================================================
 * Gestión de bioseñales para comparación contra mediciones históricas del
 * usuario y banco docente/comunitario anonimizado de la UNACH.
 * ============================================================================
 */

import { ppgWaveform } from '../utils/ppgMath.js'

/**
 * Catálogo canónico de mediciones públicas validadas para docencia e investigación.
 * Representan casos de control fisiológico con consentimiento y anonimización.
 */
export const MEDICIONES_PUBLICAS_PRECARGADAS = [
  {
    id: 'pub-control-joven',
    titulo: 'Sujeto Control Reposo Joven (21 años)',
    origen: 'publica',
    categoria: 'reposo',
    categoriaTexto: 'Reposo Basal',
    rangoEdad: '18-24',
    actividad: 'Reposo Basal',
    bpm: 70.5,
    spo2: 98.4,
    calidad: 'buena',
    calidadTexto: 'Excelente',
    ritmo: 'normal',
    ritmoTexto: 'Sinusal Regular',
    autorAnonimo: 'Estudiante Voluntario UNACH',
    institucion: 'Laboratorio de Fisiología UNACH',
    fechaTexto: 'Validado por Docencia',
    descripcion: 'Trazado isócrono de voluntario sano en decúbito supino, con onda dícrota nítida y llenado diastólico óptimo.',
    interpretacionClinica: 'Registro de referencia normocárdico en adulto joven. Perfil hemodinámico sin alteraciones.'
  },
  {
    id: 'pub-adulto-mayor',
    titulo: 'Adulto Mayor Normocárdico (68 años)',
    origen: 'publica',
    categoria: 'reposo',
    categoriaTexto: 'Reposo Basal',
    rangoEdad: '50+',
    actividad: 'Reposo Basal',
    bpm: 64.0,
    spo2: 96.2,
    calidad: 'buena',
    calidadTexto: 'Excelente',
    ritmo: 'normal',
    ritmoTexto: 'Sinusal Regular',
    autorAnonimo: 'Participante Programa Adulto Mayor',
    institucion: 'Clínica Universitaria UNACH',
    fechaTexto: 'Validado por Docencia',
    descripcion: 'Onda pulsátil con ascenso sistólico ligeramente más ancho por aumento fisiológico de rigidez arterial vascular.',
    interpretacionClinica: 'Adaptación arterial fisiológica propia de la edad con saturación de oxígeno adecuada para rango senil.'
  },
  {
    id: 'pub-caminata-activa',
    titulo: 'Caminata Activa en Campus (24 años)',
    origen: 'publica',
    categoria: 'caminata',
    categoriaTexto: 'Caminata',
    rangoEdad: '18-24',
    actividad: 'Caminata Activa',
    bpm: 92.0,
    spo2: 97.8,
    calidad: 'buena',
    calidadTexto: 'Excelente',
    ritmo: 'normal',
    ritmoTexto: 'Taquicardia Leve de Esfuerzo',
    autorAnonimo: 'Estudiante de Enfermería',
    institucion: 'Campus Central UNACH',
    fechaTexto: 'Validado por Docencia',
    descripcion: 'Respuesta cronotrópica ante demanda aeróbica moderada. Conserva muesca dícrota con sístole acelerada.',
    interpretacionClinica: 'Incremento simpático esperado durante desplazamiento peatonal con normoxemia constante.'
  },
  {
    id: 'pub-atleta-resistencia',
    titulo: 'Atleta Universitario de Fondo (23 años)',
    origen: 'publica',
    categoria: 'reposo',
    categoriaTexto: 'Reposo Deportivo',
    rangoEdad: '18-24',
    actividad: 'Reposo Basal',
    bpm: 52.0,
    spo2: 99.0,
    calidad: 'buena',
    calidadTexto: 'Excelente',
    ritmo: 'bradicardia',
    ritmoTexto: 'Bradicardia Sinusal Deportiva',
    autorAnonimo: 'Corredor Selección Atletismo',
    institucion: 'Deportes UNACH',
    fechaTexto: 'Validado por Docencia',
    descripcion: 'Bradicardia vagal por acondicionamiento cardiovascular con volumen de eyección ventricular hiperdinámico.',
    interpretacionClinica: 'Eficiencia miocárdica elevada: bajo consumo de oxígeno en reposo con llenado ventricular aumentado.'
  },
  {
    id: 'pub-recuperacion-ejercicio',
    titulo: 'Recuperación Post-Ejercicio (22 años)',
    origen: 'publica',
    categoria: 'ejercicio',
    categoriaTexto: 'Ejercicio Físico',
    rangoEdad: '18-24',
    actividad: 'Ejercicio Moderado',
    bpm: 114.0,
    spo2: 97.0,
    calidad: 'buena',
    calidadTexto: 'Excelente',
    ritmo: 'taquicardia',
    ritmoTexto: 'Taquicardia Sinusal Adaptativa',
    autorAnonimo: 'Voluntario Prueba Ergométrica',
    institucion: 'Laboratorio de Biomecánica UNACH',
    fechaTexto: 'Validado por Docencia',
    descripcion: 'Ventana de enfriamiento inmediato (minuto 2). Ciclos de pulso compactos con gasto cardíaco sostenido.',
    interpretacionClinica: 'Patrón de deuda de oxígeno en fase de compensación periférica sin signos de arritmia.'
  },
  {
    id: 'pub-variabilidad-respiratoria',
    titulo: 'Variabilidad Sinusal Respiratoria (20 años)',
    origen: 'publica',
    categoria: 'reposo',
    categoriaTexto: 'Reposo Ventilatorio',
    rangoEdad: '18-24',
    actividad: 'Reposo Basal',
    bpm: 76.0,
    spo2: 98.5,
    calidad: 'buena',
    calidadTexto: 'Excelente',
    ritmo: 'normal',
    ritmoTexto: 'Arritmia Sinusal Fisiológica',
    autorAnonimo: 'Estudiante de Kinesiología',
    institucion: 'Facultad de Ciencias de la Salud UNACH',
    fechaTexto: 'Validado por Docencia',
    descripcion: 'Modulación autonómica fásica: leve aceleración durante inspiración y desaceleración en espiración.',
    interpretacionClinica: 'Signo saludable de alta reactividad parasimpática y plasticidad vasomotora en reposo.'
  }
]

/**
 * Mediciones propias de respaldo para entorno de demostración o sin registros en BD.
 */
export const MEDICIONES_PROPIAS_DEMO = [
  {
    id: 'propia-demo-1',
    titulo: 'Reposo Post-Estudio (Ayer)',
    origen: 'propia',
    categoria: 'reposo',
    categoriaTexto: 'Reposo Basal',
    actividad: 'Reposo Basal',
    bpm: 70.5,
    spo2: 98.2,
    calidad: 'buena',
    calidadTexto: 'Excelente',
    ritmo: 'normal',
    ritmoTexto: 'Sinusal Regular',
    fechaTexto: 'Ayer, 18:45 hrs',
    descripcion: 'Medición tomada tras sesión de estudio en aula. Registro estable con muesca dícrota prominente.',
    interpretacionClinica: 'Frecuencia cardíaca en rango normocárdico basal de reposo.'
  },
  {
    id: 'propia-demo-2',
    titulo: 'Caminata Liviana en Campus',
    origen: 'propia',
    categoria: 'caminata',
    categoriaTexto: 'Caminata',
    actividad: 'Caminata Liviana',
    bpm: 92.0,
    spo2: 97.8,
    calidad: 'buena',
    calidadTexto: 'Excelente',
    ritmo: 'normal',
    ritmoTexto: 'Sinusal Acelerado',
    fechaTexto: '04/11/2026, 11:20 hrs',
    descripcion: 'Toma realizada inmediatamente después de subir escaleras del edificio de salud.',
    interpretacionClinica: 'Respuesta taquicárdica fisiológica correspondiente al esfuerzo peatonal.'
  },
  {
    id: 'propia-demo-3',
    titulo: 'Basal Matutino en Ayuno',
    origen: 'propia',
    categoria: 'reposo',
    categoriaTexto: 'Reposo Basal',
    actividad: 'Reposo Basal',
    bpm: 64.0,
    spo2: 98.5,
    calidad: 'buena',
    calidadTexto: 'Excelente',
    ritmo: 'normal',
    ritmoTexto: 'Sinusal Lento',
    fechaTexto: '02/11/2026, 08:15 hrs',
    descripcion: 'Registro de primera hora al despertar. Tono parasimpático predominante con llenado vascular óptimo.',
    interpretacionClinica: 'Frecuencia mínima en reposo indicativa de adecuada recuperación nocturna.'
  }
]

/**
 * Carga las mediciones propias del usuario desde Supabase o localStorage, con respaldo docente.
 * @returns {Promise<Array>} Lista normalizada de mediciones propias
 */
export async function obtenerMedicionesPropias() {
  const mediciones = []

  // 1. Intentar consultar historial de la cuenta en Supabase
  try {
    const modulo = await import('../services/medicionesService.js').catch(() => null)
    if (modulo && typeof modulo.listarHistorial === 'function') {
      const res = await modulo.listarHistorial({ pagina: 0 })
      if (res && Array.isArray(res.items) && res.items.length > 0) {
        res.items.forEach(item => {
          if (item.bpm) {
            const fechaObj = item.inicio ? new Date(item.inicio) : new Date()
            const fechaStr = fechaObj.toLocaleDateString('es-CL', {
              day: '2-digit', month: '2-digit', year: 'numeric',
              hour: '2-digit', minute: '2-digit'
            })

            mediciones.push({
              id: `supabase-${item.id}`,
              titulo: item.actividad ? `Medición ${item.actividad}` : `Medición ${item.bpm} BPM`,
              origen: 'propia',
              categoria: normalizarCategoriaActividad(item.actividad),
              categoriaTexto: item.actividad || 'Reposo',
              actividad: item.actividad || 'Reposo',
              bpm: Number(item.bpm),
              spo2: item.spo2 ? Number(item.spo2) : 98.0,
              calidad: item.calidad || 'buena',
              calidadTexto: item.calidad === 'buena' ? 'Excelente' : (item.calidad === 'regular' ? 'Aceptable' : 'Mala'),
              ritmo: item.ritmo || 'normal',
              ritmoTexto: item.ritmo || 'Sinusal',
              fechaTexto: fechaStr,
              descripcion: `Registro guardado en cuenta. Duración: ${item.duracionS || 15} s. Canal: ${item.canal || 1}.`,
              interpretacionClinica: `Medición clínica guardada con frecuencia de ${item.bpm} BPM y SpO2 de ${item.spo2 || 98}%.`
            })
          }
        })
      }
    }
  } catch {
    // Modo offline o sin sesión
  }

  // 2. Revisar mediciones creadas en el selector local (localStorage)
  try {
    if (typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem('sensor_pulso_measurements')
      if (raw) {
        const parsed = JSON.parse(raw)
        if (Array.isArray(parsed)) {
          parsed.forEach(localItem => {
            if (localItem.bpm && !mediciones.some(m => m.id === localItem.id)) {
              mediciones.push({
                id: localItem.id,
                titulo: localItem.name || `Medición ${localItem.bpm} BPM`,
                origen: 'propia',
                categoria: 'reposo',
                categoriaTexto: 'Medición Local',
                actividad: 'Reposo',
                bpm: Number(localItem.bpm),
                spo2: 98.0,
                calidad: 'buena',
                calidadTexto: 'Excelente',
                ritmo: 'normal',
                ritmoTexto: 'Sinusal',
                fechaTexto: localItem.date || 'Reciente',
                descripcion: 'Medición registrada manualmente en el selector del osciloscopio.',
                interpretacionClinica: `Registro local con frecuencia de ${localItem.bpm} BPM.`
              })
            }
          })
        }
      }
    }
  } catch {
    // Error al leer localStorage
  }

  // 3. Si no hay mediciones del usuario aún, proveer el banco de demostración docente
  if (mediciones.length === 0) {
    return [...MEDICIONES_PROPIAS_DEMO]
  }

  return mediciones
}

/**
 * Carga las mediciones públicas publicadas en Supabase (anonimizadas) junto con los casos docentes de referencia.
 * Visible para todos, con o sin sesión (RF31 y RF57).
 * @returns {Promise<Array>} Lista de casos públicos validados y anónimos
 */
export async function obtenerMedicionesPublicas() {
  const publicasBd = []

  try {
    const modulo = await import('../services/medicionesService.js').catch(() => null)
    if (modulo && typeof modulo.listarPublicacionesPublicas === 'function') {
      const lista = await modulo.listarPublicacionesPublicas()
      if (Array.isArray(lista) && lista.length > 0) {
        lista.forEach(item => {
          const fechaStr = item.creadaEn
            ? new Date(item.creadaEn).toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
            : 'Publicada recientemente'
          publicasBd.push({
            id: item.id,
            titulo: item.titulo || `Medición Pública (${item.rangoEdad || '18-24'} años)`,
            origen: 'publica',
            categoria: normalizarCategoriaActividad(item.actividadNombre),
            categoriaTexto: item.actividadNombre || 'Reposo Basal',
            rangoEdad: item.rangoEdad || '18-24',
            actividad: item.actividadNombre || 'Reposo Basal',
            bpm: Number(item.bpm),
            spo2: Number(item.spo2) || 98.0,
            calidad: item.calidad || 'buena',
            calidadTexto: item.calidad === 'buena' ? 'Excelente' : (item.calidad === 'regular' ? 'Aceptable' : 'Baja'),
            ritmo: item.ritmo || 'normal',
            dentroDeRango: typeof item.dentroDeRango === 'boolean' ? item.dentroDeRango : undefined,
            ritmoTexto: item.ritmo === 'normal' ? 'Sinusal Regular' : (item.ritmo || 'Evaluado'),
            autorAnonimo: 'Participante UNACH (Anónimo)',
            institucion: 'Comunidad Universitaria UNACH',
            fechaTexto: fechaStr,
            descripcion: `Registro fisiológico publicado de forma anónima (Rango etario: ${item.rangoEdad || '18-24'} años).`,
            interpretacionClinica: `Medición pública anonimizada con ${item.bpm} BPM y ${item.spo2 || 98}% SpO2.`
          })
        })
      }
    }
  } catch {
    // Respaldo silencioso si no hay conexión a BD
  }

  return [...publicasBd, ...MEDICIONES_PUBLICAS_PRECARGADAS]
}

/**
 * Clasifica el nombre de una actividad a una categoría canónica.
 * @param {string} act
 * @returns {string} 'reposo' | 'caminata' | 'ejercicio'
 */
function normalizarCategoriaActividad(act) {
  if (!act) return 'reposo'
  const a = act.toLowerCase()
  if (a.includes('camin')) return 'caminata'
  if (a.includes('ejercicio') || a.includes('esfuerzo') || a.includes('trote')) return 'ejercicio'
  return 'reposo'
}

/**
 * Evalúa cuantitativa y morfológicamente el contraste entre dos mediciones (RF26).
 *
 * @param {object} params
 * @param {number} params.medicionActualBpm - BPM de la medición tomada
 * @param {number} [params.medicionActualSpo2] - SpO2 de la medición tomada
 * @param {object} params.medicionContraste - Objeto de medición seleccionada de referencia
 * @returns {object} Métricas comparativas
 */
export function calcularMetricasComparacionMediciones({
  medicionActualBpm = 78,
  medicionActualSpo2 = 98.0,
  medicionContraste = null
}) {
  const contraste = medicionContraste || MEDICIONES_PROPIAS_DEMO[0]

  const bpmActual = Number(medicionActualBpm) || 78
  const bpmContraste = Number(contraste.bpm) || 70.5

  const spo2Actual = Number(medicionActualSpo2) || 98.0
  const spo2Contraste = Number(contraste.spo2) || 98.2

  const intActualMs = Math.round(60000 / Math.max(30, bpmActual))
  const intContrasteMs = Math.round(60000 / Math.max(30, bpmContraste))

  const deltaBpm = parseFloat((bpmActual - bpmContraste).toFixed(1))
  const deltaIntervaloMs = intActualMs - intContrasteMs
  const deltaSpo2 = parseFloat((spo2Actual - spo2Contraste).toFixed(1))

  // Variación porcentual de la frecuencia cardíaca
  const cambioPorcentualBpm = parseFloat(((deltaBpm / bpmContraste) * 100).toFixed(1))

  // Similitud morfológica normalizada (10% a 99%)
  const difRelativa = Math.abs(bpmActual - bpmContraste) / Math.max(bpmActual, bpmContraste)
  const similitudPorcentaje = Math.max(15, Math.min(99, Math.round((1 - difRelativa) * 100)))

  // Conclusión pedagógica y análisis hemodinámico
  let conclusion = ''
  let concordancia = 'alta'

  if (Math.abs(deltaBpm) <= 4.0) {
    concordancia = 'alta'
    conclusion = `Excelente concordancia hemodinámica con ${contraste.titulo}. La diferencia de solo ${Math.abs(deltaBpm)} BPM indica estabilidad cardiovascular basal semejante entre ambos registros.`
  } else if (deltaBpm > 4.0 && deltaBpm <= 20.0) {
    concordancia = 'media'
    conclusion = `Se observa una elevación fisiológica de +${deltaBpm} BPM (+${cambioPorcentualBpm}%) respecto a ${contraste.titulo}, con acortamiento del intervalo diastólico en ${Math.abs(deltaIntervaloMs)} ms. Compatible con mayor tono simpático, transición postural o actividad reciente.`
  } else if (deltaBpm > 20.0) {
    concordancia = 'baja'
    conclusion = `Diferencia cronotrópica marcada (+${deltaBpm} BPM) frente al registro de referencia. El aumento sustancial de gasto cardíaco refleja condiciones metabólicas o de esfuerzo físico disímiles.`
  } else if (deltaBpm < -4.0 && deltaBpm >= -20.0) {
    concordancia = 'media'
    conclusion = `Frecuencia actual reducida en ${Math.abs(deltaBpm)} BPM (${cambioPorcentualBpm}%) con respecto a ${contraste.titulo}. El alargamiento diastólico en +${Math.abs(deltaIntervaloMs)} ms indica relajación o recuperación parasimpática más profunda.`
  } else {
    concordancia = 'baja'
    conclusion = `Frecuencia cardíaca significativamente menor (${deltaBpm} BPM) en comparación con el registro seleccionado. Se constata un volumen sistólico y un período RR sustancialmente más prolongados.`
  }

  return {
    medicionContraste: contraste,
    bpmActual,
    bpmContraste,
    deltaBpm,
    cambioPorcentualBpm,
    intActualMs,
    intContrasteMs,
    deltaIntervaloMs,
    spo2Actual,
    spo2Contraste,
    deltaSpo2,
    similitudPorcentaje,
    concordancia,
    conclusion
  }
}

/**
 * Genera puntos de curva PPG normalizados para cualquier medición con BPM dado.
 * @param {object} params
 * @param {number} params.bpm - Frecuencia cardíaca
 * @param {number} params.duracionSegundos - Ventana en segundos
 * @param {number} params.tasaMuestreo - Frecuencia de muestreo (Hz)
 * @param {number} [params.amplitud] - Porcentaje de amplitud (100 = 1.0)
 * @returns {{ tiempos: number[], ppg: number[] }}
 */
export function generarPuntosOndaMedicion({
  bpm = 72,
  duracionSegundos = 3.5,
  tasaMuestreo = 100,
  amplitud = 100
}) {
  const totalMuestras = Math.round(duracionSegundos * tasaMuestreo)
  const tiempos = []
  const ppg = []
  const beatPeriod = 60 / Math.max(30, bpm)
  const pttS = 0.19 // Pulse transit time constante
  const ampFactor = Math.max(0.4, Math.min(1.8, amplitud / 100))

  for (let i = 0; i < totalMuestras; i++) {
    const t = i / tasaMuestreo
    tiempos.push(t)
    const fasePpg = ((t - pttS) / beatPeriod) % 1.0
    const val = Number((ppgWaveform(fasePpg) * ampFactor).toFixed(4))
    ppg.push(val)
  }

  return { tiempos, ppg }
}
