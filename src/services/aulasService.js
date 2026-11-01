import { supabase } from './supabase'

// Caracteres legibles sin letras/números confusos (sin 0, O, 1, I)
const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generarCodigoAula() {
  let codigo = ''
  for (let i = 0; i < 8; i++) {
    const randomIndex = Math.floor(Math.random() * ALFABETO_CODIGO.length)
    codigo += ALFABETO_CODIGO[randomIndex]
  }
  return codigo
}

// Aulas en memoria para desarrollo local
let aulasLocales = [
  {
    id: 'aula-001',
    profesor_id: '00000000-0000-0000-0000-000000000001',
    profesor_nombre: 'Administrador Inicial',
    nombre: 'Fisiología Cardíaca 2026',
    descripcion: 'Grupo práctico de medición de pulso y saturación de oxígeno con ESP32.',
    codigo: 'K8M3X9P2',
    codigo_activo: true,
    max_estudiantes: 100,
    creado_en: '2026-10-28T10:00:00Z'
  },
  {
    id: 'aula-002',
    profesor_id: '00000000-0000-0000-0000-000000000002',
    profesor_nombre: 'Docente de Ciencias',
    nombre: 'Bioingeniería y Señales Médicas',
    descripcion: 'Análisis de señales PPG y detección de picos en tiempo real.',
    codigo: 'R4W7Y2N8',
    codigo_activo: true,
    max_estudiantes: 100,
    creado_en: '2026-10-29T14:30:00Z'
  }
]

// Estudiantes inscritos en aulas (para la vista de alumnos)
let inscripcionesLocales = [
  { aula_id: 'aula-001', usuario_id: '00000000-0000-0000-0000-000000000003', estado: 'activo' }
]

/**
 * RF99: Obtener aulas según el rol y pertenencia
 */
export async function obtenerAulas({ usuarioId, esAdmin, esProfesor }) {
  try {
    let query = supabase.from('aulas').select('*').order('creado_en', { ascending: false })

    // El profesor solo ve sus propias aulas; el admin ve todas (RLS)
    if (!esAdmin && esProfesor) {
      query = query.eq('profesor_id', usuarioId)
    }

    const { data, error } = await query
    if (!error && data && data.length > 0) {
      return { success: true, data }
    }
  } catch (_) {}

  // Fallback local con filtro de privacidad (un profesor no ve aulas de otro)
  if (esAdmin) {
    return { success: true, data: [...aulasLocales] }
  } else if (esProfesor) {
    return { success: true, data: aulasLocales.filter(a => a.profesor_id === usuarioId) }
  } else {
    // Para el estudiante: retorna las aulas donde está inscrito
    const misAulasIds = inscripcionesLocales.filter(i => i.usuario_id === usuarioId).map(i => i.aula_id)
    return { success: true, data: aulasLocales.filter(a => misAulasIds.includes(a.id)) }
  }
}

/**
 * RF99: Crear una nueva aula con código único
 */
export async function crearAula({ nombre, descripcion, profesorId, profesorNombre, tienePermiso }) {
  // Criterio de aceptación: Solo profesor con permiso del RF98 crea aulas
  if (!tienePermiso) {
    return {
      success: false,
      error: 'Permiso denegado: No cuentas con autorización para crear aulas virtuales.'
    }
  }

  if (!nombre || !nombre.trim()) {
    return {
      success: false,
      error: 'El nombre del aula es obligatorio.'
    }
  }

  // Generar código único y verificar que no se repita
  let codigo = generarCodigoAula()
  let intentos = 0
  while (aulasLocales.some(a => a.codigo === codigo) && intentos < 10) {
    codigo = generarCodigoAula()
    intentos++
  }

  const nuevaAula = {
    id: `aula-${Date.now()}`,
    profesor_id: profesorId,
    profesor_nombre: profesorNombre || 'Profesor',
    nombre: nombre.trim(),
    descripcion: (descripcion || '').trim(),
    codigo: codigo,
    codigo_activo: true,
    max_estudiantes: 100,
    creado_en: new Date().toISOString()
  }

  // Intentar guardar en Supabase si la base está conectada
  try {
    const { data, error } = await supabase
      .from('aulas')
      .insert({
        profesor_id: profesorId,
        nombre: nuevaAula.nombre,
        descripcion: nuevaAula.descripcion,
        codigo: nuevaAula.codigo
      })
      .select()

    if (!error && data) {
      nuevaAula.id = data[0].id
    }
  } catch (_) {}

  aulasLocales.unshift(nuevaAula)
  return { success: true, data: nuevaAula }
}