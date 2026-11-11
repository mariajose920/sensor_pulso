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
  publicar_falta_confirmacion: 'La medición se guardó en privado, pero ninguna medición se publica sin una confirmación adicional y explícita del titular.',
  publicar_generico: 'La medición se guardó, pero no se pudo publicar. Intenta de nuevo más tarde.'
}

// ───────────────────────────── Reglas de publicación ─────────────────────────────

/** Motivo (frase que sigue a «porque») por el que NO se puede publicar. Códigos estables. */
export const RAZONES_NO_PUBLICAR = {
  sin_sesion: 'necesitas iniciar sesión',
  sin_permiso: 'tu cuenta de profesor no tiene el permiso de publicar (lo da el administrador)',
  permiso_no_consultado: 'no se pudo consultar tu permiso (revisa tu conexión)',
  simulador: 'la medición viene del simulador (solo se publican las del sensor)',
  sin_consentimiento: 'no tienes un consentimiento informado vigente'
}
const SUFIJO_DESPUES = ' Puedes intentar publicarla después desde el historial.'

/** «No se ofreció publicar porque …» para un código de RAZONES_NO_PUBLICAR (null si el código no es un motivo). */
export function motivoNoPublicar(codigo) {
  const razon = RAZONES_NO_PUBLICAR[codigo]
  if (!razon) return null
  return `No se ofreció publicar porque ${razon}.${codigo === 'permiso_no_consultado' ? SUFIJO_DESPUES : ''}`
}

/** Línea informativa del primer paso: ¿se podrá publicar? y, si no, por qué. */
export function lineaInformativaPublicar(publicacion) {
  if (publicacion?.preguntar) {
    return { disponible: true, texto: 'Publicar: disponible. Después de guardar podrás elegir si la publicas (siempre anónima).' }
  }
  const razon = RAZONES_NO_PUBLICAR[publicacion?.codigo]
  if (!razon) return { disponible: false, texto: '' }
  return {
    disponible: false,
    texto: `Publicar: no disponible porque ${razon}.${publicacion.codigo === 'permiso_no_consultado' ? SUFIJO_DESPUES : ''}`
  }
}

/**
 * Regla por cuenta: ¿esta persona puede publicar? (RF31 + RF98)
 * `sesionReal` false = la sesión guardada en el navegador ya no existe en la base (la base exige sesión).
 * `permisoConsultado` false = falló la consulta del permiso del profesor (no es lo mismo que «no tiene permiso»).
 * @param {{haySesion:boolean, sesionReal?:boolean|null, esAdmin?:boolean, rol?:string, permisos?:object|null,
 *          permisoConsultado?:boolean}} e
 * @returns {{puede:boolean, codigo:'ok'|'sin_sesion'|'sin_permiso'|'permiso_no_consultado'}}
 */
export function puedePublicarPorCuenta({
  haySesion, sesionReal = null, esAdmin = false, rol = 'usuario', permisos = null, permisoConsultado = true
} = {}) {
  if (!haySesion || sesionReal === false) return { puede: false, codigo: 'sin_sesion' }
  if (esAdmin || rol === 'admin') return { puede: true, codigo: 'ok' }
  if (rol === 'profesor') {
    if (permisoConsultado === false) return { puede: false, codigo: 'permiso_no_consultado' }
    return permisos && permisos[PERMISO_PUBLICAR] === true
      ? { puede: true, codigo: 'ok' }
      : { puede: false, codigo: 'sin_permiso' }
  }
  return { puede: true, codigo: 'ok' } // usuario/estudiante con sesión (RF31)
}

/**
 * Regla por cuenta: ¿esta persona puede conectar el sensor y realizar mediciones? (RF31 + RF98)
 * Reutiliza el control de sesión y el permiso docente `publicar_galeria`.
 */
export function puedeMedirConSensorPorCuenta({
  haySesion, sesionReal = null, esAdmin = false, rol = 'usuario', permisos = null, permisoConsultado = true
} = {}) {
  return puedePublicarPorCuenta({ haySesion, sesionReal, esAdmin, rol, permisos, permisoConsultado })
}

/**
 * ¿Se pregunta por publicar esta medición en concreto?
 * `consentimientoVigente`: true / false / null (null = no se pudo comprobar; entonces decide la base al publicar).
 * @param {{haySesion:boolean, sesionReal?:boolean|null, esAdmin?:boolean, rol?:string, permisos?:object|null,
 *          permisoConsultado?:boolean, consentimientoVigente?:boolean|null,
 *          fuente?:string, pacienteConConsentimientoPropio?:boolean}} e
 * @returns {{puede:boolean, preguntar:boolean, codigo:string, nota:string|null, requiereAutorizacionPaciente?:boolean}}
 *   `nota` = «No se ofreció publicar porque …» siempre que no se pueda (con el motivo concreto).
 */
export function evaluarPublicacion(e = {}) {
  const cuenta = puedePublicarPorCuenta(e)
  const no = (codigo) => ({ puede: false, preguntar: false, codigo, nota: motivoNoPublicar(codigo) })
  if (cuenta.codigo === 'sin_sesion') return no('sin_sesion')
  // Si la medición es del simulador, eso se explica primero: no se arregla con permisos
  if ((e.fuente || 'sensor') !== 'sensor') return no('simulador')
  if (!cuenta.puede) return no(cuenta.codigo)
  if (e.consentimientoVigente === false) return no('sin_consentimiento')
  // El consentimiento de un paciente agregado con «Agregar canal» no menciona publicar: quien mide confirma, al publicar,
  // que esa persona lo autorizó (casilla obligatoria en el diálogo). Quien mide su propia ficha no la necesita.
  const requiereAutorizacionPaciente = Boolean(e.pacienteConConsentimientoPropio) && !CONSENTIMIENTO_PACIENTE_INCLUYE_PUBLICAR
  return { puede: true, preguntar: true, codigo: 'ok', nota: null, requiereAutorizacionPaciente }
}

/**
 * Historial: qué se ofrece para una medición ya guardada.
 * @param {{id?:string, usuarioId?:string|null, fuente?:string|null, fin?:string|null, publica?:boolean|null}} medicion
 * @param {object} cuenta  mismos campos que evaluarPublicacion (haySesion, esAdmin, rol, permisos, …) y `usuarioActualId`
 * @returns {{accion:'publicar'|'retirar'|null, motivo:string|null, codigo:string}}
 *   accion null y motivo null = no aplica (ajena, simulador, sin cerrar o vista sin conexión): no se muestra nada.
 */
export function accionHistorial(medicion = {}, cuenta = {}) {
  const ninguna = (codigo) => ({ accion: null, motivo: null, codigo })
  if (!cuenta.usuarioActualId || !medicion.usuarioId || medicion.usuarioId !== cuenta.usuarioActualId) return ninguna('ajena')
  if (medicion.publica === true) {
    return cuenta.haySesion && cuenta.sesionReal !== false ? { accion: 'retirar', motivo: null, codigo: 'publicada' } : ninguna('sin_sesion')
  }
  if (medicion.fuente !== 'sensor') return ninguna('no_sensor')
  if (!medicion.fin) return ninguna('sin_cerrar')
  const ev = evaluarPublicacion({ ...cuenta, fuente: 'sensor', pacienteConConsentimientoPropio: false })
  if (ev.preguntar) return { accion: 'publicar', motivo: null, codigo: 'ok' }
  const razon = RAZONES_NO_PUBLICAR[ev.codigo]
  const motivo = razon
    ? `No se puede publicar porque ${razon}.${ev.codigo === 'permiso_no_consultado' ? ' Inténtalo de nuevo cuando tengas conexión.' : ''}`
    : null
  return { accion: null, motivo, codigo: ev.codigo }
}

/**
 * ¿Se puede guardar esta medición ahora?
 * @param {{haySesion:boolean, sesionReal:boolean, bpm:number|null, calidad?:string|null}} e
 * @returns {{puede:boolean, codigo:string|null, mensaje:string|null}}
 */
export function evaluarGuardado({ haySesion, sesionReal, bpm, calidad = null } = {}) {
  if (!haySesion) return { puede: false, codigo: 'sin_sesion', mensaje: MENSAJES_TERMINAR.sin_sesion }
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

const UUID_SESION = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
/** ¿Es el id de una sesión real de la base? (la de demostración, «ses-demo-01», no lo es) */
export function esUuidSesion(id) {
  return typeof id === 'string' && UUID_SESION.test(id)
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

  // `fin` nunca queda vacío: la base solo publica mediciones finalizadas (fin no nulo) y de fuente 'sensor'
  fin = fin || new Date()
  fuente = fuente || 'sensor'
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
      sesionId: esUuidSesion(sesionId) ? sesionId : undefined,
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

/** Formatea la etiqueta de actividad para la tarjeta de vista previa pública. */
export function formatearActividadVistaPrevia(actividad) {
  const mapa = {
    reposo: 'Reposo',
    caminata: 'Caminata ligera',
    ejercicio_moderado: 'Ejercicio moderado',
    ejercicio_intenso: 'Ejercicio intenso',
    post_ejercicio: 'Post-ejercicio'
  }
  const clave = String(actividad || 'reposo').trim().toLowerCase()
  return mapa[clave] || String(actividad || 'Reposo')
}

/** Formatea la calidad de señal para la tarjeta de vista previa pública. */
export function formatearCalidadVistaPrevia(calidad) {
  const mapa = {
    buena: 'Buena',
    regular: 'Regular',
    mala: 'Mala',
    optima: 'Óptima'
  }
  const clave = String(calidad || 'buena').trim().toLowerCase()
  return mapa[clave] || String(calidad || 'Buena')
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
  const rango = rangoDeEdad(d.edad)
  campos.push({ etiqueta: 'Rango de edad', valor: rango })

  const ritmoEtiqueta = r.ritmo ? (ETIQUETAS_RITMO[r.ritmo] || r.ritmo) : 'Sinusal normal'
  const tarjeta = {
    insignia: 'Pública · Anónima',
    autor: 'Participante UNACH (Anónimo)',
    rangoEdad: `${rango} años`,
    actividad: formatearActividadVistaPrevia(d.actividad || r.actividad),
    calidad: formatearCalidadVistaPrevia(r.calidad || d.calidad),
    bpmValor: r.bpm ? Math.round(r.bpm) : null,
    bpmTexto: r.bpm ? `${Math.round(r.bpm)} BPM` : '— BPM',
    spo2Texto: r.spo2 ? `${r.spo2} %` : '— %',
    ritmoTexto: ritmoEtiqueta
  }

  return {
    campos,
    excluidos: ['nombre', 'ficha del paciente', 'edad exacta', 'cuenta de quien midió'],
    tarjeta
  }
}

/**
 * Construye las filas de transformación de privacidad (antes vs después de anonimizar)
 * para mostrar al usuario cómo se protegen sus datos identificativos antes de confirmar.
 */
export function construirTransformacionPrivacidad({
  nombre = '',
  correo = '',
  edad = null,
  declaracionId = null
} = {}) {
  const nombreOriginal = String(nombre || '').trim() || 'Titular de la medición'
  const correoOriginal = String(correo || '').trim() || 'Cuenta institucional UNACH'
  const tieneEdad = Number.isFinite(Number(edad)) && Number(edad) > 0
  const edadOriginal = tieneEdad ? `${Number(edad)} años` : 'Registrada en ficha'
  const rangoCalculado = `${rangoDeEdad(tieneEdad ? Number(edad) : null)} años`
  const fichaTexto = declaracionId
    ? `ID / Ficha clínica privada (${String(declaracionId).slice(0, 8)})`
    : 'ID / Ficha clínica privada'

  return [
    {
      clave: 'nombre',
      etiquetaOriginal: `Nombre: ${nombreOriginal}`,
      estadoBadge: 'Eliminado',
      tipoBadge: 'danger',
      valorPublico: 'Participante UNACH (Anónimo)'
    },
    {
      clave: 'correo',
      etiquetaOriginal: `Correo: ${correoOriginal}`,
      estadoBadge: 'Oculto (No se envía)',
      tipoBadge: 'danger',
      valorPublico: null
    },
    {
      clave: 'edad',
      etiquetaOriginal: `Edad exacta: ${edadOriginal}`,
      estadoBadge: `Agrupado en Rango: ${rangoCalculado}`,
      tipoBadge: 'warning',
      valorPublico: null
    },
    {
      clave: 'ficha',
      etiquetaOriginal: fichaTexto,
      estadoBadge: 'Desvinculado permanentemente',
      tipoBadge: 'danger',
      valorPublico: null
    }
  ]
}

/**
 * Genera un trazado SVG fotopletismográfico (PPG) representativo a partir del BPM medido
 * para la tarjeta de vista previa pública.
 */
export function generarCurvaPpgVistaPrevia(bpm = 74) {
  const ancho = 360
  const alto = 54
  const base = 42
  const fc = Math.min(160, Math.max(45, Number(bpm) || 74))
  const ciclos = Math.max(4, Math.min(8, Math.round((fc / 72) * 5)))
  const pasoCiclo = ancho / ciclos
  const puntos = []

  for (let x = 0; x <= ancho; x += 2) {
    const pos = (x % pasoCiclo) / pasoCiclo
    const sistolico = Math.exp(-Math.pow((pos - 0.24) / 0.075, 2)) * 28
    const dicrotico = Math.exp(-Math.pow((pos - 0.46) / 0.09, 2)) * 10
    const y = Math.max(6, Math.min(alto - 4, base - sistolico - dicrotico))
    puntos.push(`${x},${y.toFixed(1)}`)
  }

  const linea = `M ${puntos.join(' L ')}`
  const area = `${linea} L ${ancho},${alto} L 0,${alto} Z`
  return { linea, area, ancho, alto }
}

/** Comprobación de seguridad: ningún valor de la vista previa contiene el nombre del paciente. */
export function vistaPreviaSinDatosIdentificables(vista, nombre) {
  const n = String(nombre || '').trim().toLowerCase()
  if (!n) return true
  const enCampos = (vista?.campos || []).some(c => `${c.etiqueta} ${c.valor}`.toLowerCase().includes(n))
  const t = vista?.tarjeta
  const enTarjeta = t
    ? `${t.autor || ''} ${t.rangoEdad || ''} ${t.bpmTexto || ''} ${t.spo2Texto || ''} ${t.ritmoTexto || ''}`.toLowerCase().includes(n)
    : false
  return !enCampos && !enTarjeta
}

// ───────────────────────────── Confirmación Explícita del Titular (RF91) ─────────────────────────────

/** Formatea la fecha y hora exacta en que el titular otorgó su confirmación explícita. */
export function formatearFechaConfirmacionTitular(fecha = new Date()) {
  const d = fecha instanceof Date ? fecha : new Date(fecha)
  if (Number.isNaN(d.getTime())) return ''
  const dia = String(d.getDate()).padStart(2, '0')
  const mes = String(d.getMonth() + 1).padStart(2, '0')
  const anio = d.getFullYear()
  const hh = String(d.getHours()).padStart(2, '0')
  const mm = String(d.getMinutes()).padStart(2, '0')
  return `${dia}/${mes}/${anio}, ${hh}:${mm} hrs`
}

/**
 * Valida que el titular haya otorgado una confirmación adicional y explícita (`confirmado === true`)
 * antes de permitir cualquier publicación comunitaria. Por defecto toda medición es privada.
 */
export function validarConfirmacionExplicitaTitular({
  confirmado = false,
  titularNombre = '',
  titularCorreo = '',
  fechaConfirmacion = null
} = {}) {
  const esConfirmacionValida = confirmado === true
  const identidadTitular = String(titularCorreo || titularNombre || 'Cuenta autenticada UNACH').trim()

  if (!esConfirmacionValida) {
    return {
      autorizado: false,
      puedePublicar: false,
      confirmado: false,
      titular: identidadTitular,
      codigo: 'falta_confirmacion',
      mensaje: MENSAJES_TERMINAR.publicar_falta_confirmacion,
      estadoEtiqueta: 'Protección del Titular · Privada por Defecto',
      textoDeclaracion:
        'Confirmo de forma explícita y voluntaria como titular de esta medición que autorizo su publicación anónima en la Galería Pública UNACH. Comprendo que puedo retirar esta publicación en cualquier momento.',
      mensajeEstado:
        'Requisito obligatorio: Ninguna medición se publica automáticamente. Debes marcar la casilla de confirmación explícita del titular para habilitar el botón de publicación.',
      textoBotonPublicar: 'Confirmar y Publicar de Forma Anónima (Bloqueado)',
      fechaIso: null,
      fechaTexto: null,
      confirmadaEnIso: null,
      confirmadaEnTexto: null
    }
  }

  const instante = fechaConfirmacion ? new Date(fechaConfirmacion) : new Date()
  const iso = instante.toISOString()
  const textoFecha = formatearFechaConfirmacionTitular(instante)
  return {
    autorizado: true,
    puedePublicar: true,
    confirmado: true,
    titular: identidadTitular,
    codigo: 'confirmacion_verificada',
    mensaje: null,
    estadoEtiqueta: 'Confirmación Registrada',
    textoDeclaracion:
      'Confirmo de forma explícita y voluntaria como titular de esta medición que autorizo su publicación anónima en la Galería Pública UNACH. Comprendo que puedo retirar esta publicación en cualquier momento.',
    mensajeEstado:
      `Confirmación explícita verificada · Titular: ${identidadTitular} · Se registrará fecha y hora exacta de confirmación`,
    textoBotonPublicar: 'Confirmar y Publicar de Forma Anónima',
    fechaIso: iso,
    fechaTexto: textoFecha,
    confirmadaEnIso: iso,
    confirmadaEnTexto: textoFecha
  }
}

// ───────────────────────────── Mensajes de resultado y errores ─────────────────────────────

/** Mensaje de resultado de guardar (+ publicar). El motivo de por qué no se publicó va siempre incluido. */
export function mensajeResultado({ guardada, publicada = false, pendiente = false, motivoPublicacion = null }) {
  if (!guardada) return MENSAJES_TERMINAR.no_guardada
  if (pendiente) return motivoPublicacion ? `${MENSAJES_TERMINAR.pendiente} ${motivoPublicacion}` : MENSAJES_TERMINAR.pendiente
  if (publicada) return MENSAJES_TERMINAR.guardada_publicada
  return motivoPublicacion || MENSAJES_TERMINAR.guardada
}

/**
 * Qué mostrar al terminar de guardar (y publicar).
 * @param {{publicada?:boolean, pendiente?:boolean, eligioNoPublicar?:boolean, evaluacion?:object, fallo?:string|null}} e
 *   `evaluacion` = resultado de evaluarPublicacion; `fallo` = texto cuando se intentó publicar y la base lo rechazó.
 * @returns {{ok:boolean, titulo:string, detalle:string, mensaje:string, estado:string}}
 */
export function resultadoFinal({ publicada = false, pendiente = false, eligioNoPublicar = false, evaluacion = null, fallo = null } = {}) {
  if (publicada) {
    return { ok: true, titulo: 'Medición guardada y publicada', detalle: '', mensaje: MENSAJES_TERMINAR.guardada_publicada, estado: 'guardada_publicada' }
  }
  let porque
  if (fallo) porque = fallo
  else if (eligioNoPublicar) porque = 'Elegiste no publicarla.'
  else porque = evaluacion?.nota || ''
  if (pendiente) {
    return {
      ok: true,
      titulo: 'Medición guardada en este dispositivo',
      detalle: [MENSAJES_TERMINAR.pendiente, porque].filter(Boolean).join(' '),
      mensaje: mensajeResultado({ guardada: true, pendiente: true, motivoPublicacion: porque }),
      estado: 'pendiente'
    }
  }
  return {
    ok: !fallo,
    titulo: porque ? 'Medición guardada, no publicada' : 'Medición guardada',
    detalle: porque,
    mensaje: porque ? (fallo ? porque : `Guardada. ${porque}`) : MENSAJES_TERMINAR.guardada,
    estado: 'guardada'
  }
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
  if (texto.includes('confirmaci') && (texto.includes('titular') || texto.includes('explicita') || texto.includes('explícita'))) return 'falta_confirmacion'
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

const CAUSAS_HISTORIAL = {
  sin_sesion: 'necesitas iniciar sesión.',
  sin_permiso: 'tu cuenta no tiene el permiso de publicar (lo da el administrador).',
  consentimiento: 'no tienes un consentimiento informado vigente.',
  falta_confirmacion: 'ninguna medición se publica sin una confirmación adicional y explícita del titular.',
  no_sensor: 'solo se publican las mediciones hechas con el sensor y ya terminadas.',
  conexion: 'no hay conexión. Inténtalo más tarde.',
  sin_id: 'no se obtuvo el identificador de la medición.'
}
/** Mensaje de error de publicar/retirar desde el historial (la medición ya está guardada). */
export function mensajeErrorHistorial(motivo, accion = 'publicar') {
  if (accion === 'retirar') {
    return motivo === 'conexion' ? 'No se pudo retirar la publicación: no hay conexión. Inténtalo más tarde.'
      : motivo === 'sin_sesion' ? 'No se pudo retirar la publicación: necesitas iniciar sesión.'
        : 'No se pudo retirar la publicación. Intenta de nuevo más tarde.'
  }
  return `No se pudo publicar: ${CAUSAS_HISTORIAL[motivo] || 'ocurrió un problema. Intenta de nuevo más tarde.'}`
}
