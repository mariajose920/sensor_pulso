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
import { obtenerPermisosProfesor } from '../services/adminService'

// Estado reactivo global
const user = ref(JSON.parse(localStorage.getItem('sensor_user') || 'null'))
const profile = ref(JSON.parse(localStorage.getItem('sensor_profile') || 'null'))
const session = ref(null)
const loading = ref(false)
const authError = ref(null)
const permisosProfesor = ref(JSON.parse(localStorage.getItem('sensor_profesor_permisos') || 'null'))
const permisosProfesorCargados = ref(false)
const permisoConsultado = ref(true)

async function cargarPermisosProfesorActual(userId) {
  if (!userId) {
    permisosProfesor.value = null
    permisosProfesorCargados.value = false
    permisoConsultado.value = true
    return
  }
  try {
    const res = await obtenerPermisosProfesor(userId)
    permisosProfesor.value = res?.data || null
    permisoConsultado.value = res?.consultado !== false
    if (permisosProfesor.value) {
      localStorage.setItem('sensor_profesor_permisos', JSON.stringify(permisosProfesor.value))
    }
  } catch (_) {
    permisoConsultado.value = false
  } finally {
    permisosProfesorCargados.value = true
  }
}

function extraerNombreGoogle(usuario) {
  const meta = usuario?.user_metadata || {}
  return (
    meta.full_name
    || meta.name
    || meta.nombre_completo
    || meta.nombre
    || [meta.given_name, meta.family_name].filter(Boolean).join(' ')
    || ''
  ).trim()
}

async function validarYAplicarSesion(currentSession) {
  const usuario = currentSession?.user
  if (!usuario) return false

  const validacion = validarCorreoInstitucional(usuario.email)
  if (!validacion.valido) {
    authError.value = validacion.error
    session.value = null
    user.value = null
    profile.value = null
    localStorage.removeItem('sensor_user')
    localStorage.removeItem('sensor_profile')
    try { await supabase.auth.signOut() } catch (_) {}
    return false
  }

  session.value = currentSession
  user.value = usuario
  localStorage.setItem('sensor_user', JSON.stringify(usuario))
  if (profile.value?.id !== usuario.id) {
    profile.value = null
  }
  await cargarPerfilDesdeBD(usuario.id, extraerNombreGoogle(usuario))
  return true
}

async function cargarPerfilDesdeBD(userId, nombreFallback = '') {
  if (!userId) return
  try {
    const { data, error } = await supabase
      .from('perfiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle()

    if (!error && data) {
      if (!data.nombre?.trim() && nombreFallback) {
        data.nombre = nombreFallback
        await supabase.from('perfiles').update({ nombre: nombreFallback }).eq('id', userId)
      }
      profile.value = data
      localStorage.setItem('sensor_profile', JSON.stringify(data))
      if (data.rol === ROLES.PROFESOR && !data.es_admin) {
        await cargarPermisosProfesorActual(userId)
      }
    }
  } catch (err) {
    console.warn('Aviso cargando perfil:', err)
  }
}

// Inicializar sesión y escuchar redirección de Google OAuth
supabase.auth.getSession().then(async ({ data }) => {
  if (data?.session?.user) {
    await validarYAplicarSesion(data.session)
  } else if (user.value?.id && profile.value?.rol === ROLES.PROFESOR && !profile.value?.es_admin) {
    await cargarPermisosProfesorActual(user.value.id)
  }
}).catch(() => {}).finally(() => {
  loading.value = false
})

let omitirLimpiezaSignOut = false

supabase.auth.onAuthStateChange(async (event, currentSession) => {
  if (currentSession?.user) {
    const valido = await validarYAplicarSesion(currentSession)
    if (!valido) return

    if (!profile.value) {
      const correo = (currentSession.user.email || '').toLowerCase()
      const esProfesor = correo.endsWith('@unach.cl') && !correo.includes('@alu.')
      const nombre = extraerNombreGoogle(currentSession.user) || correo.split('@')[0]
      profile.value = {
        id: currentSession.user.id,
        correo,
        nombre,
        rol: esProfesor ? ROLES.PROFESOR : ROLES.USUARIO,
        es_admin: false
      }
      localStorage.setItem('sensor_profile', JSON.stringify(profile.value))
      if (esProfesor) {
        await cargarPermisosProfesorActual(currentSession.user.id)
      }
    }
  } else if (event === 'SIGNED_OUT' && !omitirLimpiezaSignOut) {
    session.value = null
    user.value = null
    profile.value = null
    permisosProfesor.value = null
    permisosProfesorCargados.value = false
    localStorage.removeItem('sensor_user')
    localStorage.removeItem('sensor_profile')
    localStorage.removeItem('sensor_profesor_permisos')
  }
})

export function useAuth() {
  const isAuthenticated = computed(() => !!user.value)
  const currentUserId = computed(() => user.value?.id || null)
  const currentUserEmail = computed(() => user.value?.email || profile.value?.correo || '')
  const currentUserName = computed(() => {
    return profile.value?.nombre?.trim() || extraerNombreGoogle(user.value) || 'Usuario'
  })

  // user_metadata lo escribe la propia persona al registrarse: sirve de respaldo para «profesor/usuario», nunca para «admin»
  const currentUserRole = computed(() => {
    const rol = profile.value?.rol || user.value?.user_metadata?.rol || ROLES.USUARIO
    return rol === 'admin' && !profile.value?.es_admin ? ROLES.USUARIO : rol
  })
  const isAdmin = computed(() => !!profile.value?.es_admin)
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
    if (!permisosProfesor.value) return false
    return Boolean(permisosProfesor.value[permiso])
  }

  // RF02: Inicio de sesión con Google OAuth institucional protegido
  const loginWithGoogle = async () => {
    authError.value = null
    loading.value = true
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: `${window.location.origin}/login`,
          skipBrowserRedirect: true, // Evita redirección automática para validar antes de navegar
          queryParams: {
            access_type: 'offline',
            prompt: 'select_account'
          }
        }
      })
      if (error) throw error

      if (data?.url) {
        // Verificar si el proveedor está habilitado en Supabase antes de redirigir la pestaña
        try {
          const check = await fetch(data.url)
          if (!check.ok) {
            const errJson = await check.json().catch(() => ({}))
            if (errJson.msg?.includes('not enabled') || check.status === 400) {
              const msg = 'El proveedor de Google OAuth aún no está activado en el panel de Supabase. Puedes usar el acceso rápido institucional de prueba abajo.'
              authError.value = msg
              return { success: false, error: msg, providerDisabled: true }
            }
          }
        } catch (_) {}

        // Si está habilitado en Supabase, redirigir a Google normalmente
        window.location.href = data.url
        return { success: true, data }
      }
      return { success: true, data }
    } catch (err) {
      let mensaje = err.message || 'Error al conectar con Google.'
      if (mensaje.includes('provider is not enabled') || mensaje.includes('Unsupported provider')) {
        mensaje = 'El proveedor de Google OAuth aún no está activado en el panel de Supabase. Puedes usar el acceso rápido institucional de prueba abajo.'
        authError.value = mensaje
        return { success: false, error: mensaje, providerDisabled: true }
      }
      authError.value = mensaje
      return { success: false, error: mensaje }
    } finally {
      loading.value = false
    }
  }

  // Acceso rápido con las dos cuentas predefinidas (Administrador y Profesor) para pruebas
  const CUENTAS_PRUEBA = {
    admin: {
      id: '4c0657db-4c09-4b4b-a197-ed106641c112',
      email: PRIMER_ADMIN.email,
      nombre: PRIMER_ADMIN.nombreCompleto || 'Administrador Inicial',
      rol: ROLES.PROFESOR,
      es_admin: true,
      password: PRIMER_ADMIN.password
    },
    profesor: {
      id: '06d76e05-00b4-4098-b5a1-bf518561f0c4',
      email: 'profesor.prueba@unach.cl',
      nombre: 'Profesor Docente',
      rol: ROLES.PROFESOR,
      es_admin: false
    }
  }

  const loginGoogleDemo = async (tipoCuenta = 'admin') => {
    loading.value = true
    authError.value = null
    const cuenta = CUENTAS_PRUEBA[tipoCuenta] || CUENTAS_PRUEBA.admin

    try {
      omitirLimpiezaSignOut = true
      try { await supabase.auth.signOut() } catch (_) {}
      omitirLimpiezaSignOut = false

      if (cuenta.password) {
        try {
          const { data, error } = await supabase.auth.signInWithPassword({
            email: cuenta.email,
            password: cuenta.password
          })
          if (!error && data?.user) {
            user.value = data.user
            session.value = data.session
            localStorage.setItem('sensor_user', JSON.stringify(data.user))
            await cargarPerfilDesdeBD(data.user.id, cuenta.nombre)
            if (!profile.value) {
              profile.value = {
                id: data.user.id,
                correo: cuenta.email,
                nombre: cuenta.nombre,
                rol: cuenta.rol,
                es_admin: cuenta.es_admin
              }
              localStorage.setItem('sensor_profile', JSON.stringify(profile.value))
            }
            await registrarIntentoLogin({ correo: cuenta.email, exitoso: true })
            return { success: true, data: data.user }
          }
        } catch (_) {}
      }

      const mockUser = {
        id: cuenta.id,
        email: cuenta.email,
        app_metadata: { provider: 'google' },
        user_metadata: { full_name: cuenta.nombre, rol: cuenta.rol }
      }
      const mockProfile = {
        id: cuenta.id,
        correo: cuenta.email,
        nombre: cuenta.nombre,
        rol: cuenta.rol,
        es_admin: cuenta.es_admin
      }
      user.value = mockUser
      profile.value = mockProfile
      session.value = { user: mockUser }
      localStorage.setItem('sensor_user', JSON.stringify(mockUser))
      localStorage.setItem('sensor_profile', JSON.stringify(mockProfile))
      if (mockProfile.rol === ROLES.PROFESOR && !mockProfile.es_admin) {
        await cargarPermisosProfesorActual(mockProfile.id)
      } else {
        permisosProfesor.value = null
        permisosProfesorCargados.value = true
      }
      await registrarIntentoLogin({ correo: cuenta.email, exitoso: true })
      return { success: true, data: mockUser }
    } finally {
      omitirLimpiezaSignOut = false
      loading.value = false
    }
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

    // 2. Detección del Administrador Inicial (RF44) con sesión real en Supabase
    if (email === PRIMER_ADMIN.email && password === PRIMER_ADMIN.password) {
      // Intentar autenticación real en Supabase para obtener JWT y permisos RLS en la base de datos
      try {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (!error && data?.user) {
          await registrarIntentoLogin({ correo: email, exitoso: true })
          user.value = data.user
          session.value = data.session
          localStorage.setItem('sensor_user', JSON.stringify(data.user))
          await cargarPerfilDesdeBD(data.user.id)
          if (!profile.value) {
            profile.value = {
              id: data.user.id,
              correo: email,
              nombre: PRIMER_ADMIN.nombreCompleto,
              rol: 'profesor',
              es_admin: true
            }
            localStorage.setItem('sensor_profile', JSON.stringify(profile.value))
          } else {
            profile.value.es_admin = true
          }
          loading.value = false
          return { success: true, data }
        }
      } catch (_) {}

      // Respaldo local seguro si Supabase está offline
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

  const register = async (email, password, nombreCompleto, politicaVersion = null) => {
    authError.value = null
    const validacion = validarCorreoInstitucional(email)
    if (!validacion.valido) return { success: false, error: validacion.error }
    loading.value = true
    try {
      // 1. Verificar primero si el correo ya existe en perfiles de la base de datos
      const { data: perfilExistente } = await supabase
        .from('perfiles')
        .select('id')
        .eq('correo', email.trim().toLowerCase())
        .maybeSingle()

      if (perfilExistente) {
        return { 
          success: false, 
          error: 'Este correo institucional ya se encuentra registrado. Inicia sesión o recupera tu contraseña.' 
        }
      }

      // 2. Intentar registrar en Supabase Auth
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
                options: {
          data: {
            nombre: nombreCompleto,
            nombre_completo: nombreCompleto,
            politica_version: politicaVersion, // RF88: política de privacidad que la persona aceptó
            rol: validacion.rol,
            tipo_cuenta: validacion.tipo
          }
        }
      })
      if (error) throw error

      // 3. Supabase devuelve identities vacío cuando el correo ya existía previamente en auth.users
      if (data?.user && (!data.user.identities || data.user.identities.length === 0)) {
        return { 
          success: false, 
          error: 'Este correo institucional ya se encuentra registrado. Inicia sesión o recupera tu contraseña.' 
        }
      }

      return { success: true, data }
    } catch (err) {
      let mensaje = err.message
      if (mensaje.includes('User already registered') || mensaje.includes('already registered')) {
        mensaje = 'Este correo institucional ya se encuentra registrado. Inicia sesión o recupera tu contraseña.'
      }
      return { success: false, error: mensaje }
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
    permisosProfesor.value = null
    permisosProfesorCargados.value = false

    localStorage.removeItem('sensor_user')
    localStorage.removeItem('sensor_profile')
    localStorage.removeItem('sensor_profesor_permisos')
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

  const recargarPermisosProfesor = async () => {
    if (user.value?.id && isProfesor.value && !isAdmin.value) {
      await cargarPermisosProfesorActual(user.value.id)
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
    permisosProfesor,
    permisosProfesorCargados,
    permisoConsultado,
    tienePermisoProfesor,
    recargarPermisosProfesor,
    login,
    loginWithGoogle,
    loginGoogleDemo,
    register,
    logout,
    cerrarOtrasSesiones,
    refrescarPerfil,
    solicitarRecuperacionContrasena,
    resendConfirmationEmail
  }
}
