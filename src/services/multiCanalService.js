/**
 * ============================================================================
 * sensor_pulso · Servicio de Gestión y Visualización Multi-Canal para RF08
 * ============================================================================
 * Requerimiento: RF08 - Visualizar hasta 5 canales a la vez, cada uno con BPM y SpO₂.
 * 
 * Funcionalidades:
 * - Supervisión concurrente de los 5 canales fisiológicos del ESP32.
 * - Cálculo de métricas grupales en tiempo real (BPM medio, SpO₂ medio, alertas).
 * - Detección automática y aislada de anomalías clínicas por canal (hipoxia / arritmias).
 * - Gestión de buffers de onda PPG independientes para mini-trazas en vivo (5 canales simultáneos).
 * - Modos de visualización: Tarjetas interactivas, Monitor central tipo UCI y Tabla comparativa.
 * ============================================================================
 */

import { reactive } from 'vue'

export const MAX_CANALES = 5
export const CAPACIDAD_MINI_BUFFER = 100 // ~2 segundos a 50 Hz

// Estado reactivo global de la visualización multi-canal
export const multiCanalState = reactive({
  filtro: 'todos', // 'todos' | 'activos' | 'alertas' | 'mi_canal'
  modoVista: 'tarjetas', // 'tarjetas' | 'central' | 'tabla'
  buffers: {
    1: [],
    2: [],
    3: [],
    4: [],
    5: []
  }
})

/**
 * Evalúa el estado clínico y alertas de un canal individual
 * @param {{ canal: number, bpm: number, spo2: number, calidad?: string, activo?: boolean }} canalData 
 * @returns {{ tieneAlerta: boolean, tipoAlerta: string|null, estadoBpm: string, estadoSpo2: string, severidad: 'success'|'warning'|'danger' }}
 */
export function evaluarSaludCanal(canalData) {
  if (!canalData || !canalData.activo) {
    return {
      tieneAlerta: false,
      tipoAlerta: null,
      estadoBpm: 'inactivo',
      estadoSpo2: 'inactivo',
      severidad: 'success'
    }
  }

  const bpm = Number(canalData.bpm) || 0
  const spo2 = Number(canalData.spo2) || 0

  let estadoBpm = 'normal'
  if (bpm > 100) estadoBpm = 'taquicardia'
  else if (bpm < 60 && bpm > 0) estadoBpm = 'bradicardia'

  let estadoSpo2 = 'normal'
  if (spo2 < 90 && spo2 > 0) estadoSpo2 = 'hipoxia_severa'
  else if (spo2 < 95 && spo2 > 0) estadoSpo2 = 'hipoxia_leve'

  const tieneAlerta = estadoSpo2 !== 'normal' || estadoBpm !== 'normal'
  let tipoAlerta = null
  let severidad = 'success'

  if (estadoSpo2 === 'hipoxia_severa') {
    tipoAlerta = `Hipoxia Severa (${spo2.toFixed(1)}% SpO₂)`
    severidad = 'danger'
  } else if (estadoSpo2 === 'hipoxia_leve') {
    tipoAlerta = `Hipoxia Leve (${spo2.toFixed(1)}% SpO₂)`
    severidad = 'warning'
  } else if (estadoBpm === 'taquicardia') {
    tipoAlerta = `Taquicardia (${bpm.toFixed(1)} BPM)`
    severidad = 'warning'
  } else if (estadoBpm === 'bradicardia') {
    tipoAlerta = `Bradicardia (${bpm.toFixed(1)} BPM)`
    severidad = 'warning'
  }

  return {
    tieneAlerta,
    tipoAlerta,
    estadoBpm,
    estadoSpo2,
    severidad
  }
}

/**
 * Calcula estadísticas agregadas para el grupo de los 5 canales simultáneos
 * @param {Array} canales - Lista de los 5 canales con datos fisiológicos
 * @returns {{ totalCanales: number, activosCount: number, promedioBpm: number, promedioSpo2: number, alertasCount: number, canalesEnAlerta: Array, minBpm: number|null, maxBpm: number|null, minSpo2: number|null, maxSpo2: number|null }}
 */
export function calcularMetricasGrupales(canales = []) {
  if (!Array.isArray(canales) || canales.length === 0) {
    return {
      totalCanales: MAX_CANALES,
      activosCount: 0,
      promedioBpm: 0,
      promedioSpo2: 0,
      alertasCount: 0,
      canalesEnAlerta: [],
      minBpm: null,
      maxBpm: null,
      minSpo2: null,
      maxSpo2: null
    }
  }

  let sumaBpm = 0
  let cuentaBpm = 0
  let sumaSpo2 = 0
  let cuentaSpo2 = 0
  let activosCount = 0
  const canalesEnAlerta = []

  let minBpm = Infinity, maxBpm = -Infinity
  let minSpo2 = Infinity, maxSpo2 = -Infinity

  for (const c of canales) {
    if (c.activo !== false) activosCount++

    const salud = evaluarSaludCanal(c)
    if (salud.tieneAlerta) {
      canalesEnAlerta.push({
        canal: c.canal,
        tipo: salud.tipoAlerta,
        severidad: salud.severidad,
        bpm: c.bpm,
        spo2: c.spo2
      })
    }

    if (typeof c.bpm === 'number' && c.bpm >= 20 && c.bpm <= 250) {
      sumaBpm += c.bpm
      cuentaBpm++
      if (c.bpm < minBpm) minBpm = c.bpm
      if (c.bpm > maxBpm) maxBpm = c.bpm
    }

    if (typeof c.spo2 === 'number' && c.spo2 >= 50 && c.spo2 <= 100) {
      sumaSpo2 += c.spo2
      cuentaSpo2++
      if (c.spo2 < minSpo2) minSpo2 = c.spo2
      if (c.spo2 > maxSpo2) maxSpo2 = c.spo2
    }
  }

  return {
    totalCanales: canales.length,
    activosCount,
    promedioBpm: cuentaBpm > 0 ? parseFloat((sumaBpm / cuentaBpm).toFixed(1)) : 0,
    promedioSpo2: cuentaSpo2 > 0 ? parseFloat((sumaSpo2 / cuentaSpo2).toFixed(1)) : 0,
    alertasCount: canalesEnAlerta.length,
    canalesEnAlerta,
    minBpm: minBpm !== Infinity ? minBpm : null,
    maxBpm: maxBpm !== -Infinity ? maxBpm : null,
    minSpo2: minSpo2 !== Infinity ? minSpo2 : null,
    maxSpo2: maxSpo2 !== -Infinity ? maxSpo2 : null
  }
}

/**
 * Filtra los canales mostrados según el criterio seleccionado
 * @param {Array} canales 
 * @param {'todos'|'activos'|'alertas'|'mi_canal'} filtro 
 * @param {number|null} miCanal 
 * @returns {Array} Canales filtrados
 */
export function filtrarCanales(canales = [], filtro = 'todos', miCanal = null) {
  if (!Array.isArray(canales)) return []

  switch (filtro) {
    case 'activos':
      return canales.filter(c => c.activo !== false)
    case 'alertas':
      return canales.filter(c => evaluarSaludCanal(c).tieneAlerta)
    case 'mi_canal':
      return miCanal ? canales.filter(c => c.canal === miCanal) : canales
    case 'todos':
    default:
      return canales
  }
}

/**
 * Alimenta las muestras PPG recientes a los buffers de los 5 canales
 * @param {Array} canales 
 */
export function actualizarBuffersMultiCanal(canales = []) {
  if (!Array.isArray(canales)) return

  for (const ch of canales) {
    const num = ch.canal
    if (!multiCanalState.buffers[num]) {
      multiCanalState.buffers[num] = []
    }

    const buf = multiCanalState.buffers[num]
    const muestras = Array.isArray(ch.ir) ? ch.ir : []

    if (muestras.length > 0) {
      for (const val of muestras) {
        buf.push(val)
      }
      while (buf.length > CAPACIDAD_MINI_BUFFER) {
        buf.shift()
      }
    }
  }
}

/**
 * Dibuja una mini-traza fotopletismográfica (Sparkline PPG) en un elemento Canvas HTML5
 * @param {HTMLCanvasElement} canvas 
 * @param {number[]} muestras 
 * @param {{ strokeColor?: string, fillColor?: string, lineWidth?: number }} opciones 
 */
export function renderizarMiniTrazaPPG(canvas, muestras = [], opciones = {}) {
  if (!canvas) return
  const ctx = canvas.getContext('2d')
  if (!ctx) return

  const width = canvas.width
  const height = canvas.height
  const strokeColor = opciones.strokeColor || '#2563eb'
  const fillColor = opciones.fillColor || 'rgba(37, 99, 235, 0.08)'
  const lineWidth = opciones.lineWidth || 1.75

  ctx.clearRect(0, 0, width, height)

  // Fondo sutil de monitor
  ctx.fillStyle = '#0f172a'
  ctx.fillRect(0, 0, width, height)

  // Línea guía tenue central
  ctx.strokeStyle = '#1e293b'
  ctx.lineWidth = 1
  ctx.beginPath()
  ctx.moveTo(0, height / 2)
  ctx.lineTo(width, height / 2)
  ctx.stroke()

  if (!muestras || muestras.length < 2) {
    // Línea plana de espera
    ctx.strokeStyle = '#334155'
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()
    return
  }

  // Encontrar rango mínimo y máximo
  let min = Infinity, max = -Infinity
  for (let i = 0; i < muestras.length; i++) {
    const v = muestras[i]
    if (v < min) min = v
    if (v > max) max = v
  }

  const range = max - min || 1
  const stepX = width / (muestras.length - 1)
  const padding = 4

  // Trazar línea de onda PPG
  ctx.strokeStyle = strokeColor
  ctx.lineWidth = lineWidth
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'

  ctx.beginPath()
  for (let i = 0; i < muestras.length; i++) {
    const x = i * stepX
    // Invertimos Y para que el pico esté arriba
    const y = height - padding - ((muestras[i] - min) / range) * (height - padding * 2)
    if (i === 0) ctx.moveTo(x, y)
    else ctx.lineTo(x, y)
  }
  ctx.stroke()

  // Gradiente bajo la onda
  if (fillColor) {
    ctx.lineTo(width, height)
    ctx.lineTo(0, height)
    ctx.closePath()
    ctx.fillStyle = fillColor
    ctx.fill()
  }
}
