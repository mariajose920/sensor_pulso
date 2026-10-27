<template>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
    <!-- Metrica 1: BPM -->
    <div class="card" style="margin-bottom: 0; padding: 1rem;">
      <div style="font-size: 0.8rem; color: var(--color-muted); font-weight: 500;">Frecuencia Cardiaca Actual</div>
      <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
        <span style="font-size: 1.75rem; font-weight: 700; font-family: monospace; color: var(--color-text);">
          {{ currentBpm }}
        </span>
        <span style="font-size: 0.8rem; color: var(--color-muted);">BPM</span>
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--color-muted); border-top: 1px solid var(--color-border); pt: 0.5rem; display: flex; justify-content: space-between;">
        <span>Plantilla Reposo: <b style="color: var(--color-primary);">72 BPM</b></span>
        <span style="font-weight: 600; font-family: monospace;">{{ diffBpmText }}</span>
      </div>
    </div>

    <!-- Metrica 2: Intervalo -->
    <div class="card" style="margin-bottom: 0; padding: 1rem;">
      <div style="font-size: 0.8rem; color: var(--color-muted); font-weight: 500;">Intervalo entre Latidos</div>
      <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
        <span style="font-size: 1.75rem; font-weight: 700; font-family: monospace; color: var(--color-primary);">
          {{ currentIntervalMs }}
        </span>
        <span style="font-size: 0.8rem; color: var(--color-muted);">ms</span>
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--color-muted); border-top: 1px solid var(--color-border); pt: 0.5rem; display: flex; justify-content: space-between;">
        <span>Plantilla Reposo: <b style="color: var(--color-primary);">833 ms</b></span>
        <span style="font-family: monospace;">{{ diffIntervalText }}</span>
      </div>
    </div>

    <!-- Metrica 3: Comparacion con Reposo -->
    <div class="card" style="margin-bottom: 0; padding: 1rem;">
      <div style="font-size: 0.8rem; color: var(--color-muted); font-weight: 500;">Comparacion con Reposo (RF24)</div>
      <div style="margin-top: 0.5rem;">
        <span
          class="badge"
          :class="currentBpm >= 60 && currentBpm <= 80 ? 'badge-profesor' : 'badge-admin'"
        >
          {{ statusText }}
        </span>
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--color-muted); border-top: 1px solid var(--color-border); pt: 0.5rem;">
        Rango reposo normal: 60 - 80 BPM
      </div>
    </div>

    <!-- Metrica 4: Tipo de Medicion -->
    <div class="card" style="margin-bottom: 0; padding: 1rem;">
      <div style="font-size: 0.8rem; color: var(--color-muted); font-weight: 500;">Principio de Medida</div>
      <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
        <span style="font-size: 1.25rem; font-weight: 700; color: var(--color-success); font-family: monospace;">
          PPG Optica
        </span>
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--color-muted); border-top: 1px solid var(--color-border); pt: 0.5rem; display: flex; justify-content: space-between;">
        <span>Sensor: MAX30102</span>
        <span style="color: var(--color-muted);">Absorcion por luz</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  currentBpm: { type: Number, default: 72 },
  currentIntervalMs: { type: Number, default: 833 }
})

const diffBpm = computed(() => props.currentBpm - 72)
const diffBpmText = computed(() => {
  if (diffBpm.value === 0) return 'Identico al reposo'
  return `${diffBpm.value > 0 ? '+' : ''}${diffBpm.value} BPM`
})

const diffIntervalText = computed(() => {
  const diff = props.currentIntervalMs - 833
  if (diff === 0) return '0 ms'
  return `${diff > 0 ? '+' : ''}${diff} ms`
})

const statusText = computed(() => {
  if (props.currentBpm >= 60 && props.currentBpm <= 80) {
    return 'Ritmo Normal en Reposo'
  } else if (props.currentBpm > 80) {
    return 'Por encima del reposo (Taquicardia)'
  } else {
    return 'Por debajo del reposo (Bradicardia)'
  }
})
</script>
