/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF20
 * Requerimiento: Comparar el valor con el rango e indicar si está dentro o fuera
 * ============================================================================
 */
import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

import {
  obtenerRangoReferencia,
  evaluarComparacionRango
} from '../src/utils/comparacionRangos.js'
import { construirMedicion } from '../src/utils/medicion.js'

let passed = 0
let failed = 0

function it(description, fn) {
  try {
    fn()
    console.log(`  ✅ [PASS] ${description}`)
    passed++
  } catch (err) {
    console.error(`  ❌ [FAIL] ${description}`)
    console.error(`     Error: ${err.message}\n`)
    failed++
  }
}

console.log('\n================================================================')
console.log('  sensor_pulso · Pruebas Automatizadas de RF20')
console.log('  Comparación Cuantitativa y Cualitativa con Rangos Fisiológicos')
console.log('================================================================\n')

// ----------------------------------------------------------------------------
// PRUEBA 1: RANGOS DE REFERENCIA FISIOLÓGICOS (AHA)
// ----------------------------------------------------------------------------
console.log('▶ [Prueba 1] Rangos de Referencia según Edad y Actividad (AHA)...')

it('Retorna 60-100 BPM y SpO2 >= 95% para adulto estándar en reposo basal', () => {
  const r = obtenerRangoReferencia(25, 'reposo')
  assert.strictEqual(r.bpm_min, 60)
  assert.strictEqual(r.bpm_max, 100)
  assert.strictEqual(r.spo2_min, 95)
})

it('Ajusta el rango para actividad física de caminata o movimiento (75-120 BPM)', () => {
  const r = obtenerRangoReferencia(25, 'caminata')
  assert.strictEqual(r.bpm_min, 75)
  assert.strictEqual(r.bpm_max, 120)
})

it('Ajusta el rango para ejercicio moderado (90-150 BPM)', () => {
  const r = obtenerRangoReferencia(30, 'ejercicio')
  assert.strictEqual(r.bpm_min, 90)
  assert.strictEqual(r.bpm_max, 150)
})

it('Ajusta el rango basal para adultos mayores de 65 años (58-95 BPM)', () => {
  const r = obtenerRangoReferencia(70, 'reposo')
  assert.strictEqual(r.bpm_min, 58)
  assert.strictEqual(r.bpm_max, 95)
})

// ----------------------------------------------------------------------------
// PRUEBA 2: EVALUACIÓN DE VALORES "DENTRO DE RANGO" (NORMOFrecuencia y Normoxemia)
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 2] Identificación Correcta de Valores Dentro de Rango...')

it('Certifica dentro de rango para valores fisiológicos típicos (72 BPM, 98% SpO2 en reposo)', () => {
  const res = evaluarComparacionRango({ bpm: 72, spo2: 98, edad: 25, actividad: 'reposo' })
  assert.strictEqual(res.dentroDeRango, true)
  assert.strictEqual(res.estadoGlobal, 'dentro')
  assert.strictEqual(res.etiquetaGlobal, 'Dentro de rango')
  assert.strictEqual(res.bpm.dentro, true)
  assert.strictEqual(res.bpm.estado, 'dentro')
  assert.strictEqual(res.spo2.dentro, true)
  assert.strictEqual(res.spo2.estado, 'dentro')
})

it('Certifica dentro de rango exactamente en el borde inferior (60 BPM en reposo)', () => {
  const res = evaluarComparacionRango({ bpm: 60, spo2: 96, edad: 25, actividad: 'reposo' })
  assert.strictEqual(res.dentroDeRango, true)
  assert.strictEqual(res.bpm.dentro, true)
})

it('Certifica dentro de rango exactamente en el borde superior (100 BPM en reposo)', () => {
  const res = evaluarComparacionRango({ bpm: 100, spo2: 99, edad: 25, actividad: 'reposo' })
  assert.strictEqual(res.dentroDeRango, true)
  assert.strictEqual(res.bpm.dentro, true)
})

it('Certifica dentro de rango exactamente en el umbral normoxémico de SpO2 (95%)', () => {
  const res = evaluarComparacionRango({ bpm: 75, spo2: 95, edad: 25, actividad: 'reposo' })
  assert.strictEqual(res.dentroDeRango, true)
  assert.strictEqual(res.spo2.dentro, true)
})

// ----------------------------------------------------------------------------
// PRUEBA 3: EVALUACIÓN DE VALORES "FUERA DE RANGO" Y CUANTIFICACIÓN
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 3] Detección de Valores Fuera de Rango y Desviaciones...')

it('Detecta frecuencia elevada (Taquicardia en reposo: 114 BPM > 100 BPM)', () => {
  const res = evaluarComparacionRango({ bpm: 114, spo2: 98, edad: 25, actividad: 'reposo' })
  assert.strictEqual(res.dentroDeRango, false)
  assert.strictEqual(res.estadoGlobal, 'fuera')
  assert.strictEqual(res.bpm.dentro, false)
  assert.strictEqual(res.bpm.estado, 'alto')
  assert.strictEqual(res.bpm.diferencia, 14)
  assert.ok(res.bpm.diagnostico.includes('+14 BPM'))
})

it('Detecta frecuencia reducida (Bradicardia en reposo: 52 BPM < 60 BPM)', () => {
  const res = evaluarComparacionRango({ bpm: 52, spo2: 98, edad: 25, actividad: 'reposo' })
  assert.strictEqual(res.dentroDeRango, false)
  assert.strictEqual(res.bpm.dentro, false)
  assert.strictEqual(res.bpm.estado, 'bajo')
  assert.strictEqual(res.bpm.diferencia, -8)
  assert.ok(res.bpm.diagnostico.includes('8 BPM bajo el límite inferior'))
})

it('Detecta desaturación / hipoxia (SpO2 91% < 95% normoxémico)', () => {
  const res = evaluarComparacionRango({ bpm: 72, spo2: 91, edad: 25, actividad: 'reposo' })
  assert.strictEqual(res.dentroDeRango, false)
  assert.strictEqual(res.spo2.dentro, false)
  assert.strictEqual(res.spo2.estado, 'bajo')
  assert.strictEqual(res.spo2.diferencia, 4)
  assert.ok(res.spo2.diagnostico.includes('4% bajo el mínimo'))
})

it('Detecta ambos biomarcadores fuera de rango y sintetiza el motivo clínico', () => {
  const res = evaluarComparacionRango({ bpm: 120, spo2: 89, edad: 25, actividad: 'reposo' })
  assert.strictEqual(res.dentroDeRango, false)
  assert.strictEqual(res.bpm.dentro, false)
  assert.strictEqual(res.spo2.dentro, false)
  assert.ok(res.resumenClinico.includes('fuera del rango de referencia'))
})

// ----------------------------------------------------------------------------
// PRUEBA 4: APLICACIÓN DE RANGOS PERSONALIZADOS DE BASE DE DATOS
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 4] Soporte para Rangos Personalizados de Base de Datos...')

it('Respeta rangos personalizados asignados por profesores o administradores', () => {
  const rangoBD = {
    bpm_min: 50,
    bpm_max: 85,
    spo2_min: 93,
    spo2_max: 100,
    descripcion: 'Rango atlético personalizado'
  }
  // 52 BPM estaba fuera en el rango estándar (60-100), pero está DENTRO en este rango (50-85)
  const res = evaluarComparacionRango({ bpm: 52, spo2: 94, rango: rangoBD })
  assert.strictEqual(res.dentroDeRango, true)
  assert.strictEqual(res.bpm.min, 50)
  assert.strictEqual(res.bpm.max, 85)
})

// ----------------------------------------------------------------------------
// PRUEBA 5: PERSISTENCIA EN BASE DE DATOS Y CONSTRUCCIÓN DE MEDICIÓN
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 5] Persistencia del Campo dentro_de_rango en Supabase...')

it('construirMedicion incluye dentro_de_rango: true cuando es conforme', () => {
  const armada = construirMedicion({
    usuarioId: '11111111-1111-1111-1111-111111111111',
    fuente: 'sensor',
    bpm: 72,
    spo2: 98,
    dentroDeRango: true
  })
  assert.strictEqual(armada.ok, true)
  assert.strictEqual(armada.fila.dentro_de_rango, true)
})

it('construirMedicion incluye dentro_de_rango: false cuando está desviado', () => {
  const armada = construirMedicion({
    usuarioId: '11111111-1111-1111-1111-111111111111',
    fuente: 'sensor',
    bpm: 118,
    spo2: 94,
    dentroDeRango: false
  })
  assert.strictEqual(armada.ok, true)
  assert.strictEqual(armada.fila.dentro_de_rango, false)
})

// ----------------------------------------------------------------------------
// PRUEBA 6: ARQUITECTURA DE COMPONENTES Y LIMPIEZA DE ETIQUETAS
// ----------------------------------------------------------------------------
console.log('\n▶ [Prueba 6] Verificación de Componentes y Limpieza de UI...')

it('El componente ComparadorRangoCard.vue existe y contiene la escala continua', () => {
  const compPath = path.resolve('src/components/ComparadorRangoCard.vue')
  assert.ok(fs.existsSync(compPath), 'ComparadorRangoCard.vue debe existir')
  const content = fs.readFileSync(compPath, 'utf8')
  assert.ok(content.includes('scale-track'), 'Debe contener la pista de escala continua')
  assert.ok(content.includes('scale-pin'), 'Debe contener el marcador visual dinámico')
  assert.ok(content.includes('evaluacion.dentroDeRango'), 'Debe ligarse a la evaluación reactiva')
})

it('MedicionView.vue integra ComparadorRangoCard en Paso 4 y Paso 5', () => {
  const viewPath = path.resolve('src/views/MedicionView.vue')
  const content = fs.readFileSync(viewPath, 'utf8')
  assert.ok(content.includes('import ComparadorRangoCard'), 'Debe importar ComparadorRangoCard')
  assert.ok(content.includes('<ComparadorRangoCard'), 'Debe renderizar ComparadorRangoCard en template')
  assert.ok(content.includes('evalRangoFinal'), 'Debe calcular la comparación al consolidar')
})

it('RangosPanel.vue incluye el simulador y comparador interactivo', () => {
  const panelPath = path.resolve('src/components/RangosPanel.vue')
  const content = fs.readFileSync(panelPath, 'utf8')
  assert.ok(content.includes('interactive-tester-box'), 'Debe contener la caja del simulador')
  assert.ok(content.includes('resultadoSimulacion'), 'Debe calcular la simulación en tiempo real')
})

it('No contiene textos técnicos ni sufijos visibles "(RF20)" en botones o chips del usuario', () => {
  const compContent = fs.readFileSync('src/components/ComparadorRangoCard.vue', 'utf8')
  assert.ok(!compContent.includes('(RF20)'), 'No debe mostrar (RF20) en ComparadorRangoCard')
  const panelContent = fs.readFileSync('src/components/RangosPanel.vue', 'utf8')
  assert.ok(!panelContent.includes('(RF20)'), 'No debe mostrar (RF20) en la UI de RangosPanel')
})

// ----------------------------------------------------------------------------
// RESUMEN FINAL
// ----------------------------------------------------------------------------
console.log('\n----------------------------------------------------------------')
if (failed === 0) {
  console.log(`✅ TODAS LAS PRUEBAS APROBADAS: ${passed} pasadas de ${passed} totales.`)
  process.exit(0)
} else {
  console.error(`❌ ALGUNAS PRUEBAS FALLARON: ${failed} fallidas, ${passed} aprobadas.`)
  process.exit(1)
}
