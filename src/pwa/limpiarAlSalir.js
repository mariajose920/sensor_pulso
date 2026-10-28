// RNF03: al cerrar sesión se borra lo que la app guardó en el celular (mediciones vistas)
// y las lecciones en caché, para no dejar datos de salud en un dispositivo compartido.
import { supabase } from '../services/supabase.js'
import { borrarMedicionesVistas } from './medicionesOffline.js'

export async function limpiarDatosLocales() {
  await borrarMedicionesVistas()
  if (typeof caches !== 'undefined') {
    try { await caches.delete('lecciones') } catch { /* sin acceso a la caché */ }
  }
}

supabase.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_OUT') limpiarDatosLocales()
})
