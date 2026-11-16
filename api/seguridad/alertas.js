import {
  procesarAlertaSeguridad,
  esEventoCritico,
  obtenerDestinatarioAdmin
} from '../_lib/alertasSeguridad.js'
import { aplicarCabecerasSeguridad } from '../_lib/proteccionWeb.js'
import { aplicarLimitePeticiones, extraerIp, LIMITES_PETICIONES_CONFIG } from '../_lib/limitePeticiones.js'

function responder(res, estado, cuerpo) {
  res.statusCode = estado
  res.setHeader('Content-Type', 'application/json')
  return res.end(JSON.stringify(cuerpo))
}

export default async function handler(req, res) {
  aplicarCabecerasSeguridad(res)

  const metodo = (req.method || 'GET').toUpperCase()

  if (metodo === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Admin-Key')
    res.statusCode = 204
    return res.end()
  }

  // Estado del servicio de alertas y configuración de destinatario (GET)
  if (metodo === 'GET') {
    return responder(res, 200, {
      ok: true,
      servicio: 'alertas-seguridad-rf72',
      estado: 'activo',
      cooldownMinutos: 15,
      destinatarioAdmin: obtenerDestinatarioAdmin(),
      documentacion: '/docs/RF72-alertas-seguridad.md'
    })
  }

  if (metodo !== 'POST') {
    res.setHeader('Allow', 'GET, POST, OPTIONS')
    return responder(res, 405, { ok: false, error: 'Método no permitido. Usa GET o POST.' })
  }

  // Rate limiting para evitar abuso del disparador de alertas
  const ip = extraerIp(req)
  const rl = aplicarLimitePeticiones(`alertas:${ip}`, LIMITES_PETICIONES_CONFIG.GENERAL)
  if (!rl.permitido) {
    res.setHeader('Retry-After', String(rl.retryAfterSegundos))
    return responder(res, 429, {
      ok: false,
      error: 'Demasiadas solicitudes al despachador de alertas. Intenta más tarde.'
    })
  }

  let body = req.body
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body)
    } catch {
      return responder(res, 400, { ok: false, error: 'Cuerpo de la petición JSON inválido.' })
    }
  }

  const evento = body?.evento || body
  if (!evento || typeof evento !== 'object') {
    return responder(res, 400, { ok: false, error: 'Falta objeto de evento en la solicitud.' })
  }

  try {
    const resultado = await procesarAlertaSeguridad(evento, {
      destinatario: body?.destinatario
    })
    return responder(res, 200, resultado)
  } catch (error) {
    return responder(res, 500, {
      ok: false,
      error: error.message || 'Error interno al despachar la alerta de seguridad.'
    })
  }
}
