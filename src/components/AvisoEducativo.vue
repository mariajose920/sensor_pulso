<template>
  <aside class="aviso-educativo" :class="{ compacto }" role="note" aria-label="Aviso educativo" data-testid="aviso-educativo">
    <span class="aviso-icono" aria-hidden="true">ℹ️</span>
    <p class="aviso-texto">
      <template v-if="compacto"><strong>Aviso:</strong> {{ AVISO_EDUCATIVO_CORTO }}</template>
      <template v-else><strong>{{ AVISO_EDUCATIVO_TITULO }}.</strong> {{ AVISO_EDUCATIVO_TEXTO }}</template>
    </p>
  </aside>
</template>

<script setup>
/**
 * Recuadro con el aviso educativo (RF75). Se usa en las pantallas donde hay resultados de salud.
 * `compacto` muestra solo la frase corta, para espacios reducidos.
 */
import { AVISO_EDUCATIVO_CORTO, AVISO_EDUCATIVO_TEXTO, AVISO_EDUCATIVO_TITULO } from '../data/avisoEducativo.js'

defineProps({
  compacto: { type: Boolean, default: false }
})
</script>

<style scoped>
.aviso-educativo {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-left: 4px solid var(--color-primary);
  border-radius: 8px;
  color: #1e3a8a;
}
.aviso-educativo.compacto { padding: 0.5rem 0.75rem; font-size: 0.85rem; }
.aviso-icono { flex-shrink: 0; line-height: 1.5; }
.aviso-texto { margin: 0; font-size: 0.9rem; line-height: 1.5; }
.compacto .aviso-texto { font-size: 0.85rem; }
</style>
