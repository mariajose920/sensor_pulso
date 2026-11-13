/**
 * sensor_pulso · Enlace para compartir una medición pública (RF35)
 *
 * Funciones puras (sin red) para armar, validar y compartir el enlace.
 * El enlace usa `token_enlace` de la publicación: 12 bytes aleatorios en hexadecimal (24 caracteres).
 */

export const RUTA_PUBLICA = '/publica'

const TOKEN_RE = /^[0-9a-f]{24}$/

/** ¿Tiene el formato de un token de publicación? Evita consultar la base con texto cualquiera. */
export function esTokenValido(token) {
  return typeof token === 'string' && TOKEN_RE.test(token)
}

/** URL completa del enlace. `origen` es, por ejemplo, window.location.origin. */
export function construirEnlace(token, origen) {
  if (!esTokenValido(token)) return ''
  const base = String(origen || '').replace(/\/+$/, '')
  return `${base}${RUTA_PUBLICA}/${token}`
}

/** Saca el token de un enlace pegado completo o de un token suelto; devuelve '' si no hay uno válido. */
export function extraerToken(texto) {
  const t = String(texto || '').trim().toLowerCase()
  if (esTokenValido(t)) return t
  const m = t.match(/\/publica\/([0-9a-f]{24})(?:[/?#]|$)/)
  return m ? m[1] : ''
}

/**
 * Comparte el enlace: usa el menú de compartir del dispositivo si existe y, si no, lo copia al portapapeles.
 * @returns {Promise<'compartido'|'copiado'|'cancelado'|'manual'>}
 *   'manual' = no se pudo ni compartir ni copiar; la pantalla debe mostrar el enlace para copiarlo a mano.
 */
export async function compartirEnlace({ url, titulo = 'Medición pública' }, nav = globalThis.navigator) {
  if (!url) return 'manual'
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ title: titulo, text: 'Medición pública anónima de sensor_pulso', url })
      return 'compartido'
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelado'
      // si compartir falla por otra razón, se intenta copiar
    }
  }
  if (nav && nav.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(url)
      return 'copiado'
    } catch { /* sin permiso para copiar */ }
  }
  return 'manual'
}

const ACTIVIDADES = {
  reposo: 'Reposo',
  sentado: 'Sentado activo',
  caminata: 'Caminata',
  ejercicio_moderado: 'Ejercicio moderado',
  ejercicio_intenso: 'Ejercicio intenso',
  post_ejercicio: 'Recuperación'
}

/**
 * Convierte una fila de la vista `galeria` en lo que muestra la página pública.
 * No toma ningún campo que identifique a la persona.
 */
export function mapearPublicacion(fila) {
  if (!fila) return null
  return {
    token: fila.token_enlace,
    titulo: fila.titulo || 'Medición pública',
    actividad: ACTIVIDADES[fila.actividad] || 'Sin actividad indicada',
    rangoEdad: fila.rango_edad,
    ritmo: fila.ritmo || null,
    calidad: fila.calidad || null,
    bpm: fila.bpm_promedio == null ? null : Number(fila.bpm_promedio),
    spo2: fila.spo2_promedio == null ? null : Number(fila.spo2_promedio),
    dentroDeRango: typeof fila.dentro_de_rango === 'boolean' ? fila.dentro_de_rango : null,
    creadaEn: fila.creada_en || null
  }
}
