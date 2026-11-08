<template>
  <div class="evaluaciones-container">
    <div class="card">
      <h1 class="card-title">📋 Evaluaciones</h1>
      <p class="header-desc">
        Elige el tipo de evaluación: preguntas o un ejercicio aplicado (medir pulso, medir SpO₂ o comparar señales).
        Las preguntas y la asignación a estudiantes se agregan en otras tareas (RF104 y RF105).
      </p>

      <p v-if="!puedeGestionar" class="alert alert-error">Solo los profesores y administradores pueden crear evaluaciones.</p>

      <template v-else>
        <p v-if="!aulas.length" class="alert alert-info">Primero crea un aula en la sección Aulas.</p>

        <form v-else class="nueva" novalidate @submit.prevent="guardar">
          <div class="form-group">
            <label class="form-label" for="eval-aula">Aula</label>
            <select id="eval-aula" v-model="aulaId" class="form-select" data-testid="eval-aula" @change="cargarLista">
              <option v-for="a in aulas" :key="a.id" :value="a.id">{{ a.nombre }}</option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="eval-titulo">Título</label>
            <input id="eval-titulo" v-model="titulo" class="form-input" maxlength="120" data-testid="eval-titulo" />
          </div>

          <div class="form-group">
            <label class="form-label" for="eval-desc">Descripción (opcional)</label>
            <textarea id="eval-desc" v-model="descripcion" class="form-input" rows="2" />
          </div>

          <TipoEvaluacionForm v-model="modelo" :mostrar-errores="intentado" />

          <p v-if="mensaje" class="alert" :class="mensajeError ? 'alert-error' : 'alert-success'" role="status" data-testid="eval-mensaje">
            {{ mensaje }}
          </p>

          <button type="submit" class="btn btn-primary" data-testid="eval-guardar" :disabled="guardando">
            {{ guardando ? 'Guardando…' : 'Guardar evaluación' }}
          </button>
        </form>

        <section v-if="aulas.length" class="lista" aria-label="Evaluaciones del aula">
          <h2 class="lista-titulo">Evaluaciones del aula</h2>
          <p v-if="!evaluaciones.length" class="header-desc">Todavía no hay evaluaciones en esta aula.</p>
          <ul v-else class="lista-items">
            <li v-for="e in evaluaciones" :key="e.id" class="lista-item" data-testid="eval-item">
              <div class="lista-cabecera">
                <strong>{{ e.titulo }}</strong>
                <span v-if="e.origen === 'local'" class="badge badge-local" title="Guardada solo en este navegador">Solo en este navegador</span>
              </div>
              <TipoEvaluacionBadge :tipo="e.tipo" :ejercicio="e.ejercicio" :criterio="e.criterio" />
            </li>
          </ul>
        </section>
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import TipoEvaluacionForm from '../components/TipoEvaluacionForm.vue'
import TipoEvaluacionBadge from '../components/TipoEvaluacionBadge.vue'
import { useAuth } from '../composables/useAuth'
import { obtenerAulas } from '../services/aulasService'
import { crearEvaluacion, obtenerEvaluacionesAula } from '../services/evaluacionesService'
import { modeloVacio, validarTipoEvaluacion } from '../utils/tiposEvaluacion.js'

const { currentUserId, currentUserEmail, isAdmin, isProfesor, can } = useAuth()

// RF52: solo profesor del aula o administrador (la RLS `evaluaciones_crear` lo exige también en la base)
const puedeGestionar = computed(() => isAdmin.value || isProfesor.value || can('GESTIONAR_EVALUACIONES'))

const aulas = ref([])
const aulaId = ref('')
const titulo = ref('')
const descripcion = ref('')
const modelo = ref(modeloVacio())
const evaluaciones = ref([])
const intentado = ref(false)
const guardando = ref(false)
const mensaje = ref('')
const mensajeError = ref(false)

async function cargarLista() {
  if (!aulaId.value) return
  const res = await obtenerEvaluacionesAula(aulaId.value)
  evaluaciones.value = res.data || []
}

async function guardar() {
  intentado.value = true
  mensaje.value = ''
  if (validarTipoEvaluacion(modelo.value).length) return
  guardando.value = true
  const res = await crearEvaluacion({
    aulaId: aulaId.value,
    creadorId: currentUserId.value,
    titulo: titulo.value,
    descripcion: descripcion.value,
    modelo: modelo.value,
    puedeGestionar: puedeGestionar.value
  })
  guardando.value = false
  mensajeError.value = !res.success
  if (!res.success) {
    mensaje.value = res.error
    return
  }
  mensaje.value = res.origen === 'local'
    ? 'Evaluación guardada solo en este navegador: no hay sesión con la base de datos.'
    : 'Evaluación guardada.'
  titulo.value = ''
  descripcion.value = ''
  modelo.value = modeloVacio()
  intentado.value = false
  await cargarLista()
}

onMounted(async () => {
  if (!puedeGestionar.value) return
  const res = await obtenerAulas({
    usuarioId: currentUserId.value,
    usuarioCorreo: currentUserEmail.value,
    esAdmin: isAdmin.value,
    esProfesor: isProfesor.value
  })
  aulas.value = res.data || []
  if (aulas.value.length) {
    aulaId.value = aulas.value[0].id
    await cargarLista()
  }
})
</script>

<style scoped>
.evaluaciones-container { max-width: 800px; margin: 0 auto; }
.header-desc { color: var(--color-muted); font-size: 0.95rem; margin-bottom: 1.25rem; }
.lista { margin-top: 2rem; }
.lista-titulo { font-size: 1.1rem; margin: 0 0 0.75rem; }
.lista-items { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.6rem; }
.lista-item { padding: 0.75rem 1rem; border: 1px solid var(--color-border); border-radius: 8px; display: grid; gap: 0.35rem; }
.lista-cabecera { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.badge-local { background: #fef3c7; color: #92400e; }
</style>
