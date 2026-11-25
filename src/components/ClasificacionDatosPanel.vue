<template>
  <section class="clasificacion-panel" aria-labelledby="titulo-clasificacion" data-testid="panel-clasificacion">
    <div class="clasificacion-header">
      <div>
        <h2 id="titulo-clasificacion" class="clasificacion-titulo">Clasificación de los datos</h2>
        <p class="clasificacion-desc">
          Cada dato de la plataforma pertenece a un tipo (público, privado o sensible de salud) y cada tipo recibe un
          tratamiento distinto. Aquí ves cómo está clasificada la base de datos, qué falta por clasificar y cómo se trata cada tipo.
        </p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="cargando" @click="cargar">
        {{ cargando ? 'Actualizando...' : 'Actualizar' }}
      </button>
    </div>

    <div v-if="errorCarga" class="clasificacion-error" role="alert" data-testid="clasificacion-error">
      No se pudo consultar la clasificación: {{ errorCarga }}
      <button type="button" class="btn btn-secondary btn-sm" @click="cargar">Reintentar</button>
    </div>

    <!-- Indicadores -->
    <div class="indicadores" data-testid="clasificacion-indicadores">
      <div class="indicador">
        <span class="indicador-valor">{{ resumen.total }}</span>
        <span class="indicador-etiqueta">Columnas clasificadas</span>
      </div>
      <div class="indicador indicador-cobertura">
        <span class="indicador-valor">{{ resumen.cobertura }}%</span>
        <span class="indicador-etiqueta">Cobertura de la base</span>
        <div class="barra" role="progressbar" :aria-valuenow="resumen.cobertura" aria-valuemin="0" aria-valuemax="100" aria-label="Cobertura de la clasificación">
          <div class="barra-relleno" :class="{ 'barra-relleno--completa': resumen.cobertura === 100 }" :style="{ width: resumen.cobertura + '%' }"></div>
        </div>
      </div>
      <div class="indicador">
        <span class="indicador-valor">{{ resumen.cifrados }}</span>
        <span class="indicador-etiqueta">Cifradas por campo</span>
      </div>
      <div class="indicador">
        <span class="indicador-valor">{{ resumen.enmascaradas }}</span>
        <span class="indicador-etiqueta">Marcadas para enmascarar</span>
      </div>
      <div class="indicador" :class="{ 'indicador-alerta': resumen.sinClasificar > 0 }">
        <span class="indicador-valor">{{ resumen.sinClasificar }}</span>
        <span class="indicador-etiqueta">Pendientes de clasificar</span>
      </div>
    </div>

    <div v-if="resumen.huerfanas.length" class="clasificacion-aviso" role="status" data-testid="clasificacion-huerfanas">
      <strong>Hay {{ resumen.huerfanas.length }} columna(s) del catálogo que ya no existen en la base:</strong>
      {{ resumen.huerfanas.join(', ') }}. Conviene corregir el catálogo.
    </div>

    <!-- Los tres tipos y su tratamiento -->
    <ClasesDatoTarjetas :conteos="resumen.porClase" class="bloque" />

    <!-- Catálogo columna por columna -->
    <div class="bloque">
      <h3 class="bloque-titulo">Catálogo de columnas</h3>

      <div class="catalogo-filtros">
        <div class="pills" role="group" aria-label="Filtrar por tipo de dato">
          <button
            type="button"
            class="pill"
            :class="{ 'pill--activa': claseFiltro === 'todas' }"
            :aria-pressed="claseFiltro === 'todas'"
            @click="claseFiltro = 'todas'"
          >
            Todas <span class="pill-conteo">{{ conteos.total }}</span>
          </button>
          <button
            v-for="id in ORDEN_CLASES"
            :key="id"
            type="button"
            class="pill"
            :class="[`pill--${id}`, { 'pill--activa': claseFiltro === id }]"
            :aria-pressed="claseFiltro === id"
            @click="claseFiltro = id"
          >
            {{ CLASES[id].etiqueta }} <span class="pill-conteo">{{ conteos[id] }}</span>
          </button>
        </div>

        <input
          v-model="busqueda"
          type="search"
          class="form-input buscador"
          placeholder="Buscar tabla o columna..."
          aria-label="Buscar en el catálogo de clasificación"
          maxlength="80"
        />

        <label class="chequeo"><input v-model="soloCifradas" type="checkbox" /> Solo cifradas por campo</label>
        <label class="chequeo"><input v-model="soloEnmascaradas" type="checkbox" /> Solo marcadas para enmascarar</label>
      </div>

      <div v-if="cargando && filas.length === 0" class="estado-vacio">Cargando el catálogo de clasificación...</div>
      <div v-else-if="!errorCarga && grupos.length === 0" class="estado-vacio" data-testid="clasificacion-vacia">
        Ninguna columna coincide con los filtros elegidos.
      </div>

      <div v-else class="tablas-lista">
        <details
          v-for="g in grupos"
          :key="g.tabla"
          class="tabla-grupo"
          :open="busqueda.trim() !== '' || claseFiltro !== 'todas'"
          :data-testid="`clasificacion-tabla-${g.tabla}`"
        >
          <summary class="tabla-resumen">
            <span class="tabla-nombre">{{ g.nombre }}</span>
            <code class="tabla-codigo">{{ g.tabla }}</code>
            <span class="tabla-mini">
              <EtiquetaClaseDato v-for="id in clasesPresentes(g)" :key="id" :clase="id" compacta />
            </span>
            <span class="tabla-cantidad">{{ g.columnas.length }} columna(s)</span>
          </summary>

          <ul class="columnas-lista">
            <li v-for="c in g.columnas" :key="c.columna" class="columna-item">
              <code class="columna-nombre">{{ c.columna }}</code>
              <EtiquetaClaseDato :clase="c.clase" compacta />
              <span v-if="c.cifrado" class="marca marca--cifrado" title="Se guarda cifrado campo por campo">Cifrado por campo</span>
              <span v-if="c.enmascarar" class="marca marca--mascara" title="Se oculta parcialmente donde no es necesario mostrarlo">Enmascarar</span>
            </li>
          </ul>
        </details>
      </div>
    </div>

    <!-- Lo que falta -->
    <div class="bloque">
      <h3 class="bloque-titulo">
        Pendientes de clasificar
        <span class="bloque-conteo" :class="{ 'bloque-conteo--ok': pendientes.length === 0 }">{{ pendientes.length }}</span>
      </h3>
      <p class="bloque-desc">
        Columnas de la base que aún no tienen tipo asignado. No se incluyen las columnas técnicas (identificadores y marcas de tiempo).
      </p>

      <p v-if="pendientes.length === 0 && !errorCarga" class="todo-ok" data-testid="clasificacion-completa">
        Todas las columnas con datos están clasificadas.
      </p>
      <div v-else class="tablas-lista">
        <details v-for="g in pendientesAgrupados" :key="g.tabla" class="tabla-grupo tabla-grupo--pendiente">
          <summary class="tabla-resumen">
            <span class="tabla-nombre">{{ g.nombre }}</span>
            <code class="tabla-codigo">{{ g.tabla }}</code>
            <span class="tabla-cantidad">{{ g.columnas.length }} columna(s)</span>
          </summary>
          <ul class="columnas-lista">
            <li v-for="c in g.columnas" :key="c.columna" class="columna-item">
              <code class="columna-nombre">{{ c.columna }}</code>
              <span class="marca marca--pendiente">{{ c.tipo }}</span>
            </li>
          </ul>
        </details>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ClasesDatoTarjetas from './ClasesDatoTarjetas.vue'
import EtiquetaClaseDato from './EtiquetaClaseDato.vue'
import { CLASES, ORDEN_CLASES, nombreTabla } from '../data/clasificacionDatos.js'
import {
  listarClasificacion,
  obtenerResumenClasificacion,
  listarColumnasSinClasificar,
  filtrarClasificacion,
  agruparPorTabla,
  contarPorClase,
  normalizarResumen
} from '../services/clasificacionService.js'

const filas = ref([])
const pendientes = ref([])
const resumen = ref(normalizarResumen({}))
const cargando = ref(false)
const errorCarga = ref('')

const claseFiltro = ref('todas')
const busqueda = ref('')
const soloCifradas = ref(false)
const soloEnmascaradas = ref(false)

const conteos = computed(() => contarPorClase(filas.value))

const grupos = computed(() =>
  agruparPorTabla(
    filtrarClasificacion(filas.value, {
      clase: claseFiltro.value,
      busqueda: busqueda.value,
      soloCifradas: soloCifradas.value,
      soloEnmascaradas: soloEnmascaradas.value
    })
  )
)

const pendientesAgrupados = computed(() => {
  const mapa = new Map()
  for (const p of pendientes.value) {
    if (!mapa.has(p.tabla)) mapa.set(p.tabla, [])
    mapa.get(p.tabla).push(p)
  }
  return [...mapa.entries()]
    .map(([tabla, columnas]) => ({ tabla, nombre: nombreTabla(tabla), columnas }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
})

const clasesPresentes = (grupo) => ORDEN_CLASES.filter(id => grupo.conteos[id] > 0)

async function cargar() {
  cargando.value = true
  errorCarga.value = ''
  try {
    const [catalogo, res, sin] = await Promise.all([
      listarClasificacion(),
      obtenerResumenClasificacion(),
      listarColumnasSinClasificar()
    ])
    if (!catalogo.ok) errorCarga.value = catalogo.error
    else if (!res.ok) errorCarga.value = res.error
    else if (!sin.ok) errorCarga.value = sin.error
    filas.value = catalogo.filas
    resumen.value = res.resumen
    pendientes.value = sin.columnas
  } finally {
    cargando.value = false
  }
}

onMounted(cargar)
defineExpose({ cargar })
</script>

<style scoped>
.clasificacion-panel {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.clasificacion-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  flex-wrap: wrap;
}

.clasificacion-titulo {
  margin: 0 0 0.3rem;
  font-size: 1.18rem;
  font-weight: 700;
  color: #0f172a;
}

.clasificacion-desc {
  margin: 0;
  max-width: 62ch;
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--color-muted, #64748b);
}

.clasificacion-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  flex-wrap: wrap;
  padding: 0.7rem 0.9rem;
  border: 1px solid #fecaca;
  border-radius: 0.5rem;
  background: #fef2f2;
  color: #b91c1c;
  font-size: 0.85rem;
}

.clasificacion-aviso {
  padding: 0.7rem 0.9rem;
  border: 1px solid #fde68a;
  border-radius: 0.5rem;
  background: #fffbeb;
  color: #92400e;
  font-size: 0.85rem;
  line-height: 1.5;
}

.indicadores {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.75rem;
}

.indicador {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.85rem 1rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.6rem;
}

.indicador-valor {
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1.1;
  color: #0f172a;
}

.indicador-etiqueta {
  font-size: 0.74rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
}

.indicador-alerta {
  background: #fffbeb;
  border-color: #fde68a;
}

.indicador-alerta .indicador-valor {
  color: #b45309;
}

.barra {
  height: 8px;
  margin-top: 0.35rem;
  border-radius: 999px;
  background: #e2e8f0;
  overflow: hidden;
}

.barra-relleno {
  height: 100%;
  border-radius: 999px;
  background: #f59e0b;
  transition: width 0.3s ease;
}

.barra-relleno--completa {
  background: #10b981;
}

.bloque {
  padding-top: 0.25rem;
}

.bloque-titulo {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 0 0 0.6rem;
  font-size: 1.05rem;
}

.bloque-conteo {
  padding: 0.1rem 0.6rem;
  border-radius: 999px;
  background: #fef3c7;
  color: #b45309;
  font-size: 0.78rem;
  font-weight: 700;
}

.bloque-conteo--ok {
  background: #d1fae5;
  color: #047857;
}

.bloque-desc {
  margin: 0 0 0.75rem;
  font-size: 0.85rem;
  color: #64748b;
}

.todo-ok {
  margin: 0;
  padding: 0.75rem 1rem;
  border: 1px solid #a7f3d0;
  border-radius: 0.5rem;
  background: #ecfdf5;
  color: #047857;
  font-size: 0.88rem;
  font-weight: 600;
}

.catalogo-filtros {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem 1rem;
  margin-bottom: 0.85rem;
  padding: 0.75rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 0.6rem;
}

.pills {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.pill {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.38rem 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 999px;
  background: #ffffff;
  color: #334155;
  font-size: 0.8rem;
  font-weight: 600;
  cursor: pointer;
}

.pill:hover {
  background: #f1f5f9;
}

.pill--activa {
  background: #003366;
  border-color: #003366;
  color: #ffffff;
}

.pill--activa:hover {
  background: #00264d;
}

.pill-conteo {
  padding: 0 0.4rem;
  border-radius: 999px;
  background: rgba(100, 116, 139, 0.18);
  font-size: 0.72rem;
}

.pill--activa .pill-conteo {
  background: rgba(255, 255, 255, 0.25);
}

.buscador {
  flex: 1 1 220px;
  min-width: 180px;
  font-size: 0.85rem;
}

.chequeo {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.82rem;
  color: #334155;
  cursor: pointer;
}

.estado-vacio {
  padding: 1.5rem 1rem;
  text-align: center;
  color: #64748b;
  font-size: 0.9rem;
}

.tablas-lista {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.tabla-grupo {
  border: 1px solid #e2e8f0;
  border-radius: 0.55rem;
  background: #ffffff;
}

.tabla-grupo[open] {
  border-color: #cbd5e1;
}

.tabla-resumen {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.5rem 0.75rem;
  padding: 0.7rem 0.9rem;
  cursor: pointer;
  list-style-position: inside;
}

.tabla-nombre {
  font-weight: 700;
  color: #0f172a;
}

.tabla-codigo {
  font-size: 0.74rem;
  color: #64748b;
}

.tabla-mini {
  display: inline-flex;
  flex-wrap: wrap;
  gap: 0.3rem;
}

.tabla-cantidad {
  margin-left: auto;
  font-size: 0.78rem;
  color: #64748b;
}

.tabla-grupo--pendiente {
  border-left: 4px solid #f59e0b;
}

.columnas-lista {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(300px, 1fr));
  gap: 0.4rem 1rem;
  margin: 0;
  padding: 0.25rem 0.9rem 0.85rem;
  list-style: none;
}

.columna-item {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 0.4rem;
  padding: 0.3rem 0;
  border-bottom: 1px dashed #e2e8f0;
}

.columna-nombre {
  font-size: 0.8rem;
  color: #1e293b;
}

.marca {
  padding: 0.1rem 0.5rem;
  border-radius: 0.35rem;
  font-size: 0.7rem;
  font-weight: 700;
}

.marca--cifrado {
  background: #ede9fe;
  color: #5b21b6;
}

.marca--mascara {
  background: #f1f5f9;
  color: #475569;
}

.marca--pendiente {
  background: #fef3c7;
  color: #92400e;
}

@media (max-width: 640px) {
  .tabla-cantidad {
    margin-left: 0;
  }
}
</style>
