import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'
import path from 'path'

// RNF03: la web se instala como app (PWA). Ver docs/RNF03-pwa.md.
export default defineConfig({
  plugins: [
    vue(),
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
        description: 'Plataforma educativa para medir, visualizar, comparar e interpretar la frecuencia cardíaca y la SpO₂ con un ESP32.',
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
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
