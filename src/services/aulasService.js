import { supabase } from './supabase'

const ALFABETO_CODIGO = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generarCodigoAula() {
  let codigo = ''
  for (let i = 0; i < 8; i++) {
    const randomIndex = Math.floor(Math.random() * ALFABETO_CODIGO.length)
    codigo += ALFABETO_CODIGO[randomIndex]
  }
  return codigo
}

// Persistencia en localStorage para que las pruebas locales no se pierdan al recargar (F5)
const STORAGE_AULAS = 'sensor_pulso_aulas_locales'
const STORAGE_AULA_ESTUDIANTES = 'sensor_pulso_aula_estudiantes_locales'
const STORAGE_CURSOS = 'sensor_pulso_cursos_locales'
const STORAGE_CURSO_ESTUDIANTES = 'sensor_pulso_curso_estudiantes_locales'

function cargarDeStorage(key, porDefecto) {
  if (typeof window === 'undefined' || !window.localStorage) return porDefecto
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : porDefecto
  } catch (_) {
    return porDefecto
  }
}

function guardarEnStorage(key, data) {
  if (typeof window === 'undefined' || !window.localStorage) return
  try {
    localStorage.setItem(key, JSON.stringify(data))
  } catch (_) {}
}

// Aulas locales
let aulasLocales = cargarDeStorage(STORAGE_AULAS, [
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
])

// Estudiantes inscritos en aulas
let aulaEstudiantesLocales = cargarDeStorage(STORAGE_AULA_ESTUDIANTES, [
  { aula_id: 'aula-001', usuario_id: '00000000-0000-0000-0000-000000000003', nombre: 'Constanza Morales', correo: 'cmorales@alu.unach.cl', estado: 'activo' },
  { aula_id: 'aula-001', usuario_id: '00000000-0000-0000-0000-000000000004', nombre: 'Matías Silva', correo: 'msilva@alu.unach.cl', estado: 'activo' }
])

// Cursos dentro de las aulas (RF101)
let cursosLocales = cargarDeStorage(STORAGE_CURSOS, [
  { id: 'curso-01', aula_id: 'aula-001', nombre: 'Sección 1 - Taller de Señales', creado_en: '2026-10-29T10:00:00Z' },
  { id: 'curso-02', aula_id: 'aula-001', nombre: 'Sección 2 - Práctica con Sensores', creado_en: '2026-10-29T10:30:00Z' }
])

// Estudiantes asignados a cada curso (un estudiante puede estar en varios cursos)
let cursoEstudiantesLocales = cargarDeStorage(STORAGE_CURSO_ESTUDIANTES, [
  { curso_id: 'curso-01', aula_id: 'aula-001', usuario_id: '00000000-0000-0000-0000-000000000003' },
  { curso_id: 'curso-01', aula_id: 'aula-001', usuario_id: '00000000-0000-0000-0000-000000000004' },
  { curso_id: 'curso-02', aula_id: 'aula-001', usuario_id: '00000000-0000-0000-0000-000000000003' }
])

/**
 * Obtener aulas
 */
export async function obtenerAulas({ usuarioId, esAdmin, esProfesor }) {
  try {
    let query = supabase.from('aulas').select('*').order('creado_en', { ascending: false })
    if (!esAdmin && esProfesor) {
      query = query.eq('profesor_id', usuarioId)
    }
    const { data, error } = await query
    if (!error && data && data.length > 0) {
      return { success: true, data }
    }
  } catch (_) {}

  if (esAdmin) {
    return { success: true, data: [...aulasLocales] }
  } else if (esProfesor) {
    return { success: true, data: aulasLocales.filter(a => a.profesor_id === usuarioId) }
  } else {
    const misAulasIds = aulaEstudiantesLocales.filter(i => i.usuario_id === usuarioId && i.estado === 'activo').map(i => i.aula_id)
    return { success: true, data: aulasLocales.filter(a => misAulasIds.includes(a.id)) }
  }
}

/**
 * Crear aula
 */
export async function crearAula({ nombre, descripcion, profesorId, profesorNombre, tienePermiso }) {
  if (!tienePermiso) {
    return { success: false, error: 'Permiso denegado: No cuentas con autorización para crear aulas virtuales.' }
  }
  if (!nombre || !nombre.trim()) {
    return { success: false, error: 'El nombre del aula es obligatorio.' }
  }

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

  try {
    const { data, error } = await supabase.from('aulas').insert({
      profesor_id: profesorId,
      nombre: nuevaAula.nombre,
      descripcion: nuevaAula.descripcion,
      codigo: nuevaAula.codigo
    }).select()
    if (!error && data) nuevaAula.id = data[0].id
  } catch (_) {}

  aulasLocales.unshift(nuevaAula)
  guardarEnStorage(STORAGE_AULAS, aulasLocales)
  return { success: true, data: nuevaAula }
}

// ==========================================
// RF101: GESTIÓN DE CURSOS DENTRO DEL AULA
// ==========================================

/**
 * RF101: Obtener los cursos de un aula con su conteo de estudiantes
 */
export async function obtenerCursosAula(aulaId) {
  try {
    const { data, error } = await supabase
      .from('cursos')
      .select('*, curso_estudiantes(usuario_id)')
      .eq('aula_id', aulaId)
      .order('creado_en', { ascending: true })

    if (!error && data) {
      const mapeados = data.map(c => ({
        ...c,
        cantidad_estudiantes: c.curso_estudiantes?.length || 0,
        estudiantes_ids: (c.curso_estudiantes || []).map(e => e.usuario_id)
      }))
      return { success: true, data: mapeados }
    }
  } catch (_) {}

  // Fallback local
  const cursos = cursosLocales.filter(c => c.aula_id === aulaId).map(c => {
    const asignados = cursoEstudiantesLocales.filter(ce => ce.curso_id === c.id)
    return {
      ...c,
      cantidad_estudiantes: asignados.length,
      estudiantes_ids: asignados.map(a => a.usuario_id)
    }
  })
  return { success: true, data: cursos }
}

/**
 * RF101: Obtener los estudiantes inscritos en el aula
 */
export async function obtenerEstudiantesAula(aulaId) {
  try {
    const { data, error } = await supabase
      .from('aula_estudiantes')
      .select('usuario_id, estado, perfiles(id, nombre, correo)')
      .eq('aula_id', aulaId)
      .eq('estado', 'activo')

    if (!error && data) {
      return {
        success: true,
        data: data.map(d => ({
          usuario_id: d.usuario_id,
          nombre: d.perfiles?.nombre || 'Estudiante',
          correo: d.perfiles?.correo || ''
        }))
      }
    }
  } catch (_) {}

  const estudiantes = aulaEstudiantesLocales.filter(e => e.aula_id === aulaId && e.estado === 'activo')
  return { success: true, data: estudiantes }
}

/**
 * RF101: Crear un curso dentro del aula
 */
export async function crearCurso({ aulaId, nombre, profesorId, esAdmin }) {
  if (!nombre || !nombre.trim()) {
    return { success: false, error: 'El nombre del curso es obligatorio.' }
  }

  // Criterio de aceptación: Solo el dueño del aula o admin puede crear cursos
  const aula = aulasLocales.find(a => a.id === aulaId)
  if (aula && !esAdmin && aula.profesor_id !== profesorId) {
    return { success: false, error: 'No tienes autorización para gestionar cursos en esta aula.' }
  }

  const nombreLimpio = nombre.trim()
  const duplicado = cursosLocales.some(c => c.aula_id === aulaId && c.nombre.toLowerCase() === nombreLimpio.toLowerCase())
  if (duplicado) {
    return { success: false, error: 'Ya existe un curso con este nombre dentro del aula.' }
  }

  const nuevoCurso = {
    id: `curso-${Date.now()}`,
    aula_id: aulaId,
    nombre: nombreLimpio,
    creado_en: new Date().toISOString(),
    cantidad_estudiantes: 0,
    estudiantes_ids: []
  }

  try {
    const { data, error } = await supabase
      .from('cursos')
      .insert({ aula_id: aulaId, nombre: nombreLimpio })
      .select()
    if (!error && data) nuevoCurso.id = data[0].id
  } catch (_) {}

  cursosLocales.push(nuevoCurso)
  guardarEnStorage(STORAGE_CURSOS, cursosLocales)
  return { success: true, data: nuevoCurso }
}

/**
 * RF101: Renombrar un curso existente
 */
export async function renombrarCurso({ cursoId, nuevoNombre, aulaId, profesorId, esAdmin }) {
  if (!nuevoNombre || !nuevoNombre.trim()) {
    return { success: false, error: 'El nuevo nombre no puede estar vacío.' }
  }

  const aula = aulasLocales.find(a => a.id === aulaId)
  if (aula && !esAdmin && aula.profesor_id !== profesorId) {
    return { success: false, error: 'No tienes permiso para modificar este curso.' }
  }

  const nombreLimpio = nuevoNombre.trim()
  try {
    await supabase.from('cursos').update({ nombre: nombreLimpio }).eq('id', cursoId)
  } catch (_) {}

  const curso = cursosLocales.find(c => c.id === cursoId)
  if (curso) {
    curso.nombre = nombreLimpio
    guardarEnStorage(STORAGE_CURSOS, cursosLocales)
  }
  return { success: true }
}

/**
 * RF101: Eliminar un curso (los estudiantes permanecen en el aula)
 */
export async function eliminarCurso({ cursoId, aulaId, profesorId, esAdmin }) {
  const aula = aulasLocales.find(a => a.id === aulaId)
  if (aula && !esAdmin && aula.profesor_id !== profesorId) {
    return { success: false, error: 'No tienes permiso para eliminar este curso.' }
  }

  try {
    await supabase.from('cursos').delete().eq('id', cursoId)
  } catch (_) {}

  // Eliminar asignaciones del curso pero conservar a los estudiantes en el aula
  cursoEstudiantesLocales = cursoEstudiantesLocales.filter(ce => ce.curso_id !== cursoId)
  cursosLocales = cursosLocales.filter(c => c.id !== cursoId)

  guardarEnStorage(STORAGE_CURSO_ESTUDIANTES, cursoEstudiantesLocales)
  guardarEnStorage(STORAGE_CURSOS, cursosLocales)

  return { success: true }
}

/**
 * RF101: Asignar o retirar estudiantes de un curso
 */
export async function actualizarEstudiantesCurso({ cursoId, aulaId, estudiantesIds }) {
  try {
    // En BD: eliminar asignaciones anteriores y reinsertar seleccionados
    await supabase.from('curso_estudiantes').delete().eq('curso_id', cursoId)
    if (estudiantesIds.length > 0) {
      const inserts = estudiantesIds.map(uid => ({ curso_id: cursoId, aula_id: aulaId, usuario_id: uid }))
      await supabase.from('curso_estudiantes').insert(inserts)
    }
  } catch (_) {}

  // Actualizar en memoria local y persistir
  cursoEstudiantesLocales = cursoEstudiantesLocales.filter(ce => ce.curso_id !== cursoId)
  estudiantesIds.forEach(uid => {
    cursoEstudiantesLocales.push({ curso_id: cursoId, aula_id: aulaId, usuario_id: uid })
  })

  guardarEnStorage(STORAGE_CURSO_ESTUDIANTES, cursoEstudiantesLocales)

  return { success: true }
}
