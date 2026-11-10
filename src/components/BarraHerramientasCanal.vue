<template>
  <div class="herramientas" role="toolbar" :aria-label="`Herramientas del canal ${canal}`" data-testid="herramientas-canal" :style="{ '--c': color }">
    <div class="grupo" role="group" :aria-label="`Acciones del canal ${canal}`">
      <button
        v-if="!terminada"
        type="button"
        class="h-btn"
        :class="{ activo: pausada }"
        data-testid="pausar-canal"
        :aria-label="pausada ? `Reanudar la gráfica del canal ${canal}` : `Pausar la gráfica del canal ${canal}`"
        @click="emit('pausar')"
      ><span class="icono" aria-hidden="true">{{ pausada ? '▶' : '❚❚' }}</span> {{ pausada ? 'Reanudar' : 'Pausar' }}</button>
      <button
        type="button"
        class="h-btn"
        data-testid="capturar-canal"
        :aria-label="`Capturar la gráfica del canal ${canal} como imagen PNG`"
        @click="emit('capturar')"
      ><span class="icono" aria-hidden="true">[ ]</span> Capturar PNG</button>
      <button
        type="button"
        class="h-btn"
        data-testid="exportar-csv-canal"
        :aria-label="`Exportar los datos del canal ${canal} a un archivo CSV`"
        @click="emit('exportar')"
      ><span class="icono" aria-hidden="true">CSV</span> Exportar</button>
    </div>

    <div class="grupo" role="group" :aria-label="`Qué mostrar en la gráfica del canal ${canal}`">
      <button
        v-for="f in filtros"
        :key="f.clave"
        type="button"
        class="h-btn interruptor"
        :class="{ activo: ajustes[f.clave] }"
        :aria-pressed="ajustes[f.clave]"
        :aria-label="`${f.descripcion} del canal ${canal}: ${ajustes[f.clave] ? 'activado' : 'desactivado'}`"
        :data-testid="`filtro-${f.clave}`"
        @click="emit('alternar', f.clave)"
      ><span class="marca" aria-hidden="true">{{ ajustes[f.clave] ? '✓' : '' }}</span> {{ f.texto }}</button>
    </div>
  </div>
</template>

<script setup>
defineProps({
  canal: { type: Number, required: true },
  color: { type: String, default: '#38bdf8' },
  ajustes: { type: Object, required: true },
  pausada: { type: Boolean, default: false },
  terminada: { type: Boolean, default: false }
})
const emit = defineEmits(['pausar', 'capturar', 'exportar', 'alternar'])

const filtros = [
  { clave: 'picos', texto: 'Picos', descripcion: 'Mostrar los puntos de los picos' },
  { clave: 'spo2', texto: 'SpO₂', descripcion: 'Mostrar la gráfica de SpO₂' },
  { clave: 'dsp', texto: 'Filtro DSP', descripcion: 'Filtro DSP (señal filtrada 0,5–5 Hz)' }
]
</script>

<style scoped>
.herramientas { display: flex; flex-wrap: wrap; gap: 0.5rem 1rem; margin: 0.5rem 0 0; padding: 0.45rem 0.5rem; background: #f1f5f9; border-radius: 0.45rem; color: #0f172a; }
.grupo { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.h-btn { display: inline-flex; align-items: center; gap: 0.3rem; min-height: 2rem; padding: 0.2rem 0.65rem; background: #fff; color: #0f172a; border: 1px solid #94a3b8; border-radius: 0.35rem; font-size: 0.78rem; font-weight: 600; cursor: pointer; }
.h-btn:hover { background: #e2e8f0; }
.h-btn:focus-visible { outline: 3px solid #0369a1; outline-offset: 2px; }
.h-btn.activo { background: #0369a1; border-color: #0369a1; color: #fff; }
.icono { font-size: 0.7rem; font-family: monospace; letter-spacing: -0.05em; }
.marca { display: inline-flex; align-items: center; justify-content: center; width: 1rem; height: 1rem; border: 1.5px solid currentColor; border-radius: 0.2rem; font-size: 0.7rem; line-height: 1; }
@media (max-width: 600px) {
  .herramientas { flex-direction: column; align-items: stretch; }
  .grupo { flex-direction: column; }
  .h-btn { width: 100%; justify-content: center; min-height: 2.5rem; font-size: 0.85rem; }
}
</style>
