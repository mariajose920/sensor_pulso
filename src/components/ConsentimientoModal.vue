<template>
  <div v-if="visible" class="modal-backdrop" @click.self="rechazar">
    <div class="modal-container card" role="dialog" aria-modal="true" aria-labelledby="consent-title">
      <!-- Encabezado del Consentimiento -->
      <div class="modal-header">
        <div>
          <h2 id="consent-title" class="modal-title">
            Consentimiento Informado para Medición
          </h2>
          <span class="version-tag">Documento oficial — Versión {{ doc.version }} (RF59 / RF76)</span>
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
          <strong>Aviso importante:</strong> La plataforma <em>sensor_pulso</em> y los dispositivos asociados son herramientas didácticas y pedagógicas de la Universidad Adventista de Chile (UNACH). <strong>No constituyen un dispositivo médico ni proporcionan diagnósticos clínicos.</strong>
        </div>

        <div class="secciones-consentimiento">
          <!-- 1. Finalidad -->
          <div class="seccion-item">
            <h3 class="seccion-titulo">1. Finalidad de la Medición</h3>
            <p class="seccion-texto">{{ doc.finalidad }}</p>
          </div>

          <!-- 2. Datos Recogidos -->
          <div class="seccion-item">
            <h3 class="seccion-titulo">2. Datos Fisiológicos Recogidos</h3>
            <p class="seccion-texto">{{ doc.datosRecogidos }}</p>
            <small class="seccion-hint">
              Los factores declarados en la Ficha del Paciente se asocian de forma confidencial a la curva PPG capturada.
            </small>
          </div>

          <!-- 3. Responsable y Resguardo -->
          <div class="seccion-item">
            <h3 class="seccion-titulo">3. Responsable del Tratamiento y Privacidad</h3>
            <p class="seccion-texto">{{ doc.responsable }}</p>
            <p class="seccion-texto">
              Tus datos se procesan bajo políticas de control de acceso por nivel de fila (RLS) y cifrado de datos de salud en reposo.
            </p>
          </div>

          <!-- 4. Plazo y Revocación -->
          <div class="seccion-item">
            <h3 class="seccion-titulo">4. Conservación y Derecho de Revocación</h3>
            <p class="seccion-texto">
              {{ doc.plazoConservacion }} Puedes revocar este consentimiento informado en cualquier momento desde tu perfil o la configuración del sistema.
            </p>
          </div>

          <!-- 5. Registro Inmutable de Auditoría (RF59) -->
          <div class="seccion-item auditoria-box">
            <h3 class="seccion-titulo" style="color: #1e40af;">5. Registro de Versión, Fecha y Hora</h3>
            <p class="seccion-texto">
              Al presionar "Aceptar" la plataforma registrará de forma inmutable la <strong>Versión {{ doc.version }}</strong> con la <strong>fecha y hora exacta</strong> del momento de autorización.
            </p>
            <div v-if="consentimientoEstado.aceptadoEn || consentimientoEstado.registroPrevio?.aceptadoEn" class="registro-previo-tag">
              <span>● Último registro: <strong>v{{ consentimientoEstado.aceptadoEn ? consentimientoEstado.version : consentimientoEstado.registroPrevio.version }}</strong> aceptado el {{ consentimientoEstado.fechaHoraTexto || consentimientoEstado.registroPrevio.fechaHoraTexto }} (RF59)</span>
            </div>

            <div v-if="historial.length > 0" class="historial-container">
              <button 
                type="button" 
                class="btn-toggle-historial"
                @click="mostrarHistorial = !mostrarHistorial"
              >
                {{ mostrarHistorial ? '▲ Ocultar historial de registros' : '▼ Ver historial de registros anteriores (' + historial.length + ' veces aceptado)' }}
              </button>
              <ul v-if="mostrarHistorial" class="historial-lista">
                <li v-for="item in historial" :key="item.id" class="historial-item">
                  <span class="historial-version">Versión {{ item.version }}</span>
                  <span class="historial-fecha">— {{ item.fechaHoraTexto }}</span>
                  <span class="historial-origen">[{{ item.origen }}]</span>
                </li>
              </ul>
            </div>

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
              He leído detenidamente, comprendo y acepto de forma libre e informada las condiciones anteriores.
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
</style>
