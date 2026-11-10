<template>
  <div class="spo2-grafico" data-testid="grafico-spo2" :style="{ '--s': tono }">
    <div class="spo2-cab">
      <span>SpO₂ en el tiempo ({{ RANGO_SPO2.min }}–{{ RANGO_SPO2.max }} %)</span>
      <strong data-testid="spo2-actual">{{ t.actual !== null ? `${t.actual} %` : 'sin lectura' }}</strong>
    </div>
    <div class="spo2-lienzo">
      <svg
        :viewBox="`0 0 ${ANCHO} ${ALTO}`"
        preserveAspectRatio="none"
        role="img"
        :aria-label="`SpO₂ del canal ${canal} en el tiempo, eje de ${RANGO_SPO2.min} a ${RANGO_SPO2.max} por ciento. ${t.hayDatos ? (t.actual !== null ? 'Valor actual ' + t.actual + ' por ciento.' : 'Sin lectura en este momento.') : 'Aún sin lecturas.'}`"
      >
        <polyline
          v-for="(s, i) in t.segmentos"
          :key="i"
          :points="s"
          fill="none"
          :stroke="tono"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
      </svg>
      <span class="eje alto" aria-hidden="true">{{ RANGO_SPO2.max }}</span>
      <span class="eje bajo" aria-hidden="true">{{ RANGO_SPO2.min }}</span>
    </div>
    <p v-if="!t.hayDatos" class="spo2-vacio">Sin lecturas de SpO₂ todavía.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { trazarSpo2, RANGO_SPO2 } from '../utils/graficasCanales.js'

const props = defineProps({
  canal: { type: Number, required: true },
  /** SpO₂ por muestra (null = sin lectura) */
  spo2: { type: Array, default: () => [] },
  tono: { type: String, default: '#fb7185' }
})
const ANCHO = 600
const ALTO = 60
const t = computed(() => trazarSpo2(props.spo2, ANCHO, ALTO))
</script>

<style scoped>
.spo2-grafico { margin-top: 0.5rem; }
.spo2-cab { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.75rem; color: #94a3b8; }
.spo2-cab strong { color: #f1f5f9; }
.spo2-lienzo { position: relative; height: 60px; margin-top: 0.2rem; background: #0b101a; border: 1px solid #1e293b; border-radius: 0.4rem; }
.spo2-lienzo svg { display: block; width: 100%; height: 100%; }
.eje { position: absolute; left: 4px; font-size: 0.6rem; color: #64748b; }
.eje.alto { top: 2px; }
.eje.bajo { bottom: 2px; }
.spo2-vacio { margin: 0.2rem 0 0; font-size: 0.72rem; color: #94a3b8; }
</style>
