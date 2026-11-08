/**
 * Cifrado de los datos de salud declarados (RF116, ISO 27001 A.8.24). SOLO SERVIDOR.
 *
 * - AES-256-GCM (cifrado autenticado). Sobre binario: 'SPC' (3) + versión (1) + IV (12) + texto cifrado y etiqueta.
 * - La clave sale únicamente de variables de entorno del servidor. No hay clave por defecto: si falta,
 *   se lanza CLAVE_NO_CONFIGURADA y nada se cifra ni se descifra (falla cerrado).
 * - Está en `api/_lib` (el prefijo `_` evita que Vercel lo publique como ruta) y el navegador no lo importa.
 */

export const CABECERA = [0x53, 0x50, 0x43] // 'SPC'
export const LARGO_IV = 12
const LARGO_MINIMO = CABECERA.length + 1 + LARGO_IV + 16

export class ErrorClave extends Error {
  constructor(mensaje) { super(mensaje); this.codigo = 'CLAVE_NO_CONFIGURADA' }
}

export function versionActiva(env = process.env) {
  const n = Number(env.CLAVE_VERSION_ACTIVA)
  return Number.isInteger(n) && n >= 1 && n <= 255 ? n : 1
}

async function claveDe(version, env) {
  const propia = env[`SALUD_ENCRYPTION_KEY_V${version}`]
  const base = env.CLAVE_CIFRADO_CAMPOS
  const secreto = propia || (base ? (version > 1 ? `${base}_v${version}` : base) : '')
  if (!secreto || secreto.length < 16) {
    throw new ErrorClave('Falta la clave de cifrado en el servidor (CLAVE_CIFRADO_CAMPOS, mínimo 16 caracteres).')
  }
  const hash = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(secreto))
  return crypto.subtle.importKey('raw', hash, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt'])
}

export function aHex(bytes) {
  let s = '\\x'
  for (const b of bytes) s += b.toString(16).padStart(2, '0')
  return s
}

export function deHex(texto) {
  if (!texto || typeof texto !== 'string') return new Uint8Array(0)
  let limpio = texto.trim()
  if (limpio.startsWith('\\x')) limpio = limpio.slice(2)
  if (limpio.length % 2 !== 0 || /[^0-9a-f]/i.test(limpio)) return new Uint8Array(0)
  const bytes = new Uint8Array(limpio.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(limpio.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

export function esSobreCifrado(texto) {
  const b = deHex(texto)
  return b.length >= LARGO_MINIMO && CABECERA.every((c, i) => b[i] === c)
}

export function versionDeSobre(texto) {
  const b = deHex(texto)
  return esSobreCifrado(texto) ? (b[3] || 1) : 1
}

/** Cifra un objeto con la versión de clave activa (o la indicada). Devuelve { hex, version }. */
export async function cifrarFactores(factores, { version = null, env = process.env } = {}) {
  if (!factores || typeof factores !== 'object' || Array.isArray(factores)) throw new TypeError('Los factores deben ser un objeto.')
  const v = version || versionActiva(env)
  const clave = await claveDe(v, env)
  const iv = crypto.getRandomValues(new Uint8Array(LARGO_IV))
  const cifrado = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, clave, new TextEncoder().encode(JSON.stringify(factores))))
  const sobre = new Uint8Array(CABECERA.length + 1 + LARGO_IV + cifrado.length)
  sobre.set(CABECERA, 0)
  sobre[3] = v
  sobre.set(iv, 4)
  sobre.set(cifrado, 4 + LARGO_IV)
  return { hex: aHex(sobre), version: v }
}

/**
 * Descifra un sobre. Lanza si la clave falta (ErrorClave) o si el sobre fue alterado.
 * Un registro antiguo en texto plano (sin cabecera) se devuelve tal cual: no es secreto.
 */
export async function descifrarSobre(texto, { version = null, env = process.env } = {}) {
  const b = deHex(texto)
  if (b.length === 0) return {}
  if (!esSobreCifrado(texto)) return JSON.parse(new TextDecoder().decode(b))
  const v = version || b[3] || 1
  const clave = await claveDe(v, env)
  const plano = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: b.slice(4, 4 + LARGO_IV) }, clave, b.slice(4 + LARGO_IV))
  return JSON.parse(new TextDecoder().decode(plano))
}
