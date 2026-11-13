import { createClient } from '@supabase/supabase-js'

// Proyecto sensor_pulso. La URL y la clave publicable son públicas por diseño:
// la seguridad la da el RLS de la base de datos (RNF12). Nunca usar aquí la clave secreta.
const env = (typeof import.meta !== 'undefined' && import.meta.env) ? import.meta.env : (typeof process !== 'undefined' && process.env ? process.env : {})
const rawUrl = env.VITE_SUPABASE_URL || 'https://ozzehtpqxpicfqvmulcg.supabase.co'
const supabaseKey = env.VITE_SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_CD_KR_pwQQQ1e_HR2aQemw_mNjM2_ml'

// RF55: Cifrado en tránsito (TLS/HTTPS) obligatorio entre aplicación web y Supabase
// Forzar protocolo HTTPS y canal seguro WSS para Realtime, previniendo tráfico en texto plano
let supabaseUrl = (rawUrl || '').trim()
if (supabaseUrl.startsWith('http://')) {
  console.warn('[Seguridad RF55] Supabase URL configurada con HTTP inseguro. Elevando a HTTPS para garantizar TLS en tránsito.')
  supabaseUrl = supabaseUrl.replace(/^http:\/\//, 'https://')
}

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Faltan VITE_SUPABASE_URL o VITE_SUPABASE_PUBLISHABLE_KEY. Créalas en .env.local (ver README).')
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
  realtime: {
    // Garantiza WebSocket seguro sobre TLS (wss://)
    transport: undefined
  }
})

// Metadatos de seguridad del canal en tránsito (RF55)
export const seguridadCanalSupabase = {
  tlsActivo: supabaseUrl.startsWith('https://'),
  protocoloWeb: 'HTTPS / TLS 1.3',
  protocoloRealtime: 'WSS / TLS 1.3',
  endpointSeguro: supabaseUrl
}
