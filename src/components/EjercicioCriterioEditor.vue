<template>
  <div class="ejercicio-editor">
    <div class="form-group">
      <label class="form-label" :for="`${uid}-ejercicio`">Ejercicio</label>
      <select
        :id="`${uid}-ejercicio`"
        class="form-select"
        :value="modelValue.ejercicio || ''"
        :disabled="bloqueado"
        data-testid="ejercicio-select"
        @change="elegirEjercicio($event.target.value)"
      >
        <option value="" disabled>Elige un ejercicio…</option>
        <option v-for="e in LISTA_EJERCICIOS" :key="e.valor" :value="e.valor">{{ e.etiqueta }}</option>
      </select>
    </div>

    <div v-if="ejercicio" class="form-group criterio" data-testid="criterio">
      <span class="form-label">Criterio de calificación</span>
      <p class="criterio-ayuda">{{ ejercicio.instruccion }}</p>

      <div v-if="ejercicio.forma === 'rango'" class="criterio-campos">
        <div class="campo">
          <label :for="`${uid}-min`">Mínimo ({{ ejercicio.unidad }})</label>
          <input :id="`${uid}-min`" class="form-input" type="number" step="1"
                 :min="ejercicio.limites.min" :max="ejercicio.limites.max"
                 :value="modelValue.criterio?.min" :disabled="bloqueado" data-testid="criterio-min"
                 @input="cambiarCriterio('min', $event.target.value)" />
        </div>
        <div class="campo">
          <label :for="`${uid}-max`">Máximo ({{ ejercicio.unidad }})</label>
          <input :id="`${uid}-max`" class="form-input" type="number" step="1"
                 :min="ejercicio.limites.min" :max="ejercicio.limites.max"
                 :value="modelValue.criterio?.max" :disabled="bloqueado" data-testid="criterio-max"
                 @input="cambiarCriterio('max', $event.target.value)" />
        </div>
      </div>
      <div v-else class="criterio-campos">
        <div class="campo">
          <label :for="`${uid}-valor`">Similitud mínima ({{ ejercicio.unidad }})</label>
          <input :id="`${uid}-valor`" class="form-input" type="number" step="1"
                 :min="ejercicio.limites.min" :max="ejercicio.limites.max"
                 :value="modelValue.criterio?.valor" :disabled="bloqueado" data-testid="criterio-valor"
                 @input="cambiarCriterio('valor', $event.target.value)" />
        </div>
        <div class="campo">
          <label :for="`${uid}-origen`">Señal de referencia</label>
          <select :id="`${uid}-origen`" class="form-select" :value="referencia?.origen || ''"
                  :disabled="bloqueado" data-testid="referencia-origen" @change="elegirOrigen($event.target.value)">
            <option value="" disabled>Elige el origen…</option>
            <option value="plantilla">Plantilla del sistema</option>
            <option value="medicion">Una medición mía guardada</option>
          </select>
        </div>
        <div v-if="referencia?.origen" class="campo">
          <label :for="`${uid}-referencia`">{{ referencia.origen === 'plantilla' ? 'Plantilla' : 'Medición' }}</label>
          <select :id="`${uid}-referencia`" class="form-select" :value="referencia.id || ''"
                  :disabled="bloqueado" data-testid="referencia-id" @change="elegirReferencia($event.target.value)">
            <option value="" disabled>Elige una opción…</option>
            <option v-for="o in opcionesReferencia" :key="o.id" :value="o.id">{{ o.texto }}</option>
          </select>
          <small v-if="!opcionesReferencia.length" class="criterio-ayuda">No hay opciones disponibles todavía.</small>
        </div>
      </div>
      <p v-if="ejercicio.forma === 'minimo'" class="criterio-ayuda">
        La similitud se calcula en el servidor con el BPM, la regularidad y el ritmo de la medición.
      </p>
    </div>
  </div>
</template>

<script setup>
/**
 * RF106/RF107: editor de UN ejercicio aplicado y su criterio de calificación.
 * Lo usan el tipo "Ejercicio aplicado" y cada ejercicio de una evaluación mixta.
 * v-model: { ejercicio, criterio }. Al cambiar el ejercicio, el criterio vuelve a su valor por defecto.
 */
import { computed } from 'vue'
import { LISTA_EJERCICIOS, EJERCICIOS, criterioPorDefecto } from '../utils/tiposEvaluacion.js'

const props = defineProps({
  modelValue: { type: Object, required: true },
  uid: { type: String, required: true },
  bloqueado: { type: Boolean, default: false },
  plantillas: { type: Array, default: () => [] },
  medicionesReferencia: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue'])

const ejercicio = computed(() => EJERCICIOS[props.modelValue.ejercicio] || null)
const referencia = computed(() => props.modelValue.criterio?.referencia || null)
const opcionesReferencia = computed(() => {
  if (referencia.value?.origen === 'plantilla') {
    return props.plantillas.map((p) => ({ id: p.id, texto: `${p.nombre}${p.bpm_referencia ? ` · ${p.bpm_referencia} BPM` : ''}` }))
  }
  if (referencia.value?.origen === 'medicion') {
    return props.medicionesReferencia.map((m) => ({
      id: m.id, texto: `${new Date(m.inicio).toLocaleString('es-CL')} · ${m.bpm_promedio} BPM`
    }))
  }
  return []
})

const elegirEjercicio = (valor) => {
  emit('update:modelValue', EJERCICIOS[valor]
    ? { ejercicio: valor, criterio: criterioPorDefecto(valor) }
    : { ejercicio: null, criterio: null })
}
const cambiarCriterio = (campo, valor) => {
  emit('update:modelValue', {
    ejercicio: props.modelValue.ejercicio,
    criterio: { ...props.modelValue.criterio, [campo]: valor === '' ? '' : Number(valor) }
  })
}
const ponerReferencia = (ref) => emit('update:modelValue', {
  ejercicio: props.modelValue.ejercicio,
  criterio: { ...props.modelValue.criterio, referencia: ref }
})
const elegirOrigen = (origen) => ponerReferencia({ origen, id: '' })
const elegirReferencia = (id) => ponerReferencia({ origen: referencia.value.origen, id })
</script>

<style scoped>
.criterio-ayuda { margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--color-muted); }
.criterio-campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem 1rem; }
.campo { display: flex; flex-direction: column; gap: 0.3rem; }
.campo label { font-size: 0.85rem; }
</style>
