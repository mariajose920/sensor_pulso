<template>
  <dl class="metricas" :class="{ compacto }" :aria-label="resumenAria" data-testid="metricas-canal">
    <div class="m">
      <dt>{{ pulsoDifiere ? 'Frecuencia cardíaca (dispositivo)' : 'Frecuencia cardíaca / pulso' }}</dt>
      <dd class="valor" data-testid="metrica-bpm">{{ t.bpm }}</dd>
    </div>

    <!-- Solo si el pulso medido por los picos realmente difiere del BPM del dispositivo -->
    <div v-if="pulsoDifiere" class="m">
      <dt>Pulso (por picos)</dt>
      <dd data-testid="metrica-pulso">{{ t.pulso }}</dd>
    </div>

    <div class="m">
      <dt>Variabilidad (HRV)</dt>
      <dd data-testid="metrica-hrv">{{ t.hrv }}</dd>
    </div>

    <div class="m">
      <dt>Ruido de la señal</dt>
      <dd data-testid="metrica-ruido">
        <span v-if="metricas?.ruido" class="insignia" :style="estiloRuido" :title="causasRuido">{{ t.ruido }}</span>
        <template v-else>—</template>
      </dd>
    </div>

    <div class="m">
      <dt>Ritmo cardíaco</dt>
      <dd data-testid="metrica-ritmo">
        <span v-if="metricas?.ritmo" class="insignia" :style="estiloRitmo" :title="metricas.ritmo.explicacion">{{ t.ritmo }}</span>
        <template v-else>—</template>
      </dd>
    </div>

    <div class="m">
      <dt>Saturación de oxígeno (SpO₂)</dt>
      <dd data-testid="metrica-spo2">{{ t.spo2 }}</dd>
    </div>

    <div class="m">
      <dt>Picos sistólicos</dt>
      <dd data-testid="metrica-picos">{{ t.picos > 0 ? t.picos + ' en la ventana' : '—' }}</dd>
    </div>
  </dl>
</template>

<script setup>
import { computed } from 'vue'
import { resumenMetricas, COLOR_RUIDO, COLOR_RITMO } from '../utils/graficasCanales.js'

const props = defineProps({
  /** Resultado de calcularMetricasCanal (o null/undefined sin datos) */
  metricas: { type: Object, default: null },
  /** Versión en una fila, para la leyenda de «Juntas» */
  compacto: { type: Boolean, default: false }
})

const t = computed(() => resumenMetricas(props.metricas))
const pulsoDifiere = computed(() => Boolean(props.metricas?.pulsoDifiere))

function estilo(paleta, clave) {
  const c = paleta[clave]
  return c ? { background: c.fondo, color: c.texto, borderColor: c.borde } : {}
}
const estiloRuido = computed(() => estilo(COLOR_RUIDO, props.metricas?.ruido?.nivel))
const estiloRitmo = computed(() => estilo(COLOR_RITMO, props.metricas?.ritmo?.clase))
const causasRuido = computed(() => (props.metricas?.ruido?.causas || []).map(c => c.texto).join(' ') || 'Sin problemas detectados en la señal.')

const resumenAria = computed(() =>
  `Frecuencia cardíaca ${t.value.bpm}. Variabilidad ${t.value.hrv}. Ruido: ${t.value.ruido}. Ritmo: ${t.value.ritmo}. SpO₂ ${t.value.spo2}. Picos sistólicos: ${t.value.picos}.`
)
</script>

<style scoped>
.metricas { display: grid; grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr)); gap: 0.5rem 0.75rem; margin: 0.6rem 0 0; padding: 0; }
.m { background: #0f172a; border: 1px solid #1e293b; border-radius: 0.4rem; padding: 0.4rem 0.6rem; min-width: 0; }
dt { font-size: 0.7rem; color: #94a3b8; line-height: 1.2; }
dd { margin: 0.15rem 0 0; font-size: 0.85rem; font-weight: 600; color: #f1f5f9; overflow-wrap: anywhere; }
dd.valor { font-size: 1.2rem; }
.insignia { display: inline-block; padding: 0.1rem 0.55rem; border: 1px solid; border-radius: 999px; font-size: 0.8rem; font-weight: 700; }
.compacto { grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); margin-top: 0.4rem; }
.compacto dd.valor { font-size: 1rem; }
@media (max-width: 480px) {
  .metricas { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}
</style>
