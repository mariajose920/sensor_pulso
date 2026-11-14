<template>
  <section
    class="confirmacion-explicita-box"
    :class="{ 'confirmacion-verificada': modelValue }"
    :data-testid="containerTestId"
  >
    <div class="confirmacion-header-row">
      <div class="confirmacion-title-wrap">
        <span class="confirmacion-shield-icon" :class="{ verificado: modelValue }" aria-hidden="true">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path v-if="modelValue" d="m9 12 2 2 4-4" />
            <path v-else d="M12 8v4M12 16h.01" />
          </svg>
        </span>
        <h3 class="confirmacion-heading">Confirmación Adicional y Explícita del Titular</h3>
      </div>

      <span v-if="modelValue" class="confirmacion-badge badge-verificada">
        Confirmación Registrada
      </span>
      <span v-else class="confirmacion-badge badge-proteccion">
        Protección del Titular · Privada por Defecto
      </span>
    </div>

    <label
      class="confirmacion-check-card"
      :class="{ marcada: modelValue }"
      :data-testid="labelTestId"
    >
      <input
        type="checkbox"
        class="confirmacion-checkbox-input"
        :checked="modelValue"
        :data-testid="checkboxTestId"
        @change="$emit('update:modelValue', $event.target.checked)"
      />
      <span class="confirmacion-check-text">
        <strong>Confirmo de forma explícita y voluntaria como titular de esta medición</strong> que autorizo su publicación anónima en la Galería Pública UNACH. Comprendo que ninguna medición se publica automáticamente y que puedo retirar esta publicación en cualquier momento.
      </span>
    </label>

    <div
      v-if="modelValue"
      class="confirmacion-status-banner status-verificada"
      role="status"
      data-testid="confirmacion-explicita-verificada"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3" aria-hidden="true">
        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
        <polyline points="22 4 12 14.01 9 11.01" />
      </svg>
      <span>
        <strong>Confirmación explícita verificada</strong> · Titular: <strong>{{ validacion.titular }}</strong> · Se registrará fecha y hora exacta de confirmación ({{ validacion.fechaTexto }})
      </span>
    </div>

    <div
      v-else
      class="confirmacion-status-banner status-bloqueada"
      role="note"
      data-testid="confirmacion-explicita-aviso-bloqueo"
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">
        <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
        <path d="M7 11V7a5 5 0 0 1 10 0v4" />
      </svg>
      <span>
        <strong>Requisito obligatorio:</strong> Ninguna medición se publica automáticamente. Debes marcar la casilla de confirmación explícita del titular para habilitar el botón de publicación.
      </span>
    </div>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import { validarConfirmacionExplicitaTitular } from '../utils/terminarMedicion.js'

const props = defineProps({
  modelValue: {
    type: Boolean,
    default: false
  },
  titular: {
    type: String,
    default: ''
  },
  checkboxTestId: {
    type: String,
    default: 'confirmacion-explicita-casilla'
  },
  labelTestId: {
    type: String,
    default: 'confirmacion-explicita-label'
  },
  containerTestId: {
    type: String,
    default: 'confirmacion-explicita-titular'
  }
})

defineEmits(['update:modelValue'])

const validacion = computed(() => validarConfirmacionExplicitaTitular({
  confirmado: props.modelValue,
  titularCorreo: props.titular
}))
</script>

<style scoped>
.confirmacion-explicita-box {
  margin-top: 1rem;
  padding: 1rem 1.15rem;
  border-radius: 0.75rem;
  background: #fffbeb;
  border: 1.5px solid #fcd34d;
  transition: background-color 0.2s ease, border-color 0.2s ease, box-shadow 0.2s ease;
}

.confirmacion-explicita-box.confirmacion-verificada {
  background: #f0f9ff;
  border-color: #93c5fd;
  box-shadow: 0 2px 10px rgba(37, 99, 235, 0.07);
}

.confirmacion-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.65rem;
  margin-bottom: 0.75rem;
}

.confirmacion-title-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.confirmacion-shield-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 0.45rem;
  background: #fef3c7;
  color: #b45309;
  flex-shrink: 0;
}

.confirmacion-shield-icon.verificado {
  background: #dbeafe;
  color: #1d4ed8;
}

.confirmacion-heading {
  margin: 0;
  font-size: 0.96rem;
  font-weight: 800;
  color: #0f172a;
}

.confirmacion-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.22rem 0.68rem;
  border-radius: 999px;
  font-size: 0.74rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.badge-proteccion {
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #f59e0b;
}

.badge-verificada {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
}

.confirmacion-check-card {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 0.85rem 1rem;
  border-radius: 0.6rem;
  background: #ffffff;
  border: 1.5px solid #f59e0b;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.confirmacion-check-card:hover {
  border-color: #d97706;
}

.confirmacion-check-card.marcada {
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
}

.confirmacion-checkbox-input {
  width: 1.15rem;
  height: 1.15rem;
  margin-top: 0.15rem;
  accent-color: #1d4ed8;
  cursor: pointer;
  flex-shrink: 0;
}

.confirmacion-check-text {
  font-size: 0.86rem;
  line-height: 1.48;
  color: #1e293b;
}

.confirmacion-status-banner {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  margin-top: 0.7rem;
  padding: 0.6rem 0.85rem;
  border-radius: 0.5rem;
  font-size: 0.8rem;
  line-height: 1.42;
}

.confirmacion-status-banner svg {
  flex-shrink: 0;
}

.status-bloqueada {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

.status-verificada {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
}
</style>
