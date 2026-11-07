/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF47
 * Contraste de Mediciones con Datasets Públicos Internacionales
 * ============================================================================
 * Valida:
 * 1. Catálogo de datasets acreditados (PhysioNet, CapnoBase, MIT MIMIC-III, WESAD, VitalDB)
 * 2. Cálculo estadístico de Correlación de Pearson (r)
 * 3. Cálculo de Error Cuadrático Medio Normalizado (NRMSE)
 * 4. Cálculo de deltas hemodinámicos (BPM, RR ms, SpO2)
 * 5. Clasificación clínica de concordancia morfológica
 * 6. Generación de conclusiones docentes para UNACH
 * 7. Generación de trazos vectoriales SVG para el osciloscopio
 * 8. Integración de componentes Vue (ComparadorDatasetsCard y ComparacionView)
 * ============================================================================
 */

import fs from 'fs'
import path from 'path'
import {
  DATASETS_PUBLICOS_CONTRASTE,
  obtenerDatasetsPublicosContraste,
  obtenerDatasetPublicoPorId,
  calcularCorrelacionPearson,
  calcularNRMSE,
  contrastarMedicionConDataset,
  generarSerieMedicionUsuario,
  generarPathSvgContraste
} from '../src/services/contrasteDatasetsService.js'

let totalPruebas = 0
let pasadas = 0
let falladas = 0

function assert(condicion, mensaje) {
  totalPruebas++
  if (condicion) {
    pasadas++
    console.log(`  ✅ [PASS] ${mensaje}`)
  } else {
    falladas++
    console.error(`  ❌ [FAIL] ${mensaje}`)
  }
}

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF47')
console.log('  Contraste de Mediciones con Datasets Públicos Internacionales')
console.log('================================================================\n')

// ----------------------------------------------------------------------------
// 1. Catálogo de Datasets Públicos Acreditados
// ----------------------------------------------------------------------------
console.log('--- 1. Catálogo de Datasets Públicos Acreditados ---')

const datasets = obtenerDatasetsPublicosContraste()
assert(Array.isArray(datasets) && datasets.length >= 5, `Catálogo contiene al menos 5 datasets internacionales acreditados (encontrados: ${datasets.length})`)

const codigosEsperados = ['BIDMC-UCI-01', 'CAPNO-TBME-09', 'MIMIC-III-TQ', 'WESAD-S2-STR', 'VITALDB-QUIR-14']
const codigosPresentes = datasets.map(d => d.codigo)
const todosPresentes = codigosEsperados.every(c => codigosPresentes.includes(c))
assert(todosPresentes, `Incluye los benchmarks canónicos: ${codigosEsperados.join(', ')}`)

const todosConMetadatos = datasets.every(d =>
  d.id && d.titulo && d.institucion && d.licencia && d.urlOficial.startsWith('http') &&
  typeof d.bpmReferencia === 'number' && typeof d.spo2Referencia === 'number' &&
  d.caracteristicasOnda && d.caracteristicasOnda.ascensoSistolico && d.caracteristicasOnda.muescaDicrota
)
assert(todosConMetadatos, 'Todos los datasets cuentan con metadatos completos, licencia abierta y características morfológicas')

const dsEncontrado = obtenerDatasetPublicoPorId('bidmc-ppg-uci')
assert(dsEncontrado && dsEncontrado.codigo === 'BIDMC-UCI-01', 'Búsqueda por ID devuelve el dataset de PhysioNet BIDMC')

const dsPorCodigo = obtenerDatasetPublicoPorId('CAPNO-TBME-09')
assert(dsPorCodigo && dsPorCodigo.id === 'capnobase-tbme-std', 'Búsqueda por código alternativo devuelve el dataset de CapnoBase')

// ----------------------------------------------------------------------------
// 2. Cálculo Estadístico de Correlación de Pearson (r)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Cálculo Estadístico de Correlación de Pearson (r) ---')

// Señales idénticas -> r = 1.0
const serieA = [1.0, 2.5, 4.0, 3.2, 1.8, 0.5, 0.2]
const rIdentica = calcularCorrelacionPearson(serieA, serieA)
assert(Math.abs(rIdentica - 1.0) < 0.001, `Señales idénticas devuelven correlación r = 1.0 (obtenido: ${rIdentica})`)

// Señales opuestas -> r = -1.0
const serieInvertida = serieA.map(v => -v)
const rInvertida = calcularCorrelacionPearson(serieA, serieInvertida)
assert(Math.abs(rInvertida - (-1.0)) < 0.001, `Señales perfectamente invertidas devuelven correlación r = -1.0 (obtenido: ${rInvertida})`)

// Resistencia ante vectores vacíos o de un solo elemento (sin crash)
const rVacia = calcularCorrelacionPearson([], [1, 2])
assert(rVacia === 0, 'Entradas vacías devuelven correlación neutra (0) de forma segura')

const rConstante = calcularCorrelacionPearson([5, 5, 5, 5], [1, 2, 3, 4])
assert(rConstante === 0, 'Señales constantes sin varianza evitan división por cero y devuelven 0')

// ----------------------------------------------------------------------------
// 3. Cálculo de Error Cuadrático NRMSE
// ----------------------------------------------------------------------------
console.log('\n--- 3. Cálculo de Error Cuadrático Normalizado (NRMSE) ---')

const nrmseCero = calcularNRMSE(serieA, serieA)
assert(nrmseCero === 0, `Discrepancia entre señales idénticas es exactamente 0% (obtenido: ${nrmseCero}%)`)

const serieConRuido = serieA.map(v => v + 0.5)
const nrmseConError = calcularNRMSE(serieConRuido, serieA)
assert(nrmseConError > 0 && nrmseConError <= 100, `Señales con perturbación devuelven NRMSE coherente en porcentaje (obtenido: ${nrmseConError}%)`)

// ----------------------------------------------------------------------------
// 4. Motor de Contraste Fisiológico (Deltas, Similitud y Conclusiones)
// ----------------------------------------------------------------------------
console.log('\n--- 4. Motor de Contraste Fisiológico (RF47) ---')

const resultadoContraste = contrastarMedicionConDataset({
  bpmMedicion: 75.0,
  spo2Medicion: 98.0,
  dataset: 'bidmc-ppg-uci',
  duracionS: 3.5
})

assert(resultadoContraste !== null, 'Motor de contraste ejecuta y devuelve informe estructurado')
assert(resultadoContraste.deltaBpm === 1.0, `Delta BPM exacto: 75 - 74 = +1.0 BPM (obtenido: ${resultadoContraste.deltaBpm})`)
assert(typeof resultadoContraste.deltaIntervaloMs === 'number', `Delta de intervalo RR calculado en ms (${resultadoContraste.deltaIntervaloMs} ms)`)
assert(typeof resultadoContraste.deltaSpo2 === 'number', `Diferencial de saturación SpO2 calculado (${resultadoContraste.deltaSpo2}%)`)
assert(resultadoContraste.similitudPorcentaje >= 70, `Similitud morfológica con BIDMC en reposo es alta (obtenido: ${resultadoContraste.similitudPorcentaje}%)`)
assert(resultadoContraste.concordancia === 'alta', `Clasificación clínica es 'alta' para frecuencias similares (${resultadoContraste.concordanciaTexto})`)
assert(typeof resultadoContraste.conclusion === 'string' && resultadoContraste.conclusion.length > 30, 'Emite conclusión pedagógica fundamentada para docencia UNACH')

// Contraste con Taquicardia (desfase significativo esperado)
const contrasteTaquicardia = contrastarMedicionConDataset({
  bpmMedicion: 65.0,
  spo2Medicion: 97.0,
  dataset: 'mimic3-taquicardia', // 118 BPM
  duracionS: 3.5
})
assert(contrasteTaquicardia.deltaBpm < -40, `Detecta fuerte diferencia de frecuencia frente a taquicardia UCI (delta: ${contrasteTaquicardia.deltaBpm} BPM)`)

// ----------------------------------------------------------------------------
// 5. Generación de Series Vectoriales SVG para el Osciloscopio
// ----------------------------------------------------------------------------
console.log('\n--- 5. Generación de Trazos Vectoriales SVG ---')

const seriePuntos = generarSerieMedicionUsuario(72, 3.5, 50)
assert(Array.isArray(seriePuntos) && seriePuntos.length > 100, `Genera serie temporal con puntos {t, y} suficientes (total: ${seriePuntos.length})`)

const pathSvg = generarPathSvgContraste(seriePuntos, 900, 240, 3.5, 190, 140)
assert(pathSvg.startsWith('M ') && pathSvg.includes(' L '), 'El path SVG generado cumple con la sintaxis vectorial estándar (M x y L x y)')

// ----------------------------------------------------------------------------
// 6. Integración en Componentes Vue y Vistas
// ----------------------------------------------------------------------------
console.log('\n--- 6. Integración en Componentes Vue y Vistas ---')

const rutaComponente = path.resolve('src/components/ComparadorDatasetsCard.vue')
assert(fs.existsSync(rutaComponente), 'El componente ComparadorDatasetsCard.vue existe')

const codigoComponente = fs.readFileSync(rutaComponente, 'utf8')
assert(codigoComponente.includes('RF47') && codigoComponente.includes('modoVisualizacion') && codigoComponente.includes('correlacionPearson'),
  'ComparadorDatasetsCard.vue implementa los modos superpuesto/carriles y las métricas de Pearson'
)

const rutaVista = path.resolve('src/views/ComparacionView.vue')
const codigoVista = fs.readFileSync(rutaVista, 'utf8')
assert(codigoVista.includes("pestañaActiva === 'datasets'") && codigoVista.includes('ComparadorDatasetsCard'),
  'ComparacionView.vue integra la pestaña "datasets" con ComparadorDatasetsCard (RF47)'
)

// ----------------------------------------------------------------------------
// Resumen Final
// ----------------------------------------------------------------------------
console.log('\n================================================================')
console.log(`  RESUMEN DE PRUEBAS RF47:`)
console.log(`  Total: ${totalPruebas} | Pasadas: ${pasadas} | Falladas: ${falladas}`)
console.log('================================================================\n')

if (falladas > 0) {
  process.exit(1)
} else {
  process.exit(0)
}
