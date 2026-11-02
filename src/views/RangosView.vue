<template>
  <div class="rangos-container">
    <div class="card">
      <h1 class="card-title">📏 Rangos de referencia</h1>
      <p class="header-desc">
        Rangos de BPM y SpO₂ por actividad y edad. Puedes ajustarlos para tu cuenta o proponer un cambio para todos.
      </p>
      <RangosPanel :modo="isAdmin ? 'admin' : 'profesor'" :puede-editar="puedeEditar" :usuario-id="currentUserId" />
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import RangosPanel from '../components/RangosPanel.vue'
import { useAuth } from '../composables/useAuth'
import { obtenerPermisosProfesor } from '../services/adminService'

const { currentUserId, isAdmin } = useAuth()
const permisoEditarRangos = ref(false)

// RF98: el profesor solo edita si el administrador le dio el permiso editar_rangos.
const puedeEditar = computed(() => isAdmin.value || permisoEditarRangos.value)

onMounted(async () => {
  if (isAdmin.value || !currentUserId.value) return
  const res = await obtenerPermisosProfesor(currentUserId.value)
  permisoEditarRangos.value = !!(res.success && res.data?.editar_rangos)
})
</script>

<style scoped>
.rangos-container { max-width: 950px; margin: 0 auto; }
.header-desc { color: var(--color-muted); font-size: 0.95rem; margin-bottom: 1.25rem; }
</style>
