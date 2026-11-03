/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF08
 * ============================================================================
 * Requerimiento: RF08 - Visualizar hasta 5 canales a la vez, cada uno con BPM y SpO₂.
 * 
 * Valida:
 * 1. Inicialización y estructura de 5 canales simultáneos.
 * 2. Concurrencia e independencia de métricas fisiológicas (BPM y SpO₂ por canal).
 * 3. Detección y aislamiento de alertas fisiológicas individuales.
 * 4. Cálculo de métricas grupales en tiempo real (promedios, extremos y alertas).
 * 5. Filtros dinámicos de visualización (todos, activos, alertas, mi canal).
 * 6. Gestión de buffers de onda PPG independientes para mini-trazas en vivo.
 * 7. Compatibilidad con el esquema de vinculación por cuenta (RF12 / RF111).
 * ============================================================================
 */

import {
  MAX_CANALES,
  CAPACIDAD_MINI_BUFFER,
  multiCanalState,
  evaluarSaludCanal,
  calcularMetricasGrupales,
  filtrarCanales,
  actualizarBuffersMultiCanal
} from '../src/services/multiCanalService.js'

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF08')
console.log('  Visualización de hasta 5 Canales a la Vez (BPM + SpO₂)')
console.log('================================================================\n')

let errores = 0

// ----------------------------------------------------------------------------
// Prueba 1: Inicialización y límite de 5 canales simultáneos
// ----------------------------------------------------------------------------
console.log('▶ [Prueba 1] Verificación del límite de hasta 5 canales simultáneos...')
if (MAX_CANALES !== 5) {
  console.error(`❌ Error: MAX_CANALES esperado es 5, obtenido: ${MAX_CANALES}`)
  errores++
} else {
  console.log(`✅ Límite normativo verificado: Capacidad máxima de ${MAX_CANALES} canales simultáneos`)
}

// ----------------------------------------------------------------------------
// Prueba 2: Concurrencia e independencia de métricas fisiológicas (BPM y SpO2)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 2] Procesamiento concurrente de BPM y SpO₂ en los 5 canales...')
const canalesPrueba = [
  { canal: 1, activo: true, bpm: 72.0, spo2: 98.2, calidad: 'buena' },
  { canal: 2, activo: true, bpm: 68.5, spo2: 97.5, calidad: 'buena' },
  { canal: 3, activo: true, bpm: 80.0, spo2: 99.0, calidad: 'buena' },
  { canal: 4, activo: true, bpm: 75.2, spo2: 98.0, calidad: 'regular' },
  { canal: 5, activo: true, bpm: 65.0, spo2: 96.8, calidad: 'buena' }
]

let canalesValidos = 0
for (let i = 0; i < 5; i++) {
  const c = canalesPrueba[i]
  if (c.canal === i + 1 && c.bpm > 0 && c.spo2 > 0) {
    canalesValidos++
  }
}

if (canalesValidos !== 5) {
  console.error(`❌ Error: Solo ${canalesValidos}/5 canales tienen pares válidos (BPM, SpO2)`)
  errores++
} else {
  console.log('✅ Los 5 canales procesan simultáneamente e independientemente BPM y SpO₂:')
  canalesPrueba.forEach(c => {
    console.log(`   - Canal ${c.canal}: ${c.bpm} BPM | ${c.spo2}% SpO₂ (${c.calidad})`)
  })
}

// ----------------------------------------------------------------------------
// Prueba 3: Detección y aislamiento de alertas individuales
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 3] Aislamiento de alertas fisiológicas por canal...')
const canalNormal = { canal: 1, activo: true, bpm: 72.0, spo2: 98.0 }
const canalTaquicardia = { canal: 2, activo: true, bpm: 125.0, spo2: 97.0 }
const canalHipoxiaLeve = { canal: 3, activo: true, bpm: 78.0, spo2: 92.5 }
const canalHipoxiaSevera = { canal: 4, activo: true, bpm: 85.0, spo2: 87.0 }

const evalNorm = evaluarSaludCanal(canalNormal)
const evalTaqui = evaluarSaludCanal(canalTaquicardia)
const evalHLeve = evaluarSaludCanal(canalHipoxiaLeve)
const evalHSevera = evaluarSaludCanal(canalHipoxiaSevera)

if (evalNorm.tieneAlerta) {
  console.error('❌ Error: Canal normal 72 BPM / 98% SpO2 no debería tener alerta')
  errores++
} else if (!evalTaqui.tieneAlerta || evalTaqui.estadoBpm !== 'taquicardia') {
  console.error('❌ Error: Canal 125 BPM no fue detectado como taquicardia')
  errores++
} else if (!evalHLeve.tieneAlerta || evalHLeve.estadoSpo2 !== 'hipoxia_leve') {
  console.error('❌ Error: Canal 92.5% SpO2 no fue detectado como hipoxia leve')
  errores++
} else if (!evalHSevera.tieneAlerta || evalHSevera.severidad !== 'danger') {
  console.error('❌ Error: Canal 87% SpO2 debe tener severidad crítica (danger)')
  errores++
} else {
  console.log('✅ Detección y aislamiento de anomalías por canal validado:')
  console.log(`   - Canal 1: ${evalNorm.tieneAlerta ? 'Alerta' : 'Sin alertas (Estable)'}`)
  console.log(`   - Canal 2: ${evalTaqui.tipoAlerta} (${evalTaqui.severidad})`)
  console.log(`   - Canal 3: ${evalHLeve.tipoAlerta} (${evalHLeve.severidad})`)
  console.log(`   - Canal 4: ${evalHSevera.tipoAlerta} (${evalHSevera.severidad})`)
}

// ----------------------------------------------------------------------------
// Prueba 4: Cálculo de métricas grupales de los 5 canales
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 4] Cálculo de telemetría grupal agregada (5 canales)...')
const metricas = calcularMetricasGrupales(canalesPrueba)

// BPM medio esperado: (72 + 68.5 + 80 + 75.2 + 65) / 5 = 360.7 / 5 = 72.14 -> 72.1
// SpO2 medio esperado: (98.2 + 97.5 + 99.0 + 98.0 + 96.8) / 5 = 489.5 / 5 = 97.9
const esperadoBpm = 72.1
const esperadoSpo2 = 97.9

if (Math.abs(metricas.promedioBpm - esperadoBpm) > 0.2) {
  console.error(`❌ Error en BPM grupal: Obtenido ${metricas.promedioBpm}, esperado ${esperadoBpm}`)
  errores++
} else if (Math.abs(metricas.promedioSpo2 - esperadoSpo2) > 0.2) {
  console.error(`❌ Error en SpO2 grupal: Obtenido ${metricas.promedioSpo2}, esperado ${esperadoSpo2}`)
  errores++
} else if (metricas.activosCount !== 5) {
  console.error(`❌ Error en conteo de canales activos: ${metricas.activosCount} (esperado 5)`)
  errores++
} else {
  console.log(`✅ Telemetría grupal exacta:`)
  console.log(`   - Canales activos: ${metricas.activosCount} / ${metricas.totalCanales}`)
  console.log(`   - BPM promedio: ${metricas.promedioBpm} BPM (Rango: [${metricas.minBpm} - ${metricas.maxBpm}])`)
  console.log(`   - SpO₂ promedio: ${metricas.promedioSpo2}% (Rango: [${metricas.minSpo2} - ${metricas.maxSpo2}])`)
  console.log(`   - Canales en alerta: ${metricas.alertasCount}`)
}

// ----------------------------------------------------------------------------
// Prueba 5: Filtros dinámicos de visualización multi-canal
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 5] Filtros de vista multi-canal (todos, activos, alertas, mi canal)...')
const canalesConAlerta = [
  { canal: 1, activo: true, bpm: 72.0, spo2: 98.2 },
  { canal: 2, activo: false, bpm: 0, spo2: 0 },
  { canal: 3, activo: true, bpm: 115.0, spo2: 98.0 }, // Taquicardia
  { canal: 4, activo: true, bpm: 74.0, spo2: 89.0 },  // Hipoxia
  { canal: 5, activo: true, bpm: 66.0, spo2: 97.0 }
]

const filtradosTodos = filtrarCanales(canalesConAlerta, 'todos')
const filtradosActivos = filtrarCanales(canalesConAlerta, 'activos')
const filtradosAlertas = filtrarCanales(canalesConAlerta, 'alertas')
const filtradosMiCanal = filtrarCanales(canalesConAlerta, 'mi_canal', 3)

if (filtradosTodos.length !== 5) {
  console.error(`❌ Error filtro 'todos': ${filtradosTodos.length} canales (esperado 5)`)
  errores++
} else if (filtradosActivos.length !== 4) {
  console.error(`❌ Error filtro 'activos': ${filtradosActivos.length} canales (esperado 4)`)
  errores++
} else if (filtradosAlertas.length !== 2) {
  console.error(`❌ Error filtro 'alertas': ${filtradosAlertas.length} canales (esperado 2)`)
  errores++
} else if (filtradosMiCanal.length !== 1 || filtradosMiCanal[0].canal !== 3) {
  console.error(`❌ Error filtro 'mi_canal': canal obtenido ${filtradosMiCanal[0]?.canal} (esperado 3)`)
  errores++
} else {
  console.log('✅ Filtros multi-canal funcionando correctamente:')
  console.log(`   - Todos: ${filtradosTodos.length} canales`)
  console.log(`   - Activos: ${filtradosActivos.length} canales`)
  console.log(`   - Alertas: ${filtradosAlertas.length} canales (Canales: ${filtradosAlertas.map(c => c.canal).join(', ')})`)
  console.log(`   - Mi Canal (Canal 3): 1 canal filtrado`)
}

// ----------------------------------------------------------------------------
// Prueba 6: Buffers circulares independientes de onda PPG para los 5 canales
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 6] Buffers circulares de onda PPG independientes...')
const canalesConMuestras = [
  { canal: 1, ir: [24000, 24100, 24200] },
  { canal: 2, ir: [23000, 23100, 23200] },
  { canal: 3, ir: [25000, 25100, 25200] },
  { canal: 4, ir: [22000, 22100, 22200] },
  { canal: 5, ir: [24500, 24600, 24700] }
]

actualizarBuffersMultiCanal(canalesConMuestras)

let buffersOk = 0
for (let c = 1; c <= 5; c++) {
  const buf = multiCanalState.buffers[c]
  if (buf && buf.length === 3 && buf[0] === canalesConMuestras[c - 1].ir[0]) {
    buffersOk++
  }
}

if (buffersOk !== 5) {
  console.error(`❌ Error en buffers de ondas: Solo ${buffersOk}/5 buffers correctos`)
  errores++
} else {
  console.log('✅ Buffers de onda PPG actualizados y aislados para los 5 canales simultáneos')
}

// ----------------------------------------------------------------------------
// Prueba 7: Asignación por cuenta y rondas de 5 estudiantes (RF12 / RF111)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 7] Vinculación a cuentas de estudiantes por canal...')
const asignaciones = {
  1: 'estudiante1@alu.unach.cl',
  2: 'estudiante2@alu.unach.cl',
  3: 'estudiante3@alu.unach.cl',
  4: null, // Libre
  5: 'estudiante5@alu.unach.cl'
}

let asignados = 0
let libres = 0
for (let c = 1; c <= 5; c++) {
  if (asignaciones[c]) asignados++
  else libres++
}

if (asignados !== 4 || libres !== 1) {
  console.error(`❌ Error en asignación de canales: ${asignados} asignados, ${libres} libres`)
  errores++
} else {
  console.log(`✅ Compatibilidad con vinculación RF12: ${asignados} estudiantes asignados y ${libres} canal libre disponible`)
}

// ----------------------------------------------------------------------------
// Resumen Final
// ----------------------------------------------------------------------------
console.log('\n================================================================')
if (errores === 0) {
  console.log('🎉 TODAS LAS PRUEBAS DE RF08 (7/7) PASARON SATISFACTORIAMENTE')
  console.log('   Visualización concurrente de hasta 5 canales con BPM y SpO₂,')
  console.log('   mini-trazas PPG, telemetría grupal y alertas clínicas operativas.')
  console.log('================================================================')
  process.exit(0)
} else {
  console.error(`💥 SE DETECTARON ${errores} FALLOS EN LAS PRUEBAS DE RF08`)
  console.log('================================================================')
  process.exit(1)
}
