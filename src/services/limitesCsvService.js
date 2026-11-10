/**
 * ============================================================================
 * sensor_pulso · Servicio de Límites y Seguridad de Archivos CSV (RF66)
 * ============================================================================
 * Responsable: Adán
 * Requerimiento: RF66 - Límites de archivos CSV
 *
 * Normativa de Ciberseguridad:
 * - OWASP Top 10 (A03:2021 - Injection / Formula Injection CWE-1236)
 * - CWE-434: Unrestricted Upload of File with Dangerous Type
 * - CWE-400: Uncontrolled Resource Consumption (Límites de tamaño y filas)
 *
 * Criterio de Aceptación:
 * - Un archivo grande, de otro tipo o con fórmulas se rechaza antes de procesarse.
 * ============================================================================
 */

export const LIMITES_CSV = {
  TAMANO_MAX_BYTES: 5 * 1024 * 1024, // 5 MB
  MAX_FILAS: 50000,                  // 50.000 filas
  MIN_FILAS: 5,                      // Mínimo 5 filas requeridas para bioseñal
  EXTENSION_PERMITIDA: '.csv',
  TIPOS_MIME_PERMITIDOS: [
    'text/csv',
    'application/csv',
    'application/vnd.ms-excel',
    'text/plain'
  ],
  CARACTERES_FORMULA: ['=', '+', '-', '@']
}

/**
 * Detecta si una celda contiene una fórmula peligrosa de hoja de cálculo.
 * Cumple con: "Detectar fórmulas que empiezan con =, +, - o @".
 *
 * @param {any} valor
 * @returns {{ esFormula: boolean, detalle?: string, caracter?: string, valor?: string }}
 */
export function detectarFormulaCsv(valor) {
  if (valor === null || valor === undefined) {
    return { esFormula: false }
  }

  let str = String(valor).trim()
  if (str.length === 0) {
    return { esFormula: false }
  }

  // Quitar comillas envolventes si las tiene (ej: "=SUM(1,2)")
  if ((str.startsWith('"') && str.endsWith('"')) || (str.startsWith("'") && str.endsWith("'"))) {
    str = str.slice(1, -1).trim()
    if (str.length === 0) return { esFormula: false }
  }

  const primerCaracter = str.charAt(0)

  // 1. Detección de caracteres de inicio de fórmula: '=', '@'
  if (primerCaracter === '=' || primerCaracter === '@') {
    return {
      esFormula: true,
      caracter: primerCaracter,
      valor: str,
      detalle: `Fórmula que inicia con '${primerCaracter}'`
    }
  }

  // 2. Detección de fórmulas que inician con '+' o '-'
  if (primerCaracter === '+' || primerCaracter === '-') {
    // Si es un número legítimo positivo o negativo (ej: -0.5, +72.0, -12, +10), NO es fórmula
    const strNormalizado = str.replace(',', '.')
    const num = Number(strNormalizado)
    const tieneComandosOTexto = /[a-zA-Z\|\(\)\$\!]/.test(str)

    if (isNaN(num) || !isFinite(num) || tieneComandosOTexto) {
      return {
        esFormula: true,
        caracter: primerCaracter,
        valor: str,
        detalle: `Fórmula o comando que inicia con '${primerCaracter}'`
      }
    }
  }

  // 3. Detección de comando DDE pipe (|) o caracteres de control de fórmula al inicio
  if (primerCaracter === '|' || primerCaracter === '\t' || primerCaracter === '\r') {
    return {
      esFormula: true,
      caracter: primerCaracter,
      valor: str,
      detalle: `Comando DDE o caracter de control '${primerCaracter}'`
    }
  }

  return { esFormula: false }
}

/**
 * Detecta si el contenido corresponde a un archivo binario.
 * Cumple con: "Detectar archivos binarios".
 *
 * @param {string | Uint8Array | Buffer} contenido
 * @returns {{ esBinario: boolean, motivo?: string }}
 */
export function detectarArchivoBinario(contenido) {
  if (!contenido) return { esBinario: false }

  // 1. Si es string:
  if (typeof contenido === 'string') {
    // A. Presencia de bytes nulos (\0)
    if (contenido.includes('\0')) {
      return {
        esBinario: true,
        motivo: 'Contiene caracteres nulos (\\0) propios de archivos binarios'
      }
    }

    // B. Detección de firmas mágicas binarias comunes (primeros caracteres)
    const encabezado = contenido.slice(0, 128)

    // Windows PE / DLL / EXE (MZ)
    if (encabezado.startsWith('MZ')) {
      return { esBinario: true, motivo: 'Cabecera ejecutable Windows (MZ/PE)' }
    }

    // Linux ELF
    if (encabezado.startsWith('\x7fELF')) {
      return { esBinario: true, motivo: 'Cabecera binaria ELF de Linux' }
    }

    // PDF
    if (encabezado.startsWith('%PDF-')) {
      return { esBinario: true, motivo: 'Documento binario PDF (%PDF)' }
    }

    // ZIP / Office OpenXML (.docx, .xlsx, .zip, .jar)
    if (encabezado.startsWith('PK\x03\x04') || encabezado.startsWith('PK\x05\x06')) {
      return { esBinario: true, motivo: 'Archivo comprimido o documento Office binario (PK/ZIP)' }
    }

    // PNG
    if (encabezado.startsWith('\x89PNG')) {
      return { esBinario: true, motivo: 'Imagen binaria PNG' }
    }

    // GIF
    if (encabezado.startsWith('GIF87a') || encabezado.startsWith('GIF89a')) {
      return { esBinario: true, motivo: 'Imagen binaria GIF' }
    }

    // WebAssembly
    if (encabezado.startsWith('\x00asm')) {
      return { esBinario: true, motivo: 'Módulo binario WebAssembly' }
    }

    // JPEG
    if (encabezado.charCodeAt(0) === 0xFF && encabezado.charCodeAt(1) === 0xD8 && encabezado.charCodeAt(2) === 0xFF) {
      return { esBinario: true, motivo: 'Imagen binaria JPEG' }
    }

    // C. Inspección de caracteres de control no imprimibles (0x01 a 0x08, 0x0E a 0x1F, 0x7F)
    const muestra = contenido.slice(0, 2048)
    let caracteresControl = 0
    for (let i = 0; i < muestra.length; i++) {
      const code = muestra.charCodeAt(i)
      // Caracteres de control no válidos en texto CSV (excluyendo \t 0x09, \n 0x0A, \r 0x0D)
      if ((code >= 1 && code <= 8) || (code >= 14 && code <= 31) || code === 127) {
        caracteresControl++
      }
    }

    if (caracteresControl > 0) {
      return {
        esBinario: true,
        motivo: `Contiene ${caracteresControl} bytes de control no imprimibles (formato binario)`
      }
    }

    return { esBinario: false }
  }

  // 2. Si es Uint8Array o Buffer
  if (contenido instanceof Uint8Array || (typeof Buffer !== 'undefined' && Buffer.isBuffer(contenido))) {
    const len = Math.min(contenido.length, 2048)
    for (let i = 0; i < len; i++) {
      if (contenido[i] === 0) {
        return { esBinario: true, motivo: 'Contiene bytes nulos (0x00)' }
      }
    }
  }

  return { esBinario: false }
}

/**
 * Valida los metadatos iniciales de un archivo antes de cargarlo o leerlo en memoria.
 * Permite rechazar archivos grandes o de tipo no .csv de forma instantánea.
 *
 * @param {File | { name: string, size?: number, type?: string }} archivo
 * @returns {{ valido: boolean, error?: string, motivoRechazo?: string }}
 */
export function validarMetadatosArchivoCsv(archivo) {
  if (!archivo) {
    return {
      valido: false,
      error: 'No se ha proporcionado ningún archivo para validar.',
      motivoRechazo: 'archivo_ausente'
    }
  }

  const nombre = archivo.name || ''

  // 1. Validación de tipo/extensión (.csv)
  if (!nombre.toLowerCase().endsWith(LIMITES_CSV.EXTENSION_PERMITIDA)) {
    return {
      valido: false,
      error: `El archivo "${nombre}" no es de tipo .csv. Por seguridad (RF66), solo se admiten archivos con extensión .csv.`,
      motivoRechazo: 'tipo_invalido'
    }
  }

  // 2. Validación de tamaño máximo (5 MB)
  if (typeof archivo.size === 'number' && archivo.size > LIMITES_CSV.TAMANO_MAX_BYTES) {
    const tamanoMb = (archivo.size / (1024 * 1024)).toFixed(2)
    const maxMb = (LIMITES_CSV.TAMANO_MAX_BYTES / (1024 * 1024)).toFixed(0)
    return {
      valido: false,
      error: `El archivo supera el tamaño máximo permitido de ${maxMb} MB (${tamanoMb} MB).`,
      motivoRechazo: 'tamano_excedido'
    }
  }

  return { valido: true }
}

/**
 * ============================================================================
 * Validador Integral de Límites y Seguridad de Archivos CSV (RF66)
 * ============================================================================
 * Criterio de Aceptación:
 * - Un archivo grande, de otro tipo o con fórmulas se rechaza antes de procesarse.
 *
 * @param {string} contenidoTexto - Contenido textual completo del archivo CSV
 * @param {{
 *   nombreArchivo?: string,
 *   tamanoBytes?: number,
 *   tipoMime?: string,
 *   maxFilas?: number,
 *   tamanoMaxBytes?: number
 * }} opciones
 * @returns {{
 *   valido: boolean,
 *   error?: string,
 *   motivoRechazo?: 'tipo_invalido' | 'tamano_excedido' | 'archivo_binario' | 'archivo_vacio' | 'filas_excedidas' | 'filas_insuficientes' | 'formula_detectada',
 *   totalFilas?: number,
 *   tamanoBytes?: number,
 *   delimitador?: string,
 *   detalle?: Object
 * }}
 */
export function validarLimitesArchivoCsv(contenidoTexto, opciones = {}) {
  const nombreArchivo = opciones.nombreArchivo || 'senal.csv'
  const maxFilas = opciones.maxFilas || LIMITES_CSV.MAX_FILAS
  const tamanoMaxBytes = opciones.tamanoMaxBytes || LIMITES_CSV.TAMANO_MAX_BYTES

  // 1. RECHAZO POR TIPO DE ARCHIVO (no es .csv)
  if (!nombreArchivo.toLowerCase().endsWith(LIMITES_CSV.EXTENSION_PERMITIDA)) {
    return {
      valido: false,
      error: `Tipo de archivo no permitido ("${nombreArchivo}"). Por seguridad (RF66), solo se admiten archivos de tipo .csv.`,
      motivoRechazo: 'tipo_invalido'
    }
  }

  // 2. RECHAZO POR TAMAÑO DE ARCHIVO (supera el límite de bytes)
  let tamanoEstimado = typeof opciones.tamanoBytes === 'number' ? opciones.tamanoBytes : null
  if (tamanoEstimado === null && typeof contenidoTexto === 'string') {
    if (typeof Buffer !== 'undefined') {
      tamanoEstimado = Buffer.byteLength(contenidoTexto, 'utf8')
    } else {
      tamanoEstimado = new Blob([contenidoTexto]).size
    }
  }

  if (tamanoEstimado !== null && tamanoEstimado > tamanoMaxBytes) {
    const tamanoMb = (tamanoEstimado / (1024 * 1024)).toFixed(2)
    const maxMb = (tamanoMaxBytes / (1024 * 1024)).toFixed(0)
    return {
      valido: false,
      error: `El archivo supera el tamaño máximo permitido de ${maxMb} MB (${tamanoMb} MB). Rechazado antes de procesarse (RF66).`,
      motivoRechazo: 'tamano_excedido',
      tamanoBytes: tamanoEstimado
    }
  }

  // 3. RECHAZO POR ARCHIVO VACÍO
  if (!contenidoTexto || (typeof contenidoTexto === 'string' && contenidoTexto.trim().length === 0)) {
    return {
      valido: false,
      error: 'El archivo CSV está vacío. Debe contener datos de bioseñal para procesarse.',
      motivoRechazo: 'archivo_vacio'
    }
  }

  // 4. RECHAZO POR CONTENIDO BINARIO
  const resultadoBinario = detectarArchivoBinario(contenidoTexto)
  if (resultadoBinario.esBinario) {
    return {
      valido: false,
      error: `El archivo contiene datos binarios no permitidos (${resultadoBinario.motivo}). Rechazado antes de procesarse (RF66).`,
      motivoRechazo: 'archivo_binario',
      detalle: resultadoBinario
    }
  }

  // 5. RECHAZO POR MÁXIMO DE FILAS
  const todasLineas = contenidoTexto.split(/\r?\n/)
  // Líneas significativas (sin líneas en blanco al final o comentarios)
  const lineasSignificativas = todasLineas.filter(l => l.trim().length > 0 && !l.trim().startsWith('#') && !l.trim().startsWith('//'))

  if (todasLineas.length > maxFilas) {
    return {
      valido: false,
      error: `El archivo contiene ${todasLineas.length.toLocaleString()} filas, superando el máximo permitido de ${maxFilas.toLocaleString()} filas. Rechazado antes de procesarse (RF66).`,
      motivoRechazo: 'filas_excedidas',
      totalFilas: todasLineas.length
    }
  }

  if (lineasSignificativas.length < LIMITES_CSV.MIN_FILAS) {
    return {
      valido: false,
      error: `El archivo contiene ${lineasSignificativas.length} filas válidas; se requieren al menos ${LIMITES_CSV.MIN_FILAS} registros para procesar una bioseñal útil.`,
      motivoRechazo: 'filas_insuficientes',
      totalFilas: lineasSignificativas.length
    }
  }

  // 6. DETECCIÓN AUTOMÁTICA DE DELIMITADOR
  const primeraLinea = lineasSignificativas[0]
  let delimitador = ','
  const conteoComas = (primeraLinea.match(/,/g) || []).length
  const conteoPuntoComa = (primeraLinea.match(/;/g) || []).length
  const conteoTabs = (primeraLinea.match(/\t/g) || []).length

  if (conteoPuntoComa > conteoComas && conteoPuntoComa >= conteoTabs) {
    delimitador = ';'
  } else if (conteoTabs > conteoComas && conteoTabs > conteoPuntoComa) {
    delimitador = '\t'
  }

  // 7. RECHAZO POR FÓRMULAS (=, +, -, @)
  for (let idx = 0; idx < lineasSignificativas.length; idx++) {
    const numFila = idx + 1
    const linea = lineasSignificativas[idx]

    // Separar celdas respetando el delimitador
    const celdas = linea.split(delimitador)

    for (let cIdx = 0; cIdx < celdas.length; cIdx++) {
      const celda = celdas[cIdx]
      const formula = detectarFormulaCsv(celda)

      if (formula.esFormula) {
        return {
          valido: false,
          error: `El archivo contiene una fórmula potencialmente peligrosa ("${formula.valor}" en fila ${numFila}, columna ${cIdx + 1}). Rechazado antes de procesarse (RF66).`,
          motivoRechazo: 'formula_detectada',
          detalle: {
            fila: numFila,
            columna: cIdx + 1,
            formula: formula.valor,
            caracter: formula.caracter,
            descripcion: formula.detalle
          }
        }
      }
    }
  }

  // Aprobado: Cumple con todos los límites y no tiene contenido peligroso
  return {
    valido: true,
    totalFilas: lineasSignificativas.length,
    tamanoBytes: tamanoEstimado,
    delimitador,
    advertencias: []
  }
}
