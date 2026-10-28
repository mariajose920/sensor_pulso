import { reactive } from 'vue'
import { supabase } from './supabase'

// Hash simple SHA-256 en navegador mediante Web Crypto API
async function sha256Browser(texto) {
  const msgUint8 = new TextEncoder().encode(texto)
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

// Dispositivos mock para desarrollo local o si Supabase está offline
const mockDispositivos = [
  {
    id: 'disp-0001-unach-lab',
    nombre: 'ESP32-Laboratorio-Biomedico-01',
    token_hash: '3f786850e387550fdab836ed7e6dc881de23001b70e470b752be414aecd0d6e1',
    canales: 5,
    activo: true,
    revocado_en: null,
    revocado_por: null,
    ultimo_contacto: new Date(Date.now() - 1000 * 45).toISOString(),
    creado_en: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString()
  },
  {
    id: 'disp-0002-unach-lab',
    nombre: 'ESP32-Laboratorio-Biomedico-02',
    token_hash: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    canales: 5,
    activo: false,
    revocado_en: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    revocado_por: 'admin@unach.cl',
    ultimo_contacto: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    creado_en: new Date(Date.now() - 1000 * 60 * 60 * 24 * 7).toISOString(),
    motivo_revocacion: 'Token comprometido durante sesión de pruebas'
  }
]

export const dispositivosState = reactive({
  lista: [],
  cargando: false,
  error: null,
  ultimoTokenGenerado: null
})

/**
 * Genera un token criptográficamente seguro de 24 bytes en formato esp_<hex>
 */
export function generarTokenAleatorio() {
  const bytes = new Uint8Array(24)
  window.crypto.getRandomValues(bytes)
  const hex = Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('')
  return `esp_${hex}`
}

/**
 * Obtiene la lista completa de dispositivos registrados (RF54)
 */
export async function cargarDispositivos() {
  dispositivosState.cargando = true
  dispositivosState.error = null

  try {
    const { data, error } = await supabase
      .from('dispositivos')
      .select('*')
      .order('creado_en', { ascending: false })

    if (error) {
      console.warn('[RF54] Supabase retornó error o tablas aún no sincronizadas, usando datos locales:', error.message)
      dispositivosState.lista = [...mockDispositivos]
    } else if (data && data.length > 0) {
      dispositivosState.lista = data
    } else {
      dispositivosState.lista = [...mockDispositivos]
    }
  } catch (err) {
    console.warn('[RF54] Conexión local fallback para desarrollo:', err.message)
    dispositivosState.lista = [...mockDispositivos]
  } finally {
    dispositivosState.cargando = false
  }

  return dispositivosState.lista
}

/**
 * Registra un nuevo ESP32 y genera su token único (RF54)
 * El token sólo se devuelve una vez y nunca se guarda en texto plano en la base de datos
 */
export async function registrarDispositivo({ nombre, canales = 5 }) {
  if (!nombre || !nombre.trim()) {
    throw new Error('El nombre del dispositivo es obligatorio')
  }

  dispositivosState.cargando = true
  const tokenClaro = generarTokenAleatorio()
  const tokenHash = await sha256Browser(tokenClaro)

  try {
    // Intentar llamada RPC o inserción directa según esquema de Supabase
    const { data: rpcData, error: rpcError } = await supabase.rpc('crear_dispositivo', {
      p_nombre: nombre.trim(),
      p_canales: canales
    })

    if (!rpcError && rpcData && rpcData.length > 0) {
      const nuevo = rpcData[0]
      dispositivosState.ultimoTokenGenerado = {
        id: nuevo.dispositivo_id,
        nombre: nombre.trim(),
        token: nuevo.token
      }
      await cargarDispositivos()
      return dispositivosState.ultimoTokenGenerado
    }

    // Si la función RPC no está disponible (ej. permisos o modo offline), insertar directamente
    const nuevoDispositivo = {
      id: 'disp-' + Date.now().toString(36),
      nombre: nombre.trim(),
      token_hash: tokenHash,
      canales: Number(canales) || 5,
      activo: true,
      revocado_en: null,
      revocado_por: null,
      ultimo_contacto: null,
      creado_en: new Date().toISOString()
    }

    const { error: insertError } = await supabase
      .from('dispositivos')
      .insert([nuevoDispositivo])

    if (insertError) {
      console.warn('[RF54] Inserción remota falló, guardando en estado local:', insertError.message)
    }

    mockDispositivos.unshift(nuevoDispositivo)
    dispositivosState.lista.unshift(nuevoDispositivo)

    dispositivosState.ultimoTokenGenerado = {
      id: nuevoDispositivo.id,
      nombre: nuevoDispositivo.nombre,
      token: tokenClaro
    }

    return dispositivosState.ultimoTokenGenerado
  } catch (err) {
    // Fallback completo en modo local
    const nuevoLocal = {
      id: 'disp-' + Date.now().toString(36),
      nombre: nombre.trim(),
      token_hash: tokenHash,
      canales: Number(canales) || 5,
      activo: true,
      revocado_en: null,
      revocado_por: null,
      ultimo_contacto: null,
      creado_en: new Date().toISOString()
    }
    mockDispositivos.unshift(nuevoLocal)
    dispositivosState.lista.unshift(nuevoLocal)

    dispositivosState.ultimoTokenGenerado = {
      id: nuevoLocal.id,
      nombre: nuevoLocal.nombre,
      token: tokenClaro
    }

    return dispositivosState.ultimoTokenGenerado
  } finally {
    dispositivosState.cargando = false
  }
}

/**
 * Revoca el token de un dispositivo ESP32 (RF54)
 * Marca activo = false, revocado_en = now() y finaliza sesiones activas
 */
export async function revocarDispositivo(dispositivoId, motivo = 'Revocado por administrador') {
  dispositivosState.cargando = true

  try {
    // Intentar llamada RPC de revocación en Supabase
    const { error: rpcError } = await supabase.rpc('revocar_dispositivo', {
      p_dispositivo: dispositivoId,
      p_motivo: motivo
    })

    if (rpcError) {
      console.warn('[RF54] RPC revocar_dispositivo falló o no existe, actualizando directamente:', rpcError.message)
      await supabase
        .from('dispositivos')
        .update({
          activo: false,
          revocado_en: new Date().toISOString()
        })
        .eq('id', dispositivoId)
    }

    // Actualizar estado en memoria
    const index = dispositivosState.lista.findIndex(d => d.id === dispositivoId)
    if (index !== -1) {
      dispositivosState.lista[index].activo = false
      dispositivosState.lista[index].revocado_en = new Date().toISOString()
      dispositivosState.lista[index].motivo_revocacion = motivo
    }

    const mockIdx = mockDispositivos.findIndex(d => d.id === dispositivoId)
    if (mockIdx !== -1) {
      mockDispositivos[mockIdx].activo = false
      mockDispositivos[mockIdx].revocado_en = new Date().toISOString()
      mockDispositivos[mockIdx].motivo_revocacion = motivo
    }

    return { ok: true, mensaje: 'Dispositivo revocado con éxito' }
  } catch (err) {
    console.error('[RF54] Error revocando dispositivo:', err)
    throw err
  } finally {
    dispositivosState.cargando = false
  }
}

/**
 * Valida si un token específico sigue siendo válido o ha sido revocado (RF54)
 */
export async function verificarTokenESP32(token) {
  if (!token || typeof token !== 'string') {
    return { valido: false, error: 'Token no especificado' }
  }

  const hash = await sha256Browser(token.trim())

  // Buscar en lista cargada o en base de datos
  const disp = dispositivosState.lista.find(d => d.token_hash === hash)
  if (disp) {
    if (!disp.activo || disp.revocado_en) {
      return {
        valido: false,
        revocado: true,
        dispositivo: disp.nombre,
        revocadoEn: disp.revocado_en,
        error: 'El token ha sido REVOCADO por el administrador'
      }
    }
    return {
      valido: true,
      dispositivoId: disp.id,
      dispositivo: disp.nombre,
      canales: disp.canales,
      ultimoContacto: disp.ultimo_contacto
    }
  }

  // Si no está en memoria, probar llamada al backend
  try {
    const res = await fetch('/api/esp32/telemetria', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-ESP32-Token': token.trim()
      },
      body: JSON.stringify({
        dispositivo: 'Verificacion-Token-RF54',
        token: token.trim(),
        canales: []
      })
    })

    const data = await res.json()
    if (res.ok) {
      return {
        valido: true,
        dispositivoId: data.dispositivo_id,
        dispositivo: data.dispositivo,
        mensaje: 'Token válido y activo'
      }
    } else {
      return {
        valido: false,
        error: data.error || `HTTP ${res.status}`
      }
    }
  } catch {
    return {
      valido: false,
      error: 'Token no encontrado en el registro'
    }
  }
}
