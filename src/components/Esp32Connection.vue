<template>
  <div class="card">
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem; margin-bottom: 0.75rem;">
      <div>
        <h2 style="font-size: 1rem; font-weight: 600; color: var(--color-text);">Conexion Sensor ESP32 (MAX30102)</h2>
        <p style="font-size: 0.8rem; color: var(--color-muted);">Recepcion de senal de pulso por luz para comparar contra la plantilla de reposo (RF24)</p>
      </div>
      <div>
        <span
          class="badge"
          :class="isConnected ? 'badge-profesor' : 'badge-usuario'"
          style="font-size: 0.75rem;"
        >
          {{ isConnected ? ('Conectado: ' + (portInfo || 'ESP32')) : 'Desconectado' }}
        </span>
      </div>
    </div>

    <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; flex-wrap: wrap;">
      <div style="font-size: 0.85rem; color: var(--color-muted);">
        <p style="color: var(--color-text); font-weight: 500;">Conexion por Cable USB (Web Serial a 115200 baudios):</p>
        <p style="font-size: 0.8rem;">Conecta tu ESP32 por USB y presiona el boton para recibir la senal en el osciloscopio.</p>
      </div>

      <div>
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
      </div>
    </div>

    <div v-if="rawLine" style="margin-top: 0.75rem; padding-top: 0.5rem; border-top: 1px solid var(--color-border); font-size: 0.8rem; font-family: monospace; color: var(--color-muted);">
      Ultima trama recibida: <span style="color: var(--color-success); font-weight: bold;">{{ rawLine }}</span>
    </div>

    <div v-if="errorMessage" class="alert alert-error" style="margin-top: 0.75rem; margin-bottom: 0;">
      {{ errorMessage }}
    </div>
  </div>
</template>

<script setup>
defineProps({
  isConnected: { type: Boolean, default: false },
  portInfo: { type: String, default: '' },
  rawLine: { type: String, default: '' },
  errorMessage: { type: String, default: '' }
})

defineEmits(['connectUsb', 'disconnect'])
</script>
