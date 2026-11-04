<template>
  <div class="comparador-rango-card card" :class="{ 'card-compact': compacto }">
    <!-- Encabezado de la Tarjeta -->
    <div class="comparador-head">
      <div class="head-title-block">
        <div class="title-with-badge">
          <h3 class="main-title">Comparación con Rango Fisiológico</h3>
          <span 
            v-if="evaluacion.estadoGlobal !== 'sin_datos'" 
            class="estado-pill" 
            :class="evaluacion.dentroDeRango ? 'pill-in' : 'pill-out'"
          >
            {{ evaluacion.etiquetaGlobal }}
          </span>
        </div>
        <p class="sub-title">
          Evaluación cuantitativa y visual de biomarcadores según edad y contexto basal (Guía AHA)
        </p>
      </div>

      <div v-if="paciente" class="context-pill">
        <span class="context-label">Contexto:</span>
        <strong class="context-val">{{ contextoTexto }}</strong>
        <span class="context-sep">·</span>
        <span class="context-edad">{{ paciente.edad || 25 }} años</span>
      </div>
    </div>

    <!-- Banner de Estado General -->
    <div 
      class="status-banner" 
      :class="{
        'status-in': evaluacion.dentroDeRango === true,
        'status-out': evaluacion.dentroDeRango === false,
        'status-idle': evaluacion.estadoGlobal === 'sin_datos'
      }"
    >
      <div class="status-left">
        <div class="status-icon-box">
          <!-- Icono SVG Dentro de Rango -->
          <svg v-if="evaluacion.dentroDeRango === true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
          <!-- Icono SVG Fuera de Rango -->
          <svg v-else-if="evaluacion.dentroDeRango === false" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="12" y1="8" x2="12" y2="12"></line>
            <line x1="12" y1="16" x2="12.01" y2="16"></line>
          </svg>
          <!-- Icono Esperando Datos -->
          <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"></circle>
            <polyline points="12 6 12 12 16 14"></polyline>
          </svg>
        </div>
        <div class="status-text-wrap">
          <strong class="status-title">
            <template v-if="evaluacion.dentroDeRango === true">
              Dentro de Rango Fisiológico de Referencia
            </template>
            <template v-else-if="evaluacion.dentroDeRango === false">
              Fuera de Rango Fisiológico de Referencia
            </template>
            <template v-else>
              En Espera de Bioseñales del Sensor
            </template>
          </strong>
          <p class="status-desc">{{ evaluacion.resumenClinico }}</p>
        </div>
      </div>
    </div>

    <!-- Cuadrícula de Comparación Biométrica: BPM y SpO₂ -->
    <div class="biometric-comp-grid">
      <!-- 1. Métrica: Frecuencia Cardíaca (BPM) -->
      <div class="comp-col-card" :class="{ 'col-out': evaluacion.bpm.valor !== null && !evaluacion.bpm.dentro }">
        <div class="col-head">
          <span class="col-title">Frecuencia Cardíaca</span>
          <span 
            v-if="evaluacion.bpm.valor !== null" 
            class="comp-badge" 
            :class="evaluacion.bpm.dentro ? 'badge-in' : 'badge-out'"
          >
            {{ evaluacion.bpm.dentro ? 'Dentro de Rango' : 'Fuera de Rango' }}
          </span>
        </div>

        <div class="reading-row">
          <div class="current-reading">
            <span class="reading-num font-mono">
              {{ evaluacion.bpm.valor !== null ? evaluacion.bpm.valor.toFixed(1) : '--.-' }}
            </span>
            <span class="reading-unit">BPM</span>
          </div>

          <div class="ref-boundary-box">
            <span class="ref-sub-lbl">Rango Esperado (AHA)</span>
            <span class="ref-boundary-val font-mono">
              {{ evaluacion.rangoAplicado.bpm_min }} – {{ evaluacion.rangoAplicado.bpm_max }} BPM
            </span>
          </div>
        </div>

        <!-- Escala Gráfica Continua de BPM -->
        <div v-if="mostrarEscala" class="scale-wrapper">
          <div class="scale-track track-bpm">
            <div class="track-segment seg-low" title="Bradicardia (<60 BPM)"></div>
            <div class="track-segment seg-normal" title="Normocardia (60-100 BPM)"></div>
            <div class="track-segment seg-high" title="Taquicardia (>100 BPM)"></div>
            <!-- Pin indicador -->
            <div 
              v-if="evaluacion.bpm.valor !== null" 
              class="scale-pin" 
              :style="{ left: evaluacion.bpm.porcentajeEscala + '%' }"
              :title="'Valor: ' + evaluacion.bpm.valor + ' BPM'"
            ></div>
          </div>
          <div class="scale-legend">
            <span>Bradicardia (&lt;{{ evaluacion.rangoAplicado.bpm_min }})</span>
            <span class="legend-center">Normal ({{ evaluacion.rangoAplicado.bpm_min }}-{{ evaluacion.rangoAplicado.bpm_max }})</span>
            <span>Taquicardia (&gt;{{ evaluacion.rangoAplicado.bpm_max }})</span>
          </div>
        </div>

        <div class="eval-note-box">
          <span class="note-bullet">•</span>
          <span class="note-text">{{ evaluacion.bpm.diagnostico }}</span>
        </div>
      </div>

      <!-- 2. Métrica: Saturación de Oxígeno (SpO₂) -->
      <div class="comp-col-card" :class="{ 'col-out': evaluacion.spo2.valor !== null && !evaluacion.spo2.dentro }">
        <div class="col-head">
          <span class="col-title">Saturación de Oxígeno</span>
          <span 
            v-if="evaluacion.spo2.valor !== null" 
            class="comp-badge" 
            :class="evaluacion.spo2.dentro ? 'badge-in' : 'badge-out'"
          >
            {{ evaluacion.spo2.dentro ? 'Dentro de Rango' : 'Fuera de Rango' }}
          </span>
        </div>

        <div class="reading-row">
          <div class="current-reading">
            <span class="reading-num font-mono color-spo2">
              {{ evaluacion.spo2.valor !== null ? evaluacion.spo2.valor.toFixed(1) : '--.-' }}
            </span>
            <span class="reading-unit">% SpO₂</span>
          </div>

          <div class="ref-boundary-box">
            <span class="ref-sub-lbl">Límite Normoxémico</span>
            <span class="ref-boundary-val font-mono">
              ≥ {{ evaluacion.rangoAplicado.spo2_min }}.0 %
            </span>
          </div>
        </div>

        <!-- Escala Gráfica Continua de SpO₂ -->
        <div v-if="mostrarEscala" class="scale-wrapper">
          <div class="scale-track track-spo2">
            <div class="track-segment seg-spo2-sev" title="Hipoxia Severa (<90%)"></div>
            <div class="track-segment seg-spo2-mod" title="Hipoxia Leve (90-94%)"></div>
            <div class="track-segment seg-spo2-ok" title="Normoxemia (≥95%)"></div>
            <!-- Pin indicador -->
            <div 
              v-if="evaluacion.spo2.valor !== null" 
              class="scale-pin" 
              :style="{ left: evaluacion.spo2.porcentajeEscala + '%' }"
              :title="'Valor: ' + evaluacion.spo2.valor + '%'"
            ></div>
          </div>
          <div class="scale-legend">
            <span>Severa (&lt;90%)</span>
            <span class="legend-center">Leve (90-94%)</span>
            <span>Óptima (≥95%)</span>
          </div>
        </div>

        <div class="eval-note-box">
          <span class="note-bullet">•</span>
          <span class="note-text">{{ evaluacion.spo2.diagnostico }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { evaluarComparacionRango } from '../utils/comparacionRangos.js'

const props = defineProps({
  bpm: {
    type: Number,
    default: 0
  },
  spo2: {
    type: Number,
    default: 0
  },
  paciente: {
    type: Object,
    default: null
  },
  rango: {
    type: Object,
    default: null
  },
  compacto: {
    type: Boolean,
    default: false
  },
  mostrarEscala: {
    type: Boolean,
    default: true
  }
})

const contextoTexto = computed(() => {
  if (!props.paciente) return 'Reposo basal'
  return props.paciente.actividadNombre || props.paciente.actividadPrevia || 'Reposo basal'
})

const evaluacion = computed(() => {
  return evaluarComparacionRango({
    bpm: props.bpm,
    spo2: props.spo2 > 0 ? props.spo2 : null,
    rango: props.rango,
    edad: props.paciente?.edad || 25,
    actividad: contextoTexto.value
  })
})
</script>

<style scoped>
.comparador-rango-card {
  padding: 1.25rem 1.5rem;
  margin-bottom: 1.5rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: 0.75rem;
}

.comparador-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 1rem;
}

.title-with-badge {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  flex-wrap: wrap;
}

.main-title {
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.sub-title {
  font-size: 0.85rem;
  color: var(--color-muted);
  margin: 0.2rem 0 0 0;
}

.estado-pill {
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.pill-in {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #86efac;
}

.pill-out {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
}

.context-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  padding: 0.35rem 0.75rem;
  border-radius: 0.5rem;
  font-size: 0.8rem;
  color: #334155;
}

.context-label {
  color: var(--color-muted);
}

.context-val {
  color: #0f172a;
}

.context-sep {
  color: #cbd5e1;
}

.context-edad {
  font-weight: 600;
  color: #1e3a8a;
}

/* Banner de Estado */
.status-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 1.15rem;
  border-radius: 0.5rem;
  margin-bottom: 1.25rem;
  transition: all 0.2s ease;
}

.status-left {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.status-icon-box {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.status-text-wrap {
  display: flex;
  flex-direction: column;
}

.status-title {
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.25;
}

.status-desc {
  font-size: 0.82rem;
  margin: 0.15rem 0 0 0;
  opacity: 0.92;
}

.status-in {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
}

.status-out {
  background: #fff1f2;
  border: 1px solid #fecdd3;
  color: #9f1239;
}

.status-idle {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  color: #475569;
}

/* Cuadrícula de Métricas */
.biometric-comp-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1.25rem;
}

@media (max-width: 768px) {
  .biometric-comp-grid {
    grid-template-columns: 1fr;
  }
}

.comp-col-card {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 0.65rem;
  padding: 1rem 1.15rem;
  transition: border-color 0.15s ease;
}

.comp-col-card.col-out {
  border-color: #fca5a5;
  background: #fffafa;
}

.col-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.col-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.comp-badge {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 4px;
}

.badge-in {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #86efac;
}

.badge-out {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
}

.reading-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 0.85rem;
}

.current-reading {
  display: flex;
  align-items: baseline;
  gap: 0.35rem;
}

.reading-num {
  font-size: 2.15rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1;
}

.reading-num.color-spo2 {
  color: #0284c7;
}

.reading-unit {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-muted);
}

.ref-boundary-box {
  text-align: right;
}

.ref-sub-lbl {
  font-size: 0.7rem;
  color: var(--color-muted);
  display: block;
}

.ref-boundary-val {
  font-size: 0.95rem;
  font-weight: 700;
  color: #1e3a8a;
}

/* Escala Visual Continua */
.scale-wrapper {
  margin-top: 0.5rem;
  margin-bottom: 0.75rem;
}

.scale-track {
  height: 10px;
  background: #e2e8f0;
  border-radius: 5px;
  position: relative;
  display: flex;
  overflow: visible;
}

.track-segment {
  height: 100%;
}

.track-bpm .seg-low { width: 25%; background: #fed7aa; border-radius: 5px 0 0 5px; }
.track-bpm .seg-normal { width: 50%; background: #86efac; }
.track-bpm .seg-high { width: 25%; background: #fca5a5; border-radius: 0 5px 5px 0; }

.track-spo2 .seg-spo2-sev { width: 25%; background: #fca5a5; border-radius: 5px 0 0 5px; }
.track-spo2 .seg-spo2-mod { width: 25%; background: #fde68a; }
.track-spo2 .seg-spo2-ok { width: 50%; background: #86efac; border-radius: 0 5px 5px 0; }

.scale-pin {
  position: absolute;
  top: -4px;
  width: 4px;
  height: 18px;
  background: #0f172a;
  border-radius: 2px;
  transform: translateX(-50%);
  box-shadow: 0 0 0 2px #ffffff;
  transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 2;
}

.scale-legend {
  display: flex;
  justify-content: space-between;
  font-size: 0.68rem;
  color: var(--color-muted);
  margin-top: 0.35rem;
}

.legend-center {
  font-weight: 600;
}

.eval-note-box {
  display: flex;
  align-items: flex-start;
  gap: 0.4rem;
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 0.4rem;
  padding: 0.5rem 0.65rem;
  font-size: 0.78rem;
  color: #334155;
  line-height: 1.35;
}

.note-bullet {
  color: #0284c7;
  font-weight: 800;
  font-size: 0.9rem;
  line-height: 1;
}

.note-text {
  flex: 1;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
