/**
 * ============================================================================
 * sensor_pulso · Suite de Pruebas Automatizadas para RF25
 * ============================================================================
 * Verifica:
 * 1. Integridad del catálogo canónico de patologías y arritmias (7 ritmos).
 * 2. Generación matemática dual sincronizada (PPG y ECG) con retardo PTT.
 * 3. Motor de métricas comparativas y diagnóstico cuantitativo.
 * 4. Regla estricta CERO EMOJIS en todos los archivos modificados o creados.
 * ============================================================================
 */

import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

// Importamos la lógica pura del catálogo y generador matemático
const ritmosModulePath = path.join(ROOT, 'src', 'data', 'ritmosPatologias.js')
const {
  RITMOS_PATOLOGIAS,
  obtenerRitmoPatologia,
  generarTrazadoDualPatologia,
  calcularMetricasComparacionPatologia
} = await import('file:///' + ritmosModulePath.replace(/\\/g, '/'))

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
console.log('EJECUTANDO SUITE DE PRUEBAS RF25: COMPARADOR DE PATOLOGIAS Y ARRITMIAS')
console.log('='.repeat(70))

// ----------------------------------------------------------------------------
// TEST 1: Catálogo canónico de patologías y arritmias
// ----------------------------------------------------------------------------
console.log('\n--- 1. Integridad del Catálogo Clínico ---')
assert(Array.isArray(RITMOS_PATOLOGIAS), 'RITMOS_PATOLOGIAS es un arreglo exportado')
assert(RITMOS_PATOLOGIAS.length === 7, `El catálogo contiene exactamente 7 ritmos clínicos (encontrados: ${RITMOS_PATOLOGIAS.length})`)

const idsEsperados = [
  'sinusal_normal',
  'taquicardia_sinusal',
  'bradicardia_sinusal',
  'fibrilacion_auricular',
  'extrasistoles_pvc',
  'bigeminismo_ventricular',
  'flutter_auricular'
]

idsEsperados.forEach(id => {
  const ritmo = RITMOS_PATOLOGIAS.find(r => r.id === id)
  assert(!!ritmo, `Patología presente en catálogo: ${id}`)
  if (ritmo) {
    assert(typeof ritmo.nombre === 'string' && ritmo.nombre.length > 0, `  ${id} tiene nombre clínico`)
    assert(typeof ritmo.bpm === 'number' && ritmo.bpm > 30 && ritmo.bpm < 250, `  ${id} tiene BPM válido (${ritmo.bpm})`)
    assert(typeof ritmo.fisiopatologia === 'string' && ritmo.fisiopatologia.length > 20, `  ${id} tiene fundamento fisiopatológico docente`)
    assert(typeof ritmo.criterioPpg === 'string' && ritmo.criterioPpg.length > 15, `  ${id} tiene criterio PPG`)
    assert(typeof ritmo.criterioEcg === 'string' && ritmo.criterioEcg.length > 15, `  ${id} tiene criterio ECG`)
  }
})

// Prueba helper de obtención
const ritmoObtenido = obtenerRitmoPatologia('fibrilacion_auricular')
assert(ritmoObtenido && ritmoObtenido.id === 'fibrilacion_auricular', 'obtenerRitmoPatologia retorna el objeto exacto')
const fallbackRitmo = obtenerRitmoPatologia('ritmo_inexistente')
assert(fallbackRitmo && fallbackRitmo.id === 'sinusal_normal', 'obtenerRitmoPatologia retorna fallback sinusal_normal ante ID inválido')

// ----------------------------------------------------------------------------
// TEST 2: Generación matemática dual sincronizada (PPG y ECG)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Generación Matemática Dual Sincronizada (PPG y ECG) ---')
idsEsperados.forEach(id => {
  const duracion = 3.5
  const hz = 100
  const resultado = generarTrazadoDualPatologia(id, duracion, hz)
  
  assert(Array.isArray(resultado.tiempos) && resultado.tiempos.length === 350, `[${id}] Tiempos generados correctamente (350 muestras a 100Hz)`)
  assert(Array.isArray(resultado.ppg) && resultado.ppg.length === 350, `[${id}] Arreglo PPG tiene 350 muestras`)
  assert(Array.isArray(resultado.ecg) && resultado.ecg.length === 350, `[${id}] Arreglo ECG tiene 350 muestras`)
  
  // Validar ausencia de NaN o nulos
  const nanEnPpg = resultado.ppg.some(v => isNaN(v) || v === null || v === undefined)
  const nanEnEcg = resultado.ecg.some(v => isNaN(v) || v === null || v === undefined)
  assert(!nanEnPpg, `[${id}] No existen valores NaN ni nulos en PPG`)
  assert(!nanEnEcg, `[${id}] No existen valores NaN ni nulos en ECG`)
  
  // Validar límites biológicos
  const maxPpg = Math.max(...resultado.ppg)
  const minPpg = Math.min(...resultado.ppg)
  assert(minPpg >= 0 && maxPpg <= 2.0, `[${id}] PPG acotado fisiológicamente [min: ${minPpg.toFixed(2)}, max: ${maxPpg.toFixed(2)}]`)
  
  const maxEcg = Math.max(...resultado.ecg)
  const minEcg = Math.min(...resultado.ecg)
  assert(maxEcg >= 0.5 && minEcg <= 0.1, `[${id}] ECG presenta deflexiones QRS válidas [min: ${minEcg.toFixed(2)}, max: ${maxEcg.toFixed(2)}]`)
})

// ----------------------------------------------------------------------------
// TEST 3: Motor de métricas comparativas y compatibilidad clínica
// ----------------------------------------------------------------------------
console.log('\n--- 3. Motor de Métricas Comparativas ---')
const metricaSinusal = calcularMetricasComparacionPatologia({
  medicionBpm: 74,
  medicionIntervaloMs: 811,
  patologiaId: 'sinusal_normal'
})
assert(metricaSinusal.deltaBpm === 2.0, `Delta BPM calculado con precisión (74 vs 72 -> ${metricaSinusal.deltaBpm})`)
assert(metricaSinusal.similitudFrecuencia >= 90, `Similitud cercana al 100% para ritmo concordante (${metricaSinusal.similitudFrecuencia}%)`)
assert(metricaSinusal.compatibilidad === 'alta', `Compatibilidad alta asignada correctamente (${metricaSinusal.compatibilidad})`)

const metricaTaqui = calcularMetricasComparacionPatologia({
  medicionBpm: 74,
  medicionIntervaloMs: 811,
  patologiaId: 'taquicardia_sinusal'
})
assert(metricaTaqui.deltaBpm === -51.0, `Delta BPM negativo respecto a taquicardia 125 BPM (${metricaTaqui.deltaBpm})`)
assert(metricaTaqui.compatibilidad === 'baja', `Compatibilidad baja asignada correctamente para paciente normocárdico vs taquicardia`)

// ----------------------------------------------------------------------------
// TEST 4: Verificación estricta de CERO EMOJIS (Política Obligatoria del Proyecto)
// ----------------------------------------------------------------------------
console.log('\n--- 4. Auditoría de CERO EMOJIS en Código de RF25 ---')
const archivosARevisar = [
  path.join(ROOT, 'src', 'data', 'ritmosPatologias.js'),
  path.join(ROOT, 'src', 'components', 'ComparadorPatologiasCard.vue'),
  path.join(ROOT, 'src', 'views', 'ComparacionView.vue')
]

// Expresión regular exhaustiva para detectar emojis unicode
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
console.log(`RESULTADO DE LA SUITE RF25: ${passedTests} APROBADAS / ${failedTests} FALLADAS`)
console.log('='.repeat(70))

if (failedTests > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
