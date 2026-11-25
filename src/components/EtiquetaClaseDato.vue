<template>
  <span
    class="etiqueta-clase"
    :class="[`etiqueta-clase--${claseValida}`, { 'etiqueta-clase--compacta': compacta }]"
    :title="meta.resumen"
    :data-testid="`etiqueta-clase-${claseValida}`"
  >
    <svg class="etiqueta-clase-icono" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <template v-if="claseValida === 'publico'">
        <circle cx="12" cy="12" r="10" />
        <line x1="2" y1="12" x2="22" y2="12" />
        <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
      </template>
      <template v-else-if="claseValida === 'privado'">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </template>
      <template v-else>
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        <polyline points="6 12 9 12 11 9 13 15 15 12 18 12" />
      </template>
    </svg>
    <span class="etiqueta-clase-texto">{{ meta.etiqueta }}</span>
  </span>
</template>

<script setup>
import { computed } from 'vue'
import { metaClase, CLASES } from '../data/clasificacionDatos.js'

const props = defineProps({
  // 'publico' | 'privado' | 'sensible_salud'
  clase: { type: String, required: true },
  // Versión más pequeña para usar dentro de tablas y formularios
  compacta: { type: Boolean, default: false }
})

const claseValida = computed(() => (metaClase(props.clase) ? props.clase : 'privado'))
const meta = computed(() => CLASES[claseValida.value])
</script>

<style scoped>
.etiqueta-clase {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.22rem 0.65rem;
  border-radius: 999px;
  border: 1px solid transparent;
  font-size: 0.78rem;
  font-weight: 700;
  line-height: 1.2;
  white-space: nowrap;
}

.etiqueta-clase--compacta {
  padding: 0.12rem 0.5rem;
  font-size: 0.72rem;
}

.etiqueta-clase--publico {
  background: #ecfdf5;
  color: #047857;
  border-color: #a7f3d0;
}

.etiqueta-clase--privado {
  background: #eff6ff;
  color: #1d4ed8;
  border-color: #bfdbfe;
}

.etiqueta-clase--sensible_salud {
  background: #fff1f2;
  color: #be123c;
  border-color: #fecdd3;
}
</style>
