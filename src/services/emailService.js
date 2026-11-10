import { validarCorreoInstitucional } from '../utils/validators.js'

/**
 * RF100: Servicio de envío real de invitaciones por correo electrónico.
 * Conectado con el proveedor oficial Resend.
 */
export async function enviarCorreoInvitacion({ correo, codigo, aulaNombre, profesorNombre }) {
  // 1. Validar correo institucional de estudiante
  const validacion = validarCorreoInstitucional(correo)
  if (!validacion.valido || validacion.rol !== 'usuario') {
    return {
      success: false,
      error: 'El correo debe ser institucional con dominio @alu.unach.cl (estudiante).'
    }
  }

  if (!codigo) {
    return {
      success: false,
      error: 'Código de acceso no proporcionado.'
    }
  }

  const payload = {
    correo: correo.trim().toLowerCase(),
    codigo: codigo.trim().toUpperCase(),
    aulaNombre: aulaNombre || 'Aula Virtual',
    profesorNombre: profesorNombre || 'Docente'
  }

  // 2. Intentar envío a través del endpoint serverless /api/invitaciones/enviar
  try {
    const respuesta = await fetch('/api/invitaciones/enviar', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const data = await respuesta.json().catch(() => ({}))

    if (respuesta.ok && data.ok) {
      return {
        success: true,
        messageId: data.id,
        proveedor: data.provider || 'Resend',
        mensaje: data.mensaje || `Invitación enviada exitosamente a ${payload.correo}`
      }
    }

    // Si el endpoint respondió con error
    if (data.error) {
      return {
        success: false,
        error: data.error
      }
    }

    // Si respondió un código 404 o 503 específico
    if (respuesta.status === 503) {
      return {
        success: false,
        error: data.error || 'Servicio de correo Resend no configurado. Falta RESEND_API_KEY en variables de entorno.'
      }
    }

    return {
      success: false,
      error: `Error al enviar correo (HTTP ${respuesta.status})`
    }
  } catch (errRed) {
    // Si falla la conexión con el servidor
    return {
      success: false,
      error: `No se pudo conectar con el servicio de correo: ${errRed.message}`
    }
  }
}
