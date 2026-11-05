import { createClient } from '@supabase/supabase-js'

// Proyecto sensor_pulso. La URL y la clave publicable son públicas por diseño:
// la seguridad la da el RLS de la base de datos (RNF12). Nunca usar aquí la clave secreta.
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' && process.env ? process.env : {})
const supabaseUrl = env.VITE_SUPABASE_URL || 'https://ozzehtpqxpicfqvmulcg.supabase.co'
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_CD_KR_pwQQQ1e_HR2aQemw_mNjM2_ml'

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Copia .env.example a .env.local.')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
})
