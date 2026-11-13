<template>
  <div class="selector-medicion" data-testid="selector-medicion">
    <!-- Hacer el ejercicio: ir a medir o a comparar y volver -->
    <div class="sm-accion">
      <button type="button" class="btn btn-primary sm-ir" data-testid="hacer-ejercicio" :disabled="deshabilitado" @click="$emit('ir')">
        <span aria-hidden="true">{{ accion.icono }}</span> {{ accion.texto }}
      </button>
      <p class="sm-ayuda">{{ accion.ayuda }}</p>
    </div>

    <div class="sm-cabecera">
      <strong>{{ mediciones.length ? 'O elige una medición ya guardada' : 'Aún no tienes mediciones guardadas' }}</strong>
      <button type="button" class="sm-actualizar" :disabled="deshabilitado" data-testid="actualizar-mediciones" @click="$emit('actualizar')">
        ↻ Actualizar lista
      </button>
    </div>

    <p v-if="!mediciones.length" class="sm-vacia">
      Guarda una medición con el botón «{{ accion.texto }}» y vuelve a esta evaluación: la encontrarás aquí.
    </p>

    <div v-else class="sm-lista" role="radiogroup" :aria-label="'Mediciones guardadas para ' + etiqueta">
      <label v-for="m in mediciones" :key="m.id" class="sm-opcion" :class="{ elegida: modelValue === m.id, mala: m.calidad === 'mala' }" data-testid="opcion-medicion">
        <input type="radio" :name="nombre" :value="m.id" :checked="modelValue === m.id" :disabled="deshabilitado" @change="$emit('update:modelValue', m.id)" />
        <span class="sm-marca" aria-hidden="true"></span>
        <span class="sm-datos">
          <strong>{{ fecha(m.inicio) }}</strong>
          <span class="sm-valores">
            <span>{{ m.bpm_promedio ?? '—' }} BPM</span>
            <span>{{ m.spo2_promedio ?? '—' }} % SpO₂</span>
          </span>
        </span>
        <span v-if="m.calidad" class="sm-calidad" :class="'calidad-' + m.calidad">{{ ETIQUETA_CALIDAD[m.calidad] || m.calidad }}</span>
        <span v-if="m.nueva" class="sm-nueva">nueva</span>
      </label>
    </div>

    <p v-if="hayMala" class="sm-aviso" data-testid="aviso-senal-mala">
      Puedes entregar también una medición con señal mala: se califica igual y la corrección te dirá qué pasó.
    </p>
  </div>
</template>

<script setup>
/**
 * RF107: elegir la medición que se entrega en un ejercicio aplicado.
 * Se puede elegir CUALQUIER medición guardada (sin importar si salió bien o mal) o salir a hacer una nueva.
 * v-model: id de la medición elegida. Emite `ir` (hacer el ejercicio) y `actualizar` (volver a leer las mediciones).
 */
import { computed } from 'vue'
import { ACCION_EJERCICIO, ETIQUETA_CALIDAD } from '../utils/ejercicioEvaluacion.js'

const props = defineProps({
  modelValue: { type: [String, null], default: '' },
  mediciones: { type: Array, default: () => [] },
  ejercicio: { type: String, default: 'medir_pulso' },
  nombre: { type: String, default: 'medicion' },
  deshabilitado: { type: Boolean, default: false }
})
defineEmits(['update:modelValue', 'ir', 'actualizar'])

const accion = computed(() => ACCION_EJERCICIO[props.ejercicio] || ACCION_EJERCICIO.medir_pulso)
const etiqueta = computed(() => accion.value.texto.toLowerCase())
const hayMala = computed(() => props.mediciones.some((m) => m.calidad === 'mala'))
const fecha = (v) => new Date(v).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
</script>

<style scoped>
.selector-medicion { display: flex; flex-direction: column; gap: 0.7rem; }
.sm-accion { display: flex; align-items: center; gap: 0.8rem; flex-wrap: wrap; padding: 0.8rem 1rem; border-radius: 12px; background: #eff6ff; border: 1px solid #bfdbfe; }
.sm-ir { white-space: nowrap; }
.sm-ayuda { margin: 0; font-size: 0.85rem; color: #1e3a8a; flex: 1 1 220px; }
.sm-cabecera { display: flex; justify-content: space-between; align-items: center; gap: 0.5rem; flex-wrap: wrap; font-size: 0.92rem; }
.sm-actualizar { border: 0; background: none; color: var(--color-primary); font-weight: 600; cursor: pointer; font-size: 0.85rem; padding: 0.2rem 0; }
.sm-vacia { margin: 0; padding: 0.8rem 1rem; border: 2px dashed var(--color-border); border-radius: 10px; color: var(--color-muted); font-size: 0.9rem; }
.sm-lista { display: grid; gap: 0.45rem; max-height: 17rem; overflow-y: auto; padding: 0.15rem; }
.sm-opcion { display: flex; align-items: center; gap: 0.7rem; padding: 0.6rem 0.8rem; border: 1.5px solid var(--color-border); border-radius: 10px; background: #fff; cursor: pointer; transition: border-color 0.12s, background 0.12s; }
.sm-opcion:hover { border-color: #93c5fd; background: #f8fbff; }
.sm-opcion.elegida { border-color: var(--color-primary); background: #eff6ff; }
.sm-opcion input { position: absolute; opacity: 0; pointer-events: none; }
.sm-opcion:focus-within { outline: 2px solid var(--color-primary); outline-offset: 2px; }
.sm-marca { flex: none; width: 1.15rem; height: 1.15rem; border-radius: 50%; border: 2px solid #cbd5e1; background: #fff; }
.sm-opcion.elegida .sm-marca { border-color: var(--color-primary); background: radial-gradient(circle, var(--color-primary) 45%, #fff 50%); }
.sm-datos { display: flex; flex-direction: column; gap: 0.1rem; flex: 1; min-width: 0; font-size: 0.88rem; }
.sm-valores { display: flex; gap: 0.9rem; color: var(--color-muted); font-size: 0.82rem; }
.sm-calidad { padding: 0.1rem 0.55rem; border-radius: 999px; font-size: 0.72rem; font-weight: 700; white-space: nowrap; background: #f1f5f9; color: #475569; }
.sm-calidad.calidad-buena { background: #dcfce7; color: #166534; }
.sm-calidad.calidad-regular { background: #fef3c7; color: #92400e; }
.sm-calidad.calidad-mala { background: #fee2e2; color: #991b1b; }
.sm-nueva { padding: 0.1rem 0.5rem; border-radius: 999px; background: #dbeafe; color: #1e3a8a; font-size: 0.72rem; font-weight: 700; }
.sm-aviso { margin: 0; font-size: 0.82rem; color: var(--color-muted); }
@media (max-width: 560px) { .sm-ir { width: 100%; } }
</style>
