<template>
  <div class="contenidos-container">
    <div class="card">
      <h1 class="card-title">📝 Contenidos y configuración</h1>
      <p class="header-desc">
        Propón cambios a las lecciones y al método de sincronización. El administrador los revisa antes de que apliquen a toda la plataforma.
      </p>
      <p v-if="!puedeEditar" class="alert alert-error">
        No tienes el permiso «editar contenidos». Pídele al administrador que te lo asigne.
      </p>
      <template v-else>
        <ContenidosPanel modo="profesor" :usuario-id="currentUserId" />
        <MetodoSincronizacionPanel class="mt-4" modo="profesor" :usuario-id="currentUserId" />
        <PropuestasPanel class="mt-4" modo="profesor" />
      </template>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import ContenidosPanel from '../components/ContenidosPanel.vue'
import MetodoSincronizacionPanel from '../components/MetodoSincronizacionPanel.vue'
import PropuestasPanel from '../components/PropuestasPanel.vue'
import { useAuth } from '../composables/useAuth'
import { obtenerPermisosProfesor } from '../services/adminService'

const { currentUserId, isAdmin } = useAuth()
const permiso = ref(false)

// RF98: el profesor solo propone si el administrador le dio el permiso editar_contenidos (la RLS también lo exige).
const puedeEditar = computed(() => isAdmin.value || permiso.value)

onMounted(async () => {
  if (isAdmin.value || !currentUserId.value) return
  const res = await obtenerPermisosProfesor(currentUserId.value)
  permiso.value = !!(res.success && res.data?.editar_contenidos)
})
</script>

<style scoped>
.contenidos-container { max-width: 950px; margin: 0 auto; }
.header-desc { color: var(--color-muted); font-size: 0.95rem; margin-bottom: 1.25rem; }
</style>
