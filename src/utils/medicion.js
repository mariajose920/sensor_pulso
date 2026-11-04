/**
 * Preparación de una medición para guardarla (RF30)
 *
 * Funciones puras (sin red ni pantalla): validan lo que llega de la medición y la convierten
 * en una fila de la tabla `mediciones`, respetando sus restricciones. No se guarda como válida
 * una medición con calidad de señal mala (RF16).
 */
import { puedeGuardarComoValida } from './explicacionCalidad.js'

export const FUENTES_GUARDABLES = ['sensor', 'simulador']
const RITMOS = ['normal', 'taquicardia', 'bradicardia', 'irregular']
const CALIDADES = ['buena', 'regular', 'mala']

export const MENSAJES_GUARDADO = {
  sin_sesion: 'Inicia sesión para guardar la medición en tu cuenta.',
  sin_datos: 'Todavía no hay una medición para guardar: espera a tener un BPM válido.',
  bpm_invalido: 'El BPM está fuera del rango que se puede guardar (20 a 250).',
  spo2_invalida: 'La SpO₂ está fuera del rango que se puede guardar (50 a 100).',
  calidad_mala:
    'No se guardó: la calidad de la señal es mala y una medición así no se guarda como válida. ' +
    'Corrige la causa indicada y repite la medición.',
  fuente_invalida: 'La fuente de la medición no es válida.',
  consentimiento: 'Antes de guardar debes aceptar el consentimiento informado.',
  sin_permiso: 'Tu cuenta no tiene permiso para guardar esta medición.',
  conexion: 'No hay conexión. La medición quedó guardada en este dispositivo y se enviará al volver internet.',
  generico: 'No se pudo guardar la medición. Intenta de nuevo.'
}

const aNumero = (v) => (v === null || v === undefined || v === '' ? null : Number(v))
const redondear = (v, d) => (v === null ? null : Number(v.toFixed(d)))
const enRango = (v, min, max) => v !== null && Number.isFinite(v) && v >= min && v <= max

/**
 * Regularidad del ritmo entre 0 (muy irregular) y 1 (muy regular), a partir de la variabilidad
 * de los intervalos entre latidos: coeficiente de variación = SDNN / intervalo medio.
 * Un 12 % es el límite de ritmo regular del clasificador (RF18); desde 30 % se considera 0.
 */
export function calcularRegularidad({ sdnn, bpm }) {
  const s = aNumero(sdnn)
  const b = aNumero(bpm)
  if (!Number.isFinite(s) || !Number.isFinite(b) || b <= 0 || s < 0) return null
  const cv = (s / (60000 / b)) * 100
  return redondear(Math.min(1, Math.max(0, 1 - cv / 30)), 3)
}

/**
 * @param {object} e datos de la medición
 * @param {string} e.usuarioId cuenta que guarda
 * @param {string} [e.fuente='sensor'] 'sensor' | 'simulador'
 * @param {number} e.bpm
 * @param {number} [e.spo2]
 * @param {number} [e.canal] 1 a 5
 * @param {number} [e.rmssd] HRV en ms
 * @param {number} [e.sdnn] para calcular la regularidad si no viene
 * @param {number} [e.regularidad] 0 a 1
 * @param {string} [e.ritmo] normal | taquicardia | bradicardia | irregular
 * @param {string} [e.explicacionRitmo]
 * @param {string} [e.calidad] buena | regular | mala | sin_senal
 * @param {string} [e.causaCalidad]
 * @param {string} [e.declaracionId]
 * @param {number} [e.edad]
 * @param {number} [e.actividadId]
 * @param {number|string|Date} [e.inicio]
 * @param {number|string|Date} [e.fin]
 * @param {string} [e.idCliente] uuid para no duplicar al reenviar
 * @returns {{ok: true, fila: object} | {ok: false, motivo: string, mensaje: string}}
 */
export function construirMedicion(e = {}) {
  const falla = (motivo) => ({ ok: false, motivo, mensaje: MENSAJES_GUARDADO[motivo] })

  if (!e.usuarioId) return falla('sin_sesion')

  const fuente = e.fuente || 'sensor'
  if (!FUENTES_GUARDABLES.includes(fuente)) return falla('fuente_invalida')

  const bpm = aNumero(e.bpm)
  if (bpm === null || bpm <= 0) return falla('sin_datos')
  if (!enRango(bpm, 20, 250)) return falla('bpm_invalido')

  const spo2 = aNumero(e.spo2)
  if (spo2 !== null && spo2 !== 0 && !enRango(spo2, 50, 100)) return falla('spo2_invalida')

  // RF16: con calidad mala no se guarda como válida
  const calidad = CALIDADES.includes(e.calidad) ? e.calidad : null
  if (!puedeGuardarComoValida(calidad || e.calidad)) return falla('calidad_mala')

  const fin = e.fin ? new Date(e.fin) : new Date()
  let inicio = e.inicio ? new Date(e.inicio) : fin
  if (Number.isNaN(inicio.getTime()) || inicio > fin) inicio = fin

  const canal = aNumero(e.canal)
  const rmssd = aNumero(e.rmssd)
  const edad = aNumero(e.edad)
  const regularidad = e.regularidad !== undefined && e.regularidad !== null
    ? aNumero(e.regularidad)
    : calcularRegularidad({ sdnn: e.sdnn, bpm })

  const fila = {
    usuario_id: e.usuarioId,
    fuente,
    canal: enRango(canal, 1, 5) ? canal : null,
    sesion_id: e.sesionId || null,
    actividad_id: e.actividadId ?? null,
    declaracion_id: e.declaracionId || null,
    edad_al_medir: enRango(edad, 18, 120) ? Math.round(edad) : null,
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
    bpm_promedio: redondear(bpm, 1),
    spo2_promedio: spo2 ? redondear(spo2, 1) : null,
    hrv_rmssd_ms: rmssd !== null && rmssd >= 0 ? redondear(rmssd, 2) : null,
    regularidad: enRango(regularidad, 0, 1) ? redondear(regularidad, 3) : null,
    ritmo: RITMOS.includes(e.ritmo) ? e.ritmo : null,
    explicacion_ritmo: e.explicacionRitmo || null,
    calidad,
    causa_calidad: e.causaCalidad || null,
    dentro_de_rango: typeof e.dentroDeRango === 'boolean' ? e.dentroDeRango : (typeof e.dentro_de_rango === 'boolean' ? e.dentro_de_rango : null),
    estado_conexion: 'finalizada'
  }
  if (e.idCliente) fila.id_cliente = e.idCliente

  return { ok: true, fila }
}

/**
 * Traduce un error de Supabase / red a un motivo entendible.
 * @returns {'conexion'|'consentimiento'|'sin_permiso'|'duplicada'|'calidad_mala'|'generico'}
 */
export function clasificarErrorGuardado(error) {
  if (!error) return 'generico'
  const texto = `${error.message || ''} ${error.details || ''}`.toLowerCase()
  const codigo = String(error.code || '')

  if (codigo === '23505') return 'duplicada' // ya se había guardado con ese id_cliente
  if (codigo === '23514' && texto.includes('calidad_no_mala')) return 'calidad_mala'
  if (texto.includes('consentimiento')) return 'consentimiento'
  if (codigo === '42501' || texto.includes('row-level security') || texto.includes('permission denied')) {
    return 'sin_permiso'
  }
  if (
    error.name === 'TypeError' ||
    texto.includes('failed to fetch') ||
    texto.includes('networkerror') ||
    texto.includes('network request failed') ||
    texto.includes('load failed')
  ) {
    return 'conexion'
  }
  return 'generico'
}

/** Datos mínimos de una fila de `mediciones` para mostrarla en el historial. */
export function resumirParaHistorial(m) {
  return {
    id: m.id,
    inicio: m.inicio,
    fuente: m.fuente,
    canal: m.canal,
    sesionId: m.sesion_id || null,
    actividad: m.actividad?.nombre || null,
    bpm: m.bpm_promedio !== null && m.bpm_promedio !== undefined ? Number(m.bpm_promedio) : null,
    spo2: m.spo2_promedio !== null && m.spo2_promedio !== undefined ? Number(m.spo2_promedio) : null,
    hrv: m.hrv_rmssd_ms !== null && m.hrv_rmssd_ms !== undefined ? Number(m.hrv_rmssd_ms) : null,
    ritmo: m.ritmo || null,
    calidad: m.calidad || null,
    causaCalidad: m.causa_calidad || null,
    dentroDeRango: m.dentro_de_rango ?? null,
    duracionS: m.duracion_s ?? null
  }
}

export const ETIQUETAS_RITMO = {
  normal: 'Normal',
  taquicardia: 'Taquicardia',
  bradicardia: 'Bradicardia',
  irregular: 'Irregular'
}
export const ETIQUETAS_FUENTE = { sensor: 'Sensor', simulador: 'Simulador' }
