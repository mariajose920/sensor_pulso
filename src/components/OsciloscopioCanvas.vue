<template>
  <div class="oscilloscope-container">
    <div class="oscilloscope-header">
      <div class="title-section">
        <span class="scope-led" :class="{ active: activo }"></span>
        <span class="scope-title">Osciloscopio PPG (Canal {{ canal }}) · Recepción WiFi</span>
      </div>
      <div class="scope-controls">
        <label class="toggle-trace">
          <input type="checkbox" v-model="mostrarIr" />
          <span class="color-dot dot-ir"></span> IR (Fotodiodo Infrarrojo)
        </label>
        <label class="toggle-trace">
          <input type="checkbox" v-model="mostrarRojo" />
          <span class="color-dot dot-rojo"></span> Rojo (Fotodiodo 660nm)
        </label>
      </div>
    </div>

    <div class="canvas-wrapper">
      <canvas ref="canvasRef" class="oscilloscope-canvas"></canvas>
      <div v-if="!activo" class="no-signal-overlay">
        <p>⚠️ Esperando paquetes WiFi del ESP32...</p>
        <small>Conecta el ESP32 o activa el simulador para visualizar la señal</small>
      </div>
    </div>

    <div class="oscilloscope-footer">
      <span>Muestras: {{ muestrasIr.length }} pts</span>
      <span>Frecuencia: {{ frecuenciaHz }} Hz</span>
      <span>Base temporal: ~5s</span>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, watch } from 'vue'

const props = defineProps({
  canal: {
    type: Number,
    default: 1
  },
  activo: {
    type: Boolean,
    default: false
  },
  muestrasIr: {
    type: Array,
    default: () => []
  },
  muestrasRojo: {
    type: Array,
    default: () => []
  },
  frecuenciaHz: {
    type: Number,
    default: 50
  }
})

const canvasRef = ref(null)
const mostrarIr = ref(true)
const mostrarRojo = ref(true)
let animationId = null

function dibujar() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height

  // Fondo estilo monitor biomédico
  ctx.fillStyle = '#090d16'
  ctx.fillRect(0, 0, width, height)

  // Rejilla de osciloscopio
  ctx.strokeStyle = '#1a2638'
  ctx.lineWidth = 1

  // Líneas verticales
  const stepX = width / 10
  for (let x = stepX; x < width; x += stepX) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }

  // Líneas horizontales
  const stepY = height / 6
  for (let y = stepY; y < height; y += stepY) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }

  // Línea central punteada
  ctx.strokeStyle = '#22354d'
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(0, height / 2)
  ctx.lineTo(width, height / 2)
  ctx.stroke()
  ctx.setLineDash([])

  // Función para graficar una traza con normalización dinámica
  function graficarTraza(muestras, color, lineWidth = 2) {
    if (!muestras || muestras.length < 2) return

    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < muestras.length; i++) {
      if (muestras[i] < min) min = muestras[i]
      if (muestras[i] > max) max = muestras[i]
    }
    const rango = max - min || 1
    const paddingY = height * 0.15

    ctx.strokeStyle = color
    ctx.lineWidth = lineWidth
    ctx.beginPath()

    const step = width / (muestras.length - 1)
    for (let i = 0; i < muestras.length; i++) {
      const x = i * step
      // Normalizar e invertir Y (en canvas 0 es arriba)
      const normY = (muestras[i] - min) / rango
      const y = (height - paddingY) - normY * (height - 2 * paddingY)

      if (i === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()

    // Resplandor del último punto
    if (muestras.length > 0) {
      const lastX = width
      const lastNormY = (muestras[muestras.length - 1] - min) / rango
      const lastY = (height - paddingY) - lastNormY * (height - 2 * paddingY)

      ctx.fillStyle = color
      ctx.beginPath()
      ctx.arc(lastX - 2, lastY, 4, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  if (props.activo) {
    if (mostrarRojo.value && props.muestrasRojo.length > 0) {
      graficarTraza(props.muestrasRojo, '#ef4444', 1.8) // Rojo
    }
    if (mostrarIr.value && props.muestrasIr.length > 0) {
      graficarTraza(props.muestrasIr, '#10b981', 2.2) // Verde Infrarrojo
    }
  }

  animationId = requestAnimationFrame(dibujar)
}

function ajustarDimensiones() {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * (window.devicePixelRatio || 1)
  canvas.height = rect.height * (window.devicePixelRatio || 1)
}

onMounted(() => {
  ajustarDimensiones()
  window.addEventListener('resize', ajustarDimensiones)
  dibujar()
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', ajustarDimensiones)
  if (animationId) cancelAnimationFrame(animationId)
})
</script>

<style scoped>
.oscilloscope-container {
  background: #0f172a;
  border-radius: 0.75rem;
  border: 1px solid #1e293b;
  overflow: hidden;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.3);
  margin-bottom: 1.5rem;
}

.oscilloscope-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #090d16;
  border-bottom: 1px solid #1e293b;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.title-section {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.scope-led {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: #ef4444;
  box-shadow: 0 0 6px #ef4444;
}

.scope-led.active {
  background: #10b981;
  box-shadow: 0 0 8px #10b981;
}

.scope-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: #f1f5f9;
}

.scope-controls {
  display: flex;
  gap: 1rem;
  font-size: 0.85rem;
  color: #94a3b8;
}

.toggle-trace {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  user-select: none;
}

.color-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  display: inline-block;
}

.dot-ir {
  background: #10b981;
}

.dot-rojo {
  background: #ef4444;
}

.canvas-wrapper {
  position: relative;
  width: 100%;
  height: 280px;
}

.oscilloscope-canvas {
  width: 100%;
  height: 100%;
  display: block;
}

.no-signal-overlay {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  background: rgba(9, 13, 22, 0.7);
  color: #f59e0b;
  gap: 0.5rem;
  font-size: 1rem;
}

.no-signal-overlay small {
  color: #94a3b8;
  font-size: 0.85rem;
}

.oscilloscope-footer {
  display: flex;
  justify-content: space-between;
  padding: 0.4rem 1rem;
  background: #090d16;
  border-top: 1px solid #1e293b;
  font-size: 0.75rem;
  color: #64748b;
  font-family: monospace;
}
</style>
