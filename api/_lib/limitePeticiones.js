/**
 * ============================================================================
 * sensor_pulso · Control de Límite de Peticiones / Rate Limiting (RF67)
 * ============================================================================
 * Responsable: Adán
 * Requerimiento: RF67 - Límite de peticiones
 *
 * Implementa la limitación de peticiones para la recepción de telemetría del
 * ESP32 y las rutas de la API, utilizando la función RPC `consumir_limite` y
 * la tabla `limites_peticiones` en Supabase/PostgreSQL.
 *
 * Criterios de Aceptación:
 * 1. Al superar el límite la respuesta es 429 con cabecera `Retry-After`.
 * 2. El uso normal no se ve afectado.
 * ============================================================================
 */
import { createClient } from '@supabase/supabase-js'

export const LIMITES_PETICIONES_CONFIG = {
  // ESP32: a 1 Hz normal envía 60 peticiones/min. Un límite de 120 peticiones/min
  // provee un margen del 100% para reintentos y asegura que "el uso normal no se ve afectado"
  ESP32_POST_MAXIMO: 120,
  ESP32_POST_SEGUNDOS: 60,

  // Consultas GET de estado en vivo de telemetría (sondeo web normal a 1 Hz = 60 req/min)
  ESP32_GET_MAXIMO: 120,
  ESP32_GET_SEGUNDOS: 60,

  // Endpoints estándar de la API (cifrado/descifrado de salud)
  API_ESTANDAR_MAXIMO: 60,
  API_ESTANDAR_SEGUNDOS: 60,

  // Endpoints de invitaciones por correo (anti-spam)
  API_INVITACIONES_MAXIMO: 20,
  API_INVITACIONES_SEGUNDOS: 60,

  // Endpoints pesados de portabilidad / exportación de datos
  API_EXPORTAR_MAXIMO: 10,
  API_EXPORTAR_SEGUNDOS: 60
}

// Almacén en memoria de respaldo (resiliencia si Supabase no está configurado en local o durante pruebas)
const memoriaLimites = new Map()

/**
 * Reinicia el almacén en memoria (utilizado principalmente para aislar suites de pruebas)
 */
export function reiniciarMemoriaLimites() {
  memoriaLimites.clear()
}

/**
 * Obtiene un cliente administrativo de Supabase con permisos para invocar `consumir_limite`
 * (security definer sobre public.limites_peticiones)
 *
 * @param {Object} env
 * @returns {import('@supabase/supabase-js').SupabaseClient | null}
 */
export function getAdminSupabase(env = process.env) {
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const secretKey = env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secretKey) return null
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

/**
 * Extrae la IP de origen de la solicitud HTTP
 *
 * @param {import('http').IncomingMessage} req
 * @returns {string}
 */
export function extraerIp(req) {
  const forwarded = req?.headers?.['x-forwarded-for']
  if (forwarded && typeof forwarded === 'string') {
    return forwarded.split(',')[0].trim()
  }
  const realIp = req?.headers?.['x-real-ip']
  if (realIp && typeof realIp === 'string') {
    return realIp.trim()
  }
  return req?.socket?.remoteAddress || req?.ip || '127.0.0.1'
}

/**
 * Verifica y consume el límite de peticiones para una clave dada.
 * Utiliza la función PostgreSQL `consumir_limite(p_clave, p_maximo, p_segundos)`
 * sobre la tabla `limites_peticiones`.
 *
 * @param {Object} params
 * @param {string} params.clave - Identificador del recurso/cliente ('esp32:token', 'login:ip', etc.)
 * @param {number} [params.maximo=120] - Número máximo de peticiones permitidas en la ventana
 * @param {number} [params.segundos=60] - Duración de la ventana en segundos
 * @param {import('@supabase/supabase-js').SupabaseClient} [params.supabase] - Cliente Supabase opcional
 * @param {Object} [params.env=process.env]
 * @returns {Promise<{
 *   permitido: boolean,
 *   contador?: number,
 *   retryAfter: number,
 *   maximo: number,
 *   segundos: number,
 *   fuente: 'supabase' | 'memoria'
 * }>}
 */
export async function verificarLimitePeticiones({
  clave,
  maximo = 120,
  segundos = 60,
  supabase = null,
  env = process.env
}) {
  const ahoraMs = Date.now()
  const ventanaSegundos = Math.floor(ahoraMs / 1000 / segundos) * segundos
  const ventanaFinMs = (ventanaSegundos + segundos) * 1000
  const retryAfter = Math.max(1, Math.ceil((ventanaFinMs - ahoraMs) / 1000))

  const clienteDb = supabase || getAdminSupabase(env)

  // 1. Si hay conexión a Supabase, invocar la función RPC consumir_limite (RF67)
  if (clienteDb?.rpc) {
    try {
      const { data, error } = await clienteDb.rpc('consumir_limite', {
        p_clave: clave,
        p_maximo: maximo,
        p_segundos: segundos
      })

      if (!error && typeof data === 'boolean') {
        return {
          permitido: data,
          retryAfter,
          maximo,
          segundos,
          fuente: 'supabase'
        }
      }
      if (error) {
        console.warn(`[RF67 RateLimit] RPC consumir_limite devolvió error: ${error.message}. Aplicando fallback.`);
      }
    } catch (err) {
      console.warn(`[RF67 RateLimit] Excepción al invocar RPC consumir_limite: ${err.message}. Aplicando fallback.`);
    }
  }

  // 2. Fallback de alta disponibilidad en memoria (mismo algoritmo que la función PostgreSQL)
  const itemKey = `${clave}:${ventanaSegundos}`
  const registro = memoriaLimites.get(itemKey) || { contador: 0, expiraMs: ventanaFinMs }
  registro.contador += 1
  memoriaLimites.set(itemKey, registro)

  // Limpieza periódica de claves expiradas en memoria (evita fugas)
  if (memoriaLimites.size > 200) {
    for (const [k, v] of memoriaLimites.entries()) {
      if (v.expiraMs < ahoraMs) {
        memoriaLimites.delete(k)
      }
    }
  }

  const permitido = registro.contador <= maximo

  return {
    permitido,
    contador: registro.contador,
    retryAfter,
    maximo,
    segundos,
    fuente: 'memoria'
  }
}

/**
 * Middleware / Guardián de Rate Limiting para handlers serverless.
 * Si se supera el límite:
 * - Emite HTTP 429 (Too Many Requests).
 * - Agrega la cabecera obligatoria `Retry-After` con los segundos restantes.
 * - Retorna false para que el handler termine inmediatamente.
 *
 * @param {import('http').IncomingMessage} req
 * @param {import('http').ServerResponse} res
 * @param {{
 *   clave: string,
 *   maximo?: number,
 *   segundos?: number,
 *   supabase?: any,
 *   env?: any
 * }} opciones
 * @returns {Promise<boolean>} True si la petición es permitida; false si fue bloqueada con 429
 */
export async function aplicarLimitePeticiones(req, res, opciones) {
  const resultado = await verificarLimitePeticiones(opciones)

  // Cabeceras informativas de Rate Limit (estándar RFC 6585 e IETF)
  res.setHeader('X-RateLimit-Limit', String(resultado.maximo))
  res.setHeader('X-RateLimit-Reset', String(resultado.retryAfter))

  if (!resultado.permitido) {
    // Criterio de Aceptación RF67:
    // "Al superar el límite la respuesta es 429 con Retry-After."
    res.statusCode = 429
    res.setHeader('Content-Type', 'application/json')
    res.setHeader('Retry-After', String(resultado.retryAfter))
    res.setHeader('X-RateLimit-Remaining', '0')

    res.end(JSON.stringify({
      ok: false,
      error: `Límite de peticiones excedido (RF67). Por favor espere ${resultado.retryAfter} segundos antes de reintentar.`,
      retryAfter: resultado.retryAfter,
      limite: resultado.maximo,
      ventanaSegundos: resultado.segundos,
      rf67: 'limite_excedido'
    }))

    return false
  }

  // Petición permitida dentro de la cuota normal
  const restante = Math.max(0, resultado.maximo - (resultado.contador || 1))
  res.setHeader('X-RateLimit-Remaining', String(restante))
  return true
}
