<template>
  <div class="aulas-container">
    <div class="card">
      <div class="aulas-header">
        <div>
          <h1 class="card-title">🏫 Aulas y Cursos</h1>
          <RouterLink :to="{ name: 'MisEvaluaciones' }" class="btn btn-secondary">
            Mis evaluaciones
          </RouterLink>
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

      <!-- Viene desde "Crear evaluación": al terminar el aula se puede volver a la evaluación -->
      <div v-if="vieneDeEvaluacion" class="alert" :class="aulaCreadaId ? 'alert-success' : 'alert-info'" data-testid="volver-evaluacion">
        <span v-if="aulaCreadaId">✓ Aula creada. Ya puedes volver a crear tu evaluación.</span>
        <span v-else>Estás creando un aula para tu evaluación. Cuando termines, vuelve a la evaluación; tu borrador se conserva.</span>
        <RouterLink :to="rutaVolverEvaluacion" class="btn btn-primary btn-sm" data-testid="btn-volver-evaluacion"
                    style="margin-left: 0.75rem; text-decoration: none;">
          ← Volver a la creación de la evaluación
        </RouterLink>
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

            <!-- RF103: Acceso a la página dedicada del aula -->
            <div class="aula-enter-row" style="margin: 0.75rem 0;">
              <router-link :to="`/aulas/${aula.id}`" class="btn btn-primary btn-sm w-100" style="display: flex; justify-content: center; align-items: center; gap: 0.5rem; text-decoration: none; font-weight: 700;">
                🏛️ Gestionar Aula (Página del Aula) ➜
              </router-link>
            </div>

            <div class="aula-peligro-row">
              <button type="button" class="btn-code-action btn-peligro" data-testid="eliminar-aula"
                      title="Eliminar el aula con sus cursos, estudiantes y evaluaciones" @click="abrirModalEliminarAula(aula)">
                🗑️ Eliminar aula
              </button>
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
        <!-- Llegó desde el botón «Unirme al aula» del correo de invitación -->
        <div v-if="codigoDeInvitacion" class="alert alert-info" data-testid="invitacion-recibida">
          Tu profesor te invitó a un aula. Con el código <strong>{{ codigoDeInvitacion }}</strong> ya escrito abajo,
          pulsa <strong>Unirme al Aula</strong> para entrar.
        </div>
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
        <h3 class="modal-title">✉️ Invitar Estudiantes al Aula</h3>
        <p class="modal-subtitle">
          Aula: <strong>{{ aulaSeleccionada?.nombre }}</strong> (Código: <code>{{ aulaSeleccionada?.codigo }}</code>)
        </p>

        <!-- Alerta de error real dentro del modal si falla el envío -->
        <div v-if="errorInvitacionModal" class="alert alert-error mb-3" style="font-size: 0.85rem; padding: 0.65rem 0.85rem; margin-bottom: 1rem; border-left: 4px solid #ef4444;">
          <strong>Error de envío:</strong> {{ errorInvitacionModal }}
        </div>

        <InvitacionMasivaForm
          ref="formInvitacion"
          :aula-id="aulaSeleccionada?.id || ''"
          :profesor-id="currentUserId || ''"
          :profesor-nombre="currentUserName || ''"
          :es-admin="!!isAdmin"
          @resultado="alEnviarInvitaciones"
          @cerrar="modalInvitarAbierto = false"
        />

        <!-- Estudiantes del aula: retirar varios a la vez (RF102) -->
        <div class="estudiantes-aula" data-testid="estudiantes-aula">
          <div class="estudiantes-aula-cabecera">
            <strong>Estudiantes del aula ({{ estudiantesDelAula.length }})</strong>
            <label v-if="estudiantesDelAula.length" class="seleccionar-todos">
              <input type="checkbox" :checked="todosParaRetirar" @change="alternarTodosParaRetirar" data-testid="seleccionar-todos" />
              Seleccionar todos
            </label>
          </div>
          <p v-if="cargandoEstudiantesAula" class="help-text">Cargando estudiantes...</p>
          <p v-else-if="!estudiantesDelAula.length" class="help-text">Aún no hay estudiantes en esta aula.</p>
          <div v-else class="estudiantes-aula-lista">
            <label v-for="e in estudiantesDelAula" :key="e.usuario_id" class="estudiante-fila">
              <input type="checkbox" v-model="seleccionRetiro" :value="e.usuario_id" data-testid="estudiante-retiro" />
              <span>{{ e.nombre }} <small>{{ e.correo }}</small></span>
            </label>
          </div>
          <button v-if="seleccionRetiro.length" type="button" class="btn btn-danger btn-sm" :disabled="retirando"
                  data-testid="retirar-seleccionados" @click="retirarSeleccionados">
            {{ retirando ? 'Retirando...' : 'Retirar seleccionados (' + seleccionRetiro.length + ')' }}
          </button>
          <small class="help-text" style="display: block; margin-top: 0.35rem;">
            El estudiante retirado deja de ver el aula; su cuenta y sus mediciones personales no se borran.
          </small>
        </div

        <!-- Registro de invitaciones recientes del aula -->
        <div class="invitaciones-historial mt-4" style="margin-top: 1.5rem; border-top: 1px solid var(--color-border, #e2e8f0); padding-top: 1rem;">
          <h4 style="font-size: 0.9rem; font-weight: 700; margin-bottom: 0.5rem; color: var(--color-muted);">
            Registro de Envíos en esta Aula
          </h4>
          <div v-if="cargandoInvitaciones" style="font-size: 0.8rem; color: var(--color-muted);">
            Consultando registros...
          </div>
          <div v-else-if="listaInvitaciones.length === 0" style="font-size: 0.8rem; color: var(--color-muted);">
            No hay registros previos de invitaciones para esta aula.
          </div>
          <div v-else class="invitaciones-lista" style="max-height: 140px; overflow-y: auto; font-size: 0.8rem;">
            <div 
              v-for="inv in listaInvitaciones" 
              :key="inv.id" 
              style="display: flex; justify-content: space-between; align-items: center; padding: 0.4rem 0; border-bottom: 1px solid #f1f5f9;"
            >
              <div>
                <strong>{{ inv.correo }}</strong>
                <small style="display: block; color: #94a3b8;">
                  {{ formatearFechaInvitacion(inv.enviada_en || inv.intentado_en) }}
                  <span v-if="inv.error_detalle" style="color: #ef4444; display: block;">{{ inv.error_detalle }}</span>
                </small>
              </div>
              <span 
                :class="inv.estado === 'fallido' ? 'badge badge-desactivado' : 'badge badge-profesor'" 
                style="font-size: 0.72rem;"
              >
                {{ inv.estado === 'fallido' ? '❌ Fallido' : '✓ Enviado' }}
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- MODAL ELIMINAR AULA -->
    <div v-if="aulaAEliminar" class="modal-backdrop" @click.self="cerrarModalEliminarAula">
      <div class="modal-card" data-testid="modal-eliminar-aula">
        <h3 class="modal-title">🗑️ Eliminar aula</h3>
        <div class="alert alert-error" style="font-size: 0.85rem;">
          Vas a eliminar <strong>{{ aulaAEliminar.nombre }}</strong> de forma definitiva, con sus cursos, invitaciones,
          <strong>{{ resumenEliminar.estudiantes }}</strong> estudiante(s) y <strong>{{ resumenEliminar.evaluaciones }}</strong>
          evaluación(es) con sus resultados. Esto no se puede deshacer. Las mediciones personales de los estudiantes no se borran.
        </div>
        <div class="form-group">
          <label class="form-label" for="confirmar-nombre-aula">Para confirmar, escribe el nombre del aula</label>
          <input id="confirmar-nombre-aula" v-model="confirmacionNombre" class="form-input" type="text"
                 :placeholder="aulaAEliminar.nombre" autocomplete="off" data-testid="confirmar-nombre-aula" />
        </div>
        <div class="modal-actions">
          <button type="button" class="btn btn-secondary" :disabled="eliminando" @click="cerrarModalEliminarAula">Cancelar</button>
          <button type="button" class="btn btn-danger" data-testid="confirmar-eliminar-aula"
                  :disabled="eliminando || confirmacionNombre.trim() !== aulaAEliminar.nombre" @click="confirmarEliminarAula">
            {{ eliminando ? 'Eliminando...' : 'Eliminar aula definitivamente' }}
          </button>
        </div>
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
import { ref, computed, onMounted } from 'vue'
import { useRoute } from 'vue-router'
import InvitacionMasivaForm from '../components/InvitacionMasivaForm.vue'
import { useAuth } from '../composables/useAuth'
import { 
  obtenerAulas, 
  crearAula, 
  generarCodigoAula, 
  unirseAulaPorCodigo,
  alternarEstadoCodigoAula,
  regenerarCodigoAulaDocente,
  obtenerInvitacionesAula,
  obtenerCursosAula, 
  obtenerEstudiantesAula, 
  crearCurso, 
  renombrarCurso, 
  eliminarCurso,
  actualizarEstudiantesCurso,
  retirarEstudiantesAula,
  eliminarAula,
  obtenerEvaluacionesAula
} from '../services/aulasService'

const { currentUserId, currentUserName, currentUserEmail, isProfesor, isAdmin, tienePermisoProfesor } = useAuth()

// Flujo "crear aula desde la creación de una evaluación": vuelve a /evaluaciones con el aula nueva elegida
const route = useRoute()
const vieneDeEvaluacion = computed(() => route.query.volver === 'evaluaciones')
const aulaCreadaId = ref('')
const rutaVolverEvaluacion = computed(() => ({
  name: 'Evaluaciones',
  query: { borrador: '1', ...(aulaCreadaId.value ? { aula: aulaCreadaId.value } : {}) }
}))

const listaAulas = ref([])
const cursosPorAula = ref({})
const cargando = ref(false)
const guardando = ref(false)
const uniendoAula = ref(false)
const codigoIngreso = ref('')
// Código que trae el enlace del correo de invitación (/aulas?unirse=CODIGO)
const codigoDeInvitacion = ref('')
const feedbackMensaje = ref('')
const feedbackExito = ref(true)

// Modal Crear Aula (RF99)
const modalCrearAulaAbierto = ref(false)
const codigoPrevisualizado = ref('')
const formAula = ref({ nombre: '', descripcion: '' })

// Modal Invitar por Correo (RF100)
const modalInvitarAbierto = ref(false)
const formInvitacion = ref(null)
// Estudiantes del aula elegida (para retirar varios a la vez)
const estudiantesDelAula = ref([])
const cargandoEstudiantesAula = ref(false)
const seleccionRetiro = ref([])
const retirando = ref(false)
const todosParaRetirar = computed(() =>
  estudiantesDelAula.value.length > 0 && seleccionRetiro.value.length === estudiantesDelAula.value.length)
// Eliminar aula
const aulaAEliminar = ref(null)
const confirmacionNombre = ref('')
const resumenEliminar = ref({ estudiantes: 0, evaluaciones: 0 })
const eliminando = ref(false)
const errorInvitacionModal = ref('')
const listaInvitaciones = ref([])
const cargandoInvitaciones = ref(false)

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

// RF100: Enviar invitación real por correo (Gmail)
const formatearFechaInvitacion = (fecha) => {
  if (!fecha) return ''
  try {
    const d = new Date(fecha)
    return isNaN(d.getTime()) ? '' : d.toLocaleString()
  } catch (_) {
    return ''
  }
}

const cargarHistorialInvitaciones = async (aulaId) => {
  if (!aulaId) return
  cargandoInvitaciones.value = true
  try {
    const res = await obtenerInvitacionesAula(aulaId)
    listaInvitaciones.value = res.data || []
  } catch (_) {
    listaInvitaciones.value = []
  } finally {
    cargandoInvitaciones.value = false
  }
}

const abrirModalInvitar = async (aula) => {
  aulaSeleccionada.value = aula
  formInvitacion.value?.limpiar?.()
  seleccionRetiro.value = []
  errorInvitacionModal.value = ''
  modalInvitarAbierto.value = true
  await Promise.all([cargarHistorialInvitaciones(aula.id), cargarEstudiantesAula(aula.id)])
}

// El formulario de invitaciones avisa cuando termina un envío (uno o varios correos)
const alEnviarInvitaciones = async (res) => {
  feedbackExito.value = !!res.success
  feedbackMensaje.value = res.success ? res.message : res.error
  errorInvitacionModal.value = res.success ? '' : (res.error || '')
  if (res.success && res.todoEnviado) modalInvitarAbierto.value = false
  await cargarHistorialInvitaciones(aulaSeleccionada.value.id)
}

// RF102: retirar varios estudiantes del aula a la vez
const cargarEstudiantesAula = async (aulaId) => {
  cargandoEstudiantesAula.value = true
  try {
    const res = await obtenerEstudiantesAula(aulaId)
    estudiantesDelAula.value = res.data || []
  } finally {
    cargandoEstudiantesAula.value = false
  }
}

const alternarTodosParaRetirar = () => {
  seleccionRetiro.value = todosParaRetirar.value ? [] : estudiantesDelAula.value.map((e) => e.usuario_id)
}

const retirarSeleccionados = async () => {
  const ids = [...seleccionRetiro.value]
  if (!ids.length) return
  if (!confirm(`¿Retirar a ${ids.length} estudiante(s) del aula ${aulaSeleccionada.value.nombre}? Dejarán de ver el aula y sus evaluaciones.`)) return
  retirando.value = true
  const res = await retirarEstudiantesAula({
    aulaId: aulaSeleccionada.value.id,
    estudiantesIds: ids,
    profesorId: currentUserId.value,
    esAdmin: isAdmin.value
  })
  retirando.value = false
  feedbackExito.value = !!res.success
  feedbackMensaje.value = res.success ? res.message : res.error
  seleccionRetiro.value = []
  await cargarEstudiantesAula(aulaSeleccionada.value.id)
}

// Eliminar un aula completa (pide escribir su nombre)
const abrirModalEliminarAula = async (aula) => {
  aulaAEliminar.value = aula
  confirmacionNombre.value = ''
  resumenEliminar.value = { estudiantes: 0, evaluaciones: 0 }
  const [est, evs] = await Promise.all([obtenerEstudiantesAula(aula.id), obtenerEvaluacionesAula(aula.id).catch(() => ({ data: [] }))])
  resumenEliminar.value = { estudiantes: (est.data || []).length, evaluaciones: (evs.data || []).length }
}

const cerrarModalEliminarAula = () => {
  if (eliminando.value) return
  aulaAEliminar.value = null
  confirmacionNombre.value = ''
}

const confirmarEliminarAula = async () => {
  const aula = aulaAEliminar.value
  if (!aula || confirmacionNombre.value.trim() !== aula.nombre) return
  eliminando.value = true
  const res = await eliminarAula({ aulaId: aula.id, profesorId: currentUserId.value, esAdmin: isAdmin.value })
  eliminando.value = false
  feedbackExito.value = !!res.success
  feedbackMensaje.value = res.success ? `Aula «${aula.nombre}» eliminada.` : res.error
  if (res.success) {
    aulaAEliminar.value = null
    confirmacionNombre.value = ''
    await cargarDatos()
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
    aulaCreadaId.value = res.data.id || ''
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

onMounted(async () => {
  const codigoEnlace = String(route.query.unirse || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8)
  if (codigoEnlace && !isProfesor.value) {
    codigoDeInvitacion.value = codigoEnlace
    codigoIngreso.value = codigoEnlace
  }
  await cargarDatos()
  // Llegó desde "Crear aula" de la evaluación: abre directo el formulario del aula
  if (route.query.crear === '1' && isProfesor.value && tienePermisoProfesor('crear_aulas')) {
    abrirModalCrearAula()
  }
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

.aula-peligro-row { display: flex; justify-content: flex-end; margin-bottom: 0.5rem; }
.btn-peligro { color: #b91c1c; border-color: #fecaca; }
.btn-peligro:hover { background: #fef2f2; }
.estudiantes-aula { margin-top: 1.25rem; border-top: 1px solid var(--color-border, #e2e8f0); padding-top: 1rem; }
.estudiantes-aula-cabecera { display: flex; justify-content: space-between; align-items: center; margin-bottom: 0.5rem; gap: 0.5rem; flex-wrap: wrap; }
.seleccionar-todos { display: inline-flex; gap: 0.35rem; align-items: center; font-size: 0.85rem; }
.estudiantes-aula-lista { max-height: 160px; overflow-y: auto; margin-bottom: 0.5rem; }
.estudiante-fila { display: flex; gap: 0.5rem; align-items: center; padding: 0.3rem 0; border-bottom: 1px solid #f1f5f9; font-size: 0.85rem; cursor: pointer; }
.estudiante-fila small { color: #94a3b8; margin-left: 0.35rem; }
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