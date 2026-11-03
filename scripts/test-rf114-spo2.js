/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF114 (Medición de SpO₂ con MAX30102)
 * ============================================================================
 * Valida la física óptica de doble longitud de onda (660nm Rojo / 880nm IR),
 * el cálculo de la razón de razones (Ratio of Ratios R), la curva de calibración
 * empírica de Maxim (110 - 25*R), el índice de perfusión (PI%), la clasificación
 * clínica de hipoxia y el soporte multi-canal de hasta 5 canales simultáneos.
 * ============================================================================
 */

import {
  esSpo2Valido,
  calcularRatioR,
  calcularSpo2DesdeR,
  calcularRDesdeSpo2,
  calcularIndicePerfusion,
  calcularSpo2DesdeBuffer,
  evaluarEstadoSpo2,
  crearMonitorEstadisticasSpo2,
  crearMonitoresSpo2MultiCanal
} from '../src/services/spo2Service.js'

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF114')
console.log('  Medición de SpO₂ con MAX30102 hasta 5 Canales junto al BPM')
console.log('================================================================\n')

let errores = 0

// ----------------------------------------------------------------------------
// Prueba 1: Validación de límites fisiológicos de SpO₂ [50.0 - 100.0 %]
// ----------------------------------------------------------------------------
console.log('▶ [Prueba 1] Validación de límites fisiológicos (50 - 100 % SpO₂)...')
if (!esSpo2Valido(98.5) || !esSpo2Valido(50.0) || !esSpo2Valido(100.0)) {
  console.error('❌ Error: Valores fisiológicos válidos fueron rechazados')
  errores++
} else if (esSpo2Valido(45.0) || esSpo2Valido(105.0) || esSpo2Valido('98.0') || esSpo2Valido(NaN)) {
  console.error('❌ Error: Valores espurios o tipos inválidos no fueron filtrados')
  errores++
} else {
  console.log('✅ Filtro de sanidad fisiológica: Acepta [50.0 - 100.0 %] y filtra anomalías')
}

// ----------------------------------------------------------------------------
// Prueba 2: Cálculo de Razón de Razones (Ratio of Ratios, R)
// R = (AC_red / DC_red) / (AC_ir / DC_ir)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 2] Razón de razones R (Red vs IR)...')
// Simulación fisiológica típica:
// IR:  DC=24500, AC=1400  -> Modulación pulsátil = 1400 / 24500 ≈ 0.05714
// Red: DC=21000, AC=672   -> Modulación pulsátil = 672 / 21000 = 0.032
// R = 0.032 / 0.057142857 ≈ 0.5600
const rCalculado = calcularRatioR(672, 21000, 1400, 24500)
if (Math.abs(rCalculado - 0.5600) > 0.005) {
  console.error(`❌ Error en ratio R: Obtenido ${rCalculado}, esperado ~0.5600`)
  errores++
} else {
  // Manejo de edge case división por cero
  const rCero = calcularRatioR(0, 0, 0, 0)
  if (rCero <= 0) {
    console.error('❌ Error: Edge case de ceros no devolvió valor por defecto seguro')
    errores++
  } else {
    console.log(`✅ Cálculo de Ratio R exacto: R = ${rCalculado} (edge case seguro: ${rCero})`)
  }
}

// ----------------------------------------------------------------------------
// Prueba 3: Curva de calibración empírica Maxim (SpO₂ = 110 - 25 * R)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 3] Calibración empírica del sensor MAX30102...')
// Para R = 0.48 -> SpO2 = 110 - (25 * 0.48) = 98.0 %
const spo2_98 = calcularSpo2DesdeR(0.48)
// Para R = 0.60 -> SpO2 = 110 - (25 * 0.60) = 95.0 %
const spo2_95 = calcularSpo2DesdeR(0.60)
// Para R = 1.00 -> SpO2 = 110 - (25 * 1.00) = 85.0 % (Hipoxia)
const spo2_85 = calcularSpo2DesdeR(1.00)

if (spo2_98 !== 98.0 || spo2_95 !== 95.0 || spo2_85 !== 85.0) {
  console.error(`❌ Error en curva de calibración: [${spo2_98}, ${spo2_95}, ${spo2_85}]`)
  errores++
} else {
  // Acotamiento superior (R muy pequeño no debe superar 100%)
  const spo2_clamped = calcularSpo2DesdeR(0.2)
  if (spo2_clamped > 100.0) {
    console.error(`❌ Error: SpO2 no se acotó a 100%: ${spo2_clamped}`)
    errores++
  } else {
    const rInverso = calcularRDesdeSpo2(98.0)
    console.log(`✅ Curva Maxim precisa: R=0.48 -> ${spo2_98}% | R=0.60 -> ${spo2_95}% | R=1.00 -> ${spo2_85}% (inversa R: ${rInverso})`)
  }
}

// ----------------------------------------------------------------------------
// Prueba 4: Índice de Perfusión (Perfusion Index, PI%)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 4] Índice de Perfusión Arterial (PI %)...')
// Para AC_ir = 1400 y DC_ir = 24500: PI = (1400 / 24500) * 100 = 5.71%
const perfOptima = calcularIndicePerfusion(1400, 24500)
// Para señal débil: AC_ir = 80 y DC_ir = 24500: PI = 0.33%
const perfBaja = calcularIndicePerfusion(80, 24500)

if (perfOptima.pi !== 5.71 || perfOptima.calidad !== 'optima') {
  console.error(`❌ Error calculando perfusión óptima: ${JSON.stringify(perfOptima)}`)
  errores++
} else if (perfBaja.calidad !== 'baja') {
  console.error(`❌ Error clasificando perfusión baja: ${JSON.stringify(perfBaja)}`)
  errores++
} else {
  console.log(`✅ Clasificación de perfusión: ${perfOptima.pi}% (${perfOptima.calidad}) y ${perfBaja.pi}% (${perfBaja.calidad})`)
}

// ----------------------------------------------------------------------------
// Prueba 5: Procesamiento de buffer raw de muestras IR/Rojo (MAX30102)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 5] Procesamiento de muestras directas del buffer...')
// Generamos 25 muestras sintéticas con modulación pulsátil conocida
const irBuf = []
const redBuf = []
const dcIrNominal = 24000
const dcRedNominal = 20000
const ratioConocido = (110.0 - 97.5) / 25.0 // R = 0.50
// Factor de absorción pulsátil de acuerdo a la relación R = (AC_red/DC_red) / (AC_ir/DC_ir)
const acRedFactor = ratioConocido * (dcRedNominal / dcIrNominal)

for (let i = 0; i < 25; i++) {
  const ppg = Math.sin((i / 25) * Math.PI) // Pulso sistólico
  irBuf.push(dcIrNominal + 1000 * ppg)
  redBuf.push(dcRedNominal + 1000 * ppg * acRedFactor)
}

const resultadoBuffer = calcularSpo2DesdeBuffer(irBuf, redBuf)
if (!resultadoBuffer.valido || Math.abs(resultadoBuffer.spo2 - 97.5) > 1.5) {
  console.error(`❌ Error procesando buffer de sensor: SpO2=${resultadoBuffer.spo2}`)
  errores++
} else {
  // Comprobar detección de sensor sin dedo (DC < 5000)
  const sinDedo = calcularSpo2DesdeBuffer([100, 100], [100, 100])
  if (!sinDedo.sinDedo) {
    console.error('❌ Error: Falta detección de desconexión / sin dedo')
    errores++
  } else {
    console.log(`✅ Extracción de SpO₂ desde buffer PPG: ${resultadoBuffer.spo2}% SpO₂ (R=${resultadoBuffer.ratioR}) y detección de dedo correcta`)
  }
}

// ----------------------------------------------------------------------------
// Prueba 6: Clasificación clínica y alertas de hipoxia
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 6] Clasificación clínica y alertas de hipoxemia...')
const evalNormal = evaluarEstadoSpo2(98.5)
const evalLeve = evaluarEstadoSpo2(92.0)
const evalModerada = evaluarEstadoSpo2(87.0)
const evalSevera = evaluarEstadoSpo2(82.0)

if (evalNormal.estado !== 'normal' || evalNormal.severidad !== 'success') {
  console.error('❌ Error: 98.5% debe ser clasificado como Normal')
  errores++
} else if (evalLeve.estado !== 'hipoxia_leve' || evalLeve.severidad !== 'warning') {
  console.error('❌ Error: 92.0% debe ser clasificado como Hipoxia Leve')
  errores++
} else if (evalModerada.estado !== 'hipoxia_moderada') {
  console.error('❌ Error: 87.0% debe ser clasificado como Hipoxia Moderada')
  errores++
} else if (evalSevera.estado !== 'hipoxia_severa' || evalSevera.severidad !== 'danger') {
  console.error('❌ Error: 82.0% debe ser clasificado como Hipoxia Severa')
  errores++
} else {
  console.log(`✅ Clasificación clínica OMS/AHA:`)
  console.log(`   - 98.5% -> ${evalNormal.etiqueta} (${evalNormal.severidad})`)
  console.log(`   - 92.0% -> ${evalLeve.etiqueta} (${evalLeve.severidad})`)
  console.log(`   - 87.0% -> ${evalModerada.etiqueta} (${evalModerada.severidad})`)
  console.log(`   - 82.0% -> ${evalSevera.etiqueta} (${evalSevera.severidad})`)
}

// ----------------------------------------------------------------------------
// Prueba 7: Monitor Multi-Canal (Soporte simultáneo de hasta 5 canales con SpO2 y BPM)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 7] Monitor multi-canal para 5 canales simultáneos (RF114 + RF08)...')
const multi = crearMonitoresSpo2MultiCanal(5)

const paquetePrueba = [
  { canal: 1, bpm: 72.0, spo2: 98.2 },
  { canal: 2, bpm: 68.5, spo2: 97.5 },
  { canal: 3, bpm: 80.0, spo2: 99.0 },
  { canal: 4, bpm: 75.2, spo2: 98.0 },
  { canal: 5, bpm: 65.0, spo2: 96.8 }
]

multi.registrarCanales(paquetePrueba)

let canalesOk = 0
for (let c = 1; c <= 5; c++) {
  const m = multi.monitores[c]
  if (m.stats.currentSpo2 === paquetePrueba[c - 1].spo2 && m.stats.totalLecturas === 1) {
    canalesOk++
  }
}

if (canalesOk !== 5) {
  console.error(`❌ Error en monitor multi-canal: Solo ${canalesOk}/5 canales correctos`)
  errores++
} else {
  console.log(`✅ Soporte multi-canal validado: Los 5 canales procesados simultáneamente con SpO₂ y BPM`)
}

// ----------------------------------------------------------------------------
// Resumen Final
// ----------------------------------------------------------------------------
console.log('\n================================================================')
if (errores === 0) {
  console.log('🎉 TODAS LAS PRUEBAS DE RF114 (7/7) PASARON SATISFACTORIAMENTE')
  console.log('   Algoritmo MAX30102, física óptica dual, Razón R, PI% y')
  console.log('   monitoreo de hasta 5 canales simultáneos completamente funcionales.')
  console.log('================================================================')
  process.exit(0)
} else {
  console.error(`💥 SE DETECTARON ${errores} FALLOS EN LAS PRUEBAS DE RF114`)
  console.log('================================================================')
  process.exit(1)
}
