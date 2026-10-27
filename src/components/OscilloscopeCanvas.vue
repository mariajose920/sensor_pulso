<template>
  <div class="card" style="padding: 0; overflow: hidden; margin-bottom: 1.5rem; background: #070a13; border: 1px solid var(--color-border);">
    <!-- Barra superior de estado y selectores de capas -->
    <div style="padding: 0.6rem 1rem; background: #0c1222; border-bottom: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #cbd5e1; flex-wrap: wrap; gap: 0.75rem;">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background-color: #22c55e;"></span>
        <span style="font-weight: 600;">
          Osciloscopio Comparativo en Tiempo Real
        </span>
      </div>

      <!-- Toggles para superposicion de senales (Medicion, Plantilla Reposo, ECG) -->
      <div style="display: flex; align-items: center; gap: 1rem; font-size: 0.75rem; flex-wrap: wrap;">
        <label style="display: flex; align-items: center; gap: 0.35rem; cursor: pointer; user-select: none;">
          <input type="checkbox" v-model="showPatient">
          <span style="color: #4ade80; font-weight: 600;">Medicion Tomada ({{ bpm }} BPM)</span>
        </label>

        <label style="display: flex; align-items: center; gap: 0.35rem; cursor: pointer; user-select: none;">
          <input type="checkbox" v-model="showTemplate">
          <span style="color: #67e8f9; font-weight: 600;">Plantilla PPG Reposo (72 BPM)</span>
        </label>

        <label style="display: flex; align-items: center; gap: 0.35rem; cursor: pointer; user-select: none;">
          <input type="checkbox" v-model="showEcg">
          <span style="color: #a5b4fc; font-weight: 600;">ECG Educativo de Referencia</span>
        </label>
      </div>
    </div>

    <!-- Canvas del osciloscopio -->
    <div style="position: relative; width: 100%; height: 300px;">
      <canvas ref="canvasRef" style="width: 100%; height: 100%; display: block;"></canvas>

      <!-- Leyenda flotante interactiva -->
      <div style="position: absolute; bottom: 8px; left: 12px; display: flex; gap: 1rem; font-size: 0.75rem; background: rgba(12, 18, 34, 0.95); padding: 5px 12px; border-radius: 4px; border: 1px solid #1e293b; flex-wrap: wrap;">
        <div v-if="showPatient" style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="display: inline-block; width: 14px; height: 3px; background: #22c55e;"></span>
          <span style="color: #86efac; font-weight: 500;">{{ measurementName }} ({{ bpm }} BPM)</span>
        </div>
        <div v-if="showTemplate" style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="display: inline-block; width: 14px; border-top: 2px dashed #06b6d4;"></span>
          <span style="color: #67e8f9; font-weight: 500;">Plantilla Reposo PPG (72 BPM)</span>
        </div>
        <div v-if="showEcg" style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="display: inline-block; width: 14px; height: 2.5px; background: #818cf8;"></span>
          <span style="color: #a5b4fc; font-weight: 500;">ECG Educativo (Complejo QRS)</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ppgWaveform, ecgEducationalWaveform } from '../utils/ppgMath.js'

const props = defineProps({
  bpm: { type: Number, default: 78 },
  amplitude: { type: Number, default: 100 },
  measurementName: { type: String, default: 'Medicion Tomada' }
})

const canvasRef = ref(null)
const showPatient = ref(true)
const showTemplate = ref(true)
const showEcg = ref(true)

let animationFrameId = null
let ctx = null
let width = 0
let height = 0
let offsetTime = 0 // Animacion continua de desplazamiento

function resizeCanvas() {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const dpr = window.devicePixelRatio || 1
  width = rect.width
  height = rect.height
  canvas.width = width * dpr
  canvas.height = height * dpr
  ctx = canvas.getContext('2d')
  ctx.scale(dpr, dpr)
}

function drawGrid() {
  ctx.fillStyle = '#070a13'
  ctx.fillRect(0, 0, width, height)

  ctx.lineWidth = 1
  ctx.strokeStyle = '#121929'
  const gridSize = 25

  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }

  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }

  // Linea base principal
  ctx.strokeStyle = '#1e293b'
  ctx.beginPath()
  ctx.moveTo(0, height * 0.85)
  ctx.lineTo(width, height * 0.85)
  ctx.stroke()
}

/**
 * 1. Curva ECG Educativa de Referencia (violeta)
 * Muestra el complejo bioelectrico con su onda R previa a la eyeccion sanguinea
 */
function drawEducationalEcg() {
  if (!showEcg.value || width === 0) return

  ctx.save()
  ctx.strokeStyle = '#818cf8' // Violeta
  ctx.lineWidth = 2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  // El ECG de referencia corre al ritmo del reposo o sincronizado
  const restingPeriodSec = 60 / 72
  const windowDurationSec = 4.0

  ctx.beginPath()
  for (let x = 0; x <= width; x += 2) {
    const tSeconds = (x / width) * windowDurationSec + offsetTime
    const phase = (tSeconds / restingPeriodSec) % 1.0
    const val = ecgEducationalWaveform(phase)

    // Escala del ECG: base centrada en 68% de altura
    const y = height * 0.70 - val * (height * 0.42)

    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * 2. Plantilla PPG Normal en Reposo (72 BPM) (cyan punteado)
 */
function drawTemplate() {
  if (!showTemplate.value || width === 0) return

  ctx.save()
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.85)' // Cyan
  ctx.lineWidth = 2
  ctx.setLineDash([6, 5])

  const restingPeriodSec = 60 / 72
  const windowDurationSec = 4.0

  ctx.beginPath()
  for (let x = 0; x <= width; x += 2) {
    const tSeconds = (x / width) * windowDurationSec + offsetTime
    const phase = (tSeconds / restingPeriodSec) % 1.0
    const val = ppgWaveform(phase)
    const y = height - (val * (height * 0.60) + height * 0.15)

    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

/**
 * 3. Medicion Tomada del Paciente (verde solida)
 */
function drawPatientMeasurement() {
  if (!showPatient.value || width === 0) return

  ctx.save()
  ctx.strokeStyle = '#22c55e' // Verde
  ctx.lineWidth = 2.4
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  const patientPeriodSec = 60 / Math.max(30, props.bpm)
  const windowDurationSec = 4.0
  const ampFactor = props.amplitude / 100

  ctx.beginPath()
  for (let x = 0; x <= width; x += 2) {
    const tSeconds = (x / width) * windowDurationSec + offsetTime
    const phase = (tSeconds / patientPeriodSec) % 1.0
    const val = ppgWaveform(phase) * ampFactor
    const y = height - (val * (height * 0.60) + height * 0.15)

    if (x === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

function render() {
  if (ctx && width > 0) {
    drawGrid()
    drawEducationalEcg()
    drawTemplate()
    drawPatientMeasurement()
    offsetTime += 0.003
  }
  animationFrameId = requestAnimationFrame(render)
}

onMounted(() => {
  resizeCanvas()
  window.addEventListener('resize', resizeCanvas)
  animationFrameId = requestAnimationFrame(render)
})

onUnmounted(() => {
  window.removeEventListener('resize', resizeCanvas)
  if (animationFrameId) cancelAnimationFrame(animationFrameId)
})
</script>