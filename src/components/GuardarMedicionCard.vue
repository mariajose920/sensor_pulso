<template>
  <div class="card guardar-medicion" style="margin-bottom: 1rem; padding: 0.75rem 1.25rem;">
    <!-- Medición finalizada: resumen de lo decidido y salida para empezar otra -->
    <div v-if="finalizada" class="guardar-fila" data-testid="medicion-finalizada">
      <div class="guardar-texto">
        <strong>Medición finalizada</strong>
        <span class="guardar-resumen">
          {{ guardadaAlFinalizar ? 'Se guardó en tu historial.' : 'No se guardó.' }}
          <router-link v-if="guardadaAlFinalizar" to="/historial">Ver historial</router-link>
        </span>
      </div>
      <button type="button" class="btn btn-primary guardar-boton" @click="nuevaMedicion">Nueva medición</button>
    </div>

    <div v-else class="guardar-fila">
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

      <div class="guardar-botones">
        <button
          type="button"
          class="btn btn-secondary guardar-boton"
          data-testid="finalizar-medicion"
          :disabled="guardando"
          @click="abrirFinalizar"
        >
          Finalizar medición
        </button>
        <button
          type="button"
          class="btn btn-primary guardar-boton"
          :disabled="!puedeIntentar || guardando"
          @click="guardar"
        >
          {{ guardando ? 'Guardando…' : yaGuardada ? 'Guardada ✔' : 'Guardar medición' }}
        </button>
      </div>
    </div>

    <!-- Al finalizar se pregunta si se guarda -->
    <div v-if="confirmando" class="modal-backdrop" @click.self="cancelarFinalizar">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="finalizar-titulo" data-testid="dialogo-finalizar">
        <h3 id="finalizar-titulo" class="modal-title">
          {{ yaGuardada ? 'Finalizar la medición' : '¿Quieres guardar la medición?' }}
        </h3>
        <p class="modal-resumen">
          <template v-if="tieneMedicion">
            {{ bpm }} BPM<template v-if="spo2 > 0"> · {{ spo2 }} % SpO₂</template><template v-if="canal"> · Canal {{ canal }}</template>
          </template>
          <template v-else>Todavía no hay una medición con BPM.</template>
        </p>
        <p v-if="yaGuardada" class="modal-nota">Esta medición ya está guardada en tu historial.</p>
        <p v-else-if="!isAuthenticated" class="modal-nota">
          Para guardarla necesitas <router-link to="/login">iniciar sesión</router-link>.
        </p>
        <p v-else-if="!tieneMedicion" class="modal-nota">{{ MENSAJES_GUARDADO.sin_datos }}</p>
        <p v-else-if="!guardable" class="modal-nota guardar-error" role="alert">{{ MENSAJES_GUARDADO.calidad_mala }}</p>

        <p v-if="resultado && !resultado.ok" class="modal-nota guardar-error" role="alert">
          {{ resultado.mensaje }}
          <button
            v-if="resultado.motivo === 'consentimiento'"
            type="button"
            class="btn btn-secondary guardar-enlace"
            @click="emit('solicitar-consentimiento', guardar)"
          >
            Aceptar consentimiento
          </button>
        </p>

        <div class="modal-actions">
          <button
            v-if="!yaGuardada"
            type="button"
            class="btn btn-primary"
            data-testid="finalizar-guardar"
            :disabled="!puedeIntentar || guardando"
            @click="guardarYFinalizar"
          >
            {{ guardando ? 'Guardando…' : 'Sí, guardar' }}
          </button>
          <button type="button" class="btn btn-secondary" data-testid="finalizar-no-guardar" :disabled="guardando" @click="terminar(yaGuardada)">
            {{ yaGuardada ? 'Finalizar' : 'No guardar' }}
          </button>
          <button type="button" class="btn btn-secondary" :disabled="guardando" @click="cancelarFinalizar">
            Seguir midiendo
          </button>
        </div>
      </div>
    </div>

    <p v-if="!finalizada && !isAuthenticated" class="guardar-aviso">
      Para guardar necesitas <router-link to="/login">iniciar sesión</router-link>.
    </p>
    <p v-else-if="!finalizada && !guardable && tieneMedicion" class="guardar-aviso guardar-error" role="alert">
      {{ MENSAJES_GUARDADO.calidad_mala }}
    </p>

    <p v-if="resultado && !confirmando" class="guardar-aviso" :class="{ 'guardar-error': !resultado.ok }" :role="resultado.ok ? 'status' : 'alert'">
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
const emit = defineEmits(['solicitar-consentimiento', 'guardada', 'finalizada', 'nueva'])

const { isAuthenticated } = useAuth()

const confirmando = ref(false)
const finalizada = ref(false)
const guardadaAlFinalizar = ref(false)
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
  finalizada.value = false
  confirmando.value = false
  yaGuardada.value = false
  resultado.value = null
  idCliente.value = null
})

// Finalizar: pregunta si se guarda; la medición termina al guardar o al elegir no guardar
function abrirFinalizar() {
  resultado.value = null
  confirmando.value = true
}

function cancelarFinalizar() {
  if (guardando.value) return
  confirmando.value = false
}

function terminar(guardada) {
  confirmando.value = false
  finalizada.value = true
  guardadaAlFinalizar.value = guardada
  emit('finalizada', { guardada })
}

async function guardarYFinalizar() {
  await guardar()
  if (yaGuardada.value) terminar(true)
}

function nuevaMedicion() {
  finalizada.value = false
  guardadaAlFinalizar.value = false
  yaGuardada.value = false
  resultado.value = null
  idCliente.value = null
  inicio.value = props.bpm > 0 ? new Date() : null
  emit('nueva')
}

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
.guardar-botones { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}
.modal-card {
  background: var(--color-surface);
  border-radius: 0.75rem;
  max-width: 460px;
  width: 100%;
  padding: 1.5rem;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
}
.modal-title { font-size: 1.15rem; font-weight: 700; margin: 0 0 0.5rem; }
.modal-resumen { font-weight: 600; margin: 0 0 0.5rem; }
.modal-nota { margin: 0.5rem 0; font-size: 0.85rem; color: var(--color-muted); }
.modal-actions { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: flex-end; margin-top: 1rem; }
.modal-actions .btn { min-height: var(--alto-tactil); }
.guardar-aviso { margin: 0.5rem 0 0; font-size: 0.82rem; color: var(--color-muted); }
.guardar-error { color: var(--color-danger); font-weight: 600; }
.guardar-enlace { font-size: 0.78rem; padding: 0.2rem 0.6rem; margin-left: 0.5rem; }
</style>
