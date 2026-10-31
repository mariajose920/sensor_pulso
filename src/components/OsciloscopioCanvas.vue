<template>
  <div class="oscilloscope-container">
    <!-- Barra superior de controles del Osciloscopio -->
    <div class="oscilloscope-header">
      <div class="title-section">
        <span class="scope-led" :class="{ active: activo && !pausado, paused: pausado }"></span>
        <span class="scope-title">
          Osciloscopio PPG en Tiempo Real · Canal {{ canal }}
        </span>
        <span v-if="pausado" class="badge-paused">⏸️ CONGELADO</span>
        <span v-else-if="activo" class="badge-live">● EN VIVO</span>
      </div>

      <div class="header-tools">
        <!-- Selector de Modo de Gráfica: Barrido vs Scroll -->
        <div class="tool-group">
          <span class="tool-label">Modo:</span>
          <button 
            type="button"
            class="mode-btn" 
            :class="{ active: modoVisualizacion === 'barrido' }"
            @click="modoVisualizacion = 'barrido'"
            title="Modo Barrido Clínico con haz de fósforo (estilo monitor hospitalario)"
          >
            Barrido
          </button>
          <button 
            type="button"
            class="mode-btn" 
            :class="{ active: modoVisualizacion === 'scroll' }"
            @click="modoVisualizacion = 'scroll'"
            title="Modo Desplazamiento continuo de derecha a izquierda"
          >
            Continuo
          </button>
        </div>

        <!-- Selector de Base Temporal -->
        <div class="tool-group">
          <span class="tool-label">Ventana:</span>
          <select v-model="ventanaSegundos" class="scope-select">
            <option :value="2.5">2.5 s (Detalle)</option>
            <option :value="5.0">5.0 s (Estándar)</option>
            <option :value="10.0">10.0 s (Amplia)</option>
          </select>
        </div>

        <!-- Selector de Ganancia / Escala Vertical -->
        <div class="tool-group">
          <span class="tool-label">Ganancia:</span>
          <select v-model="ganancia" class="scope-select">
            <option value="auto">Auto-Escala</option>
            <option :value="0.5">0.5x</option>
            <option :value="1.0">1.0x</option>
            <option :value="2.0">2.0x</option>
          </select>
        </div>

        <!-- Botón de Congelar / Reanudar (Freeze) -->
        <button 
          type="button"
          class="btn-tool" 
          :class="pausado ? 'btn-tool-play' : 'btn-tool-pause'"
          @click="togglePausa"
          :title="pausado ? 'Reanudar gráfica en tiempo real' : 'Congelar traza para inspección minuciosa'"
        >
          {{ pausado ? '▶️ Reanudar' : '⏸️ Congelar' }}
        </button>
      </div>
    </div>

    <!-- Barra secundaria: Trazas, Filtros y Herramientas Morfológicas -->
    <div class="oscilloscope-toolbar">
      <div class="trace-selectors">
        <label class="toggle-trace" title="Traza Infrarroja (absorción de hemoglobina desoxigenada)">
          <input type="checkbox" v-model="mostrarIr" />
          <span class="color-dot dot-ir"></span>
          <span>IR (880 nm)</span>
        </label>

        <label class="toggle-trace" title="Traza Roja (absorción de oxihemoglobina para SpO2)">
          <input type="checkbox" v-model="mostrarRojo" />
          <span class="color-dot dot-rojo"></span>
          <span>Rojo (660 nm)</span>
        </label>

        <label class="toggle-trace" title="Aplicar filtro digital pasa-bajas para atenuar ruido">
          <input type="checkbox" v-model="filtroActivo" />
          <span class="filter-icon">⚡</span>
          <span>Filtro DSP</span>
        </label>

        <label class="toggle-trace" title="Detectar y etiquetar sístole y muesca dícrota en la onda">
          <input type="checkbox" v-model="mostrarMarcadores" />
          <span class="marker-icon">🏷️</span>
          <span>Morfología</span>
        </label>
      </div>

      <div class="export-actions">
        <button type="button" class="btn-export" @click="capturarGraficaPng" title="Descargar imagen PNG de la onda actual">
          📸 Capturar PNG
        </button>
        <button type="button" class="btn-export" @click="descargarCsv" title="Exportar datos numéricos a CSV">
          💾 Exportar CSV
        </button>
      </div>
    </div>

    <!-- Área de Visualización Canvas del Osciloscopio -->
    <div 
      class="canvas-wrapper" 
      @mousemove="onMouseMove" 
      @mouseleave="onMouseLeave"
    >
      <canvas ref="canvasRef" class="oscilloscope-canvas"></canvas>

      <!-- Overlay si no hay señal conectada ni simulada -->
      <div v-if="!activo && muestrasIr.length === 0" class="no-signal-overlay">
        <p>⚠️ Esperando paquetes WiFi del ESP32...</p>
        <small>Enciende el ESP32 o activa la transmisión de prueba para graficar en tiempo real</small>
      </div>

      <!-- Tooltip interactivo flotante en modo pausa / inspección -->
      <div 
        v-if="hoverInfo" 
        class="crosshair-tooltip"
        :style="{ left: hoverInfo.x + 'px', top: hoverInfo.y + 'px' }"
      >
        <div class="tooltip-header">{{ hoverInfo.etiqueta }}</div>
        <div class="tooltip-val font-mono">IR: {{ hoverInfo.irVal }} ADC</div>
        <div v-if="mostrarRojo && hoverInfo.rojoVal" class="tooltip-val font-mono">Rojo: {{ hoverInfo.rojoVal }} ADC</div>
        <div class="tooltip-time">t: {{ hoverInfo.tiempoRel }} ms</div>
      </div>
    </div>

    <!-- Panel de Métricas Físicas de la Traza en Tiempo Real (RF06) -->
    <div class="oscilloscope-footer">
      <div class="metric-pill" title="Amplitud pico a pico de la componente pulsátil">
        <span class="lbl">Vpp:</span>
        <span class="val font-mono">{{ metricas.vpp }} ADC</span>
      </div>

      <div class="metric-pill" title="Nivel continuo medio de fondo (DC baseline)">
        <span class="lbl">Línea Base DC:</span>
        <span class="val font-mono">{{ metricas.dc }}</span>
      </div>

      <div class="metric-pill" title="Índice de Perfusión estimado (AC/DC)">
        <span class="lbl">Índice Perfusión (PI):</span>
        <span class="val font-mono">{{ metricas.pi }}%</span>
      </div>

      <div class="metric-pill" title="Frecuencia de muestreo y resolución temporal">
        <span class="lbl">Muestreo:</span>
        <span class="val font-mono">{{ frecuenciaHz }} Hz ({{ (1000 / frecuenciaHz).toFixed(0) }}ms)</span>
      </div>

      <div class="metric-pill" title="Calidad estimada de la señal PPG">
        <span class="lbl">Calidad:</span>
        <CalidadSenalBadge :nivel="metricas.calidad" :causas="metricas.causasCalidad" mostrar-causa />
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import CalidadSenalBadge from './CalidadSenalBadge.vue'
import { evaluarCalidad, MAXIMO_MAX30102 } from '../utils/calidadSenal'
import {
  filtroSuavizadoEMA,
  calcularMetricasSenal,
  detectarMorfologiaPPG,
  generarCsvOsciloscopio
} from '../utils/dspFiltros'

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
const filtroActivo = ref(true)
const mostrarMarcadores = ref(true)
const pausado = ref(false)
const modoVisualizacion = ref('barrido') // 'barrido' | 'scroll'
const ventanaSegundos = ref(5.0)
const ganancia = ref('auto')

// Posición del haz de barrido (sweep bar) para modo barrido clínico
let sweepX = 0
let animationId = null
const hoverInfo = ref(null)

// Métricas de la señal en tiempo real
const metricas = reactive({
  vpp: 0,
  dc: 0,
  pi: 0,
  snrDb: 0,
  calidad: 'sin_senal',
  causasCalidad: []
})

// Muestras congeladas para permitir inspección sin que los datos nuevos alteren la pantalla
let muestrasIrCongeladas = []
let muestrasRojoCongeladas = []

function togglePausa() {
  pausado.value = !pausado.value
  if (pausado.value) {
    muestrasIrCongeladas = [...props.muestrasIr]
    muestrasRojoCongeladas = [...props.muestrasRojo]
  } else {
    hoverInfo.value = null
  }
}

// Obtener las muestras actuales a graficar según el estado de pausa, ventana y filtro
const muestrasIrRender = computed(() => {
  const fuente = pausado.value ? muestrasIrCongeladas : props.muestrasIr
  const maxPts = Math.round(ventanaSegundos.value * props.frecuenciaHz)
  const recortadas = fuente.slice(-maxPts)
  return filtroActivo.value ? filtroSuavizadoEMA(recortadas, 0.25) : recortadas
})

const muestrasRojoRender = computed(() => {
  const fuente = pausado.value ? muestrasRojoCongeladas : props.muestrasRojo
  const maxPts = Math.round(ventanaSegundos.value * props.frecuenciaHz)
  const recortadas = fuente.slice(-maxPts)
  return filtroActivo.value ? filtroSuavizadoEMA(recortadas, 0.25) : recortadas
})

// Recalcular métricas físicas periódicamente
watch(() => props.muestrasIr.length, () => {
  if (props.muestrasIr.length > 5) {
    const res = calcularMetricasSenal(props.muestrasIr, props.frecuenciaHz)
    metricas.vpp = res.vpp
    metricas.dc = res.dc
    metricas.pi = res.pi
    metricas.snrDb = res.snrDb
    // RF15: calidad por ruido, movimiento y recorte sobre la ventana reciente (~3 s)
    const ventana = props.muestrasIr.slice(-Math.round(3 * props.frecuenciaHz))
    const q = evaluarCalidad(ventana, { frecuenciaHz: props.frecuenciaHz, maximo: MAXIMO_MAX30102 })
    metricas.calidad = q.nivel
    metricas.causasCalidad = q.causas
  }
})

/**
 * Renderizado de alto rendimiento en Canvas con requestAnimationFrame
 */
function dibujar() {
  const canvas = canvasRef.value
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  const width = canvas.width
  const height = canvas.height

  // 1. Fondo biomédico de alta visibilidad
  ctx.fillStyle = '#080c14'
  ctx.fillRect(0, 0, width, height)

  // 2. Rejilla calibrada (Divisiones principales y secundarias)
  dibujarRejilla(ctx, width, height)

  const irData = muestrasIrRender.value
  const rojoData = muestrasRojoRender.value

  if (props.activo || irData.length > 1) {
    // Calcular escala vertical (auto-ganancia o ganancia fija)
    let min = Infinity
    let max = -Infinity
    const todas = [...irData, ...(mostrarRojo.value ? rojoData : [])]
    
    for (let i = 0; i < todas.length; i++) {
      if (todas[i] < min) min = todas[i]
      if (todas[i] > max) max = todas[i]
    }

    if (min === Infinity || max === -Infinity || max === min) {
      min = 20000
      max = 28000
    }

    let rango = max - min || 1
    if (ganancia.value !== 'auto') {
      const centro = (max + min) / 2
      rango = rango / Number(ganancia.value)
      min = centro - rango / 2
      max = centro + rango / 2
    }

    const paddingY = height * 0.15

    // Función auxiliar para mapear valor ADC a coordenada Y en canvas
    const getY = (val) => {
      const norm = (val - min) / rango
      return (height - paddingY) - norm * (height - 2 * paddingY)
    }

    // 3. Graficar trazas según el modo de visualización seleccionado
    if (modoVisualizacion.value === 'barrido' && !pausado.value) {
      // Avanzar el haz de barrido (sweep bar)
      sweepX = (sweepX + (width / (ventanaSegundos.value * 60))) % width
    }

    if (mostrarRojo.value && rojoData.length > 1) {
      graficarTraza(ctx, rojoData, '#ef4444', 1.8, width, height, getY)
    }

    if (mostrarIr.value && irData.length > 1) {
      graficarTraza(ctx, irData, '#10b981', 2.2, width, height, getY)

      // 4. Marcadores morfológicos anatómicos (P_sys, N_dic, P_dia)
      if (mostrarMarcadores.value && irData.length > 20) {
        dibujarMarcadoresMorfologicos(ctx, irData, width, getY)
      }
    }

    // 5. En modo barrido clínico, dibujar la barra de fósforo vertical
    if (modoVisualizacion.value === 'barrido' && !pausado.value) {
      const grad = ctx.createLinearGradient(sweepX - 25, 0, sweepX + 5, 0)
      grad.addColorStop(0, 'rgba(8, 12, 20, 0)')
      grad.addColorStop(0.7, 'rgba(16, 185, 129, 0.15)')
      grad.addColorStop(1, 'rgba(16, 185, 129, 0.8)')
      ctx.fillStyle = grad
      ctx.fillRect(sweepX - 25, 0, 30, height)

      ctx.strokeStyle = '#34d399'
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(sweepX, 0)
      ctx.lineTo(sweepX, height)
      ctx.stroke()
    }
  }

  // 6. Si el cursor está activo sobre el canvas, dibujar retícula de mira (crosshair)
  if (hoverInfo.value) {
    dibujarMiraInteractiva(ctx, width, height)
  }

  animationId = requestAnimationFrame(dibujar)
}

function dibujarRejilla(ctx, width, height) {
  ctx.strokeStyle = '#141d2b'
  ctx.lineWidth = 1

  // Líneas verticales principales (10 divisiones temporales)
  const stepX = width / 10
  for (let x = stepX; x < width; x += stepX) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, height)
    ctx.stroke()
  }

  // Líneas horizontales principales (6 divisiones de voltaje/amplitud)
  const stepY = height / 6
  for (let y = stepY; y < height; y += stepY) {
    ctx.beginPath()
    ctx.moveTo(0, y)
    ctx.lineTo(width, y)
    ctx.stroke()
  }

  // Línea central de referencia cero/isobárica
  ctx.strokeStyle = '#1e2e42'
  ctx.setLineDash([4, 4])
  ctx.beginPath()
  ctx.moveTo(0, height / 2)
  ctx.lineTo(width, height / 2)
  ctx.stroke()
  ctx.setLineDash([])
}

function graficarTraza(ctx, muestras, color, lineWidth, width, height, getY) {
  if (muestras.length < 2) return

  ctx.strokeStyle = color
  ctx.lineWidth = lineWidth
  ctx.beginPath()

  const step = width / (muestras.length - 1)
  for (let i = 0; i < muestras.length; i++) {
    const x = i * step
    const y = getY(muestras[i])
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  // Resplandor del último punto
  if (!pausado.value && muestras.length > 0) {
    const lastIdx = muestras.length - 1
    const lastX = lastIdx * step
    const lastY = getY(muestras[lastIdx])

    ctx.fillStyle = color
    ctx.beginPath()
    ctx.arc(lastX, lastY, 4, 0, Math.PI * 2)
    ctx.fill()
  }
}

function dibujarMarcadoresMorfologicos(ctx, muestras, width, getY) {
  const puntos = detectarMorfologiaPPG(muestras)
  const step = width / (muestras.length - 1)

  for (const p of puntos) {
    const x = p.index * step
    const y = getY(p.valor)

    ctx.save()
    if (p.tipo === 'sistolico') {
      // Triángulo invertido verde sobre el pico sistólico
      ctx.fillStyle = '#10b981'
      ctx.beginPath()
      ctx.moveTo(x, y - 6)
      ctx.lineTo(x - 4, y - 14)
      ctx.lineTo(x + 4, y - 14)
      ctx.closePath()
      ctx.fill()

      ctx.font = '10px monospace'
      ctx.fillText('Psys', x - 10, y - 17)
    } else if (p.tipo === 'escotadura') {
      // Punto ámbar en la incisura dícrota
      ctx.fillStyle = '#f59e0b'
      ctx.beginPath()
      ctx.arc(x, y, 3, 0, Math.PI * 2)
      ctx.fill()

      ctx.font = '9px monospace'
      ctx.fillText('Ndic', x - 9, y + 14)
    }
    ctx.restore()
  }
}

function dibujarMiraInteractiva(ctx, width, height) {
  const info = hoverInfo.value
  if (!info) return

  ctx.save()
  ctx.strokeStyle = 'rgba(148, 163, 184, 0.5)'
  ctx.lineWidth = 1
  ctx.setLineDash([2, 2])

  // Línea horizontal
  ctx.beginPath()
  ctx.moveTo(0, info.y)
  ctx.lineTo(width, info.y)
  ctx.stroke()

  // Línea vertical
  ctx.beginPath()
  ctx.moveTo(info.x, 0)
  ctx.lineTo(info.x, height)
  ctx.stroke()
  ctx.restore()
}

function onMouseMove(event) {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  const mouseX = event.clientX - rect.left
  const mouseY = event.clientY - rect.top

  const data = muestrasIrRender.value
  if (data.length < 2) return

  const ratio = mouseX / rect.width
  const idx = Math.min(data.length - 1, Math.max(0, Math.round(ratio * (data.length - 1))))
  const dt = (ventanaSegundos.value * 1000) / data.length

  hoverInfo.value = {
    x: Math.min(rect.width - 150, Math.max(10, mouseX + 10)),
    y: Math.min(rect.height - 80, Math.max(10, mouseY - 50)),
    irVal: Math.round(data[idx]),
    rojoVal: muestrasRojoRender.value[idx] ? Math.round(muestrasRojoRender.value[idx]) : null,
    tiempoRel: Math.round(idx * dt),
    etiqueta: `Muestra #${idx + 1}`
  }
}

function onMouseLeave() {
  if (!pausado.value) {
    hoverInfo.value = null
  }
}

function ajustarDimensiones() {
  const canvas = canvasRef.value
  if (!canvas) return
  const rect = canvas.getBoundingClientRect()
  canvas.width = rect.width * (window.devicePixelRatio || 1)
  canvas.height = rect.height * (window.devicePixelRatio || 1)
}

function capturarGraficaPng() {
  const canvas = canvasRef.value
  if (!canvas) return
  const link = document.createElement('a')
  link.download = `ppg-canal-${props.canal}-${new Date().toISOString().slice(0, 19)}.png`
  link.href = canvas.toDataURL('image/png')
  link.click()
}

function descargarCsv() {
  const csvContent = generarCsvOsciloscopio(props.muestrasIr, props.muestrasRojo, props.frecuenciaHz, props.canal)
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.setAttribute('href', url)
  link.setAttribute('download', `senal_ppg_canal_${props.canal}_${Date.now()}.csv`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
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
  background: #080c14;
  border-radius: 0.75rem;
  border: 1px solid #1e293b;
  overflow: hidden;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.4);
  margin-bottom: 1.5rem;
}

.oscilloscope-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  background: #0d131f;
  border-bottom: 1px solid #1e293b;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.title-section {
  display: flex;
  align-items: center;
  gap: 0.6rem;
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

.scope-led.paused {
  background: #f59e0b;
  box-shadow: 0 0 8px #f59e0b;
}

.scope-title {
  font-weight: 700;
  font-size: 0.95rem;
  color: #f8fafc;
}

.badge-live {
  font-size: 0.7rem;
  font-weight: 700;
  color: #10b981;
  background: rgba(16, 185, 129, 0.15);
  padding: 0.15rem 0.45rem;
  border-radius: 9999px;
  border: 1px solid rgba(16, 185, 129, 0.3);
}

.badge-paused {
  font-size: 0.7rem;
  font-weight: 700;
  color: #f59e0b;
  background: rgba(245, 158, 11, 0.15);
  padding: 0.15rem 0.45rem;
  border-radius: 9999px;
  border: 1px solid rgba(245, 158, 11, 0.3);
}

.header-tools {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  flex-wrap: wrap;
}

.tool-group {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  color: #94a3b8;
}

.tool-label {
  font-weight: 600;
}

.mode-btn {
  background: #1e293b;
  border: 1px solid #334155;
  color: #94a3b8;
  padding: 0.25rem 0.55rem;
  font-size: 0.75rem;
  font-weight: 600;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.15s ease;
}

.mode-btn.active {
  background: #0284c7;
  border-color: #38bdf8;
  color: #ffffff;
}

.scope-select {
  background: #1e293b;
  border: 1px solid #334155;
  color: #f1f5f9;
  font-size: 0.75rem;
  padding: 0.25rem 0.45rem;
  border-radius: 0.25rem;
}

.btn-tool {
  border: none;
  font-size: 0.8rem;
  font-weight: 700;
  padding: 0.3rem 0.75rem;
  border-radius: 0.35rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-tool-pause {
  background: #f59e0b;
  color: #0f172a;
}

.btn-tool-pause:hover {
  background: #d97706;
}

.btn-tool-play {
  background: #10b981;
  color: #ffffff;
}

.btn-tool-play:hover {
  background: #059669;
}

.oscilloscope-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.45rem 1rem;
  background: #0b101a;
  border-bottom: 1px solid #1e293b;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.trace-selectors {
  display: flex;
  align-items: center;
  gap: 1rem;
  font-size: 0.8rem;
  color: #94a3b8;
  flex-wrap: wrap;
}

.toggle-trace {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  cursor: pointer;
  user-select: none;
}

.color-dot {
  width: 9px;
  height: 9px;
  border-radius: 50%;
  display: inline-block;
}

.dot-ir { background: #10b981; box-shadow: 0 0 5px #10b981; }
.dot-rojo { background: #ef4444; box-shadow: 0 0 5px #ef4444; }

.export-actions {
  display: flex;
  gap: 0.5rem;
}

.btn-export {
  background: #1e293b;
  border: 1px solid #334155;
  color: #cbd5e1;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.25rem 0.55rem;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-export:hover {
  background: #334155;
  color: #ffffff;
}

.canvas-wrapper {
  position: relative;
  width: 100%;
  height: 310px;
  cursor: crosshair;
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
  background: rgba(8, 12, 20, 0.75);
  color: #f59e0b;
  gap: 0.4rem;
  font-size: 1rem;
}

.no-signal-overlay small {
  color: #94a3b8;
  font-size: 0.85rem;
}

.crosshair-tooltip {
  position: absolute;
  pointer-events: none;
  background: rgba(15, 23, 42, 0.92);
  border: 1px solid #38bdf8;
  border-radius: 0.4rem;
  padding: 0.45rem 0.65rem;
  font-size: 0.75rem;
  color: #f1f5f9;
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.5);
  z-index: 10;
}

.tooltip-header {
  font-weight: 700;
  color: #38bdf8;
  margin-bottom: 0.15rem;
}

.tooltip-val {
  color: #10b981;
}

.tooltip-time {
  color: #94a3b8;
  font-size: 0.7rem;
}

.oscilloscope-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 1rem;
  background: #0d131f;
  border-top: 1px solid #1e293b;
  font-size: 0.75rem;
  color: #94a3b8;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.metric-pill {
  display: flex;
  align-items: center;
  gap: 0.35rem;
}

.metric-pill .lbl {
  color: #64748b;
  font-weight: 600;
}

.metric-pill .val {
  color: #f1f5f9;
  font-weight: 700;
}

.badge-calidad {
  font-size: 0.65rem;
  font-weight: 700;
  padding: 0.1rem 0.4rem;
  border-radius: 9999px;
}

.calidad-buena { background: #064e3b; color: #34d399; }
.calidad-regular { background: #78350f; color: #fde68a; }
.calidad-mala { background: #7f1d1d; color: #fca5a5; }

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
