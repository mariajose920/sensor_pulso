<template>
  <div class="aulas-container">
    <div class="card">
      <div class="aulas-header">
        <div>
          <h1 class="card-title">🏫 Aulas y Cursos</h1>
          <p class="header-desc">
            Espacio académico interactivo para cursos y evaluaciones prácticas de pulso cardíaco.
          </p>
        </div>
        
        <!-- Botón para crear aula (solo visible para profesores/admin) -->
        <button 
          v-if="isProfesor"
          @click="abrirModalCrear"
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

      <!-- AVISO: Profesor sin permiso otorgado (RF98) -->
      <div v-if="isProfesor && !tienePermisoProfesor('crear_aulas')" class="alert alert-warning">
        ⚠️ Aún no tienes habilitado el permiso para crear aulas. Solicita al administrador que te active este permiso en el panel.
      </div>

      <!-- VISTA PROFESOR / ADMIN: Mis Aulas Creadas -->
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

            <!-- Código único del aula (visible para el docente) -->
            <div class="codigo-box">
              <span class="codigo-label">Código de acceso:</span>
              <div class="codigo-display">
                <code>{{ aula.codigo }}</code>
                <button @click="copiarCodigo(aula.codigo)" class="btn-copy" title="Copiar código">
                  📋 Copiar
                </button>
              </div>
            </div>

            <div class="aula-footer">
              <span class="cupo-text">Capacidad: hasta {{ aula.max_estudiantes || 100 }} estudiantes</span>
            </div>
          </div>
        </div>
      </div>

      <!-- VISTA ESTUDIANTE: Mis Aulas Inscritas -->
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

    <!-- MODAL PARA CREAR NUEVA AULA (RF99) -->
    <div v-if="modalCrearAbierto" class="modal-backdrop" @click.self="cerrarModalCrear">
      <div class="modal-card">
        <h3 class="modal-title">Crear Nueva Aula Virtual</h3>
        <p class="modal-subtitle">
          El sistema generará automáticamente un código único y legible para compartir con los estudiantes.
        </p>

        <form @submit.prevent="guardarNuevaAula">
          <div class="form-group">
            <label class="form-label" for="nombreAula">Nombre del Aula *</label>
            <input 
              id="nombreAula"
              v-model="formAula.nombre" 
              type="text" 
              class="form-input" 
              placeholder="Ej: Fisiología Humana 2026" 
              required
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="descAula">Descripción (Opcional)</label>
            <textarea 
              id="descAula"
              v-model="formAula.descripcion" 
              class="form-input" 
              rows="3"
              placeholder="Ej: Grupo práctico de medición con sensor ESP32."
            ></textarea>
          </div>

          <div class="form-group">
            <label class="form-label">Código generado para el aula</label>
            <div class="codigo-preview">
              <code>{{ codigoPrevisualizado }}</code>
              <button type="button" @click="regenerarPreview" class="btn-link" style="font-size: 0.85rem;">
                🔄 Generar otro
              </button>
            </div>
            <small class="help-text">Código único de 8 caracteres alfanuméricos fácil de leer.</small>
          </div>

          <div class="modal-actions">
            <button type="button" @click="cerrarModalCrear" class="btn btn-secondary" :disabled="creandoAula">
              Cancelar
            </button>
            <button type="submit" class="btn btn-primary" :disabled="creandoAula">
              {{ creandoAula ? 'Creando Aula...' : 'Crear Aula' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useAuth } from '../composables/useAuth'
import { obtenerAulas, crearAula, generarCodigoAula } from '../services/aulasService'

const { currentUserId, currentUserName, isProfesor, isAdmin, tienePermisoProfesor } = useAuth()

const listaAulas = ref([])
const cargando = ref(false)
const codigoIngreso = ref('')
const feedbackMensaje = ref('')
const feedbackExito = ref(true)

// Modal de creación de aula
const modalCrearAbierto = ref(false)
const creandoAula = ref(false)
const codigoPrevisualizado = ref('')
const formAula = ref({
  nombre: '',
  descripcion: ''
})

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
  }
}

const abrirModalCrear = () => {
  formAula.value = { nombre: '', descripcion: '' }
  codigoPrevisualizado.value = generarCodigoAula()
  modalCrearAbierto.value = true
}

const cerrarModalCrear = () => {
  modalCrearAbierto.value = false
}

const regenerarPreview = () => {
  codigoPrevisualizado.value = generarCodigoAula()
}

const guardarNuevaAula = async () => {
  creandoAula.value = true
  feedbackMensaje.value = ''

  const res = await crearAula({
    nombre: formAula.value.nombre,
    descripcion: formAula.value.descripcion,
    profesorId: currentUserId.value,
    profesorNombre: currentUserName.value,
    tienePermiso: tienePermisoProfesor('crear_aulas')
  })

  creandoAula.value = false

  if (res.success) {
    feedbackExito.value = true
    feedbackMensaje.value = `¡Aula "${res.data.nombre}" creada con éxito! Código: ${res.data.codigo}`
    cerrarModalCrear()
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
  grid-template-columns: repeat(auto-fill, minmax(290px, 1fr));
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
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0;
}

.aula-desc {
  font-size: 0.875rem;
  color: var(--color-muted);
  flex: 1;
  margin-bottom: 1rem;
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
  padding: 0.6rem 0.75rem;
  margin-bottom: 0.75rem;
}

.codigo-label {
  display: block;
  font-size: 0.75rem;
  color: var(--color-muted);
  margin-bottom: 0.25rem;
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
</style>