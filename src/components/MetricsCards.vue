<template>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
    <!-- Metrica 1: BPM de la Medicion -->
    <div class="card" style="margin-bottom: 0; padding: 1rem;">
      <div style="font-size: 0.8rem; color: var(--color-muted); font-weight: 500;">
        {{ measurementName || 'Medicion Seleccionada' }}
      </div>
      <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
        <span style="font-size: 1.75rem; font-weight: 700; font-family: monospace; color: var(--color-success);">
          {{ currentBpm }}
        </span>
        <span style="font-size: 0.8rem; color: var(--color-muted);">BPM</span>
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--color-muted); border-top: 1px solid var(--color-border); padding-top: 0.5rem; display: flex; justify-content: space-between;">
        <span>Plantilla / ECG: <b style="color: #6366f1;">72 BPM</b></span>
        <span style="font-weight: 600; font-family: monospace;" :style="{ color: diffColor }">{{ diffBpmText }}</span>
      </div>
    </div>

    <!-- Metrica 2: Intervalo de Ciclo -->
    <div class="card" style="margin-bottom: 0; padding: 1rem;">
      <div style="font-size: 0.8rem; color: var(--color-muted); font-weight: 500;">Duracion del Ciclo (Periodo)</div>
      <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
        <span style="font-size: 1.75rem; font-weight: 700; font-family: monospace; color: #0284c7;">
          {{ currentIntervalMs }}
        </span>
        <span style="font-size: 0.8rem; color: var(--color-muted);">ms</span>
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--color-muted); border-top: 1px solid var(--color-border); padding-top: 0.5rem; display: flex; justify-content: space-between;">
        <span>Intervalo R-R ECG: <b style="color: #6366f1;">833 ms</b></span>
        <span style="font-family: monospace;">{{ diffIntervalText }}</span>
      </div>
    </div>

    <!-- Metrica 3: Diagnostico Comparativo (RF24) -->
    <div class="card" style="margin-bottom: 0; padding: 1rem;">
      <div style="font-size: 0.8rem; color: var(--color-muted); font-weight: 500;">Estado Fisiologico (RF24)</div>
      <div style="margin-top: 0.5rem;">
        <span
          class="badge"
          :class="badgeClass"
        >
          {{ statusText }}
        </span>
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--color-muted); border-top: 1px solid var(--color-border); padding-top: 0.5rem;">
        Rango normal reposo: 60 a 80 BPM
      </div>
    </div>

    <!-- Metrica 4: Contraste Biofisico con ECG -->
    <div class="card" style="margin-bottom: 0; padding: 1rem;">
      <div style="font-size: 0.8rem; color: var(--color-muted); font-weight: 500;">Comparacion con ECG</div>
      <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
        <span style="font-size: 1.15rem; font-weight: 700; color: #6366f1; font-family: monospace;">
          Optica vs Electrica
        </span>
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--color-muted); border-top: 1px solid var(--color-border); padding-top: 0.5rem; display: flex; justify-content: space-between;">
        <span>Retardo PTT:</span>
        <span style="color: var(--color-text); font-weight: 600;">~180-220 ms</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  currentBpm: { type: Number, default: 78 },
  currentIntervalMs: { type: Number, default: 769 },
  measurementName: { type: String, default: '' }
})

const diffBpm = computed(() => props.currentBpm - 72)
const diffBpmText = computed(() => {
  if (diffBpm.value === 0) return '0 BPM'
  return `${diffBpm.value > 0 ? '+' : ''}${diffBpm.value} BPM`
})

const diffColor = computed(() => {
  const abs = Math.abs(diffBpm.value)
  if (abs <= 6) return '#16a34a'
  if (abs <= 18) return '#ea580c'
  return '#dc2626'
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

const badgeClass = computed(() => {
  if (props.currentBpm >= 60 && props.currentBpm <= 80) {
    return 'badge-profesor'
  }
  return 'badge-admin'
})
</script>