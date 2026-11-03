<template>
  <span class="calidad-wrap">
    <span
      class="calidad-chip"
      :class="'calidad-chip-' + nivel"
      role="status"
      :aria-label="`Calidad de la señal: ${texto}${causa ? '. ' + causa : ''}`"
      :title="causa || `Calidad de la señal: ${texto}`"
    >
      <span aria-hidden="true">{{ icono }}</span>
      {{ texto }}
    </span>
    <small v-if="mostrarCausa && causa" class="calidad-causa">{{ causa }}</small>
  </span>
</template>

<script setup>
import { computed } from 'vue'

// RF15: el color nunca va solo; siempre lleva ícono y texto.
const props = defineProps({
  nivel: { type: String, default: 'sin_senal' }, // buena | regular | mala | sin_senal
  causas: { type: Array, default: () => [] },     // [{ tipo, nivel, texto }] de evaluarCalidad
  mostrarCausa: { type: Boolean, default: false }
})

const ICONOS = { buena: '✅', regular: '⚠️', mala: '⛔', sin_senal: '…' }
const TEXTOS = { buena: 'Buena', regular: 'Regular', mala: 'Mala', sin_senal: 'Sin señal' }

const icono = computed(() => ICONOS[props.nivel] || ICONOS.sin_senal)
const texto = computed(() => TEXTOS[props.nivel] || TEXTOS.sin_senal)
const causa = computed(() => props.causas[0]?.texto || '')
</script>

<style scoped>
.calidad-wrap { display: inline-flex; flex-direction: column; gap: 0.2rem; align-items: flex-start; }
.calidad-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid transparent;
  white-space: nowrap;
}
.calidad-chip-buena { background: #dcfce7; color: #15803d; border-color: #86efac; }
.calidad-chip-regular { background: #fef3c7; color: #b45309; border-color: #fcd34d; }
.calidad-chip-mala { background: #fee2e2; color: #b91c1c; border-color: #fca5a5; }
.calidad-chip-sin_senal { background: #f1f5f9; color: #475569; border-color: #cbd5e1; }
.calidad-causa { font-size: 0.7rem; color: var(--color-muted, #64748b); max-width: 16rem; line-height: 1.25; }
</style>
