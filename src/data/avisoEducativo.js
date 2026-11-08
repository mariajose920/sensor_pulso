/**
 * Aviso educativo y de no dispositivo médico de la plataforma (RF75, RF94)
 *
 * Un solo texto para toda la aplicación, para que las pantallas, el pie de página, el informe PDF, el
 * consentimiento y la tabla `documentos_legales` digan exactamente lo mismo. Son datos puros (sin pantalla
 * ni red) para poder probarlos con Node y leerlos sin conexión (RNF03).
 *
 * Si cambia un texto, hay que subir AVISO_VERSION y repetirlo en la migración de `documentos_legales`
 * (la prueba scripts/test-rf94-aviso-no-medico.mjs lo revisa).
 */

/** Versión del aviso vigente (se guarda en documentos_legales para saber qué texto regía en cada fecha). */
export const AVISO_VERSION = '2.0'

/** Frase corta para el pie de página y el pie del PDF. */
export const AVISO_EDUCATIVO_CORTO =
  'Plataforma educativa: no es un dispositivo médico certificado ni entrega diagnósticos.'

/** Título del recuadro. */
export const AVISO_EDUCATIVO_TITULO = 'Aviso: plataforma educativa, no es un dispositivo médico'

/** Texto completo para pantallas donde se muestran resultados de salud. */
export const AVISO_EDUCATIVO_TEXTO =
  'sensor pulso es una plataforma educativa y de laboratorio. No es un dispositivo médico certificado y no entrega diagnósticos: sus resultados (BPM, SpO₂, ritmo y comparaciones) son orientativos, no constituyen un diagnóstico médico ni sustituyen la evaluación de un profesional de la salud. Cuando un valor se parece a un patrón de referencia (por ejemplo, de taquicardia o bradicardia), es un ejercicio de aprendizaje y no una conclusión sobre tu salud. Si tienes síntomas o dudas sobre tu salud, consulta a un profesional.'

/** Dentro de cada alerta fuera de rango: el valor se parece a un patrón, no es un diagnóstico. */
export const AVISO_ALERTA =
  'Valor orientativo de una plataforma educativa: se parece a un patrón de referencia, pero no es un diagnóstico.'

/** En la comparación con ritmos de referencia (patologías y arritmias). */
export const AVISO_REFERENCIA =
  'Los ritmos de referencia sirven para aprender cómo se ven en la señal. Que tu medición se parezca a uno no significa que tengas esa condición: para eso se necesita la evaluación de un profesional de la salud.'

/** Para donde se vincula o se usa el sensor. */
export const AVISO_DISPOSITIVO =
  'El sensor con ESP32 (MAX30102) es un instrumento didáctico: no es un dispositivo médico certificado y no entrega diagnósticos.'

/** Lugares donde la aplicación muestra el aviso (los revisan las pruebas de RF75 y RF94). */
export const LUGARES_AVISO = [
  'pie', 'inicio', 'login', 'medicion', 'resultados', 'historial', 'comparacion', 'aprendizaje', 'pdf',
  'alertas', 'patologias', 'simulador', 'aula', 'evaluaciones', 'rangos', 'dispositivos', 'consentimiento'
]
