import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import './style.css'
import { registrarServiceWorker } from './pwa/registro.js'

const app = createApp(App)
app.use(router)
app.mount('#app')

// RNF03: instalación y uso sin internet
registrarServiceWorker()
// Se carga aparte: si faltan las variables de Supabase, la app igual abre
import('./pwa/limpiarAlSalir.js').catch(() => {})
