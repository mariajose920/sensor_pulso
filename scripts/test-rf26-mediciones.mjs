/**
 * ============================================================================
 * sensor_pulso · Suite de Pruebas Automatizadas para RF26
 * ============================================================================
 * Verifica:
 * 1. Catálogo canónico de mediciones públicas y de respaldo.
 * 2. Carga y normalización de mediciones propias y públicas.
 * 3. Motor de cálculo de métricas comparativas cuantitativas (ΔBPM, ΔRR, ΔSpO2).
 * 4. Generación matemática de formas de onda PPG para osciloscopio multicanal.
 * 5. Auditoría estricta de CERO EMOJIS en todos los archivos de RF26.
 * ============================================================================
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

const galeriaModulePath = path.join(ROOT, 'src', 'data', 'galeriaPublica.js')
const {
  MEDICIONES_PUBLICAS_PRECARGADAS,
  MEDICIONES_PROPIAS_DEMO,
  obtenerMedicionesPropias,
  obtenerMedicionesPublicas,
  calcularMetricasComparacionMediciones,
  generarPuntosOndaMedicion
} = await import('file:///' + galeriaModulePath.replace(/\\/g, '/'))

let passedTests = 0
let failedTests = 0

function assert(condition, message) {
  if (condition) {
    console.log(`[PASS] ${message}`)
    passedTests++
  } else {
    console.error(`[FAIL] ${message}`)
    failedTests++
  }
}

console.log('='.repeat(70))
console.log('EJECUTANDO SUITE DE PRUEBAS RF26: COMPARADOR DE MEDICIONES GUARDADAS Y PUBLICAS')
console.log('='.repeat(70))

// ----------------------------------------------------------------------------
// TEST 1: Catálogo y Casos Públicos Precargados
// ----------------------------------------------------------------------------
console.log('\n--- 1. Integridad del Banco de Mediciones Públicas Docentes ---')
assert(Array.isArray(MEDICIONES_PUBLICAS_PRECARGADAS), 'MEDICIONES_PUBLICAS_PRECARGADAS es un arreglo')
assert(MEDICIONES_PUBLICAS_PRECARGADAS.length >= 5, `Contiene al menos 5 casos de referencia pública (encontrados: ${MEDICIONES_PUBLICAS_PRECARGADAS.length})`)

MEDICIONES_PUBLICAS_PRECARGADAS.forEach(item => {
  assert(typeof item.id === 'string' && item.id.length > 0, `Caso ${item.id} tiene ID válido`)
  assert(typeof item.titulo === 'string' && item.titulo.length > 5, `  ${item.id} tiene título descriptivo`)
  assert(typeof item.bpm === 'number' && item.bpm >= 40 && item.bpm <= 180, `  ${item.id} tiene BPM fisiológico (${item.bpm})`)
  assert(typeof item.spo2 === 'number' && item.spo2 >= 90 && item.spo2 <= 100, `  ${item.id} tiene SpO2 normoxémica (${item.spo2}%)`)
  assert(typeof item.actividad === 'string', `  ${item.id} tiene contexto de actividad declarado`)
  assert(typeof item.descripcion === 'string' && item.descripcion.length > 15, `  ${item.id} tiene descripción docente`)
})

// ----------------------------------------------------------------------------
// TEST 2: Carga y Normalización de Mediciones Propias
// ----------------------------------------------------------------------------
console.log('\n--- 2. Carga y Normalización de Mediciones Propias ---')
assert(Array.isArray(MEDICIONES_PROPIAS_DEMO), 'MEDICIONES_PROPIAS_DEMO es un arreglo')
assert(MEDICIONES_PROPIAS_DEMO.length >= 3, 'Dispone de mediciones de respaldo inicial')

const propias = await obtenerMedicionesPropias()
assert(Array.isArray(propias) && propias.length > 0, `obtenerMedicionesPropias retorna lista poblada (${propias.length} items)`)
propias.forEach(m => {
  assert(typeof m.bpm === 'number' && m.bpm > 0, `  Medición propia ${m.id} tiene BPM numérico válido`)
  assert(m.origen === 'propia', `  Medición propia ${m.id} tiene origen propio marcado`)
})

const publicas = await obtenerMedicionesPublicas()
assert(Array.isArray(publicas) && publicas.length === MEDICIONES_PUBLICAS_PRECARGADAS.length, 'obtenerMedicionesPublicas retorna casos de galería docente')

// ----------------------------------------------------------------------------
// TEST 3: Motor de Cálculo de Métricas Comparativas
// ----------------------------------------------------------------------------
console.log('\n--- 3. Motor de Cálculo de Métricas Comparativas ---')

// Caso A: Misma frecuencia
const metricaIdentica = calcularMetricasComparacionMediciones({
  medicionActualBpm: 70.5,
  medicionActualSpo2: 98.4,
  medicionContraste: MEDICIONES_PUBLICAS_PRECARGADAS[0] // 70.5 BPM, 98.4%
})
assert(metricaIdentica.deltaBpm === 0.0, `Delta BPM exacto a 0.0 (${metricaIdentica.deltaBpm})`)
assert(metricaIdentica.deltaSpo2 === 0.0, `Delta SpO2 exacto a 0.0 (${metricaIdentica.deltaSpo2})`)
assert(metricaIdentica.deltaIntervaloMs === 0, `Delta RR exacto a 0 ms`)
assert(metricaIdentica.concordancia === 'alta', `Concordancia alta asignada correctamente`)
assert(metricaIdentica.similitudPorcentaje >= 95, `Similitud cercana al 100% (${metricaIdentica.similitudPorcentaje}%)`)

// Caso B: Medición actual taquicárdica respecto a referencia (78 BPM vs 70.5 BPM)
const metricaAcelerada = calcularMetricasComparacionMediciones({
  medicionActualBpm: 78.0,
  medicionActualSpo2: 98.0,
  medicionContraste: MEDICIONES_PUBLICAS_PRECARGADAS[0] // 70.5 BPM
})
assert(metricaAcelerada.deltaBpm === 7.5, `Delta BPM positivo (+7.5) calculado correctamente (${metricaAcelerada.deltaBpm})`)
assert(metricaAcelerada.deltaIntervaloMs < 0, `Intervalo RR se acorta con mayor BPM (${metricaAcelerada.deltaIntervaloMs} ms)`)
assert(typeof metricaAcelerada.conclusion === 'string' && metricaAcelerada.conclusion.length > 30, 'Genera conclusión interpretativa docente')

// Caso C: Medición actual bradicárdica respecto a referencia (52 vs 70.5 BPM)
const metricaLenta = calcularMetricasComparacionMediciones({
  medicionActualBpm: 52.0,
  medicionActualSpo2: 99.0,
  medicionContraste: MEDICIONES_PUBLICAS_PRECARGADAS[0]
})
assert(metricaLenta.deltaBpm === -18.5, `Delta BPM negativo (-18.5) calculado correctamente`)
assert(metricaLenta.deltaIntervaloMs > 0, `Intervalo RR se alarga con menor BPM (${metricaLenta.deltaIntervaloMs} ms)`)

// ----------------------------------------------------------------------------
// TEST 4: Generación Matemática de Formas de Onda para Osciloscopio
// ----------------------------------------------------------------------------
console.log('\n--- 4. Generación Matemática de Formas de Onda ---')
const onda = generarPuntosOndaMedicion({
  bpm: 78,
  duracionSegundos: 3.5,
  tasaMuestreo: 100,
  amplitud: 100
})
assert(Array.isArray(onda.tiempos) && onda.tiempos.length === 350, 'Genera exactamente 350 muestras temporales a 100Hz en 3.5s')
assert(Array.isArray(onda.ppg) && onda.ppg.length === 350, 'Genera exactamente 350 puntos de amplitud PPG')

const contieneNaN = onda.ppg.some(v => isNaN(v) || v === null || v === undefined)
assert(!contieneNaN, 'La señal PPG no contiene NaN, null ni undefined')

const maxPpg = Math.max(...onda.ppg)
const minPpg = Math.min(...onda.ppg)
assert(minPpg >= 0 && maxPpg <= 2.0, `Amplitud de onda acotada fisiológicamente [min: ${minPpg}, max: ${maxPpg}]`)

// ----------------------------------------------------------------------------
// TEST 5: Auditoría Estricta de CERO EMOJIS (Regla Obligatoria del Proyecto)
// ----------------------------------------------------------------------------
console.log('\n--- 5. Auditoría de CERO EMOJIS en Código de RF26 ---')
const archivosARevisar = [
  path.join(ROOT, 'src', 'data', 'galeriaPublica.js'),
  path.join(ROOT, 'src', 'components', 'ComparadorMedicionesCard.vue'),
  path.join(ROOT, 'src', 'views', 'ComparacionView.vue')
]

const emojiRegex = /[\u{1F300}-\u{1F9FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu

archivosARevisar.forEach(archivo => {
  const contenido = fs.readFileSync(archivo, 'utf8')
  const coincidencias = contenido.match(emojiRegex) || []
  const nombreRelativo = path.relative(ROOT, archivo)
  assert(coincidencias.length === 0, `Archivo libre de emojis: ${nombreRelativo} (encontrados: ${coincidencias.length})`)
  if (coincidencias.length > 0) {
    console.error(`  Emojis detectados en ${nombreRelativo}:`, coincidencias)
  }
})

// ----------------------------------------------------------------------------
// RESUMEN FINAL
// ----------------------------------------------------------------------------
console.log('\n' + '='.repeat(70))
console.log(`RESULTADO DE LA SUITE RF26: ${passedTests} APROBADAS / ${failedTests} FALLADAS`)
console.log('='.repeat(70))

if (failedTests > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
