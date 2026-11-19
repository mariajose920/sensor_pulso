<template>
  <div class="privacidad-view">
    <article class="card" data-testid="politica-privacidad">
      <h1 class="card-title">Política de privacidad</h1>
      <p class="version" data-testid="politica-version">
        Versión {{ POLITICA_VERSION }} · vigente desde el {{ POLITICA_VIGENTE_DESDE }}
      </p>

      <section v-for="s in SECCIONES" :key="s.id" :id="s.id" class="seccion">
        <h2>{{ s.titulo }}</h2>
        <p v-for="(p, i) in s.parrafos" :key="i">{{ p }}</p>
        <ul v-if="s.lista">
          <li v-for="(item, i) in s.lista" :key="i">{{ item }}</li>
        </ul>

        <!-- El canal de contacto va junto a los derechos -->
        <div v-if="s.id === 'derechos'" class="contacto" data-testid="politica-contacto">
          <strong>Cómo contactarnos</strong>
          <p>
            {{ contacto.texto }}
            <a v-if="contacto.tipo === 'correo'" :href="'mailto:' + contacto.valor">{{ contacto.valor }}</a>
          </p>
          <p v-if="isAuthenticated"><router-link to="/mis-datos" data-testid="enlace-ejercer-derechos">Ejercer mis derechos desde la plataforma</router-link></p>
        </div>
      </section>

      <!-- Alojamiento fuera de Chile y base legal (explicación completa; el texto vive en src/data/alojamiento.js) -->
      <AvisoAlojamiento :con-sesion="isAuthenticated" />

      <!-- Cómo se clasifican y tratan los datos (explicación; no forma parte del texto versionado de la política) -->
      <section id="clasificacion-datos" class="clasificacion-bloque" data-testid="politica-clasificacion">
        <h2>Cómo clasificamos y tratamos tus datos</h2>
        <p>
          No todos los datos reciben el mismo trato. Los clasificamos en tres tipos y cada uno tiene reglas distintas de
          acceso, protección, publicación y conservación.
        </p>
        <ClasesDatoTarjetas />
      </section>

      <AvisoEducativo compacto />
      <router-link to="/" class="volver">&larr; Volver al inicio</router-link>
    </article>
  </div>
</template>

<script setup>
import AvisoEducativo from '../components/AvisoEducativo.vue'
import ClasesDatoTarjetas from '../components/ClasesDatoTarjetas.vue'
import AvisoAlojamiento from '../components/AvisoAlojamiento.vue'
import { useAuth } from '../composables/useAuth'
import { POLITICA_VERSION, POLITICA_VIGENTE_DESDE, SECCIONES, canalContacto } from '../data/politicaPrivacidad.js'

const { isAuthenticated } = useAuth()

// RF88: canal de contacto configurable sin tocar el código (variable de entorno pública)
const contacto = canalContacto(import.meta.env.VITE_CONTACTO_PRIVACIDAD)
</script>

<style scoped>
.privacidad-view { max-width: 980px; margin: 0 auto; }
.clasificacion-bloque { margin: 1.5rem 0; padding-top: 1.25rem; border-top: 1px solid var(--color-border); }
.clasificacion-bloque h2 { font-size: 1.05rem; margin: 0 0 0.4rem; }
.clasificacion-bloque > p { line-height: 1.55; font-size: 0.95rem; margin: 0 0 0.9rem; }
.version { color: var(--color-muted); font-size: 0.85rem; margin: 0 0 1rem; }
.seccion { margin-bottom: 1.25rem; }
.seccion h2 { font-size: 1.05rem; margin: 0 0 0.4rem; }
.seccion p, .seccion li { line-height: 1.55; font-size: 0.95rem; }
.seccion ul { padding-left: 1.2rem; margin: 0.3rem 0; }
.contacto { margin-top: 0.75rem; padding: 0.75rem 1rem; border: 1px solid var(--color-border); border-left: 4px solid var(--color-primary); border-radius: 8px; }
.contacto p { margin: 0.25rem 0 0; }
.volver { display: inline-block; margin-top: 1rem; font-weight: 600; text-decoration: none; color: var(--color-primary); }
</style>
