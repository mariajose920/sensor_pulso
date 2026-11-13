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
                  @change="cambiarModo($event.target.value)">
            <option v-for="m in MODOS" :key="m.valor" :value="m.valor">{{ m.etiqueta }}</option>
          </select>
        </div>

        <!-- Cuándo empieza -->
        <div class="campo">
          <label :for="`${uid}-inicio-tipo`">¿Cuándo empieza? *</label>
          <select :id="`${uid}-inicio-tipo`" class="form-select" :value="modelValue.inicioTipo" data-testid="asignacion-inicio-tipo"
                  @change="cambiar({ inicioTipo: $event.target.value })">
            <option v-for="t in iniciosPermitidos" :key="t.valor" :value="t.valor">{{ t.etiqueta }}</option>
          </select>
        </div>

        <div v-if="modelValue.inicioTipo === 'fecha'" class="campo">
          <label :for="`${uid}-abre`">Fecha y hora de inicio *</label>
          <input :id="`${uid}-abre`" class="form-input" type="datetime-local" :value="modelValue.abreEn" data-testid="asignacion-abre"
                 @input="cambiar({ abreEn: $event.target.value })" />
        </div>
        <div v-else-if="modelValue.inicioTipo === 'minutos'" class="campo">
          <label :for="`${uid}-inicio-min`">Empieza dentro de (minutos) *</label>
          <input :id="`${uid}-inicio-min`" class="form-input" type="number" min="1" max="43200" step="1" :value="modelValue.inicioMin"
                 data-testid="asignacion-inicio-min" @input="cambiar({ inicioMin: numero($event) })" />
          <small v-if="horaInicio" class="ayuda" data-testid="asignacion-hora-inicio">Empezará el {{ horaInicio }} (si guardas ahora).</small>
        </div>

        <!-- Cuándo termina -->
        <div v-if="modelValue.modo === 'ventana'" class="campo">
          <label :for="`${uid}-cierra`">Fecha y hora de término *</label>
          <input :id="`${uid}-cierra`" class="form-input" type="datetime-local" :value="modelValue.cierraEn" :min="modelValue.abreEn || undefined"
                 data-testid="asignacion-cierra" @input="cambiar({ cierraEn: $event.target.value })" />
        </div>
        <div v-else class="campo">
          <label :for="`${uid}-duracion`">Duración (minutos) *</label>
          <input :id="`${uid}-duracion`" class="form-input" type="number" min="1" max="600" step="1" :value="modelValue.duracionMin"
                 data-testid="asignacion-duracion" @input="cambiar({ duracionMin: numero($event) })" />
        </div>
      </div>

      <p v-if="modelValue.modo === 'en_vivo'" class="ayuda" data-testid="ayuda-en-vivo">
        <template v-if="modelValue.inicioTipo === 'manual'">En vivo: tú la inicias desde el aula y los estudiantes la rinden dentro del tiempo.</template>
        <template v-else>
          <strong>Se inicia sola a la hora indicada</strong>: no tendrás que entrar al aula a pulsar «Iniciar en vivo».
          Dura la duración elegida y se cierra sola.
        </template>
      </p>
      <p v-else class="ayuda">La evaluación se abre sola al inicio y se cierra sola al término.</p>

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
import { computed, getCurrentInstance } from 'vue'
import {
  MODOS_ASIGNACION, TIPOS_INICIO, INICIOS_POR_MODO, fechasSugeridas, validarAsignacion, inicioCalculado
} from '../utils/asignacionEvaluacion.js'

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
const iniciosPermitidos = computed(() => (INICIOS_POR_MODO[props.modelValue.modo] || []).map((t) => TIPOS_INICIO[t]))
const numero = (evento) => (evento.target.value === '' ? '' : Number(evento.target.value))
const horaInicio = computed(() => {
  const d = inicioCalculado(props.modelValue)
  return d ? d.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' }) : ''
})

const necesitaFechas = (a) => a.modo === 'ventana' || a.inicioTipo === 'fecha'

const cambiar = (parte) => {
  const siguiente = { ...props.modelValue, ...parte }
  // Al activar la asignación (o elegir fechas) se proponen fechas para no partir en blanco
  if (necesitaFechas(siguiente) && (parte.asignar === true || parte.inicioTipo || parte.modo)) {
    const sug = fechasSugeridas()
    if (!siguiente.abreEn && siguiente.inicioTipo === 'fecha') siguiente.abreEn = sug.abreEn
    if (!siguiente.cierraEn && siguiente.modo === 'ventana') siguiente.cierraEn = sug.cierraEn
  }
  emit('update:modelValue', siguiente)
}

// Al cambiar de modo, la forma de empezar debe ser una de las que admite (el inicio manual solo existe en vivo)
const cambiarModo = (modo) => {
  const permitidos = INICIOS_POR_MODO[modo] || []
  const inicioTipo = permitidos.includes(props.modelValue.inicioTipo) ? props.modelValue.inicioTipo : permitidos[0]
  cambiar({ modo, inicioTipo })
}
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
