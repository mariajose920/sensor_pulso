<template>
  <div class="card">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
      <div>
        <h2 style="font-size: 1rem; font-weight: 600; color: var(--color-text); margin-bottom: 0.15rem;">Conexion Sensor ESP32 (MAX30100 / MAX30102)</h2>
        <p style="font-size: 0.8rem; color: var(--color-muted); margin-bottom: 0;">Recepcion de senal de pulso por luz para deteccion de picos, BPM y HRV (RF17)</p>
      </div>
      <div>
        <span
          class="badge"
          :class="badgeClass"
          style="font-size: 0.75rem;"
        >
          {{ statusLabel }}
        </span>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
      <div style="font-size: 0.85rem; color: var(--color-muted);">
        <p v-if="isWifiConnected" style="color: var(--color-success); font-weight: 600;">
          📶 Transmisión activa por WiFi en tiempo real desde {{ wifiDevice }}.
        </p>
        <p v-else style="color: var(--color-text); font-weight: 500;">
          Conexión por WiFi o Cable USB (Web Serial):
        </p>
        <p style="font-size: 0.8rem;">
          {{ isWifiConnected ? 'Las lecturas de pulsación y variabilidad se sincronizan por telemetría inalámbrica.' : 'Recibe señales automáticamente por WiFi al encender el sensor, o conéctalo por cable USB.' }}
        </p>
      </div>

      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center;">
        <span v-if="isWifiConnected" class="badge badge-success" style="padding: 0.45rem 0.8rem; font-size: 0.85rem; background: #dcfce7; color: #166534; border: 1px solid #86efac; font-weight: 600;">
          ● WiFi En Vivo
        </span>

        <button
          v-if="!isConnected && !isWifiConnected"
          @click="$emit('connectUsb')"
          class="btn btn-primary"
        >
          Conectar ESP32 por USB
        </button>
        <button
          v-else-if="isConnected"
          @click="$emit('disconnect')"
          class="btn"
          style="background-color: var(--color-danger); color: white;"
        >
          Desconectar Sensor USB
        </button>

        <button
          v-if="!isConnected && !isWifiConnected"
          @click="$emit('toggleSim')"
          class="btn btn-secondary"
        >
          {{ isSimulating ? 'Detener Simulador' : 'Probar con Simulador' }}
        </button>
      </div>
    </div>

    <div v-if="rawLine && isConnected" style="margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid var(--color-border); font-size: 0.8rem; font-family: monospace; color: var(--color-muted);">
      Ultima trama recibida por USB: <span style="color: var(--color-success); font-weight: bold;">{{ rawLine }}</span>
    </div>

    <div v-if="errorMessage" class="alert alert-error" style="margin-top: 0.75rem; margin-bottom: 0;">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  isConnected: { type: Boolean, default: false },
  isSimulating: { type: Boolean, default: false },
  isWifiConnected: { type: Boolean, default: false },
  wifiDevice: { type: String, default: 'ESP32' },
  portInfo: { type: String, default: '' },
  rawLine: { type: String, default: '' },
  errorMessage: { type: String, default: '' }
})

defineEmits(['connectUsb', 'disconnect', 'toggleSim'])

const statusLabel = computed(() => {
  if (props.isConnected) return 'Conectado USB: ' + (props.portInfo || 'ESP32')
  if (props.isWifiConnected) return 'Conectado WiFi: ' + (props.wifiDevice || 'ESP32')
  if (props.isSimulating) return 'Simulador Activo (Prueba RF17)'
  return 'Esperando Conexión'
})

const badgeClass = computed(() => {
  if (props.isConnected || props.isWifiConnected) return 'badge-profesor'
  if (props.isSimulating) return 'badge-usuario'
  return 'badge-secondary'
})
</script>
