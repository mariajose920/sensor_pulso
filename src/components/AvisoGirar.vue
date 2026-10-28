<template>
  <div v-if="visible" class="aviso-girar" role="status">
    <NavIcon name="girar" class="aviso-girar-icono" />
    <p class="aviso-girar-texto">
      Para ver mejor los gráficos, gira el celular a horizontal.
    </p>
    <button type="button" class="btn btn-secondary aviso-girar-cerrar" @click="cerrar">Entendido</button>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import NavIcon from './NavIcon.vue'
import { useMediaQuery } from '../composables/useMediaQuery.js'
import { consultas } from '../utils/breakpoints.js'

// Solo aparece en móvil con la pantalla en vertical, y se puede cerrar durante la sesión.
const CLAVE = 'aviso-girar-cerrado'
const esMovilVertical = useMediaQuery(consultas.esMovilVertical)

function leerCerrado() {
  try { return sessionStorage.getItem(CLAVE) === '1' } catch { return false }
}
const cerrado = ref(leerCerrado())
const visible = computed(() => esMovilVertical.value && !cerrado.value)

function cerrar() {
  cerrado.value = true
  try { sessionStorage.setItem(CLAVE, '1') } catch { /* sin almacenamiento: solo se oculta ahora */ }
}
</script>

<style scoped>
.aviso-girar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  color: #1e40af;
  border-radius: 0.5rem;
  padding: 0.75rem;
  margin-bottom: 1rem;
}
.aviso-girar-icono { flex: none; width: 28px; height: 28px; }
.aviso-girar-texto { flex: 1; min-width: 10rem; font-size: 0.9rem; margin: 0; }
.aviso-girar-cerrar { padding: 0 1rem; }
</style>
