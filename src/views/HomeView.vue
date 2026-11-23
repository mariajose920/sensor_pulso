<template>
  <div class="home-container">
    <div class="hero card">
      <h1 class="hero-title">Sensor de Pulso</h1>
      <p class="hero-subtitle">
        Conecta el sensor de pulso por Wi-Fi para ver tu frecuencia cardíaca y tu saturación de oxígeno (SpO₂) en tiempo real. Compara tus mediciones con ejemplos de referencia para aprender a interpretarlas.
      </p>
      <AvisoEducativo>
        <strong>Uso educativo.</strong> Las mediciones y comparaciones sirven para practicar la interpretación de señales.
        Sensor de Pulso no es un dispositivo médico certificado ni permite diagnosticar enfermedades.
        Si tienes síntomas o dudas sobre tu salud, consulta a un profesional de la salud.
      </AvisoEducativo>
    </div>

    <div class="features-grid">
      <div class="feature-card card">
        <h2 class="card-title"><IconoUi class="feature-icon" name="radio" /><span>Medición en tiempo real</span></h2>
        <p class="feature-text">
          Observa el pulso y la saturación de oxígeno en hasta cinco canales simultáneos.
        </p>
      </div>

      <div class="feature-card card">
        <h2 class="card-title"><IconoUi class="feature-icon" name="chart" /><span>Análisis de señales</span></h2>
        <p class="feature-text">
          Compara tus registros de pulso (PPG) y electrocardiograma (ECG) con señales de referencia.
        </p>
      </div>

      <div class="feature-card card">
        <h2 class="card-title"><IconoUi class="feature-icon" name="building" /><span>Aulas y evaluaciones</span></h2>
        <p class="feature-text">
          Participa en actividades de medición y recibe retroalimentación. Como docente, puedes gestionar cursos y crear evaluaciones.
        </p>
      </div>

      <div class="feature-card card">
        <h2 class="card-title"><IconoUi class="feature-icon" name="lock" /><span>Seguridad y privacidad</span></h2>
        <p class="feature-text">
          Accede con tu correo institucional de la UNACH. La plataforma cifra los datos de salud y limita el acceso según el rol de cada persona.
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import AvisoEducativo from '../components/AvisoEducativo.vue'
</script>

<style scoped>
.hero {
  text-align: center;
  padding: clamp(1.5rem, 5vw, 3rem) clamp(0.75rem, 4vw, 2rem);
  margin-bottom: 2rem;
  background: linear-gradient(120deg, #0b1d52 0%, #1e40af 60%, #2f5bd6 100%);
  border: 0;
  border-radius: 1rem;
  box-shadow: 0 10px 28px rgba(30, 64, 175, 0.25);
}

.hero-title {
  font-size: clamp(1.6rem, 6vw, 2.25rem);
  font-weight: 800;
  color: #ffffff;
  margin-bottom: 0.75rem;
}

.hero-subtitle {
  font-size: 1.1rem;
  color: #dbe6ff;
  max-width: 900px;
  margin: 0 auto 1.5rem auto;
  line-height: 1.6;
}

.features-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(240px, 100%), 1fr));
  gap: clamp(0.75rem, 3vw, 1.5rem);
}

.feature-card:nth-child(1) { --tono: #2563eb; --tono-suave: #dbeafe; }
.feature-card:nth-child(2) { --tono: #7c3aed; --tono-suave: #ede9fe; }
.feature-card:nth-child(3) { --tono: #0f766e; --tono-suave: #ccfbf1; }
.feature-card:nth-child(4) { --tono: #e11d48; --tono-suave: #ffe4ea; }

.feature-card {
  border-top: 4px solid var(--tono);
  background: linear-gradient(180deg, var(--tono-suave) 0%, #ffffff 60%);
  display: flex;
  flex-direction: column;
  text-align: center;
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.feature-card:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1);
}

.feature-card .card-title {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
}

.feature-card .feature-icon {
  color: var(--tono);
  margin: 0;
  width: 22px !important;
  height: 22px !important;
}

.feature-text {
  font-size: 0.95rem;
  color: var(--color-text-soft);
  line-height: 1.5;
}
</style>
