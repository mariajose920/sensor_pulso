/**
 * Control para mostrar por un rato los datos personales que se ven enmascarados (RF61).
 *
 * - Mostrar los datos queda registrado en la auditoría («revelacion_datos»); solo el administrador puede.
 * - Si no se logra registrar, los datos NO se muestran (primero la trazabilidad, luego el acceso).
 * - Pasados `duracionS` segundos, o al salir de la pantalla, vuelven a enmascararse solos.
 */

import { ref, getCurrentInstance, onBeforeUnmount } from 'vue'
import { registrarEventoAuditoria } from '../services/auditoriaService.js'

export const DURACION_REVELACION_S = 60

export function useRevelarDatos(contexto, { duracionS = DURACION_REVELACION_S, registrar = registrarEventoAuditoria } = {}) {
  const revelado = ref(false)
  const restante = ref(0)
  const trabajando = ref(false)
  const error = ref('')
  let reloj = null

  function detener() {
    if (reloj) {
      clearInterval(reloj)
      reloj = null
    }
  }

  function ocultar() {
    detener()
    revelado.value = false
    restante.value = 0
  }

  async function revelar() {
    if (revelado.value || trabajando.value) return
    trabajando.value = true
    error.value = ''
    try {
      const res = await registrar({
        accion: 'revelacion_datos',
        entidad: 'datos_personales',
        entidadNombre: contexto,
        resumen: `Se mostraron datos personales sin enmascarar en: ${contexto}`,
        detalle: { contexto, duracion_s: duracionS }
      })
      if (!res?.ok) {
        error.value = 'No se pudo registrar el acceso en la auditoría, por eso los datos siguen enmascarados.'
        return
      }
      revelado.value = true
      restante.value = duracionS
      detener()
      reloj = setInterval(() => {
        restante.value -= 1
        if (restante.value <= 0) ocultar()
      }, 1000)
    } catch (err) {
      error.value = err?.message || 'No se pudo mostrar los datos.'
    } finally {
      trabajando.value = false
    }
  }

  async function alternar() {
    if (revelado.value) ocultar()
    else await revelar()
  }

  // Al salir de la pantalla vuelven a enmascararse (solo si se usa dentro de un componente)
  if (getCurrentInstance()) onBeforeUnmount(ocultar)

  return { revelado, restante, trabajando, error, revelar, ocultar, alternar }
}
