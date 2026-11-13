<template>
  <div class="tipo-form" data-testid="tipo-evaluacion-form">
    <fieldset class="form-group tipo-opciones">
      <legend class="form-label">Tipo de evaluación</legend>
      <label v-for="t in LISTA_TIPOS" :key="t.valor" class="tipo-opcion" :class="{ activa: modelValue.tipo === t.valor }">
        <input
          type="radio"
          :name="`${uid}-tipo`"
          :value="t.valor"
          :checked="modelValue.tipo === t.valor"
          :disabled="bloqueado"
          :data-testid="`tipo-${t.valor}`"
          @change="elegirTipo(t.valor)"
        />
        <span class="tipo-opcion-titulo">{{ t.etiqueta }}</span>
        <span class="tipo-opcion-desc">{{ t.descripcion }}</span>
      </label>
    </fieldset>

    <template v-if="modelValue.tipo === 'ejercicio_aplicado'">
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

        <div class="criterio-campos reintentos">
          <div class="campo">
            <label :for="`${uid}-reintentos`">Intentos permitidos al estudiante</label>
            <input :id="`${uid}-reintentos`" class="form-input" type="number" step="1"
                   :min="REINTENTOS.min" :max="REINTENTOS.max"
                   :value="modelValue.reintentos ?? REINTENTOS.porDefecto" :disabled="bloqueado"
                   data-testid="criterio-reintentos" @input="cambiarReintentos($event.target.value)" />
          </div>
        </div>
      </div>
    </template>

    <p v-if="bloqueado" class="alert alert-info" data-testid="tipo-bloqueado">
      Esta evaluación ya tiene intentos de estudiantes, así que el tipo y el ejercicio no se pueden cambiar.
    </p>
    <ul v-if="mostrarErrores && errores.length" class="alert alert-error errores" role="alert" data-testid="tipo-errores">
      <li v-for="e in errores" :key="e">{{ e }}</li>
    </ul>
  </div>
</template>

<script setup>
/**
 * RF106: selector del tipo de evaluación y de su ejercicio, con el criterio de calificación.
 * Uso: <TipoEvaluacionForm v-model="modelo" :mostrar-errores="intentoGuardar" />
 * La calificación automática en sí es del RF107; aquí solo se captura y valida el criterio.
 */
import { computed, getCurrentInstance } from 'vue'
import {
  LISTA_TIPOS, LISTA_EJERCICIOS, EJERCICIOS,
  cambiarTipo, cambiarEjercicio, validarTipoEvaluacion, REINTENTOS
} from '../utils/tiposEvaluacion.js'

const props = defineProps({
  modelValue: { type: Object, required: true },
  mostrarErrores: { type: Boolean, default: false },
  bloqueado: { type: Boolean, default: false },
  // RF107: opciones de referencia para comparar señales
  plantillas: { type: Array, default: () => [] },
  medicionesReferencia: { type: Array, default: () => [] }
})
const emit = defineEmits(['update:modelValue'])

const uid = `tipo-eval-${getCurrentInstance()?.uid ?? 0}`
const ejercicio = computed(() => EJERCICIOS[props.modelValue.ejercicio] || null)
const errores = computed(() => validarTipoEvaluacion(props.modelValue, { exigirReferencia: true }))
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

const elegirTipo = (tipo) => emit('update:modelValue', cambiarTipo(props.modelValue, tipo))
const elegirEjercicio = (valor) => emit('update:modelValue', cambiarEjercicio(props.modelValue, valor))
const ponerReferencia = (ref) => emit('update:modelValue', {
  ...props.modelValue,
  criterio: { ...props.modelValue.criterio, referencia: ref }
})
const elegirOrigen = (origen) => ponerReferencia({ origen, id: '' })
const elegirReferencia = (id) => ponerReferencia({ origen: referencia.value.origen, id })
const cambiarReintentos = (valor) => emit('update:modelValue', {
  ...props.modelValue,
  reintentos: valor === '' ? '' : Number(valor)
})
const cambiarCriterio = (campo, valor) => {
  emit('update:modelValue', {
    ...props.modelValue,
    criterio: { ...props.modelValue.criterio, [campo]: valor === '' ? '' : Number(valor) }
  })
}
</script>

<style scoped>
.tipo-opciones { border: 0; padding: 0; margin: 0 0 1rem; display: grid; gap: 0.5rem; }
.tipo-opcion {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.6rem;
  align-items: center;
  padding: 0.7rem 0.9rem;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  cursor: pointer;
  min-height: var(--alto-tactil, 44px);
}
.tipo-opcion.activa { border-color: var(--color-primary); background: #eff6ff; }
.tipo-opcion-titulo { font-weight: 600; }
.tipo-opcion-desc { grid-column: 2; font-size: 0.85rem; color: var(--color-muted); }
.criterio-ayuda { margin: 0 0 0.5rem; font-size: 0.85rem; color: var(--color-muted); }
.criterio-campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 0.75rem 1rem; }
.campo { display: flex; flex-direction: column; gap: 0.3rem; }
.campo label { font-size: 0.85rem; }
.reintentos { margin-top: 0.75rem; }
.errores { margin: 0.75rem 0 0; padding-left: 1.5rem; }
</style>
