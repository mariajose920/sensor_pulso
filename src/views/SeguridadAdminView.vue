<template>
  <div class="seguridad-admin">
    <header class="encabezado-seguridad">
      <h1 class="card-title">Seguridad y privacidad — Gestión de solicitudes de derechos</h1>
      <p class="intro">
        Atención de solicitudes de acceso, rectificación, supresión, oposición y portabilidad dentro del plazo legal
        ({{ PLAZO_RESPUESTA_DIAS }} días corridos), además del registro de incidentes y brechas. Todo queda registrado en la auditoría.
      </p>
    </header>

    <div class="pestanas" role="tablist">
      <button
        v-for="p in PESTANAS"
        :key="p.id"
        role="tab"
        type="button"
        class="pestana"
        :class="{ activa: pestana === p.id }"
        :aria-selected="pestana === p.id"
        :data-testid="'pestana-' + p.id"
        @click="pestana = p.id"
      >
        {{ p.texto }}
      </button>
    </div>

    <p v-if="aviso.texto" class="alerta" :class="aviso.tipo" role="status" data-testid="seguridad-aviso">
      {{ aviso.texto }}
    </p>

    <!-- ============================================================ SOLICITUDES -->
    <section v-if="pestana === 'solicitudes'" data-testid="panel-solicitudes">
      <!-- Resumen KPI de plazos legales -->
      <div class="resumen-plazos-grid" data-testid="resumen-plazos-admin">
        <div class="kpi-plazo-card">
          <span class="kpi-etiqueta">Abiertas pendientes</span>
          <strong class="kpi-valor" data-testid="kpi-abiertas">{{ resumenPlazos.abiertas }}</strong>
        </div>
        <div class="kpi-plazo-card ambar">
          <span class="kpi-etiqueta">Próximas a vencer ({{ DIAS_PROXIMA_A_VENCER }} días o menos)</span>
          <strong class="kpi-valor" data-testid="kpi-proximas">{{ resumenPlazos.proximasAVencer }}</strong>
        </div>
        <div class="kpi-plazo-card rojo">
          <span class="kpi-etiqueta">Solicitudes vencidas</span>
          <strong class="kpi-valor" data-testid="kpi-vencidas">{{ resumenPlazos.vencidas }}</strong>
        </div>
        <div class="kpi-plazo-card verde">
          <span class="kpi-etiqueta">Respondidas dentro de plazo</span>
          <strong class="kpi-valor" data-testid="kpi-respondidas">{{ resumenPlazos.respondidas }}</strong>
        </div>
      </div>

      <!-- Barra de filtros rápidos y buscador -->
      <div class="barra-filtros-solicitudes">
        <div class="filtros-pildoras" role="group" aria-label="Filtrar solicitudes por plazo y estado">
          <button
            type="button"
            class="pildora-filtro"
            :class="{ activa: filtroPlazo === 'abiertas' }"
            data-testid="filtro-abiertas"
            @click="cambiarFiltroPlazo('abiertas')"
          >
            Todas las abiertas ({{ resumenPlazos.abiertas }})
          </button>
          <button
            type="button"
            class="pildora-filtro"
            :class="{ activa: filtroPlazo === 'proximas' }"
            data-testid="filtro-proximas"
            @click="cambiarFiltroPlazo('proximas')"
          >
            Próximas a vencer ({{ resumenPlazos.proximasAVencer }})
          </button>
          <button
            type="button"
            class="pildora-filtro"
            :class="{ activa: filtroPlazo === 'vencidas' }"
            data-testid="filtro-vencidas"
            @click="cambiarFiltroPlazo('vencidas')"
          >
            Vencidas ({{ resumenPlazos.vencidas }})
          </button>
          <button
            type="button"
            class="pildora-filtro"
            :class="{ activa: filtroPlazo === 'respondidas' }"
            data-testid="filtro-respondidas"
            @click="cambiarFiltroPlazo('respondidas')"
          >
            Respondidas ({{ resumenPlazos.respondidas }})
          </button>
          <button
            type="button"
            class="pildora-filtro"
            :class="{ activa: filtroPlazo === 'todas' }"
            data-testid="filtro-todas"
            @click="cambiarFiltroPlazo('todas')"
          >
            Todas ({{ resumenPlazos.total }})
          </button>
        </div>

        <div class="controles-derecha-solicitudes">
          <input
            v-model="busqueda"
            type="search"
            class="form-input buscador-solicitudes"
            placeholder="Buscar por titular o correo..."
            aria-label="Buscar solicitudes por titular o correo"
            data-testid="buscar-solicitudes"
          />
          <label class="check">
            <input v-model="soloAbiertas" type="checkbox" @change="alCambiarCheckAbiertas" />
            Solo abiertas
          </label>
        </div>
      </div>

      <p v-if="!solicitudesFiltradas.length" class="vacio card">
        No hay solicitudes que coincidan con el filtro seleccionado.
      </p>

      <div v-else class="lista-solicitudes-admin">
        <article
          v-for="s in solicitudesFiltradas"
          :key="s.id"
          class="card item tarjeta-solicitud-admin"
          :class="{
            vencida: vencida(s),
            proxima: proxima(s),
            respondida: s.estado === 'resuelta' || s.estado === 'rechazada'
          }"
          :data-testid="'solicitud-' + s.id"
        >
          <header class="cabecera-solicitud-admin">
            <div class="titulo-y-badges">
              <strong class="tipo-derecho-titulo">{{ etiquetaTipo(s.tipo) }}</strong>
              <span class="estado badge-estado" :class="s.estado">{{ etiquetaEstado(s.estado) }}</span>
              <span
                v-if="vencida(s)"
                class="plazo badge-plazo rojo"
                data-testid="badge-solicitud-vencida"
              >
                Solicitud vencida · {{ plazo(s) }}
              </span>
              <span
                v-else-if="proxima(s)"
                class="plazo badge-plazo ambar"
                data-testid="badge-solicitud-proxima"
              >
                Próxima a vencer · {{ plazo(s) }}
              </span>
              <span v-else-if="plazo(s)" class="plazo badge-plazo azul">
                {{ plazo(s) }}
              </span>
            </div>
            <span class="meta-fechas-solicitud">
              Recibida el {{ fecha(s.recibida_en) }}
              <template v-if="s.vence_en"> · <strong>Fecha límite:</strong> {{ fecha(s.vence_en) }}</template>
              <template v-if="s.resuelta_en"> · Respondida el {{ fecha(s.resuelta_en) }}</template>
            </span>
          </header>

          <!-- Solo lo necesario para responder: quién pide y qué pide -->
          <p class="quien">
            <strong>Titular:</strong> {{ s.perfil?.nombre || 'Sin nombre' }} · {{ s.perfil?.correo || 'Sin correo' }}
          </p>

          <p v-if="s.detalle" class="detalle recuadro-detalle">
            {{ s.detalle }}
          </p>

          <div v-if="s.estado === 'recibida' || s.estado === 'en_proceso'" class="responder">
            <label class="form-label etiqueta-respuesta" :for="'resp-' + s.id">
              Respuesta oficial para el titular
            </label>
            <textarea
              :id="'resp-' + s.id"
              v-model="respuestas[s.id]"
              class="form-input"
              rows="2"
              maxlength="2000"
              placeholder="Escribe la respuesta que verá la persona en su sección Mis datos..."
              :data-testid="'respuesta-' + s.id"
            ></textarea>
            <div class="acciones">
              <button
                v-if="s.estado === 'recibida'"
                type="button"
                class="btn btn-secondary"
                :data-testid="'en-curso-' + s.id"
                @click="resolver(s, 'en_proceso')"
              >
                Marcar en curso
              </button>
              <button
                type="button"
                class="btn btn-primary"
                :data-testid="'resolver-' + s.id"
                @click="resolver(s, 'resuelta')"
              >
                Responder al titular
              </button>
              <button
                type="button"
                class="btn btn-secondary"
                :data-testid="'rechazar-' + s.id"
                @click="resolver(s, 'rechazada')"
              >
                Rechazar
              </button>
            </div>
          </div>

          <div v-else-if="s.respuesta" class="respuesta-enviada-box" :class="s.estado">
            <strong>Respuesta enviada al titular:</strong>
            <p class="detalle">{{ s.respuesta }}</p>
          </div>
        </article>
      </div>
    </section>

    <!-- ============================================================ INCIDENTES -->
    <section v-else data-testid="panel-incidentes" class="panel-incidentes-grid">
      <div class="procedimiento-brechas-grid" data-testid="procedimiento-brechas-panel">
        <article class="card proc-brecha-card" data-testid="flujo-notificacion-brechas">
          <h2>Procedimiento de notificación de brechas</h2>
          <p class="ayuda">
            Define quién avisa, a quién y en qué plazo ante una brecha de datos personales, registrando siempre la fecha de aviso en cada incidente.
          </p>
          <div class="proc-tabla-wrap">
            <table class="proc-tabla">
              <thead>
                <tr>
                  <th>Quién avisa</th>
                  <th>A quién</th>
                  <th>En qué plazo</th>
                  <th>Cómo</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="regla in PROCEDIMIENTO_NOTIFICACION_BRECHAS" :key="regla.id">
                  <td><strong>{{ regla.quienAvisa }}</strong></td>
                  <td>{{ regla.aQuien }}</td>
                  <td>{{ regla.plazo }}</td>
                  <td>{{ regla.como }}</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div class="pendiente-unach-box" data-testid="pendiente-decision-humana-brechas">
            <strong>Pendiente de decisión humana (UNACH):</strong>
            <ul class="pendiente-lista">
              <li v-for="(item, idx) in PENDIENTES_DECISION_HUMANA_BRECHAS" :key="idx">{{ item }}</li>
            </ul>
          </div>
        </article>

        <article class="card proc-brecha-card" data-testid="plantilla-aviso-card">
          <h2>Plantilla de aviso a personas afectadas</h2>
          <p class="ayuda">
            Lista para usar al notificar por correo institucional (sujeta a aprobación formal por la UNACH). No incluyas datos de salud ni credenciales en el mensaje.
          </p>
          <div class="form-group">
            <label class="form-label" for="plantilla-asunto">Asunto</label>
            <input id="plantilla-asunto" v-model="plantillaAviso.asunto" class="form-input" readonly data-testid="plantilla-asunto-brecha" />
          </div>
          <div class="form-group">
            <label class="form-label" for="plantilla-cuerpo">Mensaje de aviso</label>
            <textarea
              id="plantilla-cuerpo"
              v-model="plantillaAviso.cuerpo"
              class="form-input plantilla-textarea"
              rows="11"
              data-testid="plantilla-aviso-brecha"
            ></textarea>
          </div>
          <div class="acciones">
            <button type="button" class="btn btn-primary" data-testid="btn-copiar-plantilla-brecha" @click="copiarPlantillaAviso">
              Copiar plantilla
            </button>
            <button type="button" class="btn btn-secondary" data-testid="btn-restablecer-plantilla-brecha" @click="restablecerPlantillaAviso">
              Restablecer plantilla base
            </button>
          </div>
        </article>
      </div>

      <article class="card simulacro-card" data-testid="registro-simulacro-brecha">
        <div class="simulacro-header">
          <div>
            <h2>Simulacro con brecha ficticia</h2>
            <p class="ayuda">Ejercicio de verificación del flujo de notificación a afectados, registro de fechas y uso de plantilla.</p>
          </div>
          <button
            type="button"
            class="btn btn-secondary"
            :disabled="ejecutandoSimulacro"
            data-testid="btn-ejecutar-simulacro-brecha"
            @click="ejecutarSimulacro"
          >
            {{ ejecutandoSimulacro ? 'Registrando simulacro...' : 'Registrar simulacro con brecha ficticia' }}
          </button>
        </div>
        <div class="simulacro-meta-grid">
          <div class="simulacro-meta-item">
            <span class="simulacro-meta-label">Fecha</span>
            <strong data-testid="simulacro-fecha">{{ simulacroActual.fecha }}</strong>
          </div>
          <div class="simulacro-meta-item">
            <span class="simulacro-meta-label">Responsable</span>
            <strong data-testid="simulacro-responsable">{{ simulacroActual.responsable }}</strong>
          </div>
          <div class="simulacro-meta-item">
            <span class="simulacro-meta-label">Estado del ejercicio</span>
            <span class="badge-plazo ok">Registrado y verificado</span>
          </div>
        </div>
        <p class="detalle"><strong>Escenario ficticio:</strong> {{ simulacroActual.escenario }}</p>
        <p class="detalle" data-testid="simulacro-resultado"><strong>Resultado:</strong> {{ simulacroActual.resultado }}</p>
      </article>

      <form class="card" @submit.prevent="crear">
        <h2>Registrar un incidente</h2>
        <div class="form-group">
          <label class="form-label" for="inc-titulo">Título</label>
          <input id="inc-titulo" v-model="nuevo.titulo" class="form-input" maxlength="200" data-testid="incidente-titulo" />
        </div>
        <div class="form-group">
          <label class="form-label" for="inc-desc">Qué pasó</label>
          <textarea id="inc-desc" v-model="nuevo.descripcion" class="form-input" rows="3" maxlength="4000" placeholder="Hechos y fecha. No pegues datos personales ni de salud."></textarea>
        </div>
        <div class="fila">
          <label class="form-label" for="inc-sev">Severidad</label>
          <select id="inc-sev" v-model="nuevo.severidad" class="form-input" data-testid="incidente-severidad">
            <option v-for="sv in SEVERIDADES" :key="sv" :value="sv">{{ sv }}</option>
          </select>
          <label class="check"><input v-model="nuevo.afectaDatosPersonales" type="checkbox" data-testid="incidente-datos" /> Afecta datos personales</label>
        </div>
        <button type="submit" class="btn btn-primary" data-testid="incidente-crear">Registrar incidente</button>
      </form>

      <p v-if="!incidentes.length" class="vacio">No hay incidentes registrados.</p>
      <article v-for="i in incidentes" :key="i.id" class="card item" :data-testid="'incidente-' + i.id">
        <header>
          <strong>{{ i.titulo }}</strong>
          <span class="sev" :class="i.severidad">{{ i.severidad }}</span>
          <select :value="i.estado" class="form-input estado-select" :aria-label="'Estado de ' + i.titulo" @change="cambiarEstado(i, $event.target.value)">
            <option v-for="(t, v) in ESTADOS_INCIDENTE" :key="v" :value="v">{{ t }}</option>
          </select>
        </header>
        <p class="quien">Abierto el {{ fecha(i.abierto_en) }}<template v-if="i.cerrado_en"> · cerrado el {{ fecha(i.cerrado_en) }}</template></p>
        <p v-if="i.descripcion" class="detalle">{{ i.descripcion }}</p>
        <p v-if="i.lecciones" class="detalle lecciones-incidente"><strong>Lecciones / Resultado:</strong> {{ i.lecciones }}</p>

        <!-- Brecha: solo cuando afecta datos personales -->
        <div v-if="i.afecta_datos_personales" class="brecha" :data-testid="'brecha-' + i.id">
          <strong>Brecha de datos personales</strong>
          <p class="ayuda">Avisa a las personas afectadas y a la autoridad competente según corresponda; guarda aquí la fecha en que lo hiciste.</p>
          <div class="fila">
            <input v-model="brechas[i.id].afectadosEstimados" class="form-input corto" type="number" min="0" placeholder="Afectados (est.)" :aria-label="'Afectados estimados de ' + i.titulo" />
            <input v-model="brechas[i.id].datosComprometidos" class="form-input" placeholder="Qué datos (tipos, no contenido)" :aria-label="'Datos comprometidos de ' + i.titulo" />
          </div>
          <textarea v-model="brechas[i.id].medidas" class="form-input" rows="2" placeholder="Medidas tomadas" :aria-label="'Medidas de ' + i.titulo"></textarea>
          <p class="ayuda">
            Afectados: {{ i.brecha?.afectados_notificados_en ? 'notificados el ' + fecha(i.brecha.afectados_notificados_en) : 'sin notificar' }}
            · Autoridad: {{ i.brecha?.autoridad_notificada_en ? 'notificada el ' + fecha(i.brecha.autoridad_notificada_en) : 'sin notificar' }}
          </p>
          <div class="acciones">
            <button type="button" class="btn btn-secondary" :data-testid="'brecha-guardar-' + i.id" @click="guardarBrecha(i)">Guardar</button>
            <button type="button" class="btn btn-secondary" :disabled="Boolean(i.brecha?.afectados_notificados_en)" @click="guardarBrecha(i, { notificarAfectados: true })">Marcar afectados notificados</button>
            <button type="button" class="btn btn-secondary" :disabled="Boolean(i.brecha?.autoridad_notificada_en)" @click="guardarBrecha(i, { notificarAutoridad: true })">Marcar autoridad notificada</button>
            <button type="button" class="btn btn-secondary" :data-testid="'brecha-cargar-plantilla-' + i.id" @click="cargarBrechaEnPlantilla(i)">Cargar datos en plantilla de aviso</button>
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import {
  derechosService,
  DIAS_PROXIMA_A_VENCER,
  ESTADOS_INCIDENTE,
  ESTADOS_SOLICITUD,
  SEVERIDADES,
  TIPOS_DERECHO,
  PROCEDIMIENTO_NOTIFICACION_BRECHAS,
  PENDIENTES_DECISION_HUMANA_BRECHAS,
  SIMULACRO_BRECHA_REGISTRADO,
  generarAvisoAfectados,
  textoPlazo,
  estaSolicitudVencida,
  esSolicitudProximaAVencer,
  resumirSolicitudesAdmin
} from '../services/derechosService.js'
import { PLAZO_RESPUESTA_DIAS } from '../data/politicaPrivacidad.js'

const PESTANAS = [
  { id: 'solicitudes', texto: 'Solicitudes de derechos' },
  { id: 'incidentes', texto: 'Incidentes y brechas' }
]
const pestana = ref('solicitudes')
const aviso = ref({ texto: '', tipo: 'ok' })
const solicitudes = ref([])
const soloAbiertas = ref(false)
const filtroPlazo = ref('abiertas')
const busqueda = ref('')
const respuestas = reactive({})
const incidentes = ref([])
const brechas = reactive({})
const nuevo = reactive({ titulo: '', descripcion: '', severidad: 'media', afectaDatosPersonales: false })
const basePlantilla = generarAvisoAfectados()
const plantillaAviso = reactive({ asunto: basePlantilla.asunto, cuerpo: basePlantilla.cuerpo })
const simulacroActual = reactive({ ...SIMULACRO_BRECHA_REGISTRADO })
const ejecutandoSimulacro = ref(false)

const decir = (texto, tipo = 'ok') => { aviso.value = { texto, tipo } }
const etiquetaTipo = (v) =>
  TIPOS_DERECHO.find(t => t.valor === v)?.texto.split(':')[0] ||
  (v === 'revocar_consentimiento' ? 'Retiro del consentimiento' : v)
const etiquetaEstado = (estado) => {
  if (estado === 'en_proceso') return 'En curso'
  if (estado === 'resuelta') return 'Respondida'
  return ESTADOS_SOLICITUD[estado] || estado
}
const fecha = (iso) => (iso ? new Date(iso).toLocaleDateString('es-CL') : '—')
const plazo = (s) => textoPlazo(s.vence_en, s.estado)
const vencida = (s) => estaSolicitudVencida(s)
const proxima = (s) => esSolicitudProximaAVencer(s)

const resumenPlazos = computed(() => resumirSolicitudesAdmin(solicitudes.value))

const solicitudesFiltradas = computed(() => {
  const q = busqueda.value.trim().toLowerCase()
  return solicitudes.value.filter((s) => {
    if (soloAbiertas.value && !(s.estado === 'recibida' || s.estado === 'en_proceso')) return false
    if (filtroPlazo.value === 'abiertas' && !(s.estado === 'recibida' || s.estado === 'en_proceso')) return false
    if (filtroPlazo.value === 'proximas' && !proxima(s)) return false
    if (filtroPlazo.value === 'vencidas' && !vencida(s)) return false
    if (filtroPlazo.value === 'respondidas' && !(s.estado === 'resuelta' || s.estado === 'rechazada')) return false

    if (q) {
      const nom = String(s.perfil?.nombre || '').toLowerCase()
      const cor = String(s.perfil?.correo || '').toLowerCase()
      const det = String(s.detalle || '').toLowerCase()
      const tip = String(etiquetaTipo(s.tipo) || '').toLowerCase()
      if (!nom.includes(q) && !cor.includes(q) && !det.includes(q) && !tip.includes(q)) return false
    }
    return true
  })
})

function cambiarFiltroPlazo(nuevoFiltro) {
  filtroPlazo.value = nuevoFiltro
  if (nuevoFiltro === 'respondidas' || nuevoFiltro === 'todas') {
    soloAbiertas.value = false
  }
}

function alCambiarCheckAbiertas() {
  if (soloAbiertas.value && (filtroPlazo.value === 'respondidas' || filtroPlazo.value === 'todas')) {
    filtroPlazo.value = 'abiertas'
  }
}

async function cargarSolicitudes() {
  solicitudes.value = await derechosService.solicitudesAdmin({ soloAbiertas: false })
}

async function cargarIncidentes() {
  incidentes.value = await derechosService.incidentes()
  for (const i of incidentes.value) {
    brechas[i.id] = {
      afectadosEstimados: i.brecha?.afectados_estimados ?? '',
      datosComprometidos: i.brecha?.datos_comprometidos ?? '',
      medidas: i.brecha?.medidas ?? ''
    }
  }
}

onMounted(() => { cargarSolicitudes(); cargarIncidentes() })
watch(pestana, () => { aviso.value = { texto: '', tipo: 'ok' } })

async function resolver(s, estado) {
  const r = await derechosService.resolverSolicitud(s.id, estado, respuestas[s.id])
  if (!r.ok) return decir(r.error, 'error')
  if (estado === 'en_proceso') {
    decir('Solicitud marcada en curso.')
  } else if (estado === 'resuelta') {
    decir('Respuesta enviada al titular y solicitud marcada como respondida.')
  } else {
    decir('Solicitud rechazada con respuesta enviada al titular.')
  }
  await cargarSolicitudes()
}

async function crear() {
  const r = await derechosService.crearIncidente(nuevo)
  if (!r.ok) return decir(r.error, 'error')
  Object.assign(nuevo, { titulo: '', descripcion: '', severidad: 'media', afectaDatosPersonales: false })
  decir('Incidente registrado.')
  await cargarIncidentes()
}

async function cambiarEstado(i, estado) {
  const r = await derechosService.actualizarIncidente(i.id, { estado })
  r.ok ? decir('Estado actualizado.') : decir(r.error, 'error')
  await cargarIncidentes()
}

async function guardarBrecha(i, extra = {}) {
  const r = await derechosService.guardarBrecha(i.id, { ...brechas[i.id], ...extra })
  r.ok ? decir('Brecha guardada.') : decir(r.error, 'error')
  await cargarIncidentes()
}

function restablecerPlantillaAviso() {
  const base = generarAvisoAfectados()
  plantillaAviso.asunto = base.asunto
  plantillaAviso.cuerpo = base.cuerpo
  decir('Plantilla de aviso restablecida.')
}

function cargarBrechaEnPlantilla(i) {
  const datosB = brechas[i.id] || {}
  const generada = generarAvisoAfectados({
    fechaDeteccion: fecha(i.abierto_en),
    queOcurrio: i.descripcion || i.titulo,
    datosComprometidos: datosB.datosComprometidos || i.brecha?.datos_comprometidos || 'datos asociados a tu cuenta en la plataforma',
    medidasTomadas: datosB.medidas || i.brecha?.medidas || 'contención del incidente, revisión de accesos y refuerzo de controles'
  })
  plantillaAviso.asunto = generada.asunto
  plantillaAviso.cuerpo = generada.cuerpo
  decir('Datos de la brecha cargados en la plantilla de aviso.')
}

async function copiarPlantillaAviso() {
  const texto = `Asunto: ${plantillaAviso.asunto}\n\n${plantillaAviso.cuerpo}`
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto)
    }
    decir('Plantilla de aviso copiada al portapapeles.')
  } catch {
    decir('Plantilla lista para copiar manualmente desde el cuadro de texto.')
  }
}

async function ejecutarSimulacro() {
  ejecutandoSimulacro.value = true
  try {
    const r = await derechosService.ejecutarSimulacroBrecha({
      responsable: simulacroActual.responsable,
      fecha: simulacroActual.fecha
    })
    if (r.ok) {
      Object.assign(simulacroActual, r.simulacro)
      if (r.avisoGenerado) {
        plantillaAviso.asunto = r.avisoGenerado.asunto
        plantillaAviso.cuerpo = r.avisoGenerado.cuerpo
      }
      await cargarIncidentes()
      decir('Simulacro con brecha ficticia registrado con fecha y responsable.')
    } else {
      decir('No se pudo registrar el simulacro.', 'error')
    }
  } finally {
    ejecutandoSimulacro.value = false
  }
}
</script>

<style scoped>
.seguridad-admin {
  max-width: 980px;
  margin: 0 auto;
  display: grid;
  gap: 1rem;
}

.encabezado-seguridad {
  display: grid;
  gap: 0.35rem;
}

.intro {
  color: var(--color-muted);
  margin: 0;
  line-height: 1.5;
}

.pestanas {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}

.pestana {
  min-height: var(--alto-tactil, 44px);
  padding: 0 1rem;
  border: 1px solid var(--color-border);
  background: var(--color-surface);
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
  color: var(--color-text);
}

.pestana.activa {
  background: var(--color-primary);
  color: #fff;
  border-color: var(--color-primary);
}

.alerta {
  padding: 0.7rem 1rem;
  border-radius: 8px;
  margin: 0;
}

.alerta.ok {
  background: #ecfdf5;
  border: 1px solid #a7f3d0;
  color: #065f46;
}

.alerta.error {
  background: #fef2f2;
  border: 1px solid #fecaca;
  color: #991b1b;
}

section {
  display: grid;
  gap: 0.85rem;
}

h2 {
  font-size: 1.05rem;
  margin: 0 0 0.5rem;
}

.resumen-plazos-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

@media (max-width: 780px) {
  .resumen-plazos-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

.kpi-plazo-card {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  border-radius: 10px;
  padding: 0.85rem 1rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  gap: 0.25rem;
}

.kpi-plazo-card.ambar {
  background: #fffbeb;
  border-color: #fcd34d;
}

.kpi-plazo-card.rojo {
  background: #fef2f2;
  border-color: #fca5a5;
}

.kpi-plazo-card.verde {
  background: #f0fdf4;
  border-color: #86efac;
}

.kpi-etiqueta {
  font-size: 0.82rem;
  font-weight: 600;
  color: #475569;
}

.kpi-valor {
  font-size: 1.65rem;
  font-weight: 800;
  color: #0f172a;
}

.kpi-plazo-card.ambar .kpi-valor {
  color: #b45309;
}

.kpi-plazo-card.rojo .kpi-valor {
  color: #b91c1c;
}

.kpi-plazo-card.verde .kpi-valor {
  color: #15803d;
}

.barra-filtros-solicitudes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}

.filtros-pildoras {
  display: flex;
  flex-wrap: wrap;
  gap: 0.45rem;
}

.pildora-filtro {
  padding: 0.4rem 0.85rem;
  border-radius: 999px;
  border: 1px solid #cbd5e1;
  background: #ffffff;
  color: #334155;
  font-size: 0.84rem;
  font-weight: 600;
  cursor: pointer;
}

.pildora-filtro.activa {
  background: #e2e8f0;
  border-color: #475569;
  color: #0f172a;
}

.controles-derecha-solicitudes {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.65rem;
}

.buscador-solicitudes {
  min-width: 220px;
}

.lista-solicitudes-admin {
  display: grid;
  gap: 0.85rem;
}

.tarjeta-solicitud-admin {
  border-left: 5px solid #94a3b8;
}

.item.vencida {
  border-left: 5px solid #dc2626;
}

.item.proxima {
  border-left: 5px solid #d97706;
}

.item.respondida {
  border-left: 5px solid #16a34a;
}

.cabecera-solicitud-admin {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
}

.titulo-y-badges {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.tipo-derecho-titulo {
  font-size: 1.02rem;
  color: #0f172a;
}

.badge-estado {
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
}

.badge-estado.recibida {
  background: #fef3c7;
  color: #92400e;
}

.badge-estado.en_proceso {
  background: #dbeafe;
  color: #1e40af;
}

.badge-estado.resuelta {
  background: #dcfce7;
  color: #166534;
}

.badge-estado.rechazada {
  background: #fee2e2;
  color: #991b1b;
}

.badge-plazo {
  padding: 0.18rem 0.55rem;
  border-radius: 999px;
  font-size: 0.78rem;
  font-weight: 700;
}

.badge-plazo.rojo,
.plazo.rojo {
  background: #fee2e2;
  color: #b91c1c;
}

.badge-plazo.ambar {
  background: #fef3c7;
  color: #92400e;
}

.badge-plazo.azul {
  background: #e0f2fe;
  color: #075985;
}

.meta-fechas-solicitud {
  font-size: 0.82rem;
  color: #475569;
}

.estado,
.plazo,
.sev {
  font-size: 0.8rem;
  font-weight: 700;
}

.sev.alta,
.sev.critica {
  color: #b91c1c;
}

.quien {
  margin: 0.3rem 0;
  color: #334155;
  font-size: 0.9rem;
}

.detalle {
  margin: 0.3rem 0;
  line-height: 1.5;
  font-size: 0.93rem;
  white-space: pre-wrap;
}

.recuadro-detalle {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-left: 3px solid #1e3a8a;
  border-radius: 6px;
  padding: 0.55rem 0.75rem;
  color: #1e293b;
}

.etiqueta-respuesta {
  font-size: 0.85rem;
  font-weight: 600;
  color: #334155;
}

.responder {
  margin-top: 0.55rem;
  display: grid;
  gap: 0.45rem;
}

.respuesta-enviada-box {
  margin-top: 0.5rem;
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #14532d;
  font-size: 0.9rem;
}

.respuesta-enviada-box.rechazada {
  background: #fef2f2;
  border-color: #fecaca;
  color: #7f1d1d;
}

.acciones {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.fila {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  margin-bottom: 0.5rem;
}

.corto {
  max-width: 180px;
}

.estado-select {
  max-width: 160px;
}

.brecha {
  margin-top: 0.6rem;
  padding-top: 0.6rem;
  border-top: 1px dashed var(--color-border);
  display: grid;
  gap: 0.4rem;
}

.ayuda {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-muted);
}

.check {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  font-size: 0.9rem;
}

.vacio {
  color: var(--color-muted);
}

.panel-incidentes-grid {
  display: grid;
  gap: 1rem;
}

.procedimiento-brechas-grid {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
}

.proc-brecha-card {
  display: grid;
  gap: 0.65rem;
}

.proc-tabla-wrap {
  overflow-x: auto;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.proc-tabla {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.82rem;
}

.proc-tabla th,
.proc-tabla td {
  padding: 0.5rem 0.6rem;
  border-bottom: 1px solid var(--color-border);
  text-align: left;
  vertical-align: top;
}

.proc-tabla th {
  background: #f8fafc;
  color: #334155;
  font-weight: 700;
}

.pendiente-unach-box {
  padding: 0.65rem 0.85rem;
  border-radius: 8px;
  background: #fffbeb;
  border: 1px solid #fde68a;
  color: #92400e;
  font-size: 0.85rem;
}

.pendiente-lista {
  margin: 0.35rem 0 0;
  padding-left: 1.15rem;
  display: grid;
  gap: 0.25rem;
}

.plantilla-textarea {
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  font-size: 0.82rem;
  line-height: 1.45;
}

.simulacro-card {
  display: grid;
  gap: 0.65rem;
  border-left: 4px solid #2563eb;
}

.simulacro-header {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: flex-start;
  gap: 0.75rem;
}

.simulacro-meta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
  gap: 0.65rem;
  padding: 0.6rem 0.75rem;
  background: #f8fafc;
  border: 1px solid var(--color-border);
  border-radius: 8px;
}

.simulacro-meta-item {
  display: grid;
  gap: 0.15rem;
}

.simulacro-meta-label {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  color: #64748b;
}

.lecciones-incidente {
  padding: 0.5rem 0.65rem;
  background: #f8fafc;
  border-left: 3px solid #2563eb;
  border-radius: 6px;
}
</style>
