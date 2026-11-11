<template>
  <section class="analisis-comparacion-card" aria-labelledby="titulo-analisis-automatico">
    <!-- 1. Encabezado e Insignia de Concordancia -->
    <div class="analisis-header">
      <div class="analisis-header-left">
        <h2 id="titulo-analisis-automatico" class="analisis-title">
          Análisis Automático de la Comparación Fisiológica
        </h2>
        <p class="analisis-subtitle">
          Interpretación generada automáticamente sobre las diferencias detectadas entre la medición tomada y la señal de referencia.
        </p>
      </div>

      <span class="concordancia-pill" :class="`concordancia-pill--${analisis.nivelConcordancia}`">
        {{ analisis.etiquetaEstado }}
      </span>
    </div>

    <!-- 2. Recuadro de Diagnóstico Automático del Contraste -->
    <div class="diagnostico-banner" role="status" aria-live="polite">
      <strong class="diagnostico-label">Diagnóstico Automático del Contraste</strong>
      <p class="diagnostico-text">
        {{ analisis.diagnosticoResumen }}
      </p>
    </div>

    <!-- 3. Sección: ¿A qué se debe la diferencia observada? -->
    <h3 class="causas-section-title">
      ¿A qué se debe la diferencia observada? (Causas Fisiológicas y Hemodinámicas)
    </h3>

    <div class="causas-grid">
      <!-- Tarjeta 1: Variación de Frecuencia y Ciclo -->
      <article class="causa-card">
        <h4 class="causa-card-title">{{ analisis.explicacionFrecuencia.titulo }}</h4>
        <span class="causa-badge">{{ analisis.explicacionFrecuencia.badge }}</span>
        <p class="causa-card-body">
          {{ analisis.explicacionFrecuencia.explicacion }}
        </p>
      </article>

      <!-- Tarjeta 2: Morfología de Onda y Perfusión -->
      <article class="causa-card">
        <h4 class="causa-card-title">{{ analisis.explicacionMorfologia.titulo }}</h4>
        <span class="causa-badge">{{ analisis.explicacionMorfologia.badge }}</span>
        <p class="causa-card-body">
          {{ analisis.explicacionMorfologia.explicacion }}
        </p>
      </article>

      <!-- Tarjeta 3: Factores Basales y Contexto Probable -->
      <article class="causa-card">
        <h4 class="causa-card-title">{{ analisis.factoresCausales.titulo }}</h4>
        <span class="causa-badge">{{ analisis.factoresCausales.badge }}</span>
        <ul class="causas-list">
          <li v-for="(causa, idx) in analisis.factoresCausales.causas" :key="idx">
            {{ causa }}
          </li>
        </ul>
      </article>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { generarAnalisisAutomaticoComparacion } from '../utils/analisisComparacion.js'

const props = defineProps({
  bpmActual: { type: Number, default: 78 },
  bpmReferencia: { type: Number, default: 72 },
  amplitudActual: { type: Number, default: 100 },
  amplitudReferencia: { type: Number, default: 100 },
  spo2Actual: { type: Number, default: 98 },
  spo2Referencia: { type: Number, default: 98 },
  similitudPorcentaje: { type: Number, default: null },
  nombreMedicion: { type: String, default: 'Medición Tomada' },
  nombreReferencia: { type: String, default: 'Señal de Referencia' },
  actividadReferencia: { type: String, default: 'Reposo' }
})

const analisis = computed(() =>
  generarAnalisisAutomaticoComparacion({
    bpmActual: props.bpmActual,
    bpmReferencia: props.bpmReferencia,
    amplitudActual: props.amplitudActual,
    amplitudReferencia: props.amplitudReferencia,
    spo2Actual: props.spo2Actual,
    spo2Referencia: props.spo2Referencia,
    similitudPorcentaje: props.similitudPorcentaje,
    nombreMedicion: props.nombreMedicion,
    nombreReferencia: props.nombreReferencia,
    actividadReferencia: props.actividadReferencia
  })
)
</script>

<style scoped>
.analisis-comparacion-card {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 0.75rem;
  padding: 1.35rem 1.45rem;
  margin-bottom: 1.25rem;
  box-shadow: 0 2px 6px rgba(15, 23, 42, 0.04);
}

.analisis-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
  margin-bottom: 1.1rem;
}

.analisis-header-left {
  flex: 1;
  min-width: 260px;
}

.analisis-title {
  font-size: 1.22rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.3rem 0;
}

.analisis-subtitle {
  font-size: 0.88rem;
  color: #475569;
  margin: 0;
  line-height: 1.4;
}

.concordancia-pill {
  display: inline-flex;
  align-items: center;
  padding: 0.35rem 0.9rem;
  border-radius: 999px;
  font-size: 0.8rem;
  font-weight: 700;
  white-space: nowrap;
}

.concordancia-pill--alta {
  background: #15803d;
  color: #ffffff;
}

.concordancia-pill--moderada {
  background: #b45309;
  color: #ffffff;
}

.concordancia-pill--baja {
  background: #b91c1c;
  color: #ffffff;
}

.diagnostico-banner {
  background: #e0f2fe;
  border-left: 4px solid #002b49;
  border-radius: 0.5rem;
  padding: 0.95rem 1.15rem;
  margin-bottom: 1.25rem;
}

.diagnostico-label {
  display: block;
  font-size: 0.92rem;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 0.3rem;
}

.diagnostico-text {
  font-size: 0.89rem;
  color: #1e293b;
  line-height: 1.5;
  margin: 0;
}

.causas-section-title {
  font-size: 1rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.85rem 0;
}

.causas-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.9rem;
}

@media (max-width: 920px) {
  .causas-grid {
    grid-template-columns: 1fr;
  }
}

.causa-card {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 0.65rem;
  padding: 1rem 1.1rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
}

.causa-card-title {
  font-size: 0.95rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.55rem 0;
  line-height: 1.35;
}

.causa-badge {
  display: inline-block;
  background: #e2e8f0;
  color: #0f172a;
  font-size: 0.76rem;
  font-weight: 700;
  padding: 0.22rem 0.6rem;
  border-radius: 999px;
  margin-bottom: 0.65rem;
}

.causa-card-body {
  font-size: 0.84rem;
  color: #1e293b;
  line-height: 1.5;
  margin: 0;
}

.causas-list {
  margin: 0;
  padding-left: 1.15rem;
  font-size: 0.84rem;
  color: #1e293b;
  line-height: 1.55;
}

.causas-list li + li {
  margin-top: 0.35rem;
}
</style>
