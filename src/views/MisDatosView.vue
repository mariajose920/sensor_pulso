<template>
  <div class="mis-datos">
    <h1 class="card-title">Mis datos y mis derechos</h1>
    <p class="intro">
      Aquí ves solo tus propios datos. Puedes descargarlos, pedir que los corrijamos o borremos y retirar tu consentimiento.
      Respondemos en un máximo de {{ PLAZO_RESPUESTA_DIAS }} días. Más información en la
      <router-link to="/privacidad">política de privacidad</router-link>.
    </p>

    <p v-if="aviso.texto" class="alerta" :class="aviso.tipo" role="status" data-testid="mis-datos-aviso">{{ aviso.texto }}</p>
    <section class="card">
      <h2>Autenticación de dos factores</h2>
      <p>Si tienes una cuenta de usuario, puedes activar esta protección cuando quieras. Si la activas, en tus próximos inicios de sesión se te pedirá un código de tu aplicación autenticadora.</p>
      <router-link v-if="mfaCargado && !factoresMfa.length" :to="{ name: 'Mfa', query: { redirect: '/mis-datos' } }" class="btn btn-secondary">Configurar autenticador</router-link>
      <p v-if="mfaCargado && factoresMfa.length">Autenticador activo.</p>
      <button v-if="mfaCargado && puedeDesactivarMfa && factoresMfa.length" type="button" class="btn btn-secondary" :disabled="actualizandoMfa" @click="desactivarMfa">Desactivar autenticador</button>
      <p v-if="mensajeMfa" role="status">{{ mensajeMfa }}</p>
    </section>
    <section class="card" data-testid="descargar-datos">
      <h2>Descargar mis datos</h2>
      <p>Obtén un archivo con tu perfil, tus mediciones, tu ficha de salud declarada y tu actividad. No incluye datos de otras personas.</p>
      <button type="button" class="btn btn-primary" :disabled="ocupado" data-testid="boton-descargar" @click="descargar">
        {{ descargando ? 'Preparando…' : 'Descargar mis datos' }}
      </button>
    </section>

    <section class="card" data-testid="nueva-solicitud">
      <h2>Ejercer un derecho</h2>
      <form @submit.prevent="enviar">
        <div class="form-group">
          <label class="form-label" for="tipo">Derecho</label>
          <select id="tipo" v-model="tipo" class="form-input" data-testid="solicitud-tipo">
            <option value="" disabled>Elige una opción</option>
            <option v-for="t in TIPOS_DERECHO" :key="t.valor" :value="t.valor">{{ t.texto }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="detalle">Detalle (opcional)</label>
          <textarea id="detalle" v-model="detalle" class="form-input" rows="3" maxlength="1000"
            placeholder="No escribas datos de salud aquí; basta con indicar qué necesitas." data-testid="solicitud-detalle"></textarea>
        </div>
        <button type="submit" class="btn btn-primary" :disabled="ocupado" data-testid="solicitud-enviar">Enviar solicitud</button>
      </form>
    </section>

    <section class="card" data-testid="mis-solicitudes">
      <h2>Mis solicitudes</h2>
      <p v-if="!solicitudes.length" class="vacio">Aún no has enviado solicitudes.</p>
      <ul v-else class="lista">
        <li v-for="s in solicitudes" :key="s.id" :data-testid="'solicitud-' + s.id">
          <strong>{{ etiquetaTipo(s.tipo) }}</strong>
          <span class="estado" :class="s.estado">{{ ESTADOS_SOLICITUD[s.estado] }}</span>
          <small>Recibida el {{ fecha(s.recibida_en) }}<template v-if="plazo(s)"> · {{ plazo(s) }}</template></small>
          <p v-if="s.respuesta" class="respuesta"><strong>Respuesta:</strong> {{ s.respuesta }}</p>
        </li>
      </ul>
    </section>

    <section class="card peligro" data-testid="acciones-delicadas">
      <h2>Retirar mi consentimiento o borrar mis datos</h2>
      <p>Retirar el consentimiento detiene el tratamiento y retira tus mediciones publicadas. Borrar elimina tus mediciones, tu ficha de salud y tu progreso; no se puede deshacer.</p>
      <div class="acciones">
        <button type="button" class="btn btn-secondary" :disabled="ocupado" data-testid="boton-revocar" @click="revocar">Retirar mi consentimiento</button>
        <button type="button" class="btn btn-danger" :disabled="ocupado" data-testid="boton-eliminar" @click="pedirConfirmacion = true">Borrar mis datos</button>
      </div>
      <div v-if="pedirConfirmacion" class="confirmacion" data-testid="confirmar-eliminar">
        <p>Para confirmar, escribe <strong>BORRAR</strong>:</p>
        <input v-model="textoConfirmar" class="form-input" aria-label="Escribe BORRAR para confirmar" data-testid="eliminar-texto" />
        <div class="acciones">
          <button type="button" class="btn btn-secondary" @click="cancelarEliminar">Cancelar</button>
          <button type="button" class="btn btn-danger" :disabled="textoConfirmar !== 'BORRAR' || ocupado" data-testid="eliminar-confirmar" @click="eliminar">
            Borrar definitivamente
          </button>
        </div>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '../composables/useAuth.js'
import { eliminarFactorMfa, listarFactoresTotp } from '../services/mfaService.js'
import { derechosService, ESTADOS_SOLICITUD, TIPOS_DERECHO, textoPlazo } from '../services/derechosService.js'
import { PLAZO_RESPUESTA_DIAS } from '../data/politicaPrivacidad.js'

const tipo = ref('')
const detalle = ref('')
const solicitudes = ref([])
const aviso = ref({ texto: '', tipo: 'ok' })
const descargando = ref(false)
const enviando = ref(false)
const trabajando = ref(false)
const pedirConfirmacion = ref(false)
const textoConfirmar = ref('')
const ocupado = computed(() => descargando.value || enviando.value || trabajando.value)

const etiquetaTipo = (v) => TIPOS_DERECHO.find(t => t.valor === v)?.texto.split(':')[0] || (v === 'revocar_consentimiento' ? 'Retiro del consentimiento' : v)
const fecha = (iso) => new Date(iso).toLocaleDateString('es-CL')
const plazo = (s) => textoPlazo(s.vence_en, s.estado)
const decir = (texto, tipoAviso = 'ok') => { aviso.value = { texto, tipo: tipoAviso } }

async function cargar() { solicitudes.value = await derechosService.misSolicitudes() }
onMounted(cargar)

const { isAdmin, isProfesor, loading } = useAuth()
const puedeDesactivarMfa = computed(() => !loading.value && !isAdmin.value && !isProfesor.value)
const factoresMfa = ref([])
const mfaCargado = ref(false)
const actualizandoMfa = ref(false)
const mensajeMfa = ref('')

const desactivarMfa = async () => {
  if (!puedeDesactivarMfa.value || actualizandoMfa.value) return
  if (!window.confirm('¿Quieres desvincular los autenticadores de esta cuenta?')) return

  actualizandoMfa.value = true
  mensajeMfa.value = ''

  try {
    for (const factor of factoresMfa.value) {
      await eliminarFactorMfa(factor.id)
      factoresMfa.value = factoresMfa.value.filter(item => item.id !== factor.id)
    }

    mensajeMfa.value = 'Autenticador desactivado.'
  } catch (error) {
    mensajeMfa.value = error.message || 'No se pudo desactivar el autenticador.'
  } finally {
    actualizandoMfa.value = false
  }
}

onMounted(async () => {
  try {
    factoresMfa.value = await listarFactoresTotp()
    mfaCargado.value = true
  } catch {
    mensajeMfa.value = 'No se pudo consultar el estado del autenticador. Recarga para reintentar.'
  }
})

async function descargar() {
  descargando.value = true
  const r = await derechosService.descargarMisDatos()
  descargando.value = false
  r.ok ? decir('Descargamos tus datos. Guárdalos en un lugar seguro: incluyen datos de salud.') : decir(r.error, 'error')
  await cargar()
}

async function enviar() {
  enviando.value = true
  const r = await derechosService.crearSolicitud({ tipo: tipo.value, detalle: detalle.value })
  enviando.value = false
  if (!r.ok) return decir(r.error, 'error')
  tipo.value = ''
  detalle.value = ''
  decir('Recibimos tu solicitud. Te responderemos dentro del plazo legal.')
  await cargar()
}

async function revocar() {
  trabajando.value = true
  const r = await derechosService.revocarConsentimiento()
  trabajando.value = false
  r.ok ? decir('Retiraste tu consentimiento. Para volver a medir deberás aceptarlo de nuevo.') : decir(r.error, 'error')
  await cargar()
}

function cancelarEliminar() { pedirConfirmacion.value = false; textoConfirmar.value = '' }

async function eliminar() {
  if (textoConfirmar.value !== 'BORRAR') return
  trabajando.value = true
  const r = await derechosService.eliminarMisDatos()
  trabajando.value = false
  cancelarEliminar()
  r.ok ? decir('Borramos tus mediciones, tu ficha de salud y tu progreso.') : decir(r.error, 'error')
  await cargar()
}
</script>

<style scoped>
.mis-datos { max-width: 820px; margin: 0 auto; display: grid; gap: 1rem; }
.intro { color: var(--color-muted); margin: 0; line-height: 1.5; }
h2 { font-size: 1.05rem; margin: 0 0 0.5rem; }
.card p { line-height: 1.5; font-size: 0.93rem; }
.alerta { padding: 0.7rem 1rem; border-radius: 8px; margin: 0; }
.alerta.ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
.alerta.error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
.lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
.lista li { border: 1px solid var(--color-border); border-radius: 8px; padding: 0.6rem 0.8rem; display: grid; gap: 0.2rem; }
.estado { font-size: 0.8rem; font-weight: 700; }
.estado.resuelta { color: #166534; }
.estado.rechazada { color: #991b1b; }
.respuesta { margin: 0.2rem 0 0; }
.vacio { color: var(--color-muted); }
.peligro { border-left: 4px solid #dc2626; }
.acciones { display: flex; flex-wrap: wrap; gap: 0.6rem; margin-top: 0.5rem; }
.btn-danger { background: #dc2626; color: #fff; border: 0; min-height: var(--alto-tactil, 44px); padding: 0 1rem; border-radius: 0.5rem; font-weight: 600; cursor: pointer; }
.btn-danger:disabled { opacity: 0.5; cursor: not-allowed; }
.confirmacion { margin-top: 0.75rem; padding-top: 0.75rem; border-top: 1px solid var(--color-border); }
</style>
