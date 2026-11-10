<template>
  <section class="card fuente-card" aria-labelledby="fuente-titulo">
    <h3 id="fuente-titulo" class="card-title">¿Cómo vas a medir?</h3>
    <p class="fuente-ayuda" id="fuente-ayuda">
      Elige cómo llegan los datos del ESP32 a la aplicación. Solo se usa una fuente a la vez.
    </p>

    <div class="fuente-opciones" role="radiogroup" aria-labelledby="fuente-titulo" aria-describedby="fuente-ayuda">
      <label class="fuente-opcion" :class="{ activa: fuente === 'wifi' }">
        <input
          type="radio"
          name="fuente-medicion"
          value="wifi"
          class="fuente-radio"
          :checked="fuente === 'wifi'"
          @change="elegir('wifi')"
        />
        <span class="fuente-opcion-texto">
          <strong>WiFi</strong>
          <small>El ESP32 envía los datos por la red. Úsalo si ya lo configuraste con tu red y token.</small>
        </span>
      </label>

      <label class="fuente-opcion" :class="{ activa: fuente === 'usb', deshabilitada: !usbState.soportado }">
        <input
          type="radio"
          name="fuente-medicion"
          value="usb"
          class="fuente-radio"
          :checked="fuente === 'usb'"
          :disabled="!usbState.soportado"
          aria-describedby="fuente-usb-aviso"
          @change="elegir('usb')"
        />
        <span class="fuente-opcion-texto">
          <strong>USB</strong>
          <small id="fuente-usb-aviso">
            <template v-if="usbState.soportado">El ESP32 conectado por cable al computador. Úsalo sin red o para hasta 5 sensores por cable.</template>
            <template v-else>{{ usbState.mensajeNoSoportado }}. La aplicación sigue funcionando por WiFi.</template>
          </small>
        </span>
      </label>
    </div>

    <!-- Sin elegir -->
    <p v-if="!fuenteElegida" class="fuente-pendiente" role="status">
      Elige WiFi o USB para empezar a recibir datos del sensor.
    </p>

    <!-- WiFi -->
    <div v-else-if="fuente === 'wifi'" class="fuente-detalle" aria-live="polite" data-testid="fuente-wifi">
      <div v-if="esp32State.conectado" class="estado-mensaje ok" role="status" data-testid="wifi-conectado">
        <strong>✓ WiFi conectado.</strong>
        {{ esp32State.dispositivo || 'El ESP32' }} está enviando datos. Ya puedes agregar los canales de medición.
      </div>
      <div v-else-if="wifiConfigurado" class="estado-mensaje info" role="status" data-testid="wifi-esperando-datos">
        <strong>ESP32 conectado a la red «{{ wifiConfigurado.ssid }}».</strong>
        Falta que envíe su primera medición a la plataforma; puede tardar unos segundos. Si no llega, revisa que tenga corriente
        y que el sensor esté conectado a la placa.
      </div>
      <div v-else class="estado-mensaje error" role="status" data-testid="wifi-sin-conexion">
        <strong>WiFi sin conexión.</strong>
        El ESP32 todavía no envió datos a la aplicación.
        <span data-testid="wifi-ayuda-primera-vez">Si es la primera vez, configura el WiFi del ESP32 con el botón de abajo.</span>
        <details class="ya-configurado">
          <summary class="btn-enlace" data-testid="wifi-ya-configurado">Ya está configurado: revisar que esté encendido y dentro del alcance del WiFi</summary>
          <p class="fuente-nota">Enciende el ESP32 con un cargador y acércalo al router. Si cambió la red o la clave, vuelve a configurarlo con el botón de abajo.</p>
        </details>
      </div>
      <div class="wifi-configurar">
        <button
          type="button"
          class="btn"
          :class="esp32State.conectado ? 'btn-secondary' : 'btn-primary'"
          :disabled="!usbState.soportado"
          :aria-describedby="usbState.soportado ? undefined : 'wifi-config-requisito'"
          data-testid="configurar-wifi-usb"
          @click="asistenteVisible = true"
        >
          Configurar WiFi del ESP32 por USB
        </button>
        <small v-if="!usbState.soportado" id="wifi-config-requisito" class="fuente-nota" data-testid="configurar-wifi-requisito">Requiere Chrome o Edge</small>
      </div>
      <dl class="metricas">
        <div><dt>Dispositivo</dt><dd>{{ esp32State.dispositivo || 'ESP32' }}</dd></div>
        <div><dt>IP</dt><dd>{{ esp32State.ip || 'No detectada' }}</dd></div>
        <div><dt>Señal (RSSI)</dt><dd>{{ esp32State.rssi ? `${esp32State.rssi} dBm` : 'N/A' }}</dd></div>
        <div>
          <dt>Último contacto</dt>
          <dd>{{ esp32State.tiempoTranscurridoSegundos !== null ? `${esp32State.tiempoTranscurridoSegundos} s` : 'Sin datos' }}</dd>
        </div>
      </dl>
    </div>

    <!-- USB -->
    <div v-else class="fuente-detalle" aria-live="polite" data-testid="fuente-usb">
      <div class="usb-acciones">
        <button
          v-if="!usbState.conectado"
          type="button"
          class="btn btn-primary"
          :disabled="usbState.conectando || !usbState.soportado"
          data-testid="conectar-usb"
          @click="conectar(false)"
        >
          {{ usbState.conectando ? 'Conectando…' : 'Conectar por USB' }}
        </button>
        <template v-else>
          <button type="button" class="btn btn-secondary" @click="desconectar">Desconectar</button>
          <button type="button" class="btn btn-secondary" :disabled="usbState.conectando" @click="cambiarPuerto">Elegir otro puerto</button>
        </template>
      </div>

      <div v-if="usbState.conectado" class="estado-mensaje ok" role="status" data-testid="usb-conectado">
        <strong>✓ USB conectado.</strong>
        Puerto {{ usbState.puerto || 'abierto' }}
        ({{ usbState.puertoAuto ? 'identificado automáticamente' : 'elegido por ti' }}).
      </div>
      <div v-else class="estado-mensaje error" role="status" data-testid="usb-sin-conexion">
        <strong>USB sin conectar.</strong>
        <template v-if="usbState.error"> {{ usbState.error }}</template>
        <ol class="pasos-ayuda">
          <li>Conecta el ESP32 al computador con un cable USB <em>de datos</em> (algunos cables solo cargan).</li>
          <li>Cierra el Monitor Serie del Arduino IDE si está abierto.</li>
          <li>Pulsa «Conectar por USB»: se detecta el puerto del ESP32 solo; si no aparece, usa «Elegir otro puerto».</li>
        </ol>
        <button type="button" class="btn-enlace" :disabled="usbState.conectando || !usbState.soportado" @click="conectar(true)">
          Elegir el puerto a mano
        </button>
      </div>

    </div>

    <ConfigurarWifiAsistente
      :visible="asistenteVisible"
      @cerrar="asistenteVisible = false"
      @configurado="alConfigurarWifi"
    />
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import ConfigurarWifiAsistente from './ConfigurarWifiAsistente.vue'
import {
  esp32State, usbState, fuenteElegida, seleccionarFuente, conectarUsb, desconectarUsb
} from '../services/esp32Service.js'

const emit = defineEmits(['fuente-cambiada', 'wifi-configurado'])

const asistenteVisible = ref(false)

// Última red que el asistente dejó configurada (solo en memoria): sirve para decir «conectado a la red, falta la
// primera medición» en vez de «sin conexión» mientras llegan los primeros datos
const wifiConfigurado = ref(null)

// El ESP32 quedó con WiFi y el asistente ya liberó el puerto; se avisa por si la vista quiere reaccionar
function alConfigurarWifi(datos) {
  wifiConfigurado.value = { ssid: datos?.ssid || '', ip: datos?.ip || '' }
  emit('wifi-configurado', datos)
}

const fuente = computed(() => esp32State.fuente)

function elegir(nueva) {
  const anterior = esp32State.fuente
  if (seleccionarFuente(nueva) && anterior !== nueva) emit('fuente-cambiada', nueva)
}

// Web Serial exige que la apertura del puerto salga de un clic del usuario
async function conectar(manual = false) {
  await conectarUsb({ manual })
}

// Cambiar de puerto: se cierra el actual y el navegador deja elegir cualquiera
async function cambiarPuerto() {
  await desconectarUsb()
  await conectarUsb({ manual: true })
}

async function desconectar() {
  await desconectarUsb()
}
</script>

<style scoped>
.fuente-card {
  background: var(--color-surface);
  border: 1px solid var(--color-border);
}

.fuente-ayuda {
  margin: 0 0 1rem;
  font-size: 0.9rem;
  color: var(--color-muted);
}

.fuente-opciones {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.fuente-opcion {
  display: flex;
  align-items: flex-start;
  gap: 0.6rem;
  padding: 0.75rem 0.9rem;
  border: 2px solid var(--color-border);
  border-radius: 0.6rem;
  cursor: pointer;
  background: var(--color-surface);
  transition: border-color 0.15s, background-color 0.15s;
}

.fuente-opcion:hover:not(.deshabilitada) {
  border-color: var(--color-primary);
}

.fuente-opcion.activa {
  border-color: var(--color-primary);
  background: #eff6ff;
}

.fuente-opcion.deshabilitada {
  cursor: not-allowed;
  opacity: 0.65;
  background: #f1f5f9;
}

.fuente-opcion:focus-within {
  outline: 2px solid var(--color-primary);
  outline-offset: 2px;
}

.fuente-radio {
  margin-top: 0.2rem;
  accent-color: var(--color-primary);
  flex-shrink: 0;
}

.fuente-opcion-texto {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  min-width: 0;
}

.fuente-opcion-texto small {
  color: var(--color-muted);
  font-size: 0.8rem;
  line-height: 1.35;
}

.fuente-pendiente {
  margin: 1rem 0 0;
  padding: 0.6rem 0.8rem;
  border-radius: 0.5rem;
  background: #fff7ed;
  border: 1px solid #fed7aa;
  color: #9a3412;
  font-size: 0.9rem;
}

.fuente-detalle {
  margin-top: 1rem;
  padding-top: 0.9rem;
  border-top: 1px solid var(--color-border);
}

.estado-linea {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.estado-texto {
  font-size: 0.9rem;
  color: var(--color-muted);
}

.punto {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  display: inline-block;
  flex-shrink: 0;
}
.punto.online { background: var(--color-success); box-shadow: 0 0 6px rgba(22, 163, 74, 0.6); }
.punto.offline { background: var(--color-warning); }

.usb-acciones {
  display: flex;
  align-items: center;
  gap: 0.9rem;
  flex-wrap: wrap;
}

.usb-error {
  margin: 0.75rem 0 0;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
  font-size: 0.85rem;
}

.estado-mensaje { padding: 0.65rem 0.85rem; border-radius: 0.5rem; font-size: 0.9rem; line-height: 1.45; margin-top: 0.75rem; }
.estado-mensaje.ok { background: #f0fdf4; border: 1px solid #86efac; color: #166534; }
.estado-mensaje.info { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e3a8a; }
.estado-mensaje.error { background: #fff7ed; border: 1px solid #fed7aa; color: #9a3412; }
.wifi-configurar { display: flex; align-items: center; gap: 0.75rem; flex-wrap: wrap; margin-top: 0.75rem; }
.ya-configurado { margin-top: 0.5rem; }
.ya-configurado summary { cursor: pointer; display: inline; }
.pasos-ayuda { margin: 0.4rem 0 0; padding-left: 1.2rem; }
.btn-enlace { background: none; border: 0; padding: 0; margin-top: 0.4rem; color: var(--color-primary); text-decoration: underline; cursor: pointer; font-size: 0.85rem; }
.fuente-nota {
  margin: 0.75rem 0 0;
  font-size: 0.8rem;
  color: var(--color-muted);
}

.metricas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: 0.75rem;
  margin: 0.9rem 0 0;
}

.metricas dt {
  font-size: 0.7rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  font-weight: 600;
  color: var(--color-muted);
}

.metricas dd {
  margin: 0;
  font-weight: 700;
  font-size: 1rem;
  color: var(--color-text);
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  overflow-wrap: anywhere;
}

@media (max-width: 560px) {
  .fuente-opciones { grid-template-columns: 1fr; }
  .usb-acciones .btn, .wifi-configurar .btn { width: 100%; }
}
</style>
