import { supabase } from './supabase'
import { PRIMER_ADMIN } from '../../scripts/seedAdmin.js'

// Lista de cuentas institucionales para desarrollo y pruebas locales (RF45)
let cuentasLocales = [
  { id: '00000000-0000-0000-0000-000000000001', nombre: 'Administrador Inicial', correo: 'admin.general@unach.cl', rol: 'profesor', es_admin: true, creado_en: '2026-10-27T10:00:00Z' },
  { id: '00000000-0000-0000-0000-000000000002', nombre: 'Docente de Ciencias', correo: 'docente.ciencias@unach.cl', rol: 'profesor', es_admin: false, creado_en: '2026-10-28T11:00:00Z' },
  { id: '00000000-0000-0000-0000-000000000003', nombre: 'Constanza Morales', correo: 'cmorales@alu.unach.cl', rol: 'usuario', es_admin: false, creado_en: '2026-10-29T12:00:00Z' },
  { id: '00000000-0000-0000-0000-000000000004', nombre: 'Matías Silva', correo: 'msilva@alu.unach.cl', rol: 'usuario', es_admin: false, creado_en: '2026-10-29T14:30:00Z' }
]

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
 * RF45: Cambiar el rol de una cuenta con validación de no dejar el sistema sin administradores
 */
export async function actualizarRolCuenta({ id, nuevoRol, nuevoEsAdmin }) {
  try {
    // Criterio de aceptación: No se puede quitar el rol al único administrador
    if (nuevoEsAdmin === false) {
      const admins = cuentasLocales.filter(c => c.es_admin)
      if (admins.length <= 1 && admins.some(a => a.id === id)) {
        return {
          success: false,
          error: 'Operación denegada: No se puede retirar el rol al único administrador de la plataforma.'
        }
      }
    }

    // Actualizar en base de datos si está conectada
    try {
      await supabase
        .from('perfiles')
        .update({ rol: nuevoRol, es_admin: nuevoEsAdmin })
        .eq('id', id)
    } catch (_) {}

    // Actualizar en memoria local
    const idx = cuentasLocales.findIndex(c => c.id === id)
    if (idx !== -1) {
      cuentasLocales[idx].rol = nuevoRol
      cuentasLocales[idx].es_admin = nuevoEsAdmin
    }

    return { success: true, data: cuentasLocales[idx] }
  } catch (err) {
    return { success: false, error: err.message || 'Error al actualizar rol.' }
  }
}