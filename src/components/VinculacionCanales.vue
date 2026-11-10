<template>
  <div class="vinculacion-box card">
    <div class="box-header">
      <div>
        <div class="tag-badge">RF12 · Vinculación Multiusuario / RF111 · Elección de Canal y Rondas</div>
        <h3 class="box-title">Asignación de Canales ESP32 por Cuenta (RF111)</h3>
        <p class="box-subtitle">
          En cada sesión, cada canal (1 a 5) se asocia a la cuenta de un estudiante, quien ve su señal de pulso en vivo desde su propio dispositivo.
        </p>
      </div>

      <div class="session-badge">
        <span class="pulse-dot"></span>
        <div>
          <span class="session-name">{{ canalesState.sesionActiva.dispositivo_nombre }}</span>
          <span class="session-round">Ronda {{ metricasRonda.rondaActual }} de medición</span>
        </div>
      </div>
    </div>

    <!-- Barra de progreso de la ronda actual (RF111) -->
    <div class="ronda-progress-card">
      <div class="ronda-progress-header">
        <div class="ronda-info">
          <span class="badge-ronda-pill">Ronda {{ metricasRonda.rondaActual }}</span>
          <span class="ronda-status-text">
            <strong>{{ metricasRonda.canalesOcupados }} de 5</strong> canales ocupados ({{ metricasRonda.porcentajeOcupacion }}%)
          </span>
        </div>
        <div v-if="metricasRonda.rondaCompleta" class="badge-tanda-completa">
          ✓ Tanda completa: 5 de 5 alumnos asignados
        </div>
        <div v-else class="badge-tanda-disponible">
          {{ metricasRonda.canalesLibres }} {{ metricasRonda.canalesLibres === 1 ? 'canal disponible' : 'canales disponibles' }}
        </div>
      </div>

      <!-- Pista visual de 5 segmentos para los 5 canales de la ronda -->
      <div class="ronda-progress-track">
        <div 
          v-for="i in 5" 
          :key="i" 
          class="progress-segment" 
          :class="{ active: i <= metricasRonda.canalesOcupados }"
        >
          <span class="segment-label">CH{{ i }}</span>
        </div>
      </div>
    </div>

    <!-- Indicador del usuario actual y su asignación -->
    <div class="user-status-bar" :class="miCanalAsignado ? 'status-assigned' : 'status-unassigned'">
      <div class="user-info">
        <span class="user-avatar">👤</span>
        <div>
          <strong>{{ usuarioActual.nombre }}</strong> ({{ usuarioActual.email }})
          <span class="role-badge">{{ usuarioActual.rol }}</span>
        </div>
      </div>

      <div class="assignment-summary">
        <template v-if="miCanalAsignado">
          <span class="assigned-alert">
            ✓ Estás midiendo en el <strong>Canal {{ miCanalAsignado }}</strong>
          </span>
          <button class="btn btn-secondary btn-sm" @click="desvincular" :disabled="canalesState.cargando">
            Liberar mi canal
          </button>
        </template>
        <template v-else>
          <span v-if="esProfesorOAdmin" class="unassigned-hint">
            ⚠️ Aún no tienes canales. Pulsa «Agregar canal»: el sistema te asigna uno automáticamente.
          </span>
          <span v-else class="unassigned-hint">
            ⚠️ No tienes ningún canal asignado. Elige un canal libre a continuación (RF111):
          </span>
        </template>
      </div>
    </div>

    <!-- Varios canales para profesor y administrador (RF111): el canal nuevo se asigna solo -->
    <div v-if="estadoAgregarCanal.visible" class="mis-canales" data-testid="mis-canales">
      <div class="mis-canales-header">
        <strong>Tus canales: {{ misCanales.length }} de {{ MAX_CANALES_DOCENTE }}</strong>
        <button
          type="button"
          class="btn btn-primary btn-sm"
          data-testid="agregar-otro-canal"
          :disabled="!estadoAgregarCanal.puede || canalesState.cargando"
          :title="estadoAgregarCanal.puede ? 'Asigna automáticamente el siguiente canal libre, con la ficha, los términos y el consentimiento del paciente' : estadoAgregarCanal.motivo"
          @click="abrirAgregarCanal(null)"
        >
          ➕ {{ misCanales.length ? 'Agregar otro canal' : 'Agregar canal' }}
        </button>
      </div>
      <p v-if="!estadoAgregarCanal.puede" class="mis-canales-nota" data-testid="agregar-canal-motivo">{{ estadoAgregarCanal.motivo }}</p>
      <ul class="mis-canales-lista">
        <li v-for="c in misCanales" :key="c.canal" :class="{ pendiente: !c.listo }">
          <span><strong>Canal {{ c.canal }}</strong> ·
            <template v-if="c.esPrincipal">tu canal principal</template>
            <template v-else-if="c.listo">listo para medir</template>
            <template v-else>no se puede medir: falta {{ c.faltan.map(etiquetaRequisito).join(', ') }}</template>
          </span>
          <span class="mis-canales-acciones">
            <button v-if="!c.listo" type="button" class="btn btn-secondary btn-sm" :disabled="canalesState.cargando" @click="abrirAgregarCanal(c.canal)">Completar requisitos</button>
            <button v-if="!c.esPrincipal" type="button" class="btn btn-secondary btn-sm" :disabled="canalesState.cargando" @click="desvincular(c.canal)">Liberar</button>
          </span>
        </li>
      </ul>
    </div>

    <AgregarCanalModal
      :visible="modalAgregarVisible"
      :canal-existente="canalPendiente"
      @cerrar="modalAgregarVisible = false"
      @agregado="alAgregarCanal"
    />

    <!-- Grid de los 5 Canales Físicos (RF12 / RF111) -->
    <p v-if="esProfesorOAdmin && !canalesVisibles.length" class="mis-canales-nota" data-testid="sin-canales-tomados">
      Todavía no hay canales tomados. Usa «Agregar canal» para empezar.
    </p>
    <div v-else class="canales-slots-grid">
      <div 
        v-for="ch in canalesVisibles" 
        :key="ch.canal"
        class="canal-slot"
        :class="{
          'slot-mine': ch.usuario_id === usuarioActual.id,
          'slot-occupied': ch.usuario_id && ch.usuario_id !== usuarioActual.id,
          'slot-free': !ch.usuario_id
        }"
      >
        <div class="slot-header">
          <span class="slot-number">Canal {{ ch.canal }}</span>
          <span v-if="!ch.usuario_id" class="badge-slot badge-free">🟢 Disponible</span>
          <span v-else-if="ch.usuario_id === usuarioActual.id" class="badge-slot badge-mine">⭐ Tu Canal</span>
          <span v-else class="badge-slot badge-occupied">👤 Ocupado</span>
        </div>

        <div class="slot-body">
          <div v-if="ch.usuario_id" class="occupant-info">
            <span class="occupant-name">{{ ch.usuario_nombre || 'Estudiante asignado' }}</span>
            <span class="occupant-email font-mono">{{ ch.usuario_email || 'Sin correo' }}</span>
            <small class="assigned-time" v-if="ch.asignado_en">
              Asignado {{ formatearHora(ch.asignado_en) }}
            </small>
          </div>
          <div v-else class="free-info">
            <span class="free-text">Sensor listo para medir</span>
            <small v-if="esProfesorOAdmin">Se asigna solo con «Agregar canal»</small>
            <small v-else>Haz clic abajo para tomar este canal</small>
          </div>
        </div>

        <div class="slot-actions">
          <!-- Si está libre, el estudiante puede elegirlo (RF111) -->
          <button 
            v-if="!ch.usuario_id && !esProfesorOAdmin"
            class="btn btn-primary btn-sm btn-block"
            @click="vincular(ch.canal)"
            :disabled="canalesState.cargando || Boolean(miCanalAsignado)"
            :title="miCanalAsignado ? 'Ya tienes otro canal asignado' : 'Tomar este canal libre (RF111)'"
          >
            {{ miCanalAsignado ? 'Ya tienes canal' : 'Tomar este Canal' }}
          </button>

          <!-- Si es mi canal, puedo liberarlo -->
          <button 
            v-else-if="ch.usuario_id === usuarioActual.id"
            class="btn btn-danger btn-sm btn-block"
            @click="desvincular(ch.canal)"
            :disabled="canalesState.cargando"
          >
            Liberar Canal {{ ch.canal }}
          </button>

          <!-- Si soy profesor/admin, puedo liberar o reasignar cualquier canal (RF111) -->
          <div v-else-if="esProfesorOAdmin" class="docente-slot-buttons">
            <button 
              class="btn btn-secondary btn-sm btn-block"
              @click="liberarCanalDocente(ch.canal)"
              :disabled="canalesState.cargando"
              title="Liberar este canal como profesor"
            >
              Liberar (Docente)
            </button>
          </div>

          <span v-else-if="ch.usuario_id" class="slot-locked-text">Ocupado en esta ronda</span>
        </div>
      </div>
    </div>

    <!-- Panel de Control Docente / Rondas (RF111) -->
    <div class="docente-controls">
      <div class="docente-info">
        <strong>Modo Ronda de Aula (RF111):</strong> 
        Al completarse la medición del grupo actual (5 estudiantes), el profesor abre la siguiente ronda.
      </div>

      <div class="docente-actions">
        <button 
          class="btn btn-warning btn-sm" 
          @click="avanzarRonda"
          :disabled="canalesState.cargando"
          title="Libera los 5 canales e incrementa el contador de ronda (RF111)"
        >
          🔄 Abrir Siguiente Ronda de 5 Estudiantes
        </button>

      </div>
    </div>

    <div v-if="mensajeExito" class="alert alert-success" style="margin-top: 1rem;">
      {{ mensajeExito }}
    </div>

    <div v-if="errorMensaje" class="alert alert-danger" style="margin-top: 1rem;">
      {{ errorMensaje }}
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { consentimientoEstado } from '../services/consentimientoService'
import AgregarCanalModal from './AgregarCanalModal.vue'
import {
  canalesState,
  usuarioActual,
  miCanalAsignado,
  metricasRonda,
  cargarSesionYCanales,
  vincularMiCuentaACanal,
  desvincularMiCuenta,
  asignarCanalProfesor,
  abrirSiguienteRonda,
  estadoAgregarCanal,
  misCanales,
  MAX_CANALES_DOCENTE
} from '../services/canalesService'

const emit = defineEmits(['canal-seleccionado', 'solicitar-consentimiento'])
const errorMensaje = ref('')
const mensajeExito = ref('')

const esProfesorOAdmin = computed(() => {
  return usuarioActual.rol === 'profesor' || usuarioActual.rol === 'admin'
})

// Profesor y administrador solo ven los canales ya tomados; los libres no se muestran (se asignan con «Agregar canal»)
const canalesVisibles = computed(() =>
  esProfesorOAdmin.value ? canalesState.canales.filter(c => c.usuario_id) : canalesState.canales
)

function formatearHora(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function vincular(canalNum) {
  errorMensaje.value = ''
  mensajeExito.value = ''

  // RF04: El consentimiento informado emerge cuando el usuario toma el canal
  if (!consentimientoEstado.value.vigente) {
    emit('solicitar-consentimiento', () => vincular(canalNum))
    return
  }

  try {
    await vincularMiCuentaACanal(canalNum)
    mensajeExito.value = `¡Te has asignado el Canal ${canalNum} con éxito para la Ronda ${metricasRonda.value.rondaActual}!`
    emit('canal-seleccionado', canalNum)
    setTimeout(() => { mensajeExito.value = '' }, 4000)
  } catch (err) {
    errorMensaje.value = err.message
  }
}

const modalAgregarVisible = ref(false)
const canalPendiente = ref(null)

const ETIQUETAS_REQUISITO = { ficha: 'la ficha del paciente', politica: 'aceptar los términos y la privacidad', consentimiento: 'el consentimiento informado' }
function etiquetaRequisito(r) { return ETIQUETAS_REQUISITO[r] || r }

function abrirAgregarCanal(canalExistente) {
  errorMensaje.value = ''
  mensajeExito.value = ''
  canalPendiente.value = canalExistente
  modalAgregarVisible.value = true
}

function alAgregarCanal(canal) {
  mensajeExito.value = `Se te asignó automáticamente el Canal ${canal}. Ya puedes medir en él.`
  emit('canal-seleccionado', canal)
  setTimeout(() => { mensajeExito.value = '' }, 4000)
}

async function desvincular(canalEspecifico = null) {
  errorMensaje.value = ''
  mensajeExito.value = ''
  try {
    const res = await desvincularMiCuenta(typeof canalEspecifico === 'number' ? canalEspecifico : null)
    mensajeExito.value = `Canal ${res.canalLiberado || ''} liberado correctamente.`
    setTimeout(() => { mensajeExito.value = '' }, 3000)
  } catch (err) {
    errorMensaje.value = err.message
  }
}

async function liberarCanalDocente(canalNum) {
  errorMensaje.value = ''
  mensajeExito.value = ''
  try {
    await asignarCanalProfesor(canalNum, null)
    mensajeExito.value = `Canal ${canalNum} liberado por el docente.`
    setTimeout(() => { mensajeExito.value = '' }, 3000)
  } catch (err) {
    errorMensaje.value = err.message
  }
}

async function avanzarRonda() {
  errorMensaje.value = ''
  mensajeExito.value = ''
  if (!confirm(`¿Deseas finalizar la Ronda ${metricasRonda.value.rondaActual} y abrir la siguiente ronda para 5 nuevos estudiantes?`)) {
    return
  }
  try {
    const nuevaRonda = await abrirSiguienteRonda()
    mensajeExito.value = `¡Ronda ${nuevaRonda} abierta con éxito! Los 5 canales han quedado libres para el siguiente grupo de estudiantes.`
    setTimeout(() => { mensajeExito.value = '' }, 5000)
  } catch (err) {
    errorMensaje.value = err.message
  }
}

onMounted(() => {
  cargarSesionYCanales()
})
</script>

<style scoped>
.vinculacion-box {
  margin-bottom: 1.5rem;
  border: 1px solid var(--color-border);
  padding: 1.25rem;
}

.box-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  gap: 1rem;
}

.tag-badge {
  font-size: 0.75rem;
  font-weight: 700;
  color: var(--color-primary);
  background: #dbeafe;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
  display: inline-block;
  margin-bottom: 0.35rem;
  text-transform: uppercase;
}

.box-title {
  font-size: 1.35rem;
  font-weight: 800;
  margin-bottom: 0.25rem;
}

.box-subtitle {
  font-size: 0.875rem;
  color: var(--color-muted);
  max-width: 650px;
}

.mis-canales {
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
  padding: 0.9rem 1rem;
  margin-bottom: 1.25rem;
}

.mis-canales-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.mis-canales-nota {
  font-size: 0.85rem;
  color: var(--color-muted);
  margin: 0.5rem 0 0;
}

.mis-canales-lista {
  list-style: none;
  margin: 0.75rem 0 0;
  padding: 0;
  display: grid;
  gap: 0.4rem;
}

.mis-canales-lista li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.9rem;
}

.mis-canales-lista li.pendiente { color: var(--color-danger, #b91c1c); }
.mis-canales-acciones { display: inline-flex; gap: 0.4rem; }

.session-badge {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.5rem 0.85rem;
}

.pulse-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-success);
  box-shadow: 0 0 6px var(--color-success);
  display: inline-block;
}

.session-name {
  display: block;
  font-weight: 700;
  font-size: 0.85rem;
}

.session-round {
  display: block;
  font-size: 0.75rem;
  color: var(--color-muted);
}

/* Barra de progreso de la ronda (RF111) */
.ronda-progress-card {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.85rem 1rem;
  margin-bottom: 1.25rem;
}

.ronda-progress-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-bottom: 0.65rem;
}

.ronda-info {
  display: flex;
  align-items: center;
  gap: 0.6rem;
}

.badge-ronda-pill {
  background: #1e293b;
  color: #f8fafc;
  font-weight: 700;
  font-size: 0.8rem;
  padding: 0.2rem 0.6rem;
  border-radius: 9999px;
}

.ronda-status-text {
  font-size: 0.85rem;
  color: var(--color-text);
}

.badge-tanda-completa {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
  font-size: 0.75rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
}

.badge-tanda-disponible {
  background: #eff6ff;
  color: #1e40af;
  border: 1px solid #bfdbfe;
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.2rem 0.55rem;
  border-radius: 9999px;
}

.ronda-progress-track {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: 0.35rem;
}

.progress-segment {
  background: #e2e8f0;
  border-radius: 0.25rem;
  padding: 0.35rem 0.25rem;
  text-align: center;
  transition: all 0.2s ease;
}

.progress-segment.active {
  background: var(--color-primary);
  color: #ffffff;
  box-shadow: 0 1px 3px rgba(37, 99, 235, 0.3);
}

.segment-label {
  font-size: 0.7rem;
  font-weight: 700;
  font-family: monospace;
}

.user-status-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.75rem 1rem;
  border-radius: 0.5rem;
  margin-bottom: 1.25rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.status-assigned {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
}

.status-unassigned {
  background: #fffbeb;
  border: 1px solid #fde68a;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
}

.user-avatar {
  font-size: 1.25rem;
}

.role-badge {
  font-size: 0.7rem;
  background: #e2e8f0;
  padding: 0.15rem 0.4rem;
  border-radius: 0.25rem;
  margin-left: 0.35rem;
  font-weight: 700;
  text-transform: uppercase;
}

.assignment-summary {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.assigned-alert {
  font-size: 0.85rem;
  color: #1e40af;
}

.unassigned-hint {
  font-size: 0.85rem;
  color: #92400e;
}

.canales-slots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  margin-bottom: 1.5rem;
}

.canal-slot {
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 0.85rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: #ffffff;
  transition: all 0.2s ease;
}

.slot-mine {
  border-color: #3b82f6;
  background: #f0f7ff;
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.slot-occupied {
  border-color: #e2e8f0;
  background: #f8fafc;
}

.slot-free {
  border-color: #86efac;
  background: #f0fdf4;
}

.slot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.slot-number {
  font-weight: 800;
  font-size: 0.95rem;
}

.badge-slot {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.4rem;
  border-radius: 9999px;
}

.badge-free {
  background: #dcfce7;
  color: #166534;
}

.badge-mine {
  background: #dbeafe;
  color: #1e40af;
}

.badge-occupied {
  background: #f1f5f9;
  color: #475569;
}

.slot-body {
  margin-bottom: 0.75rem;
  min-height: 48px;
}

.occupant-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.occupant-name {
  font-weight: 600;
  font-size: 0.85rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.occupant-email {
  font-size: 0.75rem;
  color: var(--color-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.assigned-time {
  font-size: 0.7rem;
  color: #64748b;
  margin-top: 0.15rem;
}

.free-info {
  display: flex;
  flex-direction: column;
}

.free-text {
  font-size: 0.8rem;
  color: #15803d;
  font-weight: 600;
}

.free-info small {
  font-size: 0.7rem;
  color: var(--color-muted);
}

.slot-actions {
  margin-top: auto;
}

.btn-block {
  width: 100%;
}

.slot-locked-text {
  display: block;
  text-align: center;
  font-size: 0.75rem;
  color: var(--color-muted);
  padding: 0.35rem 0;
}

.docente-controls {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.85rem 1rem;
  background: #fdf6ec;
  border: 1px solid #f9d8a7;
  border-radius: 0.5rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.docente-info {
  font-size: 0.85rem;
  color: #7c2d12;
}

.docente-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.docente-slot-buttons {
  display: flex;
  gap: 0.35rem;
}
</style>
