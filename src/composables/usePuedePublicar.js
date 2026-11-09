import { computed, ref } from 'vue'
import { useAuth } from './useAuth'
import { obtenerPermisosProfesor } from '../services/adminService'
import { consultarCondicionesPublicar } from '../services/medicionesService'

/**
 * Reúne lo que hace falta para saber si esta cuenta puede publicar (RF31, RF98) y por qué no:
 * rol real (perfil), permiso `publicar_galeria` del profesor, sesión real y consentimiento vigente.
 * Distingue «no tiene permiso» de «no se pudo consultar el permiso».
 * Úsalo con `cuenta` en evaluarPublicacion() / accionHistorial() de utils/terminarMedicion.js.
 */
export function usePuedePublicar() {
  const { isAuthenticated, profile, user, isProfesor, currentUserId } = useAuth()

  const permisos = ref(null)
  const permisoConsultado = ref(true)
  const sesionReal = ref(null)
  const consentimientoVigente = ref(null)
  const usuarioActualId = ref(null)

  // Administrador: solo lo que dice el perfil de la base (el metadato del registro lo puede escribir cualquiera)
  const esAdmin = computed(() => !!profile.value?.es_admin)

  async function cargar() {
    const [cond] = await Promise.all([
      consultarCondicionesPublicar(),
      (async () => {
        if (esAdmin.value || !isProfesor.value || !currentUserId.value) return
        try {
          const r = await obtenerPermisosProfesor(currentUserId.value)
          permisos.value = r?.data || null
          permisoConsultado.value = r?.consultado !== false
        } catch {
          permisos.value = null
          permisoConsultado.value = false
        }
      })()
    ])
    sesionReal.value = cond.sesionReal
    consentimientoVigente.value = cond.consentimientoVigente
    usuarioActualId.value = cond.usuarioId
  }

  const cuenta = computed(() => ({
    haySesion: isAuthenticated.value,
    sesionReal: sesionReal.value,
    esAdmin: esAdmin.value,
    rol: isProfesor.value ? 'profesor' : 'usuario',
    permisos: permisos.value,
    permisoConsultado: permisoConsultado.value,
    consentimientoVigente: consentimientoVigente.value,
    usuarioActualId: usuarioActualId.value || user.value?.id || null
  }))

  return { cuenta, cargar }
}
