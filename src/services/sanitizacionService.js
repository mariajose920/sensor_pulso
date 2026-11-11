/**
 * ============================================================================
 * sensor_pulso · Servicio de Validación y Sanitización de Entradas (RF65)
 * ============================================================================
 * Normativa de Ciberseguridad:
 * - OWASP Top 10 (A03:2021 - Injection, A04:2021 - Insecure Design)
 * - CWE-20: Improper Input Validation
 * - CWE-79: Cross-Site Scripting (XSS)
 * - CWE-1236: Improper Neutralization of Formula Elements in CSV File
 * - CWE-1321: Improperly Controlled Modification of Object Prototype (Prototype Pollution)
 *
 * Provee sanitización estricta para:
 * 1. Telemetría IoT recibida del microcontrolador ESP32 (JSON).
 * 2. Archivos y celdas CSV de bioseñales externas (prevención de XSS y Formula Injection).
 * 3. Textos y cadenas de entrada de usuario.
 * ============================================================================
 */

import {
  LIMITES_CSV,
  detectarFormulaCsv,
  detectarArchivoBinario,
  validarLimitesArchivoCsv,
  validarMetadatosArchivoCsv
} from './limitesCsvService.js'

import {
  escaparHtml,
  desescaparHtml,
  escaparAtributoHtml,
  sanitizarContenidoUsuario,
  esUrlSegura,
  contieneCodigoPeligroso
} from './proteccionWebService.js'

export {
  LIMITES_CSV,
  detectarFormulaCsv,
  detectarArchivoBinario,
  validarLimitesArchivoCsv,
  validarMetadatosArchivoCsv,
  escaparHtml,
  desescaparHtml,
  escaparAtributoHtml,
  sanitizarContenidoUsuario,
  esUrlSegura,
  contieneCodigoPeligroso
}

// Límites de seguridad (RF65 / RF66)
export const LIMITES_SEGURIDAD = {
  LONGITUD_MAX_TEXTO_DISPOSITIVO: 64,
  LONGITUD_MAX_TOKEN: 256,
  MAX_CANALES_SIMULTANEOS: 5,
  MAX_MUESTRAS_POR_PAQUETE: 200,
  ADC_MAX_VALOR: 262143, // 18 bits MAX30102
  ADC_MIN_VALOR: 0,
  BPM_MIN_FISIOLOGICO: 0,
  BPM_MAX_FISIOLOGICO: 280,
  SPO2_MIN_FISIOLOGICO: 0.0,
  SPO2_MAX_FISIOLOGICO: 100.0,
  MAX_LINEAS_CSV: LIMITES_CSV.MAX_FILAS,
  TAMANO_MAX_CSV_BYTES: LIMITES_CSV.TAMANO_MAX_BYTES
}

export const ESTADOS_CALIDAD_VALIDOS = ['buena', 'regular', 'mala', 'sin_dedo']

/**
 * Sanitiza una cadena de texto eliminando etiquetas HTML, caracteres de control no imprimibles
 * y previniendo ataques de inyección XSS.
 *
 * @param {any} entrada
 * @param {number} maxLongitud
 * @returns {string}
 */
export function sanitizarTexto(entrada, maxLongitud = 256) {
  if (entrada === null || entrada === undefined) return ''
  let str = String(entrada)

  // 1. Eliminar bytes nulos y caracteres de control peligrosos (0x00 a 0x08, 0x0B, 0x0C, 0x0E a 0x1F)
  str = str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')

  // 2. Eliminar bloques <script> y <style> completos (etiquetas y contenido)
  str = str.replace(/<script[\s\S]*?<\/script>/gi, '')
  str = str.replace(/<style[\s\S]*?<\/style>/gi, '')

  // 3. Eliminar etiquetas HTML y elementos residuales
  str = str.replace(/<[^>]*>?/gm, '')

  // 4. Eliminar pseudoprotocolos peligrosos (javascript:, data:, vbscript:)
  str = str.replace(/(javascript|vbscript|data):/gi, '')

  // 5. Truncar longitud máxima para mitigar agotamiento de recursos
  if (str.length > maxLongitud) {
    str = str.slice(0, maxLongitud)
  }

  return str.trim()
}

/**
 * Sanitiza una celda o texto para prevenir CSV / Formula Injection (CWE-1236).
 * Si la celda comienza con caracteres interpretables como fórmulas por software de hojas de cálculo
 * (=, +, -, @, \t, \r, |), se neutraliza anteponiendo una comilla simple apóstrofe (').
 *
 * @param {any} valor
 * @returns {{ valorSanitizado: string, esFormulaPeligrosa: boolean }}
 */
export function neutralizarFormulaCsv(valor) {
  if (valor === null || valor === undefined) {
    return { valorSanitizado: '', esFormulaPeligrosa: false }
  }

  const str = String(valor).trim()
  if (str.length === 0) {
    return { valorSanitizado: '', esFormulaPeligrosa: false }
  }

  // Caracteres gatillo de fórmulas dinámicas en Excel, LibreOffice y Google Sheets
  const caracteresFormula = ['=', '+', '-', '@', '\t', '\r', '|']
  const primerCaracter = str.charAt(0)

  // Si comienza con un signo menos pero es un número negativo legítimo (ej. -0.5, -42), no es fórmula
  if (primerCaracter === '-' || primerCaracter === '+') {
    const num = Number(str.replace(',', '.'))
    if (!isNaN(num)) {
      return { valorSanitizado: str, esFormulaPeligrosa: false }
    }
  }

  // Si comienza con un caracter de fórmula, neutralizar
  if (caracteresFormula.includes(primerCaracter)) {
    // También verificar si contiene comandos ejecutables conocidos
    return {
      valorSanitizado: `'${str}`,
      esFormulaPeligrosa: true
    }
  }

  return { valorSanitizado: str, esFormulaPeligrosa: false }
}

/**
 * Valida si un objeto contiene propiedades peligrosas de Prototype Pollution.
 * @param {any} obj
 * @returns {boolean} True si es seguro, false si detecta prototype pollution
 */
export function verificarSeguridadObjeto(obj) {
  if (!obj || typeof obj !== 'object') return true

  const propiedadesPeligrosas = ['__proto__', 'constructor', 'prototype']
  for (const prop of propiedadesPeligrosas) {
    if (Object.prototype.hasOwnProperty.call(obj, prop)) {
      return false
    }
  }
  return true
}

/**
 * ============================================================================
 * 1. VALIDACIÓN Y SANITIZACIÓN DE TELEMETRÍA DEL ESP32 (RF65)
 * ============================================================================
 * Valida exhaustivamente el payload JSON recibido del ESP32, asegurando
 * tipos estrictos, acotamiento numérico a rangos fisiológicos, truncamiento
 * de arrays y prevención de inyección.
 *
 * @param {any} body - Payload recibido de la petición HTTP
 * @returns {{
 *   valido: boolean,
 *   error?: string,
 *   datosSanitizados?: Object,
 *   advertencias: string[]
 * }}
 */
export function validarYSanitizarTelemetriaEsp32(body) {
  const advertencias = []

  // 1. Validación de existencia y tipo de objeto
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return {
      valido: false,
      error: 'El cuerpo de la telemetría debe ser un objeto JSON válido.',
      advertencias
    }
  }

  // 2. Verificación de Prototype Pollution (CWE-1321)
  if (!verificarSeguridadObjeto(body)) {
    return {
      valido: false,
      error: 'Payload malicioso detectado (intento de Prototype Pollution).',
      advertencias
    }
  }

  // 3. Sanitización de identificador de dispositivo
  let dispositivo = sanitizarTexto(body.dispositivo || 'ESP32-Generico', LIMITES_SEGURIDAD.LONGITUD_MAX_TEXTO_DISPOSITIVO)
  // Permitir sólo caracteres alfanuméricos, guiones, puntos y espacios
  dispositivo = dispositivo.replace(/[^a-zA-Z0-9_\-\. ]/g, '') || 'ESP32-Generico'

  // 4. Validación de campos de red y metadatos del paquete
  let paquete = Number(body.paquete)
  if (isNaN(paquete) || paquete < 0 || !Number.isFinite(paquete)) {
    advertencias.push('Número de paquete inválido; se asignó valor por defecto.')
    paquete = 0
  } else {
    paquete = Math.floor(Math.min(2147483647, paquete))
  }

  let uptimeMs = Number(body.uptime_ms)
  if (isNaN(uptimeMs) || uptimeMs < 0 || !Number.isFinite(uptimeMs)) {
    uptimeMs = null
  } else {
    uptimeMs = Math.floor(uptimeMs)
  }

  let frecuenciaHz = Number(body.frecuencia_hz)
  if (isNaN(frecuenciaHz) || frecuenciaHz <= 0 || frecuenciaHz > 500) {
    frecuenciaHz = 50 // Estándar hospitalario por defecto
  } else {
    frecuenciaHz = Math.round(frecuenciaHz)
  }

  let wifiRssi = Number(body.wifi_rssi)
  if (isNaN(wifiRssi) || wifiRssi < -120 || wifiRssi > 0) {
    wifiRssi = null
  } else {
    wifiRssi = Math.round(wifiRssi)
  }

  // 5. Validación y Sanitización Estricta de Canales (hasta 5 canales simultáneos)
  const canalesRaw = Array.isArray(body.canales) ? body.canales : []
  if (canalesRaw.length > LIMITES_SEGURIDAD.MAX_CANALES_SIMULTANEOS) {
    advertencias.push(`El paquete contiene ${canalesRaw.length} canales; fue truncado al máximo de ${LIMITES_SEGURIDAD.MAX_CANALES_SIMULTANEOS}.`)
  }

  const canalesSanitizados = []
  const canalesLimitados = canalesRaw.slice(0, LIMITES_SEGURIDAD.MAX_CANALES_SIMULTANEOS)

  for (let idx = 0; idx < canalesLimitados.length; idx++) {
    const ch = canalesLimitados[idx]
    if (!ch || typeof ch !== 'object' || !verificarSeguridadObjeto(ch)) continue

    // Canal numérico 1 a 5
    let numCanal = Number(ch.canal)
    if (isNaN(numCanal) || numCanal < 1 || numCanal > 5) {
      numCanal = idx + 1
    } else {
      numCanal = Math.floor(numCanal)
    }

    // Estado activo
    const activo = ch.activo !== false

    // BPM acotado a rango fisiológico seguro [0, 280]
    let bpm = Number(ch.bpm)
    if (isNaN(bpm) || !Number.isFinite(bpm) || bpm < LIMITES_SEGURIDAD.BPM_MIN_FISIOLOGICO) {
      bpm = 0
    } else if (bpm > LIMITES_SEGURIDAD.BPM_MAX_FISIOLOGICO) {
      advertencias.push(`Canal ${numCanal}: BPM (${bpm}) supera el límite fisiológico humano; acotado a ${LIMITES_SEGURIDAD.BPM_MAX_FISIOLOGICO}.`)
      bpm = LIMITES_SEGURIDAD.BPM_MAX_FISIOLOGICO
    } else {
      bpm = parseFloat(bpm.toFixed(1))
    }

    // SpO2 acotado a porcentaje [0.0, 100.0]
    let spo2 = Number(ch.spo2)
    if (isNaN(spo2) || !Number.isFinite(spo2) || spo2 < LIMITES_SEGURIDAD.SPO2_MIN_FISIOLOGICO) {
      spo2 = 0.0
    } else if (spo2 > LIMITES_SEGURIDAD.SPO2_MAX_FISIOLOGICO) {
      advertencias.push(`Canal ${numCanal}: SpO2 (${spo2}%) supera el 100%; acotado a 100%.`)
      spo2 = 100.0
    } else {
      spo2 = parseFloat(spo2.toFixed(1))
    }

    // Calidad validada por whitelist
    const calidadStr = String(ch.calidad || '').toLowerCase().trim()
    const calidad = ESTADOS_CALIDAD_VALIDOS.includes(calidadStr) ? calidadStr : 'buena'

    // Validación y filtrado de arrays de muestras IR y Rojo (rango ADC MAX30102 0 a 262143)
    const sanitizarMuestrasAdc = (arr) => {
      if (!Array.isArray(arr)) return []
      return arr
        .slice(0, LIMITES_SEGURIDAD.MAX_MUESTRAS_POR_PAQUETE)
        .map(v => Number(v))
        .filter(n => !isNaN(n) && Number.isFinite(n))
        .map(n => Math.floor(Math.max(LIMITES_SEGURIDAD.ADC_MIN_VALOR, Math.min(LIMITES_SEGURIDAD.ADC_MAX_VALOR, n))))
    }

    const ir = sanitizarMuestrasAdc(ch.ir)
    const rojo = sanitizarMuestrasAdc(ch.rojo)

    canalesSanitizados.push({
      canal: numCanal,
      activo,
      bpm,
      spo2,
      calidad,
      ir,
      rojo
    })
  }

  return {
    valido: true,
    advertencias,
    datosSanitizados: {
      dispositivo,
      paquete,
      uptimeMs,
      frecuenciaHz,
      wifiRssi,
      canales: canalesSanitizados
    }
  }
}

/**
 * ============================================================================
 * 2. VALIDACIÓN Y SANITIZACIÓN DE ARCHIVOS CSV (RF65)
 * ============================================================================
 * Examina exhaustivamente el contenido de un archivo CSV de bioseñales,
 * neutralizando inyección de fórmulas (CWE-1236), descartando caracteres
 * nulos, saneando valores NaN/Infinity y validando coherencia física.
 *
 * @param {string} contenidoTexto - Texto plano del archivo CSV
 * @param {string} nombreArchivo - Nombre del archivo cargado
 * @returns {{
 *   valido: boolean,
 *   error?: string,
 *   advertencias: string[],
 *   lineasTotales: number,
 *   lineasValidas: number,
 *   formulasNeutralizadas: number,
 *   delimitador: string,
 *   cabeceras: string[],
 *   muestrasIr: number[],
 *   muestrasRojo: number[],
 *   timestamps: number[],
 *   frecuenciaEstimadaHz: number
 * }}
 */
export function validarYSanitizarArchivoCsv(contenidoTexto, nombreArchivo = 'bioseñal.csv') {
  const advertencias = []

  // 1. Verificación básica de entrada
  if (!contenidoTexto || typeof contenidoTexto !== 'string') {
    return {
      valido: false,
      error: 'El archivo está vacío o el formato de texto no es legible.',
      advertencias
    }
  }

  // 2. Límite de tamaño (RF66 / 5 MB)
  if (contenidoTexto.length > LIMITES_SEGURIDAD.TAMANO_MAX_CSV_BYTES) {
    return {
      valido: false,
      error: `El archivo supera el tamaño máximo permitido de 5 MB (${(contenidoTexto.length / 1024 / 1024).toFixed(2)} MB).`,
      advertencias
    }
  }

  // 3. Limpieza de bytes nulos (Null Byte Injection)
  const textoSinNulos = contenidoTexto.replace(/\0/g, '')
  if (textoSinNulos.length !== contenidoTexto.length) {
    advertencias.push('Se detectaron y eliminaron caracteres nulos (\\0) del archivo.')
  }

  // 4. División en líneas
  const todasLineas = textoSinNulos.split(/\r?\n/)
  if (todasLineas.length > LIMITES_SEGURIDAD.MAX_LINEAS_CSV) {
    return {
      valido: false,
      error: `El archivo contiene más de ${LIMITES_SEGURIDAD.MAX_LINEAS_CSV.toLocaleString()} líneas. Límite de seguridad excedido.`,
      advertencias
    }
  }

  // Filtrar comentarios (# o //) y líneas vacías
  const lineas = todasLineas
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith('#') && !l.startsWith('//'))

  if (lineas.length < 5) {
    return {
      valido: false,
      error: 'El archivo CSV debe contener al menos 5 registros válidos de serie temporal.',
      advertencias
    }
  }

  // 5. Detección automática del delimitador
  const primeraLinea = lineas[0]
  let delimitador = ','
  const conteoComas = (primeraLinea.match(/,/g) || []).length
  const conteoPuntoComa = (primeraLinea.match(/;/g) || []).length
  const conteoTabs = (primeraLinea.match(/\t/g) || []).length
  const conteoPipes = (primeraLinea.match(/\|/g) || []).length

  if (conteoPuntoComa > conteoComas && conteoPuntoComa >= conteoTabs) {
    delimitador = ';'
  } else if (conteoTabs > conteoComas && conteoTabs > conteoPuntoComa) {
    delimitador = '\t'
  } else if (conteoPipes > conteoComas) {
    delimitador = '|'
  }

  // 6. Análisis y sanitización de cabeceras
  let formulasNeutralizadas = 0
  const cabecerasBrutas = primeraLinea.split(delimitador).map(c => {
    const { valorSanitizado, esFormulaPeligrosa } = neutralizarFormulaCsv(c)
    if (esFormulaPeligrosa) formulasNeutralizadas++
    return sanitizarTexto(valorSanitizado, 64).toLowerCase().replace(/^["']|["']$/g, '')
  })

  // Determinar si la primera línea es cabecera o datos numéricos
  const esPrimeraLineaHeader = cabecerasBrutas.some(c => isNaN(Number(c.replace(',', '.'))))
  const indiceInicioDatos = esPrimeraLineaHeader ? 1 : 0

  // Mapeo inteligente de columnas
  let colTiempo = -1
  let colIr = -1
  let colRojo = -1
  let colPpgUnico = -1

  if (esPrimeraLineaHeader) {
    cabecerasBrutas.forEach((col, idx) => {
      if (['tiempo', 'time', 't', 'tiempo_ms', 'time_ms', 'timestamp', 'sec', 'segundos'].includes(col)) colTiempo = idx
      else if (['ir', 'ir_raw', 'infrarrojo', 'ir_filtrado', 'pleth', 'pleth_ir', 'channel1', 'ch1'].includes(col)) colIr = idx
      else if (['rojo', 'red', 'red_raw', 'rojo_filtrado', 'red_filtrado', 'channel2', 'ch2'].includes(col)) colRojo = idx
      else if (['ppg', 'senal', 'valor', 'signal', 'val', 'data', 'bio'].includes(col)) colPpgUnico = idx
    })
  } else {
    // Si no hay cabecera explícita, mapear por posición
    const numCols = primeraLinea.split(delimitador).length
    if (numCols === 1) colPpgUnico = 0
    else if (numCols === 2) { colTiempo = 0; colPpgUnico = 1 }
    else { colTiempo = 0; colIr = 1; colRojo = 2 }
  }

  if (colIr === -1 && colPpgUnico === -1) {
    // Fallback: usar la última columna disponible como PPG
    const numCols = primeraLinea.split(delimitador).length
    colPpgUnico = numCols - 1
  }

  // 7. Parseo y sanitización fila por fila
  const muestrasIr = []
  const muestrasRojo = []
  const timestamps = []
  let lineasDescartadas = 0

  const parsearNumeroSeguro = (valStr) => {
    if (!valStr) return null
    const { valorSanitizado, esFormulaPeligrosa } = neutralizarFormulaCsv(valStr)
    if (esFormulaPeligrosa) formulasNeutralizadas++

    const limpio = valorSanitizado.replace(/^'/, '').replace(',', '.').trim()
    const num = Number(limpio)
    if (isNaN(num) || !Number.isFinite(num)) return null
    return num
  }

  for (let i = indiceInicioDatos; i < lineas.length; i++) {
    const fila = lineas[i]
    const tokens = fila.split(delimitador)
    if (tokens.length === 0) continue

    const tVal = colTiempo >= 0 && colTiempo < tokens.length ? parsearNumeroSeguro(tokens[colTiempo]) : i
    const irVal = colIr >= 0 && colIr < tokens.length
      ? parsearNumeroSeguro(tokens[colIr])
      : (colPpgUnico >= 0 && colPpgUnico < tokens.length ? parsearNumeroSeguro(tokens[colPpgUnico]) : null)
    const rojoVal = colRojo >= 0 && colRojo < tokens.length ? parsearNumeroSeguro(tokens[colRojo]) : null

    if (irVal !== null) {
      muestrasIr.push(irVal)
      if (rojoVal !== null) muestrasRojo.push(rojoVal)
      if (tVal !== null) timestamps.push(tVal)
    } else {
      lineasDescartadas++
    }
  }

  if (muestrasIr.length < 5) {
    return {
      valido: false,
      error: 'El archivo no contiene suficientes registros numéricos legibles de fotopletismografía.',
      advertencias
    }
  }

  if (formulasNeutralizadas > 0) {
    advertencias.push(`Se neutralizaron ${formulasNeutralizadas} celdas con fórmulas potencialmente peligrosas (Formula Injection / CWE-1236).`)
  }

  if (lineasDescartadas > 0) {
    advertencias.push(`Se descartaron ${lineasDescartadas} líneas con valores corruptos o no numéricos.`)
  }

  // 8. Estimación de frecuencia de muestreo a partir de tiempos
  let frecuenciaEstimadaHz = 50
  if (timestamps.length >= 10) {
    const dtArr = []
    for (let j = 1; j < Math.min(timestamps.length, 60); j++) {
      const dt = timestamps[j] - timestamps[j - 1]
      if (dt > 0) dtArr.push(dt)
    }
    if (dtArr.length > 0) {
      const dtProm = dtArr.reduce((a, b) => a + b, 0) / dtArr.length
      const dtSegundos = dtProm < 1.0 ? dtProm : dtProm / 1000.0
      if (dtSegundos >= 0.002 && dtSegundos <= 1.0) {
        frecuenciaEstimadaHz = Math.round(1.0 / dtSegundos)
      }
    }
  }

  return {
    valido: true,
    advertencias,
    lineasTotales: lineas.length,
    lineasValidas: muestrasIr.length,
    formulasNeutralizadas,
    delimitador,
    cabeceras: cabecerasBrutas,
    muestrasIr,
    muestrasRojo,
    timestamps,
    frecuenciaEstimadaHz
  }
}
