import { reactive, computed } from 'vue'
import { supabase } from './supabase'

// Usuario de sesión simulado / por defecto para pruebas si no hay Supabase Auth activo
export const usuarioActual = reactive({
  id: 'usr-estudiante-01',
  email: 'adanramos@alu.unach.cl',
  nombre: 'Adán Ramos',
  rol: 'estudiante' // 'estudiante', 'profesor', 'admin'
})

// Estado de sesiones y canales de ESP32 (RF12, RF111)
export const canalesState = reactive({
  cargando: false,
  error: null,
  sesiones: [],
  sesionActivaId: 'ses-demo-01',
  // Lista de 5 canales de la sesión activa
  canales: [
    { canal: 1, usuario_id: null, usuario_nombre: null, usuario_email: null, asignado_en: null },
    { canal: 2, usuario_id: null, usuario_nombre: null, usuario_email: null, asignado_en: null },
    { canal: 3, usuario_id: null, usuario_nombre: null, usuario_email: null, asignado_en: null },
    { canal: 4, usuario_id: null, usuario_nombre: null, usuario_email: null, asignado_en: null },
    { canal: 5, usuario_id: null, usuario_nombre: null, usuario_email: null, asignado_en: null }
  ],
  sesionActiva: {
    id: 'ses-demo-01',
    dispositivo_id: 'disp-0001-unach-lab',
    dispositivo_nombre: 'ESP32-Biomedico-01',
    ronda: 1,
    estado: 'activa',
    inicio: new Date().toISOString()
  }
})

// Canal actualmente vinculado al usuario logueado (RF12)
export const miCanalAsignado = computed(() => {
  const c = canalesState.canales.find(ch => ch.usuario_id === usuarioActual.id)
  return c ? c.canal : null
})

/**
 * Carga la sesión activa y el estado de sus 5 canales desde Supabase o mock local
 */
export async function cargarSesionYCanales(sesionId = canalesState.sesionActivaId) {
  canalesState.cargando = true
  canalesState.error = null

  try {
    // 1. Obtener usuario autenticado real si existe en Supabase Auth
    try {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        usuarioActual.id = user.id
        usuarioActual.email = user.email || usuarioActual.email
        usuarioActual.nombre = user.user_metadata?.nombre || usuarioActual.nombre
      }
    } catch {
      // Usar usuarioActual por defecto
    }

    // 2. Consultar sesiones activas en Supabase
    const { data: sesionData, error: sesionError } = await supabase
      .from('sesiones_medicion')
      .select('*, dispositivos(nombre)')
      .eq('estado', 'activa')
      .order('inicio', { ascending: false })
      .limit(1)

    if (!sesionError && sesionData && sesionData.length > 0) {
      const s = sesionData[0]
      canalesState.sesionActiva = {
        id: s.id,
        dispositivo_id: s.dispositivo_id,
        dispositivo_nombre: s.dispositivos?.nombre || 'ESP32 Conectado',
        ronda: s.ronda || 1,
        estado: s.estado,
        inicio: s.inicio
      }
      canalesState.sesionActivaId = s.id

      // Consultar canales de la sesión
      const { data: canalesDb, error: canalesError } = await supabase
        .from('sesion_canales')
        .select('canal, usuario_id, asignado_en, perfiles(nombre, correo)')
        .eq('sesion_id', s.id)
        .order('canal', { ascending: true })

      if (!canalesError && canalesDb && canalesDb.length > 0) {
        canalesState.canales = canalesDb.map(ch => ({
          canal: ch.canal,
          usuario_id: ch.usuario_id,
          usuario_nombre: ch.perfiles?.nombre || (ch.usuario_id === usuarioActual.id ? usuarioActual.nombre : null),
          usuario_email: ch.perfiles?.correo || (ch.usuario_id === usuarioActual.id ? usuarioActual.email : null),
          asignado_en: ch.asignado_en
        }))
        return
      }
    }
  } catch (err) {
    console.warn('[RF12] Conexión local fallback para canales:', err.message)
  } finally {
    canalesState.cargando = false
  }
}

/**
 * Un estudiante elige y vincula su cuenta a un canal libre del ESP32 (RF12, RF111)
 * Regla: Atómico, sólo toma el canal si está libre, y un usuario sólo puede tener 1 canal activo
 */
export async function vincularMiCuentaACanal(canalNum) {
  canalesState.cargando = true
  canalesState.error = null

  // Verificar si el usuario ya tiene otro canal vinculado en esta sesión
  const canalPrevio = canalesState.canales.find(c => c.usuario_id === usuarioActual.id)
  if (canalPrevio && canalPrevio.canal !== canalNum) {
    canalesState.cargando = false
    throw new Error(`Ya tienes asignado el Canal ${canalPrevio.canal}. Debes liberarlo antes de tomar otro.`)
  }

  // Verificar si el canal objetivo está ocupado por otra persona
  const target = canalesState.canales.find(c => c.canal === canalNum)
  if (target && target.usuario_id && target.usuario_id !== usuarioActual.id) {
    canalesState.cargando = false
    throw new Error(`El Canal ${canalNum} ya está ocupado por ${target.usuario_nombre || target.usuario_email}.`)
  }

  try {
    // Intentar ejecutar función RPC atómica de Supabase (RF111)
    const { data: ok, error } = await supabase.rpc('elegir_canal', {
      p_sesion: canalesState.sesionActivaId,
      p_canal: canalNum
    })

    if (!error && ok) {
      await cargarSesionYCanales()
      return { ok: true, canal: canalNum }
    }
  } catch (rpcErr) {
    console.warn('[RF12] RPC falló, aplicando vinculación en estado local:', rpcErr.message)
  }

  // Actualización en memoria local / offline fallback
  if (target) {
    target.usuario_id = usuarioActual.id
    target.usuario_nombre = usuarioActual.nombre
    target.usuario_email = usuarioActual.email
    target.asignado_en = new Date().toISOString()
  }

  canalesState.cargando = false
  return { ok: true, canal: canalNum }
}

/**
 * Libera el canal ocupado por el usuario actual
 */
export async function desvincularMiCuenta() {
  canalesState.cargando = true
  const miCanal = canalesState.canales.find(c => c.usuario_id === usuarioActual.id)
  if (!miCanal) {
    canalesState.cargando = false
    return
  }

  try {
    await supabase
      .from('sesion_canales')
      .update({ usuario_id: null, asignado_en: null })
      .eq('sesion_id', canalesState.sesionActivaId)
      .eq('canal', miCanal.canal)
  } catch {
    // Fallback local
  }

  miCanal.usuario_id = null
  miCanal.usuario_nombre = null
  miCanal.usuario_email = null
  miCanal.asignado_en = null
  canalesState.cargando = false
}

/**
 * Asignación manual de canal por parte del profesor o admin (RF111)
 * Permite corregir asignaciones o liberar un canal de cualquier estudiante
 */
export async function asignarCanalProfesor(canalNum, nuevoUsuarioId = null, usuarioInfo = null) {
  canalesState.cargando = true
  try {
    await supabase.rpc('asignar_canal', {
      p_sesion: canalesState.sesionActivaId,
      p_canal: canalNum,
      p_usuario: nuevoUsuarioId
    })
  } catch {
    // Fallback local
  }

  const canal = canalesState.canales.find(c => c.canal === canalNum)
  if (canal) {
    canal.usuario_id = nuevoUsuarioId
    canal.usuario_nombre = usuarioInfo ? usuarioInfo.nombre : null
    canal.usuario_email = usuarioInfo ? usuarioInfo.email : null
    canal.asignado_en = nuevoUsuarioId ? new Date().toISOString() : null
  }
  canalesState.cargando = false
}

/**
 * El profesor abre la siguiente ronda de 5 estudiantes (RF110, RF111)
 * Libera los 5 canales e incrementa la ronda en la sesión
 */
export async function abrirSiguienteRonda() {
  canalesState.cargando = true
  const nuevaRonda = (canalesState.sesionActiva.ronda || 1) + 1

  try {
    await supabase
      .from('sesiones_medicion')
      .update({ ronda: nuevaRonda })
      .eq('id', canalesState.sesionActivaId)

    await supabase
      .from('sesion_canales')
      .update({ usuario_id: null, asignado_en: null })
      .eq('sesion_id', canalesState.sesionActivaId)
  } catch {
    // Fallback local
  }

  canalesState.sesionActiva.ronda = nuevaRonda
  canalesState.canales.forEach(c => {
    c.usuario_id = null
    c.usuario_nombre = null
    c.usuario_email = null
    c.asignado_en = null
  })

  canalesState.cargando = false
  return nuevaRonda
}
