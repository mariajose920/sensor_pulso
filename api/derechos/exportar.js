/**
 * POST /api/derechos/exportar (RF58, RF89 · ISO 27001 A.5.34)
 * Portabilidad: entrega al titular TODOS sus datos en un archivo JSON.
 *  - Exige sesión válida y trabaja siempre con la sesión de esa persona (la RLS decide qué es suyo).
 *  - La ficha de salud declarada se descifra aquí, en el servidor, porque el navegador no tiene claves.
 *  - Minimización: solo salen datos de la propia persona y solo los campos que le sirven; no salen
 *    banderas internas (es_admin, mfa_requerido), identificadores de otras personas ni la auditoría.
 *  - Queda registrada en la auditoría y como solicitud de portabilidad (lo hace exportar_mis_datos).
 */
import { descifrarSobre, ErrorClave } from '../_lib/cifradoSalud.js'
import { responder, verificarSesion } from '../_lib/sesion.js'

/** Campos del perfil que se entregan. Nada interno. */
const CAMPOS_PERFIL = ['correo', 'nombre', 'rol', 'creado_en', 'politica_version', 'politica_aceptada_en']

export function soloCampos(fila, campos) {
  if (!fila || typeof fila !== 'object') return null
  return Object.fromEntries(campos.filter(c => c in fila).map(c => [c, fila[c]]))
}

/** Pasa un bytea codificado en base64 al formato hexadecimal que lee descifrarSobre. */
export function base64AHex(b64) {
  return '\\x' + Buffer.from(String(b64 || ''), 'base64').toString('hex')
}

/** Quita de cada fila las columnas que identifican a la persona (ya se sabe que es suya) y las internas. */
function sinIdentificadores(filas) {
  return (Array.isArray(filas) ? filas : []).map(({ usuario_id, ...resto }) => resto)
}

export async function armarExportacion(crudo, { env = process.env } = {}) {
  const declaraciones = []
  let fichaNoDisponible = false
  for (const d of Array.isArray(crudo?.declaraciones) ? crudo.declaraciones : []) {
    let ficha = null
    try {
      ficha = await descifrarSobre(base64AHex(d.datos_cifrados_base64), { version: d.clave_version, env })
    } catch (err) {
      fichaNoDisponible = true
      if (!(err instanceof ErrorClave)) console.error('[exportar] Una ficha no pudo verificarse.')
    }
    declaraciones.push({ nombre: d.nombre, edad: d.edad, creado_en: d.creado_en, ficha_de_salud: ficha })
  }
  return {
    generado_en: crudo?.generado_en,
    aviso: 'Estos son tus datos en la plataforma sensor pulso (UNACH). Contiene datos de salud: guárdalo en un lugar seguro.',
    perfil: soloCampos(crudo?.perfil, CAMPOS_PERFIL),
    consentimientos: sinIdentificadores(crudo?.consentimientos),
    declaraciones_de_salud: declaraciones,
    ficha_no_disponible: fichaNoDisponible || undefined,
    mediciones: sinIdentificadores(crudo?.mediciones),
    alertas: sinIdentificadores(crudo?.alertas),
    comparaciones: sinIdentificadores(crudo?.comparaciones),
    progreso_de_lecciones: sinIdentificadores(crudo?.progreso),
    aulas: sinIdentificadores(crudo?.aulas),
    evaluaciones: sinIdentificadores(crudo?.evaluaciones),
    solicitudes_de_derechos: sinIdentificadores(crudo?.solicitudes)
  }
}

export function crearHandler({ verificar = verificarSesion, env = process.env } = {}) {
  return async function handler(req, res) {
    if (req.method !== 'POST') return responder(res, 405, { ok: false, error: 'Solo se acepta POST.' })
    const sesion = await verificar(req, env)
    if (!sesion) return responder(res, 401, { ok: false, error: 'Se requiere una sesión válida.' })

    const { data, error } = await sesion.db.rpc('exportar_mis_datos')
    if (error || !data) {
      console.error('[exportar] No se pudo reunir la información.')
      return responder(res, 500, { ok: false, error: 'No se pudieron reunir tus datos. Inténtalo más tarde.' })
    }
    const exportacion = await armarExportacion(data, { env })
    res.setHeader('Content-Disposition', 'attachment; filename="mis-datos-sensor-pulso.json"')
    return responder(res, 200, { ok: true, exportacion })
  }
}

export default crearHandler()
