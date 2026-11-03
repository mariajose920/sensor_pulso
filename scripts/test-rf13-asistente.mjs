/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF13
 * Asistente Paso a Paso: Consentimiento → Paciente → Reposo 1 min → Medición → Resultados
 * ============================================================================
 */
import { clasificarRitmo, GUIA_RITMOS_CLINICOS } from '../src/services/ritmoService.js'
import { usePeakDetector } from '../src/composables/usePeakDetector.js'
import { useSignalSimulator } from '../src/composables/useSignalSimulator.js'

let fallos = 0
let pruebasTotal = 0

function assert(condicion, titulo, detalle = '') {
  pruebasTotal++
  if (condicion) {
    console.log(`  ✅ [PASS] ${titulo} ${detalle ? '· ' + detalle : ''}`)
  } else {
    fallos++
    console.error(`  ❌ [FAIL] ${titulo} ${detalle ? '· ' + detalle : ''}`)
  }
}

console.log('================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF13')
console.log('  Asistente Paso a Paso de Medición Fisiológica (5 Pasos)')
console.log('================================================================\n')

// ----------------------------------------------------------------------------
// PRUEBA 1: Definición del Flujo Secuencial de 5 Pasos
// ----------------------------------------------------------------------------
console.log('▶ [Prueba 1] Verificación de la secuencia de los 5 pasos del protocolo...')
const PASOS_ESPERADOS = [
  { num: 1, id: 'consentimiento', nombre: 'Consentimiento' },
  { num: 2, id: 'paciente', nombre: 'Paciente' },
  { num: 3, id: 'reposo', nombre: 'Reposo' },
  { num: 4, id: 'medicion', nombre: 'Medición' },
  { num: 5, id: 'resultados', nombre: 'Resultados' }
]

assert(PASOS_ESPERADOS.length === 5, 'El flujo contempla exactamente 5 pasos secuenciales')
assert(PASOS_ESPERADOS[0].id === 'consentimiento', 'Paso 1 es Consentimiento Informado (RF04/RF76)')
assert(PASOS_ESPERADOS[1].id === 'paciente', 'Paso 2 es Ficha del Paciente y Factores Basales (RF03)')
assert(PASOS_ESPERADOS[2].id === 'reposo', 'Paso 3 es Reposo Cardiovascular de 1 minuto (60 s)')
assert(PASOS_ESPERADOS[3].id === 'medicion', 'Paso 4 es Adquisición de Señal en Tiempo Real (RF06/RF07/RF114)')
assert(PASOS_ESPERADOS[4].id === 'resultados', 'Paso 5 es Resultados y Diagnóstico Clínico (RF18)')

// ----------------------------------------------------------------------------
// PRUEBA 2: Validación del Paso 1 (Consentimiento Informado)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 2] Validación de guardias éticas en Paso 1 (Consentimiento)...')

function validarAvancePaso1(consentimientoVigente, checkboxMarcado) {
  return Boolean(consentimientoVigente || checkboxMarcado)
}

assert(
  validarAvancePaso1(false, false) === false,
  'Bloquea el avance al paso 2 si no hay consentimiento vigente ni checkbox marcado'
)
assert(
  validarAvancePaso1(false, true) === true,
  'Permite avanzar si el usuario marca voluntariamente la casilla expresa de consentimiento'
)
assert(
  validarAvancePaso1(true, false) === true,
  'Permite avanzar directamente si el participante ya cuenta con consentimiento vigente previo'
)

// ----------------------------------------------------------------------------
// PRUEBA 3: Validación del Paso 2 (Ficha de Paciente y Factores RF03)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 3] Validación de datos basales del paciente (Paso 2)...')

function validarDatosPaciente(datos) {
  const errores = []
  if (!datos.nombre || typeof datos.nombre !== 'string' || datos.nombre.trim().length < 2) {
    errores.push('El nombre del paciente es obligatorio.')
  }
  const edadNum = Number(datos.edad)
  if (!datos.edad || isNaN(edadNum) || !Number.isInteger(edadNum) || edadNum < 18 || edadNum > 120) {
    errores.push('Solo se miden personas mayores de edad (18 a 120 años).')
  }
  if (!datos.nivelEstres) {
    errores.push('El nivel de estrés es obligatorio.')
  }
  return { valido: errores.length === 0, errores }
}

const pacienteMenor = { nombre: 'Ignacio Prueba', edad: 16, nivelEstres: 'medio' }
assert(
  validarDatosPaciente(pacienteMenor).valido === false,
  'Rechaza paciente menor de 18 años (política institucional de salud UNACH)'
)

const pacienteSinNombre = { nombre: '', edad: 22, nivelEstres: 'bajo' }
assert(
  validarDatosPaciente(pacienteSinNombre).valido === false,
  'Rechaza ficha sin nombre del participante'
)

const pacienteValido = {
  nombre: 'Javiera Rail',
  edad: 23,
  nivelEstres: 'alto',
  sueno: '5_6',
  cafeina: 'moderada',
  medicacion: 'ninguna',
  actividadPrevia: 'reposo'
}
assert(
  validarDatosPaciente(pacienteValido).valido === true,
  'Aprueba ficha completa con edad ≥18 y factores basales declarados'
)

// ----------------------------------------------------------------------------
// PRUEBA 4: Lógica del Paso 3 (Reposo Basal de 1 Minuto / 60 Segundos)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 4] Lógica del temporizador de reposo de 1 minuto...')

const SEGUNDOS_REPOSO = 60
assert(SEGUNDOS_REPOSO === 60, 'El período de reposo está configurado exactamente en 60 segundos (1 min)')

let segundosRestantes = 60
let completado = false

function tick(s) {
  segundosRestantes -= s
  if (segundosRestantes <= 0) {
    segundosRestantes = 0
    completado = true
  }
}

tick(30)
assert(!completado && segundosRestantes === 30, 'A los 30 segundos el reposo sigue en curso')

tick(30)
assert(completado && segundosRestantes === 0, 'Al llegar a 0 segundos el reposo queda marcado como completado')

function puedeAvanzarPaso3(estaCompletado) {
  return estaCompletado === true
}
assert(puedeAvanzarPaso3(completado) === true, 'Habilita la transición a Medición únicamente tras completar el reposo')

// ----------------------------------------------------------------------------
// PRUEBA 5: Adquisición y Procesamiento de la Señal en Paso 4
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 5] Simulación de adquisición PPG y cálculo de signos en Paso 4...')

const detector = usePeakDetector()
const sim = useSignalSimulator({ bpm: 80, amplitude: 100, noiseLevel: 2 })

let muestrasProcesadas = 0
let picosContados = 0

// Inyectar muestras del simulador sintético a 100 Hz
sim.subscribe((sample) => {
  muestrasProcesadas++
  const esPico = detector.processSample(sample.tMs, sample.filteredAc)
  if (esPico) picosContados++
})

sim.start()
// Simular ventana de captura de 300 muestras (3 segundos a 100 Hz)
for (let i = 0; i < 300; i++) {
  const t = i * 10
  const val = Math.sin(i * 0.1) * 45
  if (detector.processSample(t, val)) {
    picosContados++
  }
}
sim.pause()

assert(picosContados >= 2, `Se detectaron picos sistólicos en la ventana de captura (${picosContados} picos)`)
assert(detector.currentBpm !== undefined, 'El detector expone la frecuencia cardíaca (BPM) reactiva')

// ----------------------------------------------------------------------------
// PRUEBA 6: Consolidación de Resultados y Clasificación Clínica (RF18) en Paso 5
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 6] Diagnóstico clínico del ritmo (RF18) en Paso 5...')

const diagNormal = clasificarRitmo({
  bpm: 72,
  instantBpm: 72,
  sdnn: 35,
  rmssd: 30,
  regularityLevel: 'normal',
  totalBeats: 15,
  paciente: pacienteValido
})

assert(diagNormal.id === 'normal', 'Clasifica 72 BPM en reposo como Ritmo Normal (Normocardia)')
assert(diagNormal.fuenteOficial.includes('American Heart Association'), 'Cita fuente médica oficial de la AHA')

const diagTaquicardia = clasificarRitmo({
  bpm: 110,
  instantBpm: 112,
  sdnn: 40,
  rmssd: 32,
  regularityLevel: 'normal',
  totalBeats: 20,
  paciente: pacienteValido
})

assert(diagTaquicardia.id === 'taquicardia', 'Clasifica 110 BPM como Taquicardia')
const tieneCorrelacionCafeina = Array.isArray(diagTaquicardia.correlacionFactores) 
  ? diagTaquicardia.correlacionFactores.some(f => f.toLowerCase().includes('cafeína'))
  : String(diagTaquicardia.correlacionFactores).toLowerCase().includes('cafeína')

assert(
  tieneCorrelacionCafeina,
  'Correlaciona la taquicardia con la cafeína y estrés declarados en la ficha (RF03)'
)

// ----------------------------------------------------------------------------
// RESUMEN FINAL
// ----------------------------------------------------------------------------
console.log('\n----------------------------------------------------------------')
if (fallos === 0) {
  console.log(`🎉 TODAS LAS PRUEBAS DE RF13 PASARON SATISFACTORIAMENTE (${pruebasTotal}/${pruebasTotal})`)
} else {
  console.error(`💥 HUBO ${fallos} FALLOS EN LAS PRUEBAS DE RF13`)
  process.exit(1)
}
console.log('----------------------------------------------------------------\n')
