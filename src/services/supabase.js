import { createClient } from '@supabase/supabase-js'

// Proyecto sensor_pulso. La URL y la clave publicable son públicas por diseño:
// la seguridad la da el RLS de la base de datos (RNF12). Nunca usar aquí la clave secreta.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env.local.')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
})
