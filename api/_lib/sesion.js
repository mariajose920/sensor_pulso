/** Utilidades comunes de los endpoints: respuesta JSON, lectura del cuerpo y verificación de la sesión. */
import { createClient } from '@supabase/supabase-js'
import { aplicarCabecerasSeguridad, validarOrigenCsrf } from './proteccionWeb.js'

export function responder(res, codigo, cuerpo) {
  res.statusCode = codigo
  res.setHeader('Content-Type', 'application/json')
  // RF68: Cabeceras de seguridad activas en respuestas de API
  aplicarCabecerasSeguridad(res, 'api')
  return res.end(JSON.stringify(cuerpo))
}

/**
 * Valida la protección contra CSRF en solicitudes entrantes.
 * Si la petición es rechazada, emite automáticamente código 403 con mensaje de error y retorna false.
 *
 * @param {Object} req
 * @param {Object} res
 * @param {Object} [opciones]
 * @returns {boolean} True si la solicitud está permitida
 */
export function verificarCsrf(req, res, opciones = {}) {
  const resultado = validarOrigenCsrf(req, opciones)
  if (!resultado.permitido) {
    responder(res, resultado.codigo || 403, {
      ok: false,
      error: resultado.error || 'Petición rechazada por protección CSRF.'
    })
    return false
  }
  return true
}

export function leerCuerpo(req) {
  try { return typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {}) } catch { return null }
}

export function tokenDe(req) {
  const h = req.headers?.authorization || req.headers?.Authorization || ''
  return h.startsWith('Bearer ') ? h.slice(7).trim() : ''
}

/**
 * Valida el JWT contra Supabase y devuelve { usuario, db }, donde `db` es un cliente que actúa COMO ese
 * usuario (la RLS aplica igual que en el navegador). Devuelve null si no hay sesión válida.
 */
export async function verificarSesion(req, env = process.env) {
  const token = tokenDe(req)
  const url = env.VITE_SUPABASE_URL || env.SUPABASE_URL
  const clave = env.VITE_SUPABASE_PUBLISHABLE_KEY || env.VITE_SUPABASE_ANON_KEY || env.SUPABASE_ANON_KEY
  if (!token || !url || !clave) return null
  const db = createClient(url, clave, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } }
  })
  const { data, error } = await db.auth.getUser(token)
  if (error || !data?.user) return null
  return { usuario: data.user, db }
}
