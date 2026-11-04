/**
 * ============================================================================
 * sensor_pulso · Servicio de Sesión de Medición (RF09, RF10, RF11, RF12, RF111)
 * ============================================================================
 *
 * Gestiona el ciclo de vida completo de las sesiones de medición en tiempo real:
 * - RF09: Iniciar una sesión de medición oficial (registro en PostgreSQL/Supabase,
 *         cronómetro clínico de duración, aprovisionamiento de 5 canales y latido).
 * - RF10: Finalizar medición por pérdida de comunicación o acción del usuario.
 * - RF11: Indicar estado de conexión ('activa', 'perdida', 'finalizada').
 * - RF111: Rondas multiusuario de 5 estudiantes (incremento de ronda y liberación).
 * - RNF03: Persistencia local resiliente y restauración automática ante recargas.
 */

import { reactive, computed } from 'vue'
import { supabase } from './supabase.js'
import { canalesState, usuarioActual } from './canalesService.js'

export const LOCAL_SESION_KEY = 'sensor_pulso_sesion_activa_rf09'
export const LOCAL_HISTORIAL_SESIONES_KEY = 'sensor_pulso_sesiones_historial_rf09'

export const ESTADOS_CONEXION = {
  ACTIVA: 'activa',
  PERDIDA: 'perdida',
  FINALIZADA: 'finalizada',
  INACTIVA: 'inactiva'
}

export const MOTIVOS_FIN = {
  USUARIO: 'usuario',
  PERDIDA_COMUNICACION: 'perdida_comunicacion',
  SENSOR_DESCONECTADO: 'sensor_desconectado',
  TIEMPO_LIMITE: 'tiempo_limite'
}

export const ETIQUETAS_ESTADO_CONEXION = {
  activa: 'Conexión Activa',
  perdida: 'Conexión Perdida',
  finalizada: 'Finalizada',
  inactiva: 'En Espera'
}

export const COLORES_ESTADO_CONEXION = {
  activa: {
    texto: '#166534',
    bg: '#dcfce7',
    borde: '#86efac',
    punto: '#16a34a'
  },
  perdida: {
    texto: '#991b1b',
    bg: '#fee2e2',
    borde: '#fca5a5',
    punto: '#dc2626'
  },
  finalizada: {
    texto: '#475569',
    bg: '#f1f5f9',
    borde: '#cbd5e1',
    punto: '#64748b'
  },
  inactiva: {
    texto: '#0369a1',
    bg: '#e0f2fe',
    borde: '#7dd3fc',
    punto: '#0284c7'
  }
}

export const DESCRIPCIONES_ESTADO_CONEXION = {
  activa: 'Enlace bidireccional estable con microcontrolador y sensor óptico MAX30102.',
  perdida: 'Interrupción de telemetría WiFi o señal óptica. Intentando reconectar...',
  finalizada: 'Sesión concluida. No se reciben más paquetes de bioseñales.',
  inactiva: 'Sesión no iniciada. En espera de inicio oficial (RF09).'
}

/**
 * Genera un identificador UUID v4 estándar.
 */
export function generarUuid() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

/**
 * Formatea un número de segundos en formato digital MM:SS o HH:MM:SS
 * @param {number} totalSegundos 
 * @returns {string}
 */
export function formatearDuracion(totalSegundos) {
  const s = Math.max(0, Math.floor(Number(totalSegundos) || 0))
  const horas = Math.floor(s / 3600)
  const minutos = Math.floor((s % 3600) / 60)
  const segs = s % 60

  const mm = String(minutos).padStart(2, '0')
  const ss = String(segs).padStart(2, '0')

  if (horas > 0) {
    const hh = String(horas).padStart(2, '0')
    return `${hh}:${mm}:${ss}`
  }
  return `${mm}:${ss}`
}

/**
 * Estado reactivo global de la sesión de medición (RF09)
 */
export const sesionState = reactive({
  cargando: false,
  error: null,
  sesionActiva: null,
  duracionSegundos: 0,
  canales: [
    { canal: 1, usuario_id: null, usuario_nombre: null, usuario_email: null, asignado_en: null },
    { canal: 2, usuario_id: null, usuario_nombre: null, usuario_email: null, asignado_en: null },
    { canal: 3, usuario_id: null, usuario_nombre: null, usuario_email: null, asignado_en: null },
    { canal: 4, usuario_id: null, usuario_nombre: null, usuario_email: null, asignado_en: null },
    { canal: 5, usuario_id: null, usuario_nombre: null, usuario_email: null, asignado_en: null }
  ]
})

let cronometroInterval = null
let latidoInterval = null

/**
 * Computed helpers
 */
export const estaSesionActiva = computed(() => {
  return sesionState.sesionActiva !== null && sesionState.sesionActiva.estado === ESTADOS_CONEXION.ACTIVA
})

export const duracionCronometroTexto = computed(() => {
  return formatearDuracion(sesionState.duracionSegundos)
})

export const sesionActivaId = computed(() => {
  return sesionState.sesionActiva?.id || null
})

export const estadoConexionActual = computed(() => {
  if (!sesionState.sesionActiva) return ESTADOS_CONEXION.INACTIVA
  return sesionState.sesionActiva.estado || ESTADOS_CONEXION.INACTIVA
})

export const esConexionActiva = computed(() => estadoConexionActual.value === ESTADOS_CONEXION.ACTIVA)
export const esConexionPerdida = computed(() => estadoConexionActual.value === ESTADOS_CONEXION.PERDIDA)
export const esConexionFinalizada = computed(() => estadoConexionActual.value === ESTADOS_CONEXION.FINALIZADA)

/**
 * Cambia el estado de conexión de la sesión activa (RF11)
 * @param {'activa' | 'perdida' | 'finalizada'} nuevoEstado
 * @param {string} [motivo=null]
 */
export async function cambiarEstadoConexion(nuevoEstado, motivo = null) {
  if (!sesionState.sesionActiva) return { ok: false, mensaje: 'No hay sesión activa.' }
  
  sesionState.sesionActiva.estado = nuevoEstado
  if (motivo) sesionState.sesionActiva.motivo_fin = motivo

  try {
    const updateObj = { estado: nuevoEstado }
    if (motivo) updateObj.motivo_fin = motivo
    if (nuevoEstado === ESTADOS_CONEXION.FINALIZADA) updateObj.fin = new Date().toISOString()
    
    await supabase
      .from('sesiones_medicion')
      .update(updateObj)
      .eq('id', sesionState.sesionActiva.id)
  } catch (err) {
    console.warn('[RF11] Fallback local estado conexión:', err?.message)
  }

  return { ok: true, estado: nuevoEstado }
}

/**
 * Inicia el cronómetro en memoria sincronizado con el timestamp de inicio
 */
function iniciarCronometro(inicioIso) {
  detenerCronometro()
  const calcularSegundos = () => {
    if (!inicioIso) return 0
    const diff = Math.max(0, Math.floor((Date.now() - new Date(inicioIso).getTime()) / 1000))
    return diff
  }

  sesionState.duracionSegundos = calcularSegundos()

  cronometroInterval = setInterval(() => {
    sesionState.duracionSegundos = calcularSegundos()
  }, 1000)
}

/**
 * Detiene el cronómetro
 */
function detenerCronometro() {
  if (cronometroInterval) {
    clearInterval(cronometroInterval)
    cronometroInterval = null
  }
}

/**
 * Envía un latido (heartbeat) a Supabase y actualiza último contacto (RF09, RF11)
 */
export async function actualizarLatido(sesionId = sesionState.sesionActiva?.id) {
  if (!sesionId) return

  const ahora = new Date().toISOString()
  if (sesionState.sesionActiva && sesionState.sesionActiva.id === sesionId) {
    sesionState.sesionActiva.ultimo_latido = ahora
  }

  try {
    await supabase
      .from('sesiones_medicion')
      .update({ ultimo_latido: ahora })
      .eq('id', sesionId)
  } catch {
    // Modo offline resiliente (RNF03)
  }
}

/**
 * Inicia el envío periódico de latido (cada 10 segundos)
 */
function iniciarLatido(sesionId) {
  detenerLatido()
  latidoInterval = setInterval(() => {
    if (estaSesionActiva.value) {
      actualizarLatido(sesionId)
    }
  }, 10000)
}

/**
 * Detiene el latido periódico
 */
function detenerLatido() {
  if (latidoInterval) {
    clearInterval(latidoInterval)
    latidoInterval = null
  }
}

/**
 * Obtiene el usuario responsable de iniciar la sesión (autenticado o predeterminado)
 */
async function obtenerUsuarioIniciador(usuarioPersonalizado = null) {
  if (usuarioPersonalizado && usuarioPersonalizado.id) {
    return usuarioPersonalizado
  }

  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (user) {
      return {
        id: user.id,
        email: user.email || usuarioActual.email,
        nombre: user.user_metadata?.nombre || user.user_metadata?.full_name || usuarioActual.nombre,
        rol: user.user_metadata?.rol || usuarioActual.rol
      }
    }
  } catch {
    // fallback
  }

  return {
    id: usuarioActual.id,
    email: usuarioActual.email,
    nombre: usuarioActual.nombre,
    rol: usuarioActual.rol
  }
}

/**
 * Inicializa los 5 canales de una sesión médica (RF12 / RF111)
 */
function inicializarCanales(sesionId, iniciadorId = null, canalIniciador = 1) {
  return [1, 2, 3, 4, 5].map((num) => {
    const esCanalIniciador = iniciadorId && num === canalIniciador
    return {
      sesion_id: sesionId,
      canal: num,
      usuario_id: esCanalIniciador ? iniciadorId : null,
      usuario_nombre: esCanalIniciador ? usuarioActual.nombre : null,
      usuario_email: esCanalIniciador ? usuarioActual.email : null,
      asignado_en: esCanalIniciador ? new Date().toISOString() : null
    }
  })
}

/**
 * ============================================================================
 * RF09: Iniciar una sesión de medición
 * ============================================================================
 * 
 * Crea e inicializa una sesión de medición en PostgreSQL/Supabase:
 * - Define estado = 'activa'
 * - Registra inicio = now() y ultimo_latido = now()
 * - Dispara cronómetro de duración clínica
 * - Aprovisiona los 5 canales libres para la primera ronda (RF111)
 * - Sincroniza estado global con canalesService y persistencia en localStorage
 * 
 * @param {Object} [opciones={}]
 * @param {string} [opciones.dispositivoId=null] UUID del ESP32 vinculado
 * @param {string} [opciones.dispositivoNombre='ESP32-Biomedico-01'] Nombre amigable
 * @param {string} [opciones.aulaId=null] UUID del aula académica si aplica
 * @param {string} [opciones.evaluacionId=null] UUID de evaluación docente si aplica
 * @param {number} [opciones.ronda=1] Número de ronda inicial (RF111)
 * @param {number} [opciones.canalInicial=1] Canal asignado al usuario iniciador
 * @param {Object} [opciones.usuario=null] Usuario que inicia la sesión
 * @returns {Promise<{ok: boolean, sesion: Object, mensaje: string}>}
 */
export async function iniciarSesion(opciones = {}) {
  sesionState.cargando = true
  sesionState.error = null

  try {
    const usuario = await obtenerUsuarioIniciador(opciones.usuario)
    const nuevoId = opciones.id || generarUuid()
    const inicioIso = opciones.inicio || new Date().toISOString()
    const rondaInicial = Number(opciones.ronda) >= 1 ? Number(opciones.ronda) : 1
    const canalInicial = opciones.canalInicial !== undefined ? Number(opciones.canalInicial) : 1

    // Estructura de la sesión según tabla public.sesiones_medicion
    const nuevaSesion = {
      id: nuevoId,
      dispositivo_id: opciones.dispositivoId || null,
      dispositivo_nombre: opciones.dispositivoNombre || 'ESP32-Biomedico-01',
      iniciada_por: usuario.id,
      iniciada_por_nombre: usuario.nombre || usuario.email,
      iniciada_por_email: usuario.email,
      aula_id: opciones.aulaId || null,
      evaluacion_id: opciones.evaluacionId || null,
      ronda: rondaInicial,
      estado: ESTADOS_CONEXION.ACTIVA,
      motivo_fin: null,
      inicio: inicioIso,
      fin: null,
      ultimo_latido: inicioIso
    }

    // Inicializar canales de la sesión
    const canales = inicializarCanales(nuevoId, usuario.id, canalInicial)
    nuevaSesion.canales = canales

    // Persistir en Supabase si está disponible
    try {
      const { data, error } = await supabase
        .from('sesiones_medicion')
        .insert({
          id: nuevaSesion.id,
          dispositivo_id: nuevaSesion.dispositivo_id,
          iniciada_por: nuevaSesion.iniciada_por,
          aula_id: nuevaSesion.aula_id,
          evaluacion_id: nuevaSesion.evaluacion_id,
          ronda: nuevaSesion.ronda,
          estado: ESTADOS_CONEXION.ACTIVA,
          inicio: nuevaSesion.inicio,
          ultimo_latido: nuevaSesion.ultimo_latido
        })
        .select()
        .single()

      if (!error && data) {
        nuevaSesion.id = data.id
      }
    } catch (dbErr) {
      console.warn('[RF09] Supabase offline/fallback:', dbErr?.message)
    }

    // Actualizar estado reactivo
    sesionState.sesionActiva = nuevaSesion
    sesionState.canales = canales

    // Sincronizar con canalesService (RF12 / RF111)
    canalesState.sesionActivaId = nuevaSesion.id
    canalesState.sesionActiva = {
      id: nuevaSesion.id,
      dispositivo_id: nuevaSesion.dispositivo_id,
      dispositivo_nombre: nuevaSesion.dispositivo_nombre,
      ronda: nuevaSesion.ronda,
      estado: nuevaSesion.estado,
      inicio: nuevaSesion.inicio
    }
    canalesState.canales = canales.map(c => ({
      canal: c.canal,
      usuario_id: c.usuario_id,
      usuario_nombre: c.usuario_nombre,
      usuario_email: c.usuario_email,
      asignado_en: c.asignado_en
    }))

    // Iniciar cronómetro y latido
    iniciarCronometro(inicioIso)
    iniciarLatido(nuevaSesion.id)

    // Guardar en localStorage para tolerancia ante recargas (RNF03)
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem(LOCAL_SESION_KEY, JSON.stringify(nuevaSesion))
      }
    } catch {}

    return {
      ok: true,
      sesion: nuevaSesion,
      mensaje: `Sesión de medición #${nuevaSesion.id.substring(0, 8)} iniciada con éxito.`
    }
  } catch (err) {
    sesionState.error = err.message || 'Error al iniciar la sesión de medición.'
    return {
      ok: false,
      error: sesionState.error,
      mensaje: sesionState.error
    }
  } finally {
    sesionState.cargando = false
  }
}

/**
 * ============================================================================
 * RF10 / RF11: Finalizar la sesión de medición
 * ============================================================================
 * 
 * Finaliza la sesión activa registrando fecha de fin, motivo y deteniendo el cronómetro.
 * 
 * @param {Object} [params={}]
 * @param {string} [params.motivo='usuario'] Motivo: 'usuario', 'perdida_comunicacion', 'sensor_desconectado'
 * @param {string} [params.sesionId=null]
 * @returns {Promise<{ok: boolean, sesion: Object}>}
 */
export async function finalizarSesion(opciones = {}) {
  const opts = typeof opciones === 'string' ? { motivo: opciones } : (opciones || {})
  const motivo = opts.motivo || MOTIVOS_FIN.USUARIO
  const targetId = opts.sesionId || sesionState.sesionActiva?.id
  if (!targetId || !sesionState.sesionActiva) {
    return { ok: false, mensaje: 'No hay ninguna sesión de medición activa para finalizar.' }
  }

  sesionState.cargando = true
  const finIso = new Date().toISOString()

  try {
    // Actualizar en base de datos
    try {
      await supabase
        .from('sesiones_medicion')
        .update({
          estado: ESTADOS_CONEXION.FINALIZADA,
          fin: finIso,
          motivo_fin: motivo
        })
        .eq('id', targetId)
    } catch (err) {
      console.warn('[RF10] Error actualizando fin en Supabase:', err?.message)
    }

    // Detener timers
    detenerCronometro()
    detenerLatido()

    // Actualizar objeto en memoria
    sesionState.sesionActiva.estado = ESTADOS_CONEXION.FINALIZADA
    sesionState.sesionActiva.fin = finIso
    sesionState.sesionActiva.motivo_fin = motivo

    canalesState.sesionActiva.estado = ESTADOS_CONEXION.FINALIZADA

    // Guardar en historial de sesiones local
    try {
      if (typeof localStorage !== 'undefined') {
        const rawHist = localStorage.getItem(LOCAL_HISTORIAL_SESIONES_KEY)
        const hist = rawHist ? JSON.parse(rawHist) : []
        hist.unshift({ ...sesionState.sesionActiva, duracionSegundos: sesionState.duracionSegundos })
        localStorage.setItem(LOCAL_HISTORIAL_SESIONES_KEY, JSON.stringify(hist.slice(0, 30)))
        localStorage.removeItem(LOCAL_SESION_KEY)
      }
    } catch {}

    const resultado = { ...sesionState.sesionActiva }
    return {
      ok: true,
      sesion: resultado,
      mensaje: `Sesión #${targetId.substring(0, 8)} finalizada correctamente (${motivo}).`
    }
  } finally {
    sesionState.cargando = false
  }
}

/**
 * ============================================================================
 * RF11: Marcar conexión como perdida (temporaria o previa a desconexión)
 * ============================================================================
 */
export async function marcarConexionPerdida(motivo = MOTIVOS_FIN.PERDIDA_COMUNICACION) {
  if (!sesionState.sesionActiva) return

  sesionState.sesionActiva.estado = ESTADOS_CONEXION.PERDIDA
  sesionState.sesionActiva.motivo_fin = motivo

  try {
    await supabase
      .from('sesiones_medicion')
      .update({ estado: ESTADOS_CONEXION.PERDIDA, motivo_fin: motivo })
      .eq('id', sesionState.sesionActiva.id)
  } catch {}
}

/**
 * ============================================================================
 * RF111: Avanzar a la siguiente ronda de 5 estudiantes
 * ============================================================================
 */
export async function avanzarRondaSesion() {
  if (!sesionState.sesionActiva) return { ok: false, mensaje: 'No hay sesión activa.' }

  const nuevaRonda = (sesionState.sesionActiva.ronda || 1) + 1
  sesionState.sesionActiva.ronda = nuevaRonda

  // Limpiar canales para el siguiente grupo de 5
  sesionState.canales.forEach(c => {
    c.usuario_id = null
    c.usuario_nombre = null
    c.usuario_email = null
    c.asignado_en = null
  })

  // Sincronizar con canalesService
  canalesState.sesionActiva.ronda = nuevaRonda
  canalesState.canales.forEach(c => {
    c.usuario_id = null
    c.usuario_nombre = null
    c.usuario_email = null
    c.asignado_en = null
  })

  try {
    await supabase
      .from('sesiones_medicion')
      .update({ ronda: nuevaRonda })
      .eq('id', sesionState.sesionActiva.id)

    await supabase
      .from('sesion_canales')
      .update({ usuario_id: null, asignado_en: null })
      .eq('sesion_id', sesionState.sesionActiva.id)
  } catch {}

  // Actualizar localStorage
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(LOCAL_SESION_KEY, JSON.stringify(sesionState.sesionActiva))
    }
  } catch {}

  return { ok: true, ronda: nuevaRonda }
}

/**
 * ============================================================================
 * Restaurar sesión activa ante recarga del navegador (PWA / RNF03)
 * ============================================================================
 */
export function restaurarSesionActiva() {
  try {
    if (typeof localStorage === 'undefined') return null

    const guardadaRaw = localStorage.getItem(LOCAL_SESION_KEY)
    if (!guardadaRaw) return null

    const sesion = JSON.parse(guardadaRaw)
    if (!sesion || !sesion.id || sesion.estado !== ESTADOS_CONEXION.ACTIVA) {
      return null
    }

    // Verificar si la sesión es muy antigua (> 12 horas)
    const inicioMs = new Date(sesion.inicio).getTime()
    if (isNaN(inicioMs) || (Date.now() - inicioMs) > 12 * 3600 * 1000) {
      localStorage.removeItem(LOCAL_SESION_KEY)
      return null
    }

    sesionState.sesionActiva = sesion
    if (Array.isArray(sesion.canales)) {
      sesionState.canales = sesion.canales
    }

    iniciarCronometro(sesion.inicio)
    iniciarLatido(sesion.id)

    // Sincronizar canalesState
    canalesState.sesionActivaId = sesion.id
    canalesState.sesionActiva = {
      id: sesion.id,
      dispositivo_id: sesion.dispositivo_id,
      dispositivo_nombre: sesion.dispositivo_nombre,
      ronda: sesion.ronda || 1,
      estado: sesion.estado,
      inicio: sesion.inicio
    }

    return sesion
  } catch (err) {
    console.warn('[RF09] Error al restaurar sesión activa:', err)
    return null
  }
}

/**
 * Obtiene la sesión activa actual
 */
export function obtenerSesionActiva() {
  return sesionState.sesionActiva
}

// Inicialización de restauración al cargar el módulo en el cliente
if (typeof window !== 'undefined') {
  restaurarSesionActiva()
}
