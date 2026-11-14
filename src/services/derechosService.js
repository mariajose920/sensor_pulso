/**
 * Derechos del titular (RF58, RF89, RF90) y gestión de incidentes y brechas (RF73, RF92).
 * ISO 27001 A.5.34 (privacidad) y A.5.24–A.5.26 (incidentes).
 *
 * Todo pasa por la sesión de la persona y por la RLS de la base: cada quien ve solo sus solicitudes y
 * solo el administrador ve las de todos y los incidentes. Las consultas piden únicamente las columnas
 * que cada pantalla necesita (minimización de datos).
 */
import { supabase } from './supabase.js'
import { registrarEventoAuditoria } from './auditoriaService.js'
import { pacienteService, NIVELES_ESTRES, OPCIONES_SUENO, OPCIONES_CAFEINA, OPCIONES_MEDICACION } from './pacienteService.js'
import { borrarMedicionesVistas } from '../pwa/medicionesOffline.js'
import { borrarPendientes } from '../pwa/medicionesPendientes.js'

const CLAVE_HABITOS_SESION = 'sensor_evolucion_habitos_sesion_rf37'

function limpiarHabitosSesionLocal() {
  if (typeof sessionStorage === 'undefined') return
  const aBorrar = []
  for (let i = 0; i < sessionStorage.length; i += 1) {
    const k = sessionStorage.key(i)
    if (k && k.startsWith(CLAVE_HABITOS_SESION)) aBorrar.push(k)
  }
  aBorrar.forEach((k) => sessionStorage.removeItem(k))
}

export const TIPOS_DERECHO = [
  { valor: 'acceso', texto: 'Acceso: saber qué datos tuyos tratamos' },
  { valor: 'rectificacion', texto: 'Rectificación: corregir un dato incorrecto' },
  { valor: 'supresion', texto: 'Supresión: borrar mis datos' },
  { valor: 'oposicion', texto: 'Oposición: oponerme a un uso de mis datos' },
  { valor: 'portabilidad', texto: 'Portabilidad: recibir mis datos en un archivo' }
]

export const ESTADOS_SOLICITUD = {
  recibida: 'Recibida',
  en_proceso: 'En proceso',
  resuelta: 'Resuelta',
  rechazada: 'Rechazada'
}

export const SEVERIDADES = ['baja', 'media', 'alta', 'critica']
export const ESTADOS_INCIDENTE = { abierto: 'Abierto', en_analisis: 'En análisis', contenido: 'Contenido', resuelto: 'Resuelto', cerrado: 'Cerrado' }

export const PLAZO_LEGAL_DIAS = 30
export const DIAS_PROXIMA_A_VENCER = 5

const LARGO_DETALLE = 1000

// Dependencias inyectables únicamente para pruebas unitarias e integrales en Node
let deps = {
  supabase,
  pacienteService,
  registrarEventoAuditoria,
  limpiarCacheLocal: async () => {
    try { await borrarMedicionesVistas() } catch { /* entorno sin IndexedDB */ }
    try { borrarPendientes() } catch { /* entorno sin storage */ }
    try { pacienteService.limpiarDeclaracionLocal() } catch { /* entorno sin storage */ }
    try { limpiarHabitosSesionLocal() } catch { /* entorno sin storage */ }
  }
}

/** Calcula la fecha límite legal de respuesta a partir de una fecha inicial. */
export function calcularFechaLimite(desde = new Date(), diasPlazo = PLAZO_LEGAL_DIAS) {
  const baseMs = new Date(desde).getTime()
  const ms = Number.isNaN(baseMs) ? Date.now() : baseMs
  return new Date(ms + diasPlazo * 86400000).toISOString()
}

/** Indica si una solicitud sigue abierta y pendiente de resolución final. */
export function esSolicitudAbierta(estado) {
  return estado === 'recibida' || estado === 'en_proceso'
}

/** Días que faltan para el plazo de respuesta (negativo si ya venció). */
export function diasParaVencer(venceEn, ahora = new Date()) {
  const ms = new Date(venceEn).getTime() - ahora.getTime()
  return Number.isNaN(ms) ? null : Math.ceil(ms / 86400000)
}

/** Indica si una solicitud abierta ya superó su fecha límite legal. */
export function estaSolicitudVencida(solicitud, ahora = new Date()) {
  if (!solicitud || !esSolicitudAbierta(solicitud.estado)) return false
  const d = diasParaVencer(solicitud.vence_en, ahora)
  return d !== null && d < 0
}

/** Indica si una solicitud abierta está próxima a vencer (entre 0 y DIAS_PROXIMA_A_VENCER días). */
export function esSolicitudProximaAVencer(solicitud, ahora = new Date(), umbralDias = DIAS_PROXIMA_A_VENCER) {
  if (!solicitud || !esSolicitudAbierta(solicitud.estado)) return false
  const d = diasParaVencer(solicitud.vence_en, ahora)
  return d !== null && d >= 0 && d <= umbralDias
}

/** Clasifica el estado temporal de una solicitud: 'respondida' | 'vencida' | 'proxima' | 'en_plazo'. */
export function clasificarPlazoSolicitud(solicitud, ahora = new Date()) {
  if (!solicitud) return 'en_plazo'
  if (solicitud.estado === 'resuelta' || solicitud.estado === 'rechazada') return 'respondida'
  if (estaSolicitudVencida(solicitud, ahora)) return 'vencida'
  if (esSolicitudProximaAVencer(solicitud, ahora)) return 'proxima'
  return 'en_plazo'
}

/** Calcula los contadores de resumen para el panel del administrador. */
export function resumirSolicitudesAdmin(lista = [], ahora = new Date()) {
  const filas = Array.isArray(lista) ? lista : []
  let abiertas = 0
  let proximasAVencer = 0
  let vencidas = 0
  let respondidas = 0

  for (const s of filas) {
    if (s.estado === 'resuelta' || s.estado === 'rechazada') {
      respondidas += 1
    } else if (esSolicitudAbierta(s.estado)) {
      abiertas += 1
      if (estaSolicitudVencida(s, ahora)) vencidas += 1
      else if (esSolicitudProximaAVencer(s, ahora)) proximasAVencer += 1
    }
  }

  return {
    total: filas.length,
    abiertas,
    proximasAVencer,
    vencidas,
    respondidas
  }
}

/** Texto de plazo para mostrar: «Vence en 12 días», «Vence hoy» o «Vencida hace 3 días». */
export function textoPlazo(venceEn, estado, ahora = new Date()) {
  if (estado === 'resuelta' || estado === 'rechazada') return ''
  const d = diasParaVencer(venceEn, ahora)
  if (d === null) return ''
  if (d < 0) return `Vencida hace ${-d} día${d === -1 ? '' : 's'}`
  if (d === 0) return 'Vence hoy'
  return `Vence en ${d} día${d === 1 ? '' : 's'}`
}

/** Valida el formulario de una solicitud antes de enviarla. */
export function validarSolicitud({ tipo, detalle }) {
  if (!TIPOS_DERECHO.some(t => t.valor === tipo)) return 'Elige el derecho que quieres ejercer.'
  if (String(detalle || '').length > LARGO_DETALLE) return `El detalle no puede superar los ${LARGO_DETALLE} caracteres.`
  if (tipo === 'rectificacion' && String(detalle || '').trim().length < 10) {
    return 'Cuéntanos qué dato quieres corregir (mínimo 10 caracteres).'
  }
  if (tipo === 'oposicion' && String(detalle || '').trim().length < 3) {
    return 'Indica brevemente a qué uso de tus datos te opones.'
  }
  return ''
}

/**
 * Valida los datos enviados por el titular al ejercer directamente su derecho de rectificación (corregir).
 */
export function validarRectificacionDatos(datos = {}) {
  const nombre = String(datos?.nombre ?? '').trim()
  if (nombre.length < 2 || nombre.length > 120) {
    return 'El nombre completo debe tener entre 2 y 120 caracteres.'
  }

  const edadNum = Number(datos?.edad)
  if (!Number.isFinite(edadNum) || edadNum < 18 || edadNum > 120) {
    return 'La edad debe estar entre 18 y 120 años.'
  }

  const nivelEstres = String(datos?.nivelEstres ?? '').trim()
  if (!NIVELES_ESTRES.some(n => n.id === nivelEstres)) {
    return 'Selecciona un nivel de estrés válido.'
  }

  const suenoHoras = String(datos?.suenoHoras ?? '').trim()
  if (suenoHoras && !OPCIONES_SUENO.some(s => s.id === suenoHoras)) {
    return 'Selecciona una opción de horas de sueño válida.'
  }

  const cafeina = String(datos?.cafeina ?? '').trim()
  if (cafeina && !OPCIONES_CAFEINA.some(c => c.id === cafeina)) {
    return 'Selecciona una opción de consumo de cafeína válida.'
  }

  return ''
}

async function usuarioActual() {
  const { data: { session } } = await deps.supabase.auth.getSession()
  return session?.user
    ? {
        id: session.user.id,
        correo: session.user.email || '',
        nombreMeta: session.user.user_metadata?.nombre || session.user.user_metadata?.full_name || '',
        token: session.access_token
      }
    : null
}

function descargarJsonEnNavegador(objetoExportacion) {
  if (typeof document === 'undefined' || typeof Blob === 'undefined' || typeof URL === 'undefined') {
    return
  }
  const blob = new Blob([JSON.stringify(objetoExportacion, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'mis-datos-sensor-pulso.json'
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const derechosService = {
  // ---------------------------------------------------------------- Titular: Consultar, Corregir, Exportar, Revocar y Eliminar
  /**
   * Consulta todos los datos propios del titular para mostrarlos en "Mis datos":
   * perfil de cuenta, estado del consentimiento, conteo de mediciones y ficha de salud declarada.
   */
  async consultarMisDatos() {
    const u = await usuarioActual()
    if (!u) return { ok: false, error: 'Inicia sesión para consultar tus datos.' }

    const [perfilResp, consentimientoResp, medicionesResp, fichaActiva] = await Promise.all([
      deps.supabase
        .from('perfiles')
        .select('nombre, correo, rol, creado_en, politica_version, politica_aceptada_en')
        .eq('id', u.id)
        .maybeSingle(),
      deps.supabase
        .from('consentimientos_aceptados')
        .select('id, version, aceptado_en, revocado_en')
        .eq('usuario_id', u.id)
        .order('aceptado_en', { ascending: false })
        .limit(1),
      deps.supabase
        .from('mediciones')
        .select('id', { count: 'exact', head: true })
        .eq('usuario_id', u.id),
      deps.pacienteService.obtenerDeclaracionActiva({ forzar: true }).catch(() => null)
    ])

    const ultimoConsentimiento = Array.isArray(consentimientoResp?.data) ? consentimientoResp.data[0] : null
    const consentimientoVigente = Boolean(ultimoConsentimiento && !ultimoConsentimiento.revocado_en)
    const fichaValida =
      fichaActiva && !fichaActiva.sinDatos && !fichaActiva.incompleta && fichaActiva.nombre
        ? {
            id: fichaActiva.id || null,
            nombre: fichaActiva.nombre,
            edad: Number(fichaActiva.edad) || 22,
            fechaNacimiento: fichaActiva.fechaNacimiento || '',
            nivelEstres: fichaActiva.nivelEstres || 'medio',
            suenoHoras: fichaActiva.suenoHoras || '7_8',
            cafeina: fichaActiva.cafeina || 'ninguna',
            medicacionTipo: fichaActiva.medicacionTipo || 'ninguna',
            medicacion: fichaActiva.medicacion || 'Ninguna',
            condicionSalud: fichaActiva.condicionSalud || 'Ninguna conocida',
            observaciones: fichaActiva.observaciones || ''
          }
        : null

    const perfil = {
      nombre: perfilResp?.data?.nombre || fichaValida?.nombre || u.nombreMeta || '',
      correo: perfilResp?.data?.correo || u.correo || '',
      rol: perfilResp?.data?.rol || 'usuario',
      creado_en: perfilResp?.data?.creado_en || null,
      politica_version: perfilResp?.data?.politica_version || null,
      politica_aceptada_en: perfilResp?.data?.politica_aceptada_en || null
    }

    return {
      ok: true,
      datos: {
        perfil,
        consentimiento: {
          vigente: consentimientoVigente,
          version: ultimoConsentimiento?.version || null,
          aceptado_en: ultimoConsentimiento?.aceptado_en || null,
          revocado_en: ultimoConsentimiento?.revocado_en || null
        },
        totalMediciones: Number(medicionesResp?.count ?? (Array.isArray(medicionesResp?.data) ? medicionesResp.data.length : 0)),
        fichaSalud: fichaValida
      }
    }
  },

  /**
   * Rectificación directa (corregir): actualiza el perfil del titular y su ficha de salud declarada,
   * reflejando los cambios de inmediato en el sistema, registrando la solicitud de rectificación
   * resuelta y dejando constancia en la auditoría.
   */
  async corregirMisDatos(cambios = {}) {
    const errorValidacion = validarRectificacionDatos(cambios)
    if (errorValidacion) return { ok: false, error: errorValidacion }

    const u = await usuarioActual()
    if (!u) return { ok: false, error: 'Inicia sesión para corregir tus datos.' }

    const nombreLimpio = String(cambios.nombre).trim()
    const edadLimpia = Math.round(Number(cambios.edad))
    const nivelEstres = String(cambios.nivelEstres || 'medio').trim()
    const suenoHoras = String(cambios.suenoHoras || '7_8').trim()
    const cafeina = String(cambios.cafeina || 'ninguna').trim()
    const condicionSalud = String(cambios.condicionSalud || 'Ninguna conocida').trim() || 'Ninguna conocida'
    const medicacionTexto = String(cambios.medicacion || 'Ninguna').trim() || 'Ninguna'
    const medicacionTipo = OPCIONES_MEDICACION.some(m => m.id === cambios.medicacionTipo)
      ? cambios.medicacionTipo
      : (medicacionTexto.toLowerCase() === 'ninguna' ? 'ninguna' : 'otra')

    // 1. Actualizar el nombre en public.perfiles
    const { error: errorPerfil } = await deps.supabase
      .from('perfiles')
      .update({ nombre: nombreLimpio })
      .eq('id', u.id)

    if (errorPerfil) {
      return { ok: false, error: errorPerfil.message || 'No se pudo actualizar tu perfil.' }
    }

    // Actualizar metadatos de la sesión de Auth si está disponible
    if (typeof deps.supabase.auth?.updateUser === 'function') {
      await deps.supabase.auth.updateUser({
        data: { nombre: nombreLimpio, full_name: nombreLimpio }
      }).catch(() => {})
    }

    // 2. Actualizar la ficha de salud declarada (cifrada en el servidor y actualizada en la sesión activa)
    const resultadoFicha = await deps.pacienteService.guardarDeclaracion({
      nombre: nombreLimpio,
      edad: edadLimpia,
      ...(cambios.fechaNacimiento ? { fechaNacimiento: cambios.fechaNacimiento } : {}),
      nivelEstres,
      suenoHoras,
      cafeina,
      medicacionTipo,
      medicacionDetalle: medicacionTipo === 'otra' ? medicacionTexto : '',
      medicacion: medicacionTexto,
      condicionSalud
    })

    if (!resultadoFicha?.ok) {
      const msg = Array.isArray(resultadoFicha?.errores) ? resultadoFicha.errores[0] : 'No se pudo actualizar la ficha de salud.'
      return { ok: false, error: msg }
    }

    // 3. Registrar la rectificación resuelta en solicitudes_derechos y en auditoría
    const ahoraIso = new Date().toISOString()
    await deps.supabase
      .from('solicitudes_derechos')
      .insert({
        usuario_id: u.id,
        tipo: 'rectificacion',
        detalle: 'Rectificación directa de perfil y ficha de salud realizada por el titular.',
        estado: 'resuelta',
        resuelta_en: ahoraIso,
        respuesta: 'Datos corregidos y actualizados inmediatamente en el sistema.'
      })
      .catch(() => {})

    await deps.registrarEventoAuditoria({
      accion: 'rectificacion_datos',
      entidad: 'perfiles',
      entidadId: u.id,
      entidadNombre: 'Rectificación de Datos del Titular',
      resumen: 'Datos personales y ficha de salud corregidos por su titular desde Mis datos',
      detalle: {
        campos_actualizados: ['nombre', 'edad', 'nivelEstres', 'suenoHoras', 'cafeina', 'medicacion', 'condicionSalud']
      }
    }).catch(() => {})

    return {
      ok: true,
      datosActualizados: {
        nombre: nombreLimpio,
        edad: edadLimpia,
        nivelEstres,
        suenoHoras,
        cafeina,
        medicacion: medicacionTexto,
        condicionSalud
      }
    }
  },

  async crearSolicitud({ tipo, detalle, ahora = new Date() }) {
    const error = validarSolicitud({ tipo, detalle })
    if (error) return { ok: false, error }
    const u = await usuarioActual()
    if (!u) return { ok: false, error: 'Inicia sesión para enviar una solicitud.' }
    const recibidaEn = new Date(ahora).toISOString()
    const venceEn = calcularFechaLimite(recibidaEn, PLAZO_LEGAL_DIAS)
    const { error: e } = await deps.supabase.from('solicitudes_derechos')
      .insert({
        usuario_id: u.id,
        tipo,
        detalle: String(detalle || '').trim() || null,
        recibida_en: recibidaEn,
        vence_en: venceEn
      })
    if (e) return { ok: false, error: e.message || 'No se pudo enviar la solicitud.' }
    await deps.registrarEventoAuditoria({
      accion: 'solicitud_derecho',
      entidad: 'solicitudes_derechos',
      entidadId: u.id,
      entidadNombre: `Solicitud de derecho (${tipo})`,
      resumen: `Solicitud de ${tipo} registrada por el titular con fecha límite`,
      detalle: { tipo, recibida_en: recibidaEn, vence_en: venceEn }
    }).catch(() => {})
    return { ok: true, recibidaEn, venceEn }
  },

  async misSolicitudes() {
    const u = await usuarioActual()
    if (!u) return []
    const { data } = await deps.supabase.from('solicitudes_derechos')
      .select('id, tipo, estado, detalle, recibida_en, vence_en, resuelta_en, respuesta')
      .eq('usuario_id', u.id)
      .order('recibida_en', { ascending: false })
      .limit(50)
    return data || []
  },

  /** Reúne el paquete completo de exportación del titular (endpoint serverless o respaldo RPC). */
  async _reunirDatosExportacion(u) {
    let exportacion = null

    if (typeof fetch === 'function') {
      const resp = await fetch('/api/derechos/exportar', {
        method: 'POST',
        headers: { Authorization: `Bearer ${u.token}` }
      }).catch(() => null)

      if (resp && resp.ok) {
        const json = await resp.json().catch(() => ({}))
        if (json?.ok && json?.exportacion) {
          exportacion = json.exportacion
        }
      }
    }

    // Respaldo mediante RPC exportar_mis_datos cuando se ejecuta en entorno local Vite sin endpoint serverless
    if (!exportacion && typeof deps.supabase.rpc === 'function') {
      const { data: crudo, error: rpcErr } = await deps.supabase.rpc('exportar_mis_datos')
      if (!rpcErr && crudo) {
        const fichaLocal = await deps.pacienteService.obtenerDeclaracionActiva().catch(() => null)
        exportacion = {
          generado_en: crudo.generado_en || new Date().toISOString(),
          aviso: 'Estos son tus datos en la plataforma sensor pulso (UNACH). Contiene datos de salud: guárdalo en un lugar seguro.',
          perfil: crudo.perfil
            ? {
                correo: crudo.perfil.correo,
                nombre: crudo.perfil.nombre,
                rol: crudo.perfil.rol,
                creado_en: crudo.perfil.creado_en,
                politica_version: crudo.perfil.politica_version,
                politica_aceptada_en: crudo.perfil.politica_aceptada_en
              }
            : null,
          consentimientos: crudo.consentimientos || [],
          declaraciones_de_salud: fichaLocal && !fichaLocal.sinDatos
            ? [{
                nombre: fichaLocal.nombre,
                edad: fichaLocal.edad,
                ficha_de_salud: {
                  nivelEstres: fichaLocal.nivelEstres,
                  suenoHoras: fichaLocal.suenoHoras,
                  cafeina: fichaLocal.cafeina,
                  medicacion: fichaLocal.medicacion,
                  condicionSalud: fichaLocal.condicionSalud
                }
              }]
            : [],
          mediciones: crudo.mediciones || [],
          alertas: crudo.alertas || [],
          comparaciones: crudo.comparaciones || [],
          progreso_de_lecciones: crudo.progreso || [],
          aulas: crudo.aulas || [],
          evaluaciones: crudo.evaluaciones || [],
          solicitudes_de_derechos: crudo.solicitudes || []
        }
      }
    }

    return exportacion
  },

  /** Descarga completa («mis datos») en formato JSON estructurado. */
  async descargarMisDatos() {
    const u = await usuarioActual()
    if (!u) return { ok: false, error: 'Inicia sesión para descargar tus datos.' }
    try {
      const exportacion = await this._reunirDatosExportacion(u)
      if (!exportacion) {
        return { ok: false, error: 'No se pudieron descargar tus datos.' }
      }

      descargarJsonEnNavegador(exportacion)

      await deps.registrarEventoAuditoria({
        accion: 'exportacion_datos',
        entidad: 'perfiles',
        entidadId: u.id,
        entidadNombre: 'Portabilidad de Datos Personales (JSON)',
        resumen: 'Descarga completa de portabilidad de datos del titular (JSON)',
        detalle: { formato: 'json', archivo: 'mis-datos-sensor-pulso.json' }
      }).catch(() => {})

      return { ok: true, exportacion }
    } catch {
      return { ok: false, error: 'No hay conexión con el servidor. Inténtalo más tarde.' }
    }
  },

  /** Descarga completa («mis datos») en un documento PDF institucional legible para el titular. */
  async descargarMisDatosPdf() {
    const u = await usuarioActual()
    if (!u) return { ok: false, error: 'Inicia sesión para descargar tus datos en PDF.' }
    try {
      const [exportacion, consultaDirecta] = await Promise.all([
        this._reunirDatosExportacion(u),
        this.consultarMisDatos().catch(() => null)
      ])
      if (!exportacion && !consultaDirecta?.ok) {
        return { ok: false, error: 'No se pudieron reunir tus datos para el PDF.' }
      }

      const datosConsulta = consultaDirecta?.datos || {}

      if (typeof window !== 'undefined' && typeof document !== 'undefined') {
        const { jsPDF } = await import('jspdf')
        const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
        const pageWidth = doc.internal.pageSize.getWidth()
        const pageHeight = doc.internal.pageSize.getHeight()
        const margin = 13
        const contentWidth = pageWidth - margin * 2
        let y = 12

        const COLOR = {
          titulo: [23, 53, 94],
          primario: [29, 78, 216],
          texto: [30, 41, 59],
          suave: [100, 116, 139],
          linea: [203, 213, 225],
          fondo: [248, 250, 252],
          ok: [21, 128, 61],
          okFondo: [240, 253, 244],
          okBorde: [134, 239, 172],
          alerta: [180, 83, 9],
          alertaFondo: [255, 251, 235],
          alertaBorde: [253, 230, 138]
        }

        const limpiarTexto = (v) => String(v ?? '')
          .replace(/SpO₂/g, 'SpO2')
          .replace(/₂/g, '2')
          .replace(/[—–]/g, '-')
          .replace(/…/g, '...')
          .trim()

        const MAPA_ROL = { admin: 'Administrador', profesor: 'Profesor', usuario: 'Estudiante / Usuario' }
        const MAPA_ESTRES = { bajo: 'Bajo (relajado)', medio: 'Medio (normal)', alto: 'Alto (tenso / ansioso)', muy_alto: 'Muy alto (agotamiento)' }
        const MAPA_SUENO = { menos_5: 'Menos de 5 horas', menos_6: 'Menos de 6 horas', '5_6': '5 a 6 horas', '6_7': '6 a 7 horas', '7_8': '7 a 8 horas (recomendado)', mas_8: 'Más de 8 horas' }
        const MAPA_CAFEINA = { ninguna: 'Ninguna (0 tazas)', baja: 'Baja (1 taza)', moderada: 'Moderada (1 a 2 tazas)', alta: 'Alta (3 o más tazas)' }
        const MAPA_TIPO_SOL = { acceso: 'Acceso a datos', rectificacion: 'Rectificación de datos', supresion: 'Supresión de datos', oposicion: 'Oposición al tratamiento', portabilidad: 'Portabilidad de datos' }
        const MAPA_ESTADO_SOL = { recibida: 'Recibida (en revisión)', en_proceso: 'En proceso', resuelta: 'Resuelta', rechazada: 'Rechazada' }

        const dibujarSeccion = (numero, titulo) => {
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(10.2)
          doc.setTextColor(...COLOR.titulo)
          doc.text(limpiarTexto(`${numero}. ${titulo}`), margin, y + 3.5)
          y += 5
          doc.setDrawColor(...COLOR.linea)
          doc.setLineWidth(0.3)
          doc.line(margin, y, margin + contentWidth, y)
          y += 2.5
        }

        const dibujarGrillaDosColumnas = (pares) => {
          const anchoCol = contentWidth / 2
          const filas = []
          for (let i = 0; i < pares.length; i += 2) {
            filas.push(pares.slice(i, i + 2))
          }
          const altoFila = 10.5
          const altoTotal = filas.length * altoFila

          doc.setFillColor(...COLOR.fondo)
          doc.setDrawColor(...COLOR.linea)
          doc.setLineWidth(0.28)
          doc.roundedRect(margin, y, contentWidth, altoTotal, 1.8, 1.8, 'FD')

          filas.forEach((fila, idxFila) => {
            const fy = y + idxFila * altoFila
            if (idxFila > 0) {
              doc.setDrawColor(...COLOR.linea)
              doc.line(margin, fy, margin + contentWidth, fy)
            }
            fila.forEach(([etiqueta, valor], idxCol) => {
              const cx = margin + idxCol * anchoCol + 3.5
              if (idxCol === 1) {
                doc.setDrawColor(...COLOR.linea)
                doc.line(margin + anchoCol, fy, margin + anchoCol, fy + altoFila)
              }
              doc.setFont('helvetica', 'normal')
              doc.setFontSize(7.2)
              doc.setTextColor(...COLOR.suave)
              doc.text(limpiarTexto(etiqueta).toUpperCase(), cx, fy + 3.6)

              doc.setFont('helvetica', 'bold')
              doc.setFontSize(9)
              doc.setTextColor(...COLOR.texto)
              const lineaVal = doc.splitTextToSize(limpiarTexto(valor || 'No especificado'), anchoCol - 7)[0] || '-'
              doc.text(lineaVal, cx, fy + 8.2)
            })
          })

          y += altoTotal + 4
        }

        // Encabezado institucional UNACH compacto (todo en 1 hoja A4)
        doc.setFillColor(...COLOR.titulo)
        doc.rect(margin, y, contentWidth, 1.8, 'F')
        y += 5

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(12.5)
        doc.setTextColor(...COLOR.titulo)
        doc.text('UNIVERSIDAD ADVENTISTA DE CHILE (UNACH)', margin, y + 3.5)

        const fechaEmision = new Date(exportacion?.generado_en || Date.now()).toLocaleString('es-CL', {
          day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
        })
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8)
        doc.setTextColor(...COLOR.suave)
        doc.text(limpiarTexto(`Emitido: ${fechaEmision}`), pageWidth - margin, y + 3.5, { align: 'right' })
        y += 5

        doc.setFont('helvetica', 'normal')
        doc.setFontSize(8.8)
        doc.setTextColor(...COLOR.suave)
        doc.text('Facultad de Ingeniería y Negocios · Plataforma Educativa sensor_pulso', margin, y + 2.8)
        y += 5.5

        doc.setFont('helvetica', 'bold')
        doc.setFontSize(11.5)
        doc.setTextColor(...COLOR.texto)
        doc.text('Informe Oficial de Portabilidad y Datos Personales del Titular', margin, y + 3.5)
        y += 5.5

        // Recuadro de confidencialidad
        doc.setFillColor(...COLOR.alertaFondo)
        doc.setDrawColor(...COLOR.alertaBorde)
        doc.setLineWidth(0.3)
        doc.roundedRect(margin, y, contentWidth, 9.5, 1.8, 1.8, 'FD')
        doc.setFont('helvetica', 'bold')
        doc.setFontSize(7.8)
        doc.setTextColor(...COLOR.alerta)
        doc.text('AVISO DE PRIVACIDAD Y USO PERSONAL:', margin + 3.5, y + 3.8)
        doc.setFont('helvetica', 'normal')
        doc.text(
          'Este documento reúne los datos personales y de salud registrados por el titular en sensor_pulso. Conservar en un lugar seguro.',
          margin + 3.5,
          y + 7.6
        )
        y += 13

        // 1. Datos de perfil y cuenta
        dibujarSeccion(1, 'Datos de Perfil y Cuenta del Titular')
        const p = exportacion?.perfil || datosConsulta.perfil || {}
        const fechaCreacion = p.creado_en
          ? new Date(p.creado_en).toLocaleDateString('es-CL', { day: '2-digit', month: 'long', year: 'numeric' })
          : 'Registrada en plataforma'
        dibujarGrillaDosColumnas([
          ['Nombre completo', p.nombre || u.nombreMeta || 'Sin nombre registrado'],
          ['Correo institucional', p.correo || u.correo || 'Sin correo'],
          ['Rol en la plataforma', MAPA_ROL[p.rol] || p.rol || 'Estudiante / Usuario'],
          ['Fecha de alta de cuenta', fechaCreacion]
        ])

        // 2. Estado de consentimiento informado
        dibujarSeccion(2, 'Estado de Consentimiento Informado y Privacidad')
        const cons = (Array.isArray(exportacion?.consentimientos) && exportacion.consentimientos[0]) || null
        const consVigente = cons ? !cons.revocado_en : Boolean(datosConsulta.consentimiento?.vigente)
        const versionCons = cons?.version || datosConsulta.consentimiento?.version || p.politica_version || '1.0'
        const fechaCons = cons?.aceptado_en || datosConsulta.consentimiento?.aceptadoEn || p.politica_aceptada_en
        const fechaConsTexto = fechaCons
          ? new Date(fechaCons).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
          : 'Registrado en cuenta'

        dibujarGrillaDosColumnas([
          ['Estado del consentimiento', consVigente ? 'VIGENTE (Autorizado por el titular)' : 'REVOCADO / SIN CONSENTIMIENTO ACTIVO'],
          ['Versión de política aceptada', `Versión ${versionCons}`],
          ['Fecha de aceptación / registro', fechaConsTexto],
          ['Alcance del tratamiento', 'Uso académico y monitoreo fisiológico educativo UNACH']
        ])

        // 3. Ficha de factores de salud declarados
        dibujarSeccion(3, 'Ficha de Factores de Salud Declarados')
        const decl = (Array.isArray(exportacion?.declaraciones_de_salud) && exportacion.declaraciones_de_salud[0]) || null
        const fs = decl?.ficha_de_salud || datosConsulta.fichaSalud || null
        if (fs) {
          const edadVal = decl?.edad ?? fs.edad
          dibujarGrillaDosColumnas([
            ['Nombre en ficha', decl?.nombre || fs.nombre || p.nombre || 'Titular'],
            ['Edad declarada', edadVal ? `${edadVal} años` : 'Mayor de edad'],
            ['Nivel de estrés basal', MAPA_ESTRES[fs.nivelEstres] || fs.nivelEstres || 'No especificado'],
            ['Horas de sueño recientes', MAPA_SUENO[fs.suenoHoras] || fs.suenoHoras || 'No especificadas'],
            ['Consumo de cafeína', MAPA_CAFEINA[fs.cafeina] || fs.cafeina || 'Ninguna'],
            ['Medicación / Condición', `${fs.medicacion || 'Ninguna'} · ${fs.condicionSalud || 'Sin condición declarada'}`]
          ])
        } else {
          dibujarGrillaDosColumnas([
            ['Estado de ficha de salud', 'Sin ficha activa registrada actualmente'],
            ['Protección criptográfica', 'Datos sensibles cifrados o eliminados por el titular']
          ])
        }

        // 4. Mediciones fisiológicas registradas (máximo 5 filas para mantener todo en 1 hoja)
        const medsRaw = (Array.isArray(exportacion?.mediciones) && exportacion.mediciones.length
          ? exportacion.mediciones
          : (datosConsulta.medicionesRecientes || []))
        dibujarSeccion(4, `Historial de Mediciones Fisiológicas (${medsRaw.length} registradas)`)

        if (medsRaw.length === 0) {
          dibujarGrillaDosColumnas([
            ['Mediciones registradas', '0 mediciones almacenadas para este titular'],
            ['Estado de registros', 'Sin lecturas fisiológicas activas']
          ])
        } else {
          const colWidths = [12, 58, 28, 44, 42]
          const headers = ['N°', 'Sesión / Nombre', 'Promedio', 'Evaluación en reposo', 'Fecha y hora']

          doc.setFillColor(...COLOR.titulo)
          doc.rect(margin, y, contentWidth, 6.2, 'F')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.setTextColor(255, 255, 255)
          let cx = margin + 2.5
          headers.forEach((h, i) => {
            doc.text(h, cx, y + 4.3)
            cx += colWidths[i]
          })
          y += 6.2

          medsRaw.slice(0, 5).forEach((m, idx) => {
            const filaPar = idx % 2 === 0
            doc.setFillColor(...(filaPar ? [255, 255, 255] : COLOR.fondo))
            doc.setDrawColor(...COLOR.linea)
            doc.setLineWidth(0.2)
            doc.rect(margin, y, contentWidth, 5.8, 'FD')

            const bpm = Number(m.bpm_promedio ?? m.bpm ?? 0)
            let evaluacionBpm = 'Sin lectura'
            if (bpm > 0) {
              if (bpm < 60) evaluacionBpm = 'Bajo (<60 BPM)'
              else if (bpm <= 100) evaluacionBpm = 'Normal (60-100 BPM)'
              else evaluacionBpm = 'Elevado (>100 BPM)'
            }

            const fechaM = m.fecha_medicion || m.creado_en
            const fechaStr = fechaM
              ? new Date(fechaM).toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
              : 'Sin fecha'

            const celdas = [
              String(idx + 1),
              limpiarTexto(m.nombre || 'Sesión de medición').slice(0, 28),
              bpm > 0 ? `${Math.round(bpm)} BPM` : '-',
              evaluacionBpm,
              limpiarTexto(fechaStr)
            ]

            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7.9)
            doc.setTextColor(...COLOR.texto)
            let rx = margin + 2.5
            celdas.forEach((celda, i) => {
              if (i === 2) doc.setFont('helvetica', 'bold')
              else doc.setFont('helvetica', 'normal')
              doc.text(celda, rx, y + 4.1)
              rx += colWidths[i]
            })
            y += 5.8
          })
          if (medsRaw.length > 5) {
            doc.setFont('helvetica', 'italic')
            doc.setFontSize(7.4)
            doc.setTextColor(...COLOR.suave)
            doc.text(`Mostrando las 5 más recientes de ${medsRaw.length} mediciones registradas.`, margin, y + 3.8)
            y += 4.5
          }
          y += 4
        }

        // 5. Solicitudes de derechos ejercidas por el titular (máximo 5 filas para mantener todo en 1 hoja)
        const solicitudesLista = Array.isArray(exportacion?.solicitudes_de_derechos) && exportacion.solicitudes_de_derechos.length
          ? exportacion.solicitudes_de_derechos
          : await this.misSolicitudes().catch(() => [])

        dibujarSeccion(5, `Solicitudes y Derechos Ejercidos (${solicitudesLista.length})`)
        if (solicitudesLista.length === 0) {
          dibujarGrillaDosColumnas([
            ['Solicitudes registradas', 'Sin solicitudes formales adicionales'],
            ['Canal de atención', 'Sección Mis datos y derechos en sensor_pulso']
          ])
        } else {
          const colSol = [48, 40, 58, 38]
          const headSol = ['Derecho ejercido', 'Estado', 'Detalle / Motivo', 'Fecha recepción']

          doc.setFillColor(...COLOR.titulo)
          doc.rect(margin, y, contentWidth, 6.2, 'F')
          doc.setFont('helvetica', 'bold')
          doc.setFontSize(8)
          doc.setTextColor(255, 255, 255)
          let sx = margin + 2.5
          headSol.forEach((h, i) => {
            doc.text(h, sx, y + 4.3)
            sx += colSol[i]
          })
          y += 6.2

          solicitudesLista.slice(0, 5).forEach((s, idx) => {
            doc.setFillColor(...(idx % 2 === 0 ? [255, 255, 255] : COLOR.fondo))
            doc.setDrawColor(...COLOR.linea)
            doc.setLineWidth(0.2)
            doc.rect(margin, y, contentWidth, 5.8, 'FD')

            const celdasSol = [
              limpiarTexto(MAPA_TIPO_SOL[s.tipo] || s.tipo || 'Solicitud'),
              limpiarTexto(MAPA_ESTADO_SOL[s.estado] || s.estado || 'Recibida'),
              limpiarTexto(s.detalle || 'Sin detalle adicional').slice(0, 32),
              s.recibida_en ? new Date(s.recibida_en).toLocaleDateString('es-CL') : '-'
            ]

            doc.setFont('helvetica', 'normal')
            doc.setFontSize(7.9)
            doc.setTextColor(...COLOR.texto)
            let rx = margin + 2.5
            celdasSol.forEach((c, i) => {
              doc.text(c, rx, y + 4.1)
              rx += colSol[i]
            })
            y += 5.8
          })
          if (solicitudesLista.length > 5) {
            doc.setFont('helvetica', 'italic')
            doc.setFontSize(7.4)
            doc.setTextColor(...COLOR.suave)
            doc.text(`Mostrando las 5 más recientes de ${solicitudesLista.length} solicitudes registradas.`, margin, y + 3.8)
            y += 4.5
          }
        }

        // Pie de página en la única hoja
        doc.setDrawColor(...COLOR.linea)
        doc.setLineWidth(0.25)
        doc.line(margin, pageHeight - 13, pageWidth - margin, pageHeight - 13)
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.8)
        doc.setTextColor(...COLOR.suave)
        doc.text(
          'sensor_pulso · Universidad Adventista de Chile (UNACH) — Documento de uso exclusivo del titular de los datos.',
          margin,
          pageHeight - 8.5
        )
        doc.text('Página 1 de 1', pageWidth - margin, pageHeight - 8.5, { align: 'right' })

        doc.save('mis-datos-sensor-pulso.pdf')
      }

      await deps.registrarEventoAuditoria({
        accion: 'exportacion_datos',
        entidad: 'perfiles',
        entidadId: u.id,
        entidadNombre: 'Portabilidad de Datos Personales (PDF)',
        resumen: 'Descarga completa de datos del titular en documento PDF',
        detalle: { formato: 'pdf', archivo: 'mis-datos-sensor-pulso.pdf' }
      }).catch(() => {})

      return { ok: true, formato: 'pdf', exportacion: exportacion || datosConsulta }
    } catch {
      return { ok: false, error: 'No se pudo generar el archivo PDF. Inténtalo más tarde.' }
    }
  },

  async revocarConsentimiento() {
    const u = await usuarioActual()
    const { error } = await deps.supabase.rpc('revocar_consentimiento')
    if (error) return { ok: false, error: 'No se pudo revocar el consentimiento.' }

    await deps.registrarEventoAuditoria({
      accion: 'revocacion_consentimiento',
      entidad: 'perfiles',
      entidadId: u?.id || null,
      entidadNombre: 'Revocación de Consentimiento Informado',
      resumen: 'Consentimiento informado revocado por el titular y publicaciones retiradas',
      detalle: { alcance: 'consentimientos_aceptados y publicaciones' }
    }).catch(() => {})

    return { ok: true }
  },

  /**
   * Supresión completa de datos del titular (RF58, RF89, RF90):
   * 1. Ejecuta `eliminar_mis_datos` en la base de datos (borra mediciones, declaraciones_paciente,
   *    señales, progreso, insignias, revoca consentimiento y registra en la tabla `auditoria`).
   * 2. Limpia toda copia local o en sesión del navegador (ficha de salud en sessionStorage,
   *    mediciones vistas offline y pendientes) para que lo eliminado ya no se pueda consultar.
   * 3. Registra la acción en el servicio de auditoría.
   */
  async eliminarMisDatos() {
    const u = await usuarioActual()
    if (!u) return { ok: false, error: 'Inicia sesión para eliminar tus datos.' }

    const { error } = await deps.supabase.rpc('eliminar_mis_datos')
    if (error) {
      return { ok: false, error: 'No se pudieron eliminar tus datos.' }
    }

    // Garantizar que no queden filas residuales ni copias locales en el navegador
    await Promise.all([
      deps.supabase.from('declaraciones_paciente').delete().eq('usuario_id', u.id),
      deps.supabase.from('mediciones').delete().eq('usuario_id', u.id),
      deps.supabase.from('rangos_usuario').delete().eq('usuario_id', u.id),
      deps.limpiarCacheLocal()
    ]).catch(() => {})

    await deps.registrarEventoAuditoria({
      accion: 'supresion_datos',
      entidad: 'perfiles',
      entidadId: u.id,
      entidadNombre: 'Supresión Total de Datos del Titular',
      resumen: 'Eliminación completa de mediciones, fichas declaradas y copias locales solicitada por el titular',
      detalle: { alcance: 'mediciones, fichas declaradas, publicaciones, progreso y almacenamiento local' }
    }).catch(() => {})

    return { ok: true }
  },

  // ---------------------------------------------------------------- Administración (la RLS exige es_admin)
  async solicitudesAdmin({ soloAbiertas = false } = {}) {
    let q = deps.supabase.from('solicitudes_derechos')
      .select('id, tipo, estado, detalle, recibida_en, vence_en, resuelta_en, respuesta, perfil:perfiles!usuario_id(nombre, correo)')
      .order('vence_en', { ascending: true })
      .limit(200)
    if (soloAbiertas) q = q.in('estado', ['recibida', 'en_proceso'])
    const { data, error } = await q
    return error ? [] : (data || [])
  },

  async resolverSolicitud(id, estado, respuesta) {
    if (!Object.keys(ESTADOS_SOLICITUD).includes(estado)) return { ok: false, error: 'Estado no válido.' }
    const respuestaLimpia = String(respuesta || '').trim()
    if ((estado === 'resuelta' || estado === 'rechazada') && !respuestaLimpia) {
      return { ok: false, error: 'Escribe la respuesta para la persona.' }
    }
    const cambios = {
      estado,
      respuesta: respuestaLimpia || null
    }
    const { error } = await deps.supabase.from('solicitudes_derechos').update(cambios).eq('id', id)
    if (error) return { ok: false, error: error.message }
    await deps.registrarEventoAuditoria({
      accion: `solicitud_derechos_${estado}`,
      entidad: 'solicitudes_derechos',
      entidadId: String(id),
      entidadNombre: `Atención de solicitud (${ESTADOS_SOLICITUD[estado]})`,
      resumen: `Solicitud actualizada a estado ${ESTADOS_SOLICITUD[estado]}`,
      detalle: { estado }
    }).catch(() => {})
    return { ok: true }
  },

  async incidentes() {
    const { data, error } = await deps.supabase.from('incidentes')
      .select('id, titulo, descripcion, severidad, estado, afecta_datos_personales, abierto_en, cerrado_en, lecciones, brecha:brechas(id, afectados_estimados, datos_comprometidos, medidas, afectados_notificados_en, autoridad_notificada_en)')
      .order('abierto_en', { ascending: false })
      .limit(100)
    return error ? [] : (data || [])
  },

  async crearIncidente({ titulo, descripcion, severidad, afectaDatosPersonales }) {
    const t = String(titulo || '').trim()
    if (t.length < 3 || t.length > 200) return { ok: false, error: 'El título debe tener entre 3 y 200 caracteres.' }
    if (!SEVERIDADES.includes(severidad)) return { ok: false, error: 'Elige la severidad.' }
    const { error } = await deps.supabase.from('incidentes').insert({
      titulo: t, descripcion: String(descripcion || '').trim() || null, severidad, afecta_datos_personales: Boolean(afectaDatosPersonales)
    })
    return error ? { ok: false, error: error.message } : { ok: true }
  },

  async actualizarIncidente(id, cambios) {
    const permitido = {}
    if (cambios.estado) {
      if (!Object.keys(ESTADOS_INCIDENTE).includes(cambios.estado)) return { ok: false, error: 'Estado no válido.' }
      permitido.estado = cambios.estado
    }
    if (typeof cambios.lecciones === 'string') permitido.lecciones = cambios.lecciones.trim() || null
    if (typeof cambios.afectaDatosPersonales === 'boolean') permitido.afecta_datos_personales = cambios.afectaDatosPersonales
    const { error } = await deps.supabase.from('incidentes').update(permitido).eq('id', id)
    return error ? { ok: false, error: error.message } : { ok: true }
  },

  /** Registra o actualiza la brecha formal del incidente (una por incidente). */
  async guardarBrecha(incidenteId, { afectadosEstimados, datosComprometidos, medidas, notificarAfectados, notificarAutoridad }) {
    const fila = { incidente_id: incidenteId, medidas: String(medidas || '').trim() || null, datos_comprometidos: String(datosComprometidos || '').trim() || null }
    if (afectadosEstimados !== '' && afectadosEstimados != null) {
      const n = Number(afectadosEstimados)
      if (!Number.isInteger(n) || n < 0) return { ok: false, error: 'Los afectados estimados deben ser un número entero.' }
      fila.afectados_estimados = n
    }
    const ahora = new Date().toISOString()
    if (notificarAfectados) fila.afectados_notificados_en = ahora
    if (notificarAutoridad) fila.autoridad_notificada_en = ahora
    const { error } = await deps.supabase.from('brechas').upsert(fila, { onConflict: 'incidente_id' })
    return error ? { ok: false, error: error.message } : { ok: true }
  },

  /** Solo para pruebas automatizadas en Node: inyecta dobles de prueba y restaura el estado. */
  __probar(nuevasDeps = {}) {
    deps = {
      supabase,
      pacienteService,
      registrarEventoAuditoria,
      limpiarCacheLocal: async () => {
        try { await borrarMedicionesVistas() } catch { /* sin IndexedDB */ }
        try { borrarPendientes() } catch { /* sin storage */ }
        try { pacienteService.limpiarDeclaracionLocal() } catch { /* sin storage */ }
        try { limpiarRegistrosDiariosSesion() } catch { /* sin storage */ }
      },
      ...nuevasDeps
    }
  }
}
