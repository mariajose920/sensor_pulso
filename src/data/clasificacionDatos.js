/**
 * Clasificación de los datos de la plataforma: qué tipos hay y cómo se trata cada uno.
 *
 * Es la única fuente de los textos que se muestran en la política de privacidad, en «Mis datos y mis
 * derechos» y en el panel del administrador. La clasificación columna por columna vive en la tabla
 * `clasificacion_datos` de la base (ver supabase/migrations/20261119000100_rf56_clasificacion_datos.sql).
 *
 * Solo se describe lo que la plataforma ya hace; lo que está en preparación no se presenta como hecho.
 * El enmascaramiento (cómo se muestran los datos de otras personas) lo aplica src/utils/enmascarar.js.
 */

export const CLASES_DATO = Object.freeze({
  PUBLICO: 'publico',
  PRIVADO: 'privado',
  SENSIBLE_SALUD: 'sensible_salud'
})

/** Orden en que se muestran: de menos a más protegido. */
export const ORDEN_CLASES = Object.freeze([
  CLASES_DATO.PUBLICO,
  CLASES_DATO.PRIVADO,
  CLASES_DATO.SENSIBLE_SALUD
])

export const CLASES = Object.freeze({
  publico: Object.freeze({
    id: 'publico',
    etiqueta: 'Público',
    nivel: 1,
    resumen: 'Cualquier persona puede verlo, con o sin sesión.',
    descripcion:
      'Contenido educativo o de referencia que se muestra abiertamente. Si proviene de una persona, solo se publica anonimizado y después de que su titular lo confirma.',
    ejemplos: Object.freeze([
      'Lecciones y casos de aprendizaje',
      'Rangos de referencia de BPM y SpO₂',
      'Mediciones publicadas en la galería (anonimizadas)',
      'Conjuntos de datos y señales de referencia'
    ])
  }),
  privado: Object.freeze({
    id: 'privado',
    etiqueta: 'Privado',
    nivel: 2,
    resumen: 'Solo lo ve su titular y quien lo necesite para su función.',
    descripcion:
      'Datos personales y de uso de la cuenta: identifican a una persona o muestran su actividad en la plataforma, pero no describen su salud.',
    ejemplos: Object.freeze([
      'Nombre, correo y rol de la cuenta',
      'Aulas, evaluaciones, respuestas y calificaciones',
      'Intentos de acceso y registros de auditoría',
      'Dispositivos y sus datos de conexión'
    ])
  }),
  sensible_salud: Object.freeze({
    id: 'sensible_salud',
    etiqueta: 'Sensible de salud',
    nivel: 3,
    resumen: 'Es el nivel más protegido: describe la salud de una persona.',
    descripcion:
      'Datos que reflejan el estado de salud o el funcionamiento del cuerpo. Reciben la mayor protección y solo se comparten con una confirmación explícita de su titular.',
    ejemplos: Object.freeze([
      'Ficha de salud declarada (condición, medicación, sueño, cafeína, estrés)',
      'Mediciones de frecuencia cardíaca (BPM) y SpO₂',
      'Señal PPG, lecturas y su interpretación',
      'Alertas y comparaciones de mediciones'
    ])
  })
})

/**
 * Cómo se trata cada clase. Cada fila es un aspecto del tratamiento y trae el texto para cada clase.
 */
export const TRATAMIENTOS = Object.freeze([
  Object.freeze({
    id: 'acceso',
    titulo: 'Quién puede verlo',
    publico: 'Cualquier persona, con o sin sesión.',
    privado: 'Su titular. Un profesor ve solo lo de su aula y el administrador lo necesario para gestionar la plataforma.',
    sensible_salud: 'Su titular. El profesor ve solo los resultados de las evaluaciones que asignó; la ficha declarada solo la ve su titular.'
  }),
  Object.freeze({
    id: 'visualizacion',
    titulo: 'Cómo se muestra',
    publico: 'Se muestra completo, sin enmascarar.',
    privado: 'A quien no es su titular, el correo, el nombre y la IP se le muestran enmascarados (por ejemplo a***@unach.cl). El administrador puede mostrarlos por un minuto y queda registrado.',
    sensible_salud: 'Igual que lo privado, y la ficha declarada nunca se muestra a otras personas.'
  }),
  Object.freeze({
    id: 'proteccion',
    titulo: 'Cómo se protege',
    publico: 'Conexión cifrada (HTTPS).',
    privado: 'Conexión cifrada, cifrado en reposo y reglas de acceso por fila en la base de datos.',
    sensible_salud: 'Todo lo anterior, y además cifrado por campo en la ficha declarada, con claves guardadas fuera del código y con rotación.'
  }),
  Object.freeze({
    id: 'publicacion',
    titulo: 'Si se puede publicar',
    publico: 'Sí, es su naturaleza.',
    privado: 'No. Nunca se publica.',
    sensible_salud: 'Solo anonimizado, con vista previa y confirmación explícita de su titular.'
  }),
  Object.freeze({
    id: 'conservacion',
    titulo: 'Cuánto tiempo se conserva',
    publico: 'Mientras el contenido esté vigente.',
    privado: 'Mientras exista la cuenta. Los registros técnicos de acceso se eliminan a los 90 días.',
    sensible_salud: 'Hasta 365 días para las lecturas, la señal y la ficha declarada; el resumen de la medición se anonimiza a los 2 años. Su titular puede eliminarlos antes.'
  }),
  Object.freeze({
    id: 'derechos',
    titulo: 'Derechos de su titular',
    publico: 'No aplica (no identifica a nadie).',
    privado: 'Consultar, corregir, exportar y eliminar.',
    sensible_salud: 'Consultar, corregir, exportar y eliminar, además de retirar su consentimiento en cualquier momento.'
  }),
  Object.freeze({
    id: 'registro',
    titulo: 'Qué queda registrado',
    publico: 'Los cambios de contenido.',
    privado: 'Cambios de rol, descargas y eliminaciones quedan en el registro de auditoría.',
    sensible_salud: 'Descargas, publicaciones y eliminaciones quedan en el registro de auditoría, que nadie puede editar ni borrar.'
  })
])

/** Nombres entendibles de las tablas de la base de datos. */
export const NOMBRES_TABLAS = Object.freeze({
  perfiles: 'Cuentas y perfiles',
  consentimientos_aceptados: 'Consentimientos aceptados',
  solicitudes_derechos: 'Solicitudes de derechos',
  invitaciones_aula: 'Invitaciones a aulas',
  declaraciones_paciente: 'Ficha de salud declarada',
  mediciones: 'Mediciones',
  lecturas: 'Lecturas de la medición',
  bloques_senal: 'Señal PPG',
  comparaciones: 'Comparaciones',
  alertas: 'Alertas fuera de rango',
  aulas: 'Aulas',
  evaluaciones: 'Evaluaciones',
  intentos_evaluacion: 'Intentos de evaluación',
  respuestas: 'Respuestas',
  dispositivos: 'Dispositivos ESP32',
  sesiones_medicion: 'Sesiones de medición',
  auditoria: 'Registro de auditoría',
  intentos_login: 'Intentos de inicio de sesión',
  incidentes: 'Incidentes de seguridad',
  publicaciones: 'Galería pública',
  lecciones: 'Lecciones',
  rangos: 'Rangos de referencia',
  actividades: 'Actividades',
  datasets_publicos: 'Conjuntos de datos públicos',
  senales_referencia: 'Señales de referencia',
  documentos_legales: 'Documentos legales',
  admins_iniciales: 'Administradores iniciales',
  aula_estudiantes: 'Estudiantes del aula',
  bloqueos_cuenta: 'Bloqueos de cuenta',
  brechas: 'Brechas de seguridad',
  clasificacion_datos: 'Clasificación de los datos',
  config_plataforma: 'Configuración de la plataforma',
  consentimientos_version: 'Versiones del consentimiento',
  cursos: 'Cursos',
  evaluacion_asignaciones: 'Asignaciones de evaluación',
  evaluacion_ejercicios: 'Ejercicios de la evaluación',
  evaluacion_preguntas: 'Preguntas de la evaluación',
  insignias: 'Insignias',
  intento_ejercicios: 'Resultados por ejercicio',
  limites_peticiones: 'Límites de peticiones',
  notificaciones_seguridad: 'Notificaciones de seguridad',
  permisos_profesor: 'Permisos de profesores',
  politicas_retencion: 'Políticas de retención',
  preguntas: 'Banco de preguntas',
  preguntas_claves: 'Claves de las preguntas',
  progreso_lecciones: 'Progreso en lecciones',
  propuestas_cambio: 'Propuestas de cambio',
  rangos_personales: 'Rangos personales',
  sesion_canal_requisitos: 'Requisitos de canal por sesión',
  sesion_canales: 'Canales de la sesión'
})

export function nombreTabla(tabla) {
  return NOMBRES_TABLAS[tabla] || String(tabla || '').replace(/_/g, ' ')
}

export function metaClase(clase) {
  return CLASES[clase] || null
}

export function etiquetaClase(clase) {
  return CLASES[clase]?.etiqueta || 'Sin clasificar'
}
