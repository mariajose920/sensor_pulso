import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

// Plugin para simular los endpoints de la API de Vercel (/api/esp32/telemetria) en desarrollo local
function esp32ApiDevPlugin() {
  return {
    name: 'esp32-api-dev-plugin',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url || ''
        if (url === '/api/esp32/telemetria' || url.startsWith('/api/esp32/telemetria?')) {
          let body = ''
          req.on('data', chunk => {
            body += chunk
          })
          req.on('end', async () => {
            req.body = body
            try {
              const { default: handler } = await import('./api/esp32/telemetria.js')
              await handler(req, res)
            } catch (err) {
              res.statusCode = 500
              res.setHeader('Content-Type', 'application/json')
              res.end(JSON.stringify({ ok: false, error: err.message }))
            }
          })
          return
        }
        next()
      })
    }
  }
}

export default defineConfig({
  plugins: [vue(), esp32ApiDevPlugin()],
  server: {
    host: true, // Expone el servidor en la red local WiFi (0.0.0.0) para que el ESP32 pueda enviar datos (RF05)
    port: 5173
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src')
    }
  }
})
