/**
 * Script para consultar directamente los consentimientos guardados en Supabase (RF59)
 * Uso desde tu terminal: node scripts/ver-consentimientos-supabase.js
 */
import { createClient } from '@supabase/supabase-js'

const url = 'https://ozzehtpqxpicfqvmulcg.supabase.co'
const key = 'sb_publishable_CD_KR_pwQQQ1e_HR2aQemw_mNjM2_ml'
const supabase = createClient(url, key)

async function verConsentimientos() {
  console.log('\n=============================================================')
  console.log('   CONSULTANDO LA BASE DE DATOS SUPABASE EN VIVO (RF59)      ')
  console.log('=============================================================\n')

  // 1. Iniciar sesión como usuario para consultar los consentimientos
  const { data: auth, error: authErr } = await supabase.auth.signInWithPassword({
    email: 'admin.general@unach.cl',
    password: 'AdminSecure#2026'
  })

  if (authErr) {
    console.error('Error al conectar con Supabase Auth:', authErr.message)
    return
  }

  console.log(`✓ Sesión activa en Supabase como: ${auth.user.email} (ID: ${auth.user.id})`)

  // 2. Consultar la tabla consentimientos_aceptados
  const { data, error } = await supabase
    .from('consentimientos_aceptados')
    .select('id, version, aceptado_en, revocado_en')
    .order('aceptado_en', { ascending: false })

  if (error) {
    console.error('Error al consultar consentimientos en Supabase:', error.message)
    return
  }

  if (!data || data.length === 0) {
    console.log('No hay consentimientos registrados todavía.')
    return
  }

  console.log('\n--- REGISTRO ENCONTRADO EN LA TABLA consentimientos_aceptados ---')
  console.table(data.map(item => ({
    'ID Registro': item.id,
    'Versión (RF59)': item.version,
    'Fecha y Hora Exacta': new Date(item.aceptado_en).toLocaleString('es-CL'),
    'Estado': item.revocado_en ? 'Revocado' : 'Vigente'
  })))

  console.log('=============================================================\n')
}

verConsentimientos()
