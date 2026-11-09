/**
 * Servicio para Datos Declarados del Paciente y Factores de Medición (RF03)
 *
 * Cumple estrictamente con:
 * - Datos obligatorios: nombre, edad (18-120, solo mayores de edad) y nivel de estrés.
 * - Factores que afectan la medición: sueño, cafeína, medicación, actividad previa y condición de salud.
 * - Persistencia en Supabase (tabla declaraciones_paciente con bytea para datos_cifrados)
 * - Copia de trabajo solo en la pestaña (sessionStorage), borrada al cerrar sesión (ISO 27001 A.8.1).
 */
import { supabase } from './supabase.js'
import { ACTIVIDADES_CANONICAS, normalizarActividadId, obtenerNombreActividad } from './actividadesService.js'
import { cifradoService } from '../utils/cifradoService.js'
import { validarFechaNacimiento, validarEdadLegado, EDAD_MINIMA, EDAD_MAXIMA } from '../utils/edad.js'
import { fusionarFicha, aplicarEdadCalculada, elegirFichaVigente } from '../utils/fichaPersistencia.js'

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

/**
 * Cifra los factores de salud EN EL SERVIDOR (RF55, RF116). Lanza error si no se puede: nunca se guarda en claro.
 */
async function cifrarEnServidor(obj, token) {
  return cifradoService.cifrarFactoresSalud(obj, { token })
}

/**
 * Descifra una declaración en el servidor, solo para su titular (RF116). Los registros antiguos en texto plano se leen sin servidor.
 */
async function descifrarDeclaracion(fila, token) {
  if (!fila?.datos_cifrados) return {}
  if (!cifradoService.esDatoCifrado(fila.datos_cifrados)) return cifradoService.leerSinCifrar(fila.datos_cifrados)
  try {
    return await cifradoService.descifrarDeclaracion({ declaracionId: fila.id, token })
  } catch (e) {
    console.warn('No se pudo descifrar la declaración:', e.message)
    return {}
  }
}

/** Campos de la ficha que van cifrados (todo salvo nombre, edad y metadatos de la fila). */
function extraerFactores(ficha) {
  const { nombre, edad, id, creadoEn, actualizadoEn, origen, pendienteSync, incompleta, ...factores } = ficha
  return factores
}

/**
 * Cifra los factores en el servidor e inserta una fila nueva. Devuelve { id, creadoEn } o { error }.
 * Cada guardado de la ficha propia crea una fila (historial); al leer se toma la más reciente legible.
 */
async function insertarFila(ficha, factores, session, { adicional = false, sesionId = null } = {}) {
  try {
    // El cifrado ocurre en el servidor; si falla, los datos de salud NO se envían a la base (quedan solo en el dispositivo)
    const { datosCifrados, claveVersion } = await cifrarEnServidor(factores, session.access_token)
    const { data, error } = await supabase
      .from('declaraciones_paciente')
      .insert({
        usuario_id: session.user.id,
        nombre: ficha.nombre,
        edad: ficha.edad,
        datos_cifrados: datosCifrados,
        clave_version: claveVersion,
        // RF111: la ficha de un canal adicional queda ligada a la sesión desde el inicio
        ...(adicional && sesionId ? { sesion_id: sesionId } : {})
      })
      .select('id, creado_en')
      .single()
    if (error) return { error: error.message }
    return { id: data.id, creadoEn: data.creado_en }
  } catch (e) {
    return { error: e?.message || 'error de red' }
  }
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
   * Guarda una declaración de paciente (RF03) en Supabase y en localStorage
   */
  async guardarDeclaracion(datosEntrada, { adicional = false, sesionId = null } = {}) {
    // La ficha propia se fusiona con la copia de trabajo completa: un objeto parcial nunca borra campos ya guardados.
    // Las fichas de canales adicionales (RF111) son de otra persona: parten solo de lo que se envía.
    const datos = adicional ? { ...datosEntrada } : fusionarFicha(this.obtenerUltimaDeclaracion(), datosEntrada)
    // Una fecha de nacimiento nueva manda sobre la edad guardada antes.
    if (datosEntrada?.fechaNacimiento) datos.fechaNacimiento = datosEntrada.fechaNacimiento

    const validacion = this.validarDatos(datos)
    if (!validacion.valido) {
      return { ok: false, errores: validacion.errores }
    }

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
    const declaracionNormalizada = aplicarEdadCalculada({
      nombre: datos.nombre.trim(),
      edad: Number(datos.edad),
      ...factoresSalud,
      actualizadoEn: new Date().toISOString()
    })

    // 1. Copia de trabajo de la pestaña (RF111: las fichas de canales adicionales no reemplazan la ficha propia).
    //    Queda marcada `pendienteSync` hasta que el servidor confirme: así una ficha que no llegó a la base no se
    //    pierde ni la pisa una fila más vieja al recargar.
    const guardaCopia = !adicional
    if (guardaCopia) {
      almacenFicha.setItem(LOCAL_STORAGE_KEY, JSON.stringify({ ...declaracionNormalizada, pendienteSync: true }))
    }

    // 2. Si hay sesión iniciada en Supabase, guardar en la base de datos
    let declaracionId = null
    let errorServidor = null
    let hayCuenta = false
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        hayCuenta = true
        const r = await insertarFila(declaracionNormalizada, factoresSalud, session, { adicional, sesionId })
        if (r.error) {
          console.warn('Aviso: no se pudo sincronizar declaración en Supabase (se mantiene local):', r.error)
          errorServidor = r.error
        } else {
          declaracionId = r.id
          declaracionNormalizada.id = r.id
          declaracionNormalizada.creadoEn = r.creadoEn
        }
      }
    } catch (err) {
      console.warn('Error de red al conectar con Supabase para RF03:', err)
      errorServidor = err?.message || 'error de red'
    }

    if (guardaCopia) {
      // Sincronizada: copia sin marca. Con cuenta pero sin llegar al servidor: queda `pendienteSync` para reintentar al cargar.
      const copia = declaracionId ? declaracionNormalizada : { ...declaracionNormalizada, pendienteSync: hayCuenta }
      almacenFicha.setItem(LOCAL_STORAGE_KEY, JSON.stringify(copia))
    }

    return {
      ok: true,
      data: declaracionNormalizada,
      declaracionId,
      errorServidor
    }
  },

  /**
   * Obtiene la ficha propia vigente: la última fila LEGIBLE del servidor con todos sus campos (incluido el nivel de
   * estrés), o la copia de la pestaña si el servidor no la tiene o no respondió.
   */
  async obtenerDeclaracionActiva() {
    // 1. Intentar cargar desde Supabase si el usuario está conectado
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        const { data, error } = await supabase
          .from('declaraciones_paciente')
          .select('id, nombre, edad, datos_cifrados, clave_version, creado_en')
          .eq('usuario_id', session.user.id)
          .is('sesion_id', null) // RF111: las fichas de canales adicionales no son la ficha propia
          .order('creado_en', { ascending: false })
          .limit(10)

        if (!error && Array.isArray(data) && data.length > 0) {
          // De la más nueva a la más antigua hasta hallar una legible: una fila ilegible (p. ej. cifrada con otra clave)
          // no debe ocultar la ficha válida anterior ni dejar la ficha sin nivel de estrés.
          const filas = []
          for (const fila of data) {
            const factores = await descifrarDeclaracion(fila, session.access_token)
            filas.push({ id: fila.id, nombre: fila.nombre, edad: fila.edad, creadoEn: fila.creado_en, factores })
            if (Object.keys(factores).length > 0) break
          }
          const vigente = elegirFichaVigente(filas, this.obtenerUltimaDeclaracion())
          if (vigente) {
            // Una ficha guardada en la pestaña que no llegó al servidor se reintenta ahora
            if (vigente.pendienteSync) {
              const r = await insertarFila(vigente, extraerFactores(vigente), session)
              if (!r.error) {
                vigente.id = r.id
                vigente.creadoEn = r.creadoEn
                vigente.origen = 'supabase'
                delete vigente.pendienteSync
              }
            }
            almacenFicha.setItem(LOCAL_STORAGE_KEY, JSON.stringify(vigente))
            return vigente
          }
        }
      }
    } catch (e) {
      // Ignorar error de red y recurrir a la copia de la pestaña
    }

    // 2. Si no hay conexión o no está en Supabase, cargar de la copia de la pestaña
    try {
      const guardado = almacenFicha.getItem(LOCAL_STORAGE_KEY)
      if (guardado) {
        const parsed = aplicarEdadCalculada(JSON.parse(guardado))
        parsed.origen = parsed.id && !parsed.pendienteSync ? 'supabase_cache' : 'local'
        return parsed
      }
    } catch (e) {
      // Fallback
    }

    return null
  },

  /**
   * Limpia los datos del paciente guardados localmente
   */
  obtenerUltimaDeclaracion() {
    try {
      const guardado = almacenFicha.getItem(LOCAL_STORAGE_KEY)
      return guardado ? JSON.parse(guardado) : null
    } catch (e) {
      return null
    }
  },

  limpiarDeclaracionLocal() {
    try {
      almacenFicha.removeItem(LOCAL_STORAGE_KEY)
      return true
    } catch (e) {
      return false
    }
  }
}
