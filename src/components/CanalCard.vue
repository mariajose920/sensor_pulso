<template>
  <div 
    class="canal-card card" 
    :class="{ selected: seleccionado, inactive: !canalData?.activo }"
    @click="$emit('select', canalData.canal)"
  >
    <div class="card-top">
      <span class="canal-badge">Canal {{ canalData.canal }}</span>
      <span class="calidad-badge" :class="'calidad-' + (canalData.calidad || 'buena')">
        {{ canalData.calidad || 'buena' }}
      </span>
    </div>

    <div class="metrics-row">
      <div class="metric">
        <span class="metric-icon">❤️</span>
        <span class="metric-num">{{ canalData.bpm ? canalData.bpm.toFixed(1) : '--' }}</span>
        <span class="metric-unit">BPM</span>
      </div>

      <div class="metric">
        <span class="metric-icon">🫁</span>
        <span class="metric-num">{{ canalData.spo2 ? canalData.spo2.toFixed(1) : '--' }}</span>
        <span class="metric-unit">% SpO₂</span>
      </div>
    </div>

    <div class="card-footer">
      <span v-if="seleccionado" class="selected-indicator">● En osciloscopio</span>
      <span v-else class="select-prompt">Clic para ver onda</span>
    </div>
  </div>
</template>

<script setup>
defineProps({
  canalData: {
    type: Object,
    required: true
  },
  seleccionado: {
    type: Boolean,
    default: false
  }
})

defineEmits(['select'])
</script>

<style scoped>
.canal-card {
  padding: 1rem;
  margin-bottom: 0;
  cursor: pointer;
  transition: all 0.2s ease;
  border: 2px solid var(--color-border);
  background: var(--color-surface);
}

.canal-card:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.canal-card.selected {
  border-color: var(--color-primary);
  background: #f0f7ff;
  box-shadow: 0 0 0 2px rgba(30, 64, 175, 0.2);
}

.canal-card.inactive {
  opacity: 0.6;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.canal-badge {
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--color-text);
}

.calidad-badge {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.15rem 0.45rem;
  border-radius: 9999px;
}

.calidad-buena {
  background: #dcfce7;
  color: #15803d;
}

.calidad-regular {
  background: #fef3c7;
  color: #b45309;
}

.calidad-mala {
  background: #fee2e2;
  color: #b91c1c;
}

.metrics-row {
  display: flex;
  justify-content: space-around;
  margin-bottom: 0.75rem;
}

.metric {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.metric-icon {
  font-size: 1.1rem;
}

.metric-num {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--color-text);
  line-height: 1.1;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

.metric-unit {
  font-size: 0.75rem;
  color: var(--color-muted);
  font-weight: 600;
}

.card-footer {
  text-align: center;
  border-top: 1px dashed var(--color-border);
  padding-top: 0.5rem;
  font-size: 0.75rem;
}

.selected-indicator {
  color: var(--color-primary);
  font-weight: 700;
}

.select-prompt {
  color: var(--color-muted);
}
</style>
