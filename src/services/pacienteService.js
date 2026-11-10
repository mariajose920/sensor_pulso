/**
 * Servicio para Datos Declarados del Paciente y Factores de Medición (RF03)
 *
 * Cumple estrictamente con:
 * - Datos obligatorios: nombre, edad (18-120, solo mayores de edad) y nivel de estrés.
 * - Factores que afectan la medición: sueño, cafeína, medicación, actividad previa y condición de salud.
 * - Persistencia en Supabase (tabla declaraciones_paciente con bytea para datos_cifrados)
 * - Copia de trabajo solo en la pestaña (sessionStorage), borrada al cerrar sesión (ISO 27001 A.8.1).
 */
import { ref } from 'vue'
import { supabase } from './supabase.js'
import { ACTIVIDADES_CANONICAS, normalizarActividadId, obtenerNombreActividad } from './actividadesService.js'
import { cifradoService } from '../utils/cifradoService.js'
import { validarFechaNacimiento, validarEdadLegado, EDAD_MINIMA, EDAD_MAXIMA } from '../utils/edad.js'
import { fusionarFicha, aplicarEdadCalculada, elegirFichaVigente, fichaIgual } from '../utils/fichaPersistencia.js'

export const NIVELES_ESTRES = [
  { id: 'bajo', label: 'Bajo (Tranquilo / Relajado)', color: '#16a34a' },
  { id: 'medio', label: 'Medio (Normal / Cotidiano)', color: '#0284c7' },
  { id: 'alto', label: 'Alto (Bajo presión / Preocupado)', color: '#d97706' },
  { id: 'muy_alto', label: 'Muy Alto (Estrés agudo / Ansiedad)', color: '#dc2626' }
]

export const OPCIONES_SUENO = [
  { id: 'menos_5', label: 'Menos de 5 horas (Déficit severo)' },
  { id: '5_6', label: '5 a 6 horas (Descanso parcial)' },
  { id: '7_8', label: '7 a 8 horas (Descanso óptimo)' },
  { id: 'mas_8', label: 'Más de 8 horas' }
]

export const OPCIONES_CAFEINA = [
  { id: 'ninguna', label: 'Ninguna en las últimas 4 horas' },
  { id: 'baja', label: 'Baja (1 café, té o mate)' },
  { id: 'moderada', label: 'Moderada (2 cafés o bebida cola)' },
  { id: 'alta', label: 'Alta (3+ cafés o bebida energética)' }
]

export const OPCIONES_ACTIVIDAD = ACTIVIDADES_CANONICAS.map(a => ({
  id: a.codigo,
  actividadId: a.id,
  label: a.label,
  nombre: a.nombre,
  descripcion: a.descripcion
}))

export const OPCIONES_MEDICACION = [
  { 
    id: 'ninguna', 
    label: 'Ninguna medicación habitual', 
    alteraPulso: false,
    efecto: 'neutro',
    descripcion: 'Sin fármacos activos que alteren la frecuencia basal.' 
  },
  { 
    id: 'inhalador_asma', 
    label: 'Inhalador o asma (ej: Salbutamol, Budesonida)', 
    alteraPulso: true,
    efecto: 'eleva',
    descripcion: 'Los broncodilatadores suelen provocar taquicardia refleja o leve aumento de BPM.' 
  },
  { 
    id: 'presion_corazon', 
    label: 'Presión o corazón (ej: Propranolol, Atenolol, Enalapril)', 
    alteraPulso: true,
    efecto: 'reduce',
    descripcion: 'Los betabloqueadores disminuyen la frecuencia cardíaca de reposo (bradicardia esperada).' 
  },
  { 
    id: 'antigripal_descongestionante', 
    label: 'Antigripal o descongestionante reciente (ej: Pseudoefedrina)', 
    alteraPulso: true,
    efecto: 'eleva',
    descripcion: 'La pseudoefedrina tiene efecto simpaticomimético y puede elevar el pulso transitoriamente.' 
  },
  { 
    id: 'tdah_estimulante', 
    label: 'Estimulantes o TDAH (ej: Metilfenidato, Modafinilo)', 
    alteraPulso: true,
    efecto: 'eleva',
    descripcion: 'Fármacos estimulantes aumentan el tono simpático y pueden elevar la frecuencia cardíaca.' 
  },
  { 
    id: 'ansiolitico_antidepresivo', 
    label: 'Ansiolíticos o antidepresivos (ej: Sertralina, Clonazepam)', 
    alteraPulso: false,
    efecto: 'variable',
    descripcion: 'Suelen estabilizar o atenuar la reactividad al estrés emocional.' 
  },
  { 
    id: 'analgesico_comun', 
    label: 'Analgésicos o vitaminas (ej: Paracetamol, Ibuprofeno)', 
    alteraPulso: false,
    efecto: 'neutro',
    descripcion: 'No alteran significativamente la frecuencia cardíaca en dosis terapéuticas.' 
  },
  { 
    id: 'otra', 
    label: 'Otra medicación específica (especificar)', 
    alteraPulso: null,
    efecto: 'personalizado',
    descripcion: 'Se registra para análisis pedagógico en el aula.' 
  },
  { 
    id: 'no_se', 
    label: 'Tomo medicación pero no sé si afecta el pulso (especificar)', 
    alteraPulso: null,
    efecto: 'por_evaluar',
    descripcion: 'El docente podrá interpretar la curva PPG considerando el medicamento declarado.' 
  }
]

export const CONDICIONES_SALUD_COMUNES = [
  'Ninguna conocida',
  'Hipertensión arterial',
  'Hipotensión arterial',
  'Arritmia cardíaca conocida',
  'Asma u otra afección respiratoria',
  'Resfriado, fiebre o infección activa',
  'Diabetes',
  'Otra condición'
]

const LOCAL_STORAGE_KEY = 'sensor_paciente_declaracion_rf03'

/** Cuántas filas recientes se intentan leer como máximo (la más nueva primero; solo se pasa a la siguiente si no se pudo leer). */
export const MAX_FILAS_A_DESCIFRAR = 3

/**
 * Copia de trabajo de la ficha en el dispositivo (ISO 27001 A.8.1, riesgo R8).
 * Es dato de salud: vive solo en la pestaña (sessionStorage), no sobrevive al cierre del navegador y se borra
 * al cerrar sesión. Antes estaba en localStorage, donde quedaba legible para quien usara el mismo equipo después.
 */
const almacenFicha = {
  getItem: (k) => { try { return sessionStorage.getItem(k) } catch { return null } },
  setItem: (k, v) => { try { sessionStorage.setItem(k, v) } catch { /* sin almacenamiento */ } },
  removeItem: (k) => { try { sessionStorage.removeItem(k) } catch { /* sin almacenamiento */ } }
}

// Borra la copia antigua que versiones anteriores dejaron en localStorage
try { localStorage.removeItem(LOCAL_STORAGE_KEY) } catch { /* sin almacenamiento */ }

// Dependencias reemplazables solo en las pruebas (Node, sin red)
let deps = { supabase, cifradoService }

// ---------------------------------------------------------------------------------------------------------------
// Estado en memoria de la pestaña (nada de esto se guarda en disco)
// ---------------------------------------------------------------------------------------------------------------
/** Factores ya descifrados: clave = usuario + fila + huella del sobre cifrado. Evita volver a llamar al servidor al navegar. */
const cacheDescifrado = new Map()
/** Id de la fila de la ficha propia que se sabe legible (para actualizarla en vez de insertar otra). */
let filaPropia = null // { uid, id }
/** Lectura en curso (varias pantallas piden la ficha a la vez: una sola consulta). */
let lecturaEnCurso = null
/** Cola de guardados en el servidor: se hacen de uno en uno para no duplicar filas. */
let colaGuardado = Promise.resolve()

/** Estado del guardado en segundo plano, para avisos discretos en la interfaz. */
export const estadoGuardadoFicha = ref({ estado: 'ninguno', mensaje: '', ficha: null })
function avisarEstado(estado, mensaje = '', ficha = null) {
  estadoGuardadoFicha.value = { estado, mensaje, ficha }
}

const DEV = Boolean(import.meta.env?.DEV)
/** Temporización opcional (solo en desarrollo): console.debug con el tiempo de cada etapa. */
async function medir(etapa, fn) {
  if (!DEV) return fn()
  const t0 = performance.now()
  try { return await fn() } finally { console.debug(`[ficha] ${etapa}: ${(performance.now() - t0).toFixed(0)} ms`) }
}

const claveCache = (uid, fila) => `${uid}:${fila.id}:${String(fila.datos_cifrados || '').slice(0, 48)}`

/** Texto en español para cada causa de fallo al leer los datos guardados. */
export function motivoDeFallo(codigo) {
  switch (codigo) {
    case 'sesion': return 'No se pudieron leer tus datos guardados porque tu sesión venció. Vuelve a iniciar sesión.'
    case 'clave': return 'No se pudieron leer tus datos guardados porque se guardaron con otra clave de cifrado (probablemente en otro entorno) o no pasaron la verificación de integridad.'
    case 'servidor': return 'No se pudieron leer tus datos guardados porque el servidor de cifrado no está disponible en este momento.'
    case 'noEncontrada': return 'No se pudieron leer tus datos guardados porque el servidor no encontró la ficha (o no tienes acceso a ella).'
    case 'red': return 'No se pudieron leer tus datos guardados porque no hay conexión con el servidor.'
    default: return 'No se pudieron leer tus datos guardados por un error inesperado.'
  }
}
/** Con estas causas probar otra fila no sirve de nada: el problema no es la fila. */
const CAUSAS_GENERALES = new Set(['sesion', 'servidor', 'red'])

/**
 * Cifra los factores de salud EN EL SERVIDOR (RF55, RF116). Lanza error si no se puede: nunca se guarda en claro.
 */
async function cifrarEnServidor(obj, token) {
  return medir('cifrar', () => deps.cifradoService.cifrarFactoresSalud(obj, { token }))
}

/**
 * Descifra una declaración en el servidor, solo para su titular (RF116). Los registros antiguos en texto plano se leen
 * sin servidor. NUNCA falla en silencio: devuelve { factores, error } con error = { codigo, motivo, detalle } o null.
 */
async function descifrarDeclaracion(fila, token, uid) {
  if (!fila?.datos_cifrados) return { factores: {}, error: null }
  if (!deps.cifradoService.esDatoCifrado(fila.datos_cifrados)) {
    return { factores: deps.cifradoService.leerSinCifrar(fila.datos_cifrados), error: null }
  }
  const clave = claveCache(uid, fila)
  if (cacheDescifrado.has(clave)) return { factores: cacheDescifrado.get(clave), error: null, desdeCache: true }
  try {
    const factores = await medir('descifrar', () => deps.cifradoService.descifrarDeclaracion({ declaracionId: fila.id, token }))
    if (factores && Object.keys(factores).length > 0) cacheDescifrado.set(clave, factores)
    return { factores: factores || {}, error: null }
  } catch (e) {
    const codigo = e?.codigo || 'red'
    console.warn('No se pudo descifrar la declaración:', e?.message)
    return { factores: {}, error: { codigo, motivo: motivoDeFallo(codigo), detalle: e?.message || '' } }
  }
}

/** Campos de la ficha que van cifrados (todo salvo nombre, edad y metadatos de la fila). */
function extraerFactores(ficha) {
  const { nombre, edad, id, creadoEn, origen, pendienteSync, incompleta, estadoLectura, motivoLectura, advertenciaLectura, ...factores } = ficha
  return factores
}

/**
 * Cifra los factores en el servidor y los guarda. Una ficha propia vigente por persona: si ya se conoce la fila propia
 * (`idExistente`, siempre una fila que se pudo leer) se ACTUALIZA; si no existe o no se conoce, se inserta una nueva.
 * Las fichas de canales adicionales (RF111) siempre se insertan. Devuelve { id, creadoEn, datosCifrados } o { error }.
 */
async function guardarFilaServidor(ficha, factores, session, { adicional = false, sesionId = null, idExistente = null } = {}) {
  try {
    // El cifrado ocurre en el servidor; si falla, los datos de salud NO se envían a la base (quedan solo en el dispositivo)
    const { datosCifrados, claveVersion } = await cifrarEnServidor(factores, session.access_token)
    const uid = session.user.id
    if (idExistente && !adicional) {
      const { data, error } = await medir('actualizar', () => deps.supabase
        .from('declaraciones_paciente')
        .update({ nombre: ficha.nombre, edad: ficha.edad, datos_cifrados: datosCifrados, clave_version: claveVersion })
        .eq('id', idExistente)
        .eq('usuario_id', uid)
        .is('sesion_id', null)
        .select('id, creado_en')
        .maybeSingle())
      if (error) return { error: error.message }
      if (data) return { id: data.id, creadoEn: data.creado_en, datosCifrados }
      // La fila ya no existe (p. ej. borrada por la política de retención): se crea una nueva
    }
    const { data, error } = await medir('insertar', () => deps.supabase
      .from('declaraciones_paciente')
      .insert({
        usuario_id: uid,
        nombre: ficha.nombre,
        edad: ficha.edad,
        datos_cifrados: datosCifrados,
        clave_version: claveVersion,
        // RF111: la ficha de un canal adicional queda ligada a la sesión desde el inicio
        ...(adicional && sesionId ? { sesion_id: sesionId } : {})
      })
      .select('id, creado_en')
      .single())
    if (error) return { error: error.message }
    return { id: data.id, creadoEn: data.creado_en, datosCifrados }
  } catch (e) {
    return { error: e?.message || 'error de red' }
  }
}

function leerCopia() {
  try {
    const guardado = almacenFicha.getItem(LOCAL_STORAGE_KEY)
    return guardado ? JSON.parse(guardado) : null
  } catch { return null }
}
function escribirCopia(ficha) {
  almacenFicha.setItem(LOCAL_STORAGE_KEY, JSON.stringify(ficha))
}

/** Valida y normaliza. Sin red ni almacenamiento: es la parte instantánea de un guardado. */
function prepararDeclaracion(datosEntrada, { adicional = false } = {}) {
  // La ficha propia se fusiona con la ficha vigente COMPLETA: un objeto parcial nunca borra campos ya guardados
  // (el nivel de estrés y los demás factores se conservan salvo que el usuario los cambie).
  // Las fichas de canales adicionales (RF111) son de otra persona: parten solo de lo que se envía.
  const copia = adicional ? null : leerCopia()
  const base = copia && !copia.incompleta ? copia : null
  const datos = adicional ? { ...datosEntrada } : fusionarFicha(base, datosEntrada)
  // Una fecha de nacimiento nueva manda sobre la edad guardada antes.
  if (datosEntrada?.fechaNacimiento) datos.fechaNacimiento = datosEntrada.fechaNacimiento

  const validacion = pacienteService.validarDatos(datos)
  if (!validacion.valido) return { ok: false, errores: validacion.errores }

  let textoMedicacion = 'Ninguna'
  const tipoMed = datos.medicacionTipo || 'ninguna'
  const detalleMed = datos.medicacionDetalle ? datos.medicacionDetalle.trim() : ''

  if (tipoMed !== 'ninguna') {
    const opt = OPCIONES_MEDICACION.find(m => m.id === tipoMed)
    const labelBase = opt ? opt.label.split('(')[0].trim() : tipoMed
    if (detalleMed) {
      textoMedicacion = `${labelBase} (${detalleMed})`
    } else {
      textoMedicacion = opt ? opt.label : tipoMed
    }
  } else if (datos.medicacion && datos.medicacion.trim()) {
    textoMedicacion = datos.medicacion.trim()
  }

  const fechaNacimiento = datos.fechaNacimiento ? String(datos.fechaNacimiento).trim() : ''
  const factoresSalud = {
    nivelEstres: datos.nivelEstres,
    // La fecha de nacimiento va dentro de los factores cifrados (dato personal); la columna `edad` queda en claro para los rangos
    ...(fechaNacimiento ? { fechaNacimiento } : {}),
    suenoHoras: datos.suenoHoras || '7_8',
    suenoCalidad: datos.suenoCalidad || 'reparador',
    cafeina: datos.cafeina || 'ninguna',
    medicacionTipo: tipoMed,
    medicacionDetalle: detalleMed,
    medicacion: textoMedicacion,
    actividadPrevia: datos.actividadPrevia || 'reposo',
    actividadId: normalizarActividadId(datos.actividadId || datos.actividadPrevia || 1),
    actividadNombre: obtenerNombreActividad(datos.actividadId || datos.actividadPrevia || 1),
    condicionSalud: datos.condicionSalud || 'Ninguna conocida',
    observaciones: datos.observaciones ? datos.observaciones.trim() : ''
  }

  // `edad` siempre existe en la ficha: se calcula desde la fecha de nacimiento (o se conserva la de fichas antiguas)
  const declaracion = aplicarEdadCalculada({
    nombre: datos.nombre.trim(),
    edad: Number(datos.edad),
    ...factoresSalud,
    actualizadoEn: new Date().toISOString(),
    // La ficha propia conserva la identidad de su fila para actualizarla en lugar de insertar otra
    ...(!adicional && base?.id ? { id: base.id, creadoEn: base.creadoEn } : {})
  })

  // Sin cambios y ya sincronizada: no hay nada que guardar (ni cifrar, ni escribir en el servidor)
  const sinCambios = !adicional && Boolean(base?.id) && !base.pendienteSync && fichaIgual(declaracion, base)
  return { ok: true, declaracion, factoresSalud, base, sinCambios }
}

export const pacienteService = {
  /**
   * Valida los datos del paciente según las reglas de negocio del RF03
   */
  validarDatos(datos) {
    const errores = []

    if (!datos.nombre || typeof datos.nombre !== 'string' || datos.nombre.trim().length < 2) {
      errores.push('El nombre del paciente es obligatorio (mínimo 2 caracteres).')
    }

    // La edad se calcula desde la fecha de nacimiento. Por compatibilidad con fichas antiguas, sin fecha se acepta `edad`.
    if (datos.fechaNacimiento) {
      const f = validarFechaNacimiento(datos.fechaNacimiento)
      if (!f.valido) errores.push(f.error)
    } else if (!validarEdadLegado(datos.edad)) {
      errores.push(`La fecha de nacimiento es obligatoria (edad entre ${EDAD_MINIMA} y ${EDAD_MAXIMA} años). Solo se miden personas mayores de edad.`)
    }

    if (!datos.nivelEstres || !NIVELES_ESTRES.some(n => n.id === datos.nivelEstres)) {
      errores.push('El nivel de estrés es obligatorio. Selecciona una de las opciones.')
    }

    return {
      valido: errores.length === 0,
      errores
    }
  },

  /**
   * Guardado RÁPIDO (RF03): valida y guarda la copia de la pestaña al instante (sin red) y deja el envío al servidor
   * en segundo plano. Devuelve { ok, data, errores, sinCambios, sincronizacion }, donde `sincronizacion` es una promesa
   * que se resuelve con { declaracionId, errorServidor, ficha }. La interfaz no tiene que esperarla.
   */
  guardarDeclaracionRapido(datosEntrada, { adicional = false, sesionId = null } = {}) {
    const prep = prepararDeclaracion(datosEntrada, { adicional })
    if (!prep.ok) return { ok: false, errores: prep.errores }
    const { declaracion, factoresSalud, base } = prep

    if (prep.sinCambios) {
      return {
        ok: true, data: base, declaracionId: base.id, errorServidor: null, sinCambios: true,
        sincronizacion: Promise.resolve({ declaracionId: base.id, errorServidor: null, ficha: base })
      }
    }

    // 1. Copia de trabajo de la pestaña (RF111: las fichas de canales adicionales no reemplazan la ficha propia).
    //    Queda marcada `pendienteSync` hasta que el servidor confirme: así una ficha que no llegó a la base no se
    //    pierde ni la pisa una fila más vieja al recargar.
    const guardaCopia = !adicional
    if (guardaCopia) {
      escribirCopia({ ...declaracion, pendienteSync: true })
      avisarEstado('guardando', 'Guardando tu ficha…')
    }

    // 2. Envío al servidor en segundo plano, de uno en uno (si hay varios guardados seguidos no se duplican filas)
    const sincronizacion = colaGuardado.then(() =>
      sincronizarFicha(declaracion, factoresSalud, { adicional, sesionId, guardaCopia }))
    colaGuardado = sincronizacion
    return { ok: true, data: declaracion, sinCambios: false, sincronizacion }
  },

  /**
   * Guarda una declaración de paciente (RF03) y espera al servidor. Misma lógica que el guardado rápido; la usan
   * los flujos que necesitan el id de la ficha al terminar (p. ej. canales adicionales).
   */
  async guardarDeclaracion(datosEntrada, opciones = {}) {
    const r = this.guardarDeclaracionRapido(datosEntrada, opciones)
    if (!r.ok) return { ok: false, errores: r.errores }
    const s = await r.sincronizacion
    return { ok: true, data: r.data, declaracionId: s.declaracionId, errorServidor: s.errorServidor, sinCambios: r.sinCambios }
  },

  /**
   * Obtiene la ficha propia vigente: la última fila LEGIBLE del servidor con todos sus campos (incluido el nivel de
   * estrés), o la copia de la pestaña si el servidor no la tiene o no respondió.
   * La ficha devuelta trae `estadoLectura` ('completa' | 'incompleta'); si es incompleta, `motivoLectura` explica por qué
   * no se pudo leer (sesión vencida, otra clave de cifrado, servidor, red). `advertenciaLectura` avisa de que la fila más
   * reciente no se pudo leer y se muestra una anterior. Nunca falla en silencio.
   */
  obtenerDeclaracionActiva({ forzar = false } = {}) {
    if (lecturaEnCurso && !forzar) return lecturaEnCurso
    const p = leerFichaActiva().finally(() => { if (lecturaEnCurso === p) lecturaEnCurso = null })
    lecturaEnCurso = p
    return p
  },

  /** Reintenta enviar al servidor una ficha guardada solo en la pestaña (pendienteSync). */
  reintentarSincronizacion() {
    const copia = leerCopia()
    if (!copia || !copia.pendienteSync || copia.incompleta) {
      return Promise.resolve({ declaracionId: copia?.id || null, errorServidor: null, ficha: copia })
    }
    avisarEstado('guardando', 'Guardando tu ficha…')
    const s = colaGuardado.then(() =>
      sincronizarFicha(copia, extraerFactores(copia), { adicional: false, sesionId: null, guardaCopia: true }))
    colaGuardado = s
    return s
  },

  /** Espera a que termine el guardado en segundo plano (para flujos que necesitan el id de la ficha). */
  esperarGuardado() {
    return colaGuardado
  },

  /** Copia de trabajo de la pestaña (sin red). */
  obtenerUltimaDeclaracion() {
    return leerCopia()
  },

  /** Limpia los datos del paciente guardados localmente y la memoria de la pestaña. */
  limpiarDeclaracionLocal() {
    cacheDescifrado.clear()
    filaPropia = null
    lecturaEnCurso = null
    avisarEstado('ninguno')
    try {
      almacenFicha.removeItem(LOCAL_STORAGE_KEY)
      return true
    } catch (e) {
      return false
    }
  },

  /** Solo para pruebas: reemplaza supabase/cifrado por dobles y reinicia la memoria de la pestaña. */
  __probar(nuevasDeps) {
    deps = { supabase, cifradoService, ...(nuevasDeps || {}) }
    cacheDescifrado.clear()
    filaPropia = null
    lecturaEnCurso = null
    colaGuardado = Promise.resolve()
    avisarEstado('ninguno')
  }
}

/**
 * Parte lenta de un guardado: cifrar + escribir en el servidor. Actualiza la copia de la pestaña y el estado visible.
 * Nunca lanza: devuelve { declaracionId, errorServidor, ficha }.
 */
async function sincronizarFicha(declaracion, factores, { adicional, sesionId, guardaCopia }) {
  let declaracionId = null
  let errorServidor = null
  let hayCuenta = false
  const ficha = { ...declaracion }
  try {
    const { data: { session } } = await medir('getSession', () => deps.supabase.auth.getSession())
    if (session?.user?.id) {
      hayCuenta = true
      const uid = session.user.id
      const idExistente = adicional ? null : ((filaPropia?.uid === uid && filaPropia.id) || ficha.id || null)
      const r = await guardarFilaServidor(ficha, factores, session, { adicional, sesionId, idExistente })
      if (r.error) {
        console.warn('Aviso: no se pudo sincronizar declaración en Supabase (se mantiene local):', r.error)
        errorServidor = r.error
      } else {
        declaracionId = r.id
        ficha.id = r.id
        ficha.creadoEn = r.creadoEn
        declaracion.id = r.id // la ficha devuelta por el guardado rápido ya apunta a su fila
        declaracion.creadoEn = r.creadoEn
        if (!adicional) {
          filaPropia = { uid, id: r.id }
          // El contenido recién guardado ya es conocido: no hace falta descifrarlo de nuevo al volver a leer
          cacheDescifrado.set(claveCache(uid, { id: r.id, datos_cifrados: r.datosCifrados }), factores)
        }
      }
    }
  } catch (err) {
    console.warn('Error de red al conectar con Supabase para RF03:', err)
    errorServidor = err?.message || 'error de red'
  }

  if (guardaCopia) {
    // Sincronizada: copia sin marca. Con cuenta pero sin llegar al servidor: queda `pendienteSync` para reintentar al cargar.
    if (declaracionId) { ficha.origen = 'supabase'; delete ficha.pendienteSync } else { ficha.pendienteSync = hayCuenta }
    escribirCopia(ficha)
    if (errorServidor) avisarEstado('error', `La ficha se guardó en este dispositivo pero no llegó al servidor (${errorServidor}). Se reintentará.`, ficha)
    else avisarEstado('guardado', hayCuenta ? 'Ficha guardada' : 'Ficha guardada en este dispositivo', ficha)
  }
  return { declaracionId, errorServidor, ficha }
}

/** Lectura completa de la ficha propia (ver pacienteService.obtenerDeclaracionActiva). */
async function leerFichaActiva() {
  let motivoRed = null
  let hayCuenta = false
  try {
    const { data: { session } } = await medir('getSession', () => deps.supabase.auth.getSession())
    if (session?.user?.id) {
      hayCuenta = true
      const uid = session.user.id
      const { data, error } = await medir('leer', () => deps.supabase
        .from('declaraciones_paciente')
        .select('id, nombre, edad, datos_cifrados, clave_version, creado_en')
        .eq('usuario_id', uid)
        .is('sesion_id', null) // RF111: las fichas de canales adicionales no son la ficha propia
        .order('creado_en', { ascending: false })
        .limit(MAX_FILAS_A_DESCIFRAR))

      if (error) {
        motivoRed = `No se pudieron leer tus datos guardados porque el servidor no respondió (${error.message}).`
      } else if (Array.isArray(data) && data.length > 0) {
        // De la más nueva a la más antigua, pero solo se pasa a la siguiente si la anterior NO se pudo leer: en el caso
        // normal es UNA sola llamada de descifrado. Una fila ilegible (p. ej. cifrada con otra clave) no oculta la válida.
        const filas = []
        let primerError = null
        for (const fila of data) {
          const r = await descifrarDeclaracion(fila, session.access_token, uid)
          filas.push({ id: fila.id, nombre: fila.nombre, edad: fila.edad, creadoEn: fila.creado_en, factores: r.factores })
          if (Object.keys(r.factores).length > 0) break
          if (r.error) {
            primerError = primerError || r.error
            if (CAUSAS_GENERALES.has(r.error.codigo)) break
          }
        }
        const vigente = elegirFichaVigente(filas, leerCopia())
        if (vigente) {
          if (vigente.incompleta) {
            // No se pudo leer ninguna: se explica el motivo y NO se guarda en la pestaña (no debe pisar una ficha completa)
            vigente.estadoLectura = 'incompleta'
            vigente.motivoLectura = primerError?.motivo || 'No se pudieron leer tus datos guardados: la ficha guardada no tiene contenido legible.'
            return vigente
          }
          vigente.estadoLectura = 'completa'
          if (primerError && vigente.id !== filas[0]?.id) {
            vigente.advertenciaLectura = `Tu ficha más reciente no se pudo leer (${primerError.motivo.replace('No se pudieron leer tus datos guardados porque ', '')}) y se muestra una anterior.`
          }
          if (vigente.id && vigente.origen !== 'local') filaPropia = { uid, id: vigente.id }
          // Una ficha de la pestaña que no llegó al servidor se reintenta en segundo plano, sin hacer esperar a la pantalla
          const pendiente = vigente.pendienteSync
          escribirCopia(vigente)
          if (pendiente) pacienteService.reintentarSincronizacion()
          return vigente
        }
      }
    }
  } catch (e) {
    motivoRed = motivoRed || motivoDeFallo('red')
  }

  // Sin cuenta, sin filas o sin conexión: copia de la pestaña
  const guardado = leerCopia()
  if (guardado && !guardado.incompleta) {
    const parsed = aplicarEdadCalculada(guardado)
    parsed.origen = parsed.id && !parsed.pendienteSync ? 'supabase_cache' : 'local'
    parsed.estadoLectura = 'completa'
    if (motivoRed) parsed.advertenciaLectura = `${motivoRed} Se muestra la copia de esta pestaña.`
    return parsed
  }
  // Había cuenta pero no se pudo consultar: no se hace pasar por «no existe»
  if (hayCuenta && motivoRed) return { incompleta: true, sinDatos: true, estadoLectura: 'incompleta', motivoLectura: motivoRed }
  return null
}
