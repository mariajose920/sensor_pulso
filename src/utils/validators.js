/**
 * RF96: Validación de correos institucionales Universidad Adventista de Chile
 * - Estudiantes: @alu.unach.cl -> Rol inicial: 'usuario'
 * - Profesores:  @unach.cl     -> Rol inicial: 'profesor'
 */
export const DOMINIOS_PERMITIDOS = {
  ESTUDIANTE: '@alu.unach.cl',
  PROFESOR: '@unach.cl'
}

export function validarCorreoInstitucional(email) {
  if (!email || typeof email !== 'string') {
    return {
      valido: false,
      error: 'El correo electrónico es obligatorio.',
      rol: null,
      tipo: null
    }
  }

  const emailLimpio = email.trim().toLowerCase()

  if (emailLimpio.endsWith(DOMINIOS_PERMITIDOS.ESTUDIANTE)) {
    return {
      valido: true,
      error: null,
      rol: 'usuario',
      tipo: 'Estudiante (UNACH)'
    }
  }

  if (emailLimpio.endsWith(DOMINIOS_PERMITIDOS.PROFESOR)) {
    return {
      valido: true,
      error: null,
      rol: 'profesor',
      tipo: 'Docente (UNACH)'
    }
  }

  return {
    valido: false,
    error: 'Solo se aceptan correos institucionales de la UNACH (@alu.unach.cl para estudiantes o @unach.cl para docentes).',
    rol: null,
    tipo: null
  }
}