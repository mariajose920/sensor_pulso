import handler from '../api/esp32/telemetria.js'

async function runTests() {
  console.log('🧪 Iniciando pruebas unitarias de /api/esp32/telemetria (RF05, RF54)...\n')

  // Helper para simular req/res de Node.js / Serverless
  function crearMockReqRes(method, headers = {}, body = null) {
    const req = {
      method,
      headers: { ...headers },
      body,
      socket: { remoteAddress: '192.168.1.120' }
    }

    let statusCode = 200
    const resHeaders = {}
    let output = ''

    const res = {
      setHeader: (k, v) => { resHeaders[k] = v },
      get statusCode() { return statusCode },
      set statusCode(val) { statusCode = val },
      end: (data) => {
        if (data) output = data
      }
    }

    return { req, res, getOutput: () => output, getStatus: () => statusCode }
  }

  // Prueba 1: Rechazo si falta el token (RF54)
  {
    const { req, res, getOutput, getStatus } = crearMockReqRes('POST', {}, { dispositivo: 'ESP32-SinToken' })
    await handler(req, res)
    const out = JSON.parse(getOutput())
    if (getStatus() === 401 && out.ok === false) {
      console.log('✅ Prueba 1 PASADA: Rechaza peticiones sin token con HTTP 401')
    } else {
      console.error('❌ Prueba 1 FALLIDA:', getStatus(), out)
      process.exit(1)
    }
  }

  // Prueba 2: Recepción exitosa con token y 5 canales fisiológicos (RF05)
  {
    const payload = {
      dispositivo: 'ESP32-Test-01',
      token: 'esp_demotoken_unach_2026_rf05',
      paquete: 1,
      wifi_rssi: -60,
      uptime_ms: 10000,
      canales: [
        { canal: 1, bpm: 72.5, spo2: 98.2, calidad: 'buena', ir: [24000, 24100], rojo: [21000, 21050] },
        { canal: 2, bpm: 68.0, spo2: 97.5, calidad: 'buena', ir: [24000], rojo: [21000] },
        { canal: 3, bpm: 81.0, spo2: 99.0, calidad: 'buena', ir: [24000], rojo: [21000] },
        { canal: 4, bpm: 75.0, spo2: 98.0, calidad: 'regular', ir: [24000], rojo: [21000] },
        { canal: 5, bpm: 65.0, spo2: 96.5, calidad: 'buena', ir: [24000], rojo: [21000] }
      ]
    }

    const { req, res, getOutput, getStatus } = crearMockReqRes(
      'POST',
      { 'x-esp32-token': 'esp_demotoken_unach_2026_rf05' },
      payload
    )

    await handler(req, res)
    const out = JSON.parse(getOutput())
    if (getStatus() === 200 && out.ok === true && out.canales_recibidos === 5) {
      console.log('✅ Prueba 2 PASADA: Ingesta exitosa de telemetría WiFi con 5 canales (HTTP 200)')
    } else {
      console.error('❌ Prueba 2 FALLIDA:', getStatus(), out)
      process.exit(1)
    }
  }

  // Prueba 3: Consulta GET del estado en vivo
  {
    const { req, res, getOutput, getStatus } = crearMockReqRes('GET')
    await handler(req, res)
    const out = JSON.parse(getOutput())
    if (getStatus() === 200 && out.conectado === true && out.canales.length === 5) {
      console.log('✅ Prueba 3 PASADA: Consulta GET en vivo refleja estado conectado y 5 canales')
    } else {
      console.error('❌ Prueba 3 FALLIDA:', getStatus(), out)
      process.exit(1)
    }
  }

  console.log('\n✨ Todas las pruebas del endpoint /api/esp32/telemetria pasaron exitosamente.')
}

runTests().catch(err => {
  console.error('Error ejecutando pruebas:', err)
  process.exit(1)
})
