<template>
  <div>
    <div class="card" style="margin-bottom: 1rem;">
      <h1 class="card-title" style="margin-bottom: 0.25rem;">Historial de mediciones</h1>
      <p style="color: var(--color-muted); font-size: 0.9rem; margin-bottom: 0;">
        Las mediciones que guardaste en tu cuenta, de la más reciente a la más antigua. Son información de salud
        sensible: solo tú puedes verlas. Esta plataforma es educativa y no entrega diagnósticos.
      </p>
    </div>

    <p v-if="sinConexion" class="aviso aviso-info" role="status">
      Sin conexión: se muestran solo las últimas mediciones vistas en este dispositivo.
    </p>

    <p v-if="pendientes > 0" class="aviso aviso-info" role="status">
      Tienes {{ pendientes }} medición(es) guardada(s) en este dispositivo que aún no se envían.
      <button type="button" class="btn btn-secondary aviso-boton" :disabled="sincronizando" @click="sincronizar">
        {{ sincronizando ? 'Enviando…' : 'Enviar ahora' }}
      </button>
    </p>

    <div v-if="!isAuthenticated" class="card">
      <p style="margin: 0;">Inicia sesión para ver tu historial. <router-link to="/login">Ir a acceso</router-link></p>
    </div>

    <template v-else>
      <div class="filtros">
        <label for="filtro-fuente" class="form-label">Fuente</label>
        <select id="filtro-fuente" v-model="fuente" class="form-input filtro-select" @change="cargar(true)">
          <option value="">Todas</option>
          <option value="sensor">Sensor</option>
          <option value="simulador">Simulador</option>
        </select>
        <span class="filtros-total" v-if="!cargando">{{ total }} medición(es)</span>
      </div>

      <p v-if="error" class="aviso aviso-error" role="alert">{{ error }}</p>

      <div v-if="cargando && items.length === 0" class="card" aria-busy="true">Cargando historial…</div>

      <div v-else-if="items.length === 0 && !error" class="card vacio">
        <p style="margin: 0 0 0.5rem;"><strong>Todavía no tienes mediciones guardadas.</strong></p>
        <p style="margin: 0;">
          Toma una medición y pulsa «Guardar medición» en
          <router-link to="/medicion">Medición</router-link>.
        </p>
      </div>

      <ul v-else class="lista" aria-label="Mediciones guardadas">
        <li v-for="m in items" :key="m.id" class="card fila">
          <div class="fila-cabecera">
            <strong>{{ formatearFecha(m.inicio) }}</strong>
            <span class="chip" v-if="m.fuente">{{ ETIQUETAS_FUENTE[m.fuente] || m.fuente }}<template v-if="m.canal"> · Canal {{ m.canal }}</template></span>
            <span class="chip" v-if="m.actividad">{{ m.actividad }}</span>
          </div>

          <div class="fila-valores">
            <span class="valor"><span class="num">{{ m.bpm ?? '--' }}</span> BPM</span>
            <span class="valor"><span class="num">{{ m.spo2 ?? '--' }}</span> % SpO₂</span>
            <span class="valor" v-if="m.hrv !== null"><span class="num">{{ m.hrv }}</span> ms HRV</span>
            <span class="valor" v-if="m.duracionS">{{ m.duracionS }} s</span>
          </div>

          <div class="fila-estado">
            <span v-if="m.ritmo" class="chip chip-ritmo">Ritmo: {{ ETIQUETAS_RITMO[m.ritmo] }}</span>
            <CalidadSenalBadge v-if="m.calidad" :nivel="m.calidad" />
            <span v-if="m.dentroDeRango === true" class="chip">Dentro del rango</span>
            <span v-else-if="m.dentroDeRango === false" class="chip chip-fuera">Fuera del rango</span>
          </div>
          <small v-if="m.causaCalidad" class="causa">{{ m.causaCalidad }}</small>
        </li>
      </ul>

      <div v-if="hayMas" style="text-align: center; margin: 1rem 0;">
        <button type="button" class="btn btn-secondary" :disabled="cargando" @click="cargar(false)">
          {{ cargando ? 'Cargando…' : 'Cargar más' }}
        </button>
      </div>
    </template>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import CalidadSenalBadge from '../components/CalidadSenalBadge.vue'
import { useAuth } from '../composables/useAuth'
import { listarHistorial, sincronizarPendientes, contarPendientes } from '../services/medicionesService'
import { ETIQUETAS_RITMO, ETIQUETAS_FUENTE } from '../utils/medicion'

// RF30: consultar el historial de mediciones guardadas en la cuenta.
const { isAuthenticated, currentUserId } = useAuth()

const items = ref([])
const total = ref(0)
const hayMas = ref(false)
const cargando = ref(false)
const error = ref('')
const sinConexion = ref(false)
const fuente = ref('')
const pagina = ref(0)
const pendientes = ref(0)
const sincronizando = ref(false)

function formatearFecha(iso) {
  if (!iso) return 'Sin fecha'
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
}

async function cargar(reiniciar) {
  if (!isAuthenticated.value || cargando.value) return
  cargando.value = true
  error.value = ''
  if (reiniciar) pagina.value = 0
  try {
    const r = await listarHistorial({ pagina: pagina.value, fuente: fuente.value || null })
    items.value = reiniciar ? r.items : [...items.value, ...r.items]
    total.value = r.total
    hayMas.value = r.hayMas
    sinConexion.value = r.sinConexion
    error.value = r.error || ''
    if (r.hayMas) pagina.value++
  } finally {
    cargando.value = false
  }
}

async function sincronizar() {
  sincronizando.value = true
  try {
    await sincronizarPendientes()
  } finally {
    pendientes.value = contarPendientes(currentUserId.value)
    sincronizando.value = false
    await cargar(true)
  }
}

async function alVolverConexion() {
  if (pendientes.value > 0) await sincronizar()
  else await cargar(true)
}

onMounted(async () => {
  window.addEventListener('online', alVolverConexion)
  pendientes.value = contarPendientes(currentUserId.value)
  if (pendientes.value > 0 && navigator.onLine) await sincronizar()
  else await cargar(true)
})
onBeforeUnmount(() => window.removeEventListener('online', alVolverConexion))
</script>

<style scoped>
.aviso { border-radius: 0.5rem; padding: 0.6rem 1rem; margin: 0 0 1rem; font-size: 0.88rem; }
.aviso-info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
.aviso-error { background: #fef2f2; border: 1px solid #fca5a5; color: #7f1d1d; }
.aviso-boton { font-size: 0.78rem; padding: 0.2rem 0.6rem; margin-left: 0.5rem; }
.filtros { display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.filtro-select { width: auto; min-width: 9rem; height: 2.2rem; }
.filtros-total { color: var(--color-muted); font-size: 0.85rem; }
.lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
.fila { margin: 0; padding: 0.85rem 1rem; }
.fila-cabecera { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.4rem; }
.fila-valores { display: flex; gap: 1.25rem; flex-wrap: wrap; font-size: 0.85rem; color: var(--color-muted); }
.num { font-size: 1.3rem; font-weight: 700; color: var(--color-text); font-family: monospace; }
.fila-estado { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-top: 0.5rem; }
.chip { font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 9999px; background: #f1f5f9; border: 1px solid var(--color-border); color: var(--color-text); }
.chip-fuera { background: #fef3c7; border-color: #fcd34d; color: #b45309; }
.causa { display: block; margin-top: 0.35rem; color: var(--color-muted); }
.vacio { text-align: center; }
</style>
