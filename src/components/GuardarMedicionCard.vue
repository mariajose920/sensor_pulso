<template>
  <div class="card guardar-medicion" style="margin-bottom: 1rem; padding: 0.75rem 1.25rem;">
    <div class="guardar-fila">
      <div class="guardar-texto">
        <strong>Guardar esta medición en tu historial</strong>
        <span class="guardar-resumen">
          <template v-if="tieneMedicion">
            {{ bpm }} BPM<template v-if="spo2 > 0"> · {{ spo2 }} % SpO₂</template>
            <template v-if="canal"> · Canal {{ canal }}</template>
          </template>
          <template v-else>Todavía no hay una medición para guardar.</template>
        </span>
      </div>

      <button
        type="button"
        class="btn btn-primary guardar-boton"
        :disabled="!puedeIntentar || guardando"
        @click="guardar"
      >
        {{ guardando ? 'Guardando…' : yaGuardada ? 'Guardada ✔' : 'Guardar medición' }}
      </button>
    </div>

    <p v-if="!isAuthenticated" class="guardar-aviso">
      Para guardar necesitas <router-link to="/login">iniciar sesión</router-link>.
    </p>
    <p v-else-if="!guardable && tieneMedicion" class="guardar-aviso guardar-error" role="alert">
      {{ MENSAJES_GUARDADO.calidad_mala }}
    </p>

    <p v-if="resultado" class="guardar-aviso" :class="{ 'guardar-error': !resultado.ok }" :role="resultado.ok ? 'status' : 'alert'">
      {{ resultado.mensaje }}
      <router-link v-if="resultado.ok" to="/historial">Ver historial</router-link>
      <button
        v-if="resultado.motivo === 'consentimiento'"
        type="button"
        class="btn btn-secondary guardar-enlace"
        @click="emit('solicitar-consentimiento', guardar)"
      >
        Aceptar consentimiento
      </button>
    </p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { useAuth } from '../composables/useAuth'
import { guardarMedicion } from '../services/medicionesService'
import { MENSAJES_GUARDADO } from '../utils/medicion'
import { explicarCalidad, puedeGuardarComoValida } from '../utils/explicacionCalidad'

// RF30: guarda la medición en la cuenta. RF16: con calidad mala no se guarda como válida y se avisa.
const props = defineProps({
  bpm: { type: Number, default: 0 },
  spo2: { type: Number, default: 0 },
  rmssd: { type: Number, default: 0 },
  sdnn: { type: Number, default: 0 },
  ritmo: { type: String, default: null },            // normal | taquicardia | bradicardia | irregular
  explicacionRitmo: { type: String, default: null },
  calidad: { type: String, default: 'sin_senal' },
  causasCalidad: { type: Array, default: () => [] },
  fuente: { type: String, default: 'sensor' },       // sensor | simulador
  canal: { type: Number, default: null },
  paciente: { type: Object, default: null }          // declaración activa (RF03): id y edad
})
const emit = defineEmits(['solicitar-consentimiento', 'guardada'])

const { isAuthenticated } = useAuth()

const guardando = ref(false)
const yaGuardada = ref(false)
const resultado = ref(null)
const inicio = ref(null)
const idCliente = ref(null)

const tieneMedicion = computed(() => props.bpm > 0)
const guardable = computed(() => puedeGuardarComoValida(props.calidad))
const puedeIntentar = computed(
  () => isAuthenticated.value && tieneMedicion.value && guardable.value && !yaGuardada.value
)

// Una medición nueva empieza cuando el BPM pasa de 0 a un valor; entonces se libera el botón.
watch(() => props.bpm > 0, (hay) => {
  if (hay) {
    inicio.value = new Date()
    idCliente.value = null
  } else {
    inicio.value = null
    yaGuardada.value = false
    resultado.value = null
  }
}, { immediate: true })

watch(() => props.canal, () => {
  yaGuardada.value = false
  resultado.value = null
  idCliente.value = null
})

async function guardar() {
  if (guardando.value || !puedeIntentar.value) return
  guardando.value = true
  resultado.value = null
  try {
    const aviso = explicarCalidad(props.calidad, props.causasCalidad)
    const respuesta = await guardarMedicion({
      idCliente: idCliente.value || undefined,
      fuente: props.fuente,
      canal: props.canal,
      bpm: props.bpm,
      spo2: props.spo2 || null,
      rmssd: props.rmssd,
      sdnn: props.sdnn,
      ritmo: props.ritmo,
      explicacionRitmo: props.explicacionRitmo,
      calidad: props.calidad,
      causaCalidad: aviso?.causaGuardable || null,
      declaracionId: props.paciente?.id || null,
      edad: props.paciente?.edad || null,
      inicio: inicio.value,
      fin: new Date()
    })
    resultado.value = respuesta
    if (respuesta.ok) {
      yaGuardada.value = true
      emit('guardada', respuesta)
    }
  } finally {
    guardando.value = false
  }
}
</script>

<style scoped>
.guardar-fila { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
.guardar-texto { display: flex; flex-direction: column; gap: 0.1rem; font-size: 0.9rem; }
.guardar-resumen { color: var(--color-muted); font-size: 0.82rem; }
.guardar-boton { font-size: 0.85rem; padding: 0.4rem 1rem; }
.guardar-aviso { margin: 0.5rem 0 0; font-size: 0.82rem; color: var(--color-muted); }
.guardar-error { color: var(--color-danger); font-weight: 600; }
.guardar-enlace { font-size: 0.78rem; padding: 0.2rem 0.6rem; margin-left: 0.5rem; }
</style>
