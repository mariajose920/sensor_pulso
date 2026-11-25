<template>
  <section class="retencion-panel" aria-labelledby="titulo-retencion" data-testid="panel-retencion">
    <div class="retencion-header">
      <div>
        <h2 id="titulo-retencion" class="retencion-titulo">Retención de datos</h2>
        <p class="retencion-desc">
          Los datos no se guardan para siempre: pasado un plazo se eliminan o se anonimizan automáticamente.
          Aquí ves los plazos, cuántos registros están pendientes hoy y qué se aplicó en las últimas ejecuciones.
        </p>
      </div>
      <button type="button" class="btn btn-secondary btn-sm" :disabled="cargando" @click="cargar">
        {{ cargando ? 'Actualizando...' : 'Actualizar' }}
      </button>
    </div>

    <div v-if="errorCarga" class="retencion-error" role="alert" data-testid="retencion-error">
      No se pudo consultar la retención: {{ errorCarga }}
      <button type="button" class="btn btn-secondary btn-sm" @click="cargar">Reintentar</button>
    </div>

    <div v-if="mensaje.texto" class="retencion-mensaje" :class="mensaje.error ? 'retencion-mensaje--error' : 'retencion-mensaje--ok'" :role="mensaje.error ? 'alert' : 'status'" data-testid="retencion-mensaje">
      {{ mensaje.texto }}
    </div>

    <!-- Indicadores -->
    <div class="indicadores" data-testid="retencion-indicadores">
      <div class="indicador">
        <span class="indicador-valor">{{ resumen.activas }}<small> de {{ resumen.total }}</small></span>
        <span class="indicador-etiqueta">Políticas activas</span>
      </div>
      <div class="indicador" :class="{ 'indicador-atencion': resumen.pendientes > 0 }">
        <span class="indicador-valor">{{ resumen.pendientes }}</span>
        <span class="indicador-etiqueta">Registros pendientes hoy</span>
      </div>
      <div class="indicador">
        <span class="indicador-valor indicador-valor--texto">{{ resumen.ultimaEjecucion ? fechaCorta(resumen.ultimaEjecucion) : 'Aún no se ha ejecutado' }}</span>
        <span class="indicador-etiqueta">Última ejecución</span>
      </div>
      <div class="indicador" :class="{ 'indicador-alerta': estadoCargado && !estado.programada }">
        <span class="indicador-valor indicador-valor--texto">
          {{ !estadoCargado ? '...' : estado.programada ? capitalizar(estado.horarioTexto) : 'No programada' }}
        </span>
        <span class="indicador-etiqueta">Ejecución automática</span>
      </div>
    </div>

    <div v-if="estadoCargado && !estado.programada" class="retencion-aviso" role="status" data-testid="retencion-sin-agenda">
      <strong>La ejecución automática no está programada.</strong>
      {{ estado.cronDisponible
        ? 'La extensión de tareas programadas existe, pero no hay un trabajo diario para la retención. Vuelve a ejecutar la migración de retención.'
        : 'La extensión de tareas programadas (pg_cron) no está activada en Supabase, así que las políticas no se aplicarán solas. Actívala en Database → Extensions y vuelve a ejecutar la migración, o usa «Aplicar ahora».' }}
    </div>

    <!-- Políticas -->
    <div class="bloque">
      <h3 class="bloque-titulo">Plazos de conservación</h3>
      <div v-if="cargando && politicas.length === 0" class="estado-vacio">Cargando las políticas de retención...</div>
      <div v-else class="tabla-scroll">
        <table class="tabla-retencion" data-testid="tabla-retencion">
          <thead>
            <tr>
              <th scope="col">Datos</th>
              <th scope="col">Tipo</th>
              <th scope="col">Qué ocurre</th>
              <th scope="col">Plazo</th>
              <th scope="col">Pendientes hoy</th>
              <th scope="col">Última ejecución</th>
              <th scope="col"><span class="sr-only">Acciones</span></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="p in politicas" :key="p.tabla" :class="{ 'fila-inactiva': !p.activa }" :data-testid="`retencion-fila-${p.tabla}`">
              <td>
                <strong class="dato-nombre">{{ p.nombre }}</strong>
                <span class="dato-detalle">{{ p.detalle }}</span>
              </td>
              <td><EtiquetaClaseDato :clase="p.clase" compacta /></td>
              <td>
                <span class="chip-accion" :class="`chip-accion--${p.accion}`" :title="ACCIONES_RETENCION[p.accion].explicacion">
                  {{ ACCIONES_RETENCION[p.accion].etiqueta }}
                </span>
                <span v-if="!p.activa" class="chip-pausada">En pausa</span>
              </td>
              <td>
                <strong>{{ p.plazoTexto }}</strong>
                <span class="dato-detalle">{{ p.dias }} días</span>
              </td>
              <td>
                <span class="pendientes" :class="{ 'pendientes--hay': p.pendientes > 0 && p.activa }">{{ p.pendientes }}</span>
              </td>
              <td class="col-ultima">
                <template v-if="p.ultimaEjecucion">
                  {{ fechaCorta(p.ultimaEjecucion) }}
                  <span class="dato-detalle">{{ p.ultimasFilas ?? 0 }} registro(s)</span>
                </template>
                <template v-else>—</template>
              </td>
              <td class="col-acciones">
                <button type="button" class="btn btn-secondary btn-sm" :data-testid="`retencion-editar-${p.tabla}`" @click="abrirEdicion(p)">Editar</button>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Aplicar ahora -->
    <div class="bloque bloque-aplicar">
      <div>
        <h3 class="bloque-titulo">Aplicar la retención ahora</h3>
        <p class="bloque-desc">
          Normalmente se aplica sola cada día. Si hay registros pendientes, puedes adelantarla. La acción no se puede deshacer y queda registrada en la auditoría.
        </p>
      </div>
      <button
        type="button"
        class="btn btn-primary"
        :disabled="resumen.pendientes === 0 || aplicando"
        data-testid="retencion-aplicar"
        @click="abrirAplicar"
      >
        {{ aplicando ? 'Aplicando...' : `Aplicar ahora (${resumen.pendientes})` }}
      </button>
    </div>

    <!-- Historial -->
    <div class="bloque">
      <h3 class="bloque-titulo">Últimas ejecuciones</h3>
      <p v-if="ejecuciones.length === 0" class="estado-vacio" data-testid="retencion-sin-historial">Todavía no hay ejecuciones registradas.</p>
      <ul v-else class="historial" data-testid="retencion-historial">
        <li v-for="e in ejecuciones" :key="e.id" class="historial-item">
          <details>
            <summary>
              <span class="historial-fecha">{{ fechaCorta(e.fecha) }}</span>
              <span class="chip-origen" :class="`chip-origen--${e.origen}`">{{ e.origen === 'manual' ? 'Manual' : 'Automática' }}</span>
              <span class="historial-filas">{{ e.filas }} registro(s) eliminados o anonimizados</span>
            </summary>
            <ul v-if="e.porTabla.some(t => t.filas > 0)" class="historial-detalle">
              <li v-for="t in e.porTabla.filter(x => x.filas > 0)" :key="t.tabla"><span>{{ t.nombre }}</span><strong>{{ t.filas }}</strong></li>
            </ul>
            <p v-else class="historial-nada">No había nada que eliminar en esa ejecución.</p>
          </details>
        </li>
      </ul>
    </div>

    <!-- Lo que nunca se elimina -->
    <div class="bloque">
      <h3 class="bloque-titulo">Lo que la retención nunca toca</h3>
      <ul class="excepciones" data-testid="retencion-excepciones">
        <li v-for="x in NUNCA_SE_ELIMINA" :key="x.titulo">
          <strong>{{ x.titulo }}</strong>
          <span>{{ x.motivo }}</span>
        </li>
      </ul>
    </div>

    <!-- Editar una política -->
    <div v-if="edicion" class="modal-fondo" @click.self="cerrarEdicion" @keydown.esc="cerrarEdicion">
      <div class="modal-caja" role="dialog" aria-modal="true" aria-labelledby="titulo-editar-retencion" data-testid="retencion-modal-editar">
        <h3 id="titulo-editar-retencion" class="modal-titulo">Editar: {{ edicion.nombre }}</h3>
        <p class="modal-texto">{{ ACCIONES_RETENCION[edicion.accion].explicacion }}</p>

        <label class="campo">
          <span>Plazo de conservación (días)</span>
          <input v-model="formDias" type="text" inputmode="numeric" class="form-input" data-testid="retencion-input-dias" @keydown.enter.prevent="guardarEdicion" />
          <small>Entre {{ LIMITE_DIAS.min }} y {{ LIMITE_DIAS.max }} días. Equivale a {{ plazoFormulario }}.</small>
        </label>

        <label class="chequeo">
          <input v-model="formActiva" type="checkbox" data-testid="retencion-check-activa" />
          Política activa
        </label>
        <p v-if="!formActiva" class="modal-advertencia">En pausa, esta política no se aplicará y los datos se seguirán conservando.</p>
        <p v-else-if="diasAcortados" class="modal-advertencia" data-testid="retencion-advertencia-acortar">
          Al acortar el plazo, los datos más antiguos que el nuevo plazo se eliminarán en la próxima ejecución.
        </p>

        <p v-if="errorEdicion" class="modal-error" role="alert">{{ errorEdicion }}</p>
        <div class="modal-acciones">
          <button type="button" class="btn btn-secondary" :disabled="guardando" @click="cerrarEdicion">Cancelar</button>
          <button type="button" class="btn btn-primary" :disabled="guardando" data-testid="retencion-guardar" @click="guardarEdicion">
            {{ guardando ? 'Guardando...' : 'Guardar cambios' }}
          </button>
        </div>
      </div>
    </div>

    <!-- Confirmar aplicar ahora -->
    <div v-if="confirmandoAplicar" class="modal-fondo" @click.self="cerrarAplicar" @keydown.esc="cerrarAplicar">
      <div class="modal-caja" role="dialog" aria-modal="true" aria-labelledby="titulo-aplicar-retencion" data-testid="retencion-modal-aplicar">
        <h3 id="titulo-aplicar-retencion" class="modal-titulo">Aplicar la retención ahora</h3>
        <p class="modal-texto">Se aplicará a las políticas activas con registros pendientes:</p>
        <ul class="lista-pendientes">
          <li v-for="p in pendientesActivos" :key="p.tabla">
            <span>{{ p.nombre }} <small>({{ ACCIONES_RETENCION[p.accion].etiqueta.toLowerCase() }})</small></span>
            <strong>{{ p.pendientes }}</strong>
          </li>
        </ul>
        <label class="chequeo">
          <input v-model="entiendo" type="checkbox" data-testid="retencion-check-entiendo" />
          Entiendo que esto elimina o anonimiza datos y no se puede deshacer.
        </label>
        <div class="modal-acciones">
          <button type="button" class="btn btn-secondary" :disabled="aplicando" @click="cerrarAplicar">Cancelar</button>
          <button type="button" class="btn btn-primary" :disabled="!entiendo || aplicando" data-testid="retencion-confirmar-aplicar" @click="aplicar">
            {{ aplicando ? 'Aplicando...' : 'Aplicar ahora' }}
          </button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import EtiquetaClaseDato from './EtiquetaClaseDato.vue'
import { ACCIONES_RETENCION, NUNCA_SE_ELIMINA, LIMITE_DIAS, formatearPlazo, validarDias } from '../data/retencion.js'
import {
  listarPoliticas,
  obtenerEstadoRetencion,
  listarEjecuciones,
  actualizarPolitica,
  aplicarRetencionAhora,
  resumirPoliticas,
  normalizarEstado
} from '../services/retencionService.js'

const politicas = ref([])
const estado = ref(normalizarEstado({}))
const estadoCargado = ref(false)
const ejecuciones = ref([])
const cargando = ref(false)
const errorCarga = ref('')
const mensaje = ref({ texto: '', error: false })

const edicion = ref(null)
const formDias = ref('')
const formActiva = ref(true)
const errorEdicion = ref('')
const guardando = ref(false)

const confirmandoAplicar = ref(false)
const entiendo = ref(false)
const aplicando = ref(false)

const resumen = computed(() => resumirPoliticas(politicas.value))
const pendientesActivos = computed(() => politicas.value.filter(p => p.activa && p.pendientes > 0))

const plazoFormulario = computed(() => {
  const v = validarDias(formDias.value)
  return v.ok ? formatearPlazo(v.dias) : '—'
})
const diasAcortados = computed(() => {
  const v = validarDias(formDias.value)
  return Boolean(edicion.value && v.ok && v.dias < edicion.value.dias)
})

const capitalizar = (t) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '')

function fechaCorta(iso) {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function cargar() {
  cargando.value = true
  errorCarga.value = ''
  try {
    const [pol, est, ejec] = await Promise.all([listarPoliticas(), obtenerEstadoRetencion(), listarEjecuciones(8)])
    if (!pol.ok) errorCarga.value = pol.error
    else if (!est.ok) errorCarga.value = est.error
    else if (!ejec.ok) errorCarga.value = ejec.error
    politicas.value = pol.politicas
    estado.value = est.estado
    estadoCargado.value = est.ok
    ejecuciones.value = ejec.ejecuciones
  } finally {
    cargando.value = false
  }
}

function abrirEdicion(p) {
  edicion.value = p
  formDias.value = String(p.dias)
  formActiva.value = p.activa
  errorEdicion.value = ''
}

function cerrarEdicion() {
  if (guardando.value) return
  edicion.value = null
}

async function guardarEdicion() {
  if (!edicion.value || guardando.value) return
  const v = validarDias(formDias.value)
  if (!v.ok) {
    errorEdicion.value = v.error
    return
  }
  guardando.value = true
  errorEdicion.value = ''
  try {
    const res = await actualizarPolitica({ tabla: edicion.value.tabla, dias: v.dias, activa: formActiva.value })
    if (!res.ok) {
      errorEdicion.value = res.error
      return
    }
    mensaje.value = { texto: `Se actualizó la política de «${edicion.value.nombre}». El cambio quedó registrado en la auditoría.`, error: false }
    edicion.value = null
    await cargar()
  } finally {
    guardando.value = false
  }
}

function abrirAplicar() {
  entiendo.value = false
  confirmandoAplicar.value = true
}

function cerrarAplicar() {
  if (aplicando.value) return
  confirmandoAplicar.value = false
}

async function aplicar() {
  if (!entiendo.value || aplicando.value) return
  aplicando.value = true
  try {
    const res = await aplicarRetencionAhora()
    confirmandoAplicar.value = false
    mensaje.value = res.ok
      ? { texto: `Retención aplicada: ${res.filas} registro(s) eliminados o anonimizados. Quedó registrado en la auditoría.`, error: false }
      : { texto: `No se pudo aplicar la retención: ${res.error}`, error: true }
    await cargar()
  } finally {
    aplicando.value = false
  }
}

onMounted(cargar)
defineExpose({ cargar })
</script>

<style scoped>
.retencion-panel { display: flex; flex-direction: column; gap: 1.25rem; }

.retencion-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 1rem; flex-wrap: wrap; }
.retencion-titulo { margin: 0 0 0.3rem; font-size: 1.18rem; font-weight: 700; color: #0f172a; }
.retencion-desc { margin: 0; max-width: 64ch; font-size: 0.88rem; line-height: 1.5; color: var(--color-muted, #64748b); }

.retencion-error, .retencion-mensaje, .retencion-aviso {
  padding: 0.7rem 0.9rem; border-radius: 0.5rem; font-size: 0.86rem; line-height: 1.5;
}
.retencion-error { display: flex; align-items: center; justify-content: space-between; gap: 0.75rem; flex-wrap: wrap; border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; }
.retencion-mensaje--ok { border: 1px solid #a7f3d0; background: #ecfdf5; color: #047857; }
.retencion-mensaje--error { border: 1px solid #fecaca; background: #fef2f2; color: #b91c1c; }
.retencion-aviso { border: 1px solid #fde68a; background: #fffbeb; color: #92400e; }

.indicadores { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 0.75rem; }
.indicador { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.85rem 1rem; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 0.6rem; }
.indicador-valor { font-size: 1.6rem; font-weight: 800; line-height: 1.1; color: #0f172a; }
.indicador-valor small { font-size: 0.8rem; font-weight: 600; color: #64748b; }
.indicador-valor--texto { font-size: 1rem; line-height: 1.3; padding-top: 0.35rem; }
.indicador-etiqueta { font-size: 0.74rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.03em; color: #64748b; }
.indicador-atencion { background: #fffbeb; border-color: #fde68a; }
.indicador-atencion .indicador-valor { color: #b45309; }
.indicador-alerta { background: #fef2f2; border-color: #fecaca; }
.indicador-alerta .indicador-valor { color: #b91c1c; }

.bloque-titulo { margin: 0 0 0.6rem; font-size: 1.05rem; }
.bloque-desc { margin: 0; max-width: 60ch; font-size: 0.85rem; color: #64748b; line-height: 1.5; }
.estado-vacio { padding: 1rem; text-align: center; color: #64748b; font-size: 0.88rem; }

.tabla-scroll { overflow-x: auto; border: 1px solid #e2e8f0; border-radius: 0.6rem; }
.tabla-retencion { width: 100%; min-width: 860px; border-collapse: collapse; font-size: 0.85rem; }
.tabla-retencion th, .tabla-retencion td { padding: 0.7rem 0.75rem; text-align: left; vertical-align: top; border-bottom: 1px solid #e2e8f0; }
.tabla-retencion thead th { background: #f8fafc; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #475569; }
.tabla-retencion tbody tr:last-child td { border-bottom: none; }
.fila-inactiva { background: #f8fafc; color: #64748b; }
.dato-nombre { display: block; color: #0f172a; }
.dato-detalle { display: block; margin-top: 0.15rem; font-size: 0.74rem; color: #64748b; line-height: 1.4; max-width: 34ch; }
.col-ultima { white-space: nowrap; }
.col-acciones { text-align: right; white-space: nowrap; }

.chip-accion { display: inline-block; padding: 0.18rem 0.55rem; border-radius: 0.4rem; font-size: 0.74rem; font-weight: 700; }
.chip-accion--borrar { background: #fee2e2; color: #b91c1c; }
.chip-accion--anonimizar { background: #ede9fe; color: #5b21b6; }
.chip-pausada { display: inline-block; margin-left: 0.4rem; padding: 0.18rem 0.5rem; border-radius: 0.4rem; background: #e2e8f0; color: #475569; font-size: 0.7rem; font-weight: 700; }
.pendientes { font-weight: 700; color: #64748b; }
.pendientes--hay { color: #b45309; }

.bloque-aplicar { display: flex; align-items: center; justify-content: space-between; gap: 1rem; flex-wrap: wrap; padding: 1rem 1.1rem; border: 1px solid #e2e8f0; border-radius: 0.6rem; background: #f8fafc; }
.bloque-aplicar .bloque-titulo { margin-bottom: 0.25rem; }

.historial { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 0.4rem; }
.historial-item { border: 1px solid #e2e8f0; border-radius: 0.5rem; background: #ffffff; padding: 0.55rem 0.8rem; }
.historial-item summary { display: flex; align-items: center; flex-wrap: wrap; gap: 0.5rem 0.75rem; cursor: pointer; font-size: 0.85rem; }
.historial-fecha { font-weight: 700; color: #0f172a; }
.historial-filas { color: #475569; }
.chip-origen { padding: 0.12rem 0.5rem; border-radius: 999px; font-size: 0.7rem; font-weight: 700; }
.chip-origen--automatica { background: #e0f2fe; color: #0369a1; }
.chip-origen--manual { background: #fef3c7; color: #92400e; }
.historial-detalle { list-style: none; margin: 0.5rem 0 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(260px, 1fr)); gap: 0.3rem 1.5rem; }
.historial-detalle li { display: flex; justify-content: space-between; gap: 0.5rem; font-size: 0.82rem; padding: 0.2rem 0; border-bottom: 1px dashed #e2e8f0; }
.historial-nada { margin: 0.5rem 0 0; font-size: 0.82rem; color: #64748b; }

.excepciones { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 0.6rem; }
.excepciones li { display: flex; flex-direction: column; gap: 0.2rem; padding: 0.75rem 0.9rem; border: 1px solid #a7f3d0; border-left: 4px solid #10b981; border-radius: 0.5rem; background: #f0fdf4; font-size: 0.84rem; line-height: 1.45; color: #334155; }
.excepciones strong { color: #065f46; }

.modal-fondo { position: fixed; inset: 0; z-index: 50; display: flex; align-items: center; justify-content: center; padding: 1rem; background: rgba(15, 23, 42, 0.5); }
.modal-caja { width: 100%; max-width: 480px; max-height: 90vh; overflow-y: auto; padding: 1.25rem 1.4rem; background: #ffffff; border-radius: 0.75rem; box-shadow: 0 20px 40px rgba(15, 23, 42, 0.25); }
.modal-titulo { margin: 0 0 0.5rem; font-size: 1.1rem; }
.modal-texto { margin: 0 0 0.85rem; font-size: 0.86rem; line-height: 1.5; color: #475569; }
.campo { display: flex; flex-direction: column; gap: 0.3rem; margin-bottom: 0.85rem; font-size: 0.85rem; font-weight: 600; }
.campo small { font-weight: 400; color: #64748b; }
.chequeo { display: flex; align-items: flex-start; gap: 0.5rem; margin: 0.5rem 0; font-size: 0.85rem; cursor: pointer; }
.modal-advertencia { margin: 0.5rem 0; padding: 0.5rem 0.7rem; border-radius: 0.4rem; background: #fffbeb; color: #92400e; font-size: 0.82rem; line-height: 1.45; }
.modal-error { margin: 0.5rem 0; color: #b91c1c; font-size: 0.84rem; font-weight: 600; }
.modal-acciones { display: flex; justify-content: flex-end; gap: 0.6rem; margin-top: 1rem; }
.lista-pendientes { list-style: none; margin: 0 0 0.85rem; padding: 0; display: flex; flex-direction: column; gap: 0.3rem; }
.lista-pendientes li { display: flex; justify-content: space-between; gap: 0.5rem; padding: 0.35rem 0; border-bottom: 1px dashed #e2e8f0; font-size: 0.86rem; }

.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; }
</style>
