<template>
  <div class="practica-view">
    <router-link to="/aprendizaje" class="volver">&larr; Apartado de aprendizaje</router-link>

    <!-- 1. Preparar la práctica -->
    <section v-if="fase === 'inicio'" class="card" data-testid="practica-inicio">
      <h1 class="card-title">Practicar para las evaluaciones</h1>
      <p class="intro">
        Responde preguntas basadas en las lecciones. Al corregir verás cuántas acertaste y, en cada error,
        por qué esa respuesta no era correcta y qué lección repasar.
      </p>
      <p class="nota">
        Es solo práctica: no se guarda y no cuenta como evaluación. Puedes hacerla con o sin sesión.
      </p>

      <div class="campos">
        <label class="campo">
          <span>Tema</span>
          <select v-model="leccionElegida" data-testid="practica-tema">
            <option value="todas">Todos los temas (mezcla, hasta 28 preguntas)</option>
            <option v-for="l in lecciones" :key="l.slug" :value="l.slug">
              {{ l.titulo }} (hasta 16 preguntas)
            </option>
          </select>
        </label>
        <label class="campo">
          <span>Cantidad de preguntas</span>
          <select v-model.number="cantidad" data-testid="practica-cantidad">
            <option v-for="n in opcionesCantidad" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
      </div>

      <button type="button" class="btn btn-primary" data-testid="practica-empezar" @click="empezar">
        Empezar la práctica
      </button>
    </section>

    <!-- 2. Responder -->
    <section v-else-if="fase === 'respondiendo'" data-testid="practica-preguntas">
      <div class="card">
        <h1 class="card-title">Práctica</h1>
        <p class="progreso" data-testid="practica-progreso">
          Respondidas: {{ respondidas }} de {{ preguntas.length }}
        </p>
      </div>

      <fieldset v-for="(p, i) in preguntas" :key="p.id" class="card pregunta" :data-testid="'pregunta-' + p.id">
        <legend class="enunciado">{{ i + 1 }}. {{ p.enunciado }}</legend>
        <label
          v-for="(op, j) in p.opciones"
          :key="j"
          class="opcion"
          :class="{ marcada: respuestas[p.id] === j }"
        >
          <input type="radio" :name="p.id" :value="j" v-model="respuestas[p.id]" />
          <span>{{ op.texto }}</span>
        </label>
      </fieldset>

      <p v-if="faltan > 0" class="aviso-faltan" data-testid="practica-faltan">
        Te faltan {{ faltan }} pregunta(s). Si corriges ahora, quedarán como «sin responder».
      </p>
      <div class="acciones">
        <button type="button" class="btn btn-secondary" @click="fase = 'inicio'">Cancelar</button>
        <button type="button" class="btn btn-primary" data-testid="practica-corregir" @click="corregir">Corregir</button>
      </div>
    </section>

    <!-- 3. Resultados -->
    <section v-else data-testid="practica-resultado">
      <div class="card resumen">
        <h1 class="card-title">Tu resultado</h1>
        <p class="puntaje" data-testid="practica-puntaje">{{ resultado.correctas }} de {{ resultado.total }} correctas ({{ resultado.porcentaje }} %)</p>
        <p class="valoracion">{{ valoracion(resultado.porcentaje) }}</p>
        <p class="desglose">
          Correctas: {{ resultado.correctas }} · Incorrectas: {{ resultado.incorrectas }} · Sin responder: {{ resultado.sinResponder }}
        </p>

        <div v-if="leccionesARepasar.length" class="repaso" data-testid="practica-repaso">
          <strong>Lecciones para repasar:</strong>
          <ul>
            <li v-for="l in leccionesARepasar" :key="l.slug">
              <router-link :to="'/aprendizaje/' + l.slug">{{ l.titulo }}</router-link>
            </li>
          </ul>
        </div>
      </div>

      <article
        v-for="(d, i) in resultado.detalle"
        :key="d.id"
        class="card revision"
        :class="d.ok ? 'acierto' : 'error'"
        :data-testid="'revision-' + d.id"
      >
        <p class="estado">
          <span v-if="d.ok">✔ Correcta</span>
          <span v-else-if="d.sinResponder">○ Sin responder</span>
          <span v-else>✘ Incorrecta</span>
        </p>
        <h2 class="enunciado">{{ i + 1 }}. {{ d.enunciado }}</h2>

        <p v-if="!d.ok && !d.sinResponder" class="tu-respuesta">
          <strong>Tu respuesta:</strong> {{ d.elegida }}
        </p>
        <p v-if="!d.ok && !d.sinResponder" class="por-que" data-testid="por-que-fallo">
          <strong>Por qué no es correcta:</strong> {{ d.porQueFalla }}
        </p>
        <p v-if="!d.ok" class="correcta">
          <strong>Respuesta correcta:</strong> {{ d.correcta }}
        </p>
        <p class="por-que-correcta">{{ d.porQueCorrecta }}</p>
        <router-link v-if="!d.ok" :to="'/aprendizaje/' + d.leccion" class="enlace-leccion">
          Repasar: {{ tituloDe(d.leccion) }}
        </router-link>
      </article>

      <div class="acciones">
        <button
          v-if="resultado.idsFalladas.length"
          type="button"
          class="btn btn-secondary"
          data-testid="practica-repetir-falladas"
          @click="repetirFalladas"
        >
          Repetir solo las que fallé
        </button>
        <button type="button" class="btn btn-primary" data-testid="practica-nueva" @click="fase = 'inicio'">
          Nueva práctica
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { LECCIONES } from '../data/lecciones.js'
import { PREGUNTAS_PRACTICA } from '../data/practicaEvaluacion.js'
import { armarPractica, corregirPractica, opcionesDeCantidad, valoracion } from '../utils/practica.js'

const lecciones = LECCIONES.filter(l => PREGUNTAS_PRACTICA.some(p => p.leccion === l.slug))

const fase = ref('inicio') // 'inicio' | 'respondiendo' | 'resultado'
const leccionElegida = ref('todas')
const cantidad = ref(8)
const preguntas = ref([])
const respuestas = ref({})
const resultado = ref(null)

const tituloDe = (slug) => LECCIONES.find(l => l.slug === slug)?.titulo || slug

// De 4 en 4: hasta 16 por tema, o hasta 28 si son todos los temas
const opcionesCantidad = computed(() => opcionesDeCantidad(PREGUNTAS_PRACTICA, leccionElegida.value))

// Al cambiar de tema, si la cantidad elegida ya no está entre las opciones se usa la más cercana
watch(opcionesCantidad, (lista) => {
  if (!lista.includes(cantidad.value)) cantidad.value = lista.filter(n => n <= cantidad.value).pop() || lista[0]
})

const respondidas = computed(() => preguntas.value.filter(p => Number.isInteger(respuestas.value[p.id])).length)
const faltan = computed(() => preguntas.value.length - respondidas.value)

const leccionesARepasar = computed(() =>
  (resultado.value?.leccionesARepasar || []).map(slug => ({ slug, titulo: tituloDe(slug) }))
)

function irArriba() {
  try { window.scrollTo({ top: 0, behavior: 'smooth' }) } catch { /* sin scroll */ }
}

function empezar() {
  preguntas.value = armarPractica(PREGUNTAS_PRACTICA, { cantidad: cantidad.value, leccion: leccionElegida.value })
  respuestas.value = {}
  resultado.value = null
  fase.value = 'respondiendo'
  irArriba()
}

function corregir() {
  resultado.value = corregirPractica(preguntas.value, respuestas.value)
  fase.value = 'resultado'
  irArriba()
}

function repetirFalladas() {
  preguntas.value = armarPractica(PREGUNTAS_PRACTICA, { ids: resultado.value.idsFalladas, cantidad: resultado.value.idsFalladas.length })
  respuestas.value = {}
  resultado.value = null
  fase.value = 'respondiendo'
  irArriba()
}
</script>

<style scoped>
.volver { display: inline-block; margin-bottom: 0.75rem; text-decoration: none; color: var(--color-primary); font-weight: 600; }
.intro { color: var(--color-muted); line-height: 1.55; margin: 0 0 0.5rem; }
.nota { font-size: 0.85rem; color: var(--color-muted); margin: 0 0 1rem; }
.campos { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 1rem; margin-bottom: 1rem; }
.campo { display: flex; flex-direction: column; gap: 0.3rem; font-weight: 600; font-size: 0.9rem; }
.campo select { min-height: var(--alto-tactil, 44px); padding: 0.4rem 0.6rem; border: 1px solid var(--color-border); border-radius: 0.5rem; background: var(--color-surface); color: var(--color-text); font: inherit; }
.progreso { margin: 0; color: var(--color-muted); font-weight: 600; }
.pregunta { border: 1px solid var(--color-border); }
.enunciado { font-size: 1.02rem; font-weight: 600; margin: 0 0 0.6rem; padding: 0; line-height: 1.4; }
.opcion { display: flex; align-items: flex-start; gap: 0.6rem; min-height: var(--alto-tactil, 44px); padding: 0.55rem 0.7rem; margin-bottom: 0.4rem; border: 1px solid var(--color-border); border-radius: 0.5rem; cursor: pointer; line-height: 1.4; }
.opcion:hover { border-color: var(--color-primary); }
.opcion.marcada { border-color: var(--color-primary); background: rgba(30, 64, 175, 0.07); }
.opcion input { margin-top: 0.2rem; }
.aviso-faltan { font-size: 0.85rem; color: var(--color-muted); margin: 0.5rem 0; }
.acciones { display: flex; flex-wrap: wrap; gap: 0.6rem; justify-content: flex-end; margin: 1rem 0 2rem; }
.puntaje { font-size: 1.6rem; font-weight: 700; margin: 0.25rem 0; }
.valoracion { margin: 0 0 0.4rem; font-weight: 600; }
.desglose { margin: 0 0 0.75rem; color: var(--color-muted); font-size: 0.9rem; }
.repaso ul { margin: 0.3rem 0 0; padding-left: 1.2rem; }
.revision { border-left: 5px solid var(--color-border); }
.revision.acierto { border-left-color: #16a34a; }
.revision.error { border-left-color: #dc2626; }
.estado { margin: 0 0 0.3rem; font-size: 0.85rem; font-weight: 700; }
.acierto .estado { color: #166534; }
.error .estado { color: #b91c1c; }
.revision .enunciado { font-size: 1rem; }
.tu-respuesta, .por-que, .correcta, .por-que-correcta { margin: 0.3rem 0; line-height: 1.5; font-size: 0.93rem; }
.por-que { color: #b91c1c; }
.correcta { color: #166534; }
.por-que-correcta { color: var(--color-muted); }
.enlace-leccion { display: inline-block; margin-top: 0.4rem; font-weight: 600; font-size: 0.9rem; }
</style>
