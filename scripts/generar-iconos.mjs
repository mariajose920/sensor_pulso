#!/usr/bin/env node
// RNF03: genera los íconos PNG de la app a partir de los SVG de public/icons/.
// Para cambiar el ícono: edita public/icons/icono.svg y icono-maskable.svg y ejecuta
//   npm run generar:iconos
// Usa el Chrome o Edge instalado (o CHROME_PATH).
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

const CARPETA = 'public/icons'
const SALIDAS = [
  { svg: 'icono.svg', png: 'icono-192.png', lado: 192, transparente: true },
  { svg: 'icono.svg', png: 'icono-512.png', lado: 512, transparente: true },
  { svg: 'icono-maskable.svg', png: 'icono-maskable-512.png', lado: 512, transparente: false },
  { svg: 'icono-maskable.svg', png: 'apple-touch-icon.png', lado: 180, transparente: false } // iOS redondea solo las esquinas
]

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

const ejecutable = buscarNavegador()
if (!ejecutable) { console.error('No encontré Chrome ni Edge. Define CHROME_PATH.'); process.exit(1) }

const navegador = await puppeteer.launch({ executablePath: ejecutable, headless: true, args: ['--no-sandbox'] })
try {
  for (const s of SALIDAS) {
    const svg = readFileSync(`${CARPETA}/${s.svg}`, 'utf8')
    const page = await navegador.newPage()
    await page.setViewport({ width: s.lado, height: s.lado, deviceScaleFactor: 1 })
    await page.setContent(`<!doctype html><style>html,body{margin:0;background:transparent}svg{display:block;width:${s.lado}px;height:${s.lado}px}</style>${svg}`)
    const png = await page.screenshot({ type: 'png', omitBackground: s.transparente })
    writeFileSync(`${CARPETA}/${s.png}`, png)
    await page.close()
    console.log(`✓ ${s.png} (${s.lado}×${s.lado})`)
  }
} finally {
  await navegador.close()
}
