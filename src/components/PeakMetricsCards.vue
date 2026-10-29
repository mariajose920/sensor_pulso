<template>
  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1.5rem;">
    <!-- Metrica 1: Frecuencia Cardiaca (BPM) (RF17) -->
    <div class="card" style="margin-bottom: 0; padding: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--color-muted); font-weight: 500;">
        <span>Frecuencia Cardiaca</span>
        <span
          style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; transition: transform 0.1s;"
          :style="{ backgroundColor: isBeating ? '#ef4444' : '#94a3b8', transform: isBeating ? 'scale(1.4)' : 'scale(1)' }"
        ></span>
      </div>
      <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
        <span style="font-size: 1.75rem; font-weight: 700; font-family: monospace; color: var(--color-text);">
          {{ currentBpm > 0 ? currentBpm : '--' }}
        </span>
        <span style="font-size: 0.8rem; color: var(--color-muted);">BPM</span>
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--color-muted); border-top: 1px solid var(--color-border); padding-top: 0.5rem; display: flex; justify-content: space-between;">
        <span>Instantaneo: <b style="font-family: monospace; color: var(--color-text);">{{ instantBpm > 0 ? instantBpm : '--' }}</b></span>
        <span>Intervalo: <b style="font-family: monospace; color: var(--color-text);">{{ lastIntervalMs > 0 ? lastIntervalMs + ' ms' : '--' }}</b></span>
      </div>
    </div>

    <!-- Metrica 2: Variabilidad HRV (RMSSD y SDNN) (RF17) -->
    <div class="card" style="margin-bottom: 0; padding: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: var(--color-muted); font-weight: 500;">
        <span>Variabilidad (HRV)</span>
        <span style="font-size: 0.75rem; font-family: monospace; color: var(--color-primary);">RMSSD</span>
      </div>
      <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
        <span style="font-size: 1.75rem; font-weight: 700; font-family: monospace; color: var(--color-primary);">
          {{ rmssd > 0 ? rmssd : '--' }}
        </span>
        <span style="font-size: 0.8rem; color: var(--color-muted);">ms</span>
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--color-muted); border-top: 1px solid var(--color-border); padding-top: 0.5rem; display: flex; justify-content: space-between;">
        <span>SDNN: <b style="font-family: monospace; color: var(--color-text);">{{ sdnn > 0 ? sdnn + ' ms' : '--' }}</b></span>
        <span>Ventana: 15 latidos</span>
      </div>
    </div>

    <!-- Metrica 3: Regularidad del Ritmo (RF17) -->
    <div class="card" style="margin-bottom: 0; padding: 1rem;">
      <div style="font-size: 0.8rem; color: var(--color-muted); font-weight: 500;">Regularidad del Ritmo (RF17)</div>
      <div style="margin-top: 0.5rem;">
        <span
          class="badge"
          :class="badgeClass"
        >
          {{ regularityStatus }}
        </span>
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--color-muted); border-top: 1px solid var(--color-border); padding-top: 0.5rem;">
        Criterio: Coeficiente de variacion
      </div>
    </div>

    <!-- Metrica 4: Picos Detectados y Filtro DC -->
    <div class="card" style="margin-bottom: 0; padding: 1rem;">
      <div style="font-size: 0.8rem; color: var(--color-muted); font-weight: 500;">Picos Sistolicos Detectados</div>
      <div style="display: flex; align-items: baseline; gap: 0.5rem; margin-top: 0.25rem;">
        <span style="font-size: 1.75rem; font-weight: 700; font-family: monospace; color: var(--color-text);">
          {{ totalBeats }}
        </span>
        <span style="font-size: 0.8rem; color: var(--color-muted);">latidos</span>
      </div>
      <div style="margin-top: 0.5rem; font-size: 0.75rem; color: var(--color-muted); border-top: 1px solid var(--color-border); padding-top: 0.5rem; display: flex; justify-content: space-between;">
        <span>Sensor: MAX30102</span>
        <span style="color: var(--color-success); font-weight: 600;">Filtro DC Activo</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  currentBpm: { type: Number, default: 0 },
  instantBpm: { type: Number, default: 0 },
  rmssd: { type: Number, default: 0 },
  sdnn: { type: Number, default: 0 },
  regularityStatus: { type: String, default: 'Esperando latidos...' },
  regularityLevel: { type: String, default: 'normal' },
  isBeating: { type: Boolean, default: false },
  totalBeats: { type: Number, default: 0 },
  lastIntervalMs: { type: Number, default: 0 }
})

const badgeClass = computed(() => {
  if (props.regularityLevel === 'normal') return 'badge-profesor' // verde/amarillo sutil
  if (props.regularityLevel === 'moderate') return 'badge-usuario'
  if (props.regularityLevel === 'irregular') return 'badge-admin' // rojo
  return 'badge-usuario'
})
</script>
