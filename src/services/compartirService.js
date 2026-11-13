/**
 * sensor_pulso · Compartir una medición pública mediante enlace (RF35)
 *
 * Lee solo la vista `galeria` (sin `autor_id` ni datos personales) y solo publicaciones vigentes:
 * si el titular retira la publicación (RF90), el enlace deja de funcionar.
 */

import { supabase } from './supabase'
import { esTokenValido, construirEnlace, mapearPublicacion } from '../utils/enlacePublico.js'

/**
 * Busca la publicación de un enlace.
 * @returns {Promise<{ok:true, publicacion:object} | {ok:false, motivo:'token_invalido'|'no_disponible'|'error'}>}
 */
export async function obtenerPublicacionPorToken(token) {
  if (!esTokenValido(token)) return { ok: false, motivo: 'token_invalido' }
  try {
    const { data, error } = await supabase
      .from('galeria')
      .select('token_enlace, titulo, actividad, rango_edad, ritmo, calidad, bpm_promedio, spo2_promedio, dentro_de_rango, creada_en')
      .eq('token_enlace', token)
      .maybeSingle()
    if (error) return { ok: false, motivo: 'error' }
    if (!data) return { ok: false, motivo: 'no_disponible' }
    return { ok: true, publicacion: mapearPublicacion(data) }
  } catch {
    return { ok: false, motivo: 'error' }
  }
}

/**
 * Enlace de una medición propia ya publicada. Si no está publicada (o fue retirada) no hay enlace.
 * @returns {Promise<{ok:true, token:string, url:string} | {ok:false, motivo:'sin_id'|'no_publicada'|'error'}>}
 */
export async function obtenerEnlaceDeMedicion(medicionId, origen = globalThis.location?.origin || '') {
  if (!medicionId) return { ok: false, motivo: 'sin_id' }
  try {
    const { data, error } = await supabase
      .from('publicaciones')
      .select('token_enlace')
      .eq('medicion_id', medicionId)
      .is('retirada_en', null)
      .maybeSingle()
    if (error) return { ok: false, motivo: 'error' }
    if (!data || !esTokenValido(data.token_enlace)) return { ok: false, motivo: 'no_publicada' }
    return { ok: true, token: data.token_enlace, url: construirEnlace(data.token_enlace, origen) }
  } catch {
    return { ok: false, motivo: 'error' }
  }
}
