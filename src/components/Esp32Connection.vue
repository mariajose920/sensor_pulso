<template>
  <div class="card">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem; margin-bottom: 0.75rem; flex-wrap: wrap; gap: 0.5rem;">
      <div>
        <h2 style="font-size: 1rem; font-weight: 600; color: var(--color-text); margin-bottom: 0.15rem;">Conexion Sensor ESP32 (MAX30102)</h2>
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
        <p style="color: var(--color-text); font-weight: 500;">Conexion por Cable USB (Web Serial a 115200 baudios):</p>
        <p style="font-size: 0.8rem;">Conecta tu ESP32 por USB y presiona el boton para iniciar la medicion y analisis en vivo.</p>
      </div>

      <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button
          v-if="!isConnected"
          @click="$emit('connectUsb')"
          class="btn btn-primary"
        >
          Conectar ESP32 por USB
        </button>
        <button
          v-else
          @click="$emit('disconnect')"
          class="btn"
          style="background-color: var(--color-danger); color: white;"
        >
          Desconectar Sensor
        </button>

        <button
          v-if="!isConnected"
          @click="$emit('toggleSim')"
          class="btn btn-secondary"
        >
          {{ isSimulating ? 'Detener Simulador' : 'Probar con Simulador' }}
        </button>
      </div>
    </div>

    <div v-if="rawLine && isConnected" style="margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid var(--color-border); font-size: 0.8rem; font-family: monospace; color: var(--color-muted);">
      Ultima trama recibida del sensor: <span style="color: var(--color-success); font-weight: bold;">{{ rawLine }}</span>
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
  portInfo: { type: String, default: '' },
  rawLine: { type: String, default: '' },
  errorMessage: { type: String, default: '' }
})

defineEmits(['connectUsb', 'disconnect', 'toggleSim'])

const statusLabel = computed(() => {
  if (props.isConnected) return 'Conectado: ' + (props.portInfo || 'ESP32')
  if (props.isSimulating) return 'Simulador Activo (Prueba RF17)'
  return 'Desconectado'
})

const badgeClass = computed(() => {
  if (props.isConnected) return 'badge-profesor'
  if (props.isSimulating) return 'badge-usuario'
  return 'badge-secondary'
})
</script>