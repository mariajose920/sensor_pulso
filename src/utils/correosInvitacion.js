/**
 * RF100: lectura de varios correos pegados a la vez para invitar estudiantes a un aula.
 * Acepta correos separados por coma, punto y coma, espacio o salto de línea, y también el formato
 * «Nombre <correo@alu.unach.cl>». Quita repetidos y separa los que no son de estudiante institucional.
 */
import { validarCorreoInstitucional } from './validators.js'

export const MAX_INVITACIONES_POR_ENVIO = 30

const EXTRAER_CORREO = /<([^<>\s]+)>/

/** Divide el texto en candidatos (en minúscula, sin vacíos). */
export function separarCandidatos(texto) {
  return String(texto || '')
    .split(/[\s,;]+/)
    .map((t) => t.trim().replace(/^[<"']+|[>"']+$/g, '').toLowerCase())
    .filter(Boolean)
}

/**
 * @returns {{ validos: string[], invalidos: string[], repetidos: string[], excedidos: string[] }}
 *  validos: correos de estudiante únicos y listos para enviar (hasta MAX_INVITACIONES_POR_ENVIO)
 *  invalidos: no son correos institucionales de estudiante (@alu.unach.cl)
 *  repetidos: aparecían más de una vez
 *  excedidos: válidos que sobran sobre el máximo por envío
 */
export function parsearCorreos(texto, { maximo = MAX_INVITACIONES_POR_ENVIO } = {}) {
  const vistos = new Set()
  const validos = []
  const invalidos = []
  const repetidos = []
  const excedidos = []
  for (const bruto of separarCandidatos(String(texto || '').replace(EXTRAER_CORREO, ' $1 '))) {
    if (vistos.has(bruto)) {
      if (!repetidos.includes(bruto)) repetidos.push(bruto)
      continue
    }
    vistos.add(bruto)
    const v = validarCorreoInstitucional(bruto)
    if (!v.valido || v.rol !== 'usuario') {
      invalidos.push(bruto)
    } else if (validos.length >= maximo) {
      excedidos.push(bruto)
    } else {
      validos.push(bruto)
    }
  }
  return { validos, invalidos, repetidos, excedidos }
}

/** Quita un correo del texto original (para los botones × de la lista). */
export function quitarCorreoDelTexto(texto, correo) {
  const objetivo = String(correo || '').toLowerCase()
  return separarCandidatos(String(texto || '').replace(EXTRAER_CORREO, ' $1 '))
    .filter((c) => c !== objetivo)
    .join('\n')
}
