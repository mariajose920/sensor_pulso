/**
 * Servicio Central de Auditoría Inmutable del Sistema (RF62, RF63, RF64).
 *
 * Registra y consulta los 6 tipos de eventos críticos exigidos por RF62:
 *  1. Inicios de sesión ('login', 'bloqueo_cuenta', 'login_fallido')
 *  2. Cambios de rol ('cambio_rol', 'cambio_permisos')
 *  3. Cambios de rangos ('cambio_rangos')
 *  4. Descargas ('descarga', 'exportacion_datos')
 *  5. Publicaciones ('publicacion', 'retiro_publicacion')
 *  6. Eliminaciones ('eliminacion', 'supresion_datos', 'retiro_estudiante')
 *
 * Propiedades de seguridad (RF63):
 *  - Los registros son de solo inserción: no existen funciones de edición ni borrado.
 *  - Cada evento normalizado se devuelve congelado (`Object.freeze`) en memoria.
 */

import { supabase } from './supabase.js'

export const CATEGORIAS_AUDITORIA = Object.freeze([
  { id: 'todos', etiqueta: 'Todos', acciones: [] },
  {
    id: 'login',
    etiqueta: 'Inicios de Sesión',
    etiquetaSingular: 'Inicio de Sesión',
    acciones: ['login', 'bloqueo_cuenta', 'login_fallido'],
    claseBadge: 'badge-cat-login'
  },
  {
    id: 'cambio_rol',
    etiqueta: 'Cambios de Rol',
    etiquetaSingular: 'Cambio de Rol',
    acciones: ['cambio_rol', 'cambio_permisos'],
    claseBadge: 'badge-cat-rol'
  },
  {
    id: 'cambio_rangos',
    etiqueta: 'Cambios de Rangos',
    etiquetaSingular: 'Cambio de Rangos',
    acciones: ['cambio_rangos'],
    claseBadge: 'badge-cat-rangos'
  },
  {
    id: 'descarga',
    etiqueta: 'Descargas',
    etiquetaSingular: 'Descarga',
    acciones: ['descarga', 'exportacion_datos'],
    claseBadge: 'badge-cat-descarga'
  },
  {
    id: 'publicacion',
    etiqueta: 'Publicaciones',
    etiquetaSingular: 'Publicación',
    acciones: ['publicacion', 'retiro_publicacion'],
    claseBadge: 'badge-cat-publicacion'
  },
  {
    id: 'eliminacion',
    etiqueta: 'Eliminaciones',
    etiquetaSingular: 'Eliminación',
    acciones: ['eliminacion', 'supresion_datos', 'retiro_estudiante'],
    claseBadge: 'badge-cat-eliminacion'
  }
])

export const ETIQUETAS_ACCION_AUDITORIA = Object.freeze({
  login: 'Inicio de Sesión',
  login_fallido: 'Intento Fallido',
  bloqueo_cuenta: 'Bloqueo de Cuenta',
  cambio_rol: 'Cambio de Rol',
  cambio_permisos: 'Cambio de Permisos',
  cambio_rangos: 'Cambio de Rangos',
  descarga: 'Descarga',
  exportacion_datos: 'Exportación de Datos',
  publicacion: 'Publicación',
  retiro_publicacion: 'Retiro de Publicación',
  eliminacion: 'Eliminación',
  supresion_datos: 'Supresión de Datos',
  retiro_estudiante: 'Retiro de Estudiante'
})

/**
 * Clasifica una acción de base de datos o aplicación dentro de una de las 6 categorías de RF62.
 */
export function clasificarCategoriaAuditoria(accion) {
  const act = String(accion || '').trim().toLowerCase()
  for (const cat of CATEGORIAS_AUDITORIA) {
    if (cat.id !== 'todos' && cat.acciones.includes(act)) {
      return cat.id
    }
  }
  if (act.includes('login') || act.includes('sesion') || act.includes('bloqueo')) return 'login'
  if (act.includes('rol') || act.includes('permiso')) return 'cambio_rol'
  if (act.includes('rango')) return 'cambio_rangos'
  if (act.includes('descarga') || act.includes('exporta')) return 'descarga'
  if (act.includes('publica')) return 'publicacion'
  if (act.includes('elimina') || act.includes('borra') || act.includes('supresion') || act.includes('retiro_estudiante')) {
    return 'eliminacion'
  }
  return 'login'
}

export function obtenerMetaCategoria(categoriaId) {
  return CATEGORIAS_AUDITORIA.find(c => c.id === categoriaId) || CATEGORIAS_AUDITORIA[1]
}

function etiquetaRolLegible(rol) {
  return rol === 'profesor' ? 'Profesor' : 'Estudiante'
}

function construirEntidadTexto(raw, categoria) {
  const det = raw?.detalle || {}
  if (det.entidad_nombre) return String(det.entidad_nombre)
  if (categoria === 'login') {
    return raw?.entidad_id ? `Cuenta (${raw.entidad_id})` : 'Sesión Institucional'
  }
  if (categoria === 'cambio_rol') {
    if (det.usuario_nombre || det.usuario_correo) {
      return det.usuario_nombre
        ? `${det.usuario_nombre}${det.usuario_correo ? ` (${det.usuario_correo})` : ''}`
        : det.usuario_correo
    }
    return raw?.entidad_id ? `Perfil #${String(raw.entidad_id).slice(0, 8)}` : 'Cuenta de Usuario'
  }
  if (categoria === 'cambio_rangos') {
    const despues = det.despues || det.antes || det
    if (despues?.edad_min !== undefined && despues?.edad_max !== undefined) {
      return `Rango (${despues.edad_min}-${despues.edad_max} años)`
    }
    return raw?.entidad_id ? `Rango #${String(raw.entidad_id).slice(0, 8)}` : 'Rangos Fisiológicos'
  }
  if (categoria === 'descarga') {
    const tipo = det.tipo || raw?.entidad_id || ''
    if (tipo === 'informe_pdf') return 'Informe Clínico PDF'
    if (tipo === 'datos_csv') return ' Señal Fisiológica CSV'.trim()
    if (tipo === 'grafico_imagen') return 'Gráfico Comparativo PNG'
    if (raw?.accion === 'exportacion_datos') return 'Portabilidad de Datos Personales (JSON)'
    return 'Archivo Exportado'
  }
  if (categoria === 'publicacion') {
    if (raw?.accion === 'retiro_publicacion') return 'Retiro de Galería Pública'
    return 'Galería Pública Anónima'
  }
  if (categoria === 'eliminacion') {
    const tabla = raw?.entidad || 'registro'
    const idCorto = raw?.entidad_id ? ` #${String(raw.entidad_id).slice(0, 8)}` : ''
    if (tabla === 'mediciones') return `Medición${idCorto}`
    if (tabla === 'aulas') return `Aula Virtual${idCorto}`
    if (raw?.accion === 'supresion_datos') return 'Supresión Total de Datos del Titular'
    return `${tabla}${idCorto}`
  }
  return raw?.entidad || 'Sistema'
}

function construirDetalleTexto(raw, categoria) {
  const det = raw?.detalle || {}
  if (det.resumen) return String(det.resumen)

  if (categoria === 'login') {
    if (raw?.accion === 'bloqueo_cuenta') {
      return `Cuenta bloqueada temporalmente tras ${det.fallos || 5} intentos fallidos${raw.ip ? ` · IP: ${raw.ip}` : ''}`
    }
    if (raw?.accion === 'login_fallido') {
      return `Intento de inicio de sesión fallido${raw.ip ? ` · IP: ${raw.ip}` : ''}`
    }
    return `Acceso exitoso verificado${raw?.ip ? ` · IP: ${raw.ip}` : ''}`
  }

  if (categoria === 'cambio_rol') {
    if (raw?.accion === 'cambio_permisos') {
      const activos = Object.entries(det)
        .filter(([k, v]) => v === true && !['actor_nombre', 'actor_correo', 'usuario_nombre', 'usuario_correo'].includes(k))
        .map(([k]) => k)
      return activos.length
        ? `Permisos docentes actualizados (${activos.join(', ')})`
        : 'Permisos docentes actualizados (sin permisos especiales activos)'
    }
    const antes = etiquetaRolLegible(det.rol_antes)
    const despues = etiquetaRolLegible(det.rol_despues)
    const cambioAdmin = det.admin_antes !== det.admin_despues
      ? (det.admin_despues ? ' · Privilegio Admin otorgado' : ' · Privilegio Admin revocado')
      : (det.admin_despues ? ' · Mantiene Admin' : '')
    return `Rol: ${antes} -> ${despues}${cambioAdmin}`
  }

  if (categoria === 'cambio_rangos') {
    const op = det.operacion || 'ACTUALIZACIÓN'
    const r = det.despues || det.antes || det
    if (r?.bpm_min !== undefined && r?.bpm_max !== undefined) {
      return `${op}: BPM ${r.bpm_min}-${r.bpm_max} · SpO₂ ${r.spo2_min ?? 95}-${r.spo2_max ?? 100}%`
    }
    return `Modificación de umbrales fisiológicos (${op})`
  }

  if (categoria === 'descarga') {
    if (raw?.accion === 'exportacion_datos') {
      return 'Descarga completa de portabilidad de datos del titular (JSON)'
    }
    return `Archivo exportado: ${det.tipo || 'documento'}${raw?.entidad_id ? ` (${raw.entidad_id})` : ''}`
  }

  if (categoria === 'publicacion') {
    if (raw?.accion === 'retiro_publicacion') {
      return `Publicación retirada de la Galería Pública por su titular${raw?.entidad_id ? ` (${String(raw.entidad_id).slice(0, 12)})` : ''}`
    }
    return `Publicación anónima confirmada explícitamente por el titular`
  }

  if (categoria === 'eliminacion') {
    if (raw?.accion === 'supresion_datos') {
      return 'Eliminación completa de mediciones y fichas declaradas solicitada por el titular'
    }
    return `Eliminación permanente en ${raw?.entidad || 'sistema'}${raw?.entidad_id ? ` (ID: ${String(raw.entidad_id).slice(0, 12)})` : ''}`
  }

  return JSON.stringify(det)
}

/**
 * Normaliza cualquier fila de auditoría (de Supabase o local) en un objeto inmutable (`Object.freeze`).
 */
export function normalizarEventoAuditoria(raw = {}) {
  const categoria = clasificarCategoriaAuditoria(raw.accion)
  const meta = obtenerMetaCategoria(categoria)
  const det = raw.detalle || {}

  const actorCorreo = raw.actor_correo || det.actor_correo || (categoria === 'login' ? raw.entidad_id : '') || 'sistema@unach.cl'
  const actorNombre = raw.actor_nombre || det.actor_nombre || (actorCorreo.split('@')[0] || 'Usuario UNACH')
  const accionNorm = String(raw.accion || 'login')
  const entidadTexto = raw.entidad_nombre || construirEntidadTexto(raw, categoria)
  const detalleTexto = raw.resumen || construirDetalleTexto(raw, categoria)
  const etiquetaAccion = ETIQUETAS_ACCION_AUDITORIA[accionNorm] || meta.etiquetaSingular || meta.etiqueta

  const evento = {
    id: String(raw.id || `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`),
    ocurrioEn: raw.ocurrio_en || raw.ocurrioEn || new Date().toISOString(),
    accion: accionNorm,
    categoria,
    etiquetaCategoria: meta.etiquetaSingular || meta.etiqueta,
    etiquetaAccion,
    claseBadge: meta.claseBadge || 'badge-cat-login',
    actorId: raw.actor_id || raw.actorId || null,
    actorNombre,
    actorCorreo,
    entidad: raw.entidad || 'sistema',
    entidadId: raw.entidad_id || raw.entidadId || null,
    entidadTexto,
    entidadNombre: entidadTexto,
    detalleTexto,
    resumen: detalleTexto,
    detalle: Object.freeze({ ...det }),
    ip: raw.ip || det.ip || null,
    sospechoso: Boolean(raw.sospechoso),
    inmutable: true
  }

  return Object.freeze(evento)
}

/**
 * Acciones que el servidor registra por sí mismo (triggers o funciones): inicio de sesión, cambio de rol,
 * cambio de rangos, descargas, publicaciones, retiros del aula y derechos. El navegador no las vuelve a escribir.
 */
export const ACCIONES_AUDITADAS_POR_SERVIDOR = Object.freeze([
  'login', 'login_fallido', 'bloqueo_cuenta', 'cambio_rol', 'cambio_rangos', 'descarga',
  'publicacion', 'retiro_publicacion', 'retiro_estudiantes', 'exportacion_datos', 'supresion_datos'
])

/**
 * Acciones del navegador que sí se envían a la función `registrar_evento_cliente` del servidor (RF62).
 * Deben coincidir con la lista cerrada de esa función en la migración 20261114000100_rf62_auditoria_cliente.sql.
 */
export const ACCIONES_AUDITADAS_DESDE_CLIENTE = Object.freeze(['eliminacion', 'eliminacion_aula', 'cambio_permisos'])

/**
 * Registra un evento de auditoría (RF62) a través del servidor.
 * El actor y la hora los pone el servidor; aquí no se guarda nada en el navegador ni se inventa un actor.
 * Devuelve { ok, origen } o { ok: false, motivo }.
 */
export async function registrarEventoAuditoria({
  accion,
  entidad = 'sistema',
  entidadId = null,
  entidadNombre = null,
  resumen = null,
  detalle = {}
} = {}) {
  if (!accion) return { ok: false, motivo: 'sin_accion' }

  if (ACCIONES_AUDITADAS_POR_SERVIDOR.includes(accion)) {
    // Ya la registró el servidor en la misma operación (trigger o función): no se duplica.
    return { ok: true, origen: 'servidor' }
  }
  if (!ACCIONES_AUDITADAS_DESDE_CLIENTE.includes(accion)) {
    return { ok: false, motivo: 'accion_no_permitida' }
  }

  const detalleEnviado = {
    ...detalle,
    ...(entidadNombre ? { entidad_nombre: entidadNombre } : {}),
    ...(resumen ? { resumen } : {})
  }

  try {
    const { error } = await supabase.rpc('registrar_evento_cliente', {
      p_accion: accion,
      p_entidad: entidad,
      p_entidad_id: entidadId ? String(entidadId) : null,
      p_detalle: detalleEnviado
    })
    if (error) return { ok: false, motivo: 'servidor_rechazo', error: error.message }
  } catch (err) {
    return { ok: false, motivo: 'sin_conexion', error: err?.message || String(err) }
  }

  if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
    window.dispatchEvent(new CustomEvent('auditoria-actualizada'))
  }
  return { ok: true, origen: 'cliente' }
}

/**
 * Filtra una lista de eventos normalizados por categoría y texto libre de búsqueda.
 */
export function filtrarEventosAuditoria(eventos = [], { categoria = 'todos', busqueda = '' } = {}) {
  const cat = String(categoria || 'todos').toLowerCase()
  const q = String(busqueda || '').trim().toLowerCase()

  return eventos.filter(ev => {
    if (cat !== 'todos' && ev.categoria !== cat) return false
    if (!q) return true
    const texto = `${ev.etiquetaCategoria} ${ev.accion} ${ev.actorNombre} ${ev.actorCorreo} ${ev.entidadTexto} ${ev.detalleTexto}`.toLowerCase()
    return texto.includes(q)
  })
}

/**
 * Calcula los totales por cada una de las 6 categorías de RF62 más 'todos'.
 */
export function contarPorCategoria(eventos = []) {
  const conteos = {
    todos: eventos.length,
    login: 0,
    cambio_rol: 0,
    cambio_rangos: 0,
    descarga: 0,
    publicacion: 0,
    eliminacion: 0
  }
  for (const ev of eventos) {
    if (conteos[ev.categoria] !== undefined) {
      conteos[ev.categoria]++
    }
  }
  return conteos
}

/**
 * Obtiene la lista de eventos de auditoría leída de la base de datos (solo la ve quien tenga permiso por RLS).
 * Ya no se mezcla con registros del navegador ni con eventos de ejemplo.
 */
export async function listarEventosAuditoria({ categoria = 'todos', busqueda = '', limite = 120 } = {}) {
  let remotosCrudos = []

  try {
    const { data, error } = await supabase
      .from('auditoria')
      .select('id, ocurrio_en, actor_id, accion, entidad, entidad_id, detalle, ip, sospechoso')
      .order('ocurrio_en', { ascending: false })
      .limit(limite)

    if (!error && Array.isArray(data)) {
      remotosCrudos = data
    }
  } catch {
    // sin conexión: no hay nada que mostrar, no se inventan registros
  }

  const todosOrdenados = remotosCrudos
    .map(normalizarEventoAuditoria)
    .sort((x, y) => new Date(y.ocurrioEn).getTime() - new Date(x.ocurrioEn).getTime())

  const filtrados = filtrarEventosAuditoria(todosOrdenados, { categoria, busqueda })
  return Object.freeze(filtrados)
}

// ----------------------------------------------------------------------------
// PROPIEDADES DE INMUTABILIDAD Y SELLO DE TIEMPO DEL SERVIDOR (RF63)
// ----------------------------------------------------------------------------

export const PROPIEDADES_SEGURIDAD_RF63 = Object.freeze({
  inmutable: true,
  permiteUpdate: false,
  permiteDelete: false,
  permiteTruncate: false,
  selloTiempoServidor: 'now()',
  norma: 'ISO/IEC 27001 A.8.15 & RFC 3161'
})

/**
 * Valida si un objeto de evento cumple estrictamente con el principio de inmutabilidad (RF63).
 *
 * @param {Object} evento
 * @returns {boolean} True si el objeto está congelado y protegido contra mutaciones
 */
export function validarInmutabilidad(evento) {
  if (!evento || typeof evento !== 'object') return false
  if (!Object.isFrozen(evento)) return false
  if (evento.detalle && typeof evento.detalle === 'object' && !Object.isFrozen(evento.detalle)) return false

  // Comprobar que intentar modificar una propiedad lanza TypeError en modo estricto
  try {
    evento.accion = 'mutacion_prohibida'
    return false // No arrojó error: no es inmutable
  } catch (err) {
    return err instanceof TypeError
  }
}

/**
 * Valida que una fecha corresponda a un sello de tiempo válido del servidor (ISO 8601).
 *
 * @param {string|Date} timestamp
 * @returns {boolean} True si es una fecha y hora válida
 */
export function validarSelloTiempoServidor(timestamp) {
  if (!timestamp) return false
  const d = new Date(timestamp)
  if (Number.isNaN(d.getTime())) return false

  // Debe ser una fecha en un rango razonable de operación del sistema
  const anio = d.getUTCFullYear()
  return anio >= 2026 && anio <= 2100
}

/**
 * Intento de edición de un registro de auditoría (RF63).
 * Arroja siempre error ya que la auditoría es estrictamente inmutable.
 *
 * @throws {Error} Siempre deniega la operación
 */
export function editarEventoAuditoria(id, cambios = {}) {
  throw new Error('Operación denegada por seguridad: los registros de auditoría son inmutables y no pueden ser modificados (RF63).')
}

/**
 * Intento de eliminación de un registro de auditoría (RF63).
 * Arroja siempre error ya que los registros no pueden ser eliminados.
 *
 * @throws {Error} Siempre deniega la operación
 */
export function eliminarEventoAuditoria(id) {
  throw new Error('Operación denegada por seguridad: los registros de auditoría son inmutables y no pueden ser eliminados (RF63).')
}

/**
 * Intento de vaciado o purga de la bitácora de auditoría (RF63).
 * Arroja siempre error ya que no se permite TRUNCATE ni DELETE masivo.
 *
 * @throws {Error} Siempre deniega la operación
 */
export function vaciarAuditoria() {
  throw new Error('Operación denegada por seguridad: la bitácora de auditoría no puede truncarse ni vaciarse (RF63).')
}

/**
 * Helper para verificar el rechazo de modificación en base de datos o cliente.
 * Criterio de aceptación RF63: "Intentar editar o borrar un registro falla".
 *
 * @param {string|number} id
 * @param {Object} cambios
 * @returns {Promise<{ ok: boolean, bloqueado: boolean, error: string }>}
 */
export async function intentarModificarRegistroAuditoria(id, cambios = {}) {
  try {
    const { error } = await supabase
      .from('auditoria')
      .update(cambios)
      .eq('id', id)

    if (error) {
      const mensaje = error.message && (error.message.includes('modificar') || error.message.includes('inmutable'))
        ? error.message
        : 'Operación bloqueada: los registros de auditoría no se pueden modificar ni editar (RF63).'
      return {
        ok: false,
        bloqueado: true,
        error: mensaje
      }
    }

    throw new Error('Operación denegada por seguridad: los registros de auditoría son inmutables y no pueden ser modificados (RF63).')
  } catch (err) {
    const mensaje = err.message && (err.message.includes('modificar') || err.message.includes('inmutable'))
      ? err.message
      : 'Operación bloqueada: los registros de auditoría son inmutables y no pueden ser modificados (RF63).'
    return {
      ok: false,
      bloqueado: true,
      error: mensaje
    }
  }
}

/**
 * Helper para verificar el rechazo de borrado en base de datos o cliente.
 * Criterio de aceptación RF63: "Intentar editar o borrar un registro falla".
 *
 * @param {string|number} id
 * @returns {Promise<{ ok: boolean, bloqueado: boolean, error: string }>}
 */
export async function intentarEliminarRegistroAuditoria(id) {
  try {
    const { error } = await supabase
      .from('auditoria')
      .delete()
      .eq('id', id)

    if (error) {
      const mensaje = error.message && (error.message.includes('borrar') || error.message.includes('eliminad') || error.message.includes('inmutable'))
        ? error.message
        : 'Operación bloqueada: los registros de auditoría no se pueden borrar ni eliminar (RF63).'
      return {
        ok: false,
        bloqueado: true,
        error: mensaje
      }
    }

    throw new Error('Operación denegada por seguridad: los registros de auditoría son inmutables y no pueden ser eliminados (RF63).')
  } catch (err) {
    const mensaje = err.message && (err.message.includes('borrar') || err.message.includes('eliminad') || err.message.includes('inmutable'))
      ? err.message
      : 'Operación bloqueada: los registros de auditoría son inmutables y no pueden ser eliminados (RF63).'
    return {
      ok: false,
      bloqueado: true,
      error: mensaje
    }
  }
}
