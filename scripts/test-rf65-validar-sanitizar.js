/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF65
 * Validación y Sanitización de Entradas (CSV y Telemetría del ESP32)
 * ============================================================================
 * Normativas: OWASP Top 10 (A03: Injection, A04: Insecure Design),
 * CWE-20, CWE-79 (XSS), CWE-1236 (Formula Injection), CWE-1321 (Prototype Pollution).
 * ============================================================================
 */

import {
  sanitizarTexto,
  neutralizarFormulaCsv,
  verificarSeguridadObjeto,
  validarYSanitizarTelemetriaEsp32,
  validarYSanitizarArchivoCsv,
  LIMITES_SEGURIDAD,
  ESTADOS_CALIDAD_VALIDOS
} from '../src/services/sanitizacionService.js'

import { parsearArchivoCsv } from '../src/services/senalesService.js'
import handlerTelemetria from '../api/esp32/telemetria.js'

let totalPruebas = 0
let pasadas = 0
let falladas = 0

function assert(condicion, mensaje) {
  totalPruebas++
  if (condicion) {
    pasadas++
    console.log(`  ✅ [PASS] ${mensaje}`)
  } else {
    falladas++
    console.error(`  ❌ [FAIL] ${mensaje}`)
  }
}

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF65')
console.log('  Validación y Sanitización de Entradas (CSV y Telemetría ESP32)')
console.log('================================================================\n')

// ----------------------------------------------------------------------------
// 1. Sanitización de Textos y Protección contra XSS (CWE-79)
// ----------------------------------------------------------------------------
console.log('--- 1. Sanitización de Texto y Protección contra XSS (CWE-79) ---')

const xss1 = '<script>alert("XSS")</script>ESP32_Aula_4'
const limpio1 = sanitizarTexto(xss1, 64)
assert(!limpio1.includes('<script>') && limpio1.includes('ESP32_Aula_4'), 'Elimina etiquetas <script> y preserva texto legítimo')

const xss2 = '<img src=x onerror=alert(1)>Sensor_Pabellon'
const limpio2 = sanitizarTexto(xss2, 64)
assert(!limpio2.includes('<img') && !limpio2.includes('onerror'), 'Elimina etiquetas HTML con eventos en línea')

const protoPeligroso = 'javascript:doEvil()'
const limpioProto = sanitizarTexto(protoPeligroso, 64)
assert(!limpioProto.toLowerCase().includes('javascript:'), 'Elimina pseudoprotocolo javascript:')

const conBytesNulos = 'ESP32\0_Dispositivo\0_Lab'
const limpioNulos = sanitizarTexto(conBytesNulos, 64)
assert(!limpioNulos.includes('\0') && limpioNulos === 'ESP32_Dispositivo_Lab', 'Elimina bytes nulos (\\0) de la cadena')

const textoLargo = 'A'.repeat(500)
const limpioLargo = sanitizarTexto(textoLargo, 32)
assert(limpioLargo.length === 32, 'Trunca textos que superan la longitud máxima configurada')

// ----------------------------------------------------------------------------
// 2. Neutralización de Formula Injection en CSV (CWE-1236)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Neutralización de Inyección de Fórmulas en CSV (CWE-1236) ---')

const formulaCmd = '=cmd|\' /C calc\'!A0'
const resFormulaCmd = neutralizarFormulaCsv(formulaCmd)
assert(resFormulaCmd.esFormulaPeligrosa && resFormulaCmd.valorSanitizado.startsWith("'="),
  'Detecta y neutraliza fórmula maliciosa que ejecuta calc anteponiendo comilla simple'
)

const formulaSuma = '+1234567@evil.com'
const resFormulaSuma = neutralizarFormulaCsv(formulaSuma)
assert(resFormulaSuma.esFormulaPeligrosa && resFormulaSuma.valorSanitizado.startsWith("'+"),
  'Neutraliza celdas que inician con signo más seguido de comandos no numéricos'
)

const formulaPipe = '|powershell.exe -enc ...'
const resFormulaPipe = neutralizarFormulaCsv(formulaPipe)
assert(resFormulaPipe.esFormulaPeligrosa && resFormulaPipe.valorSanitizado.startsWith("'|"),
  'Neutraliza celdas que inician con pleca (pipe) utilizada en DDE'
)

const numeroNegativoLegitimo = '-45.82'
const resNegativo = neutralizarFormulaCsv(numeroNegativoLegitimo)
assert(!resNegativo.esFormulaPeligrosa && resNegativo.valorSanitizado === '-45.82',
  'No neutraliza números negativos matemáticos legítimos (mantiene valor numérico intacto)'
)

// ----------------------------------------------------------------------------
// 3. Protección contra Prototype Pollution (CWE-1321)
// ----------------------------------------------------------------------------
console.log('\n--- 3. Protección contra Prototype Pollution (CWE-1321) ---')

const payloadSeguro = { dispositivo: 'ESP32-1', canales: [] }
assert(verificarSeguridadObjeto(payloadSeguro), 'Objeto legítimo pasa la verificación de seguridad')

const payloadMaliciosoProto = JSON.parse('{"__proto__": {"admin": true}, "dispositivo": "ESP32-Evil"}')
assert(!verificarSeguridadObjeto(payloadMaliciosoProto), 'Detecta y bloquea objeto con propiedad peligrosa __proto__')

const payloadConstructor = JSON.parse('{"constructor": {"prototype": {"admin": true}}}')
assert(!verificarSeguridadObjeto(payloadConstructor), 'Detecta y bloquea intento de contaminación por constructor')

// ----------------------------------------------------------------------------
// 4. Validación y Sanitización de Telemetría ESP32 (RF65)
// ----------------------------------------------------------------------------
console.log('\n--- 4. Validación y Sanitización de Telemetría ESP32 (RF65) ---')

const telemetriaValida = {
  dispositivo: 'ESP32-Docencia-Canal1',
  paquete: 1045,
  uptime_ms: 182300,
  frecuencia_hz: 50,
  wifi_rssi: -65,
  canales: [
    {
      canal: 1,
      activo: true,
      bpm: 74.5,
      spo2: 98.2,
      calidad: 'buena',
      ir: [24500, 24520, 24580],
      rojo: [18200, 18220, 18250]
    }
  ]
}

const resTelValida = validarYSanitizarTelemetriaEsp32(telemetriaValida)
assert(resTelValida.valido && resTelValida.datosSanitizados.dispositivo === 'ESP32-Docencia-Canal1',
  'Valida y aprueba telemetría correcta del ESP32'
)
assert(resTelValida.datosSanitizados.canales[0].bpm === 74.5 && resTelValida.datosSanitizados.canales[0].spo2 === 98.2,
  'Conserva parámetros fisiológicos válidos (BPM 74.5, SpO2 98.2%)'
)

// Rechazo de payload malicioso por Prototype Pollution
const resTelProto = validarYSanitizarTelemetriaEsp32(payloadMaliciosoProto)
assert(!resTelProto.valido && resTelProto.error.includes('Prototype Pollution'),
  'Rechaza de plano telemetría con intento de Prototype Pollution'
)

// Sanitización de valores fisiológicos extremos o absurdos (BPM > 280, SpO2 > 100%)
const telemetriaExtrema = {
  dispositivo: '<script>alert(1)</script>ESP32_Test',
  paquete: -5,
  frecuencia_hz: 9999,
  wifi_rssi: -200,
  canales: [
    {
      canal: 8, // Canal fuera de rango 1..5
      bpm: 999.0, // Frecuencia imposible en humanos
      spo2: 150.0, // Saturación imposible > 100%
      calidad: 'hack_invalido',
      ir: [99999999, -500, 'invalido', 45000] // Valores fuera de 18 bits ADC
    }
  ]
}

const resExtrema = validarYSanitizarTelemetriaEsp32(telemetriaExtrema)
assert(resExtrema.valido, 'El validador sanea y recupera la telemetría sin caerse (resiliencia)')
assert(resExtrema.datosSanitizados.dispositivo === 'ESP32_Test', 'Sanitiza el nombre del dispositivo eliminando scripts')
assert(resExtrema.datosSanitizados.canales[0].bpm === LIMITES_SEGURIDAD.BPM_MAX_FISIOLOGICO,
  `Acota el BPM extremo al límite fisiológico máximo de ${LIMITES_SEGURIDAD.BPM_MAX_FISIOLOGICO} BPM`
)
assert(resExtrema.datosSanitizados.canales[0].spo2 === 100.0, 'Acota la saturación de oxígeno SpO2 al 100%')
assert(resExtrema.datosSanitizados.canales[0].calidad === 'buena', 'Normaliza calidad desconocida a valor seguro por whitelist')
assert(resExtrema.datosSanitizados.canales[0].ir.every(v => v >= 0 && v <= LIMITES_SEGURIDAD.ADC_MAX_VALOR),
  'Acota todas las muestras ADC al rango físico de 18 bits (0 a 262143)'
)
assert(resExtrema.advertencias.length >= 3, 'Registra advertencias explícitas sobre las correcciones aplicadas')

// Truncamiento de canales masivos (prevención de DoS)
const telemetriaMasiva = {
  dispositivo: 'ESP32-Flood',
  canales: Array.from({ length: 50 }, (_, i) => ({ canal: i + 1, bpm: 70 }))
}
const resMasiva = validarYSanitizarTelemetriaEsp32(telemetriaMasiva)
assert(resMasiva.datosSanitizados.canales.length === LIMITES_SEGURIDAD.MAX_CANALES_SIMULTANEOS,
  `Trunca los canales masivos al máximo soportado de ${LIMITES_SEGURIDAD.MAX_CANALES_SIMULTANEOS} canales simultáneos`
)

// ----------------------------------------------------------------------------
// 5. Validación y Sanitización de Archivos CSV de Bioseñales (RF65)
// ----------------------------------------------------------------------------
console.log('\n--- 5. Validación y Sanitización de Archivos CSV (RF65) ---')

// CSV seguro y bien formado
const csvNormal = `tiempo,ir,rojo
0.00,24000,18000
0.02,24500,18200
0.04,25100,18500
0.06,25800,18900
0.08,25200,18400
0.10,24600,18100`

const resCsvNormal = validarYSanitizarArchivoCsv(csvNormal, 'prueba_normal.csv')
assert(resCsvNormal.valido && resCsvNormal.muestrasIr.length === 6, 'Parseo exitoso de CSV de bioseñal con cabeceras estándar')

// CSV con Formula Injection en cabeceras y celdas
const csvPeligroso = `=cmd|' /C notepad'!A0,ir,rojo
0.00,24000,18000
0.02,24500,18200
0.04,@SUM(1+2)*cmd|' /C calc'!A0,18500
0.06,25800,18900
0.08,25200,18400
0.10,24600,18100`

const resCsvPeligroso = validarYSanitizarArchivoCsv(csvPeligroso, 'ataque_formula.csv')
assert(resCsvPeligroso.valido && resCsvPeligroso.formulasNeutralizadas >= 1,
  `Detecta y neutraliza celdas con fórmulas peligrosas en el CSV (${resCsvPeligroso.formulasNeutralizadas} neutralizadas)`
)
assert(resCsvPeligroso.advertencias.some(a => a.includes('Formula Injection')),
  'Genera advertencia de seguridad explícita sobre Formula Injection (CWE-1236)'
)

// CSV con bytes nulos
const csvConNulos = `tiempo,ir,rojo\0
0.00,24000,18000
0.02,24500\0,18200
0.04,25100,18500
0.06,25800,18900
0.08,25200,18400
0.10,24600,18100`

const resCsvNulos = validarYSanitizarArchivoCsv(csvConNulos, 'nulos.csv')
assert(resCsvNulos.valido && resCsvNulos.advertencias.some(a => a.includes('caracteres nulos')),
  'Detecta, limpia y advierte sobre caracteres nulos inyectados en el CSV'
)

// CSV corrupto con menos de 5 líneas
const csvCorto = `tiempo,ir\n0.00,24000`
const resCsvCorto = validarYSanitizarArchivoCsv(csvCorto, 'corto.csv')
assert(!resCsvCorto.valido && resCsvCorto.error.includes('al menos 5 registros'),
  'Rechaza CSVs con menos de 5 muestras temporales (insuficiente para bioseñal)'
)

// CSV con tamaño superior al límite (simulado)
const resCsvVacio = validarYSanitizarArchivoCsv('', 'vacio.csv')
assert(!resCsvVacio.valido && resCsvVacio.error.includes('vacío'), 'Rechaza archivo CSV vacío')

// ----------------------------------------------------------------------------
// 6. Integración con el Servicio de Señales (senalesService.js)
// ----------------------------------------------------------------------------
console.log('\n--- 6. Integración con senalesService.js ---')

const resServicio = parsearArchivoCsv(csvNormal, 'laboratorio_unach.csv')
assert(resServicio.valido && resServicio.sanitizado === true,
  'senalesService.parsearArchivoCsv delega en el sanitizador RF65 y marca la señal como sanitizada'
)
assert(typeof resServicio.bpmEstimado === 'number' && resServicio.totalMuestras === 6,
  'Calcula correctamente el BPM estimado sobre la serie de datos sanitizada'
)

// ----------------------------------------------------------------------------
// 7. Integración con el Ingest Endpoint Serverless (api/esp32/telemetria.js)
// ----------------------------------------------------------------------------
console.log('\n--- 7. Integración con Ingest API (api/esp32/telemetria.js) ---')

// Mock de req y res para invocar handlerTelemetria
function createMockHttp(method, headers, body) {
  const res = {
    statusCode: 200,
    headers: {},
    ended: false,
    body: '',
    setHeader(key, val) { this.headers[key] = val },
    end(data) { this.body = data; this.ended = true }
  }
  const req = {
    method,
    headers: headers || {},
    body
  }
  return { req, res }
}

// Probar envío de telemetría válida a api/esp32/telemetria.js
const { req: reqValida, res: resValida } = createMockHttp(
  'POST',
  { 'x-esp32-token': 'esp_token_docencia_valido', 'content-type': 'application/json' },
  telemetriaValida
)

await handlerTelemetria(reqValida, resValida)
assert(resValida.statusCode === 200, 'Ingest API responde HTTP 200 ante telemetría sanitizada válida')
const jsonResp = JSON.parse(resValida.body)
assert(jsonResp.sanitizacion_entradas === 'RF65_CUMPLIDO',
  'Respuesta de la API certifica el cumplimiento del blindaje RF65 (sanitizacion_entradas)'
)

// Probar envío de payload con Prototype Pollution
const { req: reqProto, res: resProto } = createMockHttp(
  'POST',
  { 'x-esp32-token': 'esp_token_test', 'content-type': 'application/json' },
  payloadMaliciosoProto
)
await handlerTelemetria(reqProto, resProto)
assert(resProto.statusCode === 422, 'Ingest API responde HTTP 422 (Unprocessable Entity) ante ataque de Prototype Pollution')
const jsonProto = JSON.parse(resProto.body)
assert(jsonProto.rf65 === 'rechazado', 'Respuesta de la API indica explícitamente rf65: rechazado')

// ----------------------------------------------------------------------------
// Resumen Final
// ----------------------------------------------------------------------------
console.log('\n================================================================')
console.log(`  RESUMEN DE PRUEBAS RF65:`)
console.log(`  Total: ${totalPruebas} | Pasadas: ${pasadas} | Falladas: ${falladas}`)
console.log('================================================================\n')

if (falladas > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
