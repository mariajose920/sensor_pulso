/**
 * Política de retención de datos: textos, plazos y reglas que se muestran al administrador.
 *
 * Los plazos reales viven en la tabla `politicas_retencion` (supabase/migrations/20261121000100_rf60_politica_retencion.sql)
 * y los aplica una función diaria. Aquí solo hay texto y ayudas de presentación; las pruebas comprueban que lo que se
 * promete en la política de privacidad coincida con los plazos de la base.
 */

export const LIMITE_DIAS = Object.freeze({ min: 1, max: 3650 })

export const ACCIONES_RETENCION = Object.freeze({
  borrar: Object.freeze({
    etiqueta: 'Se elimina',
    explicacion: 'Los datos se borran definitivamente cuando pasa el plazo.'
  }),
  anonimizar: Object.freeze({
    etiqueta: 'Se anonimiza',
    explicacion: 'Se corta el vínculo con la persona y se limpian los campos que permiten reconocerla; quedan solo los valores medidos para estadísticas.'
  })
})

/** Qué datos cubre cada política y de qué tipo son (clasificación). */
export const POLITICAS_INFO = Object.freeze({
  lecturas: Object.freeze({
    nombre: 'Lecturas de la medición',
    clase: 'sensible_salud',
    detalle: 'Valores de BPM y SpO₂ segundo a segundo.'
  }),
  bloques_senal: Object.freeze({
    nombre: 'Señal PPG cruda',
    clase: 'sensible_salud',
    detalle: 'La señal completa de cada medición. No se toca la de mediciones publicadas en la galería.'
  }),
  declaraciones_paciente: Object.freeze({
    nombre: 'Fichas de salud de sesiones y canales',
    clase: 'sensible_salud',
    detalle: 'Fichas ligadas a una sesión o canal. La ficha propia de cada persona se conserva hasta que ella la elimine.'
  }),
  alertas: Object.freeze({
    nombre: 'Alertas fuera de rango',
    clase: 'sensible_salud',
    detalle: 'Avisos generados cuando una medición salió de su rango.'
  }),
  comparaciones: Object.freeze({
    nombre: 'Comparaciones guardadas',
    clase: 'sensible_salud',
    detalle: 'Análisis que comparan mediciones de una misma persona.'
  }),
  mediciones: Object.freeze({
    nombre: 'Resumen de las mediciones',
    clase: 'sensible_salud',
    detalle: 'Resultado de cada medición (BPM, SpO₂, ritmo). Pasado el plazo queda sin dueño, solo para estadísticas. No se toca lo publicado en la galería.'
  }),
  intentos_login: Object.freeze({
    nombre: 'Intentos de inicio de sesión',
    clase: 'privado',
    detalle: 'Correo e IP de cada intento, para detectar accesos sospechosos.'
  }),
  limites_peticiones: Object.freeze({
    nombre: 'Contadores de peticiones',
    clase: 'privado',
    detalle: 'Contadores técnicos para limitar el abuso.'
  }),
  bloqueos_cuenta: Object.freeze({
    nombre: 'Bloqueos de cuenta',
    clase: 'privado',
    detalle: 'Bloqueos temporales por intentos fallidos, ya vencidos.'
  }),
  invitaciones_aula: Object.freeze({
    nombre: 'Invitaciones a aulas',
    clase: 'privado',
    detalle: 'Correos a los que se invitó a un aula.'
  })
})

/** Lo que la retención nunca toca, y por qué. */
export const NUNCA_SE_ELIMINA = Object.freeze([
  Object.freeze({
    titulo: 'Registro de auditoría',
    motivo: 'Es inmutable: nadie puede editarlo ni borrarlo, ni siquiera la retención. Es la prueba de qué ocurrió ante un incidente.'
  }),
  Object.freeze({
    titulo: 'Lo publicado en la galería',
    motivo: 'Su titular lo publicó anonimizado y con confirmación explícita, y puede retirarlo cuando quiera.'
  }),
  Object.freeze({
    titulo: 'La ficha propia de cada persona',
    motivo: 'Se conserva mientras exista la cuenta; solo cambia o se elimina cuando la persona lo pide (derecho de supresión).'
  }),
  Object.freeze({
    titulo: 'Aulas, evaluaciones y calificaciones',
    motivo: 'Son el registro académico del curso y no se eliminan por tiempo.'
  })
])

export function infoPolitica(tabla) {
  return POLITICAS_INFO[tabla] || {
    nombre: String(tabla || '').replace(/_/g, ' '),
    clase: 'privado',
    detalle: ''
  }
}

/** 2 → «2 días» · 90 → «3 meses» · 365 → «12 meses» · 730 → «2 años». */
export function formatearPlazo(dias) {
  const d = Math.trunc(Number(dias))
  if (!Number.isFinite(d) || d < 1) return '—'
  if (d === 365) return '12 meses'
  if (d % 365 === 0) return `${d / 365} años`
  if (d >= 90 && d % 30 === 0) return `${d / 30} meses`
  return d === 1 ? '1 día' : `${d} días`
}

/** Valida el plazo que escribe el administrador. */
export function validarDias(valor) {
  const texto = String(valor ?? '').trim()
  if (!/^\d+$/.test(texto)) return { ok: false, error: 'Escribe un número entero de días.' }
  const dias = Number(texto)
  if (dias < LIMITE_DIAS.min || dias > LIMITE_DIAS.max) {
    return { ok: false, error: `El plazo debe estar entre ${LIMITE_DIAS.min} y ${LIMITE_DIAS.max} días.` }
  }
  return { ok: true, dias }
}

/** «0 4 * * *» → «todos los días a las 04:00». Si no se entiende, se muestra tal cual. */
export function describirHorario(horario) {
  const m = /^(\d{1,2})\s+(\d{1,2})\s+\*\s+\*\s+\*$/.exec(String(horario || '').trim())
  if (!m) return horario ? String(horario) : ''
  return `todos los días a las ${m[2].padStart(2, '0')}:${m[1].padStart(2, '0')}`
}
