<template>
  <div class="aulas-container">
    <div class="card">
      <h1 class="card-title">🏫 Aulas y Cursos</h1>
      <p style="color: var(--color-muted); margin-bottom: 1.5rem;">
        Espacio académico interactivo para cursos y evaluaciones prácticas de pulso cardíaco.
      </p>

      <!-- Vista para Profesor o Administrador -->
      <div v-if="isProfesor" class="role-section">
        <div class="section-header">
          <h2>Panel Docente</h2>
          <button class="btn btn-primary">+ Crear Nueva Aula</button>
        </div>
        <p class="section-desc">
          Como docente, puedes crear aulas virtuales y generar códigos de acceso para tus estudiantes.
        </p>
      </div>

      <!-- Vista para Estudiante / Usuario -->
      <div v-else class="role-section">
        <h2>Unirse a un Aula</h2>
        <p class="section-desc">
          Ingresa el código proporcionado por tu profesor para unirte al aula virtual.
        </p>
        <div class="join-box">
          <input 
            type="text" 
            class="form-input" 
            placeholder="Código del aula (ej: AULA-2026)" 
            style="max-width: 300px;"
          />
          <button class="btn btn-primary">Unirme</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { useAuth } from '../composables/useAuth'

const { isProfesor } = useAuth()
</script>

<style scoped>
.aulas-container {
  max-width: 800px;
  margin: 0 auto;
}

.role-section {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  padding: 1.5rem;
  border-radius: 0.5rem;
  margin-top: 1rem;
}

.section-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.5rem;
}

.section-desc {
  font-size: 0.9rem;
  color: var(--color-muted);
  margin-bottom: 1rem;
}

.join-box {
  display: flex;
  gap: 0.75rem;
}
</style>