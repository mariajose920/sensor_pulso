<template>
  <div
    v-if="aviso"
    class="aviso-calidad"
    :class="'aviso-calidad-' + aviso.nivel"
    :role="aviso.nivel === 'mala' ? 'alert' : 'status'"
  >
    <p class="aviso-titulo">
      <span aria-hidden="true">{{ aviso.nivel === 'mala' ? '⛔' : '⚠️' }}</span>
      Calidad {{ aviso.nivel }}: {{ aviso.titulo }}
    </p>
    <p class="aviso-texto">{{ aviso.explicacion }}</p>
    <ul class="aviso-consejos">
      <li v-for="consejo in aviso.consejos" :key="consejo">{{ consejo }}</li>
    </ul>
    <p v-if="aviso.consecuencia" class="aviso-consecuencia">{{ aviso.consecuencia }}</p>
    <div class="aviso-pie">
      <span class="aviso-sugerencia">{{ aviso.sugerencia }}</span>
      <button type="button" class="btn btn-secondary aviso-boton" @click="emit('repetir')">
        Repetir la medición
      </button>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { explicarCalidad } from '../utils/explicacionCalidad.js'

// RF16: con calidad buena (o sin señal) no aparece ningún aviso.
const props = defineProps({
  nivel: { type: String, default: 'sin_senal' },
  causas: { type: Array, default: () => [] }
})
const emit = defineEmits(['repetir'])

const aviso = computed(() => explicarCalidad(props.nivel, props.causas))
</script>

<style scoped>
.aviso-calidad {
  border: 1px solid;
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin: 0.5rem 0;
  font-size: 0.85rem;
  line-height: 1.4;
}
.aviso-calidad-regular { background: #fffbeb; border-color: #fcd34d; color: #78350f; }
.aviso-calidad-mala { background: #fef2f2; border-color: #fca5a5; color: #7f1d1d; }
.aviso-titulo { margin: 0 0 0.25rem; font-weight: 700; }
.aviso-texto { margin: 0 0 0.25rem; }
.aviso-consejos { margin: 0 0 0.4rem; padding-left: 1.2rem; }
.aviso-consecuencia { margin: 0 0 0.4rem; font-weight: 600; }
.aviso-pie { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; }
.aviso-sugerencia { font-weight: 600; }
.aviso-boton { font-size: 0.8rem; padding: 0.3rem 0.75rem; }
</style>
