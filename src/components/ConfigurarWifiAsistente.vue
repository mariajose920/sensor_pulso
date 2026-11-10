<template>
  <div v-if="visible" class="modal-backdrop" @click.self="cerrarAsistente" @keydown="alTeclear">
    <div
      ref="dialogo"
      class="modal-container card"
      role="dialog"
      aria-modal="true"
      aria-labelledby="wifi-asistente-titulo"
      aria-describedby="wifi-asistente-sub"
      data-testid="configurar-wifi-asistente"
    >
      <div class="modal-header">
        <div>
          <h2 id="wifi-asistente-titulo" ref="titulo" class="modal-title" tabindex="-1">Configurar WiFi del ESP32 por USB</h2>
          <span id="wifi-asistente-sub" class="version-tag">Se hace una sola vez. Después el ESP32 se conecta solo.</span>
        </div>
        <button type="button" class="btn-close" aria-label="Cerrar el asistente" data-testid="wifi-cerrar" @click="cerrarAsistente">✕</button>
      </div>

      <ol class="pasos-wifi" aria-label="Pasos para configurar el WiFi">
        <li v-for="(nombre, i) in NOMBRES_PASOS" :key="nombre" :class="{ activo: i === indicePaso, hecho: i < indicePaso }" :aria-current="i === indicePaso ? 'step' : undefined">
          {{ i + 1 }}. {{ nombre }}
        </li>
      </ol>

      <!-- Anuncio para lectores de pantalla -->
      <p class="solo-lectores" role="status" aria-live="polite">{{ anuncio }}</p>

      <div class="modal-body">
        <!-- Sin Web Serial -->
        <div v-if="!usbState.soportado" class="alert alert-info" role="alert" data-testid="wifi-sin-webserial">
          <strong>Este navegador no puede configurar el ESP32 por cable.</strong>
          Abre esta página en Chrome o Edge. También puedes configurar el WiFi de otra forma
          (con ayuda de tu docente) o usar la fuente USB directa para medir sin red.
        </div>

        <!-- 1. Conectar -->
        <section v-else-if="estado.paso === 'conectar'" aria-labelledby="wifi-paso-conectar">
          <h3 id="wifi-paso-conectar" class="paso-titulo">Conecta el ESP32 al computador</h3>
          <ol class="pasos-ayuda">
            <li>Conecta el ESP32 con un cable USB <em>de datos</em> (algunos cables solo cargan).</li>
            <li>Cierra el Monitor Serie del Arduino IDE si está abierto.</li>
            <li>Pulsa el botón de abajo: se detecta el puerto del ESP32 solo.</li>
          </ol>
          <p v-if="usbState.conectado" class="hint" data-testid="wifi-puerto-compartido">
            Ya tienes el ESP32 conectado por USB: se usará ese mismo puerto y no se cerrará al terminar.
          </p>
          <p v-if="estado.error" class="alert alert-error" role="alert" data-testid="wifi-error">{{ estado.error }}</p>
          <p v-if="avisoPuerto" class="hint">{{ avisoPuerto }}</p>
          <div class="acciones">
            <button type="button" class="btn btn-secondary" :disabled="abriendo" data-testid="wifi-elegir-otro-puerto" @click="conectar(true)">Elegir otro puerto</button>
            <button type="button" class="btn btn-primary" :disabled="abriendo" data-autofocus data-testid="wifi-conectar-usb" @click="conectar(false)">
              {{ abriendo ? 'Conectando…' : (usbState.conectado ? 'Usar el puerto conectado' : 'Conectar el ESP32') }}
            </button>
          </div>
        </section>

        <!-- 2. Saludo / estado del ESP32 -->
        <section v-else-if="estado.paso === 'saludo'" aria-labelledby="wifi-paso-saludo">
          <h3 id="wifi-paso-saludo" class="paso-titulo">Tu ESP32</h3>
          <p v-if="!estado.info" class="cargando"><span class="spinner" aria-hidden="true"></span> Saludando al ESP32… puede tardar unos segundos.</p>
          <template v-else>
            <dl class="metricas" data-testid="wifi-info">
              <div><dt>Nombre</dt><dd>{{ estado.info.nombre }}</dd></div>
              <div><dt>Dirección MAC</dt><dd>{{ estado.info.mac || 'No disponible' }}</dd></div>
              <div><dt>WiFi</dt><dd>{{ textoEstadoWifi(estado.info.wifi) }}</dd></div>
              <div v-if="estado.info.ssid"><dt>Red guardada</dt><dd>{{ estado.info.ssid }}</dd></div>
              <div v-if="estado.info.ip"><dt>IP</dt><dd>{{ estado.info.ip }}</dd></div>
            </dl>
            <p v-if="estado.error" class="alert alert-error" role="alert">{{ estado.error }}</p>
            <div class="acciones">
              <button v-if="estado.info.wifi !== 'sin_credenciales'" type="button" class="btn btn-secondary" :disabled="estado.ocupado" data-testid="wifi-olvidar" @click="olvidar">
                Olvidar WiFi guardado
              </button>
              <button type="button" class="btn btn-primary" :disabled="estado.ocupado" data-autofocus data-testid="wifi-buscar-redes" @click="buscarRedes">
                Buscar redes WiFi
              </button>
            </div>
          </template>
        </section>

        <!-- 3. Redes -->
        <section v-else-if="estado.paso === 'redes'" aria-labelledby="wifi-paso-redes">
          <h3 id="wifi-paso-redes" class="paso-titulo">Elige la red WiFi</h3>
          <p v-if="estado.ocupado" class="cargando" data-autofocus tabindex="-1"><span class="spinner" aria-hidden="true"></span> Buscando redes… puede tardar unos segundos.</p>
          <template v-else>
            <p class="hint">Estas son las redes que ve el ESP32 (no las de tu computador). Solo funcionan las de 2,4 GHz.</p>
            <p v-if="estado.error" class="alert alert-error" role="alert" data-testid="wifi-error">{{ estado.error }}</p>
            <p v-if="!estado.redes.length" class="alert alert-info" role="status">No se encontró ninguna red. Acerca el ESP32 al router y pulsa «Buscar de nuevo», o escribe el nombre a mano.</p>
            <p v-if="hayEmpresa" class="alert alert-info" role="note" data-testid="wifi-aviso-empresa">{{ AVISO_RED_EMPRESA }}</p>
            <ul v-if="estado.redes.length" class="redes" aria-label="Redes WiFi disponibles">
              <li v-for="(r, i) in estado.redes" :key="r.ssid">
                <button
                  type="button"
                  class="red"
                  :disabled="!r.compatible"
                  :data-autofocus="i === 0 ? '' : undefined"
                  :data-testid="`wifi-red-${i}`"
                  @click="elegirRed(r)"
                >
                  <span class="red-nombre">{{ r.ssid }}</span>
                  <span class="red-detalle">
                    <span class="red-seg">{{ r.compatible ? textoSeguridad(r.seguridad) : 'No compatible' }}</span>
                    <span class="barras" role="img" :aria-label="`${nivelSenal(r.rssi).texto}`">
                      <i v-for="b in 4" :key="b" :class="{ on: b <= r.barras }" :style="{ height: `${b * 4 + 2}px` }"></i>
                    </span>
                  </span>
                </button>
              </li>
            </ul>

            <form class="manual" @submit.prevent="usarNombreManual">
              <label for="wifi-ssid-manual" class="campo-label">¿No aparece? Escribe el nombre de la red (por ejemplo, una red oculta)</label>
              <div class="fila-manual">
                <input id="wifi-ssid-manual" v-model="ssidManual" type="text" class="form-input" maxlength="64" autocomplete="off" autocapitalize="none" spellcheck="false" data-testid="wifi-ssid-manual" />
                <button type="submit" class="btn btn-secondary" :disabled="!ssidManual" data-testid="wifi-usar-manual">Usar este nombre</button>
              </div>
            </form>
            <div class="acciones">
              <button type="button" class="btn btn-secondary" @click="dispatch({ tipo: 'VOLVER' })">Volver</button>
              <button type="button" class="btn btn-secondary" data-testid="wifi-buscar-de-nuevo" @click="buscarRedes">Buscar de nuevo</button>
            </div>
          </template>
        </section>

        <!-- 4. Clave -->
        <section v-else-if="estado.paso === 'clave'" aria-labelledby="wifi-paso-clave">
          <h3 id="wifi-paso-clave" class="paso-titulo">Clave de «{{ estado.red?.ssid }}»</h3>
          <form @submit.prevent="enviar" autocomplete="off">
            <label for="wifi-clave" class="campo-label">Clave del WiFi</label>
            <div class="fila-manual">
              <input
                id="wifi-clave"
                v-model="clave"
                :type="mostrarClave ? 'text' : 'password'"
                class="form-input"
                maxlength="63"
                autocomplete="off"
                autocapitalize="none"
                autocorrect="off"
                spellcheck="false"
                aria-describedby="wifi-clave-ayuda"
                data-autofocus
                data-testid="wifi-clave"
              />
              <button type="button" class="btn btn-secondary" :aria-pressed="mostrarClave" data-testid="wifi-mostrar-clave" @click="mostrarClave = !mostrarClave">
                {{ mostrarClave ? 'Ocultar' : 'Mostrar' }}
              </button>
            </div>
            <p id="wifi-clave-ayuda" class="hint">
              <template v-if="estado.red?.seguridad === 'abierta'">Esta red no tiene clave: deja el campo vacío.</template>
              <template v-else-if="estado.red?.manual">Si la red no tiene clave, deja el campo vacío.</template>
              <template v-else>La clave no se guarda en el navegador: solo se envía al ESP32 por el cable.</template>
            </p>
            <p v-if="errorClave" class="alert alert-error" role="alert" data-testid="wifi-error">{{ errorClave }}</p>
            <div class="acciones">
              <button type="button" class="btn btn-secondary" @click="volverARedes">Volver</button>
              <button type="submit" class="btn btn-primary" data-testid="wifi-enviar">Conectar el ESP32 a esta red</button>
            </div>
          </form>
        </section>

        <!-- 5. Conectando -->
        <section v-else-if="estado.paso === 'conectando'" aria-labelledby="wifi-paso-conectando">
          <h3 id="wifi-paso-conectando" class="paso-titulo" tabindex="-1" data-autofocus>Conectando…</h3>
          <p class="cargando"><span class="spinner" aria-hidden="true"></span> El ESP32 se está conectando a «{{ estado.red?.ssid }}». No desconectes el cable.</p>
        </section>

        <!-- 6. Resultado -->
        <section v-else-if="estado.paso === 'resultado' && estado.resultado" aria-labelledby="wifi-paso-resultado">
          <template v-if="estado.resultado.ok">
            <h3 id="wifi-paso-resultado" class="paso-titulo ok" tabindex="-1" data-autofocus data-testid="wifi-resultado-ok">
              ✓ El ESP32 se conectó a la red {{ estado.resultado.ssid }}<template v-if="estado.resultado.ip"> (IP {{ estado.resultado.ip }})</template>
            </h3>
            <p class="alert alert-success" role="status">
              Ya puedes desconectar el cable y alimentar el ESP32 con un cargador; se conectará solo.
            </p>
            <p class="hint">
              La pantalla de Medición mostrará «WiFi conectado» cuando llegue su primera medición (unos segundos). Que la placa
              esté en la red no significa todavía que esté enviando datos.
            </p>
            <p class="hint">El puerto USB quedó libre para que lo uses con la fuente USB o el Monitor Serie.</p>
            <div class="acciones">
              <button type="button" class="btn btn-primary" data-testid="wifi-listo" @click="cerrarAsistente">Listo</button>
            </div>
          </template>
          <template v-else>
            <h3 id="wifi-paso-resultado" class="paso-titulo mal" tabindex="-1" data-autofocus data-testid="wifi-resultado-error">No se pudo conectar</h3>
            <p class="alert alert-error" role="alert">{{ estado.resultado.mensaje }}</p>
            <div class="acciones">
              <button type="button" class="btn btn-secondary" data-testid="wifi-otra-red" @click="otraRed">Elegir otra red</button>
              <button type="button" class="btn btn-primary" data-testid="wifi-reintentar" @click="reintentar">Reintentar</button>
            </div>
          </template>
        </section>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, watch, nextTick, onBeforeUnmount } from 'vue'
import {
  usbState, configUsbState, abrirPuertoConfiguracion, cerrarPuertoConfiguracion,
  escribirConfiguracion, suscribirEventosConfiguracion, alPerderPuertoConfiguracion
} from '../services/esp32Service.js'
import {
  estadoInicial, reducir, crearClienteProvision, codificarComando, nivelSenal, textoSeguridad,
  textoEstadoWifi, AVISO_RED_EMPRESA
} from '../utils/provisionWifi.js'

const props = defineProps({
  visible: { type: Boolean, default: false }
})
const emit = defineEmits(['cerrar', 'configurado'])

const NOMBRES_PASOS = ['Conectar', 'Dispositivo', 'Redes', 'Clave', 'Resultado']
const INDICE_PASO = { conectar: 0, saludo: 1, redes: 2, clave: 3, conectando: 4, resultado: 4 }

const estado = ref(estadoInicial())
// La clave vive SOLO aquí (memoria del componente): ni estado, ni logs, ni almacenamiento del navegador
const clave = ref('')
const mostrarClave = ref(false)
const ssidManual = ref('')
const errorClave = ref('')
const avisoPuerto = ref('')
const dialogo = ref(null)
const titulo = ref(null)

let cliente = null
let desuscribirPerdida = null
let elementoPrevio = null

const abriendo = computed(() => configUsbState.abriendo || usbState.conectando)
const indicePaso = computed(() => INDICE_PASO[estado.value.paso] ?? 0)
const hayEmpresa = computed(() => estado.value.redes.some((r) => !r.compatible))

const anuncio = computed(() => {
  const e = estado.value
  if (e.paso === 'conectando') return 'Conectando el ESP32 a la red WiFi.'
  if (e.paso === 'resultado' && e.resultado) return e.resultado.ok ? `Conectado a ${e.resultado.ssid}.` : e.resultado.mensaje
  if (e.paso === 'redes' && e.ocupado) return 'Buscando redes WiFi.'
  if (e.error) return e.error
  return `Paso ${indicePaso.value + 1} de ${NOMBRES_PASOS.length}: ${NOMBRES_PASOS[indicePaso.value]}.`
})

function dispatch(accion) {
  estado.value = reducir(estado.value, accion)
}

function limpiarSesion() {
  clave.value = ''
  mostrarClave.value = false
  ssidManual.value = ''
  errorClave.value = ''
  avisoPuerto.value = ''
  if (desuscribirPerdida) { desuscribirPerdida(); desuscribirPerdida = null }
  if (cliente) { cliente.destruir(); cliente = null }
}

async function liberarPuerto() {
  if (cliente) { cliente.destruir(); cliente = null }
  if (desuscribirPerdida) { desuscribirPerdida(); desuscribirPerdida = null }
  await cerrarPuertoConfiguracion()
}

// --- Acciones -------------------------------------------------------------

async function conectar(manual) {
  avisoPuerto.value = ''
  dispatch({ tipo: 'REINICIAR' })
  const res = await abrirPuertoConfiguracion({ manual })
  if (!res.ok) {
    if (res.cancelado) avisoPuerto.value = 'No se eligió ningún puerto. Si no ves tu ESP32 en la lista, revisa el cable y vuelve a intentar.'
    else dispatch({ tipo: 'FALLO', mensaje: res.error })
    return
  }
  if (!props.visible) { await liberarPuerto(); return } // se cerró el asistente mientras se elegía el puerto
  dispatch({ tipo: 'PUERTO_ABIERTO' })
  cliente = crearClienteProvision({ enviar: escribirConfiguracion, suscribir: suscribirEventosConfiguracion })
  desuscribirPerdida = alPerderPuertoConfiguracion((mensaje) => {
    if (cliente) { cliente.destruir(); cliente = null }
    clave.value = ''
    dispatch({ tipo: 'PUERTO_PERDIDO', mensaje: mensaje || 'Se perdió la conexión con el ESP32. Revisa el cable.' })
  })
  try {
    const ev = await cliente.hello()
    dispatch({ tipo: 'SALUDO', ev })
  } catch (err) {
    if (!cliente) return
    const mensaje = err?.message || 'El ESP32 no responde.'
    await liberarPuerto()
    dispatch({ tipo: 'REINICIAR' })
    dispatch({ tipo: 'FALLO', mensaje })
  }
}

async function buscarRedes() {
  if (!cliente) return
  dispatch({ tipo: 'ESCANEANDO' })
  try {
    dispatch({ tipo: 'REDES', redes: await cliente.escanear() })
  } catch (err) {
    if (cliente) dispatch({ tipo: 'FALLO', mensaje: err?.message || 'No se pudo buscar redes.' })
  }
}

async function olvidar() {
  if (!cliente) return
  estado.value = { ...estado.value, ocupado: true, error: '' }
  try {
    await cliente.olvidar()
    dispatch({ tipo: 'OLVIDADO' })
  } catch (err) {
    if (cliente) dispatch({ tipo: 'FALLO', mensaje: err?.message || 'No se pudo olvidar el WiFi.' })
  }
}

function elegirRed(r) {
  errorClave.value = ''
  clave.value = ''
  dispatch({ tipo: 'ELEGIR_RED', ssid: r.ssid, seguridad: r.seguridad })
}

function usarNombreManual() {
  errorClave.value = ''
  clave.value = ''
  dispatch({ tipo: 'ELEGIR_RED', ssid: ssidManual.value, seguridad: 'otra', manual: true })
}

function volverARedes() {
  clave.value = ''
  errorClave.value = ''
  dispatch({ tipo: 'VOLVER' })
}

async function enviar() {
  if (!cliente || !estado.value.red) return
  const { ssid, seguridad, manual } = estado.value.red
  const pass = clave.value
  errorClave.value = ''
  if (!manual && seguridad !== 'abierta' && pass.length < 8) {
    errorClave.value = 'La clave de una red con seguridad tiene al menos 8 caracteres.'
    return
  }
  try {
    codificarComando('wifi', { ssid, pass }) // solo valida (largo del nombre y de la clave)
  } catch (err) {
    errorClave.value = err.message
    return
  }
  dispatch({ tipo: 'ENVIAR' })
  try {
    const res = await cliente.configurarWifi(ssid, pass)
    if (res.ok) {
      dispatch({ tipo: 'WIFI_OK', ssid: res.ssid, ip: res.ip })
      await liberarPuerto() // el puerto queda libre para la fuente USB o el Monitor Serie
      emit('configurado', { ssid: res.ssid, ip: res.ip })
    } else {
      dispatch({ tipo: 'WIFI_ERROR', motivo: res.motivo })
    }
  } catch (err) {
    if (cliente) dispatch({ tipo: 'FALLO', mensaje: err?.message || 'No se pudo enviar la configuración.' })
  } finally {
    clave.value = '' // la clave no se conserva
    mostrarClave.value = false
  }
}

function reintentar() {
  clave.value = ''
  dispatch({ tipo: 'REINTENTAR' })
}

function otraRed() {
  clave.value = ''
  dispatch({ tipo: 'REINTENTAR' })
  dispatch({ tipo: 'VOLVER' })
}

async function cerrarAsistente() {
  limpiarSesion()
  await cerrarPuertoConfiguracion()
  dispatch({ tipo: 'REINICIAR' })
  emit('cerrar')
}

// --- Foco y teclado ----------------------------------------------------------

function enfocarPrimero() {
  const raiz = dialogo.value
  if (!raiz) return
  const destino = raiz.querySelector('[data-autofocus]') || titulo.value
  destino?.focus?.()
}

function alTeclear(ev) {
  if (ev.key === 'Escape') {
    ev.stopPropagation()
    cerrarAsistente()
    return
  }
  if (ev.key !== 'Tab' || !dialogo.value) return
  const focables = [...dialogo.value.querySelectorAll('button, input, a[href], [tabindex]:not([tabindex="-1"])')]
    .filter((el) => !el.disabled && el.offsetParent !== null)
  if (!focables.length) return
  const primero = focables[0]
  const ultimo = focables[focables.length - 1]
  if (ev.shiftKey && document.activeElement === primero) { ev.preventDefault(); ultimo.focus() }
  else if (!ev.shiftKey && document.activeElement === ultimo) { ev.preventDefault(); primero.focus() }
}

watch(() => props.visible, async (v) => {
  if (v) {
    elementoPrevio = typeof document !== 'undefined' ? document.activeElement : null
    estado.value = estadoInicial()
    limpiarSesion()
    await nextTick()
    enfocarPrimero()
  } else {
    limpiarSesion()
    await cerrarPuertoConfiguracion()
    elementoPrevio?.focus?.()
    elementoPrevio = null
  }
}, { immediate: true })

// Cada cambio de paso (o de fase de carga) lleva el foco al contenido nuevo
watch(() => [estado.value.paso, estado.value.ocupado, estado.value.info === null], async () => {
  if (!props.visible) return
  await nextTick()
  enfocarPrimero()
})

onBeforeUnmount(() => {
  limpiarSesion()
  cerrarPuertoConfiguracion()
})
</script>

<style scoped>
.modal-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.65);
  backdrop-filter: blur(4px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  padding: 1rem;
}
.modal-container {
  width: 100%;
  max-width: 640px;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  background: var(--color-surface);
  border-radius: 0.75rem;
  box-shadow: 0 20px 25px -5px rgba(0, 0, 0, 0.2), 0 10px 10px -5px rgba(0, 0, 0, 0.1);
  overflow: hidden;
  border: 1px solid #cbd5e1;
  padding: 0;
}
.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  padding: 1.1rem 1.5rem;
  border-bottom: 1px solid var(--color-border);
  background: #f8fafc;
}
.modal-title { font-size: 1.2rem; font-weight: 700; color: var(--color-text); margin: 0 0 0.2rem; }
.modal-title:focus { outline: none; }
.version-tag { font-size: 0.78rem; color: var(--color-muted); font-weight: 500; }
.btn-close { background: transparent; border: none; font-size: 1.2rem; color: var(--color-muted); cursor: pointer; padding: 0.25rem 0.5rem; line-height: 1; border-radius: 0.3rem; }
.btn-close:hover { color: var(--color-text); }
.btn-close:focus-visible, .red:focus-visible { outline: 2px solid var(--color-primary); outline-offset: 2px; }

.pasos-wifi { display: flex; gap: 0.4rem; flex-wrap: wrap; list-style: none; padding: 0.7rem 1.5rem; margin: 0; font-size: 0.78rem; border-bottom: 1px solid var(--color-border); }
.pasos-wifi li { padding: 0.2rem 0.65rem; border-radius: 9999px; border: 1px solid #cbd5e1; color: var(--color-muted); background: var(--color-surface); }
.pasos-wifi li.activo { background: var(--color-primary); border-color: var(--color-primary); color: #fff; font-weight: 600; }
.pasos-wifi li.hecho { background: #dbeafe; border-color: #bfdbfe; color: var(--color-primary); }

.solo-lectores { position: absolute; width: 1px; height: 1px; margin: -1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; border: 0; padding: 0; }

.modal-body { padding: 1.2rem 1.5rem 1.4rem; overflow-y: auto; flex: 1; color: var(--color-text); }
.paso-titulo { font-size: 1.05rem; margin: 0 0 0.7rem; }
.paso-titulo:focus { outline: none; }
.paso-titulo.ok { color: #166534; }
.paso-titulo.mal { color: #991b1b; }
.hint { font-size: 0.85rem; color: var(--color-muted); margin: 0.5rem 0; }
.campo-label { display: block; font-size: 0.875rem; font-weight: 600; margin-bottom: 0.35rem; }
.pasos-ayuda { margin: 0.4rem 0 0.8rem; padding-left: 1.2rem; font-size: 0.9rem; line-height: 1.5; }

.acciones { display: flex; justify-content: flex-end; gap: 0.75rem; margin-top: 1.1rem; padding-top: 0.9rem; border-top: 1px solid var(--color-border); flex-wrap: wrap; }
.alert { margin: 0.75rem 0 0; }

.metricas { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 0.75rem; margin: 0.5rem 0 0; }
.metricas dt { font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; font-weight: 600; color: var(--color-muted); }
.metricas dd { margin: 0; font-weight: 700; font-size: 0.95rem; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace; overflow-wrap: anywhere; }

.cargando { display: flex; align-items: center; gap: 0.6rem; font-size: 0.95rem; margin: 0.5rem 0; }
.spinner { width: 18px; height: 18px; border-radius: 50%; border: 3px solid #bfdbfe; border-top-color: var(--color-primary); animation: girar 0.9s linear infinite; flex-shrink: 0; }
@keyframes girar { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spinner { animation: none; border-top-color: #bfdbfe; } }

.redes { list-style: none; margin: 0.6rem 0 0; padding: 0; display: grid; gap: 0.4rem; max-height: 260px; overflow-y: auto; }
.red {
  width: 100%; display: flex; align-items: center; justify-content: space-between; gap: 0.75rem;
  padding: 0.6rem 0.85rem; text-align: left; font-size: 0.95rem;
  background: var(--color-surface); border: 1px solid var(--color-border); border-radius: 0.5rem; cursor: pointer; color: var(--color-text);
}
.red:hover:not(:disabled) { border-color: var(--color-primary); background: #eff6ff; }
.red:disabled { cursor: not-allowed; opacity: 0.6; background: #f1f5f9; }
.red-nombre { font-weight: 600; overflow-wrap: anywhere; }
.red-detalle { display: inline-flex; align-items: center; gap: 0.6rem; flex-shrink: 0; }
.red-seg { font-size: 0.75rem; color: var(--color-muted); }
.barras { display: inline-flex; align-items: flex-end; gap: 2px; height: 18px; }
.barras i { display: inline-block; width: 4px; background: #cbd5e1; border-radius: 1px; }
.barras i.on { background: var(--color-success); }

.manual { margin-top: 1rem; }
.fila-manual { display: flex; gap: 0.6rem; align-items: stretch; }
.fila-manual .form-input { flex: 1; min-width: 0; }

@media (max-width: 560px) {
  .modal-backdrop { padding: 0.5rem; }
  .modal-header, .pasos-wifi, .modal-body { padding-left: 1rem; padding-right: 1rem; }
  .acciones { flex-direction: column-reverse; }
  .acciones .btn { width: 100%; }
  .fila-manual { flex-direction: column; }
  .fila-manual .btn { width: 100%; }
}
</style>
