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
        <router-link to="/aprendizaje" class="nav-link">Aprendizaje</router-link>
        <router-link to="/aulas" class="nav-link">Aulas</router-link>
        <router-link to="/login" class="btn btn-secondary" style="padding: 0.35rem 0.85rem; font-size: 0.85rem;">Acceso</router-link>
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

.footer {
  border-top: 1px solid var(--color-border);
  background: var(--color-surface);
  text-align: center;
  padding: 1.25rem;
  font-size: 0.85rem;
  color: var(--color-muted);
}
</style>
