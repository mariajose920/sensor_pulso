<template>
  <div class="card" style="padding: 0; overflow: hidden; margin-bottom: 1.5rem; background: #070a13; border: 1px solid var(--color-border);">
    <!-- Barra superior de estado -->
    <div style="padding: 0.6rem 1rem; background: #0c1222; border-bottom: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #cbd5e1;">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%;" :style="{ backgroundColor: isRunning ? '#22c55e' : '#64748b' }"></span>
        <span style="font-weight: 600;">
          {{ isRunning ? 'Senal Viva: Sensor ESP32 (MAX30102)' : 'Esperando senal del sensor' }}
        </span>
      </div>

      <div style="display: flex; align-items: center; gap: 1rem; font-family: monospace; font-size: 0.75rem;">
        <label style="display: flex; align-items: center; gap: 0.4rem; cursor: pointer;">
          <input type="checkbox" v-model="showTemplate">
          <span>Superponer Plantilla PPG de Reposo (RF24)</span>
        </label>
        <span style="color: #64748b;">|</span>
        <span style="color: #94a3b8;">{{ sampleCount }} muestras</span>
      </div>
    </div>

    <!-- Canvas -->
    <div style="position: relative; width: 100%; height: 280px;">
      <canvas ref="canvasRef" style="width: 100%; height: 100%; display: block;"></canvas>

      <div v-if="!isRunning && buffer.length === 0" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; color: #64748b; background: rgba(7, 10, 19, 0.7);">
        Conecta el sensor ESP32 por USB para recibir la senal viva y compararla con la plantilla de reposo.
      </div>

      <!-- Leyenda inferior -->
      <div style="position: absolute; bottom: 8px; left: 12px; display: flex; gap: 1rem; font-size: 0.75rem; background: rgba(12, 18, 34, 0.9); padding: 4px 10px; border-radius: 4px; border: 1px solid #1e293b;">
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="display: inline-block; width: 14px; height: 2px; background: #22c55e;"></span>
          <span style="color: #86efac;">Senal del Sensor</span>
        </div>
        <div v-if="showTemplate" style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="display: inline-block; width: 14px; border-top: 2px dashed #06b6d4;"></span>
          <span style="color: #67e8f9;">Plantilla PPG Reposo (72 BPM)</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'
import { ppgWaveform } from '../utils/ppgMath.js'

const props = defineProps({
  isRunning: { type: Boolean, default: false }
})

const canvasRef = ref(null)
const showTemplate = ref(true)
const sampleCount = ref(0)

const MAX_SAMPLES = 400
const buffer = []

let animationFrameId = null
let ctx = null
let width = 0
let height = 0

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

function addSample(value) {
  sampleCount.value++
  buffer.push(value)
  if (buffer.length > MAX_SAMPLES) {
    buffer.shift()
  }
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
}

function drawTemplateOverlay() {
  if (!showTemplate.value || width === 0) return

  ctx.save()
  ctx.strokeStyle = 'rgba(6, 182, 212, 0.75)'
  ctx.lineWidth = 2
  ctx.setLineDash([5, 5])

  ctx.beginPath()
  const cycles = MAX_SAMPLES / ((60000 / 72) / 10)

  for (let i = 0; i <= MAX_SAMPLES; i += 2) {
    const x = (i / MAX_SAMPLES) * width
    const phase = ((i / MAX_SAMPLES) * cycles) % 1.0
    const val = ppgWaveform(phase)
    const y = height - (val * (height * 0.68) + height * 0.16)

    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

function drawWave() {
  if (buffer.length < 2) return

  let min = Math.min(...buffer)
  let max = Math.max(...buffer)
  if (max - min < 10) max = min + 10

  ctx.save()
  ctx.strokeStyle = '#22c55e'
  ctx.lineWidth = 2.2

  ctx.beginPath()
  const dx = width / MAX_SAMPLES

  for (let i = 0; i < buffer.length; i++) {
    const x = i * dx
    const norm = (buffer[i] - min) / (max - min)
    const y = height - (norm * (height * 0.68) + height * 0.16)

    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()
}

function render() {
  if (ctx && width > 0) {
    drawGrid()
    drawTemplateOverlay()
    drawWave()
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

defineExpose({
  addSample,
  clear: () => {
    buffer.length = 0
    sampleCount.value = 0
  }
})
</script>
