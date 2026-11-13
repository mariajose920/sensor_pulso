import nodemailer from 'nodemailer'

/**
 * Envío de correos desde una cuenta de Gmail por SMTP (RF100).
 * Variables de entorno, solo del servidor (RF69):
 *   GMAIL_USER          dirección de Gmail que envía, p. ej. sensorpulso@gmail.com
 *   GMAIL_APP_PASSWORD  «contraseña de aplicación» de esa cuenta (16 letras; NO es la contraseña normal de Gmail)
 * La contraseña de aplicación se crea en la cuenta de Google con la verificación en dos pasos activada:
 * https://myaccount.google.com/apppasswords
 */

let transporteInyectado = null

/** Solo para pruebas: reemplaza la conexión SMTP por un transporte simulado. */
export function usarTransporte(transporte) {
  transporteInyectado = transporte
}

export function leerConfiguracionCorreo() {
  const usuario = (process.env.GMAIL_USER || '').trim()
  // Google muestra la contraseña de aplicación en grupos de 4 separados por espacios
  const clave = (process.env.GMAIL_APP_PASSWORD || '').replace(/\s+/g, '')
  return { usuario, clave, configurado: Boolean(usuario && clave) }
}

export function remitenteCorreo() {
  const { usuario } = leerConfiguracionCorreo()
  return `"Sensor Pulso UNACH" <${usuario}>`
}

/** Convierte los errores técnicos de SMTP en frases que el profesor pueda entender. */
export function traducirErrorCorreo(error) {
  const codigo = String(error?.code || '')
  const respuesta = String(error?.response || error?.message || '')
  if (codigo === 'EAUTH' || /^535/.test(String(error?.responseCode || '')) || /Invalid login|Username and Password not accepted/i.test(respuesta)) {
    return 'Gmail rechazó el usuario o la contraseña de aplicación. Revisa GMAIL_USER y GMAIL_APP_PASSWORD (debe ser una contraseña de aplicación, no la contraseña normal).'
  }
  if (/Daily user sending limit|5\.4\.5|quota/i.test(respuesta)) {
    return 'Se alcanzó el límite diario de envíos de Gmail. Intenta de nuevo mañana.'
  }
  if (['ECONNECTION', 'ETIMEDOUT', 'ESOCKET', 'EDNS', 'ENOTFOUND', 'ECONNREFUSED'].includes(codigo)) {
    return `No se pudo conectar con Gmail (${codigo}). Revisa la conexión a internet del servidor.`
  }
  if (/User unknown|does not exist|550|553|recipient/i.test(respuesta)) {
    return 'El servidor del destinatario rechazó la dirección (no existe o no recibe correos).'
  }
  return respuesta.slice(0, 200) || 'No se pudo enviar el correo.'
}

/**
 * Envía los mensajes a la vez (un correo por destinatario, para que no vean a los demás).
 * @param {{to: string, subject: string, html: string, text: string}[]} mensajes
 * @returns {Promise<{correo: string, ok: boolean, id?: string|null, error?: string}[]>} en el mismo orden
 */
export async function enviarMensajes(mensajes) {
  const { usuario, clave } = leerConfiguracionCorreo()
  const transporte = transporteInyectado || nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    auth: { user: usuario, pass: clave },
    pool: true,
    maxConnections: 5,
    connectionTimeout: 15000,
    socketTimeout: 30000
  })

  try {
    return await Promise.all(mensajes.map(async (mensaje) => {
      try {
        const info = await transporte.sendMail({
          from: remitenteCorreo(),
          to: mensaje.to,
          subject: mensaje.subject,
          html: mensaje.html,
          text: mensaje.text
        })
        return { correo: mensaje.to, ok: true, id: info?.messageId || null }
      } catch (error) {
        return { correo: mensaje.to, ok: false, error: traducirErrorCorreo(error) }
      }
    }))
  } finally {
    if (!transporteInyectado && typeof transporte.close === 'function') transporte.close()
  }
}
