<template>
  <div class="user-identifier card">
    <div class="header">
      <span class="badge" :class="roleBadgeClass">
        {{ roleLabel }}
      </span>
      <span class="status-indicator" :class="{ active: isAuthenticated }">
        {{ isAuthenticated ? '● Identificado' : '○ Sesión no iniciada' }}
      </span>
    </div>

    <div class="user-info">
      <div class="avatar">
        {{ avatarInitial }}
      </div>
      <div class="details">
        <h3 class="user-name">{{ currentUserName }}</h3>
        <p class="user-email">{{ currentUserEmail || 'Inicia sesión con tu correo @unach.cl o @alu.unach.cl' }}</p>
        <small v-if="currentUserId" class="user-id">ID de Medición: <code>{{ currentUserId }}</code></small>
      </div>
    </div>

    <div v-if="!isAuthenticated" class="alert alert-info mt-2">
      <strong>RF01:</strong> Para que las mediciones queden registradas a tu nombre, debes iniciar sesión.
      <router-link to="/login" class="link-login">Ir a Iniciar Sesión</router-link>
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useAuth } from '../composables/useAuth'

const { isAuthenticated, currentUserId, currentUserEmail, currentUserName, currentUserRole } = useAuth()

const avatarInitial = computed(() => {
  return currentUserName.value ? currentUserName.value.charAt(0).toUpperCase() : '?'
})

const roleLabel = computed(() => {
  if (currentUserRole.value === 'admin') return 'Administrador'
  if (currentUserRole.value === 'profesor') return 'Profesor'
  return 'Estudiante / Usuario'
})

const roleBadgeClass = computed(() => {
  if (currentUserRole.value === 'admin') return 'badge-admin'
  if (currentUserRole.value === 'profesor') return 'badge-profesor'
  return 'badge-usuario'
})
</script>

<style scoped>
.user-identifier {
  padding: 1.25rem;
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.75rem;
}

.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1rem;
}

.status-indicator {
  font-size: 0.85rem;
  font-weight: 600;
  color: var(--color-muted);
}

.status-indicator.active {
  color: var(--color-success);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.avatar {
  width: 48px;
  height: 48px;
  border-radius: 50%;
  background: var(--color-primary);
  color: white;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  font-weight: 700;
}

.user-name {
  font-size: 1.1rem;
  font-weight: 700;
  margin: 0;
}

.user-email {
  font-size: 0.9rem;
  color: var(--color-muted);
  margin: 0.15rem 0;
}

.user-id {
  font-size: 0.75rem;
  color: var(--color-muted);
}

.mt-2 {
  margin-top: 1rem;
}

.link-login {
  display: block;
  margin-top: 0.25rem;
  color: var(--color-primary);
  font-weight: 600;
  text-decoration: underline;
}
</style>