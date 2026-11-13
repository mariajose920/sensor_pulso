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
          <label :for="`${uid}-abre`">Fecha y hora de inicio *</label>
          <input :id="`${uid}-abre`" class="form-input" type="datetime-local" :value="modelValue.abreEn" data-testid="asignacion-abre"
                 @input="cambiar({ abreEn: $event.target.value })" />
        </div>
        <div class="campo">
          <label :for="`${uid}-cierra`">Fecha y hora de término *</label>
          <input :id="`${uid}-cierra`" class="form-input" type="datetime-local" :value="modelValue.cierraEn" :min="modelValue.abreEn || undefined"
                 data-testid="asignacion-cierra" @input="cambiar({ cierraEn: $event.target.value })" />
        </div>
      </div>

      <p class="ayuda">La evaluación se abre sola al inicio y se cierra sola al término.</p>

      <ul v-if="mostrarErrores && errores.length" class="alert alert-error errores" role="alert" data-testid="asignacion-errores">
        <li v-for="e in errores" :key="e">{{ e }}</li>
      </ul>
    </template>
  </fieldset>
</template>

<script setup>
/**
 * RF104 / RF109: pide a qué curso y cuándo se asigna una evaluación (fecha de inicio o «dentro de N minutos»).
 * Uso: <AsignacionEvaluacionForm v-model="asignacion" :cursos="cursos" con-interruptor :mostrar-errores="intento" />
 * El modelo es el de `asignacionVacia()` (src/utils/asignacionEvaluacion.js).
 */
import { computed, getCurrentInstance, onMounted } from 'vue'
import { fechasSugeridas, validarAsignacion } from '../utils/asignacionEvaluacion.js'

const props = defineProps({
  modelValue: { type: Object, required: true },
  cursos: { type: Array, default: () => [] },
  conInterruptor: { type: Boolean, default: false },
  textoInterruptor: { type: String, default: 'Asignar a los estudiantes al guardar' },
  mostrarErrores: { type: Boolean, default: false }
})
const emit = defineEmits(['update:modelValue'])

const uid = `asignacion-${getCurrentInstance()?.uid ?? 0}`
const errores = computed(() => validarAsignacion(props.modelValue))

// La asignación siempre es por fechas: inicio y término fijos
const cambiar = (parte) => {
  const siguiente = { ...props.modelValue, ...parte, modo: 'ventana', inicioTipo: 'fecha' }
  // Al activar la asignación se proponen fechas para no partir en blanco
  if (parte.asignar === true) {
    const sug = fechasSugeridas()
    if (!siguiente.abreEn) siguiente.abreEn = sug.abreEn
    if (!siguiente.cierraEn) siguiente.cierraEn = sug.cierraEn
  }
  emit('update:modelValue', siguiente)
}

onMounted(() => {
  const m = props.modelValue
  if (m.modo !== 'ventana' || m.inicioTipo !== 'fecha' || !m.abreEn || !m.cierraEn) {
    const sug = fechasSugeridas()
    emit('update:modelValue', { ...m, modo: 'ventana', inicioTipo: 'fecha', abreEn: m.abreEn || sug.abreEn, cierraEn: m.cierraEn || sug.cierraEn })
  }
})
</script>

<style scoped>
.asignacion { border: 1px solid var(--color-border); border-radius: 10px; padding: 0.8rem 1rem; margin: 1rem 0; }
.asignacion legend { padding: 0 0.4rem; }
.asignar-interruptor { display: flex; align-items: center; gap: 0.5rem; cursor: pointer; font-weight: 600; margin-bottom: 0.5rem; }
.asignacion-campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 0.75rem 1rem; }
.campo { display: flex; flex-direction: column; gap: 0.3rem; }
.campo label { font-size: 0.85rem; font-weight: 600; }
.ayuda { color: var(--color-muted); font-size: 0.85rem; margin: 0.5rem 0 0; }
.errores { margin: 0.75rem 0 0; padding-left: 1.5rem; }
</style>
