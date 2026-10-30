/**
 * RF52 y RF45: Control de acceso por roles y principio de mínimo privilegio
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

  // Administración del sistema (RF45)
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
 * RF45: Retorna la etiqueta legible del perfil (soporta ser Administrador y Profesor a la vez)
 */
export function obtenerEtiquetaPerfil(perfil) {
  if (!perfil) return 'Invitado'
  if (perfil.es_admin && perfil.rol === 'profesor') {
    return 'Administrador y Profesor'
  }
  if (perfil.es_admin) {
    return 'Administrador'
  }
  if (perfil.rol === 'profesor') {
    return 'Profesor'
  }
  return 'Estudiante'
}

/**
 * Retorna la etiqueta por rol simple
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