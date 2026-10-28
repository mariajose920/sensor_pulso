<template>
  <div class="home-container">
    <div class="hero card">
      <h1 class="hero-title">🫀 sensor_pulso</h1>
      <p class="hero-subtitle">
        Plataforma web educativa, responsiva e instalable (PWA) para medir, visualizar, comparar e interpretar la frecuencia cardíaca y saturación de oxígeno (SpO₂) mediante ESP32 conectado por WiFi.
      </p>
      <div class="system-status alert alert-info">
        <strong>Estado de la plataforma:</strong> Base del sistema inicializada para el equipo (Vue 3 + Vite + Supabase).
      </div>
    </div>

    <div class="features-grid">
      <div class="feature-card card">
        <div class="feature-icon">📡</div>
        <h2 class="card-title">Medición y Tiempo Real</h2>
        <p class="feature-text">
          Recepción de datos vía WiFi desde ESP32 con hasta 5 canales simultáneos, cálculo de BPM y SpO₂ en vivo.
        </p>
      </div>

      <div class="feature-card card">
        <div class="feature-icon">📊</div>
        <h2 class="card-title">Análisis y Comparación</h2>
        <p class="feature-text">
          Detección de patrones y comparación con plantillas normales (PPG/ECG), ritmos patológicos y datasets validados.
        </p>
      </div>

      <div class="feature-card card">
        <div class="feature-icon">🏫</div>
        <h2 class="card-title">Aulas y Evaluaciones</h2>
        <p class="feature-text">
          Gestión de cursos, bancos de preguntas, ejercicios prácticos de medición y retroalimentación académica en tiempo real.
        </p>
      </div>

      <div class="feature-card card">
        <div class="feature-icon">🔒</div>
        <h2 class="card-title">Seguridad y Normativa</h2>
        <p class="feature-text">
          Control de acceso basado en roles con correos institucionales UNACH, cifrado de datos de salud y cumplimiento normativo.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
</script>

<style scoped>
.hero {
  text-align: center;
  padding: clamp(1.25rem, 5vw, 2.5rem) clamp(0.75rem, 4vw, 1.5rem);
  margin-bottom: 2rem;
}

.hero-title {
  font-size: clamp(1.6rem, 6vw, 2.25rem);
  font-weight: 800;
  color: var(--color-primary);
  margin-bottom: 0.75rem;
}

.hero-subtitle {
  font-size: 1.1rem;
  color: var(--color-muted);
  max-width: 800px;
  margin: 0 auto 1.5rem auto;
  line-height: 1.6;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: clamp(0.75rem, 3vw, 1.5rem);
}

.feature-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.feature-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.feature-icon {
  font-size: 2rem;
  margin-bottom: 0.75rem;
}

.feature-text {
  font-size: 0.925rem;
  color: var(--color-muted);
  line-height: 1.5;
}
</style>
