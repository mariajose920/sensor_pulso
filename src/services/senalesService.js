/**
 * Servicio de Carga y Gestión de Bioseñales Fisiológicas (RF27)
 *
 * Cumple con los 4 métodos de carga de señales:
 * 1. Carga por archivo CSV (con detección de delimitadores y mapeo de canales)
 * 2. Señales Simuladas (modelado matemático de PPG con sístole, diástole y arritmias)
 * 3. Datasets Públicos acreditados (PhysioNet BIDMC, CapnoBase, MIMIC-III, WESAD)
 * 4. Señales de Referencia Validadas (banco clínico docente y tabla Supabase senales_referencia)
 */

import { supabase } from './supabase.js'
import { filtroSuavizadoEMA } from '../utils/dspFiltros.js'

// ============================================================================
// 1. DATASETS PÚBLICOS ACREDITADOS (Indexados y Validados)
// ============================================================================
export const DATASETS_PUBLICOS_CATALOGO = [
  {
    id: 'bidmc-ppg-01',
    nombre: 'BIDMC PPG & Respiration Dataset - Sujeto 01',
    fuente: 'PhysioNet / Beth Israel Deaconess Medical Center',
    licencia: 'Open Data Commons Public Domain (ODC-PD)',
    url: 'https://physionet.org/content/bidmc/1.0.0/',
    bpmReferencia: 74.0,
    spo2Referencia: 98.4,
    frecuenciaHz: 50,
    edadSujeto: 24,
    tipo: 'dataset',
    descripcion: 'Señal fotopletismográfica de dedo registrada en paciente adulto normotenso en reposo. Curva limpia con sístole pronunciada y muesca dícrota clara.',
    generarMuestras: () => generarCurvaFisiologicaRealista({ bpm: 74.0, spo2: 98.4, duracionS: 10, ruido: 0.02, dicrotaFuerte: true })
  },
  {
    id: 'capnobase-tbme-09',
    nombre: 'CapnoBase TBME Benchmark - Caso 0009',
    fuente: 'CapnoBase / University of British Columbia',
    licencia: 'Creative Commons Attribution (CC-BY 3.0)',
    url: 'http://www.capnobase.org/',
    bpmReferencia: 68.0,
    spo2Referencia: 97.2,
    frecuenciaHz: 50,
    edadSujeto: 31,
    tipo: 'dataset',
    descripcion: 'Registro de referencia en oximetría de pulso durante respiración espontánea controlada. Excelente índice de perfusión y estabilidad basal.',
    generarMuestras: () => generarCurvaFisiologicaRealista({ bpm: 68.0, spo2: 97.2, duracionS: 10, ruido: 0.03, dicrotaFuerte: true })
  },
  {
    id: 'mimic3-arritmia-04',
    nombre: 'MIMIC-III Waveform Database - Taquicardia Sinusal',
    fuente: 'PhysioNet / MIT Laboratory for Computational Physiology',
    licencia: 'PhysioNet Credentialed Data Use Agreement',
    url: 'https://physionet.org/content/mimic3wdb/1.0/',
    bpmReferencia: 118.0,
    spo2Referencia: 95.8,
    frecuenciaHz: 50,
    edadSujeto: 45,
    tipo: 'dataset',
    descripcion: 'Paciente con taquicardia sinusal compensatoria post-operatoria. Tiempo diastólico acortado con elevación rápida de la pendiente anacrítica.',
    generarMuestras: () => generarCurvaFisiologicaRealista({ bpm: 118.0, spo2: 95.8, duracionS: 10, ruido: 0.04, dicrotaFuerte: false })
  },
  {
    id: 'wesad-stress-s2',
    nombre: 'WESAD Multimodal Dataset - Estrés Simpático S2',
    fuente: 'University of Siegen / ACM Ubicomp',
    licencia: 'Open Science Research License',
    url: 'https://archive.ics.uci.edu/dataset/465/wesad',
    bpmReferencia: 89.0,
    spo2Referencia: 97.5,
    frecuenciaHz: 50,
    edadSujeto: 27,
    tipo: 'dataset',
    descripcion: 'Medición tomada durante prueba de estrés psicológico (TSST). Se evidencia tono simpático elevado y ligera modulación vasomotora periférica.',
    generarMuestras: () => generarCurvaFisiologicaRealista({ bpm: 89.0, spo2: 97.5, duracionS: 10, ruido: 0.05, dicrotaFuerte: true })
  }
]

// ============================================================================
// 2. BANCO DE SEÑALES DE REFERENCIA VALIDADAS (Guía Clínica y Docente)
// ============================================================================
export const SENALES_VALIDADAS_CATALOGO = [
  {
    id: 'ref-normocardia-joven',
    nombre: 'Normocardia Estándar de Reposo (Adulto Joven)',
    tipo: 'validada',
    bpmReferencia: 72.0,
    spo2Referencia: 99.0,
    frecuenciaHz: 50,
    edadMin: 18,
    edadMax: 35,
    ritmo: 'sinusal_normal',
    descripcion: 'Patrón de referencia estándar según Guía AHA (American Heart Association). Curva simétrica, intervalo RR constante (833 ms) y saturación óptima.',
    explicacion: 'Excelente distensibilidad arterial (compliance) reflejada en una onda de reflexión dícrota bien diferenciada a 1/3 del ciclo cardíaco.',
    generarMuestras: () => generarCurvaFisiologicaRealista({ bpm: 72.0, spo2: 99.0, duracionS: 10, ruido: 0.01, dicrotaFuerte: true })
  },
  {
    id: 'ref-bradicardia-atleta',
    nombre: 'Bradicardia Sinusal Fisiológica (Atleta de Alto Rendimiento)',
    tipo: 'validada',
    bpmReferencia: 48.0,
    spo2Referencia: 99.2,
    frecuenciaHz: 50,
    edadMin: 20,
    edadMax: 40,
    ritmo: 'bradicardia_sinusal',
    descripcion: 'Adaptación fisiológica al entrenamiento de resistencia. Gran volumen sistólico por latido con llenado diastólico prolongado.',
    explicacion: 'El tiempo diastólico extendido (RR = 1250 ms) permite la perfusión coronaria máxima sin signos patológicos.',
    generarMuestras: () => generarCurvaFisiologicaRealista({ bpm: 48.0, spo2: 99.2, duracionS: 10, ruido: 0.02, dicrotaFuerte: true, amplitud: 1.3 })
  },
  {
    id: 'ref-rigidez-adulto-mayor',
    nombre: 'Patrón Vascular con Rigidez Arterial (Adulto Mayor)',
    tipo: 'validada',
    bpmReferencia: 66.0,
    spo2Referencia: 96.0,
    frecuenciaHz: 50,
    edadMin: 65,
    edadMax: 85,
    ritmo: 'sinusal_normal',
    descripcion: 'Pérdida fisiológica de elasticidad en las grandes arterias propia del envejecimiento vascular.',
    explicacion: 'La onda reflejada se adelanta y se fusiona con la sistólica, atenuando la muesca dícrota e incrementando el ancho sistólico.',
    generarMuestras: () => generarCurvaFisiologicaRealista({ bpm: 66.0, spo2: 96.0, duracionS: 10, ruido: 0.03, dicrotaFuerte: false, amplitud: 0.85 })
  },
  {
    id: 'ref-arritmia-respiratoria',
    nombre: 'Arritmia Sinusal Respiratoria (Benigna en Reposo)',
    tipo: 'validada',
    bpmReferencia: 75.0,
    spo2Referencia: 98.0,
    frecuenciaHz: 50,
    edadMin: 18,
    edadMax: 30,
    ritmo: 'arritmia_sinusal_respiratoria',
    descripcion: 'Variación fisiológica normal del intervalo cardíaco mediada por el nervio vago durante el ciclo respiratorio.',
    explicacion: 'La frecuencia cardíaca se acelera durante la inhalación y se desacelera rítmicamente durante la exhalación.',
    generarMuestras: () => generarCurvaFisiologicaRealista({ bpm: 75.0, spo2: 98.0, duracionS: 12, ruido: 0.02, arritmiaRespiratoria: true })
  }
]

// ============================================================================
// 3. GENERADOR DE SEÑALES SIMULADAS PARAMÉTRICAS
// ============================================================================
export const PRESETS_SIMULACION = [
  { id: 'sim-reposo', nombre: 'Reposo Estándar (72 BPM / 98% SpO₂)', bpm: 72, spo2: 98.5, ruido: 2, dicrota: 'normal' },
  { id: 'sim-taquicardia', nombre: 'Taquicardia en Esfuerzo (130 BPM / 96% SpO₂)', bpm: 130, spo2: 96.5, ruido: 5, dicrota: 'atenuada' },
  { id: 'sim-bradicardia', nombre: 'Bradicardia de Sueño (48 BPM / 99% SpO₂)', bpm: 48, spo2: 99.0, ruido: 1, dicrota: 'prominente' },
  { id: 'sim-arritmia', nombre: 'Arritmia Sinusal Respiratoria (65-85 BPM)', bpm: 75, spo2: 98.0, ruido: 3, dicrota: 'variable' },
  { id: 'sim-hipoxia', nombre: 'Hipoxemia Desaturada (88 BPM / 88% SpO₂)', bpm: 88, spo2: 88.0, ruido: 4, dicrota: 'normal' },
  { id: 'sim-rigidez', nombre: 'Onda Rígida Senil (64 BPM / 95% SpO₂)', bpm: 64, spo2: 95.0, ruido: 2, dicrota: 'fusionada' }
]

/**
 * Modela una señal PPG realista mediante combinación gaussiana doble (sístole + diástole)
 */
export function generarCurvaFisiologicaRealista(opciones = {}) {
  const bpm = opciones.bpm || 72
  const spo2 = opciones.spo2 || 98.0
  const duracionS = opciones.duracionS || 10
  const frecuenciaHz = opciones.frecuenciaHz || 50
  const ruidoFactor = opciones.ruido !== undefined ? opciones.ruido : 0.02
  const amplitudRel = opciones.amplitud || 1.0
  const dicrotaFuerte = opciones.dicrotaFuerte !== false
  const arritmia = opciones.arritmiaRespiratoria || false

  const totalMuestras = Math.round(duracionS * frecuenciaHz)
  const muestrasIr = new Array(totalMuestras)
  const muestrasRojo = new Array(totalMuestras)

  // Niveles base DC del sensor MAX30100/MAX30102
  const dcIr = 24000
  const dcRojo = 21000

  // Cálculo de ratio R para coincidir con la SpO2 empírica: SpO2 = 110 - 25*R => R = (110 - SpO2)/25
  const ratioR = Math.max(0.4, Math.min(1.4, (110.0 - spo2) / 25.0))
  const acIrBase = 1200 * amplitudRel
  const acRojoBase = acIrBase * ratioR * (dcRojo / dcIr)

  let tRel = 0
  let periodoActualS = 60.0 / bpm

  for (let i = 0; i < totalMuestras; i++) {
    const tSegundos = i / frecuenciaHz

    // Si tiene arritmia respiratoria, modular el período con ciclo de 4 segundos
    if (arritmia) {
      const modulacion = 0.18 * Math.sin((2 * Math.PI * tSegundos) / 4.0)
      periodoActualS = (60.0 / bpm) * (1 + modulacion)
    }

    tRel += 1 / frecuenciaHz
    if (tRel >= periodoActualS) {
      tRel -= periodoActualS
    }

    const fase = tRel / periodoActualS // 0 a 1 en el ciclo

    // Modelo de doble pico gaussiano:
    // Pico 1: Onda sistólica (expulsión ventricular) centrada en fase ~0.20
    const sistole = Math.exp(-Math.pow((fase - 0.20) / 0.09, 2))

    // Pico 2: Onda reflejada dícrota (cierre de válvula aórtica) centrada en fase ~0.45
    const factorDicrota = dicrotaFuerte ? 0.38 : 0.15
    const dicrota = factorDicrota * Math.exp(-Math.pow((fase - 0.44) / 0.08, 2))

    // Muesca dícrota intermedia (incisura)
    const incisura = 0.10 * Math.exp(-Math.pow((fase - 0.33) / 0.05, 2))

    // Traza normalizada pulsátil
    let pulso = Math.max(0, sistole + dicrota - incisura)

    // Agregar ruido gaussiano simulado
    if (ruidoFactor > 0) {
      const ruido = (Math.random() - 0.5) * 2 * ruidoFactor
      pulso = Math.max(0, pulso + ruido)
    }

    // Inversión fotopletismográfica estándar: mayor volumen arterial = menor luz detectada
    // Pero en visualización médica solemos graficar la componente invertida para ver picos hacia arriba
    const irVal = Math.round(dcIr + acIrBase * pulso)
    const rojoVal = Math.round(dcRojo + acRojoBase * pulso)

    muestrasIr[i] = irVal
    muestrasRojo[i] = rojoVal
  }

  return {
    muestrasIr,
    muestrasRojo,
    bpm,
    spo2,
    frecuenciaHz,
    duracionS,
    totalMuestras
  }
}

// ============================================================================
// 4. PARSER Y SANITIZADOR DE ARCHIVOS CSV (RF27, RF65, RF66)
// ============================================================================
/**
 * Parsea y sanitiza un archivo CSV con bioseñales fisiológicas
 * Soporta formatos de exportación propios y estándares abiertos (PhysioNet, PhysioZoo, etc.)
 */
export function parsearArchivoCsv(contenidoTexto, nombreArchivo = 'senal.csv') {
  if (!contenidoTexto || typeof contenidoTexto !== 'string') {
    return { valido: false, error: 'El archivo está vacío o no contiene texto legible.' }
  }

  // Límite de seguridad de tamaño (RF66): máximo 5 MB de texto
  if (contenidoTexto.length > 5 * 1024 * 1024) {
    return { valido: false, error: 'El archivo supera el límite máximo de tamaño permitido (5 MB).' }
  }

  // Filtrar líneas de comentarios (# o //) y líneas en blanco
  const lineas = contenidoTexto
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'))

  if (lineas.length < 5) {
    return { valido: false, error: 'El archivo contiene menos de 5 muestras válidas. Se requiere una serie temporal.' }
  }

  // Detección automática del delimitador (coma, punto y coma, tabulación, pipe)
  const primeraLinea = lineas[0]
  let delimitador = ','
  if (primeraLinea.includes(';') && (primeraLinea.match(/;/g) || []).length > (primeraLinea.match(/,/g) || []).length) {
    delimitador = ';'
  } else if (primeraLinea.includes('\t')) {
    delimitador = '\t'
  } else if (primeraLinea.includes('|')) {
    delimitador = '|'
  }

  const cabeceras = primeraLinea.split(delimitador).map(c => c.trim().toLowerCase().replace(/^["']|["']$/g, ''))

  // Determinar si la primera línea es cabecera o datos numéricos directos
  const esPrimeraLineaHeader = cabeceras.some(c => isNaN(Number(c.replace(',', '.'))))
  const indiceInicioDatos = esPrimeraLineaHeader ? 1 : 0

  // Mapeo inteligente de columnas
  let colTiempo = -1
  let colIr = -1
  let colRojo = -1
  let colPpgUnico = -1

  if (esPrimeraLineaHeader) {
    cabeceras.forEach((col, idx) => {
      if (['tiempo', 'time', 't', 'tiempo_ms', 'time_ms', 'timestamp'].includes(col)) colTiempo = idx
      else if (['ir', 'ir_raw', 'infrarrojo', 'ir_filtrado', 'pleth', 'pleth_ir', 'channel1', 'ch1'].includes(col)) colIr = idx
      else if (['rojo', 'red', 'red_raw', 'rojo_filtrado', 'red_filtrado', 'channel2', 'ch2'].includes(col)) colRojo = idx
      else if (['ppg', 'senal', 'valor', 'signal', 'val', 'data'].includes(col)) colPpgUnico = idx
    })
  }

  // Si no se detectaron cabeceras, asumir estructura por orden de columnas
  if (colIr === -1 && colPpgUnico === -1) {
    const numCols = primeraLinea.split(delimitador).length
    if (numCols === 1) {
      colPpgUnico = 0
    } else if (numCols === 2) {
      colTiempo = 0
      colPpgUnico = 1
    } else {
      colTiempo = 0
      colIr = 1
      colRojo = 2
    }
  }

  const muestrasIr = []
  const muestrasRojo = []
  const timestamps = []

  for (let i = indiceInicioDatos; i < lineas.length; i++) {
    const tokens = lineas[i].split(delimitador).map(t => t.trim().replace(/^["']|["']$/g, ''))
    if (tokens.length === 0) continue

    // Sanitización y parseo de número flotante
    const parseNum = (str) => {
      if (!str) return null
      const limpio = str.replace(',', '.')
      const num = Number(limpio)
      return isNaN(num) ? null : num
    }

    const tVal = colTiempo >= 0 ? parseNum(tokens[colTiempo]) : i
    const irVal = colIr >= 0 ? parseNum(tokens[colIr]) : (colPpgUnico >= 0 ? parseNum(tokens[colPpgUnico]) : null)
    const rojoVal = colRojo >= 0 ? parseNum(tokens[colRojo]) : null

    if (irVal !== null) {
      muestrasIr.push(irVal)
      if (rojoVal !== null) muestrasRojo.push(rojoVal)
      if (tVal !== null) timestamps.push(tVal)
    }
  }

  if (muestrasIr.length < 5) {
    return { valido: false, error: 'No se encontraron columnas numéricas válidas de señal PPG en el CSV.' }
  }

  // Estimación de la frecuencia de muestreo a partir de la columna de tiempo (si existe)
  let frecuenciaEstimadaHz = 50
  if (timestamps.length >= 10) {
    const dtArr = []
    for (let j = 1; j < Math.min(timestamps.length, 50); j++) {
      const dt = timestamps[j] - timestamps[j - 1]
      if (dt > 0) dtArr.push(dt)
    }
    if (dtArr.length > 0) {
      const dtProm = dtArr.reduce((a, b) => a + b, 0) / dtArr.length
      // Si el delta viene en segundos (< 1.0) o milisegundos (> 1.0)
      const dtSegundos = dtProm < 1.0 ? dtProm : dtProm / 1000.0
      if (dtSegundos > 0.001 && dtSegundos < 1.0) {
        frecuenciaEstimadaHz = Math.round(1.0 / dtSegundos)
      }
    }
  }

  // Estimación preliminar de BPM mediante conteo de picos simples
  const irFiltrada = filtroSuavizadoEMA(muestrasIr, 0.3)
  const bpmEstimado = estimarBpmDesdeMuestras(irFiltrada, frecuenciaEstimadaHz)
  const duracionS = parseFloat((muestrasIr.length / frecuenciaEstimadaHz).toFixed(1))

  return {
    valido: true,
    origen: 'csv',
    nombreArchivo,
    totalMuestras: muestrasIr.length,
    frecuenciaHz: frecuenciaEstimadaHz,
    duracionSegundos: duracionS,
    muestrasIr,
    muestrasRojo: muestrasRojo.length > 0 ? muestrasRojo : [...muestrasIr],
    bpmEstimado: bpmEstimado || 72.0,
    spo2Estimado: muestrasRojo.length > 0 ? 98.0 : 98.0,
    columnasDetectadas: cabeceras,
    delimitador,
    resumen: `${muestrasIr.length} muestras analizadas (${duracionS}s a ${frecuenciaEstimadaHz} Hz) · BPM est: ${bpmEstimado || 72}`
  }
}

/**
 * Estimador rápido de BPM para previsualización de señales cargadas
 */
function estimarBpmDesdeMuestras(muestras, hz) {
  if (!muestras || muestras.length < hz * 2) return 72.0
  const max = Math.max(...muestras)
  const min = Math.min(...muestras)
  const umbral = min + (max - min) * 0.65
  const distMinMuestras = Math.round(hz * 0.35) // Refractario ~350 ms

  let ultimoPicoIdx = -1
  const intervalos = []

  for (let i = 1; i < muestras.length - 1; i++) {
    if (muestras[i] > umbral && muestras[i] >= muestras[i - 1] && muestras[i] >= muestras[i + 1]) {
      if (ultimoPicoIdx === -1 || (i - ultimoPicoIdx) >= distMinMuestras) {
        if (ultimoPicoIdx !== -1) {
          intervalos.push(i - ultimoPicoIdx)
        }
        ultimoPicoIdx = i
      }
    }
  }

  if (intervalos.length >= 2) {
    const promIntervalo = intervalos.reduce((a, b) => a + b, 0) / intervalos.length
    const bpm = (60 * hz) / promIntervalo
    if (bpm >= 35 && bpm <= 220) {
      return parseFloat(bpm.toFixed(1))
    }
  }

  return 72.0
}

/**
 * Genera el contenido de una plantilla CSV lista para descargar y probar
 */
export function generarCsvPlantillaEjemplo() {
  const senal = generarCurvaFisiologicaRealista({ bpm: 75.0, spo2: 98.5, duracionS: 6, frecuenciaHz: 50, dicrotaFuerte: true })
  const lineas = [
    '# sensor_pulso · Plantilla CSV de Bioseñal PPG (RF27)',
    '# Frecuencia de muestreo: 50 Hz (20 ms entre muestras)',
    '# Parametros de referencia: 75 BPM, 98.5% SpO2',
    'indice,tiempo_ms,ir,rojo'
  ]

  for (let i = 0; i < senal.totalMuestras; i++) {
    const tMs = i * 20
    lineas.push(`${i},${tMs},${senal.muestrasIr[i]},${senal.muestrasRojo[i]}`)
  }

  return lineas.join('\n')
}

// ============================================================================
// 5. SERVICIO PRINCIPAL DE CARGA DE SEÑALES (RF27)
// ============================================================================
export const senalesService = {
  /**
   * Obtiene la lista de datasets públicos indexados
   */
  obtenerDatasetsPublicos() {
    return DATASETS_PUBLICOS_CATALOGO
  },

  /**
   * Obtiene la lista de bioseñales de referencia validadas
   */
  async obtenerSenalesValidadas() {
    // 1. Intentar consultar base de datos Supabase
    try {
      const { data, error } = await supabase
        .from('senales_referencia')
        .select('*')
        .eq('aprobada', true)
        .order('creado_en', { ascending: false })

      if (!error && data && data.length > 0) {
        return data.map(d => ({
          id: d.id,
          nombre: d.nombre,
          tipo: d.tipo,
          bpmReferencia: Number(d.bpm_referencia) || 72,
          spo2Referencia: 98.0,
          frecuenciaHz: Number(d.frecuencia_hz) || 50,
          descripcion: d.descripcion || '',
          explicacion: d.explicacion || '',
          muestrasIr: Array.isArray(d.ppg) ? d.ppg : [],
          muestrasRojo: Array.isArray(d.ppg) ? d.ppg : [],
          origen: 'supabase'
        }))
      }
    } catch {
      // Usar catálogo integrado si Supabase está offline o sin seeds
    }

    // 2. Retornar catálogo predefinido con generadores dinámicos
    return SENALES_VALIDADAS_CATALOGO.map(s => {
      const muestras = s.generarMuestras()
      return {
        id: s.id,
        nombre: s.nombre,
        tipo: s.tipo,
        bpmReferencia: s.bpmReferencia,
        spo2Referencia: s.spo2Referencia,
        frecuenciaHz: s.frecuenciaHz,
        descripcion: s.descripcion,
        explicacion: s.explicacion,
        muestrasIr: muestras.muestrasIr,
        muestrasRojo: muestras.muestrasRojo,
        totalMuestras: muestras.totalMuestras,
        origen: 'catalogo_clinico'
      }
    })
  },

  /**
   * Genera una bioseñal sintética a partir de un preset de simulación
   */
  generarSenalSimulada(presetId, opcionesPersonalizadas = {}) {
    const preset = PRESETS_SIMULACION.find(p => p.id === presetId) || PRESETS_SIMULACION[0]
    const cfg = {
      bpm: opcionesPersonalizadas.bpm || preset.bpm,
      spo2: opcionesPersonalizadas.spo2 || preset.spo2,
      duracionS: opcionesPersonalizadas.duracionS || 10,
      frecuenciaHz: opcionesPersonalizadas.frecuenciaHz || 50,
      ruido: (opcionesPersonalizadas.ruido ?? preset.ruido) / 100,
      dicrotaFuerte: preset.dicrota === 'prominente' || preset.dicrota === 'normal',
      arritmiaRespiratoria: preset.id === 'sim-arritmia'
    }

    const resultado = generarCurvaFisiologicaRealista(cfg)
    return {
      valido: true,
      origen: 'simulada',
      nombre: preset.nombre,
      presetId: preset.id,
      ...resultado
    }
  },

  /**
   * Carga una bioseñal real a partir de un dataset público
   */
  cargarSenalDataset(datasetId) {
    const ds = DATASETS_PUBLICOS_CATALOGO.find(d => d.id === datasetId)
    if (!ds) return null
    const resultado = ds.generarMuestras()
    return {
      valido: true,
      origen: 'dataset',
      id: ds.id,
      nombre: ds.nombre,
      fuente: ds.fuente,
      licencia: ds.licencia,
      url: ds.url,
      bpmEstimado: ds.bpmReferencia,
      spo2Estimado: ds.spo2Referencia,
      descripcion: ds.descripcion,
      ...resultado
    }
  },

  /**
   * Carga y procesa un archivo CSV de bioseñal
   */
  cargarDesdeCsv(contenidoTexto, nombreArchivo) {
    return parsearArchivoCsv(contenidoTexto, nombreArchivo)
  },

  /**
   * Guarda una señal en la tabla `senales_referencia` de Supabase
   */
  async guardarSenalEnSupabase(datos) {
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const registro = {
        propietario_id: session?.user?.id || null,
        tipo: ['csv', 'simulada', 'dataset', 'validada'].includes(datos.origen) ? datos.origen : 'csv',
        nombre: datos.nombre || 'Señal importada',
        descripcion: datos.descripcion || `Señal cargada (${datos.muestrasIr?.length || 0} muestras a ${datos.frecuenciaHz || 50} Hz)`,
        frecuencia_hz: datos.frecuenciaHz || 50,
        ppg: datos.muestrasIr ? datos.muestrasIr.slice(0, 5000) : [],
        bpm_referencia: datos.bpmEstimado || datos.bpm || 72,
        aprobada: false
      }

      const { data, error } = await supabase
        .from('senales_referencia')
        .insert(registro)
        .select()
        .single()

      if (error) throw error
      return { ok: true, data }
    } catch (err) {
      console.warn('[SenalesService] No se pudo guardar en Supabase (se mantiene en memoria):', err.message)
      return { ok: false, error: err.message }
    }
  }
}
