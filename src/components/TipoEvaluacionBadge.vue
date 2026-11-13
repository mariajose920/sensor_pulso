<template>
  <div class="tipo-eval" :class="[`tipo-${tipo}`]" data-testid="tipo-evaluacion-badge">
    <span class="tipo-chip">{{ etiqueta }}</span>
    <p v-if="modo === 'estudiante'" class="tipo-texto">{{ instruccion }}</p>
    <ul v-else-if="tipo === 'mixta' && lista.length" class="tipo-lista">
      <li v-for="(e, i) in lista" :key="i">Ejercicio {{ i + 1 }} ({{ e.puntaje }} pts): {{ e.texto }}</li>
    </ul>
    <p v-else-if="criterioTexto" class="tipo-texto">Criterio: {{ criterioTexto }}</p>
  </div>
</template>

<script setup>
/**
 * RF106: muestra el tipo de una evaluación.
 * modo "docente" muestra el criterio; modo "estudiante" muestra qué se le pide.
 */
import { computed } from 'vue'
import { etiquetaTipo, describirCriterio, instruccionParaEstudiante, EJERCICIOS } from '../utils/tiposEvaluacion.js'

const props = defineProps({
  tipo: { type: String, required: true },
  ejercicio: { type: String, default: null },
  criterio: { type: Object, default: null },
  // RF107: ejercicios de una evaluación mixta
  ejercicios: { type: Array, default: () => [] },
  modo: { type: String, default: 'docente' }
})

const etiqueta = computed(() => etiquetaTipo(props.tipo, props.ejercicio, props.ejercicios.length))
const lista = computed(() => [...props.ejercicios]
  .sort((a, b) => (a.orden || 0) - (b.orden || 0))
  .map((e) => ({ puntaje: e.puntaje, texto: `${EJERCICIOS[e.ejercicio]?.etiqueta || e.ejercicio}: ${describirCriterio(e.ejercicio, e.criterio)}` })))
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
.tipo-lista { margin: 0; padding-left: 1.2rem; font-size: 0.85rem; }
.tipo-mixta .tipo-chip { background: #fef3c7; color: #78350f; }
.tipo-ejercicio_aplicado .tipo-chip { background: #dcfce7; color: #14532d; }
.tipo-texto { margin: 0; font-size: 0.85rem; color: var(--color-muted); }
</style>
