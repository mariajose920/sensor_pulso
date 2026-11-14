<template>
  <div class="publica-view">
    <p v-if="estado === 'cargando'" class="card" data-testid="publica-cargando">Cargando la medición…</p>

    <section v-else-if="estado !== 'ok'" class="card no-disponible" data-testid="publica-no-disponible">
      <h1 class="card-title">Este enlace no está disponible</h1>
      <p>{{ mensajeError }}</p>
      <router-link to="/galeria" class="btn btn-primary">Ver la galería</router-link>
    </section>

    <template v-else>
      <section class="card" data-testid="publica-medicion">
        <h1 class="card-title">{{ publicacion.titulo }}</h1>
        <p class="meta">
          Medición pública anónima · {{ publicacion.rangoEdad }} años · {{ publicacion.actividad }}
        </p>

        <div class="valores">
          <div class="valor">
            <b data-testid="publica-bpm">{{ publicacion.bpm == null ? '—' : publicacion.bpm.toFixed(1) }}</b>
            <span>BPM</span>
          </div>
          <div class="valor">
            <b>{{ publicacion.spo2 == null ? '—' : publicacion.spo2.toFixed(1) }}</b>
            <span>% SpO₂</span>
          </div>
          <span v-if="publicacion.dentroDeRango !== null" class="estado" :class="publicacion.dentroDeRango ? 'dentro' : 'fuera'">
            {{ publicacion.dentroDeRango ? 'Dentro del rango' : 'Fuera del rango' }}
          </span>
        </div>

        <p v-if="publicacion.ritmo || publicacion.calidad" class="meta">
          <span v-if="publicacion.calidad">Calidad de la señal: {{ publicacion.calidad }}</span>
          <span v-if="publicacion.calidad && publicacion.ritmo"> · </span>
          <span v-if="publicacion.ritmo">Ritmo: {{ publicacion.ritmo }}</span>
        </p>

        <h2 class="subtitulo">Forma de la onda de pulso (ilustrativa)</h2>
        <svg v-if="puntos" class="grafico" viewBox="0 0 600 120" preserveAspectRatio="none" role="img"
          aria-label="Onda de pulso ilustrativa según los BPM de la medición">
          <polyline :points="puntos" fill="none" stroke="#dc2626" stroke-width="2" />
        </svg>
        <p class="nota">La onda se dibuja a partir de los BPM promedio; no es la señal original de la persona.</p>

        <div class="acciones">
          <button type="button" class="btn btn-secondary" data-testid="publica-copiar" @click="copiar">
            Copiar enlace
          </button>
          <router-link to="/comparacion" class="btn btn-primary">Comparar con mi medición</router-link>
        </div>
        <p v-if="aviso" class="nota" role="status" data-testid="publica-aviso">{{ aviso }}</p>
      </section>

      <p class="aviso-educativo" role="note">{{ AVISO_REFERENCIA }}</p>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { AVISO_REFERENCIA } from '../data/avisoEducativo.js'
import { obtenerPublicacionPorToken } from '../services/compartirService.js'
import { construirEnlace, compartirEnlace } from '../utils/enlacePublico.js'
import { generarPuntosOndaMedicion } from '../data/galeriaPublica.js'

const route = useRoute()
const estado = ref('cargando') // 'cargando' | 'ok' | 'token_invalido' | 'no_disponible' | 'error'
const publicacion = ref(null)
const aviso = ref('')

const MENSAJES = {
  token_invalido: 'El enlace no es correcto. Revisa que esté completo.',
  no_disponible: 'La persona que lo publicó lo retiró o el enlace no existe.',
  error: 'No se pudo cargar la medición. Revisa tu conexión e inténtalo de nuevo.'
}
const mensajeError = computed(() => MENSAJES[estado.value] || MENSAJES.error)

const puntos = computed(() => {
  const bpm = publicacion.value?.bpm
  if (!Number.isFinite(bpm) || bpm <= 0) return ''
  const { ppg } = generarPuntosOndaMedicion({ bpm, duracionSegundos: 4, tasaMuestreo: 100 })
  const min = Math.min(...ppg)
  const rango = Math.max(...ppg) - min || 1
  return ppg
    .map((v, i) => `${((i / (ppg.length - 1)) * 600).toFixed(1)},${(114 - ((v - min) / rango) * 108).toFixed(1)}`)
    .join(' ')
})

async function copiar() {
  const url = construirEnlace(publicacion.value.token, window.location.origin)
  const r = await compartirEnlace({ url, titulo: publicacion.value.titulo })
  aviso.value = r === 'copiado' ? 'Enlace copiado.' : r === 'manual' ? `Copia este enlace: ${url}` : ''
}

// Los buscadores no deben indexar mediciones de personas
let metaRobots = null
onMounted(async () => {
  metaRobots = document.createElement('meta')
  metaRobots.name = 'robots'
  metaRobots.content = 'noindex, nofollow'
  document.head.appendChild(metaRobots)

  const r = await obtenerPublicacionPorToken(String(route.params.token || '').toLowerCase())
  if (r.ok) {
    publicacion.value = r.publicacion
    estado.value = 'ok'
  } else {
    estado.value = r.motivo
  }
})
onBeforeUnmount(() => metaRobots?.remove())
</script>

<style scoped>
.publica-view { max-width: 720px; margin: 0 auto; padding: 0.75rem 1rem 2rem; }
.meta { font-size: 0.85rem; color: #475569; margin: 0.25rem 0; }
.valores { display: flex; flex-wrap: wrap; gap: 0.75rem 1.5rem; align-items: baseline; margin: 1rem 0; }
.valor b { font-size: 2rem; margin-right: 0.3rem; }
.estado { font-size: 0.8rem; padding: 0.15rem 0.6rem; border-radius: 999px; }
.estado.dentro { background: #dcfce7; color: #166534; }
.estado.fuera { background: #fee2e2; color: #991b1b; }
.subtitulo { font-size: 1rem; margin: 1rem 0 0.35rem; }
.grafico { width: 100%; height: 120px; background: #f8fafc; border-radius: 4px; }
.nota { font-size: 0.8rem; color: #475569; }
.acciones { display: flex; flex-wrap: wrap; gap: 0.75rem; margin-top: 1rem; }
.aviso-educativo { background: #fef3c7; border-left: 4px solid #d97706; padding: 0.6rem 0.8rem; border-radius: 4px; font-size: 0.9rem; margin-top: 1rem; }
.no-disponible { text-align: center; }
</style>
