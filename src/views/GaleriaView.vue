<template>
  <div class="galeria-view">
    <section class="card" data-testid="galeria-cabecera">
      <h1 class="card-title">Galería de mediciones públicas</h1>
      <p class="intro">
        Mediciones que otras personas publicaron de forma anónima, más casos de referencia de docencia.
        No se muestra ningún dato que identifique a quien midió.
      </p>
      <p class="aviso" role="note">{{ AVISO_REFERENCIA }}</p>

      <div class="filtros">
        <label class="campo">
          <span>Actividad</span>
          <select v-model="actividad" data-testid="galeria-actividad">
            <option value="todas">Todas</option>
            <option v-for="a in ACTIVIDADES" :key="a.valor" :value="a.valor">
              {{ a.etiqueta }} ({{ conteo.actividad[a.valor] || 0 }})
            </option>
          </select>
        </label>
        <label class="campo">
          <span>Edad</span>
          <select v-model="edad" data-testid="galeria-edad">
            <option value="todas">Todas</option>
            <option v-for="r in RANGOS_EDAD" :key="r" :value="r">{{ r }} años ({{ conteo.edad[r] || 0 }})</option>
          </select>
        </label>
        <label class="campo">
          <span>Estado</span>
          <select v-model="estado" data-testid="galeria-estado">
            <option value="todas">Todos</option>
            <option v-for="e in ESTADOS" :key="e.valor" :value="e.valor">
              {{ e.etiqueta }} ({{ conteo.estado[e.valor] || 0 }})
            </option>
          </select>
        </label>
        <button type="button" class="btn btn-secondary limpiar" :disabled="!hayFiltros"
          data-testid="galeria-limpiar" @click="limpiar">Quitar filtros</button>
      </div>
      <p class="contador" data-testid="galeria-contador" aria-live="polite">
        {{ visibles.length }} de {{ todas.length }} mediciones
      </p>
    </section>

    <p v-if="cargando" class="card" data-testid="galeria-cargando">Cargando la galería…</p>
    <div v-else-if="!visibles.length" class="card vacio" data-testid="galeria-vacia">
      <p>No hay mediciones con esos filtros.</p>
      <button type="button" class="btn btn-secondary" @click="limpiar">Ver todas</button>
    </div>

    <ul class="lista">
      <li v-for="m in visibles" :key="m.id" class="item card" :data-testid="'medicion-' + m.id">
        <strong class="titulo">{{ m.titulo }}</strong>
        <span class="meta">{{ m.autorAnonimo }} · {{ m.rangoEdad }} años · {{ m.actividad }}</span>
        <div class="valores">
          <span class="bpm"><b>{{ Number(m.bpm).toFixed(1) }}</b> BPM</span>
          <span>{{ Number(m.spo2).toFixed(1) }} % SpO2</span>
          <span class="estado" :class="m.estado">{{ m.estado === 'dentro' ? 'Dentro del rango' : 'Fuera del rango' }}</span>
        </div>
        <span class="meta">Calidad: {{ m.calidadTexto || m.calidad }} · Ritmo: {{ m.ritmoTexto || m.ritmo }}</span>
        <router-link to="/comparacion" class="btn btn-secondary comparar">Comparar con una medición</router-link>
      </li>
    </ul>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { AVISO_REFERENCIA } from '../data/avisoEducativo.js'
import { obtenerMedicionesPublicas } from '../data/galeriaPublica.js'
import {
  ACTIVIDADES,
  RANGOS_EDAD,
  ESTADOS,
  prepararGaleria,
  filtrarGaleria,
  contarPorFiltro
} from '../services/galeriaService.js'

const todas = ref([])
const cargando = ref(true)
const actividad = ref('todas')
const edad = ref('todas')
const estado = ref('todas')

const conteo = computed(() => contarPorFiltro(todas.value))
const visibles = computed(() =>
  filtrarGaleria(todas.value, { actividad: actividad.value, edad: edad.value, estado: estado.value })
)
const hayFiltros = computed(() => actividad.value !== 'todas' || edad.value !== 'todas' || estado.value !== 'todas')

function limpiar() {
  actividad.value = 'todas'
  edad.value = 'todas'
  estado.value = 'todas'
}

onMounted(async () => {
  try {
    todas.value = prepararGaleria(await obtenerMedicionesPublicas())
  } catch {
    todas.value = []
  } finally {
    cargando.value = false
  }
})
</script>

<style scoped>
.galeria-view { max-width: 900px; margin: 0 auto; padding: 0.75rem 1rem 2rem; }
.aviso { background: #fef3c7; border-left: 4px solid #d97706; padding: 0.6rem 0.8rem; border-radius: 4px; font-size: 0.9rem; }
.filtros { display: grid; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); gap: 0.75rem; margin-top: 1rem; align-items: end; }
.campo { display: flex; flex-direction: column; gap: 0.25rem; font-size: 0.9rem; }
.campo select { min-height: var(--alto-tactil, 44px); padding: 0 0.6rem; }
.limpiar { min-height: var(--alto-tactil, 44px); }
.contador { margin: 0.75rem 0 0; font-size: 0.85rem; color: #475569; }
.vacio { text-align: center; }
.lista { list-style: none; padding: 0; margin: 1rem 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.75rem; }
.item { display: flex; flex-direction: column; gap: 0.4rem; margin-bottom: 0; }
.meta { font-size: 0.8rem; color: #475569; }
.valores { display: flex; flex-wrap: wrap; gap: 0.5rem 0.9rem; align-items: baseline; }
.bpm b { font-size: 1.4rem; }
.estado { font-size: 0.78rem; padding: 0.1rem 0.5rem; border-radius: 999px; }
.estado.dentro { background: #dcfce7; color: #166534; }
.estado.fuera { background: #fee2e2; color: #991b1b; }
.comparar { margin-top: 0.3rem; text-align: center; }
</style>
