<template>
  <div class="admin-container">
    <div class="card">
      <h1 class="card-title">⚙️ Panel de Administración</h1>
      <p style="color: var(--color-muted); margin-bottom: 1.5rem;">
        Gestión global del sistema y configuración de roles institucionales.
      </p>

      <!-- Sección del Primer Administrador (RF44) -->
      <div class="seed-card card">
        <h2 class="section-title">Primer Administrador del Sistema</h2>
        <p class="section-desc">
          Cuenta raíz de administración configurada en código para el arranque inicial de la plataforma.
        </p>

        <div class="admin-info-box">
          <p><strong>Correo definido:</strong> <code>admin.general@unach.cl</code></p>
          <p><strong>Rol asignado:</strong> <span class="badge badge-admin">Administrador</span></p>
        </div>

        <div v-if="statusMessage" class="alert" :class="statusSuccess ? 'alert-success' : 'alert-info'">
          {{ statusMessage }}
        </div>

        <button 
          @click="ejecutarInicializacion" 
          class="btn btn-primary"
          :disabled="loading"
        >
          {{ loading ? 'Verificando...' : 'Verificar / Inicializar Primer Administrador' }}
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import { verificarOCrearPrimerAdmin } from '../services/adminService'

const loading = ref(false)
const statusMessage = ref('')
const statusSuccess = ref(false)

const ejecutarInicializacion = async () => {
  loading.value = true
  statusMessage.value = ''
  
  const res = await verificarOCrearPrimerAdmin()
  loading.value = false
  
  if (res.error) {
    statusSuccess.value = false
    statusMessage.value = res.error
  } else {
    statusSuccess.value = res.creado
    statusMessage.value = res.mensaje
  }
}
</script>

<style scoped>
.admin-container {
  max-width: 800px;
  margin: 0 auto;
}

.seed-card {
  background: #f8fafc;
  border: 1px solid var(--color-border);
  padding: 1.5rem;
  border-radius: 0.5rem;
}

.section-title {
  font-size: 1.15rem;
  font-weight: 700;
  margin-bottom: 0.35rem;
}

.section-desc {
  font-size: 0.9rem;
  color: var(--color-muted);
  margin-bottom: 1rem;
}

.admin-info-box {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
  border-radius: 0.5rem;
  padding: 1rem;
  margin-bottom: 1rem;
  font-size: 0.9rem;
}

.admin-info-box p {
  margin: 0.25rem 0;
}
</style>