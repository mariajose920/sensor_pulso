/**
 * Aviso sobre el alojamiento de los datos fuera de Chile y su base legal.
 *
 * Es la única fuente del texto que se muestra en la política de privacidad, en el inicio de sesión, en el
 * consentimiento informado, en «Mis datos y derechos» y en el pie de página, y del documento «alojamiento»
 * de la tabla `documentos_legales` (supabase/migrations/20261122000100_rf95_aviso_alojamiento.sql).
 * Una prueba comprueba que el texto de la base y este archivo digan lo mismo.
 *
 * Solo se afirma lo que se sabe. Si cambia un proveedor o su región, hay que actualizar este archivo, la tabla
 * de proveedores (docs/iso27001/05-proveedores.md) y la política de privacidad.
 */

export const ALOJAMIENTO_VERSION = '1.1'
export const ALOJAMIENTO_REVISADO = '18 de noviembre de 2026'
export const ID_ANCLA_ALOJAMIENTO = 'alojamiento-datos'
export const RUTA_ALOJAMIENTO = `/privacidad#${ID_ANCLA_ALOJAMIENTO}`

export const PAIS_ALOJAMIENTO = 'Estados Unidos'

export const TITULO_ALOJAMIENTO = 'Tus datos se alojan fuera de Chile'

/** Frase corta para avisos compactos (inicio de sesión, consentimiento, pie de página). */
export const RESUMEN_CORTO =
  'Los servidores que los guardan y procesan están en Estados Unidos. Los proveedores los tratan por cuenta de la universidad y puedes retirar tu consentimiento cuando quieras.'

/** Lo que la persona acepta al marcar la casilla del inicio de sesión. */
export const FRASE_ACEPTACION = 'que mis datos se alojen fuera de Chile (Estados Unidos)'

/**
 * Proveedores que tratan datos. `confirmada` indica si la ubicación está comprobada (región contratada) o si es
 * la de la infraestructura general del proveedor; en ambos casos es fuera de Chile.
 */
export const PROVEEDORES = Object.freeze([
  Object.freeze({
    id: 'supabase',
    nombre: 'Supabase',
    funcion: 'Base de datos y autenticación',
    datos: 'Tu cuenta, tus mediciones, la ficha de salud que declaras, las aulas y el registro de auditoría.',
    ubicacion: 'Estados Unidos (AWS, región us-east-1)',
    confirmada: true,
    nota: 'La ficha de salud se guarda cifrada con una clave que Supabase no tiene.'
  }),
  Object.freeze({
    id: 'vercel',
    nombre: 'Vercel',
    funcion: 'Aloja la aplicación web y las funciones del servidor',
    datos: 'El tráfico de la web y las lecturas del sensor mientras viajan (siempre cifradas por HTTPS).',
    ubicacion: 'Estados Unidos (red global del proveedor)',
    confirmada: false,
    nota: ''
  }),
  Object.freeze({
    id: 'resend',
    nombre: 'Resend',
    funcion: 'Envía el correo de confirmación de la cuenta',
    datos: 'Tu correo institucional y tu nombre.',
    ubicacion: 'Estados Unidos (proveedor con sede allí)',
    confirmada: false,
    nota: ''
  }),
  Object.freeze({
    id: 'google',
    nombre: 'Google',
    funcion: 'Verifica tu identidad al iniciar sesión y envía las invitaciones a las aulas (Gmail)',
    datos: 'Tu correo institucional y, en las invitaciones, el nombre del aula y del profesor.',
    ubicacion: 'Estados Unidos (infraestructura global del proveedor)',
    confirmada: false,
    nota: ''
  })
])

/** Cómo se cuidan los datos aunque estén fuera de Chile. */
export const PROTECCIONES = Object.freeze([
  'Conexión cifrada (HTTPS) entre tu navegador, el sensor y los servidores.',
  'Cifrado en reposo en la base de datos y cifrado adicional de la ficha de salud: la clave está fuera del proveedor que guarda los datos.',
  'Reglas de acceso por fila: cada persona ve solo lo que le corresponde.',
  'Lo que se publica en la galería va anonimizado y con tu confirmación explícita.'
])

/** Por qué es posible alojar los datos fuera de Chile. */
export const BASE_LEGAL = Object.freeze([
  Object.freeze({
    titulo: 'Tu consentimiento expreso',
    texto:
      'Para iniciar sesión aceptas la política de privacidad y que tus datos se alojen fuera de Chile. Antes de medir, otorgas además el consentimiento informado. Ambos quedan registrados con su versión, fecha y hora, y puedes retirarlos cuando quieras desde «Mis datos y derechos».'
  }),
  Object.freeze({
    titulo: 'Proveedores que actúan por cuenta de la universidad',
    texto:
      'Supabase, Vercel, Resend y Google tratan los datos como encargados de la UNACH, solo para operar la plataforma y no para sus propios fines.'
  }),
  Object.freeze({
    titulo: 'Marco legal',
    texto:
      'El tratamiento se rige por la Ley N.º 19.628 sobre protección de la vida privada y por la Ley N.º 21.719 sobre protección y tratamiento de datos personales.'
  })
])

/** Qué puede hacer la persona. */
export const QUE_PUEDES_HACER = Object.freeze([
  'Retirar tu consentimiento en cualquier momento desde «Mis datos y derechos»; con eso se retiran tus mediciones publicadas.',
  'Descargar todos tus datos o pedir que se eliminen.',
  'Si no estás de acuerdo con que tus datos se alojen fuera de Chile, no inicies sesión; si ya lo hiciste, pide la eliminación de tus datos.'
])

/**
 * Texto plano del documento «alojamiento» de la tabla `documentos_legales`.
 * Debe coincidir exactamente con el que deja la migración del RF95.
 */
export function textoDocumento() {
  const proveedores = PROVEEDORES.map(p => `${p.nombre} (${p.funcion.toLowerCase()})`).join(', ')
  return [
    `Los datos se alojan fuera de Chile, en servidores de ${PAIS_ALOJAMIENTO}.`,
    `Los tratan: ${proveedores}. Supabase aloja la base de datos en AWS, región us-east-1.`,
    'La ficha de salud se guarda cifrada con una clave que el proveedor no tiene.',
    'Base legal: tu consentimiento expreso, que puedes retirar en cualquier momento desde «Mis datos y derechos»; los proveedores tratan los datos como encargados de la UNACH, solo para operar la plataforma.',
    'Marco legal: Ley N.º 19.628 y Ley N.º 21.719.',
    'Texto completo en la ruta /privacidad.'
  ].join(' ')
}
