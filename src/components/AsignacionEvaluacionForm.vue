<template>
  <fieldset class="asignacion" data-testid="asignacion-form">
    <legend class="form-label">📅 Asignación a los estudiantes</legend>

    <label v-if="conInterruptor" class="asignar-interruptor">
      <input type="checkbox" :checked="modelValue.asignar" data-testid="asignar-al-guardar" @change="cambiar({ asignar: $event.target.checked })" />
      <span>{{ textoInterruptor }}</span>
    </label>

    <template v-if="!conInterruptor || modelValue.asignar">
      <div class="asignacion-campos">
        <div class="campo">
          <label :for="`${uid}-curso`">¿A qué curso? *</label>
          <select :id="`${uid}-curso`" class="form-select" :value="modelValue.cursoId" data-testid="asignacion-curso"
                  @change="cambiar({ cursoId: $event.target.value })">
            <option value="">Toda el aula</option>
            <option v-for="c in cursos" :key="c.id" :value="c.id">{{ c.nombre }}</option>
          </select>
          <small v-if="!cursos.length" class="ayuda">Esta aula aún no tiene cursos: se asigna a toda el aula.</small>
        </div>

        <div class="campo">
          <label :for="`${uid}-modo`">¿Cómo se aplica? *</label>
          <select :id="`${uid}-modo`" class="form-select" :value="modelValue.modo" data-testid="asignacion-modo"
                  @change="cambiar({ modo: $event.target.value })">
            <option v-for="m in MODOS" :key="m.valor" :value="m.valor">{{ m.etiqueta }}</option>
          </select>
        </div>

        <template v-if="modelValue.modo === 'ventana'">
          <div class="campo">
            <label :for="`${uid}-abre`">Inicio *</label>
            <input :id="`${uid}-abre`" class="form-input" type="datetime-local" :value="modelValue.abreEn" data-testid="asignacion-abre"
                   @input="cambiar({ abreEn: $event.target.value })" />
          </div>
          <div class="campo">
            <label :for="`${uid}-cierra`">Término *</label>
            <input :id="`${uid}-cierra`" class="form-input" type="datetime-local" :value="modelValue.cierraEn" :min="modelValue.abreEn || undefined"
                   data-testid="asignacion-cierra" @input="cambiar({ cierraEn: $event.target.value })" />
          </div>
        </template>
        <div v-else class="campo">
          <label :for="`${uid}-duracion`">Duración (minutos) *</label>
          <input :id="`${uid}-duracion`" class="form-input" type="number" min="1" max="600" step="1" :value="modelValue.duracionMin"
                 data-testid="asignacion-duracion" @input="cambiar({ duracionMin: $event.target.value === '' ? '' : Number(valor($event)) })" />
          <small class="ayuda">En vivo: el profesor la inicia desde el aula y los estudiantes la rinden dentro de este tiempo.</small>
        </div>
      </div>

      <ul v-if="mostrarErrores && errores.length" class="alert alert-error errores" role="alert" data-testid="asignacion-errores">
        <li v-for="e in errores" :key="e">{{ e }}</li>
      </ul>
    </template>
  </fieldset>
</template>

<script setup>
/**
 * RF104 / RF109: pide a qué curso y con qué fechas se asigna una evaluación.
 * Uso: <AsignacionEvaluacionForm v-model="asignacion" :cursos="cursos" con-interruptor :mostrar-errores="intento" />
 * El modelo es el de `asignacionVacia()` (src/utils/asignacionEvaluacion.js).
 */
import { computed, getCurrentInstance } from 'vue'
import { MODOS_ASIGNACION, fechasSugeridas, validarAsignacion } from '../utils/asignacionEvaluacion.js'

const props = defineProps({
  modelValue: { type: Object, required: true },
  cursos: { type: Array, default: () => [] },
  conInterruptor: { type: Boolean, default: false },
  textoInterruptor: { type: String, default: 'Asignar a los estudiantes al guardar' },
  mostrarErrores: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const uid = `asignacion-${getCurrentInstance()?.uid ?? 0}`
const MODOS = Object.values(MODOS_ASIGNACION)
const errores = computed(() => validarAsignacion(props.modelValue))
const valor = (evento) => evento.target.value

const cambiar = (parte) => {
  const siguiente = { ...props.modelValue, ...parte }
  // Al activar la asignación (o pasar a fechas) se proponen fechas para no partir en blanco
  const piden = (parte.asignar === true || parte.modo === 'ventana') && siguiente.modo === 'ventana'
  if (piden && !siguiente.abreEn && !siguiente.cierraEn) Object.assign(siguiente, fechasSugeridas())
  emit('update:modelValue', siguiente)
}
</script>

<style scoped>
.asignacion { border: 1px solid var(--color-border); border-radius: 10px; padding: 0.8rem 1rem; margin: 1rem 0; }
.asignacion legend { padding: 0 0.4rem; }
.asignar-interruptor { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: 600; margin-bottom: 0.5rem; }
.asignacion-campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 0.75rem 1rem; }
.campo { display: flex; flex-direction: column; gap: 0.3rem; }
.campo label { font-size: 0.85rem; font-weight: 600; }
.ayuda { color: var(--color-muted); font-size: 0.8rem; }
.errores { margin: 0.75rem 0 0; padding-left: 1.5rem; }
</style>
