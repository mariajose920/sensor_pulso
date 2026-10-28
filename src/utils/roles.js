/**
 * RF52: Control de acceso por roles con principio de mínimo privilegio
 */

export const ROLES = {
  ADMIN: 'admin',
  PROFESOR: 'profesor',
  USUARIO: 'usuario' // Estudiante
}

// Matriz de permisos de mínimo privilegio
export const PERMISOS = {
  // Mediciones
  MEDIR_SENSOR: [ROLES.USUARIO, ROLES.PROFESOR, ROLES.ADMIN],
  VER_PROPIO_HISTORIAL: [ROLES.USUARIO, ROLES.PROFESOR, ROLES.ADMIN],
  
  // Aulas y Evaluaciones
  UNIRSE_AULA: [ROLES.USUARIO],
  CREAR_AULA: [ROLES.PROFESOR, ROLES.ADMIN],
  GESTIONAR_EVALUACIONES: [ROLES.PROFESOR, ROLES.ADMIN],
  VER_ESTUDIANTES_AULA: [ROLES.PROFESOR, ROLES.ADMIN],

  // Administración del sistema
  ADMINISTRAR_USUARIOS: [ROLES.ADMIN],
  ASIGNAR_ROLES: [ROLES.ADMIN],
  CONFIGURAR_RANGOS_GLOBALES: [ROLES.ADMIN]
}

/**
 * Verifica si un rol tiene un permiso determinado
 */
export function tienePermiso(rolUsuario, permiso) {
  if (!rolUsuario || !PERMISOS[permiso]) return false
  return PERMISOS[permiso].includes(rolUsuario)
}

/**
 * Nombre legible para mostrar en pantalla
 */
export function obtenerEtiquetaRol(rol) {
  switch (rol) {
    case ROLES.ADMIN:
      return 'Administrador'
    case ROLES.PROFESOR:
      return 'Profesor'
    case ROLES.USUARIO:
    default:
      return 'Estudiante'
  }
}