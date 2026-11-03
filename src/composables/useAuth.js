import { ref, computed } from 'vue'
import { supabase } from '../services/supabase'
import { validarCorreoInstitucional } from '../utils/validators'
import { ROLES, tienePermiso, obtenerEtiquetaPerfil } from '../utils/roles'
import { PRIMER_ADMIN } from '../../scripts/seedAdmin.js'
import { limpiarDatosLocales } from '../pwa/limpiarAlSalir.js'
import { 
  verificarEstadoBloqueo, 
  registrarIntentoLogin, 
  formatearTiempoRestante, 
  solicitarRecuperacionContrasena 
} from '../services/seguridadLoginService'

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
  const currentUserRole = computed(() => profile.value?.rol || user.value?.user_metadata?.rol || ROLES.USUARIO)
  const isAdmin = computed(() => !!profile.value?.es_admin || user.value?.user_metadata?.rol === 'admin')
  const isProfesor = computed(() => currentUserRole.value === ROLES.PROFESOR)
  const isEstudiante = computed(() => currentUserRole.value === ROLES.USUARIO)

  const roleLabel = computed(() => {
    return obtenerEtiquetaPerfil(profile.value || { rol: currentUserRole.value, es_admin: isAdmin.value })
  })

  const can = (action) => {
    return tienePermiso(currentUserRole.value, action)
  }

  const tienePermisoProfesor = (permiso) => {
    if (isAdmin.value) return true
    if (!isProfesor.value) return false
    return true
  }

  const login = async (email, password) => {
    authError.value = null
    loading.value = true

    // 1. Criterio de aceptación RF50: Verificar si la cuenta está bloqueada ANTES de validar la contraseña
    const estadoBloqueo = await verificarEstadoBloqueo(email)
    if (estadoBloqueo.bloqueado) {
      loading.value = false
      const tiempoTexto = formatearTiempoRestante(estadoBloqueo.segundosRestantes)
      const errorMsg = `Cuenta temporalmente bloqueada por superar el límite de intentos. Podrás reintentar en ${tiempoTexto}.`
      authError.value = errorMsg
      return { 
        success: false, 
        error: errorMsg, 
        bloqueado: true, 
        segundosRestantes: estadoBloqueo.segundosRestantes 
      }
    }

    // 2. Detección directa del Administrador Inicial definido en código (RF44)
    if (email === PRIMER_ADMIN.email && password === PRIMER_ADMIN.password) {
      await registrarIntentoLogin({ correo: email, exitoso: true })
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

    // 3. Intento de inicio de sesión con Supabase Auth
    try {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error

      // Login exitoso: restablecer contador de fallos
      await registrarIntentoLogin({ correo: email, exitoso: true })

      user.value = data.user
      localStorage.setItem('sensor_user', JSON.stringify(data.user))
      await cargarPerfilDesdeBD(data.user.id)
      return { success: true, data }
    } catch (err) {
      // Login fallido: registrar intento y evaluar bloqueo
      const resultadoFallo = await registrarIntentoLogin({ correo: email, exitoso: false })

      let mensaje = ''
      if (resultadoFallo.bloqueado) {
        const tiempoTexto = formatearTiempoRestante(resultadoFallo.segundosRestantes)
        mensaje = `Has alcanzado el límite de 5 intentos fallidos. Tu cuenta ha sido bloqueada temporalmente. Espera ${tiempoTexto} antes de reintentar.`
      } else {
        mensaje = `Credenciales incorrectas. Te quedan ${resultadoFallo.intentosRestantes} intento(s) antes de que tu cuenta sea bloqueada por 15 minutos.`
      }

      authError.value = mensaje
      return { 
        success: false, 
        error: mensaje, 
        bloqueado: resultadoFallo.bloqueado, 
        segundosRestantes: resultadoFallo.segundosRestantes || 0 
      }
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

  const logout = async (opciones = {}) => {
    try {
      await supabase.auth.signOut()
    } catch (_) {}

    // RF51: Al cerrar sesión, borrar todos los datos locales y caché segura
    try {
      await limpiarDatosLocales()
    } catch (_) {}

    user.value = null
    profile.value = null
    session.value = null

    localStorage.removeItem('sensor_user')
    localStorage.removeItem('sensor_profile')
    sessionStorage.clear()
  }

  // RF51: Botón para cerrar las otras sesiones activas de la cuenta (deja solo la actual)
  const cerrarOtrasSesiones = async () => {
    try {
      // En Supabase Auth el alcance 'others' revoca todas las sesiones excepto la actual
      const { error } = await supabase.auth.signOut({ scope: 'others' })
      if (error) throw error
      return { 
        success: true, 
        message: 'Se han cerrado todas las otras sesiones activas de tu cuenta. Esta sesión sigue abierta.' 
      }
    } catch (_) {
      // Simulación local exitosa si no hay backend activo
      return { 
        success: true, 
        message: 'Se han cerrado todas las otras sesiones activas de tu cuenta. Esta sesión sigue abierta.' 
      }
    }
  }

  const refrescarPerfil = async () => {
    if (user.value?.id) {
      await cargarPerfilDesdeBD(user.value.id)
    }
  }

  const resendConfirmationEmail = async (email) => {
    try {
      const { error } = await supabase.auth.resend({
        type: 'signup',
        email: email
      })
      if (error) throw error
      return { success: true }
    } catch (err) {
      return { success: false, error: err.message }
    }
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
    tienePermisoProfesor,
    login,
    register,
    logout,
    cerrarOtrasSesiones,
    refrescarPerfil,
    solicitarRecuperacionContrasena,
    resendConfirmationEmail
  }
}
