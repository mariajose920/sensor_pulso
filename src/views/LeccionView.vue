<template>
  <div v-if="leccion" class="leccion">
    <router-link to="/aprendizaje" class="volver">&larr; Apartado de aprendizaje</router-link>

    <article class="card">
      <span class="badge badge-usuario">{{ CATEGORIAS[leccion.categoria] }}</span>
      <h1 class="titulo">{{ leccion.titulo }}</h1>
      <p class="meta">Lectura de unos {{ leccion.minutos }} minutos</p>

      <template v-for="(b, i) in leccion.bloques" :key="i">
        <p v-if="b.tipo === 'texto'" class="texto">{{ b.texto }}</p>

        <section v-else-if="b.tipo === 'lista'" class="bloque">
          <h2 v-if="b.titulo" class="subtitulo">{{ b.titulo }}</h2>
          <ul><li v-for="(it, j) in b.items" :key="j">{{ it }}</li></ul>
        </section>

        <section v-else-if="b.tipo === 'pasos'" class="bloque">
          <h2 v-if="b.titulo" class="subtitulo">{{ b.titulo }}</h2>
          <ol><li v-for="(it, j) in b.items" :key="j">{{ it }}</li></ol>
        </section>

        <section v-else-if="b.tipo === 'formula'" class="bloque formula">
          <h2 v-if="b.titulo" class="subtitulo">{{ b.titulo }}</h2>
          <p class="ecuacion">{{ b.formula }}</p>
          <p v-if="b.nota" class="nota">{{ b.nota }}</p>
        </section>

        <aside v-else-if="b.tipo === 'dato'" class="bloque dato">
          <strong>{{ b.titulo }}</strong>
          <p>{{ b.texto }}</p>
        </aside>

        <section v-else-if="b.tipo === 'tabla'" class="bloque">
          <h2 v-if="b.titulo" class="subtitulo">{{ b.titulo }}</h2>
          <div class="tabla-envoltura">
            <table>
              <thead><tr><th v-for="c in b.columnas" :key="c">{{ c }}</th></tr></thead>
              <tbody><tr v-for="(f, j) in b.filas" :key="j"><td v-for="(celda, k) in f" :key="k">{{ celda }}</td></tr></tbody>
            </table>
          </div>
        </section>

        <aside v-else-if="b.tipo === 'aviso'" class="bloque aviso" role="note">{{ b.texto }}</aside>

        <EsquemaLeccion v-else-if="b.tipo === 'esquema'" :nombre="b.nombre" :alt="b.alt" />

        <Spo2MedidaLeccion v-else-if="b.tipo === 'spo2_medida'" />
      </template>

      <p class="aviso-educativo">{{ AVISO_EDUCATIVO }}</p>
    </article>

    <nav class="navegacion" aria-label="Lecciones">
      <router-link v-if="anterior" :to="'/aprendizaje/' + anterior.slug" class="btn btn-secondary">&larr; {{ anterior.titulo }}</router-link>
      <span v-else></span>
      <router-link v-if="siguiente" :to="'/aprendizaje/' + siguiente.slug" class="btn btn-primary">{{ siguiente.titulo }} &rarr;</router-link>
      <router-link v-else to="/aprendizaje/simulador" class="btn btn-primary">Probar el simulador &rarr;</router-link>
    </nav>
  </div>

  <div v-else class="card">
    <h1 class="card-title">Lección no encontrada</h1>
    <p>Esa lección no existe. Vuelve al <router-link to="/aprendizaje">apartado de aprendizaje</router-link>.</p>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import EsquemaLeccion from '../components/EsquemaLeccion.vue'
import Spo2MedidaLeccion from '../components/Spo2MedidaLeccion.vue'
import { AVISO_EDUCATIVO, CATEGORIAS, buscarLeccion, vecinas } from '../data/lecciones.js'

const route = useRoute()
const leccion = computed(() => buscarLeccion(String(route.params.slug)))
const anterior = computed(() => vecinas(String(route.params.slug)).anterior)
const siguiente = computed(() => vecinas(String(route.params.slug)).siguiente)
</script>

<style scoped>
.volver { display: inline-block; margin-bottom: 0.75rem; font-size: 0.875rem; color: var(--color-primary); text-decoration: none; }
.titulo { font-size: 1.6rem; font-weight: 700; margin: 0.5rem 0 0.25rem; }
.meta { color: var(--color-muted); font-size: 0.85rem; margin: 0 0 1rem; }
.texto { line-height: 1.65; margin: 0 0 1rem; }
.bloque { margin: 1rem 0; }
.subtitulo { font-size: 1.05rem; font-weight: 600; margin: 0 0 0.5rem; }
ul, ol { margin: 0; padding-left: 1.35rem; line-height: 1.6; }
li { margin-bottom: 0.3rem; }
.formula { background: var(--color-bg); border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 0.85rem 1rem; }
.ecuacion { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 1.05rem; font-weight: 600; margin: 0.25rem 0; overflow-wrap: anywhere; }
.nota { color: var(--color-muted); font-size: 0.85rem; margin: 0.35rem 0 0; }
.dato { border-left: 4px solid var(--color-primary); background: #eff6ff; padding: 0.75rem 1rem; border-radius: 0.35rem; }
.dato p { margin: 0.25rem 0 0; line-height: 1.55; }
.aviso { border-left: 4px solid var(--color-warning); background: #fff7ed; padding: 0.75rem 1rem; border-radius: 0.35rem; line-height: 1.55; }
.tabla-envoltura { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; font-size: 0.9rem; }
th, td { text-align: left; padding: 0.5rem 0.6rem; border-bottom: 1px solid var(--color-border); vertical-align: top; }
th { background: var(--color-bg); font-weight: 600; }
.aviso-educativo { margin: 1.5rem 0 0; padding-top: 0.75rem; border-top: 1px solid var(--color-border); font-size: 0.8rem; color: var(--color-muted); }
.navegacion { display: flex; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
.navegacion .btn { text-decoration: none; }
</style>
