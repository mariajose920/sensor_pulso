<template>
  <span
    class="dato-enmascarado"
    :class="{ 'dato-enmascarado--oculto': !revelado && !!valor }"
    :title="!revelado && valor ? 'Dato personal enmascarado' : null"
    :data-testid="testid"
  >{{ texto }}</span>
</template>

<script setup>
import { computed } from 'vue'
import { mostrarDato } from '../utils/enmascarar.js'

const props = defineProps({
  valor: { type: [String, Number], default: '' },
  // 'correo' | 'nombre' | 'ip' | 'token' | 'texto'
  tipo: { type: String, default: 'texto' },
  // true cuando una persona autorizada pidió ver el dato completo
  revelado: { type: Boolean, default: false },
  testid: { type: String, default: null }
})

const texto = computed(() => mostrarDato(props.valor, props.tipo, props.revelado) || '—')
</script>

<style scoped>
.dato-enmascarado--oculto {
  letter-spacing: 0.01em;
  color: #475569;
}
</style>
