/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF07 (Valor de Frecuencia BPM)
 * ============================================================================
 * Valida el procesamiento de la frecuencia cardíaca (BPM), intervalos IBI,
 * rangos fisiológicos por edad, detección de arritmias/taquicardia/bradicardia
 * y estadísticas dinámicas de sesión.
 * ============================================================================
 */

import {
  esBpmValido,
  calcularIbiMs,
  ibiABpm,
  obtenerRangosBpmEsperados,
  evaluarRangoBpm,
  crearMonitorEstadisticasBpm
} from '../src/services/bpmService.js'

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF07')
console.log('  Cálculo, Despliegue y Validación del Valor de BPM en Tiempo Real')
console.log('================================================================\n')

let errores = 0

// ----------------------------------------------------------------------------
// Prueba 1: Validación de límites fisiológicos de BPM [20 - 250]
// ----------------------------------------------------------------------------
console.log('▶ [Prueba 1] Validación de límites fisiológicos (20 - 250 BPM)...')
if (!esBpmValido(72) || !esBpmValido(20) || !esBpmValido(250)) {
  console.error('❌ Error: Valores fisiológicos legítimos fueron rechazados')
  errores++
} else if (esBpmValido(10) || esBpmValido(300) || esBpmValido(NaN) || esBpmValido('72')) {
  console.error('❌ Error: Valores aberrantes o tipos incorrectos no fueron filtrados')
  errores++
} else {
  console.log('✅ Filtro de sanidad fisiológica correcto: Acepta [20 - 250] y rechaza ruido/anomalías')
}

// ----------------------------------------------------------------------------
// Prueba 2: Conversión bidireccional BPM <-> IBI (Intervalo Interlatido en ms)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 2] Conversión precisa entre BPM e Intervalo R-R (IBI en ms)...')
// Para 60 BPM -> 1000 ms. Para 75 BPM -> 800 ms. Para 120 BPM -> 500 ms.
const ibi60 = calcularIbiMs(60)
const ibi75 = calcularIbiMs(75)
const ibi120 = calcularIbiMs(120)

if (ibi60 !== 1000 || ibi75 !== 800 || ibi120 !== 500) {
  console.error(`❌ Error en cálculo IBI: ibi60=${ibi60}, ibi75=${ibi75}, ibi120=${ibi120}`)
  errores++
} else {
  const bpmRecuperado = ibiABpm(800)
  if (Math.abs(bpmRecuperado - 75.0) > 0.1) {
    console.error(`❌ Error en conversión inversa ibiABpm: ${bpmRecuperado}`)
    errores++
  } else {
    console.log(`✅ Conversión matemática perfecta: 60 BPM -> ${ibi60}ms | 75 BPM -> ${ibi75}ms (inversa: ${bpmRecuperado} BPM)`)
  }
}

// ----------------------------------------------------------------------------
// Prueba 3: Rangos fisiológicos según edad y actividad (AHA)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 3] Evaluación de rangos clínicos según edad y actividad...')
const rangoAdulto = obtenerRangosBpmEsperados(25, 'reposo')
const rangoMayor = obtenerRangosBpmEsperados(70, 'reposo')
const rangoEjercicio = obtenerRangosBpmEsperados(25, 'ejercicio')

if (rangoAdulto.min !== 60 || rangoAdulto.max !== 100) {
  console.error('❌ Error: Rango adulto esperado es 60-100 BPM')
  errores++
} else if (rangoMayor.min !== 58 || rangoMayor.max !== 95) {
  console.error('❌ Error: Rango adulto mayor esperado es 58-95 BPM')
  errores++
} else if (rangoEjercicio.min < 85) {
  console.error('❌ Error: Rango ejercicio debe contemplar taquicardia adaptativa')
  errores++
} else {
  console.log(`✅ Rango Adulto Reposo: [${rangoAdulto.min} - ${rangoAdulto.max}] BPM`)
  console.log(`✅ Rango Adulto Mayor:  [${rangoMayor.min} - ${rangoMayor.max}] BPM`)
  console.log(`✅ Rango Ejercicio:     [${rangoEjercicio.min} - ${rangoEjercicio.max}] BPM`)
}

// ----------------------------------------------------------------------------
// Prueba 4: Clasificación del valor (Normocardia, Taquicardia, Bradicardia)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 4] Clasificación del valor instantáneo...')
const evalNormal = evaluarRangoBpm(75, rangoAdulto)
const evalTaqui = evaluarRangoBpm(115, rangoAdulto)
const evalBradi = evaluarRangoBpm(48, rangoAdulto)

if (!evalNormal.dentroDeRango || evalNormal.estado !== 'normal') {
  console.error('❌ Error clasificando 75 BPM como normal')
  errores++
} else if (evalTaqui.dentroDeRango || evalTaqui.estado !== 'taquicardia') {
  console.error('❌ Error clasificando 115 BPM como taquicardia')
  errores++
} else if (evalBradi.dentroDeRango || evalBradi.estado !== 'bradicardia') {
  console.error('❌ Error clasificando 48 BPM como bradicardia')
  errores++
} else {
  console.log('✅ 75 BPM  -> Normocardia (Dentro de rango)')
  console.log('✅ 115 BPM -> Taquicardia (Fuera de rango)')
  console.log('✅ 48 BPM  -> Bradicardia (Fuera de rango)')
}

// ----------------------------------------------------------------------------
// Prueba 5: Monitor de estadísticas dinámicas de sesión
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 5] Cálculo dinámico de promedio, mín/máx y estabilidad...')
const monitor = crearMonitorEstadisticasBpm()
const secuencia = [70, 72, 71, 69, 73, 75, 68]

secuencia.forEach(val => monitor.registrarLectura(val, 25, 'reposo'))

const expectedMin = 68
const expectedMax = 75
const expectedAvg = parseFloat((secuencia.reduce((a, b) => a + b, 0) / secuencia.length).toFixed(1))

if (monitor.stats.minBpm !== expectedMin) {
  console.error(`❌ Error en minBpm: esperado ${expectedMin}, obtenido ${monitor.stats.minBpm}`)
  errores++
} else if (monitor.stats.maxBpm !== expectedMax) {
  console.error(`❌ Error en maxBpm: esperado ${expectedMax}, obtenido ${monitor.stats.maxBpm}`)
  errores++
} else if (Math.abs(monitor.stats.averageBpm - expectedAvg) > 0.1) {
  console.error(`❌ Error en averageBpm: esperado ${expectedAvg}, obtenido ${monitor.stats.averageBpm}`)
  errores++
} else if (!monitor.stats.estabilidad.includes('Estable')) {
  console.error(`❌ Error en cálculo de estabilidad: ${monitor.stats.estabilidad}`)
  errores++
} else {
  console.log(`✅ Total lecturas registradas: ${monitor.stats.totalLecturas}`)
  console.log(`✅ Promedio acumulado: ${monitor.stats.averageBpm} BPM (Esperado: ${expectedAvg})`)
  console.log(`✅ Rango observado: [${monitor.stats.minBpm} - ${monitor.stats.maxBpm}] BPM`)
  console.log(`✅ Calificación de estabilidad: "${monitor.stats.estabilidad}"`)
}

console.log('\n----------------------------------------------------------------')
if (errores === 0) {
  console.log('🎉 TODAS LAS PRUEBAS DE RF07 PASARON SATISFACTORIAMENTE (5/5)')
  console.log('----------------------------------------------------------------\n')
  process.exit(0)
} else {
  console.error(`💥 SE DETECTARON ${errores} ERRORES EN LAS PRUEBAS DE RF07`)
  process.exit(1)
}
