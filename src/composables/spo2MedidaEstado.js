/**
 * Estado de la SpO₂ medida que se muestra en el apartado de aprendizaje (RF115).
 *
 * Es el núcleo de `useSpo2Medida`: recibe de dónde leer el historial y si hay sesión, así se puede probar sin red.
 * Pide solo las mediciones hechas con el sensor y deja que `seleccionarMedida` decida cuál se muestra.
 */

import { ref, computed, watch, onMounted, getCurrentInstance } from 'vue'
import { evaluarEstadoSpo2 } from '../services/spo2Service.js'
import { seleccionarMedida } from '../utils/spo2Aprendizaje.js'

const SELECCION_VACIA = () => ({ medida: null, omitidasPorCalidad: 0, ultimas: [], cambio: null })

/**
 * @param {{ listar: Function, autenticado: import('vue').Ref<boolean> }} dependencias
 *   listar: ({pagina, fuente}) => Promise<{items, sinConexion?, error?}>
 */
export function crearEstadoSpo2Medida({ listar, autenticado }) {
  const cargando = ref(false)
  const error = ref('')
  const sinConexion = ref(false)
  const seleccion = ref(SELECCION_VACIA())
  let consulta = 0

  const medida = computed(() => seleccion.value.medida)
  const estado = computed(() => evaluarEstadoSpo2(medida.value?.spo2))

  async function cargar() {
    const esta = ++consulta
    if (!autenticado.value) {
      seleccion.value = SELECCION_VACIA()
      error.value = ''
      cargando.value = false
      return
    }
    cargando.value = true
    error.value = ''
    try {
      const resultado = await listar({ pagina: 0, fuente: 'sensor' })
      if (esta !== consulta) return // llegó una consulta más nueva: esta ya no vale
      if (resultado.error) {
        error.value = resultado.error
        seleccion.value = SELECCION_VACIA()
        return
      }
      sinConexion.value = Boolean(resultado.sinConexion)
      // Sin conexión, las mediciones guardadas en el dispositivo pueden no traer su origen: se aceptan y se avisa
      seleccion.value = seleccionarMedida(resultado.items, { permitirSinFuente: sinConexion.value })
    } catch (err) {
      if (esta !== consulta) return
      error.value = err?.message || 'No se pudo cargar tu medición.'
      seleccion.value = SELECCION_VACIA()
    } finally {
      if (esta === consulta) cargando.value = false
    }
  }

  if (getCurrentInstance()) {
    onMounted(cargar)
    watch(autenticado, cargar)
  }

  return {
    estaAutenticado: autenticado,
    cargando,
    error,
    sinConexion,
    seleccion,
    medida,
    estado,
    ultimas: computed(() => seleccion.value.ultimas),
    cambio: computed(() => seleccion.value.cambio),
    omitidasPorCalidad: computed(() => seleccion.value.omitidasPorCalidad),
    cargar
  }
}
