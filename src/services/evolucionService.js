import { supabase } from './supabase.js'
import { listarActividades, listarRangos, listarRangosPersonales } from './rangosService.js'
import { cifradoService } from '../utils/cifradoService.js'
import { pacienteService } from './pacienteService.js'
import { construirSerieEvolucion, formatearDiaLocal } from '../utils/evolucionPersonal.js'
import {
  analizarCorrelacionBpmEstresSueno,
  sanitizarFactoresParaCorrelacion
} from '../utils/correlacionEstresSueno.js'

const SESSION_KEY_HABITOS_EVOLUCION = 'sensor_evolucion_habitos_sesion_rf37'

/**
 * Almacena únicamente en sessionStorage (memoria de la pestaña activa, borrada al cerrar sesión)
 * los registros opcionales de estrés o sueño asociados por el titular a sus días de medición,
 * cumpliendo las reglas de privacidad de datos sensibles de salud (ISO 27001 A.8.1 / RF55 / RF116).
 */
export function leerRegistrosDiariosSesion(usuarioId) {
  if (!usuarioId) return {}
  try {
    if (typeof sessionStorage === 'undefined') return {}
    const crudo = sessionStorage.getItem(`${SESSION_KEY_HABITOS_EVOLUCION}:${usuarioId}`)
    const obj = crudo ? JSON.parse(crudo) : {}
    return obj && typeof obj === 'object' ? obj : {}
  } catch {
    return {}
  }
}

export function guardarRegistroDiarioSesion(usuarioId, dia, { nivelEstres = '', suenoHoras = '', horasSuenoOpcional = null } = {}) {
  if (!usuarioId || !dia || !/^\d{4}-\d{2}-\d{2}$/.test(String(dia))) return {}
  try {
    if (typeof sessionStorage === 'undefined') return {}
    const actual = leerRegistrosDiariosSesion(usuarioId)
    const sanitizado = sanitizarFactoresParaCorrelacion({
      nivelEstres,
      suenoHoras,
      horasSuenoOpcional
    })
    actual[dia] = {
      ...(sanitizado.estres ? { nivelEstres: sanitizado.estres.codigo } : {}),
      ...(sanitizado.sueno ? { suenoHoras: sanitizado.sueno.codigo === 'numerico' ? String(sanitizado.sueno.horas) : sanitizado.sueno.codigo, horasSuenoOpcional: sanitizado.sueno.horas } : {})
    }
    sessionStorage.setItem(`${SESSION_KEY_HABITOS_EVOLUCION}:${usuarioId}`, JSON.stringify(actual))
    return actual
  } catch {
    return {}
  }
}

export function limpiarRegistrosDiariosSesion() {
  try {
    if (typeof sessionStorage === 'undefined') return
    for (let i = sessionStorage.length - 1; i >= 0; i -= 1) {
      const k = sessionStorage.key(i)
      if (k && k.startsWith(SESSION_KEY_HABITOS_EVOLUCION)) {
        sessionStorage.removeItem(k)
      }
    }
  } catch {
    // sin acceso a sessionStorage
  }
}

async function obtenerMapaDeclaracionesPropias(filasDeclaraciones = [], token = null, usuarioId = '') {
  const mapa = {}
  const copiaActiva = pacienteService.obtenerUltimaDeclaracion()

  for (const fila of Array.isArray(filasDeclaraciones) ? filasDeclaraciones : []) {
    if (!fila || String(fila.usuario_id) !== String(usuarioId)) continue
    let factores = {}

    if (copiaActiva && copiaActiva.id === fila.id) {
      factores = {
        nivelEstres: copiaActiva.nivelEstres,
        suenoHoras: copiaActiva.suenoHoras,
        horasSuenoOpcional: copiaActiva.horasSuenoOpcional
      }
    } else if (fila.datos_cifrados) {
      if (!cifradoService.esDatoCifrado(fila.datos_cifrados)) {
        factores = cifradoService.leerSinCifrar(fila.datos_cifrados)
      } else if (token) {
        try {
          factores = await cifradoService.descifrarDeclaracion({ declaracionId: fila.id, token })
        } catch {
          factores = {}
        }
      }
    }

    const limpios = sanitizarFactoresParaCorrelacion(factores)
    mapa[fila.id] = {
      id: fila.id,
      usuario_id: fila.usuario_id,
      diaCreacion: formatearDiaLocal(fila.creado_en),
      factores: {
        nivelEstres: limpios.estres?.codigo || null,
        suenoHoras: limpios.sueno?.codigo || null,
        horasSuenoOpcional: limpios.sueno?.horas ?? null
      }
    }
  }

  return mapa
}

/**
 * Obtiene los datos reales de evolución personal y su correlación con estrés y sueño
 * únicamente para el titular autenticado.
 */
export async function obtenerEvolucionPersonal({
  actividadCodigo = 'reposo',
  actividadId = 1,
  edadOverride = null
} = {}) {
  const { data: sessionData, error: sessionError } = await supabase.auth.getSession()
  if (sessionError) {
    throw new Error('No fue posible verificar la sesión activa.')
  }

  const session = sessionData?.session
  const user = session?.user
  if (!user?.id) {
    throw new Error('Debes iniciar sesión para consultar tu panel de evolución personal.')
  }

  const usuarioId = user.id

  const [
    medicionesResp,
    vistaReposoResp,
    actividadesResp,
    rangosGlobalesResp,
    rangosPersonalesResp,
    declaracionesResp
  ] = await Promise.all([
    supabase
      .from('mediciones')
      .select(
        'id, usuario_id, inicio, bpm_promedio, spo2_promedio, edad_al_medir, actividad_id, declaracion_id, actividad:actividades(id, codigo, nombre)'
      )
      .eq('usuario_id', usuarioId)
      .order('inicio', { ascending: true }),
    supabase
      .from('evolucion_reposo')
      .select('usuario_id, dia, bpm_reposo, spo2_reposo, bpm_esperado_min, bpm_esperado_max, mediciones')
      .eq('usuario_id', usuarioId)
      .order('dia', { ascending: true }),
    listarActividades().catch(() => ({ data: [] })),
    listarRangos().catch(() => ({ data: [] })),
    listarRangosPersonales(usuarioId).catch(() => ({ data: [] })),
    supabase
      .from('declaraciones_paciente')
      .select('id, usuario_id, edad, datos_cifrados, creado_en')
      .eq('usuario_id', usuarioId)
      .order('creado_en', { ascending: false })
      .limit(10)
  ])

  if (medicionesResp.error) {
    throw new Error(`No se pudo cargar el historial de mediciones: ${medicionesResp.error.message}`)
  }

  const actividades = Array.isArray(actividadesResp?.data) && actividadesResp.data.length > 0
    ? actividadesResp.data
    : [
        { id: 1, codigo: 'reposo', nombre: 'Reposo' },
        { id: 2, codigo: 'caminata', nombre: 'Caminata suave' },
        { id: 3, codigo: 'ejercicio_moderado', nombre: 'Ejercicio moderado' },
        { id: 4, codigo: 'ejercicio_intenso', nombre: 'Ejercicio intenso' },
        { id: 5, codigo: 'recuperacion', nombre: 'Recuperación post-ejercicio' }
      ]

  const actividadSeleccionada =
    actividades.find((a) => a.codigo === actividadCodigo) ||
    actividades.find((a) => Number(a.id) === Number(actividadId)) ||
    actividades[0]

  const edadDeclarada = Number(declaracionesResp?.data?.[0]?.edad)
  const edadMetadata = Number(user?.user_metadata?.edad)
  const edadBase =
    Number.isFinite(Number(edadOverride)) && Number(edadOverride) > 0
      ? Number(edadOverride)
      : Number.isFinite(edadDeclarada) && edadDeclarada > 0
        ? edadDeclarada
        : Number.isFinite(edadMetadata) && edadMetadata > 0
          ? edadMetadata
          : null

  const medicionesLista = medicionesResp.data || []

  const serie = construirSerieEvolucion({
    mediciones: medicionesLista,
    filasVista: vistaReposoResp?.data || [],
    usuarioId,
    edad: edadBase,
    actividadId: actividadSeleccionada.id,
    actividadCodigo: actividadSeleccionada.codigo,
    rangosGlobales: rangosGlobalesResp?.data || [],
    rangosPersonales: rangosPersonalesResp?.data || []
  })

  const declaracionesPorId = await obtenerMapaDeclaracionesPropias(
    declaracionesResp?.data || [],
    session?.access_token || null,
    usuarioId
  )

  const registrosDiariosSesion = leerRegistrosDiariosSesion(usuarioId)

  const correlacion = analizarCorrelacionBpmEstresSueno({
    diasEvolucion: serie.dias,
    mediciones: medicionesLista,
    declaracionesPorId,
    registrosDiariosSesion,
    usuarioId
  })

  return {
    ...serie,
    actividades,
    correlacion
  }
}
