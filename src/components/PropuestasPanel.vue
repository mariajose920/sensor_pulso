<template>
  <section class="panel" data-testid="panel-propuestas">
    <div class="top">
      <div>
        <h2 class="titulo">{{ esAdmin ? 'Propuestas de profesores' : 'Mis propuestas' }}</h2>
        <p class="desc">
          {{ esAdmin
            ? 'Cambios de método de sincronización y contenidos. Nada aplica a la plataforma hasta que lo apruebes. Las propuestas de rangos están en la sección de rangos.'
            : 'Estado de las propuestas que enviaste.' }}
        </p>
      </div>
      <button class="btn btn-secondary btn-sm" @click="cargar" :disabled="cargando">Actualizar</button>
    </div>

    <div v-if="mensaje" class="alert" :class="mensajeOk ? 'alert-success' : 'alert-error'" role="status">{{ mensaje }}</div>
    <p v-if="cargando" class="estado">Cargando propuestas...</p>
    <p v-else-if="propuestas.length === 0" class="estado">No hay propuestas.</p>

    <ul v-else class="lista">
      <li v-for="p in propuestas" :key="p.id">
        <div>
          <strong>{{ TIPOS_PROPUESTA[p.tipo] || p.tipo }}</strong> · {{ describirPropuesta(p) }}
          <small>Motivo: {{ p.motivo }} · {{ formatearFecha(p.creado_en) }}</small>
        </div>
        <div class="acciones">
          <template v-if="esAdmin && p.estado === 'pendiente'">
            <button class="btn btn-primary btn-sm" :disabled="resolviendo === p.id" @click="resolver(p, true)">Aprobar</button>
            <button class="btn btn-secondary btn-sm" :disabled="resolviendo === p.id" @click="resolver(p, false)">Rechazar</button>
          </template>
          <span v-else class="badge" :class="claseEstado(p.estado)">{{ p.estado }}</span>
        </div>
      </li>
    </ul>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { listarPropuestas, resolverPropuesta } from '../services/panelAdminService'
import { TIPOS_PROPUESTA, describirPropuesta } from '../utils/panelAdmin.js'

const props = defineProps({
  modo: { type: String, default: 'profesor' }   // 'admin' | 'profesor'
})
const esAdmin = computed(() => props.modo === 'admin')

const propuestas = ref([])
const cargando = ref(true)
const resolviendo = ref(null)
const mensaje = ref('')
const mensajeOk = ref(true)

const claseEstado = (e) => (e === 'aprobada' ? 'badge-profesor' : e === 'rechazada' ? 'badge-admin-baja' : 'badge-usuario')
const formatearFecha = (iso) => (iso ? new Date(iso).toLocaleString('es-CL') : '—')

async function cargar() {
  cargando.value = true
  const res = await listarPropuestas({ soloPendientes: esAdmin.value })
  if (!res.success) { mensaje.value = res.error; mensajeOk.value = false }
  propuestas.value = res.data || []
  cargando.value = false
}

async function resolver(p, aprobar) {
  resolviendo.value = p.id
  const res = await resolverPropuesta(p.id, aprobar)
  resolviendo.value = null
  mensaje.value = res.success ? (aprobar ? 'Propuesta aprobada: el cambio ya aplica a toda la plataforma.' : 'Propuesta rechazada.') : res.error
  mensajeOk.value = res.success
  if (res.success) await cargar()
}

onMounted(cargar)
</script>

<style scoped>
.panel { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 1.25rem; }
.top { display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem; }
.titulo { font-size: 1.15rem; font-weight: 700; }
.desc { color: var(--color-muted); font-size: 0.9rem; margin: 0.25rem 0 1rem; }
.estado { color: var(--color-muted); text-align: center; padding: 1rem; }
.lista { list-style: none; padding: 0; display: flex; flex-direction: column; gap: 0.5rem; }
.lista li { display: flex; justify-content: space-between; align-items: center; gap: 0.75rem; flex-wrap: wrap; border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 0.65rem 0.75rem; font-size: 0.875rem; }
.lista small { display: block; color: var(--color-muted); font-size: 0.78rem; margin-top: 0.15rem; }
.acciones { display: flex; gap: 0.4rem; align-items: center; }
</style>
