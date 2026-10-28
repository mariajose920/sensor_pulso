<template>
  <div class="dispositivos-view">
    <!-- Encabezado -->
    <div class="view-header">
      <div>
        <div class="badge-tag">Seguridad ISO 27001 · Control de Acceso A.8.2</div>
        <h1 class="view-title">🔐 Gestión de Dispositivos ESP32 (RF54)</h1>
        <p class="view-subtitle">
          Cada microcontrolador ESP32 cuenta con un token criptográfico propio. En la base de datos sólo se almacena su hash SHA-256. El administrador puede revocar tokens en cualquier momento.
        </p>
      </div>

      <div class="header-actions">
        <button class="btn btn-primary" @click="mostrarModalCrear = true">
          ➕ Registrar Nuevo ESP32
        </button>
      </div>
    </div>

    <!-- Estadísticas Generales -->
    <div class="stats-grid">
      <div class="card stat-card">
        <span class="stat-icon">📡</span>
        <div class="stat-info">
          <span class="stat-val">{{ dispositivosState.lista.length }}</span>
          <span class="stat-label">Dispositivos Registrados</span>
        </div>
      </div>

      <div class="card stat-card">
        <span class="stat-icon">✅</span>
        <div class="stat-info">
          <span class="stat-val text-success">{{ totalActivos }}</span>
          <span class="stat-label">Tokens Activos</span>
        </div>
      </div>

      <div class="card stat-card">
        <span class="stat-icon">🚫</span>
        <div class="stat-info">
          <span class="stat-val text-danger">{{ totalRevocados }}</span>
          <span class="stat-label">Tokens Revocados</span>
        </div>
      </div>

      <div class="card stat-card">
        <span class="stat-icon">🟢</span>
        <div class="stat-info">
          <span class="stat-val text-info">{{ totalEnLinea }}</span>
          <span class="stat-label">En Línea (Últimos 5 min)</span>
        </div>
      </div>
    </div>

    <!-- ALERTA DE TOKEN RECIÉN GENERADO (SE MUESTRA UNA ÚNICA VEZ) -->
    <div v-if="dispositivosState.ultimoTokenGenerado" class="card token-alert-card">
      <div class="token-alert-header">
        <div class="token-alert-title">
          <span class="alert-icon">⚠️</span>
          <h3>¡Nuevo Token ESP32 Generado con Éxito!</h3>
        </div>
        <button class="btn-close" @click="dispositivosState.ultimoTokenGenerado = null">✕</button>
      </div>

      <p class="token-alert-warning">
        <strong>Importante (ISO 27001):</strong> Por estrictos principios de seguridad, este token en texto claro 
        <strong>NUNCA</strong> volverá a mostrarse ni se guarda en la base de datos (únicamente su hash irreversible SHA-256). 
        Cópialo ahora y configúralo en el archivo <code>firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino</code>.
      </p>

      <div class="token-display-box">
        <div class="token-device-label">Dispositivo: <strong>{{ dispositivosState.ultimoTokenGenerado.nombre }}</strong></div>
        <div class="token-input-group">
          <input 
            type="text" 
            class="token-field font-mono" 
            readonly 
            :value="dispositivosState.ultimoTokenGenerado.token" 
          />
          <button class="btn btn-secondary btn-copy" @click="copiarToken(dispositivosState.ultimoTokenGenerado.token)">
            {{ copiado ? '✅ ¡Copiado!' : '📋 Copiar Token' }}
          </button>
        </div>
      </div>

      <div class="token-code-preview">
        <span class="preview-label">Línea para el firmware C++:</span>
        <code>const char* DEVICE_TOKEN = "{{ dispositivosState.ultimoTokenGenerado.token }}";</code>
      </div>
    </div>

    <!-- Tabla de Dispositivos Registrados -->
    <div class="card table-card">
      <div class="table-header">
        <h2 class="section-title">Dispositivos y Estado de Tokens</h2>
        <button class="btn btn-secondary btn-sm" @click="cargarDispositivos" :disabled="dispositivosState.cargando">
          🔄 Actualizar Lista
        </button>
      </div>

      <div class="table-responsive">
        <table class="devices-table">
          <thead>
            <tr>
              <th>Nombre de Dispositivo</th>
              <th>Canales</th>
              <th>Hash Token (SHA-256)</th>
              <th>Estado</th>
              <th>Último Contacto</th>
              <th>Acciones</th>
            </tr>
          </thead>
          <tbody>
            <tr v-if="dispositivosState.lista.length === 0">
              <td colspan="6" class="text-center empty-msg">No hay dispositivos registrados aún.</td>
            </tr>
            <tr v-for="d in dispositivosState.lista" :key="d.id" :class="{ 'row-revoked': !d.activo }">
              <td>
                <div class="device-cell">
                  <strong>{{ d.nombre }}</strong>
                  <small class="font-mono text-muted">ID: {{ d.id }}</small>
                </div>
              </td>
              <td>
                <span class="badge-channels">{{ d.canales }} canales</span>
              </td>
              <td>
                <span class="font-mono token-hash-badge" :title="d.token_hash">
                  {{ d.token_hash ? d.token_hash.substring(0, 10) + '...' + d.token_hash.substring(d.token_hash.length - 8) : 'N/A' }}
                </span>
              </td>
              <td>
                <span v-if="d.activo" class="badge-status badge-active">
                  ● Token Activo
                </span>
                <div v-else class="revoked-info">
                  <span class="badge-status badge-revoked">● Revocado</span>
                  <small v-if="d.motivo_revocacion" class="revoked-reason">{{ d.motivo_revocacion }}</small>
                </div>
              </td>
              <td>
                <span class="font-mono text-sm">
                  {{ formatearFecha(d.ultimo_contacto) }}
                </span>
              </td>
              <td>
                <div class="action-btn-group">
                  <button 
                    v-if="d.activo" 
                    class="btn btn-danger btn-xs" 
                    @click="iniciarRevocacion(d)"
                  >
                    🚫 Revocar Token
                  </button>
                  <span v-else class="text-muted text-xs font-semibold">Invalidad</span>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Probador y Verificador de Tokens en Vivo (RF54) -->
    <div class="card tester-card">
      <h2 class="section-title">🧪 Verificador de Estado de Token (Auditoría RF54)</h2>
      <p class="section-description">
        Ingresa un token para validar si el backend autoriza la conexión del ESP32 o si ha sido revocado.
      </p>

      <div class="tester-form">
        <input 
          type="text" 
          v-model="tokenAProbar" 
          class="form-control font-mono" 
          placeholder="Ingresa un token (ej. esp_8f93...)" 
        />
        <button class="btn btn-primary" @click="probarToken" :disabled="verificando || !tokenAProbar">
          {{ verificando ? 'Verificando...' : '🔍 Verificar Validez' }}
        </button>
      </div>

      <div v-if="resultadoVerificacion" class="verification-box alert" :class="resultadoVerificacion.valido ? 'alert-success' : 'alert-danger'">
        <div v-if="resultadoVerificacion.valido">
          <h4>✅ Token Válido y Autorizado</h4>
          <p>Dispositivo: <strong>{{ resultadoVerificacion.dispositivo }}</strong> (ID: {{ resultadoVerificacion.dispositivoId }})</p>
          <small>El ESP32 tiene permitido transmitir telemetría médica vía WiFi.</small>
        </div>
        <div v-else>
          <h4>🚫 Token Rechazado</h4>
          <p><strong>Causa:</strong> {{ resultadoVerificacion.error }}</p>
          <small>Cualquier petición con este token será rechazada con HTTP 403 / 401.</small>
        </div>
      </div>
    </div>

    <!-- Modal Registrar Dispositivo -->
    <div v-if="mostrarModalCrear" class="modal-backdrop">
      <div class="modal-box card">
        <div class="modal-header">
          <h3>➕ Registrar Nuevo ESP32</h3>
          <button class="btn-close" @click="mostrarModalCrear = false">✕</button>
        </div>

        <div class="modal-body">
          <div class="form-group">
            <label class="form-label">Nombre del Dispositivo / Ubicación:</label>
            <input 
              type="text" 
              class="form-control" 
              v-model="nuevoDispositivo.nombre" 
              placeholder="Ej: ESP32-Laboratorio-Biomedico-03" 
            />
          </div>

          <div class="form-group">
            <label class="form-label">Número de Canales Sensores (RF08):</label>
            <select class="form-control" v-model="nuevoDispositivo.canales">
              <option :value="1">1 Canal (Sensor único)</option>
              <option :value="2">2 Canales</option>
              <option :value="3">3 Canales</option>
              <option :value="4">4 Canales</option>
              <option :value="5">5 Canales (Estándar proyecto)</option>
            </select>
            <small class="form-text">El hardware del proyecto soporta hasta 5 canales simultáneos con MAX30102.</small>
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="mostrarModalCrear = false">Cancelar</button>
          <button class="btn btn-primary" @click="confirmarRegistro" :disabled="creando || !nuevoDispositivo.nombre.trim()">
            {{ creando ? 'Generando...' : 'Generar Token y Guardar' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Confirmar Revocación -->
    <div v-if="dispositivoARevocar" class="modal-backdrop">
      <div class="modal-box card">
        <div class="modal-header">
          <h3 class="text-danger">🚫 Revocar Token de ESP32</h3>
          <button class="btn-close" @click="dispositivoARevocar = null">✕</button>
        </div>

        <div class="modal-body">
          <p>
            ¿Estás seguro de que deseas revocar el token del dispositivo 
            <strong>{{ dispositivoARevocar.nombre }}</strong>?
          </p>
          <div class="alert alert-warning" style="margin: 1rem 0; font-size: 0.85rem;">
            ⚠️ Esta acción es <strong>inmediata e irreversible</strong>. El ESP32 perderá acceso por WiFi, 
            sus sesiones activas se finalizarán automáticamente y se registrará un evento de seguridad (RF72).
          </div>

          <div class="form-group">
            <label class="form-label">Motivo de revocación (Auditoría):</label>
            <input 
              type="text" 
              class="form-control" 
              v-model="motivoRevocacion" 
              placeholder="Ej: Token comprometido, extravío del microcontrolador, fin de ciclo" 
            />
          </div>
        </div>

        <div class="modal-footer">
          <button class="btn btn-secondary" @click="dispositivoARevocar = null">Cancelar</button>
          <button class="btn btn-danger" @click="confirmarRevocacion" :disabled="revocando">
            {{ revocando ? 'Revocando...' : 'Sí, Revocar Token Inmediatamente' }}
          </button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  dispositivosState,
  cargarDispositivos,
  registrarDispositivo,
  revocarDispositivo,
  verificarTokenESP32
} from '../services/dispositivosService'

const mostrarModalCrear = ref(false)
const creando = ref(false)
const nuevoDispositivo = ref({ nombre: '', canales: 5 })

const dispositivoARevocar = ref(null)
const motivoRevocacion = ref('')
const revocando = ref(false)

const copiado = ref(false)

const tokenAProbar = ref('')
const verificando = ref(false)
const resultadoVerificacion = ref(null)

const totalActivos = computed(() => dispositivosState.lista.filter(d => d.activo).length)
const totalRevocados = computed(() => dispositivosState.lista.filter(d => !d.activo).length)
const totalEnLinea = computed(() => {
  const hace5Min = Date.now() - 5 * 60 * 1000
  return dispositivosState.lista.filter(d => d.activo && d.ultimo_contacto && new Date(d.ultimo_contacto).getTime() > hace5Min).length
})

function formatearFecha(isoString) {
  if (!isoString) return 'Nunca'
  const fecha = new Date(isoString)
  const diffSeg = Math.round((Date.now() - fecha.getTime()) / 1000)
  if (diffSeg < 60) return `Hace ${diffSeg} seg (En línea)`
  if (diffSeg < 3600) return `Hace ${Math.round(diffSeg / 60)} min`
  return fecha.toLocaleDateString() + ' ' + fecha.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function confirmarRegistro() {
  if (!nuevoDispositivo.value.nombre.trim()) return
  creando.value = true
  try {
    await registrarDispositivo({
      nombre: nuevoDispositivo.value.nombre,
      canales: nuevoDispositivo.value.canales
    })
    mostrarModalCrear.value = false
    nuevoDispositivo.value = { nombre: '', canales: 5 }
  } catch (err) {
    alert('Error al registrar: ' + err.message)
  } finally {
    creando.value = false
  }
}

function iniciarRevocacion(dispositivo) {
  dispositivoARevocar.value = dispositivo
  motivoRevocacion.value = 'Token revocado por el administrador'
}

async function confirmarRevocacion() {
  if (!dispositivoARevocar.value) return
  revocando.value = true
  try {
    await revocarDispositivo(dispositivoARevocar.value.id, motivoRevocacion.value)
    dispositivoARevocar.value = null
  } catch (err) {
    alert('Error al revocar: ' + err.message)
  } finally {
    revocando.value = false
  }
}

async function copiarToken(token) {
  try {
    await navigator.clipboard.writeText(token)
    copiado.value = true
    setTimeout(() => { copiado.value = false }, 2500)
  } catch {
    // Fallback
    const textarea = document.createElement('textarea')
    textarea.value = token
    document.body.appendChild(textarea)
    textarea.select()
    document.execCommand('copy')
    document.body.removeChild(textarea)
    copiado.value = true
    setTimeout(() => { copiado.value = false }, 2500)
  }
}

async function probarToken() {
  if (!tokenAProbar.value.trim()) return
  verificando.value = true
  resultadoVerificacion.value = null
  try {
    const res = await verificarTokenESP32(tokenAProbar.value.trim())
    resultadoVerificacion.value = res
  } catch (err) {
    resultadoVerificacion.value = { valido: false, error: err.message }
  } finally {
    verificando.value = false
  }
}

onMounted(() => {
  cargarDispositivos()
})
</script>

<style scoped>
.dispositivos-view {
  padding-bottom: 2rem;
}

.view-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.badge-tag {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-primary);
  background: #dbeafe;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  margin-bottom: 0.5rem;
  text-transform: uppercase;
}

.view-title {
  font-size: 1.85rem;
  font-weight: 800;
  margin-bottom: 0.35rem;
  color: var(--color-text);
}

.view-subtitle {
  color: var(--color-muted);
  font-size: 0.95rem;
  max-width: 780px;
  line-height: 1.5;
}

.stats-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}

.stat-card {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 1.25rem;
  margin-bottom: 0;
}

.stat-icon {
  font-size: 2rem;
}

.stat-info {
  display: flex;
  flex-direction: column;
}

.stat-val {
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1;
}

.stat-label {
  font-size: 0.8rem;
  color: var(--color-muted);
  font-weight: 600;
}

.text-success { color: var(--color-success); }
.text-danger { color: var(--color-danger); }
.text-info { color: var(--color-primary); }

.token-alert-card {
  background: #fffbeb;
  border: 2px solid #f59e0b;
  margin-bottom: 1.5rem;
}

.token-alert-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.token-alert-title {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  color: #b45309;
}

.token-alert-warning {
  font-size: 0.9rem;
  color: #78350f;
  margin-bottom: 1rem;
  line-height: 1.5;
}

.token-display-box {
  background: #ffffff;
  border: 1px solid #fde68a;
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 0.75rem;
}

.token-device-label {
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.token-input-group {
  display: flex;
  gap: 0.5rem;
}

.token-field {
  flex: 1;
  font-size: 1.05rem;
  padding: 0.6rem 0.85rem;
  border: 2px dashed #d97706;
  border-radius: 0.4rem;
  background: #fef3c7;
  font-weight: 700;
  color: #78350f;
}

.token-code-preview {
  background: #1e293b;
  color: #f1f5f9;
  padding: 0.75rem 1rem;
  border-radius: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.preview-label {
  font-size: 0.75rem;
  color: #94a3b8;
}

.token-code-preview code {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  color: #38bdf8;
  font-size: 0.85rem;
}

.table-card {
  margin-bottom: 1.5rem;
  padding: 1.5rem;
}

.table-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.table-responsive {
  overflow-x: auto;
}

.devices-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.devices-table th, .devices-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}

.devices-table th {
  background: #f8fafc;
  color: var(--color-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  font-weight: 700;
  letter-spacing: 0.05em;
}

.row-revoked {
  background-color: #fef2f2;
}

.device-cell {
  display: flex;
  flex-direction: column;
}

.badge-channels {
  background: #e2e8f0;
  padding: 0.2rem 0.5rem;
  border-radius: 0.3rem;
  font-size: 0.75rem;
  font-weight: 600;
}

.token-hash-badge {
  font-size: 0.75rem;
  background: #f1f5f9;
  padding: 0.2rem 0.4rem;
  border-radius: 0.25rem;
  border: 1px solid #cbd5e1;
  color: #475569;
}

.badge-status {
  display: inline-block;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  font-size: 0.75rem;
  font-weight: 700;
}

.badge-active {
  background: #dcfce7;
  color: #15803d;
}

.badge-revoked {
  background: #fee2e2;
  color: #b91c1c;
}

.revoked-info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.revoked-reason {
  font-size: 0.7rem;
  color: #991b1b;
  font-style: italic;
}

.tester-card {
  padding: 1.5rem;
}

.section-description {
  font-size: 0.9rem;
  color: var(--color-muted);
  margin-bottom: 1rem;
}

.tester-form {
  display: flex;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.verification-box {
  padding: 1rem;
  border-radius: 0.5rem;
}

.verification-box h4 {
  margin-bottom: 0.35rem;
}

/* Modales */
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 100;
  padding: 1rem;
}

.modal-box {
  width: 100%;
  max-width: 500px;
  background: #ffffff;
  padding: 1.5rem;
  border-radius: 0.75rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2);
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.btn-close {
  background: none;
  border: none;
  font-size: 1.25rem;
  cursor: pointer;
  color: var(--color-muted);
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
.btn-sm { padding: 0.35rem 0.75rem; font-size: 0.85rem; }
.btn-xs { padding: 0.25rem 0.5rem; font-size: 0.75rem; }
.btn-copy { white-space: nowrap; }
.text-center { text-align: center; }
.empty-msg { padding: 2rem; color: var(--color-muted); }
.text-sm { font-size: 0.8rem; }
.text-xs { font-size: 0.75rem; }
.text-muted { color: var(--color-muted); }
</style>
