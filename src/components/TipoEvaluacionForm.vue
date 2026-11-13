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

    <!-- Ejercicio aplicado: un ejercicio con su criterio -->
    <template v-if="modelValue.tipo === 'ejercicio_aplicado'">
      <EjercicioCriterioEditor
        :model-value="{ ejercicio: modelValue.ejercicio, criterio: modelValue.criterio }"
        :uid="`${uid}-unico`"
        :bloqueado="bloqueado"
        :plantillas="plantillas"
        :mediciones-referencia="medicionesReferencia"
        @update:model-value="cambiarUnico"
      />
    </template>

    <!-- Mixta: preguntas + uno o más ejercicios (RF107) -->
    <template v-if="modelValue.tipo === 'mixta'">
      <p class="criterio-ayuda" data-testid="mixta-ayuda">
        Las preguntas se agregan más abajo, en la sección de preguntas. Aquí defines los ejercicios aplicados y los puntos que vale cada uno.
      </p>
      <div v-for="(e, i) in modelValue.ejercicios" :key="i" class="ejercicio-item" data-testid="ejercicio-mixto">
        <div class="ejercicio-item-cabecera">
          <strong>Ejercicio {{ i + 1 }}</strong>
          <button v-if="modelValue.ejercicios.length > 1 && !bloqueado" type="button" class="btn btn-secondary btn-sm"
                  data-testid="quitar-ejercicio" @click="quitar(i)">Quitar</button>
        </div>
        <EjercicioCriterioEditor
          :model-value="{ ejercicio: e.ejercicio, criterio: e.criterio }"
          :uid="`${uid}-ej${i}`"
          :bloqueado="bloqueado"
          :plantillas="plantillas"
          :mediciones-referencia="medicionesReferencia"
          @update:model-value="cambiarMixto(i, $event)"
        />
        <div class="campo campo-puntaje">
          <label :for="`${uid}-pts${i}`">Puntaje del ejercicio</label>
          <input :id="`${uid}-pts${i}`" class="form-input" type="number" step="1"
                 :min="PUNTAJE_EJERCICIO.min" :max="PUNTAJE_EJERCICIO.max"
                 :value="e.puntaje" :disabled="bloqueado" data-testid="ejercicio-puntaje"
                 @input="cambiarPuntaje(i, $event.target.value)" />
        </div>
      </div>
      <button v-if="!bloqueado && modelValue.ejercicios.length < MAX_EJERCICIOS_MIXTA" type="button"
              class="btn btn-secondary" data-testid="agregar-ejercicio" @click="agregar">
        ➕ Agregar otro ejercicio
      </button>
    </template>

    <!-- Intentos permitidos por ejercicio -->
    <div v-if="modelValue.tipo !== 'preguntas'" class="criterio-campos reintentos">
      <div class="campo">
        <label :for="`${uid}-reintentos`">Intentos permitidos al estudiante{{ modelValue.tipo === 'mixta' ? ' (por ejercicio)' : '' }}</label>
        <input :id="`${uid}-reintentos`" class="form-input" type="number" step="1"
               :min="REINTENTOS.min" :max="REINTENTOS.max"
               :value="modelValue.reintentos ?? REINTENTOS.porDefecto" :disabled="bloqueado"
               data-testid="criterio-reintentos" @input="cambiarReintentos($event.target.value)" />
      </div>
    </div>

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
 * RF106: selector del tipo de evaluación (preguntas, ejercicio aplicado o mixta) con su criterio de calificación.
 * Uso: <TipoEvaluacionForm v-model="modelo" :mostrar-errores="intentoGuardar" />
 * La calificación automática en sí es del RF107; aquí solo se captura y valida el criterio.
 */
import { computed, getCurrentInstance } from 'vue'
import EjercicioCriterioEditor from './EjercicioCriterioEditor.vue'
import {
  LISTA_TIPOS, REINTENTOS, PUNTAJE_EJERCICIO, MAX_EJERCICIOS_MIXTA,
  cambiarTipo, agregarEjercicioMixto, quitarEjercicioMixto, validarTipoEvaluacion
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
const errores = computed(() => validarTipoEvaluacion(props.modelValue, { exigirReferencia: true }))

const elegirTipo = (tipo) => emit('update:modelValue', cambiarTipo(props.modelValue, tipo))
const cambiarUnico = (parte) => emit('update:modelValue', { ...props.modelValue, ...parte })
const agregar = () => emit('update:modelValue', agregarEjercicioMixto(props.modelValue))
const quitar = (i) => emit('update:modelValue', quitarEjercicioMixto(props.modelValue, i))
const cambiarMixto = (i, parte) => emit('update:modelValue', {
  ...props.modelValue,
  ejercicios: props.modelValue.ejercicios.map((e, j) => (j === i ? { ...e, ...parte } : e))
})
const cambiarPuntaje = (i, valor) => emit('update:modelValue', {
  ...props.modelValue,
  ejercicios: props.modelValue.ejercicios.map((e, j) => (j === i ? { ...e, puntaje: valor === '' ? '' : Number(valor) } : e))
})
const cambiarReintentos = (valor) => emit('update:modelValue', {
  ...props.modelValue,
  reintentos: valor === '' ? '' : Number(valor)
})
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
.campo-puntaje { max-width: 200px; margin-top: 0.5rem; }
.ejercicio-item { border: 1px solid var(--color-border); border-radius: 8px; padding: 0.75rem 0.9rem; margin-bottom: 0.75rem; }
.ejercicio-item-cabecera { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; }
.reintentos { margin-top: 0.75rem; }
.errores { margin: 0.75rem 0 0; padding-left: 1.5rem; }
</style>
