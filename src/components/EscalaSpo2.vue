<template>
  <div class="escala" role="img" :aria-label="`Tu SpO₂ de ${valorTexto} % en la escala de 80 a 100 %: ${zonaActual.etiqueta}`" data-testid="escala-spo2">
    <div class="barra">
      <div
        v-for="z in ESCALA_SPO2.zonas"
        :key="z.id"
        class="zona"
        :class="[`zona--${z.id}`, { 'zona--actual': z.id === zonaActual.id }]"
        :title="z.etiqueta"
      ></div>
      <div class="marcador" :style="{ left: posicion + '%' }" data-testid="escala-marcador">
        <span class="marcador-valor">{{ valorTexto }}</span>
      </div>
    </div>
    <div class="marcas" aria-hidden="true">
      <span>80</span><span>85</span><span>90</span><span>95</span><span>100</span>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { ESCALA_SPO2, posicionEnEscala } from '../utils/spo2Aprendizaje.js'

const props = defineProps({
  spo2: { type: Number, required: true }
})

const posicion = computed(() => posicionEnEscala(props.spo2))
const valorTexto = computed(() => props.spo2.toLocaleString('es-CL', { minimumFractionDigits: 1, maximumFractionDigits: 1 }))
const zonaActual = computed(() => {
  const z = ESCALA_SPO2.zonas.find(x => props.spo2 >= x.desde && props.spo2 < x.hasta)
  return z || (props.spo2 >= ESCALA_SPO2.max ? ESCALA_SPO2.zonas[3] : ESCALA_SPO2.zonas[0])
})
</script>

<style scoped>
.escala {
  width: 100%;
  margin: 1.6rem 0 0.4rem;
}

.barra {
  position: relative;
  display: flex;
  height: 12px;
  border-radius: 999px;
  overflow: visible;
}

.zona {
  flex: 1;
  opacity: 0.45;
}

.zona:first-of-type { border-radius: 999px 0 0 999px; }
.zona:nth-of-type(4) { border-radius: 0 999px 999px 0; }
.zona--actual { opacity: 1; }
.zona--severa { background: #dc2626; }
.zona--moderada { background: #ea580c; }
.zona--leve { background: #f59e0b; }
.zona--normal { background: #16a34a; }

.marcador {
  position: absolute;
  top: -0.2rem;
  width: 4px;
  height: calc(100% + 0.4rem);
  margin-left: -2px;
  border-radius: 2px;
  background: #0f172a;
  transition: left 0.3s ease;
}

.marcador-valor {
  position: absolute;
  bottom: calc(100% + 0.2rem);
  left: 50%;
  transform: translateX(-50%);
  padding: 0.05rem 0.4rem;
  border-radius: 0.3rem;
  background: #0f172a;
  color: #ffffff;
  font-size: 0.72rem;
  font-weight: 700;
  white-space: nowrap;
}

.marcas {
  display: flex;
  justify-content: space-between;
  margin-top: 0.35rem;
  font-size: 0.7rem;
  color: var(--color-muted, #64748b);
}
</style>
