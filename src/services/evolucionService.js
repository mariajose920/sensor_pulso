import { supabase } from './supabase.js'
import { listarActividades, listarRangos, listarRangosPersonales } from './rangosService.js'
import { construirSerieEvolucion } from '../utils/evolucionPersonal.js'

/**
 * Obtiene los datos reales de evolución personal del usuario autenticado
 * desde el historial de mediciones (`public.mediciones` y `public.evolucion_reposo`)
 * y los rangos fisiológicos vigentes (`public.rangos` y `public.rangos_usuario`).
 *
 * Garantiza que:
 * - Solo se consultan y procesan las mediciones propias del usuario autenticado.
 * - Nunca se inventan valores cuando existen menos de 2 días con mediciones.
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

  const user = sessionData?.session?.user
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
    declaracionResp
  ] = await Promise.all([
    supabase
      .from('mediciones')
      .select(
        'id, usuario_id, inicio, bpm_promedio, spo2_promedio, edad_al_medir, actividad_id, actividad:actividades(id, codigo, nombre)'
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
      .select('edad')
      .eq('usuario_id', usuarioId)
      .order('declarado_en', { ascending: false })
      .limit(1)
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

  const edadDeclarada = Number(declaracionResp?.data?.[0]?.edad)
  const edadMetadata = Number(user?.user_metadata?.edad)
  const edadBase =
    Number.isFinite(Number(edadOverride)) && Number(edadOverride) > 0
      ? Number(edadOverride)
      : Number.isFinite(edadDeclarada) && edadDeclarada > 0
        ? edadDeclarada
        : Number.isFinite(edadMetadata) && edadMetadata > 0
          ? edadMetadata
          : null

  const serie = construirSerieEvolucion({
    mediciones: medicionesResp.data || [],
    filasVista: vistaReposoResp?.data || [],
    usuarioId,
    edad: edadBase,
    actividadId: actividadSeleccionada.id,
    actividadCodigo: actividadSeleccionada.codigo,
    rangosGlobales: rangosGlobalesResp?.data || [],
    rangosPersonales: rangosPersonalesResp?.data || []
  })

  return {
    ...serie,
    actividades
  }
}
