<template>
  <div class="tipo-eval" :class="[`tipo-${tipo}`]" data-testid="tipo-evaluacion-badge">
    <span class="tipo-chip">{{ etiqueta }}</span>
    <p v-if="modo === 'estudiante'" class="tipo-texto">{{ instruccion }}</p>
    <p v-else-if="criterioTexto" class="tipo-texto">Criterio: {{ criterioTexto }}</p>
  </div>
</template>

<script setup>
/**
 * RF106: muestra el tipo de una evaluación.
 * modo "docente" muestra el criterio; modo "estudiante" muestra qué se le pide.
 */
import { computed } from 'vue'
import { etiquetaTipo, describirCriterio, instruccionParaEstudiante } from '../utils/tiposEvaluacion.js'

const props = defineProps({
  tipo: { type: String, required: true },
  ejercicio: { type: String, default: null },
  criterio: { type: Object, default: null },
  modo: { type: String, default: 'docente' }
})

const etiqueta = computed(() => etiquetaTipo(props.tipo, props.ejercicio))
const criterioTexto = computed(() => describirCriterio(props.ejercicio, props.criterio))
const instruccion = computed(() => instruccionParaEstudiante(props.tipo, props.ejercicio))
</script>

<style scoped>
.tipo-eval { display: flex; flex-direction: column; gap: 0.25rem; }
.tipo-chip {
  align-self: flex-start;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 600;
  background: #dbeafe;
  color: #1e3a8a;
}
.tipo-ejercicio_aplicado .tipo-chip { background: #dcfce7; color: #14532d; }
.tipo-texto { margin: 0; font-size: 0.85rem; color: var(--color-muted); }
</style>
