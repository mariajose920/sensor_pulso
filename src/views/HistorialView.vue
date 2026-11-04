<template>
  <div>
    <div class="card" style="margin-bottom: 1rem;">
      <h1 class="card-title" style="margin-bottom: 0.25rem;">Historial Clínico y Registro de Alertas</h1>
      <p style="color: var(--color-muted); font-size: 0.9rem; margin-bottom: 0;">
        Registro cronológico de bioseñales y eventos fuera de rango (RF21). Información de salud
        sensible protegida por políticas de acceso seguro. Plataforma para docencia e investigación biomédica.
      </p>
    </div>

    <!-- Navegación por Pestañas del Historial -->
    <div class="historial-tabs">
      <button 
        type="button" 
        class="tab-btn" 
        :class="{ active: pestanaActiva === 'mediciones' }"
        @click="pestanaActiva = 'mediciones'"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
          <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline>
        </svg>
        Mediciones Guardadas
        <span class="tab-counter" v-if="!cargando">{{ total }}</span>
      </button>

      <button 
        type="button" 
        class="tab-btn" 
        :class="{ active: pestanaActiva === 'alertas' }"
        @click="activarPestanaAlertas"
      >
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 6px;">
          <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
        Registro de Alertas Clínicas (RF21)
        <span class="tab-counter tab-counter-alertas" v-if="alertasItems.length > 0">{{ alertasItems.length }}</span>
      </button>
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
      <!-- =================================================================== -->
      <!-- PESTAÑA 1: MEDICIONES GUARDADAS                                     -->
      <!-- =================================================================== -->
      <section v-show="pestanaActiva === 'mediciones'">
        <div class="filtros">
          <div class="filtro-grupo">
            <label for="filtro-fuente" class="form-label">Fuente</label>
            <select id="filtro-fuente" v-model="fuente" class="form-input filtro-select" @change="cargar(true)">
              <option value="">Todas</option>
              <option value="sensor">Sensor</option>
              <option value="simulador">Simulador</option>
            </select>
          </div>

          <div class="filtro-grupo">
            <label for="filtro-rango" class="form-label">Rango Fisiológico</label>
            <select id="filtro-rango" v-model="filtroRango" class="form-input filtro-select">
              <option value="todos">Todos los estados</option>
              <option value="dentro">Dentro del rango</option>
              <option value="fuera">Fuera del rango (con alertas)</option>
            </select>
          </div>

          <span class="filtros-total" v-if="!cargando">{{ medicionesFiltradas.length }} medición(es)</span>
        </div>

        <p v-if="error" class="aviso aviso-error" role="alert">{{ error }}</p>

        <div v-if="cargando && items.length === 0" class="card" aria-busy="true">Cargando historial…</div>

        <div v-else-if="medicionesFiltradas.length === 0 && !error" class="card vacio">
          <p style="margin: 0 0 0.5rem;"><strong>No se encontraron mediciones con los filtros seleccionados.</strong></p>
          <p style="margin: 0;">
            Toma una medición y pulsa «Guardar medición» en
            <router-link to="/medicion">Medición</router-link>.
          </p>
        </div>

        <ul v-else class="lista" aria-label="Mediciones guardadas">
          <li v-for="m in medicionesFiltradas" :key="m.id" class="card fila" :class="{ 'fila-fuera-rango': m.dentroDeRango === false }">
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
              <span v-if="m.dentroDeRango === true" class="chip chip-dentro">Dentro del rango</span>
              <span v-else-if="m.dentroDeRango === false" class="chip chip-fuera">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px;">
                  <circle cx="12" cy="12" r="10"></circle>
                  <line x1="12" y1="8" x2="12" y2="12"></line>
                  <line x1="12" y1="16" x2="12.01" y2="16"></line>
                </svg>
                Fuera del rango
              </span>
              <span v-if="m.dentroDeRango === false" class="chip chip-alerta-tag">
                Alerta registrada
              </span>
            </div>
            <small v-if="m.causaCalidad" class="causa">{{ m.causaCalidad }}</small>
          </li>
        </ul>

        <div v-if="hayMas" style="text-align: center; margin: 1rem 0;">
          <button type="button" class="btn btn-secondary" :disabled="cargando" @click="cargar(false)">
            {{ cargando ? 'Cargando…' : 'Cargar más' }}
          </button>
        </div>
      </section>

      <!-- =================================================================== -->
      <!-- PESTAÑA 2: REGISTRO DE ALERTAS CLÍNICAS (RF21)                     -->
      <!-- =================================================================== -->
      <section v-show="pestanaActiva === 'alertas'">
        <div class="filtros">
          <div class="filtro-grupo">
            <label for="filtro-tipo-alerta" class="form-label">Tipo de Alerta</label>
            <select id="filtro-tipo-alerta" v-model="filtroTipoAlerta" class="form-input filtro-select">
              <option value="todos">Todas las alertas</option>
              <option value="bpm_alto">Taquicardia (BPM Alto)</option>
              <option value="bpm_bajo">Bradicardia (BPM Bajo)</option>
              <option value="spo2_bajo">Desaturación SpO₂</option>
              <option value="irregular">Ritmo Irregular</option>
              <option value="senal_mala">Señal Deficiente</option>
            </select>
          </div>

          <button type="button" class="btn btn-secondary btn-sm" @click="cargarAlertas" :disabled="cargandoAlertas">
            {{ cargandoAlertas ? 'Actualizando…' : 'Actualizar Alertas' }}
          </button>

          <span class="filtros-total" v-if="!cargandoAlertas">{{ alertasFiltradas.length }} alerta(s) registrada(s)</span>
        </div>

        <div v-if="cargandoAlertas" class="card" aria-busy="true">
          Consultando registro de alertas en historial…
        </div>

        <div v-else-if="alertasFiltradas.length === 0" class="card vacio">
          <div class="vacio-icon-wrap">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#16a34a" stroke-width="2">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
              <polyline points="22 4 12 14.01 9 11.01"></polyline>
            </svg>
          </div>
          <p style="margin: 0.5rem 0 0.25rem;"><strong>No hay alertas fuera de rango registradas.</strong></p>
          <p style="margin: 0; color: var(--color-muted); font-size: 0.88rem;">
            Las mediciones monitoreadas se mantuvieron dentro de los parámetros fisiológicos esperados.
            Cuando un parámetro sobrepase el rango en Paso 4, el evento visual y sonoro se registrará aquí automáticamente (RF21).
          </p>
        </div>

        <ul v-else class="lista-alertas" aria-label="Alertas clínicas registradas">
          <li 
            v-for="alt in alertasFiltradas" 
            :key="alt.id" 
            class="card card-alerta-registro"
            :class="claseSeveridadAlerta(alt.tipo)"
          >
            <div class="alerta-registro-head">
              <div class="alerta-reg-left">
                <div class="alerta-reg-icon">
                  <svg v-if="alt.tipo === 'bpm_alto' || alt.tipo === 'bpm_bajo'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 7.65l.77.78L12 20.66l7.65-7.65.77-.78a5.4 5.4 0 0 0 0-7.65z"></path>
                  </svg>
                  <svg v-else-if="alt.tipo === 'spo2_bajo'" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
                  </svg>
                  <svg v-else width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
                    <line x1="12" y1="8" x2="12" y2="12"></line>
                    <line x1="12" y1="16" x2="12.01" y2="16"></line>
                  </svg>
                </div>
                <div>
                  <strong class="alerta-reg-titulo">{{ obtenerTituloAlerta(alt.tipo) }}</strong>
                  <div class="alerta-reg-fecha">{{ formatearFecha(alt.creada_en) }}</div>
                </div>
              </div>

              <div class="alerta-reg-chips">
                <span class="chip chip-sonora" v-if="alt.sonora">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="margin-right: 4px;">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
                  </svg>
                  Sonora emitada
                </span>
                <span class="chip chip-silenciada" v-else>
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="margin-right: 4px;">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
                    <line x1="23" y1="9" x2="17" y2="15"></line>
                    <line x1="17" y1="9" x2="23" y2="15"></line>
                  </svg>
                  Silenciada
                </span>
              </div>
            </div>

            <div class="alerta-reg-detalles">
              <div class="reg-detalle-item">
                <span class="reg-det-lbl">Valor registrado:</span>
                <strong class="reg-det-val font-mono">{{ alt.valor !== null ? alt.valor : '--' }} {{ obtenerUnidadAlerta(alt.tipo) }}</strong>
              </div>
              <div class="reg-detalle-item" v-if="alt.limite !== null">
                <span class="reg-det-lbl">Límite fisiológico:</span>
                <strong class="reg-det-val font-mono">{{ alt.limite }} {{ obtenerUnidadAlerta(alt.tipo) }}</strong>
              </div>
              <div class="reg-detalle-item" v-if="alt.valor !== null && alt.limite !== null">
                <span class="reg-det-lbl">Desviación:</span>
                <strong class="reg-det-val font-mono text-danger">
                  {{ (alt.valor - alt.limite) > 0 ? '+' : '' }}{{ (alt.valor - alt.limite).toFixed(1) }} {{ obtenerUnidadAlerta(alt.tipo) }}
                </strong>
              </div>
            </div>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import CalidadSenalBadge from '../components/CalidadSenalBadge.vue'
import { useAuth } from '../composables/useAuth'
import { listarHistorial, sincronizarPendientes, contarPendientes } from '../services/medicionesService'
import { listarHistorialAlertas, obtenerMetadatosAlerta } from '../services/alertasService'
import { ETIQUETAS_RITMO, ETIQUETAS_FUENTE } from '../utils/medicion'

// RF30 y RF21: consultar el historial de mediciones y el registro de alertas fuera de rango.
const { isAuthenticated, currentUserId } = useAuth()

const pestanaActiva = ref('mediciones') // 'mediciones' | 'alertas'
const items = ref([])
const total = ref(0)
const hayMas = ref(false)
const cargando = ref(false)
const error = ref('')
const sinConexion = ref(false)
const fuente = ref('')
const filtroRango = ref('todos') // 'todos' | 'dentro' | 'fuera'
const pagina = ref(0)
const pendientes = ref(0)
const sincronizando = ref(false)

// Estado del registro de alertas (RF21)
const alertasItems = ref([])
const cargandoAlertas = ref(false)
const filtroTipoAlerta = ref('todos')

const medicionesFiltradas = computed(() => {
  if (filtroRango.value === 'dentro') {
    return items.value.filter(m => m.dentroDeRango === true)
  }
  if (filtroRango.value === 'fuera') {
    return items.value.filter(m => m.dentroDeRango === false)
  }
  return items.value
})

const alertasFiltradas = computed(() => {
  if (filtroTipoAlerta.value === 'todos') {
    return alertasItems.value
  }
  return alertasItems.value.filter(a => a.tipo === filtroTipoAlerta.value)
})

function formatearFecha(iso) {
  if (!iso) return 'Sin fecha'
  return new Date(iso).toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
}

function obtenerTituloAlerta(tipo) {
  return obtenerMetadatosAlerta(tipo).titulo
}

function obtenerUnidadAlerta(tipo) {
  return obtenerMetadatosAlerta(tipo).unidad
}

function claseSeveridadAlerta(tipo) {
  const sev = obtenerMetadatosAlerta(tipo).severidad
  return `alerta-sev-${sev}`
}

async function activarPestanaAlertas() {
  pestanaActiva.value = 'alertas'
  await cargarAlertas()
}

async function cargarAlertas() {
  cargandoAlertas.value = true
  try {
    const res = await listarHistorialAlertas({ limite: 100 })
    if (res.ok) {
      alertasItems.value = res.alertas
    }
  } catch (err) {
    console.warn('Error cargando alertas:', err)
  } finally {
    cargandoAlertas.value = false
  }
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
  else {
    await cargar(true)
    await cargarAlertas()
  }
}

onMounted(async () => {
  window.addEventListener('online', alVolverConexion)
  pendientes.value = contarPendientes(currentUserId.value)
  if (pendientes.value > 0 && navigator.onLine) await sincronizar()
  else await cargar(true)

  await cargarAlertas()
})

onBeforeUnmount(() => window.removeEventListener('online', alVolverConexion))
</script>

<style scoped>
.aviso { border-radius: 0.5rem; padding: 0.6rem 1rem; margin: 0 0 1rem; font-size: 0.88rem; }
.aviso-info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; }
.aviso-error { background: #fef2f2; border: 1px solid #fca5a5; color: #7f1d1d; }
.aviso-boton { font-size: 0.78rem; padding: 0.2rem 0.6rem; margin-left: 0.5rem; }

/* Tabs de Navegación */
.historial-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.25rem;
  border-bottom: 1px solid var(--color-border);
  padding-bottom: 0.25rem;
}

.tab-btn {
  display: inline-flex;
  align-items: center;
  padding: 0.55rem 1rem;
  border: 1px solid transparent;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--color-muted);
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
  border-radius: 0.35rem 0.35rem 0 0;
  transition: all 0.2s ease;
}

.tab-btn:hover {
  color: var(--color-text);
  background: #f8fafc;
}

.tab-btn.active {
  color: #1e40af;
  border-bottom-color: #2563eb;
  background: #eff6ff;
}

.tab-counter {
  font-size: 0.75rem;
  padding: 0.1rem 0.45rem;
  border-radius: 9999px;
  background: #e2e8f0;
  color: #334155;
  margin-left: 0.4rem;
}

.tab-counter-alertas {
  background: #fee2e2;
  color: #991b1b;
}

.filtros { display: flex; align-items: flex-end; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 0.75rem; }
.filtro-grupo { display: flex; flex-direction: column; gap: 0.2rem; }
.filtro-select { width: auto; min-width: 9rem; height: 2.2rem; }
.filtros-total { color: var(--color-muted); font-size: 0.85rem; margin-bottom: 0.4rem; }

.lista { list-style: none; margin: 0; padding: 0; display: grid; gap: 0.75rem; }
.fila { margin: 0; padding: 0.85rem 1rem; transition: border-color 0.2s; }
.fila-fuera-rango { border-left: 4px solid #f59e0b; }
.fila-cabecera { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin-bottom: 0.4rem; }
.fila-valores { display: flex; gap: 1.25rem; flex-wrap: wrap; font-size: 0.85rem; color: var(--color-muted); }
.num { font-size: 1.3rem; font-weight: 700; color: var(--color-text); font-family: monospace; }
.fila-estado { display: flex; gap: 0.5rem; flex-wrap: wrap; align-items: center; margin-top: 0.5rem; }

.chip { font-size: 0.72rem; font-weight: 600; padding: 0.15rem 0.5rem; border-radius: 9999px; background: #f1f5f9; border: 1px solid var(--color-border); color: var(--color-text); display: inline-flex; align-items: center; }
.chip-dentro { background: #dcfce7; border-color: #86efac; color: #15803d; }
.chip-fuera { background: #fef3c7; border-color: #fcd34d; color: #b45309; }
.chip-alerta-tag { background: #fee2e2; border-color: #fca5a5; color: #991b1b; }

.chip-sonora { background: #dbeafe; border-color: #bfdbfe; color: #1e40af; }
.chip-silenciada { background: #f1f5f9; border-color: #cbd5e1; color: #475569; }

.causa { display: block; margin-top: 0.35rem; color: var(--color-muted); }
.vacio { text-align: center; padding: 2rem 1rem; }
.vacio-icon-wrap { margin-bottom: 0.5rem; }

/* Lista de Alertas Registradas (RF21) */
.lista-alertas {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}

.card-alerta-registro {
  margin: 0;
  padding: 0.85rem 1.15rem;
  border-left: 4px solid #ef4444;
}

.alerta-sev-alta {
  border-left-color: #ef4444;
  background: #fef2f2;
}

.alerta-sev-media {
  border-left-color: #f59e0b;
  background: #fffbeb;
}

.alerta-sev-baja {
  border-left-color: #94a3b8;
  background: #f8fafc;
}

.alerta-registro-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.alerta-reg-left {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.alerta-reg-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 0.35rem;
  background: rgba(255, 255, 255, 0.8);
  color: #b91c1c;
}

.alerta-reg-titulo {
  font-size: 0.95rem;
  color: #111827;
}

.alerta-reg-fecha {
  font-size: 0.78rem;
  color: #6b7280;
}

.alerta-reg-chips {
  display: flex;
  gap: 0.35rem;
}

.alerta-reg-detalles {
  display: flex;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
  font-size: 0.82rem;
  background: rgba(255, 255, 255, 0.75);
  padding: 0.4rem 0.75rem;
  border-radius: 0.35rem;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.reg-detalle-item {
  display: inline-flex;
  gap: 0.3rem;
}

.reg-det-lbl {
  color: #4b5563;
}

.reg-det-val {
  color: #111827;
}
</style>
