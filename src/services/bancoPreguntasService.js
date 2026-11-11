import { supabase } from './supabase.js'

const STORAGE_BANCO = 'sensor_pulso_banco_preguntas_locales'
const STORAGE_PERMISOS_PROF = 'sensor_pulso_permisos_profesores_locales'

export const TIPOS_PREGUNTA_BANCO = [
  { valor: 'opcion_multiple', etiqueta: 'Opción Múltiple' },
  { valor: 'verdadero_falso', etiqueta: 'Verdadero / Falso' },
  { valor: 'numerica', etiqueta: 'Numérica (con tolerancia)' },
  { valor: 'abierta', etiqueta: 'Respuesta Abierta' }
]

const PREGUNTAS_SEMILLA_BANCO = [
  {
    id: 'banco-seed-01',
    autor_id: '00000000-0000-0000-0000-000000000002',
    autor_nombre: 'Docente de Ciencias',
    enunciado: '¿Cuál es el rango normocárdico de frecuencia cardíaca en reposo para un adulto sano?',
    tipo: 'opcion_multiple',
    opciones: [
      { id: 'a', texto: '60 a 100 BPM' },
      { id: 'b', texto: '35 a 55 BPM' },
      { id: 'c', texto: '110 a 140 BPM' },
      { id: 'd', texto: '140 a 180 BPM' }
    ],
    respuesta_correcta: 'a',
    explicacion: 'Según la AHA, en reposo el rango normal adulto va de 60 a 100 latidos por minuto.',
    puntaje: 10,
    etiquetas: ['bpm', 'reposo', 'fisiologia'],
    compartida: true,
    revision_global: 'aprobada',
    creado_en: '2026-11-01T10:00:00Z'
  },
  {
    id: 'banco-seed-02',
    autor_id: '00000000-0000-0000-0000-000000000002',
    autor_nombre: 'Docente de Ciencias',
    enunciado: '¿La saturación arterial normal de oxígeno (SpO₂) en reposo se ubica entre 95% y 100%?',
    tipo: 'verdadero_falso',
    opciones: null,
    respuesta_correcta: true,
    explicacion: 'Valores sostenidos bajo 95% en reposo a nivel del mar requieren evaluación clínica.',
    puntaje: 10,
    etiquetas: ['spo2', 'oximetria'],
    compartida: true,
    revision_global: 'aprobada',
    creado_en: '2026-11-01T10:05:00Z'
  },
  {
    id: 'banco-seed-03',
    autor_id: '00000000-0000-0000-0000-000000000001',
    autor_nombre: 'Administrador Inicial',
    enunciado: '¿Qué longitudes de onda utiliza el sensor MAX30102 para medir SpO₂?',
    tipo: 'opcion_multiple',
    opciones: [
      { id: 'a', texto: '660 nm (rojo) y 880 nm (infrarrojo)' },
      { id: 'b', texto: '450 nm (azul) y 520 nm (verde)' },
      { id: 'c', texto: 'Solo ultrasonido de 2 MHz' },
      { id: 'd', texto: 'Rayos X de baja dosis' }
    ],
    respuesta_correcta: 'a',
    explicacion: 'La oxihemoglobina y desoxihemoglobina absorben de manera distinta 660 nm y 880 nm.',
    puntaje: 10,
    etiquetas: ['max30102', 'spo2', 'ppg'],
    compartida: true,
    revision_global: 'aprobada',
    creado_en: '2026-11-01T10:10:00Z'
  }
]

let memoriaBancoLocal = null

function cargarBancoLocal() {
  if (typeof window === 'undefined' || !window.localStorage) {
    if (!memoriaBancoLocal) memoriaBancoLocal = [...PREGUNTAS_SEMILLA_BANCO]
    return [...memoriaBancoLocal]
  }
  try {
    const raw = localStorage.getItem(STORAGE_BANCO)
    if (!raw) {
      localStorage.setItem(STORAGE_BANCO, JSON.stringify(PREGUNTAS_SEMILLA_BANCO))
      return [...PREGUNTAS_SEMILLA_BANCO]
    }
    return JSON.parse(raw)
  } catch (_) {
    return [...PREGUNTAS_SEMILLA_BANCO]
  }
}

function guardarBancoLocal(lista) {
  if (typeof window === 'undefined' || !window.localStorage) {
    memoriaBancoLocal = [...lista]
    return
  }
  try {
    localStorage.setItem(STORAGE_BANCO, JSON.stringify(lista))
  } catch (_) {}
}

/**
 * Detecta si existe una sesión JWT real de Supabase Auth (evita falsos éxitos locales).
 */
async function tieneSesionSupabaseReal() {
  try {
    const { data } = await supabase.auth.getSession()
    return Boolean(data?.session?.access_token)
  } catch (_) {
    return false
  }
}

function mapearPreguntaSupabase(p) {
  const clave = Array.isArray(p.preguntas_claves) ? p.preguntas_claves[0] : p.preguntas_claves
  return {
    ...p,
    autor_nombre: p.perfiles?.nombre || 'Docente',
    respuesta_correcta: clave?.correcta ?? null,
    explicacion: clave?.explicacion || '',
    origen: 'supabase'
  }
}

function cumpleFiltrosBanco(p, { usuarioId, alcance, etiquetaNorm }) {
  const esPropia = usuarioId && p.autor_id === usuarioId
  const esCompartidaAprobada = !!p.compartida && p.revision_global === 'aprobada'

  if (alcance === 'personal' && !esPropia) return false
  if (alcance === 'compartido' && !esCompartidaAprobada) return false
  if (alcance === 'ambos' && !esPropia && !esCompartidaAprobada) return false

  if (etiquetaNorm) {
    const tags = (p.etiquetas || []).map(t => String(t).toLowerCase())
    if (!tags.some(t => t.includes(etiquetaNorm))) return false
  }
  return true
}

export function normalizarEtiquetas(etiquetasInput) {
  if (Array.isArray(etiquetasInput)) {
    return [...new Set(etiquetasInput.map(e => String(e).trim().toLowerCase()).filter(Boolean))]
  }
  if (typeof etiquetasInput === 'string') {
    return [...new Set(etiquetasInput.split(',').map(e => e.trim().toLowerCase()).filter(Boolean))]
  }
  return []
}

/**
 * Verifica si el docente o admin tiene permiso para compartir en el banco global (RF98 / RF108).
 */
export async function verificarPermisoCompartirBanco({ usuarioId, esAdmin = false }) {
  if (esAdmin) return true
  if (!usuarioId) return false
  try {
    const { data, error } = await supabase
      .from('permisos_profesor')
      .select('compartir_banco')
      .eq('profesor_id', usuarioId)
      .maybeSingle()
    if (!error && data) return !!data.compartir_banco
  } catch (_) {}

  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      const permisos = JSON.parse(localStorage.getItem(STORAGE_PERMISOS_PROF) || '{}')
      if (permisos[usuarioId] && typeof permisos[usuarioId].compartir_banco === 'boolean') {
        return permisos[usuarioId].compartir_banco
      }
    } catch (_) {}
  }
  return false
}

/**
 * RF108: Listar preguntas del banco (personal del docente y/o compartidas aprobadas).
 */
export async function listarBancoPreguntas({ usuarioId, alcance = 'ambos', etiqueta = '' } = {}) {
  const etiquetaNorm = (etiqueta || '').trim().toLowerCase()
  const conSesion = await tieneSesionSupabaseReal()

  if (conSesion) {
    const { data, error } = await supabase
      .from('preguntas')
      .select('*, perfiles:autor_id(nombre), preguntas_claves(correcta, explicacion)')
      .is('leccion_id', null)
      .order('creado_en', { ascending: false })

    if (error) {
      return { success: false, origen: 'supabase', error: error.message, data: [] }
    }

    const remotas = (data || [])
      .map(mapearPreguntaSupabase)
      .filter(p => cumpleFiltrosBanco(p, { usuarioId, alcance, etiquetaNorm }))
    return { success: true, origen: 'supabase', data: remotas }
  }

  const locales = cargarBancoLocal()
    .map(p => ({ ...p, origen: 'local' }))
    .filter(p => cumpleFiltrosBanco(p, { usuarioId, alcance, etiquetaNorm }))
  return { success: true, origen: 'local', data: locales }
}

/**
 * RF108: Guardar una pregunta nueva en el banco personal (y opcionalmente compartirla).
 */
export async function crearPreguntaBanco({
  autorId,
  autorNombre = 'Docente',
  enunciado,
  tipo = 'opcion_multiple',
  opciones = null,
  respuestaCorrecta = null,
  explicacion = '',
  puntaje = 10,
  etiquetas = [],
  compartida = false,
  puedeGestionar = true,
  puedeCompartir = true
}) {
  if (!puedeGestionar) {
    return { success: false, error: 'Solo profesores o administradores pueden crear preguntas en el banco.' }
  }
  if (!enunciado || !enunciado.trim()) {
    return { success: false, error: 'El enunciado de la pregunta es obligatorio.' }
  }
  if (compartida && !puedeCompartir) {
    return { success: false, error: 'No cuentas con permiso para compartir preguntas en el banco común (RF98).' }
  }

  const opcionesLimpias =
    tipo === 'opcion_multiple'
      ? (Array.isArray(opciones) && opciones.length > 0
          ? opciones.filter(o => o && String(o.texto || '').trim())
          : [])
      : null

  if (tipo === 'opcion_multiple' && (!opcionesLimpias || opcionesLimpias.length < 2)) {
    return { success: false, error: 'Las preguntas de opción múltiple requieren al menos 2 alternativas.' }
  }

  const tagsLimpias = normalizarEtiquetas(etiquetas)
  const puntajeNum = Math.max(1, Number(puntaje) || 10)
  const revision = compartida ? 'aprobada' : 'no_solicitada'

  const payload = {
    autor_id: autorId,
    enunciado: enunciado.trim(),
    tipo,
    opciones: opcionesLimpias,
    puntaje: puntajeNum,
    etiquetas: tagsLimpias,
    compartida: !!compartida,
    revision_global: revision
  }

  const conSesion = await tieneSesionSupabaseReal()
  if (conSesion) {
    const { data, error } = await supabase.from('preguntas').insert(payload).select().single()
    if (error || !data) {
      return {
        success: false,
        origen: 'supabase',
        error: error?.message || 'No se pudo guardar la pregunta en Supabase.'
      }
    }

    if (tipo !== 'abierta' && respuestaCorrecta !== null && respuestaCorrecta !== undefined && respuestaCorrecta !== '') {
      const { error: errClave } = await supabase.from('preguntas_claves').upsert({
        pregunta_id: data.id,
        correcta: respuestaCorrecta,
        explicacion: (explicacion || '').trim() || null
      })
      if (errClave) {
        return {
          success: false,
          origen: 'supabase',
          error: `Pregunta creada, pero falló guardar la respuesta clave: ${errClave.message}`
        }
      }
    }

    return {
      success: true,
      origen: 'supabase',
      data: {
        ...data,
        autor_nombre: autorNombre,
        respuesta_correcta: respuestaCorrecta,
        explicacion: (explicacion || '').trim(),
        origen: 'supabase'
      }
    }
  }

  const local = {
    ...payload,
    id: `banco-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    autor_nombre: autorNombre,
    respuesta_correcta: respuestaCorrecta,
    explicacion: (explicacion || '').trim(),
    creado_en: new Date().toISOString(),
    origen: 'local'
  }
  const actual = cargarBancoLocal()
  guardarBancoLocal([local, ...actual])
  return { success: true, origen: 'local', data: local }
}

/**
 * RF108: Cambiar estado compartido/privado de una pregunta propia del banco.
 */
export async function actualizarCompartirPregunta({ preguntaId, compartida, autorId, esAdmin = false, puedeCompartir = true }) {
  if (compartida && !puedeCompartir && !esAdmin) {
    return { success: false, error: 'No tienes permiso para compartir en el banco común.' }
  }
  const revision = compartida ? 'aprobada' : 'no_solicitada'
  const conSesion = await tieneSesionSupabaseReal()

  if (conSesion) {
    let query = supabase
      .from('preguntas')
      .update({ compartida: !!compartida, revision_global: revision })
      .eq('id', preguntaId)
    if (!esAdmin && autorId) query = query.eq('autor_id', autorId)
    const { data, error } = await query.select().single()
    if (error || !data) {
      return {
        success: false,
        origen: 'supabase',
        error: error?.message || 'No se pudo actualizar el estado en Supabase.'
      }
    }
    return { success: true, origen: 'supabase', data: { ...data, origen: 'supabase' } }
  }

  const actual = cargarBancoLocal()
  const idx = actual.findIndex(p => p.id === preguntaId && (esAdmin || p.autor_id === autorId))
  if (idx === -1) {
    return { success: false, error: 'No se encontró la pregunta o no tienes permiso para editarla.' }
  }
  actual[idx] = { ...actual[idx], compartida: !!compartida, revision_global: revision }
  guardarBancoLocal(actual)
  return { success: true, origen: 'local', data: actual[idx] }
}

/**
 * RF108: Eliminar una pregunta del banco (solo autor o administrador).
 */
export async function eliminarPreguntaBanco({ preguntaId, autorId, esAdmin = false }) {
  const conSesion = await tieneSesionSupabaseReal()

  if (conSesion) {
    let query = supabase.from('preguntas').delete().eq('id', preguntaId)
    if (!esAdmin && autorId) query = query.eq('autor_id', autorId)
    const { error } = await query
    if (error) {
      if (error.code === '23503') {
        return {
          success: false,
          origen: 'supabase',
          error: 'Esta pregunta ya está vinculada a una evaluación y no puede eliminarse.'
        }
      }
      return { success: false, origen: 'supabase', error: error.message }
    }
    return { success: true, origen: 'supabase' }
  }

  const actual = cargarBancoLocal()
  const existe = actual.some(p => p.id === preguntaId && (esAdmin || p.autor_id === autorId))
  if (!existe) return { success: false, error: 'No puedes eliminar esta pregunta.' }
  guardarBancoLocal(actual.filter(p => p.id !== preguntaId))
  return { success: true, origen: 'local' }
}

/**
 * RF108: Seleccionar N preguntas al azar sin repetir desde el banco (personal, compartido o ambos).
 */
export async function seleccionarPreguntasAlAzar({
  usuarioId,
  cantidad = 3,
  alcance = 'ambos',
  etiqueta = '',
  excluirIds = [],
  evaluacionId = null,
  preguntasDisponibles = null
}) {
  const n = Math.max(1, parseInt(cantidad, 10) || 1)
  const excluidas = new Set(excluirIds || [])
  const conSesion = !Array.isArray(preguntasDisponibles) && await tieneSesionSupabaseReal()

  // Si la evaluación ya existe en Supabase (UUID), invocar el RPC oficial del servidor
  if (evaluacionId && /^[0-9a-f-]{36}$/i.test(String(evaluacionId)) && conSesion) {
    const tags = etiqueta?.trim() ? normalizarEtiquetas(etiqueta) : null
    const { data, error } = await supabase.rpc('armar_preguntas_aleatorias', {
      p_eval: evaluacionId,
      p_cantidad: n,
      p_etiquetas: tags,
      p_origen: alcance
    })
    if (error) {
      return { success: false, origen: 'supabase', error: error.message }
    }
    return { success: true, origen: 'supabase', insertadas: data || 0, data: [] }
  }

  if (conSesion) {
    const tags = etiqueta?.trim() ? normalizarEtiquetas(etiqueta) : null
    const uuidsExcluir = [...excluidas].filter(id => /^[0-9a-f-]{36}$/i.test(String(id)))
    const { data, error } = await supabase.rpc('seleccionar_preguntas_banco_azar', {
      p_cantidad: n,
      p_origen: alcance,
      p_etiquetas: tags,
      p_excluir: uuidsExcluir
    })
    if (error) {
      return { success: false, origen: 'supabase', error: error.message }
    }
    if (!Array.isArray(data) || data.length === 0) {
      return {
        success: false,
        origen: 'supabase',
        error: 'No hay preguntas disponibles en Supabase con esos filtros (o ya están todas agregadas).'
      }
    }
    return {
      success: true,
      origen: 'supabase',
      data: data.map(p => ({ ...p, origen: 'supabase' }))
    }
  }

  let candidatas = Array.isArray(preguntasDisponibles) ? [...preguntasDisponibles] : null
  if (!candidatas) {
    const resLista = await listarBancoPreguntas({ usuarioId, alcance, etiqueta })
    candidatas = resLista.data || []
  } else {
    const etiquetaNorm = (etiqueta || '').trim().toLowerCase()
    candidatas = candidatas.filter(p => cumpleFiltrosBanco(p, { usuarioId, alcance, etiquetaNorm }))
  }

  const elegibles = candidatas.filter(p => !excluidas.has(p.id))
  if (elegibles.length === 0) {
    return { success: false, error: 'No hay preguntas disponibles en el banco con esos filtros (o ya están todas agregadas).' }
  }

  // Mezcla Fisher-Yates sin repetidos
  const copia = [...elegibles]
  for (let i = copia.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copia[i], copia[j]] = [copia[j], copia[i]]
  }

  return {
    success: true,
    origen: 'local',
    data: copia.slice(0, Math.min(n, copia.length))
  }
}