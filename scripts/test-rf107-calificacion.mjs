// RF107 · Prueba de la calificación automática del ejercicio aplicado.
// Uso: node scripts/test-rf107-calificacion.mjs
import { readFileSync } from 'node:fs'
import {
  puntajeRango, puntajeSimilitud, similitudRasgos, calificarEjercicio, nivelPorPorcentaje,
  resumenResultado, mensajeErrorCalificacion
} from '../src/utils/calificacionEjercicio.js'
import { explicarErrorBase, MSG_FALTA_MIXTA, MSG_FALTA_CALIFICACION } from '../src/utils/erroresBase.js'
import { crearEvaluacion, actualizarTipoEvaluacion, obtenerEvaluacionesAula } from '../src/services/evaluacionesService.js'
import {
  formatearRespuesta, formatearCorrecta, estadoPregunta, estadoEjercicio, resumenPreguntas, explicarNivel, formatearPorcentaje
} from '../src/utils/correccionEvaluacion.js'
import {
  cambiarEjercicio, cambiarTipo, modeloVacio, validarTipoEvaluacion, camposTipoParaGuardar, modeloDesdeFila, describirCriterio,
  ejerciciosParaGuardar, agregarEjercicioMixto, quitarEjercicioMixto, cambiarEjercicioMixto, etiquetaTipo,
  MAX_EJERCICIOS_MIXTA, PUNTAJE_EJERCICIO
} from '../src/utils/tiposEvaluacion.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}
const lanza = (fn) => { try { fn(); return false } catch (_) { return true } }

// --- Puntaje por rango
marcar(puntajeRango(80, 60, 100) === 100, 'Dentro del rango da 100')
marcar(puntajeRango(60, 60, 100) === 100 && puntajeRango(100, 60, 100) === 100, 'Los bordes del rango cuentan como dentro')
marcar(puntajeRango(120, 60, 100) === 50, 'BPM 120 con rango 60-100 (ancho 40) da 50')
marcar(puntajeRango(50, 60, 100) === 75, 'BPM 50 con rango 60-100 da 75')
marcar(puntajeRango(200, 60, 100) === 0, 'Muy lejos del rango da 0 (nunca negativo)')
marcar(puntajeRango(90, 95, 100) === 0, 'SpO2 90 con rango 95-100 (ancho 5) da 0')
marcar(puntajeRango(93, 95, 100) === 60, 'SpO2 93 con rango 95-100 da 60')

// --- Puntaje por similitud
marcar(puntajeSimilitud(80, 75) === 100, 'Similitud sobre el mínimo da 100')
marcar(puntajeSimilitud(75, 75) === 100, 'Similitud igual al mínimo da 100')
marcar(puntajeSimilitud(50, 80) === 62.5, 'Similitud 50 con mínimo 80 da 62,5')
marcar(puntajeSimilitud(0, 80) === 0, 'Similitud 0 da 0')

// --- Similitud por rasgos
marcar(similitudRasgos({ bpm: 72 }, { bpm: 72 }) === 100, 'Mismo BPM: 100 %')
marcar(similitudRasgos({ bpm: 72 }, { bpm: 90 }) === 60, 'BPM 72 vs 90: 60 %')
marcar(similitudRasgos({ bpm: 60 }, { bpm: 120 }) === 0, 'Diferencia de 50 % o más en BPM: 0 %')
marcar(similitudRasgos({ bpm: 72, ritmo: 'normal' }, { bpm: 72, ritmo: 'arritmia' }) === 80, 'Ritmo distinto resta 0,15 de 0,75')
marcar(similitudRasgos({ bpm: 72, regularidad: 0.9 }, { bpm: 72, regularidad: 0.5 }) === 88.2, 'La regularidad pesa 0,25')
marcar(similitudRasgos({ bpm: 72, regularidad: 0.9 }, { bpm: 72 }) === 100, 'Un rasgo que falta en una parte no cuenta')
marcar(similitudRasgos({ bpm: null }, { bpm: 72 }) === null, 'Sin BPM no hay similitud')
marcar(similitudRasgos({ bpm: 72 }, { bpm: 90 }) === similitudRasgos({ bpm: 90 }, { bpm: 72 }), 'La similitud es simétrica')

// --- Calificación completa
const pulso = { tipo: 'bpm_en_rango', min: 60, max: 100 }
let r = calificarEjercicio({ criterio: pulso, medicion: { bpm_promedio: 75 } })
marcar(r.cumple && r.puntaje === 100 && /dentro del rango/.test(r.motivo), 'Pulso 75 cumple 60-100 y explica por qué')
r = calificarEjercicio({ criterio: pulso, medicion: { bpm_promedio: 120 } })
marcar(!r.cumple && r.puntaje === 50 && /por encima/.test(r.motivo), 'Pulso 120 no cumple, puntaje parcial 50 y dice "por encima"')
r = calificarEjercicio({ criterio: pulso, medicion: { bpm_promedio: 45 } })
marcar(!r.cumple && /por debajo/.test(r.motivo), 'Pulso 45 dice "por debajo"')
marcar(lanza(() => calificarEjercicio({ criterio: pulso, medicion: { bpm_promedio: null } })), 'Sin BPM en la medición se rechaza')
const spo2 = { tipo: 'spo2_en_rango', min: 95, max: 100 }
r = calificarEjercicio({ criterio: spo2, medicion: { spo2_promedio: 97 } })
marcar(r.cumple && r.puntaje === 100, 'SpO2 97 cumple 95-100')
marcar(lanza(() => calificarEjercicio({ criterio: spo2, medicion: { bpm_promedio: 70 } })), 'Sin SpO2 en la medición se rechaza')
const simil = { tipo: 'similitud_minima', valor: 75 }
const ref = { bpm: 72, nombre: 'PPG normal' }
r = calificarEjercicio({ criterio: simil, medicion: { bpm_promedio: 74 }, referencia: ref })
marcar(r.cumple && r.similitud > 90 && r.puntaje === 100, 'Medición parecida a la referencia cumple la similitud mínima')
r = calificarEjercicio({ criterio: simil, medicion: { bpm_promedio: 100 }, referencia: ref })
marcar(!r.cumple && r.puntaje > 0 && r.puntaje < 100 && /PPG normal/.test(r.motivo), 'Medición distinta no cumple y recibe puntaje parcial')
marcar(lanza(() => calificarEjercicio({ criterio: simil, medicion: { bpm_promedio: 74 } })), 'Sin señal de referencia se rechaza')
marcar(lanza(() => calificarEjercicio({ criterio: { tipo: 'otro' }, medicion: {} })), 'Un criterio desconocido se rechaza')

// --- Niveles (RF112)
marcar(nivelPorPorcentaje(100) === 'logrado' && nivelPorPorcentaje(70) === 'logrado', '70 % o más: logrado')
marcar(nivelPorPorcentaje(69.9) === 'medianamente_logrado' && nivelPorPorcentaje(40) === 'medianamente_logrado', '40 a 69 %: medianamente logrado')
marcar(nivelPorPorcentaje(39.9) === 'no_logrado', 'Menos de 40 %: no logrado')
marcar(nivelPorPorcentaje(55, 80, 50) === 'medianamente_logrado', 'Respeta umbrales editables')
marcar(/Nivel: Logrado/.test(resumenResultado({ motivo: 'ok', puntaje: 100, nivel: 'logrado', intentos_restantes: 0 })), 'El resumen muestra el nivel')
marcar(/Te quedan 2/.test(resumenResultado({ motivo: 'ok', puntaje: 40, nivel: 'medianamente_logrado', intentos_restantes: 2 })), 'El resumen avisa los intentos que quedan')
marcar(/medición nueva/.test(mensajeErrorCalificacion(new Error('La medición es anterior a la apertura de la evaluación'))), 'Mensaje claro para medición anterior a la apertura')
marcar(/Repite la medición/.test(mensajeErrorCalificacion(new Error('La medición tiene calidad de señal mala'))), 'Mensaje claro para señal mala')

// --- Tipos de evaluación con referencia y reintentos
const comparar = cambiarEjercicio(modeloVacio(), 'comparar_senales')
marcar(validarTipoEvaluacion(comparar).length === 0, 'Comparar sin referencia sigue válido si no se exige (precargadas)')
marcar(validarTipoEvaluacion(comparar, { exigirReferencia: true }).length === 1, 'Al guardar se exige la señal de referencia')
const conRef = { ...comparar, criterio: { ...comparar.criterio, referencia: { origen: 'plantilla', id: 'abc' } } }
marcar(validarTipoEvaluacion(conRef, { exigirReferencia: true }).length === 0, 'Con referencia el modelo es válido')
marcar(validarTipoEvaluacion({ ...conRef, criterio: { ...conRef.criterio, referencia: { origen: 'otro', id: 'x' } } }).length === 1, 'Un origen de referencia desconocido se rechaza')
marcar(validarTipoEvaluacion({ ...conRef, reintentos: 9 }).length === 1, 'Más de 5 intentos se rechaza')
marcar(validarTipoEvaluacion({ ...conRef, reintentos: 0 }).length === 1, 'Menos de 1 intento se rechaza')
const guardado = camposTipoParaGuardar({ ...conRef, reintentos: 3 }, { exigirReferencia: true })
marcar(guardado.criterio.referencia.origen === 'plantilla' && guardado.max_reintentos === 3, 'Se guarda la referencia y los intentos permitidos')
marcar(!('max_reintentos' in camposTipoParaGuardar(cambiarEjercicio(modeloVacio(), 'medir_pulso'))), 'Sin reintentos indicados no se envía el campo')
marcar(modeloDesdeFila({ tipo: 'ejercicio_aplicado', ejercicio: 'comparar_senales', criterio: conRef.criterio, max_reintentos: 2 }).reintentos === 2, 'El modelo recupera los intentos desde la fila')
marcar(/falta elegir/.test(describirCriterio('comparar_senales', { tipo: 'similitud_minima', valor: 70 })), 'La descripción avisa si falta la referencia')
const preguntas = camposTipoParaGuardar(modeloVacio())
marcar(!preguntas.criterio && !('max_reintentos' in preguntas), 'Preguntas no guarda criterio ni intentos')

// --- Evaluación mixta: preguntas + uno o más ejercicios aplicados
let mixta = cambiarTipo(modeloVacio(), 'mixta')
marcar(mixta.tipo === 'mixta' && mixta.ejercicios.length === 1 && mixta.ejercicio === null, 'Al elegir mixta aparece un ejercicio vacío')
marcar(validarTipoEvaluacion(mixta).length > 0, 'Una mixta con el ejercicio sin elegir se rechaza')
mixta = cambiarEjercicioMixto(mixta, 0, 'medir_pulso')
marcar(validarTipoEvaluacion(mixta).length === 0, 'Una mixta con un ejercicio completo es válida')
mixta = agregarEjercicioMixto(mixta)
marcar(mixta.ejercicios.length === 2 && validarTipoEvaluacion(mixta).length > 0, 'Se agrega un segundo ejercicio (incompleto hasta elegirlo)')
mixta = cambiarEjercicioMixto(mixta, 1, 'medir_spo2')
mixta = { ...mixta, ejercicios: [mixta.ejercicios[0], { ...mixta.ejercicios[1], puntaje: 30 }] }
marcar(validarTipoEvaluacion(mixta).length === 0, 'Dos ejercicios distintos con su puntaje son válidos')
marcar(quitarEjercicioMixto(mixta, 0).ejercicios.length === 1 && quitarEjercicioMixto(quitarEjercicioMixto(mixta, 0), 0).ejercicios.length === 1, 'Se puede quitar un ejercicio pero siempre queda uno')
let llena = mixta
for (let i = 0; i < 20; i++) llena = agregarEjercicioMixto(llena)
marcar(llena.ejercicios.length === MAX_EJERCICIOS_MIXTA, 'La mixta admite hasta ' + MAX_EJERCICIOS_MIXTA + ' ejercicios')
marcar(validarTipoEvaluacion({ ...mixta, ejercicios: [] }).length === 1, 'Una mixta sin ejercicios se rechaza')
marcar(validarTipoEvaluacion({ ...mixta, ejercicios: [{ ...mixta.ejercicios[0], puntaje: 0 }] }).length === 1, 'Un ejercicio con puntaje 0 se rechaza')
marcar(validarTipoEvaluacion({ ...mixta, ejercicios: [{ ...mixta.ejercicios[0], puntaje: PUNTAJE_EJERCICIO.max + 1 }] }).length === 1, 'Un ejercicio con puntaje excesivo se rechaza')
marcar(validarTipoEvaluacion({ ...mixta, ejercicio: 'medir_pulso' }).length === 1, 'En la mixta no se admite un ejercicio suelto')
const compMixta = cambiarEjercicioMixto(cambiarTipo(modeloVacio(), 'mixta'), 0, 'comparar_senales')
marcar(validarTipoEvaluacion(compMixta).length === 0 && validarTipoEvaluacion(compMixta, { exigirReferencia: true }).length === 1, 'En la mixta también se exige la referencia al guardar')
const camposMixta = camposTipoParaGuardar({ ...mixta, reintentos: 2 })
marcar(camposMixta.tipo === 'mixta' && camposMixta.ejercicio === null && camposMixta.criterio === null && camposMixta.max_reintentos === 2, 'La mixta guarda tipo, sin ejercicio ni criterio sueltos, y los intentos')
const filas = ejerciciosParaGuardar(mixta)
marcar(filas.length === 2 && filas[0].orden === 1 && filas[1].orden === 2 && filas[1].puntaje === 30 && filas[1].criterio.tipo === 'spo2_en_rango', 'Los ejercicios se guardan con orden, criterio y puntaje')
marcar(ejerciciosParaGuardar({ tipo: 'preguntas' }).length === 0 && ejerciciosParaGuardar({ tipo: 'ejercicio_aplicado' }).length === 0, 'Solo la mixta guarda filas de ejercicios')
const desdeFila = modeloDesdeFila({ tipo: 'mixta', max_reintentos: 2, evaluacion_ejercicios: [
  { orden: 2, ejercicio: 'medir_spo2', criterio: { tipo: 'spo2_en_rango', min: 95, max: 100 }, puntaje: '30' },
  { orden: 1, ejercicio: 'medir_pulso', criterio: { tipo: 'bpm_en_rango', min: 60, max: 100 }, puntaje: '20' }] })
marcar(desdeFila.ejercicios[0].ejercicio === 'medir_pulso' && desdeFila.ejercicios[1].puntaje === 30 && desdeFila.reintentos === 2, 'El modelo de una mixta se arma ordenado desde la base')
const deSimple = cambiarTipo(cambiarEjercicio(modeloVacio(), 'medir_pulso'), 'mixta')
marcar(deSimple.ejercicios.length === 1 && deSimple.ejercicios[0].ejercicio === 'medir_pulso', 'Pasar de ejercicio aplicado a mixta conserva el ejercicio')
marcar(!('ejercicios' in cambiarTipo(mixta, 'ejercicio_aplicado')), 'Volver a ejercicio aplicado descarta la lista de ejercicios')
marcar(etiquetaTipo('mixta', null, 2) === 'Preguntas + 2 ejercicios aplicados' && etiquetaTipo('mixta', null, 1) === 'Preguntas + 1 ejercicio aplicado', 'La etiqueta de la mixta indica cuántos ejercicios tiene')

// --- La migración de la evaluación mixta
const sqlMixta = readFileSync(new URL('../supabase/migrations/20261113000200_rf107_evaluacion_mixta.sql', import.meta.url), 'utf8')
marcar(/tipo in \('preguntas','ejercicio_aplicado','mixta'\)/.test(sqlMixta), 'La base acepta el tipo mixta')
marcar(/create table if not exists public\.evaluacion_ejercicios/.test(sqlMixta) && /create table if not exists public\.intento_ejercicios/.test(sqlMixta), 'Existen las tablas de ejercicios y de resultados por ejercicio')
marcar(/alter table public\.evaluacion_ejercicios enable row level security/.test(sqlMixta) && /alter table public\.intento_ejercicios enable row level security/.test(sqlMixta), 'Las dos tablas nuevas tienen RLS')
marcar(/before insert or update of puntaje, puntaje_maximo on public\.intentos_evaluacion/.test(sqlMixta) && /create trigger intento_a_total_mixta/.test(sqlMixta), 'El total del intento suma preguntas y ejercicios en la base')
marcar('intento_a_total_mixta' < 'intento_nivel', 'El total de la mixta se calcula antes del nivel (orden alfabético de triggers)')
marcar(/v_usados >= v_ev\.max_reintentos/.test(sqlMixta), 'Los intentos se limitan por ejercicio')
marcar(/id = p_ejercicio and evaluacion_id = v_ev\.id/.test(sqlMixta), 'El ejercicio debe pertenecer a la evaluación del intento')
marcar(/grant execute on function public\.calificar_ejercicio_mixto\(uuid,uuid,uuid\)/.test(sqlMixta), 'calificar_ejercicio_mixto queda disponible para usuarios autenticados')
marcar(/revoke all on function public\.evaluar_criterio[^;]*authenticated/.test(sqlMixta), 'evaluar_criterio no se expone a los usuarios')
marcar(/if v_tipo = 'mixta' then/.test(sqlMixta), 'El profesor puede recalificar una mixta')

// --- La migración SQL tiene las mismas reglas
const sql = readFileSync(new URL('../supabase/migrations/20261113000100_rf107_calificacion_ejercicio.sql', import.meta.url), 'utf8')
marcar(/create or replace function public\.calificar_ejercicio\(p_intento uuid, p_medicion uuid\)/.test(sql), 'calificar_ejercicio ya no recibe la similitud del cliente')
marcar(/drop function if exists public\.calificar_ejercicio\(uuid, uuid, numeric\)/.test(sql), 'Se elimina la versión que aceptaba la similitud del cliente')
marcar(/max_reintentos smallint not null default 1\s+check \(max_reintentos between 1 and 5\)/.test(sql), 'La base limita los intentos de 1 a 5')
marcar(/calificaciones >= v_ev\.max_reintentos/.test(sql), 'La base aplica el máximo de intentos')
marcar(/r\.usuario_id = v_ev\.creador_id/.test(sql), 'La medición de referencia debe ser del profesor creador')
marcar(/v_m\.calidad = 'mala'/.test(sql), 'La base rechaza mediciones de calidad mala')
marcar(/usuario_id = p_alumno/.test(sql), 'La base exige que la medición sea del estudiante')
marcar(/profesor_de_evaluacion\(v_int\.evaluacion_id\)/.test(sql), 'Solo el profesor de la evaluación puede recalificar')
marcar(/revoke all on function public\.evaluar_ejercicio[^;]*authenticated/.test(sql), 'El cálculo interno no se expone a los usuarios')
marcar(/least\(1, 2 \* abs\(p_bpm_a - p_bpm_b\)/.test(sql) && /0\.60/.test(sql) && /0\.25/.test(sql) && /0\.15/.test(sql), 'Los pesos de la similitud coinciden con la versión JS')
const completo = readFileSync(new URL('../supabase/sensor_pulso_base_de_datos_completa.sql', import.meta.url), 'utf8')
marcar(completo.includes('RF107: calificación automática del ejercicio aplicado'), 'La base completa incluye la migración de RF107')
marcar(completo.includes('evaluación mixta = preguntas + uno o más ejercicios aplicados'), 'La base completa incluye la migración de la evaluación mixta')

// --- Pantalla del estudiante (Mis evaluaciones)
const vistaEstudiante = readFileSync(new URL('../src/views/MisEvaluacionesView.vue', import.meta.url), 'utf8')
marcar(/data-testid="progreso"/.test(vistaEstudiante) && /role="progressbar"/.test(vistaEstudiante), 'La pantalla de rendir muestra el avance (preguntas respondidas y ejercicios calificados)')
marcar(/type="radio"/.test(vistaEstudiante) && /role="radiogroup"/.test(vistaEstudiante), 'Las alternativas son opciones con botón de selección, no un desplegable')
marcar(/class="me-acciones"/.test(vistaEstudiante) && /position: sticky/.test(vistaEstudiante), 'Entregar y cancelar quedan en una barra fija abajo')
marcar(/<style scoped>/.test(vistaEstudiante) && /@media \(max-width: 560px\)/.test(vistaEstudiante), 'La pantalla tiene estilos propios y se adapta al teléfono')

// --- Resultado y correcciones al entregar
const opciones = [{ id: 'a', texto: '40 a 60 BPM' }, { id: 'b', texto: '60 a 100 BPM' }]
const pOm = { tipo: 'opcion_multiple', opciones, respondida: true, respuesta: 'b', es_correcta: true, correcta: 'b' }
marcar(formatearRespuesta(pOm) === '60 a 100 BPM' && formatearCorrecta(pOm) === '60 a 100 BPM', 'Muestra el texto de la alternativa, no su letra interna')
marcar(formatearRespuesta({ tipo: 'verdadero_falso', respondida: true, respuesta: false }) === 'Falso' && formatearCorrecta({ tipo: 'verdadero_falso', correcta: true }) === 'Verdadero', 'Verdadero y Falso se muestran con palabras')
marcar(formatearCorrecta({ tipo: 'numerica', correcta: { valor: 880, tolerancia: 5 } }) === '880 (± 5)' && formatearCorrecta({ tipo: 'numerica', correcta: { valor: 72 } }) === '72', 'La respuesta numérica muestra su tolerancia')
marcar(formatearCorrecta({ tipo: 'abierta', correcta: null }) === null, 'Una pregunta abierta no tiene respuesta correcta que mostrar')
marcar(formatearRespuesta({ respondida: false }) === 'Sin responder', 'Una pregunta sin responder se indica')
marcar(estadoPregunta(pOm) === 'correcta' && estadoPregunta({ respondida: true, es_correcta: false }) === 'incorrecta' && estadoPregunta({ respondida: true, es_correcta: null }) === 'pendiente' && estadoPregunta({ respondida: false }) === 'sin_responder', 'Cada pregunta queda correcta, incorrecta, pendiente de revisión o sin responder')
const conteo = resumenPreguntas([pOm, { respondida: true, es_correcta: false }, { respondida: true, es_correcta: null }, { respondida: false }])
marcar(conteo.correcta === 1 && conteo.incorrecta === 1 && conteo.pendiente === 1 && conteo.sin_responder === 1 && conteo.total === 4, 'El resumen cuenta las preguntas por estado')
marcar(estadoEjercicio({ calificado: true, cumple: true, porcentaje: 100 }) === 'cumple' && estadoEjercicio({ calificado: true, cumple: false, porcentaje: 40 }) === 'parcial' && estadoEjercicio({ calificado: true, cumple: false, porcentaje: 0 }) === 'no_cumple' && estadoEjercicio({ calificado: false }) === 'sin_calificar', 'Cada ejercicio queda cumple, parcial, no cumple o sin calificar')
marcar(/70 % o más/.test(explicarNivel('logrado', 70, 40)) && /entre el 40 % y menos del 70 %/.test(explicarNivel('medianamente_logrado', 70, 40)) && /menos del 40 %/.test(explicarNivel('no_logrado', 70, 40)), 'Explica cada nivel con los umbrales de la evaluación')
marcar(formatearPorcentaje(47.27) === '47.3' && formatearPorcentaje(100) === '100' && formatearPorcentaje('x') === '0', 'Los porcentajes se muestran sin decimales sobrantes')
const sqlResultado = readFileSync(new URL('../supabase/migrations/20261113000300_rf107_resultado_evaluacion.sql', import.meta.url), 'utf8')
marcar(/id = p_intento and usuario_id = auth\.uid\(\)/.test(sqlResultado), 'Solo el estudiante dueño del intento puede pedir el resultado')
marcar(/v_int\.fin is null then\s+raise exception/.test(sqlResultado), 'Las correcciones y la clave solo se entregan cuando el intento ya fue entregado')
marcar(/left join public\.preguntas_claves k/.test(sqlResultado) && /'explicacion', k\.explicacion/.test(sqlResultado), 'Devuelve la clave y la explicación de cada pregunta')
marcar(/v_ev\.tipo = 'mixta'/.test(sqlResultado) && /v_ev\.tipo = 'ejercicio_aplicado'/.test(sqlResultado), 'Incluye los ejercicios de la mixta y del ejercicio aplicado simple')
marcar(/revoke all on function public\.resultado_evaluacion\(uuid\) from public, anon/.test(sqlResultado) && /grant execute on function public\.resultado_evaluacion\(uuid\) to authenticated/.test(sqlResultado), 'La función solo se ofrece a usuarios con sesión')
marcar(readFileSync(new URL('../supabase/sensor_pulso_base_de_datos_completa.sql', import.meta.url), 'utf8').includes('resultado y correcciones de una evaluación entregada'), 'La base completa incluye la función del resultado')
const vistaResultado = readFileSync(new URL('../src/views/MisEvaluacionesView.vue', import.meta.url), 'utf8')
marcar(/data-testid="resultado-final"/.test(vistaResultado) && /data-testid="nivel-logro"/.test(vistaResultado) && /data-testid="correccion-pregunta"/.test(vistaResultado) && /data-testid="correccion-ejercicio"/.test(vistaResultado), 'Al entregar se muestra el nivel, el porcentaje y la corrección de cada pregunta y ejercicio')
marcar(/await mostrarResultado\(idIntento\)/.test(vistaResultado) && /data-testid="ver-correcciones"/.test(vistaResultado), 'El resultado aparece al entregar y se puede volver a ver desde el listado')

// --- Cambiar el tipo de una evaluación ya creada y errores claros de la base
marcar(explicarErrorBase({ code: '23514', message: 'new row for relation "evaluaciones" violates check constraint "evaluaciones_tipo_check"' }, 'mixta') === MSG_FALTA_MIXTA, 'Si la base no acepta el tipo mixta, el mensaje dice qué migración aplicar')
marcar(/20261113000200_rf107_evaluacion_mixta\.sql/.test(MSG_FALTA_MIXTA) && /SQL Editor/.test(MSG_FALTA_MIXTA), 'El mensaje nombra el archivo y dónde ejecutarlo')
marcar(explicarErrorBase({ code: '42P01', message: 'relation "evaluacion_ejercicios" does not exist' }, 'mixta') === MSG_FALTA_MIXTA, 'Si falta la tabla de ejercicios, también remite a la migración de la mixta')
marcar(explicarErrorBase({ code: 'PGRST204', message: "Could not find the 'max_reintentos' column" }, 'ejercicio_aplicado') === MSG_FALTA_CALIFICACION, 'Si falta la columna de intentos, remite a la migración de la calificación')
marcar(/violates check constraint/.test(explicarErrorBase({ code: '23514', message: 'violates check constraint "evaluaciones_check"' }, 'ejercicio_aplicado')), 'Un rechazo de criterio muestra el detalle de la base')
marcar(explicarErrorBase({ message: 'otro problema' }, 'preguntas') === 'otro problema', 'Otros errores se muestran tal cual')

// Almacenamiento en memoria: en Node no existe localStorage y el servicio guarda las evaluaciones locales ahí
const memoria = new Map()
globalThis.window = { localStorage: { getItem: (k) => (memoria.has(k) ? memoria.get(k) : null), setItem: (k, v) => memoria.set(k, String(v)), removeItem: (k) => memoria.delete(k) } }
globalThis.localStorage = globalThis.window.localStorage
const aulaPrueba = 'aula-cambio-tipo'
const gen = { aulaId: aulaPrueba, creadorId: '00000000-0000-0000-0000-0000000000aa', titulo: 'Evaluación para cambiar de tipo', puedeGestionar: true }
const creada = await crearEvaluacion({ ...gen, modelo: modeloVacio(), preguntas: [{ enunciado: '¿Pregunta?', tipo: 'abierta', puntaje: 10 }] })
const idEv = creada.data.id
const buscar = async () => (await obtenerEvaluacionesAula(aulaPrueba)).data.find((e) => e.id === idEv)
marcar(creada.success && creada.data.tipo === 'preguntas', 'Se crea una evaluación solo de preguntas')
let cambio = await actualizarTipoEvaluacion({ evaluacionId: idEv, modelo: cambiarEjercicio(modeloVacio(), 'medir_pulso'), puedeGestionar: true })
marcar(cambio.success && (await buscar()).tipo === 'ejercicio_aplicado' && (await buscar()).ejercicio === 'medir_pulso', 'Se cambia de solo preguntas a solo ejercicio aplicado')
const aMixta = cambiarTipo(cambiarEjercicio(modeloVacio(), 'medir_spo2'), 'mixta')
cambio = await actualizarTipoEvaluacion({ evaluacionId: idEv, modelo: { ...aMixta, reintentos: 2 }, puedeGestionar: true })
let actual = await buscar()
marcar(cambio.success && actual.tipo === 'mixta' && actual.evaluacion_ejercicios.length === 1 && actual.evaluacion_ejercicios[0].ejercicio === 'medir_spo2' && actual.max_reintentos === 2, 'Se cambia a ambas (preguntas + ejercicio) conservando el ejercicio y los intentos')
cambio = await actualizarTipoEvaluacion({ evaluacionId: idEv, modelo: modeloVacio(), puedeGestionar: true })
actual = await buscar()
marcar(cambio.success && actual.tipo === 'preguntas' && actual.ejercicio === null && actual.criterio === null && actual.evaluacion_ejercicios.length === 0, 'Se vuelve a solo preguntas y se quitan los ejercicios')
cambio = await actualizarTipoEvaluacion({ evaluacionId: idEv, modelo: { tipo: 'ejercicio_aplicado', ejercicio: null, criterio: null }, puedeGestionar: true })
marcar(!cambio.success && (await buscar()).tipo === 'preguntas', 'Un tipo incompleto se rechaza y la evaluación no cambia')
cambio = await actualizarTipoEvaluacion({ evaluacionId: idEv, modelo: cambiarEjercicio(modeloVacio(), 'medir_pulso'), puedeGestionar: false })
marcar(!cambio.success, 'Sin permiso de gestión no se cambia el tipo')

delete globalThis.window
delete globalThis.localStorage

const vistaEvaluaciones = readFileSync(new URL('../src/views/EvaluacionesView.vue', import.meta.url), 'utf8')
marcar(/data-testid="cambiar-tipo"/.test(vistaEvaluaciones) && /data-testid="guardar-tipo"/.test(vistaEvaluaciones) && /actualizarTipoEvaluacion\(/.test(vistaEvaluaciones), 'Cada evaluación guardada tiene el botón «Cambiar tipo» que guarda el nuevo tipo')
marcar(/modeloDesdeFila\(p\)/.test(vistaEvaluaciones), 'Al cargar una plantilla en el formulario se respeta su tipo (preguntas, ejercicio o ambas)')

console.log(fallos ? `\nRF107: ${fallos} prueba(s) fallaron` : '\nRF107: todas las pruebas pasaron')
process.exit(fallos ? 1 : 0)
