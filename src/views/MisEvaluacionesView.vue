<script setup>
import { onMounted, ref } from 'vue'
import { supabase } from '../services/supabase.js'

const evaluaciones = ref([])
const seleccion = ref(null)
const intentoId = ref(null)
const preguntas = ref([])
const respuestas = ref({})
const mediciones = ref([])
const medicionId = ref('')
const ocupado = ref(false)
const error = ref('')
const mensaje = ref('')

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
      .select('id, inicio, bpm_promedio, spo2_promedio')
      .eq('usuario_id', usuario.user.id)
      .order('inicio', { ascending: false })
      .limit(50)

    if (falloMediciones) throw falloMediciones
    mediciones.value = data
    medicionId.value = ''
  }

  intentoId.value = id
  seleccion.value = ev
})

const entregar = () => ejecutar(async () => {
  const ev = seleccion.value
  if (ev.tipo === 'preguntas') {
    const { error: fallo } = await supabase.rpc('entregar_evaluacion_rf109', {
      p_evaluacion_id: ev.id,
      p_intento_id: intentoId.value,
      p_respuestas: respuestas.value
    })
    if (fallo) throw fallo
  } else {
    const { error: fallo } = await supabase.rpc('calificar_ejercicio', {
      p_intento: intentoId.value,
      p_medicion: medicionId.value
    })
    if (fallo) throw fallo
  }

  seleccion.value = null
  mensaje.value = 'Evaluación entregada.'
  await cargar()
})

const volver = () => ejecutar(async () => {
  seleccion.value = null
  await cargar()
})

const fechaLocal = valor => new Date(valor).toLocaleString('es-CL')

onMounted(() => ejecutar(cargar))
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

        <p v-if="ev.disponibilidad === 'disponible' && ev.ejercicio === 'comparar_senales'">
          La entrega de ejercicios de comparación de señales aún no está disponible aquí.
        </p>
        <button
          v-else-if="ev.disponibilidad === 'disponible'"
          type="button"
          class="btn btn-primary"
          :disabled="ocupado"
          @click="abrir(ev)"
        >
          Rendir evaluación
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
          </option>
        </select>
        <p v-if="!mediciones.length">Primero guarda una medición en tu cuenta.</p>
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