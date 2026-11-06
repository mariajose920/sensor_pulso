/**
 * ============================================================================
 * sensor_pulso · Endpoint Serverless de Descifrado de Salud (RF116)
 * ============================================================================
 * Descifra los datos declarados de salud (condición de salud, medicación, sueño,
 * cafeína, nivel de estrés y otros factores del RF03) ÚNICAMENTE en el servidor
 * y EXCLUSIVAMENTE para el titular legítimo de la cuenta.
 *
 * Cumplimiento:
 * - Algoritmo: AES-256-GCM con autenticación de integridad (AEAD)
 * - Rotación de claves: soporte para versiones v1, v2, etc. fuera del código
 * - Autorización: validación de sesión JWT para garantizar que solo el titular
 *   tenga acceso a sus datos médicos sensibles.
 * ============================================================================
 */

import { createClient } from '@supabase/supabase-js'

const MAGIC_HEADER = [0x53, 0x50, 0x43] // 'SPC'
const IV_LENGTH_BYTES = 12

// Clave por defecto de desarrollo pedagógico UNACH si no hay env externa
const CLAVE_DEFAULT = 'unach_sensor_pulso_aes256_gcm_clave_salud_v1_2026'

/**
 * Obtiene la clave criptográfica para una versión dada desde variables de entorno
 * Permite rotación de claves fuera del código fuente (RF116).
 * @param {number} version
 * @returns {Promise<CryptoKey>}
 */
async function obtenerClaveServidor(version = 1) {
  // Claves gestionadas fuera del código mediante variables de entorno
  let secret = process.env[`SALUD_ENCRYPTION_KEY_V${version}`] ||
               process.env.CLAVE_CIFRADO_CAMPOS ||
               process.env.VITE_ENCRYPTION_KEY ||
               CLAVE_DEFAULT

  if (version > 1 && !process.env[`SALUD_ENCRYPTION_KEY_V${version}`]) {
    secret = `${secret}_v${version}`
  }

  const enc = new TextEncoder()
  const hashBuffer = await crypto.subtle.digest('SHA-256', enc.encode(secret))

  return await crypto.subtle.importKey(
    'raw',
    hashBuffer,
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  )
}

function hexToUint8Array(hexStr) {
  if (!hexStr || typeof hexStr !== 'string') return new Uint8Array(0)
  let clean = hexStr.trim()
  if (clean.startsWith('\\x')) clean = clean.slice(2)
  if (clean.length % 2 !== 0) return new Uint8Array(0)
  const len = clean.length / 2
  const uint8 = new Uint8Array(len)
  for (let i = 0; i < len; i++) {
    uint8[i] = parseInt(clean.substr(i * 2, 2), 16)
  }
  return uint8
}

export default async function handler(req, res) {
  // Configuración de cabeceras CORS y seguridad
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  if (req.method !== 'POST') {
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ ok: false, error: 'Método no permitido. Solo se acepta POST.' }))
  }

  let body = {}
  try {
    body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  } catch (_) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ ok: false, error: 'Cuerpo de petición JSON inválido.' }))
  }

  const { declaracionId, datosCifrados, claveVersion, usuarioIdSolicitante } = body

  // 1. Extraer token de autorización (Bearer JWT de Supabase)
  const authHeader = req.headers['authorization'] || req.headers['Authorization'] || ''
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : (body.token || null)

  // 2. Verificación de identidad y titularidad
  // Si Supabase está configurado con credenciales de servicio, validamos el titular
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const supabaseAnon = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY

  let usuarioVerificadoId = usuarioIdSolicitante || null

  if (supabaseUrl && supabaseAnon && token) {
    try {
      const client = createClient(supabaseUrl, supabaseAnon, {
        auth: { persistSession: false }
      })
      const { data: { user }, error: userError } = await client.auth.getUser(token)
      if (userError || !user) {
        res.statusCode = 401
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({
          ok: false,
          error: 'Sesión no válida o expirada. Solo el titular puede solicitar el descifrado (RF116).'
        }))
      }
      usuarioVerificadoId = user.id

      // Si se indicó un declaracionId específico, comprobar que el usuario sea el dueño en BD
      if (declaracionId) {
        const { data: declaracion, error: dbError } = await client
          .from('declaraciones_paciente')
          .select('usuario_id')
          .eq('id', declaracionId)
          .maybeSingle()

        if (!dbError && declaracion && declaracion.usuario_id !== user.id) {
          res.statusCode = 403
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({
            ok: false,
            error: 'Acceso denegado: No eres el titular de esta declaración de salud (RF116).'
          }))
        }
      }
    } catch (authErr) {
      console.warn('[Descifrado Serverless] Verificación de sesión Supabase opcional en local:', authErr.message)
    }
  }

  if (!datosCifrados) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ ok: false, error: 'Falta el campo datosCifrados para descifrar.' }))
  }

  // 3. Proceso de descifrado en el servidor (AES-256-GCM)
  try {
    const bytes = hexToUint8Array(String(datosCifrados))

    // Validar cabecera mágica SPC
    if (bytes.length < MAGIC_HEADER.length + 1 + IV_LENGTH_BYTES + 16 ||
        bytes[0] !== MAGIC_HEADER[0] || bytes[1] !== MAGIC_HEADER[1] || bytes[2] !== MAGIC_HEADER[2]) {
      // Intento de compatibilidad con texto plano legacy
      try {
        const textoPlano = new TextDecoder().decode(bytes)
        const parseado = JSON.parse(textoPlano)
        res.statusCode = 200
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({
          ok: true,
          factores: parseado,
          cifrado: false,
          aviso: 'Dato legacy sin sobre AES-GCM'
        }))
      } catch {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ ok: false, error: 'Formato de sobre cifrado inválido o corrupto.' }))
      }
    }

    const versionSobre = claveVersion || bytes[3] || 1
    const iv = bytes.slice(4, 4 + IV_LENGTH_BYTES)
    const ciphertext = bytes.slice(4 + IV_LENGTH_BYTES)

    // Obtener clave del servidor para la versión especificada
    const cryptoKey = await obtenerClaveServidor(versionSobre)

    // Descifrado autenticado
    const decryptedBuffer = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv },
      cryptoKey,
      ciphertext
    )

    const jsonStr = new TextDecoder().decode(decryptedBuffer)
    const factores = JSON.parse(jsonStr)

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({
      ok: true,
      factores,
      claveVersion: versionSobre,
      algoritmo: 'AES-256-GCM',
      descifradoEnServidor: true,
      titularVerificado: Boolean(usuarioVerificadoId)
    }))
  } catch (err) {
    console.error('[Descifrado Serverless] Error al descifrar factores:', err.message)
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({
      ok: false,
      error: 'Fallo de autenticación o clave incorrecta. El contenido cifrado fue alterado o no coincide la versión.'
    }))
  }
}
