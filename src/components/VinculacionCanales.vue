<template>
  <div class="vinculacion-box card">
    <div class="box-header">
      <div>
        <div class="tag-badge">RF12 · Vinculación Multiusuario / RF111 · Rondas</div>
        <h3 class="box-title"> Asignación de Canales ESP32 por Cuenta</h3>
        <p class="box-subtitle">
          En cada sesión, cada canal (1 a 5) se asocia a la cuenta de un estudiante, quien ve su señal de pulso en vivo desde su propio dispositivo.
        </p>
      </div>

      <div class="session-badge">
        <span class="pulse-dot"></span>
        <div>
          <span class="session-name">{{ canalesState.sesionActiva.dispositivo_nombre }}</span>
          <span class="session-round">Ronda {{ canalesState.sesionActiva.ronda }} de medición</span>
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
             Estás midiendo en el <strong>Canal {{ miCanalAsignado }}</strong>
          </span>
          <button class="btn btn-secondary btn-sm" @click="desvincular" :disabled="canalesState.cargando">
            Desvincular mi canal
          </button>
        </template>
        <template v-else>
          <span class="unassigned-hint">
            ⚠️ No tienes ningún canal asignado. Elige un canal libre a continuación:
          </span>
        </template>
      </div>
    </div>

    <!-- Grid de los 5 Canales Físicos (RF12) -->
    <div class="canales-slots-grid">
      <div 
        v-for="ch in canalesState.canales" 
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
            <small>Haz clic abajo para tomar este canal</small>
          </div>
        </div>

        <div class="slot-actions">
          <!-- Si está libre, el estudiante puede elegirlo -->
          <button 
            v-if="!ch.usuario_id"
            class="btn btn-primary btn-sm btn-block"
            @click="vincular(ch.canal)"
            :disabled="canalesState.cargando || Boolean(miCanalAsignado)"
            :title="miCanalAsignado ? 'Ya tienes otro canal asignado' : 'Tomar este canal'"
          >
            {{ miCanalAsignado ? 'Ya tienes canal' : 'Tomar este Canal' }}
          </button>

          <!-- Si es mi canal, puedo liberarlo -->
          <button 
            v-else-if="ch.usuario_id === usuarioActual.id"
            class="btn btn-danger btn-sm btn-block"
            @click="desvincular"
            :disabled="canalesState.cargando"
          >
            Liberar Canal {{ ch.canal }}
          </button>

          <!-- Si soy profesor, puedo liberar o reasignar cualquier canal (RF111) -->
          <button 
            v-else-if="usuarioActual.rol === 'profesor' || usuarioActual.rol === 'admin'"
            class="btn btn-secondary btn-sm btn-block"
            @click="liberarCanalDocente(ch.canal)"
            :disabled="canalesState.cargando"
          >
            Liberar (Profesor)
          </button>

          <span v-else class="slot-locked-text">Ocupado en esta ronda</span>
        </div>
      </div>
    </div>

    <!-- Panel de Control Docente / Rondas (RF111) -->
    <div class="docente-controls">
      <div class="docente-info">
        <strong>Modo Ronda de Aula (RF111):</strong> 
        Al completarse la medición del grupo actual, el profesor abre la siguiente ronda de 5 alumnos.
      </div>

      <div class="docente-actions">
        <button 
          class="btn btn-warning btn-sm" 
          @click="avanzarRonda"
          :disabled="canalesState.cargando"
          title="Libera los 5 canales e incrementa la ronda"
        >
          🔄 Abrir Siguiente Ronda de 5 Estudiantes
        </button>

        <button 
          class="btn btn-secondary btn-sm"
          @click="alternarRolDemo"
        >
          Alternar Rol Demo (Actual: {{ usuarioActual.rol }})
        </button>
      </div>
    </div>

    <div v-if="errorMensaje" class="alert alert-danger" style="margin-top: 1rem;">
      {{ errorMensaje }}
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { consentimientoEstado } from '../services/consentimientoService'
import {
  canalesState,
  usuarioActual,
  miCanalAsignado,
  cargarSesionYCanales,
  vincularMiCuentaACanal,
  desvincularMiCuenta,
  asignarCanalProfesor,
  abrirSiguienteRonda
} from '../services/canalesService'

const emit = defineEmits(['canal-seleccionado', 'solicitar-consentimiento'])
const errorMensaje = ref('')

function formatearHora(isoString) {
  if (!isoString) return ''
  return new Date(isoString).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

async function vincular(canalNum) {
    errorMensaje.value = ''
  // RF04: El consentimiento informado emerge cuando el usuario toma el canal
  if (!consentimientoEstado.value.vigente) {
    emit('solicitar-consentimiento', () => vincular(canalNum))
    return
  }

  try {
    await vincularMiCuentaACanal(canalNum)
    emit('canal-seleccionado', canalNum)
  } catch (err) {
    errorMensaje.value = err.message
  }
}

async function desvincular() {
  errorMensaje.value = ''
  try {
    await desvincularMiCuenta()
  } catch (err) {
    errorMensaje.value = err.message
  }
}

async function liberarCanalDocente(canalNum) {
  errorMensaje.value = ''
  try {
    await asignarCanalProfesor(canalNum, null)
  } catch (err) {
    errorMensaje.value = err.message
  }
}

async function avanzarRonda() {
  errorMensaje.value = ''
  if (!confirm(`¿Deseas finalizar la Ronda ${canalesState.sesionActiva.ronda} y abrir la siguiente ronda para 5 nuevos estudiantes?`)) {
    return
  }
  try {
    const nuevaRonda = await abrirSiguienteRonda()
    alert(`¡Ronda ${nuevaRonda} abierta con éxito! Los 5 canales han quedado libres.`)
  } catch (err) {
    errorMensaje.value = err.message
  }
}

function alternarRolDemo() {
  if (usuarioActual.rol === 'estudiante') {
    usuarioActual.rol = 'profesor'
    usuarioActual.nombre = 'Prof. Carlos Méndez'
    usuarioActual.email = 'cmendez@unach.cl'
  } else {
    usuarioActual.rol = 'estudiante'
    usuarioActual.nombre = 'Adán Ramos'
    usuarioActual.email = 'adanramos@alu.unach.cl'
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
}

.assigned-alert {
  font-size: 0.9rem;
  color: var(--color-primary);
}

.unassigned-hint {
  font-size: 0.85rem;
  color: #92400e;
}

.canales-slots-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
  margin-bottom: 1.25rem;
}

.canal-slot {
  background: var(--color-surface);
  border: 2px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  transition: all 0.2s ease;
}

.slot-mine {
  border-color: var(--color-primary);
  background: #f0f7ff;
  box-shadow: 0 0 0 2px rgba(30, 64, 175, 0.2);
}

.slot-occupied {
  border-color: #cbd5e1;
  background: #f8fafc;
}

.slot-free {
  border-color: #86efac;
}

.slot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.75rem;
}

.slot-number {
  font-weight: 800;
  font-size: 1rem;
}

.badge-slot {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 9999px;
}

.badge-free {
  background: #dcfce7;
  color: #15803d;
}

.badge-mine {
  background: #dbeafe;
  color: var(--color-primary);
}

.badge-occupied {
  background: #fee2e2;
  color: #b91c1c;
}

.slot-body {
  margin-bottom: 1rem;
  min-height: 48px;
}

.occupant-info {
  display: flex;
  flex-direction: column;
}

.occupant-name {
  font-weight: 700;
  font-size: 0.85rem;
  color: var(--color-text);
}

.occupant-email {
  font-size: 0.75rem;
  color: var(--color-muted);
}

.assigned-time {
  font-size: 0.7rem;
  color: var(--color-muted);
  margin-top: 0.2rem;
}

.free-info {
  display: flex;
  flex-direction: column;
}

.free-text {
  font-size: 0.85rem;
  color: #15803d;
  font-weight: 600;
}

.free-info small {
  font-size: 0.75rem;
  color: var(--color-muted);
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
  background: #f8fafc;
  border: 1px dashed var(--color-border);
  border-radius: 0.5rem;
  flex-wrap: wrap;
  gap: 0.75rem;
}

.docente-info {
  font-size: 0.85rem;
  color: var(--color-text);
}

.docente-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.btn-warning {
  background: #f59e0b;
  color: #ffffff;
}

.btn-warning:hover {
  background: #d97706;
}

.font-mono {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
}
</style>
