<template>
  <div class="admin-container">
    <div class="card">
      <div class="admin-header">
        <div>
          <h1 class="card-title">Panel de Administración</h1>
          <p class="header-desc">
            Gestión global del sistema, cuentas de usuario y asignación de roles.
          </p>
        </div>
        <button @click="recargarTodo" class="btn btn-secondary btn-sm" :disabled="cargandoLista || cargandoAuditoria">
          {{ cargandoLista ? 'Actualizando...' : 'Recargar Todo' }}
        </button>
      </div>

      <!-- Alertas de estado -->
      <div v-if="feedbackMensaje" class="alert" :class="feedbackExito ? 'alert-success' : 'alert-error'">
        {{ feedbackMensaje }}
      </div>

      <!-- SECCIÓN: Gestión y Asignación de Roles -->
      <div class="admin-section">
        <div class="section-top">
          <h2 class="section-title">Cuentas y Asignación de Roles</h2>
          <div class="search-box">
            <input 
              v-model="filtroBusqueda" 
              type="text" 
              class="form-input" 
              placeholder="Buscar por nombre o correo..."
            />
          </div>
        </div>

        <div v-if="cargandoLista" class="loading-state">
          Cargando cuentas registradas...
        </div>

        <div v-else-if="cuentasFiltradas.length === 0" class="empty-state">
          No se encontraron cuentas que coincidan con la búsqueda.
        </div>

        <div v-else class="table-responsive">
          <table class="users-table">
            <thead>
              <tr>
                <th>Usuario</th>
                <th>Correo Institucional</th>
                <th>Rol Actual</th>
                <th style="text-align: right;">Acciones</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="cuenta in cuentasFiltradas" :key="cuenta.id">
                <td>
                  <strong>{{ cuenta.nombre || 'Sin nombre registrado' }}</strong>
                  <span v-if="cuenta.id === currentUserId" class="self-tag">(Tú)</span>
                </td>
                <td><code>{{ cuenta.correo }}</code></td>
                <td>
                  <span class="badge" :class="claseBadge(cuenta)">
                    {{ etiquetaCuenta(cuenta) }}
                  </span>
                </td>
                <td style="text-align: right; white-space: nowrap;">
                  <!-- Botón de Permisos solo visible para cuentas con rol de profesor -->
                  <button 
                    v-if="cuenta.rol === 'profesor'"
                    @click="abrirModalPermisos(cuenta)" 
                    class="btn btn-secondary btn-sm"
                    style="margin-right: 0.5rem;"
                  >
                    Permisos
                  </button>
                  <button 
                    @click="abrirModalCambio(cuenta)" 
                    class="btn btn-secondary btn-sm"
                  >
                    Editar Rol
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- SECCIÓN: Registro General de Auditoría del Sistema -->
      <RegistroAuditoriaPanel ref="panelAuditoriaGeneral" class="mt-4" />

      <!-- SECCIÓN: Registro de Auditoría de Cambios de Rol -->
      <div class="admin-section mt-4">
        <div class="section-top">
          <div>
            <h2 class="section-title">Registro de Auditoría de Cambios de Rol</h2>
            <p class="section-desc">
              Trazabilidad inmutable de asignaciones y modificaciones de roles y administradores.
            </p>
          </div>
          <button @click="cargarAuditoria" class="btn btn-secondary btn-sm" :disabled="cargandoAuditoria">
            {{ cargandoAuditoria ? 'Cargando...' : 'Actualizar Registro' }}
          </button>
        </div>

        <div v-if="cargandoAuditoria" class="loading-state">
          Cargando registro de auditoría...
        </div>

        <div v-else-if="historialAuditoria.length === 0" class="empty-state">
          No hay registros de cambios de rol registrados aún.
        </div>

        <div v-else class="table-responsive">
          <table class="users-table auditoria-table">
            <thead>
              <tr>
                <th>Fecha y Hora</th>
                <th>Administrador Responsable</th>
                <th>Usuario Modificado</th>
                <th>Rol Académico</th>
                <th>Privilegio Administrador</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="item in historialAuditoria" :key="item.id">
                <td>
                  <span class="fecha-badge">{{ formatearFechaHora(item.ocurrio_en) }}</span>
                </td>
                <td>
                  <strong>{{ item.actor_nombre }}</strong>
                  <div class="sub-correo"><code>{{ item.actor_correo }}</code></div>
                </td>
                <td>
                  <strong>{{ item.usuario_nombre }}</strong>
                  <div class="sub-correo"><code>{{ item.usuario_correo }}</code></div>
                </td>
                <td>
                  <span class="badge" :class="claseBadgeRol(item.rol_antes)">{{ etiquetaRol(item.rol_antes) }}</span>
                  <span class="flecha-transicion"> → </span>
                  <span class="badge" :class="claseBadgeRol(item.rol_despues)">{{ etiquetaRol(item.rol_despues) }}</span>
                </td>
                <td>
                  <span v-if="item.admin_antes !== item.admin_despues" class="badge" :class="item.admin_despues ? 'badge-admin-alta' : 'badge-admin-baja'">
                    {{ item.admin_despues ? 'Otorgado Admin' : 'Revocado Admin' }}
                  </span>
                  <span v-else class="text-sin-cambio">
                    {{ item.admin_despues ? 'Se mantuvo Admin' : '— Sin privilegio admin' }}
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <!-- SECCIÓN: Rangos de BPM y SpO₂ por actividad y edad -->
      <RangosPanel class="mt-4" modo="admin" :usuario-id="currentUserId" />

      <!-- SECCIÓN: Método de sincronización, contenidos y propuestas de profesores -->
      <MetodoSincronizacionPanel class="mt-4" modo="admin" :usuario-id="currentUserId" />
      <ContenidosPanel class="mt-4" modo="admin" :usuario-id="currentUserId" />
      <PropuestasPanel class="mt-4" modo="admin" />

      <!-- SECCIÓN: Primer Administrador (Arranque Inicial) -->
      <div class="seed-card card mt-4">
        <h2 class="section-title">Inicialización del Sistema</h2>
        <p class="section-desc">
          Verificación de la cuenta raíz predeterminada en código.
        </p>

        <div class="admin-info-box">
          <p><strong>Correo raíz:</strong> <code>admin.general@unach.cl</code></p>
          <p><strong>Rol:</strong> <span class="badge badge-admin">Administrador</span></p>
        </div>

        <button 
          @click="ejecutarInicializacion" 
          class="btn btn-secondary btn-sm"
          :disabled="cargandoInit"
        >
          {{ cargandoInit ? 'Verificando...' : 'Verificar Cuenta Raíz' }}
        </button>
      </div>
    </div>

    <!-- MODAL DE CONFIRMACIÓN DE CAMBIO DE ROL -->
    <div v-if="modalAbierto" class="modal-backdrop" @click.self="cerrarModal">
      <div class="modal-card">
        <h3 class="modal-title">Confirmar Cambio de Rol</h3>
        <p class="modal-subtitle">
          Vas a modificar los permisos de la siguiente cuenta institucional:
        </p>

        <div class="account-summary">
          <p><strong>Nombre:</strong> {{ usuarioSeleccionado?.nombre || 'Usuario' }}</p>
          <p><strong>Correo:</strong> <code>{{ usuarioSeleccionado?.correo }}</code></p>
        </div>

        <form @submit.prevent="confirmarCambioRol">
          <div class="form-group">
            <label class="form-label">Rol Académico</label>
            <select v-model="formRol" class="form-select" :disabled="esEstudianteEstricto">
              <option value="usuario">Estudiante</option>
              <option value="profesor">Profesor</option>
            </select>
            <small v-if="esEstudianteEstricto" class="help-text">
              Los correos <code>@alu.unach.cl</code> mantienen rol académico de Estudiante.
            </small>
          </div>

          <div class="form-group checkbox-group">
            <label class="checkbox-label">
              <input type="checkbox" v-model="formEsAdmin" />
              <span>Privilegios de Administrador del Sistema</span>
            </label>
            <small class="help-text">
              Permite gestionar usuarios, ver auditorías y acceder a todas las configuraciones.
            </small>
          </div>

          <!-- Alerta de seguridad si intenta revocar al único administrador -->
          <div v-if="advertenciaUnicoAdmin" class="alert alert-error mt-4" style="margin-bottom: 0;">
            <strong>Acción no permitida:</strong> No se puede retirar el rol de administrador porque es el único administrador activo del sistema.
          </div>

          <div class="modal-actions">
            <button type="button" @click="cerrarModal" class="btn btn-secondary" :disabled="guardandoRol">
              Cancelar
            </button>
            <button 
              type="submit" 
              class="btn btn-primary" 
              :disabled="guardandoRol || advertenciaUnicoAdmin"
            >
              {{ guardandoRol ? 'Guardando...' : 'Guardar y Auditar Cambio' }}
            </button>
          </div>
        </form>
      </div>
    </div>

    <!-- MODAL DE PERMISOS GRANULARES DE PROFESOR -->
    <div v-if="modalPermisosAbierto" class="modal-backdrop" @click.self="cerrarModalPermisos">
      <div class="modal-card">
        <h3 class="modal-title">Permisos Granulares de Profesor</h3>
        <p class="modal-subtitle">
          Profesor: <strong>{{ profesorSeleccionado?.nombre || profesorSeleccionado?.correo }}</strong>
        </p>

        <div v-if="cargandoPermisos" class="loading-state">
          Cargando permisos actuales...
        </div>

        <form v-else @submit.prevent="guardarPermisos">
          <div class="permisos-list">
            <label class="permiso-item">
              <input type="checkbox" v-model="permisosForm.crear_aulas" />
              <div>
                <strong>Crear aulas virtuales</strong>
                <p>Permite registrar nuevas aulas y generar códigos de acceso.</p>
              </div>
            </label>

            <label class="permiso-item">
              <input type="checkbox" v-model="permisosForm.publicar_galeria" />
              <div>
                <strong>Operar sensor y publicar en galería</strong>
                <p>Permite medir con el sensor de pulso y compartir registros fotopletismográficos anonimizados para uso didáctico.</p>
              </div>
            </label>

            <label class="permiso-item">
              <input type="checkbox" v-model="permisosForm.compartir_banco" />
              <div>
                <strong>Compartir preguntas al banco global</strong>
                <p>Permite subir reactivos al repositorio general de docentes.</p>
              </div>
            </label>

            <label class="permiso-item">
              <input type="checkbox" v-model="permisosForm.editar_rangos" />
              <div>
                <strong>Editar rangos fisiológicos</strong>
                <p>Permite ajustar umbrales normales de BPM y SpO₂ en evaluaciones.</p>
              </div>
            </label>

            <label class="permiso-item">
              <input type="checkbox" v-model="permisosForm.editar_contenidos" />
              <div>
                <strong>Editar contenidos y lecciones</strong>
                <p>Permite modificar y proponer material educativo de la plataforma.</p>
              </div>
            </label>
          </div>

          <div class="modal-actions">
            <button type="button" @click="cerrarModalPermisos" class="btn btn-secondary" :disabled="guardandoPermisos">
              Cancelar
            </button>
            <button type="submit" class="btn btn-primary" :disabled="guardandoPermisos">
              {{ guardandoPermisos ? 'Guardando...' : 'Guardar Permisos' }}
            </button>
          </div>
        </form>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuth } from '../composables/useAuth'
import RegistroAuditoriaPanel from '../components/RegistroAuditoriaPanel.vue'
import RangosPanel from '../components/RangosPanel.vue'
import MetodoSincronizacionPanel from '../components/MetodoSincronizacionPanel.vue'
import ContenidosPanel from '../components/ContenidosPanel.vue'
import PropuestasPanel from '../components/PropuestasPanel.vue'
import { 
  verificarOCrearPrimerAdmin, 
  obtenerCuentas, 
  actualizarRolCuenta,
  obtenerHistorialCambiosRol,
  obtenerPermisosProfesor, 
  guardarPermisosProfesor, 
  PERMISOS_DEFAULT 
} from '../services/adminService'
import { obtenerEtiquetaPerfil } from '../utils/roles'

const { currentUserId, currentUserEmail, currentUserName, isAdmin, refrescarPerfil } = useAuth()

const cuentas = ref([])
const filtroBusqueda = ref('')
const cargandoLista = ref(false)
const cargandoInit = ref(false)
const feedbackMensaje = ref('')
const feedbackExito = ref(true)

// Modal de edición de roles (RF45 / RF53)
const modalAbierto = ref(false)
const usuarioSeleccionado = ref(null)
const formRol = ref('usuario')
const formEsAdmin = ref(false)
const guardandoRol = ref(false)

// Auditoría de cambios de rol (RF53) y referencia al panel general (RF62)
const historialAuditoria = ref([])
const cargandoAuditoria = ref(false)
const panelAuditoriaGeneral = ref(null)

// Modal de edición de permisos de profesor (RF98)
const modalPermisosAbierto = ref(false)
const profesorSeleccionado = ref(null)
const permisosForm = ref({ ...PERMISOS_DEFAULT })
const cargandoPermisos = ref(false)
const guardandoPermisos = ref(false)

const cuentasFiltradas = computed(() => {
  const query = filtroBusqueda.value.trim().toLowerCase()
  if (!query) return cuentas.value
  return cuentas.value.filter(c => 
    (c.nombre && c.nombre.toLowerCase().includes(query)) ||
    (c.correo && c.correo.toLowerCase().includes(query))
  )
})

const esEstudianteEstricto = computed(() => {
  return usuarioSeleccionado.value?.correo?.endsWith('@alu.unach.cl')
})

const totalAdmins = computed(() => {
  return cuentas.value.filter(c => c.es_admin).length
})

const advertenciaUnicoAdmin = computed(() => {
  if (!usuarioSeleccionado.value) return false
  return usuarioSeleccionado.value.es_admin && !formEsAdmin.value && totalAdmins.value <= 1
})

const etiquetaCuenta = (cuenta) => {
  return obtenerEtiquetaPerfil(cuenta)
}

const etiquetaRol = (rol) => {
  if (rol === 'profesor') return 'Profesor'
  return 'Estudiante'
}

const claseBadge = (cuenta) => {
  if (cuenta.es_admin) return 'badge-admin'
  if (cuenta.rol === 'profesor') return 'badge-profesor'
  return 'badge-usuario'
}

const claseBadgeRol = (rol) => {
  if (rol === 'profesor') return 'badge-profesor'
  return 'badge-usuario'
}

const formatearFechaHora = (isoStr) => {
  if (!isoStr) return '—'
  try {
    const fecha = new Date(isoStr)
    return fecha.toLocaleString('es-CL', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    })
  } catch (_) {
    return isoStr
  }
}

const cargarUsuarios = async () => {
  cargandoLista.value = true
  const res = await obtenerCuentas()
  cargandoLista.value = false
  if (res.success) {
    cuentas.value = res.data
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

const cargarAuditoria = async () => {
  cargandoAuditoria.value = true
  const res = await obtenerHistorialCambiosRol()
  cargandoAuditoria.value = false
  if (res.success) {
    historialAuditoria.value = res.data
  }
}

const recargarTodo = async () => {
  await Promise.all([
    cargarUsuarios(),
    cargarAuditoria(),
    panelAuditoriaGeneral.value?.cargarEventos?.()
  ])
}

const abrirModalCambio = (cuenta) => {
  usuarioSeleccionado.value = cuenta
  formRol.value = cuenta.rol || 'usuario'
  formEsAdmin.value = !!cuenta.es_admin
  modalAbierto.value = true
}

const cerrarModal = () => {
  modalAbierto.value = false
  usuarioSeleccionado.value = null
}

const confirmarCambioRol = async () => {
  if (!usuarioSeleccionado.value) return
  guardandoRol.value = true
  feedbackMensaje.value = ''

  // RF53: Pasamos datos del actor (administrador que ejecuta la acción)
  const res = await actualizarRolCuenta({
    id: usuarioSeleccionado.value.id,
    nuevoRol: formRol.value,
    nuevoEsAdmin: formEsAdmin.value,
    actorId: currentUserId.value,
    actorEsAdmin: isAdmin.value,
    actorNombre: currentUserName.value,
    actorCorreo: currentUserEmail.value
  })

  guardandoRol.value = false

  if (res.success) {
    feedbackExito.value = true
    feedbackMensaje.value = `El rol de ${usuarioSeleccionado.value.correo} fue actualizado y auditado exitosamente.`
    cerrarModal()
    await Promise.all([cargarUsuarios(), cargarAuditoria()])
    if (usuarioSeleccionado.value.id === currentUserId.value) {
      await refrescarPerfil()
    }
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

const abrirModalPermisos = async (cuenta) => {
  profesorSeleccionado.value = cuenta
  modalPermisosAbierto.value = true
  cargandoPermisos.value = true
  const res = await obtenerPermisosProfesor(cuenta.id)
  cargandoPermisos.value = false
  if (res.success && res.data) {
    permisosForm.value = {
      crear_aulas: !!res.data.crear_aulas,
      publicar_galeria: !!res.data.publicar_galeria,
      compartir_banco: !!res.data.compartir_banco,
      editar_rangos: !!res.data.editar_rangos,
      editar_contenidos: !!res.data.editar_contenidos
    }
  }
}

const cerrarModalPermisos = () => {
  modalPermisosAbierto.value = false
  profesorSeleccionado.value = null
}

const guardarPermisos = async () => {
  if (!profesorSeleccionado.value) return
  guardandoPermisos.value = true
  const res = await guardarPermisosProfesor(
    profesorSeleccionado.value.id,
    permisosForm.value,
    currentUserId.value
  )
  guardandoPermisos.value = false
  if (res.success) {
    feedbackExito.value = true
    feedbackMensaje.value = `Permisos actualizados para ${profesorSeleccionado.value.nombre || profesorSeleccionado.value.correo}.`
    cerrarModalPermisos()
  } else {
    feedbackExito.value = false
    feedbackMensaje.value = res.error
  }
}

const ejecutarInicializacion = async () => {
  cargandoInit.value = true
  feedbackMensaje.value = ''
  const res = await verificarOCrearPrimerAdmin()
  cargandoInit.value = false
  feedbackExito.value = !res.error
  feedbackMensaje.value = res.mensaje || res.error
  await cargarUsuarios()
}

onMounted(() => {
  recargarTodo()
})
</script>

<style scoped>
.admin-container {
  max-width: 1160px;
  margin: 0 auto;
}

.admin-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.5rem;
}

.header-desc {
  color: var(--color-muted);
  font-size: 0.95rem;
}

.admin-section {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 1.25rem;
}

.section-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.section-title {
  font-size: 1.15rem;
  font-weight: 700;
}

.search-box {
  min-width: 280px;
}

.table-responsive {
  overflow-x: auto;
}

.users-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.users-table th, .users-table td {
  padding: 0.75rem 0.5rem;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
}

.users-table th {
  color: var(--color-muted);
  font-weight: 600;
  font-size: 0.8rem;
  text-transform: uppercase;
}

.self-tag {
  font-size: 0.75rem;
  color: var(--color-primary);
  margin-left: 0.35rem;
  font-weight: 600;
}

.sub-correo {
  font-size: 0.75rem;
  color: var(--color-muted);
  margin-top: 0.15rem;
}

.fecha-badge {
  font-size: 0.8rem;
  font-family: monospace;
  background: #f1f5f9;
  padding: 0.2rem 0.4rem;
  border-radius: 0.25rem;
  color: #334155;
  white-space: nowrap;
}

.flecha-transicion {
  color: var(--color-muted);
  font-weight: bold;
  margin: 0 0.25rem;
}

.badge-admin-alta {
  background: #fef3c7;
  color: #92400e;
  font-weight: 600;
  border: 1px solid #fde68a;
}

.badge-admin-baja {
  background: #fee2e2;
  color: #991b1b;
  font-weight: 600;
  border: 1px solid #fecaca;
}

.text-sin-cambio {
  font-size: 0.8rem;
  color: var(--color-muted);
}

.loading-state, .empty-state {
  text-align: center;
  padding: 2rem;
  color: var(--color-muted);
}

.mt-4 {
  margin-top: 1.5rem;
}

.seed-card {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  padding: 1.25rem;
}

.admin-info-box {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.75rem 1rem;
  margin-bottom: 1rem;
  font-size: 0.85rem;
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
  font-size: 0.875rem;
  color: var(--color-muted);
  margin-bottom: 1rem;
}

.account-summary {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  padding: 0.75rem;
  border-radius: 0.5rem;
  margin-bottom: 1rem;
  font-size: 0.875rem;
}

.checkbox-group {
  margin-top: 1rem;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  cursor: pointer;
}

.help-text {
  display: block;
  font-size: 0.75rem;
  color: var(--color-muted);
  margin-top: 0.25rem;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}

/* Estilos de la lista de permisos de profesor (RF98) */
.permisos-list {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  margin: 1rem 0;
}

.permiso-item {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.65rem;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  background: #f8fafc;
  cursor: pointer;
}

.permiso-item input {
  margin-top: 0.25rem;
}

.permiso-item p {
  font-size: 0.8rem;
  color: var(--color-muted);
  margin-top: 0.15rem;
}
</style>
