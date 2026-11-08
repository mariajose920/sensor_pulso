/**
 * Política de privacidad de la plataforma (RF88)
 *
 * Un solo texto para la pantalla /privacidad y para la tabla `documentos_legales`, de modo que
 * ambos digan lo mismo. Son datos puros (sin pantalla ni red) para poder probarlos con Node y
 * leerlos sin conexión (RNF03).
 *
 * Los plazos de conservación replican `politicas_retencion` (supabase/migrations/…0800_datos_iniciales.sql)
 * y el consentimiento informado (consentimientoService.js). Si cambia uno, hay que cambiar los otros:
 * la prueba scripts/test-rf88-privacidad.mjs lo revisa.
 *
 * Alineación: ISO/IEC 27001:2022 Anexo A 5.34 (privacidad y protección de datos personales),
 * 5.31 (requisitos legales) y 5.12/5.13 (clasificación y etiquetado de la información).
 */

export const POLITICA_VERSION = '1.0'
export const POLITICA_VIGENTE_DESDE = '2026-11-08'

/** Responsable del tratamiento: el mismo que figura en el consentimiento informado. */
export const RESPONSABLE =
  'Equipo del proyecto sensor pulso — Universidad Adventista de Chile (UNACH), Facultad de Ingeniería y Negocios.'

/**
 * Canal de contacto. Se configura con VITE_CONTACTO_PRIVACIDAD (correo institucional que atiende
 * las solicitudes). Sin configurar se indica el equipo responsable, para no inventar una dirección.
 */
export function canalContacto(correo = '') {
  const limpio = String(correo || '').trim()
  if (/^[^\s@]+@(alu\.)?unach\.cl$/i.test(limpio)) {
    return { tipo: 'correo', valor: limpio, texto: `Escribe a ${limpio} indicando el derecho que quieres ejercer.` }
  }
  return {
    tipo: 'equipo',
    valor: '',
    texto:
      'Dirígete al equipo del proyecto sensor pulso, en la Facultad de Ingeniería y Negocios de la UNACH, ' +
      'indicando el derecho que quieres ejercer.'
  }
}

export const PLAZO_RESPUESTA_DIAS = 30

export const SECCIONES = [
  {
    id: 'responsable',
    titulo: '1. Quién es responsable de tus datos',
    parrafos: [RESPONSABLE, 'Es una plataforma educativa y de laboratorio universitario.']
  },
  {
    id: 'datos',
    titulo: '2. Qué datos tratamos',
    lista: [
      'Cuenta: correo institucional (@alu.unach.cl o @unach.cl), nombre, rol y fecha de registro.',
      'Mediciones: señal de pulso (fotopletismografía), frecuencia cardíaca (BPM), saturación de oxígeno (SpO₂) y variabilidad R-R.',
      'Ficha declarada: edad y factores que tú declaras (estrés, sueño, medicación, cafeína, actividad previa, condición de salud). Son datos de salud: los tratamos como datos sensibles.',
      'Seguridad: intentos de inicio de sesión, bloqueos y registro de acciones relevantes (auditoría).',
      'Aulas: a qué aulas y cursos perteneces y las evaluaciones que realizas.'
    ]
  },
  {
    id: 'finalidad',
    titulo: '3. Para qué los usamos',
    parrafos: [
      'Solo con fines educativos: medir, visualizar, analizar y comparar tu pulso y saturación de oxígeno, y apoyar la docencia en aulas. No los usamos para diagnóstico médico, publicidad ni fines comerciales, ni los vendemos o cedemos a terceros.'
    ]
  },
  {
    id: 'base',
    titulo: '4. Con qué fundamento',
    parrafos: [
      'Tu consentimiento informado, expreso, previo y específico, que das antes de medir y que puedes revocar cuando quieras. Para datos de salud no usamos otra base.',
      'Para tu cuenta y la seguridad de la plataforma, el interés legítimo de la universidad en mantenerla segura.',
      'Ninguna medición se hace pública sin una confirmación adicional y explícita tuya.'
    ]
  },
  {
    id: 'plazos',
    titulo: '5. Cuánto tiempo los conservamos',
    lista: [
      'Mediciones (lecturas de la señal): hasta 12 meses; después se borran automáticamente.',
      'Ficha declarada de salud: hasta 12 meses; después se borra automáticamente.',
      'Intentos de inicio de sesión: 90 días.',
      'Contadores técnicos de peticiones: 2 días.',
      'Registro de auditoría: se conserva para poder demostrar qué pasó ante un incidente; no contiene tus mediciones.',
      'Puedes pedir la eliminación antes de esos plazos (derecho de supresión).'
    ]
  },
  {
    id: 'destinatarios',
    titulo: '6. Quién más interviene y dónde se alojan',
    lista: [
      'Supabase aloja la base de datos y la autenticación, en la región us-east-1 (Estados Unidos), es decir, fuera de Chile.',
      'Vercel sirve la aplicación web.',
      'Resend envía los correos de confirmación de la cuenta.',
      'Son encargados que tratan los datos por cuenta de la universidad y solo para operar la plataforma. Al estar fuera de Chile, se trata de una transferencia internacional de datos.'
    ]
  },
  {
    id: 'derechos',
    titulo: '7. Tus derechos',
    parrafos: [
      'Puedes ejercer los derechos de acceso, rectificación, supresión, oposición y portabilidad, y revocar tu consentimiento en cualquier momento. Revocarlo retira tus mediciones publicadas.',
      'Con sesión iniciada, hazlo desde «Mis datos y derechos»: puedes descargar todos tus datos, enviar una solicitud y ver su estado. Solo tú ves tus datos.',
      `Respondemos dentro de ${PLAZO_RESPUESTA_DIAS} días desde que recibimos la solicitud.`
    ]
  },
  {
    id: 'seguridad',
    titulo: '8. Cómo protegemos tus datos',
    lista: [
      'Conexión cifrada (HTTPS) y cabeceras de seguridad en todo el sitio.',
      'Reglas de acceso a nivel de fila: cada persona ve solo lo que le corresponde según su rol. Estudiantes y profesores sin permiso especial ven únicamente sus propios datos y la información mínima que necesitan.',
      'Los datos de salud que declaras se cifran en el servidor antes de guardarse; el navegador no tiene las claves.',
      'Bloqueo temporal de cuentas tras intentos fallidos y límite de peticiones.',
      'Registro de auditoría que no se puede modificar.',
      'Borrado automático de datos al cumplirse los plazos de conservación.'
    ]
  },
  {
    id: 'brechas',
    titulo: '9. Si ocurre un incidente',
    parrafos: [
      'Si una brecha de seguridad afecta tus datos, te avisaremos y lo comunicaremos a la autoridad competente según corresponda.'
    ]
  },
  {
    id: 'no-medico',
    titulo: '10. Esta plataforma no es un dispositivo médico',
    parrafos: [
      'Los resultados son orientativos y no constituyen un diagnóstico. Ante dudas de salud consulta a un profesional.'
    ]
  },
  {
    id: 'cambios',
    titulo: '11. Cambios en esta política',
    parrafos: [
      `Esta es la versión ${POLITICA_VERSION}, vigente desde el ${POLITICA_VIGENTE_DESDE}. Si cambia de forma relevante, cambiará la versión y te lo informaremos en la plataforma.`
    ]
  }
]

/** Texto plano completo, para guardarlo en `documentos_legales.contenido`. */
export function textoPlano(correo = '') {
  const contacto = canalContacto(correo)
  const partes = SECCIONES.map(s => [s.titulo, ...(s.parrafos || []), ...(s.lista || []).map(l => '- ' + l)].join('\n'))
  partes.splice(7, 0, ['Contacto', contacto.texto].join('\n'))
  return partes.join('\n\n')
}
