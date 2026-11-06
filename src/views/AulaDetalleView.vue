<template>
  <div class="aula-detalle-container">
    <!-- Estado de carga inicial -->
    <div v-if="cargando" class="loading-state">
      <div class="spinner"></div>
      <p>Cargando información del aula...</p>
    </div>

    <!-- Error de permisos / Acceso no autorizado (Criterio RF103) -->
    <div v-else-if="errorAcceso" class="access-denied-card card">
      <div class="access-denied-icon">🚫</div>
      <h2 class="access-denied-title">Acceso Restringido</h2>
      <p class="access-denied-desc">{{ errorAcceso }}</p>
      <div class="access-denied-actions">
        <router-link to="/aulas" class="btn btn-primary">
          ⬅ Volver a Mis Aulas
        </router-link>
      </div>
    </div>

    <!-- Contenido del Aula si está autorizado -->
    <div v-else-if="aula" class="aula-content">
      <!-- Barra superior / Breadcrumb -->
      <div class="top-nav-bar">
        <router-link to="/aulas" class="back-link">
          ⬅ Volver al listado de Aulas
        </router-link>
      </div>

      <!-- Cabecera del Aula -->
      <div class="aula-hero card mb-4">
        <div class="hero-header">
          <div>
            <div class="title-with-badge">
              <h1 class="aula-hero-title">{{ aula.nombre }}</h1>
              <span class="badge" :class="aula.codigo_activo ? 'badge-profesor' : 'badge-desactivado'">
                {{ aula.codigo_activo ? '🟢 Código Activo' : '🔴 Código Desactivado' }}
              </span>
            </div>
            <p class="aula-hero-desc">{{ aula.descripcion || 'Sin descripción adicional para este espacio académico.' }}</p>
            <div class="aula-hero-meta">
              <span>Docente: <strong>{{ aula.profesor_nombre || 'Docente Titular' }}</strong></span>
              <span class="meta-separator">•</span>
              <span>Capacidad: <strong>{{ aula.max_estudiantes || 100 }} estudiantes</strong></span>
            </div>
          </div>

          <!-- Caja del Código de Acceso RF100 -->
          <div class="codigo-hero-card">
            <span class="codigo-hero-label">Código de Aula:</span>
            <div class="codigo-hero-display">
              <code :class="{ 'codigo-tachado': !aula.codigo_activo }">{{ aula.codigo }}</code>
              <button @click="copiarCodigo(aula.codigo)" class="btn-copy" title="Copiar código al portapapeles">
                {{ copiado ? '✓ Copiado' : '📋 Copiar' }}
              </button>
            </div>
            <div class="codigo-hero-actions">
              <button 
                @click="alternarEstadoCodigo" 
                class="btn-code-action"
                :class="aula.codigo_activo ? 'btn-warn-action' : 'btn-success-action'"
              >
                {{ aula.codigo_activo ? 'Desactivar' : 'Activar' }}
              </button>
              <button 
                @click="confirmarRegenerarCodigo" 
                class="btn-code-action"
                title="Generar un nuevo código para esta aula"
              >
                🔄 Regenerar
              </button>
              <button 
                @click="abrirModalInvitar" 
                class="btn-code-action btn-invite"
              >
                ✉️ Invitar
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- Alertas de retroalimentación -->
      <div v-if="feedbackMensaje" class="alert mb-4" :class="feedbackExito ? 'alert-success' : 'alert-error'">
        {{ feedbackMensaje }}
      </div>

      <!-- BARRA DE PESTAÑAS (RF103: Estudiantes, Cursos y Evaluaciones) -->
      <div class="tabs-nav mb-4">
        <button 
          @click="tabActiva = 'estudiantes'" 
          class="tab-btn" 
          :class="{ 'tab-btn-active': tabActiva === 'estudiantes' }"
        >
          👥 Estudiantes <span class="tab-badge">{{ estudiantes.length }}</span>
        </button>

        <button 
          @click="tabActiva = 'cursos'" 
          class="tab-btn" 
          :class="{ 'tab-btn-active': tabActiva === 'cursos' }"
        >
          📚 Cursos (Secciones) <span class="tab-badge">{{ cursos.length }}</span>
        </button>

        <button 
          @click="tabActiva = 'evaluaciones'" 
          class="tab-btn" 
          :class="{ 'tab-btn-active': tabActiva === 'evaluaciones' }"
        >
          📝 Evaluaciones <span class="tab-badge">{{ evaluaciones.length }}</span>
        </button>
      </div>

      <!-- ======================================================== -->
      <!-- PESTAÑA 1: ESTUDIANTES                                   -->
      <!-- ======================================================== -->
      <div v-if="tabActiva === 'estudiantes'" class="tab-panel">
        <div class="panel-header mb-3">
          <div>
            <h2 class="panel-title">Estudiantes Inscritos</h2>
            <p class="panel-desc">Alumnos que forman parte de esta aula y tienen acceso a las mediciones y actividades.</p>
          </div>
          <button @click="abrirModalInvitar" class="btn btn-primary btn-sm">
            ✉️ Invitar Estudiante por Correo
          </button>
        </div>

        <div v-if="estudiantes.length === 0" class="empty-state card">
          <p>Aún no hay estudiantes inscritos en esta aula.</p>
          <small>Comparte el código <strong>{{ aula.codigo }}</strong> o envíales una invitación por correo.</small>
          <div class="mt-3">
            <button @click="abrirModalInvitar" class="btn btn-secondary btn-sm">
              Enviar Primera Invitación
            </button>
          </div>
        </div>

        <div v-else class="table-responsive card">
          <table class="data-table">
            <thead>
              <tr>
                <th>Nombre del Estudiante</th>
                <th>Correo Institucional</th>
                <th>Secciones Asignadas</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="est in estudiantes" :key="est.usuario_id">
                <td>
                  <strong>{{ est.nombre }}</strong>
                </td>
                <td>
                  <code class="email-code">{{ est.correo }}</code>
                </td>
                <td>
                  <span 
                    v-for="seccion in obtenerSeccionesEstudiante(est.usuario_id)" 
                    :key="seccion.id"
                    class="badge badge-section mr-1"
                  >
                    {{ seccion.nombre }}
                  </span>
                  <span v-if="obtenerSeccionesEstudiante(est.usuario_id).length === 0" class="text-muted-small">
                    Sin sección
                  </span>
                </td>
                <td>
                  <span class="badge badge-profesor">Activo</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- PESTAÑA 2: CURSOS (SECCIONES)                           -->
      <!-- ======================================================== -->
      <div v-if="tabActiva === 'cursos'" class="tab-panel">
        <div class="panel-header mb-3">
          <div>
            <h2 class="panel-title">Cursos y Secciones del Aula</h2>
            <p class="panel-desc">Subgrupos para organizar a los estudiantes en talleres, turnos o grupos de práctica.</p>
          </div>
          <button @click="abrirModalNuevoCurso" class="btn btn-primary btn-sm">
            + Nueva Sección
          </button>
        </div>

        <div v-if="cursos.length === 0" class="empty-state card">
          <p>No hay secciones creadas en esta aula.</p>
          <small>Crea una sección para agrupar estudiantes según turnos o prácticas con el sensor.</small>
          <div class="mt-3">
            <button @click="abrirModalNuevoCurso" class="btn btn-primary btn-sm">
              + Crear Primera Sección
            </button>
          </div>
        </div>

        <div v-else class="cursos-grid">
          <div v-for="c in cursos" :key="c.id" class="curso-detail-card card">
            <div class="curso-detail-header">
              <h3 class="curso-name">{{ c.nombre }}</h3>
              <div class="curso-actions-btn-group">
                <button 
                  @click="abrirModalEditarCurso(c)" 
                  class="btn-icon" 
                  title="Renombrar curso"
                >
                  ✏️
                </button>
                <button 
                  @click="confirmarEliminarCurso(c)" 
                  class="btn-icon text-danger" 
                  title="Eliminar curso"
                >
                  🗑️
                </button>
              </div>
            </div>

            <div class="curso-stats-box">
              <span class="badge badge-students-count">
                👥 {{ c.cantidad_estudiantes || (c.estudiantes_ids?.length || 0) }} Estudiante(s)
              </span>
            </div>

            <!-- Listado breve de estudiantes asignados -->
            <div class="curso-assigned-list">
              <span class="assigned-title">Alumnos en este curso:</span>
              <div v-if="(c.estudiantes_ids || []).length === 0" class="text-muted-small">
                Ningún estudiante asignado aún.
              </div>
              <div v-else class="assigned-tags">
                <span 
                  v-for="idEst in c.estudiantes_ids" 
                  :key="idEst" 
                  class="student-tag"
                >
                  {{ obtenerNombreEstudiante(idEst) }}
                </span>
              </div>
            </div>

            <div class="curso-card-footer mt-3">
              <button @click="abrirModalAsignarEstudiantes(c)" class="btn btn-secondary btn-sm w-100">
                👥 Gestionar Alumnos de la Sección
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- ======================================================== -->
      <!-- PESTAÑA 3: EVALUACIONES                                 -->
      <!-- ======================================================== -->
      <div v-if="tabActiva === 'evaluaciones'" class="tab-panel">
        <div class="panel-header mb-3">
          <div>
            <h2 class="panel-title">Evaluaciones y Controles Prácticos</h2>
            <p class="panel-desc">Evaluaciones asociadas al aula para valorar mediciones de pulso, SpO₂ y ciberseguridad.</p>
          </div>
        </div>

        <div v-if="evaluaciones.length === 0" class="empty-state card">
          <p>No hay evaluaciones asignadas a esta aula actualmente.</p>
          <small>Aquí se listarán las pruebas y controles teóricos/prácticos para tus estudiantes.</small>
        </div>

        <div v-else class="evaluaciones-grid">
          <div v-for="ev in evaluaciones" :key="ev.id" class="eval-card card">
            <div class="eval-header">
              <h3 class="eval-title">{{ ev.titulo }}</h3>
              <span class="badge" :class="ev.activa ? 'badge-profesor' : 'badge-desactivado'">
                {{ ev.activa ? '🟢 Activa' : '⚪ Borrador' }}
              </span>
            </div>

            <p class="eval-desc">{{ ev.descripcion }}</p>

            <div class="eval-meta-row">
              <span class="meta-item">⏱️ Límite: <strong>{{ ev.tiempo_limite_minutos }} min</strong></span>
              <span class="meta-item">❓ Preguntas: <strong>{{ ev.preguntas_count || 5 }}</strong></span>
              <span class="meta-item">📅 Fecha: <strong>{{ formatearFecha(ev.creada_en) }}</strong></span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- ======================================================== -->
    <!-- MODALES REUTILIZADOS (RF100 y RF101)                    -->
    <!-- ======================================================== -->

    <!-- MODAL INVITAR ESTUDIANTE POR CORREO (RF100) -->
    <div v-if="modalInvitarAbierto" class="modal-backdrop" @click.self="modalInvitarAbierto = false">
      <div class="modal-card">
        <h3 class="modal-title">✉️ Invitar Estudiante al Aula</h3>
        <p class="modal-subtitle">
          Aula: <strong>{{ aula?.nombre }}</strong> (Código: <code>{{ aula?.codigo }}</code>)
        </p>

        <div v-if="errorInvitacionModal" class="alert alert-error mb-3" style="font-size: 0.85rem; padding: 0.65rem 0.85rem; margin-bottom: 1rem; border-left: 4px solid #ef4444;">
          <strong>Error de envío:</strong> {{ errorInvitacionModal }}
        </div>

        <form @submit.prevent="enviarInvitacion">
          <div class="form-group">
            <label class="form-label">Correo Institucional del Estudiante (@alu.unach.cl) *</label>
            <input 
              v-model="correoInvitacion" 
              type="email" 
              class="form-input" 
              placeholder="estudiante@alu.unach.cl" 
              required 
              :disabled="enviandoInvitacion"
            />
            <small class="help-text">El código de acceso será enviado a través de Resend a la casilla del estudiante.</small>
          </div>

          <div class="modal-actions">
            <button type="button" @click="modalInvitarAbierto = false" class="btn btn-secondary" :disabled="enviandoInvitacion">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="enviandoInvitacion">
              <span v-if="enviandoInvitacion">📨 Enviando con Resend...</span>
              <span v-else>Enviar Invitación</span>
            </button>
          </div>
        </form>

        <!-- Historial de invitaciones -->
        <div class="invitaciones-historial mt-4" style="margin-top: 1.5rem; border-top: 1px solid var(--color-border); padding-top: 1rem;">
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
                  {{ formatearFecha(inv.enviada_en || inv.intentado_en) }}
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

    <!-- MODAL CREAR / RENOMBRAR CURSO (RF101) -->
    <div v-if="modalCursoAbierto" class="modal-backdrop" @click.self="modalCursoAbierto = false">
      <div class="modal-card">
        <h3 class="modal-title">{{ modoCurso === 'crear' ? 'Crear Nueva Sección' : 'Renombrar Sección' }}</h3>
        <p class="modal-subtitle">Aula: <strong>{{ aula?.nombre }}</strong></p>

        <form @submit.prevent="guardarCurso">
          <div class="form-group">
            <label class="form-label">Nombre del Curso (Sección) *</label>
            <input 
              v-model="nombreCursoInput" 
              type="text" 
              class="form-input" 
              placeholder="Ej: Sección 1 - Turno Mañana" 
              required 
            />
          </div>

          <div class="modal-actions">
            <button type="button" @click="modalCursoAbierto = false" class="btn btn-secondary">Cancelar</button>
            <button type="submit" class="btn btn-primary" :disabled="guardandoCurso">
              {{ guardandoCurso ? 'Guardando...' : (modoCurso === 'crear' ? 'Crear Sección' : 'Actualizar') }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL ASIGNAR ESTUDIANTES AL CURSO (RF101) -->
    <div v-if="modalAsignarAbierto" class="modal-backdrop" @click.self="modalAsignarAbierto = false">
      <div class="modal-card modal-card-lg">
        <h3 class="modal-title">👥 Asignar Alumnos a: {{ cursoSeleccionado?.nombre }}</h3>
        <p class="modal-subtitle">
          Marca los estudiantes del aula que pertenecerán a esta sección:
        </p>

        <div v-if="estudiantes.length === 0" class="empty-state">
          No hay estudiantes inscritos en el aula todavía. Invítalos primero para poder asignarlos a este curso.
        </div>

        <div v-else class="students-checkbox-list">
          <label 
            v-for="est in estudiantes" 
            :key="est.usuario_id" 
            class="checkbox-item"
          >
            <input 
              type="checkbox" 
              :value="est.usuario_id" 
              v-model="estudiantesSeleccionados" 
            />
            <div>
              <strong>{{ est.nombre }}</strong>
              <p><code>{{ est.correo }}</code></p>
            </div>
          </label>
        </div>

        <div class="modal-actions mt-3">
          <button type="button" @click="modalAsignarAbierto = false" class="btn btn-secondary">Cancelar</button>
          <button @click="guardarAsignacionEstudiantes" class="btn btn-primary" :disabled="guardandoAsignacion">
            {{ guardandoAsignacion ? 'Guardando...' : 'Guardar Asignaciones' }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import {
  obtenerAulaPorId,
  obtenerEstudiantesAula,
  obtenerCursosAula,
  obtenerEvaluacionesAula,
  alternarEstadoCodigoAula,
  regenerarCodigoAulaDocente,
  enviarInvitacionCorreo,
  obtenerInvitacionesAula,
  crearCurso,
  renombrarCurso,
  eliminarCurso,
  actualizarEstudiantesCurso
} from '../services/aulasService'

const route = useRoute()
const router = useRouter()
const { currentUserId, currentUserName, isAdmin, isProfesor } = useAuth()

const aulaId = route.params.id
const aula = ref(null)
const cargando = ref(true)
const errorAcceso = ref('')
const tabActiva = ref('estudiantes') // 'estudiantes' | 'cursos' | 'evaluaciones'
const copiado = ref(false)

const estudiantes = ref([])
const cursos = ref([])
const evaluaciones = ref([])
const feedbackMensaje = ref('')
const feedbackExito = ref(true)

// Modales
const modalInvitarAbierto = ref(false)
const correoInvitacion = ref('')
const enviandoInvitacion = ref(false)
const errorInvitacionModal = ref('')
const listaInvitaciones = ref([])
const cargandoInvitaciones = ref(false)

const modalCursoAbierto = ref(false)
const modoCurso = ref('crear')
const cursoSeleccionado = ref(null)
const nombreCursoInput = ref('')
const guardandoCurso = ref(false)

const modalAsignarAbierto = ref(false)
const estudiantesSeleccionados = ref([])
const guardandoAsignacion = ref(false)

const formatearFecha = (fecha) => {
  if (!fecha) return ''
  try {
    const d = new Date(fecha)
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString()
  } catch (_) {
    return ''
  }
}

const cargarDatos = async () => {
  cargando.value = true
  errorAcceso.value = ''

  // 1. Criterio de aceptación estricto RF103: Solo entra el profesor dueño o el admin
  const resAula = await obtenerAulaPorId(aulaId, {
    usuarioId: currentUserId.value,
    esAdmin: isAdmin.value
  })

  if (!resAula.success) {
    cargando.value = false
    if (resAula.noAutorizado) {
      errorAcceso.value = resAula.error
    } else {
      errorAcceso.value = resAula.error || 'El aula no fue encontrada.'
    }
    return
  }

  aula.value = resAula.data

  // 2. Criterio de aceptación RF103: Las 3 pestañas muestran datos reales
  try {
    const [resEst, resCur, resEv] = await Promise.all([
      obtenerEstudiantesAula(aulaId),
      obtenerCursosAula(aulaId),
      obtenerEvaluacionesAula(aulaId)
    ])

    estudiantes.value = resEst.data || []
    cursos.value = resCur.data || []
    evaluaciones.value = resEv.data || []
  } catch (err) {
    console.error('Error cargando pestañas del aula:', err)
  } finally {
    cargando.value = false
  }
}

// Helpers para nombres de estudiantes y secciones
const obtenerNombreEstudiante = (id) => {
  const est = estudiantes.value.find(e => e.usuario_id === id)
  return est ? est.nombre : 'Estudiante'
}

const obtenerSeccionesEstudiante = (usuarioId) => {
  return cursos.value.filter(c => (c.estudiantes_ids || []).includes(usuarioId))
}

// RF100: Código y Copiar
const copiarCodigo = async (codigo) => {
  if (!codigo) return
  try {
    await navigator.clipboard.writeText(codigo)
    copiado.value = true
    setTimeout(() => { copiado.value = false }, 2500)
  } catch (_) {}
}

const alternarEstadoCodigo = async () => {
  const res = await alternarEstadoCodigoAula({
    aulaId: aula.value.id,
    profesorId: currentUserId.value,
    esAdmin: isAdmin.value
  })
  if (res.success) {
    aula.value.codigo_activo = res.codigo_activo
    mostrarFeedback(true, res.codigo_activo ? 'Código de acceso activado.' : 'Código de acceso desactivado.')
  } else {
    mostrarFeedback(false, res.error)
  }
}

const confirmarRegenerarCodigo = async () => {
  if (!confirm(`¿Regenerar el código de "${aula.value.nombre}"? El código anterior dejará de funcionar.`)) return
  const res = await regenerarCodigoAulaDocente({
    aulaId: aula.value.id,
    profesorId: currentUserId.value,
    esAdmin: isAdmin.value
  })
  if (res.success) {
    aula.value.codigo = res.nuevoCodigo
    aula.value.codigo_activo = true
    mostrarFeedback(true, `Nuevo código generado: ${res.nuevoCodigo}`)
  } else {
    mostrarFeedback(false, res.error)
  }
}

// RF100: Invitaciones
const cargarHistorialInvitaciones = async () => {
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

const abrirModalInvitar = async () => {
  correoInvitacion.value = ''
  errorInvitacionModal.value = ''
  modalInvitarAbierto.value = true
  await cargarHistorialInvitaciones()
}

const enviarInvitacion = async () => {
  if (!correoInvitacion.value) return
  enviandoInvitacion.value = true
  errorInvitacionModal.value = ''

  const res = await enviarInvitacionCorreo({
    aulaId: aula.value.id,
    correoEstudiante: correoInvitacion.value,
    profesorId: currentUserId.value,
    profesorNombre: currentUserName.value,
    esAdmin: isAdmin.value
  })

  enviandoInvitacion.value = false

  if (res.success) {
    mostrarFeedback(true, res.message)
    errorInvitacionModal.value = ''
    correoInvitacion.value = ''
    modalInvitarAbierto.value = false
    // Recargar estudiantes
    const resEst = await obtenerEstudiantesAula(aulaId)
    estudiantes.value = resEst.data || []
  } else {
    errorInvitacionModal.value = res.error
    await cargarHistorialInvitaciones()
  }
}

// RF101: Gestión de Cursos
const abrirModalNuevoCurso = () => {
  modoCurso.value = 'crear'
  cursoSeleccionado.value = null
  nombreCursoInput.value = ''
  modalCursoAbierto.value = true
}

const abrirModalEditarCurso = (curso) => {
  modoCurso.value = 'editar'
  cursoSeleccionado.value = curso
  nombreCursoInput.value = curso.nombre
  modalCursoAbierto.value = true
}

const guardarCurso = async () => {
  if (!nombreCursoInput.value.trim()) return
  guardandoCurso.value = true

  if (modoCurso.value === 'crear') {
    const res = await crearCurso({
      aulaId: aula.value.id,
      nombre: nombreCursoInput.value.trim(),
      profesorId: currentUserId.value,
      esAdmin: isAdmin.value
    })
    guardandoCurso.value = false
    if (res.success) {
      modalCursoAbierto.value = false
      mostrarFeedback(true, 'Sección creada correctamente.')
      const resCur = await obtenerCursosAula(aulaId)
      cursos.value = resCur.data || []
    } else {
      mostrarFeedback(false, res.error)
    }
  } else {
    const res = await renombrarCurso({
      cursoId: cursoSeleccionado.value.id,
      nuevoNombre: nombreCursoInput.value.trim(),
      aulaId: aula.value.id,
      profesorId: currentUserId.value,
      esAdmin: isAdmin.value
    })
    guardandoCurso.value = false
    if (res.success) {
      modalCursoAbierto.value = false
      mostrarFeedback(true, 'Sección renombrada correctamente.')
      const resCur = await obtenerCursosAula(aulaId)
      cursos.value = resCur.data || []
    } else {
      mostrarFeedback(false, res.error)
    }
  }
}

const confirmarEliminarCurso = async (curso) => {
  if (!confirm(`¿Eliminar la sección "${curso.nombre}"?`)) return
  const res = await eliminarCurso({
    cursoId: curso.id,
    aulaId: aula.value.id,
    profesorId: currentUserId.value,
    esAdmin: isAdmin.value
  })
  if (res.success) {
    mostrarFeedback(true, 'Sección eliminada.')
    const resCur = await obtenerCursosAula(aulaId)
    cursos.value = resCur.data || []
  } else {
    mostrarFeedback(false, res.error)
  }
}

const abrirModalAsignarEstudiantes = (curso) => {
  cursoSeleccionado.value = curso
  estudiantesSeleccionados.value = [...(curso.estudiantes_ids || [])]
  modalAsignarAbierto.value = true
}

const guardarAsignacionEstudiantes = async () => {
  guardandoAsignacion.value = true
  const res = await actualizarEstudiantesCurso({
    cursoId: cursoSeleccionado.value.id,
    aulaId: aula.value.id,
    estudiantesIds: estudiantesSeleccionados.value
  })
  guardandoAsignacion.value = false

  if (res.success) {
    modalAsignarAbierto.value = false
    mostrarFeedback(true, 'Alumnos de la sección actualizados.')
    const resCur = await obtenerCursosAula(aulaId)
    cursos.value = resCur.data || []
  } else {
    mostrarFeedback(false, res.error)
  }
}

const mostrarFeedback = (exito, mensaje) => {
  feedbackExito.value = exito
  feedbackMensaje.value = mensaje
  setTimeout(() => { feedbackMensaje.value = '' }, 4000)
}

onMounted(() => {
  cargarDatos()
})
</script>

<style scoped>
.aula-detalle-container {
  max-width: 980px;
  margin: 0 auto;
  padding-bottom: 2.5rem;
}

.top-nav-bar {
  margin-bottom: 1rem;
}

.back-link {
  display: inline-flex;
  align-items: center;
  font-size: 0.9rem;
  font-weight: 600;
  color: var(--color-primary);
  text-decoration: none;
}
.back-link:hover {
  text-decoration: underline;
}

/* Hero Header */
.aula-hero {
  padding: 1.5rem;
  border-radius: 0.75rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.hero-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1.5rem;
  flex-wrap: wrap;
}

.title-with-badge {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.aula-hero-title {
  font-size: 1.5rem;
  font-weight: 800;
  margin: 0;
  color: var(--color-text);
}

.aula-hero-desc {
  color: var(--color-muted);
  font-size: 0.95rem;
  margin: 0.5rem 0 0.75rem 0;
  max-width: 580px;
}

.aula-hero-meta {
  font-size: 0.85rem;
  color: var(--color-muted);
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.meta-separator {
  color: var(--color-border);
}

/* Código Hero Card */
.codigo-hero-card {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.85rem 1rem;
  min-width: 260px;
  text-align: center;
}

.codigo-hero-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  font-weight: 700;
  color: var(--color-muted);
  display: block;
  margin-bottom: 0.25rem;
}

.codigo-hero-display {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.codigo-hero-display code {
  font-size: 1.35rem;
  font-weight: 800;
  background: #eff6ff;
  color: var(--color-primary);
  padding: 0.2rem 0.6rem;
  border-radius: 0.35rem;
  letter-spacing: 0.08em;
}

.codigo-tachado {
  text-decoration: line-through;
  opacity: 0.5;
}

.btn-copy {
  background: none;
  border: 1px solid var(--color-border);
  border-radius: 0.35rem;
  padding: 0.25rem 0.5rem;
  font-size: 0.75rem;
  cursor: pointer;
}
.btn-copy:hover {
  background: #f1f5f9;
}

.codigo-hero-actions {
  display: flex;
  gap: 0.35rem;
  justify-content: center;
}

.btn-code-action {
  font-size: 0.72rem;
  padding: 0.25rem 0.5rem;
  border-radius: 0.3rem;
  cursor: pointer;
  border: 1px solid var(--color-border);
  background: white;
}
.btn-warn-action { color: #d97706; }
.btn-success-action { color: #16a34a; }
.btn-invite { background: #eff6ff; color: var(--color-primary); font-weight: 600; }

/* Tabs Bar */
.tabs-nav {
  display: flex;
  border-bottom: 2px solid var(--color-border);
  gap: 0.5rem;
}

.tab-btn {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  background: none;
  border: none;
  border-bottom: 3px solid transparent;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-muted);
  cursor: pointer;
  transition: all 0.2s;
  margin-bottom: -2px;
}

.tab-btn:hover {
  color: var(--color-primary);
}

.tab-btn-active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.tab-badge {
  background: #e2e8f0;
  color: #334155;
  font-size: 0.75rem;
  padding: 0.15rem 0.45rem;
  border-radius: 1rem;
}

.tab-btn-active .tab-badge {
  background: #dbeafe;
  color: var(--color-primary);
}

/* Panel Header */
.panel-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  flex-wrap: wrap;
  gap: 1rem;
}

.panel-title {
  font-size: 1.15rem;
  font-weight: 700;
  margin: 0;
}

.panel-desc {
  font-size: 0.85rem;
  color: var(--color-muted);
  margin: 0.25rem 0 0 0;
}

/* Estudiantes Table */
.data-table {
  width: 100%;
  border-collapse: collapse;
  text-align: left;
  font-size: 0.9rem;
}

.data-table th, .data-table td {
  padding: 0.75rem 1rem;
  border-bottom: 1px solid var(--color-border);
}

.data-table th {
  background: #f8fafc;
  font-weight: 600;
  color: var(--color-muted);
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.email-code {
  font-size: 0.82rem;
  background: #f1f5f9;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
}

.badge-section {
  background: #e0e7ff;
  color: #3730a3;
  font-size: 0.75rem;
  padding: 0.15rem 0.45rem;
  border-radius: 0.35rem;
}

/* Cursos Grid */
.cursos-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 1.25rem;
}

.curso-detail-card {
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
}

.curso-detail-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.curso-name {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0;
}

.curso-actions-btn-group {
  display: flex;
  gap: 0.25rem;
}

.btn-icon {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.25rem;
}
.btn-icon:hover {
  background: #f1f5f9;
}

.badge-students-count {
  background: #eff6ff;
  color: var(--color-primary);
  font-size: 0.8rem;
  padding: 0.25rem 0.6rem;
  border-radius: 0.5rem;
}

.curso-assigned-list {
  margin-top: 0.75rem;
  font-size: 0.85rem;
  flex-grow: 1;
}

.assigned-title {
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  color: var(--color-muted);
  display: block;
  margin-bottom: 0.35rem;
}

.assigned-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
}

.student-tag {
  background: #f1f5f9;
  padding: 0.2rem 0.5rem;
  border-radius: 0.35rem;
  font-size: 0.78rem;
}

/* Evaluaciones Grid */
.evaluaciones-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 1.25rem;
}

.eval-card {
  padding: 1.25rem;
}

.eval-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.5rem;
}

.eval-title {
  font-size: 1.05rem;
  font-weight: 700;
  margin: 0;
  color: var(--color-text);
}

.eval-desc {
  font-size: 0.85rem;
  color: var(--color-muted);
  line-height: 1.45;
  margin-bottom: 1rem;
}

.eval-meta-row {
  display: flex;
  gap: 1rem;
  font-size: 0.8rem;
  color: var(--color-muted);
  border-top: 1px solid var(--color-border);
  padding-top: 0.75rem;
  flex-wrap: wrap;
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

.modal-card-lg {
  max-width: 600px;
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
}

.students-checkbox-list {
  max-height: 240px;
  overflow-y: auto;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.checkbox-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.4rem;
  border-radius: 0.35rem;
  cursor: pointer;
}
.checkbox-item:hover {
  background: #f8fafc;
}

.checkbox-item p {
  margin: 0;
  font-size: 0.75rem;
  color: var(--color-muted);
}

/* Denied state */
.access-denied-card {
  text-align: center;
  padding: 3rem 1.5rem;
  max-width: 500px;
  margin: 3rem auto;
}

.access-denied-icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.access-denied-title {
  font-size: 1.35rem;
  font-weight: 800;
  margin-bottom: 0.5rem;
  color: #dc2626;
}

.access-denied-desc {
  color: var(--color-muted);
  font-size: 0.95rem;
  margin-bottom: 1.5rem;
}

.loading-state, .empty-state {
  text-align: center;
  padding: 2.5rem 1rem;
  color: var(--color-muted);
}

.text-muted-small {
  font-size: 0.8rem;
  color: var(--color-muted);
}
</style>
