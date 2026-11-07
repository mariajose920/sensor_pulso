<template>
  <div class="comparador-datasets-card card">
    <!-- Encabezado de la Sección de Contraste con Datasets Públicos (RF47) -->
    <div class="card-head-bar">
      <div>
        <div class="head-badge-row">
          <span class="badge-rf47">RF47 · BENCHMARK BIOMÉDICO</span>
          <span class="badge-acreditado">Repositorios Internacionales Acreditados</span>
        </div>
        <h3 class="card-title">
          Contraste con Datasets Públicos Internacionales
        </h3>
        <p class="card-desc">
          Contrasta en tiempo real la forma de onda PPG y biomarcadores de tu medición frente a registros clínicos de referencia mundial (PhysioNet BIDMC, CapnoBase TBME, MIT MIMIC-III, WESAD y VitalDB).
        </p>
      </div>

      <!-- Selector de Modo de Visualización (Superpuesto vs Carriles) -->
      <div class="view-mode-buttons">
        <button
          type="button"
          class="btn btn-sm"
          :class="modoVisualizacion === 'superpuesto' ? 'btn-primary' : 'btn-secondary'"
          @click="modoVisualizacion = 'superpuesto'"
        >
          Vista Superpuesta
        </button>
        <button
          type="button"
          class="btn btn-sm"
          :class="modoVisualizacion === 'carriles' ? 'btn-primary' : 'btn-secondary'"
          @click="modoVisualizacion = 'carriles'"
        >
          Carriles Paralelos
        </button>
      </div>
    </div>

    <!-- 1. Filtros por Categoría de Dataset -->
    <div class="category-filters-bar">
      <div class="filters-group">
        <span class="filter-lbl">Categoría:</span>
        <button
          type="button"
          class="cat-chip"
          :class="{ active: categoriaFiltro === 'todas' }"
          @click="categoriaFiltro = 'todas'"
        >
          Todos ({{ datasetsCatalogo.length }})
        </button>
        <button
          type="button"
          class="cat-chip"
          :class="{ active: categoriaFiltro === 'cuidados_criticos' }"
          @click="categoriaFiltro = 'cuidados_criticos'"
        >
          UCI / Cuidados Críticos
        </button>
        <button
          type="button"
          class="cat-chip"
          :class="{ active: categoriaFiltro === 'oximetria_calibrada' }"
          @click="categoriaFiltro = 'oximetria_calibrada'"
        >
          Oximetría Calibrada
        </button>
        <button
          type="button"
          class="cat-chip"
          :class="{ active: categoriaFiltro === 'tono_autonomico' }"
          @click="categoriaFiltro = 'tono_autonomico'"
        >
          Estrés y Tono Autonómico
        </button>
      </div>
    </div>

    <!-- 2. Cuadrícula de Datasets Públicos Seleccionables -->
    <div class="datasets-grid">
      <div
        v-for="ds in datasetsFiltrados"
        :key="ds.id"
        class="dataset-card"
        :class="{ selected: ds.id === datasetSeleccionadoId }"
        @click="seleccionarDataset(ds.id)"
        role="button"
        tabindex="0"
        @keydown.enter="seleccionarDataset(ds.id)"
      >
        <div class="ds-card-top">
          <span class="ds-codigo font-mono">{{ ds.codigo }}</span>
          <span class="ds-licencia">{{ ds.licencia.split('(')[0].trim() }}</span>
        </div>

        <h4 class="ds-title">{{ ds.titulo }}</h4>

        <div class="ds-meta-sub">
          <span>{{ ds.institucion.split('/')[0].trim() }}</span>
          <span class="meta-dot">·</span>
          <span>Sujeto {{ ds.edadSujeto }} años</span>
        </div>

        <div class="ds-metrics-strip">
          <div class="ds-metric-box">
            <span class="ds-val font-mono">{{ ds.bpmReferencia.toFixed(1) }}</span>
            <span class="ds-unit">BPM</span>
          </div>

          <div class="ds-metric-box">
            <span class="ds-val font-mono">{{ ds.spo2Referencia.toFixed(1) }}%</span>
            <span class="ds-unit">SpO₂</span>
          </div>

          <div class="ds-metric-box">
            <span class="ds-val font-mono">{{ ds.frecuenciaHz }} Hz</span>
            <span class="ds-unit">Muestreo</span>
          </div>
        </div>

        <div class="ds-card-footer">
          <span class="select-hint">
            {{ ds.id === datasetSeleccionadoId ? '● Contrastando ahora' : 'Clic para contrastar' }}
          </span>
        </div>
      </div>
    </div>

    <!-- 3. Ficha Detallada del Dataset Público Activo -->
    <div class="active-dataset-banner" v-if="datasetActivo">
      <div class="banner-main-col">
        <div class="banner-title-line">
          <span class="badge-activo font-mono">DATASET EN CONTRASTE</span>
          <h4 class="banner-ds-title">{{ datasetActivo.titulo }}</h4>
        </div>
        <p class="banner-desc">{{ datasetActivo.descripcion }}</p>

        <div class="banner-links-row">
          <span class="info-tag">
            <strong>Institución:</strong> {{ datasetActivo.institucion }}
          </span>
          <span class="info-tag">
            <strong>Licencia:</strong> {{ datasetActivo.licencia }}
          </span>
          <a
            :href="datasetActivo.urlOficial"
            target="_blank"
            rel="noopener noreferrer"
            class="link-repositorio"
            title="Abrir repositorio científico oficial"
          >
            Repositorio Oficial PhysioNet / Dataset ↗
          </a>
        </div>
      </div>

      <div class="banner-side-col">
        <div class="contrast-vs-box">
          <div class="vs-label">Contraste vs Medición:</div>
          <div class="vs-title">{{ measurementName }}</div>
          <div class="vs-bpms font-mono">
            {{ currentBpm }} BPM (Tu medición) vs {{ datasetActivo.bpmReferencia.toFixed(1) }} BPM (Dataset)
          </div>
        </div>
      </div>
    </div>

    <!-- 4. Osciloscopio de Bioseñales Multicanal (RF47) -->
    <div class="oscilloscope-container">
      <div class="osc-header-bar">
        <div class="osc-title-group">
          <h4 class="osc-canvas-title">Osciloscopio Multicanal de Contraste Fisiológico (Ventana 3.5 s)</h4>
          <span class="osc-hz-badge font-mono">100 Hz</span>
        </div>

        <!-- Capas Activas -->
        <div class="layer-toggles">
          <label class="layer-chk">
            <input type="checkbox" v-model="mostrarMedicion" />
            <span class="layer-dot dot-medicion"></span>
            <span>Medición Tomada ({{ currentBpm }} BPM)</span>
          </label>

          <label class="layer-chk">
            <input type="checkbox" v-model="mostrarDataset" />
            <span class="layer-dot dot-dataset"></span>
            <span>{{ datasetActivo?.codigo || 'Dataset' }} ({{ datasetActivo?.bpmReferencia.toFixed(1) }} BPM)</span>
          </label>
        </div>
      </div>

      <!-- MODO A: VISTA SUPERPUESTA -->
      <div v-if="modoVisualizacion === 'superpuesto'" class="canvas-viewport viewport-single">
        <svg viewBox="0 0 900 240" width="100%" height="100%" preserveAspectRatio="none">
          <defs>
            <pattern id="grid-superpuesto-rf47" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" stroke-width="0.8" />
            </pattern>
          </defs>

          <rect width="900" height="240" fill="url(#grid-superpuesto-rf47)" />

          <!-- Línea base horizontal (DC) -->
          <line x1="0" y1="190" x2="900" y2="190" stroke="#334155" stroke-width="1" stroke-dasharray="2,2" />

          <!-- Traza 1: Medición Tomada por el Usuario (Verde Esmeralda) -->
          <path
            v-if="mostrarMedicion"
            :d="pathSvgMedicion"
            fill="none"
            stroke="#22c55e"
            stroke-width="2.6"
            stroke-linecap="round"
          />

          <!-- Traza 2: Dataset Público Internacional (Cian Neón / Zafiro) -->
          <path
            v-if="mostrarDataset"
            :d="pathSvgDataset"
            fill="none"
            stroke="#06b6d4"
            stroke-width="2.6"
            stroke-linecap="round"
            stroke-dasharray="4,2"
          />
        </svg>

        <div class="axis-legend-bottom font-mono">
          <span>0.0 s</span>
          <span>0.5 s</span>
          <span>1.0 s</span>
          <span>1.5 s</span>
          <span>2.0 s</span>
          <span>2.5 s</span>
          <span>3.0 s</span>
          <span>3.5 s</span>
        </div>
      </div>

      <!-- MODO B: CARRILES PARALELOS -->
      <div v-else class="canvas-viewport viewport-carriles">
        <!-- Carril 1: Medición del Usuario -->
        <div class="carril-box">
          <div class="carril-label">
            <span class="layer-dot dot-medicion"></span>
            <strong>Medición Tomada (Canal 1):</strong> {{ measurementName }} ({{ currentBpm }} BPM)
          </div>
          <svg viewBox="0 0 900 120" width="100%" height="100%" preserveAspectRatio="none">
            <defs>
              <pattern id="grid-c1-rf47" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" stroke-width="0.7" />
              </pattern>
            </defs>
            <rect width="900" height="120" fill="url(#grid-c1-rf47)" />
            <line x1="0" y1="95" x2="900" y2="95" stroke="#334155" stroke-width="1" stroke-dasharray="2,2" />
            <path
              v-if="mostrarMedicion"
              :d="pathSvgMedicionCarril"
              fill="none"
              stroke="#22c55e"
              stroke-width="2.4"
            />
          </svg>
        </div>

        <!-- Carril 2: Dataset Público de Referencia -->
        <div class="carril-box">
          <div class="carril-label">
            <span class="layer-dot dot-dataset"></span>
            <strong>Dataset Público ({{ datasetActivo?.codigo }}):</strong> {{ datasetActivo?.titulo }} ({{ datasetActivo?.bpmReferencia.toFixed(1) }} BPM)
          </div>
          <svg viewBox="0 0 900 120" width="100%" height="100%" preserveAspectRatio="none">
            <defs>
              <pattern id="grid-c2-rf47" width="30" height="30" patternUnits="userSpaceOnUse">
                <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#1e293b" stroke-width="0.7" />
              </pattern>
            </defs>
            <rect width="900" height="120" fill="url(#grid-c2-rf47)" />
            <line x1="0" y1="95" x2="900" y2="95" stroke="#334155" stroke-width="1" stroke-dasharray="2,2" />
            <path
              v-if="mostrarDataset"
              :d="pathSvgDatasetCarril"
              fill="none"
              stroke="#06b6d4"
              stroke-width="2.4"
              stroke-dasharray="4,2"
            />
          </svg>
        </div>

        <div class="axis-legend-bottom font-mono">
          <span>0.0 s</span>
          <span>0.5 s</span>
          <span>1.0 s</span>
          <span>1.5 s</span>
          <span>2.0 s</span>
          <span>2.5 s</span>
          <span>3.0 s</span>
          <span>3.5 s</span>
        </div>
      </div>
    </div>

    <!-- 5. Tarjetas Cuantitativas de Contraste Fisiológico -->
    <div class="metrics-grid-contraste" v-if="resultadoContraste">
      <!-- Variación BPM -->
      <div class="metric-card">
        <div class="met-label">Variación de Frecuencia (ΔBPM)</div>
        <div class="met-value font-mono" :class="resultadoContraste.deltaBpm >= 0 ? 'text-primary' : 'text-blue'">
          {{ resultadoContraste.deltaBpm > 0 ? '+' : '' }}{{ resultadoContraste.deltaBpm }}
          <span class="met-unit">BPM</span>
        </div>
        <div class="met-sub-info font-mono">
          {{ currentBpm }} BPM vs {{ resultadoContraste.bpmDataset.toFixed(1) }} BPM
        </div>
      </div>

      <!-- Variación Intervalo RR -->
      <div class="metric-card">
        <div class="met-label">Variación Intervalo RR (ΔT)</div>
        <div class="met-value font-mono">
          {{ resultadoContraste.deltaIntervaloMs > 0 ? '+' : '' }}{{ resultadoContraste.deltaIntervaloMs }}
          <span class="met-unit">ms</span>
        </div>
        <div class="met-sub-info font-mono">
          {{ resultadoContraste.intMedicionMs }} ms vs {{ resultadoContraste.intDatasetMs }} ms por ciclo
        </div>
      </div>

      <!-- Diferencial SpO2 -->
      <div class="metric-card">
        <div class="met-label">Diferencial SpO₂ (ΔSpO₂)</div>
        <div class="met-value font-mono text-cyan">
          {{ resultadoContraste.deltaSpo2 > 0 ? '+' : '' }}{{ resultadoContraste.deltaSpo2.toFixed(1) }}
          <span class="met-unit">%</span>
        </div>
        <div class="met-sub-info font-mono">
          {{ resultadoContraste.spo2Medicion.toFixed(1) }}% vs {{ resultadoContraste.spo2Dataset.toFixed(1) }}% (Dataset)
        </div>
      </div>

      <!-- Correlación de Pearson -->
      <div class="metric-card">
        <div class="met-label">Correlación de Pearson (r)</div>
        <div class="met-value font-mono text-purple">
          r = {{ resultadoContraste.correlacionPearson.toFixed(3) }}
        </div>
        <div class="met-sub-info">
          {{ resultadoContraste.similitudPorcentaje }}% similitud morfológica
        </div>
      </div>

      <!-- Error Cuadrático NRMSE -->
      <div class="metric-card">
        <div class="met-label">Discrepancia Normalizada (NRMSE)</div>
        <div class="met-value font-mono text-amber">
          {{ resultadoContraste.nrmsePorcentaje }}%
        </div>
        <div class="met-sub-info">
          {{ resultadoContraste.concordanciaTexto }}
        </div>
      </div>
    </div>

    <!-- 6. Análisis Morfológico y Conclusión Docente UNACH -->
    <div class="analysis-box" v-if="resultadoContraste">
      <div class="analysis-head">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" stroke-width="2" style="margin-right: 6px;">
          <circle cx="12" cy="12" r="10"></circle>
          <line x1="12" y1="16" x2="12" y2="12"></line>
          <line x1="12" y1="8" x2="12.01" y2="8"></line>
        </svg>
        <strong>Interpretación Pedagógica del Contraste con el Benchmark Internacional</strong>
        <span class="badge-concordancia" :style="{ backgroundColor: resultadoContraste.colorBadge }">
          {{ resultadoContraste.concordanciaTexto }}
        </span>
      </div>

      <p class="analysis-text">
        {{ resultadoContraste.conclusion }}
      </p>

      <!-- Tabla Comparativa de Parámetros de Onda Fisiológica -->
      <div class="morphology-table-box" v-if="datasetActivo?.caracteristicasOnda">
        <div class="table-title">Perfil Morfológico de la Bioseñal del Dataset de Referencia:</div>
        <div class="morph-grid">
          <div class="morph-item">
            <span class="morph-k">Ascenso Sistólico:</span>
            <span class="morph-v">{{ datasetActivo.caracteristicasOnda.ascensoSistolico }}</span>
          </div>
          <div class="morph-item">
            <span class="morph-k">Muesca Dícrota:</span>
            <span class="morph-v">{{ datasetActivo.caracteristicasOnda.muescaDicrota }}</span>
          </div>
          <div class="morph-item">
            <span class="morph-k">Onda Reflejada:</span>
            <span class="morph-v">{{ datasetActivo.caracteristicasOnda.ondaReflejada }}</span>
          </div>
          <div class="morph-item">
            <span class="morph-k">Compliance Vascular:</span>
            <span class="morph-v">{{ datasetActivo.caracteristicasOnda.complianceVascular }}</span>
          </div>
        </div>
      </div>

      <div class="analysis-meta">
        <span>Evaluación Docente de Oximetría y Bioseñales · Universidad Adventista de Chile (UNACH)</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  obtenerDatasetsPublicosContraste,
  obtenerDatasetPublicoPorId,
  contrastarMedicionConDataset,
  generarPathSvgContraste
} from '../services/contrasteDatasetsService.js'

const props = defineProps({
  currentBpm: {
    type: Number,
    default: 78
  },
  lastIntervalMs: {
    type: Number,
    default: 769
  },
  amplitude: {
    type: Number,
    default: 100
  },
  measurementName: {
    type: String,
    default: 'Medición Tomada'
  }
})

// Estado de UI
const categoriaFiltro = ref('todas')
const modoVisualizacion = ref('superpuesto') // 'superpuesto' | 'carriles'
const mostrarMedicion = ref(true)
const mostrarDataset = ref(true)

// Catálogo y selección
const datasetsCatalogo = obtenerDatasetsPublicosContraste()
const datasetSeleccionadoId = ref('bidmc-ppg-uci')

const datasetsFiltrados = computed(() => {
  if (categoriaFiltro.value === 'todas') return datasetsCatalogo
  return datasetsCatalogo.filter(d => d.categoria === categoriaFiltro.value)
})

const datasetActivo = computed(() => {
  return obtenerDatasetPublicoPorId(datasetSeleccionadoId.value) || datasetsCatalogo[0]
})

function seleccionarDataset(id) {
  datasetSeleccionadoId.value = id
}

// Cálculo del Contraste
const resultadoContraste = computed(() => {
  if (!datasetActivo.value) return null
  return contrastarMedicionConDataset({
    bpmMedicion: props.currentBpm,
    spo2Medicion: 98.0,
    dataset: datasetActivo.value,
    duracionS: 3.5
  })
})

// Generación de paths vectoriales SVG para el Osciloscopio
const pathSvgMedicion = computed(() => {
  if (!resultadoContraste.value?.serieUsuario) return ''
  return generarPathSvgContraste(resultadoContraste.value.serieUsuario, 900, 240, 3.5, 190, 140)
})

const pathSvgDataset = computed(() => {
  if (!resultadoContraste.value?.serieDataset) return ''
  return generarPathSvgContraste(resultadoContraste.value.serieDataset, 900, 240, 3.5, 190, 140)
})

// Paths para vista en carriles (altura reducida 120px)
const pathSvgMedicionCarril = computed(() => {
  if (!resultadoContraste.value?.serieUsuario) return ''
  return generarPathSvgContraste(resultadoContraste.value.serieUsuario, 900, 120, 3.5, 95, 75)
})

const pathSvgDatasetCarril = computed(() => {
  if (!resultadoContraste.value?.serieDataset) return ''
  return generarPathSvgContraste(resultadoContraste.value.serieDataset, 900, 120, 3.5, 95, 75)
})
</script>

<style scoped>
.comparador-datasets-card {
  margin-top: 1.25rem;
  padding: 1.25rem;
}

.card-head-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 1rem;
}

.head-badge-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.badge-rf47 {
  background: #0284c7;
  color: #ffffff;
  font-size: 0.7rem;
  font-weight: 800;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  letter-spacing: 0.05em;
}

.badge-acreditado {
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
}

.card-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--color-text);
  margin-bottom: 0.35rem;
}

.card-desc {
  font-size: 0.88rem;
  color: var(--color-muted);
  max-width: 820px;
  line-height: 1.45;
  margin-bottom: 0;
}

.view-mode-buttons {
  display: flex;
  gap: 0.5rem;
}

/* Filtros */
.category-filters-bar {
  margin-bottom: 1rem;
}

.filters-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.filter-lbl {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-muted);
}

.cat-chip {
  padding: 0.3rem 0.75rem;
  border-radius: 9999px;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #475569;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.cat-chip:hover {
  background: #e2e8f0;
  color: #1e293b;
}

.cat-chip.active {
  background: #0284c7;
  color: #ffffff;
  border-color: #0284c7;
}

/* Grid de Datasets */
.datasets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 0.85rem;
  margin-bottom: 1.25rem;
}

.dataset-card {
  background: #ffffff;
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.85rem;
  cursor: pointer;
  transition: all 0.2s ease;
  display: flex;
  flex-direction: column;
}

.dataset-card:hover {
  border-color: #93c5fd;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.05);
}

.dataset-card.selected {
  border-color: #0284c7;
  background: #f0f9ff;
  box-shadow: 0 4px 10px rgba(2, 132, 199, 0.15);
}

.ds-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.35rem;
}

.ds-codigo {
  font-size: 0.72rem;
  font-weight: 700;
  color: #0369a1;
  background: #e0f2fe;
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
}

.ds-licencia {
  font-size: 0.7rem;
  color: #64748b;
  font-weight: 600;
}

.ds-title {
  font-size: 0.95rem;
  font-weight: 750;
  color: #0f172a;
  margin: 0.2rem 0;
  line-height: 1.3;
}

.ds-meta-sub {
  font-size: 0.78rem;
  color: #64748b;
  margin-bottom: 0.65rem;
}

.meta-dot {
  margin: 0 0.3rem;
}

.ds-metrics-strip {
  display: flex;
  gap: 0.6rem;
  background: #f8fafc;
  padding: 0.4rem 0.6rem;
  border-radius: 0.35rem;
  border: 1px solid #e2e8f0;
  margin-top: auto;
}

.ds-metric-box {
  display: flex;
  flex-direction: column;
}

.ds-val {
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.1;
}

.ds-unit {
  font-size: 0.65rem;
  font-weight: 700;
  color: #64748b;
}

.ds-card-footer {
  margin-top: 0.5rem;
  text-align: right;
}

.select-hint {
  font-size: 0.72rem;
  font-weight: 600;
  color: #0284c7;
}

/* Ficha del Dataset Activo */
.active-dataset-banner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #0f172a;
  color: #f8fafc;
  border-radius: 0.5rem;
  padding: 1rem 1.25rem;
  margin-bottom: 1.25rem;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.banner-main-col {
  flex: 1;
  min-width: 280px;
}

.banner-title-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.25rem;
}

.badge-activo {
  background: #0284c7;
  color: #ffffff;
  font-size: 0.65rem;
  font-weight: 800;
  padding: 0.15rem 0.45rem;
  border-radius: 0.25rem;
}

.banner-ds-title {
  font-size: 1.05rem;
  font-weight: 800;
  color: #38bdf8;
  margin: 0;
}

.banner-desc {
  font-size: 0.85rem;
  color: #cbd5e1;
  margin: 0.35rem 0 0.6rem 0;
  line-height: 1.4;
}

.banner-links-row {
  display: flex;
  gap: 0.85rem;
  font-size: 0.76rem;
  color: #94a3b8;
  flex-wrap: wrap;
  align-items: center;
}

.info-tag strong {
  color: #e2e8f0;
}

.link-repositorio {
  color: #38bdf8;
  text-decoration: underline;
  font-weight: 700;
  transition: color 0.15s;
}

.link-repositorio:hover {
  color: #7dd3fc;
}

.banner-side-col {
  min-width: 240px;
}

.contrast-vs-box {
  background: rgba(30, 41, 59, 0.85);
  border: 1px solid #334155;
  border-radius: 0.45rem;
  padding: 0.65rem 0.85rem;
}

.vs-label {
  font-size: 0.7rem;
  color: #94a3b8;
  font-weight: 700;
  text-transform: uppercase;
}

.vs-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: #22c55e;
  margin-bottom: 0.2rem;
}

.vs-bpms {
  font-size: 0.78rem;
  color: #cbd5e1;
}

/* Osciloscopio */
.oscilloscope-container {
  background: #080d16;
  border: 1px solid #1e293b;
  border-radius: 0.5rem;
  overflow: hidden;
  margin-bottom: 1.25rem;
}

.osc-header-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background: #0d131f;
  border-bottom: 1px solid #1e293b;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.osc-title-group {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.osc-canvas-title {
  font-size: 0.85rem;
  font-weight: 700;
  color: #f1f5f9;
  margin: 0;
}

.osc-hz-badge {
  background: #1e293b;
  color: #38bdf8;
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
}

.layer-toggles {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: #94a3b8;
}

.layer-chk {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  user-select: none;
}

.layer-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}

.dot-medicion {
  background: #22c55e;
  box-shadow: 0 0 5px #22c55e;
}

.dot-dataset {
  background: #06b6d4;
  box-shadow: 0 0 5px #06b6d4;
}

.canvas-viewport {
  position: relative;
  background: #06090e;
}

.viewport-single {
  height: 240px;
}

.viewport-carriles {
  display: flex;
  flex-direction: column;
}

.carril-box {
  border-bottom: 1px solid #1e293b;
  height: 120px;
  position: relative;
}

.carril-label {
  position: absolute;
  top: 6px;
  left: 10px;
  z-index: 5;
  font-size: 0.75rem;
  color: #cbd5e1;
  display: flex;
  align-items: center;
  gap: 0.35rem;
  background: rgba(15, 23, 42, 0.75);
  padding: 0.15rem 0.45rem;
  border-radius: 0.25rem;
}

.axis-legend-bottom {
  display: flex;
  justify-content: space-between;
  padding: 0.3rem 0.85rem;
  background: #0d131f;
  color: #64748b;
  font-size: 0.72rem;
  border-top: 1px solid #1e293b;
}

/* Tarjetas de Métricas Cuantitativas */
.metrics-grid-contraste {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.85rem;
  margin-bottom: 1.25rem;
}

.metric-card {
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.85rem;
}

.met-label {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-muted);
  text-transform: uppercase;
  margin-bottom: 0.35rem;
}

.met-value {
  font-size: 1.4rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1.1;
  margin-bottom: 0.25rem;
}

.met-unit {
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
}

.met-sub-info {
  font-size: 0.75rem;
  color: #64748b;
}

.text-cyan { color: #0891b2; }
.text-purple { color: #7c3aed; }
.text-amber { color: #d97706; }
.text-blue { color: #2563eb; }

/* Caja de Análisis Docente */
.analysis-box {
  background: #f8fafc;
  border: 1px solid #cbd5e1;
  border-left: 4px solid #2563eb;
  border-radius: 0.45rem;
  padding: 1rem 1.25rem;
}

.analysis-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  color: #1e293b;
  margin-bottom: 0.5rem;
  flex-wrap: wrap;
}

.badge-concordancia {
  font-size: 0.72rem;
  font-weight: 800;
  color: #ffffff;
  padding: 0.15rem 0.55rem;
  border-radius: 9999px;
  margin-left: auto;
}

.analysis-text {
  font-size: 0.9rem;
  color: #334155;
  line-height: 1.5;
  margin-bottom: 0.75rem;
}

.morphology-table-box {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 0.35rem;
  padding: 0.75rem;
  margin-bottom: 0.75rem;
}

.table-title {
  font-size: 0.8rem;
  font-weight: 700;
  color: #475569;
  margin-bottom: 0.4rem;
}

.morph-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.5rem;
  font-size: 0.78rem;
}

.morph-item {
  display: flex;
  flex-direction: column;
}

.morph-k {
  color: #64748b;
  font-weight: 600;
}

.morph-v {
  color: #0f172a;
  font-weight: 700;
}

.analysis-meta {
  font-size: 0.72rem;
  color: #94a3b8;
  text-align: right;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
