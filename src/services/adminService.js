import { supabase } from './supabase'
import { PRIMER_ADMIN } from '../../scripts/seedAdmin.js'

/**
 * RF44: Servicio de gestión e inicialización del primer administrador
 */
export async function verificarOCrearPrimerAdmin() {
  try {
    const { data, error } = await supabase.auth.signUp({
      email: PRIMER_ADMIN.email,
      password: PRIMER_ADMIN.password,
      options: {
        data: {
          nombre_completo: PRIMER_ADMIN.nombreCompleto,
          rol: PRIMER_ADMIN.rol,
          primer_admin: true
        }
      }
    })

    if (error) {
      if (error.message.includes('already registered')) {
        return { 
          creado: false, 
          mensaje: 'El primer administrador ya se encuentra registrado en el sistema.' 
        }
      }
      throw error
    }

    return { 
      creado: true, 
      mensaje: `Primer administrador (${PRIMER_ADMIN.email}) inicializado exitosamente.`,
      user: data.user 
    }
  } catch (err) {
    return { 
      creado: false, 
      error: err.message || 'Error al inicializar el primer administrador.' 
    }
  }
}