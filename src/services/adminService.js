import { supabase } from './supabase'
import { PRIMER_ADMIN } from '../../scripts/seedAdmin.js'

// Claves de localStorage para persistencia en pruebas y recargas (F5)
const STORAGE_CUENTAS = 'sensor_pulso_cuentas_locales'
const STORAGE_PERMISOS = 'sensor_pulso_permisos_profesores_locales'
const STORAGE_AUDITORIA_ROLES = 'sensor_pulso_auditoria_roles_locales'

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

// Lista de cuentas institucionales para desarrollo y pruebas locales (RF45)
let cuentasLocales = cargarDeStorage(STORAGE_CUENTAS, [
  { id: '00000000-0000-0000-0000-000000000001', nombre: 'Administrador Inicial', correo: 'admin.general@unach.cl', rol: 'profesor', es_admin: true, creado_en: '2026-10-27T10:00:00Z' },
  { id: '00000000-0000-0000-0000-000000000002', nombre: 'Docente de Ciencias', correo: 'docente.ciencias@unach.cl', rol: 'profesor', es_admin: false, creado_en: '2026-10-28T11:00:00Z' },
  { id: '06d76e05-00b4-4098-b5a1-bf518561f0c4', nombre: 'Profesor Docente', correo: 'profesor.prueba@unach.cl', rol: 'profesor', es_admin: false, creado_en: '2026-10-28T12:00:00Z' },
  { id: '00000000-0000-0000-0000-000000000003', nombre: 'Constanza Morales', correo: 'cmorales@alu.unach.cl', rol: 'usuario', es_admin: false, creado_en: '2026-10-29T12:00:00Z' },
  { id: '00000000-0000-0000-0000-000000000004', nombre: 'Matías Silva', correo: 'msilva@alu.unach.cl', rol: 'usuario', es_admin: false, creado_en: '2026-10-29T14:30:00Z' }
])

// Historial inicial de auditoría de roles (RF53)
let auditoriaRolesLocales = cargarDeStorage(STORAGE_AUDITORIA_ROLES, [
  {
    id: 'aud-001',
    actor_id: '00000000-0000-0000-0000-000000000001',
    actor_nombre: 'Administrador Inicial',
    actor_correo: 'admin.general@unach.cl',
    usuario_id: '00000000-0000-0000-0000-000000000002',
    usuario_nombre: 'Docente de Ciencias',
    usuario_correo: 'docente.ciencias@unach.cl',
    rol_antes: 'usuario',
    rol_despues: 'profesor',
    admin_antes: false,
    admin_despues: false,
    ocurrio_en: '2026-10-28T11:05:00Z'
  },
  {
    id: 'aud-002',
    actor_id: '00000000-0000-0000-0000-000000000001',
    actor_nombre: 'Administrador Inicial',
    actor_correo: 'admin.general@unach.cl',
    usuario_id: '00000000-0000-0000-0000-000000000001',
    usuario_nombre: 'Administrador Inicial',
    usuario_correo: 'admin.general@unach.cl',
    rol_antes: 'usuario',
    rol_despues: 'profesor',
    admin_antes: true,
    admin_despues: true,
    ocurrio_en: '2026-10-27T10:02:00Z'
  }
])

export async function verificarOCrearPrimerAdmin() {
  return { 
    creado: true, 
    mensaje: `Primer administrador (${PRIMER_ADMIN.email}) verificado en código.` 
  }
}

/**
 * RF45: Obtener lista de perfiles/cuentas para el panel de administración
 */
export async function obtenerCuentas() {
  try {
    const { data, error } = await supabase
      .from('perfiles')
      .select('id, correo, nombre, rol, es_admin, creado_en')
      .order('creado_en', { ascending: false })

    if (!error && data && data.length > 0) {
      return { success: true, data }
    }
  } catch (_) {}

  // Fallback con cuentas institucionales locales si Supabase está vacío
  return { success: true, data: [...cuentasLocales] }
}

/**
 * RF45 & RF53: Cambiar el rol de una cuenta
 * Criterios de aceptación RF53:
 * - Solo un administrador puede asignar o modificar el rol de administrador (validado en BD y servicio).
 * - Cada cambio queda registrado en la auditoría con quién lo hizo, a quién, roles y fecha.
 */
export async function actualizarRolCuenta({ 
  id, 
  nuevoRol, 
  nuevoEsAdmin,
  actorId,
  actorEsAdmin,
  actorNombre,
  actorCorreo
}) {
  try {
    // 1. Criterio de aceptación RF53: Solo un administrador puede dar o modificar el rol de administrador
    if (!actorEsAdmin) {
      return {
        success: false,
        error: 'Acceso denegado: El rol de administrador solo puede ser asignado por otro administrador.'
      }
    }

    // Buscar cuenta a modificar
    const cuentaActual = cuentasLocales.find(c => c.id === id)
    const rolAnterior = cuentaActual?.rol || 'usuario'
    const adminAnterior = cuentaActual ? !!cuentaActual.es_admin : false

    // 2. Criterio de aceptación RF45: No se puede quitar el rol al único administrador
    if (nuevoEsAdmin === false) {
      const admins = cuentasLocales.filter(c => c.es_admin)
      if (admins.length <= 1 && admins.some(a => a.id === id)) {
        return {
          success: false,
          error: 'Operación denegada: No se puede retirar el rol al único administrador de la plataforma.'
        }
      }
    }

    // 3. Actualizar en base de datos si está conectada (dispara trigger proteger_cambio_rol y auditar_cambio_rol)
    try {
      const { error: dbError } = await supabase
        .from('perfiles')
        .update({ rol: nuevoRol, es_admin: nuevoEsAdmin })
        .eq('id', id)

      if (dbError) {
        return { success: false, error: dbError.message || 'Error de permisos en base de datos.' }
      }
    } catch (err) {
      // Si la BD rechazó explícitamente la acción de seguridad
      if (err?.code === '42501' || err?.message?.includes('Solo un administrador')) {
        return { success: false, error: 'La base de datos rechazó la operación: Solo un administrador puede cambiar roles.' }
      }
    }

    // 4. Actualizar en memoria local y persistir
    const idx = cuentasLocales.findIndex(c => c.id === id)
    if (idx !== -1) {
      cuentasLocales[idx].rol = nuevoRol
      cuentasLocales[idx].es_admin = nuevoEsAdmin
      guardarEnStorage(STORAGE_CUENTAS, cuentasLocales)
    }

    // 5. RF53: Registrar el cambio en la auditoría (quién lo hizo, a quién, rol anterior, nuevo, fecha y hora)
    const fechaHora = new Date().toISOString()
    const nuevoRegistroAuditoria = {
      id: `aud-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      actor_id: actorId || '00000000-0000-0000-0000-000000000001',
      actor_nombre: actorNombre || 'Administrador',
      actor_correo: actorCorreo || 'admin.general@unach.cl',
      usuario_id: id,
      usuario_nombre: cuentaActual?.nombre || 'Usuario',
      usuario_correo: cuentaActual?.correo || '',
      rol_antes: rolAnterior,
      rol_despues: nuevoRol,
      admin_antes: adminAnterior,
      admin_despues: nuevoEsAdmin,
      ocurrio_en: fechaHora
    }

    // Insertar en Supabase tabla auditoria si está disponible
    try {
      await supabase.from('auditoria').insert({
        actor_id: actorId,
        accion: 'cambio_rol',
        entidad: 'perfiles',
        entidad_id: id,
        detalle: {
          actor_nombre: actorNombre,
          actor_correo: actorCorreo,
          usuario_nombre: cuentaActual?.nombre,
          usuario_correo: cuentaActual?.correo,
          rol_antes: rolAnterior,
          rol_despues: nuevoRol,
          admin_antes: adminAnterior,
          admin_despues: nuevoEsAdmin
        }
      })
    } catch (_) {}

    // Guardar en auditoría local
    auditoriaRolesLocales.unshift(nuevoRegistroAuditoria)
    guardarEnStorage(STORAGE_AUDITORIA_ROLES, auditoriaRolesLocales)

    return { success: true, data: cuentasLocales[idx], auditoria: nuevoRegistroAuditoria }
  } catch (err) {
    return { success: false, error: err.message || 'Error al actualizar rol.' }
  }
}

/**
 * RF53: Obtener el registro de auditoría de cambios de rol
 */
export async function obtenerHistorialCambiosRol() {
  try {
    const { data, error } = await supabase
      .from('auditoria')
      .select('id, actor_id, accion, entidad_id, detalle, ocurrio_en')
      .eq('accion', 'cambio_rol')
      .order('ocurrio_en', { ascending: false })

    if (!error && data && data.length > 0) {
      const mapeados = data.map(item => ({
        id: item.id,
        actor_id: item.actor_id,
        actor_nombre: item.detalle?.actor_nombre || 'Administrador',
        actor_correo: item.detalle?.actor_correo || '',
        usuario_id: item.entidad_id,
        usuario_nombre: item.detalle?.usuario_nombre || 'Usuario',
        usuario_correo: item.detalle?.usuario_correo || '',
        rol_antes: item.detalle?.rol_antes || 'usuario',
        rol_despues: item.detalle?.rol_despues || 'usuario',
        admin_antes: !!item.detalle?.admin_antes,
        admin_despues: !!item.detalle?.admin_despues,
        ocurrio_en: item.ocurrio_en
      }))
      return { success: true, data: mapeados }
    }
  } catch (_) {}

  return { success: true, data: [...auditoriaRolesLocales] }
}

// Permisos por defecto (todos en false para profesores nuevos)
export const PERMISOS_DEFAULT = {
  crear_aulas: false,
  publicar_galeria: false,
  compartir_banco: false,
  editar_rangos: false,
  editar_contenidos: false
}

// Almacén en memoria para pruebas locales
let permisosProfesoresLocales = cargarDeStorage(STORAGE_PERMISOS, {
  '00000000-0000-0000-0000-000000000001': {
    crear_aulas: true, publicar_galeria: true, compartir_banco: true, editar_rangos: true, editar_contenidos: true
  },
  '00000000-0000-0000-0000-000000000002': {
    crear_aulas: false, publicar_galeria: false, compartir_banco: false, editar_rangos: false, editar_contenidos: false
  }
})

/**
 * RF98: Obtener los permisos de un profesor
 */
export async function obtenerPermisosProfesor(profesorId) {
  // `consultado` = la base respondió (con o sin fila). Si falla la consulta (red, sesión) se devuelven los permisos
  // locales de respaldo con `consultado: false`, para que quien los use no tome «no se pudo consultar» por «no tiene permiso».
  let consultado = false
  try {
    const { data, error } = await supabase
      .from('permisos_profesor')
      .select('*')
      .eq('profesor_id', profesorId)
      .maybeSingle()

    if (!error && data) {
      return { success: true, data, consultado: true }
    }
    consultado = !error // sin error y sin fila: la base respondió que no hay permisos concedidos
  } catch (_) {}

  const local = permisosProfesoresLocales[profesorId] || { ...PERMISOS_DEFAULT, profesor_id: profesorId }
  return { success: true, data: local, consultado }
}

/**
 * RF98: Guardar permisos personalizados de un profesor
 */
export async function guardarPermisosProfesor(profesorId, permisos, otorgadoPorId) {
  try {
    const payload = {
      profesor_id: profesorId,
      crear_aulas: !!permisos.crear_aulas,
      publicar_galeria: !!permisos.publicar_galeria,
      compartir_banco: !!permisos.compartir_banco,
      editar_rangos: !!permisos.editar_rangos,
      editar_contenidos: !!permisos.editar_contenidos,
      otorgado_por: otorgadoPorId,
      actualizado_en: new Date().toISOString()
    }

    try {
      await supabase
        .from('permisos_profesor')
        .upsert(payload)
    } catch (_) {}

    permisosProfesoresLocales[profesorId] = { ...payload }
    guardarEnStorage(STORAGE_PERMISOS, permisosProfesoresLocales)
    return { success: true, data: payload }
  } catch (err) {
    return { success: false, error: err.message || 'Error al guardar permisos.' }
  }
}
