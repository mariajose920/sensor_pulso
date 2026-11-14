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
            <!-- Estado de sesión (RF02 y RF51) -->
      <template v-if="isAuthenticated">
        <span class="user-chip">👤 {{ currentUserName }} <small>({{ roleLabel }})</small></span>
        <button 
          type="button" 
          class="btn btn-secondary btn-acceso btn-otras-sesiones" 
          @click="manejarCerrarOtrasSesiones" 
          title="Cerrar las demás sesiones abiertas en otros navegadores o dispositivos"
        >
          Otras Sesiones
        </button>
        <button type="button" class="btn btn-secondary btn-acceso" @click="manejarLogout">Salir</button>
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
      <p class="footer-aviso" data-testid="aviso-pie">{{ AVISO_EDUCATIVO_CORTO }}</p>
      <p>
        <router-link to="/privacidad" data-testid="enlace-privacidad">Política de privacidad</router-link>
        <template v-if="isAuthenticated"> · <router-link to="/mis-datos" data-testid="enlace-mis-datos">Mis datos y derechos</router-link></template>
      </p>
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
        <!-- Modal global de advertencia por inactividad (RF51) -->
    <AvisoInactividadModal />

    <!-- Notificación flotante de confirmación de cierre de otras sesiones -->
    <div v-if="mensajeOtrasSesiones" class="toast-flotante">
      {{ mensajeOtrasSesiones }}
    </div>
  </div>
</template>

<script setup>
import { useRouter } from 'vue-router'
import { AVISO_EDUCATIVO_CORTO } from './data/avisoEducativo.js'
import { computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ENLACES_SOLO_CON_SESION, motivoDeRuta } from './utils/accesoSinSesion'
import EstadoPwa from './components/EstadoPwa.vue'
import NavIcon from './components/NavIcon.vue'
import { useScrollDirection } from './composables/useScrollDirection.js'
import { useAuth } from './composables/useAuth'
import { ref } from 'vue'
import AvisoInactividadModal from './components/AvisoInactividadModal.vue'

const enlacesBase = [
  { to: '/', texto: 'Inicio', corto: 'Inicio', icono: 'inicio', exacto: true },
  { to: '/medicion', texto: 'Medición', corto: 'Medición', icono: 'medicion' },
  { to: '/dispositivos', texto: 'Dispositivos', corto: 'Equipos', icono: 'medicion' },
  { to: '/comparacion', texto: 'Comparación', corto: 'Comparar', icono: 'comparacion' },
  { to: '/galeria', texto: 'Galería', corto: 'Galería', icono: 'comparacion' },
  { to: '/aulas', texto: 'Aulas', corto: 'Aulas', icono: 'aulas' },
  { to: '/aprendizaje', texto: 'Aprendizaje', corto: 'Aprender', icono: 'aprendizaje' }
]

const router = useRouter()

const manejarLogout = async () => {
  await logout()
  router.push('/')
}

// En la desestructuración de useAuth() agrega cerrarOtrasSesiones:
const { isAuthenticated, currentUserName, roleLabel, isAdmin, isProfesor, logout, cerrarOtrasSesiones } = useAuth()
// Si se cierra la sesión estando en una pantalla que la exige (por ejemplo Medición), se vuelve al login
const rutaActual = useRoute()
watch(isAuthenticated, (conSesion) => {
  if (!conSesion && rutaActual.meta?.requiresAuth && rutaActual.name !== 'Medicion') {
    router.push({ name: 'Login', query: { motivo: motivoDeRuta(rutaActual.name) } })
  }
})
const mensajeOtrasSesiones = ref('')
const manejarCerrarOtrasSesiones = async () => {
  const res = await cerrarOtrasSesiones()
  mensajeOtrasSesiones.value = res.message
  setTimeout(() => {
    mensajeOtrasSesiones.value = ''
  }, 4000)
}

// RF97: el enlace Admin solo lo ven los administradores; RF19: Rangos, los profesores
// RF30: el historial de mediciones solo lo ve quien tiene sesión
const enlaces = computed(() => {
  // Medición es visible en la barra para mostrar el aviso institucional de inicio de sesión y acceso al simulador
  const lista = enlacesBase.filter(e => e.to === '/medicion' || !ENLACES_SOLO_CON_SESION.includes(e.to) || isAuthenticated.value)
  if (isAuthenticated.value) lista.push({ to: '/historial', texto: 'Historial', corto: 'Historial', icono: 'comparacion' })
  if (isAdmin.value || isProfesor.value) lista.push({ to: '/evaluaciones', texto: 'Evaluaciones', corto: 'Evaluar', icono: 'aulas' })   // RF106
  if (isAdmin.value) lista.push({ to: '/admin', texto: 'Admin', corto: 'Admin', icono: 'usuario' })
  if (isAdmin.value) lista.push({ to: '/admin/seguridad', texto: 'Seguridad', corto: 'Seguridad', icono: 'usuario' }) // RF88/RF92
  else if (isProfesor.value) {
    lista.push({ to: '/rangos', texto: 'Rangos', corto: 'Rangos', icono: 'comparacion' })
    lista.push({ to: '/contenidos', texto: 'Contenidos', corto: 'Contenidos', icono: 'comparacion' })   // RF46
  }
  return lista
})

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

.footer-aviso {
  margin-top: 0.35rem;
  font-weight: 600;
}

.footer {
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  text-align: center;
  padding: 1.25rem;
  font-size: 0.85rem;
  color: var(--color-muted);
}

.user-chip small {
  color: var(--color-muted);
  font-weight: 400;
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

.btn-otras-sesiones {
  margin-right: 0.35rem;
  font-size: 0.8rem;
  padding: 0.4rem 0.65rem;
}

.toast-flotante {
  position: fixed;
  bottom: 1.5rem;
  right: 1.5rem;
  background: #1e293b;
  color: #f8fafc;
  padding: 0.85rem 1.25rem;
  border-radius: 0.5rem;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.2);
  z-index: 1000;
  font-size: 0.875rem;
  animation: fadeIn 0.3s ease-out;
}
</style>
