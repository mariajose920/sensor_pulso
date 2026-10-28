import { ref, onMounted, onUnmounted } from 'vue'

// Indica si hay que ocultar las barras de navegación: se ocultan al bajar y reaparecen al subir
// un poco, al llegar arriba o al final de la página (RNF01: ganar espacio en pantallas pequeñas).
//   const { oculto } = useScrollDirection({ umbral: 12, margenSuperior: 56 })
export function useScrollDirection({ umbral = 12, margenSuperior = 56 } = {}) {
  const oculto = ref(false)
  let ultimoY = 0
  let pendiente = false

  function revisar() {
    pendiente = false
    const y = Math.max(0, window.scrollY)
    const alFinal = window.innerHeight + y >= document.documentElement.scrollHeight - 4

    if (y <= margenSuperior || alFinal) {
      oculto.value = false
    } else if (Math.abs(y - ultimoY) >= umbral) {
      oculto.value = y > ultimoY
    }
    if (Math.abs(y - ultimoY) >= umbral || y <= margenSuperior) ultimoY = y
  }

  function alDesplazar() {
    if (pendiente) return
    pendiente = true
    window.requestAnimationFrame(revisar)
  }

  // Un toque o foco en la barra la mantiene visible (accesibilidad con teclado).
  function mostrar() { oculto.value = false }

  onMounted(() => {
    ultimoY = window.scrollY
    window.addEventListener('scroll', alDesplazar, { passive: true })
  })
  onUnmounted(() => window.removeEventListener('scroll', alDesplazar))

  return { oculto, mostrar }
}
