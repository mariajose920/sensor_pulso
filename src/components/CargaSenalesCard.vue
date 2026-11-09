<template>
  <div class="carga-senales-card card">
    <!-- Encabezado de la Sección de Carga de Señales (RF27) -->
    <div class="card-head-bar">
      <div>
        <div style="display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.25rem;">
          <h3 class="card-title" style="margin: 0;">
            Carga de Bioseñales Fisiológicas
          </h3>
          <span class="badge badge-rf">RF27</span>
        </div>
        <p class="card-desc">
          Carga y analiza bioseñales externas por <strong>archivo CSV</strong>, <strong>simulación paramétrica</strong>, <strong>datasets públicos</strong> (PhysioNet, CapnoBase) o <strong>referencia clínica validada</strong>.
        </p>
      </div>

      <div class="origen-tabs">
        <button
          type="button"
          class="btn-tab-origen"
          :class="{ active: pestanaOrigen === 'csv' }"
          @click="pestanaOrigen = 'csv'"
        >
          📄 Archivo CSV
        </button>
        <button
          type="button"
          class="btn-tab-origen"
          :class="{ active: pestanaOrigen === 'simulada' }"
          @click="pestanaOrigen = 'simulada'"
        >
          ⚡ Simulada
        </button>
        <button
          type="button"
          class="btn-tab-origen"
          :class="{ active: pestanaOrigen === 'dataset' }"
          @click="pestanaOrigen = 'dataset'"
        >
          🌐 Datasets Públicos
        </button>
        <button
          type="button"
          class="btn-tab-origen"
          :class="{ active: pestanaOrigen === 'validada' }"
          @click="pestanaOrigen = 'validada'"
        >
          🏅 Referencia Validada
        </button>
      </div>
    </div>

    <!-- 1. PESTAÑA: ARCHIVO CSV -->
    <div v-if="pestanaOrigen === 'csv'" class="origen-panel">
      <div
        class="dropzone-area"
        :class="{ 'dropzone-active': arrastrandoArchivo }"
        @dragover.prevent="arrastrandoArchivo = true"
        @dragleave.prevent="arrastrandoArchivo = false"
        @drop.prevent="onDropArchivo"
      >
        <input
          ref="fileInputRef"
          type="file"
          accept=".csv,text/csv,text/plain"
          style="display: none;"
          @change="onFileSelected"
        />

        <div class="dropzone-content">
          <span class="dropzone-icon">📥</span>
          <p class="dropzone-title">
            Arrastra tu archivo <strong>.CSV</strong> aquí o haz clic para examinar
          </p>
          <span class="dropzone-hint">
            Formatos compatibles: columnas <code>tiempo, ir, rojo</code> o <code>t, ppg</code> (delimitadores: coma, punto y coma o tabulación). Límite: 5 MB (RF66).
          </span>

          <div style="display: flex; gap: 0.75rem; margin-top: 0.85rem; flex-wrap: wrap; justify-content: center;">
            <button type="button" class="btn btn-primary btn-sm" @click="abrirSelectorArchivos">
              📁 Seleccionar archivo CSV
            </button>
            <button type="button" class="btn btn-secondary btn-sm" @click="descargarCsvEjemplo">
              ⬇️ Descargar plantilla CSV de prueba
            </button>
          </div>
        </div>
      </div>

      <!-- Alerta de error si falla la validación del CSV -->
      <div v-if="errorCsv" class="alert-box alert-error" style="margin-top: 0.75rem;">
        ⚠️ {{ errorCsv }}
      </div>

      <!-- Alerta de Sanitización RF65 si hubo fórmulas neutralizadas o advertencias de seguridad -->
      <div v-if="senalCargada && (senalCargada.formulasNeutralizadas > 0 || senalCargada.advertencias?.length > 0)" class="alert-box alert-sanitizacion" style="margin-top: 0.75rem;">
        <div style="display: flex; align-items: flex-start; gap: 0.5rem;">
          <span style="font-size: 1.15rem; line-height: 1;">🛡️</span>
          <div>
            <strong>Blindaje RF65 (Sanitización Exitosa):</strong>
            <span v-if="senalCargada.formulasNeutralizadas > 0"> Se neutralizaron {{ senalCargada.formulasNeutralizadas }} celdas con fórmulas potencialmente peligrosas (CWE-1236 / Formula Injection).</span>
            <ul v-if="senalCargada.advertencias?.length > 0" style="margin: 0.35rem 0 0 1.2rem; padding: 0; font-size: 0.82rem;">
              <li v-for="(adv, idx) in senalCargada.advertencias" :key="idx">{{ adv }}</li>
            </ul>
          </div>
        </div>
      </div>
    </div>

    <!-- 2. PESTAÑA: SEÑAL SIMULADA -->
    <div v-else-if="pestanaOrigen === 'simulada'" class="origen-panel">
      <div class="simulacion-controls-grid">
        <div>
          <label class="form-label">Perfil Fisiológico a Simular:</label>
          <div class="presets-sim-chips">
            <button
              v-for="preset in PRESETS_SIMULACION"
              :key="preset.id"
              type="button"
              class="sim-chip"
              :class="{ active: simPresetSeleccionado === preset.id }"
              @click="seleccionarPresetSim(preset.id)"
            >
              {{ preset.nombre }}
            </button>
          </div>
        </div>

        <div class="sliders-subgrid">
          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.2rem;">
              <span>Frecuencia Cardíaca (BPM):</span>
              <strong class="font-mono text-primary">{{ simBpm }} BPM</strong>
            </div>
            <input type="range" min="40" max="180" step="1" v-model.number="simBpm" class="form-range" />
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.2rem;">
              <span>Saturación de Oxígeno (SpO₂):</span>
              <strong class="font-mono text-cyan">{{ simSpo2 }}%</strong>
            </div>
            <input type="range" min="80" max="100" step="0.5" v-model.number="simSpo2" class="form-range" />
          </div>

          <div>
            <div style="display: flex; justify-content: space-between; font-size: 0.8rem; margin-bottom: 0.2rem;">
              <span>Nivel de Ruido Fisiológico:</span>
              <strong class="font-mono">{{ simRuido }}%</strong>
            </div>
            <input type="range" min="0" max="15" step="1" v-model.number="simRuido" class="form-range" />
          </div>
        </div>
      </div>

      <div style="display: flex; justify-content: flex-end; margin-top: 0.75rem;">
        <button type="button" class="btn btn-primary btn-sm" @click="generarSenalSimulada">
          ⚡ Generar Bioseñal Sintética
        </button>
      </div>
    </div>

    <!-- 3. PESTAÑA: DATASETS PÚBLICOS (PhysioNet, CapnoBase, MIMIC) -->
    <div v-else-if="pestanaOrigen === 'dataset'" class="origen-panel">
      <div class="datasets-grid">
        <div
          v-for="ds in datasetsLista"
          :key="ds.id"
          class="dataset-card"
          :class="{ active: senalCargada?.id === ds.id }"
        >
          <div class="dataset-card-header">
            <span class="dataset-source-badge">{{ ds.fuente.split('/')[0].trim() }}</span>
            <span class="dataset-bpm-badge font-mono">{{ ds.bpmReferencia }} BPM · {{ ds.spo2Referencia }}% SpO₂</span>
          </div>

          <h4 class="dataset-name">{{ ds.nombre }}</h4>
          <p class="dataset-desc">{{ ds.descripcion }}</p>

          <div class="dataset-footer">
            <span class="dataset-licencia" :title="ds.licencia">📜 {{ ds.licencia.split('(')[0].trim() }}</span>
            <button type="button" class="btn btn-sm btn-primary" @click="cargarDataset(ds.id)">
              Cargar Bioseñal
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- 4. PESTAÑA: REFERENCIA VALIDADA -->
    <div v-else-if="pestanaOrigen === 'validada'" class="origen-panel">
      <div class="validadas-grid">
        <div
          v-for="val in senalesValidadasLista"
          :key="val.id"
          class="validada-card"
          :class="{ active: senalCargada?.id === val.id }"
        >
          <div class="validada-card-header">
            <span class="validada-cert-badge">🏅 Aprobada Docente</span>
            <span class="font-mono" style="font-size: 0.8rem; font-weight: 700; color: #0284c7;">
              {{ val.bpmReferencia }} BPM · {{ val.spo2Referencia }}% SpO₂
            </span>
          </div>

          <h4 class="validada-name">{{ val.nombre }}</h4>
          <p class="validada-desc">{{ val.descripcion }}</p>
          <p v-if="val.explicacion" class="validada-explicacion">
            💡 <em>{{ val.explicacion }}</em>
          </p>

          <div style="display: flex; justify-content: flex-end; margin-top: 0.5rem;">
            <button type="button" class="btn btn-sm btn-primary" @click="cargarSenalValidada(val)">
              Cargar Referencia
            </button>
          </div>
        </div>
      </div>
    </div>

    <!-- ===================================================================== -->
    <!-- VISOR DE LA SEÑAL CARGADA (OSCILOSCOPIO + MÉTRICAS + ACCIONES)        -->
    <!-- ===================================================================== -->
    <div v-if="senalCargada" class="senal-viewer-section">
      <div class="viewer-header">
        <div style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap;">
          <span class="badge-source-type" :class="'type-' + senalCargada.origen">
            {{ etiquetaOrigenSenal(senalCargada.origen) }}
          </span>
          <h4 class="viewer-title">{{ senalCargada.nombre || senalCargada.nombreArchivo }}</h4>
        </div>

        <div class="viewer-badges">
          <span class="viewer-pill">
            <span class="lbl">Frecuencia:</span>
            <strong class="font-mono">{{ senalCargada.bpmEstimado || senalCargada.bpm }} BPM</strong>
          </span>
          <span class="viewer-pill">
            <span class="lbl">SpO₂:</span>
            <strong class="font-mono">{{ senalCargada.spo2Estimado || senalCargada.spo2 }}%</strong>
          </span>
          <span class="viewer-pill">
            <span class="lbl">Muestras:</span>
            <strong class="font-mono">{{ senalCargada.totalMuestras || senalCargada.muestrasIr?.length }} ({{ senalCargada.duracionSegundos || senalCargada.duracionS }}s)</strong>
          </span>
        </div>
      </div>

      <!-- Pantalla del Osciloscopio de la Señal Cargada -->
      <div class="scope-canvas-box">
        <canvas ref="scopeCanvasRef" class="scope-canvas-element"></canvas>
      </div>

      <!-- Barra de Acciones con la Señal Cargada -->
      <div class="viewer-actions-bar">
        <div class="actions-hint">
          Usa esta señal para contrastarla en el comparador o inyectarla al monitor de medición.
        </div>

        <div class="actions-buttons">
          <button
            type="button"
            class="btn btn-primary btn-sm"
            @click="transferirAComparador"
            title="Usar esta bioseñal en el comparador de mediciones (RF26/RF27)"
          >
            📊 Comparar en esta Pantalla
          </button>

          <button
            type="button"
            class="btn btn-secondary btn-sm"
            @click="inyectarAMedicion"
            title="Inyectar muestras al osciloscopio en tiempo real de /medicion"
          >
            🫀 Inyectar a Medición en Vivo
          </button>

          <button
            type="button"
            class="btn btn-secondary btn-sm"
            @click="exportarACsv"
            title="Descargar bioseñal procesada a archivo CSV"
          >
            💾 Descargar CSV
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, onMounted, onBeforeUnmount, nextTick } from 'vue'
import {
  senalesService,
  DATASETS_PUBLICOS_CATALOGO,
  SENALES_VALIDADAS_CATALOGO,
  PRESETS_SIMULACION,
  generarCsvPlantillaEjemplo
} from '../services/senalesService.js'
import { esp32State, senalBuffer } from '../services/esp32Service.js'

const emit = defineEmits(['seleccionar-senal', 'usar-medicion'])

// Pestaña de origen activa
const pestanaOrigen = ref('csv') // 'csv' | 'simulada' | 'dataset' | 'validada'

// Listas de datos
const datasetsLista = ref(DATASETS_PUBLICOS_CATALOGO)
const senalesValidadasLista = ref([])

// Estado para carga de CSV
const fileInputRef = ref(null)
const arrastrandoArchivo = ref(false)
const errorCsv = ref('')

// Estado para señal simulada
const simPresetSeleccionado = ref('sim-reposo')
const simBpm = ref(72)
const simSpo2 = ref(98.5)
const simRuido = ref(2)

// Señal actualmente cargada en memoria
const senalCargada = ref(null)

// Referencia al canvas del osciloscopio integrado
const scopeCanvasRef = ref(null)
let animId = null

function etiquetaOrigenSenal(origen) {
  if (origen === 'csv') return 'Archivo CSV'
  if (origen === 'simulada') return 'Señal Simulada'
  if (origen === 'dataset') return 'Dataset Público'
  if (origen === 'validada') return 'Referencia Validada'
  return 'Bioseñal'
}

function abrirSelectorArchivos() {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

function onFileSelected(event) {
  const file = event.target.files?.[0]
  if (file) procesarArchivo(file)
}

function onDropArchivo(event) {
  arrastrandoArchivo.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) procesarArchivo(file)
}

function procesarArchivo(file) {
  errorCsv.value = ''
  if (!file.name.toLowerCase().endsWith('.csv') && !file.name.toLowerCase().endsWith('.txt')) {
    errorCsv.value = 'El archivo debe tener extensión .csv o .txt'
    return
  }

  const reader = new FileReader()
  reader.onload = (e) => {
    const texto = e.target?.result
    const res = senalesService.cargarDesdeCsv(texto, file.name)
    if (!res.valido) {
      errorCsv.value = res.error || 'Error al procesar el archivo CSV'
    } else {
      senalCargada.value = res
      nextTick(() => dibujarSenalCargada())
    }
  }
  reader.onerror = () => {
    errorCsv.value = 'Error al leer el archivo desde el dispositivo'
  }
  reader.readAsText(file)
}

function descargarCsvEjemplo() {
  const contenido = generarCsvPlantillaEjemplo()
  const blob = new Blob([contenido], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `plantilla_bioseñal_ppg_rf27.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

function seleccionarPresetSim(presetId) {
  simPresetSeleccionado.value = presetId
  const preset = PRESETS_SIMULACION.find(p => p.id === presetId)
  if (preset) {
    simBpm.value = preset.bpm
    simSpo2.value = preset.spo2
    simRuido.value = preset.ruido
  }
}

function generarSenalSimulada() {
  const res = senalesService.generarSenalSimulada(simPresetSeleccionado.value, {
    bpm: simBpm.value,
    spo2: simSpo2.value,
    ruido: simRuido.value
  })
  senalCargada.value = {
    ...res,
    bpmEstimado: res.bpm,
    spo2Estimado: res.spo2,
    totalMuestras: res.totalMuestras
  }
  nextTick(() => dibujarSenalCargada())
}

function cargarDataset(datasetId) {
  const res = senalesService.cargarSenalDataset(datasetId)
  if (res) {
    senalCargada.value = res
    nextTick(() => dibujarSenalCargada())
  }
}

function cargarSenalValidada(val) {
  senalCargada.value = {
    ...val,
    origen: 'validada',
    bpmEstimado: val.bpmReferencia,
    spo2Estimado: val.spo2Referencia
  }
  nextTick(() => dibujarSenalCargada())
}

// ----------------------------------------------------------------------------
// Renderizado de la Señal en Canvas Osciloscopio
// ----------------------------------------------------------------------------
function dibujarSenalCargada() {
  const canvas = scopeCanvasRef.value
  if (!canvas || !senalCargada.value) return

  const dpr = window.devicePixelRatio || 1
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * dpr
  canvas.height = (rect.height || 180) * dpr

  const ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
  const w = rect.width
  const h = rect.height || 180

  // Fondo oscuro de osciloscopio
  ctx.fillStyle = '#080c14'
  ctx.fillRect(0, 0, w, h)

  // Grilla de retícula médica
  ctx.strokeStyle = '#1e293b'
  ctx.lineWidth = 1
  ctx.beginPath()
  const stepX = w / 10
  for (let x = 0; x <= w; x += stepX) {
    ctx.moveTo(x, 0)
    ctx.lineTo(x, h)
  }
  const stepY = h / 6
  for (let y = 0; y <= h; y += stepY) {
    ctx.moveTo(0, y)
    ctx.lineTo(w, y)
  }
  ctx.stroke()

  const samples = senalCargada.value.muestrasIr || []
  if (samples.length < 2) return

  const min = Math.min(...samples)
  const max = Math.max(...samples)
  const rango = (max - min) || 1
  const paddingY = h * 0.15
  const usableH = h - 2 * paddingY

  // Trazado de la onda PPG (verde neón con glow)
  ctx.save()
  ctx.shadowColor = '#10b981'
  ctx.shadowBlur = 6
  ctx.strokeStyle = '#10b981'
  ctx.lineWidth = 2
  ctx.beginPath()

  const len = samples.length
  for (let i = 0; i < len; i++) {
    const x = (i / (len - 1)) * w
    const normVal = (samples[i] - min) / rango
    const y = h - paddingY - normVal * usableH
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

// ----------------------------------------------------------------------------
// Acciones con la Señal Cargada
// ----------------------------------------------------------------------------
function transferirAComparador() {
  if (!senalCargada.value) return
  const bpm = senalCargada.value.bpmEstimado || senalCargada.value.bpm || 72
  const nombre = senalCargada.value.nombre || senalCargada.value.nombreArchivo || 'Señal Externa'

  emit('seleccionar-senal', {
    bpm,
    amplitude: 100,
    nombre,
    muestrasIr: senalCargada.value.muestrasIr,
    muestrasRojo: senalCargada.value.muestrasRojo,
    origen: senalCargada.value.origen
  })

  // Mensaje visual discreto
  alert(`✅ Señal "${nombre}" cargada en el comparador (${bpm} BPM).`)
}

function inyectarAMedicion() {
  if (!senalCargada.value) return
  const samples = senalCargada.value.muestrasIr || []
  const samplesRed = senalCargada.value.muestrasRojo || samples

  // Inyectar muestras en el buffer de esp32Service para alimentar el osciloscopio
  senalBuffer.ir = [...samples.slice(0, 500)]
  senalBuffer.rojo = [...samplesRed.slice(0, 500)]
  esp32State.conectado = true
  esp32State.dispositivo = `Simulación RF27 (${senalCargada.value.nombre || 'Externa'})`

  alert(`✅ Bioseñal inyectada al osciloscopio en vivo. Abre /medicion para verla fluir.`)
}

function exportarACsv() {
  if (!senalCargada.value) return
  const ir = senalCargada.value.muestrasIr || []
  const rojo = senalCargada.value.muestrasRojo || []
  const hz = senalCargada.value.frecuenciaHz || 50

  const lineas = [
    `# sensor_pulso · Exportación de Bioseñal (RF27)`,
    `# Origen: ${senalCargada.value.origen}`,
    `# Frecuencia: ${hz} Hz`,
    'indice,tiempo_ms,ir,rojo'
  ]

  const maxLen = Math.max(ir.length, rojo.length)
  const dtMs = 1000 / hz
  for (let i = 0; i < maxLen; i++) {
    lineas.push(`${i},${Math.round(i * dtMs)},${ir[i] ?? ''},${rojo[i] ?? ''}`)
  }

  const blob = new Blob([lineas.join('\n')], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `senal_${senalCargada.value.origen}_${Date.now()}.csv`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
}

onMounted(async () => {
  senalesValidadasLista.value = await senalesService.obtenerSenalesValidadas()
  // Cargar una señal predeterminada inicial para que el visor no esté vacío
  cargarDataset('bidmc-ppg-01')
})

onBeforeUnmount(() => {
  if (animId) cancelAnimationFrame(animId)
})
</script>

<style scoped>
.carga-senales-card {
  margin-bottom: 1.5rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 1.25rem;
}

.card-head-bar {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--color-border);
}

.badge-rf {
  background: #dbeafe;
  color: #1e40af;
  font-weight: 700;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  border: 1px solid #bfdbfe;
}

.card-desc {
  color: var(--color-muted);
  font-size: 0.88rem;
  margin: 0;
  max-width: 650px;
}

.origen-tabs {
  display: flex;
  gap: 0.4rem;
  flex-wrap: wrap;
}

.btn-tab-origen {
  background: #f1f5f9;
  border: 1px solid #cbd5e1;
  color: #475569;
  font-size: 0.82rem;
  font-weight: 600;
  padding: 0.4rem 0.8rem;
  border-radius: 0.4rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.btn-tab-origen:hover {
  background: #e2e8f0;
  color: #0f172a;
}

.btn-tab-origen.active {
  background: #2563eb;
  border-color: #1d4ed8;
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(37, 99, 235, 0.3);
}

.origen-panel {
  padding-top: 1rem;
}

/* Dropzone CSV */
.dropzone-area {
  border: 2px dashed #94a3b8;
  border-radius: 0.65rem;
  padding: 2rem 1.5rem;
  text-align: center;
  background: #f8fafc;
  transition: all 0.2s ease;
  cursor: pointer;
}

.dropzone-area:hover,
.dropzone-area.dropzone-active {
  border-color: #2563eb;
  background: #eff6ff;
}

.dropzone-icon {
  font-size: 2.2rem;
  display: block;
  margin-bottom: 0.5rem;
}

.dropzone-title {
  font-size: 0.95rem;
  color: var(--color-text);
  margin-bottom: 0.25rem;
}

.dropzone-hint {
  font-size: 0.78rem;
  color: var(--color-muted);
  display: block;
}

.alert-box {
  padding: 0.6rem 0.85rem;
  border-radius: 0.4rem;
  font-size: 0.82rem;
}

.alert-error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #b91c1c;
}

.alert-sanitizacion {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
}

/* Simulación */
.simulacion-controls-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1.25rem;
}

.presets-sim-chips {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  margin-top: 0.35rem;
}

.sim-chip {
  text-align: left;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 0.45rem 0.75rem;
  border-radius: 0.4rem;
  font-size: 0.82rem;
  cursor: pointer;
  transition: all 0.15s;
}

.sim-chip:hover {
  background: #f1f5f9;
  border-color: #cbd5e1;
}

.sim-chip.active {
  background: #eff6ff;
  border-color: #3b82f6;
  color: #1d4ed8;
  font-weight: 700;
}

.sliders-subgrid {
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  justify-content: center;
}

.form-range {
  width: 100%;
}

.text-primary { color: #2563eb; }
.text-cyan { color: #0284c7; }

/* Datasets Grid */
.datasets-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(270px, 1fr));
  gap: 0.85rem;
}

.dataset-card {
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.85rem;
  background: #ffffff;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: all 0.15s;
}

.dataset-card:hover {
  border-color: #3b82f6;
  box-shadow: 0 2px 4px rgba(0, 0, 0, 0.05);
}

.dataset-card.active {
  border-color: #2563eb;
  background: #f0fdf4;
}

.dataset-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.4rem;
}

.dataset-source-badge {
  font-size: 0.7rem;
  font-weight: 700;
  color: #6366f1;
  background: #eef2ff;
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
}

.dataset-bpm-badge {
  font-size: 0.75rem;
  color: #16a34a;
  font-weight: 700;
}

.dataset-name {
  font-size: 0.88rem;
  font-weight: 700;
  margin: 0 0 0.35rem 0;
  color: var(--color-text);
}

.dataset-desc {
  font-size: 0.78rem;
  color: var(--color-muted);
  line-height: 1.35;
  margin: 0 0 0.75rem 0;
}

.dataset-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  border-top: 1px solid #f1f5f9;
  padding-top: 0.5rem;
}

.dataset-licencia {
  font-size: 0.7rem;
  color: #94a3b8;
}

/* Validadas Grid */
.validadas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.85rem;
}

.validada-card {
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.85rem;
  background: #ffffff;
}

.validada-card.active {
  border-color: #10b981;
  background: #f0fdf4;
}

.validada-card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.35rem;
}

.validada-cert-badge {
  font-size: 0.7rem;
  font-weight: 700;
  color: #059669;
  background: #ecfdf5;
  padding: 0.1rem 0.4rem;
  border-radius: 0.25rem;
}

.validada-name {
  font-size: 0.88rem;
  font-weight: 700;
  margin: 0 0 0.35rem 0;
  color: var(--color-text);
}

.validada-desc {
  font-size: 0.78rem;
  color: var(--color-muted);
  margin: 0 0 0.4rem 0;
  line-height: 1.35;
}

.validada-explicacion {
  font-size: 0.75rem;
  color: #0369a1;
  background: #f0f9ff;
  padding: 0.35rem 0.5rem;
  border-radius: 0.3rem;
  margin: 0;
}

/* VISOR OSCILOSCOPIO */
.senal-viewer-section {
  margin-top: 1.25rem;
  padding-top: 1.25rem;
  border-top: 2px dashed var(--color-border);
}

.viewer-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.75rem;
}

.badge-source-type {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.15rem 0.5rem;
  border-radius: 0.25rem;
  text-transform: uppercase;
}

.type-csv { background: #fef3c7; color: #92400e; }
.type-simulada { background: #e0e7ff; color: #3730a3; }
.type-dataset { background: #e0f2fe; color: #0369a1; }
.type-validada { background: #dcfce7; color: #166534; }

.viewer-title {
  font-size: 0.95rem;
  font-weight: 700;
  margin: 0;
  color: var(--color-text);
}

.viewer-badges {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.viewer-pill {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 0.2rem 0.5rem;
  border-radius: 0.35rem;
  font-size: 0.78rem;
  color: #475569;
}

.viewer-pill .lbl {
  color: #94a3b8;
  margin-right: 0.25rem;
}

.scope-canvas-box {
  width: 100%;
  height: 180px;
  background: #080c14;
  border-radius: 0.5rem;
  overflow: hidden;
  border: 1px solid #1e293b;
}

.scope-canvas-element {
  width: 100%;
  height: 100%;
  display: block;
}

.viewer-actions-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.75rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.actions-hint {
  font-size: 0.8rem;
  color: var(--color-muted);
}

.actions-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
