<template>
  <div class="spo2-card-container card" :class="{ 'alerta-hipoxia': esHipoxia }">
    <div class="spo2-card-header">
      <div class="header-title-box">
        <div class="tag-badge">RF114 · Medición de SpO₂ (MAX30102)</div>
        <h3 class="card-main-title">Monitor de Saturación de Oxígeno (SpO₂)</h3>
      </div>

      <div class="channel-indicator-badge">
        <span class="sensor-indicator-dot" :class="{ active: tieneLecturaValida }"></span>
        <span>Canal {{ canal }} · ESP32 (MAX30102)</span>
      </div>
    </div>

    <!-- Banner de Alerta Clínica si hay Hipoxia (<95% o <90%) -->
    <div v-if="esHipoxia" class="banner-alerta-spo2" :class="'banner-' + evaluacionClinica.severidad">
      <div class="banner-icon">⚠️</div>
      <div class="banner-body">
        <strong>{{ evaluacionClinica.etiqueta }}: {{ evaluacionClinica.descripcion }}</strong>
        <p class="banner-action">{{ evaluacionClinica.accionRecomendada }}</p>
      </div>
    </div>

    <div class="spo2-main-grid">
      <!-- Sección Izquierda: Valor Principal Digital y Medidor de Oximetría -->
      <div class="spo2-hero-box">
        <div class="gauge-wrapper">
          <svg class="spo2-circle-gauge" viewBox="0 0 120 120">
            <!-- Círculo de fondo -->
            <circle
              class="gauge-bg"
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke-width="10"
            />
            <!-- Arco de saturación dinámica -->
            <circle
              class="gauge-progress"
              :class="'gauge-' + evaluacionClinica.estado"
              cx="60"
              cy="60"
              r="52"
              fill="none"
              stroke-width="10"
              stroke-dasharray="326.7"
              :stroke-dashoffset="strokeDashOffset"
              transform="rotate(-90 60 60)"
            />
          </svg>

          <div class="gauge-center-icon">
            <span class="oximeter-icon">🫁</span>
          </div>
        </div>

        <div class="spo2-readout-group">
          <div class="spo2-number-display font-mono" :class="'text-' + evaluacionClinica.estado">
            {{ tieneLecturaValida ? spo2Actual.toFixed(1) : '--.-' }}
          </div>
          <div class="spo2-unit-label">
            <span class="unit-text">% SpO₂</span>
            <span class="sub-text">Saturación Arterial de O₂</span>
          </div>
        </div>

        <div class="spo2-status-badge-container">
          <span 
            class="status-pill"
            :class="'pill-' + evaluacionClinica.estado"
          >
            {{ evaluacionClinica.etiqueta }}
          </span>
          <span 
            v-if="tieneLecturaValida"
            class="range-pill"
            :class="spo2Actual >= 95 ? 'in-range' : 'out-of-range'"
          >
            {{ spo2Actual >= 95 ? '✓ Rango Clínico Seguro (≥95%)' : '⚠️ Atención Requerida (<95%)' }}
          </span>
        </div>
      </div>

      <!-- Sección Derecha: Métricas Ópticas y Estadísticas de la Sesión -->
      <div class="spo2-metrics-panel">
        <div class="metric-item card-sub">
          <span class="metric-title">Instantáneo</span>
          <span class="metric-val font-mono">{{ instantSpo2 > 0 ? instantSpo2.toFixed(1) : '--' }} <small>%</small></span>
          <span class="metric-sub">Último paquete WiFi</span>
        </div>

        <div class="metric-item card-sub">
          <span class="metric-title">Promedio Sesión</span>
          <span class="metric-val font-mono">{{ promedioSpo2 > 0 ? promedioSpo2.toFixed(1) : '--' }} <small>%</small></span>
          <span class="metric-sub">{{ totalLecturas }} lecturas registradas</span>
        </div>

        <div class="metric-item card-sub">
          <span class="metric-title">Mínimo / Máximo</span>
          <span class="metric-val font-mono">
            {{ minSpo2 ? minSpo2.toFixed(1) : '--' }} / {{ maxSpo2 ? maxSpo2.toFixed(1) : '--' }} <small>%</small>
          </span>
          <span class="metric-sub">Rango observado</span>
        </div>

        <div class="metric-item card-sub">
          <span class="metric-title">Índice Perfusión (PI)</span>
          <span class="metric-val font-mono text-cyan">
            {{ perfusionIndex > 0 ? perfusionIndex.toFixed(2) : '--' }} <small>%</small>
          </span>
          <span class="metric-sub">Fuerza de señal arterial</span>
        </div>

        <div class="metric-item card-sub">
          <span class="metric-title">Razón de Razones (R)</span>
          <span class="metric-val font-mono text-indigo">{{ ratioR > 0 ? ratioR.toFixed(3) : '--' }}</span>
          <span class="metric-sub">Ratio AC/DC (Red/IR)</span>
        </div>

        <div class="metric-item card-sub">
          <span class="metric-title">Fórmula Calibración</span>
          <span class="metric-val font-mono text-muted" style="font-size: 0.9rem;">110 - 25·R</span>
          <span class="metric-sub">Curva Maxim MAX30102</span>
        </div>
      </div>
    </div>

    <!-- Panel Desplegable: Fundamentos Biofotónicos del Sensor MAX30102 (RF22 / RF115) -->
    <div class="biofotonica-expander">
      <button 
        type="button" 
        class="expander-toggle-btn"
        @click="mostrarExplicacion = !mostrarExplicacion"
      >
        <span class="toggle-icon">{{ mostrarExplicacion ? '▼' : '►' }}</span>
        <span>🔬 Fundamento Biofotónico del Sensor MAX30102 (Luz Roja 660 nm vs Infrarroja 880 nm)</span>
      </button>

      <div v-if="mostrarExplicacion" class="biofotonica-body">
        <div class="biofotonica-grid">
          <div class="wavelength-card red-wavelength">
            <div class="wl-header">
              <span class="wl-dot red-dot"></span>
              <strong>LED Rojo (λ = 660 nm)</strong>
            </div>
            <p class="wl-text">
              La <strong>Desoxihemoglobina (Hb)</strong> absorbe sustancialmente más luz roja (660 nm) que la oxihemoglobina.
            </p>
            <div class="absorption-bar-wrapper">
              <span class="bar-label">Absorción Hb:</span>
              <div class="bar-track"><div class="bar-fill fill-red" style="width: 82%;"></div></div>
            </div>
          </div>

          <div class="wavelength-card ir-wavelength">
            <div class="wl-header">
              <span class="wl-dot ir-dot"></span>
              <strong>LED Infrarrojo (λ = 880 - 940 nm)</strong>
            </div>
            <p class="wl-text">
              La <strong>Oxihemoglobina (HbO₂)</strong> absorbe más luz infrarroja (880-940 nm), permitiendo cuantificar la saturación mediante el cociente:
            </p>
            <div class="formula-inline font-mono">
              R = (AC<sub>660</sub> / DC<sub>660</sub>) / (AC<sub>880</sub> / DC<sub>880</sub>)
            </div>
          </div>
        </div>

        <div class="calibracion-info">
          <span>💡 <strong>Curva clínica del MAX30102:</strong> Para un paciente sano con SpO₂ ~ 98%, la razón <code>R ≈ 0.48</code>. Si la sangre se desoxigena (SpO₂ baja a 85%), <code>R</code> sube hacia <code>1.00</code>.</span>
        </div>
      </div>
    </div>

    <!-- Barra Inferior de Diagnóstico y Estado del Sensor -->
    <div class="spo2-footer-bar">
      <div class="footer-col">
        <span class="footer-lbl">Estado clínico de oxigenación:</span>
        <span class="footer-val font-mono">
          {{ evaluacionClinica.descripcion }}
        </span>
      </div>

      <div class="footer-col">
        <span class="footer-lbl">Calidad de perfusión periférica:</span>
        <div class="perfusion-box">
          <span class="perfusion-dot" :class="'perfusion-' + calidadPerfusion"></span>
          <span class="footer-val">{{ descripcionPerfusion }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  esSpo2Valido,
  evaluarEstadoSpo2,
  calcularRDesdeSpo2,
  calcularIndicePerfusion
} from '../services/spo2Service'

const props = defineProps({
  canal: {
    type: Number,
    default: 1
  },
  spo2: {
    type: Number,
    default: 0
  },
  instantSpo2: {
    type: Number,
    default: 0
  },
  promedioSpo2: {
    type: Number,
    default: 0
  },
  minSpo2: {
    type: Number,
    default: null
  },
  maxSpo2: {
    type: Number,
    default: null
  },
  totalLecturas: {
    type: Number,
    default: 0
  },
  ratioR: {
    type: Number,
    default: 0.48
  },
  perfusionIndex: {
    type: Number,
    default: 3.2
  }
})

const mostrarExplicacion = ref(false)

const tieneLecturaValida = computed(() => {
  return esSpo2Valido(props.spo2) && props.spo2 > 0
})

const spo2Actual = computed(() => {
  return tieneLecturaValida.value ? props.spo2 : 0
})

const evaluacionClinica = computed(() => {
  return evaluarEstadoSpo2(spo2Actual.value)
})

const esHipoxia = computed(() => {
  return tieneLecturaValida.value && spo2Actual.value < 95
})

const infoPerf = computed(() => {
  return calcularIndicePerfusion(props.perfusionIndex * 100, 10000)
})

const calidadPerfusion = computed(() => infoPerf.value.calidad)
const descripcionPerfusion = computed(() => infoPerf.value.descripcion)

/**
 * Cálculo del arco del medidor circular (perímetro = 2 * PI * r = 2 * 3.14159 * 52 ≈ 326.7)
 * Mapeamos el rango fisiológico de interés (70% a 100%)
 */
const strokeDashOffset = computed(() => {
  const perimetro = 326.7
  if (!tieneLecturaValida.value) return perimetro // Vacío

  const minMostrado = 70.0
  const maxMostrado = 100.0
  const norm = Math.max(0, Math.min(1, (spo2Actual.value - minMostrado) / (maxMostrado - minMostrado)))
  return perimetro * (1 - norm)
})
</script>

<style scoped>
.spo2-card-container {
  padding: 1.25rem;
  margin-bottom: 1.5rem;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 12px;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
  transition: all 0.25s ease;
}

.spo2-card-container.alerta-hipoxia {
  border-color: #f59e0b;
  box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.15);
}

.spo2-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  padding-bottom: 0.75rem;
  margin-bottom: 1rem;
}

.tag-badge {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #0284c7;
  background: #e0f2fe;
  padding: 0.2rem 0.55rem;
  border-radius: 6px;
  margin-bottom: 0.25rem;
}

.card-main-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: var(--color-text, #1e293b);
}

.channel-indicator-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  font-weight: 600;
  padding: 0.3rem 0.75rem;
  border-radius: 20px;
  background: #f1f5f9;
  color: #475569;
}

.sensor-indicator-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #94a3b8;
}

.sensor-indicator-dot.active {
  background: #0284c7;
  box-shadow: 0 0 8px #0284c7;
}

/* Banner de Alerta Clínica */
.banner-alerta-spo2 {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border-radius: 8px;
  margin-bottom: 1rem;
  font-size: 0.85rem;
}

.banner-warning {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}

.banner-danger {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.banner-icon {
  font-size: 1.25rem;
  line-height: 1;
}

.banner-action {
  margin: 0.25rem 0 0 0;
  font-size: 0.8rem;
  opacity: 0.9;
}

/* Grid Principal */
.spo2-main-grid {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 1.5rem;
  align-items: center;
  margin-bottom: 1.25rem;
}

@media (max-width: 860px) {
  .spo2-main-grid {
    grid-template-columns: 1fr;
    text-align: center;
  }
}

/* Hero Box */
.spo2-hero-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: linear-gradient(180deg, #f8fafc 0%, #f0f9ff 100%);
  border: 1px solid #e0f2fe;
  border-radius: 12px;
}

.gauge-wrapper {
  position: relative;
  width: 100px;
  height: 100px;
  margin-bottom: 0.5rem;
}

.spo2-circle-gauge {
  width: 100%;
  height: 100%;
}

.gauge-bg {
  stroke: #e2e8f0;
}

.gauge-progress {
  transition: stroke-dashoffset 0.5s ease, stroke 0.3s ease;
  stroke-linecap: round;
}

.gauge-normal {
  stroke: #0284c7;
}

.gauge-hipoxia_leve {
  stroke: #f59e0b;
}

.gauge-hipoxia_moderada, .gauge-hipoxia_severa {
  stroke: #ef4444;
}

.gauge-center-icon {
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-size: 1.75rem;
}

.spo2-readout-group {
  display: flex;
  flex-direction: column;
  align-items: center;
  margin-bottom: 0.5rem;
}

.spo2-number-display {
  font-size: 2.8rem;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.04em;
  color: #0369a1;
}

.spo2-number-display.text-hipoxia_leve {
  color: #d97706;
}

.spo2-number-display.text-hipoxia_moderada, .spo2-number-display.text-hipoxia_severa {
  color: #dc2626;
}

.spo2-unit-label {
  display: flex;
  flex-direction: column;
  align-items: center;
}

.unit-text {
  font-size: 1rem;
  font-weight: 700;
  color: #0369a1;
}

.sub-text {
  font-size: 0.72rem;
  color: #64748b;
}

.spo2-status-badge-container {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  align-items: center;
  width: 100%;
}

.status-pill {
  font-size: 0.78rem;
  font-weight: 700;
  padding: 0.25rem 0.75rem;
  border-radius: 999px;
  text-align: center;
  width: 90%;
}

.pill-normal {
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.pill-hipoxia_leve {
  background: #fef3c7;
  color: #b45309;
  border: 1px solid #fde68a;
}

.pill-hipoxia_moderada, .pill-hipoxia_severa {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.pill-invalido {
  background: #f1f5f9;
  color: #64748b;
  border: 1px solid #cbd5e1;
}

.range-pill {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
}

.range-pill.in-range {
  background: #ecfdf5;
  color: #047857;
}

.range-pill.out-of-range {
  background: #fffbeb;
  color: #b45309;
}

/* Métricas Sub */
.spo2-metrics-panel {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 0.75rem;
}

.metric-item {
  padding: 0.75rem;
  border-radius: 8px;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.metric-title {
  font-size: 0.72rem;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 0.2rem;
}

.metric-val {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
}

.metric-val small {
  font-size: 0.75rem;
  font-weight: 500;
  color: #64748b;
}

.metric-sub {
  font-size: 0.68rem;
  color: #94a3b8;
  margin-top: 0.15rem;
}

.text-cyan {
  color: #0284c7;
}

.text-indigo {
  color: #4f46e5;
}

/* Panel Desplegable Biofotónica */
.biofotonica-expander {
  margin-top: 1rem;
  border-top: 1px dashed #e2e8f0;
  padding-top: 0.75rem;
}

.expander-toggle-btn {
  background: transparent;
  border: none;
  font-size: 0.82rem;
  font-weight: 600;
  color: #0284c7;
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.5rem;
  border-radius: 6px;
  transition: background 0.15s ease;
}

.expander-toggle-btn:hover {
  background: #f0f9ff;
}

.toggle-icon {
  font-size: 0.7rem;
}

.biofotonica-body {
  margin-top: 0.75rem;
  padding: 1rem;
  background: #f8fafc;
  border-radius: 8px;
  border: 1px solid #e2e8f0;
}

.biofotonica-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  margin-bottom: 0.75rem;
}

@media (max-width: 680px) {
  .biofotonica-grid {
    grid-template-columns: 1fr;
  }
}

.wavelength-card {
  padding: 0.75rem;
  border-radius: 8px;
  font-size: 0.8rem;
}

.red-wavelength {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.ir-wavelength {
  background: #f5f3ff;
  border: 1px solid #ddd6fe;
  color: #5b21b6;
}

.wl-header {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.35rem;
}

.wl-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
}

.red-dot {
  background: #ef4444;
}

.ir-dot {
  background: #8b5cf6;
}

.wl-text {
  margin: 0 0 0.5rem 0;
  line-height: 1.4;
}

.absorption-bar-wrapper {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.72rem;
}

.bar-track {
  flex: 1;
  height: 6px;
  background: #fee2e2;
  border-radius: 3px;
  overflow: hidden;
}

.bar-fill.fill-red {
  height: 100%;
  background: #ef4444;
}

.formula-inline {
  background: #ede9fe;
  padding: 0.25rem 0.5rem;
  border-radius: 4px;
  font-size: 0.75rem;
  display: inline-block;
}

.calibracion-info {
  font-size: 0.78rem;
  color: #475569;
  line-height: 1.4;
  padding: 0.5rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 6px;
}

/* Footer Bar */
.spo2-footer-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  margin-top: 1rem;
  padding-top: 0.75rem;
  border-top: 1px solid #f1f5f9;
  font-size: 0.8rem;
}

.footer-col {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.footer-lbl {
  font-size: 0.72rem;
  color: #64748b;
}

.footer-val {
  font-weight: 600;
  color: #1e293b;
}

.perfusion-box {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.perfusion-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
}

.perfusion-optima {
  background: #10b981;
}

.perfusion-aceptable {
  background: #0284c7;
}

.perfusion-baja {
  background: #f59e0b;
}
</style>
