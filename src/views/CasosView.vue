<template>
  <div class="casos-view">
    <router-link to="/aprendizaje" class="volver">&larr; Apartado de aprendizaje</router-link>

    <section class="card" data-testid="casos-cabecera">
      <h1 class="card-title">Biblioteca de casos</h1>
      <p class="intro">
        Casos precargados de ritmos normales, patologías y arritmias. Cada uno muestra cómo se ve la señal de
        pulso (PPG) y el ECG equivalente de referencia, con una explicación de por qué se ve así.
      </p>
      <p class="aviso" role="note" data-testid="casos-aviso">{{ AVISO_REFERENCIA }}</p>

      <div class="filtros">
        <label class="campo">
          <span>Buscar</span>
          <input v-model="texto" type="search" placeholder="Ej.: fibrilación" data-testid="casos-buscar" />
        </label>
        <label class="campo">
          <span>Tipo</span>
          <select v-model="categoria" data-testid="casos-categoria">
            <option value="todas">Todos</option>
            <option v-for="c in categorias" :key="c.valor" :value="c.valor">{{ c.etiqueta }}</option>
          </select>
        </label>
        <label class="campo">
          <span>Gravedad</span>
          <select v-model="severidad" data-testid="casos-severidad">
            <option value="todas">Todas</option>
            <option v-for="s in SEVERIDADES" :key="s.valor" :value="s.valor">{{ s.etiqueta }}</option>
          </select>
        </label>
      </div>
      <p class="contador" data-testid="casos-contador">{{ casos.length }} de {{ total }} casos</p>
    </section>

    <p v-if="!casos.length" class="vacio card" data-testid="casos-vacio">
      Ningún caso coincide con los filtros. Prueba con otra búsqueda.
    </p>

    <ul class="lista">
      <li v-for="c in casos" :key="c.id">
        <button
          type="button"
          class="caso card"
          :class="{ activo: c.id === seleccionId }"
          :style="{ borderLeftColor: c.colorHex }"
          :data-testid="'caso-' + c.id"
          :aria-pressed="c.id === seleccionId"
          @click="seleccionar(c.id)"
        >
          <span class="caso-nombre">{{ c.nombre }}</span>
          <span class="caso-meta">{{ c.categoriaEtiqueta }} · {{ c.bpm }} BPM · {{ c.severidadTexto }}</span>
          <svg class="mini" viewBox="0 0 600 60" preserveAspectRatio="none" aria-hidden="true">
            <polyline :points="miniatura(c.id)" fill="none" :stroke="c.colorHex" stroke-width="2" />
          </svg>
          <span class="caso-desc">{{ c.descripcionCorta }}</span>
        </button>
      </li>
    </ul>

    <section v-if="seleccion" class="card detalle" data-testid="caso-detalle">
      <h2 class="card-title">{{ seleccion.nombre }}</h2>
      <p class="caso-meta">
        {{ seleccion.categoriaEtiqueta }} · {{ seleccion.bpm }} BPM · {{ seleccion.regularidadTexto }} ·
        {{ seleccion.severidadTexto }}
      </p>

      <h3>Pulso (PPG)</h3>
      <svg class="grafico" viewBox="0 0 600 120" preserveAspectRatio="none" role="img"
        :aria-label="'Señal de pulso de ' + seleccion.nombre">
        <polyline :points="puntosPpg" fill="none" :stroke="seleccion.colorHex" stroke-width="2" />
      </svg>

      <h3>ECG de referencia</h3>
      <svg class="grafico" viewBox="0 0 600 120" preserveAspectRatio="none" role="img"
        :aria-label="'ECG de referencia de ' + seleccion.nombre">
        <polyline :points="puntosEcg" fill="none" stroke="#475569" stroke-width="2" />
      </svg>
      <p class="nota">El ECG es solo una referencia didáctica; el sensor mide pulso, no actividad eléctrica.</p>

      <h3>Por qué se ve así</h3>
      <p data-testid="caso-fisiopatologia">{{ seleccion.fisiopatologia }}</p>
      <h3>Qué buscar en el pulso</h3>
      <p>{{ seleccion.criterioPpg }}</p>
      <h3>Qué buscar en el ECG</h3>
      <p>{{ seleccion.criterioEcg }}</p>

      <div class="acciones">
        <router-link to="/aprendizaje/simulador" class="btn btn-secondary">Probar en el simulador</router-link>
        <router-link to="/comparacion" class="btn btn-primary">Comparar con una medición</router-link>
      </div>
    </section>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { AVISO_REFERENCIA } from '../data/avisoEducativo.js'
import {
  SEVERIDADES,
  listarCategorias,
  listarCasos,
  filtrarCasos,
  obtenerCaso,
  obtenerSenalesCaso,
  serieAPuntosSvg
} from '../services/casosService.js'

const texto = ref('')
const categoria = ref('todas')
const severidad = ref('todas')
const seleccionId = ref(null)

const categorias = listarCategorias()
const total = listarCasos().length

const casos = computed(() =>
  filtrarCasos({ categoria: categoria.value, severidad: severidad.value, texto: texto.value })
)

const seleccion = computed(() => (seleccionId.value ? obtenerCaso(seleccionId.value) : null))

const senalSeleccion = computed(() =>
  seleccionId.value ? obtenerSenalesCaso(seleccionId.value, 4, 100) : null
)
const puntosPpg = computed(() => serieAPuntosSvg(senalSeleccion.value?.ppg, 600, 120))
const puntosEcg = computed(() => serieAPuntosSvg(senalSeleccion.value?.ecg, 600, 120))

const cacheMiniaturas = new Map()
function miniatura(id) {
  if (!cacheMiniaturas.has(id)) {
    const s = obtenerSenalesCaso(id, 3, 60)
    cacheMiniaturas.set(id, serieAPuntosSvg(s?.ppg, 600, 60, 4))
  }
  return cacheMiniaturas.get(id)
}

function seleccionar(id) {
  seleccionId.value = id
}
</script>

<style scoped>
.casos-view { max-width: 900px; margin: 0 auto; padding: 0 1rem 2rem; }
.volver { display: inline-block; margin: 0.75rem 0; color: var(--color-primary); }
.intro { margin: 0 0 0.75rem; }
.aviso { background: #fef3c7; border-left: 4px solid #d97706; padding: 0.6rem 0.8rem; border-radius: 4px; font-size: 0.9rem; }
.filtros { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 0.75rem; margin-top: 1rem; }
.campo { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
.campo input, .campo select { min-height: var(--alto-tactil, 44px); padding: 0 0.6rem; }
.contador { margin: 0.75rem 0 0; font-size: 0.85rem; color: #475569; }
.vacio { text-align: center; }
.lista { list-style: none; padding: 0; margin: 1rem 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem; }
.caso { display: flex; flex-direction: column; gap: 0.35rem; width: 100%; text-align: left; cursor: pointer; border-left: 5px solid; margin-bottom: 0; min-height: var(--alto-tactil, 44px); }
.caso.activo, .caso:focus-visible, .caso:hover { box-shadow: 0 2px 8px rgba(30, 64, 175, 0.2); }
.caso-nombre { font-weight: 600; }
.caso-meta { font-size: 0.8rem; color: #475569; }
.caso-desc { font-size: 0.85rem; }
.mini { width: 100%; height: 48px; background: #f8fafc; border-radius: 4px; }
.detalle h3 { margin: 1rem 0 0.35rem; font-size: 1rem; }
.grafico { width: 100%; height: 120px; background: #f8fafc; border-radius: 4px; }
.nota { font-size: 0.8rem; color: #475569; }
.acciones { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1.25rem; }
</style>
