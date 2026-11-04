<template>
  <div class="sesion-medicion-control card anim-fade" role="region" aria-label="Control de Sesión de Medición">
    <!-- ===================================================================== -->
    <!-- ESTADO 1: SESIÓN ACTIVA (EN CURSO)                                     -->
    <!-- ===================================================================== -->
    <div v-if="estaSesionActiva" class="sesion-activa-wrapper">
      <div class="sesion-top-bar">
        <div class="sesion-status-block">
          <div class="status-indicator">
            <span class="pulse-ring"></span>
            <span class="status-dot activa"></span>
          </div>
          <div>
            <div class="sesion-badge-row">
              <!-- RF11: Indicador del estado de conexión canónico -->
              <EstadoConexionBadge 
                :estado="sesionState.sesionActiva ? sesionState.sesionActiva.estado : 'inactiva'" 
                tamano="sm" 
                :motivo="sesionState.sesionActiva?.motivo_fin" 
              />
              <span class="badge badge-ronda">Ronda {{ sesionState.sesionActiva.ronda }} de 5</span>
              <span class="badge badge-sub">En Vivo (RF11)</span>
            </div>
            <h3 class="sesion-titulo">Sesión de Adquisición en Curso</h3>
          </div>
        </div>

        <!-- Cronómetro de Duración Oficial (RF09) -->
        <div class="cronometro-container" aria-live="polite">
          <span class="cronometro-label">TIEMPO TRANSCURRIDO</span>
          <div class="cronometro-display">
            <svg class="crono-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 16 14"></polyline>
            </svg>
            <span class="crono-numeros">{{ duracionCronometroTexto }}</span>
          </div>
        </div>
      </div>

      <!-- Alertas de Vigilancia en Tiempo Real (RF10, RF11) -->
      <div v-if="vigilanteState.estadoAlerta === 'perdida'" class="alert-status-banner banner-perdida anim-fade">
        <span class="warning-icon">⚠️</span>
        <div style="flex: 1;">
          <strong>Pérdida de señal WiFi con el ESP32 (RF11):</strong>
          <span> La medición se finalizará automáticamente en <strong>{{ vigilanteState.segundosGraciaRestantes }}s</strong> si no se restablece la comunicación (RF10).</span>
        </div>
      </div>
      <div v-else-if="vigilanteState.estadoAlerta === 'advertencia'" class="alert-status-banner banner-sensor anim-fade">
        <span class="warning-icon">🔌</span>
        <div style="flex: 1;">
          <strong>Sensor óptico sin lectura biológica:</strong>
          <span> Se detectó dedo retirado o sensor desconectado. Si persiste, se cerrará la sesión (RF10).</span>
        </div>
      </div>

      <!-- Metadatos de la Sesión Oficial -->
      <div class="sesion-meta-grid">
        <div class="meta-item">
          <span class="meta-label">ID de Sesión Oficial</span>
          <div class="meta-valor-copy">
            <code class="codigo-sesion" :title="sesionState.sesionActiva.id">
              #{{ sesionState.sesionActiva.id.substring(0, 8) }}...
            </code>
            <button 
              type="button" 
              class="btn-copiar-mini" 
              @click="copiarIdSesion"
              :title="copiado ? '¡Copiado!' : 'Copiar UUID completo'"
            >
              {{ copiado ? '✓ Copiado' : 'Copiar' }}
            </button>
          </div>
        </div>

        <div class="meta-item">
          <span class="meta-label">Dispositivo Asignado</span>
          <div class="meta-valor">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
              <line x1="6" y1="6" x2="6.01" y2="6"></line>
              <line x1="6" y1="18" x2="6.01" y2="18"></line>
            </svg>
            <strong>{{ sesionState.sesionActiva.dispositivo_nombre }}</strong>
          </div>
        </div>

        <div class="meta-item">
          <span class="meta-label">Iniciada Por</span>
          <div class="meta-valor">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path>
              <circle cx="12" cy="7" r="4"></circle>
            </svg>
            <span>{{ sesionState.sesionActiva.iniciada_por_nombre || 'Operador' }}</span>
          </div>
        </div>

        <div class="meta-item">
          <span class="meta-label">Hora de Inicio</span>
          <div class="meta-valor">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"></circle>
              <polyline points="12 6 12 12 14 10"></polyline>
            </svg>
            <span>{{ horaInicioTexto }}</span>
          </div>
        </div>
      </div>

      <!-- Barra de Acciones de la Sesión en Curso -->
      <div class="sesion-acciones-footer">
        <div class="acciones-info">
          <span class="info-dot"></span>
          <span>Todos los paquetes de bioseñales y mediciones guardadas se asociarán a esta sesión.</span>
        </div>

        <div class="botones-fila">
          <!-- Simulaciones de Diagnóstico y Pruebas RF10 -->
          <div class="test-rf10-row">
            <button 
              type="button" 
              class="btn-test-rf10" 
              @click="forzarSimulacionPerdidaWiFi"
              title="Simula pérdida de señal WiFi durante más de 10s para probar el cierre automático (RF10)"
            >
              ⚡ Test Pérdida WiFi
            </button>
            <button 
              type="button" 
              class="btn-test-rf10" 
              @click="forzarSimulacionSensorDesconectado"
              title="Simula desconexión física del sensor MAX30102 o dedo retirado por más de 8s (RF10)"
            >
              🔌 Test Desconexión Sensor
            </button>
          </div>

          <button 
            type="button" 
            class="btn btn-secondary btn-sm btn-ronda" 
            :disabled="avanzandoRonda"
            @click="onAvanzarRonda"
            title="Incrementar ronda y liberar los 5 canales para el siguiente grupo de estudiantes (RF111)"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="23 4 23 10 17 10"></polyline>
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
            </svg>
            <span>{{ avanzandoRonda ? 'Avanzando...' : 'Siguiente Ronda (RF111)' }}</span>
          </button>

          <button 
            type="button" 
            class="btn btn-danger btn-sm" 
            :disabled="sesionState.cargando"
            @click="confirmarFinalizar"
            title="Finalizar sesión oficial de medición (RF10)"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <rect x="4" y="4" width="16" height="16" rx="2" ry="2"></rect>
            </svg>
            <span>Finalizar Sesión</span>
          </button>
        </div>
      </div>
    </div>

    <!-- ===================================================================== -->
    <!-- ESTADO 2: SIN SESIÓN ACTIVA (EN ESPERA DE INICIAR RF09)                -->
    <!-- ===================================================================== -->
    <div v-else class="sesion-inactiva-wrapper">
      <div class="inactiva-top">
        <div class="icono-flotante">
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
          </svg>
        </div>
        <div class="inactiva-texto">
          <div class="badge-tag-wrap">
            <span class="badge badge-primary">RF09 · Sesión de Medición</span>
            <span class="badge badge-neutral">Protocolo Clínico y Multiusuario</span>
          </div>
          <h3 class="inactiva-titulo">Iniciar Sesión de Medición Oficial</h3>
          <p class="inactiva-desc">
            Al iniciar la sesión se crea el registro oficial en la base de datos de telemetría (PostgreSQL), se activa el cronómetro institucional y se habilitan los 5 canales libres para la asignación de los estudiantes.
          </p>
        </div>
      </div>

      <!-- Configuración Rápida de la Sesión -->
      <div class="config-rapida-grid">
        <div class="config-item">
          <label class="config-label" for="select-dispositivo">Dispositivo ESP32 (RF54):</label>
          <select id="select-dispositivo" v-model="formDispositivo" class="select-custom">
            <option value="ESP32-Biomedico-01">ESP32-Biomedico-01 (Laboratorio Principal)</option>
            <option value="ESP32-Biomedico-02">ESP32-Biomedico-02 (Sala Bioingeniería)</option>
            <option value="ESP32-Emulador-Web">Emulador WiFi / Datos Sintéticos</option>
          </select>
        </div>

        <div class="config-item">
          <label class="config-label" for="input-ronda">Ronda de Medición (RF111):</label>
          <select id="input-ronda" v-model.number="formRonda" class="select-custom">
            <option :value="1">Ronda 1 (Grupo de 5 inicial)</option>
            <option :value="2">Ronda 2</option>
            <option :value="3">Ronda 3</option>
            <option :value="4">Ronda 4</option>
            <option :value="5">Ronda 5</option>
          </select>
        </div>

        <div class="config-item">
          <label class="config-label" for="select-canal-inicial">Mi Canal Inicial (RF12):</label>
          <select id="select-canal-inicial" v-model.number="formCanalInicial" class="select-custom">
            <option :value="1">Canal 1 (Predeterminado)</option>
            <option :value="2">Canal 2</option>
            <option :value="3">Canal 3</option>
            <option :value="4">Canal 4</option>
            <option :value="5">Canal 5</option>
          </select>
        </div>
      </div>

      <!-- Mensajes de Estado o Error -->
      <div v-if="sesionState.error" class="alert alert-danger" style="margin-top: 0.75rem;">
        {{ sesionState.error }}
      </div>
      <div v-if="mensajeExito" class="alert alert-success" style="margin-top: 0.75rem;">
        {{ mensajeExito }}
      </div>

      <!-- Botón de Inicio Principal RF09 -->
      <div class="iniciar-btn-container">
        <button 
          type="button" 
          class="btn btn-primary btn-lg btn-iniciar"
          :disabled="sesionState.cargando"
          @click="onIniciarSesion"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          <span>{{ sesionState.cargando ? 'Iniciando sesión oficial...' : 'Iniciar Sesión de Medición (RF09)' }}</span>
        </button>
      </div>
    </div>

    <!-- Modal de Confirmación para Finalizar Manualmente -->
    <div v-if="modalFinalizarVisible" class="modal-backdrop">
      <div class="modal-card" role="dialog" aria-modal="true" aria-labelledby="modal-fin-titulo">
        <div class="modal-header">
          <h4 id="modal-fin-titulo" style="margin: 0; color: #b91c1c; display: flex; align-items: center; gap: 0.5rem;">
            <span>⚠️</span> Finalizar Sesión de Medición
          </h4>
        </div>
        <div class="modal-body">
          <p>
            ¿Estás seguro de finalizar la sesión <strong>#{{ sesionState.sesionActiva?.id.substring(0, 8) }}</strong>?
          </p>
          <p style="font-size: 0.88rem; color: #64748b; margin-top: 0.25rem;">
            Se detendrá el cronómetro clínico con <strong>{{ duracionCronometroTexto }}</strong> y el estado pasará a <code>finalizada</code>.
          </p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-secondary" @click="modalFinalizarVisible = false">
            Cancelar
          </button>
          <button type="button" class="btn btn-danger" @click="ejecutarFinalizar">
            Sí, Finalizar Medición
          </button>
        </div>
      </div>
    </div>

    <!-- Modal de Alerta por Pérdida de Comunicación o Desconexión del Sensor (RF10) -->
    <AlertaDesconexionModal 
      @nueva-sesion="onIniciarSesion" 
      @ver-resultados="emit('ver-resultados')" 
    />
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import {
  sesionState,
  estaSesionActiva,
  duracionCronometroTexto,
  iniciarSesion,
  finalizarSesion,
  avanzarRondaSesion,
  MOTIVOS_FIN
} from '../services/sesionMedicionService.js'
import {
  vigilanteState,
  forzarSimulacionPerdidaWiFi,
  forzarSimulacionSensorDesconectado
} from '../services/vigilanteConexionService.js'
import AlertaDesconexionModal from './AlertaDesconexionModal.vue'
import EstadoConexionBadge from './EstadoConexionBadge.vue'

const formDispositivo = ref('ESP32-Biomedico-01')
const formRonda = ref(1)
const formCanalInicial = ref(1)
const copiado = ref(false)
const mensajeExito = ref('')
const avanzandoRonda = ref(false)
const modalFinalizarVisible = ref(false)

const emit = defineEmits(['sesion-iniciada', 'sesion-finalizada', 'ver-resultados'])

const horaInicioTexto = computed(() => {
  if (!sesionState.sesionActiva?.inicio) return '--:--:--'
  try {
    const d = new Date(sesionState.sesionActiva.inicio)
    return d.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
  } catch {
    return '--:--:--'
  }
})

async function onIniciarSesion() {
  mensajeExito.value = ''
  const res = await iniciarSesion({
    dispositivoNombre: formDispositivo.value,
    ronda: formRonda.value,
    canalInicial: formCanalInicial.value
  })

  if (res.ok) {
    mensajeExito.value = res.mensaje
    emit('sesion-iniciada', res.sesion)
    setTimeout(() => { mensajeExito.value = '' }, 4000)
  }
}

function copiarIdSesion() {
  if (!sesionState.sesionActiva?.id) return
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    navigator.clipboard.writeText(sesionState.sesionActiva.id)
    copiado.value = true
    setTimeout(() => { copiado.value = false }, 2500)
  }
}

async function onAvanzarRonda() {
  avanzandoRonda.value = true
  try {
    const res = await avanzarRondaSesion()
    if (res.ok) {
      formRonda.value = res.ronda
    }
  } finally {
    avanzandoRonda.value = false
  }
}

function confirmarFinalizar() {
  modalFinalizarVisible.value = true
}

async function ejecutarFinalizar() {
  modalFinalizarVisible.value = false
  const res = await finalizarSesion({ motivo: MOTIVOS_FIN.USUARIO })
  if (res.ok) {
    emit('sesion-finalizada', res.sesion)
  }
}
</script>

<style scoped>
.sesion-medicion-control {
  margin-bottom: 1.25rem;
  border-radius: 10px;
  background: #ffffff;
  border: 1px solid var(--color-border);
  box-shadow: 0 2px 6px rgba(0,0,0,0.04);
  overflow: hidden;
}

/* ========================================================================= */
/* ESTADO 1: SESIÓN ACTIVA                                                  */
/* ========================================================================= */
.sesion-activa-wrapper {
  padding: 1.1rem 1.4rem;
  background: linear-gradient(180deg, #f0fdf4 0%, #ffffff 100%);
  border-left: 5px solid #16a34a;
}

.sesion-top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 1rem;
  padding-bottom: 0.85rem;
  border-bottom: 1px solid #dcfce7;
}

.sesion-status-block {
  display: flex;
  align-items: center;
  gap: 0.85rem;
}

.status-indicator {
  position: relative;
  width: 16px;
  height: 16px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.status-dot {
  width: 12px;
  height: 12px;
  border-radius: 50%;
}

.status-dot.activa {
  background: #16a34a;
}

.pulse-ring {
  position: absolute;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  background: rgba(22, 163, 74, 0.35);
  animation: pulse-kf 1.6s infinite ease-out;
}

@keyframes pulse-kf {
  0% { transform: scale(0.6); opacity: 1; }
  100% { transform: scale(1.6); opacity: 0; }
}

.sesion-badge-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  flex-wrap: wrap;
  margin-bottom: 0.2rem;
}

.badge-activa {
  background: #dcfce7;
  color: #166534;
  font-weight: 700;
  font-size: 0.72rem;
  padding: 0.15rem 0.55rem;
  border-radius: 4px;
}

.badge-ronda {
  background: #e0f2fe;
  color: #0369a1;
  font-weight: 600;
  font-size: 0.72rem;
  padding: 0.15rem 0.55rem;
  border-radius: 4px;
}

.badge-sub {
  background: #f1f5f9;
  color: #475569;
  font-size: 0.72rem;
  padding: 0.15rem 0.45rem;
  border-radius: 4px;
}

.sesion-titulo {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 700;
  color: #0f172a;
}

/* Alertas de Conexión en Tiempo Real (RF10, RF11) */
.alert-status-banner {
  display: flex;
  align-items: center;
  gap: 0.65rem;
  padding: 0.6rem 0.85rem;
  border-radius: 6px;
  font-size: 0.85rem;
  margin-top: 0.75rem;
}

.banner-perdida {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.banner-sensor {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
}

.warning-icon {
  font-size: 1.15rem;
  flex-shrink: 0;
}

/* Cronómetro Digital */
.cronometro-container {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  background: #ffffff;
  padding: 0.45rem 0.9rem;
  border-radius: 8px;
  border: 1px solid #bbf7d0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.03);
}

.cronometro-label {
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.05em;
  color: #15803d;
}

.cronometro-display {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.crono-icon {
  color: #16a34a;
}

.crono-numeros {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 1.45rem;
  font-weight: 800;
  color: #0f172a;
  letter-spacing: 0.04em;
}

/* Metadatos */
.sesion-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 0.75rem;
  margin: 0.9rem 0;
}

.meta-item {
  background: #ffffff;
  padding: 0.55rem 0.8rem;
  border-radius: 6px;
  border: 1px solid #e2e8f0;
}

.meta-label {
  display: block;
  font-size: 0.72rem;
  color: #64748b;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  font-weight: 600;
  margin-bottom: 0.25rem;
}

.meta-valor {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.88rem;
  color: #1e293b;
}

.meta-valor-copy {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.codigo-sesion {
  font-size: 0.82rem;
  background: #f8fafc;
  padding: 0.15rem 0.35rem;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
  color: #0284c7;
}

.btn-copiar-mini {
  background: none;
  border: 1px solid #cbd5e1;
  border-radius: 4px;
  padding: 0.15rem 0.45rem;
  font-size: 0.7rem;
  cursor: pointer;
  color: #475569;
  transition: all 0.15s ease;
}

.btn-copiar-mini:hover {
  background: #f1f5f9;
  border-color: #94a3b8;
}

/* Footer y Botones */
.sesion-acciones-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-top: 0.85rem;
  border-top: 1px solid #f1f5f9;
}

.acciones-info {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.8rem;
  color: #64748b;
}

.info-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #10b981;
}

.botones-fila {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  flex-wrap: wrap;
}

/* Botones de prueba RF10 */
.test-rf10-row {
  display: flex;
  align-items: center;
  gap: 0.4rem;
}

.btn-test-rf10 {
  background: #f8fafc;
  border: 1px dashed #cbd5e1;
  border-radius: 4px;
  padding: 0.25rem 0.55rem;
  font-size: 0.72rem;
  color: #475569;
  cursor: pointer;
  font-weight: 600;
  transition: all 0.15s ease;
}

.btn-test-rf10:hover {
  background: #fee2e2;
  border-color: #f87171;
  color: #b91c1c;
}

/* ========================================================================= */
/* ESTADO 2: SIN SESIÓN ACTIVA                                              */
/* ========================================================================= */
.sesion-inactiva-wrapper {
  padding: 1.25rem 1.4rem;
  background: #ffffff;
  border-left: 5px solid #0284c7;
}

.inactiva-top {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
}

.icono-flotante {
  width: 48px;
  height: 48px;
  border-radius: 10px;
  background: #e0f2fe;
  color: #0284c7;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.inactiva-texto {
  flex: 1;
}

.badge-tag-wrap {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.25rem;
}

.badge-neutral {
  background: #f1f5f9;
  color: #475569;
  font-size: 0.72rem;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
}

.inactiva-titulo {
  margin: 0.15rem 0 0.35rem;
  font-size: 1.2rem;
  color: #0f172a;
}

.inactiva-desc {
  margin: 0;
  font-size: 0.88rem;
  color: #475569;
  line-height: 1.45;
}

.config-rapida-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 0.85rem;
  margin: 1.1rem 0 0.85rem;
  padding: 0.85rem 1rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
}

.config-item {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.config-label {
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
}

.select-custom {
  padding: 0.45rem 0.65rem;
  border-radius: 6px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  font-size: 0.85rem;
  color: #1e293b;
}

.iniciar-btn-container {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.85rem;
}

.btn-iniciar {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.95rem;
  padding: 0.65rem 1.4rem;
  font-weight: 700;
  box-shadow: 0 2px 4px rgba(2, 132, 199, 0.2);
}

/* Modal */
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(2px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-card {
  background: #ffffff;
  border-radius: 10px;
  max-width: 440px;
  width: 100%;
  padding: 1.4rem;
  box-shadow: 0 10px 25px rgba(0,0,0,0.15);
}

.modal-header {
  margin-bottom: 0.85rem;
}

.modal-body {
  font-size: 0.92rem;
  color: #334155;
  line-height: 1.45;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.6rem;
  margin-top: 1.25rem;
}

@media (max-width: 640px) {
  .sesion-top-bar {
    flex-direction: column;
    align-items: flex-start;
  }
  .cronometro-container {
    align-items: flex-start;
    width: 100%;
  }
  .iniciar-btn-container {
    justify-content: stretch;
  }
  .btn-iniciar {
    width: 100%;
    justify-content: center;
  }
  .botones-fila {
    width: 100%;
    justify-content: space-between;
  }
}
</style>
