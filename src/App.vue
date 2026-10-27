<template>
  <div class="app-layout">
    <header class="navbar">
      <router-link to="/" class="nav-brand">
        🫀 <span>sensor_pulso</span>
      </router-link>
      <nav class="nav-links">
        <router-link to="/" class="nav-link">Inicio</router-link>
        <router-link to="/medicion" class="nav-link">Medición</router-link>
        <router-link to="/comparacion" class="nav-link">Comparación</router-link>
        <router-link to="/aulas" class="nav-link">Aulas</router-link>
        <router-link to="/aprendizaje" class="nav-link">Aprendizaje</router-link>
        
        <!-- Enlace solo visible para Administradores -->
        <router-link v-if="isAdmin" to="/admin" class="nav-link">Admin</router-link>

        <!-- Estado de sesión -->
        <template v-if="isAuthenticated">
          <span class="user-chip">
            👤 {{ currentUserName }} <small>({{ roleLabel }})</small>
          </span>
          <button @click="logout" class="btn btn-secondary btn-sm">
            Salir
          </button>
        </template>
        <template v-else>
          <router-link to="/login" class="btn btn-primary btn-sm">
            Acceso
          </router-link>
        </template>
      </nav>
    </header>
    <main class="container">
      <router-view />
    </main>
    <footer class="footer">
      <p>sensor_pulso — Plataforma Educativa de Monitoreo de Frecuencia Cardíaca y SpO₂ (UNACH)</p>
    </footer>
  </div>
</template>

<script setup>
import { useAuth } from './composables/useAuth'

const { isAuthenticated, currentUserName, roleLabel, isAdmin, logout } = useAuth()
</script>

<style scoped>
.app-layout {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
}

main.container {
  flex: 1;
}

.user-chip {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-text);
  background: #f1f5f9;
  padding: 0.35rem 0.65rem;
  border-radius: 9999px;
  border: 1px solid var(--color-border);
}

.user-chip small {
  color: var(--color-muted);
  font-weight: 400;
}

.btn-sm {
  padding: 0.35rem 0.85rem;
  font-size: 0.85rem;
}

.footer {
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  text-align: center;
  padding: 1.25rem;
  font-size: 0.85rem;
  color: var(--color-muted);
}
</style>