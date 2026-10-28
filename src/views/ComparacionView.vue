<template>
  <div>
    <!-- Encabezado de la Seccion Comparacion (RF24) -->
    <div class="card" style="margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
        <div>
          <h1 class="card-title" style="margin-bottom: 0.25rem;">Comparacion de Medicion</h1>
          <p style="color: var(--color-muted); font-size: 0.9rem; margin-bottom: 0;">
            Comparacion de medicion de frecuencia cardiaca contra la plantilla de pulso (PPG) normal en reposo y referencia educativa con ECG normal.
          </p>
        </div>
        <span class="badge badge-usuario" style="font-size: 0.8rem;">
          Rama: rf24-plantilla-ppg
        </span>
      </div>
    </div>

    <!-- 1. Cargar o Ingresar Medicion Tomada con el Sensor -->
    <MeasurementSelector
      v-model:bpm="selectedBpm"
      v-model:amplitude="selectedAmplitude"
      v-model:measurementName="selectedMeasurementName"
    />

    <!-- 2. Comparacion de Parametros: Medicion vs Plantilla de Reposo (72 BPM) y ECG -->
    <MetricsCards
      :currentBpm="selectedBpm"
      :currentIntervalMs="currentIntervalMs"
      :measurementName="selectedMeasurementName"
    />

    <!-- RNF01: en el celular en vertical los gráficos se ven pequeños; se sugiere girarlo -->
    <AvisoGirar />

    <!-- 3. Visualizador Osciloscopio con Superposicion Directa (Medicion + Reposo + ECG) -->
    <OscilloscopeCanvas
      :bpm="selectedBpm"
      :amplitude="selectedAmplitude"
      :measurementName="selectedMeasurementName"
    />

    <!-- 4. Tabla y Analisis Comparativo de Parametros con ECG y Reposo (RF24) -->
    <TemplateComparator
      :currentBpm="selectedBpm"
      :lastIntervalMs="currentIntervalMs"
      :amplitude="selectedAmplitude"
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

import AvisoGirar from '../components/AvisoGirar.vue'
import MeasurementSelector from '../components/MeasurementSelector.vue'
import MetricsCards from '../components/MetricsCards.vue'
import OscilloscopeCanvas from '../components/OscilloscopeCanvas.vue'
import TemplateComparator from '../components/TemplateComparator.vue'

// Medicion seleccionada
const selectedBpm = ref(80)
const selectedAmplitude = ref(100)
const selectedMeasurementName = ref('Medicion Tomada')

// Intervalo exacto de la medicion calculada: T = 60000 / BPM (en ms)
const currentIntervalMs = computed(() => {
  return Math.round(60000 / Math.max(30, selectedBpm.value))
})
</script>