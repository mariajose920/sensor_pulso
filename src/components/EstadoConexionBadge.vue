<template>
  <div 
    class="estado-conexion-badge" 
    :class="[`tamano-${tamano}`, `estado-${estadoNormalizado}`]"
    :role="estadoNormalizado === 'perdida' ? 'alert' : 'status'"
    :aria-live="estadoNormalizado === 'perdida' ? 'assertive' : 'polite'"
    :title="descripcionCompleta"
  >
    <div class="indicador-circulo">
      <span v-if="estadoNormalizado === 'activa'" class="onda-pulso"></span>
      <span class="punto-estado"></span>
    </div>

    <div class="texto-bloque">
      <div class="etiqueta-fila">
        <span class="etiqueta-texto">{{ textoEtiqueta }}</span>
        
        <!-- Detalle de motivo si está finalizada -->
        <span v-if="detalleMotivo" class="motivo-chip">
          {{ detalleMotivo }}
        </span>

        <!-- Tiempo de desconexión si está perdida -->
        <span v-if="estadoNormalizado === 'perdida' && segundosSinContacto !== null" class="tiempo-chip">
          hace {{ segundosSinContacto }}s
        </span>
      </div>

      <p v-if="mostrarDescripcion" class="descripcion-texto">
        {{ descripcionCompleta }}
      </p>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import {
  ETIQUETAS_ESTADO_CONEXION,
  DESCRIPCIONES_ESTADO_CONEXION,
  ESTADOS_CONEXION,
  MOTIVOS_FIN
} from '../services/sesionMedicionService.js'

const props = defineProps({
  estado: {
    type: String,
    default: 'inactiva',
    validator: (v) => ['activa', 'perdida', 'finalizada', 'inactiva'].includes(v?.toLowerCase())
  },
  tamano: {
    type: String,
    default: 'md',
    validator: (v) => ['sm', 'md', 'lg'].includes(v)
  },
  mostrarDescripcion: {
    type: Boolean,
    default: false
  },
  motivo: {
    type: String,
    default: null
  },
  segundosSinContacto: {
    type: Number,
    default: null
  },
  etiquetaPersonalizada: {
    type: String,
    default: null
  }
})

const estadoNormalizado = computed(() => {
  const e = (props.estado || '').toLowerCase()
  if (['activa', 'perdida', 'finalizada', 'inactiva'].includes(e)) return e
  return ESTADOS_CONEXION.INACTIVA
})

const textoEtiqueta = computed(() => {
  if (props.etiquetaPersonalizada) return props.etiquetaPersonalizada
  return ETIQUETAS_ESTADO_CONEXION[estadoNormalizado.value] || 'Estado desconocido'
})

const descripcionCompleta = computed(() => {
  return DESCRIPCIONES_ESTADO_CONEXION[estadoNormalizado.value] || ''
})

const detalleMotivo = computed(() => {
  if (estadoNormalizado.value !== 'finalizada' || !props.motivo) return null
  if (props.motivo === MOTIVOS_FIN.PERDIDA_COMUNICACION) return 'por pérdida WiFi'
  if (props.motivo === MOTIVOS_FIN.SENSOR_DESCONECTADO) return 'por sensor retirado'
  if (props.motivo === MOTIVOS_FIN.USUARIO) return 'por usuario'
  return `(${props.motivo})`
})
</script>

<style scoped>
.estado-conexion-badge {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  border-radius: 9999px;
  font-weight: 600;
  transition: all 0.2s ease;
  user-select: none;
}

/* ========================================================================= */
/* TAMAÑOS                                                                  */
/* ========================================================================= */
.tamano-sm {
  padding: 0.15rem 0.55rem;
  font-size: 0.72rem;
}
.tamano-sm .indicador-circulo {
  width: 8px;
  height: 8px;
}
.tamano-sm .punto-estado {
  width: 6px;
  height: 6px;
}

.tamano-md {
  padding: 0.25rem 0.75rem;
  font-size: 0.82rem;
}
.tamano-md .indicador-circulo {
  width: 12px;
  height: 12px;
}
.tamano-md .punto-estado {
  width: 8px;
  height: 8px;
}

.tamano-lg {
  padding: 0.4rem 1rem;
  font-size: 0.95rem;
}
.tamano-lg .indicador-circulo {
  width: 14px;
  height: 14px;
}
.tamano-lg .punto-estado {
  width: 10px;
  height: 10px;
}

/* ========================================================================= */
/* ESTADO 1: ACTIVA (VERDE)                                                 */
/* ========================================================================= */
.estado-activa {
  background: #dcfce7;
  color: #166534;
  border: 1px solid #86efac;
}
.estado-activa .punto-estado {
  background: #16a34a;
}
.estado-activa .onda-pulso {
  background: rgba(22, 163, 74, 0.4);
}

/* ========================================================================= */
/* ESTADO 2: PERDIDA (ÁMBAR / ROJO)                                          */
/* ========================================================================= */
.estado-perdida {
  background: #fee2e2;
  color: #991b1b;
  border: 1px solid #fca5a5;
  animation: parpadeo-suave 1.8s infinite ease-in-out;
}
.estado-perdida .punto-estado {
  background: #dc2626;
  animation: pulso-alerta 0.9s infinite ease-in-out;
}

/* ========================================================================= */
/* ESTADO 3: FINALIZADA (GRIS)                                              */
/* ========================================================================= */
.estado-finalizada {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}
.estado-finalizada .punto-estado {
  background: #64748b;
}

/* ========================================================================= */
/* ESTADO 4: INACTIVA (AZUL SUAVE)                                          */
/* ========================================================================= */
.estado-inactiva {
  background: #e0f2fe;
  color: #0369a1;
  border: 1px solid #7dd3fc;
}
.estado-inactiva .punto-estado {
  background: #0284c7;
}

/* ========================================================================= */
/* INDICADOR DE CÍRCULO Y ANIMACIONES                                       */
/* ========================================================================= */
.indicador-circulo {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.punto-estado {
  border-radius: 50%;
  z-index: 2;
}

.onda-pulso {
  position: absolute;
  width: 180%;
  height: 180%;
  border-radius: 50%;
  z-index: 1;
  animation: radar-pulso 1.8s infinite ease-out;
}

@keyframes radar-pulso {
  0% { transform: scale(0.6); opacity: 1; }
  100% { transform: scale(2.2); opacity: 0; }
}

@keyframes pulso-alerta {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.4; transform: scale(0.85); }
}

@keyframes parpadeo-suave {
  0%, 100% { background: #fee2e2; }
  50% { background: #fef2f2; }
}

/* ========================================================================= */
/* ETIQUETAS SECUNDARIAS                                                     */
/* ========================================================================= */
.etiqueta-fila {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  flex-wrap: wrap;
}

.motivo-chip {
  font-size: 0.72rem;
  font-weight: 500;
  opacity: 0.85;
}

.tiempo-chip {
  font-family: ui-monospace, monospace;
  font-size: 0.72rem;
  background: rgba(220, 38, 38, 0.12);
  padding: 0.05rem 0.3rem;
  border-radius: 4px;
}

.descripcion-texto {
  margin: 0.2rem 0 0 0;
  font-size: 0.75rem;
  font-weight: 400;
  opacity: 0.9;
  line-height: 1.3;
}
</style>
