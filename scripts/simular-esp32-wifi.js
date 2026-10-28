#!/usr/bin/env node
/**
 * ============================================================================
 * sensor_pulso · Simulador de ESP32 por WiFi (CLI)
 * ============================================================================
 * Requerimiento: RF05 - Recibir datos del ESP32 por WiFi (datos de prueba).
 * Requerimiento: RF54 - Token propio por dispositivo.
 *
 * Uso:
 *   node scripts/simular-esp32-wifi.js
 *   node scripts/simular-esp32-wifi.js --url http://localhost:5173/api/esp32/telemetria --token esp_demotoken_unach_2026_rf05
 * ============================================================================
 */

import http from 'http'
import https from 'https'
import { URL } from 'url'

// Argumentos por línea de comando
const args = process.argv.slice(2)
function getArg(name, defaultValue) {
  const index = args.indexOf(name)
  if (index !== -1 && args[index + 1]) return args[index + 1]
  return defaultValue
}

const SERVER_URL = getArg('--url', 'http://localhost:5173/api/esp32/telemetria')
const TOKEN = getArg('--token', 'esp_demotoken_unach_2026_rf05')
const INTERVAL_MS = parseInt(getArg('--interval', '1000'), 10)
const NUM_CHANNELS = Math.min(5, Math.max(1, parseInt(getArg('--channels', '5'), 10)))

console.log('================================================================')
console.log('  sensor_pulso · Emulador de Transmisión WiFi ESP32 (RF05)')
console.log('================================================================')
console.log(`Endpoint destino : ${SERVER_URL}`)
console.log(`Token ESP32 (RF54): ${TOKEN}`)
console.log(`Canales activos  : ${NUM_CHANNELS}`)
console.log(`Intervalo envío  : ${INTERVAL_MS} ms`)
console.log('----------------------------------------------------------------\n')

let packetCount = 0
const simPhases = [0.0, 0.6, 1.3, 2.1, 2.8]

function generarMuestraPPG(phase) {
  const t = phase % (2 * Math.PI)
  const s1 = Math.exp(-Math.pow(t - 1.2, 2) / 0.18)
  const s2 = 0.35 * Math.exp(-Math.pow(t - 2.3, 2) / 0.12)
  return s1 + s2
}

function generarPaquete() {
  packetCount++
  const now = Date.now()
  const bpmBases = [72.0, 68.5, 80.0, 75.2, 65.0]
  const spo2Bases = [98.2, 97.5, 99.0, 98.0, 96.8]
  const calidades = ['buena', 'buena', 'buena', 'regular', 'buena']

  const canales = []
  for (let c = 0; c < NUM_CHANNELS; c++) {
    const jitter = Math.sin((now + c * 300) / 4000) * 1.5
    const bpm = parseFloat((bpmBases[c] + jitter).toFixed(1))
    const spo2 = parseFloat((spo2Bases[c] + Math.cos((now + c * 500) / 6000) * 0.3).toFixed(1))

    const freqHz = bpm / 60.0
    const phaseStep = (2 * Math.PI * freqHz) / 50.0

    const ir = []
    const rojo = []
    for (let i = 0; i < 25; i++) {
      simPhases[c] += phaseStep
      const ppg = generarMuestraPPG(simPhases[c])
      const dcIr = 24500 + c * 300
      const acIr = 1400 * ppg
      const noise = (Math.random() - 0.5) * 15

      const valIr = parseFloat((dcIr + acIr + noise).toFixed(1))
      const ratio = (110 - spo2) / 25
      const valRed = parseFloat((21000 + c * 250 + acIr * ratio + noise).toFixed(1))

      ir.push(valIr)
      rojo.push(valRed)
    }

    canales.push({
      canal: c + 1,
      activo: true,
      bpm,
      spo2,
      calidad: calidades[c],
      ir,
      rojo
    })
  }

  return {
    dispositivo: 'ESP32-Simulado-CLI',
    token: TOKEN,
    paquete: packetCount,
    uptime_ms: now,
    wifi_rssi: -55 - Math.floor(Math.random() * 8),
    ip: '192.168.1.150',
    frecuencia_hz: 50,
    canales
  }
}

function enviarPaquete(payload) {
  return new Promise((resolve) => {
    const dataString = JSON.stringify(payload)
    const parsedUrl = new URL(SERVER_URL)
    const isHttps = parsedUrl.protocol === 'https:'
    const client = isHttps ? https : http

    const options = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || (isHttps ? 443 : 80),
      path: parsedUrl.pathname + parsedUrl.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(dataString),
        'X-ESP32-Token': TOKEN,
        'Authorization': `Bearer ${TOKEN}`
      },
      timeout: 3000
    }

    const startTime = Date.now()
    const req = client.request(options, (res) => {
      let body = ''
      res.on('data', chunk => { body += chunk })
      res.on('end', () => {
        const latency = Date.now() - startTime
        if (res.statusCode >= 200 && res.statusCode < 300) {
          console.log(`[WiFi ESP32] ✅ Paquete #${payload.paquete} enviado con éxito | HTTP ${res.statusCode} | Latencia: ${latency}ms | Canales: ${payload.canales.length}`)
        } else {
          console.warn(`[WiFi ESP32] ⚠️ Servidor respondió HTTP ${res.statusCode}: ${body}`)
        }
        resolve()
      })
    })

    req.on('error', (err) => {
      console.error(`[WiFi ESP32] ❌ Error enviando paquete #${payload.paquete}:`, err.message)
      resolve()
    })

    req.on('timeout', () => {
      req.destroy()
      console.error(`[WiFi ESP32] ⏱️ Timeout esperando respuesta del servidor`)
      resolve()
    })

    req.write(dataString)
    req.end()
  })
}

// Bucle de simulación periódico
async function loop() {
  const payload = generarPaquete()
  await enviarPaquete(payload)
  setTimeout(loop, INTERVAL_MS)
}

// Iniciar simulación
loop()
