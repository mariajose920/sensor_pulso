<template>
  <section class="explicacion" data-testid="explicacion-resultados" :aria-label="'Cómo se obtiene ' + (tipo === 'spo2' ? 'la SpO₂' : 'el BPM')">
    <div v-if="tipo === 'bpm' || tipo === 'ambos'" class="bloque" data-testid="explicacion-bpm">
      <h4 class="bloque-titulo">Cómo se obtiene el BPM</h4>
      <ol class="pasos">
        <li v-for="(p, i) in PASOS_BPM" :key="p.titulo" class="paso">
          <span class="paso-num" aria-hidden="true">{{ i + 1 }}</span>
          <div>
            <strong>{{ p.titulo }}</strong>
            <p>{{ p.texto }}</p>
            <code v-if="p.formula" class="formula">{{ p.formula }}</code>
          </div>
        </li>
      </ol>
      <p v-if="ejemplo.bpm" class="ejemplo" data-testid="ejemplo-bpm">
        <strong>Con tu medición:</strong> {{ ejemplo.bpm.bpm }} BPM equivale a un pico cada
        {{ ejemplo.bpm.intervaloMs }} ms, porque 60 000 ÷ {{ ejemplo.bpm.intervaloMs }} ≈ {{ ejemplo.bpm.bpm }}.
      </p>
    </div>

    <div v-if="tipo === 'spo2' || tipo === 'ambos'" class="bloque" data-testid="explicacion-spo2">
      <h4 class="bloque-titulo">Cómo se obtiene la SpO₂</h4>
      <ol class="pasos">
        <li v-for="(p, i) in PASOS_SPO2" :key="p.titulo" class="paso">
          <span class="paso-num" aria-hidden="true">{{ i + 1 }}</span>
          <div>
            <strong>{{ p.titulo }}</strong>
            <p>{{ p.texto }}</p>
            <code v-if="p.formula" class="formula">{{ p.formula }}</code>
          </div>
        </li>
      </ol>
      <p v-if="ejemplo.spo2" class="ejemplo" data-testid="ejemplo-spo2">
        <strong>Con tu medición:</strong>
        {{ ejemplo.spo2.medida ? 'con R = ' : 'una SpO₂ de ' + ejemplo.spo2.spo2 + ' % corresponde a R ≈ ' }}{{ formatoDecimal(ejemplo.spo2.r) }},
        la curva da 110 − 25 × {{ formatoDecimal(ejemplo.spo2.r) }} ≈ {{ ejemplo.spo2.spo2 }} %.
      </p>
    </div>

    <p class="nota" data-testid="nota-intensidad"><strong>Ojo:</strong> {{ NOTA_INTENSIDAD }}</p>
  </section>
</template>

<script setup>
/**
 * Explica paso a paso cómo se obtienen el BPM y la SpO₂ (RF22), con el ejemplo de la medición
 * de la persona cuando hay valores. `tipo`: 'bpm', 'spo2' o 'ambos'.
 */
import { computed } from 'vue'
import {
  PASOS_BPM,
  PASOS_SPO2,
  NOTA_INTENSIDAD,
  ejemploBpm,
  ejemploSpo2,
  formatoDecimal
} from '../data/explicacionResultados.js'

const props = defineProps({
  tipo: { type: String, default: 'ambos', validator: (v) => ['bpm', 'spo2', 'ambos'].includes(v) },
  bpm: { type: Number, default: 0 },
  spo2: { type: Number, default: 0 },
  ratioR: { type: Number, default: 0 }
})

const ejemplo = computed(() => ({
  bpm: ejemploBpm(props.bpm),
  spo2: ejemploSpo2(props.spo2, props.ratioR)
}))
</script>

<style scoped>
.explicacion { display: grid; gap: 1rem; }
.bloque-titulo { margin: 0 0 0.6rem; font-size: 1rem; }
.pasos { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.6rem; }
.paso { display: flex; gap: 0.75rem; align-items: flex-start; }
.paso p { margin: 0.15rem 0 0; font-size: 0.9rem; line-height: 1.5; color: var(--color-muted); }
.paso-num {
  flex-shrink: 0;
  width: 1.7rem;
  height: 1.7rem;
  border-radius: 50%;
  background: var(--color-primary);
  color: #fff;
  font-weight: 700;
  font-size: 0.85rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.formula {
  display: inline-block;
  margin-top: 0.3rem;
  padding: 0.25rem 0.6rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 6px;
  font-size: 0.85rem;
  overflow-wrap: anywhere;
}
.ejemplo, .nota { margin: 0.75rem 0 0; font-size: 0.9rem; line-height: 1.5; }
.ejemplo { padding: 0.6rem 0.8rem; background: #f0fdf4; border-left: 4px solid var(--color-success); border-radius: 6px; }
.nota { margin: 0; padding: 0.6rem 0.8rem; background: #fffbeb; border-left: 4px solid var(--color-warning); border-radius: 6px; color: #78350f; }
</style>
