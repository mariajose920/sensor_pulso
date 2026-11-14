<template>
  <section class="correlacion-section" data-testid="panel-correlacion-estres-sueno">
    <div class="correlacion-header">
      <div>
        <span class="correlacion-kicker">Análisis de Factores Registrados</span>
        <h3 class="correlacion-title">Relación del BPM con Estrés y Sueño Registrados</h3>
        <p class="correlacion-subtitle">
          Comparación entre tu tendencia diaria de BPM y los niveles de estrés y horas de sueño
          declarados en tu ficha de salud.
        </p>
      </div>
    </div>

    <!-- Aviso metodológico obligatorio: correlación no es causa y no es un diagnóstico -->
    <div
      class="aviso-no-causalidad"
      data-testid="aviso-correlacion-no-causa"
      role="note"
    >
      <strong>Importante — Correlación no es causalidad ni diagnóstico médico:</strong>
      <p>{{ datosCorrelacion.avisoNoCausalidad }}</p>
    </div>

    <!-- Tarjetas de relación: 1) BPM vs Estrés y 2) BPM vs Sueño -->
    <div class="correlacion-grid">
      <!-- Tarjeta Estrés -->
      <article class="correlacion-card" data-testid="tarjeta-correlacion-estres">
        <div class="correlacion-card-top">
          <h4>Relación entre BPM y Estrés Registrado</h4>
          <span class="dias-badge">
            {{ datosCorrelacion.estres.diasAnalizados }}
            {{ datosCorrelacion.estres.diasAnalizados === 1 ? 'día con registro' : 'días con registro' }}
          </span>
        </div>

        <!-- Con datos insuficientes NO muestra un número -->
        <div
          v-if="!datosCorrelacion.estres.tieneDatosSuficientes || datosCorrelacion.estres.coeficiente === null"
          class="aviso-pocos-datos"
          data-testid="aviso-pocos-datos-estres"
          role="status"
        >
          <strong>Datos insuficientes para calcular correlación de estrés</strong>
          <p>{{ datosCorrelacion.estres.mensajeDatosInsuficientes }}</p>
        </div>

        <!-- Con datos suficientes muestra el coeficiente y la interpretación -->
        <div v-else class="correlacion-resultado" data-testid="resultado-correlacion-estres">
          <div class="coeficiente-bloque">
            <span class="coeficiente-etiqueta">Coeficiente de correlación (r)</span>
            <strong class="coeficiente-valor" data-testid="valor-correlacion-estres">
              {{ formatearCoeficiente(datosCorrelacion.estres.coeficiente) }}
            </strong>
            <span class="coeficiente-magnitud">
              Relación {{ datosCorrelacion.estres.sentido }} ({{ etiquetaFuerza(datosCorrelacion.estres.fuerza) }})
            </span>
          </div>

          <p class="correlacion-explicacion">
            {{ datosCorrelacion.estres.resumenRelacion }}
          </p>

          <div class="comparativa-grupos">
            <div v-if="datosCorrelacion.estres.promedioGrupoBajoBpm !== null" class="grupo-item">
              <span>Días con estrés bajo o medio</span>
              <strong>{{ datosCorrelacion.estres.promedioGrupoBajoBpm }} BPM</strong>
            </div>
            <div v-if="datosCorrelacion.estres.promedioGrupoAltoBpm !== null" class="grupo-item">
              <span>Días con estrés alto o muy alto</span>
              <strong>{{ datosCorrelacion.estres.promedioGrupoAltoBpm }} BPM</strong>
            </div>
          </div>
        </div>
      </article>

      <!-- Tarjeta Sueño -->
      <article class="correlacion-card" data-testid="tarjeta-correlacion-sueno">
        <div class="correlacion-card-top">
          <h4>Relación entre BPM y Sueño Registrado</h4>
          <span class="dias-badge">
            {{ datosCorrelacion.sueno.diasAnalizados }}
            {{ datosCorrelacion.sueno.diasAnalizados === 1 ? 'día con registro' : 'días con registro' }}
          </span>
        </div>

        <!-- Con datos insuficientes NO muestra un número -->
        <div
          v-if="!datosCorrelacion.sueno.tieneDatosSuficientes || datosCorrelacion.sueno.coeficiente === null"
          class="aviso-pocos-datos"
          data-testid="aviso-pocos-datos-sueno"
          role="status"
        >
          <strong>Datos insuficientes para calcular correlación de sueño</strong>
          <p>{{ datosCorrelacion.sueno.mensajeDatosInsuficientes }}</p>
        </div>

        <!-- Con datos suficientes muestra el coeficiente y la interpretación -->
        <div v-else class="correlacion-resultado" data-testid="resultado-correlacion-sueno">
          <div class="coeficiente-bloque">
            <span class="coeficiente-etiqueta">Coeficiente de correlación (r)</span>
            <strong class="coeficiente-valor" data-testid="valor-correlacion-sueno">
              {{ formatearCoeficiente(datosCorrelacion.sueno.coeficiente) }}
            </strong>
            <span class="coeficiente-magnitud">
              Relación {{ datosCorrelacion.sueno.sentido }} ({{ etiquetaFuerza(datosCorrelacion.sueno.fuerza) }})
            </span>
          </div>

          <p class="correlacion-explicacion">
            {{ datosCorrelacion.sueno.resumenRelacion }}
          </p>

          <div class="comparativa-grupos">
            <div v-if="datosCorrelacion.sueno.promedioGrupoBajoBpm !== null" class="grupo-item">
              <span>Días con menos de 7 h de sueño</span>
              <strong>{{ datosCorrelacion.sueno.promedioGrupoBajoBpm }} BPM</strong>
            </div>
            <div v-if="datosCorrelacion.sueno.promedioGrupoAltoBpm !== null" class="grupo-item">
              <span>Días con 7 h o más de sueño</span>
              <strong>{{ datosCorrelacion.sueno.promedioGrupoAltoBpm }} BPM</strong>
            </div>
          </div>
        </div>
      </article>
    </div>

    <!-- Registro opcional de sueño y estrés por día medido (si falta sueño en algún día registrado) -->
    <div
      v-if="diasConMedicion.length > 0"
      class="registro-opcional-card"
      data-testid="form-sueno-estres-opcional"
    >
      <div class="registro-opcional-header">
        <div>
          <h4>Completar Estrés o Sueño del Día (Opcional)</h4>
          <p>
            Si en alguno de tus días con medición no registraste las horas de sueño o deseas actualizar
            el factor de ese día en esta sesión, puedes indicarlo opcionalmente aquí.
          </p>
        </div>
      </div>

      <form class="registro-opcional-form" @submit.prevent="guardarFactorDia">
        <div class="campo-opcional">
          <label for="select-dia-factor">Día con medición propia</label>
          <select id="select-dia-factor" v-model="diaSeleccionado" class="input-opcional">
            <option v-for="d in diasConMedicion" :key="d.dia" :value="d.dia">
              {{ d.dia }} ({{ d.bpmPromedio }} BPM)
            </option>
          </select>
        </div>

        <div class="campo-opcional">
          <label for="select-estres-opcional">Nivel de estrés (ficha)</label>
          <select id="select-estres-opcional" v-model="estresOpcional" class="input-opcional">
            <option value="">Sin cambios / No indicar</option>
            <option value="bajo">Bajo (Tranquilo / Relajado)</option>
            <option value="medio">Medio (Normal / Cotidiano)</option>
            <option value="alto">Alto (Bajo presión / Preocupado)</option>
            <option value="muy_alto">Muy Alto (Estrés agudo / Ansiedad)</option>
          </select>
        </div>

        <div class="campo-opcional">
          <label for="select-sueno-opcional">Rango de sueño (opcional)</label>
          <select id="select-sueno-opcional" v-model="suenoRangoOpcional" class="input-opcional">
            <option value="">Sin declarar (opcional)</option>
            <option value="menos_5">Menos de 5 horas</option>
            <option value="5_6">5 a 6 horas</option>
            <option value="7_8">7 a 8 horas</option>
            <option value="mas_8">Más de 8 horas</option>
          </select>
        </div>

        <div class="campo-opcional">
          <label for="input-horas-sueno-opcional">Horas de sueño exactas (opcional)</label>
          <input
            id="input-horas-sueno-opcional"
            v-model="horasSuenoExactasOpcional"
            type="number"
            min="1"
            max="16"
            step="0.5"
            placeholder="Ej: 6.5"
            class="input-opcional input-opcional--corto"
            data-testid="input-horas-sueno-opcional"
          />
        </div>

        <button type="submit" class="btn-guardar-opcional">
          Aplicar al día
        </button>
      </form>

      <!-- Resumen por día de factores asociados -->
      <div v-if="datosCorrelacion.diasConsolidados.length > 0" class="tabla-factores-wrapper">
        <table class="tabla-factores">
          <thead>
            <tr>
              <th>Día</th>
              <th>BPM en reposo</th>
              <th>Estrés registrado</th>
              <th>Sueño registrado (opcional)</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="fila in datosCorrelacion.diasConsolidados" :key="fila.dia">
              <td><strong>{{ fila.dia }}</strong></td>
              <td>{{ fila.bpmPromedio }} BPM</td>
              <td>{{ fila.etiquetaEstres || 'No registrado' }}</td>
              <td>{{ fila.etiquetaSueno || 'No registrado' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Nota de privacidad de datos de salud -->
    <p class="nota-privacidad-salud" data-testid="nota-privacidad-salud">
      Privacidad de tus datos de salud: el nivel de estrés y las horas de sueño pertenecen a tu ficha personal
      protegida por cifrado y control de acceso por titular; solo tú puedes consultarlos en tu sesión activa.
    </p>
  </section>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { AVISO_CORRELACION_NO_CAUSA } from '../utils/correlacionEstresSueno.js'

const props = defineProps({
  correlacion: {
    type: Object,
    default: () => null
  },
  diasEvolucion: {
    type: Array,
    default: () => []
  }
})

const emit = defineEmits(['actualizar-factor-dia'])

const datosCorrelacion = computed(() => {
  if (props.correlacion && props.correlacion.estres && props.correlacion.sueno) {
    return props.correlacion
  }
  return {
    diasConsolidados: [],
    avisoNoCausalidad: AVISO_CORRELACION_NO_CAUSA,
    estres: {
      tieneDatosSuficientes: false,
      diasAnalizados: 0,
      coeficiente: null,
      mensajeDatosInsuficientes:
        'Aún no tienes días suficientes con mediciones de BPM y registros de estrés para calcular la relación.'
    },
    sueno: {
      tieneDatosSuficientes: false,
      diasAnalizados: 0,
      coeficiente: null,
      mensajeDatosInsuficientes:
        'Aún no tienes días suficientes con mediciones de BPM y registros de sueño para calcular la relación.'
    }
  }
})

const diasConMedicion = computed(() =>
  Array.isArray(props.diasEvolucion) ? props.diasEvolucion : []
)

const diaSeleccionado = ref('')
const estresOpcional = ref('')
const suenoRangoOpcional = ref('')
const horasSuenoExactasOpcional = ref('')

watch(
  diasConMedicion,
  (lista) => {
    if (lista.length > 0 && !diaSeleccionado.value) {
      diaSeleccionado.value = lista[lista.length - 1].dia
    }
  },
  { immediate: true }
)

function formatearCoeficiente(valor) {
  if (valor === null || valor === undefined || !Number.isFinite(Number(valor))) {
    return ''
  }
  const num = Number(valor)
  return num > 0 ? `+${num.toFixed(2)}` : num.toFixed(2)
}

function etiquetaFuerza(fuerza) {
  switch (fuerza) {
    case 'fuerte':
      return 'intensidad alta'
    case 'moderada':
      return 'intensidad moderada'
    case 'debil':
      return 'intensidad leve'
    default:
      return 'intensidad muy baja'
  }
}

function guardarFactorDia() {
  if (!diaSeleccionado.value) return
  emit('actualizar-factor-dia', {
    dia: diaSeleccionado.value,
    nivelEstres: estresOpcional.value || '',
    suenoHoras: suenoRangoOpcional.value || '',
    horasSuenoOpcional:
      horasSuenoExactasOpcional.value !== '' && Number.isFinite(Number(horasSuenoExactasOpcional.value))
        ? Number(horasSuenoExactasOpcional.value)
        : null
  })
}
</script>

<style scoped>
.correlacion-section {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 14px;
  padding: 1.35rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.15rem;
  box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04);
}

.correlacion-kicker {
  display: inline-block;
  font-size: 0.74rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #0284c7;
  margin-bottom: 0.25rem;
}

.correlacion-title {
  margin: 0 0 0.3rem 0;
  font-size: 1.22rem;
  font-weight: 800;
  color: #0f172a;
}

.correlacion-subtitle {
  margin: 0;
  font-size: 0.88rem;
  color: #475569;
}

.aviso-no-causalidad {
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-left: 4px solid #0284c7;
  border-radius: 10px;
  padding: 0.9rem 1.1rem;
  color: #1e3a8a;
  font-size: 0.86rem;
  line-height: 1.45;
}

.aviso-no-causalidad strong {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.88rem;
}

.aviso-no-causalidad p {
  margin: 0;
}

.correlacion-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(290px, 1fr));
  gap: 1rem;
}

.correlacion-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1.1rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
}

.correlacion-card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.65rem;
}

.correlacion-card-top h4 {
  margin: 0;
  font-size: 0.98rem;
  font-weight: 700;
  color: #0f172a;
}

.dias-badge {
  background: #e2e8f0;
  color: #334155;
  font-size: 0.74rem;
  font-weight: 700;
  padding: 0.2rem 0.55rem;
  border-radius: 999px;
  white-space: nowrap;
}

.aviso-pocos-datos {
  background: #fffbeb;
  border: 1px solid #fde68a;
  border-radius: 9px;
  padding: 0.85rem 1rem;
  color: #78350f;
  font-size: 0.85rem;
  line-height: 1.45;
}

.aviso-pocos-datos strong {
  display: block;
  margin-bottom: 0.25rem;
}

.aviso-pocos-datos p {
  margin: 0;
}

.correlacion-resultado {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.coeficiente-bloque {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 0.75rem 0.95rem;
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.coeficiente-etiqueta {
  font-size: 0.78rem;
  font-weight: 600;
  color: #475569;
}

.coeficiente-valor {
  font-size: 1.35rem;
  font-weight: 800;
  color: #0f172a;
}

.coeficiente-magnitud {
  font-size: 0.78rem;
  font-weight: 700;
  color: #0284c7;
}

.correlacion-explicacion {
  margin: 0;
  font-size: 0.86rem;
  color: #334155;
  line-height: 1.45;
}

.comparativa-grupos {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
  gap: 0.65rem;
}

.grupo-item {
  background: #ffffff;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  padding: 0.55rem 0.75rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
}

.grupo-item span {
  font-size: 0.73rem;
  color: #64748b;
}

.grupo-item strong {
  font-size: 0.92rem;
  color: #0f172a;
}

.registro-opcional-card {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 12px;
  padding: 1rem 1.2rem;
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.registro-opcional-header h4 {
  margin: 0 0 0.2rem 0;
  font-size: 0.95rem;
  color: #0f172a;
}

.registro-opcional-header p {
  margin: 0;
  font-size: 0.82rem;
  color: #475569;
}

.registro-opcional-form {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 0.75rem;
}

.campo-opcional {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}

.campo-opcional label {
  font-size: 0.74rem;
  font-weight: 600;
  color: #334155;
}

.input-opcional {
  height: 36px;
  padding: 0 0.65rem;
  border: 1px solid #cbd5e1;
  border-radius: 8px;
  font-size: 0.84rem;
  background: #ffffff;
  color: #0f172a;
}

.input-opcional--corto {
  width: 125px;
}

.btn-guardar-opcional {
  height: 36px;
  padding: 0 0.95rem;
  border-radius: 8px;
  border: 1px solid #0f172a;
  background: #0f172a;
  color: #ffffff;
  font-size: 0.82rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-guardar-opcional:hover {
  background: #1e293b;
}

.tabla-factores-wrapper {
  overflow-x: auto;
}

.tabla-factores {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.83rem;
  background: #ffffff;
  border-radius: 8px;
  overflow: hidden;
}

.tabla-factores th,
.tabla-factores td {
  padding: 0.55rem 0.75rem;
  text-align: left;
  border-bottom: 1px solid #f1f5f9;
}

.tabla-factores th {
  background: #f1f5f9;
  color: #475569;
  font-size: 0.73rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}

.nota-privacidad-salud {
  margin: 0;
  font-size: 0.78rem;
  color: #64748b;
}
</style>
