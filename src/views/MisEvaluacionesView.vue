<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { supabase } from '../services/supabase.js'
import { enviarRespuestasConResiliencia } from '../services/respuestasSimultaneasService.js'
import { iniciarHeartbeatEstudiante, desconectarEstudiante } from '../services/panelEnVivoService.js'
import { calificarEjercicioAplicado, calificarEjercicioMixto } from '../services/calificacionEjercicioService.js'
import { ETIQUETA_NIVEL, resumenResultado } from '../utils/calificacionEjercicio.js'

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
  mensaje.value = resultadoReciente ? resumenResultado(resultadoReciente) : 'Evaluación entregada.'
  await cargar()
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

onMounted(() => ejecutar(cargar))
onUnmounted(() => {
  if (heartbeatControl) {
    heartbeatControl.detener()
    heartbeatControl = null
  }
})
</script>

<template>
  <main class="card">
    <h1>Mis evaluaciones</h1>
    <p v-if="error" role="alert">{{ error }}</p>
    <p v-if="mensaje" role="status">{{ mensaje }}</p>

    <template v-if="!seleccion">
      <button type="button" class="btn" :disabled="ocupado" @click="ejecutar(cargar)">
        Actualizar listado
      </button>

      <p v-if="!ocupado && !error && !evaluaciones.length">
        No tienes evaluaciones asignadas.
      </p>

      <article v-for="ev in evaluaciones" :key="ev.id" class="card">
        <h2>{{ ev.titulo }}</h2>
        <p v-if="ev.descripcion">{{ ev.descripcion }}</p>
        <p>
          {{ ev.modo === 'en_vivo' ? 'En vivo' : 'Ventana de fechas' }}
          · {{ estados[ev.disponibilidad] }}
        </p>
        <p v-if="ev.abre_en">Apertura {{ fechaLocal(ev.abre_en) }}</p>
        <p v-if="ev.cierra_en">Cierre {{ fechaLocal(ev.cierra_en) }}</p>

        <!-- RF107: resultado del ejercicio aplicado -->
        <div v-if="resultadosEjercicio[ev.id]" class="resultado-ejercicio" data-testid="resultado-ejercicio">
          <p><strong>{{ ETIQUETA_NIVEL[resultadosEjercicio[ev.id].nivel] || 'Calificado' }}</strong>
            · {{ resultadosEjercicio[ev.id].porcentaje }} %</p>
          <p v-if="resultadosEjercicio[ev.id].motivo">{{ resultadosEjercicio[ev.id].motivo }}</p>
          <p v-if="resultadosEjercicio[ev.id].restantes > 0">
            Te quedan {{ resultadosEjercicio[ev.id].restantes }} intento(s).
          </p>
        </div>
        <button
          v-if="ev.disponibilidad === 'disponible'
            || (ev.disponibilidad === 'entregada' && ev.tipo === 'ejercicio_aplicado'
                && resultadosEjercicio[ev.id]?.restantes > 0)"
          type="button"
          class="btn btn-primary"
          :disabled="ocupado"
          @click="abrir(ev)"
        >
          {{ ev.disponibilidad === 'entregada' ? 'Repetir medición' : 'Rendir evaluación' }}
        </button>
      </article>
    </template>

    <form v-else @submit.prevent="entregar">
      <h2>{{ seleccion.titulo }}</h2>

      <template v-if="seleccion.tipo === 'preguntas' || seleccion.tipo === 'mixta'">
        <fieldset v-for="pregunta in preguntas" :key="pregunta.id">
          <legend>{{ pregunta.enunciado }}</legend>

          <select
            v-if="pregunta.tipo === 'opcion_multiple'"
            v-model="respuestas[pregunta.id]"
            :aria-label="pregunta.enunciado"
            required
          >
            <option disabled value="">Selecciona una alternativa</option>
            <option v-for="opcion in pregunta.opciones" :key="opcion.id" :value="opcion.id">
              {{ opcion.texto }}
            </option>
          </select>

          <select
            v-else-if="pregunta.tipo === 'verdadero_falso'"
            v-model="respuestas[pregunta.id]"
            :aria-label="pregunta.enunciado"
            required
          >
            <option :value="true">Verdadero</option>
            <option :value="false">Falso</option>
          </select>

          <input
            v-else-if="pregunta.tipo === 'numerica'"
            v-model.number="respuestas[pregunta.id]"
            type="number"
            step="any"
            :aria-label="pregunta.enunciado"
            required
          />

          <textarea
            v-else
            v-model="respuestas[pregunta.id]"
            :aria-label="pregunta.enunciado"
            required
          />
        </fieldset>
      </template>

      <!-- RF107: ejercicios de la evaluación mixta -->
      <template v-if="seleccion.tipo === 'mixta'">
        <h3>Ejercicios aplicados</h3>
        <p class="ayuda-ejercicio">
          Cada ejercicio se califica automáticamente al elegir una medición y pulsar «Calificar». Debes calificar todos antes de entregar.
        </p>
        <fieldset v-for="(ej, i) in ejerciciosMixta" :key="ej.id" class="ejercicio-mixto" data-testid="ejercicio-mixto">
          <legend>Ejercicio {{ i + 1 }}: {{ nombreEjercicio[ej.ejercicio] }} ({{ ej.puntaje }} pts)</legend>
          <select v-model="medicionPorEjercicio[ej.id]" :aria-label="'Medición para el ejercicio ' + (i + 1)">
            <option :value="undefined" disabled>Selecciona una medición</option>
            <option v-for="medicion in mediciones" :key="medicion.id" :value="medicion.id">
              {{ fechaLocal(medicion.inicio) }} · {{ medicion.bpm_promedio ?? '—' }} BPM · {{ medicion.spo2_promedio ?? '—' }} % SpO₂
            </option>
          </select>
          <button type="button" class="btn"
                  :disabled="ocupado || !medicionPorEjercicio[ej.id] || resultadoPorEjercicio[ej.id]?.intentos_restantes === 0"
                  @click="calificarMixto(ej)">
            {{ resultadoPorEjercicio[ej.id] ? 'Calificar de nuevo' : 'Calificar' }}
          </button>
          <p v-if="resultadoPorEjercicio[ej.id]" role="status" data-testid="resultado-ejercicio-mixto">
            {{ resultadoPorEjercicio[ej.id].motivo }}
            Puntos: {{ resultadoPorEjercicio[ej.id].puntaje_obtenido }} / {{ resultadoPorEjercicio[ej.id].puntaje_ejercicio }}.
            <template v-if="resultadoPorEjercicio[ej.id].intentos_restantes > 0">
              Te quedan {{ resultadoPorEjercicio[ej.id].intentos_restantes }} intento(s).
            </template>
          </p>
        </fieldset>
        <p v-if="!mediciones.length">Primero guarda una medición con buena señal en tu cuenta.</p>
      </template>

      <template v-if="seleccion.tipo === 'ejercicio_aplicado'">
        <label for="rf109-medicion">Medición guardada</label>
        <select id="rf109-medicion" v-model="medicionId" required>
          <option disabled value="">Selecciona una medición</option>
          <option v-for="medicion in mediciones" :key="medicion.id" :value="medicion.id">
            {{ fechaLocal(medicion.inicio) }} ·
            {{ medicion.bpm_promedio ?? '—' }} BPM ·
            {{ medicion.spo2_promedio ?? '—' }} % SpO₂
            <template v-if="medicion.calidad"> · señal {{ medicion.calidad }}</template>
          </option>
        </select>
        <p v-if="!mediciones.length">Primero guarda una medición con buena señal en tu cuenta.</p>
        <p class="ayuda-ejercicio">
          Se califica automáticamente. La medición debe ser posterior a la apertura de la evaluación y no tener señal mala.
        </p>
      </template>

      <button type="button" class="btn" :disabled="ocupado" @click="volver">
        Volver al listado
      </button>
      <button type="submit" class="btn btn-primary" :disabled="ocupado">
        Entregar evaluación
      </button>
    </form>
  </main>
</template>