import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { cifradoService } from '../src/utils/cifradoService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF55')
console.log('  Cifrado en Tránsito (HTTPS/TLS) y en Reposo (AES-256-GCM / TDE)')
console.log('================================================================\n')

let pasadas = 0
let falladas = 0

function test(nombre, fn) {
  try {
    fn()
    console.log(`  ✅ [PASS] ${nombre}`)
    pasadas++
  } catch (err) {
    console.error(`  ❌ [FAIL] ${nombre}`)
    console.error(`     Detalle: ${err.message}\n`)
    falladas++
  }
}

async function testAsync(nombre, fn) {
  try {
    await fn()
    console.log(`  ✅ [PASS] ${nombre}`)
    pasadas++
  } catch (err) {
    console.error(`  ❌ [FAIL] ${nombre}`)
    console.error(`     Detalle: ${err.message}\n`)
    falladas++
  }
}

async function ejecutarPruebas() {
  console.log('--- 1. Cifrado en Tránsito Web & Vercel (HSTS y CSP) ---')

  const vercelPath = path.join(ROOT, 'vercel.json')
  const vercelJson = JSON.parse(fs.readFileSync(vercelPath, 'utf8'))
  const globalHeaders = vercelJson.headers.find(h => h.source === '/(.*)')?.headers || []

  test('Vercel: Cabecera Strict-Transport-Security (HSTS) configurada con max-age >= 1 año', () => {
    const hsts = globalHeaders.find(h => h.key.toLowerCase() === 'strict-transport-security')
    assert(hsts, 'Falta cabecera Strict-Transport-Security en vercel.json')
    assert(hsts.value.includes('max-age='), 'HSTS debe tener directiva max-age')
    assert(hsts.value.includes('includeSubDomains'), 'HSTS debe incluir includeSubDomains')
    assert(hsts.value.includes('preload'), 'HSTS debe tener directiva preload')
  })

  test('Vercel: CSP contiene directiva upgrade-insecure-requests para forzar HTTPS', () => {
    const csp = globalHeaders.find(h => h.key.toLowerCase() === 'content-security-policy')
    assert(csp, 'Falta Content-Security-Policy en vercel.json')
    assert(csp.value.includes('upgrade-insecure-requests'), 'CSP debe contener upgrade-insecure-requests')
  })

  test('Vercel: connect-src restringe conexiones a HTTPS y WSS seguros de Supabase', () => {
    const csp = globalHeaders.find(h => h.key.toLowerCase() === 'content-security-policy')
    assert(csp.value.includes('https://*.supabase.co'), 'CSP debe exigir https para Supabase')
    assert(csp.value.includes('wss://*.supabase.co'), 'CSP debe exigir wss para Supabase')
  })

  console.log('\n--- 2. Cifrado en Tránsito en API Serverless de Telemetría (/api/esp32/telemetria.js) ---')

  const apiPath = path.join(ROOT, 'api', 'esp32', 'telemetria.js')
  const apiCode = fs.readFileSync(apiPath, 'utf8')

  test('API Ingest: Contiene validación y rechazo de peticiones no cifradas (HTTP plano)', () => {
    assert(apiCode.includes('x-forwarded-proto'), 'La API debe auditar la cabecera x-forwarded-proto')
    assert(apiCode.includes('426'), 'La API debe emitir código 426 (Upgrade Required) ante peticiones sin TLS')
    assert(apiCode.includes('Strict-Transport-Security'), 'La API debe retornar cabecera HSTS')
  })

  test('API Ingest: Devuelve metadatos de cifrado TLS en respuesta GET y POST', () => {
    assert(apiCode.includes('cifrado: {'), 'GET debe incluir bloque de metadatos de cifrado')
    assert(apiCode.includes('cifrado_transito:'), 'POST debe confirmar cifrado de tránsito')
  })

  console.log('\n--- 3. Cifrado en Tránsito en Firmware ESP32 (esp32_wifi_prueba.ino) ---')

  const inoPath = path.join(ROOT, 'firmware', 'esp32_wifi_prueba', 'esp32_wifi_prueba.ino')
  const inoCode = fs.readFileSync(inoPath, 'utf8')

  test('ESP32: Utiliza WiFiClientSecure para handshake TLS', () => {
    assert(inoCode.includes('#include <WiFiClientSecure.h>'), 'Firmware debe incluir WiFiClientSecure.h')
    assert(inoCode.includes('WiFiClientSecure client;'), 'Firmware debe instanciar WiFiClientSecure')
  })

  test('ESP32: Endpoint SERVER_URL configurado estrictamente con protocolo https://', () => {
    assert(inoCode.includes('const char* SERVER_URL    = "https://'), 'SERVER_URL debe usar https://')
  })

  test('ESP32: Stack asignado para la tarea FreeRTOS de transmisión WiFi es >= 16 KB (TLS)', () => {
    assert(inoCode.includes('16384'), 'Stack para TLS debe ser al menos 16384 bytes (16 KB)')
  })

  test('ESP32: Verificación activa de protocolo seguro en setup con aviso por Serial', () => {
    assert(inoCode.includes('strncmp(SERVER_URL, "https://", 8)'), 'Setup debe validar protocolo https')
  })

  console.log('\n--- 4. Conexión Segura Cliente-Base de Datos (supabase.js) ---')

  const supabaseJsPath = path.join(ROOT, 'src', 'services', 'supabase.js')
  const supabaseJsCode = fs.readFileSync(supabaseJsPath, 'utf8')

  test('supabase.js: Elevación automática forzosa a HTTPS si se configurara HTTP plano', () => {
    assert(supabaseJsCode.includes("supabaseUrl.startsWith('http://')"), 'Debe detectar URLs HTTP inseguras')
    assert(supabaseJsCode.includes("supabaseUrl.replace(/^http:\\/\\//, 'https://')"), 'Debe elevar forzosamente a https://')
  })

  test('supabase.js: Exporta metadatos del canal seguro de transporte (seguridadCanalSupabase)', () => {
    assert(supabaseJsCode.includes('seguridadCanalSupabase'), 'Debe exportar objeto de seguridad de canal')
  })

  console.log('\n--- 5. Cifrado en Reposo y de Campos de Salud AES-256-GCM (cifradoService.js) ---')

  await testAsync('cifradoService: Cifrado y descifrado de factores de salud con AES-256-GCM (Roundtrip)', async () => {
    const factoresOriginales = {
      nivelEstres: 'medio',
      suenoHoras: '7_8',
      suenoCalidad: 'reparador',
      cafeina: 'baja',
      medicacion: 'Ninguna',
      condicionSalud: 'Ninguna conocida'
    }

    const hexCifrado = await cifradoService.cifrarFactoresSalud(factoresOriginales)
    assert(typeof hexCifrado === 'string', 'El resultado debe ser una cadena')
    assert(hexCifrado.startsWith('\\x535043'), 'El sobre cifrado debe iniciar con cabecera mágica SPC (\\x535043)')

    // Comprobar que los datos sensibles no están en texto plano en el hex
    assert(!hexCifrado.includes('suenoHoras'), 'El hex cifrado no debe contener texto plano')
    assert(!hexCifrado.includes('cafeina'), 'El hex cifrado no debe contener texto plano')

    // Validar detección de dato cifrado
    assert(cifradoService.esDatoCifrado(hexCifrado), 'Debe reconocer el sobre cifrado como dato cifrado válido')

    // Descifrado
    const factoresRecuperados = await cifradoService.descifrarFactoresSalud(hexCifrado)
    assert.strictEqual(factoresRecuperados.nivelEstres, factoresOriginales.nivelEstres)
    assert.strictEqual(factoresRecuperados.suenoHoras, factoresOriginales.suenoHoras)
    assert.strictEqual(factoresRecuperados.cafeina, factoresOriginales.cafeina)
    assert.strictEqual(factoresRecuperados.condicionSalud, factoresOriginales.condicionSalud)
  })

  await testAsync('cifradoService: Detección de alteración (Tamper Detection) con fallo de autenticación GCM', async () => {
    const factores = { sensible: 'paciente_confidencial_unach' }
    const hexCifrado = await cifradoService.cifrarFactoresSalud(factores)

    // Alterar 1 bit en el texto cifrado
    const bytes = hexCifrado.split('')
    const ultimoIdx = bytes.length - 2
    bytes[ultimoIdx] = bytes[ultimoIdx] === 'a' ? 'b' : 'a'
    const hexAlterado = bytes.join('')

    // Al estar alterado, GCM debe fallar en la verificación del tag y retornar objeto vacío (rechazado)
    const recuperado = await cifradoService.descifrarFactoresSalud(hexAlterado)
    assert.deepStrictEqual(recuperado, {}, 'Un sobre manipulado debe ser rechazado por autenticación GCM')
  })

  await testAsync('cifradoService: Retrocompatibilidad transparente con registros históricos sin cifrar', async () => {
    // Simular un registro antiguo que se guardó como JSON en bytea sin sobre SPC
    const jsonAntiguo = JSON.stringify({ suenoHoras: '5_6', cafeina: 'moderada' })
    const hexAntiguo = '\\x' + Buffer.from(jsonAntiguo, 'utf8').toString('hex')

    assert(!cifradoService.esDatoCifrado(hexAntiguo), 'Un dato legacy no debe identificarse con cabecera SPC')
    const recuperado = await cifradoService.descifrarFactoresSalud(hexAntiguo)
    assert.strictEqual(recuperado.suenoHoras, '5_6')
    assert.strictEqual(recuperado.cafeina, 'moderada')
  })

  test('cifradoService: Diagnóstico de estado de cifrado (obtenerEstadoCifrado)', () => {
    const estado = cifradoService.obtenerEstadoCifrado()
    assert.strictEqual(estado.rf55, 'cumplido')
    assert.strictEqual(estado.enTransito.esp32Tls, true)
    assert.strictEqual(estado.enTransito.supabaseTls, true)
    assert.strictEqual(estado.enReposo.versionClave, 1)
    assert.strictEqual(estado.enReposo.clasificacionDatos, 'sensible_salud (ISO 27001)')
  })

  console.log('\n--- 6. Clasificación de Datos en Base de Datos (PostgreSQL) ---')

  const migInitPath = path.join(ROOT, 'supabase', 'migrations', '20261027000800_datos_iniciales.sql')
  const migInitCode = fs.readFileSync(migInitPath, 'utf8')

  test('Base de Datos: declaraciones_paciente.datos_cifrados catalogada como sensible_salud con cifrado_campo = true', () => {
    assert(migInitCode.includes("('declaraciones_paciente', 'datos_cifrados', 'sensible_salud', true, true)"),
      'La tabla clasificacion_datos debe registrar datos_cifrados como sensible_salud con cifrado_campo')
  })

  console.log('\n================================================================')
  console.log(`  RESUMEN DE PRUEBAS RF55:`)
  console.log(`  Total: ${pasadas + falladas} | Pasadas: ${pasadas} | Falladas: ${falladas}`)
  console.log('================================================================\n')

  if (falladas > 0) {
    process.exit(1)
  }
}

ejecutarPruebas().catch(err => {
  console.error('Error no capturado en pruebas:', err)
  process.exit(1)
})
