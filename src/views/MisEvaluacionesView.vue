<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { tiempoEvaluacion, tiempoParaEntregar, cambioPorTiempo } from '../utils/tiempoEvaluacion.js'
import { supabase } from '../services/supabase.js'
import { enviarRespuestasConResiliencia } from '../services/respuestasSimultaneasService.js'
import { iniciarHeartbeatEstudiante, desconectarEstudiante } from '../services/panelEnVivoService.js'
import { calificarEjercicioAplicado, calificarEjercicioMixto, obtenerResultadoEvaluacion } from '../services/calificacionEjercicioService.js'
import { ETIQUETA_NIVEL, resumenResultado } from '../utils/calificacionEjercicio.js'
import { describirCriterio, etiquetaTipo, instruccionParaEstudiante } from '../utils/tiposEvaluacion.js'
import {
  ETIQUETA_NIVEL_RESULTADO, CLASE_NIVEL, ETIQUETA_ESTADO_PREGUNTA, ETIQUETA_ESTADO_EJERCICIO,
  explicarNivel, formatearRespuesta, formatearCorrecta, estadoPregunta, estadoEjercicio, resumenPreguntas, formatearPorcentaje
} from '../utils/correccionEvaluacion.js'

const evaluaciones = ref([])
const seleccion = ref(null)
const intentoId = ref(null)
const preguntas = ref([])
const respuestas = ref({})
const mediciones = ref([])
const resultadosEjercicio = ref({}) // RF107: último resultado por evaluación
const medicionId = ref('')
// RF107: evaluación mixta (preguntas + ejercicios)
const ejerciciosMixta = ref([])
const medicionPorEjercicio = ref({})
const resultadoPorEjercicio = ref({})
const nombreEjercicio = { medir_pulso: 'Medir el pulso', medir_spo2: 'Medir la SpO₂', comparar_senales: 'Comparar señales' }
const ocupado = ref(false)
const error = ref('')
const mensaje = ref('')
let heartbeatControl = null

const estados = {
  pendiente: 'Pendiente de apertura',
  disponible: 'Disponible',
  cerrada: 'Cerrada',
  entregada: 'Entregada'
}

// Reloj de la pantalla: actualiza cada segundo el tiempo que falta para abrir o cerrar
const ahora = ref(Date.now())
const tiempoDe = (ev) => tiempoEvaluacion(ev, ahora.value)
const tiempoEntrega = computed(() => (seleccion.value ? tiempoParaEntregar(seleccion.value, ahora.value) : null))
let relojTiempo = null
const yaRecargadas = new Set()

// Cuando el tiempo hace que una evaluación se abra o se cierre, se pide el listado una vez para reflejarlo
const revisarCambiosPorTiempo = async () => {
  if (seleccion.value || resultadoFinal.value || ocupado.value) return
  const cambio = evaluaciones.value
    .map((ev) => ({ clave: ev.id + ':' + ev.disponibilidad, cambio: cambioPorTiempo(ev, ahora.value) }))
    .find((c) => c.cambio && !yaRecargadas.has(c.clave))
  if (!cambio) return
  yaRecargadas.add(cambio.clave)
  try { await cargar() } catch (_) { /* se vuelve a intentar con «Actualizar listado» */ }
}

// Ayudas visuales de la pantalla
const letra = (i) => String.fromCharCode(65 + i)
const claseNivel = (nivel) => ({ logrado: 'ok', medianamente_logrado: 'medio', no_logrado: 'bajo' }[nivel] || '')
const estaRespondida = (pregunta) => {
  const v = respuestas.value[pregunta.id]
  return v !== undefined && v !== null && v !== '' && !(typeof v === 'number' && Number.isNaN(v))
}
const respondidas = computed(() => preguntas.value.filter(estaRespondida).length)
const ejerciciosCalificados = computed(() => ejerciciosMixta.value.filter(e => resultadoPorEjercicio.value[e.id]).length)
const totalPasos = computed(() => {
  const tipo = seleccion.value?.tipo
  if (tipo === 'ejercicio_aplicado') return 1
  return preguntas.value.length + (tipo === 'mixta' ? ejerciciosMixta.value.length : 0)
})
const pasosHechos = computed(() => {
  const tipo = seleccion.value?.tipo
  if (tipo === 'ejercicio_aplicado') return medicionId.value ? 1 : 0
  return respondidas.value + (tipo === 'mixta' ? ejerciciosCalificados.value : 0)
})
const porcentajeAvance = computed(() => (totalPasos.value ? Math.round((100 * pasosHechos.value) / totalPasos.value) : 0))

// Resultado y correcciones de una evaluación entregada
const resultadoFinal = ref(null)
const conteoPreguntas = computed(() => resumenPreguntas(resultadoFinal.value?.preguntas || []))

const mostrarResultado = async (idIntento) => {
  const res = await obtenerResultadoEvaluacion(idIntento)
  if (!res.success) throw new Error(res.error)
  resultadoFinal.value = res.resultado
  if (typeof window !== 'undefined') window.scrollTo?.({ top: 0 })
}

const verCorrecciones = (ev) => ejecutar(async () => {
  mensaje.value = ''
  const { data: usuario, error: falloUsuario } = await supabase.auth.getUser()
  if (falloUsuario) throw falloUsuario
  const { data, error: falloIntento } = await supabase
    .from('intentos_evaluacion')
    .select('id')
    .eq('evaluacion_id', ev.id)
    .eq('usuario_id', usuario.user.id)
    .maybeSingle()
  if (falloIntento) throw falloIntento
  if (!data) throw new Error('No encontramos tu entrega de esta evaluación.')
  await mostrarResultado(data.id)
})

const cerrarResultado = () => {
  resultadoFinal.value = null
  mensaje.value = ''
}

const ejecutar = async (operacion) => {
  if (ocupado.value) return
  ocupado.value = true
  error.value = ''

  try {
    await operacion()
  } catch (fallo) {
    error.value = fallo.message
  } finally {
    ocupado.value = false
  }
}

const cargar = async () => {
  // Las evaluaciones en vivo con inicio programado se activan solas a su hora; esto solo ordena su estado
  try { await supabase.rpc('activar_evaluaciones_programadas') } catch (_) { /* migración aún no aplicada: no es grave */ }
  const { data, error: fallo } = await supabase.rpc('mis_evaluaciones_rf109')
  if (fallo) throw fallo
  evaluaciones.value = data || []
  await cargarResultadosEjercicio()
}

// RF107: resultado del ejercicio aplicado e intentos que quedan
const cargarResultadosEjercicio = async () => {
  const ejercicios = evaluaciones.value.filter(ev => ev.tipo !== 'preguntas')
  if (!ejercicios.length) { resultadosEjercicio.value = {}; return }
  const ids = ejercicios.map(ev => ev.id)
  const [{ data: intentos }, { data: configuracion }] = await Promise.all([
    supabase.from('intentos_evaluacion')
      .select('evaluacion_id, porcentaje, nivel, detalle, calificaciones, fin').in('evaluacion_id', ids),
    supabase.from('evaluaciones').select('id, max_reintentos').in('id', ids)
  ])
  const maximos = Object.fromEntries((configuracion || []).map(c => [c.id, c.max_reintentos || 1]))
  const resultado = {}
  for (const i of intentos || []) {
    const esMixta = ejercicios.find(ev => ev.id === i.evaluacion_id)?.tipo === 'mixta'
    if (esMixta ? !i.fin : !i.calificaciones) continue
    resultado[i.evaluacion_id] = {
      ...(i.detalle || {}), nivel: i.nivel, porcentaje: i.porcentaje,
      restantes: esMixta ? 0 : Math.max(0, (maximos[i.evaluacion_id] || 1) - i.calificaciones)
    }
  }
  resultadosEjercicio.value = resultado
}

// RF107: ejercicios de la evaluación mixta, mediciones elegibles y resultados que ya tenga el intento
const prepararEjerciciosMixta = async (ev, idIntento) => {
  const { data: lista, error: falloLista } = await supabase
    .from('evaluacion_ejercicios')
    .select('id, orden, ejercicio, criterio, puntaje')
    .eq('evaluacion_id', ev.id)
    .order('orden')
  if (falloLista) throw falloLista
  ejerciciosMixta.value = lista || []

  const { data: usuario, error: falloUsuario } = await supabase.auth.getUser()
  if (falloUsuario) throw falloUsuario
  const { data: meds, error: falloMediciones } = await supabase
    .from('mediciones')
    .select('id, inicio, bpm_promedio, spo2_promedio, calidad')
    .eq('usuario_id', usuario.user.id)
    .neq('calidad', 'mala')
    .order('inicio', { ascending: false })
    .limit(50)
  if (falloMediciones) throw falloMediciones
  mediciones.value = meds || []
  medicionPorEjercicio.value = {}

  const [{ data: previos }, { data: cfg }] = await Promise.all([
    supabase.from('intento_ejercicios').select('ejercicio_id, porcentaje, puntaje, puntaje_maximo, detalle, calificaciones').eq('intento_id', idIntento),
    supabase.from('evaluaciones').select('max_reintentos').eq('id', ev.id).maybeSingle()
  ])
  const maximo = cfg?.max_reintentos || 1
  const resultados = {}
  for (const p of previos || []) {
    resultados[p.ejercicio_id] = {
      ...(p.detalle || {}), puntaje_obtenido: p.puntaje, puntaje_ejercicio: p.puntaje_maximo,
      intentos_restantes: Math.max(0, maximo - p.calificaciones)
    }
  }
  resultadoPorEjercicio.value = resultados
}

const calificarMixto = (ejercicio) => ejecutar(async () => {
  const res = await calificarEjercicioMixto({
    intentoId: intentoId.value,
    ejercicioId: ejercicio.id,
    medicionId: medicionPorEjercicio.value[ejercicio.id]
  })
  if (!res.success) throw new Error(res.error)
  resultadoPorEjercicio.value = { ...resultadoPorEjercicio.value, [ejercicio.id]: res.resultado }
})

const abrir = (ev) => ejecutar(async () => {
  mensaje.value = ''
  const { data: id, error: falloInicio } = await supabase.rpc('iniciar_intento', {
    p_eval: ev.id
  })
  if (falloInicio) throw falloInicio

  if (ev.tipo === 'preguntas' || ev.tipo === 'mixta') {
    const { data, error: falloPreguntas } = await supabase
      .from('evaluacion_preguntas')
      .select('orden, preguntas(id, enunciado, tipo, opciones)')
      .eq('evaluacion_id', ev.id)
      .order('orden')

    if (falloPreguntas) throw falloPreguntas
    preguntas.value = data.map(fila => fila.preguntas).filter(Boolean)
    if (!preguntas.value.length) {
      throw new Error('No hay preguntas disponibles. Actualiza el listado.')
    }
    respuestas.value = {}
  }

  if (ev.tipo === 'mixta') await prepararEjerciciosMixta(ev, id)

  if (ev.tipo === 'ejercicio_aplicado') {
    const { data: usuario, error: falloUsuario } = await supabase.auth.getUser()
    if (falloUsuario) throw falloUsuario

    const { data, error: falloMediciones } = await supabase
      .from('mediciones')
      .select('id, inicio, bpm_promedio, spo2_promedio, calidad')
      .eq('usuario_id', usuario.user.id)
      .neq('calidad', 'mala')
      .order('inicio', { ascending: false })
      .limit(50)

    if (falloMediciones) throw falloMediciones
    mediciones.value = data
    medicionId.value = ''
  }

  intentoId.value = id
  seleccion.value = ev

  // RF113: Notificar presencia del estudiante en vivo
  if (heartbeatControl) heartbeatControl.detener()
  heartbeatControl = iniciarHeartbeatEstudiante(ev.id, id)
})

const entregar = () => ejecutar(async () => {
  if (heartbeatControl) {
    heartbeatControl.detener()
    heartbeatControl = null
  }
  const ev = seleccion.value
  const idIntento = intentoId.value
  let enCola = false
  let resultadoReciente = null
  if (ev.tipo === 'mixta' && ejerciciosMixta.value.some(e => !resultadoPorEjercicio.value[e.id])) {
    throw new Error('Califica todos los ejercicios antes de entregar la evaluación.')
  }
  if (ev.tipo === 'preguntas' || ev.tipo === 'mixta') {
    // RF110: Envío optimizado resiliente a alta concurrencia simultánea
    const resultado = await enviarRespuestasConResiliencia({
      evaluacionId: ev.id,
      intentoId: intentoId.value,
      respuestas: respuestas.value
    })
    if (!resultado.success && !resultado.enCola) {
      throw new Error(resultado.error || 'Error al guardar respuestas')
    }
    enCola = !resultado.success && !!resultado.enCola
  } else if (ev.tipo === 'ejercicio_aplicado') {
    // RF107: el servidor califica y devuelve el resultado con su retroalimentación
    const calificacion = await calificarEjercicioAplicado({
      intentoId: intentoId.value,
      medicionId: medicionId.value
    })
    if (!calificacion.success) throw new Error(calificacion.error)
    resultadoReciente = calificacion.resultado
  }

  seleccion.value = null
  await cargar()
  if (enCola) {
    mensaje.value = 'Sin conexión: tu entrega quedó guardada y se enviará sola cuando vuelvas a conectarte. Luego podrás ver tu resultado.'
  } else {
    mensaje.value = ''
    await mostrarResultado(idIntento)
  }
})

const volver = () => ejecutar(async () => {
  if (heartbeatControl) {
    heartbeatControl.detener()
    heartbeatControl = null
  }
  seleccion.value = null
  await cargar()
})

const fechaLocal = valor => new Date(valor).toLocaleString('es-CL')

onMounted(() => {
  relojTiempo = setInterval(() => {
    ahora.value = Date.now()
    revisarCambiosPorTiempo()
  }, 1000)
  return ejecutar(cargar)
})
onUnmounted(() => {
  if (relojTiempo) clearInterval(relojTiempo)
  if (heartbeatControl) {
    heartbeatControl.detener()
    heartbeatControl = null
  }
})
</script>

<template>
  <main class="mis-evaluaciones">
    <!-- Encabezado -->
    <header class="me-encabezado">
      <div>
        <h1>Mis evaluaciones</h1>
        <p class="me-sub">
          {{ resultadoFinal ? 'Tu calificación automática y la corrección de cada pregunta y ejercicio.' : seleccion ? 'Responde con calma; puedes volver al listado cuando quieras.' : 'Evaluaciones de tus aulas: responde preguntas y realiza ejercicios con tus mediciones.' }}
        </p>
      </div>
      <button v-if="!seleccion && !resultadoFinal" type="button" class="btn" :disabled="ocupado" @click="ejecutar(cargar)">
        ↻ Actualizar listado
      </button>
    </header>

    <p v-if="error" class="me-aviso me-aviso-error" role="alert">⚠️ {{ error }}</p>
    <p v-if="mensaje" class="me-aviso me-aviso-ok" role="status">✓ {{ mensaje }}</p>

    <!-- RESULTADO Y CORRECCIONES -->
    <section v-if="resultadoFinal" class="me-final" data-testid="resultado-final">
      <button type="button" class="me-volver" @click="cerrarResultado">← Volver al listado</button>

      <div class="me-resumen" :class="'nivel-' + CLASE_NIVEL[resultadoFinal.nivel]" data-testid="resumen-resultado">
        <div class="me-cifra">
          <span class="me-pct">{{ formatearPorcentaje(resultadoFinal.porcentaje) }} %</span>
          <span class="me-pct-texto">logrado</span>
        </div>
        <div class="me-resumen-texto">
          <span class="chip-nivel" data-testid="nivel-logro">{{ ETIQUETA_NIVEL_RESULTADO[resultadoFinal.nivel] || 'Calificado' }}</span>
          <h2>{{ resultadoFinal.titulo }}</h2>
          <p>
            Obtuviste <strong>{{ formatearPorcentaje(resultadoFinal.puntaje) }}</strong> de
            <strong>{{ formatearPorcentaje(resultadoFinal.puntaje_maximo) }}</strong> puntos.
            {{ explicarNivel(resultadoFinal.nivel, resultadoFinal.umbral_logrado, resultadoFinal.umbral_medio) }}
          </p>
          <div class="me-barra" aria-hidden="true"><span :style="{ width: Math.min(100, Number(resultadoFinal.porcentaje) || 0) + '%' }"></span></div>
          <p v-if="conteoPreguntas.total" class="me-conteo" data-testid="conteo-preguntas">
            <span>✓ {{ conteoPreguntas.correcta }} correcta(s)</span>
            <span>✗ {{ conteoPreguntas.incorrecta }} incorrecta(s)</span>
            <span v-if="conteoPreguntas.pendiente">⏳ {{ conteoPreguntas.pendiente }} por revisar</span>
            <span v-if="conteoPreguntas.sin_responder">{{ conteoPreguntas.sin_responder }} sin responder</span>
          </p>
        </div>
      </div>

      <template v-if="resultadoFinal.preguntas.length">
        <h3 class="me-seccion">📝 Correcciones de las preguntas</h3>
        <article v-for="(p, i) in resultadoFinal.preguntas" :key="p.pregunta_id" class="me-correccion"
                 :class="'estado-' + estadoPregunta(p)" data-testid="correccion-pregunta">
          <div class="me-correccion-cabeza">
            <span class="me-numero">{{ i + 1 }}</span>
            <p class="me-enunciado">{{ p.enunciado }}</p>
          </div>
          <div class="me-correccion-estado">
            <span class="chip-estado" :class="'estado-' + estadoPregunta(p)">{{ ETIQUETA_ESTADO_PREGUNTA[estadoPregunta(p)] }}</span>
            <span class="me-puntos">{{ formatearPorcentaje(p.puntaje) }} / {{ formatearPorcentaje(p.puntaje_maximo) }} pts</span>
          </div>
          <dl class="me-respuestas">
            <div><dt>Tu respuesta</dt><dd>{{ formatearRespuesta(p) }}</dd></div>
            <div v-if="estadoPregunta(p) !== 'correcta' && formatearCorrecta(p) !== null">
              <dt>Respuesta correcta</dt><dd class="me-correcta">{{ formatearCorrecta(p) }}</dd>
            </div>
          </dl>
          <p v-if="estadoPregunta(p) === 'pendiente'" class="me-pista">Esta respuesta es abierta: la revisa tu profesor y todavía no suma puntos.</p>
          <p v-if="p.explicacion" class="me-explicacion">💡 {{ p.explicacion }}</p>
        </article>
      </template>

      <template v-if="resultadoFinal.ejercicios.length">
        <h3 class="me-seccion">🫀 Ejercicios aplicados</h3>
        <article v-for="(e, i) in resultadoFinal.ejercicios" :key="i" class="me-correccion me-correccion-ej"
                 :class="'estado-' + estadoEjercicio(e)" data-testid="correccion-ejercicio">
          <div class="me-correccion-cabeza">
            <span class="me-numero me-numero-ej">{{ i + 1 }}</span>
            <div>
              <p class="me-enunciado">{{ nombreEjercicio[e.ejercicio] || 'Ejercicio aplicado' }}</p>
              <p v-if="e.criterio" class="me-pista">Criterio: {{ describirCriterio(e.ejercicio, e.criterio) }}</p>
            </div>
          </div>
          <div class="me-correccion-estado">
            <span class="chip-estado" :class="'estado-' + estadoEjercicio(e)">{{ ETIQUETA_ESTADO_EJERCICIO[estadoEjercicio(e)] }}</span>
            <span class="me-puntos">
              {{ resultadoFinal.tipo === 'mixta' ? formatearPorcentaje(e.puntaje) + ' / ' + formatearPorcentaje(e.puntaje_maximo) + ' pts' : formatearPorcentaje(e.porcentaje) + ' %' }}
            </span>
          </div>
          <p v-if="e.motivo" class="me-explicacion">{{ e.motivo }}</p>
          <p v-else-if="!e.calificado" class="me-pista">No entregaste una medición para este ejercicio.</p>
        </article>
      </template>

      <div class="me-acciones me-acciones-final">
        <button type="button" class="btn btn-primary" @click="cerrarResultado">Volver al listado</button>
      </div>
    </section>

    <!-- LISTADO -->
    <template v-else-if="!seleccion">
      <p v-if="ocupado && !evaluaciones.length" class="me-vacio">Cargando evaluaciones…</p>
      <div v-else-if="!error && !evaluaciones.length" class="me-vacio" data-testid="sin-evaluaciones">
        <span class="me-vacio-icono" aria-hidden="true">📋</span>
        <strong>No tienes evaluaciones asignadas</strong>
        <span>Cuando tu profesor te asigne una, aparecerá aquí.</span>
      </div>

      <div class="me-grilla">
        <article v-for="ev in evaluaciones" :key="ev.id" class="me-tarjeta" :class="'estado-' + ev.disponibilidad" data-testid="tarjeta-evaluacion">
          <div class="me-chips">
            <span class="chip chip-tipo">{{ etiquetaTipo(ev.tipo, ev.ejercicio) }}</span>
            <span class="chip" :class="'chip-' + ev.disponibilidad">{{ estados[ev.disponibilidad] }}</span>
            <span class="chip chip-neutro">{{ ev.modo === 'en_vivo' ? '🔴 En vivo' : '📅 Ventana de fechas' }}</span>
          </div>

          <h2>{{ ev.titulo }}</h2>
          <p v-if="tiempoDe(ev)" class="me-tiempo" :class="'tiempo-' + tiempoDe(ev).tipo" data-testid="tiempo-evaluacion">
            <span aria-hidden="true">⏱</span> {{ tiempoDe(ev).texto }}
          </p>
          <p v-if="ev.descripcion" class="me-desc">{{ ev.descripcion }}</p>

          <dl v-if="ev.abre_en || ev.cierra_en" class="me-fechas">
            <div v-if="ev.abre_en"><dt>Apertura</dt><dd>{{ fechaLocal(ev.abre_en) }}</dd></div>
            <div v-if="ev.cierra_en"><dt>Cierre</dt><dd>{{ fechaLocal(ev.cierra_en) }}</dd></div>
          </dl>

          <!-- RF107: resultado -->
          <div v-if="resultadosEjercicio[ev.id]" class="me-resultado" :class="'nivel-' + claseNivel(resultadosEjercicio[ev.id].nivel)" data-testid="resultado-ejercicio">
            <div class="me-resultado-cabecera">
              <strong>{{ ETIQUETA_NIVEL[resultadosEjercicio[ev.id].nivel] || 'Calificado' }}</strong>
              <span>{{ resultadosEjercicio[ev.id].porcentaje }} %</span>
            </div>
            <div class="me-barra" aria-hidden="true"><span :style="{ width: Math.min(100, Number(resultadosEjercicio[ev.id].porcentaje) || 0) + '%' }"></span></div>
            <p v-if="resultadosEjercicio[ev.id].motivo">{{ resultadosEjercicio[ev.id].motivo }}</p>
            <p v-if="resultadosEjercicio[ev.id].restantes > 0" class="me-pista">Te quedan {{ resultadosEjercicio[ev.id].restantes }} intento(s).</p>
          </div>

          <button v-if="ev.disponibilidad === 'entregada'" type="button" class="btn me-cta" data-testid="ver-correcciones"
                  :disabled="ocupado" @click="verCorrecciones(ev)">
            Ver correcciones
          </button>
          <button
            v-if="ev.disponibilidad === 'disponible'
              || (ev.disponibilidad === 'entregada' && ev.tipo === 'ejercicio_aplicado'
                  && resultadosEjercicio[ev.id]?.restantes > 0)"
            type="button"
            class="btn btn-primary me-cta"
            :disabled="ocupado"
            @click="abrir(ev)"
          >
            {{ ev.disponibilidad === 'entregada' ? 'Repetir medición' : 'Rendir evaluación' }} →
          </button>
        </article>
      </div>
    </template>

    <!-- RENDIR LA EVALUACIÓN -->
    <form v-else class="me-form" data-testid="form-evaluacion" @submit.prevent="entregar">
      <section class="me-cabecera-form">
        <button type="button" class="me-volver" :disabled="ocupado" @click="volver">← Volver al listado</button>
        <span class="chip chip-tipo">{{ etiquetaTipo(seleccion.tipo, seleccion.ejercicio, ejerciciosMixta.length) }}</span>
        <h2>{{ seleccion.titulo }}</h2>
        <p v-if="tiempoEntrega" class="me-tiempo" :class="'tiempo-' + tiempoEntrega.tipo" role="timer" data-testid="tiempo-restante">
          <span aria-hidden="true">⏱</span> {{ tiempoEntrega.texto }}
        </p>
        <p v-if="seleccion.descripcion" class="me-desc">{{ seleccion.descripcion }}</p>

        <div class="me-progreso" data-testid="progreso">
          <div class="me-progreso-texto">
            <span>Avance</span>
            <strong>{{ pasosHechos }} de {{ totalPasos }}</strong>
          </div>
          <div class="me-barra" role="progressbar" :aria-valuenow="porcentajeAvance" aria-valuemin="0" aria-valuemax="100">
            <span :style="{ width: porcentajeAvance + '%' }"></span>
          </div>
        </div>
      </section>

      <!-- Preguntas -->
      <template v-if="seleccion.tipo === 'preguntas' || seleccion.tipo === 'mixta'">
        <h3 v-if="seleccion.tipo === 'mixta'" class="me-seccion">📝 Preguntas</h3>
        <section v-for="(pregunta, indice) in preguntas" :key="pregunta.id" class="me-pregunta"
                 :class="{ respondida: estaRespondida(pregunta) }" data-testid="pregunta">
          <div class="me-pregunta-cabeza">
            <span class="me-numero">{{ indice + 1 }}</span>
            <p class="me-enunciado" :id="'enunciado-' + pregunta.id">{{ pregunta.enunciado }}</p>
          </div>

          <div v-if="pregunta.tipo === 'opcion_multiple'" class="me-opciones" role="radiogroup" :aria-labelledby="'enunciado-' + pregunta.id">
            <label v-for="(opcion, i) in pregunta.opciones" :key="opcion.id" class="me-opcion"
                   :class="{ elegida: respuestas[pregunta.id] === opcion.id }">
              <input v-model="respuestas[pregunta.id]" type="radio" :name="'p-' + pregunta.id" :value="opcion.id" required />
              <span class="me-letra">{{ letra(i) }}</span>
              <span class="me-texto">{{ opcion.texto }}</span>
            </label>
          </div>

          <div v-else-if="pregunta.tipo === 'verdadero_falso'" class="me-opciones me-opciones-vf" role="radiogroup" :aria-labelledby="'enunciado-' + pregunta.id">
            <label class="me-opcion" :class="{ elegida: respuestas[pregunta.id] === true }">
              <input v-model="respuestas[pregunta.id]" type="radio" :name="'p-' + pregunta.id" :value="true" required />
              <span class="me-letra">V</span><span class="me-texto">Verdadero</span>
            </label>
            <label class="me-opcion" :class="{ elegida: respuestas[pregunta.id] === false }">
              <input v-model="respuestas[pregunta.id]" type="radio" :name="'p-' + pregunta.id" :value="false" required />
              <span class="me-letra">F</span><span class="me-texto">Falso</span>
            </label>
          </div>

          <input v-else-if="pregunta.tipo === 'numerica'" v-model.number="respuestas[pregunta.id]" class="me-campo"
                 type="number" step="any" placeholder="Escribe tu respuesta numérica" :aria-labelledby="'enunciado-' + pregunta.id" required />

          <textarea v-else v-model="respuestas[pregunta.id]" class="me-campo" rows="4"
                    placeholder="Escribe tu respuesta" :aria-labelledby="'enunciado-' + pregunta.id" required />
        </section>
      </template>

      <!-- RF107: ejercicios de la evaluación mixta -->
      <template v-if="seleccion.tipo === 'mixta'">
        <h3 class="me-seccion">🫀 Ejercicios aplicados</h3>
        <p class="me-pista">Elige una medición para cada ejercicio y pulsa «Calificar». Se califican al instante y debes calificar todos antes de entregar.</p>
        <section v-for="(ej, i) in ejerciciosMixta" :key="ej.id" class="me-pregunta me-ejercicio"
                 :class="{ respondida: resultadoPorEjercicio[ej.id] }" data-testid="ejercicio-mixto">
          <div class="me-pregunta-cabeza">
            <span class="me-numero me-numero-ej">{{ i + 1 }}</span>
            <div>
              <p class="me-enunciado">{{ nombreEjercicio[ej.ejercicio] }} <span class="chip chip-neutro">{{ ej.puntaje }} pts</span></p>
              <p class="me-pista">{{ describirCriterio(ej.ejercicio, ej.criterio) }}</p>
            </div>
          </div>
          <div class="me-fila-ejercicio">
            <select v-model="medicionPorEjercicio[ej.id]" class="me-campo" :aria-label="'Medición para el ejercicio ' + (i + 1)">
              <option :value="undefined" disabled>Selecciona una medición</option>
              <option v-for="medicion in mediciones" :key="medicion.id" :value="medicion.id">
                {{ fechaLocal(medicion.inicio) }} · {{ medicion.bpm_promedio ?? '—' }} BPM · {{ medicion.spo2_promedio ?? '—' }} % SpO₂
              </option>
            </select>
            <button type="button" class="btn btn-primary"
                    :disabled="ocupado || !medicionPorEjercicio[ej.id] || resultadoPorEjercicio[ej.id]?.intentos_restantes === 0"
                    @click="calificarMixto(ej)">
              {{ resultadoPorEjercicio[ej.id] ? 'Calificar de nuevo' : 'Calificar' }}
            </button>
          </div>
          <div v-if="resultadoPorEjercicio[ej.id]" class="me-resultado" :class="resultadoPorEjercicio[ej.id].cumple ? 'nivel-ok' : 'nivel-bajo'"
               role="status" data-testid="resultado-ejercicio-mixto">
            <div class="me-resultado-cabecera">
              <strong>{{ resultadoPorEjercicio[ej.id].cumple ? '✓ Cumple el criterio' : 'No cumple el criterio' }}</strong>
              <span>{{ resultadoPorEjercicio[ej.id].puntaje_obtenido }} / {{ resultadoPorEjercicio[ej.id].puntaje_ejercicio }} pts</span>
            </div>
            <p>{{ resultadoPorEjercicio[ej.id].motivo }}</p>
            <p v-if="resultadoPorEjercicio[ej.id].intentos_restantes > 0" class="me-pista">
              Te quedan {{ resultadoPorEjercicio[ej.id].intentos_restantes }} intento(s).
            </p>
          </div>
        </section>
        <p v-if="!mediciones.length" class="me-aviso me-aviso-error">Primero guarda una medición con buena señal en tu cuenta.</p>
      </template>

      <!-- Ejercicio aplicado simple -->
      <section v-if="seleccion.tipo === 'ejercicio_aplicado'" class="me-pregunta me-ejercicio">
        <div class="me-pregunta-cabeza">
          <span class="me-numero me-numero-ej">🫀</span>
          <div>
            <p class="me-enunciado">{{ nombreEjercicio[seleccion.ejercicio] || 'Ejercicio aplicado' }}</p>
            <p class="me-pista">{{ instruccionParaEstudiante(seleccion.tipo, seleccion.ejercicio) }}</p>
          </div>
        </div>
        <label class="me-etiqueta" for="rf109-medicion">Medición guardada</label>
        <select id="rf109-medicion" v-model="medicionId" class="me-campo" required>
          <option disabled value="">Selecciona una medición</option>
          <option v-for="medicion in mediciones" :key="medicion.id" :value="medicion.id">
            {{ fechaLocal(medicion.inicio) }} ·
            {{ medicion.bpm_promedio ?? '—' }} BPM ·
            {{ medicion.spo2_promedio ?? '—' }} % SpO₂
            <template v-if="medicion.calidad"> · señal {{ medicion.calidad }}</template>
          </option>
        </select>
        <p v-if="!mediciones.length" class="me-aviso me-aviso-error">Primero guarda una medición con buena señal en tu cuenta.</p>
        <p class="me-pista">
          Se califica automáticamente. La medición debe ser posterior a la apertura de la evaluación y no tener señal mala.
        </p>
      </section>

      <!-- Barra de acciones fija abajo -->
      <div class="me-acciones">
        <span class="me-acciones-texto">{{ pasosHechos }} de {{ totalPasos }} listo(s)</span>
        <button type="button" class="btn" :disabled="ocupado" @click="volver">Cancelar</button>
        <button type="submit" class="btn btn-primary" :disabled="ocupado">
          {{ ocupado ? 'Enviando…' : 'Entregar evaluación' }}
        </button>
      </div>
    </form>
  </main>
</template>

<style scoped>
.mis-evaluaciones { max-width: 860px; margin: 0 auto; padding: 1rem 16px 5rem; }
.me-encabezado { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; margin-bottom: 1rem; }
.me-encabezado h1 { margin: 0; font-size: 1.7rem; }
.me-sub { margin: 0.25rem 0 0; color: var(--color-muted); font-size: 0.95rem; }

.me-aviso { padding: 0.7rem 0.9rem; border-radius: 10px; margin: 0 0 1rem; font-size: 0.92rem; }
.me-aviso-error { background: #fef2f2; color: #991b1b; border: 1px solid #fecaca; }
.me-aviso-ok { background: #f0fdf4; color: #166534; border: 1px solid #bbf7d0; }

.me-vacio { display: flex; flex-direction: column; align-items: center; gap: 0.3rem; text-align: center; padding: 2.5rem 1rem;
  color: var(--color-muted); border: 2px dashed var(--color-border); border-radius: 14px; background: var(--color-surface); }
.me-vacio strong { color: var(--color-text); font-size: 1.05rem; }
.me-vacio-icono { font-size: 2rem; }

/* Listado */
.me-grilla { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fill, minmax(min(100%, 380px), 1fr)); }
.me-tarjeta { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 14px; padding: 1.1rem 1.2rem;
  display: flex; flex-direction: column; gap: 0.6rem; border-top: 4px solid var(--color-border); box-shadow: 0 1px 2px rgba(15, 23, 42, 0.04); }
.me-tarjeta.estado-disponible { border-top-color: var(--color-primary); }
.me-tarjeta.estado-entregada { border-top-color: var(--color-success); }
.me-tarjeta.estado-cerrada { border-top-color: var(--color-danger); }
.me-tarjeta.estado-pendiente { border-top-color: var(--color-warning); }
.me-tarjeta h2 { margin: 0; font-size: 1.15rem; line-height: 1.3; }
.me-desc { margin: 0; color: var(--color-muted); font-size: 0.92rem; line-height: 1.5; }
.me-chips { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.chip { display: inline-block; padding: 0.15rem 0.6rem; border-radius: 999px; font-size: 0.75rem; font-weight: 600; white-space: nowrap; }
.chip-tipo { background: #dbeafe; color: #1e3a8a; }
.chip-neutro { background: #f1f5f9; color: #475569; }
.chip-disponible { background: #dbeafe; color: #1e40af; }
.chip-entregada { background: #dcfce7; color: #166534; }
.chip-cerrada { background: #fee2e2; color: #991b1b; }
.chip-pendiente { background: #ffedd5; color: #9a3412; }
.me-fechas { display: flex; flex-wrap: wrap; gap: 0.4rem 1.5rem; margin: 0; font-size: 0.85rem; }
.me-fechas div { display: flex; gap: 0.4rem; }
.me-fechas dt { color: var(--color-muted); }
.me-fechas dd { margin: 0; font-weight: 600; }
.me-cta { margin-top: auto; align-self: flex-start; }

/* Tiempo para abrir o cerrar */
.me-tiempo { margin: 0; padding: 0.35rem 0.7rem; border-radius: 8px; font-size: 0.88rem; font-weight: 600; display: inline-flex; gap: 0.4rem; align-self: flex-start;
  background: #f1f5f9; color: #334155; }
.me-tiempo.tiempo-espera { background: #ffedd5; color: #9a3412; }
.me-tiempo.tiempo-abierta { background: #dbeafe; color: #1e40af; }
.me-tiempo.tiempo-urgente { background: #fef3c7; color: #92400e; animation: me-latido 1.6s ease-in-out infinite; }
.me-tiempo.tiempo-agotada { background: #fee2e2; color: #991b1b; }
@keyframes me-latido { 50% { opacity: 0.65; } }
@media (prefers-reduced-motion: reduce) { .me-tiempo.tiempo-urgente { animation: none; } }

/* Resultado */
.me-resultado { border-radius: 10px; padding: 0.7rem 0.85rem; background: #f8fafc; border: 1px solid var(--color-border); font-size: 0.9rem; }
.me-resultado p { margin: 0.3rem 0 0; }
.me-resultado-cabecera { display: flex; justify-content: space-between; gap: 0.5rem; margin-bottom: 0.4rem; }
.nivel-ok { background: #f0fdf4; border-color: #bbf7d0; }
.nivel-medio { background: #fffbeb; border-color: #fde68a; }
.nivel-bajo { background: #fef2f2; border-color: #fecaca; }
.me-barra { height: 8px; border-radius: 999px; background: #e2e8f0; overflow: hidden; }
.me-barra span { display: block; height: 100%; border-radius: 999px; background: var(--color-primary); transition: width 0.25s ease; }
.nivel-ok .me-barra span { background: var(--color-success); }
.nivel-medio .me-barra span { background: #d97706; }
.nivel-bajo .me-barra span { background: var(--color-danger); }
.me-pista { color: var(--color-muted); font-size: 0.85rem; margin: 0.2rem 0 0; }

/* Formulario */
.me-form { display: flex; flex-direction: column; gap: 1rem; }
.me-cabecera-form { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 14px; padding: 1.1rem 1.2rem;
  display: flex; flex-direction: column; gap: 0.5rem; align-items: flex-start; }
.me-cabecera-form h2 { margin: 0; font-size: 1.3rem; }
.me-volver { background: none; border: 0; padding: 0; cursor: pointer; color: var(--color-primary); font-weight: 600; font-size: 0.9rem; }
.me-progreso { width: 100%; margin-top: 0.4rem; }
.me-progreso-texto { display: flex; justify-content: space-between; font-size: 0.85rem; color: var(--color-muted); margin-bottom: 0.3rem; }
.me-progreso-texto strong { color: var(--color-text); }
.me-seccion { margin: 0.5rem 0 0; font-size: 1.05rem; }

.me-pregunta { background: var(--color-surface); border: 1px solid var(--color-border); border-left: 4px solid var(--color-border);
  border-radius: 14px; padding: 1rem 1.2rem; display: flex; flex-direction: column; gap: 0.75rem; transition: border-color 0.15s; }
.me-pregunta.respondida { border-left-color: var(--color-success); }
.me-pregunta-cabeza { display: flex; gap: 0.75rem; align-items: flex-start; }
.me-numero { flex: none; width: 2rem; height: 2rem; border-radius: 50%; background: #dbeafe; color: #1e3a8a; display: grid; place-items: center; font-weight: 700; font-size: 0.9rem; }
.me-numero-ej { background: #fee2e2; color: #991b1b; }
.me-enunciado { margin: 0.2rem 0 0; font-weight: 600; line-height: 1.45; }

.me-opciones { display: grid; gap: 0.5rem; }
.me-opciones-vf { grid-template-columns: 1fr 1fr; }
.me-opcion { display: flex; align-items: center; gap: 0.7rem; padding: 0.7rem 0.85rem; border: 1.5px solid var(--color-border);
  border-radius: 10px; cursor: pointer; min-height: var(--alto-tactil, 44px); background: #fff; transition: border-color 0.12s, background 0.12s; }
.me-opcion:hover { border-color: #93c5fd; background: #f8fbff; }
.me-opcion.elegida { border-color: var(--color-primary); background: #eff6ff; }
.me-opcion input { position: absolute; opacity: 0; pointer-events: none; }
.me-opcion:focus-within { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.me-letra { flex: none; width: 1.7rem; height: 1.7rem; border-radius: 50%; border: 1.5px solid #cbd5e1; display: grid; place-items: center;
  font-size: 0.8rem; font-weight: 700; color: #475569; }
.me-opcion.elegida .me-letra { background: var(--color-primary); border-color: var(--color-primary); color: #fff; }
.me-texto { line-height: 1.4; }

.me-campo { width: 100%; padding: 0.6rem 0.75rem; border: 1.5px solid var(--color-border); border-radius: 10px; font: inherit; background: #fff; min-height: var(--alto-tactil, 44px); }
.me-campo:focus { outline: 2px solid var(--color-primary); outline-offset: 1px; border-color: var(--color-primary); }
.me-etiqueta { font-weight: 600; font-size: 0.9rem; }
.me-fila-ejercicio { display: grid; grid-template-columns: 1fr auto; gap: 0.6rem; align-items: center; }

/* Resultado y correcciones */
.me-final { display: flex; flex-direction: column; gap: 1rem; }
.me-final > .me-volver { align-self: flex-start; }
.me-resumen { display: grid; grid-template-columns: auto 1fr; gap: 1.2rem; align-items: center; padding: 1.2rem 1.4rem;
  border-radius: 16px; border: 1px solid var(--color-border); background: var(--color-surface); border-left: 6px solid var(--color-border); }
.me-resumen.nivel-ok { border-left-color: var(--color-success); background: #f0fdf4; }
.me-resumen.nivel-medio { border-left-color: #d97706; background: #fffbeb; }
.me-resumen.nivel-bajo { border-left-color: var(--color-danger); background: #fef2f2; }
.me-cifra { display: flex; flex-direction: column; align-items: center; min-width: 7rem; }
.me-pct { font-size: 2.6rem; font-weight: 800; line-height: 1; }
.me-pct-texto { color: var(--color-muted); font-size: 0.85rem; }
.me-resumen-texto { display: flex; flex-direction: column; gap: 0.4rem; align-items: flex-start; min-width: 0; }
.me-resumen-texto h2 { margin: 0; font-size: 1.15rem; }
.me-resumen-texto p { margin: 0; font-size: 0.92rem; }
.me-resumen-texto .me-barra { width: 100%; }
.chip-nivel { display: inline-block; padding: 0.2rem 0.8rem; border-radius: 999px; font-weight: 700; font-size: 0.85rem; background: #e2e8f0; color: #334155; }
.nivel-ok .chip-nivel { background: #16a34a; color: #fff; }
.nivel-medio .chip-nivel { background: #d97706; color: #fff; }
.nivel-bajo .chip-nivel { background: #dc2626; color: #fff; }
.me-conteo { display: flex; flex-wrap: wrap; gap: 0.3rem 1rem; color: var(--color-muted); }

.me-correccion { background: var(--color-surface); border: 1px solid var(--color-border); border-left: 5px solid var(--color-border);
  border-radius: 14px; padding: 1rem 1.2rem; display: flex; flex-direction: column; gap: 0.6rem; }
.me-correccion.estado-correcta, .me-correccion.estado-cumple { border-left-color: var(--color-success); }
.me-correccion.estado-incorrecta, .me-correccion.estado-no_cumple { border-left-color: var(--color-danger); }
.me-correccion.estado-parcial, .me-correccion.estado-pendiente { border-left-color: #d97706; }
.me-correccion-cabeza { display: flex; gap: 0.75rem; align-items: flex-start; }
.me-correccion-estado { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.chip-estado { padding: 0.15rem 0.7rem; border-radius: 999px; font-size: 0.8rem; font-weight: 700; background: #f1f5f9; color: #475569; }
.chip-estado.estado-correcta, .chip-estado.estado-cumple { background: #dcfce7; color: #166534; }
.chip-estado.estado-incorrecta, .chip-estado.estado-no_cumple { background: #fee2e2; color: #991b1b; }
.chip-estado.estado-parcial, .chip-estado.estado-pendiente { background: #fef3c7; color: #92400e; }
.me-puntos { font-weight: 700; font-size: 0.9rem; }
.me-respuestas { margin: 0; display: grid; gap: 0.4rem; }
.me-respuestas div { display: flex; flex-direction: column; gap: 0.1rem; padding: 0.5rem 0.75rem; border-radius: 8px; background: #f8fafc; }
.me-respuestas dt { font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-muted); }
.me-respuestas dd { margin: 0; font-weight: 600; }
.me-respuestas .me-correcta { color: #166534; }
.me-explicacion { margin: 0; padding: 0.55rem 0.8rem; border-radius: 8px; background: #eff6ff; color: #1e3a8a; font-size: 0.9rem; line-height: 1.5; }
.me-acciones-final { justify-content: flex-end; }

@media (max-width: 560px) {
  .me-resumen { grid-template-columns: 1fr; text-align: left; }
  .me-cifra { flex-direction: row; gap: 0.5rem; align-items: baseline; }
}

/* Barra de acciones */
.me-acciones { position: sticky; bottom: 0; z-index: 5; display: flex; align-items: center; justify-content: flex-end; gap: 0.6rem; flex-wrap: wrap;
  padding: 0.75rem 1rem; margin-top: 0.5rem; background: rgba(255, 255, 255, 0.96); backdrop-filter: blur(4px);
  border: 1px solid var(--color-border); border-radius: 14px; box-shadow: 0 -4px 14px rgba(15, 23, 42, 0.06); }
.me-acciones-texto { margin-right: auto; color: var(--color-muted); font-size: 0.88rem; }

@media (max-width: 560px) {
  .me-opciones-vf { grid-template-columns: 1fr; }
  .me-fila-ejercicio { grid-template-columns: 1fr; }
  .me-acciones .btn { flex: 1; }
  .me-acciones-texto { flex-basis: 100%; }
}
</style>
