/**
 * Enmascaramiento de datos personales (RF61).
 *
 * Reglas (sin dar pistas del largo real del dato):
 *   correo  -> a***@dominio.cl        (se deja el dominio: identifica a la institución, no a la persona)
 *   nombre  -> M*** J*** V***         (inicial de cada palabra)
 *   IP v4   -> 190.20.*.*             (se conserva la red, no el equipo)
 *   IP v6   -> 2800:3f0:*:*:*
 *   token   -> ****a1b2               (solo los 4 últimos)
 *
 * Son funciones puras: no tocan la base ni el navegador, por eso se pueden probar fácilmente.
 * El enmascaramiento es de PRESENTACIÓN (pantallas e informes). La protección de los datos en la base
 * la dan el cifrado, las reglas por fila (RLS) y la clasificación (RF55, RF56, RF116).
 */

export const MARCA = '***'

export const TIPOS_MASCARA = Object.freeze({
  CORREO: 'correo',
  NOMBRE: 'nombre',
  IP: 'ip',
  TOKEN: 'token',
  TEXTO: 'texto'
})

/**
 * Qué regla de enmascaramiento corresponde a cada columna marcada en el catálogo de clasificación
 * (tabla clasificacion_datos con enmascarar = true). Una prueba comprueba que ambas listas coincidan.
 */
export const MASCARA_POR_COLUMNA = Object.freeze({
  'perfiles.correo': TIPOS_MASCARA.CORREO,
  'perfiles.nombre': TIPOS_MASCARA.NOMBRE,
  'declaraciones_paciente.nombre': TIPOS_MASCARA.NOMBRE,
  'declaraciones_paciente.datos_cifrados': 'oculto',
  'invitaciones_aula.correo': TIPOS_MASCARA.CORREO,
  'dispositivos.token_hash': TIPOS_MASCARA.TOKEN,
  'auditoria.ip': TIPOS_MASCARA.IP,
  'intentos_login.correo': TIPOS_MASCARA.CORREO,
  'intentos_login.ip': TIPOS_MASCARA.IP,
  'bloqueos_cuenta.correo': TIPOS_MASCARA.CORREO,
  'bloqueos_cuenta.ip': TIPOS_MASCARA.IP,
  'admins_iniciales.correo': TIPOS_MASCARA.CORREO,
  'limites_peticiones.clave': TIPOS_MASCARA.TEXTO
})

const RE_CORREO = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g
const RE_IPV4 = /\b(\d{1,3})\.(\d{1,3})\.\d{1,3}\.\d{1,3}\b/g

function comoTexto(valor) {
  return valor === null || valor === undefined ? '' : String(valor).trim()
}

/** ana.perez@alu.unach.cl -> a***@alu.unach.cl */
export function enmascararCorreo(correo) {
  const texto = comoTexto(correo)
  if (!texto) return ''
  const arroba = texto.lastIndexOf('@')
  if (arroba < 1) return texto[0] + MARCA
  return texto[0] + MARCA + texto.slice(arroba)
}

/** María José Vilches -> M*** J*** V*** */
export function enmascararNombre(nombre) {
  const texto = comoTexto(nombre)
  if (!texto) return ''
  return texto
    .split(/\s+/)
    .slice(0, 4)
    .map(palabra => Array.from(palabra)[0] + MARCA)
    .join(' ')
}

/** 190.20.1.4 -> 190.20.*.*  ·  2800:3f0:1:2:3:4:5:6 -> 2800:3f0:*:*:*:*:*:* */
export function enmascararIp(ip) {
  const texto = comoTexto(ip)
  if (!texto) return ''
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(texto)) {
    const [a, b] = texto.split('.')
    return `${a}.${b}.*.*`
  }
  if (texto.includes(':')) {
    const grupos = texto.split(':')
    return grupos.map((g, i) => (i < 2 ? g : '*')).join(':')
  }
  return MARCA
}

/** a1b2c3d4e5 -> ****d4e5 */
export function enmascararToken(token) {
  const texto = comoTexto(token)
  if (!texto) return ''
  return texto.length > 8 ? `****${texto.slice(-4)}` : '****'
}

/** Enmascara los correos y las IP que aparezcan dentro de un texto libre. */
export function enmascararTextoLibre(texto) {
  const t = comoTexto(texto)
  if (!t) return ''
  return t
    .replace(RE_CORREO, c => enmascararCorreo(c))
    .replace(RE_IPV4, (_, a, b) => `${a}.${b}.*.*`)
}

/** Aplica la regla que corresponde al tipo de dato. */
export function enmascararPorTipo(valor, tipo) {
  switch (tipo) {
    case TIPOS_MASCARA.CORREO: return enmascararCorreo(valor)
    case TIPOS_MASCARA.NOMBRE: return enmascararNombre(valor)
    case TIPOS_MASCARA.IP: return enmascararIp(valor)
    case TIPOS_MASCARA.TOKEN: return enmascararToken(valor)
    default: return enmascararTextoLibre(valor)
  }
}

const CLAVES_NOMBRE_PERSONA = /^(nombre|actor_nombre|usuario_nombre|estudiante_nombre|profesor_nombre|titular_nombre)$/
const CLAVES_CORREO = /(^|_)(correo|email)$/

/**
 * Devuelve una copia del objeto con los datos personales enmascarados según el nombre de la clave
 * (correo, nombre de persona, IP) y los correos o IP que aparezcan dentro de cualquier texto.
 * No modifica el original.
 */
export function enmascararObjeto(valor, clave = '') {
  if (Array.isArray(valor)) return valor.map(v => enmascararObjeto(v, clave))
  if (valor && typeof valor === 'object') {
    return Object.fromEntries(Object.entries(valor).map(([k, v]) => [k, enmascararObjeto(v, k)]))
  }
  if (typeof valor !== 'string') return valor
  if (CLAVES_CORREO.test(clave)) return enmascararCorreo(valor)
  if (CLAVES_NOMBRE_PERSONA.test(clave)) return enmascararNombre(valor)
  if (clave === 'ip') return enmascararIp(valor)
  return enmascararTextoLibre(valor)
}

/** Texto para mostrar: el valor real si la persona está autorizada y lo reveló; si no, enmascarado. */
export function mostrarDato(valor, tipo, revelado = false) {
  if (valor === null || valor === undefined || valor === '') return ''
  return revelado ? String(valor) : enmascararPorTipo(valor, tipo)
}
