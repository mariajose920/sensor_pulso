<template>
  <section class="panel" data-testid="panel-contenidos">
    <h2 class="titulo">Contenidos precargados (lecciones)</h2>
    <p class="desc">
      Edita el título, el resumen y los bloques de cada lección del apartado de aprendizaje.
      {{ esAdmin ? 'Tus cambios se publican para todos.' : 'Tus cambios los revisa el administrador antes de publicarse.' }}
    </p>

    <div v-if="mensaje" class="alert" :class="mensajeOk ? 'alert-success' : 'alert-error'" role="status">{{ mensaje }}</div>
    <p v-if="cargando" class="estado">Cargando lecciones...</p>

    <ul v-else class="lista">
      <li v-for="l in lecciones" :key="l.slug">
        <div>
          <strong>{{ l.titulo }}</strong>
          <span class="badge badge-usuario">{{ CATEGORIAS[l.categoria] }}</span>
          <small>{{ l.bloques.length }} bloques · {{ l.minutos }} min</small>
        </div>
        <button class="btn btn-secondary btn-sm" @click="abrir(l)">{{ esAdmin ? 'Editar' : 'Proponer cambio' }}</button>
      </li>
    </ul>

    <div v-if="editando" class="modal-backdrop" @click.self="cerrar">
      <div class="modal-card" role="dialog" aria-modal="true">
        <h3 class="modal-title">{{ esAdmin ? 'Editar lección' : 'Proponer cambio de lección' }}</h3>
        <form @submit.prevent="guardar">
          <div class="form-group">
            <label class="form-label" for="lec-titulo">Título</label>
            <input id="lec-titulo" v-model="form.titulo" class="form-input" maxlength="120" required />
          </div>
          <div class="form-group">
            <label class="form-label" for="lec-resumen">Resumen</label>
            <textarea id="lec-resumen" v-model="form.resumen" class="form-input" rows="2" maxlength="300" required></textarea>
          </div>
          <div class="grid-campos">
            <div class="form-group">
              <label class="form-label" for="lec-cat">Categoría</label>
              <select id="lec-cat" v-model="form.categoria" class="form-select">
                <option v-for="(nombre, clave) in CATEGORIAS" :key="clave" :value="clave">{{ nombre }}</option>
              </select>
            </div>
            <div class="form-group">
              <label class="form-label" for="lec-min">Minutos de lectura</label>
              <input id="lec-min" v-model.number="form.minutos" type="number" min="1" max="120" class="form-input" />
            </div>
          </div>
          <div class="form-group">
            <label class="form-label" for="lec-bloques">Bloques (JSON)</label>
            <textarea id="lec-bloques" v-model="form.bloquesTexto" class="form-input codigo" rows="10" spellcheck="false"></textarea>
            <small class="help-text">Tipos válidos: {{ TIPOS_BLOQUE.join(', ') }}.</small>
          </div>
          <div v-if="!esAdmin" class="form-group">
            <label class="form-label" for="lec-motivo">Motivo de la propuesta</label>
            <textarea id="lec-motivo" v-model="form.motivo" class="form-input" rows="2" maxlength="500"></textarea>
          </div>
          <p v-if="errorForm" class="alert alert-error">{{ errorForm }}</p>
          <div class="modal-actions">
            <button type="button" class="btn btn-secondary" @click="cerrar" :disabled="guardando">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="guardando">
              {{ guardando ? 'Guardando...' : (esAdmin ? 'Guardar lección' : 'Enviar propuesta') }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { obtenerLeccionesPlataforma, guardarLeccion, proponerCambioLeccion } from '../services/panelAdminService'
import { CATEGORIAS, TIPOS_BLOQUE } from '../data/lecciones.js'
import { parsearBloques } from '../utils/panelAdmin.js'

const props = defineProps({
  modo: { type: String, default: 'profesor' },   // 'admin' | 'profesor'
  usuarioId: { type: String, default: '' }
})
const esAdmin = computed(() => props.modo === 'admin')

const lecciones = ref([])
const cargando = ref(true)
const editando = ref(null)
const guardando = ref(false)
const errorForm = ref('')
const mensaje = ref('')
const mensajeOk = ref(true)
const form = ref({ titulo: '', resumen: '', categoria: 'fisiologia', minutos: 5, bloquesTexto: '[]', motivo: '' })

async function cargar() {
  cargando.value = true
  lecciones.value = await obtenerLeccionesPlataforma()
  cargando.value = false
}

function abrir(l) {
  editando.value = l
  errorForm.value = ''
  form.value = {
    titulo: l.titulo, resumen: l.resumen, categoria: l.categoria, minutos: l.minutos,
    bloquesTexto: JSON.stringify(l.bloques, null, 2), motivo: ''
  }
}

function cerrar() {
  editando.value = null
}

async function guardar() {
  const { bloques, error } = parsearBloques(form.value.bloquesTexto)
  if (error) { errorForm.value = error; return }
  const leccion = {
    slug: editando.value.slug, titulo: form.value.titulo, resumen: form.value.resumen,
    categoria: form.value.categoria, minutos: form.value.minutos, bloques
  }
  guardando.value = true
  const res = esAdmin.value
    ? await guardarLeccion(leccion, props.usuarioId)
    : await proponerCambioLeccion({ profesorId: props.usuarioId, leccion, motivo: form.value.motivo })
  guardando.value = false
  if (!res.success) { errorForm.value = res.error; return }
  mensaje.value = esAdmin.value ? 'Lección guardada y publicada.' : 'Propuesta enviada al administrador.'
  mensajeOk.value = true
  cerrar()
  if (esAdmin.value) await cargar()
}

onMounted(cargar)
</script>

<style scoped>
.panel { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 1.25rem; }
.titulo { font-size: 1.15rem; font-weight: 700; }
.desc { color: var(--color-muted); font-size: 0.9rem; margin: 0.25rem 0 1rem; }
.estado { color: var(--color-muted); }
.lista { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.lista li { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 0.65rem 0.75rem; }
.lista small { display: block; color: var(--color-muted); font-size: 0.78rem; }
.help-text { display: block; font-size: 0.75rem; color: var(--color-muted); margin-top: 0.25rem; }
.codigo { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.8rem; }
.grid-campos { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0 0.75rem; }
.modal-backdrop { position: fixed; inset: 0; background: rgba(15, 23, 42, 0.6); display: flex; align-items: center; justify-content: center; z-index: 50; padding: 1rem; }
.modal-card { background: var(--color-surface); border-radius: 0.75rem; max-width: 680px; width: 100%; max-height: 90vh; overflow-y: auto; padding: 1.5rem; }
.modal-title { font-size: 1.2rem; font-weight: 700; margin-bottom: 0.75rem; }
.modal-actions { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1rem; }
</style>
