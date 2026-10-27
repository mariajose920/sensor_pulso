<template>
  <div class="estado-pwa">
    <!-- Sin conexión: la app abre, pero algunas funciones necesitan internet -->
    <div v-if="!enLinea" class="aviso aviso-sin-conexion" role="status">
      <strong>Sin conexión.</strong>
      Puedes ver lo que ya está guardado. La medición, el acceso y la base de datos necesitan internet.
    </div>

    <!-- Android y computador: botón propio de instalación -->
    <div v-if="mostrarBoton" class="aviso aviso-instalar" role="region" aria-label="Instalar la aplicación">
      <p class="aviso-texto"><strong>Instala sensor_pulso</strong> en tu dispositivo para abrirla como una app, incluso sin internet.</p>
      <div class="aviso-acciones">
        <button type="button" class="btn btn-primary" @click="instalar">Instalar app</button>
        <button type="button" class="btn btn-secondary" @click="ocultar">Ahora no</button>
      </div>
    </div>

    <!-- iPhone y iPad: no existe el botón, se explican los pasos -->
    <div v-if="mostrarGuiaIos" class="aviso aviso-instalar" role="region" aria-label="Cómo instalar en iPhone">
      <p class="aviso-texto">
        <strong>Instala sensor_pulso en tu iPhone:</strong>
        toca <strong>Compartir</strong> (el cuadrado con una flecha hacia arriba) y luego
        <strong>Añadir a pantalla de inicio</strong>.
      </p>
      <div class="aviso-acciones">
        <button type="button" class="btn btn-secondary" @click="ocultar">Entendido</button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue'
import { useOnline } from '../composables/useOnline.js'

const CLAVE = 'pwa-instalacion-oculta'
const DIAS_OCULTA = 14

const enLinea = useOnline()
const eventoInstalacion = ref(null)
const instalada = ref(false)
const oculta = ref(false)
const esIos = ref(false)

function estaOculta() {
  try {
    const hasta = Number(localStorage.getItem(CLAVE) || 0)
    return Date.now() < hasta
  } catch { return false }
}

function yaEsApp() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true
}

function alPreguntarInstalacion(e) {
  e.preventDefault()               // se guarda para ofrecerla con nuestro botón
  eventoInstalacion.value = e
}
function alInstalarse() {
  instalada.value = true
  eventoInstalacion.value = null
}

onMounted(() => {
  const ua = navigator.userAgent
  esIos.value = /iphone|ipad|ipod/i.test(ua) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  instalada.value = yaEsApp()
  oculta.value = estaOculta()
  window.addEventListener('beforeinstallprompt', alPreguntarInstalacion)
  window.addEventListener('appinstalled', alInstalarse)
})
onUnmounted(() => {
  window.removeEventListener('beforeinstallprompt', alPreguntarInstalacion)
  window.removeEventListener('appinstalled', alInstalarse)
})

const mostrarBoton = computed(() => !!eventoInstalacion.value && !instalada.value && !oculta.value)
const mostrarGuiaIos = computed(() => esIos.value && !instalada.value && !oculta.value)

async function instalar() {
  const evento = eventoInstalacion.value
  if (!evento) return
  evento.prompt()
  await evento.userChoice
  eventoInstalacion.value = null
}

function ocultar() {
  oculta.value = true
  try { localStorage.setItem(CLAVE, String(Date.now() + DIAS_OCULTA * 24 * 60 * 60 * 1000)) } catch { /* solo se oculta ahora */ }
}
</script>

<style scoped>
.estado-pwa { display: flex; flex-direction: column; }
.aviso {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem 1rem;
  flex-wrap: wrap;
  padding: 0.65rem max(1rem, env(safe-area-inset-left));
  font-size: 0.9rem;
}
.aviso-sin-conexion { background: #fef3c7; color: #92400e; border-bottom: 1px solid #fde68a; justify-content: center; text-align: center; }
.aviso-instalar { background: #eff6ff; color: #1e40af; border-bottom: 1px solid #bfdbfe; }
.aviso-texto { flex: 1; min-width: 14rem; margin: 0; }
.aviso-acciones { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.aviso-acciones .btn { min-height: 44px; }
</style>
