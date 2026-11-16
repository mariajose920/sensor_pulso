/**
 * ============================================================================
 * sensor_pulso · Sistema de Alertas de Seguridad Automáticas (RF72)
 * ISO/IEC 27001:2022 Control A.8.16 (Monitoreo de actividades de seguridad)
 * ============================================================================
 * Criterios de Aceptación:
 *   1. Un evento sospechoso simulado genera un correo al administrador.
 *   2. No se repite el mismo aviso muchas veces (deduplicación con ventana de enfriamiento).
 *   3. El aviso no incluye secretos ni datos de salud (filtrado y sanitización estricta).
 *   4. Pendiente de decisión humana: quién recibe los avisos (configurable por entorno).
 * ============================================================================
 */

import { enviarMensajes } from './correo.js'
import { escaparHtml } from './proteccionWeb.js'

/** Tiempo de enfriamiento (cooldown) por defecto: 15 minutos (en milisegundos) */
export const VENTANA_COOLDOWN_MS = 15 * 60 * 1000

/** Destinatario por defecto pendiente de confirmación formal por la administración */
export const CORREO_ADMIN_DEFECTO = 'seguridad-alertas@unach.cl'

/** Registro en memoria para deduplicación: claveIncidente -> { timestamp, conteoSuprimidos } */
const registroAlertasRecientes = new Map()

/**
 * Patrones que NUNCA deben filtrarse en el correo de alerta (Criterio 3: Cero secretos)
 */
export const PATRONES_SECRETOS = Object.freeze([
  /sb_secret_[a-zA-Z0-9_\-]+/gi,
  /eyJ[a-zA-Z0-9_\-\.]{30,}/g, // Tokens JWT
  /(?:password|contrase[ñn]a|clave)\s*[:=]\s*['"]?[^\s'"]+/gi,
  /esp_[a-zA-Z0-9_\-]{8,}/gi, // Tokens completos de ESP32
  /-----BEGIN\s+[A-Z\s]+PRIVATE\s+KEY-----/gi,
])

/**
 * Patrones que NUNCA deben filtrarse en el correo de alerta (Criterio 3: Cero datos de salud)
 */
export const PATRONES_DATOS_SALUD = Object.freeze([
  /\b(?:bpm|frecuencia|pulsaciones)\s*[:=]?\s*\d+/gi,
  /\b(?:spo2|saturaci[oó]n|oxigeno)\s*[:=]?\s*\d+/gi,
  /\b(?:taquicardia|bradicardia|arritmia|fibrilaci[oó]n|asistolia)\b/gi,
])

/** Lista de campos prohibidos que deben eliminarse de los objetos de detalle */
const CAMPOS_PROHIBIDOS = new Set([
  'password', 'contrasena', 'contraseña', 'clave', 'token', 'secret',
  'jwt', 'token_hash', 'authHeader', 'authorization', 'apiKey',
  'bpm', 'spo2', 'ritmo', 'patologia', 'diagnostico', 'curva', 'muestras'
])

/**
 * Obtiene la dirección del administrador configurada para recibir avisos de seguridad.
 * Cumple con: "Pendiente de decisión humana: quién recibe los avisos".
 */
export function obtenerDestinatarioAdmin() {
  const envAdmin = (process.env.ADMIN_ALERT_EMAIL || process.env.CORREO_ADMIN_ALERTAS || '').trim()
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(envAdmin)) {
    return envAdmin
  }
  const envGmail = (process.env.GMAIL_USER || '').trim()
  if (/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(envGmail)) {
    return envGmail
  }
  return CORREO_ADMIN_DEFECTO
}

/**
 * Limpia la caché en memoria de deduplicación (útil para pruebas y reinicios).
 */
export function limpiarCacheDeduplicacion() {
  registroAlertasRecientes.clear()
}

/**
 * Evalúa si un evento registrado en la auditoría representa una amenaza o anomalía crítica
 * que justifique despertar y notificar al administrador inmediatamente.
 */
export function esEventoCritico(evento = {}) {
  if (!evento || typeof evento !== 'object') return false
  if (evento.sospechoso === true) return true

  const accion = String(evento.accion || evento.tipo || '').toLowerCase().trim()
  const severidad = String(evento.severidad || evento.nivel || '').toLowerCase().trim()

  if (severidad === 'critica' || severidad === 'alta' || severidad === 'critical' || severidad === 'high') {
    return true
  }

  const ACCIONES_CRITICAS = [
    'login_fallido_masivo',
    'fuerza_bruta',
    'bloqueo_cuenta',
    'token_esp32_invalido',
    'token_esp32_revocado',
    'dispositivo_no_autorizado',
    'rate_limit_excedido',
    'dos_detectado',
    'violacion_integridad_auditoria',
    'intento_inyeccion_detectado'
  ]

  return ACCIONES_CRITICAS.some((crit) => accion.includes(crit))
}

/**
 * Anonimiza una dirección IP conservando únicamente el prefijo de red para fines forenses.
 * Ejemplo: 192.168.1.45 -> 192.168.1.xxx
 */
export function anonimizarIp(ip) {
  if (!ip || typeof ip !== 'string') return 'IP no especificada'
  if (ip.includes('.')) {
    const partes = ip.trim().split('.')
    if (partes.length === 4) return `${partes[0]}.${partes[1]}.${partes[2]}.xxx`
  }
  if (ip.includes(':')) {
    const partes = ip.trim().split(':')
    return `${partes.slice(0, 3).join(':')}:xxxx`
  }
  return 'IP anonimizada'
}

/**
 * Sanitiza recursivamente un objeto o texto, removiendo cualquier campo o dato
 * que exponga secretos o información médica protegida.
 */
export function sanitizarDetallesParaAlerta(detalles) {
  if (!detalles) return {}
  if (typeof detalles === 'string') {
    let limpio = detalles
    for (const pat of PATRONES_SECRETOS) {
      limpio = limpio.replace(pat, '[RESERVADO_POR_SEGURIDAD]')
    }
    for (const pat of PATRONES_DATOS_SALUD) {
      limpio = limpio.replace(pat, '[DATO_CLINICO_OMITIDO_POR_PRIVACIDAD]')
    }
    return limpio
  }

  if (typeof detalles !== 'object') return detalles

  const copiaLimpia = {}
  for (const [clave, valor] of Object.entries(detalles)) {
    const claveMin = clave.toLowerCase()
    if (CAMPOS_PROHIBIDOS.has(claveMin)) {
      continue // Elimina la clave directamente
    }
    if (typeof valor === 'string') {
      copiaLimpia[clave] = sanitizarDetallesParaAlerta(valor)
    } else if (typeof valor === 'object' && valor !== null) {
      copiaLimpia[clave] = sanitizarDetallesParaAlerta(valor)
    } else {
      copiaLimpia[clave] = valor
    }
  }
  return copiaLimpia
}

/**
 * Evita la repetición excesiva de correos para el mismo incidente (Anti-spam / Deduplicación).
 * Si el mismo incidente vuelve a ocurrir dentro de la ventana de enfriamiento (15 min),
 * no se envía un nuevo correo y se contabiliza como suprimido.
 */
export function comprobarDeduplicacion(claveIncidente, cooldownMs = VENTANA_COOLDOWN_MS) {
  const ahora = Date.now()
  const registro = registroAlertasRecientes.get(claveIncidente)

  if (registro && (ahora - registro.timestamp) < cooldownMs) {
    registro.conteoSuprimidos++
    return {
      debeEnviar: false,
      suprimidos: registro.conteoSuprimidos,
      motivo: 'cooldown_activo'
    }
  }

  // Primera ocurrencia o el cooldown ya expiró
  registroAlertasRecientes.set(claveIncidente, {
    timestamp: ahora,
    conteoSuprimidos: 0
  })

  return {
    debeEnviar: true,
    suprimidos: 0,
    motivo: 'primer_aviso'
  }
}

/**
 * Construye el contenido del correo (asunto, texto plano y HTML estructurado con estilos seguros).
 */
export function construirMensajeAlerta(evento = {}, { suprimidos = 0, destinatario = obtenerDestinatarioAdmin() } = {}) {
  const tipo = String(evento.accion || evento.tipo || 'Incidente de Seguridad').toUpperCase()
  const fecha = evento.fecha || evento.ocurrio_en || new Date().toISOString()
  const entidadId = String(evento.entidad_id || evento.usuario || evento.dispositivo || 'N/A')
  const ipSegura = anonimizarIp(evento.ip || evento.detalles?.ip)
  const detallesLimpio = sanitizarDetallesParaAlerta(evento.detalles || evento.detalle || {})

  const asunto = `[ALERTA SEGURIDAD] ${tipo} - sensor_pulso`

  const texto = [
    '====================================================',
    '⚠️ ALERTA DE SEGURIDAD · SENSOR PULSO UNACH (RF72)',
    '====================================================',
    `Tipo de Incidente: ${tipo}`,
    `Fecha y Hora UTC : ${fecha}`,
    `Entidad / Origen : ${entidadId}`,
    `IP de Origen     : ${ipSegura}`,
    suprimidos > 0 ? `Incidentes agregados en ventana: ${suprimidos} adicionales suprimidos` : '',
    '',
    'Detalles del evento:',
    JSON.stringify(detallesLimpio, null, 2),
    '',
    'Acción recomendada:',
    '- Revisar bitácora de auditoría inmutable en el panel de administración (/admin/seguridad).',
    '- Si corresponde a un token de ESP32 comprometido, proceder a su revocación inmediata.',
    '- Si corresponde a fuerza bruta de login, verificar el estado de bloqueo de la cuenta afectada.',
    '===================================================='
  ].filter(Boolean).join('\n')

  const html = `
    <!DOCTYPE html>
    <html lang="es">
    <head>
      <meta charset="utf-8">
      <title>${escaparHtml(asunto)}</title>
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; margin: 0; padding: 24px; color: #0f172a; }
        .card { max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; padding: 28px; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1); border: 2px solid #ef4444; }
        .header { border-bottom: 2px solid #fee2e2; padding-bottom: 16px; margin-bottom: 20px; }
        .badge { display: inline-block; background: #fee2e2; color: #991b1b; padding: 4px 12px; border-radius: 9999px; font-weight: 700; font-size: 13px; text-transform: uppercase; }
        h1 { font-size: 20px; color: #991b1b; margin: 12px 0 0; }
        .meta-table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
        .meta-table td { padding: 8px 12px; border-bottom: 1px solid #f1f5f9; }
        .meta-table td.label { font-weight: 600; color: #475569; width: 38%; }
        .code-box { background: #0f172a; color: #f8fafc; padding: 12px; border-radius: 8px; font-family: monospace; font-size: 12px; overflow-x: auto; margin: 16px 0; }
        .banner-suppressed { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 10px 14px; border-radius: 4px; font-size: 13px; color: #92400e; margin: 16px 0; }
        .footer { font-size: 12px; color: #64748b; margin-top: 24px; padding-top: 16px; border-top: 1px solid #e2e8f0; text-align: center; }
      </style>
    </head>
    <body>
      <div class="card">
        <div class="header">
          <span class="badge">Evento de Seguridad Crítico</span>
          <h1>${escaparHtml(tipo)}</h1>
        </div>
        <p>Se ha detectado un comportamiento anómalo o de riesgo en la plataforma <strong>sensor_pulso</strong> que requiere revisión técnica:</p>
        <table class="meta-table">
          <tr><td class="label">Fecha y Hora UTC:</td><td>${escaparHtml(fecha)}</td></tr>
          <tr><td class="label">Entidad / Identificador:</td><td><code>${escaparHtml(entidadId)}</code></td></tr>
          <tr><td class="label">IP Anonimizada:</td><td><code>${escaparHtml(ipSegura)}</code></td></tr>
        </table>
        ${suprimidos > 0 ? `<div class="banner-suppressed">ℹ️ Mecanismo anti-spam activo: Se consolidaron <strong>${suprimidos}</strong> eventos adicionales en los últimos 15 minutos para evitar saturación de la bandeja.</div>` : ''}
        <p><strong>Detalles sanitizados del evento:</strong></p>
        <pre class="code-box">${escaparHtml(JSON.stringify(detallesLimpio, null, 2))}</pre>
        <p style="font-size: 13px; color: #334155;"><strong>Acción recomendada:</strong> Iniciar sesión en el portal administrativo y revisar el registro inmutable de auditoría (RF62/RF63) para auditar la traza completa.</p>
        <div class="footer">
          Aviso automático de ciberseguridad (RF72) · Plataforma sensor_pulso · Universidad Adventista de Chile (UNACH)<br>
          <em>Este mensaje no contiene contraseñas, secretos ni datos clínicos de salud (ISO 27001 A.8.16).</em>
        </div>
      </div>
    </body>
    </html>
  `

  return {
    to: destinatario,
    subject: asunto,
    text: texto,
    html
  }
}

/**
 * Función principal para procesar y despachar una alerta de seguridad si corresponde.
 *
 * @param {object} evento - Registro o evento a evaluar
 * @param {object} [opciones]
 * @param {boolean} [opciones.forzarEnvio=false] - Para pruebas directas
 * @param {string} [opciones.destinatario] - Destinatario personalizado
 * @param {number} [opciones.cooldownMs] - Ventana de deduplicación
 * @returns {Promise<{
 *   ok: boolean,
 *   enviado: boolean,
 *   motivo?: string,
 *   destinatario?: string,
 *   suprimidos?: number,
 *   id?: string|null,
 *   error?: string
 * }>}
 */
export async function procesarAlertaSeguridad(evento = {}, opciones = {}) {
  const esCritico = opciones.forzarEnvio || esEventoCritico(evento)
  if (!esCritico) {
    return { ok: true, enviado: false, motivo: 'evento_no_critico' }
  }

  // Generar clave única de incidente para deduplicación: tipo:entidadId
  const accion = String(evento.accion || evento.tipo || 'evento_desconocido').toLowerCase()
  const entidadId = String(evento.entidad_id || evento.usuario || evento.ip || 'global')
  const claveIncidente = `${accion}:${entidadId}`

  const dedup = comprobarDeduplicacion(claveIncidente, opciones.cooldownMs)
  if (!dedup.debeEnviar && !opciones.forzarEnvio) {
    return {
      ok: true,
      enviado: false,
      motivo: 'cooldown_activo',
      suprimidos: dedup.suprimidos
    }
  }

  const destinatario = opciones.destinatario || obtenerDestinatarioAdmin()
  const mensaje = construirMensajeAlerta(evento, {
    suprimidos: dedup.suprimidos,
    destinatario
  })

  try {
    const respuestas = await enviarMensajes([mensaje])
    const r = respuestas[0]
    if (r?.ok) {
      return {
        ok: true,
        enviado: true,
        destinatario,
        id: r.id || null,
        suprimidos: dedup.suprimidos
      }
    }
    return {
      ok: false,
      enviado: false,
      error: r?.error || 'Fallo desconocido al enviar el mensaje'
    }
  } catch (error) {
    return {
      ok: false,
      enviado: false,
      error: error.message || 'Error en el servicio de alerta'
    }
  }
}
