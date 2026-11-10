<template>
  <section class="agregar-canal" aria-label="Agregar canal de medición" data-testid="canales-pacientes">
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

    <AgregarCanalModal
      :visible="modalVisible"
      :canal-existente="null"
      @cerrar="modalVisible = false"
      @agregado="alAgregar"
    />
  </section>
</template>

<script setup>
import { ref } from 'vue'
import AgregarCanalModal from './AgregarCanalModal.vue'
import { canalesState, misCanales, estadoAgregarCanal } from '../services/canalesService.js'

const emit = defineEmits(['agregado'])

const modalVisible = ref(false)

// El canal queda asignado automáticamente: la vista muestra su gráfica de inmediato
function alAgregar(canal) {
  emit('agregado', canal)
}
</script>

<style scoped>
.agregar-canal { margin: 0 0 1.25rem; display: flex; align-items: center; gap: 0.9rem; flex-wrap: wrap; }
.nota { margin: 0; font-size: 0.875rem; color: var(--color-muted); }
@media (max-width: 560px) { .agregar-canal .btn { width: 100%; } }
</style>
