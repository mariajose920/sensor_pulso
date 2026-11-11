import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  LIMITES_PETICIONES_CONFIG,
  verificarLimitePeticiones,
  aplicarLimitePeticiones,
  extraerIp,
  reiniciarMemoriaLimites
} from '../api/_lib/limitePeticiones.js'
import telemetriaHandler from '../api/esp32/telemetria.js'
import { crearHandler as crearCifrarHandler } from '../api/declaraciones/cifrar.js'
import { crearHandler as crearDescifrarHandler } from '../api/declaraciones/descifrar.js'
import invitacionesHandler from '../api/invitaciones/enviar.js'
import { crearHandler as crearExportarHandler } from '../api/derechos/exportar.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF67')
console.log('  Límite de Peticiones en Recepción ESP32 y en la API (Rate Limit)')
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

// Utilidad para simular objetos req y res de Node.js / Vercel Serverless
function crearMockReqRes({
  method = 'GET',
  url = '/api/esp32/telemetria',
  headers = {},
  body = null
} = {}) {
  const req = {
    method,
    url,
    headers: {
      host: 'localhost:5173',
      'x-forwarded-proto': 'https',
      ...headers
    },
    body,
    socket: { encrypted: true }
  }

  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    ended: false,
    setHeader(nombre, valor) {
      this.headers[nombre.toLowerCase()] = valor
    },
    getHeader(nombre) {
      return this.headers[nombre.toLowerCase()]
    },
    end(contenido) {
      this.ended = true
      if (contenido) this.body = contenido
      return this
    }
  }

  return { req, res }
}

async function ejecutarPruebas() {
  // --------------------------------------------------------------------------
  console.log('--- 1. Esquema y Funciones en Supabase (PostgreSQL) ---')
  // --------------------------------------------------------------------------

  const sqlSeguridadPath = path.join(ROOT, 'supabase', 'migrations', '20261027000700_seguridad_cumplimiento.sql')
  const sqlSeguridad = fs.readFileSync(sqlSeguridadPath, 'utf8')

  test('Base de Datos: Tabla limites_peticiones existe con clave, ventana y contador', () => {
    assert(sqlSeguridad.includes('create table public.limites_peticiones'), 'Debe crear tabla limites_peticiones')
    assert(sqlSeguridad.includes('clave       text not null'), 'Debe contener columna clave')
    assert(sqlSeguridad.includes('ventana     timestamptz not null'), 'Debe contener columna ventana')
    assert(sqlSeguridad.includes('contador    integer not null default 1'), 'Debe contener columna contador')
    assert(sqlSeguridad.includes('primary key (clave, ventana)'), 'Debe tener clave primaria (clave, ventana)')
  })

  test('Base de Datos: Función consumir_limite existe con security definer y parámetros (p_clave, p_maximo, p_segundos)', () => {
    assert(sqlSeguridad.includes('function public.consumir_limite(p_clave text, p_maximo int, p_segundos int default 60)'), 'Firma de consumir_limite debe coincidir')
    assert(sqlSeguridad.includes('returns boolean'), 'consumir_limite debe retornar boolean')
    assert(sqlSeguridad.includes('security definer'), 'Debe ser security definer para operar sobre limites_peticiones')
    assert(sqlSeguridad.includes('revoke all on function public.consumir_limite'), 'Debe revocar acceso anónimo/público (solo service_role)')
  })

  const sqlDatosInitPath = path.join(ROOT, 'supabase', 'migrations', '20261027000800_datos_iniciales.sql')
  const sqlDatosInit = fs.readFileSync(sqlDatosInitPath, 'utf8')

  test('Base de Datos: Retención de limites_peticiones configurada a 2 días (RF88 Privacidad)', () => {
    assert(sqlDatosInit.includes("('limites_peticiones', 2, 'borrar')"), 'limites_peticiones debe tener política de borrado a los 2 días')
  })

  // --------------------------------------------------------------------------
  console.log('\n--- 2. Lógica de Rate Limiting y Comunicación con Supabase (consumir_limite) ---')
  // --------------------------------------------------------------------------

  await testAsync('Supabase RPC: consumir_limite es invocado con los parámetros correctos', async () => {
    let rpcInvocado = false
    let paramsRecibidos = null

    const mockSupabase = {
      rpc: async (fnNombre, params) => {
        if (fnNombre === 'consumir_limite') {
          rpcInvocado = true
          paramsRecibidos = params
          return { data: true, error: null }
        }
        return { data: null, error: new Error('Función no encontrada') }
      }
    }

    const resultado = await verificarLimitePeticiones({
      clave: 'esp32:prueba_token',
      maximo: 120,
      segundos: 60,
      supabase: mockSupabase
    })

    assert.strictEqual(rpcInvocado, true, 'Debe invocar el RPC consumir_limite')
    assert.strictEqual(paramsRecibidos.p_clave, 'esp32:prueba_token')
    assert.strictEqual(paramsRecibidos.p_maximo, 120)
    assert.strictEqual(paramsRecibidos.p_segundos, 60)
    assert.strictEqual(resultado.permitido, true)
    assert.strictEqual(resultado.fuente, 'supabase')
    assert(resultado.retryAfter > 0 && resultado.retryAfter <= 60)
  })

  await testAsync('Supabase RPC: Al devolver false, verificarLimitePeticiones retorna permitido = false', async () => {
    const mockSupabaseLimiteExcedido = {
      rpc: async () => ({ data: false, error: null })
    }

    const resultado = await verificarLimitePeticiones({
      clave: 'esp32:saturado',
      maximo: 10,
      segundos: 60,
      supabase: mockSupabaseLimiteExcedido
    })

    assert.strictEqual(resultado.permitido, false, 'Debe marcar como no permitido al exceder límite')
    assert(typeof resultado.retryAfter === 'number' && resultado.retryAfter > 0)
  })

  await testAsync('Memoria Fallback: Mantiene conteo y bloquea al superar el límite cuando no hay DB', async () => {
    reiniciarMemoriaLimites()
    const clave = `test:memoria:${Date.now()}`
    const maximo = 3

    // Peticiones 1, 2, 3 -> Permitidas
    for (let i = 1; i <= 3; i++) {
      const res = await verificarLimitePeticiones({ clave, maximo, segundos: 60, supabase: null })
      assert.strictEqual(res.permitido, true, `Petición ${i} debe ser permitida`)
      assert.strictEqual(res.contador, i)
    }

    // Petición 4 -> Límite superado
    const resBloqueada = await verificarLimitePeticiones({ clave, maximo, segundos: 60, supabase: null })
    assert.strictEqual(resBloqueada.permitido, false, 'Petición 4 debe ser rechazada')
    assert.strictEqual(resBloqueada.contador, 4)
    assert(resBloqueada.retryAfter > 0)
  })

  // --------------------------------------------------------------------------
  console.log('\n--- 3. Criterio de Aceptación: Respuesta 429 con cabecera Retry-After ---')
  // --------------------------------------------------------------------------

  await testAsync('Criterio: Al superar el límite responde HTTP 429 y cabecera Retry-After', async () => {
    reiniciarMemoriaLimites()
    const clave = `cliente:ip:${Date.now()}`
    const maximo = 2

    // Consumir las 2 peticiones permitidas
    for (let i = 0; i < maximo; i++) {
      const { req, res } = crearMockReqRes()
      const permitida = await aplicarLimitePeticiones(req, res, { clave, maximo, segundos: 60 })
      assert.strictEqual(permitida, true)
      assert.strictEqual(res.statusCode, 200)
    }

    // Petición excedente número 3
    const { req, res } = crearMockReqRes()
    const permitida = await aplicarLimitePeticiones(req, res, { clave, maximo, segundos: 60 })

    assert.strictEqual(permitida, false, 'aplicarLimitePeticiones debe retornar false')
    assert.strictEqual(res.statusCode, 429, 'El código HTTP debe ser exactamente 429 Too Many Requests')

    // Verificación obligatoria del criterio de aceptación: Retry-After
    const retryAfterHeader = res.getHeader('Retry-After')
    assert(retryAfterHeader !== undefined && retryAfterHeader !== null, 'Debe incluir la cabecera Retry-After')
    const retrySegundos = parseInt(retryAfterHeader, 10)
    assert(!isNaN(retrySegundos) && retrySegundos >= 1 && retrySegundos <= 60, `Retry-After debe ser segundos válidos (obtenido: ${retrySegundos})`)

    // Verificar cuerpo JSON informativo
    const cuerpo = JSON.parse(res.body)
    assert.strictEqual(cuerpo.ok, false)
    assert.strictEqual(cuerpo.rf67, 'limite_excedido')
    assert(cuerpo.error.includes('Límite de peticiones excedido'))
  })

  // --------------------------------------------------------------------------
  console.log('\n--- 4. Recepción de Telemetría ESP32 (/api/esp32/telemetria) ---')
  // --------------------------------------------------------------------------

  await testAsync('ESP32 POST: El uso normal (1 Hz / 60 req/min) no se ve afectado bajo límite de 120 req/min', async () => {
    reiniciarMemoriaLimites()
    const token = 'esp_dispositivo_docente_unach'

    const payload = {
      token,
      dispositivo: 'ESP32-Biomedico-01',
      paquete: 1,
      uptimeMs: 1000,
      wifiRssi: -55,
      frecuenciaHz: 50,
      canales: [
        { canal: 1, activo: true, bpm: 72.0, spo2: 98.0, calidad: 'buena', ir: [24000, 24100], rojo: [18000, 18050] }
      ]
    }

    // Simular varias peticiones a ritmo normal
    for (let i = 0; i < 5; i++) {
      const { req, res } = crearMockReqRes({
        method: 'POST',
        headers: { 'x-esp32-token': token },
        body: payload
      })

      await telemetriaHandler(req, res)
      assert.strictEqual(res.statusCode, 200, `Petición normal ${i + 1} debe responder 200`)
      const json = JSON.parse(res.body)
      assert.strictEqual(json.ok, true)
    }
  })

  await testAsync('ESP32 POST: Responde HTTP 429 con Retry-After al superar el límite de telemetría', async () => {
    reiniciarMemoriaLimites()
    const token = 'esp_token_ataque_flood'
    process.env.ESP32_RATE_LIMIT_MAX = '3' // Límite reducido para probar saturación

    try {
      const payload = {
        token,
        dispositivo: 'ESP32-Spammer',
        paquete: 1,
        canales: [
          { canal: 1, activo: true, bpm: 75.0, spo2: 97.5, ir: [24000], rojo: [18000] }
        ]
      }

      // 3 peticiones permitidas
      for (let i = 1; i <= 3; i++) {
        const { req, res } = crearMockReqRes({
          method: 'POST',
          headers: { 'x-esp32-token': token },
          body: payload
        })
        await telemetriaHandler(req, res)
        assert.strictEqual(res.statusCode, 200)
      }

      // Petición 4: debe superar el límite
      const { req, res } = crearMockReqRes({
        method: 'POST',
        headers: { 'x-esp32-token': token },
        body: payload
      })
      await telemetriaHandler(req, res)

      assert.strictEqual(res.statusCode, 429, 'POST de telemetría excedente debe responder 429')
      assert(res.getHeader('Retry-After') !== undefined, 'POST debe incluir cabecera Retry-After')
      const json = JSON.parse(res.body)
      assert.strictEqual(json.ok, false)
      assert.strictEqual(json.rf67, 'limite_excedido')
    } finally {
      delete process.env.ESP32_RATE_LIMIT_MAX
    }
  })

  await testAsync('ESP32 GET: Consultas de telemetría responden 429 con Retry-After al saturar', async () => {
    reiniciarMemoriaLimites()
    process.env.ESP32_GET_RATE_LIMIT_MAX = '2'

    try {
      // 2 peticiones GET permitidas
      for (let i = 1; i <= 2; i++) {
        const { req, res } = crearMockReqRes({ method: 'GET' })
        await telemetriaHandler(req, res)
        assert.strictEqual(res.statusCode, 200)
      }

      // Petición GET 3: saturada
      const { req, res } = crearMockReqRes({ method: 'GET' })
      await telemetriaHandler(req, res)

      assert.strictEqual(res.statusCode, 429, 'GET de telemetría excedente debe responder 429')
      assert(res.getHeader('Retry-After') !== undefined, 'GET debe incluir cabecera Retry-After')
    } finally {
      delete process.env.ESP32_GET_RATE_LIMIT_MAX
    }
  })

  // --------------------------------------------------------------------------
  console.log('\n--- 5. Rutas Adicionales de la API (Declaraciones, Invitaciones, Derechos) ---')
  // --------------------------------------------------------------------------

  await testAsync('API Invitaciones (/api/invitaciones/enviar): Responde 429 con Retry-After al exceder límite', async () => {
    reiniciarMemoriaLimites()
    const ip = '190.161.45.10'

    // Mockeamos el límite a 2 peticiones en memoria para esta prueba
    const clave = `api:invitaciones:${ip}`
    for (let i = 0; i < LIMITES_PETICIONES_CONFIG.API_INVITACIONES_MAXIMO; i++) {
      // Consumir hasta el límite
      await verificarLimitePeticiones({ clave, maximo: LIMITES_PETICIONES_CONFIG.API_INVITACIONES_MAXIMO, segundos: 60 })
    }

    // Ahora enviar una petición HTTP que supere el límite
    const { req, res } = crearMockReqRes({
      method: 'POST',
      url: '/api/invitaciones/enviar',
      headers: { 'x-forwarded-for': ip },
      body: { correo: 'estudiante@alu.unach.cl', codigo: 'AULA101' }
    })

    await invitacionesHandler(req, res)
    assert.strictEqual(res.statusCode, 429, 'Debe responder 429 por saturación de invitaciones')
    assert(res.getHeader('Retry-After') !== undefined, 'Debe incluir Retry-After')
  })

  await testAsync('API Declaraciones (/api/declaraciones/cifrar): Responde 429 con Retry-After al exceder límite', async () => {
    reiniciarMemoriaLimites()
    const mockSesion = { usuario: { id: 'usr-paciente-rate-limit-1' } }
    const handler = crearCifrarHandler({
      verificar: async () => mockSesion,
      env: { CLAVE_CIFRADO_CAMPOS: Buffer.alloc(32, 1).toString('base64') }
    })

    const clave = `api:cifrar:${mockSesion.usuario.id}`
    for (let i = 0; i < LIMITES_PETICIONES_CONFIG.API_ESTANDAR_MAXIMO; i++) {
      await verificarLimitePeticiones({ clave, maximo: LIMITES_PETICIONES_CONFIG.API_ESTANDAR_MAXIMO, segundos: 60 })
    }

    const { req, res } = crearMockReqRes({
      method: 'POST',
      url: '/api/declaraciones/cifrar',
      body: { factores: { suenoHoras: '7_8' } }
    })

    await handler(req, res)
    assert.strictEqual(res.statusCode, 429, 'Cifrado debe responder 429 al exceder límite')
    assert(res.getHeader('Retry-After') !== undefined, 'Debe incluir Retry-After')
  })

  await testAsync('API Derechos (/api/derechos/exportar): Responde 429 con Retry-After al exceder límite', async () => {
    reiniciarMemoriaLimites()
    const mockSesion = {
      usuario: { id: 'usr-portabilidad-limit' },
      db: { rpc: async () => ({ data: { generado_en: new Date().toISOString() }, error: null }) }
    }

    const handler = crearExportarHandler({
      verificar: async () => mockSesion,
      env: {}
    })

    const clave = `api:exportar:${mockSesion.usuario.id}`
    for (let i = 0; i < LIMITES_PETICIONES_CONFIG.API_EXPORTAR_MAXIMO; i++) {
      await verificarLimitePeticiones({ clave, maximo: LIMITES_PETICIONES_CONFIG.API_EXPORTAR_MAXIMO, segundos: 60 })
    }

    const { req, res } = crearMockReqRes({
      method: 'POST',
      url: '/api/derechos/exportar'
    })

    await handler(req, res)
    assert.strictEqual(res.statusCode, 429, 'Exportar debe responder 429 al exceder límite')
    assert(res.getHeader('Retry-After') !== undefined, 'Debe incluir Retry-After')
  })

  // --------------------------------------------------------------------------
  console.log('\n================================================================')
  console.log(`  RESUMEN DE PRUEBAS RF67:`)
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
