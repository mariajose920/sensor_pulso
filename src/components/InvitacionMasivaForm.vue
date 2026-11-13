<template>
  <form class="invitacion-masiva" data-testid="invitacion-masiva" @submit.prevent="enviar">
    <div class="form-group">
      <label class="form-label" :for="`${uid}-correos`">Correos institucionales de los estudiantes (@alu.unach.cl) *</label>
      <textarea
        :id="`${uid}-correos`"
        v-model="texto"
        class="form-input"
        rows="4"
        placeholder="uno@alu.unach.cl, dos@alu.unach.cl&#10;tres@alu.unach.cl"
        data-testid="correos-invitacion"
        :disabled="enviando"
      />
      <!-- Separadores aceptados -->
      <div class="separadores" data-testid="separadores">
        <span class="separadores-titulo">Separa un correo de otro con:</span>
        <span class="separador-chip">coma <code>,</code></span>
        <span class="separador-chip">punto y coma <code>;</code></span>
        <span class="separador-chip">espacio</span>
        <span class="separador-chip">salto de línea (Enter)</span>
      </div>
      <small class="help-text">
        Escribe o pega la lista completa (por ejemplo desde Excel o un correo) y se envía una invitación a cada estudiante.
        Hasta {{ MAX_INVITACIONES_POR_ENVIO }} por envío. El código se manda por correo desde la cuenta de Gmail de la plataforma.
      </small>
    </div>

    <!-- Lista de lo que se va a enviar, con × para quitar cada correo -->
    <div v-if="leidos.validos.length || leidos.invalidos.length" class="correos-leidos" data-testid="correos-leidos">
      <div class="correos-chips">
        <span v-for="c in leidos.validos" :key="c" class="chip chip-ok" data-testid="chip-valido">
          {{ c }}
          <button type="button" class="chip-x" :aria-label="'Quitar ' + c" :disabled="enviando" @click="quitar(c)">×</button>
        </span>
        <span v-for="c in leidos.invalidos" :key="'i-' + c" class="chip chip-error" data-testid="chip-invalido"
              title="No es un correo de estudiante (@alu.unach.cl)">
          {{ c }}
          <button type="button" class="chip-x" :aria-label="'Quitar ' + c" :disabled="enviando" @click="quitar(c)">×</button>
        </span>
      </div>
      <small class="help-text" data-testid="resumen-correos">
        {{ leidos.validos.length }} listo(s) para enviar
        <template v-if="leidos.invalidos.length"> · {{ leidos.invalidos.length }} no válido(s) (se omiten)</template>
        <template v-if="leidos.repetidos.length"> · {{ leidos.repetidos.length }} repetido(s) (se envía una vez)</template>
        <template v-if="leidos.excedidos.length"> · {{ leidos.excedidos.length }} sobran sobre el máximo; envíalos después</template>
      </small>
    </div>

    <!-- Resultado del último envío -->
    <div v-if="resultado" class="alert" :class="resultado.fallidos.length ? 'alert-warning' : 'alert-success'"
         style="font-size: 0.85rem; margin-top: 0.75rem;" data-testid="resultado-envio">
      Enviadas: {{ resultado.enviados.length }}<span v-if="resultado.fallidos.length"> · Fallidas: {{ resultado.fallidos.length }}</span>
      <ul v-if="resultado.fallidos.length" style="margin: 0.35rem 0 0; padding-left: 1.2rem;">
        <li v-for="f in resultado.fallidos" :key="f.correo"><strong>{{ f.correo }}</strong>: {{ f.error }}</li>
      </ul>
    </div>

    <div class="modal-actions">
      <button type="button" class="btn btn-secondary" :disabled="enviando" @click="$emit('cerrar')">Cerrar</button>
      <button type="submit" class="btn btn-primary" :disabled="enviando || !leidos.validos.length" data-testid="enviar-invitaciones">
        <span v-if="enviando">📨 Enviando {{ progreso.hecho }} de {{ progreso.total }}...</span>
        <span v-else>Enviar {{ leidos.validos.length > 1 ? leidos.validos.length + ' invitaciones' : 'invitación' }}</span>
      </button>
    </div>
  </form>
</template>

<script setup>
/**
 * RF100: formulario para invitar a uno o varios estudiantes a un aula en una sola petición.
 * Se escribe o pega una lista de correos; los separadores aceptados son coma, punto y coma, espacio y salto de línea.
 * Uso: <InvitacionMasivaForm :aula-id="aula.id" :profesor-id="..." :profesor-nombre="..." :es-admin="false"
 *                            @resultado="..." @cerrar="..." />
 * Emite `resultado` con { success, enviados, fallidos, message, error } cuando termina un envío.
 */
import { computed, getCurrentInstance, ref } from 'vue'
import { enviarInvitacionesVarias } from '../services/aulasService'
import { parsearCorreos, quitarCorreoDelTexto, MAX_INVITACIONES_POR_ENVIO } from '../utils/correosInvitacion.js'

const props = defineProps({
  aulaId: { type: String, required: true },
  profesorId: { type: String, default: '' },
  profesorNombre: { type: String, default: '' },
  esAdmin: { type: Boolean, default: false }
})
const emit = defineEmits(['resultado', 'cerrar'])

const uid = `invitacion-${getCurrentInstance()?.uid ?? 0}`
const texto = ref('')
const enviando = ref(false)
const resultado = ref(null)
const progreso = ref({ hecho: 0, total: 0 })
const leidos = computed(() => parsearCorreos(texto.value))

const quitar = (correo) => {
  texto.value = quitarCorreoDelTexto(texto.value, correo)
}

const enviar = async () => {
  const { validos } = leidos.value
  if (!validos.length || enviando.value) return
  enviando.value = true
  resultado.value = null
  progreso.value = { hecho: 0, total: validos.length }

  const res = await enviarInvitacionesVarias({
    aulaId: props.aulaId,
    correos: validos,
    profesorId: props.profesorId,
    profesorNombre: props.profesorNombre,
    esAdmin: props.esAdmin,
    alProgresar: (p) => { progreso.value = p }
  })
  enviando.value = false

  resultado.value = { enviados: res.enviados || [], fallidos: res.fallidos || [] }
  if (res.success) {
    // Quedan en el cuadro solo los que fallaron y los no válidos, para corregirlos o reintentar
    texto.value = [...resultado.value.fallidos.map((f) => f.correo), ...leidos.value.invalidos].join('\n')
  }
  emit('resultado', { ...res, todoEnviado: res.success && !resultado.value.fallidos.length && !leidos.value.invalidos.length })
}

// Para que quien lo use pueda limpiar el formulario al abrir de nuevo
defineExpose({ limpiar: () => { texto.value = ''; resultado.value = null } })
</script>

<style scoped>
.separadores { display: flex; flex-wrap: wrap; gap: 0.35rem; align-items: center; margin: 0.4rem 0 0.35rem; font-size: 0.8rem; }
.separadores-titulo { font-weight: 600; color: var(--color-muted, #64748b); }
.separador-chip { background: #eff6ff; color: #1e3a8a; border-radius: 6px; padding: 0.1rem 0.5rem; }
.separador-chip code { background: #dbeafe; border-radius: 4px; padding: 0 0.3rem; font-weight: 700; }
.correos-leidos { margin-top: 0.5rem; }
.correos-chips { display: flex; flex-wrap: wrap; gap: 0.35rem; margin-bottom: 0.35rem; }
.chip { display: inline-flex; align-items: center; gap: 0.3rem; padding: 0.15rem 0.2rem 0.15rem 0.6rem; border-radius: 999px; font-size: 0.78rem; }
.chip-ok { background: #dcfce7; color: #14532d; }
.chip-error { background: #fee2e2; color: #7f1d1d; }
.chip-x { border: 0; background: transparent; cursor: pointer; font-size: 1rem; line-height: 1; padding: 0 0.4rem; color: inherit; }
</style>
