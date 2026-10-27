<template>
  <div class="card">
    <!-- Encabezado de la Seccion Comparativa -->
    <div style="border-bottom: 1px solid var(--color-border); padding-bottom: 0.75rem; margin-bottom: 1rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem;">
      <div>
        <h3 class="card-title" style="margin-bottom: 0.25rem;">
          Comparacion Detallada con Plantilla de Reposo y ECG Educativo (RF24)
        </h3>
        <p style="font-size: 0.85rem; color: var(--color-muted); margin-bottom: 0;">
          Compara la medicion tomada (PPG) con el ECG de referencia y la plantilla estandar de reposo.
        </p>
      </div>

      <!-- Modos rapidos de comparacion -->
      <div style="display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap;">
        <button
          @click="setMode('ecg-only')"
          class="btn"
          :class="currentMode === 'ecg-only' ? 'btn-primary' : 'btn-secondary'"
          style="font-size: 0.8rem; padding: 0.35rem 0.75rem;"
        >
          Medicion vs ECG
        </button>
        <button
          @click="setMode('template-only')"
          class="btn"
          :class="currentMode === 'template-only' ? 'btn-primary' : 'btn-secondary'"
          style="font-size: 0.8rem; padding: 0.35rem 0.75rem;"
        >
          Medicion vs Reposo (72 BPM)
        </button>
        <button
          @click="setMode('all')"
          class="btn"
          :class="currentMode === 'all' ? 'btn-primary' : 'btn-secondary'"
          style="font-size: 0.8rem; padding: 0.35rem 0.75rem;"
        >
          Ver Todas (3 Senales)
        </button>
      </div>
    </div>

    <!-- Barra de control: Capas visibles -->
    <div style="display: flex; justify-content: space-between; align-items: center; gap: 1rem; font-size: 0.8rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
      <span style="color: var(--color-muted); font-size: 0.8rem;">
        Grafica ampliada con escala sincronizada
      </span>

      <!-- Toggles manuales de visibilidad de capas -->
      <div style="display: flex; gap: 1rem; align-items: center; flex-wrap: wrap;">
        <label style="display: flex; align-items: center; gap: 0.35rem; cursor: pointer; user-select: none;">
          <input type="checkbox" v-model="showPatient">
          <span style="color: var(--color-success); font-weight: 600;">Medicion Tomada</span>
        </label>
        <label style="display: flex; align-items: center; gap: 0.35rem; cursor: pointer; user-select: none;">
          <input type="checkbox" v-model="showResting">
          <span style="color: #0284c7; font-weight: 600;">Plantilla Reposo</span>
        </label>
        <label style="display: flex; align-items: center; gap: 0.35rem; cursor: pointer; user-select: none;">
          <input type="checkbox" v-model="showEcg">
          <span style="color: #6366f1; font-weight: 600;">ECG Educativo</span>
        </label>
      </div>
    </div>

    <!-- 1. Grafico Didactico SVG con Medicion + Plantilla + ECG (Fijo en 380px ampliado) -->
    <div
      class="chart-box"
      style="background: #070a13; border: 1px solid var(--color-border); border-radius: 0.5rem; overflow: hidden; padding: 0.75rem 0.5rem 0.25rem 0.5rem;"
    >
      <svg style="width: 100%; height: 100%;" viewBox="0 0 600 240" preserveAspectRatio="none">
        <!-- Rejilla vertical para division de tiempo (cada 0.5s en ventana de 2.5s) -->
        <g stroke="#1a2234" stroke-width="1" stroke-dasharray="3,3">
          <line x1="120" y1="15" x2="120" y2="200" />
          <line x1="240" y1="15" x2="240" y2="200" />
          <line x1="360" y1="15" x2="360" y2="200" />
          <line x1="480" y1="15" x2="480" y2="200" />
        </g>

        <!-- Linea base principal -->
        <line x1="0" y1="195" x2="600" y2="195" stroke="#334155" stroke-width="1.2" />

        <!-- Etiquetas de escala de tiempo en el eje horizontal -->
        <g fill="#64748b" font-size="8.5" font-family="monospace">
          <text x="10" y="222">0.0 s</text>
          <text x="120" y="222" text-anchor="middle">0.5 s</text>
          <text x="240" y="222" text-anchor="middle">1.0 s</text>
          <text x="360" y="222" text-anchor="middle">1.5 s</text>
          <text x="480" y="222" text-anchor="middle">2.0 s</text>
          <text x="585" y="222" text-anchor="end">2.5 s</text>
        </g>

        <!-- 1. Curva ECG Didactica de Referencia (violeta) -->
        <path
          v-if="showEcg"
          :d="ecgPath"
          fill="none"
          stroke="#818cf8"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- 2. Curva Plantilla PPG en Reposo a 72 BPM (cyan punteada) -->
        <path
          v-if="showResting"
          :d="restingPpgPath"
          fill="none"
          stroke="#06b6d4"
          stroke-width="2.2"
          stroke-dasharray="5,5"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- 3. Curva de la Medicion Tomada (verde solida) -->
        <path
          v-if="showPatient"
          :d="patientPpgPath"
          fill="none"
          stroke="#22c55e"
          stroke-width="2.8"
          stroke-linecap="round"
          stroke-linejoin="round"
        />

        <!-- Fila horizontal de etiquetas didacticas (uno al lado del otro en filita) -->
        <!-- 1. Cuadradito: Pico R (ECG) -->
        <g v-if="showEcg">
          <rect x="10" y="8" width="76" height="20" rx="3" fill="#1e1b4b" stroke="#4338ca" stroke-width="0.8" />
          <text x="48" y="21" fill="#c7d2fe" font-size="9" font-family="sans-serif" font-weight="600" text-anchor="middle">Pico R (ECG)</text>
          <!-- Linea guia hacia el pico R del ECG -->
          <line :x1="rPeakX" y1="28" :x2="rPeakX" y2="90" stroke="#818cf8" stroke-width="1" stroke-dasharray="2,2" />
        </g>

        <!-- 2. Cuadradito: Pico Sistolico (Sensor) -->
        <g v-if="showPatient">
          <rect x="92" y="8" width="124" height="20" rx="3" fill="#064e3b" stroke="#059669" stroke-width="0.8" />
          <text x="154" y="21" fill="#a7f3d0" font-size="9" font-family="sans-serif" font-weight="600" text-anchor="middle">Pico Sistolico (Sensor)</text>
          <!-- Linea guia hacia el pico sistolico PPG -->
          <line :x1="ppgPeakX" y1="28" :x2="ppgPeakX" y2="90" stroke="#22c55e" stroke-width="1" stroke-dasharray="2,2" />
        </g>

        <!-- 3. Cuadradito: Retardo PTT ~190 ms -->
        <g v-if="showEcg && showPatient">
          <rect x="222" y="8" width="118" height="20" rx="3" fill="#450a0a" stroke="#991b1b" stroke-width="0.8" />
          <text x="281" y="21" fill="#fca5a5" font-size="8.5" font-family="monospace" text-anchor="middle">Retardo PTT ~190 ms</text>

          <!-- Flecha indicadora de intervalo PTT entre ambos picos -->
          <line :x1="rPeakX" y1="44" :x2="ppgPeakX" y2="44" stroke="#f87171" stroke-width="1.4" />
          <polygon :points="`${ppgPeakX},44 ${ppgPeakX - 5},40 ${ppgPeakX - 5},48`" fill="#f87171" />
          <text :x="(rPeakX + ppgPeakX) / 2" y="39" fill="#fca5a5" font-size="7.5" font-family="monospace" text-anchor="middle">PTT</text>
        </g>
      </svg>
    </div>

    <!-- Leyenda interactiva en barra externa (no tapa las curvas del grafico) -->
    <div style="display: flex; gap: 1.25rem; font-size: 0.8rem; background: #0c1222; padding: 0.6rem 1rem; border-radius: 0 0 0.5rem 0.5rem; border: 1px solid var(--color-border); border-top: none; margin-bottom: 1.25rem; flex-wrap: wrap;">
      <div v-if="showPatient" style="display: flex; align-items: center; gap: 0.4rem;">
        <span style="display: inline-block; width: 14px; height: 3.5px; background: #22c55e; border-radius: 2px;"></span>
        <span style="color: #86efac; font-weight: 600;">Medicion Tomada ({{ currentBpm }} BPM)</span>
      </div>
      <div v-if="showResting" style="display: flex; align-items: center; gap: 0.4rem;">
        <span style="display: inline-block; width: 14px; border-top: 2.5px dashed #06b6d4;"></span>
        <span style="color: #67e8f9; font-weight: 600;">Plantilla Reposo PPG (72 BPM)</span>
      </div>
      <div v-if="showEcg" style="display: flex; align-items: center; gap: 0.4rem;">
        <span style="display: inline-block; width: 14px; height: 3px; background: #818cf8; border-radius: 2px;"></span>
        <span style="color: #a5b4fc; font-weight: 600;">ECG Educativo de Referencia</span>
      </div>
    </div>

    <!-- 2. Comparacion Directa: Medicion Tomada vs ECG Educativo -->
    <div style="background: #f8fafc; border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 1rem; margin-bottom: 1.25rem;">
      <h4 style="font-size: 0.95rem; font-weight: 600; color: var(--color-text); margin-bottom: 0.5rem;">
        Analisis Comparativo: Medicion Tomada con Sensor vs ECG Educativo
      </h4>
      <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(220px, 100%), 1fr)); gap: 1rem; font-size: 0.85rem;">
        <div>
          <span style="color: var(--color-muted);">Frecuencia y Ritmo:</span>
          <div style="font-weight: 600; margin-top: 0.15rem; color: var(--color-text);">
            {{ currentBpm }} BPM (Medicion) vs 72 BPM (ECG Ref.)
          </div>
          <div style="font-size: 0.75rem; color: var(--color-muted); margin-top: 0.2rem;">
            Diferencia de frecuencia: {{ diffBpmText }}
          </div>
        </div>

        <div>
          <span style="color: var(--color-muted);">Intervalo entre Latidos:</span>
          <div style="font-weight: 600; margin-top: 0.15rem; color: var(--color-text);">
            {{ lastIntervalMs }} ms vs 833 ms (Intervalo R-R)
          </div>
          <div style="font-size: 0.75rem; color: var(--color-muted); margin-top: 0.2rem;">
            Variacion de duracion: {{ diffIntervalText }}
          </div>
        </div>

        <div>
          <span style="color: var(--color-muted);">Desfase Fisiologico (PTT):</span>
          <div style="font-weight: 600; margin-top: 0.15rem; color: #b91c1c;">
            Retardo promedio de ~180 - 220 ms
          </div>
          <div style="font-size: 0.75rem; color: var(--color-muted); margin-top: 0.2rem;">
            El pico R electrico precede a la cresta sistolica arterial periferica.
          </div>
        </div>
      </div>
    </div>

    <!-- 3. Tabla Comparativa Exhaustiva de Parametros (RF24) -->
    <!-- Escritorio y tablet: tabla completa (con desplazamiento lateral solo dentro de la tabla si hace falta) -->
    <div class="tabla-escritorio" style="margin-bottom: 1.25rem;">
      <table style="width: 100%; min-width: 560px; border-collapse: collapse; text-align: left; font-size: 0.85rem;">
        <thead>
          <tr style="background: var(--color-bg); border-bottom: 2px solid var(--color-border); color: var(--color-muted); font-size: 0.75rem; text-transform: uppercase;">
            <th style="padding: 0.6rem;">Criterio</th>
            <th style="padding: 0.6rem; color: var(--color-success);">Medicion Tomada (Sensor)</th>
            <th style="padding: 0.6rem; color: #6366f1;">ECG Educativo (Electrico)</th>
            <th style="padding: 0.6rem; color: #0284c7;">Plantilla Reposo PPG (RF24)</th>
          </tr>
        </thead>
        <tbody style="border-bottom: 1px solid var(--color-border);">
          <tr v-for="f in filasTabla" :key="f.criterio" style="border-bottom: 1px solid var(--color-border);">
            <td style="padding: 0.6rem; font-weight: 600;">{{ f.criterio }}</td>
            <td :style="'padding: 0.6rem;' + (f.mono ? 'font-family: monospace; font-weight: 600;' : '') + 'color:' + (f.mono ? 'var(--color-success)' : 'var(--color-text)')">{{ f.medicion }}</td>
            <td :style="'padding: 0.6rem;' + (f.mono ? 'font-family: monospace;' : '') + 'color:' + (f.mono ? '#6366f1' : 'var(--color-muted)')">{{ f.ecg }}</td>
            <td :style="'padding: 0.6rem;' + (f.mono ? 'font-family: monospace; font-weight: 600;' : '') + 'color:' + (f.mono ? '#0284c7' : 'var(--color-muted)')">{{ f.plantilla }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Móvil (RNF01): solo criterio y medición; "Ver más" despliega hacia abajo el ECG y la plantilla -->
    <ul class="tabla-movil" style="list-style: none; margin-bottom: 1.25rem; border: 1px solid var(--color-border); border-radius: 0.5rem;">
      <li v-for="(f, i) in filasTabla" :key="f.criterio" class="fila-movil" :class="{ 'fila-movil-ultima': i === filasTabla.length - 1 }">
        <div class="fila-movil-cabecera">
          <span class="fila-movil-criterio">{{ f.criterio }}</span>
          <span class="fila-movil-valor" :style="f.mono ? 'font-family: monospace; font-weight: 600; color: var(--color-success);' : 'color: var(--color-text);'">{{ f.medicion }}</span>
        </div>
        <button
          type="button"
          class="btn btn-secondary fila-movil-boton"
          :aria-expanded="abiertas[f.criterio] ? 'true' : 'false'"
          :aria-controls="'detalle-' + i"
          @click="abiertas[f.criterio] = !abiertas[f.criterio]"
        >
          {{ abiertas[f.criterio] ? 'Ver menos' : 'Ver más' }}
        </button>
        <dl v-show="abiertas[f.criterio]" :id="'detalle-' + i" class="fila-movil-detalle">
          <div>
            <dt style="color: #6366f1;">ECG Educativo (Electrico)</dt>
            <dd>{{ f.ecg }}</dd>
          </div>
          <div>
            <dt style="color: #0284c7;">Plantilla Reposo PPG (RF24)</dt>
            <dd>{{ f.plantilla }}</dd>
          </div>
        </dl>
      </li>
    </ul>

    <!-- 4. Bloques Explicativos Didacticos (RF24) -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr)); gap: 0.75rem; font-size: 0.8rem; color: var(--color-muted);">
      <div style="padding: 0.75rem; background: var(--color-bg); border-radius: 0.5rem; border: 1px solid var(--color-border);">
        <b style="color: var(--color-text);">1. Por que se compara con el ECG?</b>
        <p style="margin-top: 0.25rem;">
          El ECG es el estandar clinico de oro de la actividad cardiaca. Al compararlo con la medicion tomada por el MAX30102, los estudiantes pueden visualizar que cada latido se inicia con una senal electrica antes de que la onda de presion sanguinea llegue al dedo.
        </p>
      </div>

      <div style="padding: 0.75rem; background: var(--color-bg); border-radius: 0.5rem; border: 1px solid var(--color-border);">
        <b style="color: var(--color-text);">2. Que es el Retardo PTT?</b>
        <p style="margin-top: 0.25rem;">
          El Tiempo de Transito del Pulso (PTT) es el intervalo entre la despolarizacion ventricular (onda R) y la cresta del pulso arterial en el dedo. Depende de la distancia anatomica y la elasticidad vascular (~180 a 220 ms).
        </p>
      </div>

      <div style="padding: 0.75rem; background: var(--color-bg); border-radius: 0.5rem; border: 1px solid var(--color-border);">
        <b style="color: var(--color-text);">3. Comparacion con la Plantilla de Reposo</b>
        <p style="margin-top: 0.25rem;">
          La plantilla de 72 BPM sirve para verificar de un vistazo si la medicion tomada esta acelerada (taquicardia), dentro del rango fisiologico de reposo (60-80 BPM) o reducida (bradicardia).
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { ppgWaveform, ecgEducationalWaveform } from '../utils/ppgMath.js'

const props = defineProps({
  currentBpm: { type: Number, default: 78 },
  lastIntervalMs: { type: Number, default: 769 },
  amplitude: { type: Number, default: 100 }
})

const currentMode = ref('all')
const showPatient = ref(true)
const showResting = ref(true)
const showEcg = ref(true)

function setMode(mode) {
  currentMode.value = mode
  if (mode === 'ecg-only') {
    showPatient.value = true
    showEcg.value = true
    showResting.value = false
  } else if (mode === 'template-only') {
    showPatient.value = true
    showResting.value = true
    showEcg.value = false
  } else {
    showPatient.value = true
    showResting.value = true
    showEcg.value = true
  }
}

// Filas de la tabla comparativa (se usan en la tabla de escritorio y en la lista móvil)
const filasTabla = computed(() => [
  { criterio: 'Frecuencia Cardiaca', mono: true,
    medicion: `${props.currentBpm} BPM`, ecg: '72 BPM (Referencia)', plantilla: '72 BPM (Fisiologico)' },
  { criterio: 'Periodo / Ciclo', mono: true,
    medicion: `${props.lastIntervalMs} ms`, ecg: '833 ms (Intervalo R-R)', plantilla: '833 ms (Intervalo P-P)' },
  { criterio: 'Naturaleza del Fenomeno', mono: false,
    medicion: 'Hemodinamico: Variacion del volumen de sangre en tejido periferico',
    ecg: 'Bioelectrico: Despolarizacion y repolarizacion del miocardio',
    plantilla: 'Modelo teorico hemodinamico' },
  { criterio: 'Principio de Medicion', mono: false,
    medicion: 'Luz infrarroja y roja reflejada (MAX30102)',
    ecg: 'Diferencia de potencial superficial en milivoltios (mV)',
    plantilla: 'Curva gaussiana parametrizada' },
  { criterio: 'Morfologia Principal', mono: false,
    medicion: 'Pico sistolico, muesca dicrota e inflexion diastolica',
    ecg: 'Onda P (auriculas), complejo QRS (ventriculos), onda T',
    plantilla: 'Estandar normocardico limpio' }
])

// Filas abiertas con "Ver más" en la lista móvil
const abiertas = ref({})

const diffBpm = computed(() => props.currentBpm - 72)
const diffBpmText = computed(() => {
  if (diffBpm.value === 0) return 'Identico al ECG de referencia (72 BPM)'
  return `${diffBpm.value > 0 ? '+' : ''}${diffBpm.value} BPM respecto a la referencia`
})

const diffInterval = computed(() => props.lastIntervalMs - 833)
const diffIntervalText = computed(() => {
  if (diffInterval.value === 0) return 'Identico al ciclo de referencia (833 ms)'
  return `${diffInterval.value > 0 ? '+' : ''}${diffInterval.value} ms respecto al ciclo`
})

// Duracion de la ventana didactica: 2.5 segundos
const windowSec = 2.5
const sampleCount = 260

// Posiciones calculadas dinamicamente para el primer pico R del ECG y el primer pico sistolico PPG
const rPeakX = computed(() => {
  // Pico R en fase 0.15 a 72 BPM
  const rTimeSec = 0.15 * (60 / 72)
  return Math.round((rTimeSec / windowSec) * 580 + 10)
})

const ppgPeakX = computed(() => {
  // Pico sistolico en fase 0.38 al BPM actual
  const periodSec = 60 / Math.max(30, props.currentBpm)
  const ppgTimeSec = 0.38 * periodSec
  return Math.round((ppgTimeSec / windowSec) * 580 + 10)
})

// 1. Curva de la medicion tomada
const patientPpgPath = computed(() => {
  const periodSec = 60 / Math.max(30, props.currentBpm)
  const ampFactor = props.amplitude / 100
  const points = []

  for (let i = 0; i <= sampleCount; i++) {
    const x = (i / sampleCount) * 580 + 10
    const tSec = (i / sampleCount) * windowSec
    const phase = (tSec / periodSec) % 1.0
    const val = ppgWaveform(phase) * ampFactor
    // Linea base en y = 195, cresta sistolica en y = 90
    const y = 195 - val * 105
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return `M ${points.join(' L ')}`
})

// 2. Curva de la plantilla de reposo (72 BPM)
const restingPpgPath = computed(() => {
  const periodSec = 60 / 72
  const points = []

  for (let i = 0; i <= sampleCount; i++) {
    const x = (i / sampleCount) * 580 + 10
    const tSec = (i / sampleCount) * windowSec
    const phase = (tSec / periodSec) % 1.0
    const val = ppgWaveform(phase)
    const y = 195 - val * 105
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return `M ${points.join(' L ')}`
})

// 3. Curva ECG didactica sincronizada (72 BPM)
const ecgPath = computed(() => {
  const periodSec = 60 / 72
  const points = []

  for (let i = 0; i <= sampleCount; i++) {
    const x = (i / sampleCount) * 580 + 10
    const tSec = (i / sampleCount) * windowSec
    const phase = (tSec / periodSec) % 1.0
    const val = ecgEducationalWaveform(phase)
    // Linea base en y = 175, pico R sube hasta y = 90
    const y = 175 - val * 85
    points.push(`${x.toFixed(1)},${y.toFixed(1)}`)
  }
  return `M ${points.join(' L ')}`
})
</script>

<style scoped>
.fila-movil { padding: 0.75rem; border-bottom: 1px solid var(--color-border); }
.fila-movil-ultima { border-bottom: none; }
.fila-movil-cabecera { display: flex; flex-direction: column; gap: 0.2rem; margin-bottom: 0.5rem; }
.fila-movil-criterio { font-weight: 600; font-size: 0.95rem; }
.fila-movil-valor { font-size: 0.95rem; }
.fila-movil-boton { width: 100%; font-size: 0.9rem; }
.fila-movil-detalle { margin: 0.75rem 0 0; display: grid; gap: 0.75rem; }
.fila-movil-detalle dt { font-size: 0.8rem; font-weight: 600; text-transform: uppercase; }
.fila-movil-detalle dd { margin: 0.15rem 0 0; font-size: 0.95rem; color: var(--color-text); }
</style>
