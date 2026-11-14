<template>
  <div class="evolucion-view-container">
    <AvisoEducativo />

    <header class="evolucion-page-header">
      <div>
        <h1>Panel de Evolución Personal</h1>
        <p class="evolucion-page-lead">
          Seguimiento diario de tu frecuencia cardíaca en reposo a partir de tu historial de mediciones,
          comparado con el rango esperado según tu edad y actividad, y su relación con el estrés y el sueño registrados.
        </p>
      </div>

      <div class="evolucion-page-actions">
        <router-link to="/historial" class="btn-secundario-nav">
          Ver historial de mediciones
        </router-link>
        <router-link to="/medicion" class="btn-primario-nav">
          Nueva medición
        </router-link>
      </div>
    </header>

    <PanelEvolucionPersonal />
  </div>
</template>

<script setup>
import AvisoEducativo from '../components/AvisoEducativo.vue'
import PanelEvolucionPersonal from '../components/PanelEvolucionPersonal.vue'
</script>

<style scoped>
.evolucion-view-container {
  max-width: 1120px;
  margin: 0 auto;
  padding: 1.5rem 1.25rem 3rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.evolucion-page-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
}

.evolucion-page-header h1 {
  margin: 0 0 0.3rem 0;
  font-size: 1.7rem;
  font-weight: 800;
  color: #0f172a;
}

.evolucion-page-lead {
  margin: 0;
  font-size: 0.94rem;
  color: #475569;
  max-width: 680px;
}

.evolucion-page-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.65rem;
}

.btn-secundario-nav,
.btn-primario-nav {
  padding: 0.55rem 1rem;
  border-radius: 8px;
  font-size: 0.86rem;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.15s ease;
}

.btn-secundario-nav {
  background: #ffffff;
  color: #334155;
  border: 1px solid #cbd5e1;
}

.btn-secundario-nav:hover {
  background: #f8fafc;
}

.btn-primario-nav {
  background: #0f172a;
  color: #ffffff;
  border: 1px solid #0f172a;
}

.btn-primario-nav:hover {
  background: #1e293b;
}
</style>
