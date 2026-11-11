<template>
  <div class="anon-preview-wrapper" data-testid="vista-previa-anonimizacion-panel">
    <!-- Banda superior informativa -->
    <div class="anon-top-banner">
      Tus datos biomédicos se anonimizan automáticamente antes de ser compartidos en la Galería Comunitaria
    </div>

    <!-- Grilla de 2 columnas: Transformación de Privacidad + Vista Previa Exacta -->
    <div class="anon-two-cols">
      <!-- Columna 1: Transformación de Privacidad -->
      <div class="anon-col-card" data-testid="columna-transformacion-privacidad">
        <h3 class="anon-col-title">1. Transformación de Privacidad</h3>
        <p class="anon-col-subtitle">
          Antes de publicar en la Galería Comunitaria, el sistema elimina tu identidad y conserva solo los valores biomédicos:
        </p>

        <div class="anon-transform-list">
          <div
            v-for="fila in filasTransformacion"
            :key="fila.clave"
            class="anon-transform-row"
            :data-testid="`fila-privacidad-${fila.clave}`"
          >
            <div class="anon-orig-text">{{ fila.etiquetaOriginal }}</div>
            <div class="anon-arrow" aria-hidden="true">→</div>
            <div class="anon-dest-wrap">
              <span
                class="anon-status-pill"
                :class="fila.tipoBadge === 'warning' ? 'pill-amber' : 'pill-red'"
              >
                {{ fila.estadoBadge }}
              </span>
              <span v-if="fila.valorPublico" class="anon-dest-value">
                {{ fila.valorPublico }}
              </span>
            </div>
          </div>
        </div>
      </div>

      <!-- Columna 2: Vista Previa Exacta antes de Confirmar -->
      <div class="anon-col-card" data-testid="columna-tarjeta-vista-previa">
        <h3 class="anon-col-title">2. Vista Previa Exacta antes de Confirmar</h3>
        <p class="anon-col-subtitle">
          Vista previa de la tarjeta pública (esto es todo lo que verá cualquier persona):
        </p>

        <!-- Tarjeta Pública Simulada con los datos reales tomados -->
        <div class="public-card-preview" data-testid="tarjeta-vista-previa-publica">
          <div class="preview-badge-row">
            <span class="preview-anon-badge">{{ tarjeta.insignia }}</span>
            <span v-if="tituloPersonalizado && tituloPersonalizado.trim()" class="preview-custom-title-tag">
              {{ tituloPersonalizado.trim() }}
            </span>
          </div>

          <div class="preview-author-title">
            Autor: {{ tarjeta.autor }}
          </div>

          <div class="preview-meta-line">
            Rango de edad: {{ tarjeta.rangoEdad }} · Actividad: {{ tarjeta.actividad }} · Calidad: {{ tarjeta.calidad }}
          </div>

          <div class="preview-metrics-pills">
            <span class="metric-pill">Pulso: <strong>{{ tarjeta.bpmTexto }}</strong></span>
            <span class="metric-pill">SpO2: <strong>{{ tarjeta.spo2Texto }}</strong></span>
            <span class="metric-pill">Ritmo: <strong>{{ tarjeta.ritmoTexto }}</strong></span>
          </div>

          <!-- Curva PPG de la medición -->
          <div class="preview-ppg-box" aria-label="Curva fotopletismográfica de la medición">
            <svg
              :viewBox="`0 0 ${curvaPpg.ancho} ${curvaPpg.alto}`"
              preserveAspectRatio="none"
              class="preview-ppg-svg"
            >
              <defs>
                <linearGradient :id="gradId" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#10b981" stop-opacity="0.28" />
                  <stop offset="100%" stop-color="#10b981" stop-opacity="0.02" />
                </linearGradient>
              </defs>
              <path :d="curvaPpg.area" :fill="`url(#${gradId})`" />
              <path
                :d="curvaPpg.linea"
                fill="none"
                stroke="#10b981"
                stroke-width="2"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
          </div>
        </div>

        <!-- Aviso de revisión de la vista previa -->
        <div class="anon-review-notice">
          <svg class="notice-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <div>
            <span>Revisa la vista previa superior. Ningún dato personal ni tu nombre aparecerán asociados a este registro.</span>
            <span class="anon-excluidos-note">
              Se publica sin nombre ni datos identificables (no se publica: {{ excluidosTexto }}).
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  vistaPreviaPublica,
  construirTransformacionPrivacidad,
  generarCurvaPpgVistaPrevia
} from '../utils/terminarMedicion.js'

const props = defineProps({
  registro: {
    type: Object,
    default: () => ({ resumen: {}, datos: {} })
  },
  nombrePrivado: {
    type: String,
    default: ''
  },
  correoPrivado: {
    type: String,
    default: ''
  },
  edadPrivada: {
    type: [Number, String],
    default: null
  },
  declaracionId: {
    type: String,
    default: null
  },
  rangoEdadOverride: {
    type: String,
    default: ''
  },
  tituloPersonalizado: {
    type: String,
    default: ''
  }
})

const gradId = `ppg-grad-${Math.random().toString(36).slice(2, 8)}`

const vista = computed(() => vistaPreviaPublica(props.registro))

const tarjeta = computed(() => {
  const base = vista.value.tarjeta
  if (props.rangoEdadOverride) {
    return { ...base, rangoEdad: props.rangoEdadOverride }
  }
  return base
})

const excluidosTexto = computed(() => (vista.value.excluidos || []).join(', '))

const filasTransformacion = computed(() => {
  const edadEfectiva = props.edadPrivada ?? props.registro?.datos?.edad ?? null
  const nombreEfectivo = props.nombrePrivado || props.registro?.resumen?.paciente || ''
  const declaracionEfectiva = props.declaracionId || props.registro?.datos?.declaracionId || null
  return construirTransformacionPrivacidad({
    nombre: nombreEfectivo,
    correo: props.correoPrivado,
    edad: edadEfectiva,
    declaracionId: declaracionEfectiva
  })
})

const curvaPpg = computed(() => {
  const bpm = props.registro?.resumen?.bpm || props.registro?.datos?.bpm || 74
  return generarCurvaPpgVistaPrevia(bpm)
})
</script>

<style scoped>
.anon-preview-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
  margin: 0.5rem 0;
}

.anon-top-banner {
  background: #dbeafe;
  border: 1px solid #bfdbfe;
  color: #1e3a8a;
  font-size: 0.875rem;
  font-weight: 600;
  text-align: center;
  padding: 0.55rem 1rem;
  border-radius: 0.5rem;
}

.anon-two-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
  align-items: stretch;
}

.anon-col-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.65rem;
  padding: 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  box-shadow: 0 1px 3px rgba(15, 23, 42, 0.04);
}

.anon-col-title {
  margin: 0 0 0.35rem 0;
  font-size: 1.02rem;
  font-weight: 700;
  color: #0f172a;
}

.anon-col-subtitle {
  margin: 0 0 0.85rem 0;
  font-size: 0.82rem;
  color: #475569;
  line-height: 1.45;
}

.anon-transform-list {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  flex: 1;
}

.anon-transform-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 0.55rem;
  padding: 0.55rem 0.65rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.5rem;
}

.anon-orig-text {
  font-size: 0.83rem;
  font-weight: 600;
  color: #1e293b;
  word-break: break-word;
}

.anon-arrow {
  color: #64748b;
  font-weight: 700;
  font-size: 0.95rem;
}

.anon-dest-wrap {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0.2rem;
  text-align: right;
}

.anon-status-pill {
  display: inline-block;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  line-height: 1.25;
}

.pill-red {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
}

.pill-amber {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
}

.anon-dest-value {
  font-size: 0.77rem;
  font-weight: 600;
  color: #334155;
}

/* Tarjeta pública simulada (columna derecha) */
.public-card-preview {
  background: #ffffff;
  border: 1.5px solid #cbd5e1;
  border-radius: 0.6rem;
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.45rem;
}

.preview-badge-row {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.preview-anon-badge {
  display: inline-block;
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #1e293b;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.18rem 0.6rem;
  border-radius: 999px;
}

.preview-custom-title-tag {
  display: inline-block;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1d4ed8;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.18rem 0.65rem;
  border-radius: 999px;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.preview-author-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #0f172a;
}

.preview-meta-line {
  font-size: 0.8rem;
  color: #475569;
}

.preview-metrics-pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
  margin-top: 0.2rem;
}

.metric-pill {
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  color: #1e293b;
  font-size: 0.8rem;
  padding: 0.25rem 0.65rem;
  border-radius: 999px;
}

.preview-ppg-box {
  margin-top: 0.25rem;
  height: 54px;
  width: 100%;
  background: #f8fafc;
  border-radius: 0.4rem;
  overflow: hidden;
  border: 1px solid #e2e8f0;
}

.preview-ppg-svg {
  width: 100%;
  height: 100%;
  display: block;
}

.anon-review-notice {
  margin-top: 0.75rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
  display: flex;
  align-items: flex-start;
  gap: 0.55rem;
  font-size: 0.79rem;
  color: #1e3a8a;
  line-height: 1.4;
}

.notice-icon {
  flex-shrink: 0;
  margin-top: 0.1rem;
  color: #2563eb;
}

.anon-excluidos-note {
  display: block;
  margin-top: 0.2rem;
  font-size: 0.74rem;
  color: #475569;
}

@media (max-width: 768px) {
  .anon-two-cols {
    grid-template-columns: 1fr;
  }
  .anon-transform-row {
    grid-template-columns: 1fr;
    gap: 0.3rem;
  }
  .anon-arrow {
    display: none;
  }
  .anon-dest-wrap {
    align-items: flex-start;
    text-align: left;
  }
}
</style>
