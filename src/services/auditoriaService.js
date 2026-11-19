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
import { construirXlsx, ESTILO_XLSX, letraColumna, serialExcel } from '../utils/exportarXlsx.js'
import {
  enmascararCorreo,
  enmascararIp,
  enmascararNombre,
  enmascararObjeto,
  enmascararTextoLibre
} from '../utils/enmascarar.js'

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
    acciones: ['descarga', 'exportacion_datos', 'revelacion_datos'],
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
    acciones: ['eliminacion', 'eliminacion_aula', 'supresion_datos', 'retiro_estudiante', 'retiro_estudiantes'],
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
  revelacion_datos: 'Datos Personales Mostrados',
  publicacion: 'Publicación',
  retiro_publicacion: 'Retiro de Publicación',
  eliminacion: 'Eliminación',
  supresion_datos: 'Supresión de Datos',
  retiro_estudiante: 'Retiro de Estudiante',
  retiro_estudiantes: 'Retiro de Estudiantes',
  eliminacion_aula: 'Eliminación de Aula'
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
    if (tipo === 'auditoria_csv') return 'Registro de Auditoría CSV'
    if (tipo === 'auditoria_xlsx') return 'Registro de Auditoría Excel'
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
    motivoSospecha: det.motivo_sospecha ? String(det.motivo_sospecha) : '',
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
export const ACCIONES_AUDITADAS_DESDE_CLIENTE = Object.freeze(['eliminacion', 'eliminacion_aula', 'cambio_permisos', 'revelacion_datos'])

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
export function filtrarEventosAuditoria(eventos = [], { categoria = 'todos', busqueda = '', soloSospechosos = false } = {}) {
  const cat = String(categoria || 'todos').toLowerCase()
  const q = String(busqueda || '').trim().toLowerCase()

  return eventos.filter(ev => {
    if (cat !== 'todos' && ev.categoria !== cat) return false
    if (soloSospechosos && !ev.sospechoso) return false
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
// PANEL DE REVISIÓN DEL ADMINISTRADOR (RF64): filtros en el servidor, paginación, resumen y CSV
// ----------------------------------------------------------------------------

export const TAMANOS_PAGINA_AUDITORIA = Object.freeze([25, 50, 100])

/** Acciones de base de datos que pertenecen a una categoría (vacío si es 'todos' o no existe). */
export function accionesDeCategoria(categoriaId) {
  const cat = CATEGORIAS_AUDITORIA.find(c => c.id === categoriaId)
  return cat && cat.id !== 'todos' ? [...cat.acciones] : []
}

/** Convierte 'YYYY-MM-DD' (campo de fecha) en un instante ISO local; `finDeDia` usa las 23:59:59.999. */
export function fechaAIso(fecha, finDeDia = false) {
  if (!fecha || !/^\d{4}-\d{2}-\d{2}$/.test(String(fecha))) return null
  const [y, m, d] = String(fecha).split('-').map(Number)
  const dt = finDeDia ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0)
  return Number.isNaN(dt.getTime()) ? null : dt.toISOString()
}

/**
 * Traduce los filtros del panel a los parámetros de la función `listar_auditoria`.
 * Si la fecha de inicio es posterior a la de término, se intercambian.
 */
export function construirParametrosListado({
  categoria = 'todos',
  accion = '',
  desde = '',
  hasta = '',
  actor = '',
  ip = '',
  busqueda = '',
  soloSospechosos = false,
  pagina = 1,
  porPagina = 50
} = {}) {
  let pDesde = fechaAIso(desde, false)
  let pHasta = fechaAIso(hasta, true)
  if (pDesde && pHasta && pDesde > pHasta) {
    const hastaOriginal = fechaAIso(desde, true)
    const desdeOriginal = fechaAIso(hasta, false)
    pDesde = desdeOriginal
    pHasta = hastaOriginal
  }
  const tamano = Math.min(200, Math.max(1, Math.trunc(Number(porPagina)) || 50))
  const pag = Math.max(1, Math.trunc(Number(pagina)) || 1)
  const acciones = accion ? [String(accion)] : accionesDeCategoria(categoria)
  return {
    p_desde: pDesde,
    p_hasta: pHasta,
    p_acciones: acciones.length ? acciones : null,
    p_actor: String(actor || '').trim() || null,
    p_ip: String(ip || '').trim() || null,
    p_busqueda: String(busqueda || '').trim() || null,
    p_solo_sospechosos: Boolean(soloSospechosos),
    p_limite: tamano,
    p_desplazamiento: (pag - 1) * tamano
  }
}

/**
 * Consulta una página del registro de auditoría, filtrada en el servidor (solo administrador).
 * Devuelve { ok, eventos, total } o { ok: false, eventos: [], total: 0, error }.
 */
export async function listarAuditoriaPaginada(filtros = {}) {
  try {
    const { data, error } = await supabase.rpc('listar_auditoria', construirParametrosListado(filtros))
    if (error) {
      return { ok: false, eventos: [], total: 0, error: error.message || 'No se pudo consultar la auditoría' }
    }
    const filas = Array.isArray(data) ? data : []
    const total = filas.length ? Number(filas[0].total) || filas.length : 0
    return { ok: true, eventos: filas.map(normalizarEventoAuditoria), total }
  } catch (err) {
    return { ok: false, eventos: [], total: 0, error: err?.message || 'Sin conexión con el servidor' }
  }
}

/** Convierte el resumen del servidor ({ total, sospechosos, por_accion }) en contadores por categoría. */
export function resumenACategorias(resumen = {}) {
  const porAccion = resumen?.por_accion || {}
  const conteos = { todos: Number(resumen?.total) || 0, sospechosos: Number(resumen?.sospechosos) || 0 }
  for (const cat of CATEGORIAS_AUDITORIA) {
    if (cat.id === 'todos') continue
    conteos[cat.id] = cat.acciones.reduce((acc, a) => acc + (Number(porAccion[a]) || 0), 0)
  }
  return conteos
}

/** Totales por categoría y de sospechosos dentro de un rango de fechas. */
export async function resumirAuditoria({ desde = '', hasta = '' } = {}) {
  try {
    const { data, error } = await supabase.rpc('resumen_auditoria', {
      p_desde: fechaAIso(desde, false),
      p_hasta: fechaAIso(hasta, true)
    })
    if (error) return { ok: false, conteos: resumenACategorias({}), error: error.message }
    return { ok: true, conteos: resumenACategorias(data || {}) }
  } catch (err) {
    return { ok: false, conteos: resumenACategorias({}), error: err?.message || 'Sin conexión con el servidor' }
  }
}

// ----------------------------------------------------------------------------
// EXPORTACIÓN (Excel con formato y CSV) de lo que el administrador está viendo
// ----------------------------------------------------------------------------

export const ZONA_HORARIA_AUDITORIA = 'America/Santiago'
export const MAX_EVENTOS_EXPORTACION = 2000

const formateadorPartes = typeof Intl !== 'undefined'
  ? new Intl.DateTimeFormat('es-CL', {
    timeZone: ZONA_HORARIA_AUDITORIA,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  })
  : null

/** Descompone un instante ISO en año, mes, día, hora, minuto y segundo de la hora de Chile. */
export function partesFechaLocal(valor) {
  if (!valor || !formateadorPartes) return null
  const fecha = new Date(valor)
  if (Number.isNaN(fecha.getTime())) return null
  const partes = {}
  for (const p of formateadorPartes.formatToParts(fecha)) {
    if (p.type !== 'literal') partes[p.type] = Number(p.value)
  }
  return {
    anio: partes.year, mes: partes.month, dia: partes.day,
    hora: partes.hour, minuto: partes.minute, segundo: partes.second
  }
}

const dos = n => String(n).padStart(2, '0')

/** 'dd-mm-aaaa hh:mm:ss' en hora de Chile (vacío si la fecha no es válida). */
export function formatearFechaLocal(valor) {
  const p = partesFechaLocal(valor)
  return p ? `${dos(p.dia)}-${dos(p.mes)}-${p.anio} ${dos(p.hora)}:${dos(p.minuto)}:${dos(p.segundo)}` : ''
}

/** Usuario y correo para mostrar; los eventos automáticos del servidor figuran como «Sistema». */
export function describirActor(ev) {
  const automatico = !ev.actorId && ev.categoria !== 'login' && !ev.detalle?.actor_correo &&
    (!ev.actorCorreo || ev.actorCorreo === 'sistema@unach.cl')
  if (automatico) return { nombre: 'Sistema', correo: '' }
  return { nombre: ev.actorNombre || '', correo: ev.actorCorreo || '' }
}

const ETIQUETAS_CAMPO_DETALLE = Object.freeze({
  fallos: 'Intentos fallidos',
  fallos_correo: 'Intentos fallidos con ese correo',
  fallos_ip: 'Intentos fallidos desde esa IP',
  bloqueado_hasta: 'Bloqueada hasta',
  tipo: 'Tipo de archivo',
  operacion: 'Operación',
  rol_antes: 'Rol anterior',
  rol_despues: 'Rol nuevo',
  admin_antes: 'Era administrador',
  admin_despues: 'Es administrador ahora',
  bpm_min: 'BPM mínimo',
  bpm_max: 'BPM máximo',
  spo2_min: 'SpO₂ mínima (%)',
  spo2_max: 'SpO₂ máxima (%)',
  edad_min: 'Edad mínima',
  edad_max: 'Edad máxima',
  crear_aulas: 'Crear aulas',
  publicar_galeria: 'Publicar en la galería',
  compartir_banco: 'Compartir preguntas',
  editar_rangos: 'Editar rangos',
  editar_contenidos: 'Editar contenidos'
})

const TIPOS_ARCHIVO_LEGIBLES = Object.freeze({
  informe_pdf: 'Informe PDF',
  datos_csv: 'Datos de la señal (CSV)',
  grafico_imagen: 'Gráfico (imagen PNG)',
  auditoria_csv: 'Registro de auditoría (CSV)',
  auditoria_xlsx: 'Registro de auditoría (Excel)'
})

// Datos que ya se muestran en otra parte de la ficha, o que no aportan al lector
const CAMPOS_DETALLE_OCULTOS = new Set([
  'actor_nombre', 'actor_correo', 'usuario_nombre', 'usuario_correo', 'entidad_nombre', 'resumen', 'motivo_sospecha', 'ip'
])

function humanizarClave(clave) {
  const texto = String(clave).replace(/_/g, ' ').trim()
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

function valorLegible(clave, valor) {
  if (valor === null || valor === undefined || valor === '') return ''
  if (typeof valor === 'boolean') return valor ? 'Sí' : 'No'
  if (clave === 'rol_antes' || clave === 'rol_despues') return etiquetaRolLegible(valor)
  if (clave === 'tipo' && TIPOS_ARCHIVO_LEGIBLES[valor]) return TIPOS_ARCHIVO_LEGIBLES[valor]
  if (typeof valor === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(valor)) {
    return formatearFechaLocal(valor) || valor
  }
  if (Array.isArray(valor)) return valor.map(v => valorLegible(clave, v)).filter(Boolean).join(', ')
  if (typeof valor === 'object') return ''   // los objetos se aplanan aparte
  return String(valor)
}

/** Aplana el detalle del evento en pares { etiqueta, valor } con nombres y valores legibles. */
function camposDeDetalle(detalle = {}, prefijo = '') {
  const filas = []
  for (const [clave, valor] of Object.entries(detalle || {})) {
    if (CAMPOS_DETALLE_OCULTOS.has(clave)) continue
    if (valor && typeof valor === 'object' && !Array.isArray(valor)) {
      const ambito = clave === 'antes' ? 'Antes · ' : clave === 'despues' ? 'Después · ' : `${humanizarClave(clave)} · `
      filas.push(...camposDeDetalle(valor, ambito))
      continue
    }
    const texto = valorLegible(clave, valor)
    if (texto === '') continue
    filas.push({ etiqueta: prefijo + (ETIQUETAS_CAMPO_DETALLE[clave] || humanizarClave(clave)), valor: texto })
  }
  return filas
}

/**
 * Lo que se muestra de un evento: con los datos personales (nombre, correo, IP) tal cual o enmascarados (RF61).
 * Sirve a la tabla, a la ficha de detalle y a las exportaciones, para que todas apliquen la misma regla.
 */
export function vistaEventoAuditoria(ev, { enmascarar = false } = {}) {
  const actor = describirActor(ev)
  const det = ev.detalle || {}
  const entidadReal = String(ev.entidadTexto || '').trim()
  if (!enmascarar) {
    return {
      actorNombre: actor.nombre,
      actorCorreo: actor.correo,
      entidad: entidadReal,
      resumen: String(ev.resumen || ''),
      ip: ev.ip || '',
      detalle: det
    }
  }
  const hayUsuarioAfectado = Boolean(det.usuario_nombre || det.usuario_correo)
  const entidad = hayUsuarioAfectado
    ? [enmascararNombre(det.usuario_nombre), det.usuario_correo ? `(${enmascararCorreo(det.usuario_correo)})` : '']
      .filter(Boolean).join(' ')
    : enmascararTextoLibre(entidadReal)
  return {
    actorNombre: enmascararNombre(actor.nombre),
    actorCorreo: enmascararCorreo(actor.correo),
    entidad,
    resumen: enmascararTextoLibre(ev.resumen),
    ip: ev.ip ? enmascararIp(ev.ip) : '',
    detalle: enmascararObjeto(det)
  }
}

/**
 * Ficha en texto de un evento para el panel: quién, cuándo, qué pasó y los datos extra,
 * con etiquetas y valores legibles (sin mostrar el JSON crudo).
 * Con `enmascarar` los datos personales salen enmascarados (RF61).
 */
export function detalleLegible(ev, { enmascarar = false } = {}) {
  const vista = vistaEventoAuditoria(ev, { enmascarar })
  const base = [
    { etiqueta: 'Fecha y hora', valor: formatearFechaLocal(ev.ocurrioEn) || '—' },
    { etiqueta: 'Realizado por', valor: vista.actorCorreo ? `${vista.actorNombre} (${vista.actorCorreo})` : (vista.actorNombre || '—') },
    { etiqueta: 'Categoría', valor: ev.etiquetaCategoria },
    { etiqueta: 'Entidad afectada', valor: vista.entidad || '—' }
  ]
  if (vista.ip) base.push({ etiqueta: 'Dirección IP', valor: vista.ip })
  const extras = camposDeDetalle(vista.detalle)
  const cierre = [{ etiqueta: 'N.º de registro', valor: String(ev.id) }]
  return [...base, ...extras, ...cierre]
}

/** Columnas de la exportación, en el orden en que se leen mejor. */
export const COLUMNAS_EXPORTACION = Object.freeze([
  { clave: 'fecha', titulo: 'Fecha y hora', ancho: 21 },
  { clave: 'categoria', titulo: 'Categoría', ancho: 19 },
  { clave: 'accion', titulo: 'Acción', ancho: 22 },
  { clave: 'usuario', titulo: 'Usuario', ancho: 22 },
  { clave: 'correo', titulo: 'Correo', ancho: 30 },
  { clave: 'entidad', titulo: 'Entidad afectada', ancho: 30 },
  { clave: 'detalle', titulo: 'Detalle', ancho: 62 },
  { clave: 'ip', titulo: 'Dirección IP', ancho: 16 },
  { clave: 'sospechoso', titulo: 'Sospechoso', ancho: 13 },
  { clave: 'motivo', titulo: 'Motivo de la alerta', ancho: 42 },
  { clave: 'id', titulo: 'N.º de registro', ancho: 14 }
])

/** Un evento normalizado convertido a los valores legibles de cada columna. */
export function filaExportacion(ev, { enmascarar = false } = {}) {
  const vista = vistaEventoAuditoria(ev, { enmascarar })
  const actor = { nombre: vista.actorNombre, correo: vista.actorCorreo }
  return {
    fecha: ev.ocurrioEn,
    fechaTexto: formatearFechaLocal(ev.ocurrioEn),
    categoria: ev.etiquetaCategoria,
    accion: ev.etiquetaAccion,
    usuario: actor.nombre,
    correo: actor.correo,
    entidad: vista.entidad,
    // La IP ya tiene su propia columna: se quita del texto para no repetirla
    detalle: (enmascarar ? enmascararTextoLibre(ev.detalleTexto) : String(ev.detalleTexto || ''))
      .replace(/\s*->\s*/g, ' → ').replace(/\s*·\s*IP:\s*\S+\s*$/, ''),
    ip: vista.ip,
    sospechoso: ev.sospechoso,
    motivo: ev.motivoSospecha || '',
    id: ev.id
  }
}

/** Neutraliza fórmulas de hoja de cálculo (=, +, -, @) y escapa comillas para CSV. */
export function celdaCsvSegura(valor) {
  let texto = valor === null || valor === undefined ? '' : String(valor)
  if (/^[=+\-@\t\r]/.test(texto)) texto = `'${texto}`
  return `"${texto.replace(/"/g, '""')}"`
}

/**
 * CSV pensado para Excel en español: separador «;», BOM UTF-8, fecha en hora de Chile y
 * títulos legibles. (Con coma como separador, Excel en español lo abre todo en una sola columna.)
 */
export function eventosACsv(eventos = [], { enmascarar = false } = {}) {
  const encabezado = COLUMNAS_EXPORTACION.map(c => celdaCsvSegura(c.titulo)).join(';')
  const filas = eventos.map(ev => {
    const f = filaExportacion(ev, { enmascarar })
    return [f.fechaTexto, f.categoria, f.accion, f.usuario, f.correo, f.entidad, f.detalle, f.ip,
      f.sospechoso ? 'Sí' : 'No', f.motivo, f.id].map(celdaCsvSegura).join(';')
  })
  return '﻿' + [encabezado, ...filas].join('\r\n')
}

/** Texto con los filtros aplicados, para dejarlos escritos en el informe. */
export function describirFiltros({
  categoria = 'todos', accion = '', desde = '', hasta = '', actor = '', ip = '', busqueda = '', soloSospechosos = false
} = {}) {
  const partes = []
  if (categoria && categoria !== 'todos') {
    partes.push(`Categoría: ${obtenerMetaCategoria(categoria).etiqueta}`)
  }
  if (accion) partes.push(`Acción: ${ETIQUETAS_ACCION_AUDITORIA[accion] || accion}`)
  if (desde) partes.push(`Desde: ${desde.split('-').reverse().join('-')}`)
  if (hasta) partes.push(`Hasta: ${hasta.split('-').reverse().join('-')}`)
  if (actor) partes.push(`Usuario: ${actor}`)
  if (ip) partes.push(`IP: ${ip}`)
  if (busqueda) partes.push(`Texto: ${busqueda}`)
  if (soloSospechosos) partes.push('Solo eventos sospechosos')
  return partes.length ? partes.join('  ·  ') : 'Sin filtros (todos los eventos)'
}

/** Cuenta eventos y sospechosos por categoría y por motivo, para la hoja de resumen. */
export function resumirEventosExportados(eventos = []) {
  const porCategoria = new Map()
  const porMotivo = new Map()
  let sospechosos = 0
  let primero = null
  let ultimo = null
  for (const ev of eventos) {
    const fila = porCategoria.get(ev.etiquetaCategoria) || { total: 0, sospechosos: 0 }
    fila.total++
    if (ev.sospechoso) {
      fila.sospechosos++
      sospechosos++
      const motivo = ev.motivoSospecha || 'Marcado como sospechoso por el sistema'
      porMotivo.set(motivo, (porMotivo.get(motivo) || 0) + 1)
    }
    porCategoria.set(ev.etiquetaCategoria, fila)
    const t = new Date(ev.ocurrioEn).getTime()
    if (!Number.isNaN(t)) {
      if (primero === null || t < primero) primero = t
      if (ultimo === null || t > ultimo) ultimo = t
    }
  }
  return {
    total: eventos.length,
    sospechosos,
    porCategoria: [...porCategoria.entries()].map(([categoria, v]) => ({ categoria, ...v }))
      .sort((a, b) => b.total - a.total),
    porMotivo: [...porMotivo.entries()].map(([motivo, total]) => ({ motivo, total }))
      .sort((a, b) => b.total - a.total),
    primero: primero === null ? '' : formatearFechaLocal(new Date(primero).toISOString()),
    ultimo: ultimo === null ? '' : formatearFechaLocal(new Date(ultimo).toISOString())
  }
}

/**
 * Libro de Excel con dos hojas: «Eventos» (tabla con filtros y filas sospechosas en rojo) y «Resumen».
 * Devuelve los bytes del .xlsx.
 */
export function eventosAXlsx(eventos = [], { filtros = {}, generadoPor = '', generadoEn = new Date(), truncadoDe = 0, enmascarar = false } = {}) {
  const E = ESTILO_XLSX
  const columnas = COLUMNAS_EXPORTACION
  const ultima = letraColumna(columnas.length - 1)
  const resumen = resumirEventosExportados(eventos)
  const cuando = formatearFechaLocal(generadoEn.toISOString())
  const quien = generadoPor ? ` por ${generadoPor}` : ''

  // ---- Hoja de eventos
  const filasEventos = [
    { alto: 30, celdas: [{ v: 'Registro de auditoría · sensor_pulso', e: E.TITULO }] },
    { alto: 18, celdas: [{
      v: `Generado el ${cuando}${quien}  ·  ${resumen.total} evento(s), ${resumen.sospechosos} sospechoso(s)`,
      e: E.SUBTITULO
    }] },
    { alto: 32, celdas: [{
      v: `Filtros aplicados: ${describirFiltros(filtros)}` +
        (truncadoDe > eventos.length ? `  ·  Se exportan los ${eventos.length} más recientes de ${truncadoDe}.` : '') +
        (enmascarar ? '  ·  Datos personales enmascarados.' : '  ·  Datos personales SIN enmascarar: manejar con cuidado.'),
      e: E.SUBTITULO
    }] },
    { alto: 8, celdas: [] },
    { alto: 30, celdas: columnas.map(c => ({ v: c.titulo, e: E.ENCABEZADO })) }
  ]
  for (const ev of eventos) {
    const f = filaExportacion(ev, { enmascarar })
    const alerta = f.sospechoso
    const partes = partesFechaLocal(f.fecha)
    filasEventos.push({
      celdas: [
        partes
          ? { v: serialExcel(partes), e: alerta ? E.FECHA_ALERTA : E.FECHA }
          : { v: f.fechaTexto, e: alerta ? E.CELDA_ALERTA : E.CELDA },
        { v: f.categoria, e: alerta ? E.CELDA_ALERTA : E.CELDA },
        { v: f.accion, e: alerta ? E.CELDA_ALERTA : E.CELDA },
        { v: f.usuario, e: alerta ? E.CELDA_ALERTA : E.CELDA },
        { v: f.correo, e: alerta ? E.CELDA_ALERTA : E.CELDA },
        { v: f.entidad, e: alerta ? E.CELDA_ALERTA : E.CELDA },
        { v: f.detalle, e: alerta ? E.CELDA_ALERTA : E.CELDA },
        { v: f.ip, e: alerta ? E.CENTRO_ALERTA : E.CENTRO },
        { v: alerta ? 'SÍ' : 'No', e: alerta ? E.CENTRO_ALERTA : E.CENTRO },
        { v: f.motivo, e: alerta ? E.CELDA_ALERTA : E.CELDA },
        { v: Number(f.id) || f.id, e: alerta ? E.CENTRO_ALERTA : E.CENTRO }
      ]
    })
  }
  const encabezadoFila = 5
  const hojaEventos = {
    nombre: 'Eventos',
    anchos: columnas.map(c => c.ancho),
    filas: filasEventos,
    combinar: [`A1:${ultima}1`, `A2:${ultima}2`, `A3:${ultima}3`],
    congelarFila: encabezadoFila,
    filtro: `A${encabezadoFila}:${ultima}${encabezadoFila + Math.max(1, eventos.length)}`,
    grilla: false
  }

  // ---- Hoja de resumen
  const filasResumen = [
    { alto: 30, celdas: [{ v: 'Resumen del registro exportado', e: E.TITULO }] },
    { alto: 18, celdas: [{ v: `Generado el ${cuando}${quien}`, e: E.SUBTITULO }] },
    { alto: 8, celdas: [] },
    { alto: 22, celdas: [{ v: 'Indicador', e: E.ENCABEZADO }, { v: 'Valor', e: E.ENCABEZADO }, { v: '', e: E.ENCABEZADO }] },
    { celdas: [{ v: 'Eventos exportados', e: E.ETIQUETA }, { v: resumen.total, e: E.NUMERO }, { v: '', e: E.CELDA }] },
    { celdas: [{ v: 'Eventos sospechosos', e: E.ETIQUETA }, { v: resumen.sospechosos, e: resumen.sospechosos ? E.CENTRO_ALERTA : E.NUMERO }, { v: '', e: E.CELDA }] },
    { celdas: [{ v: 'Primer evento', e: E.ETIQUETA }, { v: resumen.primero || '—', e: E.CELDA }, { v: '', e: E.CELDA }] },
    { celdas: [{ v: 'Último evento', e: E.ETIQUETA }, { v: resumen.ultimo || '—', e: E.CELDA }, { v: '', e: E.CELDA }] },
    { alto: 8, celdas: [] },
    { alto: 22, celdas: [{ v: 'Categoría', e: E.ENCABEZADO }, { v: 'Eventos', e: E.ENCABEZADO }, { v: 'Sospechosos', e: E.ENCABEZADO }] }
  ]
  for (const c of resumen.porCategoria) {
    filasResumen.push({ celdas: [
      { v: c.categoria, e: E.ETIQUETA },
      { v: c.total, e: E.NUMERO },
      { v: c.sospechosos, e: c.sospechosos ? E.CENTRO_ALERTA : E.NUMERO }
    ] })
  }
  if (resumen.porMotivo.length) {
    filasResumen.push({ alto: 8, celdas: [] })
    filasResumen.push({ alto: 22, celdas: [{ v: 'Motivo de la alerta', e: E.ENCABEZADO }, { v: 'Eventos', e: E.ENCABEZADO }, { v: '', e: E.ENCABEZADO }] })
    for (const m of resumen.porMotivo) {
      filasResumen.push({ celdas: [{ v: m.motivo, e: E.CELDA_ALERTA }, { v: m.total, e: E.CENTRO_ALERTA }, { v: '', e: E.CELDA_ALERTA }] })
    }
  }
  const hojaResumen = {
    nombre: 'Resumen',
    anchos: [52, 24, 16],
    filas: filasResumen,
    combinar: ['A1:C1', 'A2:C2'],
    horizontal: false,
    grilla: false
  }

  return construirXlsx([hojaEventos, hojaResumen])
}

/**
 * Trae, página por página, todos los eventos que cumplen los filtros (hasta MAX_EVENTOS_EXPORTACION).
 * Devuelve { ok, eventos, total } o { ok: false, error }.
 */
export async function obtenerEventosParaExportar(filtros = {}, maximo = MAX_EVENTOS_EXPORTACION) {
  const tamano = 200
  const eventos = []
  let total = 0
  for (let pagina = 1; eventos.length < maximo; pagina++) {
    const res = await listarAuditoriaPaginada({ ...filtros, pagina, porPagina: tamano })
    if (!res.ok) return { ok: false, eventos: [], total: 0, error: res.error }
    total = res.total
    eventos.push(...res.eventos)
    if (res.eventos.length < tamano || eventos.length >= total) break
  }
  return { ok: true, eventos: eventos.slice(0, maximo), total }
}

function descargarArchivo(contenido, tipoMime, nombre) {
  if (typeof document === 'undefined' || typeof URL === 'undefined') return
  const url = URL.createObjectURL(new Blob([contenido], { type: tipoMime }))
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/** Nombre del archivo, p. ej. auditoria-sensor_pulso-2026-11-18_1530.xlsx */
export function nombreArchivoExportacion(extension, fecha = new Date()) {
  const p = partesFechaLocal(fecha.toISOString())
  const marca = p ? `${p.anio}-${dos(p.mes)}-${dos(p.dia)}_${dos(p.hora)}${dos(p.minuto)}` : 'registro'
  return `auditoria-sensor_pulso-${marca}.${extension}`
}

/**
 * Exporta lo que cumple los filtros del panel en Excel («xlsx») o CSV («csv») y deja constancia de la
 * descarga en la auditoría (RF62). Si el servidor no puede registrarla, no se entrega el archivo.
 * Devuelve { ok, cantidad, total } o { ok: false, motivo, error }.
 */
export async function exportarAuditoria({
  formato = 'xlsx',
  filtros = {},
  generadoPor = '',
  // true: los datos personales salen enmascarados (RF61). El panel lo activa salvo que el administrador los haya mostrado.
  enmascarar = false,
  // Se pueden reemplazar para probar el flujo completo sin conexión ni navegador
  rpc = (nombre, args) => supabase.rpc(nombre, args),
  obtener = obtenerEventosParaExportar,
  descargar = descargarArchivo
} = {}) {
  try {
    const tipo = formato === 'csv' ? 'auditoria_csv' : 'auditoria_xlsx'
    const lote = await obtener(filtros)
    if (!lote.ok) return { ok: false, motivo: 'consulta_fallida', error: lote.error }
    if (!lote.eventos.length) return { ok: false, motivo: 'sin_eventos' }

    let respuesta = await rpc('registrar_descarga', { p_tipo: tipo, p_entidad_id: null })
    // Si la base aún tiene la versión anterior de la función (sin 'auditoria_xlsx'), la descarga se registra
    // igualmente como 'auditoria_csv' indicando el formato, para no dejar la exportación sin auditar.
    if (respuesta?.error && tipo === 'auditoria_xlsx' && /no v[aá]lido/i.test(respuesta.error.message || '')) {
      respuesta = await rpc('registrar_descarga', { p_tipo: 'auditoria_csv', p_entidad_id: 'xlsx' })
    }
    if (respuesta?.error) {
      return { ok: false, motivo: 'auditoria_rechazada', error: respuesta.error.message || String(respuesta.error) }
    }

    if (formato === 'csv') {
      descargar(eventosACsv(lote.eventos, { enmascarar }), 'text/csv;charset=utf-8', nombreArchivoExportacion('csv'))
    } else {
      const bytes = eventosAXlsx(lote.eventos, { filtros, generadoPor, truncadoDe: lote.total, enmascarar })
      descargar(
        bytes,
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        nombreArchivoExportacion('xlsx')
      )
    }

    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('auditoria-actualizada'))
    }
    return { ok: true, cantidad: lote.eventos.length, total: lote.total }
  } catch (err) {
    return { ok: false, motivo: 'error_inesperado', error: err?.message || String(err) }
  }
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
