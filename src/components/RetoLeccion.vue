<script setup>
import { computed, ref } from 'vue'
import { useAuth } from '../composables/useAuth.js'
import { supabase } from '../services/supabase.js'

const props = defineProps({
  slug: { type: String, required: true },
  preguntas: { type: Array, required: true }
})

const { isAuthenticated } = useAuth()
const respuestas = ref({})
const resultado = ref(null)
const enviando = ref(false)
const error = ref('')

const listo = computed(() => props.preguntas.every(pregunta => respuestas.value[pregunta.id]))

const textoCorrecto = (pregunta) => {
  const idCorrecto = resultado.value.correccion[pregunta.id].correcta
  return pregunta.opciones.find(opcion => opcion.id === idCorrecto)?.texto
}

const corregir = async () => {
  if (!listo.value || enviando.value) return

  enviando.value = true
  error.value = ''

  try {
    const { data, error: fallo } = await supabase.rpc('resolver_reto_leccion', {
      p_slug: props.slug,
      p_respuestas: respuestas.value
    })

    if (fallo) throw fallo
    resultado.value = data
  } catch (fallo) {
    error.value = fallo.message || 'No se pudo corregir el reto. Intenta de nuevo.'
  } finally {
    enviando.value = false
  }
}

const repetir = () => {
  respuestas.value = {}
  resultado.value = null
  error.value = ''
}
</script>

<template>
  <section class="card">
    <h2>Reto de la lección</h2>
    <p>Práctica personal. No cuenta como evaluación de aula.</p>

    <p v-if="!isAuthenticated">
      Inicia sesión para resolver el reto y guardar tu progreso.
    </p>

    <form v-else @submit.prevent="corregir">
      <fieldset v-for="pregunta in preguntas" :key="pregunta.id" :disabled="enviando || !!resultado">
        <legend>{{ pregunta.enunciado }}</legend>

        <div v-for="opcion in pregunta.opciones" :key="opcion.id">
          <label>
            <input v-model="respuestas[pregunta.id]" type="radio" :name="pregunta.id" :value="opcion.id" required />
            {{ opcion.texto }}
          </label>
        </div>

        <p v-if="resultado">
          {{ resultado.correccion[pregunta.id].acierto ? 'Correcto.' : `Respuesta correcta: ${textoCorrecto(pregunta)}` }}
        </p>
      </fieldset>

      <p v-if="error" role="alert">{{ error }}</p>

      <template v-if="resultado">
        <p role="status">
          Aciertos {{ resultado.aciertos }} de {{ resultado.total }}.
          Puntaje {{ resultado.puntaje }} %.
          Mejor puntaje {{ resultado.mejorPuntaje }} %.
        </p>
        <button type="button" class="btn btn-secondary" @click="repetir">Repetir reto</button>
      </template>

      <button v-else type="submit" class="btn btn-primary" :disabled="enviando || !listo">
        {{ enviando ? 'Corrigiendo…' : 'Ver resultado' }}
      </button>
    </form>
  </section>
</template>