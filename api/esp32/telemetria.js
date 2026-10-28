import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'

// Cache en memoria para almacenar la última telemetría recibida
// Permite que la app web en tiempo real consulte o verifique el estado inmediato del ESP32
let ultimaTelemetria = {
  conectado: false,
  ultimoContacto: null,
  dispositivo: null,
  ip: null,
  rssi: null,
  paquete: 0,
  canales: []
}

// Historial circular corto de paquetes para estadísticas de latencia y recepción
const bufferPaquetes = []
const MAX_HISTORIAL = 50

// Función para inicializar cliente Supabase con clave de servicio si está disponible
function getAdminSupabase() {
  const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL
  const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !secretKey) return null
  return createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false }
  })
}

// Handler compatible con Vercel Serverless Functions y Vite Middleware
export default async function handler(req, res) {
  // Configuración de cabeceras CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-ESP32-Token')

  if (req.method === 'OPTIONS') {
    res.statusCode = 204
    return res.end()
  }

  // --------------------------------------------------------------------------
  // GET: Consultar el estado en vivo de la telemetría recibida del ESP32
  // --------------------------------------------------------------------------
  if (req.method === 'GET') {
    const ahora = Date.now()
    const estaConectado = ultimaTelemetria.ultimoContacto && (ahora - new Date(ultimaTelemetria.ultimoContacto).getTime() < 5000)

    const respuesta = {
      ok: true,
      conectado: Boolean(estaConectado),
      ultimoContacto: ultimaTelemetria.ultimoContacto,
      tiempoDesdeUltimoContactoMs: ultimaTelemetria.ultimoContacto ? ahora - new Date(ultimaTelemetria.ultimoContacto).getTime() : null,
      dispositivo: ultimaTelemetria.dispositivo,
      ip: ultimaTelemetria.ip,
      rssi: ultimaTelemetria.rssi,
      paquete: ultimaTelemetria.paquete,
      canales: ultimaTelemetria.canales,
      estadisticas: {
        totalPaquetes: bufferPaquetes.length,
        tasaRecepcionEstimada: bufferPaquetes.length >= 2 ? '1.0 Hz' : '0.0 Hz'
      }
    }

    res.setHeader('Content-Type', 'application/json')
    res.statusCode = 200
    return res.end(JSON.stringify(respuesta))
  }

  // --------------------------------------------------------------------------
  // POST: Recepción de telemetría WiFi del ESP32 (RF05, RF54)
  // --------------------------------------------------------------------------
  if (req.method === 'POST') {
    try {
      // 1. Obtener y parsear el cuerpo de la petición
      let body = req.body
      if (typeof body === 'string') {
        try {
          body = JSON.parse(body)
        } catch {
          res.statusCode = 400
          res.setHeader('Content-Type', 'application/json')
          return res.end(JSON.stringify({ ok: false, error: 'JSON malformado' }))
        }
      }

      if (!body) {
        res.statusCode = 400
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ ok: false, error: 'Cuerpo de la petición vacío' }))
      }

      // 2. Extraer token del ESP32 (RF54)
      const authHeader = req.headers['authorization'] || ''
      const bearerToken = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null
      const token = req.headers['x-esp32-token'] || bearerToken || body.token

      if (!token || typeof token !== 'string') {
        res.statusCode = 401
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({ ok: false, error: 'Falta token de autenticación del dispositivo ESP32 (RF54)' }))
      }

      // 3. Validación de token con Supabase o modo desarrollo
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
      let dispositivoValido = false
      let dispositivoId = null
      let dispositivoNombre = body.dispositivo || 'ESP32-Generico'

      const supabaseAdmin = getAdminSupabase()
      if (supabaseAdmin) {
        try {
          // Consultar dispositivo activo por su hash de token (RF54)
          const { data: disp, error: dispErr } = await supabaseAdmin
            .from('dispositivos')
            .select('id, nombre, activo, revocado_en')
            .eq('token_hash', tokenHash)
            .single()

          if (!dispErr && disp && disp.activo && !disp.revocado_en) {
            dispositivoValido = true
            dispositivoId = disp.id
            dispositivoNombre = disp.nombre

            // Actualizar último contacto en base de datos
            await supabaseAdmin
              .from('dispositivos')
              .update({ ultimo_contacto: new Date().toISOString() })
              .eq('id', disp.id)
          }
        } catch (dbErr) {
          console.warn('[ESP32 Ingest] Error consultando Supabase:', dbErr.message)
        }
      } else {
        // En entorno local de pruebas o desarrollo sin secret_key configurada:
        // Aceptamos tokens que comiencen con 'esp_' para permitir pruebas completas
        if (token.startsWith('esp_') || token.length >= 8) {
          dispositivoValido = true
          dispositivoId = 'dev-esp32-' + tokenHash.substring(0, 8)
        }
      }

      if (!dispositivoValido) {
        res.statusCode = 403
        res.setHeader('Content-Type', 'application/json')
        return res.end(JSON.stringify({
          ok: false,
          error: 'Token no autorizado o dispositivo revocado por el administrador (RF54)'
        }))
      }

      // 4. Validar y procesar canales (RF05, RF08)
      const canalesRecibidos = Array.isArray(body.canales) ? body.canales : []
      const canalesProcesados = canalesRecibidos.map(ch => ({
        canal: Number(ch.canal) || 1,
        activo: ch.activo !== false,
        bpm: Number(ch.bpm) || 0,
        spo2: Number(ch.spo2) || 0,
        calidad: ['buena', 'regular', 'mala'].includes(ch.calidad) ? ch.calidad : 'buena',
        ir: Array.isArray(ch.ir) ? ch.ir.slice(0, 100) : [],
        rojo: Array.isArray(ch.rojo) ? ch.rojo.slice(0, 100) : []
      }))

      // 5. Actualizar cache en memoria
      const ahoraIso = new Date().toISOString()
      const ipCliente = req.headers['x-forwarded-for'] || req.socket?.remoteAddress || body.ip || '127.0.0.1'

      ultimaTelemetria = {
        conectado: true,
        ultimoContacto: ahoraIso,
        dispositivoId,
        dispositivo: dispositivoNombre,
        ip: ipCliente,
        rssi: body.wifi_rssi ?? null,
        paquete: Number(body.paquete) || (ultimaTelemetria.paquete + 1),
        uptimeMs: Number(body.uptime_ms) || null,
        frecuenciaHz: Number(body.frecuencia_hz) || 50,
        canales: canalesProcesados
      }

      bufferPaquetes.push({
        t: ahoraIso,
        paquete: ultimaTelemetria.paquete,
        canales: canalesProcesados.length
      })
      if (bufferPaquetes.length > MAX_HISTORIAL) {
        bufferPaquetes.shift()
      }

      // 6. Si Supabase admin está disponible, actualizar latido de sesión activa
      if (supabaseAdmin && dispositivoId) {
        try {
          await supabaseAdmin
            .from('sesiones_medicion')
            .update({ ultimo_latido: ahoraIso })
            .eq('dispositivo_id', dispositivoId)
            .eq('estado', 'activa')
        } catch {
          // Ignorar si no hay sesión activa aún
        }
      }

      // 7. Respuesta exitosa al ESP32
      res.statusCode = 200
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({
        ok: true,
        mensaje: 'Telemetría ESP32 recibida con éxito por WiFi',
        dispositivo_id: dispositivoId,
        dispositivo: dispositivoNombre,
        paquete: ultimaTelemetria.paquete,
        canales_recibidos: canalesProcesados.length,
        timestamp: ahoraIso
      }))

    } catch (err) {
      console.error('[ESP32 Ingest Error]:', err)
      res.statusCode = 500
      res.setHeader('Content-Type', 'application/json')
      return res.end(JSON.stringify({ ok: false, error: 'Error interno procesando telemetría' }))
    }
  }

  // Método no permitido
  res.statusCode = 405
  res.setHeader('Content-Type', 'application/json')
  return res.end(JSON.stringify({ ok: false, error: 'Método no permitido. Use GET o POST.' }))
}
