/**
 * Aviso educativo de la plataforma (RF75)
 *
 * Un solo texto para toda la aplicación, para que las pantallas, el pie de página y el informe PDF
 * digan exactamente lo mismo. Son datos puros (sin pantalla ni red) para poder probarlos con Node
 * y leerlos sin conexión (RNF03).
 */

/** Frase corta para el pie de página y el pie del PDF. */
export const AVISO_EDUCATIVO_CORTO =
  'Plataforma educativa: no sustituye el diagnóstico ni la opinión de un profesional de la salud.'

/** Título del recuadro. */
export const AVISO_EDUCATIVO_TITULO = 'Aviso: plataforma educativa'

/** Texto completo para pantallas donde se muestran resultados de salud. */
export const AVISO_EDUCATIVO_TEXTO =
  'sensor pulso es una plataforma educativa y de laboratorio. Sus resultados (BPM, SpO₂, ritmo y comparaciones) ' +
  'son orientativos y no constituyen un diagnóstico médico ni sustituyen la evaluación de un profesional de la salud. ' +
  'Si tienes síntomas o dudas sobre tu salud, consulta a un profesional.'

/** Lugares donde la aplicación muestra el aviso (los revisa la prueba del RF75). */
export const LUGARES_AVISO = ['pie', 'inicio', 'login', 'medicion', 'resultados', 'historial', 'comparacion', 'aprendizaje', 'pdf']
