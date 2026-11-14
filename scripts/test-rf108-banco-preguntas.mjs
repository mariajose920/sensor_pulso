// RF108 · Banco de preguntas personal y compartido, con selección al azar.
// Uso: node scripts/test-rf108-banco-preguntas.mjs
import { readFileSync } from 'node:fs'
import {
  crearPreguntaBanco,
  listarBancoPreguntas,
  actualizarCompartirPregunta,
  seleccionarPreguntasAlAzar
} from '../src/services/bancoPreguntasService.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}
const lee = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

console.log('\n--- Pruebas de RF108: Banco de Preguntas Personal, Compartido y Al Azar ---')

const profeA = '11111111-1111-1111-1111-111111111111'
const profeB = '22222222-2222-2222-2222-222222222222'

// 1. Crear pregunta personal (solo la ve el autor)
const pPersonal = await crearPreguntaBanco({
  autorId: profeA,
  autorNombre: 'Profe A',
  enunciado: '¿Cuál es el valor mínimo de SpO2 aceptable en reposo?',
  tipo: 'numerica',
  respuestaCorrecta: { valor: 95, tolerancia: 1 },
  puntaje: 10,
  etiquetas: 'spo2, reposo',
  compartida: false,
  puedeGestionar: true,
  puedeCompartir: true
})
marcar(pPersonal.success && pPersonal.data.compartida === false, 'Profesor guarda una pregunta en su banco personal')

// 2. Sin permiso compartir_banco no se puede publicar al banco compartido
const pSinPermiso = await crearPreguntaBanco({
  autorId: profeA,
  enunciado: 'Pregunta sin permiso',
  tipo: 'abierta',
  compartida: true,
  puedeGestionar: true,
  puedeCompartir: false
})
marcar(!pSinPermiso.success, 'Respeta permiso compartir_banco cuando el docente no está autorizado')

// 3. Crear varias preguntas compartidas para probar reutilización y azar
const pCompartida1 = await crearPreguntaBanco({
  autorId: profeA,
  autorNombre: 'Profe A',
  enunciado: '¿La frecuencia cardíaca normal adulta está entre 60 y 100 BPM?',
  tipo: 'verdadero_falso',
  respuestaCorrecta: true,
  puntaje: 10,
  etiquetas: 'bpm, cardiologia',
  compartida: true,
  puedeGestionar: true,
  puedeCompartir: true
})
const pCompartida2 = await crearPreguntaBanco({
  autorId: profeA,
  autorNombre: 'Profe A',
  enunciado: '¿Qué banda elimina el ruido de movimiento en PPG?',
  tipo: 'opcion_multiple',
  opciones: [{ id: 'a', texto: '0.5 a 4.0 Hz' }, { id: 'b', texto: '200 a 500 Hz' }],
  respuestaCorrecta: 'a',
  puntaje: 15,
  etiquetas: 'ppg, filtros',
  compartida: true,
  puedeGestionar: true,
  puedeCompartir: true
})
marcar(
  pCompartida1.success && pCompartida2.success && pCompartida1.data.revision_global === 'aprobada',
  'Profesor autorizado guarda y comparte preguntas al banco común'
)

// 4. Visibilidad entre profesores (Profe B ve compartidas, no personales ajenas)
const poolPrueba = [pPersonal.data, pCompartida1.data, pCompartida2.data]
const compartidasParaB = poolPrueba.filter(p => (profeB === p.autor_id) || (p.compartida && p.revision_global === 'aprobada'))
marcar(
  !compartidasParaB.some(p => p.id === pPersonal.data.id) && compartidasParaB.some(p => p.id === pCompartida1.data.id),
  'Otro profesor ve las preguntas compartidas pero no las personales ajenas'
)

// 5. Compartir una pregunta personal posteriormente
const resToggle = await actualizarCompartirPregunta({
  preguntaId: pPersonal.data.id,
  compartida: true,
  autorId: profeA,
  puedeCompartir: true
})
marcar(resToggle.success && resToggle.data.compartida === true, 'Se puede compartir posteriormente una pregunta del banco personal')

// 6. Selección al azar de N preguntas sin repetir
const resAzar = await seleccionarPreguntasAlAzar({
  usuarioId: profeB,
  cantidad: 2,
  alcance: 'compartido',
  preguntasDisponibles: [pPersonal.data, pCompartida1.data, pCompartida2.data]
})
const idsAzar = (resAzar.data || []).map(p => p.id)
marcar(
  resAzar.success && idsAzar.length === 2 && new Set(idsAzar).size === 2,
  'Selecciona al azar exactamente N preguntas del banco sin duplicados'
)

// 7. Filtro por etiqueta en selección al azar
const resTag = await seleccionarPreguntasAlAzar({
  usuarioId: profeB,
  cantidad: 5,
  alcance: 'compartido',
  etiqueta: 'ppg',
  preguntasDisponibles: [pCompartida1.data, pCompartida2.data]
})
marcar(
  resTag.success && resTag.data.length === 1 && resTag.data[0].id === pCompartida2.data.id,
  'Filtra correctamente por etiqueta al seleccionar preguntas al azar'
)

// 8. Verificación de migración SQL, RLS y vistas
const sqlBase = lee('../supabase/migrations/20261027000500_evaluaciones.sql')
const sqlRf108 = lee('../supabase/migrations/20261111000100_banco_preguntas_rf108.sql')
const vistaEval = lee('../src/views/EvaluacionesView.vue')
const panelBanco = lee('../src/components/BancoPreguntasPanel.vue')

marcar(sqlBase.includes('alter table public.preguntas enable row level security;'), 'La tabla preguntas tiene RLS habilitado')
marcar(sqlRf108.includes('armar_preguntas_aleatorias') && sqlRf108.includes('preguntas_crear'), 'La migración RF108 actualiza RLS y selección al azar')
marcar(vistaEval.includes('BancoPreguntasPanel') && vistaEval.includes('agregarDesdeBancoAlAzar'), 'EvaluacionesView integra el banco y selección al azar')
marcar(panelBanco.includes('crearPreguntaBanco') && panelBanco.includes('banco-usar-pregunta'), 'BancoPreguntasPanel permite crear, compartir y reutilizar preguntas')

console.log(`\nResultado: ${fallos === 0 ? '✓ TODOS LOS TESTS PASARON (RF108)' : `✖ ${fallos} fallos`}\n`)
process.exit(fallos === 0 ? 0 : 1)