/**
 * RF32: utilidades de descarga (CSV, imagen del gráfico) y auditoría de descargas (RF62).
 * El informe PDF está en exportPdf.js.
 */
import { ppgWaveform, ecgEducationalWaveform } from './ppgMath.js'

const REPOSO_BPM = 72
const VENTANA_S = 4
const FRECUENCIA_HZ = 100

/** Convierte un nombre libre en un fragmento seguro para nombre de archivo. */
export function nombreSeguro(texto) {
  const limpio = String(texto || 'medicion')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40)
  return limpio || 'medicion'
}

export function marcaFecha(fecha = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${fecha.getFullYear()}${p(fecha.getMonth() + 1)}${p(fecha.getDate())}_${p(fecha.getHours())}${p(fecha.getMinutes())}`
}

/** Dispara la descarga de un Blob en el navegador. */
export function descargarBlob(blob, nombreArchivo) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = nombreArchivo
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Escapa una celda CSV. Neutraliza inyección de fórmulas (=, +, -, @, tab, CR)
 * en textos y encierra entre comillas si hay separadores o saltos de línea.
 */
export function celdaCsv(valor) {
  if (valor === null || valor === undefined) return ''
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : ''
  let s = String(valor)
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  if (/[",\n\r;]/.test(s)) s = `"${s.replace(/"/g, '""')}"`
  return s
}

/** Señales de la comparación (medición, plantilla de reposo y ECG educativo). */
export function generarSenales({ bpm, amplitud = 100 }) {
  const periodo = 60 / Math.max(30, bpm)
  const periodoReposo = 60 / REPOSO_BPM
  const filas = []
  const total = VENTANA_S * FRECUENCIA_HZ
  for (let i = 0; i < total; i++) {
    const t = i / FRECUENCIA_HZ
    filas.push({
      tMs: Math.round(t * 1000),
      medicion: Number((ppgWaveform((t / periodo) % 1) * (amplitud / 100)).toFixed(4)),
      plantilla: Number(ppgWaveform((t / periodoReposo) % 1).toFixed(4)),
      ecg: Number(ecgEducationalWaveform((t / periodoReposo) % 1).toFixed(4))
    })
  }
  return filas
}

/** Texto CSV (separador coma, UTF-8) con metadatos como comentarios y la señal. */
export function construirCsv({ nombre, bpm, intervaloMs, amplitud }) {
  const meta = [
    ['# sensor_pulso - datos de comparacion (RF32)'],
    ['# medicion', nombre],
    ['# generado', new Date().toISOString()],
    ['# bpm', bpm],
    ['# intervalo_ms', intervaloMs],
    ['# amplitud_pct', amplitud],
    ['# referencia_bpm', REPOSO_BPM],
    ['# frecuencia_muestreo_hz', FRECUENCIA_HZ],
    ['# nota', 'Datos educativos de la comparacion en pantalla; no es un diagnostico medico.']
  ]
  const lineas = meta.map((fila) => fila.map(celdaCsv).join(','))
  lineas.push('tiempo_ms,medicion_ppg,plantilla_ppg_reposo,ecg_educativo')
  for (const f of generarSenales({ bpm, amplitud })) {
    lineas.push([f.tMs, f.medicion, f.plantilla, f.ecg].join(','))
  }
  return lineas.join('\r\n') + '\r\n'
}

export function descargarCsv(datos) {
  // BOM para que Excel respete los acentos.
  const blob = new Blob(['﻿', construirCsv(datos)], { type: 'text/csv;charset=utf-8' })
  descargarBlob(blob, `sensor_pulso_${nombreSeguro(datos.nombre)}_${marcaFecha()}.csv`)
}

/** Dibuja el gráfico comparativo estático en un canvas fuera de pantalla. */
export function renderizarGrafico({ nombre, bpm, amplitud = 100, ancho = 1200, alto = 520 }) {
  const canvas = document.createElement('canvas')
  canvas.width = ancho
  canvas.height = alto
  const ctx = canvas.getContext('2d')
  const margenSup = 60
  const h = alto - margenSup

  ctx.fillStyle = '#070a13'
  ctx.fillRect(0, 0, ancho, alto)

  ctx.strokeStyle = '#121929'
  ctx.lineWidth = 1
  for (let x = 0; x < ancho; x += 50) {
    ctx.beginPath(); ctx.moveTo(x, margenSup); ctx.lineTo(x, alto); ctx.stroke()
  }
  for (let y = margenSup; y < alto; y += 50) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(ancho, y); ctx.stroke()
  }

  const trazar = (color, grosor, discontinua, f) => {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = grosor
    ctx.lineJoin = 'round'
    ctx.setLineDash(discontinua ? [10, 8] : [])
    ctx.beginPath()
    for (let x = 0; x <= ancho; x += 2) {
      const t = (x / ancho) * VENTANA_S
      const y = f(t)
      if (x === 0) ctx.moveTo(x, y)
      else ctx.lineTo(x, y)
    }
    ctx.stroke()
    ctx.restore()
  }

  const periodoReposo = 60 / REPOSO_BPM
  const periodo = 60 / Math.max(30, bpm)
  trazar('#818cf8', 3, false, (t) => margenSup + h * 0.70 - ecgEducationalWaveform((t / periodoReposo) % 1) * (h * 0.42))
  trazar('#06b6d4', 3, true, (t) => alto - (ppgWaveform((t / periodoReposo) % 1) * (h * 0.60) + h * 0.15))
  trazar('#22c55e', 3.6, false, (t) => alto - (ppgWaveform((t / periodo) % 1) * (amplitud / 100) * (h * 0.60) + h * 0.15))

  ctx.fillStyle = '#e2e8f0'
  ctx.font = 'bold 24px sans-serif'
  ctx.fillText('sensor_pulso - Comparacion con plantilla de reposo', 20, 30)
  ctx.font = '16px sans-serif'
  ctx.fillStyle = '#94a3b8'
  ctx.fillText(`Generado: ${new Date().toLocaleString('es-CL')}  |  Ventana: ${VENTANA_S} s`, 20, 52)

  // Leyenda dentro de la imagen
  const items = [
    ['#22c55e', false, `${nombre} (${bpm} BPM)`],
    ['#06b6d4', true, `Plantilla PPG reposo (${REPOSO_BPM} BPM)`],
    ['#818cf8', false, 'ECG educativo (referencia)']
  ]
  ctx.font = '16px sans-serif'
  let x = 20
  const y = alto - 18
  for (const [color, disc, texto] of items) {
    ctx.save()
    ctx.strokeStyle = color
    ctx.lineWidth = 3
    ctx.setLineDash(disc ? [6, 4] : [])
    ctx.beginPath(); ctx.moveTo(x, y - 5); ctx.lineTo(x + 30, y - 5); ctx.stroke()
    ctx.restore()
    ctx.fillStyle = '#e2e8f0'
    ctx.fillText(texto, x + 38, y)
    x += 38 + ctx.measureText(texto).width + 30
  }
  return canvas
}

export function canvasABlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('No se pudo generar la imagen'))), 'image/png')
  })
}

export async function descargarImagen(datos) {
  const blob = await canvasABlob(renderizarGrafico(datos))
  descargarBlob(blob, `sensor_pulso_${nombreSeguro(datos.nombre)}_${marcaFecha()}.png`)
}

/**
 * Registra la descarga en la auditoría (RF62). Requiere sesión: la función de base de datos
 * `registrar_descarga` rechaza usuarios anónimos.
 * @returns {Promise<{registrada: boolean, motivo?: string}>}
 */
export async function auditarDescarga(tipo, entidadId = null) {
  try {
    const { supabase } = await import('../services/supabase.js')
    const { data } = await supabase.auth.getSession()
    if (!data?.session) return { registrada: false, motivo: 'sin-sesion' }
    const { error } = await supabase.rpc('registrar_descarga', { p_tipo: tipo, p_entidad_id: entidadId })
    if (error) return { registrada: false, motivo: error.message }
    return { registrada: true }
  } catch (e) {
    return { registrada: false, motivo: e?.message || 'error' }
  }
}
