<template>
  <section class="spo2-medida" aria-live="polite">
    <h3 class="titulo">Tu saturación de oxígeno medida</h3>

    <p v-if="!isAuthenticated" class="mensaje">
      Inicia sesión para ver aquí la SpO₂ de tu última medición guardada.
      <router-link to="/login">Iniciar sesión</router-link>
    </p>
    <p v-else-if="cargando" class="mensaje">Buscando tu última medición…</p>
    <p v-else-if="error" class="mensaje">{{ error }}</p>
    <p v-else-if="!medida" class="mensaje">
      Todavía no tienes una medición con SpO₂. Haz una en
      <router-link to="/medicion">Medición</router-link> y guárdala para verla aquí.
    </p>

    <div v-else class="lectura">
      <div class="numero" :class="'estado-' + estado.severidad" data-testid="spo2-medida">
        {{ medida.spo2.toFixed(1) }}<span class="unidad">% SpO₂</span>
      </div>
      <div class="detalle">
        <span class="pastilla" :class="'estado-' + estado.severidad">{{ estado.etiqueta }}</span>
        <p class="fecha">Medida el {{ fechaTexto }}<template v-if="sinConexion"> (dato guardado en este dispositivo)</template></p>
        <p class="explica">{{ estado.descripcion }}</p>
        <p v-if="medida.calidad === 'mala'" class="explica">La calidad de la señal fue mala: repite la medición.</p>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import { useAuth } from '../composables/useAuth'
import { listarHistorial } from '../services/medicionesService.js'
import { evaluarEstadoSpo2 } from '../services/spo2Service.js'
import { ultimaSpo2Medida } from '../data/lecciones.js'

const { isAuthenticated } = useAuth()
const cargando = ref(false)
const error = ref('')
const medida = ref(null)
const sinConexion = ref(false)

const estado = computed(() => evaluarEstadoSpo2(medida.value?.spo2))
const fechaTexto = computed(() =>
  medida.value?.fecha
    ? new Date(medida.value.fecha).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
    : ''
)

async function cargar() {
  if (!isAuthenticated.value) return
  cargando.value = true
  error.value = ''
  const resultado = await listarHistorial({ pagina: 0 })
  cargando.value = false
  if (resultado.error) {
    error.value = resultado.error
    return
  }
  sinConexion.value = resultado.sinConexion
  medida.value = ultimaSpo2Medida(resultado.items)
}

onMounted(cargar)
watch(isAuthenticated, cargar)
</script>

<style scoped>
.spo2-medida {
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-primary);
  border-radius: 0.5rem;
  padding: 1rem;
  margin: 1rem 0;
  background: var(--color-bg);
}
.titulo { font-size: 1rem; font-weight: 600; margin: 0 0 0.5rem; }
.mensaje { margin: 0; font-size: 0.9rem; color: var(--color-muted); }
.lectura { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; }
.numero { font-size: 2.6rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.unidad { font-size: 0.95rem; font-weight: 600; margin-left: 0.35rem; color: var(--color-muted); }
.pastilla { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 600; background: #e2e8f0; }
.fecha, .explica { margin: 0.35rem 0 0; font-size: 0.85rem; color: var(--color-muted); }
.estado-success { color: var(--color-success); }
.estado-warning { color: var(--color-warning); }
.estado-danger { color: var(--color-danger); }
.pastilla.estado-success { background: #dcfce7; }
.pastilla.estado-warning { background: #ffedd5; }
.pastilla.estado-danger { background: #fee2e2; }
</style>
