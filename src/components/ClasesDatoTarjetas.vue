<template>
  <section class="clases-dato" aria-labelledby="titulo-clases-dato">
    <h3 v-if="titulo" id="titulo-clases-dato" class="clases-titulo">{{ titulo }}</h3>

    <div class="clases-grid">
      <article
        v-for="id in ORDEN_CLASES"
        :key="id"
        class="clase-tarjeta"
        :class="`clase-tarjeta--${id}`"
        :data-testid="`clase-tarjeta-${id}`"
      >
        <header class="clase-cabecera">
          <EtiquetaClaseDato :clase="id" />
          <span v-if="conteos" class="clase-conteo" :title="`Columnas de la base clasificadas como ${CLASES[id].etiqueta}`">
            {{ conteos[id] ?? 0 }}
            <small>columnas</small>
          </span>
        </header>
        <p class="clase-resumen">{{ CLASES[id].resumen }}</p>
        <p class="clase-descripcion">{{ CLASES[id].descripcion }}</p>
        <p class="clase-ejemplos-titulo">Por ejemplo</p>
        <ul class="clase-ejemplos">
          <li v-for="(e, i) in CLASES[id].ejemplos" :key="i">{{ e }}</li>
        </ul>
      </article>
    </div>

    <div v-if="mostrarMatriz" class="matriz-bloque">
      <h4 class="matriz-titulo">Cómo se trata cada tipo de dato</h4>
      <div class="matriz-scroll">
        <table class="matriz" data-testid="matriz-tratamiento">
          <thead>
            <tr>
              <th scope="col">Aspecto</th>
              <th v-for="id in ORDEN_CLASES" :key="id" scope="col">
                <EtiquetaClaseDato :clase="id" compacta />
              </th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="fila in TRATAMIENTOS" :key="fila.id">
              <th scope="row">{{ fila.titulo }}</th>
              <td v-for="id in ORDEN_CLASES" :key="id" :data-clase="CLASES[id].etiqueta">{{ fila[id] }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>
</template>

<script setup>
import EtiquetaClaseDato from './EtiquetaClaseDato.vue'
import { CLASES, ORDEN_CLASES, TRATAMIENTOS } from '../data/clasificacionDatos.js'

defineProps({
  titulo: { type: String, default: '' },
  // { publico: n, privado: n, sensible_salud: n } para mostrar cuántas columnas hay en cada clase
  conteos: { type: Object, default: null },
  mostrarMatriz: { type: Boolean, default: true }
})
</script>

<style scoped>
.clases-titulo {
  margin: 0 0 0.75rem;
  font-size: 1.05rem;
}

.clases-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
  gap: 0.85rem;
}

.clase-tarjeta {
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  padding: 1rem;
  background: var(--color-surface, #ffffff);
  border: 1px solid var(--color-border, #e2e8f0);
  border-top: 4px solid #94a3b8;
  border-radius: 0.6rem;
}

.clase-tarjeta--publico { border-top-color: #10b981; }
.clase-tarjeta--privado { border-top-color: #3b82f6; }
.clase-tarjeta--sensible_salud { border-top-color: #e11d48; }

.clase-cabecera {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.clase-conteo {
  font-size: 1.35rem;
  font-weight: 800;
  color: #0f172a;
  line-height: 1;
  text-align: right;
}

.clase-conteo small {
  display: block;
  font-size: 0.66rem;
  font-weight: 600;
  color: #64748b;
  text-transform: uppercase;
}

.clase-resumen {
  margin: 0.2rem 0 0;
  font-weight: 700;
  font-size: 0.92rem;
  color: #0f172a;
}

.clase-descripcion {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.5;
  color: #475569;
}

.clase-ejemplos-titulo {
  margin: 0.4rem 0 0;
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
}

.clase-ejemplos {
  margin: 0;
  padding-left: 1.1rem;
  font-size: 0.84rem;
  line-height: 1.5;
  color: #334155;
}

.matriz-bloque {
  margin-top: 1.25rem;
}

.matriz-titulo {
  margin: 0 0 0.6rem;
  font-size: 0.98rem;
}

.matriz-scroll {
  overflow-x: auto;
  border: 1px solid var(--color-border, #e2e8f0);
  border-radius: 0.6rem;
}

.matriz {
  width: 100%;
  min-width: 680px;
  border-collapse: collapse;
  font-size: 0.85rem;
}

.matriz th,
.matriz td {
  padding: 0.7rem 0.8rem;
  text-align: left;
  vertical-align: top;
  border-bottom: 1px solid var(--color-border, #e2e8f0);
  line-height: 1.45;
}

.matriz thead th {
  background: #f8fafc;
}

.matriz tbody th {
  width: 16%;
  font-weight: 700;
  color: #0f172a;
  background: #f8fafc;
}

.matriz tbody tr:last-child th,
.matriz tbody tr:last-child td {
  border-bottom: none;
}
</style>
