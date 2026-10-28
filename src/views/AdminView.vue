<template>
  <div class="admin-container">
    <div class="card">
      <h1 class="card-title">⚙️ Panel de Administración</h1>
      <p style="color: var(--color-muted); margin-bottom: 1.5rem;">
        Gestión global del sistema, roles institucionales y parámetros de la plataforma.
      </p>

      <div class="alert alert-info">
        <strong>Área de administración:</strong> Solo usuarios con rol Administrador tienen acceso a este módulo.
      </div>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.admin-container {
  max-width: 900px;
  margin: 0 auto;
}
</style>