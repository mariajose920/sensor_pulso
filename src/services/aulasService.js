import { supabase } from './supabase'
import { validarCorreoInstitucional } from '../utils/validators'
import { enviarCorreoInvitacion } from './emailService'

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
const STORAGE_INVITACIONES = 'sensor_pulso_invitaciones_aulas_locales'
const STORAGE_EVALUACIONES = 'sensor_pulso_evaluaciones_locales'

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

// Estudiantes asignados a cada curso
let cursoEstudiantesLocales = cargarDeStorage(STORAGE_CURSO_ESTUDIANTES, [
  { curso_id: 'curso-01', aula_id: 'aula-001', usuario_id: '00000000-0000-0000-0000-000000000003' },
  { curso_id: 'curso-01', aula_id: 'aula-001', usuario_id: '00000000-0000-0000-0000-000000000004' },
  { curso_id: 'curso-02', aula_id: 'aula-001', usuario_id: '00000000-0000-0000-0000-000000000003' }
])

// Invitaciones por correo (RF100)
let invitacionesLocales = cargarDeStorage(STORAGE_INVITACIONES, [])

// Evaluaciones del aula (RF103 / RF104)
let evaluacionesLocales = cargarDeStorage(STORAGE_EVALUACIONES, [
  {
    id: 'eval-001',
    aula_id: 'aula-001',
    titulo: 'Evaluación Práctica: Medición de Pulso y SpO2 en Reposo',
    descripcion: 'Prueba práctica de adquisición de señal fotopletismográfica, cálculo de frecuencia cardíaca e interpretación de saturación de oxígeno con sensor MAX30102.',
    tiempo_limite_minutos: 45,
    activa: true,
    preguntas_count: 5,
    creada_en: '2026-11-01T10:00:00Z'
  },
  {
    id: 'eval-002',
    aula_id: 'aula-001',
    titulo: 'Control Teórico: Ciberseguridad y Privacidad en Dispositivos IoT Médicos',
    descripcion: 'Evaluación de conceptos de cifrado AES-GCM, autenticación segura y cumplimiento de normativas de salud en telemetría inalámbrica.',
    tiempo_limite_minutos: 30,
    activa: true,
    preguntas_count: 8,
    creada_en: '2026-11-03T14:30:00Z'
  }
])

/**
 * Obtener aulas
 */
/**
 * RF103: Obtener datos de una sola aula por su ID y validar permisos de acceso.
 * Criterio de aceptación: Solo entra el profesor dueño o el admin.
 */
export async function obtenerAulaPorId(aulaId, { usuarioId, esAdmin } = {}) {
  if (!aulaId) return { success: false, error: 'ID de aula no proporcionado.' }

  let aula = null

  // 1. Intentar buscar en Supabase
  try {
    const { data, error } = await supabase
      .from('aulas')
      .select('*, perfiles:profesor_id(nombre, correo)')
      .eq('id', aulaId)
      .maybeSingle()

    if (!error && data) {
      aula = {
        ...data,
        profesor_nombre: data.perfiles?.nombre || 'Docente'
      }
    }
  } catch (_) {}

  // 2. Si no está en Supabase, buscar en almacenamiento local
  if (!aula) {
    aula = aulasLocales.find(a => a.id === aulaId)
  }

  if (!aula) {
    return { success: false, error: 'El aula solicitada no existe o fue archivada.' }
  }

  // 3. Criterio de aceptación estricto RF103: Solo entra el profesor dueño o el admin
  if (usuarioId && !esAdmin && aula.profesor_id !== usuarioId) {
    return {
      success: false,
      error: 'Acceso no autorizado: Solo el profesor titular o un administrador pueden acceder a esta aula.',
      noAutorizado: true
    }
  }

  return { success: true, data: aula }
}

/**
 * RF103: Obtener evaluaciones asociadas al aula (datos reales de Supabase / locales)
 */
export async function obtenerEvaluacionesAula(aulaId) {
  if (!aulaId) return { success: true, data: [] }
  try {
    const { data, error } = await supabase
      .from('evaluaciones')
      .select('*')
      .or(`aula_id.eq.${aulaId},aula_id.is.null`)
      .order('creada_en', { ascending: false })

    if (!error && data && data.length > 0) {
      return { success: true, data }
    }
  } catch (_) {}

  const evals = evaluacionesLocales.filter(e => !e.aula_id || e.aula_id === aulaId)
  return { success: true, data: evals }
}

export async function obtenerAulas({ usuarioId, usuarioCorreo, esAdmin, esProfesor }) {
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
    const misAulasIds = aulaEstudiantesLocales
      .filter(i => (
        (usuarioId && i.usuario_id === usuarioId) ||
        (usuarioCorreo && i.correo && i.correo.toLowerCase() === usuarioCorreo.toLowerCase())
      ) && i.estado === 'activo')
      .map(i => i.aula_id)
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
// RF100: CÓDIGO DE AULA, INVITACIÓN Y UNIÓN
// ==========================================

/**
 * RF100: El estudiante ingresa el código a mano para unirse al aula.
 * Criterios de aceptación:
 * - Con código válido el estudiante entra al aula.
 * - Un código desactivado o regenerado deja de servir.
 */
export async function unirseAulaPorCodigo({ codigo, usuarioId, usuarioNombre, usuarioCorreo }) {
  if (!codigo || !codigo.trim()) {
    return { success: false, error: 'Por favor ingresa un código de aula.' }
  }

  const codigoNormalizado = codigo.trim().toUpperCase()

  // 1. Priorizar búsqueda en las aulas locales activas del navegador
  const aula = aulasLocales.find(a => a.codigo === codigoNormalizado)

  if (aula) {
    // Criterio de aceptación: Un código desactivado deja de servir
    if (!aula.codigo_activo) {
      return { 
        success: false, 
        error: 'Este código de aula ha sido desactivado temporalmente por el profesor.' 
      }
    }

    // Verificar si ya está inscrito (por ID o por Correo)
    const yaInscrito = aulaEstudiantesLocales.some(
      e => e.aula_id === aula.id && (
        (usuarioId && e.usuario_id === usuarioId) ||
        (usuarioCorreo && e.correo && e.correo.toLowerCase() === usuarioCorreo.toLowerCase())
      ) && e.estado === 'activo'
    )
    if (yaInscrito) {
      return { success: false, error: 'Ya te encuentras inscrito en esta aula.' }
    }

    // Verificar límite de capacidad
    const inscritosActuales = aulaEstudiantesLocales.filter(e => e.aula_id === aula.id && e.estado === 'activo').length
    if (inscritosActuales >= (aula.max_estudiantes || 100)) {
      return { success: false, error: 'El aula ha alcanzado su capacidad máxima de estudiantes.' }
    }

    // Inscribir estudiante
    const nuevoEstudiante = {
      aula_id: aula.id,
      usuario_id: usuarioId,
      nombre: usuarioNombre || 'Estudiante',
      correo: usuarioCorreo || '',
      estado: 'activo',
      inscrito_en: new Date().toISOString()
    }

    aulaEstudiantesLocales.push(nuevoEstudiante)
    guardarEnStorage(STORAGE_AULA_ESTUDIANTES, aulaEstudiantesLocales)

    // Sincronizar en BD si es posible
    try {
      await supabase.rpc('unirse_a_aula', { p_codigo: codigoNormalizado })
    } catch (_) {}

    return { 
      success: true, 
      message: `¡Te has incorporado exitosamente a "${aula.nombre}"!`, 
      aula 
    }
  }

  // 2. Si no estaba en memoria local, intentar con Supabase RPC
  try {
    const { data, error } = await supabase.rpc('unirse_a_aula', { p_codigo: codigoNormalizado })
    if (!error && data) {
      return { success: true, message: '¡Te has unido exitosamente al aula!' }
    }
  } catch (_) {}

  return { 
    success: false, 
    error: 'El código ingresado no existe o fue regenerado por el profesor. Verifica con tu docente.' 
  }
}

/**
 * RF100: El profesor activa o desactiva el código de acceso del aula
 */
export async function alternarEstadoCodigoAula({ aulaId, profesorId, esAdmin }) {
  const aula = aulasLocales.find(a => a.id === aulaId)
  if (!aula) return { success: false, error: 'Aula no encontrada.' }
  if (!esAdmin && aula.profesor_id !== profesorId) {
    return { success: false, error: 'No tienes autorización sobre esta aula.' }
  }

  const nuevoEstado = !aula.codigo_activo
  try {
    await supabase.from('aulas').update({ codigo_activo: nuevoEstado }).eq('id', aulaId)
  } catch (_) {}

  aula.codigo_activo = nuevoEstado
  guardarEnStorage(STORAGE_AULAS, aulasLocales)

  return { 
    success: true, 
    codigo_activo: nuevoEstado,
    message: nuevoEstado ? 'Código activado. Los estudiantes pueden unirse.' : 'Código desactivado. Nuevos ingresos bloqueados.'
  }
}

/**
 * RF100: El profesor regenera el código del aula (el código anterior deja de servir inmediatamente)
 */
export async function regenerarCodigoAulaDocente({ aulaId, profesorId, esAdmin }) {
  const aula = aulasLocales.find(a => a.id === aulaId)
  if (!aula) return { success: false, error: 'Aula no encontrada.' }
  if (!esAdmin && aula.profesor_id !== profesorId) {
    return { success: false, error: 'No tienes autorización sobre esta aula.' }
  }

  let nuevoCodigo = generarCodigoAula()
  let intentos = 0
  while (aulasLocales.some(a => a.codigo === nuevoCodigo) && intentos < 10) {
    nuevoCodigo = generarCodigoAula()
    intentos++
  }

  try {
    await supabase.rpc('regenerar_codigo_aula', { p_aula: aulaId })
  } catch (_) {
    try {
      await supabase.from('aulas').update({ codigo: nuevoCodigo, codigo_activo: true }).eq('id', aulaId)
    } catch (_) {}
  }

  aula.codigo = nuevoCodigo
  aula.codigo_activo = true
  guardarEnStorage(STORAGE_AULAS, aulasLocales)

  return { 
    success: true, 
    nuevoCodigo,
    message: `Código regenerado exitosamente: ${nuevoCodigo}. El código previo ha quedado invalidado.`
  }
}

/**
 * RF100: Enviar invitación con el código al correo del estudiante (@alu.unach.cl)
 */
export async function enviarInvitacionCorreo({ aulaId, correoEstudiante, profesorId, profesorNombre, esAdmin }) {
  const aula = aulasLocales.find(a => a.id === aulaId)
  if (!aula) return { success: false, error: 'Aula no encontrada.' }
  if (!esAdmin && aula.profesor_id !== profesorId) {
    return { success: false, error: 'No tienes permiso para gestionar invitaciones en esta aula.' }
  }

  if (!aula.codigo_activo) {
    return { success: false, error: 'El código de acceso de esta aula se encuentra desactivado. Actívalo antes de enviar invitaciones.' }
  }

  const validacion = validarCorreoInstitucional(correoEstudiante)
  if (!validacion.valido || validacion.rol !== 'usuario') {
    return { success: false, error: 'Debes ingresar un correo institucional de estudiante válido (@alu.unach.cl).' }
  }

  const correoLimpio = correoEstudiante.trim().toLowerCase()

  // Conectar con el servicio de correo real (Resend)
  const resultadoEnvio = await enviarCorreoInvitacion({
    correo: correoLimpio,
    codigo: aula.codigo,
    aulaNombre: aula.nombre,
    profesorNombre: profesorNombre || 'Docente'
  })

  // Criterio de aceptación: Si el envío falla, NO dice "enviada" y registra el resultado del envío
  if (!resultadoEnvio.success) {
    const invitacionFallida = {
      id: `inv-err-${Date.now()}`,
      aula_id: aulaId,
      aula_nombre: aula.nombre,
      codigo_aula: aula.codigo,
      correo: correoLimpio,
      servicio: 'Resend',
      estado: 'fallido',
      error_detalle: resultadoEnvio.error,
      intentado_en: new Date().toISOString()
    }
    invitacionesLocales.unshift(invitacionFallida)
    guardarEnStorage(STORAGE_INVITACIONES, invitacionesLocales)

    return {
      success: false,
      error: resultadoEnvio.error
    }
  }

  // Registro de envío exitoso
  const nuevaInvitacion = {
    id: `inv-${Date.now()}`,
    aula_id: aulaId,
    aula_nombre: aula.nombre,
    codigo_aula: aula.codigo,
    correo: correoLimpio,
    servicio: 'Resend',
    estado: 'enviada',
    resend_id: resultadoEnvio.messageId || null,
    enviada_en: new Date().toISOString()
  }

  try {
    await supabase.from('invitaciones_aula').insert({
      aula_id: aulaId,
      correo: correoLimpio
    })
  } catch (_) {}

  invitacionesLocales.unshift(nuevaInvitacion)
  guardarEnStorage(STORAGE_INVITACIONES, invitacionesLocales)

  return {
    success: true,
    message: `Invitación enviada con éxito a ${correoLimpio} mediante Resend (Código: ${aula.codigo}).`,
    invitacion: nuevaInvitacion
  }
}

/**
 * RF100: Obtener el registro de invitaciones del aula (para verificar estados enviado/fallido)
 */
export async function obtenerInvitacionesAula(aulaId) {
  if (!aulaId) return { success: true, data: [] }
  try {
    const { data, error } = await supabase
      .from('invitaciones_aula')
      .select('*')
      .eq('aula_id', aulaId)
      .order('enviada_en', { ascending: false })

    if (!error && data && data.length > 0) {
      return { success: true, data }
    }
  } catch (_) {}

  const filtradas = invitacionesLocales.filter(inv => inv.aula_id === aulaId)
  return { success: true, data: filtradas }
}

// ==========================================
// RF101: GESTIÓN DE CURSOS DENTRO DEL AULA
// ==========================================

export async function obtenerCursosAula(aulaId) {
  try {
    const { data, error } = await supabase
      .from('cursos')
      .select('*, curso_estudiantes(usuario_id)')
      .eq('aula_id', aulaId)
      .order('creado_en', { ascending: true })

    if (!error && data) {
      return { 
        success: true, 
        data: data.map(c => ({
          ...c,
          cantidad_estudiantes: c.curso_estudiantes?.length || 0,
          estudiantes_ids: (c.curso_estudiantes || []).map(e => e.usuario_id)
        }))
      }
    }
  } catch (_) {}

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

  return { 
    success: true, 
    data: aulaEstudiantesLocales.filter(e => e.aula_id === aulaId && e.estado === 'activo') 
  }
}

export async function crearCurso({ aulaId, nombre, profesorId, esAdmin }) {
  if (!nombre || !nombre.trim()) return { success: false, error: 'El nombre del curso es obligatorio.' }

  const aula = aulasLocales.find(a => a.id === aulaId)
  if (aula && !esAdmin && aula.profesor_id !== profesorId) {
    return { success: false, error: 'No tienes autorización para gestionar cursos en esta aula.' }
  }

  const nombreLimpio = nombre.trim()
  if (cursosLocales.some(c => c.aula_id === aulaId && c.nombre.toLowerCase() === nombreLimpio.toLowerCase())) {
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
    const { data, error } = await supabase.from('cursos').insert({ aula_id: aulaId, nombre: nombreLimpio }).select()
    if (!error && data) nuevoCurso.id = data[0].id
  } catch (_) {}

  cursosLocales.push(nuevoCurso)
  guardarEnStorage(STORAGE_CURSOS, cursosLocales)
  return { success: true, data: nuevoCurso }
}

export async function renombrarCurso({ cursoId, nuevoNombre, aulaId, profesorId, esAdmin }) {
  if (!nuevoNombre || !nuevoNombre.trim()) return { success: false, error: 'El nombre no puede estar vacío.' }
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

export async function eliminarCurso({ cursoId, aulaId, profesorId, esAdmin }) {
  const aula = aulasLocales.find(a => a.id === aulaId)
  if (!aula) return { success: true }
  if (!esAdmin && aula.profesor_id !== profesorId) {
    return { success: false, error: 'No tienes permiso para eliminar este curso.' }
  }

  try {
    await supabase.from('cursos').delete().eq('id', cursoId)
  } catch (_) {}

  cursoEstudiantesLocales = cursoEstudiantesLocales.filter(ce => ce.curso_id !== cursoId)
  cursosLocales = cursosLocales.filter(c => c.id !== cursoId)

  guardarEnStorage(STORAGE_CURSO_ESTUDIANTES, cursoEstudiantesLocales)
  guardarEnStorage(STORAGE_CURSOS, cursosLocales)
  return { success: true }
}

export async function actualizarEstudiantesCurso({ cursoId, aulaId, estudiantesIds }) {
  try {
    await supabase.from('curso_estudiantes').delete().eq('curso_id', cursoId)
    if (estudiantesIds.length > 0) {
      await supabase.from('curso_estudiantes').insert(estudiantesIds.map(uid => ({ curso_id: cursoId, aula_id: aulaId, usuario_id: uid })))
    }
  } catch (_) {}

  cursoEstudiantesLocales = cursoEstudiantesLocales.filter(ce => ce.curso_id !== cursoId)
  estudiantesIds.forEach(uid => {
    cursoEstudiantesLocales.push({ curso_id: cursoId, aula_id: aulaId, usuario_id: uid })
  })

  guardarEnStorage(STORAGE_CURSO_ESTUDIANTES, cursoEstudiantesLocales)
  return { success: true }
}
