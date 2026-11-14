/**
 * POST /api/declaraciones/descifrar (RF116, ISO 27001 A.8.24 y A.5.15)
 * Descifra en el SERVIDOR una declaración de salud y SOLO para su titular:
 *  - exige sesión válida;
 *  - lee el registro desde la base con la sesión del propio usuario (la RLS decide), no confía en datos del cuerpo;
 *  - no hay clave por defecto: sin clave en el servidor responde 503.
 * Entrada: { declaracionId }  ·  Salida: { ok, factores }
 */
import { descifrarSobre, ErrorClave } from '../_lib/cifradoSalud.js'
import { leerCuerpo, responder, verificarSesion, verificarCsrf } from '../_lib/sesion.js'
import { aplicarLimitePeticiones, extraerIp, LIMITES_PETICIONES_CONFIG } from '../_lib/limitePeticiones.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function crearHandler({ verificar = verificarSesion, env = process.env } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return responder(res, 405, { ok: false, error: 'Solo se acepta POST.' })
    if (!verificarCsrf(req, res, { env })) return
    const sesion = await verificar(req, env)
    if (!sesion) return responder(res, 401, { ok: false, error: 'Se requiere una sesión válida.' })

    // RF67: Limite de peticiones
    const ip = extraerIp(req)
    const claveRateLimit = `api:descifrar:${sesion.usuario?.id || ip}`
    const permitido = await aplicarLimitePeticiones(req, res, {
      clave: claveRateLimit,
      maximo: LIMITES_PETICIONES_CONFIG.API_ESTANDAR_MAXIMO,
      segundos: LIMITES_PETICIONES_CONFIG.API_ESTANDAR_SEGUNDOS,
      env
    })
    if (!permitido) return

    const id = leerCuerpo(req)?.declaracionId
    if (!id || !UUID.test(String(id))) return responder(res, 400, { ok: false, error: 'Falta un declaracionId válido.' })

    const { data, error } = await sesion.db
      .from('declaraciones_paciente')
      .select('usuario_id, datos_cifrados, clave_version')
      .eq('id', id)
      .maybeSingle()
    // Sin fila (no existe o la RLS no la deja ver) y fila ajena se responden igual: no se revela si existe.
    if (error || !data || data.usuario_id !== sesion.usuario.id) {
      return responder(res, 404, { ok: false, error: 'Declaración no encontrada.' })
    }
    try {
      const factores = await descifrarSobre(data.datos_cifrados, { version: data.clave_version, env })
      return responder(res, 200, { ok: true, factores, claveVersion: data.clave_version })
    } catch (err) {
      if (err instanceof ErrorClave) {
        console.error('[descifrar] El servidor no tiene clave de cifrado configurada.')
        return responder(res, 503, { ok: false, error: 'El descifrado no está disponible en este momento.' })
      }
      console.error('[descifrar] Sobre alterado o clave incorrecta.')
      return responder(res, 422, { ok: false, error: 'No se pudo verificar la integridad de los datos.' })
    }
  }
}

export default crearHandler()
