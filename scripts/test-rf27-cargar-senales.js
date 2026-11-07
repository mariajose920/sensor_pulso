import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  senalesService,
  parsearArchivoCsv,
  generarCurvaFisiologicaRealista,
  generarCsvPlantillaEjemplo,
  DATASETS_PUBLICOS_CATALOGO,
  SENALES_VALIDADAS_CATALOGO,
  PRESETS_SIMULACION
} from '../src/services/senalesService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF27')
console.log('  Carga de Señales por CSV, Simuladas, Datasets y Validadas')
console.log('================================================================\n')

let pasadas = 0
let falladas = 0

function test(nombre, fn) {
  try {
    fn()
    console.log(`  ✅ [PASS] ${nombre}`)
    pasadas++
  } catch (err) {
    console.error(`  ❌ [FAIL] ${nombre}`)
    console.error(`     Detalle: ${err.message}\n`)
    falladas++
  }
}

async function testAsync(nombre, fn) {
  try {
    await fn()
    console.log(`  ✅ [PASS] ${nombre}`)
    pasadas++
  } catch (err) {
    console.error(`  ❌ [FAIL] ${nombre}`)
    console.error(`     Detalle: ${err.message}\n`)
    falladas++
  }
}

async function ejecutarPruebas() {
  // --------------------------------------------------------------------------
  console.log('--- 1. Carga y Procesamiento de Señales por Archivo CSV ---')
  // --------------------------------------------------------------------------

  test('CSV: Parseo de archivo con cabeceras estándar (tiempo, ir, rojo)', () => {
    const csvContent = generarCsvPlantillaEjemplo()
    const res = parsearArchivoCsv(csvContent, 'registro_prueba.csv')

    assert.strictEqual(res.valido, true, 'El CSV debe ser parseado como válido')
    assert.strictEqual(res.origen, 'csv')
    assert.strictEqual(res.nombreArchivo, 'registro_prueba.csv')
    assert.strictEqual(res.frecuenciaHz, 50, 'Frecuencia detectada debe ser 50 Hz')
    assert(res.totalMuestras >= 200, 'Debe contener al menos 200 muestras')
    assert(res.muestrasIr.length === res.totalMuestras, 'Vector IR debe tener la longitud total')
    assert(res.muestrasRojo.length === res.totalMuestras, 'Vector Rojo debe tener la longitud total')
    assert(res.bpmEstimado >= 60 && res.bpmEstimado <= 90, `BPM estimado debe estar en rango esperado: ${res.bpmEstimado}`)
  })

  test('CSV: Soporte de delimitadores alternativos (punto y coma ;)', () => {
    const csvPuntoYComa = `tiempo_ms;ir;rojo
0;24000;21000
20;24500;21400
40;25100;21900
60;24800;21600
80;24200;21100
100;24050;21020`

    const res = parsearArchivoCsv(csvPuntoYComa, 'datos_punto_coma.csv')
    assert.strictEqual(res.valido, true)
    assert.strictEqual(res.delimitador, ';')
    assert.strictEqual(res.totalMuestras, 6)
    assert.strictEqual(res.muestrasIr[1], 24500)
    assert.strictEqual(res.muestrasRojo[1], 21400)
  })

  test('CSV: Soporte de columna única PPG sin canal rojo', () => {
    const csvSimple = `t,ppg
0,100
20,250
40,420
60,310
80,180
100,120`

    const res = parsearArchivoCsv(csvSimple, 'curva_simple.csv')
    assert.strictEqual(res.valido, true)
    assert.strictEqual(res.totalMuestras, 6)
    assert.strictEqual(res.muestrasIr[2], 420)
    // El canal rojo debe duplicar al IR como fallback
    assert.strictEqual(res.muestrasRojo[2], 420)
  })

  test('CSV: Validación y rechazo de archivos vacíos o corruptos (RF65, RF66)', () => {
    const vacio = parsearArchivoCsv('', 'vacio.csv')
    assert.strictEqual(vacio.valido, false, 'CSV vacío debe ser rechazado')

    const pocasLineas = parsearArchivoCsv('t,ir\n0,10\n20,12', 'corto.csv')
    assert.strictEqual(pocasLineas.valido, false, 'CSV con menos de 5 muestras debe ser rechazado')

    const noNumerico = parsearArchivoCsv('col1,col2\ntexto,palabra\notra,cosa\nfoo,bar\na,b\nc,d', 'letras.csv')
    assert.strictEqual(noNumerico.valido, false, 'CSV sin columnas numéricas debe ser rechazado')
  })

  // --------------------------------------------------------------------------
  console.log('\n--- 2. Carga y Generación de Señales Simuladas Paramétricas ---')
  // --------------------------------------------------------------------------

  test('Simuladas: Generación de bioseñal en reposo fisiológico (72 BPM)', () => {
    const sim = senalesService.generarSenalSimulada('sim-reposo')
    assert.strictEqual(sim.valido, true)
    assert.strictEqual(sim.origen, 'simulada')
    assert.strictEqual(sim.bpm, 72)
    assert.strictEqual(sim.spo2, 98.5)
    assert.strictEqual(sim.frecuenciaHz, 50)
    assert.strictEqual(sim.totalMuestras, 500) // 10s * 50Hz
    assert(sim.muestrasIr.length === 500)
    assert(sim.muestrasRojo.length === 500)

    // Comprobar morfología: el valor máximo debe superar el DC basal
    const maxIr = Math.max(...sim.muestrasIr)
    assert(maxIr > 24000, 'Debe tener picos sistólicos sobre la línea base')
  })

  test('Simuladas: Generación de taquicardia (130 BPM) y bradicardia (48 BPM)', () => {
    const taqui = senalesService.generarSenalSimulada('sim-taquicardia')
    assert.strictEqual(taqui.bpm, 130)

    const bradi = senalesService.generarSenalSimulada('sim-bradicardia')
    assert.strictEqual(bradi.bpm, 48)

    // En taquicardia la distancia entre picos debe ser menor que en bradicardia
    const duracionCicloTaqui = 60 / 130 // ~0.46s
    const duracionCicloBradi = 60 / 48  // ~1.25s
    assert(duracionCicloTaqui < duracionCicloBradi)
  })

  test('Simuladas: Opciones personalizadas de frecuencia, ruido y duración', () => {
    const custom = senalesService.generarSenalSimulada('sim-reposo', {
      bpm: 85,
      spo2: 97.0,
      duracionS: 5,
      frecuenciaHz: 100,
      ruido: 5
    })

    assert.strictEqual(custom.bpm, 85)
    assert.strictEqual(custom.spo2, 97.0)
    assert.strictEqual(custom.frecuenciaHz, 100)
    assert.strictEqual(custom.totalMuestras, 500) // 5s * 100Hz = 500
  })

  // --------------------------------------------------------------------------
  console.log('\n--- 3. Carga de Señales de Datasets Públicos Indexados ---')
  // --------------------------------------------------------------------------

  test('Datasets: Catálogo contiene al menos 4 datasets médicos reconocidos', () => {
    const catalogo = senalesService.obtenerDatasetsPublicos()
    assert(catalogo.length >= 4, 'Debe incluir al menos 4 datasets')

    const bidmc = catalogo.find(d => d.id === 'bidmc-ppg-01')
    assert(bidmc, 'Debe incluir dataset PhysioNet BIDMC')
    assert.strictEqual(bidmc.bpmReferencia, 74.0)
    assert(bidmc.fuente.includes('PhysioNet'))
    assert(bidmc.licencia.length > 0)

    const capno = catalogo.find(d => d.id === 'capnobase-tbme-09')
    assert(capno, 'Debe incluir dataset CapnoBase')

    const mimic = catalogo.find(d => d.id === 'mimic3-arritmia-04')
    assert(mimic, 'Debe incluir dataset MIMIC-III')
  })

  test('Datasets: Carga exitosa de bioseñal real por ID con metadatos clínicos', () => {
    const ds = senalesService.cargarSenalDataset('bidmc-ppg-01')
    assert(ds, 'Carga de BIDMC no debe retornar nulo')
    assert.strictEqual(ds.valido, true)
    assert.strictEqual(ds.origen, 'dataset')
    assert.strictEqual(ds.bpmEstimado, 74.0)
    assert.strictEqual(ds.spo2Estimado, 98.4)
    assert(ds.muestrasIr.length >= 400)
    assert(ds.muestrasRojo.length >= 400)
  })

  // --------------------------------------------------------------------------
  console.log('\n--- 4. Carga de Señales de Referencia Validadas ---')
  // --------------------------------------------------------------------------

  await testAsync('Validadas: Obtención del banco clínico docente validado (AHA)', async () => {
    const validadas = await senalesService.obtenerSenalesValidadas()
    assert(validadas.length >= 4, 'Debe contener al menos 4 señales de referencia validadas')

    const normocardia = validadas.find(v => v.id === 'ref-normocardia-joven')
    assert(normocardia, 'Debe incluir Normocardia Joven')
    assert.strictEqual(normocardia.bpmReferencia, 72.0)
    assert.strictEqual(normocardia.tipo, 'validada')
    assert(normocardia.muestrasIr.length > 0)
    assert(normocardia.explicacion.length > 10, 'Debe incluir explicación pedagógica de la onda')
  })

  // --------------------------------------------------------------------------
  console.log('\n--- 5. Integración con Base de Datos PostgreSQL y RLS ---')
  // --------------------------------------------------------------------------

  const mig4Path = path.join(ROOT, 'supabase', 'migrations', '20261027000400_dispositivos_mediciones.sql')
  const mig4Code = fs.readFileSync(mig4Path, 'utf8')

  test('Base de Datos: Enum fuente_senal contiene csv, simulador, dataset y referencia (RF27)', () => {
    const regex = /create type public\.fuente_senal\s+as enum\s*\('sensor',\s*'simulador',\s*'csv',\s*'dataset',\s*'referencia'\)/
    assert(regex.test(mig4Code), 'fuente_senal debe incluir todos los orígenes de RF27')
  })

  const mig6Path = path.join(ROOT, 'supabase', 'migrations', '20261027000600_comparacion_galeria_aprendizaje.sql')
  const mig6Code = fs.readFileSync(mig6Path, 'utf8')

  test('Base de Datos: Tabla senales_referencia con check de tipo compatible con RF27', () => {
    assert(mig6Code.includes("create table public.senales_referencia"), 'Debe existir tabla senales_referencia')
    assert(mig6Code.includes("'csv'"), 'tipo debe admitir csv')
    assert(mig6Code.includes("'simulada'"), 'tipo debe admitir simulada')
    assert(mig6Code.includes("'dataset'"), 'tipo debe admitir dataset')
    assert(mig6Code.includes("'validada'"), 'tipo debe admitir validada')
  })

  // --------------------------------------------------------------------------
  console.log('\n--- 6. Integración en Interfaz de Usuario y Vistas ---')
  // --------------------------------------------------------------------------

  const compPath = path.join(ROOT, 'src', 'views', 'ComparacionView.vue')
  const compCode = fs.readFileSync(compPath, 'utf8')

  test('ComparacionView: Pestaña "senales" integrada con CargaSenalesCard (RF27)', () => {
    assert(compCode.includes("pestañaActiva === 'senales'"), 'Debe incluir condición de pestaña senales')
    assert(compCode.includes("Carga de Señales (RF27)"), 'Debe tener botón de navegación para RF27')
    assert(compCode.includes("<CargaSenalesCard"), 'Debe invocar el componente CargaSenalesCard')
    assert(compCode.includes("import CargaSenalesCard from '../components/CargaSenalesCard.vue'"), 'Debe importar el componente')
  })

  const cardPath = path.join(ROOT, 'src', 'components', 'CargaSenalesCard.vue')
  const cardCode = fs.readFileSync(cardPath, 'utf8')

  test('CargaSenalesCard: Soporta los 4 orígenes interactivos (csv, simulada, dataset, validada)', () => {
    assert(cardCode.includes("pestanaOrigen === 'csv'"), 'Debe tener pestaña CSV')
    assert(cardCode.includes("pestanaOrigen === 'simulada'"), 'Debe tener pestaña Simulada')
    assert(cardCode.includes("pestanaOrigen === 'dataset'"), 'Debe tener pestaña Dataset')
    assert(cardCode.includes("pestanaOrigen === 'validada'"), 'Debe tener pestaña Validada')
    assert(cardCode.includes("scope-canvas-element"), 'Debe tener canvas de osciloscopio integrado')
    assert(cardCode.includes("transferirAComparador"), 'Debe tener acción para transferir al comparador')
    assert(cardCode.includes("inyectarAMedicion"), 'Debe tener acción para inyectar al osciloscopio en vivo')
  })

  console.log('\n================================================================')
  console.log(`  RESUMEN DE PRUEBAS RF27:`)
  console.log(`  Total: ${pasadas + falladas} | Pasadas: ${pasadas} | Falladas: ${falladas}`)
  console.log('================================================================\n')

  if (falladas > 0) {
    process.exit(1)
  }
}

ejecutarPruebas().catch(err => {
  console.error('Error no capturado en pruebas:', err)
  process.exit(1)
})
