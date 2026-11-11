import { validarCorreoInstitucional } from '../../src/utils/validators.js'
import { aplicarLimitePeticiones, extraerIp, LIMITES_PETICIONES_CONFIG } from '../_lib/limitePeticiones.js'
import { escaparHtml, aplicarCabecerasSeguridad, validarOrigenCsrf } from '../_lib/proteccionWeb.js'

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
    res.statusCode = 405
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ ok: false, error: 'Método no permitido. Solo se acepta POST.' }))
  }

  // RF68: Validación de protección contra CSRF para peticiones mutables
  const verificacionCsrf = validarOrigenCsrf(req)
  if (!verificacionCsrf.permitido) {
    res.statusCode = verificacionCsrf.codigo || 403
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ ok: false, error: verificacionCsrf.error || 'Petición rechazada por protección CSRF.' }))
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
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ ok: false, error: 'Formato de cuerpo JSON inválido.' }))
  }

  const { correo, codigo, aulaNombre, profesorNombre } = datos

  // 1. Validar correo institucional de estudiante
  if (!correo) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ ok: false, error: 'El correo del estudiante es obligatorio.' }))
  }

  const validacion = validarCorreoInstitucional(correo)
  if (!validacion.valido || validacion.rol !== 'usuario') {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ 
      ok: false, 
      error: 'El correo debe ser institucional con dominio @alu.unach.cl (estudiante).' 
    }))
  }

  // 2. Validar código y nombre del aula
  if (!codigo || typeof codigo !== 'string' || !codigo.trim()) {
    res.statusCode = 400
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ ok: false, error: 'El código de acceso del aula es obligatorio.' }))
  }

  const nombreAula = (aulaNombre || 'Aula Virtual').trim()
  const nombreDocente = (profesorNombre || 'Tu Docente').trim()
  const codigoLimpio = codigo.trim().toUpperCase()
  const correoLimpio = correo.trim().toLowerCase()

  // RF68: Escapar contenido proporcionado por el usuario para prevenir XSS en correos (CWE-79)
  const nombreAulaEscapado = escaparHtml(nombreAula)
  const nombreDocenteEscapado = escaparHtml(nombreDocente)
  const codigoEscapado = escaparHtml(codigoLimpio)
  const correoEscapado = escaparHtml(correoLimpio)

  // 3. Obtener API Key de Resend (secreto exclusivo del servidor, RF69)
  const resendApiKey = process.env.RESEND_API_KEY

  if (!resendApiKey) {
    res.statusCode = 503
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({ 
      ok: false, 
      error: 'Servicio de correo Resend no configurado. Falta la variable RESEND_API_KEY en el entorno.' 
    }))
  }

  // 4. Construir plantilla HTML profesional del correo con variables sanitizadas
  const htmlContenido = `
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

          <div class="steps">
            <strong>Instrucciones para unirte:</strong>
            <ol>
              <li>Inicia sesión en la plataforma con tu correo institucional <code>${correoEscapado}</code>.</li>
              <li>Ingresa a la sección <strong>Aulas y Cursos</strong>.</li>
              <li>En el campo <em>"Unirse a un Aula Virtual"</em>, ingresa el código <strong>${codigoEscapado}</strong>.</li>
              <li>Haz clic en <strong>Unirme al Aula</strong>.</li>
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

  // 5. Enviar a través de la API oficial de Resend
  try {
    const respuesta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${resendApiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Sensor Pulso UNACH <onboarding@resend.dev>',
        to: [correoLimpio],
        subject: `Invitación al Aula: ${nombreAula} (Código de Acceso: ${codigoLimpio})`,
        html: htmlContenido,
        text: `Invitación al Aula: ${nombreAula}\n\nDocente: ${nombreDocente}\nTu código de acceso es: ${codigoLimpio}\n\nIngresa a la plataforma con tu correo ${correoLimpio} y escribe el código en la sección de Aulas.`
      })
    })

    const data = await respuesta.json().catch(() => ({}))

    if (!respuesta.ok) {
      const mensajeError = data.message || `Error del proveedor de correo (código ${respuesta.status})`
      res.statusCode = respuesta.status >= 400 && respuesta.status < 600 ? respuesta.status : 500
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({
        ok: false,
        error: mensajeError,
        statusCode: respuesta.status
      }))
    }

    res.statusCode = 200
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({
      ok: true,
      id: data.id,
      provider: 'resend',
      mensaje: `Correo enviado exitosamente a ${correoLimpio}`
    }))
  } catch (errorRed) {
    res.statusCode = 502
    res.setHeader('Content-Type', 'application/json')
    return res.end(JSON.stringify({
      ok: false,
      error: `Error de red al conectar con Resend: ${errorRed.message}`
    }))
  }
}
