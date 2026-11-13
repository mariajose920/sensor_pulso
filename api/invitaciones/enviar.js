import { validarCorreoInstitucional } from '../../src/utils/validators.js'
import { MAX_INVITACIONES_POR_ENVIO } from '../../src/utils/correosInvitacion.js'
import { aplicarLimitePeticiones, extraerIp, LIMITES_PETICIONES_CONFIG } from '../_lib/limitePeticiones.js'
import { escaparHtml, aplicarCabecerasSeguridad, validarOrigenCsrf } from '../_lib/proteccionWeb.js'
import { enviarMensajes, leerConfiguracionCorreo } from '../_lib/correo.js'

/**
 * Dirección de la web que llevan los botones del correo. Orden: APP_URL (producción) → el origen de la petición si es
 * localhost (pruebas en local) → la web publicada. Nunca se toma un origen externo de la petición, para que nadie
 * pueda usar este endpoint y poner enlaces a otro sitio dentro de un correo institucional.
 */
function urlBase(req) {
  const configurada = (process.env.APP_URL || process.env.PUBLIC_APP_URL || '').trim().replace(/\/+$/, '')
  if (/^https?:\/\/[^\s]+$/i.test(configurada)) return configurada
  const origen = String((req.headers && req.headers.origin) || '')
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origen)) return origen
  return 'https://sensorpulso.vercel.app'
}

// Para direcciones dentro de href: solo se escapa lo que podría cerrar el atributo o abrir una etiqueta
// (las barras se dejan tal cual para que el enlace sea legible y los clientes de correo no lo alteren).
function escaparAtributo(valor) {
  return String(valor).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

function responder(res, estado, cuerpo) {
  res.statusCode = estado
  res.setHeader('Content-Type', 'application/json')
  return res.end(JSON.stringify(cuerpo))
}

/** Arma el asunto, el HTML y el texto del correo de un estudiante (todo el contenido del usuario va escapado, RF68). */
function construirCorreo({ correo, codigo, nombreAula, nombreDocente, urlUnirse, urlSitio }) {
  const urlUnirseEscapada = escaparAtributo(urlUnirse)
  const urlSitioEscapada = escaparAtributo(urlSitio)
  const nombreAulaEscapado = escaparHtml(nombreAula)
  const nombreDocenteEscapado = escaparHtml(nombreDocente)
  const codigoEscapado = escaparHtml(codigo)
  const correoEscapado = escaparHtml(correo)

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>Invitación al Aula: ${nombreAulaEscapado}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f1f5f9; margin: 0; padding: 24px; color: #0f172a; }
        .card { max-width: 560px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 32px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 1px solid #e2e8f0; }
        .header { text-align: center; border-bottom: 2px solid #e2e8f0; padding-bottom: 20px; margin-bottom: 24px; }
        .logo-title { font-size: 20px; font-weight: 800; color: #1e40af; margin: 0; }
        .subtitle { font-size: 14px; color: #64748b; margin-top: 4px; }
        .content { font-size: 15px; line-height: 1.6; }
        .code-box { background: #eff6ff; border: 2px dashed #3b82f6; border-radius: 8px; padding: 18px; text-align: center; margin: 24px 0; }
        .code-label { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #1e40af; letter-spacing: 0.05em; margin-bottom: 6px; }
        .code-value { font-size: 32px; font-weight: 800; color: #1e3a8a; letter-spacing: 0.15em; font-family: monospace; }
        .steps { background: #f8fafc; border-radius: 8px; padding: 16px 20px; margin-top: 20px; font-size: 14px; }
        .steps ol { margin: 8px 0 0 0; padding-left: 20px; }
        .steps li { margin-bottom: 6px; }
        .footer { margin-top: 32px; text-align: center; font-size: 12px; color: #94a3b8; border-top: 1px solid #f1f5f9; padding-top: 16px; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <h1 class="logo-title">Plataforma Sensor de Pulso UNACH</h1>
          <p class="subtitle">Monitoreo Fisiológico y Gestión de Ciberseguridad</p>
        </div>
        <div class="content">
          <p>Hola,</p>
          <p>El docente <strong>${nombreDocenteEscapado}</strong> te ha invitado a unirte al aula virtual <strong>${nombreAulaEscapado}</strong>.</p>

          <div class="code-box">
            <div class="code-label">Tu Código de Acceso</div>
            <div class="code-value">${codigoEscapado}</div>
          </div>

          <p style="text-align: center; margin: 28px 0 12px;">
            <a href="${urlUnirseEscapada}" style="display: inline-block; background: #1e40af; color: #ffffff; text-decoration: none; font-weight: 700; font-size: 16px; padding: 14px 32px; border-radius: 8px;">Unirme al aula</a>
          </p>
          <p style="text-align: center; font-size: 14px; margin: 0 0 8px;">
            <a href="${urlSitioEscapada}" style="color: #1e40af;">Ver la sala en el sitio web</a>
          </p>

          <div class="steps">
            <strong>Si el botón no funciona:</strong>
            <ol>
              <li>Entra a <a href="${urlSitioEscapada}" style="color: #1e40af;">${urlSitioEscapada}</a> e inicia sesión con tu correo institucional <code>${correoEscapado}</code>.</li>
              <li>Ve a la sección <strong>Aulas y Cursos</strong>.</li>
              <li>En <em>"Unirse a un Aula Virtual"</em>, escribe el código <strong>${codigoEscapado}</strong> y pulsa <strong>Unirme al Aula</strong>.</li>
            </ol>
          </div>
        </div>
        <div class="footer">
          Este código es personal para tu cuenta de estudiante. Si tienes dudas, consulta con tu docente.
        </div>
      </div>
    </body>
    </html>
  `

  return {
    subject: `Invitación al Aula: ${nombreAula} (Código de Acceso: ${codigo})`,
    html,
    text: `Invitación al Aula: ${nombreAula}\n\nDocente: ${nombreDocente}\nTu código de acceso es: ${codigo}\n\nUnirme al aula: ${urlUnirse}\nVer la sala en el sitio web: ${urlSitio}\n\nInicia sesión con tu correo institucional ${correo}; si el enlace no funciona, escribe el código en la sección Aulas y Cursos.`
  }
}

// Handler compatible con Vercel Serverless Functions y Vite Middleware
export default async function handler(req, res) {
  // Configuración de cabeceras CORS y de seguridad (RF68)
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With')
  aplicarCabecerasSeguridad(res, 'api')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  if (req.method !== 'POST') {
    return responder(res, 405, { ok: false, error: 'Método no permitido. Solo se acepta POST.' })
  }

  // RF68: Validación de protección contra CSRF para peticiones mutables
  const verificacionCsrf = validarOrigenCsrf(req)
  if (!verificacionCsrf.permitido) {
    return responder(res, verificacionCsrf.codigo || 403, {
      ok: false,
      error: verificacionCsrf.error || 'Petición rechazada por protección CSRF.'
    })
  }

  // RF67: Límite de peticiones para envío de invitaciones (anti-spam)
  const ipCliente = extraerIp(req)
  const claveRateLimit = `api:invitaciones:${ipCliente}`
  const permitido = await aplicarLimitePeticiones(req, res, {
    clave: claveRateLimit,
    maximo: LIMITES_PETICIONES_CONFIG.API_INVITACIONES_MAXIMO,
    segundos: LIMITES_PETICIONES_CONFIG.API_INVITACIONES_SEGUNDOS
  })
  if (!permitido) return

  // Parsear cuerpo de la petición
  let datos = {}
  try {
    datos = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {})
  } catch (_) {
    return responder(res, 400, { ok: false, error: 'Formato de cuerpo JSON inválido.' })
  }

  const { correo, correos, codigo, aulaNombre, profesorNombre } = datos
  // Una sola petición puede traer un correo (`correo`) o una lista (`correos`)
  const esLote = Array.isArray(correos)
  const candidatos = esLote ? correos : [correo]

  // 1. Validar los correos institucionales de estudiante
  const lista = [...new Set(candidatos.filter((c) => typeof c === 'string' && c.trim()).map((c) => c.trim().toLowerCase()))]
  if (!lista.length) {
    return responder(res, 400, {
      ok: false,
      error: esLote ? 'Agrega al menos un correo de estudiante.' : 'El correo del estudiante es obligatorio.'
    })
  }
  if (lista.length > MAX_INVITACIONES_POR_ENVIO) {
    return responder(res, 400, {
      ok: false,
      error: `Puedes invitar hasta ${MAX_INVITACIONES_POR_ENVIO} estudiantes por envío.`
    })
  }
  const invalidos = lista.filter((c) => {
    const v = validarCorreoInstitucional(c)
    return !v.valido || v.rol !== 'usuario'
  })
  if (invalidos.length) {
    return responder(res, 400, {
      ok: false,
      error: esLote
        ? `Estos correos no son institucionales de estudiante (@alu.unach.cl): ${invalidos.join(', ')}.`
        : 'El correo debe ser institucional con dominio @alu.unach.cl (estudiante).',
      invalidos
    })
  }

  // 2. Validar código y nombre del aula
  if (!codigo || typeof codigo !== 'string' || !codigo.trim()) {
    return responder(res, 400, { ok: false, error: 'El código de acceso del aula es obligatorio.' })
  }

  const nombreAula = (aulaNombre || 'Aula Virtual').trim()
  const nombreDocente = (profesorNombre || 'Tu Docente').trim()
  const codigoLimpio = codigo.trim().toUpperCase()

  // 3. Cuenta de Gmail que envía (secretos exclusivos del servidor, RF69)
  if (!leerConfiguracionCorreo().configurado) {
    return responder(res, 503, {
      ok: false,
      error: 'Servicio de correo no configurado. Faltan las variables GMAIL_USER y GMAIL_APP_PASSWORD en el entorno.'
    })
  }

  const sitio = urlBase(req)
  const urlUnirse = `${sitio}/aulas?unirse=${encodeURIComponent(codigoLimpio)}`
  const urlSitio = `${sitio}/aulas`
  const mensajes = lista.map((destino) => ({
    to: destino,
    ...construirCorreo({ correo: destino, codigo: codigoLimpio, nombreAula, nombreDocente, urlUnirse, urlSitio })
  }))

  // 4. Enviar todos a la vez desde la cuenta de Gmail, un correo por estudiante.
  //    Un correo rechazado no impide que salgan los demás; el resultado dice cuál falló y por qué.
  try {
    const resultados = await enviarMensajes(mensajes)
    const enviados = resultados.filter((r) => r.ok).map((r) => ({ correo: r.correo, id: r.id || null }))
    const fallidos = resultados.filter((r) => !r.ok).map((r) => ({ correo: r.correo, error: r.error }))

    return responder(res, 200, {
      ok: enviados.length > 0,
      provider: 'gmail',
      id: enviados[0]?.id || null,
      enviados,
      fallidos,
      error: enviados.length ? undefined : (fallidos[0]?.error || 'No se pudo enviar ninguna invitación.'),
      mensaje: enviados.length === 1 && !fallidos.length
        ? `Correo enviado exitosamente a ${enviados[0].correo}`
        : `Se enviaron ${enviados.length} de ${lista.length} invitaciones.`
    })
  } catch (errorEnvio) {
    const mensajeError = `No se pudo enviar desde Gmail: ${errorEnvio.message}`
    return responder(res, 502, {
      ok: false,
      error: mensajeError,
      enviados: [],
      fallidos: lista.map((c) => ({ correo: c, error: mensajeError }))
    })
  }
}
