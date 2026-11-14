<template>
  <div class="card datos-paciente-card" style="margin-bottom: 1.5rem;">
    <!-- Leyendo la ficha guardada: no se muestra un formulario vacío mientras tanto -->
    <div v-if="cargando" class="ficha-cargando" role="status" data-testid="ficha-cargando">
      Cargando tu ficha guardada…
    </div>

    <!-- La ficha guardada NO se pudo leer: se explica por qué; no se pide la fecha como si faltara -->
    <div v-else-if="lecturaFallida" class="alert alert-warning ficha-lectura-fallida" data-testid="ficha-lectura-fallida">
      <strong>No se pudo leer tu ficha guardada.</strong>
      <p style="margin: 0.4rem 0 0;" data-testid="ficha-motivo-lectura">{{ motivoLectura }}</p>
      <p v-if="nombreConservado" class="form-text" style="margin: 0.4rem 0 0;">
        Tus datos no se perdieron: siguen guardados. Ficha de {{ nombreConservado }}.
      </p>
      <div style="margin-top: 0.75rem; display: flex; gap: 0.5rem; flex-wrap: wrap;">
        <button type="button" class="btn btn-primary btn-sm" :disabled="reintentando" data-testid="ficha-reintentar" @click="reintentarLectura">
          {{ reintentando ? 'Leyendo…' : 'Reintentar lectura' }}
        </button>
        <button type="button" class="btn btn-secondary btn-sm" data-testid="ficha-ingresar-de-nuevo" @click="ingresarDeNuevo">
          Ingresar los datos de nuevo
        </button>
      </div>
    </div>

    <!-- Vista Resumen (cuando ya hay datos guardados y no estamos editando) -->
    <div v-else-if="paciente && !modoEdicion">
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
          <span v-if="paciente.pendienteSync" class="badge badge-local" title="Se guardó en este dispositivo y se reintentará enviar a la nube">
            Pendiente de sincronizar
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

      <!-- Avisos discretos: lectura parcial y estado del guardado en segundo plano -->
      <div v-if="advertenciaLectura" class="alert alert-warning" style="margin-top: 0.75rem; font-size: 0.82rem;" data-testid="ficha-advertencia">{{ advertenciaLectura }}</div>
      <div v-if="avisoSync" class="alert alert-warning" style="margin-top: 0.75rem; font-size: 0.82rem;">
        {{ avisoSync }}
        <button type="button" class="btn btn-secondary btn-sm" style="margin-left: 0.5rem;" @click="reintentarGuardado">Reintentar</button>
      </div>
      <small v-else-if="estadoGuardado.estado === 'guardando' || estadoGuardado.estado === 'guardado'" class="form-text" style="display: block; margin-top: 0.5rem;" data-testid="ficha-estado-guardado">
        {{ estadoGuardado.mensaje }}
      </small>

      <!-- Grid de Datos Básicos y Factores Fisiológicos -->
      <div class="paciente-grid">
        <!-- Bloque 1: Obligatorios -->
        <div class="paciente-item">
          <span class="label">Paciente:</span>
          <strong class="value">{{ paciente.nombre }}</strong>
        </div>
        <div class="paciente-item">
          <span class="label">Edad:</span>
          <span class="value">{{ textoEdad(paciente.edad) }}</span>
          <small v-if="paciente.fechaNacimiento" class="form-text" style="margin: 0;">
            Nació el {{ formatearFechaNacimiento(paciente.fechaNacimiento) }}
          </small>
          <small v-else-if="estadoFecha === 'solo_edad'" class="form-text" style="margin: 0;" data-testid="ficha-sugerencia-fecha">
            Edad de una ficha anterior. Si quieres, agrega tu fecha de nacimiento en «Modificar» para que se actualice sola.
          </small>
        </div>
        <div class="paciente-item">
          <span class="label">Nivel de Estrés:</span>
          <span 
            class="badge" 
            :style="{ backgroundColor: colorEstres(paciente.nivelEstres), color: '#ffffff', fontWeight: 'bold' }"
          >
            {{ paciente.nivelEstres ? etiquetaEstres(paciente.nivelEstres) : 'Sin declarar' }}
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
          <span class="label">Contexto / Actividad:</span>
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
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <span style="color: #16a34a; font-weight: 700;">● Consentimiento Informado Vigente</span>
            <span class="badge badge-success" style="font-size: 0.68rem; padding: 0.1rem 0.45rem;">Ley 19.628</span>
            <span class="badge" style="font-size: 0.68rem; padding: 0.1rem 0.45rem; background: #eff6ff; color: #1e40af; border: 1px solid #bfdbfe;">AES-256-GCM + TLS (RF116)</span>
          </div>
          <span v-if="consentimientoEstado.aceptadoEn" style="color: #64748b; font-size: 0.75rem;">
            Registrado el <strong>{{ formatearFechaHora(consentimientoEstado.aceptadoEn) }}</strong> para uso docente y confidencial
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

          <!-- Fecha de nacimiento obligatoria: la edad se calcula sola (solo mayores de edad: 18 a 100 años) -->
          <div class="form-group">
            <label class="form-label" for="fechaNacimientoPaciente">
              Fecha de nacimiento <span v-if="!formulario.edad" class="required">*</span>
            </label>
            <input 
              id="fechaNacimientoPaciente"
              v-model="formulario.fechaNacimiento"
              type="date" 
              :max="hoyIso"
              class="form-control"
              data-testid="ficha-fecha-nacimiento"
              :required="!formulario.edad"
            />
            <small class="form-text" data-testid="ficha-edad-calculada">
              <template v-if="edadCalculada !== null">Edad: <strong>{{ textoEdad(edadCalculada) }}</strong></template>
              <template v-else-if="!formulario.fechaNacimiento && formulario.edad">
                Edad guardada antes: {{ textoEdad(formulario.edad) }}. Puedes continuar con ella; agregar la fecha de nacimiento es opcional y hace que se actualice sola.
              </template>
              <template v-else>Edad: se calcula automáticamente. Solo se miden personas mayores de edad (18 a 100 años).</template>
            </small>
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
              Sueño / Horas dormidas anoche (opcional)
            </label>
            <select 
              id="suenoHoras"
              v-model="formulario.suenoHoras"
              class="form-control"
            >
              <option value="">Sin especificar (opcional)</option>
              <option v-for="opt in OPCIONES_SUENO" :key="opt.id" :value="opt.id">
                {{ opt.label }}
              </option>
            </select>
            <small class="form-text">La privación de sueño altera la variabilidad (HRV) y se correlaciona en tu evolución personal.</small>
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
              Actividad o Contexto de la Medición
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
            <small class="form-text">Asocia el contexto físico (reposo, movimiento o post-ejercicio) a la medición para calibrar los rangos esperados.</small>
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
            La información médica declarada se almacena cifrada (AES-256-GCM) en base de datos bajo control de acceso de nivel de fila (RLS). En tránsito se protege mediante HTTPS/TLS 1.3 (RF55). Para fines <strong>pedagógicos</strong>, en las vistas compartidas solo se exponen nombre y rangos etarios.
          </small>
          <div style="margin-top: 0.5rem; pt: 0.5rem; border-top: 1px dashed #cbd5e1; display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.5rem; font-size: 0.78rem;">
            <div v-if="consentimientoEstado.vigente" style="display: flex; flex-direction: column; gap: 0.15rem;">
          <div style="display: flex; align-items: center; gap: 0.4rem;">
            <span style="color: #16a34a; font-weight: 700;">● Consentimiento Informado Vigente</span>
            <span class="badge badge-success" style="font-size: 0.68rem; padding: 0.1rem 0.45rem;">Ley 19.628</span>
          </div>
          <span v-if="consentimientoEstado.aceptadoEn" style="color: #64748b; font-size: 0.75rem;">
            Registrado el <strong>{{ formatearFechaHora(consentimientoEstado.aceptadoEn) }}</strong> para uso docente y confidencial
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

        <!-- Aviso si la ficha no llegó al servidor (queda en el dispositivo y se reintenta) -->
        <div v-if="avisoSync" class="alert alert-warning" style="margin-top: 1rem;">{{ avisoSync }}</div>

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
import { calcularEdad, fechaHoyIso, textoEdad, parsearFechaIso } from '../utils/edad.js'
import { consentimientoService, consentimientoEstado, formatearFechaHora } from '../services/consentimientoService'
import {
  estadoGuardadoFicha,
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
const cargando = ref(true)
const lecturaFallida = ref(false)
const motivoLectura = ref('')
const nombreConservado = ref('')
const advertenciaLectura = ref('')
const reintentando = ref(false)
const estadoGuardado = estadoGuardadoFicha
const estadoFecha = computed(() => estadoFechaNacimiento(paciente.value))
const modoEdicion = ref(false)
const guardando = ref(false)
const errores = ref([])
const avisoSync = ref('')
const hoyIso = fechaHoyIso()

const formulario = ref({
  nombre: '',
  edad: null,
  fechaNacimiento: '',
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

function prepararFormularioNuevo() {
  modoEdicion.value = true
  if (!formulario.value.nombre && currentUserName.value && currentUserName.value !== 'Invitado / No identificado') {
    formulario.value.nombre = currentUserName.value
  }
}

/**
 * Carga la ficha guardada. Si existe y se pudo leer, se muestra tal cual en solo lectura (el formulario se abre solo con
 * «Modificar»). Si existe pero NO se pudo leer, se explica el motivo y se ofrece reintentar; el formulario vacío es solo
 * la alternativa. El formulario vacío aparece de entrada solo cuando de verdad no hay ninguna ficha.
 */
async function cargarFicha(forzar = false) {
  cargando.value = true
  try {
    const activo = await pacienteService.obtenerDeclaracionActiva({ forzar })
    lecturaFallida.value = false
    advertenciaLectura.value = ''
    if (activo?.incompleta || activo?.estadoLectura === 'incompleta') {
      lecturaFallida.value = true
      motivoLectura.value = activo.motivoLectura || 'No se pudieron leer tus datos guardados.'
      nombreConservado.value = activo.nombre || ''
      paciente.value = null
      modoEdicion.value = false
    } else if (activo) {
      paciente.value = activo
      advertenciaLectura.value = activo.advertenciaLectura || ''
      emit('paciente-actualizado', activo)
      // Solo se abre el formulario si a la ficha le falta de verdad un dato obligatorio (p. ej. el estrés)
      modoEdicion.value = false
      if (!activo.nivelEstres) abrirEdicion()
    } else {
      prepararFormularioNuevo()
    }
  } finally {
    cargando.value = false
  }
}

async function reintentarLectura() {
  reintentando.value = true
  try { await cargarFicha(true) } finally { reintentando.value = false }
}

// Alternativa explícita a reintentar: la persona decide empezar con una ficha nueva
function ingresarDeNuevo() {
  lecturaFallida.value = false
  paciente.value = null
  prepararFormularioNuevo()
}

function reintentarGuardado() {
  pacienteService.reintentarSincronizacion().then(aplicarSincronizacion)
}

onMounted(() => { cargarFicha() })

// Edad calculada en vivo desde la fecha de nacimiento (null si falta, es inválida o futura)
const edadCalculada = computed(() => calcularEdad(formulario.value.fechaNacimiento))

function formatearFechaNacimiento(iso) {
  const f = parsearFechaIso(iso)
  return f ? `${String(f.dia).padStart(2, '0')}/${String(f.mes).padStart(2, '0')}/${f.anio}` : iso
}

function abrirEdicion() {
  if (paciente.value) {
    formulario.value = {
      nombre: paciente.value.nombre || '',
      edad: paciente.value.edad || null,
      fechaNacimiento: paciente.value.fechaNacimiento || '',
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

// Resultado del envío al servidor (en segundo plano): actualiza el aviso y la ficha con su id
function aplicarSincronizacion(s) {
  if (!s) return
  avisoSync.value = s.errorServidor
    ? `La ficha se guardó en este dispositivo pero no llegó al servidor (${s.errorServidor}). Se reintentará.`
    : ''
  if (s.ficha && s.ficha.id) {
    paciente.value = { ...s.ficha }
    emit('paciente-actualizado', paciente.value)
  }
}

/**
 * Guarda la ficha. Valida y guarda la copia de la pestaña al instante y devuelve de inmediato: el envío al servidor
 * continúa en segundo plano (la pantalla no se queda esperando). Si no cambió nada, no se vuelve a guardar.
 */
async function guardar() {
  errores.value = []
  try {
    const res = pacienteService.guardarDeclaracionRapido(formulario.value)
    if (!res.ok) {
      errores.value = res.errores
      return false
    }
    paciente.value = res.data
    lecturaFallida.value = false
    advertenciaLectura.value = ''
    modoEdicion.value = false
    avisoSync.value = ''
    emit('paciente-actualizado', res.data)
    if (!res.sinCambios) res.sincronizacion.then(aplicarSincronizacion)
    return true
  } catch (err) {
    errores.value = ['Error inesperado al guardar la declaración: ' + err.message]
    return false
  }
}

function confirmarBorrado() {
  if (confirm('¿Deseas limpiar los datos declarados de este paciente?')) {
    pacienteService.limpiarDeclaracionLocal()
    paciente.value = null
    formulario.value = {
      nombre: '',
      edad: null,
      fechaNacimiento: '',
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
    lecturaFallida.value = false
    advertenciaLectura.value = ''
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

defineExpose({
  guardar,
  modoEdicion
})
</script>

<style scoped>
.datos-paciente-card {
  padding: 1.25rem;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #cbd5e1);
  border-radius: 0.75rem;
}

.ficha-cargando {
  padding: 1rem 0.25rem;
  color: var(--color-muted, #64748b);
  font-size: 0.9rem;
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
