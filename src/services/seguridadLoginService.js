import { supabase } from './supabase'
import { validarCorreoInstitucional } from '../utils/validators'

// Reglas de seguridad del RF50
export const MAX_INTENTOS_FALLIDOS = 5
export const DURACION_BLOQUEO_MINUTOS = 15

const STORAGE_INTENTOS = 'sensor_pulso_intentos_login'
const STORAGE_BLOQUEOS = 'sensor_pulso_bloqueos_cuenta'

function cargarStorage(key, porDefecto) {
  if (typeof window === 'undefined' || !window.localStorage) return porDefecto
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : porDefecto
  } catch (_) {
    return porDefecto
  }
}

function guardarStorage(key, data) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (_) {}
}

/**
 * RF50: Verifica si la cuenta está actualmente bloqueada y calcula los segundos restantes.
 * Cumple: "El bloqueo termina solo al cumplirse el tiempo" y 
 * "Tras superar el límite la cuenta se bloquea aunque la contraseña sea correcta".
 */
export async function verificarEstadoBloqueo(correo) {
  if (!correo) return { bloqueado: false, segundosRestantes: 0 }
  const correoLimpio = correo.trim().toLowerCase()
  const ahora = Date.now()

  // 1. Intentar consultar tabla bloqueos_cuenta en Supabase si está disponible
  try {
    const { data } = await supabase
      .from('bloqueos_cuenta')
      .select('bloqueado_hasta')
      .eq('correo', correoLimpio)
      .maybeSingle()

    if (data?.bloqueado_hasta) {
      const hasta = new Date(data.bloqueado_hasta).getTime()
      if (hasta > ahora) {
        const segRestantes = Math.ceil((hasta - ahora) / 1000)
        return { bloqueado: true, segundosRestantes: segRestantes, bloqueadoHasta: data.bloqueado_hasta }
      }
    }
  } catch (_) {}

  // 2. Comprobación en almacenamiento local persistente
  const bloqueos = cargarStorage(STORAGE_BLOQUEOS, {})
  const bloqueadoHastaMs = bloqueos[correoLimpio]

  if (bloqueadoHastaMs && bloqueadoHastaMs > ahora) {
    const segundosRestantes = Math.ceil((bloqueadoHastaMs - ahora) / 1000)
    return {
      bloqueado: true,
      segundosRestantes,
      bloqueadoHasta: new Date(bloqueadoHastaMs).toISOString()
    }
  }

  // Si el tiempo ya expiró, liberar bloqueo local
  if (bloqueadoHastaMs && bloqueadoHastaMs <= ahora) {
    delete bloqueos[correoLimpio]
    guardarStorage(STORAGE_BLOQUEOS, bloqueos)
  }

  return { bloqueado: false, segundosRestantes: 0 }
}

/**
 * RF50: Registra un intento de login (éxito o fallo).
 * Bloquea la cuenta automáticamente al 5to intento fallido dentro de la ventana de 15 min.
 */
export async function registrarIntentoLogin({ correo, exitoso }) {
  if (!correo) return { bloqueado: false }
  const correoLimpio = correo.trim().toLowerCase()
  const ahora = Date.now()
  const ventanaLimite = ahora - (DURACION_BLOQUEO_MINUTOS * 60 * 1000)

  let intentos = cargarStorage(STORAGE_INTENTOS, [])
  let bloqueos = cargarStorage(STORAGE_BLOQUEOS, {})

  // Si el inicio de sesión fue exitoso: restablecer intentos y desbloquear
  if (exitoso) {
    intentos = intentos.filter(i => i.correo !== correoLimpio)
    delete bloqueos[correoLimpio]
    guardarStorage(STORAGE_INTENTOS, intentos)
    guardarStorage(STORAGE_BLOQUEOS, bloqueos)

    try {
      await supabase.from('bloqueos_cuenta').delete().eq('correo', correoLimpio)
    } catch (_) {}

    return { bloqueado: false, intentosFallidos: 0 }
  }

  // Registrar fallo nuevo
  intentos.push({ correo: correoLimpio, fecha: ahora })
  
  // Filtrar fallos recientes dentro de la ventana de 15 minutos
  const fallosRecientes = intentos.filter(i => i.correo === correoLimpio && i.fecha > ventanaLimite)
  const totalFallos = fallosRecientes.length

  // Si alcanza los 5 fallos, bloquear por 15 minutos
  if (totalFallos >= MAX_INTENTOS_FALLIDOS) {
    const bloqueoHastaMs = ahora + (DURACION_BLOQUEO_MINUTOS * 60 * 1000)
    bloqueos[correoLimpio] = bloqueoHastaMs

    guardarStorage(STORAGE_INTENTOS, intentos)
    guardarStorage(STORAGE_BLOQUEOS, bloqueos)

    try {
      await supabase.from('bloqueos_cuenta').upsert({
        correo: correoLimpio,
        bloqueado_hasta: new Date(bloqueoHastaMs).toISOString(),
        motivo: 'intentos_fallidos'
      })
    } catch (_) {}

    return {
      bloqueado: true,
      segundosRestantes: DURACION_BLOQUEO_MINUTOS * 60,
      intentosFallidos: totalFallos,
      intentosRestantes: 0
    }
  }

  guardarStorage(STORAGE_INTENTOS, intentos)
  return {
    bloqueado: false,
    intentosFallidos: totalFallos,
    intentosRestantes: MAX_INTENTOS_FALLIDOS - totalFallos
  }
}

/**
 * Formatea segundos a texto amigable ("X minutos y Y segundos")
 */
export function formatearTiempoRestante(segundos) {
  if (segundos <= 0) return '0 segundos'
  const minutos = Math.floor(segundos / 60)
  const segs = segundos % 60

  if (minutos > 0) {
    return `${minutos} minuto${minutos > 1 ? 's' : ''}${segs > 0 ? ` y ${segs} segundo${segs > 1 ? 's' : ''}` : ''}`
  }
  return `${segs} segundo${segs > 1 ? 's' : ''}`
}

/**
 * RF50: Enlace de recuperación de contraseña de un solo uso.
 * Criterio de aceptación: "Los mensajes no revelan si un correo existe".
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

  // Mensaje de respuesta genérico y seguro (anti-enumeración de usuarios)
  return {
    success: true,
    message: 'Si el correo institucional ingresado se encuentra registrado, te hemos enviado un enlace de un solo uso para restablecer tu contraseña. Revisa tu bandeja de entrada.'
  }
}