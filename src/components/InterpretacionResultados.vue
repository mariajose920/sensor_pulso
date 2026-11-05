<template>
  <section class="interpretacion card" data-testid="interpretacion-resultados" aria-label="Interpretación de los resultados">
    <h3 class="titulo">¿Qué significan tus resultados?</h3>

    <article
      v-for="r in bloques"
      :key="r.id"
      class="resultado"
      :class="'estado-' + r.datos.estado"
      :data-testid="'interpretacion-' + r.id"
    >
      <header class="resultado-head">
        <span class="etiqueta">{{ r.nombre }}</span>
        <strong class="estado-titulo">{{ r.datos.titulo }}</strong>
      </header>
      <p class="texto">{{ r.datos.interpretacion }}</p>

      <h4 class="causas-titulo">Posibles causas de variación</h4>
      <ul class="causas">
        <li v-for="c in r.datos.causas" :key="c.clave + c.texto" :class="{ personal: c.personal }">
          <span v-if="c.personal" class="chip">Tu caso</span>{{ c.texto }}
        </li>
      </ul>
    </article>

    <p class="aviso" data-testid="aviso-interpretacion">{{ resultado.aviso }}</p>
  </section>
</template>

<script setup>
/**
 * Interpretación textual del BPM y la SpO₂ de una medición y sus posibles causas de variación (RF23).
 */
import { computed } from 'vue'
import { interpretarResultados } from '../utils/interpretacionResultados.js'

const props = defineProps({
  bpm: { type: Number, default: 0 },
  spo2: { type: Number, default: 0 },
  paciente: { type: Object, default: null },
  calidad: { type: String, default: null }
})

const resultado = computed(() =>
  interpretarResultados({ bpm: props.bpm, spo2: props.spo2, paciente: props.paciente, calidad: props.calidad })
)

const bloques = computed(() => [
  { id: 'bpm', nombre: 'Frecuencia cardíaca', datos: resultado.value.bpm },
  { id: 'spo2', nombre: 'Saturación de oxígeno', datos: resultado.value.spo2 }
])
</script>

<style scoped>
.interpretacion { padding: 1rem; margin: 1rem 0; border: 1px solid var(--color-border); border-radius: 8px; background: var(--color-surface); display: grid; gap: 1rem; }
.titulo { margin: 0; font-size: 1.1rem; }
.resultado { padding: 0.8rem 1rem; border-left: 4px solid var(--color-success); border-radius: 6px; background: #f0fdf4; }
.resultado.estado-alto, .resultado.estado-bajo { border-left-color: var(--color-warning); background: #fffbeb; }
.resultado.estado-invalido { border-left-color: var(--color-muted); background: #f8fafc; }
.resultado-head { display: flex; flex-wrap: wrap; gap: 0.25rem 0.6rem; align-items: baseline; }
.etiqueta { font-size: 0.8rem; text-transform: uppercase; letter-spacing: 0.04em; color: var(--color-muted); }
.estado-titulo { font-size: 1rem; }
.texto { margin: 0.4rem 0 0; font-size: 0.92rem; line-height: 1.55; }
.causas-titulo { margin: 0.8rem 0 0.3rem; font-size: 0.9rem; }
.causas { margin: 0; padding-left: 1.2rem; display: grid; gap: 0.35rem; font-size: 0.88rem; line-height: 1.5; }
.chip { display: inline-block; margin-right: 0.4rem; padding: 0 0.45rem; border-radius: 999px; background: var(--color-primary); color: #fff; font-size: 0.72rem; font-weight: 700; }
.aviso { margin: 0; font-size: 0.82rem; line-height: 1.5; color: var(--color-muted); }
</style>
