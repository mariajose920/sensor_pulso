<template>
  <section class="admin-section" aria-labelledby="rangos-titulo">
    <div class="section-top">
      <div>
        <h2 id="rangos-titulo" class="section-title">Rangos de BPM y SpO₂</h2>
        <p class="section-desc">
          Rango esperado por actividad y edad. Son valores orientativos de uso educativo, no criterios clínicos.
        </p>
      </div>
      <div class="acciones-top">
        <select v-model="filtroActividad" class="form-select" aria-label="Filtrar por actividad">
          <option value="">Todas las actividades</option>
          <option v-for="a in actividades" :key="a.id" :value="a.id">{{ a.nombre }}</option>
        </select>
        <button v-if="esAdmin" class="btn btn-primary btn-sm" @click="abrirNuevoGlobal">+ Nuevo rango</button>
      </div>
    </div>

    <div v-if="mensaje" class="alert" :class="mensajeOk ? 'alert-success' : 'alert-error'" role="status">{{ mensaje }}</div>

    <p v-if="!esAdmin && !puedeEditar" class="help-text sin-permiso">
      No tienes el permiso «editar rangos». Puedes consultar los rangos, pero no modificarlos.
    </p>

    <div v-if="cargando" class="loading-state">Cargando rangos...</div>
    <div v-else-if="filas.length === 0" class="empty-state">No hay rangos para mostrar.</div>

    <div v-else class="table-responsive">
      <table class="users-table">
        <thead>
          <tr>
            <th>Actividad</th>
            <th>Edad</th>
            <th>BPM</th>
            <th>SpO₂ (%)</th>
            <th v-if="esAdmin">Estado</th>
            <th v-else-if="puedeEditar">Mi rango</th>
            <th v-if="esAdmin || puedeEditar" style="text-align: right;">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="f in filas" :key="f.id" :class="{ inactivo: f.vigente === false }">
            <td><strong>{{ nombreActividad(f.actividad_id) }}</strong></td>
            <td>{{ f.edad_min }}–{{ f.edad_max }} años</td>
            <td>{{ f.bpm_min }}–{{ f.bpm_max }}</td>
            <td>{{ f.spo2_min }}–{{ f.spo2_max }}</td>

            <td v-if="esAdmin">
              <span class="badge" :class="f.vigente === false ? 'badge-usuario' : 'badge-profesor'">
                {{ f.vigente === false ? 'Desactivado' : 'Vigente' }}
              </span>
            </td>
            <td v-else-if="puedeEditar">
              <span v-if="f.personal" class="badge badge-admin">
                BPM {{ f.personal.bpm_min }}–{{ f.personal.bpm_max }} · SpO₂ {{ f.personal.spo2_min }}–{{ f.personal.spo2_max }}
              </span>
              <span v-else class="help-text">Usa el global</span>
            </td>

            <td v-if="esAdmin" class="celda-acciones">
              <button class="btn btn-secondary btn-sm" @click="abrirEditarGlobal(f)">Editar</button>
              <button class="btn btn-secondary btn-sm" @click="alternarVigencia(f)">
                {{ f.vigente === false ? 'Reactivar' : 'Desactivar' }}
              </button>
            </td>
            <td v-else-if="puedeEditar" class="celda-acciones">
              <button class="btn btn-secondary btn-sm" @click="abrirPersonal(f)">
                {{ f.personal ? 'Editar el mío' : 'Personalizar' }}
              </button>
              <button v-if="f.personal" class="btn btn-secondary btn-sm" @click="quitarPersonal(f.personal)">Quitar el mío</button>
              <button class="btn btn-secondary btn-sm" @click="abrirProponer(f)">Proponer cambio global</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- Propuestas de cambio (RF46) -->
    <div v-if="esAdmin || puedeEditar" class="propuestas">
      <h3 class="subtitulo">{{ esAdmin ? 'Propuestas pendientes de profesores' : 'Mis propuestas' }}</h3>
      <p v-if="propuestas.length === 0" class="help-text">No hay propuestas.</p>
      <ul v-else class="lista-propuestas">
        <li v-for="p in propuestas" :key="p.id">
          <div>
            <strong>{{ p.entidad_id ? 'Cambio de rango' : 'Rango nuevo' }}</strong>
            · {{ nombreActividad(p.propuesta.actividad_id) }} {{ p.propuesta.edad_min }}–{{ p.propuesta.edad_max }} años:
            BPM {{ p.propuesta.bpm_min }}–{{ p.propuesta.bpm_max }}, SpO₂ {{ p.propuesta.spo2_min }}–{{ p.propuesta.spo2_max }}
            <span class="help-text">Motivo: {{ p.motivo }}</span>
          </div>
          <div class="celda-acciones">
            <span v-if="!esAdmin" class="badge" :class="claseEstado(p.estado)">{{ p.estado }}</span>
            <template v-else>
              <button class="btn btn-primary btn-sm" @click="resolver(p, true)">Aprobar</button>
              <button class="btn btn-secondary btn-sm" @click="resolver(p, false)">Rechazar</button>
            </template>
          </div>
        </li>
      </ul>
    </div>

    <!-- Modal de edición -->
    <div v-if="modal" class="modal-backdrop" @click.self="cerrarModal">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="rangos-modal-titulo">
        <h3 id="rangos-modal-titulo" class="modal-title">{{ tituloModal }}</h3>
        <p class="modal-subtitle">{{ subtituloModal }}</p>

        <form @submit.prevent="guardarModal">
          <div class="form-group">
            <label class="form-label" for="rg-actividad">Actividad</label>
            <select id="rg-actividad" v-model="form.actividad_id" class="form-select" :disabled="modal.fijaActividad">
              <option value="" disabled>Elige una actividad</option>
              <option v-for="a in actividades" :key="a.id" :value="a.id">{{ a.nombre }}</option>
            </select>
          </div>

          <div class="grid-campos">
            <div class="form-group">
              <label class="form-label" for="rg-emin">Edad mínima</label>
              <input id="rg-emin" v-model.number="form.edad_min" type="number" inputmode="numeric" class="form-input" :disabled="modal.fijaActividad" />
            </div>
            <div class="form-group">
              <label class="form-label" for="rg-emax">Edad máxima</label>
              <input id="rg-emax" v-model.number="form.edad_max" type="number" inputmode="numeric" class="form-input" :disabled="modal.fijaActividad" />
            </div>
            <div class="form-group">
              <label class="form-label" for="rg-bmin">BPM mínimo</label>
              <input id="rg-bmin" v-model.number="form.bpm_min" type="number" inputmode="numeric" class="form-input" />
            </div>
            <div class="form-group">
              <label class="form-label" for="rg-bmax">BPM máximo</label>
              <input id="rg-bmax" v-model.number="form.bpm_max" type="number" inputmode="numeric" class="form-input" />
            </div>
            <div class="form-group">
              <label class="form-label" for="rg-smin">SpO₂ mínimo (%)</label>
              <input id="rg-smin" v-model.number="form.spo2_min" type="number" inputmode="numeric" class="form-input" />
            </div>
            <div class="form-group">
              <label class="form-label" for="rg-smax">SpO₂ máximo (%)</label>
              <input id="rg-smax" v-model.number="form.spo2_max" type="number" inputmode="numeric" class="form-input" />
            </div>
          </div>

          <div v-if="modal.tipo === 'proponer'" class="form-group">
            <label class="form-label" for="rg-motivo">Motivo de la propuesta</label>
            <textarea id="rg-motivo" v-model="motivo" class="form-input" rows="3" maxlength="500"></textarea>
          </div>

          <p v-if="erroresModal.length" class="alert alert-error" role="alert">{{ erroresModal.join(' ') }}</p>

          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="cerrarModal">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="guardando">
              {{ guardando ? 'Guardando...' : textoBoton }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import {
  listarActividades, listarRangos, listarRangosPersonales, guardarRangoPersonal, eliminarRangoPersonal,
  crearRango, actualizarRango, cambiarVigencia, proponerCambioRango, listarPropuestasRango,
  resolverPropuestaRango, validarRango
} from '../services/rangosService'

const props = defineProps({
  modo: { type: String, default: 'profesor' },          // 'admin' | 'profesor'
  puedeEditar: { type: Boolean, default: false },       // profesor con permiso editar_rangos
  usuarioId: { type: String, default: null }
})

const esAdmin = computed(() => props.modo === 'admin')

const actividades = ref([])
const globales = ref([])
const personales = ref([])
const propuestas = ref([])
const filtroActividad = ref('')
const cargando = ref(false)
const mensaje = ref('')
const mensajeOk = ref(true)

const modal = ref(null)           // { tipo: 'global-nuevo'|'global-editar'|'personal'|'proponer', id, fijaActividad }
const form = ref({})
const motivo = ref('')
const erroresModal = ref([])
const guardando = ref(false)

const nombreActividad = (id) => actividades.value.find((a) => a.id === id)?.nombre || '—'
const claseEstado = (e) => (e === 'aprobada' ? 'badge-profesor' : e === 'rechazada' ? 'badge-usuario' : 'badge-admin')

const filas = computed(() =>
  globales.value
    .filter((r) => !filtroActividad.value || r.actividad_id === filtroActividad.value)
    .map((r) => ({
      ...r,
      personal: personales.value.find((p) =>
        p.actividad_id === r.actividad_id && p.edad_min === r.edad_min && p.edad_max === r.edad_max)
    }))
)

const tituloModal = computed(() => ({
  'global-nuevo': 'Nuevo rango',
  'global-editar': 'Editar rango',
  personal: 'Mi rango personal',
  proponer: 'Proponer cambio global'
}[modal.value?.tipo] || ''))

const subtituloModal = computed(() => ({
  'global-nuevo': 'Se aplicará a todas las cuentas.',
  'global-editar': 'El cambio se aplica a todas las cuentas y queda en la auditoría.',
  personal: 'Solo vale para tu cuenta. Los demás siguen viendo el rango global.',
  proponer: 'El administrador revisará la propuesta. Si la aprueba, cambia para todos.'
}[modal.value?.tipo] || ''))

const textoBoton = computed(() => (modal.value?.tipo === 'proponer' ? 'Enviar propuesta' : 'Guardar'))

function avisar(texto, ok = true) {
  mensaje.value = texto
  mensajeOk.value = ok
}

async function cargar() {
  cargando.value = true
  const [act, glob] = await Promise.all([listarActividades(), listarRangos({ incluirInactivos: esAdmin.value })])
  if (!act.success || !glob.success) avisar(act.error || glob.error, false)
  actividades.value = act.data || []
  globales.value = glob.data || []

  if (!esAdmin.value && props.puedeEditar && props.usuarioId) {
    const per = await listarRangosPersonales(props.usuarioId)
    personales.value = per.data || []
  }
  if (esAdmin.value || props.puedeEditar) {
    const pro = await listarPropuestasRango({ soloPendientes: esAdmin.value })
    propuestas.value = pro.data || []
  }
  cargando.value = false
}

const formDesde = (r = {}) => ({
  actividad_id: r.actividad_id ?? '',
  edad_min: r.edad_min ?? 18,
  edad_max: r.edad_max ?? 64,
  bpm_min: r.bpm_min ?? 60,
  bpm_max: r.bpm_max ?? 100,
  spo2_min: r.spo2_min ?? 95,
  spo2_max: r.spo2_max ?? 100
})

function abrir(tipo, datos, extra = {}) {
  form.value = formDesde(datos)
  motivo.value = ''
  erroresModal.value = []
  modal.value = { tipo, ...extra }
}

const abrirNuevoGlobal = () => abrir('global-nuevo', {})
const abrirEditarGlobal = (f) => abrir('global-editar', f, { id: f.id, fijaActividad: false })
const abrirPersonal = (f) => abrir('personal', f.personal || f, { id: f.personal?.id || null, fijaActividad: true })
const abrirProponer = (f) => abrir('proponer', f, { id: f.id, fijaActividad: true })
const cerrarModal = () => { modal.value = null }

async function guardarModal() {
  erroresModal.value = validarRango(form.value)
  if (erroresModal.value.length) return
  guardando.value = true
  const { tipo, id } = modal.value
  let res
  if (tipo === 'global-nuevo') res = await crearRango(form.value, props.usuarioId)
  else if (tipo === 'global-editar') res = await actualizarRango(id, form.value, props.usuarioId)
  else if (tipo === 'personal') res = await guardarRangoPersonal(props.usuarioId, form.value, id)
  else res = await proponerCambioRango({ profesorId: props.usuarioId, rangoId: id, rango: form.value, motivo: motivo.value })
  guardando.value = false

  if (!res.success) {
    erroresModal.value = [res.error]
    return
  }
  avisar(tipo === 'proponer' ? 'Propuesta enviada al administrador.' : 'Rango guardado.')
  cerrarModal()
  await cargar()
}

async function alternarVigencia(f) {
  const res = await cambiarVigencia(f.id, f.vigente === false, props.usuarioId)
  avisar(res.success ? 'Estado del rango actualizado.' : res.error, res.success)
  if (res.success) await cargar()
}

async function quitarPersonal(p) {
  const res = await eliminarRangoPersonal(p.id)
  avisar(res.success ? 'Volviste al rango global.' : res.error, res.success)
  if (res.success) await cargar()
}

async function resolver(p, aprobar) {
  const res = await resolverPropuestaRango(p.id, aprobar)
  avisar(res.success ? (aprobar ? 'Propuesta aprobada: el rango cambió para todos.' : 'Propuesta rechazada.') : res.error, res.success)
  if (res.success) await cargar()
}

onMounted(cargar)
watch(() => [props.modo, props.puedeEditar, props.usuarioId], cargar)
</script>

<style scoped>
.admin-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 1.25rem;
}
.section-top { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; margin-bottom: 1rem; }
.section-title { font-size: 1.15rem; font-weight: 700; }
.section-desc { color: var(--color-muted); font-size: 0.9rem; margin-top: 0.25rem; }
.acciones-top { display: flex; gap: 0.5rem; align-items: center; flex-wrap: wrap; }
.table-responsive { overflow-x: auto; }
.users-table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
.users-table th, .users-table td { padding: 0.75rem 0.5rem; border-bottom: 1px solid var(--color-border); text-align: left; }
.users-table th { color: var(--color-muted); font-weight: 600; font-size: 0.8rem; text-transform: uppercase; }
.inactivo { opacity: 0.55; }
.celda-acciones { display: flex; gap: 0.4rem; justify-content: flex-end; flex-wrap: wrap; align-items: center; }
.loading-state, .empty-state { text-align: center; padding: 2rem; color: var(--color-muted); }
.help-text { display: block; font-size: 0.75rem; color: var(--color-muted); margin-top: 0.25rem; }
.sin-permiso { margin-bottom: 0.75rem; font-size: 0.85rem; }
.propuestas { margin-top: 1.5rem; }
.subtitulo { font-size: 1rem; font-weight: 700; margin-bottom: 0.5rem; }
.lista-propuestas { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.lista-propuestas li {
  display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap;
  border: 1px solid var(--color-border); border-radius: 0.5rem; background: #f8fafc; padding: 0.65rem 0.75rem; font-size: 0.875rem;
}

.modal-backdrop {
  position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); display: flex;
  align-items: center; justify-content: center; z-index: 50; padding: 1rem;
}
.modal-card {
  background: var(--color-surface); border-radius: 0.75rem; max-width: 520px; width: 100%;
  max-height: 90vh; overflow-y: auto; padding: 1.75rem; box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
}
.modal-title { font-size: 1.25rem; font-weight: 700; margin-bottom: 0.25rem; }
.modal-subtitle { font-size: 0.875rem; color: var(--color-muted); margin-bottom: 1rem; }
.grid-campos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 0.75rem; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.25rem; }

@media (max-width: 600px) {
  .acciones-top { width: 100%; }
  .acciones-top .form-select { flex: 1; }
  .celda-acciones { justify-content: flex-start; }
}
</style>
