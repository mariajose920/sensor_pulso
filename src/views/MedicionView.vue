<template>
  <div class="medicion-container">
    <h1 class="card-title">📡 Medición y Tiempo Real</h1>
    <p style="color: var(--color-muted); margin-bottom: 1.5rem;">
      Panel de control del sensor y registro de señal cardíaca.
    </p>

    <!-- RF01: Identificador del usuario que realiza la medición -->
    <UserIdentifier />
  </div>
</template>

<script setup>
import UserIdentifier from '../components/UserIdentifier.vue'
</script>

<style scoped>
.medicion-container {
  max-width: 800px;
  margin: 0 auto;
}
</style>