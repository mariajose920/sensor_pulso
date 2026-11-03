<template>
  <div class="forbidden-container card">
    <div class="icon">🛑</div>
    <h1 class="card-title">Acceso Restringido</h1>
    <p class="text-muted">
      No cuentas con los permisos necesarios para acceder a esta sección de la plataforma.
    </p>
    <div class="actions">
      <router-link to="/" class="btn btn-primary">Volver al Inicio</router-link>
      <router-link to="/medicion" class="btn btn-secondary">Ir a Medición</router-link>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.forbidden-container {
  max-width: 500px;
  margin: 3rem auto;
  text-align: center;
  padding: 2.5rem 1.5rem;
}

.icon {
  font-size: 3rem;
  margin-bottom: 1rem;
}

.text-muted {
  color: var(--color-muted);
  margin-bottom: 1.5rem;
}

.actions {
  display: flex;
  gap: 1rem;
  justify-content: center;
}
</style>