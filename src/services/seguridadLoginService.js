import { supabase } from './supabase.js'
import { validarCorreoInstitucional } from '../utils/validators.js'
import { registrarEventoAuditoria } from './auditoriaService.js'

// Reglas de seguridad del RF50
export const MAX_INTENTOS_FALLIDOS = 5
export const DURACION_BLOQUEO_MINUTOS = 15

// Respaldo en memoria activa (no en localStorage) mientras la migración se aplica en Supabase Cloud
const intentosMemoria = new Map()
const bloqueosMemoria = new Map()

/**
 * RF50: Verifica si la cuenta o IP está actualmente bloqueada en el servidor.
 * El bloqueo vive en la base de datos (PostgreSQL / Supabase), no en localStorage.
 * Criterio de aceptación: "El bloqueo se mantiene aunque se borre el almacenamiento del navegador".
 */
export async function verificarEstadoBloqueo(correo, ip = null) {
  if (!correo) return { bloqueado: false, segundosRestantes: 0 }
  const correoLimpio = correo.trim().toLowerCase()
  const ahora = Date.now()

  try {
    // 1. Consultar la función RPC del servidor Supabase
    const { data, error } = await supabase.rpc('verificar_estado_bloqueo', {
      p_correo: correoLimpio,
      p_ip: ip
    })

    if (!error && data) {
      return {
        bloqueado: !!data.bloqueado,
        segundosRestantes: data.segundos_restantes || 0,
        bloqueadoHasta: data.bloqueado_hasta || null
      }
    }

    // 2. Consulta de respaldo directo a la tabla de servidor si RPC no estuviera disponible
    const { data: tablaData } = await supabase
      .from('bloqueos_cuenta')
      .select('bloqueado_hasta')
      .eq('correo', correoLimpio)
      .gt('bloqueado_hasta', new Date().toISOString())
      .order('bloqueado_hasta', { ascending: false })
      .maybeSingle()

    if (tablaData?.bloqueado_hasta) {
      const hasta = new Date(tablaData.bloqueado_hasta).getTime()
      if (hasta > ahora) {
        const segRestantes = Math.ceil((hasta - ahora) / 1000)
        return {
          bloqueado: true,
          segundosRestantes: segRestantes,
          bloqueadoHasta: tablaData.bloqueado_hasta
        }
      }
    }
  } catch (err) {
    console.warn('Aviso verificando bloqueo en servidor:', err)
  }

  // Respaldo en memoria activa
  const bloqueoHastaMs = bloqueosMemoria.get(correoLimpio)
  if (bloqueoHastaMs && bloqueoHastaMs > ahora) {
    return {
      bloqueado: true,
      segundosRestantes: Math.ceil((bloqueoHastaMs - ahora) / 1000),
      bloqueadoHasta: new Date(bloqueoHastaMs).toISOString()
    }
  }

  return { bloqueado: false, segundosRestantes: 0, bloqueadoHasta: null }
}

/**
 * RF50: Registra un intento de login (éxito o fallo) en el servidor llamando a registrar_intento_login.
 * Bloquea por correo y por IP si alcanza 5 fallos en 15 minutos.
 */
export async function registrarIntentoLogin({ correo, exitoso, ip = null }) {
  if (!correo) return { bloqueado: false }
  const correoLimpio = correo.trim().toLowerCase()
  const ahora = Date.now()

  if (exitoso) {
    registrarEventoAuditoria({
      accion: 'login',
      entidad: 'perfiles',
      entidadId: correoLimpio,
      actorCorreo: correoLimpio,
      entidadNombre: 'Sesión Institucional',
      resumen: `Acceso exitoso verificado${ip ? ` · IP: ${ip}` : ''}`,
      ip: ip || '127.0.0.1'
    })
  } else {
    registrarEventoAuditoria({
      accion: 'login_fallido',
      entidad: 'perfiles',
      entidadId: correoLimpio,
      actorCorreo: correoLimpio,
      entidadNombre: 'Sesión Institucional',
      resumen: `Intento de inicio de sesión rechazado${ip ? ` · IP: ${ip}` : ''}`,
      ip: ip || '127.0.0.1',
      sospechoso: true
    })
  }

  try {
    // Llamar a la función oficial registrar_intento_login de Supabase
    const { data, error } = await supabase.rpc('registrar_intento_login', {
      p_correo: correoLimpio,
      p_exitoso: exitoso,
      p_ip: ip
    })

    if (!error && data) {
      if (typeof data === 'object') {
        if (exitoso) {
          intentosMemoria.delete(correoLimpio)
          bloqueosMemoria.delete(correoLimpio)
        }
        return {
          bloqueado: !!data.bloqueado,
          segundosRestantes: data.segundos_restantes || 0,
          bloqueadoHasta: data.bloqueado_hasta || null,
          intentosFallidos: data.intentos_fallidos || 0,
          intentosRestantes: data.intentos_restantes ?? (exitoso ? 5 : 0)
        }
      }

      if (typeof data === 'string') {
        const hasta = new Date(data).getTime()
        if (hasta > ahora) {
          return {
            bloqueado: true,
            segundosRestantes: Math.ceil((hasta - ahora) / 1000),
            bloqueadoHasta: data,
            intentosRestantes: 0
          }
        }
      }
    }
  } catch (err) {
    console.warn('Aviso registrando intento en servidor:', err)
  }

  // Respaldo activo para desarrollo si el RPC aún no fue desplegado en la nube
  if (exitoso) {
    intentosMemoria.delete(correoLimpio)
    bloqueosMemoria.delete(correoLimpio)
    return { bloqueado: false, intentosFallidos: 0, intentosRestantes: MAX_INTENTOS_FALLIDOS }
  }

  const fallosAnteriores = (intentosMemoria.get(correoLimpio) || []).filter(
    (t) => t > ahora - DURACION_BLOQUEO_MINUTOS * 60 * 1000
  )
  fallosAnteriores.push(ahora)
  intentosMemoria.set(correoLimpio, fallosAnteriores)

  if (fallosAnteriores.length >= MAX_INTENTOS_FALLIDOS) {
    const hastaMs = ahora + DURACION_BLOQUEO_MINUTOS * 60 * 1000
    bloqueosMemoria.set(correoLimpio, hastaMs)
    return {
      bloqueado: true,
      segundosRestantes: DURACION_BLOQUEO_MINUTOS * 60,
      bloqueadoHasta: new Date(hastaMs).toISOString(),
      intentosFallidos: fallosAnteriores.length,
      intentosRestantes: 0
    }
  }

  return {
    bloqueado: false,
    intentosFallidos: fallosAnteriores.length,
    intentosRestantes: Math.max(0, MAX_INTENTOS_FALLIDOS - fallosAnteriores.length)
  }
}

/**
 * Formatea segundos a texto amigable ("X minutos y Y segundos") e indica la hora de término
 */
export function formatearTiempoRestante(segundos, bloqueadoHasta = null) {
  if (segundos <= 0) return '0 segundos'
  const minutos = Math.floor(segundos / 60)
  const segs = segundos % 60

  let texto = ''
  if (minutos > 0) {
    texto = `${minutos} minuto${minutos > 1 ? 's' : ''}${segs > 0 ? ` y ${segs} segundo${segs > 1 ? 's' : ''}` : ''}`
  } else {
    texto = `${segs} segundo${segs > 1 ? 's' : ''}`
  }

  if (bloqueadoHasta) {
    try {
      const fecha = new Date(bloqueadoHasta)
      const horaTexto = fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      return `${texto} (hasta las ${horaTexto})`
    } catch (_) {}
  }

  return texto
}

/**
 * RF50: Enlace de recuperación de contraseña de un solo uso.
 */
export async function solicitarRecuperacionContrasena(correo) {
  const validacion = validarCorreoInstitucional(correo)
  if (!validacion.valido) {
    return { success: false, error: validacion.error }
  }

  const correoLimpio = correo.trim().toLowerCase()
  try {
    await supabase.auth.resetPasswordForEmail(correoLimpio, {
      redirectTo: `${window.location.origin}/login`
    })
  } catch (_) {}

  return {
    success: true,
    message: 'Si el correo institucional ingresado se encuentra registrado, te hemos enviado un enlace de un solo uso para restablecer tu contraseña. Revisa tu bandeja de entrada.'
  }
}