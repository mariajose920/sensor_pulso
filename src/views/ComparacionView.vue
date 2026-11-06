<template>
  <div>
    <!-- Encabezado de la Sección Comparación (RF24 y RF25) -->
    <div class="card" style="margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem;">
        <div>
          <h1 class="card-title" style="margin-bottom: 0.25rem;">Comparación de Bioseñales Fisiológicas</h1>
          <p style="color: var(--color-muted); font-size: 0.9rem; margin-bottom: 0;">
            Contraste de ondas fotopletismográficas (PPG) de laboratorio contra patrones basales de reposo y biblioteca de arritmias con correlación electrocardiográfica (ECG).
          </p>
        </div>
      </div>

      <!-- Navegación por Pestañas de Comparación -->
      <div class="comparacion-tabs">
        <button
          type="button"
          class="tab-btn"
          :class="{ active: pestañaActiva === 'reposo' }"
          @click="pestañaActiva = 'reposo'"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
          Plantilla Normal de Reposo
        </button>

        <button
          type="button"
          class="tab-btn"
          :class="{ active: pestañaActiva === 'patologias' }"
          @click="pestañaActiva = 'patologias'"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
            <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          Patologías y Arritmias Precargadas
        </button>
      </div>
    </div>

    <!-- 1. Cargar o Ingresar Medición Tomada con el Sensor (Compartido) -->
    <MeasurementSelector
      v-model:bpm="selectedBpm"
      v-model:amplitude="selectedAmplitude"
      v-model:measurementName="selectedMeasurementName"
    />

    <!-- RNF01: en el celular en vertical los gráficos se ven pequeños; se sugiere girarlo -->
    <AvisoGirar />

    <!-- ===================================================================== -->
    <!-- MODO 1: PLANTILLA NORMAL DE REPOSO (RF24)                             -->
    <!-- ===================================================================== -->
    <template v-if="pestañaActiva === 'reposo'">
      <!-- Comparación de Parámetros: Medición vs Plantilla de Reposo (72 BPM) y ECG -->
      <MetricsCards
        :currentBpm="selectedBpm"
        :currentIntervalMs="currentIntervalMs"
        :measurementName="selectedMeasurementName"
      />

      <!-- Visualizador Osciloscopio con Superposición Directa (Medición + Reposo + ECG) -->
      <OscilloscopeCanvas
        :bpm="selectedBpm"
        :amplitude="selectedAmplitude"
        :measurementName="selectedMeasurementName"
      />

      <!-- Tabla y Análisis Comparativo de Parámetros con ECG y Reposo (RF24) -->
      <TemplateComparator
        :currentBpm="selectedBpm"
        :lastIntervalMs="currentIntervalMs"
        :amplitude="selectedAmplitude"
      />
    </template>

    <!-- ===================================================================== -->
    <!-- MODO 2: PATOLOGÍAS Y ARRITMIAS PRECARGADAS PPG + ECG (RF25)           -->
    <!-- ===================================================================== -->
    <template v-else-if="pestañaActiva === 'patologias'">
      <ComparadorPatologiasCard
        :currentBpm="selectedBpm"
        :lastIntervalMs="currentIntervalMs"
        :amplitude="selectedAmplitude"
        :measurementName="selectedMeasurementName"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'

import AvisoGirar from '../components/AvisoGirar.vue'
import MeasurementSelector from '../components/MeasurementSelector.vue'
import MetricsCards from '../components/MetricsCards.vue'
import OscilloscopeCanvas from '../components/OscilloscopeCanvas.vue'
import TemplateComparator from '../components/TemplateComparator.vue'
import ComparadorPatologiasCard from '../components/ComparadorPatologiasCard.vue'

const route = useRoute()

// Pestaña activa: 'patologias' (RF25) o 'reposo' (RF24)
const pestañaActiva = ref('patologias')

onMounted(() => {
  if (route.query.modo === 'reposo') {
    pestañaActiva.value = 'reposo'
  } else if (route.query.modo === 'patologias') {
    pestañaActiva.value = 'patologias'
  }
})

// Medición seleccionada
const selectedBpm = ref(78)
const selectedAmplitude = ref(100)
const selectedMeasurementName = ref('Medición Tomada')

// Intervalo exacto de la medición calculada: T = 60000 / BPM (en ms)
const currentIntervalMs = computed(() => {
  return Math.round(60000 / Math.max(30, selectedBpm.value))
})
</script>

<style scoped>
.comparacion-tabs {
  display: flex;
  gap: 0.5rem;
  margin-top: 1rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.25rem;
  flex-wrap: wrap;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.55rem 1rem;
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--color-muted);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border-radius: 0.35rem 0.35rem 0 0;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: var(--color-text);
  background: #f8fafc;
}

.tab-btn.active {
  color: #1e40af;
  border-bottom-color: #2563eb;
  background: #eff6ff;
}
</style>
