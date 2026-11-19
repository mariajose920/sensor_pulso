<template>
  <section class="spo2-resumen card" aria-live="polite" aria-labelledby="titulo-spo2-resumen" data-testid="spo2-resumen">
    <div class="spo2-resumen-cabecera">
      <h2 id="titulo-spo2-resumen" class="seccion">Tu saturación de oxígeno (SpO₂)</h2>
      <router-link :to="RUTA_LECCION_SPO2" class="enlace" data-testid="spo2-resumen-leccion">Cómo se mide y se interpreta</router-link>
    </div>

    <p v-if="!estaAutenticado" class="mensaje" data-testid="spo2-resumen-sin-sesion">
      Inicia sesión para ver aquí la SpO₂ de tu última medición hecha con el sensor.
      <router-link to="/login">Iniciar sesión</router-link>
    </p>
    <p v-else-if="cargando" class="mensaje">Buscando tu última medición…</p>
    <p v-else-if="error" class="mensaje mensaje--error" role="alert">{{ error }}</p>
    <p v-else-if="!medida" class="mensaje" data-testid="spo2-resumen-vacio">
      Todavía no tienes una medición con SpO₂ hecha con el sensor. Haz una en
      <router-link to="/medicion">Medición</router-link> y guárdala para verla aquí.
    </p>

    <div v-else class="lectura">
      <div class="numero" :class="'estado-' + estado.severidad" data-testid="spo2-resumen-valor">
        {{ formatearSpo2(medida.spo2) }}<span class="unidad">% SpO₂</span>
      </div>
      <div class="detalle">
        <span class="pastilla" :class="'estado-' + estado.severidad">{{ estado.etiqueta }}</span>
        <span v-if="!medida.confiable" class="pastilla pastilla--poco-fiable">Lectura poco confiable</span>
        <p class="fecha">Medida el {{ fechaTexto }}<template v-if="sinConexion"> (dato guardado en este dispositivo)</template></p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { useSpo2Medida } from '../composables/useSpo2Medida.js'
import { formatearSpo2 } from '../utils/spo2Aprendizaje.js'

const RUTA_LECCION_SPO2 = '/aprendizaje/saturacion-de-oxigeno'

const { estaAutenticado, cargando, error, sinConexion, medida, estado } = useSpo2Medida()

const fechaTexto = computed(() => {
  const d = new Date(medida.value?.fecha)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
})
</script>

<style scoped>
.spo2-resumen-cabecera { display: flex; justify-content: space-between; align-items: baseline; gap: 0.5rem 1rem; flex-wrap: wrap; margin-bottom: 0.6rem; }
.seccion { margin: 0; font-size: 1.1rem; }
.enlace { font-size: 0.85rem; font-weight: 600; color: var(--color-primary); }
.mensaje { margin: 0; font-size: 0.9rem; line-height: 1.55; color: var(--color-muted); }
.mensaje--error { color: var(--color-danger); }
.lectura { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; }
.numero { font-size: 2.2rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.unidad { font-size: 0.9rem; font-weight: 600; margin-left: 0.35rem; color: var(--color-muted); }
.pastilla { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 600; background: #e2e8f0; margin-right: 0.35rem; }
.pastilla--poco-fiable { background: #fef3c7; color: #92400e; }
.fecha { margin: 0.35rem 0 0; font-size: 0.85rem; color: var(--color-muted); }
.estado-success { color: var(--color-success); }
.estado-warning { color: var(--color-warning); }
.estado-danger { color: var(--color-danger); }
.pastilla.estado-success { background: #dcfce7; }
.pastilla.estado-warning { background: #ffedd5; }
.pastilla.estado-danger { background: #fee2e2; }
</style>
