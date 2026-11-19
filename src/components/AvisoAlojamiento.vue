<template>
  <!-- Versión compacta: una frase y un enlace, para el inicio de sesión, el consentimiento y «Mis datos» -->
  <aside
    v-if="compacto"
    class="aviso-alojamiento aviso-alojamiento--compacto"
    role="note"
    aria-label="Aviso sobre el alojamiento de los datos"
    data-testid="aviso-alojamiento"
  >
    <svg class="aviso-icono" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <line x1="2" y1="12" x2="22" y2="12" />
      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
    <p class="aviso-texto">
      <strong>{{ TITULO_ALOJAMIENTO }}.</strong>
      {{ RESUMEN_CORTO }}
      <router-link v-if="enlace" :to="RUTA_ALOJAMIENTO" class="aviso-enlace" data-testid="aviso-alojamiento-enlace">
        Ver dónde y con qué base legal
      </router-link>
    </p>
  </aside>

  <!-- Versión completa: proveedores, protecciones, base legal y qué puede hacer la persona -->
  <section v-else :id="ID_ANCLA_ALOJAMIENTO" class="alojamiento" aria-labelledby="titulo-alojamiento" data-testid="alojamiento-completo">
    <h2 id="titulo-alojamiento">Dónde se alojan tus datos y con qué base legal</h2>

    <div class="alojamiento-destacado" data-testid="alojamiento-destacado">
      <strong>{{ TITULO_ALOJAMIENTO }}.</strong>
      Los servidores que guardan y procesan tus datos están en {{ PAIS_ALOJAMIENTO }}. Por eso existe una transferencia internacional de datos,
      y te la informamos y te pedimos tu consentimiento expreso.
    </div>

    <h3>Quién los trata y dónde</h3>
    <div class="proveedores" data-testid="alojamiento-proveedores">
      <article v-for="p in PROVEEDORES" :key="p.id" class="proveedor" :data-testid="`proveedor-${p.id}`">
        <header class="proveedor-cabecera">
          <strong class="proveedor-nombre">{{ p.nombre }}</strong>
          <span class="proveedor-ubicacion">{{ p.ubicacion }}</span>
        </header>
        <p class="proveedor-funcion">{{ p.funcion }}</p>
        <p class="proveedor-datos"><span>Datos que toca</span>{{ p.datos }}</p>
        <p v-if="p.nota" class="proveedor-nota">{{ p.nota }}</p>
      </article>
    </div>

    <h3>Cómo se cuidan tus datos</h3>
    <ul class="alojamiento-lista" data-testid="alojamiento-protecciones">
      <li v-for="(texto, i) in PROTECCIONES" :key="i">{{ texto }}</li>
    </ul>

    <h3>Base legal</h3>
    <div class="base-legal" data-testid="alojamiento-base-legal">
      <div v-for="b in BASE_LEGAL" :key="b.titulo" class="base-item">
        <strong>{{ b.titulo }}</strong>
        <p>{{ b.texto }}</p>
      </div>
    </div>

    <h3>Qué puedes hacer</h3>
    <ul class="alojamiento-lista" data-testid="alojamiento-acciones">
      <li v-for="(texto, i) in QUE_PUEDES_HACER" :key="i">{{ texto }}</li>
    </ul>
    <p v-if="conSesion" class="alojamiento-enlace-derechos">
      <router-link to="/mis-datos" data-testid="alojamiento-enlace-derechos">Ejercer mis derechos desde la plataforma</router-link>
    </p>

    <p class="alojamiento-version" data-testid="alojamiento-version">
      Versión {{ ALOJAMIENTO_VERSION }} del aviso · revisado el {{ ALOJAMIENTO_REVISADO }}
    </p>
  </section>
</template>

<script setup>
import {
  ALOJAMIENTO_REVISADO,
  ALOJAMIENTO_VERSION,
  BASE_LEGAL,
  ID_ANCLA_ALOJAMIENTO,
  PAIS_ALOJAMIENTO,
  PROTECCIONES,
  PROVEEDORES,
  QUE_PUEDES_HACER,
  RESUMEN_CORTO,
  RUTA_ALOJAMIENTO,
  TITULO_ALOJAMIENTO
} from '../data/alojamiento.js'

defineProps({
  // true: una frase con enlace; false: la explicación completa
  compacto: { type: Boolean, default: false },
  // En la versión compacta, muestra el enlace a la explicación completa
  enlace: { type: Boolean, default: true },
  // En la versión completa, muestra el enlace a «Mis datos y derechos» (solo con sesión)
  conSesion: { type: Boolean, default: false }
})
</script>

<style scoped>
.aviso-alojamiento {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  margin-bottom: 1rem;
  padding: 0.65rem 0.85rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-left: 4px solid #f59e0b;
  border-radius: 8px;
  color: #78350f;
}

.aviso-alojamiento--compacto {
  font-size: 0.84rem;
  line-height: 1.5;
}

.aviso-icono {
  flex-shrink: 0;
  margin-top: 0.15rem;
  color: #d97706;
}

.aviso-texto {
  margin: 0;
}

.aviso-enlace {
  display: inline-block;
  margin-left: 0.25rem;
  font-weight: 600;
  color: #92400e;
  text-decoration: underline;
}

.alojamiento {
  margin: 1.5rem 0;
  padding-top: 1.25rem;
  border-top: 1px solid var(--color-border);
  scroll-margin-top: 5rem;
}

.alojamiento h2 {
  margin: 0 0 0.6rem;
  font-size: 1.05rem;
}

.alojamiento h3 {
  margin: 1.1rem 0 0.5rem;
  font-size: 0.95rem;
}

.alojamiento-destacado {
  padding: 0.85rem 1rem;
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-left: 4px solid #f59e0b;
  border-radius: 8px;
  color: #78350f;
  font-size: 0.93rem;
  line-height: 1.55;
}

.proveedores {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 0.75rem;
}

.proveedor {
  padding: 0.85rem 1rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.6rem;
}

.proveedor-cabecera {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.25rem 0.75rem;
}

.proveedor-nombre {
  font-size: 1rem;
}

.proveedor-ubicacion {
  padding: 0.12rem 0.55rem;
  border-radius: 999px;
  background: #fef3c7;
  color: #92400e;
  font-size: 0.72rem;
  font-weight: 700;
}

.proveedor-funcion {
  margin: 0.4rem 0;
  font-size: 0.88rem;
  font-weight: 600;
  line-height: 1.45;
}

.proveedor-datos {
  margin: 0;
  font-size: 0.84rem;
  line-height: 1.5;
  color: #475569;
}

.proveedor-datos span {
  display: block;
  margin-bottom: 0.1rem;
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #64748b;
}

.proveedor-nota {
  margin: 0.5rem 0 0;
  padding: 0.4rem 0.6rem;
  border-radius: 0.4rem;
  background: #ecfdf5;
  color: #047857;
  font-size: 0.8rem;
  line-height: 1.45;
}

.alojamiento-lista {
  margin: 0;
  padding-left: 1.2rem;
  font-size: 0.93rem;
  line-height: 1.6;
}

.base-legal {
  display: grid;
  gap: 0.6rem;
}

.base-item {
  padding: 0.75rem 1rem;
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-primary);
  border-radius: 8px;
}

.base-item strong {
  display: block;
  margin-bottom: 0.2rem;
}

.base-item p {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.55;
}

.alojamiento-enlace-derechos {
  margin: 0.5rem 0 0;
  font-weight: 600;
}

.alojamiento-version {
  margin: 1rem 0 0;
  font-size: 0.8rem;
  color: var(--color-muted);
}
</style>
