<template>
  <section class="panel-evolucion" data-testid="panel-evolucion-personal">
    <!-- Encabezado y controles de contexto fisiológico -->
    <div class="evolucion-header-card">
      <div class="evolucion-title-block">
        <span class="evolucion-kicker">Seguimiento Fisiológico Personal</span>
        <h2 class="evolucion-title">Tendencia de BPM en Reposo por Días</h2>
        <p class="evolucion-subtitle">
          Evolución diaria calculada exclusivamente a partir de tus propias mediciones registradas,
          comparada con la banda del rango esperado según tu edad y actividad.
        </p>
      </div>

      <div class="evolucion-controles">
        <div class="control-grupo">
          <label for="select-actividad-evolucion" class="control-label">Actividad evaluada</label>
          <select
            id="select-actividad-evolucion"
            v-model="actividadSeleccionadaCodigo"
            class="control-select"
            data-testid="select-actividad-evolucion"
            @change="recargarDatos"
          >
            <option
              v-for="act in actividadesDisponibles"
              :key="act.codigo"
              :value="act.codigo"
            >
              {{ act.nombre }}
            </option>
          </select>
        </div>

        <div class="control-grupo">
          <label for="input-edad-evolucion" class="control-label">Edad de referencia (años)</label>
          <input
            id="input-edad-evolucion"
            v-model.number="edadReferenciaInput"
            type="number"
            min="1"
            max="115"
            class="control-input"
            data-testid="input-edad-evolucion"
            @change="recargarDatos"
          />
        </div>

        <button
          type="button"
          class="btn-actualizar-evolucion"
          :disabled="cargando"
          @click="recargarDatos"
        >
          {{ cargando ? 'Actualizando...' : 'Actualizar tendencia' }}
        </button>
      </div>
    </div>

    <!-- Tarjeta de Banda de Rango Esperado activa -->
    <div class="banda-info-bar" data-testid="resumen-rango-esperado">
      <div class="banda-info-item">
        <span class="banda-dot banda-dot--rango"></span>
        <div>
          <span class="banda-info-label">Banda de rango esperado ({{ serie.rangoEsperado.actividadNombre }})</span>
          <strong class="banda-info-value">
            {{ serie.rangoEsperado.bpmMin }} – {{ serie.rangoEsperado.bpmMax }} BPM
          </strong>
        </div>
      </div>

      <div class="banda-info-item">
        <div>
          <span class="banda-info-label">Edad aplicada al rango</span>
          <strong class="banda-info-value">{{ serie.rangoEsperado.edadAplicada }} años</strong>
        </div>
      </div>

      <div class="banda-info-item">
        <div>
          <span class="banda-info-label">Días con registros propios</span>
          <strong class="banda-info-value">{{ serie.totalDias }} {{ serie.totalDias === 1 ? 'día' : 'días' }}</strong>
        </div>
      </div>

      <div class="banda-info-item">
        <div>
          <span class="banda-info-label">Total de mediciones propias</span>
          <strong class="banda-info-value">{{ serie.totalMediciones }}</strong>
        </div>
      </div>
    </div>

    <!-- Estado de carga -->
    <div v-if="cargando" class="estado-panel estado-panel--cargando" role="status">
      <div class="spinner-evolucion"></div>
      <p>Consultando tu historial personal de mediciones...</p>
    </div>

    <!-- Estado de error -->
    <div v-else-if="errorCarga" class="estado-panel estado-panel--error" role="alert">
      <h3>No se pudo cargar tu evolución personal</h3>
      <p>{{ errorCarga }}</p>
      <button type="button" class="btn-reintentar" @click="recargarDatos">
        Reintentar consulta
      </button>
    </div>

    <!-- Contenido principal -->
    <template v-else>
      <!-- Caso con menos de 2 días de datos: mensaje claro sin inventar valores -->
      <div
        v-if="!serie.tieneDatosSuficientes"
        class="alerta-datos-insuficientes"
        data-testid="mensaje-datos-insuficientes"
        role="status"
      >
        <div class="alerta-insuficientes-encabezado">
          <span class="badge-insuficientes">Datos insuficientes para trazar tendencia</span>
          <h3>Se requieren mediciones en al menos 2 días distintos</h3>
        </div>

        <p class="alerta-insuficientes-texto">
          {{ serie.mensajeEstado }}
        </p>

        <p class="alerta-insuficientes-nota">
          Por integridad de tus datos fisiológicos, este panel nunca inventa ni simula valores para días sin mediciones.
          Tu banda esperada para <strong>{{ serie.rangoEsperado.actividadNombre.toLowerCase() }}</strong> a los
          <strong>{{ serie.rangoEsperado.edadAplicada }} años</strong> es de
          <strong>{{ serie.rangoEsperado.bpmMin }} a {{ serie.rangoEsperado.bpmMax }} BPM</strong>.
        </p>

        <div v-if="serie.totalDias === 1" class="unico-dia-card" data-testid="registro-unico-dia">
          <div class="unico-dia-item">
            <span class="unico-dia-label">Único día registrado</span>
            <strong class="unico-dia-valor">{{ serie.dias[0].dia }} ({{ serie.dias[0].etiquetaDia }})</strong>
          </div>
          <div class="unico-dia-item">
            <span class="unico-dia-label">BPM promedio del día</span>
            <strong class="unico-dia-valor">{{ serie.dias[0].bpmPromedio }} BPM</strong>
          </div>
          <div class="unico-dia-item">
            <span class="unico-dia-label">Comparación con rango esperado</span>
            <span
              class="estado-chip"
              :class="`estado-chip--${serie.dias[0].estado}`"
            >
              {{ serie.dias[0].etiquetaEstado }}
            </span>
          </div>
        </div>

        <div class="alerta-insuficientes-acciones">
          <router-link to="/medicion" class="btn-ir-medicion">
            Ir a realizar una medición
          </router-link>
        </div>
      </div>

      <!-- Caso con 2 o más días de datos: gráfico de tendencia por días + banda del rango esperado -->
      <div v-else class="evolucion-contenido-completo">
        <div class="kpi-evolucion-grid">
          <div class="kpi-evolucion-card">
            <span class="kpi-evolucion-label">Promedio de BPM en el período</span>
            <div class="kpi-evolucion-valor">
              {{ serie.resumen.promedioPeriodoBpm }} <small>BPM</small>
            </div>
            <span class="kpi-evolucion-detalle">
              Rango observado: {{ serie.resumen.minimoBpm }} – {{ serie.resumen.maximoBpm }} BPM
            </span>
          </div>

          <div class="kpi-evolucion-card">
            <span class="kpi-evolucion-label">Rango esperado por edad y actividad</span>
            <div class="kpi-evolucion-valor kpi-evolucion-valor--rango">
              {{ serie.rangoEsperado.bpmMin }} – {{ serie.rangoEsperado.bpmMax }} <small>BPM</small>
            </div>
            <span class="kpi-evolucion-detalle">
              {{ serie.rangoEsperado.actividadNombre }} · {{ serie.rangoEsperado.edadAplicada }} años
            </span>
          </div>

          <div class="kpi-evolucion-card">
            <span class="kpi-evolucion-label">Días dentro del rango esperado</span>
            <div class="kpi-evolucion-valor">
              {{ serie.resumen.diasDentroDeRango }} / {{ serie.totalDias }}
              <small>({{ serie.resumen.porcentajeDentroDeRango }}%)</small>
            </div>
            <span class="kpi-evolucion-detalle">
              Cumplimiento diario respecto a la banda esperada
            </span>
          </div>

          <div class="kpi-evolucion-card">
            <span class="kpi-evolucion-label">Variación entre primer y último día</span>
            <div class="kpi-evolucion-valor">
              {{ serie.resumen.cambioEntreExtremosBpm > 0 ? `+${serie.resumen.cambioEntreExtremosBpm}` : serie.resumen.cambioEntreExtremosBpm }}
              <small>BPM</small>
            </div>
            <span class="kpi-evolucion-detalle">
              Desde {{ serie.dias[0].etiquetaDia }} hasta {{ serie.dias[serie.dias.length - 1].etiquetaDia }}
            </span>
          </div>
        </div>

        <!-- Gráfico SVG de Tendencia Diaria con Banda de Rango Esperado -->
        <div class="grafico-card">
          <div class="grafico-encabezado">
            <div>
              <h3>Curva Diaria de BPM vs. Banda del Rango Esperado</h3>
              <p>
                La franja verde representa el rango fisiológico esperado ({{ serie.rangoEsperado.bpmMin }}–{{ serie.rangoEsperado.bpmMax }} BPM)
                para {{ serie.rangoEsperado.actividadNombre.toLowerCase() }} a los {{ serie.rangoEsperado.edadAplicada }} años.
              </p>
            </div>

            <div class="grafico-leyenda">
              <span class="leyenda-item">
                <span class="leyenda-muestra leyenda-muestra--banda"></span>
                Banda esperada ({{ serie.rangoEsperado.bpmMin }}–{{ serie.rangoEsperado.bpmMax }} BPM)
              </span>
              <span class="leyenda-item">
                <span class="leyenda-muestra leyenda-muestra--linea"></span>
                Promedio diario de BPM
              </span>
              <span class="leyenda-item">
                <span class="leyenda-muestra leyenda-muestra--fuera"></span>
                Día fuera del rango
              </span>
            </div>
          </div>

          <div class="svg-wrapper">
            <svg
              :viewBox="`0 0 ${geometria.ancho} ${geometria.alto}`"
              class="svg-evolucion"
              data-testid="grafico-evolucion-bpm"
              role="img"
              aria-label="Gráfico de tendencia diaria de BPM comparado con la banda del rango esperado por edad y actividad"
            >
              <g class="grilla-y">
                <g v-for="tick in geometria.ticksY" :key="tick.valor">
                  <line
                    :x1="geometria.padding.left"
                    :x2="geometria.ancho - geometria.padding.right"
                    :y1="tick.y"
                    :y2="tick.y"
                    class="linea-grilla"
                  />
                  <text
                    :x="geometria.padding.left - 10"
                    :y="tick.y + 4"
                    text-anchor="end"
                    class="etiqueta-eje-y"
                  >
                    {{ tick.valor }}
                  </text>
                </g>
              </g>

              <rect
                :x="geometria.bandaRango.x"
                :y="geometria.bandaRango.yTop"
                :width="geometria.bandaRango.width"
                :height="geometria.bandaRango.height"
                class="banda-rango-esperado"
                data-testid="banda-rango-esperado"
              />

              <line
                :x1="geometria.bandaRango.x"
                :x2="geometria.bandaRango.x + geometria.bandaRango.width"
                :y1="geometria.bandaRango.yTop"
                :y2="geometria.bandaRango.yTop"
                class="linea-limite-rango"
              />
              <text
                :x="geometria.bandaRango.x + geometria.bandaRango.width - 6"
                :y="Math.max(14, geometria.bandaRango.yTop - 5)"
                text-anchor="end"
                class="etiqueta-limite-rango"
              >
                Máx. esperado: {{ geometria.bandaRango.bpmMax }} BPM
              </text>

              <line
                :x1="geometria.bandaRango.x"
                :x2="geometria.bandaRango.x + geometria.bandaRango.width"
                :y1="geometria.bandaRango.yBottom"
                :y2="geometria.bandaRango.yBottom"
                class="linea-limite-rango"
              />
              <text
                :x="geometria.bandaRango.x + geometria.bandaRango.width - 6"
                :y="Math.min(geometria.alto - 8, geometria.bandaRango.yBottom + 13)"
                text-anchor="end"
                class="etiqueta-limite-rango"
              >
                Mín. esperado: {{ geometria.bandaRango.bpmMin }} BPM
              </text>

              <path
                :d="geometria.lineaPath"
                class="linea-tendencia-bpm"
                data-testid="linea-tendencia-bpm"
              />

              <g
                v-for="punto in geometria.puntos"
                :key="punto.dia"
                class="grupo-punto-dia"
              >
                <circle
                  :cx="punto.x"
                  :cy="punto.y"
                  r="6"
                  :class="[
                    'punto-bpm',
                    punto.dentroDeRango ? 'punto-bpm--dentro' : 'punto-bpm--fuera'
                  ]"
                >
                  <title>
                    {{ punto.dia }}: {{ punto.bpmPromedio }} BPM ({{ punto.etiquetaEstado }})
                  </title>
                </circle>

                <text
                  :x="punto.x"
                  :y="Math.max(16, punto.y - 11)"
                  text-anchor="middle"
                  class="etiqueta-valor-punto"
                >
                  {{ punto.bpmPromedio }}
                </text>

                <text
                  :x="punto.x"
                  :y="geometria.alto - 10"
                  text-anchor="middle"
                  class="etiqueta-eje-x"
                >
                  {{ punto.etiquetaDia }}
                </text>
              </g>
            </svg>
          </div>
        </div>

        <!-- Tabla detallada por día -->
        <div class="tabla-evolucion-card">
          <div class="tabla-evolucion-header">
            <h3>Detalle Diario de Mediciones Propias</h3>
            <span>{{ serie.totalDias }} días consolidados</span>
          </div>

          <div class="tabla-responsive">
            <table class="tabla-evolucion" data-testid="tabla-evolucion-diaria">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>BPM promedio</th>
                  <th>SpO₂ promedio</th>
                  <th>Rango esperado</th>
                  <th>Mediciones del día</th>
                  <th>Evaluación respecto al rango</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="diaItem in serie.dias" :key="diaItem.dia">
                  <td>
                    <strong>{{ diaItem.dia }}</strong>
                    <span class="subtexto-celda">{{ diaItem.etiquetaDia }}</span>
                  </td>
                  <td class="celda-bpm">{{ diaItem.bpmPromedio }} BPM</td>
                  <td>{{ diaItem.spo2Promedio !== null ? `${diaItem.spo2Promedio}%` : '—' }}</td>
                  <td>{{ diaItem.bpmEsperadoMin }} – {{ diaItem.bpmEsperadoMax }} BPM</td>
                  <td>{{ diaItem.mediciones }}</td>
                  <td>
                    <span
                      class="estado-chip"
                      :class="`estado-chip--${diaItem.estado}`"
                    >
                      {{ diaItem.etiquetaEstado }}
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Sección de Correlación con Estrés o Sueño Registrados -->
      <CorrelacionEstresSuenoPanel
        :correlacion="serie.correlacion"
        :dias-evolucion="serie.dias"
        @actualizar-factor-dia="manejarActualizarFactorDia"
      />
    </template>
  </section>
</template>

<script setup>
import { ref, computed, onMounted, watch } from 'vue'
import CorrelacionEstresSuenoPanel from './CorrelacionEstresSuenoPanel.vue'
import {
  obtenerEvolucionPersonal,
  guardarRegistroDiarioSesion,
  leerRegistrosDiariosSesion
} from '../services/evolucionService.js'
import {
  construirSerieEvolucion,
  calcularGeometriaGraficoEvolucion
} from '../utils/evolucionPersonal.js'
import { analizarCorrelacionBpmEstresSueno } from '../utils/correlacionEstresSueno.js'

const props = defineProps({
  datosIniciales: {
    type: Object,
    default: null
  }
})

const cargando = ref(false)
const errorCarga = ref('')
const actividadSeleccionadaCodigo = ref('reposo')
const edadReferenciaInput = ref(30)

const actividadesDisponibles = ref([
  { id: 1, codigo: 'reposo', nombre: 'Reposo' },
  { id: 2, codigo: 'caminata', nombre: 'Caminata suave' },
  { id: 3, codigo: 'ejercicio_moderado', nombre: 'Ejercicio moderado' },
  { id: 4, codigo: 'ejercicio_intenso', nombre: 'Ejercicio intenso' },
  { id: 5, codigo: 'recuperacion', nombre: 'Recuperación post-ejercicio' }
])

const serie = ref({
  ...construirSerieEvolucion({
    mediciones: [],
    usuarioId: '',
    edad: 30,
    actividadId: 1,
    actividadCodigo: 'reposo'
  }),
  correlacion: analizarCorrelacionBpmEstresSueno({
    diasEvolucion: [],
    mediciones: [],
    usuarioId: ''
  })
})

const geometria = computed(() =>
  calcularGeometriaGraficoEvolucion({
    dias: serie.value.dias,
    rangoEsperado: serie.value.rangoEsperado
  })
)

async function recargarDatos() {
  if (props.datosIniciales) {
    aplicarDatosIniciales(props.datosIniciales)
    return
  }

  cargando.value = true
  errorCarga.value = ''

  try {
    const actObj =
      actividadesDisponibles.value.find((a) => a.codigo === actividadSeleccionadaCodigo.value) ||
      actividadesDisponibles.value[0]

    const resultado = await obtenerEvolucionPersonal({
      actividadCodigo: actObj.codigo,
      actividadId: actObj.id,
      edadOverride: edadReferenciaInput.value
    })

    if (Array.isArray(resultado.actividades) && resultado.actividades.length > 0) {
      actividadesDisponibles.value = resultado.actividades
    }

    serie.value = resultado
    if (resultado?.rangoEsperado?.edadAplicada) {
      edadReferenciaInput.value = resultado.rangoEsperado.edadAplicada
    }
  } catch (err) {
    errorCarga.value = err?.message || 'Error al obtener la evolución personal.'
  } finally {
    cargando.value = false
  }
}

function aplicarDatosIniciales(datos) {
  if (!datos) return
  const actObj =
    actividadesDisponibles.value.find((a) => a.codigo === actividadSeleccionadaCodigo.value) ||
    actividadesDisponibles.value[0]

  const base = construirSerieEvolucion({
    mediciones: datos.mediciones || [],
    filasVista: datos.filasVista || [],
    usuarioId: datos.usuarioId || '',
    edad: edadReferenciaInput.value || datos.edad || 30,
    actividadId: actObj.id,
    actividadCodigo: actObj.codigo,
    rangosGlobales: datos.rangosGlobales || [],
    rangosPersonales: datos.rangosPersonales || []
  })

  const correlacion = analizarCorrelacionBpmEstresSueno({
    diasEvolucion: base.dias,
    mediciones: datos.mediciones || [],
    declaracionesPorId: datos.declaracionesPorId || {},
    registrosDiariosSesion: datos.registrosDiariosSesion || leerRegistrosDiariosSesion(datos.usuarioId || ''),
    usuarioId: datos.usuarioId || ''
  })

  serie.value = {
    ...base,
    correlacion
  }
}

function manejarActualizarFactorDia({ dia, nivelEstres, suenoHoras, horasSuenoOpcional }) {
  const uid = serie.value.usuarioId
  if (!uid || !dia) return
  guardarRegistroDiarioSesion(uid, dia, {
    nivelEstres,
    suenoHoras,
    horasSuenoOpcional
  })
  recargarDatos()
}

watch(
  () => props.datosIniciales,
  (nuevos) => {
    if (nuevos) {
      aplicarDatosIniciales(nuevos)
    }
  },
  { deep: true }
)

onMounted(() => {
  recargarDatos()
})
</script>

<style scoped>
.panel-evolucion {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.evolucion-header-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.35rem 1.5rem;
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-end;
  gap: 1.25rem;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
}

.evolucion-title-block {
  max-width: 620px;
}

.evolucion-kicker {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #0284c7;
  margin-bottom: 0.3rem;
}

.evolucion-title {
  margin: 0 0 0.4rem 0;
  font-size: 1.4rem;
  font-weight: 800;
  color: #0f172a;
}

.evolucion-subtitle {
  margin: 0;
  font-size: 0.9rem;
  color: #475569;
  line-height: 1.45;
}

.evolucion-controles {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.85rem;
}

.control-grupo {
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}

.control-label {
  font-size: 0.76rem;
  font-weight: 600;
  color: #334155;
}

.control-select,
.control-input {
  height: 38px;
  padding: 0 0.75rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.875rem;
  color: #0f172a;
  background: #f8fafc;
}

.control-input {
  width: 110px;
}

.btn-actualizar-evolucion {
  height: 38px;
  padding: 0 1rem;
  border-radius: 8px;
  border: 1px solid #0284c7;
  background: #0284c7;
  color: #ffffff;
  font-weight: 600;
  font-size: 0.85rem;
  cursor: pointer;
  transition: background 0.15s ease;
}

.btn-actualizar-evolucion:hover:not(:disabled) {
  background: #0369a1;
}

.btn-actualizar-evolucion:disabled {
  opacity: 0.65;
  cursor: not-allowed;
}

.banda-info-bar {
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  border-radius: 12px;
  padding: 0.9rem 1.25rem;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 1rem;
}

.banda-info-item {
  display: flex;
  align-items: center;
  gap: 0.65rem;
}

.banda-dot {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  flex-shrink: 0;
}

.banda-dot--rango {
  background: #16a34a;
  box-shadow: 0 0 0 3px rgba(22, 163, 74, 0.2);
}

.banda-info-label {
  display: block;
  font-size: 0.75rem;
  color: #166534;
  font-weight: 600;
}

.banda-info-value {
  font-size: 0.98rem;
  color: #14532d;
  font-weight: 800;
}

.estado-panel {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 2.25rem 1.5rem;
  text-align: center;
  color: #475569;
}

.estado-panel--error {
  border-color: #fecaca;
  background: #fef2f2;
  color: #991b1b;
}

.spinner-evolucion {
  width: 32px;
  height: 32px;
  border: 3px solid #e2e8f0;
  border-top-color: #0284c7;
  border-radius: 50%;
  margin: 0 auto 0.75rem auto;
  animation: giro 0.8s linear infinite;
}

@keyframes giro {
  to {
    transform: rotate(360deg);
  }
}

.alerta-datos-insuficientes {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-left: 5px solid #d97706;
  border-radius: 12px;
  padding: 1.5rem;
  color: #78350f;
}

.alerta-insuficientes-encabezado {
  margin-bottom: 0.65rem;
}

.badge-insuficientes {
  display: inline-block;
  background: #fef3c7;
  color: #92400e;
  border: 1px solid #fcd34d;
  font-size: 0.72rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  margin-bottom: 0.4rem;
}

.alerta-insuficientes-encabezado h3 {
  margin: 0;
  font-size: 1.15rem;
  color: #78350f;
}

.alerta-insuficientes-texto {
  margin: 0 0 0.65rem 0;
  font-size: 0.95rem;
  line-height: 1.5;
  font-weight: 600;
}

.alerta-insuficientes-nota {
  margin: 0 0 1rem 0;
  font-size: 0.86rem;
  color: #92400e;
  line-height: 1.45;
}

.unico-dia-card {
  background: #ffffff;
  border: 1px solid #fde68a;
  border-radius: 10px;
  padding: 0.9rem 1.1rem;
  display: flex;
  flex-wrap: wrap;
  gap: 1.25rem;
  margin-bottom: 1.1rem;
}

.unico-dia-item {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
}

.unico-dia-label {
  font-size: 0.75rem;
  color: #64748b;
  font-weight: 600;
}

.unico-dia-valor {
  font-size: 0.95rem;
  color: #0f172a;
}

.alerta-insuficientes-acciones {
  display: flex;
  gap: 0.75rem;
}

.btn-ir-medicion,
.btn-reintentar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 0.55rem 1.1rem;
  border-radius: 8px;
  background: #0284c7;
  color: #ffffff;
  text-decoration: none;
  font-weight: 600;
  font-size: 0.875rem;
  border: none;
  cursor: pointer;
}

.btn-ir-medicion:hover,
.btn-reintentar:hover {
  background: #0369a1;
}

.evolucion-contenido-completo {
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.kpi-evolucion-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1rem;
}

.kpi-evolucion-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem 1.15rem;
  box-shadow: 0 2px 8px rgba(15, 23, 42, 0.03);
}

.kpi-evolucion-label {
  display: block;
  font-size: 0.76rem;
  font-weight: 600;
  color: #64748b;
  margin-bottom: 0.35rem;
}

.kpi-evolucion-valor {
  font-size: 1.45rem;
  font-weight: 800;
  color: #0f172a;
  margin-bottom: 0.25rem;
}

.kpi-evolucion-valor small {
  font-size: 0.8rem;
  font-weight: 600;
  color: #64748b;
}

.kpi-evolucion-valor--rango {
  color: #15803d;
}

.kpi-evolucion-detalle {
  font-size: 0.76rem;
  color: #64748b;
}

.grafico-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.25rem 1.4rem;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
}

.grafico-encabezado {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 1rem;
  margin-bottom: 1rem;
}

.grafico-encabezado h3 {
  margin: 0 0 0.25rem 0;
  font-size: 1.08rem;
  color: #0f172a;
}

.grafico-encabezado p {
  margin: 0;
  font-size: 0.84rem;
  color: #64748b;
}

.grafico-leyenda {
  display: flex;
  flex-wrap: wrap;
  gap: 0.9rem;
  font-size: 0.78rem;
  color: #334155;
  font-weight: 600;
}

.leyenda-item {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
}

.leyenda-muestra {
  width: 14px;
  height: 10px;
  border-radius: 3px;
  display: inline-block;
}

.leyenda-muestra--banda {
  background: rgba(34, 197, 94, 0.28);
  border: 1px solid #16a34a;
}

.leyenda-muestra--linea {
  background: #0284c7;
}

.leyenda-muestra--fuera {
  background: #dc2626;
  border-radius: 50%;
  width: 10px;
  height: 10px;
}

.svg-wrapper {
  width: 100%;
  overflow-x: auto;
}

.svg-evolucion {
  width: 100%;
  min-width: 560px;
  height: auto;
  display: block;
}

.linea-grilla {
  stroke: #e2e8f0;
  stroke-dasharray: 3 3;
  stroke-width: 1;
}

.etiqueta-eje-y {
  font-size: 11px;
  fill: #64748b;
  font-weight: 600;
}

.etiqueta-eje-x {
  font-size: 11px;
  fill: #334155;
  font-weight: 600;
}

.banda-rango-esperado {
  fill: rgba(34, 197, 94, 0.16);
}

.linea-limite-rango {
  stroke: #16a34a;
  stroke-width: 1.5;
  stroke-dasharray: 5 4;
}

.etiqueta-limite-rango {
  font-size: 10.5px;
  fill: #15803d;
  font-weight: 700;
}

.linea-tendencia-bpm {
  fill: none;
  stroke: #0284c7;
  stroke-width: 3;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.punto-bpm {
  stroke: #ffffff;
  stroke-width: 2;
}

.punto-bpm--dentro {
  fill: #0284c7;
}

.punto-bpm--fuera {
  fill: #dc2626;
}

.etiqueta-valor-punto {
  font-size: 11px;
  font-weight: 700;
  fill: #0f172a;
}

.tabla-evolucion-card {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.2rem 1.4rem;
}

.tabla-evolucion-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 0.85rem;
}

.tabla-evolucion-header h3 {
  margin: 0;
  font-size: 1.02rem;
  color: #0f172a;
}

.tabla-evolucion-header span {
  font-size: 0.8rem;
  color: #64748b;
  font-weight: 600;
}

.tabla-responsive {
  overflow-x: auto;
}

.tabla-evolucion {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.875rem;
}

.tabla-evolucion th,
.tabla-evolucion td {
  padding: 0.7rem 0.85rem;
  text-align: left;
  border-bottom: 1px solid #f1f5f9;
}

.tabla-evolucion th {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #64748b;
  background: #f8fafc;
}

.subtexto-celda {
  display: block;
  font-size: 0.75rem;
  color: #64748b;
}

.celda-bpm {
  font-weight: 700;
  color: #0f172a;
}

.estado-chip {
  display: inline-block;
  padding: 0.22rem 0.6rem;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 700;
}

.estado-chip--dentro {
  background: #dcfce7;
  color: #166534;
}

.estado-chip--alto {
  background: #fee2e2;
  color: #991b1b;
}

.estado-chip--bajo {
  background: #fef3c7;
  color: #92400e;
}
</style>
