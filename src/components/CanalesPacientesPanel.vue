<template>
  <section class="agregar-canal" aria-label="Agregar canal de medición" data-testid="canales-pacientes">
    <!-- Estudiante: un solo canal y un solo paciente (él mismo). El canal se asigna SOLO, con los datos de su ficha -->
    <div v-if="esEstudiante" class="canal-auto" data-testid="canal-automatico">
      <template v-if="miCanalAsignado">
        <span class="mi-canal" data-testid="mi-canal-asignado">✓ Tu canal: <strong>Canal {{ miCanalAsignado }}</strong></span>
        <p class="nota" data-testid="un-solo-canal">
          Se te asignó automáticamente, con los datos de tu ficha: el paciente eres tú y solo puedes medirte a ti mismo.
        </p>
        <button type="button" class="btn btn-secondary btn-sm" data-testid="liberar-mi-canal" :disabled="canalesState.cargando" @click="liberarMiCanal">
          Liberar mi canal
        </button>
      </template>
      <p v-else-if="asignando" class="nota" role="status" data-testid="asignando-canal">Asignándote tu canal…</p>
      <template v-else>
        <p class="nota" :class="{ 'nota-error': !requisitoFaltante }" role="status" data-testid="canal-motivo">
          {{ mensajeError || 'Tu canal se asigna solo.' }}
        </p>
        <button v-if="requisitoFaltante" type="button" class="btn btn-primary btn-sm" data-testid="ir-a-ficha" @click="$emit('ir-a-paso', requisitoFaltante)">
          {{ requisitoFaltante === 'ficha' ? 'Ir a mi ficha' : 'Ir al consentimiento' }}
        </button>
        <button v-else type="button" class="btn btn-primary btn-sm" data-testid="reintentar-canal" :disabled="canalesState.cargando" @click="asegurarCanal">
          Reintentar
        </button>
      </template>
    </div>

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
      v-if="!esEstudiante"
      :visible="modalVisible"
      modo="docente"
      :canal-existente="null"
      @cerrar="modalVisible = false"
      @agregado="alAgregar"
    />
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import AgregarCanalModal from './AgregarCanalModal.vue'
import {
  canalesState, misCanales, estadoAgregarCanal, miCanalAsignado, usuarioActual, desvincularMiCuenta,
  cargarSesionYCanales, asignarCanalAutomaticoEstudiante, FaltaRequisitoCanal
} from '../services/canalesService.js'
import { esDocente } from '../utils/canalesMultiples.js'

const emit = defineEmits(['agregado', 'ir-a-paso'])

const modalVisible = ref(false)
const esEstudiante = computed(() => !esDocente(usuarioActual.rol))
const mensajeError = ref('')
const asignando = ref(false)
const requisitoFaltante = ref('') // 'ficha' | 'consentimiento' cuando lo que falta es un paso previo

// Estudiante: el canal se asigna solo al entrar a medir. Si falta la ficha o el consentimiento, se lleva a ese paso.
async function asegurarCanal() {
  if (!esEstudiante.value || miCanalAsignado.value || asignando.value) return
  asignando.value = true
  mensajeError.value = ''
  requisitoFaltante.value = ''
  try {
    await cargarSesionYCanales()
    const res = await asignarCanalAutomaticoEstudiante()
    if (!res.yaTenia) emit('agregado', res.canal)
  } catch (err) {
    mensajeError.value = err.message
    requisitoFaltante.value = err instanceof FaltaRequisitoCanal ? err.requisito : ''
  } finally {
    asignando.value = false
  }
}

onMounted(() => { asegurarCanal() })

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
.canal-auto { display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap; }
.mi-canal { font-weight: 600; color: #166534; }
@media (max-width: 560px) { .agregar-canal .btn { width: 100%; } }
</style>
