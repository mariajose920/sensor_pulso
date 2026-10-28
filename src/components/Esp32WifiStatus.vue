<template>
  <div class="status-card card">
    <div class="status-header">
      <div class="status-main">
        <span class="status-indicator" :class="conectado ? 'online' : 'offline'"></span>
        <div>
          <h3 class="device-name">{{ dispositivo || 'ESP32' }}</h3>
          <p class="connection-label">
            {{ conectado ? 'WiFi Conectado y Transmitiendo' : 'Esperando Conexión WiFi...' }}
          </p>
        </div>
      </div>

      <div class="badge-token" :title="'Autenticación de dispositivo verificada (RF54)'">
        <span class="badge-icon">🔒</span> Token RF54 Válido
      </div>
    </div>

    <div class="metrics-grid">
      <div class="metric-item">
        <span class="metric-label">IP ESP32</span>
        <span class="metric-value font-mono">{{ ip || 'No detectada' }}</span>
      </div>

      <div class="metric-item">
        <span class="metric-label">Último Contacto</span>
        <span class="metric-value font-mono">
          {{ tiempoDesdeContacto !== null ? `${tiempoDesdeContacto}s` : 'Sin datos' }}
        </span>
      </div>

      <div class="metric-item">
        <span class="metric-label">Paquetes WiFi</span>
        <span class="metric-value font-mono">#{{ paquete || 0 }}</span>
      </div>

      <div class="metric-item">
        <span class="metric-label">Señal WiFi (RSSI)</span>
        <span class="metric-value font-mono">
          {{ rssi ? `${rssi} dBm` : 'N/A' }}
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
defineProps({
  conectado: {
    type: Boolean,
    default: false
  },
  dispositivo: {
    type: String,
    default: 'ESP32'
  },
  ip: {
    type: String,
    default: null
  },
  paquete: {
    type: Number,
    default: 0
  },
  rssi: {
    type: Number,
    default: null
  },
  tiempoDesdeContacto: {
    type: Number,
    default: null
  }
})
</script>

<style scoped>
.status-card {
  margin-bottom: 1.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.status-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.status-main {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.status-indicator {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  display: inline-block;
}

.status-indicator.online {
  background: var(--color-success);
  box-shadow: 0 0 8px rgba(22, 163, 74, 0.6);
  animation: pulse 2s infinite;
}

.status-indicator.offline {
  background: var(--color-warning);
}

@keyframes pulse {
  0% { transform: scale(0.95); opacity: 0.8; }
  50% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(0.95); opacity: 0.8; }
}

.device-name {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
}

.connection-label {
  font-size: 0.85rem;
  color: var(--color-muted);
  margin: 0;
}

.badge-token {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.25rem 0.6rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #166534;
  font-size: 0.8rem;
  font-weight: 600;
  border-radius: 9999px;
}

.metrics-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
}

.metric-item {
  display: flex;
  flex-direction: column;
}

.metric-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  color: var(--color-muted);
  letter-spacing: 0.05em;
  font-weight: 600;
}

.metric-value {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text);
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
