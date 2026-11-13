/**
 * Reglas de «Agregar otro canal» (RF111, RF12, RF08)
 *
 * Datos puros (sin pantalla ni red) para poder probarlos con Node.
 * - Estudiantes y usuarios normales: un solo canal por sesión.
 * - Profesor y administrador: hasta 5 canales (los del ESP32), cada uno con su persona.
 * - Cada canal agregado exige ficha RF03 + política RF88 + consentimiento RF04 antes de medir.
 * La misma regla la aplica la base de datos (migración 20261109000200_canales_multiples_docente.sql).
 */
import { pacienteService } from '../services/pacienteService.js'

export const MAX_CANALES_DOCENTE = 5

export function esDocente(rol) {
  return rol === 'profesor' || rol === 'admin'
}

export function canalesDe(canales, usuarioId) {
  return (canales || []).filter(c => c.usuario_id && c.usuario_id === usuarioId)
}

/** Siguiente canal libre (el de número más bajo). Nadie lo elige a mano. */
export function siguienteCanalLibre(canales) {
  const libres = (canales || []).filter(c => !c.usuario_id).map(c => c.canal).sort((a, b) => a - b)
  return libres.length ? libres[0] : null
}

/** ¿Se muestra y funciona el botón «Agregar canal»? Desde el primer canal: el profesor/admin nunca elige el número a mano. */
export function evaluarAgregarCanal({ rol, canales, usuarioId, max = MAX_CANALES_DOCENTE }) {
  if (!esDocente(rol)) return { visible: false, puede: false, motivo: 'Solo el profesor y el administrador pueden tener más de un canal.' }
  const propios = canalesDe(canales, usuarioId).length
  if (propios >= max) return { visible: true, puede: false, motivo: `Ya tienes los ${max} canales.` }
  if (siguienteCanalLibre(canales) === null) return { visible: true, puede: false, motivo: 'No quedan canales libres en esta sesión.' }
  return { visible: true, puede: true, motivo: '', primero: propios === 0 }
}

/**
 * ¿Se muestra y funciona el botón «Asignarme un canal» del estudiante? Igual que el del profesor, el número no se elige:
 * el sistema toma el siguiente canal libre. Un estudiante tiene como máximo un canal.
 */
export function evaluarAsignacionEstudiante({ rol, canales, usuarioId }) {
  if (esDocente(rol)) return { visible: false, puede: false, motivo: '' }
  const propio = canalesDe(canales, usuarioId)[0]
  if (propio) return { visible: true, puede: false, motivo: `Ya tienes el Canal ${propio.canal}. Libéralo si quieres que el sistema te asigne otro.`, asignado: propio.canal }
  if (siguienteCanalLibre(canales) === null) {
    return { visible: true, puede: false, motivo: 'No quedan canales libres en esta ronda. Espera a que el profesor abra la siguiente.' }
  }
  return { visible: true, puede: true, motivo: '' }
}

/** Canal principal de la cuenta: el que tomó primero. Pasó por el protocolo normal (pasos 1 y 2). */
export function canalPrincipal(canales, usuarioId) {
  const propios = canalesDe(canales, usuarioId)
  if (!propios.length) return null
  return propios.slice().sort((a, b) =>
    String(a.asignado_en || '').localeCompare(String(b.asignado_en || '')) || a.canal - b.canal)[0].canal
}

/** Tres pasos completos: ficha válida, política aceptada y consentimiento aceptado. */
export function requisitosCompletos(req, { politicaVigente, consentimientoVigente } = {}) {
  if (!req) return { completos: false, faltan: ['ficha', 'politica', 'consentimiento'] }
  const faltan = []
  if (!req.ficha || !pacienteService.validarDatos(req.ficha).valido) faltan.push('ficha')
  if (!req.politicaVersion || (politicaVigente && req.politicaVersion !== politicaVigente)) faltan.push('politica')
  if (!req.consentimientoVersion || (consentimientoVigente && req.consentimientoVersion !== consentimientoVigente)) faltan.push('consentimiento')
  return { completos: faltan.length === 0, faltan }
}

/** ¿Este canal puede usarse para medir? El principal no pide nada extra; los demás sí. */
export function canalListoParaMedir({ canal, canales, usuarioId, requisitos, vigentes }) {
  const propio = canalesDe(canales, usuarioId).some(c => c.canal === canal)
  if (!propio) return true // canales de otras cuentas: no se miden desde aquí
  if (canalPrincipal(canales, usuarioId) === canal) return true
  return requisitosCompletos(requisitos?.[canal], vigentes).completos
}
