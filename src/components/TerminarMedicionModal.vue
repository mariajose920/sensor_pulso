<template>
  <div class="modal-backdrop" @click.self="intentarCerrar">
    <div
      ref="caja"
      class="modal-container card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terminar-titulo"
      aria-describedby="terminar-descripcion"
      data-testid="terminar-medicion-modal"
      @keydown="alTeclear"
    >
      <div class="modal-header">
        <div>
          <h2 id="terminar-titulo" class="modal-title" tabindex="-1" ref="tituloEl">Terminar medición</h2>
          <span class="version-tag">Canal {{ registro.resumen.canal }}<template v-if="registro.resumen.paciente"> · {{ registro.resumen.paciente }}</template></span>
        </div>
        <button type="button" class="btn-close" aria-label="Cerrar" :disabled="trabajando" @click="intentarCerrar">✕</button>
      </div>

      <div id="terminar-descripcion" class="modal-body">
        <!-- Resumen de la medición -->
        <dl class="resumen" data-testid="terminar-resumen">
          <div><dt>Paciente</dt><dd>{{ registro.resumen.paciente || 'Sin nombre' }}</dd></div>
          <div><dt>Canal</dt><dd>{{ registro.resumen.canal }}</dd></div>
          <div><dt>Pulso</dt><dd>{{ registro.resumen.bpm ? `${Math.round(registro.resumen.bpm)} BPM` : '—' }}</dd></div>
          <div><dt>SpO₂</dt><dd>{{ registro.resumen.spo2 ? `${registro.resumen.spo2} %` : '—' }}</dd></div>
          <div><dt>Duración</dt><dd>{{ registro.resumen.duracionTexto }}</dd></div>
        </dl>

        <!-- Paso 1: ¿guardar? -->
        <div v-if="paso === 'guardar'">
          <p class="pregunta" data-testid="pregunta-guardar">¿Quieres guardar esta medición?</p>
          <p v-if="!evalGuardado.puede" class="alerta alerta-aviso" role="alert" data-testid="terminar-no-guardable">{{ evalGuardado.mensaje }}</p>
          <p v-else-if="evalPublicacion.nota" class="nota" data-testid="terminar-nota-publicar">{{ evalPublicacion.nota }}</p>
          <p v-if="error" class="alerta alerta-error" role="alert" data-testid="terminar-error">{{ error }}</p>

          <div class="acciones">
            <button type="button" class="btn btn-secondary" :disabled="trabajando" data-testid="terminar-no-guardar" @click="noGuardar">No guardar</button>
            <button
              ref="botonGuardar"
              type="button"
              class="btn btn-primary"
              :disabled="!evalGuardado.puede || trabajando"
              data-testid="terminar-guardar"
              @click="guardar"
            >{{ trabajando ? 'Guardando…' : 'Guardar' }}</button>
          </div>
        </div>

        <!-- Paso 2: ¿publicar? (solo con permiso) -->
        <div v-else-if="paso === 'publicar'">
          <p class="pregunta" data-testid="pregunta-publicar">¿Quieres publicarla para que otras personas la vean (siempre anonimizada)?</p>
          <div class="vista-previa" data-testid="terminar-vista-previa">
            <p class="vista-titulo">Esto es lo que verá cualquier persona:</p>
            <ul>
              <li v-for="c in vistaPrevia.campos" :key="c.etiqueta"><strong>{{ c.etiqueta }}:</strong> {{ c.valor }}</li>
            </ul>
            <p class="nota">Se publica sin nombre ni datos identificables (no se publica: {{ vistaPrevia.excluidos.join(', ') }}).</p>
          </div>
          <label v-if="evalPublicacion.requiereAutorizacionPaciente" class="autoriza" data-testid="terminar-autoriza">
            <input v-model="autorizaPaciente" type="checkbox" data-testid="terminar-autoriza-casilla" />
            <span>
              <strong>{{ registro.resumen.paciente || 'El paciente' }}</strong> autorizó que su medición se publique de forma anónima
              (sin su nombre ni datos que lo identifiquen) para que otras personas la vean y comparen.
            </span>
          </label>
          <p v-if="error" class="alerta alerta-error" role="alert" data-testid="terminar-error">{{ error }}</p>

          <div class="acciones">
            <button type="button" class="btn btn-secondary" :disabled="trabajando" @click="paso = 'guardar'">Atrás</button>
            <button type="button" class="btn btn-secondary" :disabled="trabajando" data-testid="terminar-solo-guardar" @click="ejecutar(false)">No, solo guardar</button>
            <button ref="botonPublicar" type="button" class="btn btn-primary" :disabled="trabajando || (evalPublicacion.requiereAutorizacionPaciente && !autorizaPaciente)" data-testid="terminar-publicar" @click="ejecutar(true)">
              {{ trabajando ? 'Guardando…' : 'Sí, publicar' }}
            </button>
          </div>
        </div>

        <!-- Resultado -->
        <div v-else>
          <p class="alerta" :class="resultado.ok ? 'alerta-ok' : 'alerta-aviso'" role="status" data-testid="terminar-resultado">
            <strong>{{ resultado.titulo }}</strong>
            <span v-if="resultado.detalle"> {{ resultado.detalle }}</span>
          </p>
          <div class="acciones">
            <button ref="botonCerrar" type="button" class="btn btn-primary" data-testid="terminar-cerrar" @click="$emit('cerrar')">Cerrar</button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useAuth } from '../composables/useAuth'
import { guardarMedicion, publicarMedicion } from '../services/medicionesService'
import { obtenerPermisosProfesor } from '../services/adminService'
import {
  evaluarGuardado, evaluarPublicacion, vistaPreviaPublica, mensajeResultado,
  MENSAJES_TERMINAR
} from '../utils/terminarMedicion.js'

// «Terminar» una medición de canal: pregunta si se guarda (RF30) y, solo con permiso, si se publica (RF31, RF57, RF98).
const props = defineProps({
  /** Resultado de armarRegistroTerminado() */
  registro: { type: Object, required: true },
  /** Id de la sesión de medición; si no es un uuid de la base (sesión de demostración) la medición se guarda sin ligarla a una sesión */
  sesionId: { type: String, default: null }
})
const emit = defineEmits(['cerrar', 'resultado'])

const { isAuthenticated, isAdmin, isProfesor, currentUserId } = useAuth()

const paso = ref('guardar') // 'guardar' | 'publicar' | 'resultado'
const trabajando = ref(false)
const error = ref('')
const resultado = ref({ ok: false, titulo: '', detalle: '' })
const permisos = ref(null)
const autorizaPaciente = ref(false) // quien mide confirma que el paciente autorizó publicar (consentimiento propio del canal)
const caja = ref(null)
const tituloEl = ref(null)
const botonGuardar = ref(null)
const botonPublicar = ref(null)
const botonCerrar = ref(null)
let medicionGuardada = null // { id, pendiente } si ya se guardó y falló la publicación
let enfocadoAntes = null

const evalGuardado = computed(() => evaluarGuardado({
  haySesion: isAuthenticated.value,
  bpm: props.registro.resumen.bpm,
  calidad: props.registro.resumen.calidad
}))

const evalPublicacion = computed(() => evaluarPublicacion({
  haySesion: isAuthenticated.value,
  esAdmin: isAdmin.value,
  rol: isProfesor.value ? 'profesor' : 'usuario',
  permisos: permisos.value,
  fuente: props.registro.fuente,
  pacienteConConsentimientoPropio: props.registro.pacienteConConsentimientoPropio
}))

const vistaPrevia = computed(() => vistaPreviaPublica(props.registro))

defineExpose({ paso })

// El permiso del profesor (RF98) se consulta al abrir; el administrador no lo necesita
const permisosListos = (async () => {
  if (isAdmin.value || !isProfesor.value || !currentUserId.value) return
  try {
    const r = await obtenerPermisosProfesor(currentUserId.value)
    permisos.value = r?.data || null
  } catch { permisos.value = null }
})()

async function guardar() {
  if (trabajando.value || !evalGuardado.value.puede) return
  error.value = ''
  trabajando.value = true
  await permisosListos
  trabajando.value = false
  if (evalPublicacion.value.preguntar) {
    paso.value = 'publicar'
    await nextTick()
    botonPublicar.value?.focus()
  } else {
    await ejecutar(false)
  }
}

async function ejecutar(publicar) {
  if (trabajando.value) return
  error.value = ''
  trabajando.value = true
  try {
    // 1) Guardar (una sola vez aunque se reintente la publicación)
    if (!medicionGuardada) {
      const resp = await guardarMedicion({ ...props.registro.datos })
      if (!resp.ok) {
        error.value = resp.detalle ? `${resp.mensaje} (Detalle: ${resp.detalle})` : resp.mensaje
        paso.value = 'guardar'
        return
      }
      medicionGuardada = { id: resp.id || null, pendiente: resp.estado === 'pendiente' }
    }
    // 2) Publicar si se pidió y se puede
    let publicada = false
    let motivoPublicacion = null
    if (publicar && evalPublicacion.value.preguntar && (!evalPublicacion.value.requiereAutorizacionPaciente || autorizaPaciente.value)) {
      if (medicionGuardada.pendiente) motivoPublicacion = MENSAJES_TERMINAR.publicar_pendiente
      else if (!medicionGuardada.id) motivoPublicacion = MENSAJES_TERMINAR.publicar_sin_id
      else {
        const pub = await publicarMedicion(medicionGuardada.id)
        if (pub.ok) publicada = true
        else motivoPublicacion = pub.mensaje
      }
    }
    const estado = publicada ? 'guardada_publicada' : (medicionGuardada.pendiente ? 'pendiente' : 'guardada')
    const mensaje = mensajeResultado({ guardada: true, publicada, pendiente: medicionGuardada.pendiente, motivoPublicacion })
    mostrarResultado({
      ok: !motivoPublicacion || publicada,
      titulo: publicada ? 'Medición guardada y publicada' : (medicionGuardada.pendiente ? 'Medición guardada en este dispositivo' : 'Medición guardada'),
      detalle: motivoPublicacion || (medicionGuardada.pendiente ? MENSAJES_TERMINAR.pendiente : ''),
      estado,
      mensaje
    })
  } catch {
    error.value = 'No se pudo completar la operación. Revisa tu conexión e intenta de nuevo.'
  } finally {
    trabajando.value = false
  }
}

function noGuardar() {
  mostrarResultado({
    ok: false, titulo: 'Medición no guardada', detalle: 'No se envió nada a la base de datos.',
    estado: 'no_guardada', mensaje: MENSAJES_TERMINAR.no_guardada
  })
}

async function mostrarResultado({ ok, titulo, detalle, estado, mensaje }) {
  resultado.value = { ok, titulo, detalle }
  paso.value = 'resultado'
  emit('resultado', { estado, mensaje })
  await nextTick()
  botonCerrar.value?.focus()
}

function intentarCerrar() {
  if (trabajando.value) return
  emit('cerrar')
}

// Escape cierra; Tab se queda dentro del diálogo
function alTeclear(e) {
  if (e.key === 'Escape') { e.stopPropagation(); intentarCerrar(); return }
  if (e.key !== 'Tab' || !caja.value) return
  const foco = [...caja.value.querySelectorAll('button:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])')]
  if (!foco.length) return
  const primero = foco[0]
  const ultimo = foco[foco.length - 1]
  if (e.shiftKey && document.activeElement === primero) { e.preventDefault(); ultimo.focus() }
  else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primero.focus() }
}

onMounted(async () => {
  enfocadoAntes = typeof document !== 'undefined' ? document.activeElement : null
  await nextTick()
  const destino = botonGuardar.value && !botonGuardar.value.disabled ? botonGuardar.value : tituloEl.value
  destino?.focus()
})
onBeforeUnmount(() => { try { enfocadoAntes?.focus?.() } catch { /* el elemento ya no existe */ } })
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}
.modal-container {
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 0.75rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border: 1px solid #cbd5e1;
  padding: 0;
  color: #0f172a;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}
.modal-title { font-size: 1.25rem; font-weight: 700; color: #0f172a; margin: 0.2rem 0 0.15rem 0; }
.modal-title:focus { outline: none; }
.version-tag { font-size: 0.8rem; color: #64748b; font-weight: 500; }
.btn-close { background: transparent; border: none; font-size: 1.2rem; color: #64748b; cursor: pointer; padding: 0.25rem 0.5rem; line-height: 1; }
.btn-close:hover { color: #0f172a; }
.modal-body { padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1; }
.resumen { display: grid; grid-template-columns: repeat(auto-fit, minmax(7.5rem, 1fr)); gap: 0.6rem; margin: 0 0 1rem; padding: 0.75rem 1rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem; }
.resumen div { min-width: 0; }
.resumen dt { font-size: 0.72rem; color: #64748b; text-transform: uppercase; letter-spacing: 0.03em; }
.resumen dd { margin: 0.1rem 0 0; font-weight: 700; overflow-wrap: anywhere; }
.pregunta { font-size: 1.05rem; font-weight: 600; margin: 0 0 0.75rem; }
.nota { font-size: 0.85rem; color: #475569; margin: 0.5rem 0; line-height: 1.45; }
.alerta { padding: 0.65rem 0.85rem; border-radius: 0.4rem; font-size: 0.88rem; line-height: 1.45; margin: 0.5rem 0; }
.alerta-aviso { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; }
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
