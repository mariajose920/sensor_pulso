// Clave de cifrado de la ficha del paciente para el DESARROLLO LOCAL (RF116).
//
// La ficha de salud se cifra en el servidor y necesita `CLAVE_CIFRADO_CAMPOS`. Si falta, el servidor se niega a cifrar
// (falla cerrado) y la ficha solo queda en el dispositivo: se pierde al cerrar la sesión. En el equipo de desarrollo
// esa variable casi nunca está, así que al iniciar `npm run dev` se crea una clave aleatoria y se guarda en `.env.local`
// (archivo que NO se sube a git) para que siga siendo la misma en cada arranque y la ficha se pueda volver a leer.
//
// Solo aplica al servidor de desarrollo. En producción (Vercel) la clave sale de las variables de entorno del proyecto y
// aquí nunca se genera nada: si falta, el servidor sigue negándose a cifrar.
import { randomBytes } from 'node:crypto'
import { existsSync, readFileSync, appendFileSync } from 'node:fs'

export const ENCABEZADO_CLAVE_LOCAL = '# Clave de cifrado SOLO para desarrollo local (la crea `npm run dev` si falta).'

/** ¿Ya hay una clave de cifrado utilizable en el entorno? */
export function hayClaveDeCifrado(env) {
  const base = String(env?.CLAVE_CIFRADO_CAMPOS || '')
  const v1 = String(env?.SALUD_ENCRYPTION_KEY_V1 || '')
  return base.length >= 16 || v1.length >= 16
}

/**
 * Si estamos en desarrollo y no hay clave, genera una, la guarda en `.env.local` y la deja en `env` y `process.env`.
 * @returns {{ generada: boolean, motivo: string }}
 */
export function asegurarClaveCifradoLocal({ env, rutaEnvLocal, esDesarrollo, destino = process.env, crearClave = () => randomBytes(32).toString('base64') }) {
  if (!esDesarrollo) return { generada: false, motivo: 'no es el servidor de desarrollo' }
  if (hayClaveDeCifrado(env)) return { generada: false, motivo: 'ya hay una clave' }
  // En Vercel o con NODE_ENV=production nunca se inventa una clave
  if (destino.VERCEL || destino.NODE_ENV === 'production') return { generada: false, motivo: 'entorno de producción' }

  const clave = crearClave()
  let previo = ''
  try { previo = existsSync(rutaEnvLocal) ? readFileSync(rutaEnvLocal, 'utf8') : '' } catch { previo = '' }
  const salto = previo && !previo.endsWith('\n') ? '\n' : ''
  appendFileSync(rutaEnvLocal, `${salto}${ENCABEZADO_CLAVE_LOCAL}\n# Los datos de salud cifrados desde este equipo solo se pueden leer con esta clave: no la borres.\nCLAVE_CIFRADO_CAMPOS=${clave}\n`)
  env.CLAVE_CIFRADO_CAMPOS = clave
  destino.CLAVE_CIFRADO_CAMPOS = clave
  return { generada: true, motivo: 'se creó una clave local' }
}
