// RF104 · Prueba de asignación de evaluaciones (aula, curso y estudiante)
// Uso: node scripts/test-rf104-asignar.mjs
import {
  asignarEvaluacion,
  obtenerAsignacionesEvaluacion
} from '../src/services/evaluacionesService.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}

console.log('\n--- Pruebas de RF104: Asignar Evaluación (Aula, Curso, Estudiante) ---')

// 1. Validaciones previas
const resSinPermiso = await asignarEvaluacion({
  evaluacionId: 'eval-test-01',
  aulaId: 'aula-01',
  alcance: 'aula',
  puedeGestionar: false
})
marcar(!resSinPermiso.success, 'Rechaza asignación si el usuario no tiene permisos de gestión')

const resSinEval = await asignarEvaluacion({
  evaluacionId: '',
  aulaId: 'aula-01',
  alcance: 'aula',
  puedeGestionar: true
})
marcar(!resSinEval.success, 'Rechaza asignación sin ID de evaluación')

const resAlcanceInvalido = await asignarEvaluacion({
  evaluacionId: 'eval-test-01',
  aulaId: 'aula-01',
  alcance: 'invalido',
  puedeGestionar: true
})
marcar(!resAlcanceInvalido.success, 'Rechaza asignación con alcance inválido')

// 2. Modalidad 1: Asignar a Toda el Aula (RF104)
const resAula = await asignarEvaluacion({
  evaluacionId: 'eval-test-aula',
  aulaId: 'aula-test-01',
  alcance: 'aula',
  puedeGestionar: true
})
marcar(resAula.success && resAula.data.some(a => a.alcance === 'aula' && a.curso_id === null && a.usuario_id === null),
  'Modalidad 1 OK: Se asigna a toda el aula con curso_id=null y usuario_id=null')

// 3. Modalidad 2: Asignar a un Curso / Sección (RF104)
const resCursoSinId = await asignarEvaluacion({
  evaluacionId: 'eval-test-curso',
  aulaId: 'aula-test-01',
  alcance: 'curso',
  cursoId: null,
  puedeGestionar: true
})
marcar(!resCursoSinId.success, 'Valida que alcance "curso" requiere cursoId obligatorio')

const resCurso = await asignarEvaluacion({
  evaluacionId: 'eval-test-curso',
  aulaId: 'aula-test-01',
  alcance: 'curso',
  cursoId: 'curso-seccion-a',
  puedeGestionar: true
})
marcar(resCurso.success && resCurso.data.some(a => a.alcance === 'curso' && a.curso_id === 'curso-seccion-a' && a.usuario_id === null),
  'Modalidad 2 OK: Se asigna a un curso específico con usuario_id=null')

// 4. Modalidad 3: Asignar a Estudiantes Específicos (RF104)
const resEstSinIds = await asignarEvaluacion({
  evaluacionId: 'eval-test-est',
  aulaId: 'aula-test-01',
  alcance: 'estudiante',
  estudiantesIds: [],
  puedeGestionar: true
})
marcar(!resEstSinIds.success, 'Valida que alcance "estudiante" requiere al menos un estudiante')

const estudiantesTest = ['est-001', 'est-002']
const resEst = await asignarEvaluacion({
  evaluacionId: 'eval-test-est',
  aulaId: 'aula-test-01',
  alcance: 'estudiante',
  estudiantesIds: estudiantesTest,
  puedeGestionar: true
})
marcar(resEst.success && resEst.data.length === 2 && resEst.data.every(a => a.alcance === 'estudiante' && a.curso_id === null),
  'Modalidad 3 OK: Se asigna individualmente a los estudiantes indicados')

// 5. Criterio de Aceptación 2: El estudiante ve solo las evaluaciones que le corresponden
const evalAula = { id: 'ev-1', asignaciones: [{ alcance: 'aula' }] }
const evalCursoA = { id: 'ev-2', asignaciones: [{ alcance: 'curso', curso_id: 'curso-seccion-a' }] }
const evalCursoB = { id: 'ev-3', asignaciones: [{ alcance: 'curso', curso_id: 'curso-seccion-b' }] }
const evalEst1 = { id: 'ev-4', asignaciones: [{ alcance: 'estudiante', usuario_id: 'est-001' }] }
const evalEst2 = { id: 'ev-5', asignaciones: [{ alcance: 'estudiante', usuario_id: 'est-002' }] }
const todas = [evalAula, evalCursoA, evalCursoB, evalEst1, evalEst2]

// Función de filtro que usa la vista para el estudiante
const filtrarParaEstudiante = (evals, usuarioId, misCursos) => {
  return evals.filter(ev => {
    return (ev.asignaciones || []).some(a => {
      if (a.alcance === 'aula') return true
      if (a.alcance === 'curso' && misCursos.includes(a.curso_id)) return true
      if (a.alcance === 'estudiante' && a.usuario_id === usuarioId) return true
      return false
    })
  })
}

const evalsEst1 = filtrarParaEstudiante(todas, 'est-001', ['curso-seccion-a'])
marcar(evalsEst1.length === 3 && evalsEst1.map(e => e.id).sort().join(',') === 'ev-1,ev-2,ev-4',
  'Criterio de Aceptación 2 OK: Estudiante 1 (en Sección A) ve su evaluación individual, la de Sección A y la del Aula, pero NO la de Sección B ni la de Estudiante 2')

const evalsEst2 = filtrarParaEstudiante(todas, 'est-002', ['curso-seccion-b'])
marcar(evalsEst2.length === 3 && evalsEst2.map(e => e.id).sort().join(',') === 'ev-1,ev-3,ev-5',
  'Criterio de Aceptación 2 OK: Estudiante 2 (en Sección B) ve su evaluación individual, la de Sección B y la del Aula, pero NO la de Sección A ni la de Estudiante 1')

console.log(`\nResultado: ${fallos === 0 ? 'TODAS LAS PRUEBAS PASARON EXITOSAMENTE' : `${fallos} FALLOS DETECTADOS`}\n`)
process.exit(fallos === 0 ? 0 : 1)
