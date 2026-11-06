<template>
  <div class="comparador-rango-card card" :class="{ 'card-compact': compacto }">
    <!-- Encabezado Unificado y Limpio -->
    <div class="comparador-head">
      <div class="head-title-block">
        <div class="title-with-badge">
          <h3 class="main-title">Evaluación de Rangos Fisiológicos</h3>
          <span 
            v-if="evaluacion.estadoGlobal !== 'sin_datos'" 
            class="estado-pill" 
            :class="evaluacion.dentroDeRango ? 'pill-in' : 'pill-out'"
          >
            {{ resumenPillTexto }}
          </span>
          <span v-else class="estado-pill pill-idle">
            En espera de bioseñales
          </span>
        </div>
        <p class="sub-title">
          Guía AHA · Evaluación cuantitativa según edad y contexto basal
        </p>
      </div>

      <div v-if="paciente" class="context-pill">
        <span class="context-label">Contexto:</span>
        <strong class="context-val">{{ contextoTexto }}</strong>
        <span class="context-sep">·</span>
        <span class="context-edad">{{ paciente.edad || 25 }} años</span>
      </div>
    </div>

    <!-- Lista de Biomarcadores en Filas Horizontales Compactas -->
    <div class="biometric-rows-container">
      <!-- Fila 1: Frecuencia Cardíaca (BPM) -->
      <div class="metric-row-item" :class="{ 'row-out': evaluacion.bpm.valor !== null && !evaluacion.bpm.dentro }">
        <div class="metric-info-col">
          <div class="metric-title-line">
            <span class="metric-name">Frecuencia Cardíaca</span>
            <span 
              v-if="evaluacion.bpm.valor !== null" 
              class="metric-diff-chip" 
              :class="evaluacion.bpm.dentro ? 'chip-in' : 'chip-out'"
            >
              {{ chipBpmTexto }}
            </span>
          </div>
          <div class="metric-reading-line">
            <span class="metric-num-wrap">
              <strong class="metric-num font-mono">{{ evaluacion.bpm.valor !== null ? Math.round(evaluacion.bpm.valor) : '--' }}</strong>
              <small class="metric-unit">BPM</small>
            </span>
            <span class="metric-expected">Esperado: {{ evaluacion.rangoAplicado.bpm_min }} - {{ evaluacion.rangoAplicado.bpm_max }} BPM</span>
          </div>
        </div>

        <!-- Escala Gráfica Continua (BPM) -->
        <div v-if="mostrarEscala" class="metric-gauge-col">
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
            >
              <span class="pin-tip font-mono">{{ Math.round(evaluacion.bpm.valor) }}</span>
            </div>
          </div>
          <div class="scale-legend">
            <span>Bradicardia (&lt;{{ evaluacion.rangoAplicado.bpm_min }})</span>
            <span class="legend-center">Normal ({{ evaluacion.rangoAplicado.bpm_min }}-{{ evaluacion.rangoAplicado.bpm_max }})</span>
            <span>Taquicardia (&gt;{{ evaluacion.rangoAplicado.bpm_max }})</span>
          </div>
        </div>
      </div>

      <!-- Fila 2: Saturación de Oxígeno (SpO2) -->
      <div class="metric-row-item" :class="{ 'row-out': evaluacion.spo2.valor !== null && !evaluacion.spo2.dentro }">
        <div class="metric-info-col">
          <div class="metric-title-line">
            <span class="metric-name">Saturación de Oxígeno</span>
            <span 
              v-if="evaluacion.spo2.valor !== null" 
              class="metric-diff-chip" 
              :class="evaluacion.spo2.dentro ? 'chip-in' : 'chip-out'"
            >
              {{ chipSpo2Texto }}
            </span>
          </div>
          <div class="metric-reading-line">
            <span class="metric-num-wrap">
              <strong class="metric-num font-mono color-spo2">{{ evaluacion.spo2.valor !== null ? Math.round(evaluacion.spo2.valor) : '--' }}</strong>
              <small class="metric-unit">% SpO₂</small>
            </span>
            <span class="metric-expected">Límite normoxémico: &ge; {{ evaluacion.rangoAplicado.spo2_min }}%</span>
          </div>
        </div>

        <!-- Escala Gráfica Continua (SpO2) -->
        <div v-if="mostrarEscala" class="metric-gauge-col">
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
            >
              <span class="pin-tip font-mono">{{ Math.round(evaluacion.spo2.valor) }}%</span>
            </div>
          </div>
          <div class="scale-legend">
            <span>Severa (&lt;90%)</span>
            <span class="legend-center">Leve (90-94%)</span>
            <span>Óptima (&ge;95%)</span>
          </div>
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

const resumenPillTexto = computed(() => {
  if (evaluacion.value.dentroDeRango) {
    return 'Dentro de Rango Fisiológico'
  }
  const fueraBpm = evaluacion.value.bpm.valor !== null && !evaluacion.value.bpm.dentro
  const fueraSpo2 = evaluacion.value.spo2.valor !== null && !evaluacion.value.spo2.dentro
  const totalFuera = (fueraBpm ? 1 : 0) + (fueraSpo2 ? 1 : 0)
  if (totalFuera === 1) {
    return '1 Biomarcador Fuera de Rango'
  }
  if (totalFuera > 1) {
    return '2 Biomarcadores Fuera de Rango'
  }
  return 'Fuera de Rango'
})

const chipBpmTexto = computed(() => {
  const b = evaluacion.value.bpm
  if (b.dentro) return 'Dentro del rango'
  if (b.estado === 'bajo') {
    return `${Math.abs(b.diferencia)} BPM bajo límite`
  }
  if (b.estado === 'alto') {
    return `+${b.diferencia} BPM sobre límite`
  }
  return 'Fuera de rango'
})

const chipSpo2Texto = computed(() => {
  const s = evaluacion.value.spo2
  if (s.dentro) return 'Normoxemia óptima'
  if (s.estado === 'leve') return 'Hipoxia leve'
  if (s.estado === 'severa') return 'Hipoxia severa'
  return 'Fuera de rango'
})
</script>

<style scoped>
.comparador-rango-card {
  padding: 1rem 1.25rem;
  margin-bottom: 0;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.card-compact {
  padding: 0.75rem 1rem;
}

.comparador-head {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 0.75rem;
  margin-bottom: 0.9rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px solid var(--color-border);
}

.title-with-badge {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.main-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.sub-title {
  font-size: 0.8rem;
  color: var(--color-muted);
  margin: 0.15rem 0 0 0;
}

.estado-pill {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  letter-spacing: 0.02em;
}

.pill-in {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #86efac;
}

.pill-out {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.pill-idle {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.context-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  padding: 0.25rem 0.65rem;
  border-radius: 0.5rem;
  font-size: 0.78rem;
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

/* Filas de Biomarcadores */
.biometric-rows-container {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.metric-row-item {
  display: grid;
  grid-template-columns: 240px 1fr;
  align-items: center;
  gap: 1.25rem;
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  padding: 0.75rem 1rem;
  transition: all 0.15s ease;
}

.metric-row-item.row-out {
  background: #fffafa;
  border-color: #fecaca;
}

.metric-info-col {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
}

.metric-title-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.metric-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text);
}

.metric-diff-chip {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.12rem 0.45rem;
  border-radius: 4px;
}

.chip-in {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #86efac;
}

.chip-out {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
}

.metric-reading-line {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.metric-num-wrap {
  display: inline-flex;
  align-items: baseline;
  gap: 0.2rem;
}

.metric-num {
  font-size: 1.35rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1;
}

.metric-num.color-spo2 {
  color: #0284c7;
}

.metric-unit {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-muted);
}

.metric-expected {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 500;
}

/* Escala Gráfica Continua */
.metric-gauge-col {
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.scale-track {
  height: 9px;
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
  top: -5px;
  width: 4px;
  height: 19px;
  background: #0f172a;
  border-radius: 2px;
  transform: translateX(-50%);
  box-shadow: 0 0 0 2px #ffffff;
  transition: left 0.3s cubic-bezier(0.4, 0, 0.2, 1);
  z-index: 2;
}

.pin-tip {
  position: absolute;
  bottom: 22px;
  left: 50%;
  transform: translateX(-50%);
  background: #0f172a;
  color: #ffffff;
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.1rem 0.35rem;
  border-radius: 3px;
  white-space: nowrap;
  pointer-events: none;
}

.pin-tip::after {
  content: '';
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translateX(-50%);
  border-width: 3px;
  border-style: solid;
  border-color: #0f172a transparent transparent transparent;
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

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}

@media (max-width: 768px) {
  .metric-row-item {
    grid-template-columns: 1fr;
    gap: 0.85rem;
  }
}
</style>
