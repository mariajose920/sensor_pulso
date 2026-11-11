/**
 * ============================================================================
 * sensor_pulso · Servicio de Protección Web (RF68)
 * ============================================================================
 * Responsable: Adán
 * Requerimiento: RF68 - Protección contra XSS, CSRF e inyección, con cabeceras de seguridad
 *
 * Criterios de Aceptación:
 * 1. Un texto con código no se ejecuta (escapado estricto contra XSS e inyección).
 * 2. Las cabeceras de seguridad están activas (CSP, HSTS, X-Content-Type-Options, etc.).
 * ============================================================================
 */

// ----------------------------------------------------------------------------
// 1. ESCAPADO Y SANITIZACIÓN CONTRA XSS (Cross-Site Scripting)
// ----------------------------------------------------------------------------

const MAPA_ENTIDADES_HTML = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;'
}

const REGEX_CARACTERES_HTML = /[&<>"'`/]/g

/**
 * Escapa caracteres especiales de HTML para prevenir inyección de código (XSS).
 * Garantiza que cualquier texto con código (tags, scripts) se muestre como texto
 * plano y NUNCA se ejecute en el navegador.
 *
 * @param {any} entrada - Texto o valor a escapar
 * @returns {string} Texto con entidades HTML seguras
 */
export function escaparHtml(entrada) {
  if (entrada === null || entrada === undefined) return ''
  return String(entrada).replace(REGEX_CARACTERES_HTML, (char) => MAPA_ENTIDADES_HTML[char] || char)
}

/**
 * Proceso inverso de desescapado (útil para pruebas o inspección de fidelidad).
 *
 * @param {string} entrada
 * @returns {string}
 */
export function desescaparHtml(entrada) {
  if (!entrada || typeof entrada !== 'string') return ''
  return entrada
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, '/')
    .replace(/&#x60;/g, '`')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

/**
 * Escapa valores destinados a atributos HTML (ej. title="...", data-value="...", href="...").
 * Codifica comillas y caracteres que podrían permitir salir del atributo.
 *
 * @param {any} entrada
 * @returns {string}
 */
export function escaparAtributoHtml(entrada) {
  if (entrada === null || entrada === undefined) return ''
  return String(entrada)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

/**
 * Sanitiza contenido de usuario eliminando etiquetas ejecutables, manejadores
 * de eventos en línea y pseudoprotocolos peligrosos, truncando la longitud máxima.
 *
 * @param {any} entrada - Texto proporcionado por el usuario
 * @param {number} [maxLongitud=1000] - Longitud máxima permitida
 * @returns {string} Texto seguro sin código ejecutable
 */
export function sanitizarContenidoUsuario(entrada, maxLongitud = 1000) {
  if (entrada === null || entrada === undefined) return ''
  let str = String(entrada)

  // 1. Eliminar bytes nulos y caracteres de control (0x00-0x08, 0x0B, 0x0C, 0x0E-0x1F, 0x7F)
  str = str.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')

  // 2. Eliminar etiquetas de script, iframe, object, embed, style y link con su contenido
  str = str.replace(/<script[\s\S]*?<\/script>/gi, '')
  str = str.replace(/<style[\s\S]*?<\/style>/gi, '')
  str = str.replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
  str = str.replace(/<object[\s\S]*?<\/object>/gi, '')
  str = str.replace(/<embed[\s\S]*?<\/embed>/gi, '')
  str = str.replace(/<\/?(script|iframe|object|embed|applet|style|link|meta|base)[^>]*>/gi, '')

  // 3. Eliminar manejadores de eventos inline (onerror=, onload=, onclick=, onmouseover=, etc.)
  str = str.replace(/\bon[a-z]+\s*=\s*(['"][^'"]*['"]|[^\s>]+)/gi, '')

  // 4. Eliminar pseudoprotocolos (javascript:, vbscript:, data:text/html)
  str = str.replace(/(javascript|vbscript|data\s*:\s*text\/html):/gi, '')

  // 5. Truncar a la longitud máxima
  if (str.length > maxLongitud) {
    str = str.slice(0, maxLongitud)
  }

  return str.trim()
}

/**
 * Valida si una URL es segura contra inyección de pseudoprotocolos (CWE-79).
 * Solo permite esquemas legítimos: http, https, mailto y rutas relativas.
 *
 * @param {string} url
 * @returns {boolean} True si la URL es segura
 */
export function esUrlSegura(url) {
  if (!url || typeof url !== 'string') return false
  const limpio = url.trim()

  // Rutas relativas seguras
  if (limpio.startsWith('/') && !limpio.startsWith('//')) return true
  if (limpio.startsWith('./') || limpio.startsWith('../')) return true

  // Comprobar esquema
  try {
    const parsed = new URL(limpio)
    const protocolo = parsed.protocol.toLowerCase()
    return ['http:', 'https:', 'mailto:'].includes(protocolo)
  } catch {
    // Si no es URL absoluta, validar que no contenga dos puntos antes de una barra (pseudoprotocolo)
    return !/^[a-z0-9+.-]+:/i.test(limpio)
  }
}

/**
 * Detecta si una cadena contiene código HTML/JavaScript malicioso o sospechoso de XSS.
 *
 * @param {string} texto
 * @returns {boolean} True si detecta código potencialmente peligroso
 */
export function contieneCodigoPeligroso(texto) {
  if (!texto || typeof texto !== 'string') return false
  const patronesPeligrosos = [
    /<script/i,
    /<\/script>/i,
    /<iframe/i,
    /<object/i,
    /<embed/i,
    /javascript:/i,
    /vbscript:/i,
    /data:text\/html/i,
    /\bon[a-z]+\s*=/i,
    /<img[^>]+onerror/i,
    /<svg[^>]+onload/i,
    /<body[^>]+onload/i
  ]
  return patronesPeligrosos.some((regex) => regex.test(texto))
}

// ----------------------------------------------------------------------------
// 2. PROTECCIÓN CONTRA CSRF (Cross-Site Request Forgery)
// ----------------------------------------------------------------------------

/**
 * Lista blanca de dominios y orígenes autorizados para realizar peticiones mutables
 */
export const ORIGENES_PERMITIDOS_DEFECTO = [
  'https://sensorpulso.vercel.app',
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'http://localhost:4173',
  'http://127.0.0.1:4173'
]

/**
 * Evalúa si un origen dado pertenece a la lista de orígenes autorizados
 * (incluyendo vistas previas de Vercel y variables de entorno).
 *
 * @param {string} origen - Origen o cabecera Origin/Referer
 * @param {Object} [env=process.env]
 * @returns {boolean}
 */
export function esOrigenPermitido(origen, env = typeof process !== 'undefined' ? process.env : {}) {
  if (!origen || typeof origen !== 'string') return false
  const origenNormalizado = origen.trim().replace(/\/$/, '')

  // 1. Orígenes por defecto
  if (ORIGENES_PERMITIDOS_DEFECTO.some(o => o.toLowerCase() === origenNormalizado.toLowerCase())) {
    return true
  }

  // 2. Origen configurado en variables de entorno (APP_URL o VERCEL_URL)
  const appUrl = (env?.APP_URL || env?.VITE_APP_URL || '').replace(/\/$/, '')
  if (appUrl && appUrl.toLowerCase() === origenNormalizado.toLowerCase()) {
    return true
  }
  const vercelUrl = env?.VERCEL_URL ? `https://${env.VERCEL_URL}`.replace(/\/$/, '') : ''
  if (vercelUrl && vercelUrl.toLowerCase() === origenNormalizado.toLowerCase()) {
    return true
  }

  // 3. Subdominios de preview oficiales de Vercel del proyecto
  try {
    const parsed = new URL(origenNormalizado)
    if (parsed.protocol === 'https:' && parsed.hostname.endsWith('.vercel.app')) {
      return true
    }
  } catch {
    return false
  }

  return false
}

/**
 * Valida la protección contra CSRF en solicitudes entrantes al servidor / API.
 * Para métodos que mutan estado (POST, PUT, DELETE, PATCH):
 * - Permite llamadas máquina a máquina con cabecera de autenticación de token de dispositivo (X-ESP32-Token).
 * - Para navegadores web, exige que Origin o Referer coincida con un origen permitido.
 *
 * @param {Object} req - Objeto de solicitud HTTP (Next/Vercel/Node)
 * @param {Object} [opciones]
 * @returns {{ permitido: boolean, codigo?: number, error?: string, origenDetectado?: string }}
 */
export function validarOrigenCsrf(req, opciones = {}) {
  const metodo = (req?.method || 'GET').toUpperCase()

  // Métodos seguros / de solo lectura (RFC 7231) no requieren validación CSRF
  if (['GET', 'HEAD', 'OPTIONS'].includes(metodo)) {
    return { permitido: true }
  }

  // Si cuenta con autenticación por token de hardware ESP32, es una solicitud M2M
  const tokenEsp32 = req?.headers?.['x-esp32-token'] || req?.headers?.['X-ESP32-Token']
  if (tokenEsp32 && typeof tokenEsp32 === 'string' && tokenEsp32.trim().length > 0) {
    return { permitido: true, tipo: 'esp32_m2m' }
  }

  // Solicitudes autenticadas mediante cabecera Authorization (Bearer JWT)
  // Las peticiones con Authorization header requieren JavaScript para inyectarse (no viajan automáticamente como cookies)
  const authHeader = req?.headers?.authorization || req?.headers?.Authorization
  if (authHeader && typeof authHeader === 'string' && /^Bearer\s+\S+/i.test(authHeader.trim())) {
    return { permitido: true, tipo: 'bearer_token' }
  }

  // Si el navegador indica explícitamente sec-fetch-site: cross-site, es un intento de CSRF
  const secFetchSite = req?.headers?.['sec-fetch-site']
  if (secFetchSite === 'cross-site') {
    return {
      permitido: false,
      codigo: 403,
      error: 'Solicitud rechazada por protección CSRF: origen cruzado no permitido (Sec-Fetch-Site: cross-site).'
    }
  }

  // Extraer Origin o Referer
  const origen = req?.headers?.origin || req?.headers?.Origin
  const referer = req?.headers?.referer || req?.headers?.Referer

  let origenAValidar = origen
  if (!origenAValidar && referer) {
    try {
      origenAValidar = new URL(referer).origin
    } catch {
      origenAValidar = null
    }
  }

  // Si el navegador envió Origin o Referer, debe pertenecer a la lista de orígenes autorizados
  if (origenAValidar) {
    const env = opciones.env || (typeof process !== 'undefined' ? process.env : {})
    if (!esOrigenPermitido(origenAValidar, env)) {
      return {
        permitido: false,
        codigo: 403,
        error: `Solicitud rechazada por protección CSRF: origen «${origenAValidar}» no autorizado.`,
        origenDetectado: origenAValidar
      }
    }
    return { permitido: true, origenDetectado: origenAValidar }
  }

  // Si no se proporcionó Origin ni Referer (peticiones directas M2M o suites de prueba internas)
  return { permitido: true, tipo: 'directo_sin_origen' }
}

// ----------------------------------------------------------------------------
// 3. REVISIÓN Y PREVENCIÓN DE INYECCIÓN SQL
// ----------------------------------------------------------------------------

/**
 * Valida si una cadena cumple con el formato estándar de UUID v4 para evitar
 * que un identificador alterado contenga inyección SQL.
 *
 * @param {string} id
 * @returns {boolean}
 */
export function esUuidValido(id) {
  if (!id || typeof id !== 'string') return false
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  return uuidRegex.test(id.trim())
}

/**
 * Detecta intentos de inyección SQL comunes en cadenas de texto no sanitizadas.
 *
 * @param {string} entrada
 * @returns {boolean} True si contiene patrones típicos de ataque SQL injection
 */
export function detectarIntentoInyeccionSql(entrada) {
  if (!entrada || typeof entrada !== 'string') return false
  const patronesSql = [
    /('|\b)(OR|AND)\b.+?(=|<|>|LIKE)/i,
    /UNION\s+(ALL\s+)?SELECT/i,
    /;\s*(DROP|DELETE|TRUNCATE|ALTER|UPDATE|INSERT)\s+/i,
    /--[\s\r\n]/,
    /\/\*[\s\S]*?\*\//,
    /\bEXEC(\s+|\()+/i,
    /\bxp_cmdshell\b/i,
    /\bBENCHMARK\s*\(/i,
    /\bPG_SLEEP\s*\(/i
  ]
  return patronesSql.some((regex) => regex.test(entrada))
}

// ----------------------------------------------------------------------------
// 4. CABECERAS DE SEGURIDAD ACTIVAS (CSP, HSTS, X-Content-Type-Options, etc.)
// ----------------------------------------------------------------------------

/**
 * Cabeceras estándar de seguridad web de producción
 */
export const CABECERAS_SEGURIDAD_OFICIALES = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), serial=(self)',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.googleusercontent.com; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://sensorpulso.vercel.app; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'; upgrade-insecure-requests"
}

/**
 * Cabeceras de seguridad específicas para endpoints JSON / API
 */
export const CABECERAS_API_SEGURIDAD = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate'
}

/**
 * Aplica las cabeceras de seguridad activas a un objeto de respuesta HTTP (Node / Vercel).
 *
 * @param {Object} res - Objeto http.ServerResponse
 * @param {'web' | 'api'} [tipo='api'] - Tipo de respuesta (web o api)
 */
export function aplicarCabecerasSeguridad(res, tipo = 'api') {
  if (!res || typeof res.setHeader !== 'function') return
  const cabeceras = tipo === 'web' ? CABECERAS_SEGURIDAD_OFICIALES : CABECERAS_API_SEGURIDAD
  for (const [clave, valor] of Object.entries(cabeceras)) {
    res.setHeader(clave, valor)
  }
}

/**
 * Verifica si un mapa o lista de cabeceras cumple con los estándares mínimos de seguridad activa.
 *
 * @param {Object} headersMap - Objeto clave-valor de cabeceras
 * @returns {{ validas: boolean, faltantes: string[] }}
 */
export function verificarCabecerasSeguridad(headersMap = {}) {
  const normalizadas = {}
  for (const [k, v] of Object.entries(headersMap)) {
    normalizadas[k.toLowerCase()] = v
  }

  const requeridas = [
    'strict-transport-security',
    'x-content-type-options',
    'x-frame-options',
    'content-security-policy',
    'referrer-policy'
  ]

  const faltantes = requeridas.filter(h => !normalizadas[h])
  return {
    validas: faltantes.length === 0,
    faltantes
  }
}

export const proteccionWebService = {
  escaparHtml,
  desescaparHtml,
  escaparAtributoHtml,
  sanitizarContenidoUsuario,
  esUrlSegura,
  contieneCodigoPeligroso,
  esOrigenPermitido,
  validarOrigenCsrf,
  esUuidValido,
  detectarIntentoInyeccionSql,
  aplicarCabecerasSeguridad,
  verificarCabecerasSeguridad,
  CABECERAS_SEGURIDAD_OFICIALES,
  CABECERAS_API_SEGURIDAD
}
