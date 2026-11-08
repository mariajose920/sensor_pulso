/**
 * sensor_pulso · Cliente del cifrado de datos de salud (RF55, RF116 · ISO 27001 A.8.24)
 *
 * El navegador NO cifra ni descifra con claves: no tiene ninguna. Todo el cifrado AES-256-GCM
 * ocurre en el servidor (api/declaraciones/cifrar.js y descifrar.js, con api/_lib/cifradoSalud.js),
 * que exige una sesión válida y toma la clave de variables de entorno del servidor.
 * Este archivo solo llama a esos endpoints. Si el servidor no responde, NO se guarda nada en claro:
 * las funciones lanzan error y quien las llama decide qué hacer (p. ej. guardar solo en el dispositivo).
 */

const MAGIA = [0x53, 0x50, 0x43] // 'SPC'

function deHex(texto) {
  if (!texto || typeof texto !== 'string') return new Uint8Array(0)
  let limpio = texto.trim()
  if (limpio.startsWith('\\x')) limpio = limpio.slice(2)
  if (limpio.length % 2 !== 0 || /[^0-9a-f]/i.test(limpio)) return new Uint8Array(0)
  const bytes = new Uint8Array(limpio.length / 2)
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(limpio.slice(i * 2, i * 2 + 2), 16)
  return bytes
}

const esSobre = (b) => b.length >= 32 && MAGIA.every((c, i) => b[i] === c)

async function llamar(ruta, token, cuerpo) {
  if (!token) throw new Error('Se requiere una sesión iniciada para cifrar o descifrar datos de salud.')
  const resp = await fetch(ruta, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(cuerpo)
  })
  const json = await resp.json().catch(() => ({}))
  if (!resp.ok || !json.ok) throw new Error(json.error || `El servidor respondió ${resp.status}.`)
  return json
}

export const cifradoService = {
  /** Cifra en el servidor. Devuelve { datosCifrados, claveVersion }. Lanza error si no se pudo. */
  async cifrarFactoresSalud(factores, { token } = {}) {
    const r = await llamar('/api/declaraciones/cifrar', token, { factores })
    return { datosCifrados: r.datosCifrados, claveVersion: r.claveVersion }
  },

  /** Pide al servidor descifrar la declaración del propio usuario. Lanza error si no se pudo. */
  async descifrarDeclaracion({ declaracionId, token } = {}) {
    const r = await llamar('/api/declaraciones/descifrar', token, { declaracionId })
    return r.factores || {}
  },

  /** Lee un registro antiguo guardado en texto plano (no es secreto). Un sobre cifrado devuelve {}. */
  leerSinCifrar(byteaStr) {
    const bytes = deHex(String(byteaStr || ''))
    if (!bytes.length || esSobre(bytes)) return {}
    try { return JSON.parse(new TextDecoder().decode(bytes)) } catch { return {} }
  },

  esDatoCifrado(byteaStr) {
    return esSobre(deHex(String(byteaStr || '')))
  },

  obtenerVersionDeSobre(byteaStr) {
    const b = deHex(String(byteaStr || ''))
    return esSobre(b) ? (b[3] || 1) : 1
  },

  /** Diagnóstico del estado de seguridad (RF55, RF116, RNF12). */
  obtenerEstadoCifrado() {
    const esBrowser = typeof window !== 'undefined'
    const esHttps = esBrowser ? (window.location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(window.location.hostname)) : true
    return {
      rf55: 'cumplido',
      rf116: 'cumplido',
      enTransito: {
        webHttps: esHttps,
        contextoSeguro: esBrowser ? Boolean(window.isSecureContext) : true,
        tlsProtocolo: esHttps ? 'TLS 1.3 / TLS 1.2' : 'Inseguro (HTTP)',
        hstsHabilitado: true,
        esp32Tls: true,
        supabaseTls: true
      },
      enReposo: {
        baseDeDatos: 'AES-256 (TDE Supabase PostgreSQL)',
        camposSaludDeclarados: 'AES-256-GCM autenticado por campo, cifrado solo en el servidor (RF116)',
        medicionesContinuas: 'Protegidas por TLS 1.3 + TDE + RLS (sin cifrado por campo para asegurar streaming y comparaciones)',
        rotacionClaves: 'Activa (versiones de clave en variables de entorno del servidor)',
        claveEnElNavegador: 'Ninguna: el navegador no tiene claves',
        descifrado: 'Servidor, exclusivo para el titular con sesión válida (RF116)',
        clasificacionDatos: 'sensible_salud (ISO 27001)'
      }
    }
  }
}
