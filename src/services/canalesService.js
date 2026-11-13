import { reactive, computed } from 'vue'
import { supabase } from './supabase.js'
import { pacienteService } from './pacienteService.js'
import { POLITICA_VERSION } from '../data/politicaPrivacidad.js'
import { consentimientoEstado } from './consentimientoService.js'
import {
  MAX_CANALES_DOCENTE,
  esDocente,
  canalesDe,
  siguienteCanalLibre,
  evaluarAgregarCanal,
  evaluarAsignacionEstudiante,
  canalPrincipal,
  requisitosCompletos,
  canalListoParaMedir
} from '../utils/canalesMultiples.js'

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
  // Lista de 5 canales de la sesión activa (RF12 / RF111)
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

// Métricas de la ronda actual (RF111)
export const metricasRonda = computed(() => {
  const ocupados = canalesState.canales.filter(c => c.usuario_id !== null).length
  const libres = 5 - ocupados
  return {
    rondaActual: canalesState.sesionActiva.ronda || 1,
    canalesOcupados: ocupados,
    canalesLibres: libres,
    rondaCompleta: ocupados === 5,
    porcentajeOcupacion: Math.round((ocupados / 5) * 100)
  }
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
        // El rol sale de la tabla perfiles (no de user_metadata, que edita la propia persona): de él
        // depende si se pueden tener varios canales (RF111).
        const { data: perfil } = await supabase
          .from('perfiles')
          .select('rol, es_admin, nombre')
          .eq('id', user.id)
          .single()
        if (perfil) {
          if (perfil.es_admin) usuarioActual.rol = 'admin'
          else if (perfil.rol) usuarioActual.rol = perfil.rol
          if (perfil.nombre) usuarioActual.nombre = perfil.nombre
        } else if (user.user_metadata?.rol) {
          usuarioActual.rol = user.user_metadata.rol
        }
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
    console.warn('[RF12/RF111] Conexión local fallback para canales:', err.message)
  } finally {
    canalesState.cargando = false
  }
}

/**
 * Un estudiante elige y vincula su cuenta a un canal libre del ESP32 (RF12, RF111)
 * Reglas atómicas:
 * 1. Solo toma el canal si está libre (usuario_id is null).
 * 2. Un usuario sólo puede tener 1 canal activo por sesión.
 * 3. Si el canal objetivo fue tomado por otro estudiante, se rechaza de forma atómica.
 */
export async function vincularMiCuentaACanal(canalNum) {
  canalesState.cargando = true
  canalesState.error = null

  // Validación 1: Verificar si el usuario ya tiene otro canal vinculado en esta sesión
  const canalPrevio = canalesState.canales.find(c => c.usuario_id === usuarioActual.id)
  if (canalPrevio && canalPrevio.canal !== canalNum) {
    canalesState.cargando = false
    throw new Error(`Ya tienes asignado el Canal ${canalPrevio.canal}. Debes liberarlo antes de tomar otro.`)
  }

  // Validación 2: Verificar si el canal objetivo está ocupado por otra persona
  const target = canalesState.canales.find(c => c.canal === canalNum)
  if (target && target.usuario_id && target.usuario_id !== usuarioActual.id) {
    canalesState.cargando = false
    throw new Error(`El Canal ${canalNum} ya fue tomado por ${target.usuario_nombre || target.usuario_email || 'otro estudiante'}.`)
  }

  try {
    // Intentar ejecutar función RPC atómica de Supabase (RF111)
    const { data: ok, error } = await supabase.rpc('elegir_canal', {
      p_sesion: canalesState.sesionActivaId,
      p_canal: canalNum
    })

    if (!error && ok) {
      await cargarSesionYCanales()
      canalesState.cargando = false
      return { ok: true, canal: canalNum }
    } else if (error) {
      console.warn('[RF111] RPC error:', error.message)
    }
  } catch (rpcErr) {
    console.warn('[RF111] RPC falló, aplicando vinculación en memoria local:', rpcErr.message)
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
export async function desvincularMiCuenta(canalEspecifico = null) {
  canalesState.cargando = true
  const miCanal = canalesState.canales.find(c => c.usuario_id === usuarioActual.id && (!canalEspecifico || c.canal === canalEspecifico))
  if (!miCanal) {
    canalesState.cargando = false
    return { ok: true }
  }

  const canalNumero = miCanal.canal
  delete requisitosCanales[canalNumero]

  try {
    await supabase
      .from('sesion_canales')
      .update({ usuario_id: null, asignado_en: null })
      .eq('sesion_id', canalesState.sesionActivaId)
      .eq('canal', canalNumero)
  } catch {
    // Fallback local
  }

  miCanal.usuario_id = null
  miCanal.usuario_nombre = null
  miCanal.usuario_email = null
  miCanal.asignado_en = null
  canalesState.cargando = false

  return { ok: true, canalLiberado: canalNumero }
}

/**
 * Asignación manual de canal por parte del profesor o admin (RF111)
 * Permite corregir asignaciones o liberar un canal de cualquier estudiante
 */
export async function asignarCanalProfesor(canalNum, nuevoUsuarioId = null, usuarioInfo = null) {
  canalesState.cargando = true
  delete requisitosCanales[canalNum] // el canal cambia de dueño: los requisitos anteriores ya no valen
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
  return { ok: true, canal: canalNum, usuarioId: nuevoUsuarioId }
}

/**
 * El profesor abre la siguiente ronda de 5 estudiantes (RF111)
 * Libera atómicamente los 5 canales e incrementa el contador de ronda en la sesión
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
  Object.keys(requisitosCanales).forEach(k => delete requisitosCanales[k])
  canalesState.canales.forEach(c => {
    c.usuario_id = null
    c.usuario_nombre = null
    c.usuario_email = null
    c.asignado_en = null
  })

  canalesState.cargando = false
  return nuevaRonda
}

// ============================================================================
// «Agregar otro canal» para profesor y administrador (RF111, RF12, RF08)
// ============================================================================

export { MAX_CANALES_DOCENTE }

/**
 * Requisitos cumplidos por cada canal adicional, en memoria (se piden de nuevo al recargar la
 * página, igual que el consentimiento del RF04). Clave = número de canal.
 *   { ficha, politicaVersion, consentimientoVersion, completadoEn }
 */
export const requisitosCanales = reactive({})

// Estado del botón «Agregar otro canal»
export const estadoAgregarCanal = computed(() => evaluarAgregarCanal({
  rol: usuarioActual.rol,
  canales: canalesState.canales,
  usuarioId: usuarioActual.id
}))

// Estado del botón «Agregar mi canal» (estudiante)
export const estadoAsignacionEstudiante = computed(() => evaluarAsignacionEstudiante({
  rol: usuarioActual.rol,
  canales: canalesState.canales,
  usuarioId: usuarioActual.id
}))

// Mis canales ordenados, con lo que les falta para poder medir
export const misCanales = computed(() => {
  const principal = canalPrincipal(canalesState.canales, usuarioActual.id)
  return canalesDe(canalesState.canales, usuarioActual.id)
    .slice().sort((a, b) => a.canal - b.canal)
    .map(c => {
      const esPrincipal = c.canal === principal
      const req = requisitosCompletos(requisitosCanales[c.canal], { politicaVigente: POLITICA_VERSION })
      return { ...c, esPrincipal, listo: esPrincipal || req.completos, faltan: esPrincipal ? [] : req.faltan }
    })
})

/** ¿Se puede medir en este canal? Un canal adicional sin ficha + política + consentimiento no se usa. */
export function puedeMedirEnCanal(canal) {
  return canalListoParaMedir({
    canal,
    canales: canalesState.canales,
    usuarioId: usuarioActual.id,
    requisitos: requisitosCanales,
    vigentes: { politicaVigente: POLITICA_VERSION }
  })
}

// ¿El id de sesión es real (uuid de la base) y no el de demostración («ses-demo-01»)?
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export function esUuid(valor) { return typeof valor === 'string' && UUID_RE.test(valor) }

/**
 * Agrega otro canal a mi sesión: el sistema toma el siguiente canal libre (no se elige) y deja constancia
 * de la ficha del paciente (RF03), la política (RF88) y el consentimiento (RF04) de esa persona.
 * Con `canalExistente` solo se completan los requisitos de un canal que ya es mío (p. ej. tras recargar).
 * Solo profesor/admin: la base de datos lo vuelve a exigir (RNF12).
 */
export async function agregarOtroCanal({ ficha, politicaVersion, consentimientoVersion, canalExistente = null, comoEstudiante = false, declaracionExistenteId = null }) {
  if (comoEstudiante) {
    // Estudiante (RF111): un solo canal, asignado solo, con su ficha, los términos y el consentimiento.
    // El único paciente que puede medir es él mismo: el nombre de la ficha es siempre el de su cuenta.
    if (esDocente(usuarioActual.rol)) throw new Error('El profesor y el administrador usan «Agregar canal».')
    const nombrePropio = String(usuarioActual.nombre || '').trim()
    if (nombrePropio) ficha = { ...(ficha || {}), nombre: nombrePropio }
    const estado = estadoAsignacionEstudiante.value
    if (!estado.puede) throw new Error(estado.motivo)
  } else {
    if (!esDocente(usuarioActual.rol)) {
      throw new Error('Solo el profesor y el administrador pueden agregar otro canal.')
    }
    if (!canalExistente) {
      const estado = estadoAgregarCanal.value
      if (!estado.puede) throw new Error(estado.motivo)
    }
  }
  const validacion = pacienteService.validarDatos(ficha || {})
  if (!validacion.valido) throw new Error(validacion.errores[0])
  if (politicaVersion !== POLITICA_VERSION) throw new Error('Debes aceptar los términos y la política de privacidad vigente.')
  if (!consentimientoVersion) throw new Error('Debes aceptar el consentimiento informado vigente.')

  canalesState.cargando = true
  canalesState.error = null
  try {
    let canal = canalExistente
    let declaracionId = null // id de la ficha del paciente en el servidor (la usa «Terminar» al guardar la medición)
    let hayCuenta = false
    // Sin una sesión de medición real en la base (id de demostración como «ses-demo-01», que no es un
    // uuid) no hay dónde guardar el canal ni la ficha: todo queda en memoria, como el modo local.
    const sesionReal = esUuid(canalesState.sesionActivaId)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      hayCuenta = Boolean(session?.user?.id)
    } catch { hayCuenta = false }

    if (hayCuenta && sesionReal) {
      if (declaracionExistenteId) {
        // Estudiante: su ficha ya está guardada en la base (paso 2); se reutiliza, no se guarda otra ni se modifica
        if (!esUuid(declaracionExistenteId)) {
          throw new Error('Tu ficha todavía no está guardada en la base de datos. Revisa el aviso de guardado de tu ficha (paso 2) y vuelve a intentarlo.')
        }
        declaracionId = declaracionExistenteId
      } else {
        const guardada = await pacienteService.guardarDeclaracion(ficha, { adicional: true, sesionId: canalesState.sesionActivaId })
        if (!guardada.ok) throw new Error(guardada.errores?.[0] || 'No se pudo guardar la ficha del paciente.')
        declaracionId = guardada.declaracionId || null
        if (!guardada.declaracionId) {
          // Se muestra el motivo real (p. ej. migración sin aplicar o cifrado caído) para no adivinar
          throw new Error(`No se pudo guardar la ficha del paciente en el servidor${guardada.errorServidor ? `: ${guardada.errorServidor}` : ''}. Intenta de nuevo.`)
        }
      }

      const { data, error } = comoEstudiante
        ? await supabase.rpc('asignar_canal_estudiante', {
          p_sesion: canalesState.sesionActivaId,
          p_declaracion: declaracionId,
          p_politica_version: politicaVersion,
          p_consentimiento_version: consentimientoVersion
        })
        : await supabase.rpc('agregar_canal_automatico', {
          p_sesion: canalesState.sesionActivaId,
          p_declaracion: declaracionId,
          p_politica_version: politicaVersion,
          p_consentimiento_version: consentimientoVersion,
          p_canal: canalExistente
        })
      if (error) throw new Error(error.message)
      canal = Number(data)
      await cargarSesionYCanales()
    } else {
      // Sin cuenta de Supabase (modo local): asignación en memoria, con la misma regla de siguiente libre
      if (!canal) canal = siguienteCanalLibre(canalesState.canales)
      const ch = canalesState.canales.find(c => c.canal === canal)
      if (!ch) throw new Error('No hay canales libres en esta sesión.')
      ch.usuario_id = usuarioActual.id
      ch.usuario_nombre = usuarioActual.nombre
      ch.usuario_email = usuarioActual.email
      ch.asignado_en = ch.asignado_en || new Date().toISOString()
    }

    requisitosCanales[canal] = {
      ficha: { ...ficha },
      politicaVersion,
      consentimientoVersion,
      declaracionId,
      completadoEn: new Date().toISOString()
    }
    return { ok: true, canal }
  } catch (err) {
    canalesState.error = err.message
    throw err
  } finally {
    canalesState.cargando = false
  }
}

/**
 * El estudiante pulsa «Agregar mi canal»: el sistema toma el siguiente canal libre (no se elige) y guarda los datos del
 * paciente (ficha, RF03), la política (RF88) y el consentimiento (RF04), igual que «Agregar canal» del profesor.
 */
export function asignarmeCanalConFicha({ ficha, politicaVersion, consentimientoVersion }) {
  return agregarOtroCanal({ ficha, politicaVersion, consentimientoVersion, comoEstudiante: true })
}

/** Error con el que la pantalla sabe si lo que falta es la ficha o el consentimiento (para llevar a la persona al paso). */
export class FaltaRequisitoCanal extends Error {
  constructor(mensaje, requisito) {
    super(mensaje)
    this.name = 'FaltaRequisitoCanal'
    this.requisito = requisito // 'ficha' | 'consentimiento'
  }
}

/**
 * El canal del estudiante se asigna SOLO, sin botones: toma el siguiente canal libre y lo liga a su propia ficha, ya guardada
 * en la base (paso 2). El único paciente que puede medir es él mismo. No modifica la ficha: solo la usa.
 */
export async function asignarCanalAutomaticoEstudiante() {
  if (esDocente(usuarioActual.rol)) throw new Error('El profesor y el administrador usan «Agregar canal».')
  if (miCanalAsignado.value) return { ok: true, canal: miCanalAsignado.value, yaTenia: true }

  const ficha = await pacienteService.obtenerDeclaracionActiva()
  if (!ficha || ficha.incompleta || ficha.estadoLectura === 'incompleta') {
    throw new FaltaRequisitoCanal('Completa tu ficha del paciente (paso 2) para que se te asigne tu canal.', 'ficha')
  }
  if (!consentimientoEstado.value.vigente) {
    throw new FaltaRequisitoCanal('Acepta el consentimiento informado (paso 1) para que se te asigne tu canal.', 'consentimiento')
  }
  return agregarOtroCanal({
    ficha: { ...ficha },
    politicaVersion: POLITICA_VERSION,
    consentimientoVersion: consentimientoEstado.value.version,
    comoEstudiante: true,
    declaracionExistenteId: ficha.id || null
  })
}
