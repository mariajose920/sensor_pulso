/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF06 (Visualización en Tiempo Real)
 * ============================================================================
 * Valida el filtrado digital, extracción morfológica, cálculo de métricas físicas
 * y exportación de la señal fotopletismográfica en tiempo real.
 * ============================================================================
 */

import {
  filtroSuavizadoEMA,
  filtroMediaMovil,
  extraerComponenteAC,
  detectarMorfologiaPPG,
  calcularMetricasSenal,
  generarCsvOsciloscopio
} from '../src/utils/dspFiltros.js'

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF06')
console.log('  Visualización y Procesamiento de la Señal PPG en Tiempo Real')
console.log('================================================================\n')

let errores = 0

// Función sintética para generar una ventana PPG fisiológica con ruido conocido
function generarSenalPrueba(puntos = 100, ruidoAmplitud = 50) {
  const signal = []
  const beatPeriod = 50 // 1 latido por segundo a 50 Hz = 60 BPM
  for (let i = 0; i < puntos; i++) {
    const t = (i % beatPeriod) / beatPeriod
    const s1 = 1200 * Math.exp(-Math.pow(t - 0.25, 2) / 0.008) // Pico sistólico
    const s2 = 400 * Math.exp(-Math.pow(t - 0.50, 2) / 0.005)  // Onda dícrota
    const notch = -150 * Math.exp(-Math.pow(t - 0.38, 2) / 0.002) // Escotadura
    const ruido = (Math.sin(i * 1.5) + Math.cos(i * 3.7)) * (ruidoAmplitud / 2)
    const baseDc = 24000
    signal.push(parseFloat((baseDc + s1 + s2 + notch + ruido).toFixed(1)))
  }
  return signal
}

// ----------------------------------------------------------------------------
// Prueba 1: Filtrado digital EMA y atenuación de ruido
// ----------------------------------------------------------------------------
console.log('▶ [Prueba 1] Filtrado digital EMA y reducción de varianza de ruido...')
const cruda = generarSenalPrueba(80, 80)
const filtrada = filtroSuavizadoEMA(cruda, 0.25)

if (filtrada.length !== cruda.length) {
  console.error('❌ Error: El filtro alteró la longitud del arreglo')
  errores++
} else {
  // Comprobar que la derivada máxima (rugosidad) se reduce con el filtrado
  let diffCrudaMax = 0
  let diffFiltMax = 0
  for (let i = 1; i < cruda.length; i++) {
    diffCrudaMax = Math.max(diffCrudaMax, Math.abs(cruda[i] - cruda[i - 1]))
    diffFiltMax = Math.max(diffFiltMax, Math.abs(filtrada[i] - filtrada[i - 1]))
  }

  if (diffFiltMax < diffCrudaMax) {
    console.log(`✅ Filtro atenúa transiciones espurias: ${diffCrudaMax.toFixed(1)} -> ${diffFiltMax.toFixed(1)} ADC/muestra`)
  } else {
    console.error('❌ Error: El filtro no redujo el ruido de alta frecuencia')
    errores++
  }
}

// ----------------------------------------------------------------------------
// Prueba 2: Separación de componentes AC y DC
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 2] Extracción de componente pulsátil AC y nivel DC...')
const { ac, dc } = extraerComponenteAC(cruda, 0.02)

if (Math.abs(dc - 24000) > 800) {
  console.error(`❌ Error: Estimación DC fuera de rango esperado (~24000): ${dc}`)
  errores++
} else if (ac.length !== cruda.length) {
  console.error('❌ Error: Arreglo AC incompleto')
  errores++
} else {
  console.log(`✅ Nivel DC estimado: ${dc.toFixed(1)} ADC | Amplitud AC promedio: ${Math.round(Math.max(...ac) - Math.min(...ac))} ADC`)
}

// ----------------------------------------------------------------------------
// Prueba 3: Detección morfológica (Pico Sistólico y Escotadura Dícrota)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 3] Detección de morfología PPG (Sístole y Dícrota)...')
const senalLimpia = generarSenalPrueba(120, 0) // 120 puntos sin ruido para validar algoritmo
const morfologia = detectarMorfologiaPPG(senalLimpia)

const sistolicos = morfologia.filter(m => m.tipo === 'sistolico')
const escotaduras = morfologia.filter(m => m.tipo === 'escotadura')

if (sistolicos.length < 2) {
  console.error(`❌ Error: Se esperaban al menos 2 picos sistólicos, encontrados: ${sistolicos.length}`)
  errores++
} else if (escotaduras.length < 1) {
  console.error('❌ Error: No se detectó escotadura dícrota')
  errores++
} else {
  console.log(`✅ Picos sistólicos detectados: ${sistolicos.length} en índices [${sistolicos.map(s => s.index).join(', ')}]`)
  console.log(`✅ Escotaduras dícrotas detectadas: ${escotaduras.length} en índices [${escotaduras.map(e => e.index).join(', ')}]`)
}

// ----------------------------------------------------------------------------
// Prueba 4: Cálculo de métricas físicas en tiempo real
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 4] Cálculo de métricas físicas de la señal en tiempo real...')
const metricas = calcularMetricasSenal(cruda, 50)

if (metricas.vpp < 500 || metricas.vpp > 3000) {
  console.error(`❌ Error: Vpp fuera de rango fisiológico: ${metricas.vpp}`)
  errores++
} else if (metricas.pi <= 0 || metricas.pi > 20) {
  console.error(`❌ Error: Índice de perfusión (PI) inverosímil: ${metricas.pi}%`)
  errores++
} else {
  console.log(`✅ Amplitud Vpp: ${metricas.vpp} ADC`)
  console.log(`✅ Nivel DC: ${metricas.dc} ADC`)
  console.log(`✅ Índice de Perfusión (PI): ${metricas.pi}%`)
  console.log(`✅ Calidad estimada: ${metricas.calidad} (SNR: ${metricas.snrDb} dB)`)
}

// ----------------------------------------------------------------------------
// Prueba 5: Exportación de datos de señal a CSV
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 5] Generación y validación del formato de exportación CSV...')
const muestrasIr = [24500, 24650, 25200, 24800, 24400]
const muestrasRojo = [21200, 21300, 21800, 21500, 21100]
const csv = generarCsvOsciloscopio(muestrasIr, muestrasRojo, 50, 2)

if (!csv.includes('indice,tiempo_ms,ir_raw,rojo_raw')) {
  console.error('❌ Error: Encabezado CSV no coincide con especificación')
  errores++
} else {
  const lineas = csv.split('\n').filter(l => !l.startsWith('#'))
  if (lineas.length !== 6) { // 1 cabecera + 5 muestras
    console.error(`❌ Error: Cantidad de líneas CSV inesperada: ${lineas.length}`)
    errores++
  } else {
    console.log(`✅ Archivo CSV generado correctamente con ${muestrasIr.length} puntos exportados`)
    console.log(`   Ejemplo fila: "${lineas[1]}"`)
  }
}

console.log('\n----------------------------------------------------------------')
if (errores === 0) {
  console.log('🎉 TODAS LAS PRUEBAS DE RF06 PASARON SATISFACTORIAMENTE (5/5)')
  console.log('----------------------------------------------------------------\n')
  process.exit(0)
} else {
  console.error(`💥 SE DETECTARON ${errores} ERRORES EN LAS PRUEBAS DE RF06`)
  process.exit(1)
}
