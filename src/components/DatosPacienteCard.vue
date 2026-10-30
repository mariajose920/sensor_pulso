<template>
  <div class="card datos-paciente-card" style="margin-bottom: 1.5rem;">
    <!-- Vista Resumen (cuando ya hay datos guardados y no estamos editando) -->
    <div v-if="paciente && !modoEdicion">
      <div class="card-header-flex">
        <div style="display: flex; align-items: center; gap: 0.6rem; flex-wrap: wrap;">
          <h2 class="card-title" style="margin: 0; font-size: 1.15rem;">
            Ficha del Paciente
          </h2>
          <span class="badge badge-success">
            Datos completados
          </span>
          <span v-if="paciente.origen === 'supabase'" class="badge badge-supabase">
            ● En la nube
          </span>
          <span v-else class="badge badge-local">
            ○ Almacenamiento local
          </span>
        </div>

        <div style="display: flex; gap: 0.5rem;">
          <button 
            type="button" 
            class="btn btn-secondary btn-sm"
            @click="abrirEdicion"
          >
            Modificar
          </button>
          <button 
            type="button" 
            class="btn btn-danger-outline btn-sm"
            @click="confirmarBorrado"
            title="Borrar ficha y volver a ingresar datos"
          >
            Limpiar
          </button>
        </div>
      </div>

      <!-- Grid de Datos Básicos y Factores Fisiológicos -->
      <div class="paciente-grid">
        <!-- Bloque 1: Obligatorios -->
        <div class="paciente-item">
          <span class="label">Paciente:</span>
          <strong class="value">{{ paciente.nombre }}</strong>
        </div>
        <div class="paciente-item">
          <span class="label">Edad:</span>
          <span class="value">{{ paciente.edad }} años</span>
        </div>
        <div class="paciente-item">
          <span class="label">Nivel de Estrés:</span>
          <span 
            class="badge" 
            :style="{ backgroundColor: colorEstres(paciente.nivelEstres), color: '#ffffff', fontWeight: 'bold' }"
          >
            {{ etiquetaEstres(paciente.nivelEstres) }}
          </span>
        </div>

        <!-- Bloque 2: Factores Adicionales que Condicionan la Medición -->
        <div class="paciente-item">
          <span class="label">Descanso / Sueño:</span>
          <span class="value">{{ etiquetaSueno(paciente.suenoHoras) }}</span>
        </div>
        <div class="paciente-item">
          <span class="label">Cafeína previa:</span>
          <span class="value">{{ etiquetaCafeina(paciente.cafeina) }}</span>
        </div>
        <div class="paciente-item">
          <span class="label">Actividad previa:</span>
          <span class="value">{{ etiquetaActividad(paciente.actividadPrevia) }}</span>
        </div>
        <div class="paciente-item">
          <span class="label">Medicación:</span>
          <span class="value">{{ paciente.medicacion || 'Ninguna declarada' }}</span>
          <small 
            v-if="etiquetaEfectoMedicacion(paciente)" 
            :style="{ color: colorEfectoMedicacion(paciente), fontWeight: '600', fontSize: '0.72rem', marginTop: '0.2rem' }"
          >
            {{ etiquetaEfectoMedicacion(paciente) }}
          </small>
        </div>
        <div class="paciente-item">
          <span class="label">Condición de salud:</span>
          <span class="value">{{ paciente.condicionSalud || 'Ninguna conocida' }}</span>
        </div>
      </div>

      <div class="aviso-fisiologico">
        <strong>Relevancia biomédica:</strong> La edad, el nivel de estrés y el consumo previo de estimulantes condicionan la frecuencia cardíaca basal esperada y la variabilidad de intervalos R-R (HRV).
      </div>
      <div style="margin-top: 0.5rem; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; font-size: 0.78rem; background: #f8fafc; padding: 0.4rem 0.75rem; border-radius: 0.375rem; border: 1px solid #e2e8f0;">
        <div v-if="consentimientoEstado.vigente" style="display: flex; flex-direction: column; gap: 0.15rem;">
          <span style="color: #15803d; font-weight: 600;">
            ● Consentimiento Informado Vigente (v{{ consentimientoEstado.version }})
          </span>
          <span v-if="consentimientoEstado.aceptadoEn" style="color: #475569; font-size: 0.74rem;">
            Registrado: <strong>{{ formatearFechaHora(consentimientoEstado.aceptadoEn) }}</strong> (RF59)
          </span>
        </div>
        <div v-else style="display: flex; flex-direction: column; gap: 0.15rem;">
          <span style="color: #d97706; font-weight: 600;">
            ○ Consentimiento pendiente (saltará al medir / conectar)
          </span>
          <span v-if="consentimientoEstado.registroPrevio?.aceptadoEn" style="color: #64748b; font-size: 0.74rem;">
            🕒 Última vez registrado: <strong>{{ consentimientoEstado.registroPrevio.fechaHoraTexto }}</strong> (RF59)
          </span>
        </div>
        <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
          <button 
            type="button" 
            class="btn btn-secondary btn-sm"
            style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: #e0f2fe; color: #0369a1; border-color: #bae6fd;"
            @click="emit('abrir-consentimiento')"
            title="Inspeccionar finalidad, datos recogidos, responsable y plazo de conservación (RF76)"
          >
            📋 Ver términos (RF76)
          </button>
          <button 
            v-if="consentimientoEstado.vigente"
            type="button" 
            class="btn btn-secondary btn-sm"
            style="font-size: 0.72rem; padding: 0.2rem 0.55rem;"
            @click="revocarConsentimientoPrueba"
            title="Permite reiniciar el consentimiento para volver a probar el popup del RF04"
          >
            Reiniciar consentimiento
          </button>
        </div>
      </div>
    </div>

    <!-- Vista Formulario de Ingreso o Edición (RF03) -->
    <div v-else>
      <div class="card-header-flex">
        <div>
          <h2 class="card-title" style="margin: 0; font-size: 1.15rem;">
            Ficha del Paciente y Factores de Medición
          </h2>
          <p style="color: var(--color-muted); font-size: 0.85rem; margin-top: 0.25rem; margin-bottom: 0;">
            Completa los datos obligatorios del paciente y declara los factores que alteran la frecuencia cardíaca antes de medir.
          </p>
        </div>

        <button 
          v-if="paciente" 
          type="button" 
          class="btn btn-secondary btn-sm"
          @click="cancelarEdicion"
        >
          Cancelar
        </button>
      </div>

      <!-- Alertas de error de validación -->
      <div v-if="errores.length > 0" class="alert alert-danger" style="margin-top: 1rem;">
        <strong>Por favor corrige los siguientes campos obligatorios:</strong>
        <ul style="margin: 0.4rem 0 0 1.2rem; padding: 0;">
          <li v-for="(err, idx) in errores" :key="idx">{{ err }}</li>
        </ul>
      </div>

      <form @submit.prevent="guardar" style="margin-top: 1.25rem;">
        <!-- SECCIÓN 1: DATOS OBLIGATORIOS (RF03) -->
        <div class="form-section-title">
          <span>1. Datos Obligatorios del Paciente</span>
        </div>

        <div class="form-grid-3">
          <!-- Nombre obligatorio -->
          <div class="form-group">
            <label class="form-label" for="nombrePaciente">
              Nombre Completo <span class="required">*</span>
            </label>
            <input 
              id="nombrePaciente"
              v-model="formulario.nombre"
              type="text" 
              class="form-control"
              placeholder="Ej: Juanita Pérez"
              required
            />
            <small class="form-text">Identifica al titular de la medición.</small>
          </div>

          <!-- Edad obligatoria (5 a 100 años) -->
          <div class="form-group">
            <label class="form-label" for="edadPaciente">
              Edad (años) <span class="required">*</span>
            </label>
            <input 
              id="edadPaciente"
              v-model.number="formulario.edad"
              type="number" 
              min="5" 
              max="100"
              class="form-control"
              placeholder="Ej: 22"
              required
            />
            <small class="form-text">Rango válido: entre 5 y 100 años.</small>
          </div>

          <!-- Nivel de estrés obligatorio -->
          <div class="form-group">
            <label class="form-label" for="nivelEstres">
              Nivel de Estrés Actual <span class="required">*</span>
            </label>
            <select 
              id="nivelEstres"
              v-model="formulario.nivelEstres"
              class="form-control"
              required
            >
              <option value="" disabled>Selecciona nivel de estrés...</option>
              <option 
                v-for="opt in NIVELES_ESTRES" 
                :key="opt.id" 
                :value="opt.id"
              >
                {{ opt.label }}
              </option>
            </select>
            <small class="form-text">El estrés eleva el tono simpático y el BPM.</small>
          </div>
        </div>

        <!-- SECCIÓN 2: FACTORES ADICIONALES QUE AFECTAN LA MEDICIÓN (RF03) -->
        <div class="form-section-title" style="margin-top: 1.25rem;">
          <span>2. Factores Fisiológicos y Hábitos Previos</span>
        </div>

        <div class="form-grid-2">
          <!-- Sueño -->
          <div class="form-group">
            <label class="form-label" for="suenoHoras">
              Sueño / Horas dormidas anoche
            </label>
            <select 
              id="suenoHoras"
              v-model="formulario.suenoHoras"
              class="form-control"
            >
              <option v-for="opt in OPCIONES_SUENO" :key="opt.id" :value="opt.id">
                {{ opt.label }}
              </option>
            </select>
            <small class="form-text">La privación de sueño altera la variabilidad (HRV).</small>
          </div>

          <!-- Cafeína -->
          <div class="form-group">
            <label class="form-label" for="cafeina">
              Consumo de Cafeína / Estimulantes (últimas 4 hrs)
            </label>
            <select 
              id="cafeina"
              v-model="formulario.cafeina"
              class="form-control"
            >
              <option v-for="opt in OPCIONES_CAFEINA" :key="opt.id" :value="opt.id">
                {{ opt.label }}
              </option>
            </select>
            <small class="form-text">La cafeína incrementa transitoriamente la FC basal.</small>
          </div>

          <!-- Actividad previa -->
          <div class="form-group">
            <label class="form-label" for="actividadPrevia">
              Actividad física previa (últimos 30-60 min)
            </label>
            <select 
              id="actividadPrevia"
              v-model="formulario.actividadPrevia"
              class="form-control"
            >
              <option v-for="opt in OPCIONES_ACTIVIDAD" :key="opt.id" :value="opt.id">
                {{ opt.label }}
              </option>
            </select>
            <small class="form-text">Determina los rangos fisiológicos esperados.</small>
          </div>

          <!-- Medicación Asistida (RF03) -->
          <div class="form-group">
            <label class="form-label" for="medicacionTipo">
              Medicación habitual o reciente
            </label>
            <select 
              id="medicacionTipo"
              v-model="formulario.medicacionTipo"
              class="form-control"
            >
              <option v-for="opt in OPCIONES_MEDICACION" :key="opt.id" :value="opt.id">
                {{ opt.label }}
              </option>
            </select>
            <small class="form-text">
              Selecciona si consumes fármacos habituales (presión, asma, alergias, etc.).
            </small>

            <!-- Campo complementario si especifica un fármaco o si no está seguro -->
            <div 
              v-if="formulario.medicacionTipo !== 'ninguna' && formulario.medicacionTipo !== 'analgesico_comun'" 
              style="margin-top: 0.5rem;"
            >
              <input 
                id="medicacionDetalle"
                v-model="formulario.medicacionDetalle"
                type="text" 
                class="form-control"
                :placeholder="placeholderDetalleMedicacion"
              />
              <small class="form-text">
                Opcional: anota el nombre o dosis que recuerdes (ej: Salbutamol 2 puffs, Eutirox 50mcg).
              </small>
            </div>

            <!-- Aviso didáctico con explicación del efecto fisiológico -->
            <div v-if="avisoMedicacion" class="aviso-farmaco" :class="claseAvisoFarmaco">
              <strong>Nota farmacológica:</strong> {{ avisoMedicacion }}
            </div>
          </div>
        </div>

        <!-- Condición de salud -->
        <div class="form-group" style="margin-top: 0.75rem;">
          <label class="form-label" for="condicionSalud">
            Condición de salud relevante
          </label>
          <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
            <select 
              id="condicionSalud"
              v-model="formulario.condicionSalud"
              class="form-control"
              style="flex: 1; min-width: 240px;"
            >
              <option v-for="c in CONDICIONES_SALUD_COMUNES" :key="c" :value="c">
                {{ c }}
              </option>
            </select>
          </div>
          <small class="form-text">Hipertensión, asma o arritmias condicionan la interpretación médica.</small>
        </div>

        <!-- Privacidad y Protección de Datos (RF116 / RF117) -->
        <div class="privacidad-box">
          <small>
            La información médica declarada se almacena cifrada en base de datos bajo control de acceso de nivel de fila (RLS). Para fines <strong>pedagógicos</strong>, en las vistas compartidas solo se exponen nombre y rangos etarios.
          </small>
          <div style="margin-top: 0.5rem; pt: 0.5rem; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; font-size: 0.78rem;">
            <div v-if="consentimientoEstado.vigente" style="display: flex; flex-direction: column; gap: 0.15rem;">
              <span style="color: #15803d; font-weight: 600;">
                ● Consentimiento Informado Vigente (v{{ consentimientoEstado.version }})
              </span>
              <span v-if="consentimientoEstado.aceptadoEn" style="color: #475569; font-size: 0.74rem;">
                Registrado: <strong>{{ formatearFechaHora(consentimientoEstado.aceptadoEn) }}</strong> (RF59)
              </span>
            </div>
            <div v-else style="display: flex; flex-direction: column; gap: 0.15rem;">
              <span style="color: #d97706; font-weight: 600;">
                ○ Consentimiento pendiente (saltará al medir / conectar)
              </span>
              <span v-if="consentimientoEstado.registroPrevio?.aceptadoEn" style="color: #64748b; font-size: 0.74rem;">
                Última vez registrado: <strong>{{ consentimientoEstado.registroPrevio.fechaHoraTexto }}</strong> (RF59)
              </span>
            </div>
            <div style="display: flex; gap: 0.4rem; align-items: center; flex-wrap: wrap;">
            <button 
              type="button" 
              class="btn btn-secondary btn-sm"
              style="font-size: 0.72rem; padding: 0.2rem 0.55rem; background: #e0f2fe; color: #0369a1; border-color: #bae6fd;"
              @click="emit('abrir-consentimiento')"
              title="Inspeccionar finalidad, datos recogidos, responsable y plazo de conservación (RF76)"
            >
              Ver términos
            </button>
            <button 
              v-if="consentimientoEstado.vigente"
              type="button" 
              class="btn btn-secondary btn-sm"
              style="font-size: 0.72rem; padding: 0.2rem 0.55rem;"
              @click="revocarConsentimientoPrueba"
              title="Permite reiniciar el consentimiento para volver a probar el popup del RF04"
            >
              Reiniciar consentimiento
            </button>
          </div>
          </div>
        </div>

        <!-- Botones de Acción -->
        <div style="margin-top: 1.25rem; display: flex; justify-content: flex-end; gap: 0.75rem;">
          <button 
            type="submit" 
            class="btn btn-primary"
            :disabled="guardando"
          >
            {{ guardando ? 'Guardando...' : 'Guardar ficha del paciente' }}
          </button>
        </div>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useAuth } from '../composables/useAuth'
import { consentimientoService, consentimientoEstado, formatearFechaHora } from '../services/consentimientoService'
import { 
  pacienteService, 
  NIVELES_ESTRES, 
  OPCIONES_SUENO, 
  OPCIONES_CAFEINA, 
  OPCIONES_ACTIVIDAD, 
  OPCIONES_MEDICACION,
  CONDICIONES_SALUD_COMUNES 
} from '../services/pacienteService'

const emit = defineEmits(['paciente-actualizado', 'abrir-consentimiento'])
const { currentUserName } = useAuth()

const paciente = ref(null)
const modoEdicion = ref(false)
const guardando = ref(false)
const errores = ref([])

const formulario = ref({
  nombre: '',
  edad: null,
  nivelEstres: '',
  suenoHoras: '7_8',
  cafeina: 'ninguna',
  medicacionTipo: 'ninguna',
  medicacionDetalle: '',
  medicacion: 'Ninguna',
  actividadPrevia: 'reposo',
  condicionSalud: 'Ninguna conocida',
  observaciones: ''
})

onMounted(async () => {
  const activo = await pacienteService.obtenerDeclaracionActiva()
  if (activo) {
    paciente.value = activo
    emit('paciente-actualizado', activo)
  } else {
    modoEdicion.value = true
    if (currentUserName.value && currentUserName.value !== 'Invitado / No identificado') {
      formulario.value.nombre = currentUserName.value
    }
  }
})

function abrirEdicion() {
  if (paciente.value) {
    formulario.value = {
      nombre: paciente.value.nombre || '',
      edad: paciente.value.edad || null,
      nivelEstres: paciente.value.nivelEstres || '',
      suenoHoras: paciente.value.suenoHoras || '7_8',
      cafeina: paciente.value.cafeina || 'ninguna',
      medicacionTipo: paciente.value.medicacionTipo || 'ninguna',
      medicacionDetalle: paciente.value.medicacionDetalle || '',
      medicacion: paciente.value.medicacion || 'Ninguna',
      actividadPrevia: paciente.value.actividadPrevia || 'reposo',
      condicionSalud: paciente.value.condicionSalud || 'Ninguna conocida',
      observaciones: paciente.value.observaciones || ''
    }
  }
  errores.value = []
  modoEdicion.value = true
}

function cancelarEdicion() {
  errores.value = []
  modoEdicion.value = false
}

const placeholderDetalleMedicacion = computed(() => {
  if (formulario.value.medicacionTipo === 'inhalador_asma') {
    return 'Ej: Salbutamol 2 inhalaciones hace 30 min'
  }
  if (formulario.value.medicacionTipo === 'presion_corazon') {
    return 'Ej: Propranolol 20mg, Atenolol 50mg'
  }
  if (formulario.value.medicacionTipo === 'antigripal_descongestionante') {
    return 'Ej: Nastizol, Tapsin noche, etc.'
  }
  if (formulario.value.medicacionTipo === 'tdah_estimulante') {
    return 'Ej: Metilfenidato 10mg'
  }
  if (formulario.value.medicacionTipo === 'no_se') {
    return 'Anota aquí el nombre que recuerdes para que el docente lo revise'
  }
  return 'Especifica el nombre del fármaco o dosis si lo conoces'
})

const avisoMedicacion = computed(() => {
  const opt = OPCIONES_MEDICACION.find(m => m.id === formulario.value.medicacionTipo)
  if (!opt || opt.id === 'ninguna') return null
  return opt.descripcion
})

const claseAvisoFarmaco = computed(() => {
  const opt = OPCIONES_MEDICACION.find(m => m.id === formulario.value.medicacionTipo)
  if (!opt) return 'aviso-farmaco-neutro'
  if (opt.efecto === 'eleva') return 'aviso-farmaco-eleva'
  if (opt.efecto === 'reduce') return 'aviso-farmaco-reduce'
  return 'aviso-farmaco-neutro'
})

function etiquetaEfectoMedicacion(pac) {
  if (!pac || !pac.medicacionTipo) return null
  const opt = OPCIONES_MEDICACION.find(m => m.id === pac.medicacionTipo)
  if (!opt || opt.id === 'ninguna') return null
  if (opt.efecto === 'eleva') return 'Nota: Puede elevar el pulso basal'
  if (opt.efecto === 'reduce') return 'Nota: Puede reducir la frecuencia cardíaca'
  if (opt.efecto === 'por_evaluar') return 'Nota: Fármaco declarado para revisión docente'
  return null
}

function colorEfectoMedicacion(pac) {
  if (!pac || !pac.medicacionTipo) return '#64748b'
  const opt = OPCIONES_MEDICACION.find(m => m.id === pac.medicacionTipo)
  if (!opt) return '#64748b'
  if (opt.efecto === 'eleva') return '#d97706'
  if (opt.efecto === 'reduce') return '#0284c7'
  return '#64748b'
}

async function revocarConsentimientoPrueba() {
  await consentimientoService.revocarConsentimiento()
}

async function guardar() {
  errores.value = []
  guardando.value = true
  try {
    const res = await pacienteService.guardarDeclaracion(formulario.value)
    if (!res.ok) {
      errores.value = res.errores
      return
    }

    paciente.value = res.data
    modoEdicion.value = false
    emit('paciente-actualizado', res.data)
  } catch (err) {
    errores.value = ['Error inesperado al guardar la declaración: ' + err.message]
  } finally {
    guardando.value = false
  }
}

function confirmarBorrado() {
  if (confirm('¿Deseas limpiar los datos declarados de este paciente?')) {
    pacienteService.limpiarDeclaracionLocal()
    paciente.value = null
    formulario.value = {
      nombre: '',
      edad: null,
      nivelEstres: '',
      suenoHoras: '7_8',
      cafeina: 'ninguna',
      medicacionTipo: 'ninguna',
      medicacionDetalle: '',
      medicacion: 'Ninguna',
      actividadPrevia: 'reposo',
      condicionSalud: 'Ninguna conocida',
      observaciones: ''
    }
    modoEdicion.value = true
    emit('paciente-actualizado', null)
  }
}

// Funciones auxiliares para etiquetas amigables
function etiquetaEstres(id) {
  const item = NIVELES_ESTRES.find(n => n.id === id)
  return item ? item.label : id
}

function colorEstres(id) {
  const item = NIVELES_ESTRES.find(n => n.id === id)
  return item ? item.color : '#64748b'
}

function etiquetaSueno(id) {
  const item = OPCIONES_SUENO.find(s => s.id === id)
  return item ? item.label : id
}

function etiquetaCafeina(id) {
  const item = OPCIONES_CAFEINA.find(c => c.id === id)
  return item ? item.label : id
}

function etiquetaActividad(id) {
  const item = OPCIONES_ACTIVIDAD.find(a => a.id === id)
  return item ? item.label : id
}
</script>

<style scoped>
.datos-paciente-card {
  padding: 1.25rem;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: 0.75rem;
}

.card-header-flex {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.75rem;
  padding-bottom: 0.75rem;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
}

.paciente-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
  gap: 0.9rem;
  margin-top: 1rem;
}

.paciente-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  background: #f8fafc;
  padding: 0.6rem 0.85rem;
  border-radius: 0.5rem;
  border: 1px solid #e2e8f0;
}

.paciente-item .label {
  font-size: 0.75rem;
  color: var(--color-muted, #64748b);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.paciente-item .value {
  font-size: 0.95rem;
  color: var(--color-text, #0f172a);
}

.aviso-fisiologico {
  margin-top: 1rem;
  font-size: 0.8rem;
  color: #0369a1;
  background: #f0f9ff;
  border: 1px solid #bae6fd;
  padding: 0.5rem 0.85rem;
  border-radius: 0.4rem;
}

.form-section-title {
  font-size: 0.95rem;
  font-weight: 700;
  color: #1e3a8a;
  border-bottom: 1px dashed #cbd5e1;
  padding-bottom: 0.35rem;
  margin-bottom: 0.85rem;
}

.form-grid-3 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
  gap: 1rem;
}

.form-grid-2 {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
}

.form-group {
  margin-bottom: 0.5rem;
}

.form-label {
  display: block;
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text, #1e293b);
  margin-bottom: 0.3rem;
}

.form-control {
  width: 100%;
  padding: 0.55rem 0.75rem;
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: 0.4rem;
  font-size: 0.9rem;
  background: #ffffff;
  color: #0f172a;
}

.form-control:focus {
  outline: none;
  border-color: #2563eb;
  box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.15);
}

.form-text {
  display: block;
  font-size: 0.72rem;
  color: var(--color-muted, #64748b);
  margin-top: 0.25rem;
}

.required {
  color: #dc2626;
  font-weight: bold;
}

.privacidad-box {
  margin-top: 1rem;
  padding: 0.6rem 0.85rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.4rem;
  color: #475569;
}

.badge-supabase {
  background: #dcfce7;
  color: #15803d;
  border: 1px solid #bbf7d0;
}

.badge-local {
  background: #f1f5f9;
  color: #475569;
  border: 1px solid #cbd5e1;
}

.btn-sm {
  padding: 0.3rem 0.65rem;
  font-size: 0.8rem;
}

.btn-danger-outline {
  background: transparent;
  color: #dc2626;
  border: 1px solid #fca5a5;
  border-radius: 0.375rem;
  cursor: pointer;
}

.btn-danger-outline:hover {
  background: #fee2e2;
}

.aviso-farmaco {
  margin-top: 0.55rem;
  padding: 0.45rem 0.75rem;
  font-size: 0.76rem;
  border-radius: 0.375rem;
  line-height: 1.4;
}

.aviso-farmaco-eleva {
  background: #fffbeb;
  color: #92400e;
  border: 1px solid #fde68a;
}

.aviso-farmaco-reduce {
  background: #f0f9ff;
  color: #0369a1;
  border: 1px solid #bae6fd;
}

.aviso-farmaco-neutro {
  background: #f8fafc;
  color: #475569;
  border: 1px solid #cbd5e1;
}
</style>
