import { ref, computed } from 'vue'
import { supabase } from '../services/supabase'
import { validarCorreoInstitucional } from '../utils/validators'
import { ROLES, tienePermiso, obtenerEtiquetaRol } from '../utils/roles'

// Estado reactivo global del usuario en sesión
const user = ref(null)
const session = ref(null)
const loading = ref(true)
const authError = ref(null)

// Inicializar y escuchar cambios de sesión en Supabase Auth
supabase.auth.getSession().then(({ data }) => {
  session.value = data.session
  user.value = data.session?.user ?? null
  loading.value = false
})

supabase.auth.onAuthStateChange((_event, newSession) => {
  session.value = newSession
  user.value = newSession?.user ?? null
  loading.value = false
})

export function useAuth() {
  // RF01: Identificación del usuario activo
  const isAuthenticated = computed(() => !!user.value)
  const currentUserId = computed(() => user.value?.id || null)
  const currentUserEmail = computed(() => user.value?.email || '')
  
  const currentUserName = computed(() => {
    if (!user.value) return 'Invitado / No identificado'
    return user.value.user_metadata?.nombre_completo || 
           user.value.email?.split('@')[0] || 
           'Usuario'
  })

  const currentUserRole = computed(() => {
    return user.value?.user_metadata?.rol || 'usuario'
  })

  // RF02: Inicio de sesión con correo y contraseña (Supabase Auth)
  const login = async (email, password) => {
    authError.value = null
    loading.value = true
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      })
      if (error) throw error
      return { success: true, data }
    } catch (err) {
      let mensaje = err.message
      if (mensaje.includes('Invalid login credentials')) {
        mensaje = 'Correo o contraseña incorrectos.'
      } else if (mensaje.includes('Email not confirmed')) {
        mensaje = 'Debes confirmar tu correo antes de iniciar sesión.'
      }
      authError.value = mensaje
      return { success: false, error: mensaje }
    } finally {
      loading.value = false
    }
  }

 // RF02 y RF96: Registro con asignación de rol según dominio UNACH
  const register = async (email, password, nombreCompleto) => {
    authError.value = null
    // RF96: Validación previa estricta del dominio institucional
    const validacion = validarCorreoInstitucional(email)
    if (!validacion.valido) {
      authError.value = validacion.error
      return { success: false, error: validacion.error }
    }
    loading.value = true
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nombre_completo: nombreCompleto,
            rol: validacion.rol, // RF96: 'usuario' o 'profesor' según el dominio
            tipo_cuenta: validacion.tipo
          }
        }
      })
      if (error) throw error
      return { success: true, data, validacion }
    } catch (err) {
      let mensaje = err.message
      if (mensaje.includes('User already registered')) {
        mensaje = 'Ya existe una cuenta registrada con este correo.'
      }
      authError.value = mensaje
      return { success: false, error: mensaje }
    } finally {
      loading.value = false
    }
  }

    // RF52: Helpers de roles y principio de mínimo privilegio
  const isAdmin = computed(() => currentUserRole.value === ROLES.ADMIN)
  const isProfesor = computed(() => currentUserRole.value === ROLES.PROFESOR || isAdmin.value)
  const isEstudiante = computed(() => currentUserRole.value === ROLES.USUARIO)

  const roleLabel = computed(() => obtenerEtiquetaRol(currentUserRole.value))

  const can = (permiso) => {
    return tienePermiso(currentUserRole.value, permiso)
  }

  // RF02: Cerrar sesión
  const logout = async () => {
    loading.value = true
    try {
      await supabase.auth.signOut()
      user.value = null
      session.value = null
    } catch (err) {
      authError.value = err.message
    } finally {
      loading.value = false
    }
  }

    return {
    user,
    session,
    loading,
    authError,
    isAuthenticated,
    currentUserId,
    currentUserEmail,
    currentUserName,
    currentUserRole,
    isAdmin,      // <-- Agregado
    isProfesor,   // <-- Agregado
    isEstudiante, // <-- Agregado
    roleLabel,    // <-- Agregado
    can,          // <-- Agregado
    login,
    register,
    logout,
    resendConfirmationEmail
  }
}