<template>
  <div class="app-layout">
    <a href="#contenido" class="saltar-contenido">Saltar al contenido</a>

    <!-- Barra superior. En móvil queda solo la marca y el acceso; los enlaces pasan a la barra inferior. -->
    <header class="navbar" :class="{ oculto }" @focusin="mostrar">
      <router-link to="/" class="nav-brand" aria-label="sensor_pulso, ir al inicio">
        <span aria-hidden="true">🫀</span> <span class="nav-brand-texto">sensor_pulso</span>
      </router-link>

      <nav class="nav-links" aria-label="Navegación principal">
        <router-link
          v-for="e in enlaces"
          :key="e.to"
          :to="e.to"
          class="nav-link"
          :active-class="e.exacto ? '' : 'activo'"
          exact-active-class="activo"
        >{{ e.texto }}</router-link>
      </nav>

      <!-- Estado de sesión (RF02) -->
      <template v-if="isAuthenticated">
        <span class="user-chip">👤 {{ currentUserName }}</span>
        <button type="button" class="btn btn-secondary btn-acceso" @click="logout">Salir</button>
      </template>
      <router-link v-else to="/login" class="btn btn-secondary btn-acceso" aria-label="Acceso">
        <NavIcon name="usuario" class="solo-movil" />
        <span class="btn-acceso-texto">Acceso</span>
      </router-link>
    </header>

    <!-- RNF03: aviso sin conexión y opción de instalar la app -->
    <EstadoPwa />

    <main id="contenido" class="container">
      <router-view />
    </main>

    <footer class="footer">
      <p>sensor_pulso — Plataforma Educativa de Monitoreo de Frecuencia Cardíaca y SpO₂ (UNACH)</p>
    </footer>

    <!-- Barra inferior (solo móvil): íconos con texto, fácil de tocar con el pulgar. -->
    <nav class="bottom-nav" :class="{ oculto }" aria-label="Navegación principal" @focusin="mostrar">
      <router-link
        v-for="e in enlaces"
        :key="e.to"
        :to="e.to"
        class="bottom-link"
        :active-class="e.exacto ? '' : 'activo'"
        exact-active-class="activo"
      >
        <NavIcon :name="e.icono" />
        <span>{{ e.corto }}</span>
      </router-link>
    </nav>
  </div>
</template>

<script setup>
import EstadoPwa from './components/EstadoPwa.vue'
import NavIcon from './components/NavIcon.vue'
import { useScrollDirection } from './composables/useScrollDirection.js'
import { useAuth } from './composables/useAuth'

const { isAuthenticated, currentUserName, logout } = useAuth()

const enlaces = [
  { to: '/', texto: 'Inicio', corto: 'Inicio', icono: 'inicio', exacto: true },
  { to: '/medicion', texto: 'Medición', corto: 'Medición', icono: 'medicion' },
  { to: '/comparacion', texto: 'Comparación', corto: 'Comparar', icono: 'comparacion' },
  { to: '/aulas', texto: 'Aulas', corto: 'Aulas', icono: 'aulas' },
  { to: '/aprendizaje', texto: 'Aprendizaje', corto: 'Aprender', icono: 'aprendizaje' }
]

// Se ocultan al bajar y reaparecen al subir. El estilo solo se aplica en móvil (ver @media).
const { oculto, mostrar } = useScrollDirection()
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
}

main.container {
  flex: 1;
  width: 100%;
}

.footer {
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  text-align: center;
  padding: 1.25rem;
  font-size: 0.85rem;
  color: var(--color-muted);
}

.user-chip {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text);
  background: #f1f5f9;
  padding: 0.35rem 0.65rem;
  border-radius: 9999px;
  border: 1px solid var(--color-border);
  white-space: nowrap;
  max-width: 40vw;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Enlace para saltar la navegación con el teclado */
.saltar-contenido {
  position: absolute;
  left: 0.5rem;
  top: -4rem;
  z-index: 100;
  background: var(--color-primary);
  color: #fff;
  padding: 0.6rem 1rem;
  border-radius: 0.5rem;
  text-decoration: none;
  font-weight: 600;
}
.saltar-contenido:focus { top: 0.5rem; }

.navbar {
  gap: 1rem;
  min-height: var(--alto-barra-superior);
  padding-top: max(0.5rem, env(safe-area-inset-top));
  padding-left: max(1.5rem, env(safe-area-inset-left));
  padding-right: max(1.5rem, env(safe-area-inset-right));
  transition: transform 0.2s ease;
}
.nav-links { flex: 1; justify-content: center; flex-wrap: wrap; row-gap: 0; }
.nav-link { display: inline-flex; align-items: center; min-height: 44px; padding: 0 0.35rem; }
.nav-link.activo { color: var(--color-primary); box-shadow: inset 0 -2px 0 var(--color-primary); }
.btn-acceso { padding: 0.35rem 0.85rem; font-size: 0.85rem; min-height: 44px; text-decoration: none; }

.bottom-nav { display: none; }

/* Tablet: los enlaces caben, pero más juntos */
@media (max-width: 1024px) {
  .navbar { padding-left: max(1rem, env(safe-area-inset-left)); padding-right: max(1rem, env(safe-area-inset-right)); gap: 0.5rem; }
  .nav-links { gap: 0.5rem; }
  .nav-link { font-size: 0.9rem; }
}

/* Móvil: barra superior mínima + barra inferior; ambas se ocultan al bajar */
@media (max-width: 640px) {
  .navbar {
    min-height: var(--alto-barra-superior-movil);
    padding-top: max(0.25rem, env(safe-area-inset-top));
    padding-left: max(0.75rem, env(safe-area-inset-left));
    padding-right: max(0.75rem, env(safe-area-inset-right));
  }
  .navbar.oculto { transform: translateY(-100%); }
  .nav-links { display: none; }
  .nav-brand { flex: 1; min-width: 0; font-size: 1.1rem; }
  .btn-acceso { padding: 0 0.75rem; }

  .bottom-nav {
    display: flex;
    position: fixed;
    left: 0;
    right: 0;
    bottom: 0;
    z-index: 20;
    background: var(--color-surface);
    border-top: 1px solid var(--color-border);
    padding-bottom: env(safe-area-inset-bottom);
    padding-left: env(safe-area-inset-left);
    padding-right: env(safe-area-inset-right);
    transition: transform 0.2s ease;
  }
  .bottom-nav.oculto { transform: translateY(100%); }

  .bottom-link {
    flex: 1;
    min-width: 0;
    min-height: var(--alto-barra-inferior);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    color: var(--color-muted);
    text-decoration: none;
    font-size: 0.6875rem; /* 11 px */
    font-weight: 600;
    line-height: 1.1;
    -webkit-tap-highlight-color: transparent;
  }
  .bottom-link span { max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .bottom-link.activo { color: var(--color-primary); }
  .bottom-link:active { background: var(--color-bg); }

  /* Espacio para que la barra inferior no tape el final del contenido */
  main.container {
    padding-bottom: calc(var(--alto-barra-inferior) + env(safe-area-inset-bottom) + 1rem);
  }
  .footer { padding-bottom: calc(var(--alto-barra-inferior) + env(safe-area-inset-bottom) + 0.75rem); }
}

/* Móvil muy pequeño: solo el ícono en el botón de acceso */
@media (max-width: 400px) {
  .btn-acceso-texto { display: none; }
  .btn-acceso { width: 44px; padding: 0; }
  .nav-brand-texto { font-size: 1rem; }
}

@media (min-width: 641px) {
  .solo-movil { display: none; }
}

@media (prefers-reduced-motion: reduce) {
  .navbar, .bottom-nav { transition: none; }
}
</style>
