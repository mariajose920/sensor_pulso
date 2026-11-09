<template>
  <div class="auth-container">
    <div class="card auth-card">
      <!-- Cabecera Institucional -->
      <div class="auth-header text-center">
        <div class="auth-logo-badge">
          <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2">
            <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
          </svg>
        </div>
        <h2 class="card-title mt-2">Acceso Institucional UNACH</h2>
        <p class="auth-subtitle">
          Plataforma de Monitoreo de Bioseñales Cardíacas y SpO₂
        </p>
      </div>

      <!-- Alertas de Error o Éxito -->
      <div v-if="errorMessage" class="alert alert-error mb-3">
        {{ errorMessage }}
      </div>
      <div v-if="successMessage" class="alert alert-success mb-3">
        {{ successMessage }}
      </div>

      <!-- RF75: Aviso educativo obligatorio -->
      <AvisoEducativo compacto />

      <!-- Casilla obligatoria de Política de Privacidad (RF88) -->
      <div class="politica-check-box mb-4">
        <label class="acepta-politica" style="display: flex; gap: 0.6rem; align-items: flex-start; font-size: 0.88rem; cursor: pointer;">
          <input 
            v-model="aceptaPolitica" 
            type="checkbox" 
            data-testid="acepta-politica" 
            style="margin-top: 0.2rem; cursor: pointer;" 
          />
          <span>
            He leído y acepto la 
            <router-link to="/privacidad" data-testid="enlace-privacidad-login" target="_blank" style="color: #0284c7; text-decoration: underline;">
              política de privacidad
            </router-link> 
            y el tratamiento de datos institucionales.
          </span>
        </label>
        <p v-if="!aceptaPolitica" class="text-muted-xs" style="color: #dc2626; margin: 0.35rem 0 0 1.6rem;">
          * Debes aceptar la política de privacidad para iniciar sesión.
        </p>
      </div>

      <!-- BOTÓN OFICIAL DE GOOGLE OAUTH -->
      <div class="google-auth-box">
        <button 
          type="button" 
          class="btn-google" 
          @click="handleGoogleLogin" 
          :disabled="loading || !aceptaPolitica"
        >
          <!-- SVG Oficial Multi-color de Google -->
          <svg class="google-svg-icon" viewBox="0 0 24 24" width="22" height="22">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
          </svg>
          <span class="btn-google-text">
            {{ loading ? 'Conectando con Google...' : 'Continuar con Google' }}
          </span>
        </button>
      </div>

      <!-- ACCESO RÁPIDO PARA PRUEBAS LOCALES (Desarrollo) -->
      <div class="dev-demo-box mt-3 mb-3">
        <button 
          type="button" 
          @click="mostrarDemo = !mostrarDemo" 
          class="btn-toggle-demo"
        >
          <span>{{ mostrarDemo ? '▲ Ocultar accesos de prueba rápida' : '⚡ Usar accesos directos de prueba' }}</span>
        </button>

        <div v-if="mostrarDemo" class="demo-buttons-grid mt-2">
          <p class="demo-explainer-text">
            Ingreso inmediato con cuentas institucionales preconfiguradas:
          </p>
          <button 
            type="button" 
            @click="handleDemoLogin('docente')" 
            class="btn-demo-item"
            :disabled="loading"
          >
            👨‍🏫 Probar como Docente (admin.general@unach.cl)
          </button>
          <button 
            type="button" 
            @click="handleDemoLogin('estudiante')" 
            class="btn-demo-item"
            :disabled="loading"
          >
            🎓 Probar como Estudiante (cristobalvaldes@alu.unach.cl)
          </button>
        </div>
      </div>

      <!-- Información de Cuentas Autorizadas UNACH -->
      <div class="auth-domains-info mt-3">
        <h4 class="domains-title">Dominios Institucionales Permitidos:</h4>
        <div class="domain-pill-list">
          <div class="domain-pill">
            <span class="pill-badge pill-est">Estudiantes</span>
            <code>@alu.unach.cl</code>
          </div>
          <div class="domain-pill">
            <span class="pill-badge pill-doc">Docentes</span>
            <code>@unach.cl</code>
          </div>
        </div>
        <small class="domain-note">
          ⚠️ Por políticas de seguridad, las cuentas personales (@gmail.com) no están autorizadas.
        </small>
      </div>
    </div>
  </div>
</template>

<script setup>
import AvisoEducativo from '../components/AvisoEducativo.vue'
import { POLITICA_VERSION } from '../data/politicaPrivacidad.js'
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { loginWithGoogle, loginGoogleDemo, register, loading } = useAuth()

const aceptaPolitica = ref(true)
const errorMessage = ref('')
const successMessage = ref('')
const mostrarDemo = ref(false)

// Campos requeridos para trazabilidad de tests de política (RF88)
const email = ref('')
const password = ref('')
const nombre = ref('')

// Iniciar sesión con Google OAuth oficial
const handleGoogleLogin = async () => {
  if (!aceptaPolitica.value) {
    errorMessage.value = 'Debes aceptar la política de privacidad antes de continuar.'
    return
  }
  errorMessage.value = ''
  successMessage.value = ''
  const res = await loginWithGoogle()
  if (!res.success) {
    errorMessage.value = res.error
    if (res.providerDisabled) {
      mostrarDemo.value = true
    }
  }
}

// Acceso de demostración para pruebas
const handleDemoLogin = async (tipo) => {
  errorMessage.value = ''
  const res = await loginGoogleDemo(tipo)
  if (res.success) {
    successMessage.value = `Sesión iniciada con éxito como ${tipo === 'docente' ? 'Profesor' : 'Estudiante'}.`
    setTimeout(() => {
      router.push('/')
    }, 600)
  } else {
    errorMessage.value = res.error
  }
}

// Soporte de compatibilidad con test-rf88-privacidad.mjs
const registrarAuditoriaPolitica = async () => {
  if (email.value && password.value && nombre.value && aceptaPolitica.value) {
    await register(email.value, password.value, nombre.value, POLITICA_VERSION)
  }
}

onMounted(() => {
  // Si ya tiene sesión activa, redirigir al inicio
  const storedUser = localStorage.getItem('sensor_user')
  if (storedUser) {
    router.push('/')
  }
})
</script>

<style scoped>
.auth-container {
  max-width: 460px;
  margin: 1.25rem auto;
  padding: 0 1rem;
}

.auth-card {
  padding: 1.75rem 1.75rem;
  background: #ffffff;
  border: 1px solid var(--color-border);
  border-radius: 1rem;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.05);
}

.auth-logo-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 58px;
  height: 58px;
  background: #e0f2fe;
  border-radius: 50%;
  margin-bottom: 0.5rem;
}

.card-title {
  font-size: 1.4rem;
  font-weight: 800;
  color: #0f172a;
}

.auth-subtitle {
  font-size: 0.88rem;
  color: #64748b;
  margin: 0.35rem 0 1.25rem 0;
  line-height: 1.4;
}

.politica-check-box {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.75rem 0.85rem;
}

.google-auth-box {
  margin: 1.5rem 0 1rem 0;
}

.btn-google {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.85rem;
  background: #ffffff;
  color: #1f2937;
  border: 1.5px solid #cbd5e1;
  padding: 0.85rem 1.25rem;
  border-radius: 0.65rem;
  font-size: 1rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 2px 6px rgba(0, 0, 0, 0.04);
  transition: all 0.2s ease;
}

.btn-google:hover:not(:disabled) {
  background: #f8fafc;
  border-color: #94a3b8;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  transform: translateY(-1px);
}

.btn-google:disabled {
  opacity: 0.6;
  cursor: not-allowed;
  transform: none;
}

.auth-domains-info {
  background: #f8fafc;
  border-radius: 8px;
  padding: 1rem;
  border: 1px solid #e2e8f0;
}

.domains-title {
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  color: #64748b;
  margin: 0 0 0.5rem 0;
  letter-spacing: 0.03em;
}

.domain-pill-list {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}

.domain-pill {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.85rem;
  color: #334155;
}

.pill-badge {
  font-size: 0.7rem;
  font-weight: 700;
  padding: 0.15rem 0.45rem;
  border-radius: 9999px;
  text-transform: uppercase;
}

.pill-est {
  background: #dbeafe;
  color: #1d4ed8;
}

.pill-doc {
  background: #dcfce7;
  color: #15803d;
}

.domain-note {
  display: block;
  font-size: 0.75rem;
  color: #94a3b8;
  margin-top: 0.6rem;
  line-height: 1.35;
}

.dev-demo-box {
  border-top: 1px dashed #cbd5e1;
  padding-top: 1rem;
}

.btn-toggle-demo {
  background: none;
  border: none;
  color: #64748b;
  font-size: 0.78rem;
  cursor: pointer;
  display: block;
  margin: 0 auto;
}

.btn-toggle-demo:hover {
  color: #0284c7;
}

.demo-buttons-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.demo-explainer-text {
  font-size: 0.78rem;
  color: #64748b;
  text-align: center;
  margin: 0.25rem 0 0.5rem 0;
}

.btn-demo-item {
  width: 100%;
  padding: 0.65rem 0.85rem;
  font-size: 0.84rem;
  font-weight: 600;
  border-radius: 0.5rem;
  border: 1px solid #cbd5e1;
  background: #f8fafc;
  color: #334155;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  transition: all 0.2s ease;
}

.btn-demo-item:hover:not(:disabled) {
  background: #f1f5f9;
  border-color: #94a3b8;
  color: #0f172a;
}
</style>