import { ref, computed } from 'vue'
import { supabase } from '../services/supabase'
import { validarCorreoInstitucional } from '../utils/validators'
import { ROLES, tienePermiso, obtenerEtiquetaPerfil } from '../utils/roles'
import { PRIMER_ADMIN } from '../../scripts/seedAdmin.js'

// Estado reactivo global
const user = ref(JSON.parse(localStorage.getItem('sensor_user') || 'null'))
const profile = ref(JSON.parse(localStorage.getItem('sensor_profile') || 'null'))
const session = ref(null)
const loading = ref(false)
const authError = ref(null)

async function cargarPerfilDesdeBD(userId) {
  if (!userId) return
  try {
    const { data, error } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (!error && data) {
      profile.value = data
      localStorage.setItem('sensor_profile', JSON.stringify(data))
    }
  } catch (err) {
    console.warn('Aviso cargando perfil:', err)
  }
}

// Inicializar sesión
supabase.auth.getSession().then(async ({ data }) => {
  if (data?.session?.user) {
    session.value = data.session
    user.value = data.session.user
    await cargarPerfilDesdeBD(user.value.id)
  }
}).catch(() => {}).finally(() => {
  loading.value = false
})

export function useAuth() {
  const isAuthenticated = computed(() => !!user.value)
  const currentUserId = computed(() => user.value?.id || null)
  const currentUserEmail = computed(() => user.value?.email || profile.value?.correo || '')
  
  const currentUserName = computed(() => {
    return profile.value?.nombre || user.value?.user_metadata?.nombre_completo || 'Usuario'
  })

  // RF45: Roles desde la base de datos o perfil activo
  const isAdmin = computed(() => profile.value?.es_admin === true)
  const isProfesor = computed(() => profile.value?.rol === 'profesor' || isAdmin.value)
  const isEstudiante = computed(() => profile.value?.rol === 'usuario')

  const currentUserRole = computed(() => {
    if (isAdmin.value) return ROLES.ADMIN
    if (profile.value?.rol === 'profesor') return ROLES.PROFESOR
    return ROLES.USUARIO
  })

  const roleLabel = computed(() => obtenerEtiquetaPerfil(profile.value))

  const can = (permiso) => tienePermiso(currentUserRole.value, permiso)

  // RF02 & RF44: Inicio de sesión con soporte para Administrador Inicial
  const login = async (email, password) => {
    authError.value = null
    loading.value = true

    // Detección directa del Administrador Inicial definido en código (RF44)
    if (email === PRIMER_ADMIN.email && password === PRIMER_ADMIN.password) {
      const adminUser = {
        id: '00000000-0000-0000-0000-000000000001',
        email: PRIMER_ADMIN.email,
        user_metadata: { nombre_completo: PRIMER_ADMIN.nombreCompleto, rol: 'admin' }
      }
      const adminProfile = {
        id: '00000000-0000-0000-0000-000000000001',
        correo: PRIMER_ADMIN.email,
        nombre: PRIMER_ADMIN.nombreCompleto,
        rol: 'profesor',
        es_admin: true
      }
      user.value = adminUser
      profile.value = adminProfile
      session.value = { user: adminUser }
      localStorage.setItem('sensor_user', JSON.stringify(adminUser))
      localStorage.setItem('sensor_profile', JSON.stringify(adminProfile))
      loading.value = false
      return { success: true }
    }

    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      user.value = data.user
      localStorage.setItem('sensor_user', JSON.stringify(data.user))
      await cargarPerfilDesdeBD(data.user.id)
      return { success: true, data }
    } catch (err) {
      let mensaje = err.message
      if (mensaje.includes('Invalid login credentials')) mensaje = 'Correo o contraseña incorrectos.'
      else if (mensaje.includes('Email not confirmed')) mensaje = 'Debes confirmar tu correo antes de iniciar sesión.'
      authError.value = mensaje
      return { success: false, error: mensaje }
    } finally {
      loading.value = false
    }
  }

  const register = async (email, password, nombreCompleto) => {
    authError.value = null
    const validacion = validarCorreoInstitucional(email)
    if (!validacion.valido) return { success: false, error: validacion.error }
    loading.value = true
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            nombre_completo: nombreCompleto,
            rol: validacion.rol,
            tipo_cuenta: validacion.tipo
          }
        }
      })
      if (error) throw error
      return { success: true, data }
    } catch (err) {
      return { success: false, error: err.message }
    } finally {
      loading.value = false
    }
  }

  const logout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (_) {}
    user.value = null
    profile.value = null
    session.value = null
    localStorage.removeItem('sensor_user')
    localStorage.removeItem('sensor_profile')
  }

  const refrescarPerfil = async () => {
    if (user.value) await cargarPerfilDesdeBD(user.value.id)
  }

  return {
    user,
    profile,
    session,
    loading,
    authError,
    isAuthenticated,
    currentUserId,
    currentUserEmail,
    currentUserName,
    currentUserRole,
    isAdmin,
    isProfesor,
    isEstudiante,
    roleLabel,
    can,
    login,
    register,
    logout,
    refrescarPerfil
  }
}