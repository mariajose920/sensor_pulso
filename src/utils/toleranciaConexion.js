/**
 * Tolerancia a huecos cortos de la telemetría WiFi
 *
 * El ESP32 envía cada medición por HTTPS y algunos envíos tardan varios segundos; además el servidor puede
 * contestar «desconectado» desde una instancia sin datos recientes. Un hueco así no es una desconexión real:
 * la pantalla debe seguir mostrando los canales y el estado «conectado» durante un tiempo razonable.
 *
 * Datos puros (sin pantalla ni red) para poder probarlos con Node.
 */

/** Tiempo sin datos nuevos tras el cual SÍ se considera perdida la conexión (milisegundos) */
export const TOLERANCIA_SIN_DATOS_MS = 10000

/** ¿La respuesta del servidor es más vieja que lo que ya se está mostrando? (se ignora para no retroceder) */
export function esRespuestaVieja(ultimoContactoMostrado, ultimoContactoRespuesta) {
  if (!ultimoContactoMostrado || !ultimoContactoRespuesta) return false
  const a = Date.parse(ultimoContactoMostrado)
  const b = Date.parse(ultimoContactoRespuesta)
  if (!Number.isFinite(a) || !Number.isFinite(b)) return false
  return b < a
}

/**
 * Decide qué hacer con una respuesta del servidor.
 * @param {object} p
 * @param {boolean} p.conectadoAhora   estado que se muestra hoy
 * @param {number|null} p.ultimoOkMs   Date.now() de la última vez que el servidor dijo «conectado» (o null)
 * @param {number} p.ahoraMs           Date.now()
 * @param {boolean|null} p.servidorConectado  `conectado` de la respuesta (null si la consulta falló)
 * @param {number} [p.tolerancia]
 * @returns {'aplicar'|'mantener'|'perder'}
 *   aplicar  → mostrar lo que dice el servidor (hay datos nuevos)
 *   mantener → conservar canales y «conectado» (hueco corto)
 *   perder   → pasar a desconectado y vaciar canales
 */
export function decidirAnteRespuesta({ conectadoAhora, ultimoOkMs, ahoraMs, servidorConectado, tolerancia = TOLERANCIA_SIN_DATOS_MS }) {
  if (servidorConectado === true) return 'aplicar'
  // El servidor dice «no conectado» (o la consulta falló)
  if (!conectadoAhora) return 'perder' // ya se mostraba desconectado: nada que conservar
  const sinDatosMs = ultimoOkMs == null ? Infinity : ahoraMs - ultimoOkMs
  return sinDatosMs < tolerancia ? 'mantener' : 'perder'
}
