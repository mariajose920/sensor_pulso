<template>
  <section class="graficas-canales card" aria-labelledby="graficas-canales-titulo" data-testid="graficas-canales">
    <div class="graficas-header">
      <h3 id="graficas-canales-titulo" class="graficas-titulo">
        {{ graficables.length > 1 ? 'Gráficas de tus canales' : `Gráfica del Canal ${graficables[0]?.canal ?? ''}` }}
      </h3>

      <!-- Solo con 2 o más canales listos se puede elegir cómo verlos -->
      <div v-if="elegirVista" class="vista-toggle" role="group" aria-label="Cómo ver las gráficas">
        <button
          type="button"
          class="vista-btn"
          :class="{ activo: vista === 'separadas' }"
          :aria-pressed="vista === 'separadas'"
          data-testid="vista-separadas"
          @click="vistaElegida = 'separadas'"
        >Por separado</button>
        <button
          type="button"
          class="vista-btn"
          :class="{ activo: vista === 'juntas' }"
          :aria-pressed="vista === 'juntas'"
          data-testid="vista-juntas"
          @click="vistaElegida = 'juntas'"
        >Juntas</button>
      </div>
    </div>

    <p class="nota-picos">
      <span class="ejemplo-pico" aria-hidden="true"></span>
      Los triángulos marcan los picos sistólicos detectados. Las métricas se calculan con los últimos {{ SEGUNDOS_VENTANA_GRAFICA }} s de señal.
    </p>

    <!-- Juntas: una sola gráfica, una curva de color por canal -->
    <template v-if="vista === 'juntas'">
      <div class="lienzo" data-testid="grafica-juntas">
        <svg
          class="grafica juntas"
          :viewBox="`0 0 ${ANCHO} ${ALTO}`"
          preserveAspectRatio="none"
          role="img"
          :aria-label="`Señales de ${datos.length} canales superpuestas, una curva de color por canal, con sus picos sistólicos marcados`"
        >
          <polyline
            v-for="d in datos"
            :key="d.canal"
            :points="d.puntosJuntas"
            fill="none"
            :stroke="d.color"
            stroke-width="2"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <template v-for="d in datos" :key="'p' + d.canal">
          <span
            v-for="p in d.marcasJuntas"
            :key="d.canal + '-' + p.indice"
            class="pico"
            :style="{ left: p.x + '%', top: p.y + '%', '--c': d.color }"
            aria-hidden="true"
          ></span>
        </template>
      </div>

      <!-- Leyenda con color + nombre + métricas de cada canal (no depende solo del color) -->
      <ul class="leyenda" aria-label="Leyenda: color y métricas de cada canal">
        <li v-for="d in datos" :key="d.canal" class="leyenda-item" :style="{ '--c': d.color }" data-testid="leyenda-canal">
          <div class="leyenda-nombre">
            <span class="muestra-color" :style="{ background: d.color }"></span>
            <strong>Canal {{ d.canal }}</strong><template v-if="d.nombre"> · {{ d.nombre }}</template>
            <span v-if="d.terminada" class="etiqueta-terminada" data-testid="medicion-terminada">Medición terminada</span>
            <span class="acciones-canal">
              <button v-if="!d.terminada" type="button" class="btn-terminar" data-testid="terminar-canal" :aria-label="`Terminar la medición del canal ${d.canal}`" @click="terminarCanal(d.canal)">Terminar</button>
              <template v-else>
                <button v-if="!d.estado" type="button" class="btn-terminar" data-testid="decidir-guardar" @click="abrirDialogo(d.canal)">¿Guardar?</button>
                <button type="button" class="btn-quitar" data-testid="medir-de-nuevo" :aria-label="`Medir de nuevo el canal ${d.canal}`" @click="medirDeNuevo(d.canal)">Medir de nuevo</button>
              </template>
              <button type="button" class="btn-quitar" :aria-label="`Quitar el canal ${d.canal}`" @click="emit('quitar', d.canal)">Quitar</button>
            </span>
          </div>
          <p v-if="d.terminada" class="estado-terminada" role="status">{{ d.textoEstado }}</p>
          <MetricasCanalPanel :metricas="d.metricas" compacto />
        </li>
      </ul>
    </template>

    <!-- Por separado (o canal único): un gráfico por canal con sus métricas -->
    <div v-else class="separadas">
      <figure v-for="d in datos" :key="d.canal" class="separada" :style="{ '--c': d.color }" data-testid="grafica-canal">
        <figcaption>
          <span class="muestra-color" :style="{ background: d.color }"></span>
          <strong>Canal {{ d.canal }}</strong><template v-if="d.nombre"> · {{ d.nombre }}</template>
          <span v-if="d.terminada" class="etiqueta-terminada" data-testid="medicion-terminada">Medición terminada</span>
          <span class="acciones-canal">
            <button v-if="!d.terminada" type="button" class="btn-terminar" data-testid="terminar-canal" :aria-label="`Terminar la medición del canal ${d.canal}`" @click="terminarCanal(d.canal)">Terminar</button>
            <template v-else>
              <button v-if="!d.estado" type="button" class="btn-terminar" data-testid="decidir-guardar" @click="abrirDialogo(d.canal)">¿Guardar?</button>
              <button type="button" class="btn-quitar" data-testid="medir-de-nuevo" :aria-label="`Medir de nuevo el canal ${d.canal}`" @click="medirDeNuevo(d.canal)">Medir de nuevo</button>
            </template>
            <button type="button" class="btn-quitar" :aria-label="`Quitar el canal ${d.canal}`" @click="emit('quitar', d.canal)">Quitar</button>
          </span>
        </figcaption>
        <p v-if="d.terminada" class="estado-terminada" role="status">{{ d.textoEstado }}</p>
        <div class="lienzo">
          <svg
            class="grafica"
            :viewBox="`0 0 ${ANCHO} ${ALTO_SEPARADA}`"
            preserveAspectRatio="none"
            role="img"
            :aria-label="`Señal del canal ${d.canal}${d.nombre ? ' de ' + d.nombre : ''}: ${d.resumen}`"
          >
            <polyline
              :points="d.puntosSeparada"
              fill="none"
              :stroke="d.color"
              stroke-width="2"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <span
            v-for="p in d.marcasSeparada"
            :key="p.indice"
            class="pico"
            :style="{ left: p.x + '%', top: p.y + '%', '--c': d.color }"
            aria-hidden="true"
          ></span>
        </div>
        <MetricasCanalPanel :metricas="d.metricas" />
      </figure>
    </div>

    <!-- Diálogo al terminar: ¿guardar? y, con permiso, ¿publicar? -->
    <Teleport to="body">
      <TerminarMedicionModal
        v-if="dialogoRegistro"
        :registro="dialogoRegistro"
        :sesion-id="sesionId"
        @resultado="alResultado"
        @cerrar="cerrarDialogo"
      />
    </Teleport>

    <p v-if="sinSenal" class="sin-senal">Esperando señal de los canales…</p>
    <p v-else-if="calculando" class="sin-senal">Reuniendo señal para calcular variabilidad, ritmo y picos (se necesitan unos {{ SEGUNDOS_MINIMOS }} s)…</p>
  </section>
</template>

<script setup>
import { computed, ref, shallowRef, watch } from 'vue'
import MetricasCanalPanel from './MetricasCanalPanel.vue'
import TerminarMedicionModal from './TerminarMedicionModal.vue'
import {
  puntosPolilinea, ofreceElegirVista, vistaEfectiva, acumularMuestras, posicionesPicos,
  resumenMetricas, SEGUNDOS_VENTANA_GRAFICA
} from '../utils/graficasCanales.js'
import { calcularMetricasCanal, PARAMETROS_METRICAS } from '../utils/metricasCanal.js'
import { armarRegistroTerminado, estadoParaTarjeta } from '../utils/terminarMedicion.js'

// «Quitar» libera el canal de ese paciente (lo gestiona la vista)
const emit = defineEmits(['quitar', 'terminada'])

const props = defineProps({
  /** [{ canal, color, nombre, muestras, ir, rojo, bpm, spo2, calidad }] de utils/graficasCanales.canalesGraficables */
  graficables: { type: Array, required: true },
  /** Frecuencia de muestreo del sensor (esp32State.frecuenciaHz) */
  frecuenciaHz: { type: Number, default: 50 },
  /** Id de la sesión de medición (si no es un uuid de la base, es de demostración y no se puede guardar) */
  sesionId: { type: String, default: null },
  /** 'sensor' | 'simulador': solo las mediciones del sensor se pueden publicar */
  fuente: { type: String, default: 'sensor' },
  /** (canal) => { nombre, edad, actividad, declaracionId, consentimientoPropio } con la ficha DEL CANAL */
  pacienteDe: { type: Function, default: () => ({}) }
})

const ANCHO = 600
const ALTO = 220
const ALTO_SEPARADA = 110
const SEGUNDOS_MINIMOS = PARAMETROS_METRICAS.segundosMinimos

const vistaElegida = ref('separadas')
const elegirVista = computed(() => ofreceElegirVista(props.graficables))
const vista = computed(() => vistaEfectiva(props.graficables, vistaElegida.value))

const hz = computed(() => (Number.isFinite(props.frecuenciaHz) && props.frecuenciaHz > 0 ? props.frecuenciaHz : 50))
const maxMuestras = computed(() => Math.round(SEGUNDOS_VENTANA_GRAFICA * hz.value))

// Cada paquete del sensor trae ~0,5 s: se acumulan por canal para tener una ventana útil.
// Solo se agrega cuando llega un arreglo nuevo (paquete nuevo), no en cada render.
const ventanas = shallowRef(new Map()) // canal -> { ir, rojo, ultimoIr, inicio }
// Canales con la medición terminada: dejan de acumular y su gráfica queda fija.
// canal -> { fin, bpm, spo2, calidad, estado, mensaje, idCliente, registro }
const terminadas = ref({})
watch(
  () => props.graficables,
  (lista) => {
    const previo = ventanas.value
    const nuevo = new Map()
    for (const g of lista) {
      const v = previo.get(g.canal) || { ir: [], rojo: [], ultimoIr: null, inicio: null }
      if (terminadas.value[g.canal]) { nuevo.set(g.canal, v); continue } // terminada: no se acumula más
      const irNuevo = Array.isArray(g.ir) ? g.ir : g.muestras
      if (Array.isArray(irNuevo) && irNuevo !== v.ultimoIr) {
        v.ir = acumularMuestras(v.ir, irNuevo, maxMuestras.value)
        v.rojo = acumularMuestras(v.rojo, g.rojo, maxMuestras.value)
        v.ultimoIr = irNuevo
        if (v.inicio === null && v.ir.length) v.inicio = Date.now()
      }
      nuevo.set(g.canal, v)
    }
    ventanas.value = nuevo // los canales que ya no se grafican se descartan
  },
  { immediate: true }
)

// Métricas y geometría: se recalculan solo cuando llegan datos (computed), no en cada frame.
const datos = computed(() =>
  props.graficables.map((g) => {
    const v = ventanas.value.get(g.canal)
    const ir = v?.ir || []
    const t = terminadas.value[g.canal]
    const metricas = calcularMetricasCanal({
      ir, rojo: v?.rojo, frecuenciaHz: hz.value,
      bpmDispositivo: t ? t.bpm : g.bpm, spo2Dispositivo: t ? t.spo2 : g.spo2
    })
    const r = resumenMetricas(metricas)
    return {
      canal: g.canal,
      color: g.color,
      nombre: g.nombre,
      metricas,
      puntosJuntas: puntosPolilinea(ir, ANCHO, ALTO),
      puntosSeparada: puntosPolilinea(ir, ANCHO, ALTO_SEPARADA),
      marcasJuntas: posicionesPicos(ir, metricas.picos, { alto: ALTO }),
      marcasSeparada: posicionesPicos(ir, metricas.picos, { alto: ALTO_SEPARADA }),
      resumen: `frecuencia ${r.bpm}, variabilidad ${r.hrv}, ruido ${r.ruido}, ritmo ${r.ritmo}, SpO₂ ${r.spo2}, ${r.picos} picos sistólicos`,
      muestras: ir.length,
      terminada: Boolean(t),
      estado: t?.estado || null,
      textoEstado: t ? `${estadoParaTarjeta(t.estado)}.` : ''
    }
  })
)

// ───────────── Terminar la medición de un canal ─────────────
const dialogoCanal = ref(null) // canal con el diálogo abierto
const dialogoRegistro = computed(() => {
  const canal = dialogoCanal.value
  return canal !== null ? (terminadas.value[canal]?.registro || null) : null
})

function armarRegistro(canal) {
  const g = props.graficables.find(x => x.canal === canal)
  const t = terminadas.value[canal]
  const v = ventanas.value.get(canal)
  const metricas = calcularMetricasCanal({
    ir: v?.ir || [], rojo: v?.rojo, frecuenciaHz: hz.value, bpmDispositivo: t.bpm, spo2Dispositivo: t.spo2
  })
  const paciente = props.pacienteDe(canal) || {}
  return armarRegistroTerminado({
    canal,
    paciente: { ...paciente, nombre: paciente.nombre || g?.nombre || '' },
    metricas,
    calidadDispositivo: t.calidad,
    fuente: props.fuente,
    sesionId: props.sesionId,
    inicio: v?.inicio ?? t.fin,
    fin: t.fin,
    idCliente: t.idCliente
  })
}

function nuevoId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16)
  })
}

// «Terminar»: congela la gráfica del canal con lo recibido hasta ahora y abre el diálogo
function terminarCanal(canal) {
  const g = props.graficables.find(x => x.canal === canal)
  if (!g || terminadas.value[canal]) return
  terminadas.value = {
    ...terminadas.value,
    [canal]: { fin: Date.now(), bpm: g.bpm, spo2: g.spo2, calidad: g.calidad, estado: null, idCliente: nuevoId(), registro: null }
  }
  abrirDialogo(canal)
}

function abrirDialogo(canal) {
  const t = terminadas.value[canal]
  if (!t) return
  terminadas.value = { ...terminadas.value, [canal]: { ...t, registro: armarRegistro(canal) } }
  dialogoCanal.value = canal
}

function cerrarDialogo() {
  const canal = dialogoCanal.value
  dialogoCanal.value = null
  if (canal !== null && terminadas.value[canal]) {
    terminadas.value = { ...terminadas.value, [canal]: { ...terminadas.value[canal], registro: null } }
  }
}

function alResultado({ estado, mensaje }) {
  const canal = dialogoCanal.value
  if (canal === null || !terminadas.value[canal]) return
  // El registro se conserva hasta cerrar el diálogo (aún se está mostrando el resultado)
  terminadas.value = { ...terminadas.value, [canal]: { ...terminadas.value[canal], estado, mensaje } }
  emit('terminada', { canal, estado })
}

// «Medir de nuevo»: se descarta lo acumulado de ese canal y vuelve a graficarse en vivo
function medirDeNuevo(canal) {
  const g = props.graficables.find(x => x.canal === canal)
  const resto = { ...terminadas.value }
  delete resto[canal]
  terminadas.value = resto
  const nuevo = new Map(ventanas.value)
  // ultimoIr = paquete actual: así no se vuelve a sumar lo que ya estaba en pantalla
  nuevo.set(canal, { ir: [], rojo: [], ultimoIr: Array.isArray(g?.ir) ? g.ir : (g?.muestras ?? null), inicio: null })
  ventanas.value = nuevo
}

const sinSenal = computed(() => datos.value.every(d => d.muestras < 2))
const calculando = computed(() => datos.value.some(d => !d.metricas.muestrasValidas))
</script>

<style scoped>
.graficas-canales { margin-bottom: 1.5rem; padding: 1rem; background: #080c14; color: #f1f5f9; border: 1px solid #1e293b; border-radius: 0.75rem; }
.graficas-header { display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 0.75rem; }
.graficas-titulo { margin: 0; font-size: 1rem; }
.vista-toggle { display: inline-flex; border: 1px solid #334155; border-radius: 0.4rem; overflow: hidden; }
.vista-btn { background: #1e293b; color: #cbd5e1; border: 0; padding: 0.4rem 0.9rem; font-size: 0.8rem; font-weight: 600; cursor: pointer; }
.vista-btn.activo { background: #0369a1; color: #fff; }
.vista-btn:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
.nota-picos { display: flex; align-items: center; gap: 0.4rem; margin: 0.6rem 0 0; font-size: 0.75rem; color: #94a3b8; }
.ejemplo-pico { width: 0; height: 0; border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 8px solid #e2e8f0; flex: none; }
.muestra-color { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 50%; margin-right: 0.3rem; vertical-align: middle; flex: none; }

.lienzo { position: relative; margin-top: 0.4rem; }
.grafica { width: 100%; display: block; background: #0b101a; border: 1px solid #1e293b; border-radius: 0.4rem; }
.grafica.juntas { height: 220px; }
.separada .grafica { height: 110px; }
/* Marcador de pico sistólico: triángulo hacia abajo, justo sobre la cresta, del color del canal */
.pico { position: absolute; width: 0; height: 0; transform: translate(-50%, -115%); pointer-events: none;
  border-left: 5px solid transparent; border-right: 5px solid transparent; border-top: 9px solid var(--c); filter: drop-shadow(0 0 1px #000); }

.separadas { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: 1rem; margin-top: 0.75rem; }
.separada { margin: 0; padding: 0.6rem; border: 1px solid #1e293b; border-left: 4px solid var(--c); border-radius: 0.5rem; background: #0b101a; min-width: 0; }
.acciones-canal { display: inline-flex; flex-wrap: wrap; gap: 0.4rem; margin-left: 0.6rem; vertical-align: middle; }
.acciones-canal .btn-quitar, .acciones-canal .btn-terminar { margin-left: 0; }
.btn-terminar { background: #0369a1; border: 1px solid #0ea5e9; color: #fff; border-radius: 0.35rem; padding: 0.1rem 0.7rem; font-size: 0.75rem; font-weight: 600; cursor: pointer; }
.btn-terminar:hover { background: #0284c7; }
.btn-terminar:focus-visible, .btn-quitar:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
.etiqueta-terminada { margin-left: 0.6rem; padding: 0.05rem 0.55rem; border-radius: 9999px; background: #1e293b; border: 1px solid #64748b; color: #e2e8f0; font-size: 0.72rem; font-weight: 600; }
.estado-terminada { margin: 0.35rem 0 0; font-size: 0.78rem; color: #94a3b8; }
.btn-quitar { margin-left: 0.6rem; background: transparent; border: 1px solid #475569; color: #cbd5e1; border-radius: 0.35rem; padding: 0.1rem 0.5rem; font-size: 0.75rem; cursor: pointer; }
.btn-quitar:hover { background: #1e293b; color: #fff; }
.separada figcaption { font-size: 0.85rem; color: #e2e8f0; }

.leyenda { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 22rem), 1fr)); gap: 0.75rem; list-style: none; padding: 0; margin: 0.75rem 0 0; }
.leyenda-item { padding: 0.5rem 0.6rem; border: 1px solid #1e293b; border-left: 4px solid var(--c); border-radius: 0.5rem; background: #0b101a; min-width: 0; }
.leyenda-nombre { font-size: 0.85rem; color: #e2e8f0; }
.sin-senal { margin: 0.75rem 0 0; font-size: 0.8rem; color: #94a3b8; }
@media (max-width: 600px) {
  .acciones-canal { display: flex; width: 100%; margin: 0.5rem 0 0; }
  .acciones-canal .btn-terminar, .acciones-canal .btn-quitar { flex: 1 1 100%; min-height: 2.5rem; font-size: 0.85rem; }
  .etiqueta-terminada { display: inline-block; margin: 0.3rem 0 0; }
}
</style>
