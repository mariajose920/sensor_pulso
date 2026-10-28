<template>
  <div class="medicion-view">
    <!-- Encabezado de la vista -->
    <div class="view-header">
      <div>
        <h1 class="view-title">📡 Medición y Tiempo Real</h1>
        <p class="view-subtitle">
          Recepción de datos del microcontrolador ESP32 por WiFi (RF05), autenticación por token (RF54) y visualización multicanal.
        </p>
      </div>

      <div class="header-actions">
        <button 
          class="btn" 
          :class="simuladorActivo ? 'btn-danger' : 'btn-primary'"
          @click="toggleSimulador"
        >
          {{ simuladorActivo ? '⏹️ Detener Emulador WiFi' : '▶️ Iniciar Prueba WiFi (5 canales)' }}
        </button>
      </div>
    </div>

    <!-- RF01: Identificador del usuario que realiza la medición -->
    <UserIdentifier />

    <!-- Barra de Estado WiFi del ESP32 (RF05, RF54) -->
    <Esp32WifiStatus
      :conectado="esp32State.conectado"
      :dispositivo="esp32State.dispositivo"
      :ip="esp32State.ip"
      :paquete="esp32State.paquete"
      :rssi="esp32State.rssi"
      :tiempoDesdeContacto="esp32State.tiempoTranscurridoSegundos"
    />

    <!-- Osciloscopio en Tiempo Real de la Señal PPG recibida por WiFi -->
    <OsciloscopioCanvas
      :canal="canalSeleccionado"
      :activo="esp32State.conectado"
      :muestrasIr="senalBuffer.ir"
      :muestrasRojo="senalBuffer.rojo"
      :frecuenciaHz="esp32State.frecuenciaHz"
    />

    <!-- Grid de los 5 Canales Fisiológicos Simultáneos (RF08, RF12) -->
    <div class="section-container">
      <div class="section-header">
        <h2 class="section-title">Canales Fisiológicos Simultáneos (ESP32)</h2>
        <span class="section-hint">Selecciona un canal para inspeccionar su traza en el osciloscopio</span>
      </div>

      <div class="canales-grid">
        <CanalCard
          v-for="c in canalesMostrados"
          :key="c.canal"
          :canalData="c"
          :seleccionado="canalSeleccionado === c.canal"
          @select="seleccionarCanal"
        />
      </div>
    </div>

    <!-- Panel de Pruebas, Diagnóstico y Firmware -->
    <div class="card test-panel">
      <div class="test-tabs">
        <button 
          class="tab-btn" 
          :class="{ active: tabActiva === 'simulador' }"
          @click="tabActiva = 'simulador'"
        >
          🧪 Emulador de Pruebas WiFi
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: tabActiva === 'firmware' }"
          @click="tabActiva = 'firmware'"
        >
          💾 Código de Firmware ESP32
        </button>
        <button 
          class="tab-btn" 
          :class="{ active: tabActiva === 'api' }"
          @click="tabActiva = 'api'"
        >
          🌐 Documentación de Endpoint Ingesta
        </button>
      </div>

      <!-- Tab 1: Emulador de Pruebas WiFi -->
      <div v-if="tabActiva === 'simulador'" class="tab-content">
        <p class="tab-description">
          Permite simular el envío de paquetes HTTP POST idénticos a los generados por el microcontrolador ESP32 mediante WiFi hacia el endpoint <code>/api/esp32/telemetria</code>.
        </p>

        <div class="form-row">
          <div class="form-group flex-1">
            <label class="form-label">Token de Dispositivo (RF54):</label>
            <input 
              type="text" 
              class="form-control font-mono" 
              v-model="tokenPrueba" 
              placeholder="esp_demotoken_unach_2026_rf05"
            />
            <small class="form-text">El token autentica al ESP32 frente al servidor. Un token inválido o revocado será rechazado con HTTP 403.</small>
          </div>

          <div class="action-buttons">
            <button class="btn btn-secondary" @click="enviarUnicoPaquete" :disabled="enviandoManual">
              {{ enviandoManual ? 'Enviando...' : '📤 Enviar 1 Paquete de Prueba' }}
            </button>
            <button 
              class="btn" 
              :class="simuladorActivo ? 'btn-danger' : 'btn-success'"
              @click="toggleSimulador"
            >
              {{ simuladorActivo ? '⏹️ Detener Emisión Continua' : '⚡ Transmisión Continua (1 Hz)' }}
            </button>
          </div>
        </div>

        <div v-if="ultimoResultadoEnvio" class="alert" :class="ultimoResultadoEnvio.ok ? 'alert-success' : 'alert-danger'">
          <strong>Resultado:</strong> {{ ultimoResultadoEnvio.mensaje || ultimoResultadoEnvio.error }}
          <span class="font-mono" style="float: right;">{{ ultimoResultadoEnvio.timestamp }}</span>
        </div>
      </div>

      <!-- Tab 2: Firmware -->
      <div v-if="tabActiva === 'firmware'" class="tab-content">
        <p class="tab-description">
          El firmware completo en C++ para Arduino/PlatformIO está guardado en 
          <code>firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino</code>.
        </p>
        <div class="code-box">
          <div class="code-box-header">
            <span>firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino</span>
            <span class="code-tag">Arduino C++</span>
          </div>
          <pre><code>// 1. Configurar WiFi y Endpoint
const char* WIFI_SSID     = "TU_RED_WIFI";
const char* WIFI_PASSWORD = "TU_PASSWORD";
const char* SERVER_URL    = "http://192.168.1.100:5173/api/esp32/telemetria";
const char* DEVICE_TOKEN  = "{{ tokenPrueba }}";

// 2. El ESP32 sintetiza las ondas de los 5 canales de prueba con muesca dícrota
// y las transmite por HTTP POST a 1 Hz con cabecera X-ESP32-Token: &lt;token&gt;</code></pre>
        </div>
        <p style="margin-top: 0.75rem; font-size: 0.85rem; color: var(--color-muted);">
          📖 Consulta el archivo <code>firmware/README.md</code> para las instrucciones detalladas de cableado del sensor MAX30102 y carga a la placa.
        </p>
      </div>

      <!-- Tab 3: Documentación de Ingesta -->
      <div v-if="tabActiva === 'api'" class="tab-content">
        <p class="tab-description">
          Especificación del endpoint REST de ingesta de telemetría de alta disponibilidad para Vercel y Vite:
        </p>
        <table class="api-table">
          <tr>
            <th>Método & Ruta</th>
            <td><code>POST /api/esp32/telemetria</code></td>
          </tr>
          <tr>
            <th>Cabeceras</th>
            <td>
              <code>Content-Type: application/json</code><br />
              <code>X-ESP32-Token: &lt;token_del_esp32&gt;</code> (RF54)<br />
              <code>Authorization: Bearer &lt;token_del_esp32&gt;</code>
            </td>
          </tr>
          <tr>
            <th>Seguridad (RF54)</th>
            <td>Validación criptográfica SHA-256 del token en la tabla <code>dispositivos</code> y comprobación de estado no revocado.</td>
          </tr>
          <tr>
            <th>Consulta en vivo</th>
            <td><code>GET /api/esp32/telemetria</code> retorna el estado actual de conexión y métricas del último paquete.</td>
          </tr>
        </table>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import UserIdentifier from '../components/UserIdentifier.vue'
import Esp32WifiStatus from '../components/Esp32WifiStatus.vue'
import OsciloscopioCanvas from '../components/OsciloscopioCanvas.vue'
import CanalCard from '../components/CanalCard.vue'
import {
  esp32State,
  senalBuffer,
  simuladorActivo,
  iniciarSondeoWiFi,
  detenerSondeoWiFi,
  emitirPaquetePruebaWiFi,
  toggleSimuladorWiFi
} from '../services/esp32Service'

const canalSeleccionado = ref(1)
const tabActiva = ref('simulador')
const tokenPrueba = ref('esp_demotoken_unach_2026_rf05')
const enviandoManual = ref(false)
const ultimoResultadoEnvio = ref(null)

// Si aún no hemos recibido paquetes, mostramos los 5 canales en estado base de espera
const canalesPorDefecto = [
  { canal: 1, activo: true, bpm: 72.0, spo2: 98.2, calidad: 'buena' },
  { canal: 2, activo: true, bpm: 68.5, spo2: 97.5, calidad: 'buena' },
  { canal: 3, activo: true, bpm: 80.0, spo2: 99.0, calidad: 'buena' },
  { canal: 4, activo: true, bpm: 75.2, spo2: 98.0, calidad: 'regular' },
  { canal: 5, activo: true, bpm: 65.0, spo2: 96.8, calidad: 'buena' }
]

const canalesMostrados = computed(() => {
  if (esp32State.canales && esp32State.canales.length > 0) {
    return esp32State.canales
  }
  return canalesPorDefecto
})

function seleccionarCanal(canal) {
  canalSeleccionado.value = canal
  senalBuffer.canalSeleccionado = canal
}

function toggleSimulador() {
  toggleSimuladorWiFi(tokenPrueba.value)
}

async function enviarUnicoPaquete() {
  enviandoManual.value = true
  try {
    const res = await emitirPaquetePruebaWiFi(tokenPrueba.value)
    ultimoResultadoEnvio.value = {
      ok: true,
      mensaje: `Paquete #${res.paquete} recibido exitosamente vía WiFi (${res.canales_recibidos} canales procesados)`,
      timestamp: new Date().toLocaleTimeString()
    }
  } catch (err) {
    ultimoResultadoEnvio.value = {
      ok: false,
      error: `Error al enviar paquete: ${err.message}`,
      timestamp: new Date().toLocaleTimeString()
    }
  } finally {
    enviandoManual.value = false
  }
}

onMounted(() => {
  // Iniciar sondeo automático para detectar recepción WiFi en tiempo real
  iniciarSondeoWiFi(1000)
})

onBeforeUnmount(() => {
  detenerSondeoWiFi()
})
</script>

<style scoped>
.medicion-view {
  padding-bottom: 2rem;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.view-title {
  font-size: 1.85rem;
  font-weight: 800;
  color: var(--color-text);
  margin-bottom: 0.25rem;
}

.view-subtitle {
  color: var(--color-muted);
  font-size: 0.95rem;
  max-width: 750px;
}

.header-actions {
  display: flex;
  gap: 0.75rem;
}

.section-container {
  margin-bottom: 1.5rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.75rem;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.section-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-text);
}

.section-hint {
  font-size: 0.8rem;
  color: var(--color-muted);
}

.canales-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.test-panel {
  padding: 1.5rem;
}

.test-tabs {
  display: flex;
  gap: 0.5rem;
  border-bottom: 1px solid var(--color-border);
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
}

.tab-btn {
  background: none;
  border: none;
  padding: 0.6rem 1rem;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-muted);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: var(--color-primary);
}

.tab-btn.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.tab-description {
  font-size: 0.9rem;
  color: var(--color-muted);
  margin-bottom: 1rem;
  line-height: 1.5;
}

.form-row {
  display: flex;
  gap: 1.5rem;
  align-items: flex-end;
  flex-wrap: wrap;
  margin-bottom: 1rem;
}

.flex-1 {
  flex: 1;
  min-width: 280px;
}

.action-buttons {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
  flex-wrap: wrap;
}

.form-control {
  width: 100%;
  padding: 0.6rem 0.85rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  font-size: 0.9rem;
}

.form-control:focus {
  outline: none;
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.15);
}

.form-text {
  display: block;
  font-size: 0.75rem;
  color: var(--color-muted);
  margin-top: 0.35rem;
}

.code-box {
  background: #090d16;
  border: 1px solid #1e293b;
  border-radius: 0.5rem;
  overflow: hidden;
}

.code-box-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0.85rem;
  background: #0f172a;
  border-bottom: 1px solid #1e293b;
  font-family: monospace;
  font-size: 0.8rem;
  color: #94a3b8;
}

.code-tag {
  background: #1e293b;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  color: #38bdf8;
  font-size: 0.75rem;
}

.code-box pre {
  padding: 1rem;
  margin: 0;
  color: #e2e8f0;
  font-size: 0.85rem;
  line-height: 1.5;
  overflow-x: auto;
}

.api-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.api-table th, .api-table td {
  padding: 0.65rem 0.85rem;
  border: 1px solid var(--color-border);
  text-align: left;
}

.api-table th {
  background: #f8fafc;
  width: 25%;
  font-weight: 600;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.btn-success {
  background: var(--color-success);
  color: #ffffff;
}

.btn-success:hover {
  background: #15803d;
}

.alert-success {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
}

.alert-danger {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

@media (max-width: 640px) {
  .view-header {
    flex-direction: column;
    align-items: flex-start;
  }
}
</style>
