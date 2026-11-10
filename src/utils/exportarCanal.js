/**
 * Exportar el gráfico de un canal: CSV y captura PNG (RF111)
 *
 * Funciones puras y probables con Node:
 *  - generarCsvCanal: una fila por muestra de la ventana acumulada.
 *  - dibujarCapturaCanal: dibuja con un contexto 2D (canvas) a partir de series ya normalizadas;
 *    los tests pasan un doble de ctx. Usa la misma geometría que la pantalla (geometriaSerie / trazarSpo2).
 * Las funciones `descargar*` son las únicas que tocan el navegador.
 */
import { geometriaSerie, trazarSpo2, MARGEN_GRAFICA, RANGO_SPO2 } from './graficasCanales.js'

const pad = (n, l = 2) => String(n).padStart(l, '0')
const esNum = (v) => typeof v === 'number' && Number.isFinite(v)

/** `canal_N_YYYYMMDD_HHMMSS.ext` (hora local) */
export function nombreArchivoCanal(canal, fecha = new Date(), ext = 'csv') {
  const f = fecha instanceof Date ? fecha : new Date(fecha)
  const d = `${f.getFullYear()}${pad(f.getMonth() + 1)}${pad(f.getDate())}`
  const h = `${pad(f.getHours())}${pad(f.getMinutes())}${pad(f.getSeconds())}`
  return `canal_${canal}_${d}_${h}.${ext}`
}

/** «Canal N · nombre · DD/MM/YYYY HH:MM:SS» */
export function tituloCaptura(canal, nombre, fecha = new Date()) {
  const f = fecha instanceof Date ? fecha : new Date(fecha)
  const t = `${pad(f.getDate())}/${pad(f.getMonth() + 1)}/${f.getFullYear()} ${pad(f.getHours())}:${pad(f.getMinutes())}:${pad(f.getSeconds())}`
  return `Canal ${canal}${nombre ? ' · ' + nombre : ''} · ${t}`
}

// Número con punto decimal y hasta 4 decimales, sin ceros sobrantes
const num = (v) => (esNum(v) ? String(Number(v.toFixed(4))) : '')
const linea = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ')

/**
 * CSV del canal. Separador coma, punto decimal, CRLF y BOM UTF-8 (para que Excel lea las tildes).
 * @param {object} o
 * @param {number} o.canal
 * @param {string} [o.paciente]        solo el nombre que ya muestra la tarjeta
 * @param {number} o.frecuenciaHz
 * @param {Date|string|number} [o.fecha]
 * @param {number[]} o.senalMostrada   la que se dibuja (filtrada o cruda)
 * @param {number[]} o.ir
 * @param {number[]} [o.rojo]
 * @param {{indice:number}[]} [o.picos] índices sobre la señal mostrada
 * @param {number|null} [o.bpm]        BPM de la métrica del canal
 * @param {(number|null)[]} [o.spo2]   SpO₂ por muestra (null = sin lectura)
 * @param {boolean} [o.dsp]
 */
export function generarCsvCanal({ canal, paciente = '', frecuenciaHz = 50, fecha = new Date(), senalMostrada = [], ir = [], rojo = [], picos = [], bpm = null, spo2 = [], dsp = true } = {}) {
  const hz = esNum(frecuenciaHz) && frecuenciaHz > 0 ? frecuenciaHz : 50
  const f = fecha instanceof Date ? fecha : new Date(fecha)
  const n = Math.max(senalMostrada.length, ir.length)
  const esPico = new Set((picos || []).map(p => p.indice))
  const desfaseRojo = ir.length - rojo.length // alineado por el final (la ventana se recorta por el principio)
  const filas = [
    `# Canal: ${canal}`,
    `# Paciente: ${linea(paciente)}`,
    `# Frecuencia de muestreo (Hz): ${num(hz)}`,
    `# Fecha: ${esNum(f.getTime()) ? f.toISOString() : ''}`,
    `# Senal mostrada: ${dsp ? 'filtrada (pasa-banda 0,5-5 Hz)' : 'cruda'}`,
    'tiempo_s,senal_mostrada,ir_crudo,rojo,pico,bpm,spo2'
  ]
  const bpmTxt = esNum(bpm) ? num(bpm) : ''
  for (let i = 0; i < n; i++) {
    const r = rojo[i - desfaseRojo]
    filas.push([
      (i / hz).toFixed(3),
      num(senalMostrada[i]),
      num(ir[i]),
      i - desfaseRojo >= 0 ? num(r) : '',
      esPico.has(i) ? 1 : 0,
      bpmTxt,
      num(spo2[i])
    ].join(','))
  }
  return '﻿' + filas.join('\r\n') + '\r\n'
}

/** Alto del lienzo de la captura (más alto si incluye la gráfica de SpO₂) */
export function alturaCaptura({ mostrarSpo2 = false } = {}) {
  return 420 + (mostrarSpo2 ? 130 : 0)
}
export const ANCHO_CAPTURA = 900

const COLOR = { fondo: '#080c14', panel: '#0b101a', borde: '#334155', texto: '#e2e8f0', suave: '#94a3b8', spo2: '#fb7185' }

/**
 * Dibuja el canal en un contexto 2D de `ANCHO_CAPTURA` × `alturaCaptura(...)`.
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} o
 * @param {string} o.titulo
 * @param {string} o.color            color del canal
 * @param {number[]} o.serie          serie mostrada (ya filtrada o cruda)
 * @param {{indice:number}[]} o.picos
 * @param {boolean} o.mostrarPicos
 * @param {(number|null)[]} o.spo2
 * @param {boolean} o.mostrarSpo2
 * @param {{bpm:string,hrv:string,ruido:string,ritmo:string,spo2:string}} o.resumen  resumenMetricas(...)
 * @param {boolean} [o.dsp]
 * @returns {{puntosPicos:number, tieneSpo2:boolean}}
 */
export function dibujarCapturaCanal(ctx, { titulo = '', color = '#38bdf8', serie = [], picos = [], mostrarPicos = true, spo2 = [], mostrarSpo2 = false, resumen = {}, dsp = true } = {}) {
  const W = ANCHO_CAPTURA
  const H = alturaCaptura({ mostrarSpo2 })
  ctx.fillStyle = COLOR.fondo
  ctx.fillRect(0, 0, W, H)

  ctx.fillStyle = COLOR.texto
  ctx.font = 'bold 20px sans-serif'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'alphabetic'
  ctx.fillText(titulo, 24, 34)
  ctx.fillStyle = COLOR.suave
  ctx.font = '13px sans-serif'
  ctx.fillText(dsp ? 'Señal filtrada (pasa-banda 0,5–5 Hz)' : 'Señal cruda', 24, 54)

  // Zona de la curva
  const px = 24, py = 66, pw = W - 48, ph = 220
  ctx.fillStyle = COLOR.panel
  ctx.fillRect(px, py, pw, ph)
  ctx.strokeStyle = COLOR.borde
  ctx.lineWidth = 1
  ctx.strokeRect(px, py, pw, ph)

  const pts = geometriaSerie(serie, pw, ph, { margen: MARGEN_GRAFICA })
  if (pts.length) {
    ctx.strokeStyle = color
    ctx.lineWidth = 2
    ctx.lineJoin = 'round'
    ctx.beginPath()
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(px + p.x, py + p.y) : ctx.lineTo(px + p.x, py + p.y)))
    ctx.stroke()
  }

  let puntosPicos = 0
  if (mostrarPicos && pts.length) {
    for (const p of picos || []) {
      const q = Number.isInteger(p.indice) ? pts[p.indice] : null
      if (!q) continue
      ctx.beginPath()
      ctx.arc(px + q.x, py + q.y, 5, 0, Math.PI * 2)
      ctx.fillStyle = color
      ctx.fill()
      ctx.strokeStyle = '#ffffff'
      ctx.lineWidth = 1.5
      ctx.stroke()
      puntosPicos++
    }
  }
  if (!pts.length) {
    ctx.fillStyle = COLOR.suave
    ctx.fillText('Sin señal suficiente', px + 12, py + 24)
  }

  let y = py + ph + 16
  let tieneSpo2 = false
  if (mostrarSpo2) {
    const sh = 90
    ctx.fillStyle = COLOR.panel
    ctx.fillRect(px, y, pw, sh)
    ctx.strokeStyle = COLOR.borde
    ctx.lineWidth = 1
    ctx.strokeRect(px, y, pw, sh)
    ctx.fillStyle = COLOR.suave
    ctx.font = '12px sans-serif'
    ctx.fillText(`SpO₂ (${RANGO_SPO2.min}–${RANGO_SPO2.max} %)`, px + 8, y + 16)
    const t = trazarSpo2(spo2, pw, sh)
    tieneSpo2 = t.hayDatos
    ctx.strokeStyle = COLOR.spo2
    ctx.lineWidth = 1.5
    ctx.lineJoin = 'round'
    ctx.lineCap = 'round'
    for (const seg of t.segmentos) {
      ctx.beginPath()
      seg.split(' ').forEach((par, i) => {
        const [sx, sy] = par.split(',').map(Number)
        if (i === 0) ctx.moveTo(px + sx, y + sy)
        else ctx.lineTo(px + sx, y + sy)
      })
      ctx.stroke()
    }
    ctx.fillStyle = COLOR.texto
    ctx.textAlign = 'right'
    ctx.fillText(t.actual !== null ? `${num(t.actual)} %` : 'sin lectura', px + pw - 8, y + 16)
    ctx.textAlign = 'left'
    y += sh + 16
  }

  // Métricas
  ctx.font = '14px sans-serif'
  ctx.fillStyle = COLOR.texto
  const filas = [
    ['Frecuencia cardíaca', resumen.bpm ?? '—'],
    ['Variabilidad (HRV)', resumen.hrv ?? '—'],
    ['Ruido de la señal', resumen.ruido ?? '—'],
    ['Ritmo cardíaco', resumen.ritmo ?? '—'],
    ['SpO₂', resumen.spo2 ?? '—']
  ]
  filas.forEach(([k, v], i) => {
    const col = i % 2
    const fila = Math.floor(i / 2)
    ctx.fillStyle = COLOR.suave
    ctx.fillText(`${k}:`, px + col * (pw / 2), y + 14 + fila * 22)
    ctx.fillStyle = COLOR.texto
    ctx.fillText(String(v), px + col * (pw / 2) + 160, y + 14 + fila * 22)
  })
  return { puntosPicos, tieneSpo2 }
}

// ───────────────────────── Navegador ─────────────────────────

function descargarBlob(blob, nombre) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombre
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function descargarCsvCanal(opciones) {
  const fecha = opciones.fecha || new Date()
  const csv = generarCsvCanal({ ...opciones, fecha })
  const nombre = nombreArchivoCanal(opciones.canal, fecha, 'csv')
  descargarBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), nombre)
  return nombre
}

export function descargarPngCanal(opciones) {
  const fecha = opciones.fecha || new Date()
  const canvas = document.createElement('canvas')
  canvas.width = ANCHO_CAPTURA
  canvas.height = alturaCaptura({ mostrarSpo2: opciones.mostrarSpo2 })
  dibujarCapturaCanal(canvas.getContext('2d'), { ...opciones, titulo: tituloCaptura(opciones.canal, opciones.nombre, fecha) })
  const nombre = nombreArchivoCanal(opciones.canal, fecha, 'png')
  canvas.toBlob((b) => { if (b) descargarBlob(b, nombre) }, 'image/png')
  return nombre
}
