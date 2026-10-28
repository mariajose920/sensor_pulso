import { ref, onMounted, onUnmounted } from 'vue'

// Devuelve un ref booleano que sigue una media query (por ejemplo, "(max-width: 640px)").
export function useMediaQuery(consulta) {
  const coincide = ref(false)
  let lista = null

  const actualizar = (e) => { coincide.value = e.matches }

  onMounted(() => {
    lista = window.matchMedia(consulta)
    coincide.value = lista.matches
    lista.addEventListener('change', actualizar)
  })

  onUnmounted(() => {
    if (lista) lista.removeEventListener('change', actualizar)
  })

  return coincide
}
