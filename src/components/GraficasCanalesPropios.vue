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
      <span class="ejemplo-punto" aria-hidden="true"></span>
      Los puntos sobre la curva marcan los picos sistólicos. Las métricas se calculan con los últimos {{ SEGUNDOS_VENTANA_GRAFICA }} s de señal.
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
            :points="d.trazado.polilinea"
            fill="none"
            :stroke="d.color"
            stroke-width="2"
            stroke-linejoin="round"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <!-- Puntos de los picos: HTML centrado (translate -50%) en el vértice exacto de la polilínea -->
        <div class="marcas" aria-hidden="true">
          <template v-for="d in datos" :key="'p' + d.canal">
            <template v-if="d.ajustes.picos">
              <span
                v-for="p in d.trazado.marcas"
                :key="d.canal + '-' + p.indice"
                class="punto-pico"
                data-testid="punto-pico"
                :style="{ left: p.xPct + '%', top: p.yPct + '%', '--c': d.color }"
              ></span>
            </template>
          </template>
        </div>
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
                <button type="button" class="btn-terminar" data-testid="reanudar-terminada" :aria-label="`Reanudar la medición del canal ${d.canal}`" @click="reanudarTerminada(d.canal)">Reanudar</button>
                <button type="button" class="btn-quitar" data-testid="medir-de-nuevo" :aria-label="`Medir de nuevo el canal ${d.canal}`" @click="medirDeNuevo(d.canal)">Medir de nuevo</button>
              </template>
              <button type="button" class="btn-quitar" :aria-label="`Quitar el canal ${d.canal}`" @click="emit('quitar', d.canal)">Quitar</button>
            </span>
          </div>
          <p v-if="d.terminada" class="estado-terminada" role="status">{{ d.textoEstado }}</p>
          <BarraHerramientasCanal
            :canal="d.canal" :color="d.color" :ajustes="d.ajustes" :pausada="d.pausada" :terminada="d.terminada"
            @pausar="alternarPausa(d.canal)" @capturar="capturar(d.canal)" @exportar="exportarCsv(d.canal)" @alternar="(k) => alternarFiltro(d.canal, k)"
          />
          <p class="leyenda-picos" :data-testid="'leyenda-picos-' + d.canal">{{ d.textoPicos }}</p>
          <GraficoSpo2Canal v-if="d.ajustes.spo2" :canal="d.canal" :spo2="d.spo2Hist" />
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
              <button type="button" class="btn-terminar" data-testid="reanudar-terminada" :aria-label="`Reanudar la medición del canal ${d.canal}`" @click="reanudarTerminada(d.canal)">Reanudar</button>
              <button type="button" class="btn-quitar" data-testid="medir-de-nuevo" :aria-label="`Medir de nuevo el canal ${d.canal}`" @click="medirDeNuevo(d.canal)">Medir de nuevo</button>
            </template>
            <button type="button" class="btn-quitar" :aria-label="`Quitar el canal ${d.canal}`" @click="emit('quitar', d.canal)">Quitar</button>
          </span>
        </figcaption>
        <p v-if="d.terminada" class="estado-terminada" role="status">{{ d.textoEstado }}</p>
        <BarraHerramientasCanal
          :canal="d.canal" :color="d.color" :ajustes="d.ajustes" :pausada="d.pausada" :terminada="d.terminada"
          @pausar="alternarPausa(d.canal)" @capturar="capturar(d.canal)" @exportar="exportarCsv(d.canal)" @alternar="(k) => alternarFiltro(d.canal, k)"
        />
        <div class="lienzo">
          <svg
            class="grafica"
            :viewBox="`0 0 ${ANCHO} ${ALTO_SEPARADA}`"
            preserveAspectRatio="none"
            role="img"
            :aria-label="`Señal del canal ${d.canal}${d.nombre ? ' de ' + d.nombre : ''}: ${d.resumen}`"
          >
            <polyline
              :points="d.trazado.polilinea"
              fill="none"
              :stroke="d.color"
              stroke-width="2"
              stroke-linejoin="round"
              vector-effect="non-scaling-stroke"
            />
          </svg>
          <div v-if="d.ajustes.picos" class="marcas" aria-hidden="true">
            <span
              v-for="p in d.trazado.marcas"
              :key="p.indice"
              class="punto-pico"
              data-testid="punto-pico"
              :style="{ left: p.xPct + '%', top: p.yPct + '%', '--c': d.color }"
            ></span>
          </div>
        </div>
        <p class="leyenda-picos" :data-testid="'leyenda-picos-' + d.canal">{{ d.textoPicos }}</p>
        <GraficoSpo2Canal v-if="d.ajustes.spo2" :canal="d.canal" :spo2="d.spo2Hist" />
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
import BarraHerramientasCanal from './BarraHerramientasCanal.vue'
import GraficoSpo2Canal from './GraficoSpo2Canal.vue'
import {
  ofreceElegirVista, vistaEfectiva, acumularMuestras, acumularSpo2, contarMuestrasValidas,
  resumenMetricas, SEGUNDOS_VENTANA_GRAFICA, serieMostrada, picosDeSerie, trazarSerie,
  debeAcumular, reanudarVentana, ajustesDe, alternarAjuste, leerAjustes, guardarAjustes
} from '../utils/graficasCanales.js'
import { descargarCsvCanal, descargarPngCanal } from '../utils/exportarCanal.js'
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
const ventanas = shallowRef(new Map()) // canal -> { ir, rojo, spo2, ultimoIr, inicio }
// Canales con la medición terminada: dejan de acumular y su gráfica queda fija.
// canal -> { fin, bpm, spo2, calidad, estado, mensaje, idCliente, registro }
const terminadas = ref({})
// Canales en pausa (en vivo): la gráfica se congela y no se acumulan muestras
const pausadas = ref({})
// Filtros por canal (picos / SpO₂ / filtro DSP): se recuerdan durante la sesión
const ajustes = ref(leerAjustes())
watch(
  () => props.graficables,
  (lista) => {
    const previo = ventanas.value
    const nuevo = new Map()
    for (const g of lista) {
      const v = previo.get(g.canal) || { ir: [], rojo: [], spo2: [], ultimoIr: null, inicio: null }
      if (terminadas.value[g.canal]) { nuevo.set(g.canal, v); continue } // terminada: no se acumula más
      if (!debeAcumular({ pausada: Boolean(pausadas.value[g.canal]) })) { nuevo.set(g.canal, v); continue } // en pausa
      const irNuevo = Array.isArray(g.ir) ? g.ir : g.muestras
      if (Array.isArray(irNuevo) && irNuevo !== v.ultimoIr) {
        v.ir = acumularMuestras(v.ir, irNuevo, maxMuestras.value)
        v.spo2 = acumularSpo2(v.spo2, contarMuestrasValidas(irNuevo), g.spo2, maxMuestras.value)
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
    // La serie que se dibuja (filtrada o cruda) es la MISMA con la que se detectan y se ubican los picos
    const aj = ajustesDe(ajustes.value, g.canal)
    const serie = serieMostrada(ir, hz.value, aj.dsp)
    const picos = picosDeSerie(serie, hz.value)
    const trazado = trazarSerie(serie, ANCHO, vista.value === 'juntas' ? ALTO : ALTO_SEPARADA, { picos })
    const textoPicos = aj.picos
      ? (picos.length ? `${picos.length} ${picos.length === 1 ? 'pico marcado' : 'picos marcados'} con un punto sobre la curva.` : 'Aún sin picos para marcar.')
      : 'Picos ocultos.'
    return {
      canal: g.canal,
      color: g.color,
      nombre: g.nombre,
      metricas,
      resumenTxt: r,
      ajustes: aj,
      pausada: Boolean(pausadas.value[g.canal]),
      ir,
      rojo: v?.rojo || [],
      spo2Hist: v?.spo2 || [],
      serie,
      picos,
      trazado,
      textoPicos,
      resumen: `frecuencia ${r.bpm}, variabilidad ${r.hrv}, ruido ${r.ruido}, ritmo ${r.ritmo}, SpO₂ ${r.spo2}, ${picos.length} picos sistólicos marcados`,
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
  nuevo.set(canal, { ir: [], rojo: [], spo2: [], ultimoIr: Array.isArray(g?.ir) ? g.ir : (g?.muestras ?? null), inicio: null })
  ventanas.value = nuevo
  quitarPausa(canal)
}

function paqueteActual(canal) {
  const g = props.graficables.find(x => x.canal === canal)
  return Array.isArray(g?.ir) ? g.ir : (g?.muestras ?? null)
}

// «Reanudar» tras «Terminar»: continúa en la MISMA ventana (no se descarta lo acumulado);
// lo que llegó mientras estaba terminada no se suma. Quita el estado terminado y la marca.
function reanudarTerminada(canal) {
  if (!terminadas.value[canal]) return
  const resto = { ...terminadas.value }
  delete resto[canal]
  terminadas.value = resto
  if (dialogoCanal.value === canal) dialogoCanal.value = null
  quitarPausa(canal)
  const v = ventanas.value.get(canal)
  if (v) {
    const nuevo = new Map(ventanas.value)
    nuevo.set(canal, reanudarVentana(v, paqueteActual(canal)))
    ventanas.value = nuevo
  }
}

// ───────────────────────── Pausar / reanudar en vivo ─────────────────────────
function quitarPausa(canal) {
  if (!pausadas.value[canal]) return
  const resto = { ...pausadas.value }
  delete resto[canal]
  pausadas.value = resto
}

function alternarPausa(canal) {
  if (terminadas.value[canal]) return
  if (pausadas.value[canal]) {
    quitarPausa(canal)
    const v = ventanas.value.get(canal)
    if (v) {
      const nuevo = new Map(ventanas.value)
      nuevo.set(canal, reanudarVentana(v, paqueteActual(canal))) // lo recibido durante la pausa no se muestra
      ventanas.value = nuevo
    }
  } else {
    pausadas.value = { ...pausadas.value, [canal]: true }
  }
}

// ───────────────────────── Filtros, captura y CSV ─────────────────────────
function alternarFiltro(canal, clave) {
  ajustes.value = alternarAjuste(ajustes.value, canal, clave)
  guardarAjustes(ajustes.value)
}

function capturar(canal) {
  const d = datos.value.find(x => x.canal === canal)
  if (!d) return
  descargarPngCanal({
    canal, nombre: d.nombre, color: d.color, serie: d.serie, picos: d.picos,
    mostrarPicos: d.ajustes.picos, spo2: d.spo2Hist, mostrarSpo2: d.ajustes.spo2,
    resumen: d.resumenTxt, dsp: d.ajustes.dsp
  })
}

function exportarCsv(canal) {
  const d = datos.value.find(x => x.canal === canal)
  if (!d) return
  descargarCsvCanal({
    canal, paciente: d.nombre, frecuenciaHz: hz.value, senalMostrada: d.serie, ir: d.ir, rojo: d.rojo,
    picos: d.picos, bpm: d.metricas.bpm, spo2: d.spo2Hist, dsp: d.ajustes.dsp
  })
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
.ejemplo-punto { width: 10px; height: 10px; box-sizing: border-box; border-radius: 50%; background: #94a3b8; border: 1.5px solid #fff; flex: none; }
.muestra-color { display: inline-block; width: 0.7rem; height: 0.7rem; border-radius: 50%; margin-right: 0.3rem; vertical-align: middle; flex: none; }

.lienzo { position: relative; margin-top: 0.4rem; background: #0b101a; border: 1px solid #1e293b; border-radius: 0.4rem; }
.grafica { width: 100%; display: block; }
.grafica.juntas { height: 220px; }
.separada .grafica { height: 110px; }
/* Capa de marcas: ocupa EXACTAMENTE el área del SVG (misma caja), así left/top en % coinciden con el viewBox */
.marcas { position: absolute; inset: 0; pointer-events: none; overflow: hidden; border-radius: 0.4rem; }
/* Punto de pico: círculo perfecto centrado en el vértice de la polilínea (cresta), relleno del color del canal y borde blanco fino */
.punto-pico { position: absolute; width: 10px; height: 10px; box-sizing: border-box; border-radius: 50%; transform: translate(-50%, -50%);
  background: var(--c); border: 1.5px solid #fff; box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.45); }
.leyenda-picos { margin: 0.3rem 0 0; font-size: 0.72rem; color: #94a3b8; }

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
