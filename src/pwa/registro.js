// RNF03: registra el service worker que permite instalar la app y usarla sin internet.
//
// Actualización: la versión nueva se descarga en segundo plano y se activa la próxima vez que se abre
// la app (no se recarga la pantalla en uso, para no cortar una medición en curso).
import { registerSW } from 'virtual:pwa-register'

export function registrarServiceWorker() {
  if (!('serviceWorker' in navigator)) return

  registerSW({
    immediate: true,
    onRegisteredSW(_url, registro) {
      // Busca versiones nuevas al abrir la app y cada hora mientras permanece abierta.
      if (!registro) return
      setInterval(() => { registro.update().catch(() => {}) }, 60 * 60 * 1000)
    },
    onRegisterError(error) {
      console.warn('No se pudo registrar el service worker:', error)
    }
  })
}
