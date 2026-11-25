import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  formatearDiaLocal,
  resolverRangoEsperado,
  construirSerieEvolucion,
  calcularGeometriaGraficoEvolucion
} from '../src/utils/evolucionPersonal.js'

console.log('Iniciando pruebas automatizadas para RF36 (Panel de evolucion personal)...')

// 1. Consolidación de BPM en reposo por día a partir del historial de mediciones (2 o más días)
{
  const mediciones = [
    {
      id: 101,
      usuario_id: 'user-javiera-1',
      inicio: '2026-11-10T14:00:00Z',
      bpm_promedio: 68,
      spo2_promedio: 98,
      edad_al_medir: 22,
      actividad_id: 1,
      actividad: { id: 1, codigo: 'reposo', nombre: 'Reposo' }
    },
    {
      id: 102,
      usuario_id: 'user-javiera-1',
      inicio: '2026-11-10T18:30:00Z',
      bpm_promedio: 72,
      spo2_promedio: 97,
      edad_al_medir: 22,
      actividad_id: 1,
      actividad: { id: 1, codigo: 'reposo', nombre: 'Reposo' }
    },
    {
      id: 103,
      usuario_id: 'user-javiera-1',
      inicio: '2026-11-12T15:00:00Z',
      bpm_promedio: 65,
      spo2_promedio: 99,
      edad_al_medir: 22,
      actividad_id: 1,
      actividad: { id: 1, codigo: 'reposo', nombre: 'Reposo' }
    },
    {
      id: 104,
      usuario_id: 'user-javiera-1',
      inicio: '2026-11-14T13:00:00Z',
      bpm_promedio: 106,
      spo2_promedio: 98,
      edad_al_medir: 22,
      actividad_id: 1,
      actividad: { id: 1, codigo: 'reposo', nombre: 'Reposo' }
    }
  ]

  const rangosGlobales = [
    { id: 1, actividad_id: 1, codigo: 'reposo', edad_min: 18, edad_max: 35, bpm_min: 60, bpm_max: 100 }
  ]

  const serie = construirSerieEvolucion({
    mediciones,
    usuarioId: 'user-javiera-1',
    edad: 22,
    actividadId: 1,
    actividadCodigo: 'reposo',
    rangosGlobales
  })

  assert.equal(serie.tieneDatosSuficientes, true, 'Con 3 días debe tener datos suficientes')
  assert.equal(serie.totalDias, 3, 'Debe consolidar exactamente 3 días distintos')
  assert.equal(serie.totalMediciones, 4, 'Debe contabilizar las 4 mediciones propias')
  assert.equal(serie.dias[0].dia, '2026-11-10')
  assert.equal(serie.dias[0].bpmPromedio, 70, 'El promedio del 10-nov (68 y 72) debe ser 70 BPM')
  assert.equal(serie.dias[0].dentroDeRango, true)
  assert.equal(serie.dias[1].dia, '2026-11-12')
  assert.equal(serie.dias[1].bpmPromedio, 65)
  assert.equal(serie.dias[2].dia, '2026-11-14')
  assert.equal(serie.dias[2].bpmPromedio, 106)
  assert.equal(serie.dias[2].dentroDeRango, false, '106 BPM está sobre el máximo esperado de 100 BPM')
  assert.equal(serie.dias[2].estado, 'alto')
  assert.equal(serie.rangoEsperado.bpmMin, 60)
  assert.equal(serie.rangoEsperado.bpmMax, 100)
  console.log('[OK] 1. Consolidacion de tendencia diaria de BPM en reposo y comparacion con rango esperado.')
}

// 2. Caso sin datos suficientes (< 2 días): 0 días y 1 día, sin inventar valores y mostrando mensaje claro
{
  const serieVacia = construirSerieEvolucion({
    mediciones: [],
    usuarioId: 'user-javiera-1',
    edad: 25,
    actividadId: 1,
    actividadCodigo: 'reposo'
  })

  assert.equal(serieVacia.tieneDatosSuficientes, false)
  assert.equal(serieVacia.totalDias, 0)
  assert.equal(serieVacia.dias.length, 0, 'Nunca debe inventar días cuando no hay mediciones')
  assert.equal(serieVacia.resumen.promedioPeriodoBpm, null, 'Nunca debe inventar un promedio sin datos')
  assert.ok(
    serieVacia.mensajeEstado.includes('2 días'),
    'Debe explicar claramente que se requieren al menos 2 días'
  )

  const serieUnDia = construirSerieEvolucion({
    mediciones: [
      {
        id: 201,
        usuario_id: 'user-javiera-1',
        inicio: '2026-11-13T15:00:00Z',
        bpm_promedio: 74,
        spo2_promedio: 98,
        edad_al_medir: 25,
        actividad_id: 1,
        actividad: { id: 1, codigo: 'reposo', nombre: 'Reposo' }
      }
    ],
    usuarioId: 'user-javiera-1',
    edad: 25,
    actividadId: 1,
    actividadCodigo: 'reposo'
  })

  assert.equal(serieUnDia.tieneDatosSuficientes, false, 'Con 1 solo día no alcanza para trazar tendencia')
  assert.equal(serieUnDia.totalDias, 1, 'Debe conservar únicamente el día real registrado')
  assert.equal(serieUnDia.dias.length, 1, 'No debe inventar un segundo día para completar el gráfico')
  assert.equal(serieUnDia.dias[0].bpmPromedio, 74)
  assert.equal(serieUnDia.resumen.cambioEntreExtremosBpm, null, 'No debe calcular cambio entre extremos con 1 día')
  assert.ok(
    serieUnDia.mensajeEstado.includes('1 día') && serieUnDia.mensajeEstado.includes('2 días'),
    'El mensaje con 1 día debe ser claro sobre el requisito de 2 días'
  )

  const geoUnDia = calcularGeometriaGraficoEvolucion({
    dias: serieUnDia.dias,
    rangoEsperado: serieUnDia.rangoEsperado
  })
  assert.equal(geoUnDia.puntos.length, 0, 'No debe generar puntos de curva de tendencia con menos de 2 días')
  assert.equal(geoUnDia.lineaPath, '', 'No debe dibujar línea de tendencia con menos de 2 días')

  console.log('[OK] 2. Manejo de menos de 2 dias de datos con mensaje claro y sin inventar valores.')
}

// 3. Aislamiento estricto: el usuario solo ve sus propias mediciones
{
  const medicionesMezcladas = [
    {
      id: 301,
      usuario_id: 'otro-usuario-999',
      inicio: '2026-11-10T12:00:00Z',
      bpm_promedio: 95,
      actividad_id: 1,
      actividad: { id: 1, codigo: 'reposo', nombre: 'Reposo' }
    },
    {
      id: 302,
      usuario_id: 'otro-usuario-999',
      inicio: '2026-11-11T12:00:00Z',
      bpm_promedio: 92,
      actividad_id: 1,
      actividad: { id: 1, codigo: 'reposo', nombre: 'Reposo' }
    },
    {
      id: 303,
      usuario_id: 'user-javiera-1',
      inicio: '2026-11-12T12:00:00Z',
      bpm_promedio: 64,
      actividad_id: 1,
      actividad: { id: 1, codigo: 'reposo', nombre: 'Reposo' }
    }
  ]

  const serieFiltrada = construirSerieEvolucion({
    mediciones: medicionesMezcladas,
    usuarioId: 'user-javiera-1',
    edad: 22,
    actividadId: 1,
    actividadCodigo: 'reposo'
  })

  assert.equal(serieFiltrada.totalDias, 1, 'Debe ignorar por completo las mediciones de otros usuarios')
  assert.equal(serieFiltrada.dias[0].bpmPromedio, 64, 'Solo debe incluir la medición de user-javiera-1')
  assert.equal(serieFiltrada.tieneDatosSuficientes, false)
  console.log('[OK] 3. Aislamiento estricto: el usuario solo ve sus propias mediciones.')
}

// 4. Banda del rango esperado según edad y actividad + geometría del gráfico
{
  const rangoReposo = resolverRangoEsperado({
    edad: 24,
    actividadId: 1,
    actividadCodigo: 'reposo'
  })
  assert.equal(rangoReposo.bpmMin, 60)
  assert.equal(rangoReposo.bpmMax, 100)

  const rangoEjercicio = resolverRangoEsperado({
    edad: 24,
    actividadId: 3,
    actividadCodigo: 'ejercicio_moderado'
  })
  assert.equal(rangoEjercicio.bpmMin, 120)
  assert.equal(rangoEjercicio.bpmMax, 155)

  const geo = calcularGeometriaGraficoEvolucion({
    dias: [
      { dia: '2026-11-10', etiquetaDia: '10 nov', bpmPromedio: 68, dentroDeRango: true, estado: 'dentro' },
      { dia: '2026-11-11', etiquetaDia: '11 nov', bpmPromedio: 72, dentroDeRango: true, estado: 'dentro' }
    ],
    rangoEsperado: rangoReposo
  })

  assert.ok(geo.bandaRango.height > 0, 'La banda del rango esperado debe tener altura positiva en el SVG')
  assert.equal(geo.bandaRango.bpmMin, 60)
  assert.equal(geo.bandaRango.bpmMax, 100)
  assert.equal(geo.puntos.length, 2)
  assert.ok(geo.lineaPath.startsWith('M '), 'Debe construir el path SVG de la curva de tendencia')
  console.log('[OK] 4. Banda del rango esperado segun edad y actividad calculada correctamente.')
}

// 5. Verificación de plantilla, aviso de dispositivo no médico, vista SQL y ausencia de emojis/RF visibles
{
  const panelVue = readFileSync(resolve('src/components/PanelEvolucionPersonal.vue'), 'utf8')
  const vistaVue = readFileSync(resolve('src/views/EvolucionView.vue'), 'utf8')
  const migracionSql = readFileSync(
    resolve('supabase/migrations/20261027000900_automatizaciones_vistas_derechos.sql'),
    'utf8'
  )

  assert.ok(vistaVue.includes('<AvisoEducativo'), 'EvolucionView debe mantener el AvisoEducativo de que no es un dispositivo médico')
  assert.ok(panelVue.includes('data-testid="banda-rango-esperado"'), 'Debe dibujar la banda del rango esperado en el SVG')
  assert.ok(panelVue.includes('data-testid="mensaje-datos-insuficientes"'), 'Debe incluir el contenedor de mensaje claro para menos de 2 días')
  assert.ok(migracionSql.includes('create view public.evolucion_reposo with (security_invoker = true)'), 'La vista SQL evolucion_reposo debe existir con security_invoker = true')

  const templatePanel = panelVue.match(/<template>([\s\S]*?)<\/template>/)?.[1] || ''
  const templateVista = vistaVue.match(/<template>([\s\S]*?)<\/template>/)?.[1] || ''

  assert.equal(/\bRF\d+\b/i.test(templatePanel), false, 'El template de PanelEvolucionPersonal no debe mostrar códigos RF')
  assert.equal(/\bRF\d+\b/i.test(templateVista), false, 'El template de EvolucionView no debe mostrar códigos RF')

  const regexEmoji = /[\p{Extended_Pictographic}]/u
  assert.equal(regexEmoji.test(panelVue), false, 'PanelEvolucionPersonal.vue no debe contener emojis')
  assert.equal(regexEmoji.test(vistaVue), false, 'EvolucionView.vue no debe contener emojis')

  console.log('[OK] 5. Plantillas verificadas (AvisoEducativo presente, sin codigos RF visibles ni emojis).')
}

console.log('Todas las pruebas de RF36 pasaron exitosamente (5/5).')
