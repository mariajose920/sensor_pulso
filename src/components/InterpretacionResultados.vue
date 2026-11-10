<template>
  <section class="interpretacion-card card" data-testid="interpretacion-resultados" aria-label="Interpretación de los resultados">
    <!-- Encabezado de la Tarjeta alineado visualmente con el Comparador de Rangos -->
    <div class="interpretacion-head">
      <div class="head-title-block">
        <div class="title-with-badge">
          <h3 class="main-title">Significado Clínico</h3>
          <span class="estado-pill" :class="esTodoNormal ? 'pill-in' : 'pill-out'">
            {{ esTodoNormal ? 'Parámetros Estables' : 'Revisar Factores' }}
          </span>
        </div>
        <p class="sub-title">¿Qué significan tus resultados? · Orientación médica</p>
      </div>
    </div>

    <!-- Filas de Interpretación Sintética (Frecuencia y Saturación) -->
    <div class="interpretacion-rows">
      <!-- 1. Frecuencia Cardíaca -->
      <article class="metric-interp-item" :class="'estado-' + resultado.bpm.estado" data-testid="interpretacion-bpm">
        <header class="metric-interp-head">
          <span class="metric-name">Frecuencia Cardíaca</span>
          <span class="metric-chip" :class="'chip-' + resultado.bpm.estado">
            {{ resultado.bpm.titulo }}
          </span>
        </header>
        <p class="metric-text">{{ resultado.bpm.interpretacion }}</p>

        <!-- Factores relevantes (solo si aplican al caso) -->
        <div v-if="causasBpmRelevantes.length" class="factores-wrap">
          <span v-for="c in causasBpmRelevantes" :key="c.clave + c.texto" class="factor-chip" :class="{ 'factor-personal': c.personal }">
            <strong v-if="c.personal" class="factor-tag">Tu caso:</strong> {{ c.texto }}
          </span>
        </div>
      </article>

      <!-- 2. Saturación de Oxígeno -->
      <article class="metric-interp-item" :class="'estado-' + resultado.spo2.estado" data-testid="interpretacion-spo2">
        <header class="metric-interp-head">
          <span class="metric-name">Saturación de Oxígeno</span>
          <span class="metric-chip" :class="'chip-' + resultado.spo2.estado">
            {{ resultado.spo2.titulo }}
          </span>
        </header>
        <p class="metric-text">{{ resultado.spo2.interpretacion }}</p>

        <!-- Factores relevantes (solo si aplican al caso) -->
        <div v-if="causasSpo2Relevantes.length" class="factores-wrap">
          <span v-for="c in causasSpo2Relevantes" :key="c.clave + c.texto" class="factor-chip" :class="{ 'factor-personal': c.personal }">
            <strong v-if="c.personal" class="factor-tag">Tu caso:</strong> {{ c.texto }}
          </span>
        </div>
      </article>
    </div>

    <footer class="interpretacion-footer">
      <p class="aviso" data-testid="aviso-interpretacion">{{ resultado.aviso }}</p>
    </footer>
  </section>
</template>

<script setup>
/**
 * Interpretación textual sintética del BPM y la SpO₂ de una medición y factores relevantes (RF23).
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

const esTodoNormal = computed(() => {
  return resultado.value.bpm?.estado === 'dentro' && resultado.value.spo2?.estado === 'dentro'
})

// Muestra solo factores declarados en la ficha (personal) o como máximo 1 causa principal si no hay factores
const causasBpmRelevantes = computed(() => {
  const todas = resultado.value.bpm?.causas || []
  const personales = todas.filter(c => c.personal)
  if (personales.length > 0) return personales
  if (resultado.value.bpm?.estado !== 'dentro') {
    return todas.slice(0, 1)
  }
  return []
})

const causasSpo2Relevantes = computed(() => {
  const todas = resultado.value.spo2?.causas || []
  const personales = todas.filter(c => c.personal)
  if (personales.length > 0) return personales
  if (resultado.value.spo2?.estado !== 'dentro') {
    return todas.slice(0, 1)
  }
  return []
})
</script>

<style scoped>
.interpretacion-card {
  padding: 1rem 1.25rem;
  margin-bottom: 0;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: 0.75rem;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
  display: flex;
  flex-direction: column;
  height: 100%;
}

.interpretacion-head {
  margin-bottom: 0.9rem;
  padding-bottom: 0.65rem;
  border-bottom: 1px solid var(--color-border);
}

.title-with-badge {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

.main-title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.sub-title {
  font-size: 0.8rem;
  color: var(--color-muted);
  margin: 0.15rem 0 0 0;
}

.estado-pill {
  font-size: 0.72rem;
  font-weight: 700;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
  letter-spacing: 0.02em;
}

.pill-in {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #86efac;
}

.pill-out {
  background: #fef2f2;
  color: #b91c1c;
  border: 1px solid #fecaca;
}

.interpretacion-rows {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  flex: 1;
}

.metric-interp-item {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
  padding: 0.75rem 1rem;
  border-left: 4px solid #16a34a;
  transition: all 0.15s ease;
}

.metric-interp-item.estado-alto,
.metric-interp-item.estado-bajo {
  border-left-color: #d97706;
  background: #fffbeb;
}

.metric-interp-item.estado-invalido {
  border-left-color: #94a3b8;
  background: #f1f5f9;
}

.metric-interp-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;
}

.metric-name {
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text);
}

.metric-chip {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.12rem 0.45rem;
  border-radius: 4px;
}

.chip-dentro {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #86efac;
}

.chip-alto,
.chip-bajo {
  background: #fee2e2;
  color: #b91c1c;
  border: 1px solid #fca5a5;
}

.chip-invalido {
  background: #e2e8f0;
  color: #475569;
}

.metric-text {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.45;
  color: #334155;
}

.factores-wrap {
  margin-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.factor-chip {
  font-size: 0.76rem;
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 4px;
  padding: 0.25rem 0.5rem;
  color: #475569;
  line-height: 1.35;
}

.factor-chip.factor-personal {
  background: #eff6ff;
  border-color: #bfdbfe;
  color: #1e40af;
}

.factor-tag {
  color: #2563eb;
  margin-right: 0.25rem;
}

.interpretacion-footer {
  margin-top: 0.75rem;
  padding-top: 0.5rem;
  border-top: 1px solid #f1f5f9;
}

.aviso {
  margin: 0;
  font-size: 0.72rem;
  color: var(--color-muted);
  line-height: 1.35;
}
</style>
