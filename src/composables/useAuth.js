import { ref, computed } from 'vue'
import { supabase } from '../services/supabase'

// Estado reactivo global del usuario en sesión
const user = ref(null)
const session = ref(null)
const loading = ref(true)

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
  // RF01: Datos para identificar al usuario que realiza la medición
  const isAuthenticated = computed(() => !!user.value)
  const currentUserId = computed(() => user.value?.id || null)
  const currentUserEmail = computed(() => user.value?.email || '')
  
  // Extraer nombre o fallback desde el correo institucional
  const currentUserName = computed(() => {
    if (!user.value) return 'Invitado / No identificado'
    return user.value.user_metadata?.nombre_completo || 
           user.value.email?.split('@')[0] || 
           'Usuario sin nombre'
  })

  // Rol del usuario (por defecto 'usuario' para estudiantes)
  const currentUserRole = computed(() => {
    return user.value?.user_metadata?.rol || 'usuario'
  })

  return {
    user,
    session,
    loading,
    isAuthenticated,
    currentUserId,
    currentUserEmail,
    currentUserName,
    currentUserRole
  }
}