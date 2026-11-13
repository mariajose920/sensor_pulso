<script setup>
import { onMounted, onUnmounted, ref } from 'vue'
import { supabase } from '../services/supabase.js'
import { enviarRespuestasConResiliencia } from '../services/respuestasSimultaneasService.js'
import { iniciarHeartbeatEstudiante, desconectarEstudiante } from '../services/panelEnVivoService.js'
import { calificarEjercicioAplicado } from '../services/calificacionEjercicioService.js'
import { ETIQUETA_NIVEL, resumenResultado } from '../utils/calificacionEjercicio.js'

const evaluaciones = ref([])
const seleccion = ref(null)
const intentoId = ref(null)
const preguntas = ref([])
const respuestas = ref({})
const mediciones = ref([])
const resultadosEjercicio = ref({}) // RF107: último resultado por evaluación
const medicionId = ref('')
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
  const ejercicios = evaluaciones.value.filter(ev => ev.tipo === 'ejercicio_aplicado')
  if (!ejercicios.length) { resultadosEjercicio.value = {}; return }
  const ids = ejercicios.map(ev => ev.id)
  const [{ data: intentos }, { data: configuracion }] = await Promise.all([
    supabase.from('intentos_evaluacion')
      .select('evaluacion_id, porcentaje, nivel, detalle, calificaciones').in('evaluacion_id', ids),
    supabase.from('evaluaciones').select('id, max_reintentos').in('id', ids)
  ])
  const maximos = Object.fromEntries((configuracion || []).map(c => [c.id, c.max_reintentos || 1]))
  const resultado = {}
  for (const i of intentos || []) {
    if (!i.calificaciones) continue
    resultado[i.evaluacion_id] = {
      ...(i.detalle || {}), nivel: i.nivel, porcentaje: i.porcentaje,
      restantes: Math.max(0, (maximos[i.evaluacion_id] || 1) - i.calificaciones)
    }
  }
  resultadosEjercicio.value = resultado
}

const abrir = (ev) => ejecutar(async () => {
  mensaje.value = ''
  const { data: id, error: falloInicio } = await supabase.rpc('iniciar_intento', {
    p_eval: ev.id
  })
  if (falloInicio) throw falloInicio

  if (ev.tipo === 'preguntas') {
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
  } else {
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
  if (ev.tipo === 'preguntas') {
    // RF110: Envío optimizado resiliente a alta concurrencia simultánea
    const resultado = await enviarRespuestasConResiliencia({
      evaluacionId: ev.id,
      intentoId: intentoId.value,
      respuestas: respuestas.value
    })
    if (!resultado.success && !resultado.enCola) {
      throw new Error(resultado.error || 'Error al guardar respuestas')
    }
  } else {
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
          <p>{{ resultadosEjercicio[ev.id].motivo }}</p>
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

      <template v-if="seleccion.tipo === 'preguntas'">
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

      <template v-else>
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