<template>
  <div class="auth-container">
    <div class="card auth-card">
      <!-- Pestañas para cambiar entre Iniciar Sesión y Registrarse -->
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
            ? 'Ingresa tus credenciales para acceder a tus mediciones.' 
            : 'Registro para estudiantes y profesores de la plataforma.' }}
        </p>
      </div>

      <!-- Alertas de error o éxito -->
      <div v-if="errorMessage" class="alert alert-error">
        {{ errorMessage }}
      </div>
      <div v-if="successMessage" class="alert alert-success">
        {{ successMessage }}
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
            placeholder="Ej: Cristóbal Valdés"
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
            placeholder="usuario@alu.unach.cl o @unach.cl"
            required
          />
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
        </div>

        <button 
          type="submit" 
          class="btn btn-primary w-full"
          :disabled="loading"
        >
          {{ loading ? 'Procesando...' : (mode === 'login' ? 'Iniciar Sesión' : 'Crear Cuenta') }}
        </button>
      </form>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { useAuth } from '../composables/useAuth'

const router = useRouter()
const { login, register, loading } = useAuth()

const mode = ref('login')
const nombre = ref('')
const email = ref('')
const password = ref('')
const errorMessage = ref('')
const successMessage = ref('')

const handleSubmit = async () => {
  errorMessage.value = ''
  successMessage.value = ''

  if (mode.value === 'login') {
    const res = await login(email.value, password.value)
    if (res.success) {
      router.push('/medicion')
    } else {
      errorMessage.value = res.error
    }
  } else {
    const res = await register(email.value, password.value, nombre.value)
    if (res.success) {
      successMessage.value = 'Registro exitoso. Revisa tu correo institucional para confirmar tu cuenta.'
      mode.value = 'login'
      password.value = ''
    } else {
      errorMessage.value = res.error
    }
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
  max-width: 440px;
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

.w-full {
  width: 100%;
  margin-top: 0.5rem;
}
</style>