<template>
  <div v-if="vigilanteState.alertaModal" class="alerta-desconexion-backdrop" role="dialog" aria-modal="true" aria-labelledby="alerta-desconexion-titulo">
    <div class="alerta-card anim-scale">
      <div class="alerta-header">
        <div class="icono-peligro">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>
        </div>
        <div class="titulo-wrap">
          <div class="alerta-badges">
            <span class="badge badge-rf10">RF10 · Cierre Automático</span>
            <span 
              class="badge" 
              :class="vigilanteState.alertaModal.motivo === 'perdida_comunicacion' ? 'badge-wifi' : 'badge-sensor'"
            >
              {{ vigilanteState.alertaModal.motivo === 'perdida_comunicacion' ? '📡 Pérdida de Comunicación WiFi' : '🔌 Sensor Desconectado' }}
            </span>
          </div>
          <h3 id="alerta-desconexion-titulo" class="alerta-titulo">
            {{ vigilanteState.alertaModal.titulo }}
          </h3>
        </div>
      </div>

      <div class="alerta-body">
        <p class="alerta-descripcion">
          {{ vigilanteState.alertaModal.mensaje }}
        </p>

        <!-- Resumen de la Medición hasta el Corte -->
        <div class="corte-resumen-box">
          <div class="resumen-item">
            <span class="resumen-label">Duración antes del corte</span>
            <strong class="resumen-val">{{ duracionTexto }}</strong>
          </div>
          <div class="resumen-item">
            <span class="resumen-label">Sesión Cerrada</span>
            <strong class="resumen-val code-val">#{{ vigilanteState.alertaModal.idSesion ? vigilanteState.alertaModal.idSesion.substring(0, 8) : 'N/A' }}</strong>
          </div>
          <div class="resumen-item">
            <span class="resumen-label">Estado en Base de Datos</span>
            <span class="badge badge-finalizada">finalizada</span>
          </div>
        </div>

        <!-- Recomendación Técnica -->
        <div class="recomendacion-box">
          <div class="rec-icon">💡</div>
          <div class="rec-text">
            <strong>Recomendación técnica para reanudar:</strong>
            <p v-if="vigilanteState.alertaModal.motivo === 'perdida_comunicacion'">
              Verifica que el ESP32 esté encendido con luz fija o parpadeante, conectado a la red WiFi del laboratorio y que el endpoint <code>/api/esp32/telemetria</code> esté respondiendo.
            </p>
            <p v-else>
              Asegúrate de que el sensor MAX30102 esté conectado a los pines I2C (SDA en pin 21 y SCL en pin 22) y que el paciente tenga el dedo colocado de manera estable sobre el LED rojo/infrarrojo.
            </p>
          </div>
        </div>
      </div>

      <div class="alerta-footer">
        <button 
          type="button" 
          class="btn btn-secondary" 
          @click="onVerResultadosParciales"
        >
          <span>Ver Resultados Capturados</span>
        </button>

        <button 
          type="button" 
          class="btn btn-primary" 
          @click="onIniciarNuevaSesion"
        >
          <span>▶ Iniciar Nueva Sesión</span>
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { vigilanteState, descartarAlertaModal } from '../services/vigilanteConexionService.js'
import { formatearDuracion } from '../services/sesionMedicionService.js'

const emit = defineEmits(['nueva-sesion', 'ver-resultados'])

const duracionTexto = computed(() => {
  return formatearDuracion(vigilanteState.alertaModal?.duracionSegundos || 0)
})

function onIniciarNuevaSesion() {
  descartarAlertaModal()
  emit('nueva-sesion')
}

function onVerResultadosParciales() {
  descartarAlertaModal()
  emit('ver-resultados')
}
</script>

<style scoped>
.alerta-desconexion-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.6);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 1.25rem;
}

.alerta-card {
  background: #ffffff;
  border-radius: 12px;
  max-width: 540px;
  width: 100%;
  padding: 1.5rem;
  box-shadow: 0 20px 35px -5px rgba(0, 0, 0, 0.25);
  border-top: 6px solid #ef4444;
}

.anim-scale {
  animation: scale-up 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}

@keyframes scale-up {
  from { transform: scale(0.92); opacity: 0; }
  to { transform: scale(1); opacity: 1; }
}

.alerta-header {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

.icono-peligro {
  width: 52px;
  height: 52px;
  border-radius: 12px;
  background: #fee2e2;
  color: #dc2626;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.titulo-wrap {
  flex: 1;
}

.alerta-badges {
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex-wrap: wrap;
  margin-bottom: 0.35rem;
}

.badge-rf10 {
  background: #fee2e2;
  color: #991b1b;
  font-weight: 700;
  font-size: 0.72rem;
  padding: 0.15rem 0.55rem;
  border-radius: 4px;
}

.badge-wifi {
  background: #fef3c7;
  color: #92400e;
  font-size: 0.72rem;
  padding: 0.15rem 0.55rem;
  border-radius: 4px;
  font-weight: 600;
}

.badge-sensor {
  background: #ffedd5;
  color: #9a3412;
  font-size: 0.72rem;
  padding: 0.15rem 0.55rem;
  border-radius: 4px;
  font-weight: 600;
}

.alerta-titulo {
  margin: 0;
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  line-height: 1.35;
}

.alerta-body {
  font-size: 0.93rem;
  color: #334155;
}

.alerta-descripcion {
  margin: 0 0 1rem 0;
  line-height: 1.5;
}

.corte-resumen-box {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  gap: 0.65rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  padding: 0.75rem 0.9rem;
  border-radius: 8px;
  margin-bottom: 1rem;
}

.resumen-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.resumen-label {
  font-size: 0.72rem;
  color: #64748b;
  text-transform: uppercase;
  font-weight: 600;
  letter-spacing: 0.03em;
}

.resumen-val {
  font-size: 1rem;
  color: #0f172a;
}

.code-val {
  font-family: ui-monospace, SFMono-Regular, monospace;
  font-size: 0.88rem;
  color: #0284c7;
}

.badge-finalizada {
  background: #f1f5f9;
  color: #475569;
  font-size: 0.75rem;
  padding: 0.15rem 0.5rem;
  border-radius: 4px;
  display: inline-block;
  width: fit-content;
}

.recomendacion-box {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  padding: 0.75rem 0.9rem;
  border-radius: 8px;
  font-size: 0.85rem;
  color: #166534;
}

.rec-icon {
  font-size: 1.15rem;
  flex-shrink: 0;
  margin-top: 1px;
}

.rec-text p {
  margin: 0.25rem 0 0 0;
  line-height: 1.45;
  color: #15803d;
}

.alerta-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.4rem;
  padding-top: 1rem;
  border-top: 1px solid #f1f5f9;
  flex-wrap: wrap;
}

@media (max-width: 640px) {
  .alerta-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .alerta-footer {
    flex-direction: column;
  }
  .alerta-footer .btn {
    width: 100%;
    justify-content: center;
  }
}
</style>
