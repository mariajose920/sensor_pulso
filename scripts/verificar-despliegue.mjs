#!/usr/bin/env node
// RNF11: comprueba que un despliegue en Vercel quedó bien (o que lo estará, con --local).
//
//   npm run verificar:despliegue -- https://sensorpulso.vercel.app    (un despliegue real)
//   npm run verificar:despliegue -- --local                           (compila y simula Vercel en tu computador)
//   npm run verificar:despliegue -- --local --sin-build               (usa el último dist/)
//   --proyecto <ref>   referencia esperada del proyecto de Supabase (por defecto ozzehtpqxpicfqvmulcg)
//
// Revisa: que la página abra sin pedir sesión de Vercel, que las rutas funcionen al recargar,
// que el sitio apunte al Supabase correcto, que se pueda instalar (manifiesto y service worker),
// las cabeceras de seguridad y que el navegador no reporte errores ni bloqueos de la política de contenido.
import { spawn, spawnSync } from 'node:child_process'
import { createServer } from 'node:http'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { extname, join, normalize, sep } from 'node:path'
import puppeteer from 'puppeteer-core'

const args = process.argv.slice(2)
const LOCAL = args.includes('--local')
const SIN_BUILD = args.includes('--sin-build')
const idxProyecto = args.indexOf('--proyecto')
const PROYECTO = idxProyecto >= 0 ? args[idxProyecto + 1] : 'ozzehtpqxpicfqvmulcg'
const URL_REMOTA = args.find((a, i) => !a.startsWith('--') && args[i - 1] !== '--proyecto')
const PUERTO_LOCAL = 4182
const RUTAS = ['/', '/medicion', '/comparacion', '/aulas', '/aprendizaje', '/login']

const resultados = []
const revisar = (grupo, ok, mensaje, detalle = '') => resultados.push({ grupo, ok: !!ok, mensaje, detalle })
const pausa = (ms) => new Promise((r) => setTimeout(r, ms))

function buscarNavegador() {
  return [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ].filter(Boolean).find((c) => existsSync(c))
}

// ---------------------------------------------------------------- servidor local que imita a Vercel
const TIPOS = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json',
  '.webmanifest': 'application/manifest+json', '.map': 'application/json'
}

function fuenteARegex(fuente) {
  const partes = fuente.split('(.*)').map((p) => p.replace(/[.+?^${}|[\]\\]/g, '\\$&'))
  return new RegExp('^' + partes.join('.*') + '$')
}

function iniciarServidorLocal() {
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'))
  const reglas = (config.headers || []).map((h) => ({ regex: fuenteARegex(h.source), headers: h.headers }))
  const raiz = join(process.cwd(), 'dist')

  const servidor = createServer((req, res) => {
    const ruta = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let archivo = normalize(join(raiz, ruta))
    if (!archivo.startsWith(raiz + sep) && archivo !== raiz) { res.writeHead(403).end(); return }
    let existe = existsSync(archivo) && statSync(archivo).isFile()
    if (!existe) { archivo = join(raiz, 'index.html'); existe = true }      // rewrite de la SPA

    const cabeceras = { 'Content-Type': TIPOS[extname(archivo)] || 'application/octet-stream' }
    for (const r of reglas) if (r.regex.test(ruta)) for (const h of r.headers) cabeceras[h.key] = h.value
    res.writeHead(200, cabeceras)
    res.end(readFileSync(archivo))
  })
  return new Promise((resolver) => servidor.listen(PUERTO_LOCAL, '127.0.0.1', () => resolver(servidor)))
}

// ---------------------------------------------------------------- comprobaciones
async function pedir(base, ruta, opciones = {}) {
  try {
    return await fetch(base + ruta, { redirect: 'manual', ...opciones })
  } catch (e) {
    return { status: 0, headers: new Headers(), text: async () => '', error: e }
  }
}

async function comprobarAcceso(base) {
  const r = await pedir(base, '/')
  const texto = r.status === 200 ? await r.text() : ''
  const pideSesion = r.status === 401 || ((r.status === 302 || r.status === 307) && /vercel\.com/.test(r.headers.get('location') || ''))
  revisar('Acceso', !pideSesion,
    'la página abre sin pedir iniciar sesión en Vercel',
    pideSesion ? 'Vercel responde con protección de despliegue: en el panel, Settings > Deployment Protection, desactiva "Vercel Authentication".' : '')
  revisar('Acceso', r.status === 200 && /id="app"/.test(texto),
    'la ruta / responde 200 con la aplicación', `respuesta ${r.status}${r.error ? ' (' + r.error.message + ')' : ''}`)
  return texto
}

async function comprobarRutas(base) {
  for (const ruta of RUTAS.filter((x) => x !== '/')) {
    const r = await pedir(base, ruta)
    const t = r.status === 200 ? await r.text() : ''
    revisar('Rutas', r.status === 200 && /id="app"/.test(t), `recargar ${ruta} entrega la aplicación`, `respuesta ${r.status}`)
  }
}

async function comprobarSupabase(base, html) {
  const scripts = [...html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.js)"/g)].map((m) => m[1])
  const visitados = new Set()
  let todo = ''
  const cola = [...new Set(scripts)]
  while (cola.length && visitados.size < 25) {
    const ruta = cola.shift()
    if (visitados.has(ruta)) continue
    visitados.add(ruta)
    const r = await pedir(base, ruta)
    if (r.status !== 200) continue
    const js = await r.text()
    todo += js
    for (const m of js.matchAll(/["'`]\.?\/?((?:assets\/)?[\w.-]+\.js)["'`]/g)) cola.push('/' + m[1].replace(/^\//, '').replace(/^(?!assets\/)/, 'assets/'))
  }
  const hosts = [...new Set([...todo.matchAll(/https:\/\/([a-z0-9]{20})\.supabase\.co/g)].map((m) => m[1]))]
  revisar('Supabase', hosts.length > 0,
    'el sitio trae la URL de Supabase',
    'No aparece ninguna URL de Supabase en el código desplegado: en Vercel falta la variable VITE_SUPABASE_URL (con ese nombre exacto, no NEXT_PUBLIC_) o se creó después del despliegue; hay que volver a desplegar.')
  if (hosts.length) {
    revisar('Supabase', hosts.length === 1 && hosts[0] === PROYECTO,
      `el sitio apunta al proyecto de Supabase ${PROYECTO}`,
      `apunta a: ${hosts.join(', ')}`)
  }
}

async function comprobarInstalable(base) {
  const sw = await pedir(base, '/sw.js')
  revisar('Instalable', sw.status === 200 && /javascript/.test(sw.headers.get('content-type') || ''), 'sw.js se entrega como JavaScript', `respuesta ${sw.status}, ${sw.headers.get('content-type')}`)
  revisar('Instalable', /no-cache|no-store|max-age=0/.test(sw.headers.get('cache-control') || ''), 'sw.js no se queda en caché (las versiones nuevas llegan)', `cache-control: ${sw.headers.get('cache-control')}`)
  const mf = await pedir(base, '/manifest.webmanifest')
  let manifiesto = null
  try { manifiesto = JSON.parse(await mf.text()) } catch { /* no es JSON */ }
  revisar('Instalable', mf.status === 200 && manifiesto && manifiesto.name === 'sensor_pulso', 'el manifiesto existe y se llama sensor_pulso', `respuesta ${mf.status}`)
  revisar('Instalable', /manifest\+json|json/.test(mf.headers.get('content-type') || ''), 'el manifiesto tiene el tipo de contenido correcto', `content-type: ${mf.headers.get('content-type')}`)
  for (const i of (manifiesto && manifiesto.icons) || []) {
    const r = await pedir(base, '/' + i.src.replace(/^\//, ''))
    revisar('Instalable', r.status === 200, `el ícono ${i.src} existe`, `respuesta ${r.status}`)
  }
}

async function comprobarCabeceras(base) {
  const r = await pedir(base, '/')
  const h = (n) => r.headers.get(n) || ''
  const csp = h('content-security-policy')
  if (!LOCAL) revisar('Seguridad', /max-age=\d{6,}/.test(h('strict-transport-security')), 'HTTPS estricto (Strict-Transport-Security)', `valor: ${h('strict-transport-security') || 'ausente'}`)
  revisar('Seguridad', /nosniff/i.test(h('x-content-type-options')), 'X-Content-Type-Options: nosniff', '')
  revisar('Seguridad', /deny|sameorigin/i.test(h('x-frame-options')) && /frame-ancestors\s+'none'/.test(csp), 'no se puede incrustar en otra página', '')
  revisar('Seguridad', !!h('referrer-policy'), 'Referrer-Policy definida', '')
  revisar('Seguridad', !!h('permissions-policy'), 'Permissions-Policy definida', '')
  revisar('Seguridad', !!csp, 'política de contenido (CSP) definida', '')
  revisar('Seguridad', !!csp && !/unsafe-eval/.test(csp) && !/script-src[^;]*unsafe-inline/.test(csp), 'la CSP no permite eval ni scripts en línea', '')
  revisar('Seguridad', /connect-src[^;]*supabase\.co/.test(csp), 'la CSP permite conectarse a Supabase', '')
}

async function comprobarNavegador(base) {
  const ejecutable = buscarNavegador()
  if (!ejecutable) { revisar('Navegador', false, 'se encontró Chrome o Edge para la prueba en el navegador', 'Define CHROME_PATH con la ruta del navegador.'); return }
  const navegador = await puppeteer.launch({ executablePath: ejecutable, headless: true, args: ['--no-sandbox'] })
  try {
    for (const tam of [{ w: 375, h: 812, m: true }, { w: 1280, h: 800, m: false }]) {
      const page = await navegador.newPage()
      await page.setViewport({ width: tam.w, height: tam.h, isMobile: tam.m, hasTouch: tam.m })
      const problemas = []
      page.on('console', (m) => { if (m.type() === 'error') problemas.push('consola: ' + m.text().slice(0, 160)) })
      page.on('pageerror', (e) => problemas.push('error de la página: ' + String(e.message).slice(0, 160)))
      page.on('requestfailed', (q) => { const f = q.failure(); if (f && !/ERR_ABORTED/.test(f.errorText)) problemas.push(`petición fallida ${q.url().slice(0, 80)} (${f.errorText})`) })
      await page.evaluateOnNewDocument(() => {
        window.__csp = []
        document.addEventListener('securitypolicyviolation', (e) => window.__csp.push(e.violatedDirective + ' → ' + (e.blockedURI || 'inline')))
      })
      for (const ruta of RUTAS) {
        await page.goto(base + ruta, { waitUntil: 'networkidle0' })
        await pausa(200)
        const cspViolaciones = await page.evaluate(() => window.__csp)
        for (const v of cspViolaciones) problemas.push(`la política de contenido bloqueó: ${v}`)
        const vacia = await page.evaluate(() => !document.querySelector('.navbar') || !document.querySelector('main'))
        if (vacia) problemas.push(`${ruta} no dibuja la aplicación`)
      }
      revisar('Navegador', problemas.length === 0, `sin errores ni bloqueos en ${RUTAS.length} páginas (${tam.m ? 'móvil' : 'computador'})`, [...new Set(problemas)].slice(0, 4).join(' | '))
      await page.close()
    }
  } finally {
    await navegador.close()
  }
}

async function main() {
  if (!LOCAL && !URL_REMOTA) {
    console.error('Uso: npm run verificar:despliegue -- <https://direccion> | --local')
    process.exit(2)
  }
  let servidor = null
  let base = URL_REMOTA ? URL_REMOTA.replace(/\/$/, '') : `http://127.0.0.1:${PUERTO_LOCAL}`

  if (LOCAL) {
    if (!SIN_BUILD) {
      const r = spawnSync('npm run build', {
        stdio: 'inherit', shell: true,
        env: { ...process.env, VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || `https://${PROYECTO}.supabase.co`, VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'clave-de-prueba' }
      })
      if (r.status !== 0) throw new Error('La compilación falló')
    }
    if (!existsSync('dist/index.html')) throw new Error('No existe dist/. Ejecuta sin --sin-build.')
    servidor = await iniciarServidorLocal()
  }

  console.log(`Verificando ${base}${LOCAL ? ' (simulación local de Vercel con vercel.json)' : ''}\n`)
  try {
    const html = await comprobarAcceso(base)
    if (resultados.some((r) => r.grupo === 'Acceso' && !r.ok)) {
      // Si Vercel pide sesión no tiene sentido seguir: el resto respondería la pantalla de acceso.
    } else {
      await comprobarRutas(base)
      await comprobarSupabase(base, html)
      await comprobarInstalable(base)
      await comprobarCabeceras(base)
      await comprobarNavegador(base)
    }
  } finally {
    if (servidor) servidor.close()
  }

  let grupo = ''
  for (const r of resultados) {
    if (r.grupo !== grupo) { grupo = r.grupo; console.log(`\n${grupo}`) }
    console.log(`  ${r.ok ? '✓' : '✖'} ${r.mensaje}${!r.ok && r.detalle ? '\n      → ' + r.detalle : ''}`)
  }
  const malos = resultados.filter((r) => !r.ok)
  console.log(malos.length ? `\n✖ ${malos.length} comprobación(es) fallaron.` : `\n✔ ${resultados.length} comprobaciones correctas: el despliegue está bien.`)
  process.exit(malos.length ? 1 : 0)
}

main().catch((e) => { console.error(`\n✖ ${e.message}`); process.exit(1) })
