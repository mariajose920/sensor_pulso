#!/usr/bin/env node
// RNF03: prueba automática de la app instalable (PWA).
// Compila la web, la sirve en local y con el Chrome o Edge instalado revisa:
//   1. el manifiesto (nombre, colores, modo, íconos, accesos directos) y que cada ícono exista y tenga su tamaño,
//   2. que el navegador considere la app instalable (sin errores de instalabilidad),
//   3. el service worker y que, sin internet, la app abra y muestre el aviso "Sin conexión",
//   4. el botón "Instalar app", la guía para iPhone y que "Ahora no" se recuerde,
//   5. las mediciones guardadas sin internet: máximo 10, sin datos personales y borrables.
//
//   npm run probar:pwa                 (compila y prueba)
//   npm run probar:pwa -- --sin-build  (usa el último dist/)
//   CHROME_PATH="C:/ruta/chrome.exe" npm run probar:pwa
import { spawn, spawnSync } from 'node:child_process'
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const PUERTO = 4180
const PUERTO_DEV = 4181
const BASE = `http://127.0.0.1:${PUERTO}`
const BASE_DEV = `http://127.0.0.1:${PUERTO_DEV}`
const SIN_BUILD = process.argv.includes('--sin-build')
const fallos = []
const ok = (condicion, mensaje) => { if (!condicion) fallos.push(mensaje) }
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

function correr(comando, entorno = {}) {
  const r = spawnSync(comando, { stdio: 'inherit', shell: true, env: { ...process.env, ...entorno } })
  if (r.status !== 0) throw new Error(`Falló: ${comando}`)
}

async function esperar(url) {
  for (let i = 0; i < 80; i++) {
    try { const r = await fetch(url); if (r.ok) return } catch { /* aún no responde */ }
    await pausa(250)
  }
  throw new Error(`El servidor no respondió: ${url}`)
}

function detener(proceso) {
  if (process.platform === 'win32') spawnSync(`taskkill /pid ${proceso.pid} /T /F`, { shell: true, stdio: 'ignore' })
  else proceso.kill()
}

async function probarManifiesto(page) {
  const m = await page.evaluate(async () => {
    const enlace = document.querySelector('link[rel="manifest"]')
    if (!enlace) return null
    const manifiesto = await (await fetch(enlace.href)).json()
    const iconos = []
    for (const i of manifiesto.icons || []) {
      const r = await fetch(new URL(i.src, enlace.href))
      let ancho = 0, alto = 0
      if (r.ok && i.type === 'image/png') {
        const bmp = await createImageBitmap(await r.blob())
        ancho = bmp.width; alto = bmp.height
      }
      iconos.push({ src: i.src, sizes: i.sizes, purpose: i.purpose, estado: r.status, ancho, alto })
    }
    return {
      manifiesto,
      iconos,
      appleTouch: !!document.querySelector('link[rel="apple-touch-icon"]'),
      favicon: !!document.querySelector('link[rel="icon"]')
    }
  })
  ok(m, 'no hay <link rel="manifest"> en la página')
  if (!m) return
  const x = m.manifiesto
  ok(x.name === 'sensor_pulso' && x.short_name === 'sensor_pulso', 'el nombre de la app no es sensor_pulso')
  ok(x.display === 'standalone', `display debería ser standalone y es ${x.display}`)
  ok(x.orientation === 'any', `la orientación debería ser libre (any) y es ${x.orientation}`)
  ok(x.start_url === '/' && x.scope === '/', 'start_url y scope deberían ser /')
  ok(x.theme_color === '#1e40af', `theme_color inesperado: ${x.theme_color}`)
  ok(x.background_color, 'falta background_color')
  ok(String(x.lang).startsWith('es'), `lang debería ser es-CL y es ${x.lang}`)
  const urls = (x.shortcuts || []).map((s) => s.url).sort()
  ok(JSON.stringify(urls) === JSON.stringify(['/aprendizaje', '/comparacion', '/medicion']), `accesos directos inesperados: ${urls}`)
  const tiene = (tam, prop) => m.iconos.some((i) => i.sizes === tam && i.purpose === prop && i.estado === 200 && i.ancho === Number(tam.split('x')[0]))
  ok(tiene('192x192', 'any'), 'falta el ícono PNG de 192×192 (any) o no mide 192 px')
  ok(tiene('512x512', 'any'), 'falta el ícono PNG de 512×512 (any) o no mide 512 px')
  ok(tiene('512x512', 'maskable'), 'falta el ícono maskable de 512×512 o no mide 512 px')
  for (const i of m.iconos) ok(i.estado === 200, `el ícono ${i.src} responde ${i.estado}`)
  ok(m.appleTouch, 'falta el ícono para iPhone (apple-touch-icon)')
  ok(m.favicon, 'falta el favicon')
}

async function probarInstalabilidad(page) {
  const cdp = await page.createCDPSession()
  await cdp.send('Page.enable')
  const { installabilityErrors } = await cdp.send('Page.getInstallabilityErrors')
  ok(installabilityErrors.length === 0, `el navegador reporta errores de instalabilidad: ${installabilityErrors.map((e) => e.errorId).join(', ')}`)
}

async function probarSinConexion(page) {
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
  const activo = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.ready
    return !!r.active && r.active.state === 'activated'
  })
  ok(activo, 'el service worker no quedó activo')
  await page.reload({ waitUntil: 'networkidle0' })       // la página pasa a estar controlada por el service worker
  ok(await page.evaluate(() => !!navigator.serviceWorker.controller), 'la página no quedó controlada por el service worker')

  const claves = await page.evaluate(async () => (await caches.keys()).join(','))
  ok(/precache/.test(claves), 'no existe la caché de precarga de la app')

  await page.setOfflineMode(true)
  await page.goto(BASE + '/comparacion', { waitUntil: 'domcontentloaded' })
  await page.waitForSelector('.nav-brand', { timeout: 8000 }).catch(() => {})
  ok(await page.$('.nav-brand'), 'sin internet la app no abre (falta la barra de navegación)')
  ok(await page.$('.card'), 'sin internet no se muestra la pantalla de comparación')
  await page.evaluate(() => window.dispatchEvent(new Event('offline')))
  await pausa(300)
  ok(await page.$('.aviso-sin-conexion'), 'sin internet no aparece el aviso "Sin conexión"')

  await page.setOfflineMode(false)
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await pausa(300)
  ok(!(await page.$('.aviso-sin-conexion')), 'al volver internet el aviso sigue visible')
}

async function probarInstalacion(navegador) {
  // Botón de instalación (Android y computador)
  const page = await navegador.newPage()
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await page.evaluate(() => localStorage.removeItem('pwa-instalacion-oculta'))
  await page.reload({ waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true })
    window.__preguntado = false
    e.prompt = () => { window.__preguntado = true; return Promise.resolve() }
    e.userChoice = Promise.resolve({ outcome: 'accepted' })
    window.dispatchEvent(e)
  })
  await pausa(300)
  ok(await page.$('.aviso-instalar'), 'no aparece el botón "Instalar app"')
  const boton = await page.evaluateHandle(() => [...document.querySelectorAll('.aviso-instalar .btn')].find((b) => b.textContent.includes('Instalar app')))
  if (boton.asElement()) {
    await boton.asElement().click()
    await pausa(300)
    ok(await page.evaluate(() => window.__preguntado), '"Instalar app" no abre el cuadro de instalación del navegador')
    ok(!(await page.$('.aviso-instalar')), 'el aviso debería ocultarse después de instalar')
  } else {
    fallos.push('falta el botón "Instalar app"')
  }
  // "Ahora no" se recuerda
  await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await page.evaluate(() => {
    const e = new Event('beforeinstallprompt', { cancelable: true })
    e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({ outcome: 'dismissed' })
    window.dispatchEvent(e)
  })
  await pausa(300)
  const ahoraNo = await page.evaluateHandle(() => [...document.querySelectorAll('.aviso-instalar .btn')].find((b) => b.textContent.includes('Ahora no')))
  if (ahoraNo.asElement()) {
    await ahoraNo.asElement().click()
    await page.reload({ waitUntil: 'networkidle0' })
    await page.evaluate(() => {
      const e = new Event('beforeinstallprompt', { cancelable: true })
      e.prompt = () => Promise.resolve(); e.userChoice = Promise.resolve({ outcome: 'dismissed' })
      window.dispatchEvent(e)
    })
    await pausa(300)
    ok(!(await page.$('.aviso-instalar')), '"Ahora no" no se recuerda: el aviso vuelve a aparecer enseguida')
  } else {
    fallos.push('falta el botón "Ahora no"')
  }
  await page.close()

  // Guía para iPhone
  const ios = await navegador.newPage()
  await ios.setUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1')
  await ios.goto(BASE + '/', { waitUntil: 'networkidle0' })
  await ios.evaluate(() => localStorage.removeItem('pwa-instalacion-oculta'))
  await ios.reload({ waitUntil: 'networkidle0' })
  await pausa(300)
  const texto = await ios.$eval('.estado-pwa', (el) => el.textContent).catch(() => '')
  ok(/Añadir a pantalla de inicio/.test(texto), 'en iPhone no aparece la guía "Añadir a pantalla de inicio"')
  await ios.close()
}

async function probarMedicionesOffline(navegador) {
  const page = await navegador.newPage()
  await page.goto(BASE_DEV + '/', { waitUntil: 'networkidle0' })
  const r = await page.evaluate(async () => {
    const m = await import('/src/pwa/medicionesOffline.js')
    await m.borrarMedicionesVistas()
    for (let i = 1; i <= 12; i++) {
      await m.guardarMedicionVista({
        id: 'm' + i, fecha: '2026-11-0' + (i % 9 + 1), bpm: 60 + i, spo2: 97, ritmo: 'normal', calidad: 'buena',
        actividad: 'reposo', dentroDeRango: true,
        // datos que NO deben guardarse
        nombre: 'Persona Real', correo: 'persona@alu.unach.cl', edad: 21, condicionSalud: 'asma', medicacion: 'x'
      })
      await new Promise((res) => setTimeout(res, 3))
    }
    const lista = await m.listarMedicionesVistas()
    const campos = [...new Set(lista.flatMap((x) => Object.keys(x)))].sort()
    await m.borrarMedicionesVistas()
    const vacia = await m.listarMedicionesVistas()
    return { cantidad: lista.length, primera: lista[0] && lista[0].id, campos, despuesDeBorrar: vacia.length }
  })
  ok(r.cantidad === 10, `se guardan ${r.cantidad} mediciones y deberían ser 10 como máximo`)
  ok(r.primera === 'm12', `la más reciente debería ir primero y es ${r.primera}`)
  const prohibidos = ['nombre', 'correo', 'edad', 'condicionSalud', 'medicacion'].filter((c) => r.campos.includes(c))
  ok(prohibidos.length === 0, `se guardaron datos personales: ${prohibidos.join(', ')}`)
  ok(r.despuesDeBorrar === 0, 'borrar las mediciones vistas no las elimina')
  await page.close()
}

async function main() {
  const ejecutable = buscarNavegador()
  if (!ejecutable) throw new Error('No encontré Chrome ni Edge. Define CHROME_PATH con la ruta del navegador.')

  const entorno = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL || 'https://ozzehtpqxpicfqvmulcg.supabase.co',
    VITE_SUPABASE_PUBLISHABLE_KEY: process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'clave-de-prueba'
  }
  if (!SIN_BUILD) correr('npm run build', entorno)
  if (!existsSync('dist/sw.js')) throw new Error('No existe dist/sw.js. Ejecuta sin --sin-build.')

  const opciones = { shell: true, stdio: 'ignore', env: { ...process.env, ...entorno } }
  const preview = spawn(`npx vite preview --port ${PUERTO} --strictPort --host 127.0.0.1`, opciones)
  const dev = spawn(`npx vite --port ${PUERTO_DEV} --strictPort --host 127.0.0.1`, opciones)
  let navegador
  try {
    await Promise.all([esperar(BASE), esperar(BASE_DEV)])
    navegador = await puppeteer.launch({ executablePath: ejecutable, headless: true, args: ['--no-sandbox'] })

    const page = await navegador.newPage()
    await page.goto(BASE + '/', { waitUntil: 'networkidle0' })
    await probarManifiesto(page)
    console.log('✓ manifiesto e íconos revisados')
    await probarInstalabilidad(page)
    console.log('✓ instalabilidad revisada')
    await probarSinConexion(page)
    console.log('✓ service worker y modo sin conexión revisados')
    await page.close()
    await probarInstalacion(navegador)
    console.log('✓ botón de instalación y guía para iPhone revisados')
    await probarMedicionesOffline(navegador)
    console.log('✓ mediciones guardadas sin internet revisadas')
  } finally {
    if (navegador) await navegador.close()
    detener(preview); detener(dev)
  }

  if (fallos.length) {
    console.error(`\n✖ ${fallos.length} problema(s) en la app instalable:`)
    for (const f of fallos) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('\n✔ La app es instalable, abre sin internet y cumple lo definido para RNF03.')
}

main().catch((e) => { console.error(`\n✖ ${e.message}`); process.exit(1) })
