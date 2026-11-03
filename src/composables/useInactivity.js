import { ref, watch, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from './useAuth'

// Reglas oficiales del RF51: 15 minutos de inactividad, con aviso previo 1 minuto antes (a los 14 min)
const TIEMPO_INACTIVIDAD_MS = 15 * 60 * 1000 // 15 minutos
const TIEMPO_AVISO_PREVIO_MS = 60 * 1000    // 1 minuto de aviso previo

const mostrarAviso = ref(false)
const segundosParaCierre = ref(60)

export function useInactivity() {
  const router = useRouter()
  const { isAuthenticated, logout } = useAuth()

  let ultimaActividad = Date.now()
  let timerVerificacion = null
  let timerRegresivo = null

  const eventosUsuario = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart', 'click']

  const registrarActividad = () => {
    // Si el aviso ya está en pantalla, el usuario debe pulsar el botón para confirmar
    if (!mostrarAviso.value) {
      ultimaActividad = Date.now()
    }
  }

  const mantenerSesionActiva = () => {
    mostrarAviso.value = false
    if (timerRegresivo) clearInterval(timerRegresivo)
    ultimaActividad = Date.now()
  }

  const ejecutarCierrePorInactividad = async () => {
    mostrarAviso.value = false
    if (timerRegresivo) clearInterval(timerRegresivo)
    if (timerVerificacion) clearInterval(timerVerificacion)
    
    await logout({ porInactividad: true })
    router.push('/login?motivo=inactividad')
  }

  const iniciarConteoRegresivoAviso = (segundosIniciales) => {
    segundosParaCierre.value = Math.max(1, segundosIniciales)
    mostrarAviso.value = true

    if (timerRegresivo) clearInterval(timerRegresivo)
    timerRegresivo = setInterval(() => {
      if (segundosParaCierre.value > 1) {
        segundosParaCierre.value--
      } else {
        clearInterval(timerRegresivo)
        ejecutarCierrePorInactividad()
      }
    }, 1000)
  }

  const verificarInactividad = () => {
    if (!isAuthenticated.value) return

    const tiempoTranscurrido = Date.now() - ultimaActividad
    const tiempoRestanteTotal = TIEMPO_INACTIVIDAD_MS - tiempoTranscurrido

    if (tiempoRestanteTotal <= 0) {
      ejecutarCierrePorInactividad()
    } else if (tiempoRestanteTotal <= TIEMPO_AVISO_PREVIO_MS && !mostrarAviso.value) {
      const segundosRestantes = Math.ceil(tiempoRestanteTotal / 1000)
      iniciarConteoRegresivoAviso(segundosRestantes)
    }
  }

  const iniciarMonitoreo = () => {
    ultimaActividad = Date.now()
    eventosUsuario.forEach(ev => window.addEventListener(ev, registrarActividad, { passive: true }))
    
    if (timerVerificacion) clearInterval(timerVerificacion)
    timerVerificacion = setInterval(verificarInactividad, 2000)
  }

  const detenerMonitoreo = () => {
    eventosUsuario.forEach(ev => window.removeEventListener(ev, registrarActividad))
    if (timerVerificacion) clearInterval(timerVerificacion)
    if (timerRegresivo) clearInterval(timerRegresivo)
    mostrarAviso.value = false
  }

  watch(isAuthenticated, (activo) => {
    if (activo) iniciarMonitoreo()
    else detenerMonitoreo()
  }, { immediate: true })

  onUnmounted(() => {
    detenerMonitoreo()
  })

  return {
    mostrarAviso,
    segundosParaCierre,
    mantenerSesionActiva,
    ejecutarCierrePorInactividad
  }
}
