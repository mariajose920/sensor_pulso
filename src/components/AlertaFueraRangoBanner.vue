<template>
  <div 
    v-if="mostrarAlerta" 
    class="alerta-fuera-rango-container anim-fade"
    :class="[
      severidadClase,
      { 'alerta-pulsante': animarPulso && alertaActiva }
    ]"
    role="alert"
    aria-live="assertive"
  >
    <div class="alerta-content-row">
      <!-- Icono SVG de Estado de Alerta -->
      <div class="alerta-icon-badge">
        <svg v-if="tipoAlerta === 'bpm_alto'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 7.65l.77.78L12 20.66l7.65-7.65.77-.78a5.4 5.4 0 0 0 0-7.65z"></path>
          <polyline points="12 6 12 12 15 9"></polyline>
        </svg>
        <svg v-else-if="tipoAlerta === 'bpm_bajo'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M20.42 4.58a5.4 5.4 0 0 0-7.65 0l-.77.78-.77-.78a5.4 5.4 0 0 0-7.65 7.65l.77.78L12 20.66l7.65-7.65.77-.78a5.4 5.4 0 0 0 0-7.65z"></path>
          <polyline points="12 12 12 6 9 9"></polyline>
        </svg>
        <svg v-else-if="tipoAlerta === 'spo2_bajo'" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"></path>
          <line x1="12" y1="9" x2="12" y2="13"></line>
          <line x1="12" y1="17" x2="12.01" y2="17"></line>
        </svg>
        <svg v-else width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"></polygon>
          <line x1="12" y1="8" x2="12" y2="12"></line>
          <line x1="12" y1="16" x2="12.01" y2="16"></line>
        </svg>
      </div>

      <!-- Texto Clínico Cuantitativo -->
      <div class="alerta-text-wrap">
        <div class="alerta-title-line">
          <strong class="alerta-headline">{{ tituloAlerta }}</strong>
          <span class="alerta-tipo-chip">{{ etiquetaTipo }}</span>
          <span v-if="alarmaSonando" class="alerta-sonido-active-chip">
            <svg class="icon-sonido-wave" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
            </svg>
            Emitiendo Alarma
          </span>
          <span v-else-if="silenciadoTemporalmente" class="alerta-silenciado-chip">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
              <line x1="23" y1="9" x2="17" y2="15"></line>
              <line x1="17" y1="9" x2="23" y2="15"></line>
            </svg>
            Silenciado
          </span>
        </div>

        <p class="alerta-diagnostico-desc">
          {{ diagnosticoTexto }}
        </p>

        <!-- Cuantificación Biométrica de la Desviación -->
        <div class="alerta-metricas-line">
          <span class="metrica-item">
            <span class="metrica-lbl">Valor medido:</span>
            <strong class="metrica-val font-mono">{{ valorFormateado }}</strong>
          </span>
          <span class="metrica-sep">·</span>
          <span class="metrica-item">
            <span class="metrica-lbl">Límite fisiológico:</span>
            <strong class="metrica-val font-mono">{{ limiteFormateado }}</strong>
          </span>
          <span class="metrica-sep">·</span>
          <span class="metrica-item">
            <span class="metrica-lbl">Desviación:</span>
            <strong class="metrica-val font-mono text-danger">{{ desviacionFormateada }}</strong>
          </span>
        </div>
      </div>

      <!-- Botones de Acción de Emergencia / Gestión Acústica -->
      <div class="alerta-actions">
        <button 
          v-if="!silenciadoTemporalmente"
          type="button" 
          class="btn btn-warning btn-sm alerta-btn"
          @click="silenciar"
          title="Silencia la alarma sonora"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
            <line x1="17" y1="9" x2="23" y2="15"></line>
          </svg>
          Silenciar Alarma
        </button>

        <button 
          v-else
          type="button" 
          class="btn btn-secondary btn-sm alerta-btn"
          @click="reanudar"
          title="Reanuda la emisión sonora"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
          Reanudar Alarma
        </button>

        <button 
          type="button" 
          class="btn btn-outline-danger btn-sm alerta-btn-descartar"
          @click="descartar"
          title="Descartar aviso visual temporalmente"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="18" y1="6" x2="6" y2="18"></line>
            <line x1="6" y1="6" x2="18" y2="18"></line>
          </svg>
          Descartar
        </button>
      </div>
    </div>

    <!-- Barra de Configuración y Preferencias Sonoras Biomédicas -->
    <div class="alerta-config-bar">
      <div class="config-bar-left">
        <label class="sonido-switch-label">
          <input 
            type="checkbox" 
            :checked="sonidoHabilitado" 
            @change="toggleSonido" 
            class="switch-checkbox"
          />
          <span class="switch-text">Alarmas sonoras biomédicas habilitadas</span>
        </label>
        <span class="config-sep">·</span>
        <button 
          type="button" 
          class="btn-link-sonido" 
          @click="probarTono" 
          title="Verificar salida de audio en el navegador"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
          Probar Tono
        </button>
      </div>

      <div class="config-bar-right">
        <span class="registro-badge">
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path>
            <polyline points="14 2 14 8 20 8"></polyline>
            <line x1="16" y1="13" x2="8" y2="13"></line>
            <line x1="16" y1="17" x2="8" y2="17"></line>
            <polyline points="10 9 9 9 8 9"></polyline>
          </svg>
          Registro activo en historial clínico (RF21)
        </span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import {
  sonidoHabilitado,
  alarmaSonando,
  silenciadoTemporalmente,
  reproducirAlertaSonora,
  silenciarAlarma,
  reanudarAlarma,
  alternarHabilitacionSonido
} from '../utils/alertaSonora.js'
import { registrarAlerta, obtenerMetadatosAlerta } from '../services/alertasService.js'

const props = defineProps({
  alertaActiva: {
    type: Boolean,
    default: false
  },
  tipo: {
    type: String,
    default: 'bpm_alto' // 'bpm_alto' | 'bpm_bajo' | 'spo2_bajo' | 'irregular' | 'senal_mala'
  },
  valor: {
    type: Number,
    default: null
  },
  limite: {
    type: Number,
    default: null
  },
  diferencia: {
    type: Number,
    default: 0
  },
  diagnostico: {
    type: String,
    default: ''
  },
  medicionId: {
    type: String,
    default: null
  },
  usuarioId: {
    type: String,
    default: null
  },
  animarPulso: {
    type: Boolean,
    default: true
  }
})

const emit = defineEmits(['alerta-emitida', 'descartada'])

const descartadoManual = ref(false)

const tipoAlerta = computed(() => props.tipo || 'bpm_alto')

const metadatos = computed(() => obtenerMetadatosAlerta(tipoAlerta.value))

const tituloAlerta = computed(() => {
  if (tipoAlerta.value === 'bpm_alto') return 'Alerta Fisiológica: Taquicardia Detectada'
  if (tipoAlerta.value === 'bpm_bajo') return 'Alerta Fisiológica: Bradicardia Detectada'
  if (tipoAlerta.value === 'spo2_bajo') return 'Alerta Crítica: Desaturación Arterial de Oxígeno'
  return 'Alerta Biomédica Fuera de Rango'
})

const etiquetaTipo = computed(() => metadatos.value.titulo)

const diagnosticoTexto = computed(() => {
  if (props.diagnostico) return props.diagnostico
  return metadatos.value.descripcion
})

const valorFormateado = computed(() => {
  if (props.valor === null || props.valor === undefined) return '--'
  return `${props.valor.toFixed(1)} ${metadatos.value.unidad}`
})

const limiteFormateado = computed(() => {
  if (props.limite === null || props.limite === undefined) return '--'
  return `${props.limite.toFixed(1)} ${metadatos.value.unidad}`
})

const desviacionFormateada = computed(() => {
  if (props.diferencia === null || props.diferencia === undefined) return '--'
  const sign = props.diferencia > 0 ? '+' : ''
  return `${sign}${props.diferencia.toFixed(1)} ${metadatos.value.unidad}`
})

const severidadClase = computed(() => {
  if (tipoAlerta.value === 'spo2_bajo' || metadatos.value.severidad === 'alta') {
    return 'severidad-alta'
  }
  if (metadatos.value.severidad === 'media') {
    return 'severidad-media'
  }
  return 'severidad-baja'
})

const mostrarAlerta = computed(() => {
  return props.alertaActiva && !descartadoManual.value
})

// Cuando la alerta activa cambia a true, resetear el descarte manual y emitir sonido
watch(
  () => props.alertaActiva,
  async (activa) => {
    if (activa) {
      descartadoManual.value = false

      // 1. Emisión sonora
      const sonoraEmitida = reproducirAlertaSonora(tipoAlerta.value)

      // 2. Registro en historial (Supabase + local)
      await registrarAlerta({
        medicionId: props.medicionId,
        usuarioId: props.usuarioId,
        tipo: tipoAlerta.value,
        valor: props.valor,
        limite: props.limite,
        sonora: sonoraEmitida
      })

      emit('alerta-emitida', {
        tipo: tipoAlerta.value,
        valor: props.valor,
        limite: props.limite,
        sonora: sonoraEmitida
      })
    }
  },
  { immediate: true }
)

// Si cambian significativamente los valores mientras la alerta está activa, refrescar sonido
watch(
  () => props.valor,
  (nuevoVal, anteriorVal) => {
    if (props.alertaActiva && nuevoVal !== null && nuevoVal !== anteriorVal) {
      reproducirAlertaSonora(tipoAlerta.value)
    }
  }
)

function silenciar() {
  silenciarAlarma()
}

function reanudar() {
  reanudarAlarma()
  reproducirAlertaSonora(tipoAlerta.value, true)
}

function descartar() {
  descartadoManual.value = true
  emit('descartada')
}

function toggleSonido(event) {
  alternarHabilitacionSonido(event.target.checked)
}

function probarTono() {
  reproducirAlertaSonora('prueba', true)
}
</script>

<style scoped>
.alerta-fuera-rango-container {
  border-radius: 0.75rem;
  margin-bottom: 1.25rem;
  overflow: hidden;
  box-shadow: 0 4px 12px rgba(185, 28, 28, 0.08);
  transition: all 0.25s ease;
}

/* Severidades Médicas */
.severidad-alta {
  background: #fef2f2;
  border: 1.5px solid #f87171;
  color: #7f1d1d;
}

.severidad-media {
  background: #fffbeb;
  border: 1.5px solid #fcd34d;
  color: #78350f;
}

.severidad-baja {
  background: #f8fafc;
  border: 1.5px solid #cbd5e1;
  color: #334155;
}

/* Borde pulsante sutil para alertas críticas sin efectos agresivos */
.alerta-pulsante {
  animation: pulsoBordeAlerta 2s infinite ease-in-out;
}

@keyframes pulsoBordeAlerta {
  0% {
    border-color: #f87171;
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.35);
  }
  50% {
    border-color: #dc2626;
    box-shadow: 0 0 0 5px rgba(239, 68, 68, 0.12);
  }
  100% {
    border-color: #f87171;
    box-shadow: 0 0 0 0 rgba(239, 68, 68, 0);
  }
}

.alerta-content-row {
  display: flex;
  align-items: flex-start;
  gap: 1rem;
  padding: 1rem 1.25rem;
}

.alerta-icon-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 44px;
  height: 44px;
  border-radius: 0.5rem;
  background: #fee2e2;
  color: #b91c1c;
  flex-shrink: 0;
  border: 1px solid #fca5a5;
}

.severidad-media .alerta-icon-badge {
  background: #fef3c7;
  color: #b45309;
  border-color: #fde68a;
}

.alerta-text-wrap {
  flex: 1;
  min-width: 0;
}

.alerta-title-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-bottom: 0.25rem;
}

.alerta-headline {
  font-size: 1rem;
  font-weight: 700;
  color: #991b1b;
}

.severidad-media .alerta-headline {
  color: #92400e;
}

.alerta-tipo-chip {
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fecaca;
}

.severidad-media .alerta-tipo-chip {
  background: #fef3c7;
  color: #92400e;
  border-color: #fde68a;
}

.alerta-sonido-active-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  background: #dbeafe;
  color: #1e40af;
  border: 1px solid #bfdbfe;
}

.alerta-silenciado-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  font-size: 0.72rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.alerta-diagnostico-desc {
  margin: 0.15rem 0 0.5rem;
  font-size: 0.88rem;
  line-height: 1.4;
  color: #7f1d1d;
}

.severidad-media .alerta-diagnostico-desc {
  color: #78350f;
}

.alerta-metricas-line {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
  font-size: 0.82rem;
  color: #4b5563;
  background: rgba(255, 255, 255, 0.65);
  padding: 0.35rem 0.65rem;
  border-radius: 0.35rem;
  border: 1px solid rgba(0, 0, 0, 0.05);
}

.metrica-lbl {
  color: #6b7280;
  margin-right: 0.2rem;
}

.metrica-val {
  color: #111827;
}

.metrica-sep {
  color: #d1d5db;
}

.alerta-actions {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  flex-shrink: 0;
}

.alerta-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.8rem;
  padding: 0.4rem 0.75rem;
  font-weight: 600;
  white-space: nowrap;
}

.alerta-btn-descartar {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  font-size: 0.75rem;
  padding: 0.3rem 0.65rem;
  background: transparent;
  border: 1px solid #fca5a5;
  color: #991b1b;
  border-radius: 0.35rem;
  cursor: pointer;
  white-space: nowrap;
}

.alerta-btn-descartar:hover {
  background: #fee2e2;
}

/* Barra inferior de preferencias de sonido y registro */
.alerta-config-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.45rem 1.25rem;
  background: rgba(0, 0, 0, 0.03);
  border-top: 1px solid rgba(0, 0, 0, 0.06);
  font-size: 0.78rem;
}

.config-bar-left {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.sonido-switch-label {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  cursor: pointer;
  user-select: none;
  font-weight: 500;
  color: #374151;
}

.switch-checkbox {
  cursor: pointer;
}

.config-sep {
  color: #9ca3af;
}

.btn-link-sonido {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: none;
  border: none;
  color: #1d4ed8;
  font-size: 0.78rem;
  font-weight: 600;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
}

.btn-link-sonido:hover {
  color: #1e40af;
}

.config-bar-right {
  display: flex;
  align-items: center;
}

.registro-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  color: #4b5563;
  font-size: 0.75rem;
}

@media (max-width: 640px) {
  .alerta-content-row {
    flex-direction: column;
  }
  .alerta-actions {
    flex-direction: row;
    width: 100%;
  }
  .alerta-btn, .alerta-btn-descartar {
    flex: 1;
    justify-content: center;
  }
}
</style>
