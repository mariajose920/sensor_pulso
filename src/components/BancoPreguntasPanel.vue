<template>
  <div class="banco-panel" data-testid="banco-preguntas-panel">
    <!-- Formulario para crear nueva pregunta en el banco -->
    <div class="banco-form-card">
      <div class="banco-header-row">
        <div>
          <h3 class="banco-titulo">
            🏦 Nuevo ítem en el Banco de Preguntas
            <span class="badge" :class="origenBanco === 'supabase' ? 'badge-bd' : 'badge-local-item'">
              {{ origenBanco === 'supabase' ? '☁️ Conectado a Supabase' : '💾 Modo demo local' }}
            </span>
          </h3>
          <p class="banco-subtitulo">
            Guarda preguntas en tu banco personal o compártelas para reutilizarlas en distintas evaluaciones.
          </p>
        </div>
        <button type="button" class="btn btn-secondary btn-sm" @click="$emit('cerrar')">
          ← Volver a la evaluación
        </button>
      </div>

      <p v-if="feedback.texto" class="alert" :class="feedback.error ? 'alert-error' : 'alert-success'">
        {{ feedback.texto }}
      </p>

      <form @submit.prevent="guardarPregunta" class="banco-form">
        <div class="form-group">
          <label class="form-label" for="banco-enunciado">Enunciado de la pregunta *</label>
          <textarea
            id="banco-enunciado"
            v-model="form.enunciado"
            class="form-input"
            rows="2"
            placeholder="Ej: ¿Qué longitud de onda infrarroja utiliza el sensor MAX30102?"
            required
          />
        </div>

        <div class="banco-grid-3">
          <div class="form-group">
            <label class="form-label" for="banco-tipo">Tipo</label>
            <select id="banco-tipo" v-model="form.tipo" class="form-select">
              <option v-for="t in TIPOS_PREGUNTA_BANCO" :key="t.valor" :value="t.valor">
                {{ t.etiqueta }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="banco-puntaje">Puntaje base</label>
            <input id="banco-puntaje" v-model.number="form.puntaje" type="number" min="1" max="100" class="form-input" />
          </div>

          <div class="form-group">
            <label class="form-label" for="banco-etiquetas">Etiquetas (separadas por coma)</label>
            <input
              id="banco-etiquetas"
              v-model="form.etiquetasTexto"
              class="form-input"
              placeholder="Ej: spo2, bpm, ppg"
            />
          </div>
        </div>

        <!-- Opciones si es opción múltiple -->
        <div v-if="form.tipo === 'opcion_multiple'" class="opciones-banco-box">
          <label class="form-label">Alternativas (marca la correcta):</label>
          <div v-for="(op, idx) in form.opciones" :key="op.id" class="opcion-row">
            <input
              type="radio"
              name="banco-correcta"
              :value="op.id"
              v-model="form.respuestaCorrecta"
            />
            <span class="opcion-letra">{{ op.id.toUpperCase() }})</span>
            <input
              v-model="op.texto"
              class="form-input form-input-sm"
              :placeholder="`Alternativa ${op.id.toUpperCase()}...`"
            />
          </div>
        </div>

        <!-- Verdadero / Falso -->
        <div v-else-if="form.tipo === 'verdadero_falso'" class="opciones-banco-box">
          <label class="form-label">Respuesta correcta:</label>
          <div class="vf-radios">
            <label><input type="radio" :value="true" v-model="form.respuestaVF" /> Verdadero</label>
            <label><input type="radio" :value="false" v-model="form.respuestaVF" /> Falso</label>
          </div>
        </div>

        <!-- Numérica -->
        <div v-else-if="form.tipo === 'numerica'" class="opciones-banco-box banco-grid-2">
          <div class="form-group">
            <label class="form-label">Valor numérico correcto</label>
            <input v-model.number="form.respuestaNumValor" type="number" step="any" class="form-input form-input-sm" />
          </div>
          <div class="form-group">
            <label class="form-label">Tolerancia (±)</label>
            <input v-model.number="form.respuestaNumTol" type="number" step="any" min="0" class="form-input form-input-sm" />
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="banco-explicacion">Retroalimentación / Explicación (opcional)</label>
          <input
            id="banco-explicacion"
            v-model="form.explicacion"
            class="form-input"
            placeholder="Breve explicación educativa de la respuesta..."
          />
        </div>

        <div class="banco-share-row">
          <label class="checkbox-compartir" :class="{ deshabilitado: !puedeCompartir }">
            <input
              type="checkbox"
              v-model="form.compartida"
              :disabled="!puedeCompartir"
              data-testid="banco-check-compartir"
            />
            <span>🌐 Compartir en el banco común (visible para otros docentes)</span>
          </label>
          <small v-if="!puedeCompartir" class="texto-permiso">
            Tu cuenta no tiene habilitado el permiso «Compartir en banco» (solicítalo al administrador).
          </small>
        </div>

        <button type="submit" class="btn btn-primary" :disabled="guardando" data-testid="banco-guardar">
          {{ guardando ? 'Guardando…' : 'Guardar Pregunta en el Banco' }}
        </button>
      </form>
    </div>

    <!-- Listado y filtros del banco -->
    <div class="banco-listado-card">
      <div class="filtros-bar">
        <div class="alcance-pills">
          <button
            type="button"
            class="pill-btn"
            :class="{ activo: alcance === 'ambos' }"
            @click="cambiarAlcance('ambos')"
          >
            Todas ({{ preguntas.length }})
          </button>
          <button
            type="button"
            class="pill-btn"
            :class="{ activo: alcance === 'personal' }"
            @click="cambiarAlcance('personal')"
          >
            🔒 Mi Banco Personal
          </button>
          <button
            type="button"
            class="pill-btn"
            :class="{ activo: alcance === 'compartido' }"
            @click="cambiarAlcance('compartido')"
          >
            🌐 Banco Compartido
          </button>
        </div>

        <input
          v-model="filtroTexto"
          class="form-input form-input-sm filtro-busqueda"
          placeholder="Buscar por texto o etiqueta..."
        />
      </div>

      <p v-if="!preguntasFiltradas.length" class="vacio-banco">
        No hay preguntas en esta vista del banco todavía.
      </p>

      <ul v-else class="lista-banco">
        <li v-for="p in preguntasFiltradas" :key="p.id" class="item-banco" data-testid="banco-item">
          <div class="item-banco-top">
            <div class="badges-row">
              <span class="badge" :class="p.compartida ? 'badge-shared' : 'badge-private'">
                {{ p.compartida ? '🌐 Compartida' : '🔒 Personal' }}
              </span>
              <span class="badge badge-meta">{{ etiquetaTipo(p.tipo) }}</span>
              <span class="badge badge-meta">{{ p.puntaje }} pts</span>
              <span class="badge" :class="p.origen === 'supabase' ? 'badge-bd' : 'badge-local-item'">
                {{ p.origen === 'supabase' ? '☁️ Supabase' : '💾 Local' }}
              </span>
              <span v-for="tag in (p.etiquetas || [])" :key="tag" class="badge badge-tag">#{{ tag }}</span>
            </div>
            <small class="autor-label">Por: {{ p.autor_id === usuarioId ? 'Ti' : (p.autor_nombre || 'Docente') }}</small>
          </div>

          <p class="item-enunciado">{{ p.enunciado }}</p>

          <div class="item-banco-actions">
            <button
              type="button"
              class="btn btn-primary btn-sm"
              :disabled="yaEnEvaluacion(p.id)"
              @click="$emit('agregar-pregunta', p)"
              data-testid="banco-usar-pregunta"
            >
              {{ yaEnEvaluacion(p.id) ? '✓ Ya en evaluación' : '➕ Usar en evaluación' }}
            </button>

            <button
              v-if="esPropiaOAdmin(p)"
              type="button"
              class="btn btn-secondary btn-sm"
              :disabled="!p.compartida && !puedeCompartir && !esAdmin"
              @click="toggleCompartir(p)"
            >
              {{ p.compartida ? '🔒 Hacer privada' : '🌐 Compartir' }}
            </button>

            <button
              v-if="esPropiaOAdmin(p)"
              type="button"
              class="btn btn-secondary btn-sm btn-peligro-txt"
              @click="borrarPregunta(p)"
            >
              🗑️ Eliminar
            </button>
          </div>
        </li>
      </ul>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  TIPOS_PREGUNTA_BANCO,
  listarBancoPreguntas,
  crearPreguntaBanco,
  actualizarCompartirPregunta,
  eliminarPreguntaBanco,
  verificarPermisoCompartirBanco
} from '../services/bancoPreguntasService.js'

const props = defineProps({
  usuarioId: { type: String, default: '' },
  usuarioNombre: { type: String, default: 'Docente' },
  esAdmin: { type: Boolean, default: false },
  puedeGestionar: { type: Boolean, default: false },
  idsEnEvaluacion: { type: Array, default: () => [] }
})

const emit = defineEmits(['agregar-pregunta', 'cerrar', 'actualizado'])

const preguntas = ref([])
const origenBanco = ref('local')
const alcance = ref('ambos')
const filtroTexto = ref('')
const guardando = ref(false)
const puedeCompartir = ref(false)
const feedback = ref({ texto: '', error: false })

const crearEstadoInicial = () => ({
  enunciado: '',
  tipo: 'opcion_multiple',
  puntaje: 10,
  etiquetasTexto: '',
  opciones: [
    { id: 'a', texto: '' },
    { id: 'b', texto: '' },
    { id: 'c', texto: '' },
    { id: 'd', texto: '' }
  ],
  respuestaCorrecta: 'a',
  respuestaVF: true,
  respuestaNumValor: 70,
  respuestaNumTol: 2,
  explicacion: '',
  compartida: false
})

const form = ref(crearEstadoInicial())

const preguntasFiltradas = computed(() => {
  const q = filtroTexto.value.trim().toLowerCase()
  return preguntas.value.filter(p => {
    const esPropia = props.usuarioId && p.autor_id === props.usuarioId
    const esCompartida = !!p.compartida && p.revision_global === 'aprobada'
    if (alcance.value === 'personal' && !esPropia) return false
    if (alcance.value === 'compartido' && !esCompartida) return false
    if (!q) return true
    const enTexto = (p.enunciado || '').toLowerCase().includes(q)
    const enTags = (p.etiquetas || []).some(t => String(t).toLowerCase().includes(q))
    return enTexto || enTags
  })
})

function etiquetaTipo(tipo) {
  return TIPOS_PREGUNTA_BANCO.find(t => t.valor === tipo)?.etiqueta || tipo
}

function esPropiaOAdmin(p) {
  return props.esAdmin || (props.usuarioId && p.autor_id === props.usuarioId)
}

function yaEnEvaluacion(id) {
  return props.idsEnEvaluacion.includes(id)
}

function cambiarAlcance(nuevo) {
  alcance.value = nuevo
}

async function recargarBanco() {
  const res = await listarBancoPreguntas({ usuarioId: props.usuarioId, alcance: 'ambos' })
  if (res.origen) origenBanco.value = res.origen
  if (!res.success) {
    feedback.value = { texto: `Error al leer el banco desde Supabase: ${res.error}`, error: true }
    preguntas.value = []
    emit('actualizado', [])
    return
  }
  preguntas.value = res.data || []
  emit('actualizado', preguntas.value)
}

async function guardarPregunta() {
  feedback.value = { texto: '', error: false }
  guardando.value = true

  let respCorrecta = null
  if (form.value.tipo === 'opcion_multiple') respCorrecta = form.value.respuestaCorrecta
  else if (form.value.tipo === 'verdadero_falso') respCorrecta = form.value.respuestaVF
  else if (form.value.tipo === 'numerica') {
    respCorrecta = { valor: Number(form.value.respuestaNumValor), tolerancia: Number(form.value.respuestaNumTol) || 0 }
  }

  const res = await crearPreguntaBanco({
    autorId: props.usuarioId,
    autorNombre: props.usuarioNombre,
    enunciado: form.value.enunciado,
    tipo: form.value.tipo,
    opciones: form.value.tipo === 'opcion_multiple' ? form.value.opciones : null,
    respuestaCorrecta: respCorrecta,
    explicacion: form.value.explicacion,
    puntaje: form.value.puntaje,
    etiquetas: form.value.etiquetasTexto,
    compartida: form.value.compartida,
    puedeGestionar: props.puedeGestionar,
    puedeCompartir: puedeCompartir.value
  })
  guardando.value = false

  if (!res.success) {
    feedback.value = { texto: res.error, error: true }
    return
  }

  const sufijo = res.origen === 'supabase' ? ' (guardada en Supabase BD)' : ' (guardada localmente — sesión demo)'
  feedback.value = {
    texto: (res.data?.compartida
      ? 'Pregunta guardada y compartida en el banco común'
      : 'Pregunta guardada en tu banco personal') + sufijo + '.',
    error: false
  }
  form.value = crearEstadoInicial()
  await recargarBanco()
}

async function toggleCompartir(p) {
  const res = await actualizarCompartirPregunta({
    preguntaId: p.id,
    compartida: !p.compartida,
    autorId: props.usuarioId,
    esAdmin: props.esAdmin,
    puedeCompartir: puedeCompartir.value
  })
  if (!res.success) {
    feedback.value = { texto: res.error, error: true }
    return
  }
  await recargarBanco()
}

async function borrarPregunta(p) {
  const res = await eliminarPreguntaBanco({
    preguntaId: p.id,
    autorId: props.usuarioId,
    esAdmin: props.esAdmin
  })
  if (!res.success) {
    feedback.value = { texto: res.error, error: true }
    return
  }
  await recargarBanco()
}

onMounted(async () => {
  puedeCompartir.value = await verificarPermisoCompartirBanco({
    usuarioId: props.usuarioId,
    esAdmin: props.esAdmin
  })
  await recargarBanco()
})
</script>

<style scoped>
.banco-panel { display: grid; gap: 1.25rem; margin-bottom: 1.5rem; }
.banco-form-card, .banco-listado-card {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 1.25rem;
}
.banco-header-row {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}
.banco-titulo { margin: 0; font-size: 1.05rem; color: #0f172a; }
.banco-subtitulo { margin: 0.25rem 0 0; font-size: 0.85rem; color: var(--color-muted); }
.banco-form { display: grid; gap: 0.75rem; }
.banco-grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; }
.banco-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0.75rem; }
.opciones-banco-box {
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 6px;
  padding: 0.75rem;
}
.opcion-row { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.4rem; }
.opcion-letra { font-weight: 700; width: 22px; font-size: 0.85rem; color: #64748b; }
.form-input-sm { padding: 0.35rem 0.5rem; font-size: 0.85rem; }
.vf-radios { display: flex; gap: 1.5rem; font-size: 0.9rem; margin-top: 0.35rem; }
.banco-share-row { display: flex; flex-direction: column; gap: 0.25rem; }
.checkbox-compartir { display: flex; align-items: center; gap: 0.5rem; font-size: 0.9rem; font-weight: 500; cursor: pointer; }
.checkbox-compartir.deshabilitado { opacity: 0.6; cursor: not-allowed; }
.texto-permiso { color: #b45309; font-size: 0.78rem; }

.filtros-bar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1rem;
}
.alcance-pills { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.pill-btn {
  background: #ffffff;
  border: 1px solid var(--color-border);
  padding: 0.4rem 0.75rem;
  border-radius: 999px;
  font-size: 0.82rem;
  font-weight: 600;
  color: #475569;
  cursor: pointer;
}
.pill-btn.activo { background: #e0e7ff; border-color: #6366f1; color: #3730a3; }
.filtro-busqueda { max-width: 260px; }
.vacio-banco { text-align: center; color: var(--color-muted); font-size: 0.9rem; padding: 1rem; }

.lista-banco { list-style: none; padding: 0; margin: 0; display: grid; gap: 0.75rem; }
.item-banco {
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.9rem 1rem;
  display: grid;
  gap: 0.5rem;
}
.item-banco-top { display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 0.5rem; }
.badges-row { display: flex; flex-wrap: wrap; gap: 0.35rem; }
.badge-shared { background: #dcfce7; color: #166534; font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 4px; }
.badge-private { background: #f1f5f9; color: #475569; font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 4px; }
.badge-meta { background: #e0f2fe; color: #0369a1; font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 4px; }
.badge-tag { background: #ede9fe; color: #5b21b6; font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 4px; }
.badge-bd { background: #ecfeff; color: #0e7490; font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 4px; vertical-align: middle; margin-left: 0.35rem; }
.badge-local-item { background: #fef3c7; color: #92400e; font-size: 0.72rem; padding: 0.15rem 0.45rem; border-radius: 4px; vertical-align: middle; margin-left: 0.35rem; }
.autor-label { font-size: 0.78rem; color: #64748b; }
.item-enunciado { margin: 0; font-size: 0.95rem; font-weight: 600; color: #0f172a; }
.item-banco-actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 0.25rem; }
.btn-peligro-txt { color: #b91c1c; }
</style>