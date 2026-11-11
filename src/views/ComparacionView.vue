<template>
  <div>
    <!-- Encabezado de la Sección Comparación -->
    <div class="card" style="margin-bottom: 1rem;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.75rem;">
        <div>
          <h1 class="card-title" style="margin-bottom: 0.25rem;">Comparación de Bioseñales Fisiológicas</h1>
          <p style="color: var(--color-muted); font-size: 0.9rem; margin-bottom: 0;">
            Contraste de ondas fotopletismográficas (PPG) de laboratorio contra patrones basales de reposo, catálogo de arritmias y mediciones históricas o comunitarias.
          </p>
        </div>
        <span class="badge badge-usuario" style="font-size: 0.8rem;">
          {{ etiquetaPestaña }}
        </span>
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

        <button
          type="button"
          class="tab-btn"
          :class="{ active: pestañaActiva === 'guardadas' }"
          @click="pestañaActiva = 'guardadas'"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
            <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path>
            <circle cx="9" cy="7" r="4"></circle>
            <path d="M23 21v-2a4 4 0 0 0-3-3.87"></path>
            <path d="M16 3.13a4 4 0 0 1 0 7.75"></path>
          </svg>
          {{ isAuthenticated ? 'Mediciones Propias o Públicas' : 'Mediciones Públicas' }}
        </button>

        <button
          type="button"
          class="tab-btn"
          :class="{ active: pestañaActiva === 'datasets' }"
          @click="pestañaActiva = 'datasets'"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="2" y1="12" x2="22" y2="12"></line>
            <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"></path>
          </svg>
          Datasets Públicos (RF47)
        </button>

        <button
          type="button"
          class="tab-btn"
          :class="{ active: pestañaActiva === 'senales' }"
          @click="pestañaActiva = 'senales'"
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
            <polyline points="17 8 12 3 7 8"></polyline>
            <line x1="12" y1="3" x2="12" y2="15"></line>
          </svg>
          Carga de Señales (RF27)
        </button>
      </div>
    </div>

    <AvisoEducativo />

    <!-- Sincronización Temporal de Bioseñales Comparadas -->
    <SincronizacionSenalesPanel
      v-if="pestañaActiva !== 'senales'"
      :bpmActual="selectedBpm"
      :bpmReferencia="72"
      :amplitudActual="selectedAmplitude"
      :nombreMedicion="selectedMeasurementName"
      nombreReferencia="Señal de Referencia"
    />

    <!-- ===================================================================== -->
    <!-- MODO 3: MEDICIONES PROPIAS O PÚBLICAS (se muestra directo arriba)     -->
    <!-- ===================================================================== -->
    <template v-if="pestañaActiva === 'guardadas'">
      <ComparadorMedicionesCard
        :currentBpm="selectedBpm"
        :lastIntervalMs="currentIntervalMs"
        :amplitude="selectedAmplitude"
        :measurementName="selectedMeasurementName"
      />
    </template>

    <!-- 1. Cargar o Ingresar Medición Tomada con el Sensor (Compartido) -->
    <MeasurementSelector
      v-model:bpm="selectedBpm"
      v-model:amplitude="selectedAmplitude"
      v-model:measurementName="selectedMeasurementName"
    />

    <!-- RNF01: en el celular en vertical los gráficos se ven pequeños; se sugiere girarlo -->
    <AvisoGirar />

    <!-- ===================================================================== -->
    <!-- MODO 1: PLANTILLA NORMAL DE REPOSO                                    -->
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

      <!-- Descargas: informe PDF, CSV e imagen (RF32) -->
      <DescargasPanel
        :bpm="selectedBpm"
        :amplitude="selectedAmplitude"
        :measurementName="selectedMeasurementName"
      />

      <!-- Tabla y Análisis Comparativo de Parámetros con ECG y Reposo -->
      <TemplateComparator
        :currentBpm="selectedBpm"
        :lastIntervalMs="currentIntervalMs"
        :amplitude="selectedAmplitude"
      />
    </template>

    <!-- ===================================================================== -->
    <!-- MODO 2: PATOLOGÍAS Y ARRITMIAS PRECARGADAS PPG + ECG                  -->
    <!-- ===================================================================== -->
    <template v-else-if="pestañaActiva === 'patologias'">
      <ComparadorPatologiasCard
        :currentBpm="selectedBpm"
        :lastIntervalMs="currentIntervalMs"
        :amplitude="selectedAmplitude"
        :measurementName="selectedMeasurementName"
      />
    </template>

    <!-- ===================================================================== -->
    <!-- MODO 4: CONTRASTE CON DATASETS PÚBLICOS INTERNACIONALES (RF47)       -->
    <!-- ===================================================================== -->
    <template v-else-if="pestañaActiva === 'datasets'">
      <ComparadorDatasetsCard
        :currentBpm="selectedBpm"
        :lastIntervalMs="currentIntervalMs"
        :amplitude="selectedAmplitude"
        :measurementName="selectedMeasurementName"
      />
    </template>

    <!-- ===================================================================== -->
    <!-- MODO 5: CARGA DE SEÑALES POR CSV, SIMULADA, DATASET O VALIDADA (RF27) -->
    <!-- ===================================================================== -->
    <template v-else-if="pestañaActiva === 'senales'">
      <CargaSenalesCard
        @seleccionar-senal="onSenalSeleccionada"
        @usar-medicion="onUsarMedicionExterna"
      />
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import AvisoEducativo from '../components/AvisoEducativo.vue'
import SincronizacionSenalesPanel from '../components/SincronizacionSenalesPanel.vue'

import AvisoGirar from '../components/AvisoGirar.vue'
import MeasurementSelector from '../components/MeasurementSelector.vue'
import MetricsCards from '../components/MetricsCards.vue'
import OscilloscopeCanvas from '../components/OscilloscopeCanvas.vue'
import TemplateComparator from '../components/TemplateComparator.vue'
import DescargasPanel from '../components/DescargasPanel.vue'
import ComparadorPatologiasCard from '../components/ComparadorPatologiasCard.vue'
import ComparadorMedicionesCard from '../components/ComparadorMedicionesCard.vue'
import ComparadorDatasetsCard from '../components/ComparadorDatasetsCard.vue'
import CargaSenalesCard from '../components/CargaSenalesCard.vue'

const route = useRoute()

// Pestaña activa: 'guardadas', 'patologias', 'reposo', 'datasets' o 'senales'
const { isAuthenticated } = useAuth()
const pestañaActiva = ref('guardadas')

const etiquetaPestaña = computed(() => {
  if (pestañaActiva.value === 'datasets') return 'Contraste con Datasets Públicos (RF47)'
  if (pestañaActiva.value === 'senales') return 'Carga de Bioseñales Externas (RF27)'
  if (pestañaActiva.value === 'guardadas') return isAuthenticated.value ? 'Comparación Histórica y Pública' : 'Comparación con la Galería Pública'
  if (pestañaActiva.value === 'patologias') return 'Patologías y Arritmias Precargadas'
  return 'Plantilla Normal de Reposo'
})

onMounted(() => {
  if (route.query.modo === 'reposo') {
    pestañaActiva.value = 'reposo'
  } else if (route.query.modo === 'patologias') {
    pestañaActiva.value = 'patologias'
  } else if (route.query.modo === 'guardadas' || route.query.modo === 'propias' || route.query.modo === 'publicas') {
    pestañaActiva.value = 'guardadas'
  } else if (route.query.modo === 'datasets' || route.query.modo === 'dataset' || route.query.modo === 'rf47') {
    pestañaActiva.value = 'datasets'
  } else if (route.query.modo === 'senales' || route.query.modo === 'csv') {
    pestañaActiva.value = 'senales'
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

function onSenalSeleccionada(datos) {
  selectedBpm.value = datos.bpm
  selectedAmplitude.value = datos.amplitude || 100
  selectedMeasurementName.value = datos.nombre || 'Señal Cargada (RF27)'
  pestañaActiva.value = 'reposo'
}

function onUsarMedicionExterna(datos) {
  selectedBpm.value = datos.bpm
  selectedAmplitude.value = datos.amplitude || 100
  selectedMeasurementName.value = datos.nombre || 'Señal Externa (RF27)'
}
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
