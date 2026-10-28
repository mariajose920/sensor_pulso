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

      <!-- Alertas -->
      <div v-if="errorMessage" class="alert alert-error">
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

      <!-- Formulario -->
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

        <button 
          type="submit" 
          class="btn btn-primary w-full"
          :disabled="loading || (mode === 'register' && !fuerzaPassword.valida)"
        >
          {{ loading ? 'Procesando...' : (mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta') }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'
import { validarCorreoInstitucional } from '../utils/validators'
import { evaluarFuerzaContrasena } from '../utils/passwordPolicy'

const router = useRouter()
const { login, register, resendConfirmationEmail, loading } = useAuth()

const mode = ref('login')
const nombre = ref('')
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const successMessage = ref('')
const needsEmailConfirmation = ref(false)
const resending = ref(false)

const infoDominio = computed(() => {
  if (!email.value || !email.value.includes('@')) return null
  return validarCorreoInstitucional(email.value)
})

const fuerzaPassword = computed(() => {
  return evaluarFuerzaContrasena(password.value)
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
      router.push('/medicion')
    } else {
      errorMessage.value = res.error
      if (res.error.includes('confirmar tu correo')) {
        needsEmailConfirmation.value = true
      }
    }
  } else {
    // Validar contraseña robusta antes de registrar
    if (!fuerzaPassword.value.valida) {
      errorMessage.value = 'Por favor cumple con todos los requisitos de seguridad de la contraseña.'
      return
    }

    const res = await register(email.value, password.value, nombre.value)
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
</style>