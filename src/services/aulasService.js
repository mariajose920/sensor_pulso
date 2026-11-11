import { supabase } from './supabase.js'
import { validarCorreoInstitucional } from '../utils/validators.js'
import { enviarCorreoInvitacion } from './emailService.js'
import { escaparHtml, sanitizarContenidoUsuario } from './proteccionWebService.js'

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
const STORAGE_INTENTOS_EVALUACIONES = 'sensor_pulso_intentos_evaluaciones_locales'

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

// Intentos de evaluaciones (RF117: Visibilidad docente sin datos de salud)
let intentosEvaluacionesLocales = cargarDeStorage(STORAGE_INTENTOS_EVALUACIONES, [
  {
    id: 'intento-001',
    aula_id: 'aula-001',
    evaluacion_id: 'eval-001',
    usuario_id: '00000000-0000-0000-0000-000000000003',
    estudiante_nombre: 'Constanza Morales',
    estudiante_correo: 'cmorales@alu.unach.cl',
    puntaje: 90.0,
    puntaje_maximo: 100.0,
    porcentaje: 90.0,
    nivel: 'logrado',
    inicio: '2026-11-04T11:00:00Z',
    fin: '2026-11-04T11:35:00Z',
    respuestas: [
      { pregunta_id: 'p-1', pregunta: 'Longitud de onda infrarroja del sensor MAX30102', respuesta: '880 nm', es_correcta: true, puntaje: 20 },
      { pregunta_id: 'p-2', pregunta: 'Componente que absorbe mayor luz infrarroja', respuesta: 'Oxihemoglobina (HbO2)', es_correcta: true, puntaje: 20 },
      { pregunta_id: 'p-3', pregunta: 'Calculo del indice de perfusion (PI)', respuesta: 'Relacion entre componente pulsatil AC y continuo DC', es_correcta: true, puntaje: 20 },
      { pregunta_id: 'p-4', pregunta: 'Rango normocardico segun la AHA en reposo', respuesta: '60 a 100 BPM', es_correcta: true, puntaje: 20 },
      { pregunta_id: 'p-5', pregunta: 'Definicion de hipoxia leve en SpO2', respuesta: '90% a 94%', es_correcta: false, puntaje: 10 }
    ],
    medicion: {
      id: 'med-eval-001',
      bpm: 72.5,
      spo2: 98.2,
      indicePerfusion: 4.8,
      dentroDeRango: true,
      fecha: '2026-11-04T11:20:00Z',
      frecuenciaHz: 100,
      muestrasPpg: [0.15, 0.25, 0.55, 0.9, 0.98, 0.75, 0.45, 0.3, 0.38, 0.25, 0.18, 0.15]
    }
  },
  {
    id: 'intento-002',
    aula_id: 'aula-001',
    evaluacion_id: 'eval-001',
    usuario_id: '00000000-0000-0000-0000-000000000004',
    estudiante_nombre: 'Matias Silva',
    estudiante_correo: 'msilva@alu.unach.cl',
    puntaje: 70.0,
    puntaje_maximo: 100.0,
    porcentaje: 70.0,
    nivel: 'medianamente_logrado',
    inicio: '2026-11-04T11:05:00Z',
    fin: '2026-11-04T11:38:00Z',
    respuestas: [
      { pregunta_id: 'p-1', pregunta: 'Longitud de onda infrarroja del sensor MAX30102', respuesta: '880 nm', es_correcta: true, puntaje: 20 },
      { pregunta_id: 'p-2', pregunta: 'Componente que absorbe mayor luz infrarroja', respuesta: 'Hemoglobina desoxigenada (Hb)', es_correcta: false, puntaje: 0 },
      { pregunta_id: 'p-3', pregunta: 'Calculo del indice de perfusion (PI)', respuesta: 'Relacion entre componente pulsatil AC y continuo DC', es_correcta: true, puntaje: 20 },
      { pregunta_id: 'p-4', pregunta: 'Rango normocardico segun la AHA en reposo', respuesta: '60 a 100 BPM', es_correcta: true, puntaje: 20 },
      { pregunta_id: 'p-5', pregunta: 'Definicion de hipoxia leve en SpO2', respuesta: 'Menor a 85%', es_correcta: false, puntaje: 10 }
    ],
    medicion: {
      id: 'med-eval-002',
      bpm: 76.0,
      spo2: 97.0,
      indicePerfusion: 4.2,
      dentroDeRango: true,
      fecha: '2026-11-04T11:35:00Z',
      frecuenciaHz: 100,
      muestrasPpg: [0.12, 0.22, 0.5, 0.88, 0.95, 0.72, 0.42, 0.28, 0.36, 0.22, 0.16, 0.13]
    }
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
 * RF103 / RF105: Obtener evaluaciones asociadas al aula (datos reales de Supabase / creadas)
 */
/**
 * RF103 / RF104: Obtener evaluaciones asociadas al aula con sus asignaciones reales
 */
export async function obtenerEvaluacionesAula(aulaId) {
  if (!aulaId) return { success: true, data: [] }

  const { data, error } = await supabase
    .from('evaluaciones')
    .select('*, asignaciones:evaluacion_asignaciones(*)')
    .eq('aula_id', aulaId)
    .order('creado_en', { ascending: false })

  if (error) {
    return { success: false, error: error.message, data: [] }
  }

  return {
    success: true,
    data: data.map(evaluacion => ({
      ...evaluacion,
      activa: ['programada', 'en_curso'].includes(evaluacion.estado),
      creada_en: evaluacion.creado_en
    }))
  }
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
    profesor_nombre: escaparHtml(sanitizarContenidoUsuario(profesorNombre || 'Profesor', 100)),
    nombre: escaparHtml(sanitizarContenidoUsuario(nombre.trim(), 100)),
    descripcion: escaparHtml(sanitizarContenidoUsuario(descripcion || '', 500)),
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

  const nombreLimpio = escaparHtml(sanitizarContenidoUsuario(nombre.trim(), 100))
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

  const nombreLimpio = escaparHtml(sanitizarContenidoUsuario(nuevoNombre.trim(), 100))
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

/**
 * RF102: Retirar a uno o varios estudiantes del aula
 */
export async function retirarEstudiantesAula({ aulaId, estudiantesIds, profesorId, esAdmin }) {
  if (!aulaId) return { success: false, error: 'ID de aula no proporcionado.' }
  if (!estudiantesIds || estudiantesIds.length === 0) {
    return { success: false, error: 'No se seleccionaron estudiantes para retirar.' }
  }

  // 1. Llamar a la función RPC retirar_estudiantes en Supabase (si está disponible)
  try {
    const { data, error } = await supabase.rpc('retirar_estudiantes', {
      p_aula: aulaId,
      p_usuarios: estudiantesIds
    })
    if (error) throw error
  } catch (err) {
    console.warn('Aviso: RPC retirar_estudiantes ejecutando en modo local:', err.message)
    try {
      await supabase
        .from('aula_estudiantes')
        .update({
          estado: 'retirado',
          retirado_en: new Date().toISOString(),
          retirado_por: profesorId
        })
        .eq('aula_id', aulaId)
        .in('usuario_id', estudiantesIds)

      await supabase
        .from('curso_estudiantes')
        .delete()
        .eq('aula_id', aulaId)
        .in('usuario_id', estudiantesIds)
    } catch (_) {}
  }

  // 2. Actualizar almacenamiento local para pruebas inmediatas y modo offline
  aulaEstudiantesLocales = aulaEstudiantesLocales.map(e => {
    if (e.aula_id === aulaId && estudiantesIds.includes(e.usuario_id)) {
      return {
        ...e,
        estado: 'retirado',
        retirado_en: new Date().toISOString(),
        retirado_por: profesorId
      }
    }
    return e
  })
  guardarEnStorage(STORAGE_AULA_ESTUDIANTES, aulaEstudiantesLocales)

  // Desvincular de los cursos de esa aula
  cursoEstudiantesLocales = cursoEstudiantesLocales.filter(
    ce => !(ce.aula_id === aulaId && estudiantesIds.includes(ce.usuario_id))
  )
  guardarEnStorage(STORAGE_CURSO_ESTUDIANTES, cursoEstudiantesLocales)

  // 3. Registrar en auditoría
  try {
    const STORAGE_AUDITORIA = 'sensor_pulso_auditoria_roles'
    const logs = JSON.parse(localStorage.getItem(STORAGE_AUDITORIA) || '[]')
    logs.unshift({
      id: `audit-${Date.now()}`,
      accion: 'retiro_estudiantes',
      tabla: 'aulas',
      registro_id: aulaId,
      actor_id: profesorId,
      detalles: {
        usuarios_retirados: estudiantesIds,
        cantidad: estudiantesIds.length
      },
      creado_en: new Date().toISOString()
    })
    localStorage.setItem(STORAGE_AUDITORIA, JSON.stringify(logs))
  } catch (_) {}

  return {
    success: true,
    count: estudiantesIds.length,
    message: `Se retiró exitosamente a ${estudiantesIds.length} estudiante(s) del aula.`
  }
}

/**
 * RF117: Visibilidad del profesor sobre evaluaciones asignadas.
 * Ve de cada estudiante de su aula SOLO:
 * - Nombre del estudiante
 * - Calificacion (puntaje y porcentaje)
 * - Nivel de logro (logrado, medianamente_logrado, no_logrado)
 * - Respuestas de la evaluacion asignada
 * - Mediciones asignadas a la evaluacion (BPM, SpO2, senal PPG)
 *
 * RESTRICCIONES DE SEGURIDAD (RF116/RF117):
 * - NUNCA incluye datos personales o de salud declarados (estres, sueno, cafeina, medicacion).
 * - Si un estudiante fue retirado del aula (RF102), el profesor pierde de inmediato el acceso.
 */
export async function obtenerIntentosEvaluacionAula(aulaId, evaluacionId) {
  if (!aulaId || !evaluacionId) return { success: true, data: [] }

  // 1. Obtener los estudiantes actualmente activos en el aula (RF102/RF117)
  const resEstudiantes = await obtenerEstudiantesAula(aulaId)
  const estudiantesActivos = resEstudiantes.data || []
  const idsActivos = new Set(estudiantesActivos.map(e => e.usuario_id))

  // 2. Intentar consultar en Supabase
  try {
    const { data, error } = await supabase
      .from('intentos_evaluacion')
      .select(`
        id,
        evaluacion_id,
        usuario_id,
        puntaje,
        puntaje_maximo,
        porcentaje,
        nivel,
        inicio,
        fin,
        perfiles:usuario_id(id, nombre, correo),
        mediciones:medicion_id(id, bpm, spo2, creado_en, dentro_de_rango),
        respuestas(id, pregunta_id, respuesta, es_correcta, puntaje, preguntas(texto))
      `)
      .eq('evaluacion_id', evaluacionId)

    if (!error && data && data.length > 0) {
      // Filtrar estrictamente solo estudiantes que sigan activos en el aula (RF102/RF117)
      const filtrados = data
        .filter(intento => idsActivos.has(intento.usuario_id))
        .map(intento => ({
          id: intento.id,
          evaluacion_id: intento.evaluacion_id,
          usuario_id: intento.usuario_id,
          estudiante_nombre: intento.perfiles?.nombre || 'Estudiante',
          estudiante_correo: intento.perfiles?.correo || '',
          puntaje: Number(intento.puntaje) || 0,
          puntaje_maximo: Number(intento.puntaje_maximo) || 100,
          porcentaje: Number(intento.porcentaje) || 0,
          nivel: intento.nivel || 'no_logrado',
          inicio: intento.inicio,
          fin: intento.fin,
          respuestas: (intento.respuestas || []).map(r => ({
            pregunta_id: r.pregunta_id,
            pregunta: r.preguntas?.texto || 'Pregunta de evaluacion',
            respuesta: typeof r.respuesta === 'object' ? JSON.stringify(r.respuesta) : String(r.respuesta),
            es_correcta: Boolean(r.es_correcta),
            puntaje: Number(r.puntaje) || 0
          })),
          medicion: intento.mediciones ? {
            id: intento.mediciones.id,
            bpm: intento.mediciones.bpm,
            spo2: intento.mediciones.spo2,
            dentroDeRango: intento.mediciones.dentro_de_rango,
            fecha: intento.mediciones.creado_en
          } : null
        }))

      return { success: true, data: filtrados }
    }
  } catch (_) {}

  // 3. Fallback local offline/demostracion
  const locales = intentosEvaluacionesLocales.filter(
    i => i.aula_id === aulaId && i.evaluacion_id === evaluacionId && idsActivos.has(i.usuario_id)
  ).map(i => {
    // Sanitizacion estricta: asegurar que nunca viajen campos de salud del RF116
    const { datos_cifrados, condicionSalud, medicacion, sueno, cafeina, estres, ...limpio } = i
    return limpio
  })

  return { success: true, data: locales }
}

/**
 * RF117: Estadisticas agregadas del aula sobre datos no cifrados, sin identificar a la persona.
 */
export async function obtenerEstadisticasEvaluacionAula(aulaId, evaluacionId) {
  const resIntentos = await obtenerIntentosEvaluacionAula(aulaId, evaluacionId)
  const intentos = resIntentos.data || []

  const resEst = await obtenerEstudiantesAula(aulaId)
  const totalEstudiantes = (resEst.data || []).length
  const totalEvaluados = intentos.length

  if (totalEvaluados === 0) {
    return {
      success: true,
      data: {
        totalEstudiantes,
        totalEvaluados: 0,
        promedioCalificacion: 0,
        tasaAprobacion: 0,
        distribucionNiveles: {
          logrado: 0,
          medianamente_logrado: 0,
          no_logrado: 0
        },
        promedioBpm: null,
        promedioSpo2: null
      }
    }
  }

  const sumaNotas = intentos.reduce((acc, i) => acc + (i.porcentaje || 0), 0)
  const promedioCalificacion = parseFloat((sumaNotas / totalEvaluados).toFixed(1))

  const niveles = {
    logrado: intentos.filter(i => i.nivel === 'logrado').length,
    medianamente_logrado: intentos.filter(i => i.nivel === 'medianamente_logrado').length,
    no_logrado: intentos.filter(i => i.nivel === 'no_logrado').length
  }

  const tasaAprobacion = parseFloat(
    (((niveles.logrado + niveles.medianamente_logrado) / totalEvaluados) * 100).toFixed(1)
  )

  const medicionesConBpm = intentos.filter(i => i.medicion && i.medicion.bpm > 0)
  const sumaBpm = medicionesConBpm.reduce((acc, i) => acc + i.medicion.bpm, 0)
  const promedioBpm = medicionesConBpm.length > 0
    ? parseFloat((sumaBpm / medicionesConBpm.length).toFixed(1))
    : null

  const medicionesConSpo2 = intentos.filter(i => i.medicion && i.medicion.spo2 > 0)
  const sumaSpo2 = medicionesConSpo2.reduce((acc, i) => acc + i.medicion.spo2, 0)
  const promedioSpo2 = medicionesConSpo2.length > 0
    ? parseFloat((sumaSpo2 / medicionesConSpo2.length).toFixed(1))
    : null

  return {
    success: true,
    data: {
      totalEstudiantes,
      totalEvaluados,
      promedioCalificacion,
      tasaAprobacion,
      distribucionNiveles: niveles,
      promedioBpm,
      promedioSpo2
    }
  }
}
