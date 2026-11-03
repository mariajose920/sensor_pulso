<template>
  <div v-if="mostrarAviso" class="modal-backdrop">
    <div class="modal-card">
      <div class="inactividad-icono">⏱️</div>
      <h3 class="modal-title">Sesión a punto de expirar</h3>
      <p class="modal-subtitle">
        No se ha detectado actividad reciente. Por tu seguridad, tu sesión se cerrará automáticamente en:
      </p>

      <div class="conteo-box">
        <span class="segundos-numero">{{ segundosParaCierre }}</span>
        <span class="segundos-label">segundos</span>
      </div>

      <div class="modal-actions">
        <button type="button" @click="ejecutarCierrePorInactividad" class="btn btn-secondary">
          Cerrar Sesión Ahora
        </button>
        <button type="button" @click="mantenerSesionActiva" class="btn btn-primary">
          Continuar Sesión
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useInactivity } from '../composables/useInactivity'

const { 
  mostrarAviso, 
  segundosParaCierre, 
  mantenerSesionActiva, 
  ejecutarCierrePorInactividad 
} = useInactivity()
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 1rem;
}

.modal-card {
  background: var(--color-surface, #ffffff);
  border-radius: 0.75rem;
  max-width: 440px;
  width: 100%;
  padding: 1.75rem;
  text-align: center;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
  animation: fadeIn 0.2s ease-out;
}

.inactividad-icono {
  font-size: 2.5rem;
  margin-bottom: 0.5rem;
}

.modal-title {
  font-size: 1.35rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}

.modal-subtitle {
  font-size: 0.9rem;
  color: var(--color-muted, #64748b);
  margin-bottom: 1.25rem;
  line-height: 1.4;
}

.conteo-box {
  background: #fef2f2;
  border: 1px solid #fee2e2;
  padding: 1rem;
  border-radius: 0.5rem;
  margin-bottom: 1.5rem;
  display: flex;
  flex-direction: column;
  align-items: center;
}

.segundos-numero {
  font-size: 2.25rem;
  font-weight: 800;
  color: #dc2626;
  font-family: monospace;
  line-height: 1;
}

.segundos-label {
  font-size: 0.8rem;
  color: #991b1b;
  font-weight: 600;
  text-transform: uppercase;
  margin-top: 0.25rem;
}

.modal-actions {
  display: flex;
  justify-content: center;
  gap: 0.75rem;
}

@keyframes fadeIn {
  from { opacity: 0; transform: scale(0.95); }
  to { opacity: 1; transform: scale(1); }
}
</style>