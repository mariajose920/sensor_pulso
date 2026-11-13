import { supabase } from './supabase.js'

export async function consultarEstadoMfa() {
  const { data, error } =
    await supabase.auth.mfa.getAuthenticatorAssuranceLevel()

  if (error) throw error

  return {
    nivelActual: data.currentLevel,
    nivelSiguiente: data.nextLevel
  }
}

export async function listarFactoresTotp() {
  const { data, error } = await supabase.auth.mfa.listFactors()
  if (error) throw error

  return data.totp.filter(factor => factor.status === 'verified')
}

export async function enrolarMfaTotp() {
  const { data, error } = await supabase.auth.mfa.enroll({
    factorType: 'totp'
  })

  if (error) throw error

  return {
    factorId: data.id,
    codigoQr: data.totp.qr_code,
    secreto: data.totp.secret
  }
}

export async function verificarCodigoMfa(factorId, codigo) {
  const code = codigo.trim()

  if (!/^\d{6}$/.test(code)) {
    throw new Error('Ingresa los seis dígitos de tu aplicación autenticadora.')
  }

  const { error } = await supabase.auth.mfa.challengeAndVerify({
    factorId,
    code
  })

  if (error) throw error
}

export async function eliminarFactorMfa(factorId) {
  const { error } = await supabase.auth.mfa.unenroll({ factorId })
  if (error) throw error
}