/**
 * Servicio para Datos Declarados del Paciente y Factores de Medición (RF03)
 *
 * Cumple estrictamente con:
 * - Datos obligatorios: nombre, edad (18-120, solo mayores de edad) y nivel de estrés.
 * - Factores que afectan la medición: sueño, cafeína, medicación, actividad previa y condición de salud.
 * - Persistencia en Supabase (tabla declaraciones_paciente con bytea para datos_cifrados)
 * - Persistencia en localStorage para soporte sin conexión (RNF03 - PWA offline).
 */
import { supabase } from './supabase'

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

export const OPCIONES_ACTIVIDAD = [
  { id: 'reposo', label: 'Reposo absoluto (>15 min sentado/quieto)' },
  { id: 'caminata', label: 'Caminata o actividad cotidiana leve' },
  { id: 'ejercicio_moderado', label: 'Ejercicio moderado reciente (trote, bicicleta)' },
  { id: 'ejercicio_intenso', label: 'Ejercicio intenso reciente (carrera, pesas)' },
  { id: 'post_ejercicio', label: 'En fase de recuperación post-esfuerzo' }
]

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
 * Convierte un objeto a formato hex para la columna bytea de PostgreSQL (\x...)
 */
function encodeObjectToByteaHex(obj) {
  try {
    const jsonStr = JSON.stringify(obj)
    const bytes = new TextEncoder().encode(jsonStr)
    return '\\x' + Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  } catch (e) {
    return '\\x7b7d' // '{}'
  }
}

/**
 * Decodifica una cadena hex bytea (\x...) de PostgreSQL a un objeto JavaScript
 */
function decodeByteaHexToObject(byteaStr) {
  if (!byteaStr) return {}
  try {
    if (typeof byteaStr === 'string' && byteaStr.startsWith('\\x')) {
      const hex = byteaStr.slice(2)
      const bytes = new Uint8Array(hex.match(/.{1,2}/g).map(byte => parseInt(byte, 16)))
      return JSON.parse(new TextDecoder().decode(bytes))
    }
    if (typeof byteaStr === 'object') return byteaStr
    return JSON.parse(byteaStr)
  } catch (e) {
    console.warn('No se pudo decodificar datos_cifrados de la declaración:', e)
    return {}
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

    const edadNum = Number(datos.edad)
    if (!datos.edad || isNaN(edadNum) || !Number.isInteger(edadNum) || edadNum < 18 || edadNum > 120) {
      errores.push('La edad es obligatoria y debe ser un número entero entre 18 y 120 años. Solo se miden personas mayores de edad.')
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
  async guardarDeclaracion(datos) {
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

    const factoresSalud = {
      nivelEstres: datos.nivelEstres,
      suenoHoras: datos.suenoHoras || '7_8',
      suenoCalidad: datos.suenoCalidad || 'reparador',
      cafeina: datos.cafeina || 'ninguna',
      medicacionTipo: tipoMed,
      medicacionDetalle: detalleMed,
      medicacion: textoMedicacion,
      actividadPrevia: datos.actividadPrevia || 'reposo',
      condicionSalud: datos.condicionSalud || 'Ninguna conocida',
      observaciones: datos.observaciones ? datos.observaciones.trim() : ''
    }

    const declaracionNormalizada = {
      nombre: datos.nombre.trim(),
      edad: Number(datos.edad),
      ...factoresSalud,
      actualizadoEn: new Date().toISOString()
    }

    // 1. Guardar siempre en localStorage (para uso sin conexión o sin sesión iniciada)
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(declaracionNormalizada))
    } catch (e) {
      console.warn('Error guardando paciente en localStorage:', e)
    }

    // 2. Si hay sesión iniciada en Supabase, guardar en la base de datos
    let declaracionId = null
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        const byteaHex = encodeObjectToByteaHex(factoresSalud)

        const { data, error } = await supabase
          .from('declaraciones_paciente')
          .insert({
            usuario_id: session.user.id,
            nombre: declaracionNormalizada.nombre,
            edad: declaracionNormalizada.edad,
            datos_cifrados: byteaHex,
            clave_version: 1
          })
          .select('id, creado_en')
          .single()

        if (error) {
          console.warn('Aviso: no se pudo sincronizar declaración en Supabase (se mantiene local):', error.message)
        } else if (data) {
          declaracionId = data.id
          declaracionNormalizada.id = data.id
          declaracionNormalizada.creadoEn = data.creado_en
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(declaracionNormalizada))
        }
      }
    } catch (err) {
      console.warn('Error de red al conectar con Supabase para RF03:', err)
    }

    return {
      ok: true,
      data: declaracionNormalizada,
      declaracionId
    }
  },

  /**
   * Obtiene la última declaración activa del paciente (desde Supabase o localStorage)
   */
  async obtenerDeclaracionActiva() {
    // 1. Intentar cargar desde Supabase si el usuario está conectado
    try {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user?.id) {
        const { data, error } = await supabase
          .from('declaraciones_paciente')
          .select('*')
          .eq('usuario_id', session.user.id)
          .order('creado_en', { ascending: false })
          .limit(1)
          .maybeSingle()

        if (!error && data) {
          const factores = decodeByteaHexToObject(data.datos_cifrados)
          const consolidado = {
            id: data.id,
            nombre: data.nombre,
            edad: data.edad,
            ...factores,
            creadoEn: data.creado_en,
            actualizadoEn: data.creado_en,
            origen: 'supabase'
          }
          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(consolidado))
          return consolidado
        }
      }
    } catch (e) {
      // Ignorar error de red y recurrir a localStorage
    }

    // 2. Si no hay conexión o no está en Supabase, cargar de localStorage
    try {
      const guardado = localStorage.getItem(LOCAL_STORAGE_KEY)
      if (guardado) {
        const parsed = JSON.parse(guardado)
        parsed.origen = parsed.id ? 'supabase_cache' : 'local'
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
  limpiarDeclaracionLocal() {
    try {
      localStorage.removeItem(LOCAL_STORAGE_KEY)
      return true
    } catch (e) {
      return false
    }
  }
}
