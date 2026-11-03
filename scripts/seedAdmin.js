/**
 * RF44: Script de creación del primer administrador en código
 * Uso: node scripts/seedAdmin.js
 */

import { createClient } from '@supabase/supabase-js'

// Definición en código del primer administrador oficial del sistema
export const PRIMER_ADMIN = {
  email: 'admin.general@unach.cl',
  password: 'AdminSecure#2026',
  nombreCompleto: 'Administrador Inicial',
  rol: 'admin'
}

async function inicializarPrimerAdmin() {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://ohdgfdbmnrwndffhtqdg.supabase.co'
  const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY || 'tu_clave_anon_de_supabase_aqui'

  const supabase = createClient(supabaseUrl, supabaseAnonKey)

  console.log('--- RF44: Inicializando Primer Administrador en Código ---')
  console.log(`Correo: ${PRIMER_ADMIN.email}`)

  try {
    const { data, error } = await supabase.auth.signUp({
      email: PRIMER_ADMIN.email,
      password: PRIMER_ADMIN.password,
      options: {
        data: {
          nombre_completo: PRIMER_ADMIN.nombreCompleto,
          rol: PRIMER_ADMIN.rol, // RF44: Rol admin asignado desde el código
          primer_admin: true
        }
      }
    })

    if (error) {
      if (error.message.includes('already registered')) {
        console.log('✓ El primer administrador ya existe en el sistema.')
      } else {
        console.error('Error al crear el primer admin:', error.message)
      }
      return
    }

    console.log('✓ Primer administrador creado exitosamente en Supabase Auth.')
    console.log(`ID asignado: ${data.user?.id}`)
  } catch (err) {
    console.error('Fallo en la ejecución:', err)
  }
}

// Ejecutar si se llama directamente con Node
if (typeof process !== 'undefined' && process?.argv?.[1]?.includes('seedAdmin.js')) {
  inicializarPrimerAdmin()
}