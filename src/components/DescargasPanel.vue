<template>
  <div class="card">
    <h2 class="card-title">Descargas (RF32)</h2>
    <p style="color: var(--color-muted); font-size: 0.9rem; margin-bottom: 1rem;">
      Descarga el informe en PDF, los datos de la señal en CSV o el gráfico comparativo como imagen PNG.
    </p>
    <div class="descargas-botones">
      <button class="btn btn-primary" :disabled="ocupado" @click="ejecutar('informe_pdf', descargarPdf)">
        {{ ocupado === 'informe_pdf' ? 'Generando…' : 'Informe PDF' }}
      </button>
      <button class="btn btn-primary" :disabled="ocupado" @click="ejecutar('datos_csv', descargarCsv)">
        {{ ocupado === 'datos_csv' ? 'Generando…' : 'Datos CSV' }}
      </button>
      <button class="btn btn-primary" :disabled="ocupado" @click="ejecutar('grafico_imagen', descargarImagen)">
        {{ ocupado === 'grafico_imagen' ? 'Generando…' : 'Gráfico PNG' }}
      </button>
    </div>
    <p v-if="mensaje" :class="['alert', error ? 'alert-error' : 'alert-info']" style="margin-top: 1rem;" role="status">
      {{ mensaje }}
    </p>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { descargarCsv, descargarImagen, auditarDescarga } from '../utils/descargas.js'
import { descargarPdf } from '../utils/exportPdf.js'

const props = defineProps({
  bpm: { type: Number, required: true },
  amplitude: { type: Number, default: 100 },
  measurementName: { type: String, default: 'Medicion' }
})

const ocupado = ref('')
const mensaje = ref('')
const error = ref(false)

const datos = computed(() => ({
  nombre: props.measurementName || 'Medicion',
  bpm: props.bpm,
  amplitud: props.amplitude,
  intervaloMs: Math.round(60000 / Math.max(30, props.bpm))
}))

async function ejecutar(tipo, accion) {
  ocupado.value = tipo
  mensaje.value = ''
  error.value = false
  try {
    await accion(datos.value)
    const auditoria = await auditarDescarga(tipo)
    mensaje.value = auditoria.registrada
      ? 'Descarga lista y registrada en la auditoría.'
      : 'Descarga lista. Inicia sesión para que quede registrada en la auditoría.'
  } catch (e) {
    error.value = true
    mensaje.value = 'No se pudo generar el archivo. Intenta de nuevo.'
    console.error(e)
  } finally {
    ocupado.value = ''
  }
}
</script>

<style scoped>
.descargas-botones {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
}
.descargas-botones .btn {
  flex: 1 1 140px;
}
</style>
