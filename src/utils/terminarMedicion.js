/**
 * «Terminar» la medición de un canal (RF111) y decidir si se guarda (RF30) y si se publica (RF31, RF57, RF98)
 *
 * Funciones puras (sin Vue, sin red): se prueban con Node (scripts/test-terminar-medicion.mjs).
 * Reutilizan las reglas que ya existen y no inventan otras nuevas:
 *  - Guardar: servicios/medicionesService.guardarMedicion → utils/medicion.construirMedicion (RF30, RF16).
 *  - Publicar (RF31): solo con sesión; el profesor, solo con el permiso `publicar_galeria` de RF98;
 *    el administrador siempre (la base lo aplica igual en `publicar_medicion` / `tiene_permiso`).
 *  - Publicar (RF57): la publicación es anónima. Solo salen BPM, SpO₂, ritmo, calidad y rango de edad.
 *  - Solo se publican mediciones del sensor (la base rechaza las del simulador).
 *  - El consentimiento informado que firma el paciente de un canal adicional (RF04) cubre la medición
 *    con fines educativos, pero NO menciona publicar. Por eso, mientras eso no cambie, esas mediciones
 *    se guardan pero no se ofrecen para publicar.
 */
import { calcularEdad } from './edad.js'
import { evaluarComparacionRango } from './comparacionRangos.js'
import { explicarCalidad } from './explicacionCalidad.js'
import { MENSAJES_GUARDADO, ETIQUETAS_RITMO } from './medicion.js'

/** Permiso del profesor (RF98) que habilita publicar. */
export const PERMISO_PUBLICAR = 'publicar_galeria'

/**
 * ¿El consentimiento que firma el paciente de un canal adicional incluye publicar su medición?
 * Hoy no: el texto (consentimientos_version / CONSENTIMIENTO_BASE) habla solo de fines educativos.
 * Si algún día el consentimiento lo incluye, basta con cambiar esta constante.
 */
export const CONSENTIMIENTO_PACIENTE_INCLUYE_PUBLICAR = false

export const MENSAJES_TERMINAR = {
  sesion_demo:
    'Esta es una sesión de demostración y no está conectada a la base de datos: la medición no se puede guardar. ' +
    'Inicia una sesión de medición real para poder guardarla.',
  sin_sesion: MENSAJES_GUARDADO.sin_sesion,
  sin_datos: 'Todavía no hay una medición con BPM válido para guardar. Puedes elegir «Medir de nuevo».',
  guardada: 'Medición guardada.',
  guardada_publicada: 'Medición guardada y publicada.',
  no_guardada: 'Medición no guardada. No se envió nada a la base de datos.',
  pendiente: MENSAJES_GUARDADO.conexion,
  publicar_simulador: 'No se ofrece publicar: la medición viene del simulador y solo se publican las del sensor.',
  publicar_paciente:
    'No se ofrece publicar: el consentimiento que firmó esta persona cubre la medición con fines educativos, ' +
    'pero no incluye publicarla. Se puede guardar.',
  publicar_sin_id: 'La medición se guardó, pero no se pudo publicar porque no se obtuvo su identificador. Intenta publicarla más tarde.',
  publicar_pendiente: 'La medición quedó guardada en este dispositivo y no se publicó porque no hay conexión.',
  publicar_sin_permiso: 'La medición se guardó, pero tu cuenta no tiene permiso para publicar.',
  publicar_consentimiento: 'La medición se guardó, pero para publicar necesitas un consentimiento informado vigente en tu cuenta.',
  publicar_sin_sesion: 'La medición se guardó, pero para publicar necesitas iniciar sesión.',
  publicar_conexion: 'La medición se guardó, pero no se pudo publicar: no hay conexión. Inténtalo más tarde.',
  publicar_no_sensor: 'La medición se guardó, pero solo se publican las mediciones hechas con el sensor.',
  publicar_generico: 'La medición se guardó, pero no se pudo publicar. Intenta de nuevo más tarde.'
}

// ───────────────────────────── Reglas de publicación ─────────────────────────────

/**
 * Regla por cuenta: ¿esta persona puede publicar? (RF31 + RF98)
 * @param {{haySesion:boolean, esAdmin?:boolean, rol?:string, permisos?:object|null}} e
 * @returns {{puede:boolean, codigo:'ok'|'sin_sesion'|'sin_permiso'}}
 */
export function puedePublicarPorCuenta({ haySesion, esAdmin = false, rol = 'usuario', permisos = null } = {}) {
  if (!haySesion) return { puede: false, codigo: 'sin_sesion' }
  if (esAdmin || rol === 'admin') return { puede: true, codigo: 'ok' }
  if (rol === 'profesor') {
    return permisos && permisos[PERMISO_PUBLICAR] === true
      ? { puede: true, codigo: 'ok' }
      : { puede: false, codigo: 'sin_permiso' }
  }
  return { puede: true, codigo: 'ok' } // usuario/estudiante con sesión (RF31)
}

/**
 * ¿Se pregunta por publicar esta medición en concreto?
 * @param {{haySesion:boolean, esAdmin?:boolean, rol?:string, permisos?:object|null,
 *          fuente?:string, pacienteConConsentimientoPropio?:boolean}} e
 * @returns {{puede:boolean, preguntar:boolean, codigo:string, nota:string|null}}
 *   `nota` solo se llena cuando la persona SÍ tendría permiso pero esta medición no se puede publicar
 *   (sin permiso o sin sesión no se muestra nada: la pregunta simplemente no aparece).
 */
export function evaluarPublicacion(e = {}) {
  const cuenta = puedePublicarPorCuenta(e)
  if (!cuenta.puede) return { puede: false, preguntar: false, codigo: cuenta.codigo, nota: null }
  if ((e.fuente || 'sensor') !== 'sensor') {
    return { puede: false, preguntar: false, codigo: 'simulador', nota: MENSAJES_TERMINAR.publicar_simulador }
  }
  if (e.pacienteConConsentimientoPropio && !CONSENTIMIENTO_PACIENTE_INCLUYE_PUBLICAR) {
    return { puede: false, preguntar: false, codigo: 'paciente_sin_consentimiento_publicar', nota: MENSAJES_TERMINAR.publicar_paciente }
  }
  return { puede: true, preguntar: true, codigo: 'ok', nota: null }
}

/**
 * ¿Se puede guardar esta medición ahora?
 * @param {{haySesion:boolean, sesionReal:boolean, bpm:number|null, calidad?:string|null}} e
 * @returns {{puede:boolean, codigo:string|null, mensaje:string|null}}
 */
export function evaluarGuardado({ haySesion, sesionReal, bpm, calidad = null } = {}) {
  if (!haySesion) return { puede: false, codigo: 'sin_sesion', mensaje: MENSAJES_TERMINAR.sin_sesion }
  if (!sesionReal) return { puede: false, codigo: 'sesion_demo', mensaje: MENSAJES_TERMINAR.sesion_demo }
  if (!(Number(bpm) > 0)) return { puede: false, codigo: 'sin_datos', mensaje: MENSAJES_TERMINAR.sin_datos }
  if (calidad === 'mala') return { puede: false, codigo: 'calidad_mala', mensaje: MENSAJES_GUARDADO.calidad_mala }
  return { puede: true, codigo: null, mensaje: null }
}

/** Preguntas que se hacen, en orden: nunca «publicar» sin haber elegido guardar. */
export function preguntasATerminar({ guardado, publicacion }) {
  if (!guardado?.puede) return []
  return publicacion?.preguntar ? ['guardar', 'publicar'] : ['guardar']
}

// ───────────────────────────── Paciente y registro a guardar ─────────────────────────────

/**
 * Datos del paciente de un canal. Siempre sale de la ficha DEL CANAL si existe (canal agregado con
 * «Agregar canal»); solo si el canal no tiene ficha propia se usa la de la cuenta (canal principal).
 * @param {{fichaCanal?:object|null, fichaCuenta?:object|null, declaracionIdCanal?:string|null,
 *          nombreCuenta?:string, hoy?:Date}} e
 */
export function contextoPaciente({ fichaCanal = null, fichaCuenta = null, declaracionIdCanal = null, nombreCuenta = '', hoy = new Date() } = {}) {
  const propia = Boolean(fichaCanal)
  const f = propia ? fichaCanal : (fichaCuenta || {})
  const edadFecha = f.fechaNacimiento ? calcularEdad(f.fechaNacimiento, hoy) : null
  const edadNum = Number(f.edad)
  return {
    // true = paciente que firmó su propio consentimiento al agregar el canal (no es la cuenta)
    consentimientoPropio: propia,
    nombre: (f.nombre || (propia ? '' : nombreCuenta) || '').trim(),
    edad: edadFecha ?? (Number.isFinite(edadNum) && edadNum > 0 ? edadNum : null),
    actividad: f.actividadPrevia || f.actividadNombre || 'reposo',
    declaracionId: propia ? (declaracionIdCanal || null) : (f.id || null)
  }
}

export function formatearDuracion(segundos) {
  const s = Math.max(0, Math.round(Number(segundos) || 0))
  if (s < 60) return `${s} s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m} min ${String(r).padStart(2, '0')} s`
}

export function duracionSegundos(inicio, fin) {
  const a = inicio ? new Date(inicio).getTime() : NaN
  const b = fin ? new Date(fin).getTime() : NaN
  if (!Number.isFinite(a) || !Number.isFinite(b) || b < a) return 0
  return Math.round((b - a) / 1000)
}

/**
 * Arma lo que se muestra en el diálogo y lo que recibe `guardarMedicion` para un canal terminado.
 * @param {{canal:number, paciente:object, metricas:object, calidadDispositivo?:string|null, fuente?:string,
 *          sesionId?:string|null, inicio?:Date|number|string|null, fin?:Date|number|string|null, idCliente?:string}} e
 */
export function armarRegistroTerminado({
  canal, paciente = {}, metricas = {}, calidadDispositivo = null, fuente = 'sensor',
  sesionId = null, inicio = null, fin = null, idCliente = undefined
} = {}) {
  const m = metricas || {}
  const bpm = Number.isFinite(m.bpm) && m.bpm > 0 ? m.bpm : null
  const spo2 = Number.isFinite(m.spo2) && m.spo2 > 0 ? m.spo2 : null
  const calidad = m.ruido?.nivel || (['buena', 'regular', 'mala'].includes(calidadDispositivo) ? calidadDispositivo : null)
  const aviso = explicarCalidad(calidad, m.ruido?.causas || [])

  let dentroDeRango = null
  if (bpm) {
    dentroDeRango = evaluarComparacionRango({
      bpm, spo2, edad: paciente.edad || 25, actividad: paciente.actividad || 'reposo'
    }).dentroDeRango
    if (typeof dentroDeRango !== 'boolean') dentroDeRango = null
  }

  const duracionS = duracionSegundos(inicio, fin)
  return {
    resumen: {
      canal,
      paciente: paciente.nombre || '',
      bpm,
      spo2,
      duracionS,
      duracionTexto: formatearDuracion(duracionS),
      calidad,
      ritmo: m.ritmo?.clase || null
    },
    // Es un paciente con ficha y consentimiento propios (no la cuenta): afecta a la publicación
    pacienteConConsentimientoPropio: Boolean(paciente.consentimientoPropio),
    fuente,
    datos: {
      idCliente,
      fuente,
      canal,
      sesionId: sesionId || undefined,
      bpm,
      spo2,
      rmssd: m.hrv?.rmssd ?? null,
      sdnn: m.hrv?.sdnn ?? null,
      ritmo: m.ritmo?.clase || null,
      explicacionRitmo: m.ritmo?.explicacion || null,
      calidad,
      causaCalidad: aviso?.causaGuardable || null,
      declaracionId: paciente.declaracionId || null,
      edad: paciente.edad || null,
      dentroDeRango,
      inicio: inicio ? new Date(inicio) : null,
      fin: fin ? new Date(fin) : null
    }
  }
}

// ───────────────────────────── Anonimización (RF57) ─────────────────────────────

/** Mismo corte que `public.rango_de_edad()` de la base de datos. */
export function rangoDeEdad(edad) {
  const e = Number.isFinite(Number(edad)) && Number(edad) > 0 ? Number(edad) : 30 // la base usa 30 si falta
  if (e < 18) return '<18'
  if (e < 25) return '18-24'
  if (e < 35) return '25-34'
  if (e < 50) return '35-49'
  return '50+'
}

/**
 * Vista previa de lo que verá cualquier persona al publicar (RF57): solo valores no identificativos.
 * No incluye nombre, ficha, fecha de nacimiento, edad exacta ni la cuenta.
 */
export function vistaPreviaPublica(registro) {
  const r = registro?.resumen || {}
  const d = registro?.datos || {}
  const campos = []
  if (r.bpm) campos.push({ etiqueta: 'Pulso', valor: `${Math.round(r.bpm)} BPM` })
  if (r.spo2) campos.push({ etiqueta: 'SpO₂', valor: `${r.spo2} %` })
  if (r.ritmo) campos.push({ etiqueta: 'Ritmo', valor: ETIQUETAS_RITMO[r.ritmo] || r.ritmo })
  if (r.calidad) campos.push({ etiqueta: 'Calidad de la señal', valor: r.calidad })
  campos.push({ etiqueta: 'Rango de edad', valor: rangoDeEdad(d.edad) })
  return { campos, excluidos: ['nombre', 'ficha del paciente', 'edad exacta', 'cuenta de quien midió'] }
}

/** Comprobación de seguridad: ningún valor de la vista previa contiene el nombre del paciente. */
export function vistaPreviaSinDatosIdentificables(vista, nombre) {
  const n = String(nombre || '').trim().toLowerCase()
  if (!n) return true
  return !vista.campos.some(c => `${c.etiqueta} ${c.valor}`.toLowerCase().includes(n))
}

// ───────────────────────────── Mensajes de resultado y errores ─────────────────────────────

/** Mensaje de resultado de guardar (+ publicar). */
export function mensajeResultado({ guardada, publicada = false, pendiente = false, motivoPublicacion = null }) {
  if (!guardada) return MENSAJES_TERMINAR.no_guardada
  if (pendiente) return MENSAJES_TERMINAR.pendiente
  if (publicada) return MENSAJES_TERMINAR.guardada_publicada
  return motivoPublicacion || MENSAJES_TERMINAR.guardada
}

/** Estado corto para la tarjeta del canal. */
export function estadoParaTarjeta(estado) {
  switch (estado) {
    case 'guardada_publicada': return 'Guardada y publicada'
    case 'guardada': return 'Guardada'
    case 'pendiente': return 'Guardada en este dispositivo'
    case 'no_guardada': return 'No guardada'
    default: return 'Pendiente de decidir si se guarda'
  }
}

/** Traduce el error de `publicar_medicion` (RPC) a un motivo entendible. */
export function clasificarErrorPublicacion(error) {
  if (!error) return 'generico'
  const texto = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  const codigo = String(error.code || '')
  if (texto.includes('requiere sesi')) return 'sin_sesion'
  if (texto.includes('no tiene permiso')) return 'sin_permiso'
  if (texto.includes('consentimiento')) return 'consentimiento'
  if (texto.includes('solo se publican mediciones de sensor')) return 'no_sensor'
  if (codigo === '42501' || texto.includes('row-level security') || texto.includes('permission denied')) return 'sin_permiso'
  if (error.name === 'TypeError' || texto.includes('failed to fetch') || texto.includes('networkerror')
    || texto.includes('network request failed') || texto.includes('load failed')) return 'conexion'
  return 'generico'
}

export function mensajeErrorPublicacion(motivo) {
  return MENSAJES_TERMINAR[`publicar_${motivo}`] || MENSAJES_TERMINAR.publicar_generico
}
