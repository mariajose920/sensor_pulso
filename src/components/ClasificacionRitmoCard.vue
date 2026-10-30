<template>
  <div class="card clasificacion-ritmo-container" style="margin-bottom: 1.5rem; padding: 1.25rem;">
    <!-- Encabezado de la Sección (RF18) -->
    <div class="clasificacion-header">
      <div>
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <h2 class="card-title" style="margin: 0; font-size: 1.15rem;">
            Clasificación del Ritmo Cardíaco (RF18)
          </h2>
          <span class="badge badge-subtle font-mono" style="font-size: 0.72rem;">
            AHA & Mayo Clinic
          </span>
        </div>
        <p style="color: var(--color-muted); font-size: 0.85rem; margin-top: 0.25rem; margin-bottom: 0;">
          Diagnóstico de ritmo en tiempo real (Normal, Taquicardia, Bradicardia o Irregular) y justificación fisiológica fundamentada.
        </p>
      </div>

      <button
        type="button"
        class="btn btn-secondary btn-sm"
        style="font-size: 0.75rem; padding: 0.25rem 0.65rem;"
        @click="mostrarGuiaCompleta = !mostrarGuiaCompleta"
      >
        {{ mostrarGuiaCompleta ? 'Ocultar Criterios Médicos' : 'Ver Criterios Médicos (AHA)' }}
      </button>
    </div>

    <!-- 1. Estado Activo de la Medición en Vivo -->
    <div
      class="ritmo-banner"
      :style="{
        backgroundColor: clasificacion.bgHex,
        borderColor: clasificacion.bordeHex
      }"
    >
      <div class="ritmo-banner-top">
        <div class="ritmo-badge-grupo">
          <span
            class="punto-estado"
            :style="{ backgroundColor: clasificacion.colorHex }"
          ></span>
          <span class="ritmo-titulo" :style="{ color: clasificacion.colorHex }">
            {{ clasificacion.nombre }}
          </span>
          <span
            class="badge font-mono"
            :class="clasificacion.badgeClass"
            style="font-size: 0.75rem;"
          >
            {{ clasificacion.rangoBpm }}
          </span>
        </div>

        <div v-if="clasificacion.bpm > 0" class="ritmo-valores-rapidos">
          <span>FC: <strong>{{ clasificacion.bpm }} BPM</strong></span>
          <span v-if="clasificacion.sdnn > 0">SDNN: <strong>{{ clasificacion.sdnn }} ms</strong></span>
          <span v-if="clasificacion.lastIntervalMs > 0">R-R: <strong>{{ clasificacion.lastIntervalMs }} ms</strong></span>
        </div>
      </div>

      <!-- Criterio Numérico -->
      <p class="ritmo-criterio-texto" :style="{ color: clasificacion.colorHex }">
        {{ clasificacion.criterioNumerico }}
      </p>

      <!-- Explicación del "Porqué" (Requerimiento central RF18) -->
      <div v-if="clasificacion.id !== 'sin_datos'" class="porque-caja">
        <div class="porque-titulo">
          <span>¿Por qué se clasifica así? (Fundamento Clínico):</span>
        </div>
        <p class="porque-texto">
          {{ clasificacion.explicacionPorque }}
        </p>

        <!-- Correlación con Factores de la Ficha del Paciente (RF03) -->
        <div v-if="clasificacion.correlacionFactores && clasificacion.correlacionFactores.length > 0" class="factores-correlacion-box">
          <span class="factores-titulo">Influencia de Factores Declarados en Ficha (RF03):</span>
          <ul class="factores-lista">
            <li v-for="(factor, idx) in clasificacion.correlacionFactores" :key="idx">
              {{ factor }}
            </li>
          </ul>
        </div>

        <!-- Cita oficial de la fuente médica -->
        <div class="fuente-cita">
          <span>Fuente médica oficial:</span>
          <a
            :href="clasificacion.enlaceFuente"
            target="_blank"
            rel="noopener noreferrer"
            class="fuente-link"
          >
            {{ clasificacion.fuenteOficial }} ↗
          </a>
        </div>
      </div>
    </div>

    <!-- 2. Guía Educativa Desplegable de los 4 Ritmos (AHA / Mayo Clinic) -->
    <div v-if="mostrarGuiaCompleta" class="guia-clinica-card">
      <div class="guia-tabs">
        <button
          v-for="(ritmo, key) in GUIA_RITMOS_CLINICOS"
          :key="key"
          type="button"
          class="guia-tab-btn"
          :class="{ active: tabSeleccionada === key }"
          @click="tabSeleccionada = key"
        >
          {{ ritmo.nombre.split(' ')[0] }} {{ ritmo.nombre.includes('Normal') ? 'Normal' : '' }}
        </button>
      </div>

      <div class="guia-contenido" v-if="ritmoSeleccionado">
        <div style="display: flex; justify-content: space-between; align-items: baseline; flex-wrap: wrap; gap: 0.5rem; margin-bottom: 0.5rem;">
          <h4 style="margin: 0; font-size: 0.95rem; font-weight: 700; color: #0f172a;">
            {{ ritmoSeleccionado.nombre }}
          </h4>
          <span class="badge font-mono" :class="ritmoSeleccionado.badgeClass" style="font-size: 0.72rem;">
            {{ ritmoSeleccionado.rangoBpm }}
          </span>
        </div>

        <p style="font-size: 0.825rem; color: #334155; margin-bottom: 0.5rem; line-height: 1.45;">
          <strong>Criterio diagnóstico:</strong> {{ ritmoSeleccionado.criterioResumen }}
        </p>

        <p style="font-size: 0.825rem; color: #475569; margin-bottom: 0.65rem; line-height: 1.45;">
          <strong>Mecanismo electrofisiológico:</strong> {{ ritmoSeleccionado.descripcionMecanismo }}
        </p>

        <div style="border-top: 1px dashed #cbd5e1; padding-top: 0.5rem; font-size: 0.75rem; color: #64748b; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
          <span>Referencia: {{ ritmoSeleccionado.fuenteOficial }}</span>
          <a :href="ritmoSeleccionado.enlaceFuente" target="_blank" rel="noopener noreferrer" style="color: #2563eb; text-decoration: underline;">
            Consultar guía clínica ↗
          </a>
        </div>
      </div>
    </div>

    <!-- Aviso pedagógico -->
    <div style="margin-top: 0.75rem; font-size: 0.72rem; color: #94a3b8; text-align: right;">
      <span>Herramienta didáctica de laboratorio universitario — Validación de ritmo basada en fotopletismografía (PPG) a 100 Hz.</span>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { clasificarRitmo, GUIA_RITMOS_CLINICOS } from '../services/ritmoService.js'

const props = defineProps({
  bpm: { type: Number, default: 0 },
  instantBpm: { type: Number, default: 0 },
  sdnn: { type: Number, default: 0 },
  rmssd: { type: Number, default: 0 },
  lastIntervalMs: { type: Number, default: 0 },
  regularityLevel: { type: String, default: 'normal' },
  totalBeats: { type: Number, default: 0 },
  paciente: { type: Object, default: null }
})

const mostrarGuiaCompleta = ref(false)
const tabSeleccionada = ref('normal')

const clasificacion = computed(() => {
  return clasificarRitmo({
    bpm: props.bpm,
    instantBpm: props.instantBpm,
    sdnn: props.sdnn,
    rmssd: props.rmssd,
    lastIntervalMs: props.lastIntervalMs,
    regularityLevel: props.regularityLevel,
    totalBeats: props.totalBeats,
    paciente: props.paciente
  })
})

const ritmoSeleccionado = computed(() => {
  return GUIA_RITMOS_CLINICOS[tabSeleccionada.value] || GUIA_RITMOS_CLINICOS.normal
})
</script>

<style scoped>
.clasificacion-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.ritmo-banner {
  border: 1px solid;
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
  transition: all 0.3s ease;
}

.ritmo-banner-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}

.ritmo-badge-grupo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.punto-estado {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
  animation: pulsePoint 2s infinite ease-in-out;
}

@keyframes pulsePoint {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(0.85); }
}

.ritmo-titulo {
  font-size: 1.05rem;
  font-weight: 700;
}

.ritmo-valores-rapidos {
  font-size: 0.78rem;
  color: #475569;
  display: flex;
  gap: 0.75rem;
}

.ritmo-criterio-texto {
  font-size: 0.85rem;
  margin: 0.35rem 0 0.75rem 0;
  line-height: 1.45;
  font-weight: 500;
}

.porque-caja {
  background: rgba(255, 255, 255, 0.95);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 0.4rem;
  padding: 0.75rem 1rem;
  margin-top: 0.5rem;
}

.porque-titulo {
  font-size: 0.8rem;
  font-weight: 700;
  color: #1e3a8a;
  margin-bottom: 0.35rem;
}

.porque-texto {
  font-size: 0.825rem;
  color: #1e293b;
  margin: 0;
  line-height: 1.5;
}

.factores-correlacion-box {
  margin-top: 0.6rem;
  padding-top: 0.5rem;
  border-top: 1px dashed #cbd5e1;
}

.factores-titulo {
  display: block;
  font-size: 0.75rem;
  font-weight: 700;
  color: #92400e;
  margin-bottom: 0.25rem;
}

.factores-lista {
  margin: 0;
  padding-left: 1.25rem;
  font-size: 0.78rem;
  color: #78350f;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.fuente-cita {
  margin-top: 0.6rem;
  padding-top: 0.45rem;
  border-top: 1px solid rgba(0, 0, 0, 0.05);
  font-size: 0.74rem;
  color: #64748b;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.fuente-link {
  color: #2563eb;
  font-weight: 500;
  text-decoration: underline;
}

.guia-clinica-card {
  margin-top: 1rem;
  border: 1px solid #e2e8f0;
  background: #f8fafc;
  border-radius: 0.5rem;
  overflow: hidden;
}

.guia-tabs {
  display: flex;
  background: #f1f5f9;
  border-bottom: 1px solid #e2e8f0;
  overflow-x: auto;
}

.guia-tab-btn {
  flex: 1;
  background: transparent;
  border: none;
  border-bottom: 2px solid transparent;
  padding: 0.55rem 0.75rem;
  font-size: 0.78rem;
  font-weight: 600;
  color: #64748b;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.2s;
}

.guia-tab-btn:hover {
  color: #0f172a;
}

.guia-tab-btn.active {
  background: #ffffff;
  color: #2563eb;
  border-bottom-color: #2563eb;
}

.guia-contenido {
  padding: 0.85rem 1rem;
  background: #ffffff;
}

.badge-purple {
  background: #f3e8ff;
  color: #7e22ce;
  border: 1px solid #d8b4fe;
}
</style>
