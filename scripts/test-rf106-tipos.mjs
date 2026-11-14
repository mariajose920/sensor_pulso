// RF106 · Prueba de los tipos de evaluación (tipo, ejercicio y criterio).
// Uso: node scripts/test-rf106-tipos.mjs
import { readFileSync } from 'node:fs'
import {
  TIPOS_EVALUACION, EJERCICIOS, modeloVacio, criterioPorDefecto, cambiarTipo, cambiarEjercicio,
  validarTipoEvaluacion, camposTipoParaGuardar, modeloDesdeFila, describirCriterio, etiquetaTipo,
  instruccionParaEstudiante
} from '../src/utils/tiposEvaluacion.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}
const lanza = (fn) => { try { fn(); return false } catch (_) { return true } }

// Los valores deben coincidir con los CHECK de la migración
const sql = readFileSync(new URL('../supabase/migrations/20261027000500_evaluaciones.sql', import.meta.url), 'utf8')
const lista = (re) => (sql.match(re)?.[1] || '').split(',').map((s) => s.trim().replace(/'/g, '')).sort().join(',')
// RF107: la migración 20261113000200 amplía el CHECK de tipo con 'mixta'
const sqlMixta = readFileSync(new URL('../supabase/migrations/20261113000200_rf107_evaluacion_mixta.sql', import.meta.url), 'utf8')
const tiposMixta = (sqlMixta.match(/evaluaciones_tipo_check check \(tipo in \(([^)]*)\)\)/)?.[1] || '').split(',').map((t) => t.trim().replace(/'/g, '')).sort().join(',')
marcar(tiposMixta === Object.keys(TIPOS_EVALUACION).sort().join(','),
  'Los tipos coinciden con el CHECK de la base (migración de la evaluación mixta)')
marcar(lista(/ejercicio\s+text check \(ejercicio in \(([^)]*)\)\)/) === Object.keys(EJERCICIOS).sort().join(','),
  'Los ejercicios coinciden con el CHECK de la base')
marcar(Object.values(EJERCICIOS).every((e) => sql.includes(`'${e.criterio}'`)),
  'Los criterios existen en calificar_ejercicio (RF107)')

// Estado inicial y cambios de tipo
marcar(validarTipoEvaluacion(modeloVacio()).length === 0, 'Una evaluación de preguntas vacía es válida')
marcar(validarTipoEvaluacion(null).length === 1, 'Sin modelo se pide elegir el tipo')
marcar(validarTipoEvaluacion({ tipo: 'otro' }).length === 1, 'Un tipo desconocido se rechaza')
const ejercicio = cambiarTipo(modeloVacio(), 'ejercicio_aplicado')
marcar(ejercicio.tipo === 'ejercicio_aplicado' && ejercicio.ejercicio === null, 'Al elegir ejercicio aplicado aún no hay ejercicio')
marcar(validarTipoEvaluacion(ejercicio).length === 1, 'Un ejercicio aplicado sin ejercicio se rechaza')
const vuelta = cambiarTipo(cambiarEjercicio(modeloVacio(), 'medir_pulso'), 'preguntas')
marcar(vuelta.ejercicio === null && vuelta.criterio === null, 'Volver a "Preguntas" limpia ejercicio y criterio')
marcar(validarTipoEvaluacion({ tipo: 'preguntas', ejercicio: 'medir_pulso', criterio: null }).length === 1, 'Preguntas con ejercicio se rechaza')

// Cada ejercicio queda válido con su criterio por defecto y cambia el formulario
for (const clave of Object.keys(EJERCICIOS)) {
  const m = cambiarEjercicio(modeloVacio(), clave)
  marcar(m.tipo === 'ejercicio_aplicado' && m.criterio?.tipo === EJERCICIOS[clave].criterio, `${clave}: criterio por defecto de tipo ${EJERCICIOS[clave].criterio}`)
  marcar(validarTipoEvaluacion(m).length === 0, `${clave}: válido con los valores por defecto`)
}
marcar(criterioPorDefecto('inventado') === null, 'Un ejercicio desconocido no tiene criterio')
marcar(cambiarEjercicio(modeloVacio(), 'inventado').ejercicio === null, 'Cambiar a un ejercicio desconocido lo deja sin elegir')

// Validaciones de rangos
const pulso = (min, max) => ({ tipo: 'ejercicio_aplicado', ejercicio: 'medir_pulso', criterio: { tipo: 'bpm_en_rango', min, max } })
marcar(validarTipoEvaluacion(pulso(60, 100)).length === 0, 'Pulso 60–100 es válido')
marcar(validarTipoEvaluacion(pulso(100, 60)).length === 1, 'Mínimo mayor que máximo se rechaza')
marcar(validarTipoEvaluacion(pulso(80, 80)).length === 1, 'Mínimo igual al máximo se rechaza')
marcar(validarTipoEvaluacion(pulso(10, 100)).length >= 1, 'BPM por debajo del límite se rechaza')
marcar(validarTipoEvaluacion(pulso(60, 300)).length >= 1, 'BPM por encima del límite se rechaza')
marcar(validarTipoEvaluacion(pulso('', 100)).length === 1, 'Mínimo vacío se rechaza')
marcar(validarTipoEvaluacion(pulso('abc', 100)).length === 1, 'Texto en lugar de número se rechaza')
const spo2 = (min, max) => ({ tipo: 'ejercicio_aplicado', ejercicio: 'medir_spo2', criterio: { tipo: 'spo2_en_rango', min, max } })
marcar(validarTipoEvaluacion(spo2(95, 100)).length === 0, 'SpO₂ 95–100 es válida')
marcar(validarTipoEvaluacion(spo2(95, 105)).length >= 1, 'SpO₂ por encima de 100 se rechaza')
marcar(validarTipoEvaluacion(spo2(50, 100)).length >= 1, 'SpO₂ por debajo del límite se rechaza')
const comparar = (valor) => ({ tipo: 'ejercicio_aplicado', ejercicio: 'comparar_senales', criterio: { tipo: 'similitud_minima', valor } })
marcar(validarTipoEvaluacion(comparar(70)).length === 0, 'Similitud 70 es válida')
marcar(validarTipoEvaluacion(comparar(0)).length === 1, 'Similitud 0 se rechaza')
marcar(validarTipoEvaluacion(comparar(101)).length === 1, 'Similitud mayor que 100 se rechaza')
marcar(validarTipoEvaluacion(comparar('')).length === 1, 'Similitud vacía se rechaza')
marcar(validarTipoEvaluacion({ tipo: 'ejercicio_aplicado', ejercicio: 'medir_pulso', criterio: { tipo: 'spo2_en_rango', min: 60, max: 100 } }).length === 1,
  'Un criterio que no corresponde al ejercicio se rechaza')

// Campos que se guardan
marcar(JSON.stringify(camposTipoParaGuardar(modeloVacio())) === JSON.stringify({ tipo: 'preguntas', ejercicio: null, criterio: null }),
  'Preguntas se guarda sin ejercicio ni criterio')
const guardado = camposTipoParaGuardar(pulso('60', '100'))
marcar(guardado.criterio.min === 60 && guardado.criterio.max === 100 && typeof guardado.criterio.min === 'number', 'Los números del criterio se guardan como números')
marcar(guardado.criterio.tipo === 'bpm_en_rango' && guardado.ejercicio === 'medir_pulso', 'El criterio de pulso es bpm_en_rango')
marcar(camposTipoParaGuardar(comparar('85')).criterio.valor === 85, 'La similitud se guarda como número')
marcar(lanza(() => camposTipoParaGuardar(pulso(100, 60))), 'No se arma un guardado con un modelo inválido')

// Lectura
marcar(modeloDesdeFila({ tipo: 'preguntas' }).ejercicio === null, 'Fila de preguntas da un modelo sin ejercicio')
marcar(modeloDesdeFila({ tipo: 'ejercicio_aplicado', ejercicio: 'medir_spo2', criterio: { tipo: 'spo2_en_rango', min: 94, max: 100 } }).criterio.min === 94,
  'Fila de ejercicio recupera el criterio')
marcar(modeloDesdeFila(null).tipo === 'preguntas', 'Sin fila se parte de preguntas')
marcar(describirCriterio('medir_pulso', { min: 60, max: 100 }) === 'BPM entre 60 y 100', 'Describe el criterio de pulso')
marcar(describirCriterio('medir_spo2', { min: 95, max: 100 }).includes('SpO₂'), 'Describe el criterio de SpO₂')
marcar(describirCriterio('comparar_senales', { valor: 70 }).includes('70'), 'Describe el criterio de similitud')
marcar(etiquetaTipo('preguntas') === 'Preguntas', 'Etiqueta de preguntas')
marcar(etiquetaTipo('ejercicio_aplicado', 'medir_pulso').includes('medir el pulso'), 'Etiqueta del ejercicio de pulso')
marcar(instruccionParaEstudiante('ejercicio_aplicado', 'medir_pulso').toLowerCase().includes('pulso'), 'El estudiante ve qué se le pide al medir el pulso')
marcar(instruccionParaEstudiante('preguntas').toLowerCase().includes('preguntas'), 'El estudiante ve qué se le pide en preguntas')

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1) }
console.log('\nRF106: todas las pruebas pasaron')
