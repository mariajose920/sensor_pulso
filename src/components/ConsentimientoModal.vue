<template>
  <div v-if="visible" class="modal-backdrop" @click.self="rechazar">
    <div class="modal-container card" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <!-- Encabezado del Consentimiento -->
      <div class="modal-header">
        <div>
          <h2 id="consent-title" class="modal-title">
            Consentimiento Informado para Medición
          </h2>
          <span class="version-tag">Documento oficial — Versión {{ doc.version }}</span>
        </div>
        <button 
          type="button" 
          class="btn-close" 
          @click="rechazar"
          aria-label="Cerrar modal"
        >
          ✕
        </button>
      </div>

      <!-- Cuerpo del Documento -->
      <div class="modal-body">
        <div class="alerta-medica">
          <strong>Aviso importante:</strong> La plataforma <em>sensor pulso</em> y los dispositivos asociados son herramientas didácticas y pedagógicas de la Universidad Adventista de Chile (UNACH). <strong>No constituyen un dispositivo médico ni proporcionan diagnósticos clínicos.</strong>
        </div>

        <div class="secciones-consentimiento">
          <!-- Pilar 1: Finalidad (RF76) -->
          <div class="seccion-item pilar-card">
            <div class="pilar-header">
              <h3 class="seccion-titulo">Finalidad del Tratamiento</h3>
            </div>
            <p class="seccion-texto">{{ doc.finalidad }}</p>
            <div class="pilar-nota">
              <strong>Uso restringido:</strong> Estrictamente didáctico y de laboratorio universitario. Los datos no se utilizarán para diagnósticos médicos clínicos ni para fines comerciales.
            </div>
          </div>

          <!-- Pilar 2: Datos Recogidos (RF76) -->
          <div class="seccion-item pilar-card">
            <div class="pilar-header">

              <h3 class="seccion-titulo">Datos Fisiológicos y Factores Recogidos</h3>
            </div>
            <p class="seccion-texto">{{ doc.datosRecogidos }}</p>
            
            <ul class="datos-lista">
              <li>Fotopletismografía (PPG IR y Rojo a 100 Hz)</li>
              <li>Frecuencia Cardíaca (BPM)</li>
              <li>Saturación de Oxígeno (% SpO₂)</li>
              <li>Variabilidad R-R (HRV / pulso)</li>
              <li>Factores RF03 (estrés, sueño, cafeína, medicación)</li>
            </ul>
            <small class="seccion-hint">
              Los factores declarados en la Ficha del Paciente se asocian de forma confidencial a la curva fotopletismográfica capturada.
            </small>
          </div>

          <!-- Pilar 3: Quién los trata (RF76) -->
          <div class="seccion-item pilar-card">
            <div class="pilar-header">
              <h3 class="seccion-titulo">Quién los Trata (Responsable del Tratamiento)</h3>
            </div>
            <p class="seccion-texto">{{ doc.responsable }}</p>
            <p class="seccion-texto" style="margin-top: 0.35rem;">
              <strong>Seguridad y resguardo técnico:</strong> Almacenamiento protegido mediante Row Level Security (RLS) en Supabase PostgreSQL, cifrado TLS en tránsito y aislamiento por cuenta de usuario.
            </p>
          </div>

          <!-- Pilar 4: Plazo de conservación (RF76) -->
          <div class="seccion-item pilar-card">
            <div class="pilar-header">
              <h3 class="seccion-titulo">Plazo de Conservación y Derechos del Titular</h3>
            </div>
            <p class="seccion-texto">
              {{ doc.plazoConservacion }}
            </p>
            <div class="pilar-nota">
              <strong>Derechos de Supresión y Revocación:</strong> El titular de los datos puede revocar este consentimiento o solicitar la eliminación total de sus registros en cualquier momento.
            </div>
          </div>

          <!-- 5. Registro Inmutable de Auditoría (RF59) -->
          <div class="seccion-item auditoria-box">
            <div class="pilar-header">
              <span class="pilar-badge badge-pilar5">Auditoría RF59</span>
              <h3 class="seccion-titulo" style="color: #1e40af;">Registro Inmutable de Versión, Fecha y Hora</h3>
            </div>
            <p class="seccion-texto">
              Al otorgar el consentimiento, la plataforma registrará de forma permanente e inmutable la <strong>Versión {{ doc.version }}</strong> con la <strong>fecha y hora exacta</strong> del momento de aceptación.
            </p>
          </div>
        </div>

        <!-- Declaración Expresa -->
        <div class="declaracion-caja">
          <p class="declaracion-texto">
            <em>"{{ doc.textoLegal }}"</em>
          </p>
          <label class="checkbox-label">
            <input 
              v-model="aceptadoCheckbox" 
              type="checkbox" 
              class="checkbox-input"
            />
            <span class="checkbox-text">
              He leído detenidamente, comprendo y otorgo mi consentimiento expreso, previo, informado y específico para los 4 aspectos señalados (RF76).
            </span>
          </label>
        </div>
      </div>

      <!-- Acciones -->
      <div class="modal-footer">
        <button 
          type="button" 
          class="btn btn-outline-danger"
          @click="rechazar"
        >
          No acepto / Cancelar
        </button>
        <button 
          type="button" 
          class="btn btn-primary"
          :disabled="!aceptadoCheckbox || guardando"
          @click="confirmarAceptacion"
        >
          {{ guardando ? 'Guardando...' : 'Aceptar y Habilitar Medición' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, watch, onMounted } from 'vue'
import {
  consentimientoService,
  CONSENTIMIENTO_BASE,
  consentimientoEstado,
  formatearFechaHora
} from '../services/consentimientoService'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false
  },
  forzoso: {
    type: Boolean,
    default: false
  }
})

const emit = defineEmits(['aceptado', 'rechazado', 'cerrar'])

const doc = ref(CONSENTIMIENTO_BASE)
const aceptadoCheckbox = ref(false)
const guardando = ref(false)
const historial = ref([])
const mostrarHistorial = ref(false)

async function cargarHistorial() {
  try {
    historial.value = await consentimientoService.obtenerHistorialRegistros()
  } catch (e) {
    historial.value = []
  }
}

watch(() => props.visible, async (val) => {
  if (val) {
    aceptadoCheckbox.value = false
    await cargarHistorial()
  }
})

onMounted(async () => {
  doc.value = await consentimientoService.obtenerVersionActiva()
  await cargarHistorial()
})

function rechazar() {
  emit('rechazado')
  emit('cerrar')
}

async function confirmarAceptacion() {
  if (!aceptadoCheckbox.value) return
  guardando.value = true
  try {
    const res = await consentimientoService.aceptarConsentimiento(doc.value.version)
    await cargarHistorial()
    emit('aceptado', res.data)
  } catch (err) {
    console.error('Error al registrar consentimiento (RF59):', err)
  } finally {
    guardando.value = false
  }
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}

.modal-container {
  width: 100%;
  max-width: 680px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 0.75rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border: 1px solid #cbd5e1;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  color: #0f172a;
  margin: 0.35rem 0 0.15rem 0;
}

.version-tag {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 500;
}

.btn-close {
  background: transparent;
  border: none;
  font-size: 1.2rem;
  color: #64748b;
  cursor: pointer;
  padding: 0.25rem 0.5rem;
  line-height: 1;
}

.btn-close:hover {
  color: #0f172a;
}

.modal-body {
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  flex: 1;
}

.alerta-medica {
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  padding: 0.75rem 1rem;
  border-radius: 0.4rem;
  font-size: 0.85rem;
  line-height: 1.45;
  margin-bottom: 1.2rem;
}

.secciones-consentimiento {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.seccion-item {
  background: #f8fafc;
  padding: 0.75rem 1rem;
  border-radius: 0.4rem;
  border: 1px solid #e2e8f0;
}

.auditoria-box {
  background: #f0f7ff;
  border-left: 3px solid #2563eb;
}

.registro-previo-tag {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #1e40af;
  background: #dbeafe;
  padding: 0.35rem 0.65rem;
  border-radius: 0.25rem;
  font-weight: 500;
}

.historial-container {
  margin-top: 0.5rem;
  padding-top: 0.5rem;
  border-top: 1px dashed #cbd5e1;
}

.btn-toggle-historial {
  background: transparent;
  border: none;
  color: #2563eb;
  font-size: 0.75rem;
  cursor: pointer;
  padding: 0;
  text-decoration: underline;
  font-weight: 500;
}

.btn-toggle-historial:hover {
  color: #1d4ed8;
}

.historial-lista {
  margin: 0.4rem 0 0 0;
  padding-left: 1.2rem;
  font-size: 0.75rem;
  color: #334155;
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.historial-item {
  display: flex;
  gap: 0.5rem;
}

.historial-version {
  font-weight: 600;
  color: #1e3a8a;
}

.historial-fecha {
  color: #475569;
}

.historial-origen {
  font-size: 0.7rem;
  color: #94a3b8;
}

.seccion-titulo {
  font-size: 0.875rem;
  font-weight: 700;
  color: #1e3a8a;
  margin: 0 0 0.35rem 0;
}

.seccion-texto {
  font-size: 0.825rem;
  color: #334155;
  margin: 0;
  line-height: 1.45;
}

.seccion-hint {
  display: block;
  font-size: 0.75rem;
  color: #64748b;
  margin-top: 0.35rem;
}

.declaracion-caja {
  margin-top: 1.25rem;
  padding: 1rem;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 0.5rem;
}

.declaracion-texto {
  font-size: 0.825rem;
  color: #166534;
  margin: 0 0 0.75rem 0;
  line-height: 1.45;
}

.checkbox-label {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  cursor: pointer;
  user-select: none;
}

.checkbox-input {
  margin-top: 0.15rem;
  width: 1.1rem;
  height: 1.1rem;
  cursor: pointer;
  accent-color: #2563eb;
}

.checkbox-text {
  font-size: 0.85rem;
  font-weight: 600;
  color: #0f172a;
  line-height: 1.35;
}

.btn-outline-danger {
  background: transparent;
  border: 1px solid #ef4444;
  color: #b91c1c;
  padding: 0.5rem 1rem;
  border-radius: 0.375rem;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-outline-danger:hover {
  background: #fef2f2;
  border-color: #dc2626;
  color: #991b1b;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #e2e8f0;
  background: #f8fafc;
}

.pilar-card {
  border-left: 3px solid #0284c7;
}
.pilar-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.pilar-badge {
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  padding: 0.15rem 0.45rem;
  border-radius: 0.25rem;
  letter-spacing: 0.03em;
}
.badge-pilar1 { background: #e0f2fe; color: #0369a1; }
.badge-pilar2 { background: #fef3c7; color: #b45309; }
.badge-pilar3 { background: #e0e7ff; color: #4338ca; }
.badge-pilar4 { background: #dcfce7; color: #15803d; }
.badge-pilar5 { background: #dbeafe; color: #1e40af; }
.pilar-nota {
  margin-top: 0.45rem;
  font-size: 0.76rem;
  background: #ffffff;
  border: 1px dashed #cbd5e1;
  padding: 0.35rem 0.55rem;
  border-radius: 0.25rem;
  color: #475569;
}
.datos-tags-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.35rem;
  margin-top: 0.5rem;
}
.tag-dato {
  font-size: 0.72rem;
  background: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
  padding: 0.2rem 0.45rem;
  border-radius: 0.25rem;
  font-weight: 500;
}


.datos-lista {
  margin: 0.5rem 0 0.5rem 1.25rem;
  padding: 0;
  font-size: 0.825rem;
  color: #334155;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.datos-lista li {
  line-height: 1.4;
}

</style>
