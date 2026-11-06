/**
 * ============================================================================
 * sensor_pulso · Servicio de Catálogo y Registro de Actividad/Contexto (RF14)
 * ============================================================================
 * Requerimiento RF14: Registrar la actividad o contexto (reposo, movimiento, etc.)
 * y asociarlo a la medición de parámetros fisiológicos.
 * 
 * Vincula:
 * - Tabla `actividades` (PostgreSQL / Supabase)
 * - Columna `actividad_id` en la tabla `mediciones` (RF30)
 * - Rangos adaptativos de frecuencia cardíaca según contexto fisiológico (RF19)
 */
import { supabase } from './supabase.js'

/**
 * Catálogo canónico de actividades según la migración 20261027000800_datos_iniciales.sql
 * Funciona como soporte 100% offline (PWA) y respaldo si no hay conexión a Supabase.
 */
export const ACTIVIDADES_CANONICAS = [
  {
    id: 1,
    codigo: 'reposo',
    nombre: 'Reposo basal',
    label: 'Reposo (Sentado y tranquilo, al menos 1 minuto en calma)',
    descripcion: 'Sentado y tranquilo, al menos 1 minuto',
    icono: 'reposo',
    bpmEsperadoMin: 60,
    bpmEsperadoMax: 100,
    rangoTexto: '60 a 100 BPM en reposo',
    contextoClinico: 'Frecuencia cardíaca basal de referencia normocárdica.'
  },
  {
    id: 2,
    codigo: 'sentado',
    nombre: 'Sentado activo',
    label: 'Sentado activo (Estudiando, conversando o en escritorio)',
    descripcion: 'Sentado, estudiando o conversando',
    icono: 'sentado',
    bpmEsperadoMin: 65,
    bpmEsperadoMax: 105,
    rangoTexto: '65 a 105 BPM activo ligero',
    contextoClinico: 'Tono simpático moderado por interacción cognitiva o social.'
  },
  {
    id: 3,
    codigo: 'caminata',
    nombre: 'Caminata leve',
    label: 'Caminata o desplazamiento cotidiano',
    descripcion: 'Caminata a ritmo normal',
    icono: 'caminata',
    bpmEsperadoMin: 75,
    bpmEsperadoMax: 120,
    rangoTexto: '75 a 120 BPM en movimiento',
    contextoClinico: 'Gasto cardíaco adaptativo por trabajo muscular ambulatorio.'
  },
  {
    id: 4,
    codigo: 'ejercicio_moderado',
    nombre: 'Ejercicio moderado',
    label: 'Ejercicio moderado (Trote suave, bicicleta, subir escaleras)',
    descripcion: 'Trote suave o bicicleta',
    icono: 'ejercicio_moderado',
    bpmEsperadoMin: 90,
    bpmEsperadoMax: 150,
    rangoTexto: '90 a 150 BPM esfuerzo moderado',
    contextoClinico: 'Aumento cronotrópico fisiológico por demanda aeróbica tisular.'
  },
  {
    id: 5,
    codigo: 'ejercicio_intenso',
    nombre: 'Ejercicio intenso',
    label: 'Ejercicio intenso reciente (Carrera, pesas, sprint)',
    descripcion: 'Carrera o esfuerzo alto',
    icono: 'ejercicio_intenso',
    bpmEsperadoMin: 120,
    bpmEsperadoMax: 185,
    rangoTexto: '120 a 185 BPM esfuerzo alto',
    contextoClinico: 'Pico cronotrópico y activación simpática suprarrenal máxima.'
  },
  {
    id: 6,
    codigo: 'post_ejercicio',
    nombre: 'Recuperación post-ejercicio',
    label: 'Recuperación / Post-ejercicio (Primeros minutos tras cesar)',
    descripcion: 'Primeros minutos tras ejercitarse',
    icono: 'post_ejercicio',
    bpmEsperadoMin: 80,
    bpmEsperadoMax: 130,
    rangoTexto: '80 a 130 BPM en descenso',
    contextoClinico: 'Fase de reactivación vagal y aclaramiento de catecolaminas.'
  }
]

/**
 * Obtiene el listado de actividades disponibles (desde Supabase con fallback local).
 * @returns {Promise<Array>} Lista de actividades con id, codigo, nombre y descripcion
 */
export async function obtenerActividades() {
  try {
    const { data, error } = await supabase
      .from('actividades')
      .select('id, codigo, nombre, descripcion')
      .order('id')

    if (!error && Array.isArray(data) && data.length > 0) {
      // Combinar enriqueciendo con metadatos clínicos de ACTIVIDADES_CANONICAS
      return data.map(dbAct => {
        const canonica = ACTIVIDADES_CANONICAS.find(c => c.id === dbAct.id || c.codigo === dbAct.codigo)
        return {
          id: dbAct.id,
          codigo: dbAct.codigo,
          nombre: dbAct.nombre,
          descripcion: dbAct.descripcion || canonica?.descripcion || '',
          label: canonica?.label || dbAct.nombre,
          rangoTexto: canonica?.rangoTexto || 'Frecuencia adaptativa',
          bpmEsperadoMin: canonica?.bpmEsperadoMin || 60,
          bpmEsperadoMax: canonica?.bpmEsperadoMax || 100
        }
      })
    }
  } catch {
    // Modo offline o sin conexión: retorna el catálogo canónico
  }

  return ACTIVIDADES_CANONICAS
}

/**
 * Busca una actividad por su ID numérico.
 * @param {number|string} id 
 * @returns {Object|null}
 */
export function obtenerActividadPorId(id) {
  const numId = Number(id)
  return ACTIVIDADES_CANONICAS.find(a => a.id === numId) || null
}

/**
 * Busca una actividad por su código string ('reposo', 'caminata', etc.).
 * @param {string} codigo 
 * @returns {Object|null}
 */
export function obtenerActividadPorCodigo(codigo) {
  if (!codigo) return null
  const codLimpio = String(codigo).toLowerCase().trim()
  return ACTIVIDADES_CANONICAS.find(a => a.codigo === codLimpio) || null
}

/**
 * Normaliza cualquier entrada (id numérico, código o texto) al ID oficial de la base de datos (1 a 6).
 * Por defecto devuelve 1 ('reposo').
 * @param {number|string} entrada 
 * @returns {number} ID numérico en la tabla public.actividades
 */
export function normalizarActividadId(entrada) {
  if (typeof entrada === 'number' && entrada >= 1 && entrada <= 6) {
    return entrada
  }
  if (!entrada) return 1 // Por defecto reposo

  const str = String(entrada).toLowerCase().trim()
  const encontrada = ACTIVIDADES_CANONICAS.find(a => 
    String(a.id) === str || a.codigo === str || a.nombre.toLowerCase().includes(str)
  )

  return encontrada ? encontrada.id : 1
}

/**
 * Devuelve el nombre amigable de la actividad asociada para desplegar en etiquetas o PDF.
 * @param {number|string} entrada 
 * @returns {string}
 */
export function obtenerNombreActividad(entrada) {
  const act = typeof entrada === 'number' 
    ? obtenerActividadPorId(entrada) 
    : (obtenerActividadPorCodigo(entrada) || obtenerActividadPorId(normalizarActividadId(entrada)))

  return act ? act.nombre : 'Reposo basal'
}
