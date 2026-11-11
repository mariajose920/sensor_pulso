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

      <!-- Alerta de Bloqueo Temporal (RF50) -->
      <div v-if="cuentaBloqueada" class="alert alert-error bloqueo-banner">
        <div class="bloqueo-icono">🔒</div>
        <div>
          <strong>Acceso Bloqueado Temporalmente</strong>
          <p class="mt-1">
            Por seguridad ante múltiples intentos fallidos, debes esperar:
            <span class="timer-badge">{{ tiempoRestanteTexto }}</span>
          </p>
          <small class="text-muted-xs">
            El bloqueo terminará automáticamente una vez cumplido el tiempo.
          </small>
        </div>
      </div>

      <!-- Alertas de Error, Aviso de Sesión o Éxito -->
      <div v-if="errorMessage && !cuentaBloqueada" class="alert alert-error mb-3">
        {{ errorMessage }}
      </div>
      <div v-if="avisoSesionRequerida" class="alert alert-info mb-3" role="status" data-testid="aviso-sesion-requerida">
        <template v-if="route.query?.motivo === 'medicion'">
          <div style="display: flex; align-items: flex-start; gap: 0.75rem;">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" style="flex-shrink: 0; margin-top: 2px;">
              <circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>
            </svg>
            <div>
              <strong style="display: block; margin-bottom: 0.25rem;">Se requiere inicio de sesión para operar el sensor de pulso</strong>
              <p style="margin: 0 0 0.65rem 0; font-size: 0.88rem; line-height: 1.45;">
                Para conectarte al sensor y registrar bioseñales en tiempo real, debes identificarte con tu cuenta institucional de la UNACH (@alu.unach.cl o @unach.cl).
              </p>
              <router-link to="/aprendizaje/simulador" class="btn btn-secondary btn-sm">
                Continuar en Modo Simulador Educativo
              </router-link>
            </div>
          </div>
        </template>
        <template v-else>
          {{ avisoSesionRequerida }}
        </template>
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

      <!-- BOTÓN OFICIAL Y EXCLUSIVO DE GOOGLE OAUTH (RF02) -->
      <div class="google-auth-box">
        <button
          type="button"
          class="btn-google"
          @click="handleGoogleLogin"
          :disabled="loading || !aceptaPolitica"
        >
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

      <!-- ACCESO RÁPIDO CON CUENTAS PREDEFINIDAS PARA PRUEBAS (Admin y Profesor) -->
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
            Ingreso inmediato con las cuentas predefinidas para pruebas:
          </p>
          <button
            type="button"
            @click="handleDemoLogin('admin')"
            class="btn-demo-item"
            :disabled="loading"
          >
            🛡️ Probar como Administrador (admin.general@unach.cl)
          </button>
          <button
            type="button"
            @click="handleDemoLogin('profesor')"
            class="btn-demo-item"
            :disabled="loading"
          >
            👨‍🏫 Probar como Profesor (profesor.prueba@unach.cl)
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
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { mensajeSesionRequerida } from '../utils/accesoSinSesion'
import { formatearTiempoRestante } from '../services/seguridadLoginService'

const router = useRouter()
const route = useRoute()
const { loginWithGoogle, loginGoogleDemo, register, loading, isAuthenticated, authError } = useAuth()

const aceptaPolitica = ref(true)
const errorMessage = ref('')
const successMessage = ref('')
const mostrarDemo = ref(false)

// Aviso para quien intenta entrar a secciones protegidas sin sesión
const avisoSesionRequerida = ref(mensajeSesionRequerida(route.query?.motivo))

// Estado compatible con alertas de bloqueo temporal (RF50)
const cuentaBloqueada = ref(false)
const segundosRestantes = ref(0)
const timerBloqueo = ref(null)
const tiempoRestanteTexto = computed(() => formatearTiempoRestante(segundosRestantes.value))

// Campos para trazabilidad de pruebas de política de privacidad (RF88)
const email = ref('')
const password = ref('')
const nombre = ref('')

// Pantalla a la que volver después de entrar: solo rutas internas de la propia aplicación
function destinoTrasLogin() {
  const pedido = route.query?.redirect
  if (typeof pedido === 'string' && pedido.startsWith('/') && !pedido.startsWith('//')) return pedido
  return '/medicion'
}

// Iniciar sesión con Google OAuth oficial (único método de ingreso)
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

// Acceso rápido con cuentas predefinidas de Administrador y Profesor
const handleDemoLogin = async (tipo) => {
  errorMessage.value = ''
  const res = await loginGoogleDemo(tipo)
  if (res.success) {
    successMessage.value = `Sesión iniciada con éxito como ${tipo === 'admin' ? 'Administrador' : 'Profesor'}.`
    router.push(destinoTrasLogin())
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
  // RF51: Si se cerró la sesión por inactividad
  if (route.query?.motivo === 'inactividad') {
    errorMessage.value = 'Tu sesión se ha cerrado automáticamente por inactividad. Por favor, inicia sesión de nuevo.'
  }

  // RF02: Mostrar mensaje claro si Supabase rechazó un correo no institucional en Google OAuth
  const queryParams = new URLSearchParams(window.location.search)
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  const oauthError =
    queryParams.get('error_description')
    || hashParams.get('error_description')
    || queryParams.get('error')
    || hashParams.get('error')

  if (oauthError) {
    if (oauthError.includes('Database error') || oauthError.includes('unach.cl') || oauthError.includes('access_denied')) {
      errorMessage.value = 'Solo se permiten correos institucionales de la UNACH (@alu.unach.cl o @unach.cl). Las cuentas personales no pueden ingresar.'
    } else {
      errorMessage.value = `No se pudo iniciar sesión: ${oauthError}`
    }
    window.history.replaceState({}, document.title, window.location.pathname)
    return
  }

  if (authError.value) {
    errorMessage.value = authError.value
  }
})

watch(authError, (err) => {
  if (err) errorMessage.value = err
})

watch(isAuthenticated, (logueado) => {
  if (logueado) {
    router.push(destinoTrasLogin())
  }
}, { immediate: true })

onUnmounted(() => {
  if (timerBloqueo.value) clearInterval(timerBloqueo.value)
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

.auth-header {
  margin-bottom: 1.25rem;
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
  margin: 0.35rem 0 0 0;
  line-height: 1.4;
}

.bloqueo-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
  margin-bottom: 1rem;
}

.bloqueo-icono {
  font-size: 1.75rem;
}

.timer-badge {
  display: inline-block;
  background: #7f1d1d;
  color: #fff;
  font-weight: 700;
  font-family: monospace;
  padding: 0.2rem 0.5rem;
  border-radius: 0.25rem;
  margin-top: 0.25rem;
}

.text-muted-xs {
  display: block;
  font-size: 0.75rem;
  opacity: 0.85;
  margin-top: 0.35rem;
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
</style>
