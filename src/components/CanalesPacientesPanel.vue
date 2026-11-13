<template>
  <section class="agregar-canal" aria-label="Agregar canal de medición" data-testid="canales-pacientes">
    <!-- Estudiante: un solo canal y un solo paciente, él mismo -->
    <template v-if="esEstudiante">
      <button
        v-if="!miCanalAsignado"
        type="button"
        class="btn btn-primary"
        data-testid="agregar-mi-canal"
        :disabled="!estadoAsignacionEstudiante.puede || canalesState.cargando"
        :title="estadoAsignacionEstudiante.puede ? 'Se te asigna el siguiente canal libre, con tus datos' : estadoAsignacionEstudiante.motivo"
        @click="modalVisible = true"
      >
        ➕ Agregar mi canal
      </button>
      <template v-else>
        <span class="mi-canal" data-testid="mi-canal-asignado">✓ Tu canal: <strong>Canal {{ miCanalAsignado }}</strong></span>
        <button type="button" class="btn btn-secondary btn-sm" data-testid="liberar-mi-canal" :disabled="canalesState.cargando" @click="liberarMiCanal">
          Liberar mi canal
        </button>
      </template>
      <p v-if="!miCanalAsignado && !estadoAsignacionEstudiante.puede" class="nota" data-testid="agregar-canal-motivo">{{ estadoAsignacionEstudiante.motivo }}</p>
      <p v-else-if="!miCanalAsignado" class="nota" data-testid="sin-pacientes">
        Pulsa «Agregar mi canal» para ingresar tus datos: solo puedes medirte a ti mismo y al terminar aparece tu gráfica.
      </p>
      <p v-else class="nota" data-testid="un-solo-canal">Tienes un solo canal y el paciente eres tú. Libéralo si necesitas volver a empezar.</p>
      <p v-if="mensajeError" class="nota nota-error" role="alert">{{ mensajeError }}</p>
    </template>

    <!-- Profesor y administrador: varios pacientes -->
    <template v-else>
      <button
        type="button"
        class="btn btn-primary"
        data-testid="agregar-otro-canal"
        :disabled="!estadoAgregarCanal.puede || canalesState.cargando"
        :title="estadoAgregarCanal.puede ? 'Agregar un paciente: se le asigna el siguiente canal libre' : estadoAgregarCanal.motivo"
        @click="modalVisible = true"
      >
        ➕ {{ misCanales.length ? 'Agregar otro canal' : 'Agregar canal' }}
      </button>
      <p v-if="!estadoAgregarCanal.puede" class="nota" data-testid="agregar-canal-motivo">{{ estadoAgregarCanal.motivo }}</p>
      <p v-else-if="!misCanales.length" class="nota" data-testid="sin-pacientes">
        Pulsa «Agregar canal» para ingresar los datos del paciente: al terminar aparece su gráfica.
      </p>
    </template>

    <AgregarCanalModal
      :visible="modalVisible"
      :modo="esEstudiante ? 'estudiante' : 'docente'"
      :canal-existente="null"
      @cerrar="modalVisible = false"
      @agregado="alAgregar"
    />
  </section>
</template>

<script setup>
import { ref, computed } from 'vue'
import AgregarCanalModal from './AgregarCanalModal.vue'
import {
  canalesState, misCanales, estadoAgregarCanal, estadoAsignacionEstudiante, miCanalAsignado, usuarioActual, desvincularMiCuenta
} from '../services/canalesService.js'
import { esDocente } from '../utils/canalesMultiples.js'

const emit = defineEmits(['agregado'])

const modalVisible = ref(false)
const esEstudiante = computed(() => !esDocente(usuarioActual.rol))
const mensajeError = ref('')

// Estudiante: libera su único canal para poder volver a empezar
async function liberarMiCanal() {
  mensajeError.value = ''
  try {
    await desvincularMiCuenta(null)
  } catch (err) {
    mensajeError.value = err.message
  }
}

// El canal queda asignado automáticamente: la vista muestra su gráfica de inmediato
function alAgregar(canal) {
  emit('agregado', canal)
}
</script>

<style scoped>
.agregar-canal { margin: 0 0 1.25rem; display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap; }
.nota { margin: 0; font-size: 0.875rem; color: var(--color-muted); }
.nota-error { color: var(--color-danger); }
.mi-canal { font-weight: 600; color: #166534; }
@media (max-width: 560px) { .agregar-canal .btn { width: 100%; } }
</style>
