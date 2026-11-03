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
        <h2 class="section-title">Aulas que Administras</h2>
        
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
              <span class="badge" :class="aula.codigo_activo ? 'badge-profesor' : 'badge-desactivado'">
                {{ aula.codigo_activo ? '🟢 Código Activo' : '🔴 Código Desactivado' }}
              </span>
            </div>

            <p class="aula-desc">{{ aula.descripcion || 'Sin descripción adicional.' }}</p>

            <div v-if="isAdmin" class="profesor-tag">
              Docente: <strong>{{ aula.profesor_nombre || 'Docente asignado' }}</strong>
            </div>

            <!-- Código único del aula y Controles de Gestión RF100 -->
            <div class="codigo-box">
              <div class="codigo-top-row">
                <span class="codigo-label">Código de acceso:</span>
                <div class="codigo-display">
                  <code :class="{ 'codigo-tachado': !aula.codigo_activo }">{{ aula.codigo }}</code>
                  <button @click="copiarCodigo(aula.codigo)" class="btn-copy" title="Copiar código">
                    📋 Copiar
                  </button>
                </div>
              </div>

              <!-- Botones de administración de código (RF100) -->
              <div class="codigo-actions-row">
                <button 
                  @click="cambiarEstadoCodigo(aula)" 
                  class="btn-code-action"
                  :class="aula.codigo_activo ? 'btn-warn-action' : 'btn-success-action'"
                >
                  {{ aula.codigo_activo ? 'Desactivar Código' : 'Activar Código' }}
                </button>
                <button 
                  @click="confirmarRegenerarCodigo(aula)" 
                  class="btn-code-action"
                  title="Generar un código nuevo e invalidar el anterior"
                >
                  🔄 Regenerar
                </button>
                <button 
                  @click="abrirModalInvitar(aula)" 
                  class="btn-code-action btn-invite"
                >
                  ✉️ Invitar Estudiante
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

      <!-- VISTA ESTUDIANTE (RF100) -->
      <div v-else class="section-block">
        <div class="unirse-card card mb-4">
          <h2 class="section-title">Unirse a un Aula Virtual</h2>
          <p class="section-desc">
            Ingresa el código alfanumérico proporcionado por tu profesor o recibido en tu correo institucional.
          </p>
          <div class="join-box">
            <input 
              v-model="codigoIngreso" 
              type="text" 
              class="form-input" 
              placeholder="Ej: K8M3X9P2" 
              style="max-width: 280px; text-transform: uppercase;"
              maxlength="8"
              @keyup.enter="unirseConCodigo"
            />
            <button 
              @click="unirseConCodigo" 
              class="btn btn-primary"
              :disabled="uniendoAula || !codigoIngreso.trim()"
            >
              {{ uniendoAula ? 'Uniéndome...' : 'Unirme al Aula' }}
            </button>
          </div>
        </div>

        <h2 class="section-title mt-4">Mis Aulas Inscritas</h2>
        <div v-if="listaAulas.length === 0" class="empty-state">
          Aún no estás inscrito en ninguna aula. Pide el código a tu profesor para ingresar.
        </div>
        <div v-else class="aulas-grid">
          <div v-for="aula in listaAulas" :key="aula.id" class="aula-card card">
            <div class="aula-header">
              <h3 class="aula-title">{{ aula.nombre }}</h3>
              <span class="badge badge-profesor">Inscrito</span>
            </div>
            <p class="aula-desc">{{ aula.descripcion || 'Sin descripción adicional.' }}</p>
            <div class="aula-footer">
              <span class="profesor-tag">Profesor: <strong>{{ aula.profesor_nombre || 'Docente' }}</strong></span>
            </div>
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

    <!-- MODAL INVITAR ESTUDIANTE POR CORREO (RF100) -->
    <div v-if="modalInvitarAbierto" class="modal-backdrop" @click.self="modalInvitarAbierto = false">
      <div class="modal-card">
        <h3 class="modal-title">✉️ Invitar Estudiante al Aula</h3>
        <p class="modal-subtitle">
          Aula: <strong>{{ aulaSeleccionada?.nombre }}</strong> (Código: <code>{{ aulaSeleccionada?.codigo }}</code>)
        </p>

        <form @submit.prevent="enviarInvitacion">
          <div class="form-group">
            <label class="form-label">Correo Institucional del Estudiante (@alu.unach.cl) *</label>
            <input 
              v-model="correoInvitacion" 
              type="email" 
              class="form-input" 
              placeholder="estudiante@alu.unach.cl" 
              required 
            />
            <small class="help-text">Se enviará el código de acceso directamente a la casilla del estudiante.</small>
          </div>

          <div class="modal-actions">
            <button type="button" @click="modalInvitarAbierto = false" class="btn btn-secondary">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="enviandoInvitacion">
              {{ enviandoInvitacion ? 'Enviando...' : 'Enviar Invitación' }}
            </button>
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
  unirseAulaPorCodigo,
  alternarEstadoCodigoAula,
  regenerarCodigoAulaDocente,
  enviarInvitacionCorreo,
  obtenerCursosAula, 
  obtenerEstudiantesAula, 
  crearCurso, 
  renombrarCurso, 
  eliminarCurso, 
  actualizarEstudiantesCurso 
} from '../services/aulasService'

const { currentUserId, currentUserName, currentUserEmail, isProfesor, isAdmin, tienePermisoProfesor } = useAuth()

const listaAulas = ref([])
const cursosPorAula = ref({})
const cargando = ref(false)
const guardando = ref(false)
const uniendoAula = ref(false)
const codigoIngreso = ref('')
const feedbackMensaje = ref('')
const feedbackExito = ref(true)

// Modal Crear Aula (RF99)
const modalCrearAulaAbierto = ref(false)
const codigoPrevisualizado = ref('')
const formAula = ref({ nombre: '', descripcion: '' })

// Modal Invitar por Correo (RF100)
const modalInvitarAbierto = ref(false)
const correoInvitacion = ref('')
const enviandoInvitacion = ref(false)

// Modales Cursos (RF101)
const modalCursoAbierto = ref(false)
const modoCurso = ref('crear')
const aulaSeleccionada = ref(null)
const cursoSeleccionado = ref(null)
const nombreCursoInput = ref('')

const modalEstudiantesAbierto = ref(false)
const estudiantesAula = ref([])
const estudiantesSeleccionados = ref([])

const cargarDatos = async () => {
  cargando.value = true
  const res = await obtenerAulas({
    usuarioId: currentUserId.value,
    usuarioCorreo: currentUserEmail.value,
    esAdmin: isAdmin.value,
    esProfesor: isProfesor.value
  })
  cargando.value = false

  if (res.success) {
    listaAulas.value = res.data
    if (isProfesor.value) {
      for (const aula of res.data) {
        await cargarCursosDeAula(aula.id)
      }
    }
  }
}

const cargarCursosDeAula = async (aulaId) => {
  const res = await obtenerCursosAula(aulaId)
  if (res.success) {
    cursosPorAula.value[aulaId] = res.data
  }
}

const getCursos = (aulaId) => {
  return cursosPorAula.value[aulaId] || []
}

// RF100: El estudiante se une con el código ingresado a mano
const unirseConCodigo = async () => {
  if (!codigoIngreso.value.trim()) return
  uniendoAula.value = true
  feedbackMensaje.value = ''

  const res = await unirseAulaPorCodigo({
    codigo: codigoIngreso.value,
    usuarioId: currentUserId.value,
    usuarioNombre: currentUserName.value,
    usuarioCorreo: currentUserEmail.value
  })

  uniendoAula.value = false

  if (res.success) {
    feedbackExito.value = true
    feedbackMensaje.value = res.message
    codigoIngreso.value = ''
    await cargarDatos()
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

// RF100: El profesor desactiva o activa el código
const cambiarEstadoCodigo = async (aula) => {
  const res = await alternarEstadoCodigoAula({
    aulaId: aula.id,
    profesorId: currentUserId.value,
    esAdmin: isAdmin.value
  })

  if (res.success) {
    aula.codigo_activo = res.codigo_activo
    feedbackExito.value = true
    feedbackMensaje.value = res.message
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

// RF100: El profesor regenera el código
const confirmarRegenerarCodigo = async (aula) => {
  if (!confirm(`¿Regenerar el código del aula "${aula.nombre}"? El código anterior dejará de servir inmediatamente.`)) {
    return
  }

  const res = await regenerarCodigoAulaDocente({
    aulaId: aula.id,
    profesorId: currentUserId.value,
    esAdmin: isAdmin.value
  })

  if (res.success) {
    aula.codigo = res.nuevoCodigo
    aula.codigo_activo = true
    feedbackExito.value = true
    feedbackMensaje.value = res.message
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

// RF100: Enviar invitación por correo
const abrirModalInvitar = (aula) => {
  aulaSeleccionada.value = aula
  correoInvitacion.value = ''
  modalInvitarAbierto.value = true
}

const enviarInvitacion = async () => {
  if (!correoInvitacion.value) return
  enviandoInvitacion.value = true
  const res = await enviarInvitacionCorreo({
    aulaId: aulaSeleccionada.value.id,
    correoEstudiante: correoInvitacion.value,
    profesorId: currentUserId.value,
    esAdmin: isAdmin.value
  })
  enviandoInvitacion.value = false

  if (res.success) {
    feedbackExito.value = true
    feedbackMensaje.value = res.message
    modalInvitarAbierto.value = false
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

// RF99: Crear Aula
const abrirModalCrearAula = () => {
  codigoPrevisualizado.value = generarCodigoAula()
  formAula.value = { nombre: '', descripcion: '' }
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
    modalCrearAulaAbierto.value = false
    feedbackExito.value = true
    feedbackMensaje.value = `Aula creada exitosamente con código: ${res.data.codigo}`
    await cargarDatos()
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

// RF101: Cursos
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
  guardando.value = true
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
    modalCursoAbierto.value = false
    feedbackExito.value = true
    feedbackMensaje.value = modoCurso.value === 'crear' ? 'Curso creado exitosamente.' : 'Curso renombrado exitosamente.'
    await cargarCursosDeAula(aulaSeleccionada.value.id)
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

const confirmarEliminarCurso = async (aula, curso) => {
  if (!confirm(`¿Eliminar el curso "${curso.nombre}"? Los estudiantes permanecerán en el aula.`)) return

  const res = await eliminarCurso({
    cursoId: curso.id,
    aulaId: aula.id,
    profesorId: currentUserId.value,
    esAdmin: isAdmin.value
  })

  if (res.success) {
    feedbackExito.value = true
    feedbackMensaje.value = `El curso "${curso.nombre}" fue eliminado. Los estudiantes siguen matriculados en el aula.`
    await cargarCursosDeAula(aula.id)
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

const abrirModalEstudiantes = async (aula, curso) => {
  aulaSeleccionada.value = aula
  cursoSeleccionado.value = curso
  modalEstudiantesAbierto.value = true
  estudiantesSeleccionados.value = [...(curso.estudiantes_ids || [])]

  const res = await obtenerEstudiantesAula(aula.id)
  if (res.success) {
    estudiantesAula.value = res.data
  }
}

const guardarAsignacionEstudiantes = async () => {
  guardando.value = true
  const res = await actualizarEstudiantesCurso({
    cursoId: cursoSeleccionado.value.id,
    aulaId: aulaSeleccionada.value.id,
    estudiantesIds: estudiantesSeleccionados.value
  })
  guardando.value = false

  if (res.success) {
    modalEstudiantesAbierto.value = false
    feedbackExito.value = true
    feedbackMensaje.value = `Asignación guardada (${estudiantesSeleccionados.value.length} estudiantes en ${cursoSeleccionado.value.nombre}).`
    await cargarCursosDeAula(aulaSeleccionada.value.id)
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

const copiarCodigo = (codigo) => {
  navigator.clipboard.writeText(codigo)
  feedbackExito.value = true
  feedbackMensaje.value = `Código ${codigo} copiado al portapapeles.`
  setTimeout(() => { feedbackMensaje.value = '' }, 3000)
}

onMounted(() => {
  cargarDatos()
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
}

.header-desc {
  color: var(--color-muted);
  font-size: 0.95rem;
}

.section-block {
  margin-top: 1rem;
}

.aulas-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 1.25rem;
  margin-top: 1rem;
}

.aula-card {
  display: flex;
  flex-direction: column;
  padding: 1.25rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: 0.5rem;
}

.aula-title {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
}

.aula-desc {
  font-size: 0.875rem;
  color: var(--color-muted);
  margin: 0.5rem 0;
}

.profesor-tag {
  font-size: 0.8rem;
  color: var(--color-muted);
  margin-bottom: 0.75rem;
}

.badge-desactivado {
  background: #fee2e2;
  color: #991b1b;
  font-size: 0.75rem;
  padding: 0.2rem 0.5rem;
  border-radius: 9999px;
  font-weight: 600;
}

/* Código del aula y acciones RF100 */
.codigo-box {
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  padding: 0.85rem;
  border-radius: 0.5rem;
  margin: 0.5rem 0 1rem 0;
}

.codigo-top-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.codigo-label {
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-muted);
}

.codigo-display {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.codigo-display code {
  font-size: 1.1rem;
  font-weight: 700;
  letter-spacing: 0.1em;
  background: #e2e8f0;
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
}

.codigo-tachado {
  text-decoration: line-through;
  opacity: 0.5;
}

.codigo-actions-row {
  display: flex;
  gap: 0.35rem;
  flex-wrap: wrap;
  margin-top: 0.35rem;
}

.btn-code-action {
  font-size: 0.75rem;
  padding: 0.3rem 0.5rem;
  border-radius: 0.25rem;
  border: 1px solid #cbd5e1;
  background: white;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-warn-action {
  color: #b45309;
}

.btn-success-action {
  color: #15803d;
  font-weight: 600;
}

.btn-invite {
  color: var(--color-primary);
  font-weight: 600;
}

.btn-copy {
  background: none;
  border: none;
  color: var(--color-primary);
  font-size: 0.8rem;
  cursor: pointer;
  font-weight: 600;
}

/* Cursos RF101 */
.cursos-section {
  border-top: 1px solid var(--color-border);
  padding-top: 0.75rem;
  margin-top: 0.5rem;
  flex: 1;
}

.cursos-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
  font-size: 0.85rem;
}

.btn-mini {
  font-size: 0.8rem;
  font-weight: 600;
}

.cursos-vacio {
  font-size: 0.8rem;
  color: var(--color-muted);
  font-style: italic;
  padding: 0.25rem 0;
}

.cursos-list {
  list-style: none;
  padding: 0;
  margin: 0;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.curso-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  background: #f8fafc;
  padding: 0.4rem 0.6rem;
  border-radius: 0.35rem;
  border: 1px solid #f1f5f9;
}

.curso-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.curso-nombre {
  font-size: 0.85rem;
  font-weight: 600;
}

.badge-estudiantes {
  background: #e0f2fe;
  color: #0369a1;
  font-size: 0.75rem;
}

.curso-actions {
  display: flex;
  gap: 0.25rem;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  font-size: 0.85rem;
  padding: 0.15rem 0.35rem;
  border-radius: 0.25rem;
}

.aula-footer {
  margin-top: 1rem;
  border-top: 1px solid var(--color-border);
  padding-top: 0.5rem;
}

.cupo-text {
  font-size: 0.75rem;
  color: var(--color-muted);
}

/* Vista Estudiante RF100 */
.unirse-card {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  padding: 1.25rem;
}

.join-box {
  display: flex;
  gap: 0.75rem;
  margin-top: 1rem;
}

/* Modales */
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
  font-size: 0.875rem;
  color: var(--color-muted);
  margin-bottom: 1rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
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
  background: #f8fafc;
  border-radius: 0.35rem;
  border: 1px solid var(--color-border);
  cursor: pointer;
}

.estudiante-item p {
  margin: 0;
  font-size: 0.8rem;
  color: var(--color-muted);
}
</style>