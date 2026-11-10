import assert from 'assert'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import {
  LIMITES_CSV,
  detectarFormulaCsv,
  detectarArchivoBinario,
  validarLimitesArchivoCsv,
  validarMetadatosArchivoCsv
} from '../src/services/limitesCsvService.js'
import { senalesService } from '../src/services/senalesService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF66')
console.log('  Límites de Archivos CSV y Detección de Contenido Peligroso')
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

async function ejecutarPruebas() {
  // --------------------------------------------------------------------------
  console.log('--- 1. Definición de Límites (Tamaño Máximo, Tipo .csv y Máximo de Filas) ---')
  // --------------------------------------------------------------------------

  test('Límites: Constantes de tamaño (5 MB), tipo .csv y filas (50.000) configuradas', () => {
    assert.strictEqual(LIMITES_CSV.TAMANO_MAX_BYTES, 5 * 1024 * 1024, 'El tamaño máximo debe ser 5 MB')
    assert.strictEqual(LIMITES_CSV.EXTENSION_PERMITIDA, '.csv', 'La extensión permitida debe ser estrictamente .csv')
    assert.strictEqual(LIMITES_CSV.MAX_FILAS, 50000, 'El límite máximo de filas debe ser 50.000')
    assert.strictEqual(LIMITES_CSV.MIN_FILAS, 5, 'El límite mínimo de filas debe ser 5')
    assert(LIMITES_CSV.CARACTERES_FORMULA.includes('='), 'Debe incluir caracter de fórmula =')
    assert(LIMITES_CSV.CARACTERES_FORMULA.includes('+'), 'Debe incluir caracter de fórmula +')
    assert(LIMITES_CSV.CARACTERES_FORMULA.includes('-'), 'Debe incluir caracter de fórmula -')
    assert(LIMITES_CSV.CARACTERES_FORMULA.includes('@'), 'Debe incluir caracter de fórmula @')
  })

  test('Límites: Rechazo inmediato de archivo grande (> 5 MB) antes de procesarse', () => {
    const csvValidoNormal = 'tiempo,ir,rojo\n0.00,24000,18000\n0.02,24500,18200\n0.04,25100,18500\n0.06,25800,18900\n0.08,25200,18400'
    // Simulamos tamaño de 5.5 MB en metadatos
    const res = validarLimitesArchivoCsv(csvValidoNormal, {
      nombreArchivo: 'registro_pesado.csv',
      tamanoBytes: 5.5 * 1024 * 1024
    })
    assert.strictEqual(res.valido, false, 'Un archivo que supere 5 MB debe ser rechazado')
    assert.strictEqual(res.motivoRechazo, 'tamano_excedido')
    assert(res.error.includes('supera el tamaño máximo'), 'El mensaje debe indicar exceso de tamaño')
  })

  test('Límites: Rechazo de archivo que supera el máximo de 50.000 filas', () => {
    // Generar archivo con 50.002 filas
    const encabezado = 'tiempo,ppg\n'
    const fila = '0.02,1200\n'
    const csvEnorme = encabezado + fila.repeat(50001)

    const res = validarLimitesArchivoCsv(csvEnorme, { nombreArchivo: 'masivo.csv' })
    assert.strictEqual(res.valido, false, 'Debe rechazar archivos con más de 50.000 filas')
    assert.strictEqual(res.motivoRechazo, 'filas_excedidas')
    assert(res.error.includes('filas'), 'El mensaje debe indicar exceso de filas')
  })

  test('Límites: Rechazo de archivo vacío o con menos de 5 filas', () => {
    const resVacio = validarLimitesArchivoCsv('', { nombreArchivo: 'vacio.csv' })
    assert.strictEqual(resVacio.valido, false)
    assert.strictEqual(resVacio.motivoRechazo, 'archivo_vacio')

    const resCorto = validarLimitesArchivoCsv('t,ir\n0,100\n1,200', { nombreArchivo: 'corto.csv' })
    assert.strictEqual(resCorto.valido, false)
    assert.strictEqual(resCorto.motivoRechazo, 'filas_insuficientes')
  })

  // --------------------------------------------------------------------------
  console.log('\n--- 2. Validación Estricta de Tipo de Archivo (.csv) ---')
  // --------------------------------------------------------------------------

  test('Tipo: Rechazo de archivos con extensiones distintas a .csv (.txt, .xlsx, .pdf, .exe)', () => {
    const csvValidoTexto = 'tiempo,ir,rojo\n0.00,24000,18000\n0.02,24500,18200\n0.04,25100,18500\n0.06,25800,18900\n0.08,25200,18400'

    const extensionesNoPermitidas = [
      'datos.txt',
      'planilla.xlsx',
      'informe.pdf',
      'programa.exe',
      'script.bat',
      'datos.json',
      'sin_extension'
    ]

    for (const ext of extensionesNoPermitidas) {
      const res = validarLimitesArchivoCsv(csvValidoTexto, { nombreArchivo: ext })
      assert.strictEqual(res.valido, false, `El archivo ${ext} debe ser rechazado`)
      assert.strictEqual(res.motivoRechazo, 'tipo_invalido', `El motivo de rechazo para ${ext} debe ser tipo_invalido`)
    }
  })

  test('Tipo: Aceptación de archivos con extensión .csv (case-insensitive)', () => {
    const csvValidoTexto = 'tiempo,ir,rojo\n0.00,24000,18000\n0.02,24500,18200\n0.04,25100,18500\n0.06,25800,18900\n0.08,25200,18400'

    const nombresValidos = ['senales.csv', 'PACIENTE_01.CSV', 'prueba.ppg.csv']
    for (const nom of nombresValidos) {
      const res = validarLimitesArchivoCsv(csvValidoTexto, { nombreArchivo: nom })
      assert.strictEqual(res.valido, true, `El archivo ${nom} debe ser aceptado`)
    }
  })

  test('Tipo: validarMetadatosArchivoCsv rechaza archivos no .csv antes de leerlos', () => {
    const metaTxt = { name: 'senales.txt', size: 1024 }
    const resTxt = validarMetadatosArchivoCsv(metaTxt)
    assert.strictEqual(resTxt.valido, false)
    assert.strictEqual(resTxt.motivoRechazo, 'tipo_invalido')

    const metaPesado = { name: 'senales.csv', size: 6 * 1024 * 1024 }
    const resPesado = validarMetadatosArchivoCsv(metaPesado)
    assert.strictEqual(resPesado.valido, false)
    assert.strictEqual(resPesado.motivoRechazo, 'tamano_excedido')

    const metaValido = { name: 'senales.csv', size: 50000 }
    const resValido = validarMetadatosArchivoCsv(metaValido)
    assert.strictEqual(resValido.valido, true)
  })

  // --------------------------------------------------------------------------
  console.log('\n--- 3. Detección y Rechazo de Archivos Binarios ---')
  // --------------------------------------------------------------------------

  test('Binarios: Detección y rechazo de archivos con caracteres nulos (\\0)', () => {
    const csvConNulo = 'tiempo,ir,rojo\n0.00,24000,18000\n0.02\0,24500,18200\n0.04,25100,18500\n0.06,25800,18900\n0.08,25200,18400'
    const resBin = detectarArchivoBinario(csvConNulo)
    assert.strictEqual(resBin.esBinario, true, 'Debe detectar caracteres nulos como binario')

    const resValidacion = validarLimitesArchivoCsv(csvConNulo, { nombreArchivo: 'nulos.csv' })
    assert.strictEqual(resValidacion.valido, false, 'Archivo con nulos debe rechazarse')
    assert.strictEqual(resValidacion.motivoRechazo, 'archivo_binario')
  })

  test('Binarios: Detección y rechazo de ejecutables Windows (firma MZ / PE)', () => {
    const contenidoExe = 'MZ\x90\x00\x03\x00\x00\x00\x04\x00\x00\x00\xFF\xFF\x00\x00Este archivo no es un CSV'
    const resBin = detectarArchivoBinario(contenidoExe)
    assert.strictEqual(resBin.esBinario, true, 'Debe detectar cabecera MZ')

    const res = validarLimitesArchivoCsv(contenidoExe, { nombreArchivo: 'malware.csv' })
    assert.strictEqual(res.valido, false)
    assert.strictEqual(res.motivoRechazo, 'archivo_binario')
  })

  test('Binarios: Detección y rechazo de ejecutables Linux ELF (firma \\x7fELF)', () => {
    const contenidoElf = '\x7fELF\x02\x01\x01\x00\x00\x00\x00\x00\x00\x00\x00\x00binario_linux'
    const resBin = detectarArchivoBinario(contenidoElf)
    assert.strictEqual(resBin.esBinario, true, 'Debe detectar cabecera ELF')

    const res = validarLimitesArchivoCsv(contenidoElf, { nombreArchivo: 'script.csv' })
    assert.strictEqual(res.valido, false)
    assert.strictEqual(res.motivoRechazo, 'archivo_binario')
  })

  test('Binarios: Detección y rechazo de documentos PDF (firma %PDF-)', () => {
    const contenidoPdf = '%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\ntrailer\n%%EOF'
    const resBin = detectarArchivoBinario(contenidoPdf)
    assert.strictEqual(resBin.esBinario, true, 'Debe detectar firma %PDF')

    const res = validarLimitesArchivoCsv(contenidoPdf, { nombreArchivo: 'documento.csv' })
    assert.strictEqual(res.valido, false)
    assert.strictEqual(res.motivoRechazo, 'archivo_binario')
  })

  test('Binarios: Detección y rechazo de paquetes ZIP y documentos Office (firma PK)', () => {
    const contenidoZip = 'PK\x03\x04\x14\x00\x00\x00\x08\x00archivo_comprimido'
    const resBin = detectarArchivoBinario(contenidoZip)
    assert.strictEqual(resBin.esBinario, true, 'Debe detectar firma PK')

    const res = validarLimitesArchivoCsv(contenidoZip, { nombreArchivo: 'archivo.csv' })
    assert.strictEqual(res.valido, false)
    assert.strictEqual(res.motivoRechazo, 'archivo_binario')
  })

  test('Binarios: Detección y rechazo de imágenes PNG (firma \\x89PNG)', () => {
    const contenidoPng = '\x89PNG\r\n\x1a\n\x00\x00\x00\rIHDR'
    const resBin = detectarArchivoBinario(contenidoPng)
    assert.strictEqual(resBin.esBinario, true, 'Debe detectar firma PNG')

    const res = validarLimitesArchivoCsv(contenidoPng, { nombreArchivo: 'foto.csv' })
    assert.strictEqual(res.valido, false)
    assert.strictEqual(res.motivoRechazo, 'archivo_binario')
  })

  test('Binarios: Detección de caracteres de control no imprimibles en el cuerpo', () => {
    const textoConControles = 'tiempo,ir,rojo\n0.00,24000,18000\n0.02,\x01\x02\x03,18200\n0.04,25100,18500\n0.06,25800,18900\n0.08,25200,18400'
    const resBin = detectarArchivoBinario(textoConControles)
    assert.strictEqual(resBin.esBinario, true, 'Debe detectar bytes de control 0x01-0x03')

    const res = validarLimitesArchivoCsv(textoConControles, { nombreArchivo: 'controles.csv' })
    assert.strictEqual(res.valido, false)
    assert.strictEqual(res.motivoRechazo, 'archivo_binario')
  })

  // --------------------------------------------------------------------------
  console.log('\n--- 4. Detección de Fórmulas Peligrosas (=, +, -, @) ---')
  // --------------------------------------------------------------------------

  test('Fórmulas: Detecta fórmulas que empiezan con = (ej: =cmd|\' /C calc\'!A0, =SUM)', () => {
    const formula1 = detectarFormulaCsv("=cmd|' /C calc'!A0")
    assert.strictEqual(formula1.esFormula, true)
    assert.strictEqual(formula1.caracter, '=')

    const formula2 = detectarFormulaCsv('=1+1')
    assert.strictEqual(formula2.esFormula, true)

    const formula3 = detectarFormulaCsv('"=SUM(A1:A10)"')
    assert.strictEqual(formula3.esFormula, true)
  })

  test('Fórmulas: Detecta fórmulas que empiezan con @ (ej: @SUM(1+2))', () => {
    const formula = detectarFormulaCsv("@SUM(1+2)*cmd|' /C calc'!A0")
    assert.strictEqual(formula.esFormula, true)
    assert.strictEqual(formula.caracter, '@')
  })

  test('Fórmulas: Detecta fórmulas y comandos que empiezan con + (ej: +cmd|\' /C notepad\'!A0)', () => {
    const formula = detectarFormulaCsv("+cmd|' /C notepad'!A0")
    assert.strictEqual(formula.esFormula, true)
    assert.strictEqual(formula.caracter, '+')

    const formulaExpr = detectarFormulaCsv('+A1+B1')
    assert.strictEqual(formulaExpr.esFormula, true)
  })

  test('Fórmulas: Detecta fórmulas y comandos que empiezan con - (ej: -cmd|\' /C dir\'!A0, -2+cmd|...)', () => {
    const formula = detectarFormulaCsv("-cmd|' /C dir'!A0")
    assert.strictEqual(formula.esFormula, true)
    assert.strictEqual(formula.caracter, '-')

    const formulaCompuesta = detectarFormulaCsv('-2+cmd|A0')
    assert.strictEqual(formulaCompuesta.esFormula, true)
  })

  test('Fórmulas: NO genera falsos positivos con números negativos legítimos (-0.5, -42, -0.025)', () => {
    const numNeg1 = detectarFormulaCsv('-0.5')
    assert.strictEqual(numNeg1.esFormula, false, '-0.5 no debe ser detectado como fórmula')

    const numNeg2 = detectarFormulaCsv('-42')
    assert.strictEqual(numNeg2.esFormula, false, '-42 no debe ser detectado como fórmula')

    const numNeg3 = detectarFormulaCsv('-12.450')
    assert.strictEqual(numNeg3.esFormula, false, '-12.450 no debe ser detectado como fórmula')

    const numNegComa = detectarFormulaCsv('-0,75')
    assert.strictEqual(numNegComa.esFormula, false, '-0,75 con coma decimal no debe ser fórmula')
  })

  test('Fórmulas: NO genera falsos positivos con números positivos con signo explícito (+72.5, +100)', () => {
    const numPos1 = detectarFormulaCsv('+72.5')
    assert.strictEqual(numPos1.esFormula, false, '+72.5 no debe ser detectado como fórmula')

    const numPos2 = detectarFormulaCsv('+100')
    assert.strictEqual(numPos2.esFormula, false, '+100 no debe ser detectado como fórmula')
  })

  // --------------------------------------------------------------------------
  console.log('\n--- 5. Criterio de Aceptación: Rechazo Antes de Procesarse ---')
  // --------------------------------------------------------------------------

  test('Criterio: CSV con fórmula que empieza con = en cabecera se rechaza antes de procesarse', () => {
    const csvConFormulaHeader = `=cmd|' /C notepad'!A0,ir,rojo
0.00,24000,18000
0.02,24500,18200
0.04,25100,18500
0.06,25800,18900
0.08,25200,18400`

    const res = validarLimitesArchivoCsv(csvConFormulaHeader, { nombreArchivo: 'ataque_header.csv' })
    assert.strictEqual(res.valido, false, 'El archivo debe ser rechazado')
    assert.strictEqual(res.motivoRechazo, 'formula_detectada')
    assert(res.error.includes('fórmula potencialmente peligrosa'), 'Debe advertir sobre la fórmula detectada')
    assert.strictEqual(res.detalle.fila, 1, 'Debe identificar la fila 1')
  })

  test('Criterio: CSV con fórmula que empieza con @ en celda se rechaza antes de procesarse', () => {
    const csvConFormulaData = `tiempo,ir,rojo
0.00,24000,18000
0.02,24500,18200
0.04,@SUM(1+2)*cmd|' /C calc'!A0,18500
0.06,25800,18900
0.08,25200,18400`

    const res = validarLimitesArchivoCsv(csvConFormulaData, { nombreArchivo: 'ataque_data.csv' })
    assert.strictEqual(res.valido, false, 'El archivo debe ser rechazado')
    assert.strictEqual(res.motivoRechazo, 'formula_detectada')
    assert.strictEqual(res.detalle.fila, 4, 'Debe identificar la fila 4')
  })

  test('Criterio: CSV con fórmula que empieza con + o - en celda se rechaza antes de procesarse', () => {
    const csvConFormulaPlus = `tiempo,ir,rojo
0.00,24000,18000
0.02,24500,18200
0.04,+cmd|' /C calc'!A0,18500
0.06,25800,18900
0.08,25200,18400`

    const resPlus = validarLimitesArchivoCsv(csvConFormulaPlus, { nombreArchivo: 'ataque_plus.csv' })
    assert.strictEqual(resPlus.valido, false)
    assert.strictEqual(resPlus.motivoRechazo, 'formula_detectada')

    const csvConFormulaMinus = `tiempo,ir,rojo
0.00,24000,18000
0.02,24500,18200
0.04,-cmd|' /C calc'!A0,18500
0.06,25800,18900
0.08,25200,18400`

    const resMinus = validarLimitesArchivoCsv(csvConFormulaMinus, { nombreArchivo: 'ataque_minus.csv' })
    assert.strictEqual(resMinus.valido, false)
    assert.strictEqual(resMinus.motivoRechazo, 'formula_detectada')
  })

  test('Criterio: CSV legítimo con valores válidos se acepta y no se rechaza', () => {
    const csvLegitimo = `tiempo,ir,rojo
0.00,24000,18000
0.02,24500,18200
0.04,25100,18500
0.06,25800,18900
0.08,25200,18400`

    const res = validarLimitesArchivoCsv(csvLegitimo, { nombreArchivo: 'bioseñal_paciente.csv' })
    assert.strictEqual(res.valido, true, 'El CSV legítimo debe ser aceptado')
    assert.strictEqual(res.totalFilas, 6)
    assert.strictEqual(res.delimitador, ',')
  })

  // --------------------------------------------------------------------------
  console.log('\n--- 6. Integración con senalesService y CargaSenalesCard ---')
  // --------------------------------------------------------------------------

  test('senalesService.cargarDesdeCsv rechaza archivos con fórmulas antes de procesarlos (RF66)', () => {
    const csvConFormula = `tiempo,ir,rojo
0.00,24000,18000
0.02,=cmd|' /C calc'!A0,18200
0.04,25100,18500
0.06,25800,18900
0.08,25200,18400`

    const res = senalesService.cargarDesdeCsv(csvConFormula, 'ataque.csv')
    assert.strictEqual(res.valido, false, 'senalesService debe rechazar el archivo antes de procesarlo')
    assert.strictEqual(res.rf66, 'rechazado')
    assert.strictEqual(res.motivoRechazo, 'formula_detectada')
    // No debe haber procesado muestras ni calculado BPM
    assert.strictEqual(res.muestrasIr, undefined)
    assert.strictEqual(res.bpmEstimado, undefined)
  })

  test('senalesService.cargarDesdeCsv procesa exitosamente un CSV legítimo dentro de los límites', () => {
    const csvLegitimo = `tiempo,ir,rojo
0.00,24000,18000
0.02,24500,18200
0.04,25100,18500
0.06,25800,18900
0.08,25200,18400
0.10,24600,18100`

    const res = senalesService.cargarDesdeCsv(csvLegitimo, 'senal_valida.csv')
    assert.strictEqual(res.valido, true, 'senalesService debe aprobar el archivo válido')
    assert.strictEqual(res.origen, 'csv')
    assert.strictEqual(res.totalMuestras, 6)
    assert(Array.isArray(res.muestrasIr) && res.muestrasIr.length === 6)
    assert(typeof res.bpmEstimado === 'number')
  })

  test('CargaSenalesCard.vue: Configura accept=".csv,text/csv" y restringe a tipo .csv', () => {
    const cardPath = path.join(ROOT, 'src', 'components', 'CargaSenalesCard.vue')
    const cardCode = fs.readFileSync(cardPath, 'utf8')

    assert(cardCode.includes('accept=".csv,text/csv"'), 'file input debe restringirse a .csv y text/csv')
    assert(!cardCode.includes('text/plain"'), 'No debe permitir text/plain para evitar otros tipos')
    assert(cardCode.includes('validarMetadatosArchivoCsv'), 'Debe usar validarMetadatosArchivoCsv')
    assert(cardCode.includes('RF66'), 'Debe referenciar la validación de límites RF66')
  })

  // --------------------------------------------------------------------------
  console.log('\n================================================================')
  console.log(`  RESUMEN DE PRUEBAS RF66:`)
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
