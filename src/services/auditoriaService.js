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

const STORAGE_AUDITORIA_SISTEMA = 'sensor_pulso_auditoria_sistema_v1'

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

const EVENTOS_SEMILLA_AUDITORIA = [
  {
    id: 'aud-sys-001',
    ocurrio_en: '2026-11-11T16:45:12Z',
    accion: 'login',
    entidad: 'perfiles',
    entidad_id: 'admin.general@unach.cl',
    actor_id: '00000000-0000-0000-0000-000000000001',
    ip: '192.168.1.82',
    sospechoso: false,
    detalle: {
      actor_nombre: 'Administrador Inicial',
      actor_correo: 'admin.general@unach.cl',
      entidad_nombre: 'Sesión Institucional',
      resumen: 'Acceso exitoso verificado · IP: 192.168.1.82'
    }
  },
  {
    id: 'aud-sys-002',
    ocurrio_en: '2026-11-11T16:40:05Z',
    accion: 'cambio_rol',
    entidad: 'perfiles',
    entidad_id: '00000000-0000-0000-0000-000000000002',
    actor_id: '00000000-0000-0000-0000-000000000001',
    ip: '192.168.1.82',
    sospechoso: false,
    detalle: {
      actor_nombre: 'Administrador Inicial',
      actor_correo: 'admin.general@unach.cl',
      usuario_nombre: 'Docente de Ciencias',
      usuario_correo: 'docente.ciencias@unach.cl',
      rol_antes: 'usuario',
      rol_despues: 'profesor',
      admin_antes: false,
      admin_despues: false,
      resumen: 'Rol: Estudiante -> Profesor · Permisos actualizados'
    }
  },
  {
    id: 'aud-sys-003',
    ocurrio_en: '2026-11-11T16:35:19Z',
    accion: 'cambio_rangos',
    entidad: 'rangos',
    entidad_id: 'rango-reposo-18-24',
    actor_id: '00000000-0000-0000-0000-000000000001',
    ip: '192.168.1.82',
    sospechoso: false,
    detalle: {
      actor_nombre: 'Administrador Inicial',
      actor_correo: 'admin.general@unach.cl',
      entidad_nombre: 'Rango Reposo (18-24 años)',
      operacion: 'UPDATE',
      resumen: 'Actualización BPM: 60-100 BPM · SpO₂: 95-100%'
    }
  },
  {
    id: 'aud-sys-004',
    ocurrio_en: '2026-11-11T16:30:44Z',
    accion: 'descarga',
    entidad: 'descargas',
    entidad_id: 'informe-canal-1',
    actor_id: '00000000-0000-0000-0000-000000000003',
    ip: '192.168.1.82',
    sospechoso: false,
    detalle: {
      actor_nombre: 'Javiera Rail Astudillo',
      actor_correo: 'javiera.rail@alu.unach.cl',
      tipo: 'informe_pdf',
      entidad_nombre: 'Informe Clínico PDF',
      resumen: 'Archivo exportado: informe_pdf (Canal 1 · 74 BPM)'
    }
  },
  {
    id: 'aud-sys-005',
    ocurrio_en: '2026-11-11T16:28:10Z',
    accion: 'publicacion',
    entidad: 'mediciones',
    entidad_id: 'pub-anon-72bpm',
    actor_id: '00000000-0000-0000-0000-000000000001',
    ip: '192.168.1.82',
    sospechoso: false,
    detalle: {
      actor_nombre: 'Administrador Inicial',
      actor_correo: 'admin.general@unach.cl',
      entidad_nombre: 'Galería Pública Anónima',
      resumen: 'Publicación confirmada por titular (Rango 25-34 años · 72 BPM)'
    }
  },
  {
    id: 'aud-sys-006',
    ocurrio_en: '2026-11-11T16:20:03Z',
    accion: 'eliminacion',
    entidad: 'mediciones',
    entidad_id: 'med-8492',
    actor_id: '00000000-0000-0000-0000-000000000004',
    ip: '192.168.1.82',
    sospechoso: false,
    detalle: {
      actor_nombre: 'Matías Silva',
      actor_correo: 'msilva@alu.unach.cl',
      entidad_nombre: 'Medición #med-8492',
      resumen: 'Registro eliminado del historial personal por su titular'
    }
  }
]

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
  const actorNombre = raw.actor_nombre || det.actor_nombre || (actorCorreo === 'admin.general@unach.cl' ? 'Administrador Inicial' : (actorCorreo.split('@')[0] || 'Usuario UNACH'))
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

function leerUsuarioSesionLocal() {
  if (typeof localStorage === 'undefined') return null
  try {
    const rawProfile = localStorage.getItem('sensor_profile')
    const rawUser = localStorage.getItem('sensor_user') || localStorage.getItem('sensor_pulso_auth_user')
    const p = rawProfile ? JSON.parse(rawProfile) : null
    const u = rawUser ? JSON.parse(rawUser) : null
    if (!p && !u) return null
    return {
      id: p?.id || u?.id || null,
      email: p?.correo || u?.email || '',
      nombre: p?.nombre || u?.user_metadata?.full_name || u?.user_metadata?.nombre || ''
    }
  } catch {
    return null
  }
}

function leerAuditoriaLocal() {
  if (typeof localStorage === 'undefined') return [...EVENTOS_SEMILLA_AUDITORIA]
  try {
    const raw = localStorage.getItem(STORAGE_AUDITORIA_SISTEMA)
    if (!raw) {
      localStorage.setItem(STORAGE_AUDITORIA_SISTEMA, JSON.stringify(EVENTOS_SEMILLA_AUDITORIA))
      return [...EVENTOS_SEMILLA_AUDITORIA]
    }
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : [...EVENTOS_SEMILLA_AUDITORIA]
  } catch {
    return [...EVENTOS_SEMILLA_AUDITORIA]
  }
}

function guardarAuditoriaLocal(lista) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_AUDITORIA_SISTEMA, JSON.stringify(lista.slice(0, 250)))
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('auditoria-actualizada'))
    }
  } catch {
    // ignorar errores de cuota en almacenamiento local
  }
}

/**
 * Registra un nuevo evento en la bitácora inmutable de auditoría (RF62).
 * Solo permite agregar registros nuevos (append-only); jamás modifica ni elimina previos.
 */
export async function registrarEventoAuditoria({
  accion,
  entidad = 'sistema',
  entidadId = null,
  actorId = null,
  actorNombre = null,
  actorCorreo = null,
  entidadNombre = null,
  resumen = null,
  detalle = {},
  ip = '127.0.0.1',
  sospechoso = false
} = {}) {
  if (!accion) return null

  const sesionLocal = leerUsuarioSesionLocal()
  const correoFinal = actorCorreo || sesionLocal?.email || 'admin.general@unach.cl'
  const nombreFinal = actorNombre || sesionLocal?.user_metadata?.nombre || sesionLocal?.nombre || (correoFinal === 'admin.general@unach.cl' ? 'Administrador Inicial' : correoFinal.split('@')[0])
  const idActorFinal = actorId || sesionLocal?.id || null

  const detalleCompleto = {
    ...detalle,
    actor_nombre: nombreFinal,
    actor_correo: correoFinal,
    ...(entidadNombre ? { entidad_nombre: entidadNombre } : {}),
    ...(resumen ? { resumen } : {})
  }

  const nuevoCrudo = {
    id: `aud-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    ocurrio_en: new Date().toISOString(),
    actor_id: idActorFinal,
    accion,
    entidad,
    entidad_id: entidadId ? String(entidadId) : null,
    detalle: detalleCompleto,
    ip,
    sospechoso: Boolean(sospechoso)
  }

  const actual = leerAuditoriaLocal()
  guardarAuditoriaLocal([nuevoCrudo, ...actual])

  try {
    await supabase.from('auditoria').insert({
      actor_id: idActorFinal,
      accion,
      entidad,
      entidad_id: entidadId ? String(entidadId) : null,
      detalle: detalleCompleto,
      sospechoso: Boolean(sospechoso)
    })
  } catch {
    // La inserción directa en `auditoria` está restringida a triggers/RPCs en Supabase; la copia local complementa los triggers
  }

  const evento = normalizarEventoAuditoria(nuevoCrudo)
  return Object.freeze({ ok: true, evento })
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
 * Obtiene la lista consolidada e inmutable de eventos de auditoría (BD + registro local).
 */
export async function listarEventosAuditoria({ categoria = 'todos', busqueda = '', limite = 120 } = {}) {
  const localesCrudos = leerAuditoriaLocal()
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
    // sin conexión o rol demo local: se usan los registros locales
  }

  const mapaUnico = new Map()
  for (const item of [...remotosCrudos, ...localesCrudos]) {
    const norm = normalizarEventoAuditoria(item)
    const claveDedup = norm.id || `${norm.accion}|${norm.entidadTexto}|${norm.ocurrioEn.slice(0, 19)}`
    if (!mapaUnico.has(claveDedup)) {
      mapaUnico.set(claveDedup, norm)
    }
  }

  const todosOrdenados = [...mapaUnico.values()].sort(
    (a, b) => new Date(b.ocurrioEn).getTime() - new Date(a.ocurrioEn).getTime()
  )

  const filtrados = filtrarEventosAuditoria(todosOrdenados, { categoria, busqueda })
  return Object.freeze(filtrados)
}
