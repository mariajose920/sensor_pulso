import { defineConfig, loadEnv } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'
import fs from 'fs'
import { pathToFileURL } from 'url'
import { asegurarClaveCifradoLocal } from './scripts/claveCifradoLocal.mjs'

// Plugin para simular en desarrollo local las funciones de Vercel de la carpeta /api (/api/<carpeta>/<archivo>).
// Los archivos o carpetas que empiezan con «_» son internos y no se exponen.
// En local, el ESP32 envía sus datos al servidor de producción (no puede llegar a «localhost»). Para ver esa medición
// en la versión local, la consulta GET de telemetría se resuelve contra producción cuando allí hay datos frescos.
// Se desactiva con TELEMETRIA_REMOTA=off o se apunta a otro servidor con TELEMETRIA_REMOTA=https://...
async function telemetriaRemota() {
  const base = process.env.TELEMETRIA_REMOTA || 'https://sensorpulso.vercel.app'
  if (base === 'off') return null
  try {
    const r = await fetch(base.replace(/\/$/, '') + '/api/esp32/telemetria', { signal: AbortSignal.timeout(3000) })
    if (!r.ok) return null
    const datos = await r.json()
    return datos && datos.conectado ? datos : null
  } catch {
    return null
  }
}

function apiDevPlugin() {
  return {
    name: 'api-dev-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method === 'GET' && /^\/api\/esp32\/telemetria(?:\?.*)?$/.test(req.url || '')) {
          const remota = await telemetriaRemota()
          if (remota) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ...remota, origen: 'produccion' }))
            return
          }
        }
        const coincide = /^\/api\/([a-z0-9-]+)\/([a-z0-9-]+)(?:\?.*)?$/i.exec(req.url || '')
        if (!coincide) return next()
        const [, carpeta, archivo] = coincide
        const ruta = path.resolve(process.cwd(), 'api', carpeta, `${archivo}.js`)
        if (!fs.existsSync(ruta)) return next()
        let body = ''
        req.on('data', chunk => { body += chunk })
        req.on('end', async () => {
          req.body = body
          try {
            const { default: handler } = await import(pathToFileURL(ruta).href)
            await handler(req, res)
          } catch (err) {
            console.error('[api-dev]', err)
            res.statusCode = 500
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ ok: false, error: 'Error interno.' }))
          }
        })
      })
    }
  }
}

// RNF03: la web se instala como app (PWA). Ver docs/RNF03-pwa.md.
export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  // Servidor de desarrollo sin clave de cifrado: se crea una local y se guarda en .env.local. Sin ella la ficha del
  // paciente no llega a la base de datos (el servidor se niega a cifrar) y se pierde al cerrar sesión. En producción no aplica.
  const clave = asegurarClaveCifradoLocal({
    env,
    rutaEnvLocal: path.resolve(process.cwd(), '.env.local'),
    esDesarrollo: command === 'serve'
  })
  if (clave.generada) {
    console.warn('\n[sensor_pulso] Se creó una clave de cifrado local (CLAVE_CIFRADO_CAMPOS) en .env.local para que la ficha del paciente se guarde en la base.\n' +
      '  Las fichas guardadas desde este equipo solo se pueden leer con esa clave; si usas la misma base que producción, reemplázala en .env.local por la CLAVE_CIFRADO_CAMPOS de Vercel.\n')
  }
  // Cargar variables en process.env para que los endpoints dev puedan leer RESEND_API_KEY
  Object.assign(process.env, env)

  return {
    plugins: [
      vue(),
      apiDevPlugin(),
      VitePWA({
        // "prompt" + sin skipWaiting: la versión nueva se descarga en segundo plano y se activa
        // la próxima vez que se abre la app, sin recargar la pantalla mientras alguien mide.
        registerType: 'prompt',
        injectRegister: false,
        includeAssets: ['icons/icono.svg', 'icons/apple-touch-icon.png'],
        manifest: {
          id: '/',
          name: 'sensor_pulso',
          short_name: 'sensor_pulso',
          description: 'Plataforma educativa para medir, visualizar, comparar e interpretar la frecuencia cardíaca y la SpO₂ con un ESP32. No es un dispositivo médico certificado ni entrega diagnósticos.',
          lang: 'es-CL',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          background_color: '#f8fafc',
          theme_color: '#1e40af',
          categories: ['education', 'health'],
          icons: [
            { src: 'icons/icono-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icono-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/icono-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
            { src: 'icons/icono.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }
          ],
          // Accesos directos al mantener presionado el ícono (Android)
          shortcuts: [
            { name: 'Medición', short_name: 'Medición', url: '/medicion', icons: [{ src: 'icons/icono-192.png', sizes: '192x192', type: 'image/png' }] },
            { name: 'Comparación', short_name: 'Comparar', url: '/comparacion', icons: [{ src: 'icons/icono-192.png', sizes: '192x192', type: 'image/png' }] },
            { name: 'Aprendizaje', short_name: 'Aprender', url: '/aprendizaje', icons: [{ src: 'icons/icono-192.png', sizes: '192x192', type: 'image/png' }] }
          ]
        },
        workbox: {
          // Pantallas de la app, plantillas y comparador viajan en estos archivos: quedan disponibles sin internet.
          globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
          navigateFallback: '/index.html',
          cleanupOutdatedCaches: true,
          skipWaiting: false,
          clientsClaim: false,
          runtimeCaching: [
            {
              // Lecciones publicadas (contenido público): se muestran las guardadas y se actualizan al volver internet.
              urlPattern: ({ url, request }) => request.method === 'GET' && /\/rest\/v1\/lecciones/.test(url.pathname),
              handler: 'StaleWhileRevalidate',
              options: {
                cacheName: 'lecciones',
                expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 30 },
                cacheableResponse: { statuses: [200] }
              }
            },
            {
              // Datos personales y de salud, sesión y tiempo real: nunca se guardan en la caché del navegador.
              urlPattern: ({ url }) => /\.supabase\.co$/.test(url.hostname),
              handler: 'NetworkOnly'
            }
          ]
        },
        devOptions: { enabled: false }
      })
    ],
    server: {
      host: true, // Expone el servidor en la red local WiFi (0.0.0.0) para que el ESP32 pueda enviar datos (RF05)
      port: 5173,
      headers: {
        'Strict-Transport-Security': 'max-age=63072000; includeSubDomains; preload',
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
        'Referrer-Policy': 'strict-origin-when-cross-origin',
        'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
        'Cross-Origin-Resource-Policy': 'same-origin',
        'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https://*.googleusercontent.com; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co https://sensorpulso.vercel.app; worker-src 'self'; manifest-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'"
      }
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    }
  }
})
