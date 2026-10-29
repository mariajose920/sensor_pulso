<template>
  <div class="card" style="padding: 0; overflow: hidden; margin-bottom: 1.5rem; background: #070a13; border: 1px solid var(--color-border);">
    <!-- Barra superior de estado -->
    <div style="padding: 0.6rem 1rem; background: #0c1222; border-bottom: 1px solid #1e293b; display: flex; justify-content: space-between; align-items: center; font-size: 0.8rem; color: #cbd5e1;">
      <div style="display: flex; align-items: center; gap: 0.5rem;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%;" :style="{ backgroundColor: isRunning ? '#22c55e' : '#64748b' }"></span>
        <span style="font-weight: 600;">
          {{ isRunning ? 'Senal Viva: Sensor ESP32 (MAX30102)' : 'Esperando senal del sensor' }}
        </span>
        <span style="font-size: 0.7rem; padding: 2px 6px; border-radius: 4px; background: #172554; color: #93c5fd; border: 1px solid #1e40af;">
          Filtro DC Activo (Paso Alto + Inversion)
        </span>
      </div>

      <div style="display: flex; align-items: center; gap: 1rem; font-family: monospace; font-size: 0.75rem;">
        <span style="color: #94a3b8;">{{ sampleCount }} muestras</span>
      </div>
    </div>

    <!-- Canvas -->
    <div style="position: relative; width: 100%; height: 280px;">
      <canvas ref="canvasRef" style="width: 100%; height: 100%; display: block;"></canvas>

      <div v-if="!isRunning && buffer.length === 0" style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; font-size: 0.85rem; color: #64748b; background: rgba(7, 10, 19, 0.7);">
        Conecta el sensor ESP32 por USB y posa tu dedo sobre el sensor para detectar los picos sistolicos.
      </div>

      <!-- Leyenda inferior -->
      <div style="position: absolute; bottom: 8px; left: 12px; display: flex; gap: 1rem; font-size: 0.75rem; background: rgba(12, 18, 34, 0.9); padding: 4px 10px; border-radius: 4px; border: 1px solid #1e293b;">
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="display: inline-block; width: 14px; height: 2px; background: #22c55e;"></span>
          <span style="color: #86efac;">Senal de Pulso Filtrada (AC)</span>
        </div>
        <div style="display: flex; align-items: center; gap: 0.4rem;">
          <span style="display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: #ef4444;"></span>
          <span style="color: #fca5a5;">Picos Sistolicos Detectados (RF17)</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  isRunning: { type: Boolean, default: false }
})

const canvasRef = ref(null)
const sampleCount = ref(0)

const MAX_SAMPLES = 400
const buffer = []
const peakMarkers = [] // Indices de picos detectados

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

function addSample(normValue, isPeak = false) {
  sampleCount.value++
  buffer.push(normValue)
  if (buffer.length > MAX_SAMPLES) {
    buffer.shift()
    for (let i = peakMarkers.length - 1; i >= 0; i--) {
      peakMarkers[i]--
      if (peakMarkers[i] < 0) {
        peakMarkers.splice(i, 1)
      }
    }
  }

  if (isPeak) {
    // Ventana adaptativa de 10 muestras (100 ms a 100 Hz): cubre cualquier retardo
    // de pendiente o meseta sistolica sin invadir la onda dicrota (a >180 ms).
    const ventana = Math.min(10, buffer.length - 1)
    let maxVal = -Infinity
    const maxIndices = []
    for (let k = buffer.length - 1 - ventana; k <= buffer.length - 1; k++) {
      if (buffer[k] > maxVal + 0.001) {
        maxVal = buffer[k]
        maxIndices.length = 0
        maxIndices.push(k)
      } else if (Math.abs(buffer[k] - maxVal) <= 0.001) {
        maxIndices.push(k)
      }
    }
    // Si la cuspide es plana (meseta), toma el indice central exacto
    const midIdx = maxIndices.length > 0
      ? maxIndices[Math.floor(maxIndices.length / 2)]
      : buffer.length - 1
    peakMarkers.push(midIdx)
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

  // Linea central
  ctx.strokeStyle = '#1e293b'
  ctx.beginPath()
  ctx.moveTo(0, height / 2)
  ctx.lineTo(width, height / 2)
  ctx.stroke()
}

function drawWave() {
  if (buffer.length < 2) return

  ctx.save()
  ctx.strokeStyle = '#22c55e' // Verde solido
  ctx.lineWidth = 2.2
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'

  ctx.beginPath()
  const dx = width / MAX_SAMPLES

  for (let i = 0; i < buffer.length; i++) {
    const x = i * dx
    const norm = buffer[i]
    // Mapeo centrado en el lienzo
    const y = height - (norm * (height * 0.76) + height * 0.12)

    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()
  ctx.restore()

  // Dibujar picos sistolicos detectados (Puntos rojos del RF17)
  ctx.save()
  ctx.fillStyle = '#ef4444'
  for (const pIdx of peakMarkers) {
    if (pIdx >= 0 && pIdx < buffer.length) {
      const px = pIdx * dx
      const norm = buffer[pIdx]
      const py = height - (norm * (height * 0.76) + height * 0.12)

      ctx.beginPath()
      ctx.arc(px, py, 4.5, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

function render() {
  if (ctx && width > 0) {
    drawGrid()
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
    peakMarkers.length = 0
    sampleCount.value = 0
  }
})
</script>
