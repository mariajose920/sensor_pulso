<template>
  <div class="modal-backdrop" @click.self="intentarCerrar">
    <div
      ref="caja"
      class="modal-container card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pub-hist-titulo"
      data-testid="publicar-historial-modal"
      @keydown="alTeclear"
    >
      <div class="modal-header">
        <h2 id="pub-hist-titulo" class="modal-title" tabindex="-1" ref="tituloEl">Publicar medición</h2>
        <button type="button" class="btn-close" aria-label="Cerrar" :disabled="trabajando" @click="intentarCerrar">✕</button>
      </div>

      <div class="modal-body">
        <div v-if="!resultado">
          <p class="pregunta" data-testid="pregunta-publicar-historial">¿Quieres publicarla para que otras personas la vean (siempre anonimizada)?</p>
          <div class="vista-previa" data-testid="publicar-historial-vista-previa">
            <p class="vista-titulo">Esto es lo que verá cualquier persona:</p>
            <ul>
              <li v-for="c in vistaPrevia.campos" :key="c.etiqueta"><strong>{{ c.etiqueta }}:</strong> {{ c.valor }}</li>
            </ul>
            <p class="nota">Se publica sin nombre ni datos identificables (no se publica: {{ vistaPrevia.excluidos.join(', ') }}). El rango de edad lo calcula la base con la edad registrada al medir.</p>
          </div>
          <label class="autoriza" data-testid="publicar-historial-autoriza">
            <input v-model="autoriza" type="checkbox" data-testid="publicar-historial-casilla" />
            <span>La persona medida autorizó que su medición se publique de forma anónima (sin su nombre ni datos que la identifiquen) para que otras personas la vean y comparen.</span>
          </label>
          <p v-if="error" class="alerta alerta-error" role="alert" data-testid="publicar-historial-error">{{ error }}</p>
          <div class="acciones">
            <button type="button" class="btn btn-secondary" :disabled="trabajando" data-testid="publicar-historial-cancelar" @click="intentarCerrar">Cancelar</button>
            <button type="button" class="btn btn-primary" :disabled="trabajando || !autoriza" data-testid="publicar-historial-confirmar" @click="publicar">
              {{ trabajando ? 'Publicando…' : 'Sí, publicar' }}
            </button>
          </div>
        </div>
        <div v-else>
          <p class="alerta alerta-ok" role="status" data-testid="publicar-historial-resultado"><strong>Medición publicada.</strong> Ya aparece en la galería, de forma anónima. Puedes retirarla cuando quieras desde el historial.</p>
          <div class="acciones">
            <button ref="botonCerrar" type="button" class="btn btn-primary" @click="$emit('cerrar')">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { publicarMedicion } from '../services/medicionesService'
import { vistaPreviaPublica, mensajeErrorHistorial } from '../utils/terminarMedicion.js'

// Confirmación explícita (RF91) para publicar desde el historial una medición ya guardada. Usa la misma función
// publicarMedicion() que el diálogo «Terminar medición»; la base vuelve a comprobar sesión, permiso, sensor y consentimiento.
const props = defineProps({
  /** Fila del historial (resumirParaHistorial + usuarioId/fin/publica) */
  medicion: { type: Object, required: true }
})
const emit = defineEmits(['cerrar', 'publicada'])

const autoriza = ref(false)
const trabajando = ref(false)
const error = ref('')
const resultado = ref(false)
const caja = ref(null)
const tituloEl = ref(null)
const botonCerrar = ref(null)
let enfocadoAntes = null

// El rango de edad lo calcula la base con la edad guardada al medir; aquí no se inventa un valor
const vistaPrevia = computed(() => {
  const v = vistaPreviaPublica({
    resumen: { bpm: props.medicion.bpm, spo2: props.medicion.spo2, ritmo: props.medicion.ritmo, calidad: props.medicion.calidad },
    datos: { edad: null }
  })
  return { ...v, campos: v.campos.filter(c => c.etiqueta !== 'Rango de edad') }
})

async function publicar() {
  if (trabajando.value || !autoriza.value) return
  error.value = ''
  trabajando.value = true
  try {
    const r = await publicarMedicion(props.medicion.id)
    if (r.ok) {
      resultado.value = true
      emit('publicada', props.medicion.id)
      await nextTick()
      botonCerrar.value?.focus()
    } else {
      error.value = mensajeErrorHistorial(r.motivo, 'publicar')
    }
  } finally {
    trabajando.value = false
  }
}

function intentarCerrar() {
  if (trabajando.value) return
  emit('cerrar')
}

function alTeclear(e) {
  if (e.key === 'Escape') { e.stopPropagation(); intentarCerrar(); return }
  if (e.key !== 'Tab' || !caja.value) return
  const foco = [...caja.value.querySelectorAll('button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])')]
  if (!foco.length) return
  const primero = foco[0]
  const ultimo = foco[foco.length - 1]
  if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus() }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
}

onMounted(async () => {
  enfocadoAntes = typeof document !== 'undefined' ? document.activeElement : null
  await nextTick()
  tituloEl.value?.focus()
})
onBeforeUnmount(() => { try { enfocadoAntes?.focus?.() } catch { /* el elemento ya no existe */ } })
</script>

<style scoped>
.modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.65); backdrop-filter: blur(4px); display: flex; align-items: center; justify-content: center; z-index: 9999; padding: 1rem; }
.modal-container { width: 100%; max-width: 520px; max-height: 90vh; display: flex; flex-direction: column; background: #ffffff; border-radius: 0.75rem; box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1); overflow: hidden; border: 1px solid #cbd5e1; padding: 0; color: #0f172a; }
.modal-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; padding: 1.25rem 1.5rem; border-bottom: 1px solid #e2e8f0; background: #f8fafc; }
.modal-title { font-size: 1.25rem; font-weight: 700; color: #0f172a; margin: 0.2rem 0; }
.modal-title:focus { outline: none; }
.btn-close { background: transparent; border: none; font-size: 1.2rem; color: #64748b; cursor: pointer; padding: 0.25rem 0.5rem; line-height: 1; }
.modal-body { padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1; }
.pregunta { font-size: 1.05rem; font-weight: 600; margin: 0 0 0.75rem; }
.nota { font-size: 0.85rem; color: #475569; margin: 0.5rem 0; line-height: 1.45; }
.alerta { padding: 0.65rem 0.85rem; border-radius: 0.4rem; font-size: 0.88rem; line-height: 1.45; margin: 0.5rem 0; }
.alerta-error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.alerta-ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
.vista-previa { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 0.7rem 1rem; }
.vista-previa ul { margin: 0.25rem 0 0.4rem 1.1rem; padding: 0; font-size: 0.9rem; }
.vista-titulo { margin: 0; font-size: 0.85rem; font-weight: 600; color: #334155; }
.autoriza { display: flex; gap: 0.6rem; align-items: flex-start; margin: 0.9rem 0 0; padding: 0.7rem 0.9rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.875rem; }
.autoriza input { margin-top: 0.2rem; accent-color: var(--color-primary, #1e40af); }
.acciones { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; flex-wrap: wrap; }
.acciones .btn { min-height: var(--alto-tactil, 2.5rem); }
@media (max-width: 600px) {
  .acciones { flex-direction: column-reverse; }
  .acciones .btn { width: 100%; }
}
</style>
