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
import { cifradoService } from '../src/utils/cifradoService.js'
import { construirMedicion } from '../src/utils/medicion.js'
// El cifrado vive solo en el servidor (api/_lib/cifradoSalud.js). Clave de prueba, nunca la de producción.
process.env.CLAVE_CIFRADO_CAMPOS = (await import('node:crypto')).randomBytes(24).toString('base64') // aleatoria en cada ejecución
const { cifrarFactores, descifrarSobre, versionDeSobre } = await import('../api/_lib/cifradoSalud.js')
const cifrarHex = async (obj, version) => (await cifrarFactores(obj, version ? { version } : {})).hex
const recuperar = async (hex, version) => { try { return await descifrarSobre(hex, version ? { version } : {}) } catch { return {} } }


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

  const hexCifrado = await cifrarHex(factoresClinicos)
  assert(typeof hexCifrado === 'string', 'El resultado debe ser una cadena hexadecimal')
  assert(hexCifrado.startsWith('\\x535043'), 'Debe iniciar con cabecera SPC (\\x535043)')

  // Comprobar que ningún texto sensible viaja en claro en el hex
  assert(!hexCifrado.toLowerCase().includes('propranolol'), 'Medicamento no debe figurar en claro')
  assert(!hexCifrado.toLowerCase().includes('hipertension'), 'Condición de salud no debe figurar en claro')
  assert(!hexCifrado.toLowerCase().includes('suenohoras'), 'Factores de sueño no deben figurar en claro')
  assert(!hexCifrado.toLowerCase().includes('cafeina'), 'Consumo de cafeína no debe figurar en claro')

  // Descifrado correcto
  const descifrados = await recuperar(hexCifrado)
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
  const hexV1 = await cifrarHex(factoresV1, 1)
  assert.strictEqual(versionDeSobre(hexV1), 1, 'El sobre 1 debe registrar versión 1')

  // Cifrar con versión 2 (Rotación de clave)
  const hexV2 = await cifrarHex(factoresV2, 2)
  assert.strictEqual(versionDeSobre(hexV2), 2, 'El sobre 2 debe registrar versión 2')

  // Descifrado respetando la versión de cada registro
  const recuperadoV1 = await recuperar(hexV1)
  assert.strictEqual(recuperadoV1.medicacion, 'Atenolol 50mg', 'Registro antiguo v1 se descifra con clave v1')

  const recuperadoV2 = await recuperar(hexV2)
  assert.strictEqual(recuperadoV2.medicacion, 'Losartan 50mg', 'Registro nuevo v2 se descifra con clave rotada v2')
})

await testAsync('Detección de alteración o clave incorrecta con rechazo criptográfico AEAD', async () => {
  const factores = { confidencial: 'diagnostico_privado' }
  const hexCifrado = await cifrarHex(factores, 1)

  // Intentar forzar descifrado con versión de clave errónea (v99)
  const intentoInvalido = await recuperar(hexCifrado, 99)
  assert.deepStrictEqual(intentoInvalido, {}, 'Clave incorrecta debe ser rechazada por AES-GCM retornando objeto vacío')
})

// ----------------------------------------------------------------------------
// TEST 4: Endpoints serverless (/api/declaraciones/cifrar y /descifrar): solo con sesión y solo el titular
// ----------------------------------------------------------------------------
console.log('\n--- 4. Endpoints de Cifrado y Descifrado Exclusivos del Titular ---')

const { crearHandler: crearCifrar } = await import('../api/declaraciones/cifrar.js')
const { crearHandler: crearDescifrar } = await import('../api/declaraciones/descifrar.js')

function simularRespuestaHttp() {
  return {
    statusCode: 200, headers: {}, cuerpo: '',
    setHeader(n, v) { this.headers[n.toLowerCase()] = v },
    end(d) { this.cuerpo = d || '' }
  }
}
const ID = '11111111-2222-3333-4444-555555555555'
const DUENO = { id: 'aaaaaaaa-0000-0000-0000-000000000001' }
const sinSesion = async () => null
// Sesión simulada: `db` devuelve la fila como la devolvería la base (la RLS ya filtró lo ajeno)
const conSesion = (fila, usuario = DUENO) => async () => ({
  usuario,
  db: { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: fila, error: null }) }) }) }) }
})
const peticion = (cuerpo, metodo = 'POST') => ({ method: metodo, headers: {}, body: JSON.stringify(cuerpo) })

await testAsync('Cifrar: rechaza GET (405) y peticiones sin sesión (401)', async () => {
  const h = crearCifrar({ verificar: sinSesion })
  let res = simularRespuestaHttp(); await h(peticion({ factores: { a: 1 } }, 'GET'), res)
  assert.strictEqual(res.statusCode, 405)
  res = simularRespuestaHttp(); await h(peticion({ factores: { a: 1 } }), res)
  assert.strictEqual(res.statusCode, 401, 'Sin sesión no se cifra')
})

await testAsync('Cifrar: con sesión devuelve un sobre SPC que no contiene los datos en claro', async () => {
  const h = crearCifrar({ verificar: conSesion(null) })
  const res = simularRespuestaHttp()
  await h(peticion({ factores: { medicacion: 'Propranolol' } }), res)
  assert.strictEqual(res.statusCode, 200)
  const j = JSON.parse(res.cuerpo)
  assert(j.ok && j.datosCifrados.startsWith('\\x535043') && j.claveVersion === 1)
  assert(!j.datosCifrados.toLowerCase().includes('propranolol'))
  assert.strictEqual(res.headers['cache-control'], 'no-store')
})

await testAsync('Cifrar: factores inválidos se rechazan (400)', async () => {
  const h = crearCifrar({ verificar: conSesion(null) })
  for (const malo of [{}, { factores: 'texto' }, { factores: [1] }]) {
    const res = simularRespuestaHttp(); await h(peticion(malo), res)
    assert.strictEqual(res.statusCode, 400)
  }
})

await testAsync('Sin clave en el servidor NO hay clave por defecto: cifrar y descifrar fallan cerrado (503)', async () => {
  const sinClave = {}
  const res = simularRespuestaHttp()
  await crearCifrar({ verificar: conSesion(null), env: sinClave })(peticion({ factores: { a: 1 } }), res)
  assert.strictEqual(res.statusCode, 503)
  const hex = await cifrarHex({ a: 1 })
  const res2 = simularRespuestaHttp()
  await crearDescifrar({ verificar: conSesion({ usuario_id: DUENO.id, datos_cifrados: hex, clave_version: 1 }), env: sinClave })(peticion({ declaracionId: ID }), res2)
  assert.strictEqual(res2.statusCode, 503)
  await assert.rejects(() => cifrarFactores({ a: 1 }, { env: { CLAVE_CIFRADO_CAMPOS: 'corta' } }), 'Una clave corta no se acepta')
})

await testAsync('Descifrar: rechaza GET (405), sin sesión (401) e id inválido (400)', async () => {
  let res = simularRespuestaHttp(); await crearDescifrar({ verificar: sinSesion })(peticion({ declaracionId: ID }, 'GET'), res)
  assert.strictEqual(res.statusCode, 405)
  res = simularRespuestaHttp(); await crearDescifrar({ verificar: sinSesion })(peticion({ declaracionId: ID }), res)
  assert.strictEqual(res.statusCode, 401)
  res = simularRespuestaHttp(); await crearDescifrar({ verificar: conSesion(null) })(peticion({ declaracionId: 'no-es-uuid' }), res)
  assert.strictEqual(res.statusCode, 400)
})

await testAsync('Descifrar: el titular recupera sus datos desde la base, no desde lo que envía el cliente', async () => {
  const hex = await cifrarHex({ suenoHoras: '8', medicacion: 'Ninguna' }, 1)
  const res = simularRespuestaHttp()
  await crearDescifrar({ verificar: conSesion({ usuario_id: DUENO.id, datos_cifrados: hex, clave_version: 1 }) })(
    peticion({ declaracionId: ID, datosCifrados: 'basura-enviada-por-el-cliente' }), res)
  assert.strictEqual(res.statusCode, 200)
  const j = JSON.parse(res.cuerpo)
  assert.strictEqual(j.factores.suenoHoras, '8')
  assert.strictEqual(j.factores.medicacion, 'Ninguna')
})

await testAsync('Descifrar: la declaración de otra persona o inexistente responde igual (404, sin revelar nada)', async () => {
  const hex = await cifrarHex({ secreto: 'x' }, 1)
  let res = simularRespuestaHttp()
  await crearDescifrar({ verificar: conSesion({ usuario_id: 'otro-usuario', datos_cifrados: hex, clave_version: 1 }) })(peticion({ declaracionId: ID }), res)
  assert.strictEqual(res.statusCode, 404)
  assert(!res.cuerpo.includes('secreto'))
  const ajena = res.cuerpo
  res = simularRespuestaHttp()
  await crearDescifrar({ verificar: conSesion(null) })(peticion({ declaracionId: ID }), res)
  assert.strictEqual(res.statusCode, 404)
  assert.strictEqual(res.cuerpo, ajena, 'Ajena e inexistente deben verse idénticas')
})

await testAsync('Descifrar: un sobre alterado se rechaza (422)', async () => {
  const hex = await cifrarHex({ cafeina: 'alta' }, 1)
  const c = hex.split(''); c[c.length - 3] = c[c.length - 3] === '5' ? '6' : '5'
  const res = simularRespuestaHttp()
  await crearDescifrar({ verificar: conSesion({ usuario_id: DUENO.id, datos_cifrados: c.join(''), clave_version: 1 }) })(peticion({ declaracionId: ID }), res)
  assert.strictEqual(res.statusCode, 422)
  assert.strictEqual(JSON.parse(res.cuerpo).ok, false)
})

test('El navegador no tiene claves: ni clave por defecto ni variables VITE_ con claves', () => {
  const cliente = fs.readFileSync(path.join(ROOT, 'src', 'utils', 'cifradoService.js'), 'utf8')
  assert(!/CLAVE_SEMILLA|unach_sensor_pulso_aes|VITE_ENCRYPTION_KEY|VITE_SALUD_KEY|subtle\.(encrypt|decrypt|importKey)/.test(cliente), 'El cliente no debe contener claves ni criptografía')
  const servidor = fs.readFileSync(path.join(ROOT, 'api', '_lib', 'cifradoSalud.js'), 'utf8')
  assert(!/unach_sensor_pulso_aes|VITE_/.test(servidor), 'El servidor no debe tener clave por defecto ni leer variables VITE_')
  const desc = fs.readFileSync(path.join(ROOT, 'api', 'declaraciones', 'descifrar.js'), 'utf8')
  assert(!/Access-Control-Allow-Origin/.test(desc), 'El endpoint no debe abrirse a cualquier origen (CORS *)')
})

// ----------------------------------------------------------------------------
// TEST 5: Auditoría Estricta de CERO EMOJIS (Regla Obligatoria del Proyecto)
// ----------------------------------------------------------------------------
console.log('\n--- 5. Auditoría de CERO EMOJIS en Código de RF116 ---')

const archivosARevisar = [
  path.join(ROOT, 'api', 'declaraciones', 'descifrar.js'),
  path.join(ROOT, 'api', 'declaraciones', 'cifrar.js'),
  path.join(ROOT, 'api', '_lib', 'cifradoSalud.js'),
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
