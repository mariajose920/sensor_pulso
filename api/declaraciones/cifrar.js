/**
 * POST /api/declaraciones/cifrar (RF116, ISO 27001 A.8.24)
 * Cifra en el SERVIDOR los factores de salud declarados. Exige sesion valida; la clave nunca sale del servidor.
 * Entrada: { factores: {...} }  ·  Salida: { ok, datosCifrados, claveVersion }
 */
import { cifrarFactores, ErrorClave } from '../_lib/cifradoSalud.js'
import { leerCuerpo, responder, verificarSesion, verificarCsrf } from '../_lib/sesion.js'
import { aplicarLimitePeticiones, extraerIp, LIMITES_PETICIONES_CONFIG } from '../_lib/limitePeticiones.js'

export function crearHandler({ verificar = verificarSesion, env = process.env } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return responder(res, 405, { ok: false, error: 'Solo se acepta POST.' })
    if (!verificarCsrf(req, res, { env })) return
    const sesion = await verificar(req, env)
    if (!sesion) return responder(res, 401, { ok: false, error: 'Se requiere una sesión válida.' })

    // RF67: Limite de peticiones
    const ip = extraerIp(req)
    const claveRateLimit = `api:cifrar:${sesion.usuario?.id || ip}`
    const permitido = await aplicarLimitePeticiones(req, res, {
      clave: claveRateLimit,
      maximo: LIMITES_PETICIONES_CONFIG.API_ESTANDAR_MAXIMO,
      segundos: LIMITES_PETICIONES_CONFIG.API_ESTANDAR_SEGUNDOS,
      env
    })
    if (!permitido) return

    const cuerpo = leerCuerpo(req)
    const factores = cuerpo?.factores
    if (!factores || typeof factores !== 'object' || Array.isArray(factores)) {
      return responder(res, 400, { ok: false, error: 'Falta el objeto «factores».' })
    }
    if (JSON.stringify(factores).length > 20000) return responder(res, 413, { ok: false, error: 'Los datos son demasiado grandes.' })
    try {
      const { hex, version } = await cifrarFactores(factores, { env })
      return responder(res, 200, { ok: true, datosCifrados: hex, claveVersion: version })
    } catch (err) {
      if (err instanceof ErrorClave) {
        console.error('[cifrar] El servidor no tiene clave de cifrado configurada.')
        return responder(res, 503, { ok: false, error: 'El cifrado no está disponible en este momento.' })
      }
      console.error('[cifrar] Error:', err.message)
      return responder(res, 500, { ok: false, error: 'No se pudo cifrar.' })
    }
  }
}

export default crearHandler()
