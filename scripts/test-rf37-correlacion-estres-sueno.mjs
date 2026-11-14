import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  normalizarEstres,
  normalizarSueno,
  sanitizarFactoresParaCorrelacion,
  calcularCoeficientePearson,
  analizarCorrelacionBpmEstresSueno,
  AVISO_CORRELACION_NO_CAUSA
} from '../src/utils/correlacionEstresSueno.js'
import { construirSerieEvolucion } from '../src/utils/evolucionPersonal.js'

console.log('Iniciando pruebas automatizadas para RF37 (Correlacion con estres o sueno)...')

// 1. Normalización de estrés (ficha del paciente) y sueño (incluyendo sueño opcional / vacío / numérico)
{
  assert.deepEqual(normalizarEstres('bajo'), {
    codigo: 'bajo',
    puntaje: 1,
    etiqueta: 'Bajo (Tranquilo / Relajado)'
  })
  assert.deepEqual(normalizarEstres('muy_alto'), {
    codigo: 'muy_alto',
    puntaje: 4,
    etiqueta: 'Muy Alto (Estrés agudo / Ansiedad)'
  })
  assert.equal(normalizarEstres(''), null)

  assert.deepEqual(normalizarSueno('menos_5'), {
    codigo: 'menos_5',
    horas: 4.5,
    etiqueta: 'Menos de 5 horas'
  })
  assert.deepEqual(normalizarSueno('7_8'), {
    codigo: '7_8',
    horas: 7.5,
    etiqueta: '7 a 8 horas'
  })
  assert.deepEqual(normalizarSueno('', 6.5), {
    codigo: 'numerico',
    horas: 6.5,
    etiqueta: '6.5 h'
  })
  assert.equal(normalizarSueno(''), null, 'El sueño debe poder omitirse como campo opcional')
  assert.equal(normalizarSueno(null), null)
  console.log('[OK] 1. Datos de estres (ficha) y sueno (incluyendo campo opcional) normalizados correctamente.')
}

// 2. Cálculo de la relación entre BPM y estrés o sueño cuando hay datos suficientes (>= 3 días)
{
  const usuarioId = 'user-javiera-rf37'
  const mediciones = [
    { id: 1, usuario_id: usuarioId, inicio: '2026-11-10T12:00:00Z', bpm_promedio: 64, actividad_id: 1, declaracion_id: 'd1' },
    { id: 2, usuario_id: usuarioId, inicio: '2026-11-11T12:00:00Z', bpm_promedio: 71, actividad_id: 1, declaracion_id: 'd2' },
    { id: 3, usuario_id: usuarioId, inicio: '2026-11-12T12:00:00Z', bpm_promedio: 82, actividad_id: 1, declaracion_id: 'd3' },
    { id: 4, usuario_id: usuarioId, inicio: '2026-11-13T12:00:00Z', bpm_promedio: 90, actividad_id: 1, declaracion_id: 'd4' }
  ]

  const declaracionesPorId = {
    d1: { id: 'd1', usuario_id: usuarioId, factores: { nivelEstres: 'bajo', suenoHoras: 'mas_8' } },
    d2: { id: 'd2', usuario_id: usuarioId, factores: { nivelEstres: 'medio', suenoHoras: '7_8' } },
    d3: { id: 'd3', usuario_id: usuarioId, factores: { nivelEstres: 'alto', suenoHoras: '5_6' } },
    d4: { id: 'd4', usuario_id: usuarioId, factores: { nivelEstres: 'muy_alto', suenoHoras: 'menos_5' } }
  }

  const serie = construirSerieEvolucion({
    mediciones,
    usuarioId,
    edad: 22,
    actividadId: 1,
    actividadCodigo: 'reposo'
  })

  const resultado = analizarCorrelacionBpmEstresSueno({
    diasEvolucion: serie.dias,
    mediciones,
    declaracionesPorId,
    usuarioId
  })

  assert.equal(resultado.estres.tieneDatosSuficientes, true)
  assert.equal(typeof resultado.estres.coeficiente, 'number')
  assert.ok(resultado.estres.coeficiente > 0.9, 'A mayor estrés registrado, mayor BPM promedio en la serie de prueba')
  assert.equal(resultado.estres.sentido, 'positiva')

  assert.equal(resultado.sueno.tieneDatosSuficientes, true)
  assert.equal(typeof resultado.sueno.coeficiente, 'number')
  assert.ok(resultado.sueno.coeficiente < -0.9, 'A menos horas de sueño registradas, mayor BPM promedio en la serie de prueba')
  assert.equal(resultado.sueno.sentido, 'negativa')
  console.log('[OK] 2. Calculo de la relacion entre BPM y estres o sueno en el panel de evolucion.')
}

// 3. Criterio de aceptación: Con datos insuficientes NO muestra un número y muestra aviso claro
{
  const usuarioId = 'user-javiera-rf37'
  const medicionesPocosDias = [
    { id: 10, usuario_id: usuarioId, inicio: '2026-11-14T12:00:00Z', bpm_promedio: 72, actividad_id: 1, declaracion_id: 'd10' }
  ]
  const declaracionesPorId = {
    d10: { id: 'd10', usuario_id: usuarioId, factores: { nivelEstres: 'medio', suenoHoras: '7_8' } }
  }

  const serie1Dia = construirSerieEvolucion({
    mediciones: medicionesPocosDias,
    usuarioId,
    edad: 22
  })

  const corrPocosDatos = analizarCorrelacionBpmEstresSueno({
    diasEvolucion: serie1Dia.dias,
    mediciones: medicionesPocosDias,
    declaracionesPorId,
    usuarioId
  })

  assert.equal(corrPocosDatos.estres.tieneDatosSuficientes, false)
  assert.equal(corrPocosDatos.estres.coeficiente, null, 'Con datos insuficientes NO debe devolver ningún número en estrés')
  assert.ok(
    corrPocosDatos.estres.mensajeDatosInsuficientes.includes('pocos datos') ||
      corrPocosDatos.estres.mensajeDatosInsuficientes.includes('mínimo'),
    'Debe entregar un aviso claro cuando hay pocos datos'
  )

  assert.equal(corrPocosDatos.sueno.tieneDatosSuficientes, false)
  assert.equal(corrPocosDatos.sueno.coeficiente, null, 'Con datos insuficientes NO debe devolver ningún número en sueño')

  // También verificar cuando hay 3 días pero sin variación en el factor (ej. siempre 'medio')
  const sinVariacion = calcularCoeficientePearson([
    { x: 2, y: 70 },
    { x: 2, y: 75 },
    { x: 2, y: 80 }
  ])
  assert.equal(sinVariacion, null, 'Sin variación en el factor no debe mostrar un número inválido o NaN')
  console.log('[OK] 3. Con datos insuficientes no muestra un numero (coeficiente = null) y muestra aviso claro.')
}

// 4. Explicación obligatoria de que correlación no es causa y que no es un diagnóstico
{
  assert.ok(
    AVISO_CORRELACION_NO_CAUSA.toLowerCase().includes('correlación no implica causalidad'),
    'El aviso debe explicar que correlación no es causa'
  )
  assert.ok(
    AVISO_CORRELACION_NO_CAUSA.toLowerCase().includes('no constituye un diagnóstico médico'),
    'El aviso debe explicar que no es un diagnóstico'
  )
  console.log('[OK] 4. Aviso de que correlacion no es causa ni diagnostico verificado.')
}

// 5. Reglas de privacidad de datos de salud: aislamiento por titular, minimización de campos y limpieza al cerrar sesión
{
  const crudo = {
    nombre: 'Javiera Rail',
    fechaNacimiento: '2002-05-10',
    condicionSalud: 'Asma',
    medicacion: 'Salbutamol',
    nivelEstres: 'alto',
    suenoHoras: '5_6'
  }
  const limpio = sanitizarFactoresParaCorrelacion(crudo)
  assert.equal('nombre' in limpio, false, 'No debe conservar el nombre')
  assert.equal('fechaNacimiento' in limpio, false, 'No debe conservar la fecha de nacimiento')
  assert.equal('condicionSalud' in limpio, false, 'No debe conservar la condición de salud')
  assert.equal('medicacion' in limpio, false, 'No debe conservar la medicación')
  assert.equal(limpio.estres?.codigo, 'alto')
  assert.equal(limpio.sueno?.codigo, '5_6')

  // Verificar que declaraciones o mediciones de otro usuario jamás se mezclen
  const corrAislada = analizarCorrelacionBpmEstresSueno({
    diasEvolucion: [{ dia: '2026-11-10', bpmPromedio: 70 }],
    mediciones: [
      { id: 99, usuario_id: 'otro-usuario', inicio: '2026-11-10T10:00:00Z', bpm_promedio: 99, declaracion_id: 'dAjena' }
    ],
    declaracionesPorId: {
      dAjena: { id: 'dAjena', usuario_id: 'otro-usuario', factores: { nivelEstres: 'muy_alto', suenoHoras: 'menos_5' } }
    },
    usuarioId: 'user-javiera-rf37'
  })
  assert.equal(corrAislada.diasConsolidados[0].puntajeEstres, null, 'Nunca debe usar declaraciones de otro usuario')

  // Verificar archivos del proyecto
  const compCorrelacion = readFileSync(resolve('src/components/CorrelacionEstresSuenoPanel.vue'), 'utf8')
  const compEvolucion = readFileSync(resolve('src/components/PanelEvolucionPersonal.vue'), 'utf8')
  const limpiarAlSalir = readFileSync(resolve('src/pwa/limpiarAlSalir.js'), 'utf8')
  const servicioEvolucion = readFileSync(resolve('src/services/evolucionService.js'), 'utf8')

  assert.ok(compEvolucion.includes('CorrelacionEstresSuenoPanel'), 'El panel de evolución debe mostrar la correlación con estrés o sueño')
  assert.ok(compCorrelacion.includes('data-testid="aviso-correlacion-no-causa"'), 'Debe mostrar el aviso de no causalidad y no diagnóstico')
  assert.ok(compCorrelacion.includes('data-testid="aviso-pocos-datos-estres"'), 'Debe mostrar aviso cuando hay pocos datos de estrés')
  assert.ok(compCorrelacion.includes('data-testid="aviso-pocos-datos-sueno"'), 'Debe mostrar aviso cuando hay pocos datos de sueño')
  assert.ok(limpiarAlSalir.includes('limpiarRegistrosDiariosSesion'), 'Debe limpiar los datos de la sesión al salir (regla de privacidad)')
  assert.equal(servicioEvolucion.includes('localStorage'), false, 'Nunca debe guardar datos de salud en localStorage')

  const templateCorr = compCorrelacion.match(/<template>([\s\S]*?)<\/template>/)?.[1] || ''
  assert.equal(/\bRF\d+\b/i.test(templateCorr), false, 'El template no debe mostrar códigos RF al usuario')
  assert.equal(/[\p{Extended_Pictographic}]/u.test(compCorrelacion), false, 'No debe contener emojis')

  console.log('[OK] 5. Reglas de privacidad de datos de salud y plantillas verificadas.')
}

console.log('Todas las pruebas de RF37 pasaron exitosamente (5/5).')
