// RF105 · Prueba de creación de evaluaciones (desde cero y desde precargadas).
// Uso: node scripts/test-rf105-crear-evaluacion.mjs
import { readFileSync } from 'node:fs'
import {
  EVALUACIONES_PRECARGADAS,
  obtenerEvaluacionesPrecargadas,
  crearEvaluacion,
  duplicarEvaluacion,
  obtenerEvaluacionesAula
} from '../src/services/evaluacionesService.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}

console.log('\n--- Pruebas de RF105: Crear Evaluación y Usar Precargadas ---')

// 1. Validar siembra de evaluaciones precargadas
marcar(Array.isArray(EVALUACIONES_PRECARGADAS) && EVALUACIONES_PRECARGADAS.length >= 4, 
  'Existen al menos 4 evaluaciones precargadas sembradas en el sistema')

const tiposValidos = ['preguntas', 'ejercicio_aplicado']
const todosTiposOk = EVALUACIONES_PRECARGADAS.every(p => tiposValidos.includes(p.tipo) && p.titulo && p.precargada === true)
marcar(todosTiposOk, 'Todas las evaluaciones precargadas tienen tipo válido y bandera precargada = true')

const conPreguntas = EVALUACIONES_PRECARGADAS.every(p => Array.isArray(p.preguntas) && p.preguntas.length > 0)
marcar(conPreguntas, 'Todas las plantillas precargadas incluyen preguntas y alternativas')

// 2. Probar función obtenerEvaluacionesPrecargadas
const resPrecargadas = await obtenerEvaluacionesPrecargadas()
marcar(resPrecargadas.success && resPrecargadas.data.length >= 4, 
  'obtenerEvaluacionesPrecargadas devuelve la lista completa de plantillas')

// 3. Crear evaluación desde cero (Criterio de aceptación 1 y 2)
const resCero = await crearEvaluacion({
  aulaId: 'aula-test-01',
  creadorId: '00000000-0000-0000-0000-000000000001',
  titulo: 'Evaluación Creada Desde Cero',
  descripcion: 'Prueba de creación manual',
  modelo: { tipo: 'preguntas', ejercicio: null, criterio: null },
  preguntas: [
    {
      enunciado: '¿Pregunta manual de prueba?',
      tipo: 'opcion_multiple',
      opciones: [{ id: 'a', texto: 'Opción A' }, { id: 'b', texto: 'Opción B' }],
      puntaje: 15
    }
  ],
  puedeGestionar: true
})
marcar(resCero.success && resCero.data.titulo === 'Evaluación Creada Desde Cero', 
  'Se puede crear una evaluación desde cero con su tipo y preguntas')

// 4. Crear evaluación a partir de una precargada / Duplicar (Criterio de aceptación 2)
const resDuplicada = await duplicarEvaluacion({
  evaluacionOriginalId: 'precargada-01',
  aulaId: 'aula-test-01',
  creadorId: '00000000-0000-0000-0000-000000000001',
  puedeGestionar: true
})
marcar(resDuplicada.success && resDuplicada.data.titulo.includes('Medición de Pulso'), 
  'Se puede crear una evaluación a partir de una plantilla precargada')
marcar(resDuplicada.data.modelo?.tipo === 'ejercicio_aplicado' || resDuplicada.data.tipo === 'ejercicio_aplicado', 
  'La evaluación clonada conserva su tipo de ejercicio y criterios de calificación')

// 5. Validar que la tabla evaluaciones tiene RLS en la migración oficial (Criterio 3)
const sql = readFileSync(new URL('../supabase/migrations/20261027000500_evaluaciones.sql', import.meta.url), 'utf8')
marcar(sql.includes('alter table public.evaluaciones enable row level security;'), 
  'La tabla evaluaciones tiene Row Level Security (RLS) habilitado')
marcar(sql.includes('create policy evaluaciones_crear on public.evaluaciones'), 
  'La tabla evaluaciones cuenta con política RLS para creación por profesor')

console.log(`\nResultado: ${fallos === 0 ? '✓ TODOS LOS TESTS PASARON' : `✖ ${fallos} fallos`}\n`)
process.exit(fallos === 0 ? 0 : 1)
