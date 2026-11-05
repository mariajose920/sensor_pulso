<template>
  <section class="panel" data-testid="panel-sincronizacion">
    <h2 class="titulo">Método de sincronización de señales</h2>
    <p class="desc">
      Define cómo se alinean dos señales al compararlas.
      {{ esAdmin ? 'Tu cambio aplica a toda la plataforma.' : 'Tu propuesta la revisa el administrador; si la aprueba, cambia para todos.' }}
    </p>

    <div v-if="mensaje" class="alert" :class="mensajeOk ? 'alert-success' : 'alert-error'" role="status">{{ mensaje }}</div>
    <p v-if="cargando" class="estado">Cargando...</p>

    <form v-else @submit.prevent="enviar">
      <p class="vigente">Método vigente: <strong>{{ METODOS_SINCRONIZACION[vigente]?.nombre }}</strong></p>
      <label v-for="m in disponibles" :key="m" class="opcion">
        <input type="radio" name="metodo-sync" :value="m" v-model="elegido" />
        <span>
          <strong>{{ METODOS_SINCRONIZACION[m].nombre }}</strong>
          <small>{{ METODOS_SINCRONIZACION[m].descripcion }}</small>
        </span>
      </label>

      <div v-if="!esAdmin" class="form-group">
        <label class="form-label" for="sync-motivo">Motivo de la propuesta</label>
        <textarea id="sync-motivo" v-model="motivo" class="form-input" rows="2" maxlength="500"></textarea>
      </div>

      <button type="submit" class="btn btn-primary btn-sm" :disabled="guardando || elegido === vigente">
        {{ guardando ? 'Enviando...' : (esAdmin ? 'Guardar método' : 'Enviar propuesta') }}
      </button>
    </form>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import {
  obtenerMetodoSincronizacion, guardarMetodoSincronizacion, proponerMetodoSincronizacion
} from '../services/panelAdminService'
import { METODOS_SINCRONIZACION } from '../utils/panelAdmin.js'

const props = defineProps({
  modo: { type: String, default: 'profesor' },   // 'admin' | 'profesor'
  usuarioId: { type: String, default: '' }
})
const esAdmin = computed(() => props.modo === 'admin')

const cargando = ref(true)
const guardando = ref(false)
const vigente = ref('correlacion_cruzada')
const elegido = ref('correlacion_cruzada')
const disponibles = ref(Object.keys(METODOS_SINCRONIZACION))
const motivo = ref('')
const mensaje = ref('')
const mensajeOk = ref(true)

function avisar(texto, ok = true) {
  mensaje.value = texto
  mensajeOk.value = ok
}

async function cargar() {
  cargando.value = true
  const res = await obtenerMetodoSincronizacion()
  vigente.value = res.data.metodo
  elegido.value = res.data.metodo
  disponibles.value = res.data.disponibles
  cargando.value = false
}

async function enviar() {
  guardando.value = true
  const res = esAdmin.value
    ? await guardarMetodoSincronizacion(elegido.value, props.usuarioId)
    : await proponerMetodoSincronizacion({ profesorId: props.usuarioId, metodo: elegido.value, motivo: motivo.value })
  guardando.value = false
  if (!res.success) return avisar(res.error, false)
  avisar(esAdmin.value ? 'Método de sincronización actualizado.' : 'Propuesta enviada al administrador.')
  motivo.value = ''
  if (esAdmin.value) await cargar()
}

onMounted(cargar)
</script>

<style scoped>
.panel { background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0.5rem; padding: 1.25rem; }
.titulo { font-size: 1.15rem; font-weight: 700; }
.desc { color: var(--color-muted); font-size: 0.9rem; margin: 0.25rem 0 1rem; }
.estado { color: var(--color-muted); }
.vigente { font-size: 0.9rem; margin-bottom: 0.75rem; }
.opcion { display: flex; gap: 0.6rem; align-items: flex-start; padding: 0.6rem 0.75rem; margin-bottom: 0.5rem; border: 1px solid var(--color-border); border-radius: 0.5rem; cursor: pointer; }
.opcion small { display: block; color: var(--color-muted); font-size: 0.8rem; margin-top: 0.15rem; }
.form-group { margin: 0.75rem 0; }
</style>
