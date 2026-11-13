<template>
  <div v-if="visible" class="modal-backdrop" @click.self="cerrar">
    <div class="modal-container card" role="dialog" aria-modal="true" aria-labelledby="canal-extra-titulo" data-testid="agregar-canal-modal">
      <div class="modal-header">
        <div>
          <h2 id="canal-extra-titulo" class="modal-title">
            {{ esEstudiante ? 'Agregar mi canal' : (canalExistente ? `Completar requisitos del Canal ${canalExistente}` : (misCanales.length ? 'Agregar otro canal' : 'Agregar canal')) }}
          </h2>
          <span class="version-tag">
            {{ canalExistente && !esEstudiante ? 'Este canal ya es tuyo, pero aún no puede medir.' : 'El sistema te asigna automáticamente el siguiente canal libre.' }}
          </span>
        </div>
        <button type="button" class="btn-close" @click="cerrar" aria-label="Cerrar">✕</button>
      </div>

      <ol class="pasos-canal" aria-label="Pasos para usar el canal">
        <li :class="{ activo: paso === 1, hecho: paso > 1 }">1. Ficha del paciente</li>
        <li :class="{ activo: paso === 2 }">2. Términos y consentimiento</li>
      </ol>

      <div class="modal-body">
        <!-- Paso 1: ficha RF03 de la persona de este canal -->
        <form v-if="paso === 1" novalidate @submit.prevent="siguienteDeFicha">
          <p class="hint">{{ esEstudiante ? 'Tus datos de paciente: se guardan junto a tu canal y se usan al guardar tus mediciones.' : 'Datos de la persona que se medirá en este canal.' }}</p>
          <div v-if="errores.length" class="alert alert-danger" role="alert" data-testid="errores-ficha">
            <ul><li v-for="e in errores" :key="e">{{ e }}</li></ul>
          </div>
          <div class="grid">
            <label><span class="campo-label">Nombre completo *</span>
              <input v-model="ficha.nombre" type="text" class="form-input" data-testid="canal-nombre" :readonly="Boolean(nombreFijo)" :class="{ 'campo-fijo': nombreFijo }" />
              <small v-if="nombreFijo" class="edad-calculada" data-testid="canal-paciente-eres-tu">El paciente eres tú: solo puedes medirte a ti mismo.</small>
            </label>
            <label><span class="campo-label">Fecha de nacimiento (18 a 100 años) *</span>
              <input v-model="ficha.fechaNacimiento" type="date" :max="hoyIso" class="form-input" data-testid="canal-fecha-nacimiento" />
              <small class="edad-calculada" data-testid="canal-edad-calculada">
                <template v-if="edadCalculada !== null">Edad: <strong>{{ textoEdad(edadCalculada) }}</strong></template>
                <template v-else>Edad: se calcula automáticamente.</template>
              </small>
            </label>
            <label><span class="campo-label">Nivel de estrés *</span>
              <select v-model="ficha.nivelEstres" class="form-select" data-testid="canal-estres">
                <option value="" disabled>Selecciona…</option>
                <option v-for="o in NIVELES_ESTRES" :key="o.id" :value="o.id">{{ o.label }}</option>
              </select>
            </label>
            <label><span class="campo-label">Sueño anoche</span>
              <select v-model="ficha.suenoHoras" class="form-select">
                <option v-for="o in OPCIONES_SUENO" :key="o.id" :value="o.id">{{ o.label }}</option>
              </select>
            </label>
            <label><span class="campo-label">Cafeína (últimas 4 h)</span>
              <select v-model="ficha.cafeina" class="form-select">
                <option v-for="o in OPCIONES_CAFEINA" :key="o.id" :value="o.id">{{ o.label }}</option>
              </select>
            </label>
            <label><span class="campo-label">Medicación</span>
              <select v-model="ficha.medicacionTipo" class="form-select">
                <option v-for="o in OPCIONES_MEDICACION" :key="o.id" :value="o.id">{{ o.label }}</option>
              </select>
            </label>
            <label v-if="ficha.medicacionTipo !== 'ninguna'"><span class="campo-label">Detalle de la medicación</span>
              <input v-model="ficha.medicacionDetalle" type="text" class="form-input" />
            </label>
            <label><span class="campo-label">Actividad previa</span>
              <select v-model="ficha.actividadPrevia" class="form-select">
                <option v-for="o in OPCIONES_ACTIVIDAD" :key="o.id" :value="o.id">{{ o.label }}</option>
              </select>
            </label>
            <label><span class="campo-label">Condición de salud</span>
              <select v-model="ficha.condicionSalud" class="form-select">
                <option v-for="c in CONDICIONES_SALUD_COMUNES" :key="c" :value="c">{{ c }}</option>
              </select>
            </label>
          </div>
          <div class="acciones">
            <button type="button" class="btn btn-secondary" @click="cerrar">Cancelar</button>
            <button type="submit" class="btn btn-primary" data-testid="canal-paso1-siguiente">Continuar</button>
          </div>
        </form>

        <!-- Paso 2: términos y condiciones (RF88) y consentimiento informado (RF04) en una sola vista -->
        <div v-else-if="paso === 2">
          <div class="alerta-medica">
            <strong>Aviso importante:</strong> sensor pulso es una herramienta didáctica de la Universidad Adventista de Chile (UNACH).
            <strong>No es un dispositivo médico certificado ni entrega diagnósticos.</strong>
          </div>

          <div class="terminos-caja" tabindex="0" aria-label="Términos y condiciones y consentimiento informado" data-testid="canal-terminos-texto">
            <h3>Términos y condiciones</h3>
            <p>
              El uso de la plataforma se rige por los términos y condiciones y por la
              <router-link to="/privacidad" target="_blank">política de privacidad</router-link> (versión {{ POLITICA_VERSION }}).
              Las mediciones tienen fines estrictamente educativos y de laboratorio.
            </p>

            <h3>Consentimiento informado (versión {{ doc.version }})</h3>
            <p><strong>Finalidad.</strong> {{ doc.finalidad }}</p>
            <p><strong>Datos que se recogen.</strong> {{ doc.datosRecogidos }}</p>
            <p><strong>Quién los trata.</strong> {{ doc.responsable }} Los datos de este canal quedan guardados en tu cuenta, protegidos por cuenta de usuario (RLS) y cifrado en tránsito.</p>
            <p><strong>Plazo y derechos.</strong> {{ doc.plazoConservacion }} La persona medida puede revocar su consentimiento o pedir la eliminación de sus datos en cualquier momento.</p>
            <p class="constancia">Al aceptar se registra de forma permanente la versión del consentimiento con la fecha y hora de aceptación (RF59).</p>
          </div>

          <label class="check">
            <input v-model="aceptaTodo" type="checkbox" data-testid="canal-acepta-terminos" />
            <span>
              <strong>{{ ficha.nombre }}</strong> ha leído los términos y condiciones, la política de privacidad y el consentimiento informado,
              y los acepta, incluido el uso de sus datos de salud con fines académicos.
            </span>
          </label>

          <p v-if="guardando">Asignando canal…</p>
          <p v-if="errorGuardar" class="alert alert-danger" role="alert">{{ errorGuardar }}</p>
          <div class="acciones">
            <button type="button" class="btn btn-secondary" :disabled="guardando" @click="paso = 1">Volver</button>
            <button type="button" class="btn btn-primary" :disabled="!aceptaTodo || guardando" data-testid="canal-aceptar-asignar" @click="aceptarYAsignar">
              {{ guardando ? 'Asignando…' : 'Aceptar y asignar canal' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted } from 'vue'
import { calcularEdad, fechaHoyIso, textoEdad } from '../utils/edad.js'
import { consentimientoService, CONSENTIMIENTO_BASE } from '../services/consentimientoService.js'
import {
  pacienteService,
  NIVELES_ESTRES,
  OPCIONES_SUENO,
  OPCIONES_CAFEINA,
  OPCIONES_ACTIVIDAD,
  OPCIONES_MEDICACION,
  CONDICIONES_SALUD_COMUNES
} from '../services/pacienteService.js'
import { POLITICA_VERSION } from '../data/politicaPrivacidad.js'
import { agregarOtroCanal, asignarmeCanalConFicha, misCanales, usuarioActual } from '../services/canalesService.js'

const props = defineProps({
  visible: { type: Boolean, default: false },
  canalExistente: { type: Number, default: null },
  // 'docente': agrega canales de pacientes (profesor/admin). 'estudiante': el estudiante se asigna su canal con su ficha.
  modo: { type: String, default: 'docente' }
})
const esEstudiante = computed(() => props.modo === 'estudiante')
// Estudiante: el único paciente es él mismo, así que el nombre de la ficha es el de su cuenta y no se edita
const nombreFijo = computed(() => (esEstudiante.value ? String(usuarioActual.nombre || '').trim() : ''))
const emit = defineEmits(['cerrar', 'agregado'])

function fichaVacia() {
  return {
    nombre: '', edad: null, fechaNacimiento: '', nivelEstres: '', suenoHoras: '7_8', cafeina: 'ninguna',
    medicacionTipo: 'ninguna', medicacionDetalle: '', actividadPrevia: 'reposo',
    condicionSalud: 'Ninguna conocida'
  }
}

const paso = ref(1)
const ficha = ref(fichaVacia())
const errores = ref([])
const hoyIso = fechaHoyIso()
// Edad calculada en vivo (solo lectura); al validar y guardar se recalcula desde la fecha de nacimiento
const edadCalculada = computed(() => calcularEdad(ficha.value.fechaNacimiento))
const aceptaTodo = ref(false)
const doc = ref(CONSENTIMIENTO_BASE)
const guardando = ref(false)
const errorGuardar = ref('')

// Cada vez que se abre se parte de cero: ficha, términos y consentimiento se piden de nuevo para cada canal.
watch(() => props.visible, (v) => {
  if (!v) return
  paso.value = 1
  ficha.value = fichaVacia()
  if (props.modo === 'estudiante') precargarFichaPropia()
  errores.value = []
  aceptaTodo.value = false
  guardando.value = false
  errorGuardar.value = ''
})

onMounted(async () => {
  doc.value = await consentimientoService.obtenerVersionActiva()
})

// Estudiante: se parte de su ficha ya guardada (si la tiene) para no volver a escribirla; puede corregirla.
async function precargarFichaPropia() {
  ficha.value.nombre = usuarioActual.nombre || ''
  try {
    const guardada = await pacienteService.obtenerDeclaracionActiva()
    if (!guardada) return
    const base = fichaVacia()
    for (const campo of Object.keys(base)) {
      if (guardada[campo] !== undefined && guardada[campo] !== null && guardada[campo] !== '') ficha.value[campo] = guardada[campo]
    }
    if (nombreFijo.value) ficha.value.nombre = nombreFijo.value
  } catch (_) { /* sin ficha previa: se escribe de cero */ }
}

function siguienteDeFicha() {
  // La edad numérica de la ficha se deriva de la fecha de nacimiento (otras partes consumen `edad`)
  if (edadCalculada.value !== null) ficha.value.edad = edadCalculada.value
  const res = pacienteService.validarDatos(ficha.value)
  errores.value = res.errores
  if (res.valido) paso.value = 2
}

// Una sola aceptación cubre términos, política (RF88) y consentimiento informado (RF04, RF59)
async function aceptarYAsignar() {
  if (!aceptaTodo.value || guardando.value) return
  guardando.value = true
  errorGuardar.value = ''
  try {
    const registro = await consentimientoService.aceptarConsentimiento(doc.value.version)
    const datos = {
      ficha: { ...ficha.value },
      politicaVersion: POLITICA_VERSION,
      consentimientoVersion: registro?.data?.version || doc.value.version
    }
    const res = esEstudiante.value
      ? await asignarmeCanalConFicha(datos)
      : await agregarOtroCanal({ ...datos, canalExistente: props.canalExistente })
    emit('agregado', res.canal)
    emit('cerrar')
  } catch (err) {
    errorGuardar.value = err.message
  } finally {
    guardando.value = false
  }
}

function cerrar() {
  emit('cerrar')
}
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
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
  max-width: 720px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: #ffffff;
  border-radius: 0.75rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border: 1px solid #cbd5e1;
  padding: 0;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #e2e8f0;
  background: #f8fafc;
}
.modal-title { font-size: 1.25rem; font-weight: 700; color: #0f172a; margin: 0.35rem 0 0.15rem 0; }
.version-tag { font-size: 0.75rem; color: #64748b; font-weight: 500; }
.btn-close { background: transparent; border: none; font-size: 1.2rem; color: #64748b; cursor: pointer; padding: 0.25rem 0.5rem; line-height: 1; }
.btn-close:hover { color: #0f172a; }
.pasos-canal { display: flex; gap: 0.5rem; flex-wrap: wrap; list-style: none; padding: 0.75rem 1.5rem; margin: 0; font-size: 0.8rem; border-bottom: 1px solid #e2e8f0; }
.pasos-canal li { padding: 0.25rem 0.7rem; border-radius: 9999px; border: 1px solid #cbd5e1; color: #64748b; background: #ffffff; }
.pasos-canal li.activo { background: var(--color-primary, #1e40af); border-color: var(--color-primary, #1e40af); color: #ffffff; font-weight: 600; }
.pasos-canal li.hecho { background: #dbeafe; border-color: #bfdbfe; color: #1e40af; }
.modal-body { padding: 1.25rem 1.5rem; overflow-y: auto; flex: 1; color: #0f172a; }
.hint { font-size: 0.875rem; color: #64748b; margin: 0 0 1rem; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(210px, 1fr)); gap: 0.9rem; }
.grid label { display: flex; flex-direction: column; gap: 0.35rem; }
.campo-label { font-size: 0.875rem; font-weight: 600; color: #0f172a; }
.edad-calculada { font-size: 0.8rem; color: #64748b; }
.alerta-medica { background: #fffbeb; border: 1px solid #fde68a; color: #92400e; padding: 0.75rem 1rem; border-radius: 0.4rem; font-size: 0.85rem; line-height: 1.45; margin-bottom: 1rem; }
.terminos-caja { max-height: 280px; overflow-y: auto; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 0.75rem 1rem; font-size: 0.875rem; line-height: 1.5; }
.terminos-caja h3 { font-size: 0.95rem; margin: 0.25rem 0 0.35rem; color: #0f172a; }
.terminos-caja p { margin: 0 0 0.6rem; color: #334155; }
.terminos-caja .constancia { font-size: 0.8rem; color: #1e40af; background: #dbeafe; padding: 0.4rem 0.65rem; border-radius: 0.25rem; }
.check { display: flex; gap: 0.6rem; align-items: flex-start; margin: 1rem 0; padding: 0.75rem 1rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.5rem; font-size: 0.9rem; }
.check input { margin-top: 0.2rem; accent-color: var(--color-primary, #1e40af); }
.acciones { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.25rem; padding-top: 1rem; border-top: 1px solid #e2e8f0; flex-wrap: wrap; }
.alert ul { margin: 0.25rem 0 0 1.1rem; padding: 0; }
.campo-fijo { background: #f1f5f9; color: #334155; cursor: not-allowed; }
</style>
