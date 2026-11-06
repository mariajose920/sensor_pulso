/**
 * ============================================================================
 * sensor_pulso · Suite de Pruebas Automatizadas para RF116
 * ============================================================================
 * Verifica:
 * 1. Cifrado adicional exclusivo para datos declarados de salud (RF03 / RF116).
 * 2. Exclusión de mediciones continuas (BPM, SpO2, señal) del cifrado por campo.
 * 3. Gestión de claves fuera del código y Rotación de Claves (v1, v2).
 * 4. Endpoint serverless de descifrado exclusivo para el titular (/api/declaraciones/descifrar).
 * 5. Auditoría estricta de CERO EMOJIS en el código de RF116.
 * ============================================================================
 */

import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { cifradoService, obtenerVersionClaveActiva } from '../src/utils/cifradoService.js'
import { construirMedicion } from '../src/utils/medicion.js'
import descifrarHandler from '../api/declaraciones/descifrar.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

let pasadas = 0
let falladas = 0

function test(nombre, fn) {
  try {
    fn()
    console.log(`[PASS] ${nombre}`)
    pasadas++
  } catch (err) {
    console.error(`[FAIL] ${nombre}`)
    console.error(`       Detalle: ${err.message}`)
    falladas++
  }
}

async function testAsync(nombre, fn) {
  try {
    await fn()
    console.log(`[PASS] ${nombre}`)
    pasadas++
  } catch (err) {
    console.error(`[FAIL] ${nombre}`)
    console.error(`       Detalle: ${err.message}`)
    falladas++
  }
}

console.log('='.repeat(70))
console.log('EJECUTANDO SUITE DE PRUEBAS RF116: CIFRADO DE DATOS DE SALUD Y ROTACION')
console.log('='.repeat(70))

// ----------------------------------------------------------------------------
// TEST 1: Cifrado adicional solo de factores personales y de salud declarados (RF03)
// ----------------------------------------------------------------------------
console.log('\n--- 1. Cifrado Exclusivo de Factores Declarados de Salud (RF03) ---')

await testAsync('Cifrado AES-256-GCM de factores de salud (sueño, estrés, cafeína, medicación)', async () => {
  const factoresClinicos = {
    nivelEstres: 'alto',
    suenoHoras: '5_6',
    suenoCalidad: 'interrumpido',
    cafeina: 'alta',
    medicacion: 'Propranolol 40mg',
    condicionSalud: 'Hipertensión arterial diagnosticada',
    observaciones: 'Evaluación previa a laboratorio'
  }

  const hexCifrado = await cifradoService.cifrarFactoresSalud(factoresClinicos)
  assert(typeof hexCifrado === 'string', 'El resultado debe ser una cadena hexadecimal')
  assert(hexCifrado.startsWith('\\x535043'), 'Debe iniciar con cabecera SPC (\\x535043)')

  // Comprobar que ningún texto sensible viaja en claro en el hex
  assert(!hexCifrado.toLowerCase().includes('propranolol'), 'Medicamento no debe figurar en claro')
  assert(!hexCifrado.toLowerCase().includes('hipertension'), 'Condición de salud no debe figurar en claro')
  assert(!hexCifrado.toLowerCase().includes('suenohoras'), 'Factores de sueño no deben figurar en claro')
  assert(!hexCifrado.toLowerCase().includes('cafeina'), 'Consumo de cafeína no debe figurar en claro')

  // Descifrado correcto
  const descifrados = await cifradoService.descifrarFactoresSalud(hexCifrado)
  assert.strictEqual(descifrados.nivelEstres, factoresClinicos.nivelEstres)
  assert.strictEqual(descifrados.medicacion, factoresClinicos.medicacion)
  assert.strictEqual(descifrados.condicionSalud, factoresClinicos.condicionSalud)
})

// ----------------------------------------------------------------------------
// TEST 2: Exclusión de mediciones continuas del cifrado por campo
// ----------------------------------------------------------------------------
console.log('\n--- 2. Exclusión de Mediciones Continuas del Cifrado por Campo ---')

test('Mediciones continuas (BPM, SpO2, canal) se conservan legibles bajo TLS y RLS', () => {
  const datosMedicion = {
    usuarioId: '11111111-2222-3333-4444-555555555555',
    fuente: 'sensor',
    bpm: 78.4,
    spo2: 98.2,
    canal: 1,
    calidad: 'buena',
    ritmo: 'normal'
  }

  const armada = construirMedicion(datosMedicion)
  assert(armada.ok, 'Construcción de medición debe ser exitosa')
  assert(typeof armada.fila.bpm_promedio === 'number', 'BPM debe ser numérico sin cifrado por campo')
  assert(typeof armada.fila.spo2_promedio === 'number', 'SpO2 debe ser numérico sin cifrado por campo')
  assert(armada.fila.canal === 1, 'Canal debe ser numérico sin cifrado por campo')

  // Diagnóstico de seguridad
  const estado = cifradoService.obtenerEstadoCifrado()
  assert(estado.rf116 === 'cumplido', 'Debe reportar RF116 cumplido')
  assert(estado.enReposo.medicionesContinuas.includes('sin cifrado por campo'), 'Mediciones continuas explícitamente sin cifrado por campo')
})

// ----------------------------------------------------------------------------
// TEST 3: Gestión de claves fuera del código y Rotación de Claves (Key Rotation)
// ----------------------------------------------------------------------------
console.log('\n--- 3. Gestión de Claves Fuera del Código y Rotación ---')

await testAsync('Rotación de claves: descifrado correcto de registros con Version 1 y Version 2', async () => {
  const factoresV1 = { medicacion: 'Atenolol 50mg', clave: 'registro_antiguo' }
  const factoresV2 = { medicacion: 'Losartan 50mg', clave: 'registro_nuevo_rotado' }

  // Cifrar con versión 1
  const hexV1 = await cifradoService.cifrarFactoresSalud(factoresV1, 1)
  assert.strictEqual(cifradoService.obtenerVersionDeSobre(hexV1), 1, 'El sobre 1 debe registrar versión 1')

  // Cifrar con versión 2 (Rotación de clave)
  const hexV2 = await cifradoService.cifrarFactoresSalud(factoresV2, 2)
  assert.strictEqual(cifradoService.obtenerVersionDeSobre(hexV2), 2, 'El sobre 2 debe registrar versión 2')

  // Descifrado respetando la versión de cada registro
  const recuperadoV1 = await cifradoService.descifrarFactoresSalud(hexV1)
  assert.strictEqual(recuperadoV1.medicacion, 'Atenolol 50mg', 'Registro antiguo v1 se descifra con clave v1')

  const recuperadoV2 = await cifradoService.descifrarFactoresSalud(hexV2)
  assert.strictEqual(recuperadoV2.medicacion, 'Losartan 50mg', 'Registro nuevo v2 se descifra con clave rotada v2')
})

await testAsync('Detección de alteración o clave incorrecta con rechazo criptográfico AEAD', async () => {
  const factores = { confidencial: 'diagnostico_privado' }
  const hexCifrado = await cifradoService.cifrarFactoresSalud(factores, 1)

  // Intentar forzar descifrado con versión de clave errónea (v99)
  const intentoInvalido = await cifradoService.descifrarFactoresSalud(hexCifrado, 99)
  assert.deepStrictEqual(intentoInvalido, {}, 'Clave incorrecta debe ser rechazada por AES-GCM retornando objeto vacío')
})

// ----------------------------------------------------------------------------
// TEST 4: Endpoint Serverless de Descifrado (/api/declaraciones/descifrar)
// ----------------------------------------------------------------------------
console.log('\n--- 4. Endpoint Serverless de Descifrado para el Titular ---')

function simularRespuestaHttp() {
  const res = {
    statusCode: 200,
    headers: {},
    cuerpo: '',
    setHeader(nombre, valor) {
      this.headers[nombre.toLowerCase()] = valor
    },
    end(datos) {
      this.cuerpo = datos || ''
    }
  }
  return res
}

await testAsync('API Serverless: Rechaza peticiones que no sean POST (405)', async () => {
  const req = { method: 'GET', headers: {} }
  const res = simularRespuestaHttp()
  await descifrarHandler(req, res)
  assert.strictEqual(res.statusCode, 405, 'Debe retornar status 405 Method Not Allowed')
})

await testAsync('API Serverless: Descifra exitosamente datos válidos del titular', async () => {
  const datosSalud = { suenoHoras: '8', cafeina: 'baja', medicacion: 'Ninguna' }
  const hexCifrado = await cifradoService.cifrarFactoresSalud(datosSalud, 1)

  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      datosCifrados: hexCifrado,
      claveVersion: 1
    })
  }
  const res = simularRespuestaHttp()
  await descifrarHandler(req, res)

  assert.strictEqual(res.statusCode, 200, 'Debe responder con código 200 OK')
  const jsonResp = JSON.parse(res.cuerpo)
  assert(jsonResp.ok, 'Respuesta debe indicar ok: true')
  assert.strictEqual(jsonResp.descifradoEnServidor, true, 'Debe certificar descifrado en servidor')
  assert.strictEqual(jsonResp.factores.suenoHoras, '8')
  assert.strictEqual(jsonResp.factores.medicacion, 'Ninguna')
})

await testAsync('API Serverless: Rechaza sobre manipulado o alterado (400 Bad Request)', async () => {
  const datosSalud = { cafeina: 'alta' }
  const hexCifrado = await cifradoService.cifrarFactoresSalud(datosSalud, 1)

  // Manipular un caracter en el ciphertext
  const chars = hexCifrado.split('')
  chars[chars.length - 3] = chars[chars.length - 3] === '5' ? '6' : '5'
  const hexCorrupto = chars.join('')

  const req = {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      datosCifrados: hexCorrupto,
      claveVersion: 1
    })
  }
  const res = simularRespuestaHttp()
  await descifrarHandler(req, res)

  assert.strictEqual(res.statusCode, 400, 'Sobre corrupto debe ser rechazado con 400')
  const jsonResp = JSON.parse(res.cuerpo)
  assert.strictEqual(jsonResp.ok, false)
})

// ----------------------------------------------------------------------------
// TEST 5: Auditoría Estricta de CERO EMOJIS (Regla Obligatoria del Proyecto)
// ----------------------------------------------------------------------------
console.log('\n--- 5. Auditoría de CERO EMOJIS en Código de RF116 ---')

const archivosARevisar = [
  path.join(ROOT, 'api', 'declaraciones', 'descifrar.js'),
  path.join(ROOT, 'src', 'utils', 'cifradoService.js'),
  path.join(ROOT, 'src', 'services', 'pacienteService.js'),
  path.join(ROOT, 'src', 'components', 'DatosPacienteCard.vue'),
  path.join(ROOT, 'vite.config.js')
]

const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu

archivosARevisar.forEach(archivo => {
  const nombreRelativo = path.relative(ROOT, archivo)
  test(`Archivo libre de emojis: ${nombreRelativo}`, () => {
    const contenido = fs.readFileSync(archivo, 'utf8')
    const coincidencias = contenido.match(emojiRegex) || []
    assert(coincidencias.length === 0, `Se encontraron emojis en ${nombreRelativo}: ${coincidencias.join(' ')}`)
  })
})

// ----------------------------------------------------------------------------
// RESUMEN FINAL
// ----------------------------------------------------------------------------
console.log('\n' + '='.repeat(70))
console.log(`RESULTADO DE LA SUITE RF116: ${pasadas} APROBADAS / ${falladas} FALLADAS`)
console.log('='.repeat(70))

if (falladas > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
