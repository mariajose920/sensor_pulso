<template>
  <div class="aulas-container">
    <div class="card">
      <div class="aulas-header">
        <div>
          <h1 class="card-title">🏫 Aulas y Cursos</h1>
          <p class="header-desc">
            Espacio académico para cursos y evaluaciones prácticas de pulso cardíaco.
          </p>
        </div>
        
        <button 
          v-if="isProfesor"
          @click="abrirModalCrearAula"
          class="btn btn-primary"
          :disabled="!tienePermisoProfesor('crear_aulas')"
        >
          + Crear Nueva Aula
        </button>
      </div>

      <!-- Alertas de estado -->
      <div v-if="feedbackMensaje" class="alert" :class="feedbackExito ? 'alert-success' : 'alert-error'">
        {{ feedbackMensaje }}
      </div>

      <div v-if="isProfesor && !tienePermisoProfesor('crear_aulas')" class="alert alert-warning">
        ⚠️ Aún no tienes habilitado el permiso para crear aulas. Solicita al administrador que te active este permiso en el panel.
      </div>

      <!-- VISTA PROFESOR / ADMIN -->
      <div v-if="isProfesor" class="section-block">
        <div class="section-title-row">
          <h2 class="section-title">
            {{ isAdmin ? 'Todas las Aulas del Sistema (Vista Administrador)' : 'Mis Aulas Asignadas' }}
          </h2>
          <span class="badge badge-info">{{ listaAulas.length }} aula(s)</span>
        </div>

        <div v-if="cargando" class="loading-state">
          Cargando aulas...
        </div>

        <div v-else-if="listaAulas.length === 0" class="empty-state">
          <p>No tienes aulas creadas todavía.</p>
          <small>Presiona "+ Crear Nueva Aula" para habilitar tu primer curso.</small>
        </div>

        <div v-else class="aulas-grid">
          <div v-for="aula in listaAulas" :key="aula.id" class="aula-card card">
            <div class="aula-header">
              <h3 class="aula-title">{{ aula.nombre }}</h3>
              <span class="badge badge-profesor">Activa</span>
            </div>

            <p class="aula-desc">{{ aula.descripcion || 'Sin descripción adicional.' }}</p>

            <div v-if="isAdmin" class="profesor-tag">
              Docente: <strong>{{ aula.profesor_nombre || 'Docente asignado' }}</strong>
            </div>

            <!-- Código único del aula -->
            <div class="codigo-box">
              <span class="codigo-label">Código de acceso:</span>
              <div class="codigo-display">
                <code>{{ aula.codigo }}</code>
                <button @click="copiarCodigo(aula.codigo)" class="btn-copy" title="Copiar código">
                  📋 Copiar
                </button>
              </div>
            </div>

            <!-- RF101: SECCIÓN DE CURSOS DENTRO DEL AULA -->
            <div class="cursos-section">
              <div class="cursos-header">
                <strong>Cursos (Secciones):</strong>
                <button @click="abrirModalNuevoCurso(aula)" class="btn-link btn-mini">
                  + Nuevo Curso
                </button>
              </div>

              <!-- Lista de cursos dentro del aula -->
              <div v-if="getCursos(aula.id).length === 0" class="cursos-vacio">
                Sin cursos definidos. Presiona "+ Nuevo Curso" para agrupar estudiantes.
              </div>
              <ul v-else class="cursos-list">
                <li v-for="curso in getCursos(aula.id)" :key="curso.id" class="curso-item">
                  <div class="curso-info">
                    <span class="curso-nombre">{{ curso.nombre }}</span>
                    <span class="badge badge-estudiantes">
                      👥 {{ curso.cantidad_estudiantes }} estudiante(s)
                    </span>
                  </div>
                  <div class="curso-actions">
                    <button @click="abrirModalEstudiantes(aula, curso)" class="btn-icon" title="Gestionar estudiantes">
                      👥 Alumnos
                    </button>
                    <button @click="abrirModalRenombrarCurso(aula, curso)" class="btn-icon" title="Renombrar curso">
                      ✏️
                    </button>
                    <button @click="confirmarEliminarCurso(aula, curso)" class="btn-icon text-danger" title="Eliminar curso">
                      🗑️
                    </button>
                  </div>
                </li>
              </ul>
            </div>

            <div class="aula-footer">
              <span class="cupo-text">Capacidad: hasta {{ aula.max_estudiantes || 100 }} estudiantes</span>
            </div>
          </div>
        </div>
      </div>

      <!-- VISTA ESTUDIANTE -->
      <div v-else class="section-block">
        <div class="unirse-card card mb-4">
          <h2 class="section-title">Unirse a un Aula</h2>
          <p class="section-desc">
            Ingresa el código proporcionado por tu profesor para incorporarte al aula de clases.
          </p>
          <div class="join-box">
            <input 
              v-model="codigoIngreso" 
              type="text" 
              class="form-input" 
              placeholder="Ej: K8M3X9P2" 
              style="max-width: 280px; text-transform: uppercase;"
              maxlength="8"
            />
            <button class="btn btn-primary">Unirme</button>
          </div>
        </div>

        <h2 class="section-title mt-4">Mis Aulas Inscritas</h2>
        <div v-if="listaAulas.length === 0" class="empty-state">
          Aún no estás inscrito en ninguna aula. Pide el código a tu profesor para ingresar.
        </div>
        <div v-else class="aulas-grid">
          <div v-for="aula in listaAulas" :key="aula.id" class="aula-card card">
            <h3 class="aula-title">{{ aula.nombre }}</h3>
            <p class="aula-desc">{{ aula.descripcion }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL CREAR AULA (RF99) -->
    <div v-if="modalCrearAulaAbierto" class="modal-backdrop" @click.self="modalCrearAulaAbierto = false">
      <div class="modal-card">
        <h3 class="modal-title">Crear Nueva Aula Virtual</h3>
        <p class="modal-subtitle">
          El sistema generará automáticamente un código único y legible para compartir.
        </p>

        <form @submit.prevent="guardarNuevaAula">
          <div class="form-group">
            <label class="form-label">Nombre del Aula *</label>
            <input v-model="formAula.nombre" type="text" class="form-input" placeholder="Ej: Fisiología Humana 2026" required />
          </div>

          <div class="form-group">
            <label class="form-label">Descripción</label>
            <textarea v-model="formAula.descripcion" class="form-input" rows="2" placeholder="Ej: Prácticas de laboratorio."></textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Código generado</label>
            <div class="codigo-preview">
              <code>{{ codigoPrevisualizado }}</code>
              <button type="button" @click="codigoPrevisualizado = generarCodigoAula()" class="btn-link">🔄 Generar otro</button>
            </div>
          </div>

          <div class="modal-actions">
            <button type="button" @click="modalCrearAulaAbierto = false" class="btn btn-secondary">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="guardando">Crear Aula</button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL CREAR / RENOMBRAR CURSO (RF101) -->
    <div v-if="modalCursoAbierto" class="modal-backdrop" @click.self="modalCursoAbierto = false">
      <div class="modal-card">
        <h3 class="modal-title">{{ modoCurso === 'crear' ? 'Crear Nuevo Curso' : 'Renombrar Curso' }}</h3>
        <p class="modal-subtitle">Aula: <strong>{{ aulaSeleccionada?.nombre }}</strong></p>

        <form @submit.prevent="guardarCurso">
          <div class="form-group">
            <label class="form-label">Nombre del Curso (Sección) *</label>
            <input 
              v-model="nombreCursoInput" 
              type="text" 
              class="form-input" 
              placeholder="Ej: Sección 1 - Mañana" 
              required 
            />
          </div>

          <div class="modal-actions">
            <button type="button" @click="modalCursoAbierto = false" class="btn btn-secondary">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="guardando">
              {{ modoCurso === 'crear' ? 'Crear Curso' : 'Guardar Cambios' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL GESTIONAR ESTUDIANTES DEL CURSO (RF101) -->
    <div v-if="modalEstudiantesAbierto" class="modal-backdrop" @click.self="modalEstudiantesAbierto = false">
      <div class="modal-card">
        <h3 class="modal-title">👥 Asignar Estudiantes al Curso</h3>
        <p class="modal-subtitle">
          Curso: <strong>{{ cursoSeleccionado?.nombre }}</strong> (Aula: {{ aulaSeleccionada?.nombre }})
        </p>

        <div v-if="estudiantesAula.length === 0" class="empty-state" style="padding: 1.5rem;">
          No hay estudiantes inscritos en esta aula todavía.
        </div>

        <div v-else class="estudiantes-list">
          <p class="help-text mb-2">Marca los estudiantes que formarán parte de este curso (pueden estar en varios cursos):</p>
          <label v-for="est in estudiantesAula" :key="est.usuario_id" class="estudiante-item">
            <input type="checkbox" :value="est.usuario_id" v-model="estudiantesSeleccionados" />
            <div>
              <strong>{{ est.nombre }}</strong>
              <p><code>{{ est.correo }}</code></p>
            </div>
          </label>
        </div>

        <div class="modal-actions">
          <button type="button" @click="modalEstudiantesAbierto = false" class="btn btn-secondary">Cancelar</button>
          <button type="button" @click="guardarAsignacionEstudiantes" class="btn btn-primary" :disabled="guardando">
            Guardar Asignación
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuth } from '../composables/useAuth'
import { 
  obtenerAulas, 
  crearAula, 
  generarCodigoAula, 
  obtenerCursosAula, 
  obtenerEstudiantesAula, 
  crearCurso, 
  renombrarCurso, 
  eliminarCurso, 
  actualizarEstudiantesCurso 
} from '../services/aulasService'

const { currentUserId, currentUserName, isProfesor, isAdmin, tienePermisoProfesor } = useAuth()

const listaAulas = ref([])
const cursosPorAula = ref({})
const cargando = ref(false)
const guardando = ref(false)
const codigoIngreso = ref('')
const feedbackMensaje = ref('')
const feedbackExito = ref(true)

// Modal Crear Aula
const modalCrearAulaAbierto = ref(false)
const codigoPrevisualizado = ref('')
const formAula = ref({ nombre: '', descripcion: '' })

// Modal Crear/Renombrar Curso (RF101)
const modalCursoAbierto = ref(false)
const modoCurso = ref('crear') // 'crear' o 'renombrar'
const aulaSeleccionada = ref(null)
const cursoSeleccionado = ref(null)
const nombreCursoInput = ref('')

// Modal Asignar Estudiantes (RF101)
const modalEstudiantesAbierto = ref(false)
const estudiantesAula = ref([])
const estudiantesSeleccionados = ref([])

const getCursos = (aulaId) => cursosPorAula.value[aulaId] || []

const cargarListaAulas = async () => {
  cargando.value = true
  const res = await obtenerAulas({
    usuarioId: currentUserId.value,
    esAdmin: isAdmin.value,
    esProfesor: isProfesor.value
  })
  cargando.value = false
  if (res.success) {
    listaAulas.value = res.data
    // Cargar cursos de cada aula
    for (const a of res.data) {
      await cargarCursosDeAula(a.id)
    }
  }
}

const cargarCursosDeAula = async (aulaId) => {
  const res = await obtenerCursosAula(aulaId)
  if (res.success) {
    cursosPorAula.value[aulaId] = res.data
  }
}

// Aulas
const abrirModalCrearAula = () => {
  formAula.value = { nombre: '', descripcion: '' }
  codigoPrevisualizado.value = generarCodigoAula()
  modalCrearAulaAbierto.value = true
}

const guardarNuevaAula = async () => {
  guardando.value = true
  const res = await crearAula({
    nombre: formAula.value.nombre,
    descripcion: formAula.value.descripcion,
    profesorId: currentUserId.value,
    profesorNombre: currentUserName.value,
    tienePermiso: tienePermisoProfesor('crear_aulas')
  })
  guardando.value = false
  if (res.success) {
    feedbackExito.value = true
    feedbackMensaje.value = `¡Aula "${res.data.nombre}" creada con éxito! Código: ${res.data.codigo}`
    modalCrearAulaAbierto.value = false
    await cargarListaAulas()
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

const copiarCodigo = async (codigo) => {
  try {
    await navigator.clipboard.writeText(codigo)
    feedbackExito.value = true
    feedbackMensaje.value = `Código ${codigo} copiado al portapapeles.`
  } catch (_) {
    feedbackMensaje.value = `Código: ${codigo}`
  }
}

// ==========================================
// RF101: MÉTODOS DE CURSOS
// ==========================================

const abrirModalNuevoCurso = (aula) => {
  aulaSeleccionada.value = aula
  modoCurso.value = 'crear'
  nombreCursoInput.value = ''
  modalCursoAbierto.value = true
}

const abrirModalRenombrarCurso = (aula, curso) => {
  aulaSeleccionada.value = aula
  cursoSeleccionado.value = curso
  modoCurso.value = 'renombrar'
  nombreCursoInput.value = curso.nombre
  modalCursoAbierto.value = true
}

const guardarCurso = async () => {
  if (!aulaSeleccionada.value) return
  guardando.value = true
  feedbackMensaje.value = ''

  let res
  if (modoCurso.value === 'crear') {
    res = await crearCurso({
      aulaId: aulaSeleccionada.value.id,
      nombre: nombreCursoInput.value,
      profesorId: currentUserId.value,
      esAdmin: isAdmin.value
    })
  } else {
    res = await renombrarCurso({
      cursoId: cursoSeleccionado.value.id,
      nuevoNombre: nombreCursoInput.value,
      aulaId: aulaSeleccionada.value.id,
      profesorId: currentUserId.value,
      esAdmin: isAdmin.value
    })
  }

  guardando.value = false

  if (res.success) {
    feedbackExito.value = true
    feedbackMensaje.value = modoCurso.value === 'crear'
      ? `Curso "${nombreCursoInput.value}" creado exitosamente.`
      : `Curso renombrado correctamente.`
    modalCursoAbierto.value = false
    await cargarCursosDeAula(aulaSeleccionada.value.id)
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

const confirmarEliminarCurso = async (aula, curso) => {
  const confirmacion = window.confirm(
    `¿Seguro que deseas eliminar el curso "${curso.nombre}"?\n\nLos estudiantes asignados permanecerán en el aula normalmente.`
  )
  if (!confirmacion) return

  const res = await eliminarCurso({
    cursoId: curso.id,
    aulaId: aula.id,
    profesorId: currentUserId.value,
    esAdmin: isAdmin.value
  })

  if (res.success) {
    feedbackExito.value = true
    feedbackMensaje.value = `Curso "${curso.nombre}" eliminado del aula.`
    await cargarCursosDeAula(aula.id)
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

// Asignación de Estudiantes al Curso
const abrirModalEstudiantes = async (aula, curso) => {
  aulaSeleccionada.value = aula
  cursoSeleccionado.value = curso
  estudiantesSeleccionados.value = [...(curso.estudiantes_ids || [])]

  // Cargar estudiantes de esta aula
  const res = await obtenerEstudiantesAula(aula.id)
  if (res.success) {
    estudiantesAula.value = res.data
  }
  modalEstudiantesAbierto.value = true
}

const guardarAsignacionEstudiantes = async () => {
  if (!cursoSeleccionado.value || !aulaSeleccionada.value) return
  guardando.value = true

  const res = await actualizarEstudiantesCurso({
    cursoId: cursoSeleccionado.value.id,
    aulaId: aulaSeleccionada.value.id,
    estudiantesIds: estudiantesSeleccionados.value
  })

  guardando.value = false

  if (res.success) {
    feedbackExito.value = true
    feedbackMensaje.value = `Estudiantes asignados al curso "${cursoSeleccionado.value.nombre}".`
    modalEstudiantesAbierto.value = false
    await cargarCursosDeAula(aulaSeleccionada.value.id)
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

onMounted(() => {
  cargarListaAulas()
})
</script>

<style scoped>
.aulas-container {
  max-width: 950px;
  margin: 0 auto;
}

.aulas-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.header-desc {
  color: var(--color-muted);
  font-size: 0.95rem;
}

.section-block {
  margin-top: 1rem;
}

.section-title-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.section-title {
  font-size: 1.2rem;
  font-weight: 700;
}

.badge-info {
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.8rem;
  padding: 0.25rem 0.6rem;
  border-radius: 9999px;
}

.aulas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 1.25rem;
  margin-top: 1rem;
}

.aula-card {
  display: flex;
  flex-direction: column;
  padding: 1.25rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
}

.aula-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.aula-title {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
}

.aula-desc {
  font-size: 0.875rem;
  color: var(--color-muted);
  margin-bottom: 0.75rem;
}

.profesor-tag {
  font-size: 0.8rem;
  color: var(--color-muted);
  margin-bottom: 0.75rem;
}

.codigo-box {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.5rem 0.75rem;
  margin-bottom: 1rem;
}

.codigo-label {
  display: block;
  font-size: 0.75rem;
  color: var(--color-muted);
  margin-bottom: 0.2rem;
}

.codigo-display {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.codigo-display code {
  font-size: 1.15rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  color: var(--color-primary);
}

.btn-copy {
  background: none;
  border: none;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-primary);
  cursor: pointer;
}

.btn-copy:hover {
  text-decoration: underline;
}

/* SECCIÓN DE CURSOS (RF101) */
.cursos-section {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 1rem;
  flex: 1;
}

.cursos-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.85rem;
  margin-bottom: 0.5rem;
}

.btn-mini {
  font-size: 0.8rem;
  padding: 0;
}

.cursos-vacio {
  font-size: 0.8rem;
  color: var(--color-muted);
  padding: 0.5rem 0;
  text-align: center;
}

.cursos-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.curso-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.35rem;
  padding: 0.45rem 0.6rem;
  font-size: 0.85rem;
}

.curso-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.curso-nombre {
  font-weight: 600;
}

.badge-estudiantes {
  background: #f1f5f9;
  color: #475569;
  font-size: 0.75rem;
  padding: 0.15rem 0.45rem;
  border-radius: 9999px;
  width: fit-content;
}

.curso-actions {
  display: flex;
  gap: 0.35rem;
}

.btn-icon {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 0.25rem;
  padding: 0.2rem 0.4rem;
  font-size: 0.8rem;
  cursor: pointer;
  background: #ffffff;
}

.btn-icon:hover {
  background: #f1f5f9;
}

.aula-footer {
  font-size: 0.75rem;
  color: var(--color-muted);
  border-top: 1px solid var(--color-border);
  padding-top: 0.5rem;
}

.join-box {
  display: flex;
  gap: 0.75rem;
  margin-top: 0.75rem;
}

.loading-state, .empty-state {
  text-align: center;
  padding: 2.5rem;
  color: var(--color-muted);
  background: #f8fafc;
  border-radius: 0.5rem;
}

.codigo-preview {
  display: flex;
  align-items: center;
  gap: 1rem;
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.6rem 0.75rem;
}

.codigo-preview code {
  font-size: 1.25rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  color: var(--color-primary);
}

.btn-link {
  background: none;
  border: none;
  color: var(--color-primary);
  cursor: pointer;
  font-weight: 600;
}

.estudiantes-list {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-height: 250px;
  overflow-y: auto;
  margin: 1rem 0;
}

.estudiante-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem;
  border: 1px solid var(--color-border);
  border-radius: 0.4rem;
  background: #f8fafc;
  cursor: pointer;
}

.estudiante-item input {
  margin: 0;
}

.estudiante-item p {
  font-size: 0.8rem;
  color: var(--color-muted);
  margin: 0;
}

/* Modal */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
}

.modal-card {
  background: var(--color-surface);
  border-radius: 0.75rem;
  max-width: 480px;
  width: 100%;
  padding: 1.75rem;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.modal-subtitle {
  font-size: 0.85rem;
  color: var(--color-muted);
  margin-bottom: 1.25rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

.mb-2 {
  margin-bottom: 0.5rem;
}
</style>