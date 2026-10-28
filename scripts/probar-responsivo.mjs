#!/usr/bin/env node
// RNF01: prueba automática del diseño responsivo.
// Compila la web, la sirve en local y la abre en varios tamaños de pantalla con el Chrome o Edge
// instalado. Revisa, en cada página y tamaño:
//   1. que no haya desplazamiento horizontal (nada se sale de la pantalla),
//   2. que el menú correcto esté visible (barra inferior en móvil, enlaces arriba en tablet y PC),
//   3. que los botones y campos midan al menos 44 px de alto en móvil,
//   4. que las tablas, el aviso de girar y el menú que se oculta al bajar funcionen,
// y guarda una captura de cada combinación en pruebas-responsivas/.
//
//   npm run probar:responsivo                (compila y prueba)
//   npm run probar:responsivo -- --sin-build (usa el último dist/)
//   CHROME_PATH="C:\ruta\chrome.exe" npm run probar:responsivo
import { spawn, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const PUERTO = 4179
const BASE = `http://127.0.0.1:${PUERTO}`
const CARPETA = 'pruebas-responsivas'
const SIN_BUILD = process.argv.includes('--sin-build')

const TAMANOS = [
  { nombre: 'movil-320', ancho: 320, alto: 640, movil: true },
  { nombre: 'movil-375', ancho: 375, alto: 812, movil: true },
  { nombre: 'tablet-768', ancho: 768, alto: 1024, movil: true },
  { nombre: 'pc-1024', ancho: 1024, alto: 768, movil: false },
  { nombre: 'pc-1280', ancho: 1280, alto: 800, movil: false },
  { nombre: 'ancho-1440', ancho: 1440, alto: 900, movil: false }
]
const RUTAS = ['/', '/medicion', '/comparacion', '/aulas', '/aprendizaje', '/login']

const fallos = []
const registrar = (tamano, ruta, mensaje) => fallos.push(`[${tamano} ${ruta}] ${mensaje}`)

function buscarNavegador() {
  const candidatos = [
    process.env.CHROME_PATH,
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    'C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser'
  ].filter(Boolean)
  return candidatos.find((c) => existsSync(c))
}

function correr(comando, entorno = {}) {
  const r = spawnSync(comando, { stdio: 'inherit', shell: true, env: { ...process.env, ...entorno } })
  if (r.status !== 0) throw new Error(`Falló: ${comando}`)
}

async function esperarServidor() {
  for (let i = 0; i < 60; i++) {
    try { const r = await fetch(BASE); if (r.ok) return } catch { /* aún no responde */ }
    await new Promise((r) => setTimeout(r, 250))
  }
  throw new Error('El servidor de prueba no respondió')
}

async function revisarPagina(page, tam, ruta) {
  await page.goto(BASE + ruta, { waitUntil: 'networkidle0' })
  await page.evaluate(() => window.scrollTo(0, 0))

  const datos = await page.evaluate((esMovil) => {
    const de = document.documentElement
    const visible = (el) => {
      const r = el.getBoundingClientRect()
      const e = getComputedStyle(el)
      return r.width > 0 && r.height > 0 && e.visibility !== 'hidden' && e.display !== 'none' && r.bottom > 0 && r.right > 0
    }
    const nombre = (el) => (el.tagName.toLowerCase() + (el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/)[0] : '') + ' "' + (el.textContent || el.getAttribute('aria-label') || '').trim().slice(0, 24) + '"')

    const anchos = [...document.querySelectorAll('main *')]
      .filter((el) => visible(el) && el.getBoundingClientRect().right > de.clientWidth + 1)
      .slice(0, 3).map(nombre)

    const barraInferior = document.querySelector('.bottom-nav')
    const enlacesSuperiores = document.querySelector('.nav-links')
    const chicos = esMovil
      // Casilleros y botones de opción: el área de toque es su etiqueta, no el cuadrito
      ? [...document.querySelectorAll('button, .btn, .nav-link, .bottom-link, select, textarea, label:has(> input[type="checkbox"]), label:has(> input[type="radio"]), input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"])')]
          .filter((el) => visible(el) && el.getBoundingClientRect().height < 43.5)
          .slice(0, 5).map((el) => nombre(el) + ' ' + Math.round(el.getBoundingClientRect().height) + 'px')
      : []

    return {
      scrollWidth: de.scrollWidth,
      clientWidth: de.clientWidth,
      anchos,
      barraInferiorVisible: !!barraInferior && visible(barraInferior),
      enlacesSuperioresVisibles: !!enlacesSuperiores && visible(enlacesSuperiores),
      chicos
    }
  }, tam.ancho <= 640)

  if (datos.scrollWidth > datos.clientWidth + 1) {
    registrar(tam.nombre, ruta, `desplazamiento horizontal: contenido de ${datos.scrollWidth}px en pantalla de ${datos.clientWidth}px (${datos.anchos.join(', ')})`)
  }
  if (tam.ancho <= 640) {
    if (!datos.barraInferiorVisible) registrar(tam.nombre, ruta, 'falta la barra de navegación inferior')
    if (datos.enlacesSuperioresVisibles) registrar(tam.nombre, ruta, 'los enlaces superiores no deberían verse en móvil')
    for (const c of datos.chicos) registrar(tam.nombre, ruta, `área de toque menor a 44 px: ${c}`)
  } else {
    if (datos.barraInferiorVisible) registrar(tam.nombre, ruta, 'la barra inferior no debería verse en tablet o PC')
    if (!datos.enlacesSuperioresVisibles) registrar(tam.nombre, ruta, 'faltan los enlaces de navegación superiores')
  }
  await page.screenshot({ path: join(CARPETA, `${tam.nombre}${ruta === '/' ? '-inicio' : ruta.replace('/', '-')}.png`) })
}

async function revisarComportamientos(browser) {
  // Móvil vertical: menú que se oculta al bajar, aviso de girar y tabla con "Ver más"
  let page = await browser.newPage()
  await page.setViewport({ width: 375, height: 812, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await page.goto(BASE + '/comparacion', { waitUntil: 'networkidle0' })

  if (!(await page.$('.aviso-girar'))) registrar('movil-375', '/comparacion', 'falta el aviso para girar el celular')

  const oculto = (sel) => page.$eval(sel, (el) => el.classList.contains('oculto'))
  await page.evaluate(() => window.scrollTo(0, 900)); await new Promise((r) => setTimeout(r, 400))
  await page.evaluate(() => window.scrollTo(0, 1400)); await new Promise((r) => setTimeout(r, 400))
  if (!(await oculto('.navbar')) || !(await oculto('.bottom-nav'))) registrar('movil-375', '/comparacion', 'el menú no se oculta al bajar')
  await page.evaluate(() => window.scrollTo(0, 1100)); await new Promise((r) => setTimeout(r, 400))
  if ((await oculto('.navbar')) || (await oculto('.bottom-nav'))) registrar('movil-375', '/comparacion', 'el menú no reaparece al subir')

  const vistas = await page.evaluate(() => ({
    movil: getComputedStyle(document.querySelector('.tabla-movil')).display !== 'none',
    escritorio: getComputedStyle(document.querySelector('.tabla-escritorio')).display !== 'none'
  }))
  if (!vistas.movil || vistas.escritorio) registrar('movil-375', '/comparacion', 'la tabla debería verse apilada en móvil')

  const boton = await page.$('.fila-movil-boton')
  if (!boton) {
    registrar('movil-375', '/comparacion', 'falta el botón "Ver más" de la tabla')
  } else {
    await boton.evaluate((b) => b.scrollIntoView({ block: 'center' }))
    await new Promise((r) => setTimeout(r, 300))
    await boton.click()
    const abierto = await page.$eval('.fila-movil-detalle', (d) => getComputedStyle(d).display !== 'none')
    if (!abierto) registrar('movil-375', '/comparacion', '"Ver más" no despliega el detalle')
    await page.screenshot({ path: join(CARPETA, 'movil-375-tabla-ver-mas.png') })
  }
  await page.close()

  // Móvil horizontal: el aviso de girar no debe aparecer
  page = await browser.newPage()
  await page.setViewport({ width: 812, height: 375, isMobile: true, hasTouch: true, deviceScaleFactor: 2 })
  await page.goto(BASE + '/comparacion', { waitUntil: 'networkidle0' })
  if (await page.$('.aviso-girar')) registrar('movil-horizontal', '/comparacion', 'el aviso de girar no debería verse en horizontal')
  const de = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, c: document.documentElement.clientWidth }))
  if (de.s > de.c + 1) registrar('movil-horizontal', '/comparacion', `desplazamiento horizontal (${de.s}px en ${de.c}px)`)
  await page.screenshot({ path: join(CARPETA, 'movil-horizontal-comparacion.png') })
  await page.close()

  // PC: la tabla completa se ve y la lista móvil no
  page = await browser.newPage()
  await page.setViewport({ width: 1280, height: 800 })
  await page.goto(BASE + '/comparacion', { waitUntil: 'networkidle0' })
  const pc = await page.evaluate(() => ({
    movil: getComputedStyle(document.querySelector('.tabla-movil')).display !== 'none',
    escritorio: getComputedStyle(document.querySelector('.tabla-escritorio')).display !== 'none'
  }))
  if (pc.movil || !pc.escritorio) registrar('pc-1280', '/comparacion', 'la tabla completa debería verse en PC')
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
  if (!existsSync('dist')) throw new Error('No existe dist/. Ejecuta sin --sin-build.')

  rmSync(CARPETA, { recursive: true, force: true })
  mkdirSync(CARPETA, { recursive: true })

  const servidor = spawn(`npx vite preview --port ${PUERTO} --strictPort --host 127.0.0.1`, { shell: true, stdio: 'ignore' })
  let navegador
  try {
    await esperarServidor()
    navegador = await puppeteer.launch({ executablePath: ejecutable, headless: true, args: ['--no-sandbox'] })

    for (const tam of TAMANOS) {
      const page = await navegador.newPage()
      await page.setViewport({ width: tam.ancho, height: tam.alto, isMobile: tam.movil && tam.ancho <= 640, hasTouch: tam.movil, deviceScaleFactor: 1 })
      for (const ruta of RUTAS) await revisarPagina(page, tam, ruta)
      await page.close()
      console.log(`✓ ${tam.nombre} (${tam.ancho}×${tam.alto}): ${RUTAS.length} páginas revisadas`)
    }
    await revisarComportamientos(navegador)
  } finally {
    if (navegador) await navegador.close()
    if (process.platform === 'win32') spawnSync(`taskkill /pid ${servidor.pid} /T /F`, { shell: true, stdio: 'ignore' })
    else servidor.kill()
  }

  console.log(`\nCapturas guardadas en ${CARPETA}/`)
  if (fallos.length) {
    console.error(`\n✖ ${fallos.length} problema(s) de diseño responsivo:`)
    for (const f of fallos) console.error(`  - ${f}`)
    process.exit(1)
  }
  console.log('✔ Sin desplazamiento horizontal, menús correctos y áreas de toque de 44 px en todos los tamaños.')
}

main().catch((e) => { console.error(`\n✖ ${e.message}`); process.exit(1) })
