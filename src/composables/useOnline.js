import { ref, onMounted, onUnmounted } from 'vue'

// Indica si el dispositivo tiene conexión a internet (se actualiza solo al perderla o recuperarla).
export function useOnline() {
  const enLinea = ref(true)
  const alConectar = () => { enLinea.value = true }
  const alDesconectar = () => { enLinea.value = false }

  onMounted(() => {
    enLinea.value = navigator.onLine
    window.addEventListener('online', alConectar)
    window.addEventListener('offline', alDesconectar)
  })
  onUnmounted(() => {
    window.removeEventListener('online', alConectar)
    window.removeEventListener('offline', alDesconectar)
  })

  return enLinea
}
