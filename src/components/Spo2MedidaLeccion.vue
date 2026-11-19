<template>
  <section class="spo2-medida" aria-live="polite" aria-labelledby="titulo-spo2-medida" data-testid="spo2-medida-leccion">
    <h3 id="titulo-spo2-medida" class="titulo">Tu saturación de oxígeno medida</h3>

    <p v-if="!estaAutenticado" class="mensaje" data-testid="spo2-sin-sesion">
      Inicia sesión para ver aquí la SpO₂ de tu última medición hecha con el sensor.
      <router-link to="/login">Iniciar sesión</router-link>
    </p>
    <p v-else-if="cargando" class="mensaje" data-testid="spo2-cargando">Buscando tu última medición…</p>
    <p v-else-if="error" class="mensaje mensaje--error" role="alert" data-testid="spo2-error">
      {{ error }}
      <button type="button" class="reintentar" @click="cargar">Reintentar</button>
    </p>
    <p v-else-if="!medida" class="mensaje" data-testid="spo2-vacio">
      Todavía no tienes una medición con SpO₂ hecha con el sensor. Haz una en
      <router-link to="/medicion">Medición</router-link> y guárdala para verla aquí.
      Las señales simuladas o cargadas desde un archivo no cuentan como medición tuya.
    </p>

    <template v-else>
      <div class="lectura">
        <div class="numero" :class="'estado-' + estado.severidad" data-testid="spo2-medida">
          {{ formatearSpo2(medida.spo2) }}<span class="unidad">% SpO₂</span>
        </div>
        <div class="detalle">
          <span class="pastilla" :class="'estado-' + estado.severidad" data-testid="spo2-estado">{{ estado.etiqueta }}</span>
          <span v-if="!medida.confiable" class="pastilla pastilla--poco-fiable" data-testid="spo2-poco-fiable">Lectura poco confiable</span>
          <p class="fecha" data-testid="spo2-fecha">
            Medida el {{ fechaTexto(medida.fecha) }}<template v-if="contexto"> · {{ contexto }}</template>
            <template v-if="sinConexion"> (dato guardado en este dispositivo)</template>
          </p>
          <p class="explica">{{ estado.descripcion }}</p>
        </div>
      </div>

      <EscalaSpo2 :spo2="medida.spo2" />

      <p v-if="omitidasPorCalidad > 0" class="aviso-calidad" data-testid="spo2-omitidas">
        Tu medición más reciente tuvo mala calidad de señal, por eso aquí se muestra la anterior que sí fue confiable.
      </p>
      <p v-if="!medida.confiable" class="aviso-calidad aviso-calidad--mala" data-testid="spo2-aviso-mala">
        La calidad de la señal fue mala y no tienes una medición confiable: repite la medición con el dedo quieto antes de interpretar este valor.
      </p>
      <p v-if="estado.accionRecomendada && medida.confiable" class="accion">{{ estado.accionRecomendada }}</p>
      <p v-if="cambioTexto" class="cambio" data-testid="spo2-cambio">{{ cambioTexto }}</p>

      <details v-if="calculo" class="calculo" data-testid="spo2-calculo">
        <summary>Cómo se calculó este valor con tu medición</summary>
        <p class="calculo-formula">{{ calculo.formula }}</p>
        <p class="calculo-sustitucion">
          Con tu {{ formatearSpo2(medida.spo2) }} %, la razón R equivale a <strong>{{ calculo.rTexto }}</strong>:
          <code>{{ calculo.sustitucion }}</code>
        </p>
        <p class="calculo-nota">{{ calculo.nota }}</p>
      </details>

      <div v-if="ultimas.length > 1" class="ultimas" data-testid="spo2-ultimas">
        <h4 class="ultimas-titulo">Tus últimas mediciones con el sensor</h4>
        <ul>
          <li v-for="m in ultimas" :key="m.id || m.fecha">
            <span class="ultima-fecha">{{ fechaCorta(m.fecha) }}</span>
            <strong class="ultima-valor" :class="'estado-' + severidadDe(m.spo2)">{{ formatearSpo2(m.spo2) }} %</strong>
            <span v-if="!m.confiable" class="ultima-nota">señal mala</span>
          </li>
        </ul>
        <router-link to="/evolucion" class="ver-mas">Ver mi evolución completa</router-link>
      </div>

      <p class="orientativo">Valor orientativo con fines educativos: no es un diagnóstico ni reemplaza un oxímetro clínico.</p>
    </template>
  </section>
</template>

<script setup>
import { computed } from 'vue'
import EscalaSpo2 from './EscalaSpo2.vue'
import { useSpo2Medida } from '../composables/useSpo2Medida.js'
import { evaluarEstadoSpo2 } from '../services/spo2Service.js'
import { explicarCalculo, formatearSpo2, textoCambio } from '../utils/spo2Aprendizaje.js'

const { estaAutenticado, cargando, error, sinConexion, medida, estado, ultimas, cambio, omitidasPorCalidad, cargar } = useSpo2Medida()

const calculo = computed(() => (medida.value ? explicarCalculo(medida.value.spo2) : null))
const cambioTexto = computed(() => textoCambio(cambio.value))
const contexto = computed(() => {
  const m = medida.value
  if (!m) return ''
  return [m.actividad, m.canal ? `canal ${m.canal}` : ''].filter(Boolean).join(' · ')
})

const severidadDe = (spo2) => evaluarEstadoSpo2(spo2).severidad

function fechaTexto(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' })
}

function fechaCorta(iso) {
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })
}
</script>

<style scoped>
.spo2-medida {
  border: 1px solid var(--color-border);
  border-left: 4px solid var(--color-primary);
  border-radius: 0.5rem;
  padding: 1rem 1.1rem;
  margin: 1rem 0;
  background: var(--color-bg);
}
.titulo { font-size: 1rem; font-weight: 600; margin: 0 0 0.6rem; }
.mensaje { margin: 0; font-size: 0.9rem; line-height: 1.55; color: var(--color-muted); }
.mensaje--error { color: var(--color-danger); }
.reintentar { margin-left: 0.5rem; padding: 0.15rem 0.6rem; border: 1px solid var(--color-border); border-radius: 0.4rem; background: var(--color-surface); cursor: pointer; font-size: 0.82rem; }
.lectura { display: flex; align-items: center; gap: 1.25rem; flex-wrap: wrap; }
.numero { font-size: 2.6rem; font-weight: 700; font-variant-numeric: tabular-nums; line-height: 1; }
.unidad { font-size: 0.95rem; font-weight: 600; margin-left: 0.35rem; color: var(--color-muted); }
.pastilla { display: inline-block; padding: 0.2rem 0.6rem; border-radius: 9999px; font-size: 0.8rem; font-weight: 600; background: #e2e8f0; margin-right: 0.35rem; }
.pastilla--poco-fiable { background: #fef3c7; color: #92400e; }
.fecha, .explica { margin: 0.35rem 0 0; font-size: 0.85rem; color: var(--color-muted); }
.aviso-calidad { margin: 0.75rem 0 0; padding: 0.5rem 0.75rem; border-radius: 0.4rem; background: #fffbeb; border: 1px solid #fde68a; color: #92400e; font-size: 0.84rem; line-height: 1.5; }
.aviso-calidad--mala { background: #fef2f2; border-color: #fecaca; color: #b91c1c; }
.accion { margin: 0.6rem 0 0; font-size: 0.88rem; line-height: 1.5; }
.cambio { margin: 0.4rem 0 0; font-size: 0.85rem; font-weight: 600; color: var(--color-primary); }
.calculo { margin-top: 0.85rem; padding: 0.6rem 0.8rem; border: 1px solid var(--color-border); border-radius: 0.4rem; background: var(--color-surface); }
.calculo summary { cursor: pointer; font-size: 0.88rem; font-weight: 600; }
.calculo-formula { margin: 0.6rem 0 0; font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-weight: 600; }
.calculo-sustitucion { margin: 0.4rem 0 0; font-size: 0.88rem; line-height: 1.6; }
.calculo-sustitucion code { display: inline-block; margin-top: 0.2rem; padding: 0.1rem 0.45rem; border-radius: 0.3rem; background: var(--color-bg); }
.calculo-nota { margin: 0.4rem 0 0; font-size: 0.8rem; color: var(--color-muted); line-height: 1.5; }
.ultimas { margin-top: 0.9rem; }
.ultimas-titulo { margin: 0 0 0.35rem; font-size: 0.85rem; font-weight: 700; }
.ultimas ul { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.25rem; }
.ultimas li { display: flex; align-items: baseline; gap: 0.75rem; padding: 0.25rem 0; border-bottom: 1px dashed var(--color-border); font-size: 0.85rem; }
.ultima-fecha { color: var(--color-muted); min-width: 7.5rem; }
.ultima-valor { font-variant-numeric: tabular-nums; }
.ultima-nota { font-size: 0.74rem; color: #92400e; }
.ver-mas { display: inline-block; margin-top: 0.5rem; font-size: 0.84rem; font-weight: 600; color: var(--color-primary); }
.orientativo { margin: 0.85rem 0 0; font-size: 0.78rem; color: var(--color-muted); }
.estado-success { color: var(--color-success); }
.estado-warning { color: var(--color-warning); }
.estado-danger { color: var(--color-danger); }
.pastilla.estado-success { background: #dcfce7; }
.pastilla.estado-warning { background: #ffedd5; }
.pastilla.estado-danger { background: #fee2e2; }
</style>
