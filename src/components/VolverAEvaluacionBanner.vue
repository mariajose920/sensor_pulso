<template>
  <aside v-if="evaluacionId" class="volver-evaluacion" role="note" data-testid="volver-a-evaluacion">
    <div class="volver-texto">
      <span class="volver-icono" aria-hidden="true">📋</span>
      <span>
        Estás haciendo un ejercicio de la evaluación
        <strong v-if="titulo">«{{ titulo }}»</strong><template v-else>de tu aula</template>.
        Cuando termines y guardes tu {{ etiqueta }}, vuelve para subirla.
      </span>
    </div>
    <RouterLink :to="rutaVolver" class="btn btn-primary btn-sm volver-boton" data-testid="boton-volver-a-evaluacion">
      ← Volver a la evaluación
    </RouterLink>
  </aside>
</template>

<script setup>
/**
 * RF107: aviso que aparece en Medición y Comparación cuando el estudiante llegó desde un ejercicio de una evaluación
 * (la dirección trae ?evaluacion=<id>&titulo=...). El botón lo devuelve a la evaluación, que se reabre sola.
 */
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { rutaVolverEvaluacion } from '../utils/ejercicioEvaluacion.js'

const props = defineProps({
  // «medición» o «comparación»: lo que se espera que guarde
  que: { type: String, default: 'medición' }
})

const route = useRoute()
const evaluacionId = computed(() => String(route.query.evaluacion || ''))
const titulo = computed(() => String(route.query.titulo || ''))
const etiqueta = computed(() => props.que)
const rutaVolver = computed(() => rutaVolverEvaluacion(evaluacionId.value))
</script>

<style scoped>
.volver-evaluacion {
  display: flex; align-items: center; justify-content: space-between; gap: 0.9rem; flex-wrap: wrap;
  padding: 0.8rem 1rem; margin: 0 0 1rem; border-radius: 12px;
  background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; font-size: 0.92rem;
}
.volver-texto { display: flex; gap: 0.6rem; align-items: flex-start; min-width: 0; flex: 1 1 320px; }
.volver-icono { font-size: 1.2rem; line-height: 1.3; }
.volver-boton { text-decoration: none; white-space: nowrap; }
@media (max-width: 560px) { .volver-boton { width: 100%; text-align: center; } }
</style>
