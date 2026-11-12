<template>
  <div class="evaluaciones-container">
    <div class="card">
      <div class="header-flex">
        <div>
          <h1 class="card-title">📋 Gestión de Evaluaciones</h1>
          <p class="header-desc">
            Crea una evaluación desde cero o utiliza una plantilla precargada oficial para tu aula (RF105).
          </p>
        </div>
      </div>

      <AvisoEducativo compacto />

      <p v-if="!puedeGestionar" class="alert alert-error">Solo los profesores y administradores pueden crear evaluaciones.</p>

      <template v-else>
        <p v-if="!aulas.length" class="alert alert-info">Primero crea un aula en la sección Aulas.</p>

        <div v-else>
          <!-- Selector de Modo: Crear desde Cero, Precargada o Banco de Preguntas -->
          <div class="modo-tabs">
            <button 
              type="button" 
              class="modo-tab-btn" 
              :class="{ activo: modoCreacion === 'cero' }"
              @click="seleccionarModo('cero')"
            >
              ✍️ Crear Evaluación desde Cero
            </button>
            <button 
              type="button" 
              class="modo-tab-btn" 
              :class="{ activo: modoCreacion === 'precargada' }"
              @click="seleccionarModo('precargada')"
            >
              📦 Usar Plantilla Precargada ({{ plantillasPrecargadas.length }})
            </button>
            <button 
              type="button" 
              class="modo-tab-btn" 
              :class="{ activo: modoCreacion === 'banco' }"
              @click="seleccionarModo('banco')"
              data-testid="tab-banco-preguntas"
            >
              🏦 Banco de Preguntas ({{ bancoPreguntas.length }})
            </button>
          </div>

          <!-- BANCO DE PREGUNTAS PERSONAL Y COMPARTIDO (RF108) -->
          <BancoPreguntasPanel
            v-if="modoCreacion === 'banco'"
            :usuario-id="currentUserId || ''"
            :usuario-nombre="currentUserName || 'Docente'"
            :es-admin="isAdmin"
            :puede-gestionar="puedeGestionar"
            :ids-en-evaluacion="idsPreguntasEnEvaluacion"
            @agregar-pregunta="agregarPreguntaDesdeBanco"
            @actualizado="bancoPreguntas = $event"
            @cerrar="seleccionarModo('cero')"
          />

          <!-- CATÁLOGO DE EVALUACIONES PRECARGADAS (RF105) -->
          <div v-if="modoCreacion === 'precargada'" class="catalogo-precargadas">
            <h3 class="seccion-subtitulo">Selecciona una plantilla oficial para cargar en el formulario:</h3>
            <div class="grid-plantillas">
              <div 
                v-for="p in plantillasPrecargadas" 
                :key="p.id" 
                class="plantilla-card"
                :class="{ seleccionada: plantillaSeleccionadaId === p.id }"
              >
                <div class="plantilla-top">
                  <span class="badge badge-tipo">{{ p.tipo === 'ejercicio_aplicado' ? 'Ejercicio Práctico' : 'Preguntas Teóricas' }}</span>
                  <span class="badge badge-preguntas">📝 {{ (p.preguntas || []).length }} preguntas</span>
                </div>
                <h4 class="plantilla-titulo">{{ p.titulo }}</h4>
                <p class="plantilla-desc">{{ p.descripcion }}</p>
                
                <div class="plantilla-footer">
                  <TipoEvaluacionBadge :tipo="p.tipo" :ejercicio="p.ejercicio" :criterio="p.criterio" />
                  <button 
                    type="button" 
                    class="btn btn-secondary btn-sm"
                    @click="cargarPlantillaEnFormulario(p)"
                  >
                    Usar esta plantilla
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- FORMULARIO DE EVALUACIÓN (RF105 / RF108) -->
          <form v-if="modoCreacion !== 'banco'" class="nueva" novalidate @submit.prevent="guardar">
            <div v-if="plantillaSeleccionadaId" class="banner-precargada">
              <span>✓ Plantilla cargada en el formulario. Puedes personalizar el título, criterios y preguntas antes de guardar.</span>
              <button type="button" class="btn-link" @click="limpiarPlantilla">Restablecer formulario</button>
            </div>

            <div class="form-group">
              <label class="form-label" for="eval-aula">Aula Destino *</label>
              <select id="eval-aula" v-model="aulaId" class="form-select" data-testid="eval-aula" @change="cargarLista">
                <option v-for="a in aulas" :key="a.id" :value="a.id">{{ a.nombre }}</option>
              </select>
            </div>

            <div class="form-group">
              <label class="form-label" for="eval-titulo">Título de la Evaluación *</label>
              <input 
                id="eval-titulo" 
                v-model="titulo" 
                class="form-input" 
                placeholder="Ej: Control 1: Medición de Pulso y Saturación" 
                maxlength="120" 
                data-testid="eval-titulo" 
              />
            </div>

            <div class="form-group">
              <label class="form-label" for="eval-desc">Descripción (opcional)</label>
              <textarea 
                id="eval-desc" 
                v-model="descripcion" 
                class="form-input" 
                placeholder="Instrucciones generales para el estudiante..." 
                rows="2" 
              />
            </div>

            <!-- TIPO DE EVALUACIÓN (RF106) -->
            <TipoEvaluacionForm v-model="modelo" :mostrar-errores="intentado" />
            <!-- SECCIÓN DE PREGUNTAS (RF105 / RF108) -->
            <div class="seccion-preguntas">
              <div class="preguntas-header">
                <div>
                  <h3 class="preguntas-titulo">📝 Preguntas de la Evaluación ({{ preguntas.length }})</h3>
                  <p class="preguntas-desc">Agrega preguntas manuales, reutilízalas o tómalas al azar desde el banco.</p>
                </div>
                <div class="preguntas-acciones">
                  <button type="button" class="btn btn-secondary btn-sm" @click="seleccionarModo('banco')">
                    📚 Elegir del Banco
                  </button>
                  <button type="button" class="btn btn-secondary btn-sm" @click="agregarPreguntaVacia">
                    + Agregar Pregunta
                  </button>
                </div>
              </div>

              <!-- Selección al azar desde el banco (RF108) -->
              <div class="azar-box" data-testid="selector-azar-banco">
                <span class="azar-label">🎲 Agregar al azar del banco:</span>
                <div class="azar-controles">
                  <input
                    v-model.number="cantidadAzar"
                    type="number"
                    min="1"
                    max="50"
                    class="form-input form-input-sm azar-num"
                    title="Cantidad de preguntas al azar"
                    data-testid="azar-cantidad"
                  />
                  <select v-model="alcanceAzar" class="form-select form-input-sm" data-testid="azar-alcance">
                    <option value="ambos">Personal + Compartido</option>
                    <option value="personal">Solo mi banco personal</option>
                    <option value="compartido">Solo banco compartido</option>
                  </select>
                  <input
                    v-model="etiquetaAzar"
                    type="text"
                    class="form-input form-input-sm"
                    placeholder="Etiqueta opcional (ej: spo2)"
                    data-testid="azar-etiqueta"
                  />
                  <button
                    type="button"
                    class="btn btn-secondary btn-sm"
                    @click="agregarDesdeBancoAlAzar"
                    data-testid="btn-agregar-azar"
                  >
                    🎲 Seleccionar {{ cantidadAzar || 1 }} al azar
                  </button>
                </div>
                <small v-if="avisoAzar" class="azar-aviso">{{ avisoAzar }}</small>
              </div>

              <div v-if="preguntas.length === 0" class="preguntas-vacio">
                <p>No has agregado preguntas todavía. Puedes añadir preguntas manuales, elegir del banco o seleccionar al azar.</p>
              </div>

              <div v-else class="preguntas-lista">
                <div v-for="(preg, idx) in preguntas" :key="idx" class="pregunta-box">
                  <div class="pregunta-top">
                    <span class="pregunta-numero">
                      Pregunta #{{ idx + 1 }}
                      <span v-if="preg.bancoId" class="badge badge-banco">Del banco</span>
                    </span>
                    <button type="button" class="btn-borrar-pregunta" @click="eliminarPregunta(idx)" title="Eliminar pregunta">✕</button>
                  </div>
                  <div class="form-group">
                    <label class="form-label">Enunciado de la pregunta *</label>
                    <input 
                      v-model="preg.enunciado" 
                      class="form-input" 
                      placeholder="Ej: ¿Cuál es el rango normal de BPM en reposo?" 
                      required 
                    />
                  </div>

                  <div class="fila-puntaje-tipo">
                    <div class="form-group" style="flex: 1;">
                      <label class="form-label">Tipo de Pregunta</label>
                      <select v-model="preg.tipo" class="form-select">
                        <option value="opcion_multiple">Opción Múltiple</option>
                        <option value="verdadero_falso">Verdadero / Falso</option>
                        <option value="numerica">Numérica</option>
                        <option value="abierta">Respuesta Abierta</option>
                      </select>
                    </div>
                    <div class="form-group" style="width: 140px;">
                      <label class="form-label">Puntaje</label>
                      <input v-model.number="preg.puntaje" type="number" min="1" max="100" class="form-input" />
                    </div>
                  </div>

                  <!-- Alternativas para Opción Múltiple -->
                  <div v-if="preg.tipo === 'opcion_multiple'" class="opciones-box">
                    <label class="form-label">Alternativas (selecciona la correcta):</label>
                    <div v-for="(op, opIdx) in preg.opciones" :key="opIdx" class="opcion-item">
                      <input 
                        type="radio" 
                        :name="'correcta-' + idx" 
                        :value="op.id" 
                        v-model="preg.respuesta_correcta" 
                        title="Marcar como respuesta correcta"
                      />
                      <span class="opcion-letra">{{ op.id.toUpperCase() }})</span>
                      <input v-model="op.texto" class="form-input form-input-sm" placeholder="Texto de la alternativa..." />
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <p v-if="mensaje" class="alert" :class="mensajeError ? 'alert-error' : 'alert-success'" role="status" data-testid="eval-mensaje">
              {{ mensaje }}
            </p>

            <button type="submit" class="btn btn-primary btn-block" data-testid="eval-guardar" :disabled="guardando">
              {{ guardando ? 'Guardando…' : 'Guardar Evaluación' }}
            </button>
          </form>

          <!-- LISTADO DE EVALUACIONES CREADAS EN EL AULA (RF105) -->
          <section class="lista" aria-label="Evaluaciones del aula">
            <h2 class="lista-titulo">Evaluaciones asignadas a esta aula</h2>
            <p v-if="!evaluaciones.length" class="header-desc">Todavía no hay evaluaciones en esta aula.</p>
            <ul v-else class="lista-items">
              <li v-for="e in evaluaciones" :key="e.id" class="lista-item" data-testid="eval-item">
                <div class="lista-cabecera">
                  <strong>{{ e.titulo }}</strong>
                  <span v-if="e.precargadaBaseId" class="badge badge-precargada">Basada en plantilla precargada</span>
                  <span v-else class="badge badge-personalizada">Personalizada</span>
                  <span v-if="Array.isArray(e.preguntas)" class="badge badge-banco">📝 {{ e.preguntas.length }} pregunta(s)</span>
                  <span v-if="e.origen === 'supabase'" class="badge badge-bd" title="Guardada en PostgreSQL">☁️ Supabase</span>
                  <span v-else-if="e.origen === 'local'" class="badge badge-local" title="Guardada en este navegador">Local</span>
                </div>
                <p v-if="e.descripcion" class="lista-item-desc">{{ e.descripcion }}</p>
                <div class="lista-footer">
                  <TipoEvaluacionBadge :tipo="e.tipo" :ejercicio="e.ejercicio" :criterio="e.criterio" />
                  <router-link 
                    v-if="e.aula_id || aulaId"
                    :to="`/aulas/${e.aula_id || aulaId}?tab=evaluaciones`"
                    class="btn btn-secondary btn-sm"
                    style="color: #15803d; background: #f0fdf4; border-color: #bbf7d0; text-decoration: none; display: inline-flex; align-items: center;"
                    title="Monitorear avance en vivo en el aula (RF113)"
                  >
                    ⚡ Monitoreo en Vivo
                  </router-link>
                  <button 
                    type="button" 
                    class="btn btn-secondary btn-sm"
                    @click="duplicarExistente(e)"
                    title="Crear una copia de esta evaluación"
                  >
                    📑 Duplicar
                  </button>
                </div>
              </li>
            </ul>
          </section>
        </div>
      </template>
    </div>
  </div>
</template>

<script setup>
import AvisoEducativo from '../components/AvisoEducativo.vue'
import { ref, computed, onMounted } from 'vue'
import TipoEvaluacionForm from '../components/TipoEvaluacionForm.vue'
import TipoEvaluacionBadge from '../components/TipoEvaluacionBadge.vue'
import { useAuth } from '../composables/useAuth'
import { obtenerAulas } from '../services/aulasService'
import BancoPreguntasPanel from '../components/BancoPreguntasPanel.vue'
import { listarBancoPreguntas, seleccionarPreguntasAlAzar } from '../services/bancoPreguntasService.js'
import { 
  crearEvaluacion, 
  obtenerEvaluacionesAula, 
  obtenerEvaluacionesPrecargadas, 
  duplicarEvaluacion 
} from '../services/evaluacionesService'
import { modeloVacio, validarTipoEvaluacion } from '../utils/tiposEvaluacion.js'

const { currentUserId, currentUserName, currentUserEmail, isAdmin, isProfesor, can } = useAuth()
const puedeGestionar = computed(() => isAdmin.value || isProfesor.value || can('GESTIONAR_EVALUACIONES'))

const aulas = ref([])
const aulaId = ref('')
const titulo = ref('')
const descripcion = ref('')
const modelo = ref(modeloVacio())
const evaluaciones = ref([])
const intentado = ref(false)
const guardando = ref(false)
const mensaje = ref('')
const mensajeError = ref(false)

// RF105: Evaluaciones precargadas y modo
const modoCreacion = ref('cero') // 'cero' | 'precargada'
const plantillasPrecargadas = ref([])
const plantillaSeleccionadaId = ref(null)
const preguntas = ref([])

// RF108: Banco de preguntas y selección al azar
const bancoPreguntas = ref([])
const cantidadAzar = ref(3)
const alcanceAzar = ref('ambos')
const etiquetaAzar = ref('')
const avisoAzar = ref('')

const idsPreguntasEnEvaluacion = computed(() =>
  preguntas.value.map(p => p.bancoId).filter(Boolean)
)

function convertirPreguntaBanco(p) {
  return {
    bancoId: p.id,
    enunciado: p.enunciado,
    tipo: p.tipo || 'opcion_multiple',
    opciones: p.opciones ? JSON.parse(JSON.stringify(p.opciones)) : [],
    respuesta_correcta: p.respuesta_correcta ?? 'a',
    puntaje: Number(p.puntaje) || 10,
    etiquetas: Array.isArray(p.etiquetas) ? [...p.etiquetas] : [],
    compartida: !!p.compartida
  }
}

function agregarPreguntaDesdeBanco(p) {
  if (p.id && idsPreguntasEnEvaluacion.value.includes(p.id)) return
  preguntas.value.push(convertirPreguntaBanco(p))
  avisoAzar.value = `Se agregó "${p.enunciado.slice(0, 50)}..." a la evaluación.`
}

async function agregarDesdeBancoAlAzar() {
  avisoAzar.value = ''
  const res = await seleccionarPreguntasAlAzar({
    usuarioId: currentUserId.value,
    cantidad: cantidadAzar.value,
    alcance: alcanceAzar.value,
    etiqueta: etiquetaAzar.value,
    excluirIds: idsPreguntasEnEvaluacion.value
  })
  if (!res.success) {
    avisoAzar.value = res.error
    return
  }
  res.data.forEach(p => preguntas.value.push(convertirPreguntaBanco(p)))
  const via = res.origen === 'supabase' ? 'desde Supabase' : 'modo local'
  avisoAzar.value = `✓ Se añadieron ${res.data.length} pregunta(s) al azar (${via}).`
}

async function cargarBanco() {
  const res = await listarBancoPreguntas({ usuarioId: currentUserId.value, alcance: 'ambos' })
  bancoPreguntas.value = res.data || []
}

function seleccionarModo(modo) {
  modoCreacion.value = modo
}

function agregarPreguntaVacia() {
  preguntas.value.push({
    enunciado: '',
    tipo: 'opcion_multiple',
    opciones: [
      { id: 'a', texto: '' },
      { id: 'b', texto: '' },
      { id: 'c', texto: '' },
      { id: 'd', texto: '' }
    ],
    respuesta_correcta: 'a',
    puntaje: 10
  })
}

function eliminarPregunta(idx) {
  preguntas.value.splice(idx, 1)
}

function cargarPlantillaEnFormulario(p) {
  plantillaSeleccionadaId.value = p.id
  titulo.value = p.titulo
  descripcion.value = p.descripcion || ''
  modelo.value = {
    tipo: p.tipo,
    ejercicio: p.ejercicio,
    criterio: p.criterio ? JSON.parse(JSON.stringify(p.criterio)) : null
  }
  preguntas.value = p.preguntas ? JSON.parse(JSON.stringify(p.preguntas)) : []
  modoCreacion.value = 'cero' // Volver al formulario para editarla
}

function limpiarPlantilla() {
  plantillaSeleccionadaId.value = null
  titulo.value = ''
  descripcion.value = ''
  modelo.value = modeloVacio()
  preguntas.value = []
}

async function cargarLista() {
  if (!aulaId.value) return
  const res = await obtenerEvaluacionesAula(aulaId.value)
  evaluaciones.value = res.data || []
}

async function guardar() {
  intentado.value = true
  mensaje.value = ''
  if (validarTipoEvaluacion(modelo.value).length) return
  if (!titulo.value.trim()) {
    mensaje.value = 'El título de la evaluación es obligatorio.'
    mensajeError.value = true
    return
  }

  guardando.value = true
  const res = await crearEvaluacion({
    aulaId: aulaId.value,
    creadorId: currentUserId.value,
    titulo: titulo.value,
    descripcion: descripcion.value,
    modelo: modelo.value,
    preguntas: preguntas.value,
    precargadaBaseId: plantillaSeleccionadaId.value,
    puedeGestionar: puedeGestionar.value
  })
  guardando.value = false
  mensajeError.value = !res.success

  if (!res.success) {
    mensaje.value = res.error
    return
  }

  const totalPreg = preguntas.value.length
  mensaje.value = res.origen === 'local'
    ? 'Evaluación guardada localmente (sesión demo).'
    : `¡Evaluación guardada en Supabase con ${totalPreg} pregunta(s) vinculada(s)!`

  limpiarPlantilla()
  intentado.value = false
  await cargarLista()
  await cargarBanco()
}

async function duplicarExistente(ev) {
  guardando.value = true
  const res = await duplicarEvaluacion({
    evaluacionOriginalId: ev.id,
    aulaId: aulaId.value,
    creadorId: currentUserId.value,
    puedeGestionar: puedeGestionar.value
  })
  guardando.value = false
  if (res.success) {
    mensaje.value = `¡Evaluación "${ev.titulo}" duplicada con éxito!`
    mensajeError.value = false
    await cargarLista()
  } else {
    mensaje.value = res.error
    mensajeError.value = true
  }
}

onMounted(async () => {
  if (!puedeGestionar.value) return
  
  // 1. Cargar Aulas
  const resAulas = await obtenerAulas({
    usuarioId: currentUserId.value,
    usuarioCorreo: currentUserEmail.value,
    esAdmin: isAdmin.value,
    esProfesor: isProfesor.value
  })
  aulas.value = resAulas.data || []
  if (aulas.value.length) {
    aulaId.value = aulas.value[0].id
    await cargarLista()
  }

  // 2. Cargar Evaluaciones Precargadas
  const resPre = await obtenerEvaluacionesPrecargadas()
  plantillasPrecargadas.value = resPre.data || []

  // 3. Cargar Banco de Preguntas (RF108)
  await cargarBanco()
})
</script>

<style scoped>
.evaluaciones-container { max-width: 900px; margin: 0 auto; }
.header-desc { color: var(--color-muted); font-size: 0.95rem; margin-bottom: 1.25rem; }

/* Selector de Modos */
.modo-tabs {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  border-bottom: 2px solid var(--color-border);
  padding-bottom: 0.5rem;
}
.modo-tab-btn {
  background: none;
  border: none;
  padding: 0.6rem 1.1rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-muted);
  cursor: pointer;
  border-radius: 6px;
  transition: all 0.2s ease;
}
.modo-tab-btn.activo {
  background: #e0e7ff;
  color: #3730a3;
}

/* Catálogo de Precargadas */
.catalogo-precargadas {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.25rem;
  margin-bottom: 1.5rem;
}
.seccion-subtitulo {
  font-size: 1rem;
  margin-top: 0;
  margin-bottom: 1rem;
  color: #1e293b;
}
.grid-plantillas {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 1rem;
}
.plantilla-card {
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1rem;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  gap: 0.5rem;
  transition: border-color 0.2s;
}
.plantilla-card:hover {
  border-color: #6366f1;
}
.plantilla-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.badge-tipo { background: #e0f2fe; color: #0369a1; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; }
.badge-preguntas { background: #f1f5f9; color: #475569; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; }
.plantilla-titulo { margin: 0.25rem 0; font-size: 1rem; color: #0f172a; }
.plantilla-desc { font-size: 0.85rem; color: #64748b; margin: 0; flex: 1; }
.plantilla-footer {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px dashed var(--color-border);
}

.banner-precargada {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
  padding: 0.75rem 1rem;
  border-radius: 6px;
  margin-bottom: 1rem;
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 0.9rem;
}

/* Sección Preguntas */
.seccion-preguntas {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid var(--color-border);
}
.preguntas-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}
.preguntas-titulo { font-size: 1.05rem; margin: 0; }
.preguntas-desc { font-size: 0.85rem; color: var(--color-muted); margin: 0.2rem 0 0; }
.preguntas-vacio {
  background: #f8fafc;
  padding: 1rem;
  border-radius: 6px;
  text-align: center;
  color: var(--color-muted);
  font-size: 0.9rem;
}
.pregunta-box {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
}
.pregunta-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}
.pregunta-numero { font-weight: 600; font-size: 0.9rem; color: #475569; }
.btn-borrar-pregunta {
  background: none;
  border: none;
  color: #ef4444;
  font-weight: bold;
  cursor: pointer;
  padding: 0.2rem 0.5rem;
  border-radius: 4px;
}
.btn-borrar-pregunta:hover { background: #fee2e2; }
.fila-puntaje-tipo { display: flex; gap: 1rem; }
.opciones-box {
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.75rem;
  margin-top: 0.5rem;
}
.opcion-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.4rem;
}
.opcion-letra { font-weight: 600; width: 22px; font-size: 0.85rem; color: #64748b; }
.form-input-sm { padding: 0.35rem 0.5rem; font-size: 0.85rem; }

/* Listado de Evaluaciones */
.lista { margin-top: 2.5rem; }
.lista-titulo { font-size: 1.15rem; margin: 0 0 1rem; }
.lista-items { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.75rem; }
.lista-item { padding: 1rem 1.25rem; border: 1px solid var(--color-border); border-radius: 8px; display: grid; gap: 0.5rem; background: #fff; }
.lista-cabecera { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.lista-item-desc { font-size: 0.85rem; color: #64748b; margin: 0; }
.lista-footer { display: flex; justify-content: space-between; align-items: center; margin-top: 0.25rem; }
.badge-precargada { background: #e0e7ff; color: #3730a3; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; }
.badge-personalizada { background: #f1f5f9; color: #334155; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; }
.badge-local { background: #fef3c7; color: #92400e; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; }
.btn-block { width: 100%; margin-top: 1rem; }

.preguntas-acciones { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.azar-box {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 8px;
  padding: 0.75rem 0.9rem;
  margin-bottom: 1rem;
  display: grid;
  gap: 0.5rem;
}
.azar-label { font-size: 0.85rem; font-weight: 700; color: #1e40af; }
.azar-controles { display: flex; flex-wrap: wrap; gap: 0.5rem; align-items: center; }
.azar-num { width: 70px; }
.azar-aviso { font-size: 0.8rem; color: #1e3a8a; font-weight: 500; }
.badge-banco { background: #dbeafe; color: #1d4ed8; font-size: 0.7rem; padding: 0.12rem 0.45rem; border-radius: 4px; margin-left: 0.4rem; }
.badge-bd { background: #ecfeff; color: #0e7490; font-size: 0.75rem; padding: 0.2rem 0.5rem; border-radius: 4px; }
</style>