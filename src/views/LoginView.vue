<template>
  <div class="auth-container">
    <div class="card auth-card">
      <!-- Pestañas para alternar entre Iniciar Sesión y Registro -->
      <div class="auth-tabs">
        <button 
          type="button"
          class="tab-btn" 
          :class="{ active: mode === 'login' }"
          @click="mode = 'login'"
        >
          Iniciar Sesión
        </button>
        <button 
          type="button"
          class="tab-btn" 
          :class="{ active: mode === 'register' }"
          @click="mode = 'register'"
        >
          Registrarse
        </button>
      </div>

      <div class="auth-header">
        <h2 class="card-title">
          {{ mode === 'login' ? 'Bienvenido a sensor_pulso' : 'Crear Cuenta Institucional' }}
        </h2>
        <p class="auth-subtitle">
          {{ mode === 'login' 
            ? 'Ingresa tus credenciales institucionales para acceder a la plataforma.' 
            : 'Registro oficial para estudiantes y docentes.' }}
        </p>
      </div>

      <!-- Alerta de Bloqueo Temporal con Contador Regresivo en Vivo (RF50) -->
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

      <!-- Alertas Generales -->
      <div v-if="errorMessage && !cuentaBloqueada" class="alert alert-error">
        {{ errorMessage }}
      </div>
      <div v-if="successMessage" class="alert alert-success">
        {{ successMessage }}
      </div>

      <div v-if="needsEmailConfirmation" class="alert alert-info">
        <p><strong>Confirmación pendiente:</strong> Hemos enviado un enlace de activación a tu correo institucional.</p>
        <p style="margin-top: 0.5rem; font-size: 0.85rem;">
          ¿No lo recibiste? 
          <button type="button" @click="handleResendEmail" class="btn-link" :disabled="resending">
            {{ resending ? 'Reenviando...' : 'Reenviar correo de confirmación' }}
          </button>
        </p>
      </div>

      <!-- RF75: aviso educativo antes de usar la plataforma -->
      <AvisoEducativo compacto />
      <p class="nota-privacidad" style="font-size: 0.85rem; margin: 0 0 0.75rem;">
        Al usar la plataforma tratamos tus datos según la <router-link to="/privacidad" data-testid="enlace-privacidad-login">política de privacidad</router-link>.
      </p>

      <!-- Formulario de Autenticación -->
      <form @submit.prevent="handleSubmit">
        <div v-if="mode === 'register'" class="form-group">
          <label class="form-label" for="nombre">Nombre Completo</label>
          <input 
            id="nombre"
            v-model="nombre" 
            type="text" 
            class="form-input" 
            placeholder="Ej: Constanza Morales"
            required
          />
        </div>

        <div class="form-group">
          <label class="form-label" for="email">Correo Institucional</label>
          <input 
            id="email"
            v-model="email" 
            type="email" 
            class="form-input" 
            placeholder="ejemplo@alu.unach.cl o @unach.cl"
            @blur="verificarBloqueoInput"
            required
          />
          <div v-if="infoDominio" class="domain-badge">
            <span v-if="infoDominio.valido" class="badge" :class="infoDominio.rol === 'profesor' ? 'badge-profesor' : 'badge-usuario'">
              ✓ {{ infoDominio.tipo }} detectado
            </span>
            <span v-else class="text-danger">
              ⚠️ Solo correos institucionales de la UNACH (@alu.unach.cl o @unach.cl)
            </span>
          </div>
        </div>

        <div class="form-group">
          <label class="form-label" for="password">Contraseña</label>
          <input 
            id="password"
            v-model="password" 
            type="password" 
            class="form-input" 
            placeholder="••••••••"
            required
          />

          <!-- Opción de Recuperación de Contraseña (RF50) -->
          <div v-if="mode === 'login'" class="recuperar-link-box">
            <button type="button" @click="abrirModalRecuperacion" class="btn-link text-sm">
              ¿Olvidaste tu contraseña?
            </button>
          </div>

          <!-- Medidor de seguridad de contraseña (solo en registro) -->
          <div v-if="mode === 'register' && password" class="password-meter">
            <div class="meter-bar-bg">
              <div 
                class="meter-bar-fill" 
                :style="{ width: `${fuerzaPassword.score}%`, backgroundColor: fuerzaPassword.color }"
              ></div>
            </div>
            <div class="meter-label">
              <span>Seguridad: <strong :style="{ color: fuerzaPassword.color }">{{ fuerzaPassword.nivel }}</strong></span>
            </div>

            <ul class="criteria-list">
              <li :class="{ met: fuerzaPassword.criterios.longitud }">
                {{ fuerzaPassword.criterios.longitud ? '✓' : '○' }} Mínimo 8 caracteres
              </li>
              <li :class="{ met: fuerzaPassword.criterios.mayuscula && fuerzaPassword.criterios.minuscula }">
                {{ (fuerzaPassword.criterios.mayuscula && fuerzaPassword.criterios.minuscula) ? '✓' : '○' }} Mayúsculas y minúsculas
              </li>
              <li :class="{ met: fuerzaPassword.criterios.numero && fuerzaPassword.criterios.simbolo }">
                {{ (fuerzaPassword.criterios.numero && fuerzaPassword.criterios.simbolo) ? '✓' : '○' }} Al menos un número y un símbolo
              </li>
              <li :class="{ met: fuerzaPassword.criterios.noComun }">
                {{ fuerzaPassword.criterios.noComun ? '✓' : '○' }} Contraseña no común
              </li>
            </ul>
          </div>
        </div>

        <label v-if="mode === 'register'" class="acepta-politica" style="display: flex; gap: 0.5rem; align-items: flex-start; font-size: 0.88rem; margin: 0 0 1rem;">
          <input v-model="aceptaPolitica" type="checkbox" data-testid="acepta-politica" style="margin-top: 0.2rem;" />
          <span>He leído y acepto la <router-link to="/privacidad" target="_blank">política de privacidad</router-link>.</span>
        </label>

        <button 
          type="submit" 
          class="btn btn-primary w-full"
          :disabled="loading || (mode === 'login' && cuentaBloqueada) || (mode === 'register' && (!fuerzaPassword.valida || !aceptaPolitica))"
        >
          {{ loading ? 'Procesando...' : (mode === 'login' ? (cuentaBloqueada ? 'Cuenta Bloqueada' : 'Iniciar Sesión') : 'Crear Cuenta') }}
        </button>
      </form>
    </div>

    <!-- MODAL DE RECUPERACIÓN DE CONTRASEÑA (RF50) -->
    <div v-if="modalRecuperacionAbierto" class="modal-backdrop" @click.self="cerrarModalRecuperacion">
      <div class="modal-card">
        <h3 class="modal-title">🔑 Recuperar Contraseña</h3>
        <p class="modal-subtitle">
          Ingresa tu correo institucional y te enviaremos un enlace de un solo uso para restablecer tu acceso.
        </p>

        <div v-if="mensajeRecuperacion" class="alert alert-success">
          {{ mensajeRecuperacion }}
        </div>
        <div v-if="errorRecuperacion" class="alert alert-error">
          {{ errorRecuperacion }}
        </div>

        <form v-if="!mensajeRecuperacion" @submit.prevent="ejecutarRecuperacion">
          <div class="form-group">
            <label class="form-label">Correo Institucional UNACH</label>
            <input 
              v-model="correoRecuperacion" 
              type="email" 
              class="form-input" 
              placeholder="usuario@alu.unach.cl o docente@unach.cl" 
              required
            />
          </div>

          <div class="modal-actions">
            <button type="button" @click="cerrarModalRecuperacion" class="btn btn-secondary" :disabled="enviandoRecuperacion">
              Cancelar
            </button>
            <button type="submit" class="btn btn-primary" :disabled="enviandoRecuperacion">
              {{ enviandoRecuperacion ? 'Enviando...' : 'Enviar Enlace' }}
            </button>
          </div>
        </form>

        <div v-else class="modal-actions">
          <button type="button" @click="cerrarModalRecuperacion" class="btn btn-primary">
            Entendido
          </button>
        </div>
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
import { validarCorreoInstitucional } from '../utils/validators'
import { evaluarFuerzaContrasena } from '../utils/passwordPolicy'
import { verificarEstadoBloqueo, formatearTiempoRestante } from '../services/seguridadLoginService'

const router = useRouter()
const route = useRoute()
const { login, register, resendConfirmationEmail, loading, solicitarRecuperacionContrasena } = useAuth()

const mode = ref('login')
const nombre = ref('')
const aceptaPolitica = ref(false)
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const needsEmailConfirmation = ref(false)
const resending = ref(false)

// Estado del bloqueo temporal (RF50)
const cuentaBloqueada = ref(false)
const segundosRestantes = ref(0)
const timerBloqueo = ref(null)

// Modal de recuperación de contraseña (RF50)
const modalRecuperacionAbierto = ref(false)
const correoRecuperacion = ref('')
const enviandoRecuperacion = ref(false)
const mensajeRecuperacion = ref('')
const errorRecuperacion = ref('')

onMounted(() => {
  // RF51: Si se cerró la sesión por inactividad
  if (route.query?.motivo === 'inactividad') {
    errorMessage.value = 'Tu sesión se ha cerrado automáticamente por inactividad. Por favor, inicia sesión de nuevo.'
  }
})

const infoDominio = computed(() => {
  if (!email.value || !email.value.includes('@')) return null
  return validarCorreoInstitucional(email.value)
})

const fuerzaPassword = computed(() => {
  return evaluarFuerzaContrasena(password.value)
})

const tiempoRestanteTexto = computed(() => {
  return formatearTiempoRestante(segundosRestantes.value)
})

const iniciarTemporizadorBloqueo = (segundos) => {
  if (timerBloqueo.value) clearInterval(timerBloqueo.value)
  segundosRestantes.value = segundos
  cuentaBloqueada.value = true

  timerBloqueo.value = setInterval(() => {
    if (segundosRestantes.value > 1) {
      segundosRestantes.value--
    } else {
      segundosRestantes.value = 0
      cuentaBloqueada.value = false
      clearInterval(timerBloqueo.value)
      timerBloqueo.value = null
      errorMessage.value = ''
    }
  }, 1000)
}

const verificarBloqueoInput = async () => {
  if (!email.value || mode.value !== 'login') return
  const estado = await verificarEstadoBloqueo(email.value)
  if (estado.bloqueado) {
    iniciarTemporizadorBloqueo(estado.segundosRestantes)
  } else if (!timerBloqueo.value) {
    cuentaBloqueada.value = false
    segundosRestantes.value = 0
  }
}

watch(email, (nuevo) => {
  if (nuevo) verificarBloqueoInput()
})

const handleSubmit = async () => {
  errorMessage.value = ''
  successMessage.value = ''
  needsEmailConfirmation.value = false

  const validacion = validarCorreoInstitucional(email.value)
  if (!validacion.valido) {
    errorMessage.value = validacion.error
    return
  }

  if (mode.value === 'login') {
    const res = await login(email.value, password.value)
    if (res.success) {
      if (timerBloqueo.value) clearInterval(timerBloqueo.value)
      router.push('/medicion')
    } else {
      errorMessage.value = res.error
      if (res.bloqueado && res.segundosRestantes > 0) {
        iniciarTemporizadorBloqueo(res.segundosRestantes)
      }
      if (res.error?.includes('confirmar tu correo')) {
        needsEmailConfirmation.value = true
      }
    }
  } else {
    // Registro
    if (!fuerzaPassword.value.valida) {
      errorMessage.value = 'Por favor cumple con todos los requisitos de seguridad de la contraseña.'
      return
    }

    if (!aceptaPolitica.value) {
      errorMessage.value = 'Para crear la cuenta debes aceptar la política de privacidad.'
      return
    }

    const res = await register(email.value, password.value, nombre.value, POLITICA_VERSION)
    if (res.success) {
      successMessage.value = 'Cuenta creada correctamente. Te hemos enviado un enlace a tu correo institucional para activar tu cuenta.'
      needsEmailConfirmation.value = true
      mode.value = 'login'
      password.value = ''
    } else {
      errorMessage.value = res.error
    }
  }
}

const handleResendEmail = async () => {
  if (!email.value) return
  resending.value = true
  const res = await resendConfirmationEmail(email.value)
  resending.value = false
  if (res.success) {
    successMessage.value = 'Correo de confirmación reenviado. Revisa tu bandeja de entrada.'
  } else {
    errorMessage.value = res.error
  }
}

// Métodos del modal de recuperación (RF50)
const abrirModalRecuperacion = () => {
  correoRecuperacion.value = email.value || ''
  mensajeRecuperacion.value = ''
  errorRecuperacion.value = ''
  modalRecuperacionAbierto.value = true
}

const cerrarModalRecuperacion = () => {
  modalRecuperacionAbierto.value = false
}

const ejecutarRecuperacion = async () => {
  if (!correoRecuperacion.value) return
  enviandoRecuperacion.value = true
  errorRecuperacion.value = ''
  mensajeRecuperacion.value = ''

  const res = await solicitarRecuperacionContrasena(correoRecuperacion.value)
  enviandoRecuperacion.value = false

  if (res.success) {
    mensajeRecuperacion.value = res.message
  } else {
    errorRecuperacion.value = res.error
  }
}

onUnmounted(() => {
  if (timerBloqueo.value) clearInterval(timerBloqueo.value)
})
</script>

<style scoped>
.auth-container {
  display: flex;
  justify-content: center;
  align-items: center;
  padding: 2rem 1rem;
}

.auth-card {
  width: 100%;
  max-width: 460px;
}

.auth-tabs {
  display: flex;
  border-bottom: 2px solid var(--color-border);
  margin-bottom: 1.5rem;
}

.tab-btn {
  flex: 1;
  padding: 0.75rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  margin-bottom: -2px;
  font-weight: 600;
  color: var(--color-muted);
  cursor: pointer;
  transition: all 0.2s;
}

.tab-btn.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.auth-header {
  text-align: center;
  margin-bottom: 1.5rem;
}

.auth-subtitle {
  font-size: 0.875rem;
  color: var(--color-muted);
  margin-top: 0.25rem;
}

.domain-badge {
  margin-top: 0.35rem;
}

.text-danger {
  color: var(--color-danger);
  font-size: 0.8rem;
  font-weight: 500;
}

/* Banner de Bloqueo RF50 */
.bloqueo-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  padding: 1rem;
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

.recuperar-link-box {
  display: flex;
  justify-content: flex-end;
  margin-top: 0.35rem;
}

.text-sm {
  font-size: 0.825rem;
}

.password-meter {
  margin-top: 0.65rem;
  background: #f8fafc;
  padding: 0.75rem;
  border-radius: 0.5rem;
  border: 1px solid var(--color-border);
}

.meter-bar-bg {
  height: 6px;
  background-color: #e2e8f0;
  border-radius: 9999px;
  overflow: hidden;
}

.meter-bar-fill {
  height: 100%;
  transition: width 0.3s ease, background-color 0.3s ease;
}

.meter-label {
  display: flex;
  justify-content: flex-end;
  font-size: 0.75rem;
  margin-top: 0.35rem;
}

.criteria-list {
  list-style: none;
  padding: 0;
  margin: 0.5rem 0 0 0;
  font-size: 0.75rem;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.25rem;
  color: var(--color-muted);
}

.criteria-list li.met {
  color: var(--color-success);
  font-weight: 600;
}

.btn-link {
  background: none;
  border: none;
  color: var(--color-primary);
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
  padding: 0;
}

.w-full {
  width: 100%;
  margin-top: 0.5rem;
}

/* Modal de Recuperación RF50 */
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.6);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
  padding: 1rem;
}

.modal-card {
  background: var(--color-surface);
  border-radius: 0.75rem;
  max-width: 440px;
  width: 100%;
  padding: 1.75rem;
  box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.2);
}

.modal-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.25rem;
}

.modal-subtitle {
  font-size: 0.875rem;
  color: var(--color-muted);
  margin-bottom: 1rem;
  line-height: 1.4;
}

.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  margin-top: 1.5rem;
}
</style>
