<template>
  <div class="seguridad-admin">
    <h1 class="card-title">Seguridad y privacidad</h1>
    <p class="intro">
      Solo el administrador ve esta pantalla. Solicitudes de derechos del titular (plazo legal de {{ PLAZO_RESPUESTA_DIAS }} días)
      e incidentes de seguridad, con el registro de brechas. Todo queda en la auditoría.
    </p>

    <div class="pestanas" role="tablist">
      <button v-for="p in PESTANAS" :key="p.id" role="tab" type="button" class="pestana" :class="{ activa: pestana === p.id }"
        :aria-selected="pestana === p.id" :data-testid="'pestana-' + p.id" @click="pestana = p.id">{{ p.texto }}</button>
    </div>
    <p v-if="aviso.texto" class="alerta" :class="aviso.tipo" role="status" data-testid="seguridad-aviso">{{ aviso.texto }}</p>

    <!-- ============================================================ SOLICITUDES -->
    <section v-if="pestana === 'solicitudes'" data-testid="panel-solicitudes">
      <label class="check"><input v-model="soloAbiertas" type="checkbox" @change="cargarSolicitudes" /> Solo abiertas</label>
      <p v-if="!solicitudes.length" class="vacio">No hay solicitudes {{ soloAbiertas ? 'abiertas' : '' }}.</p>
      <article v-for="s in solicitudes" :key="s.id" class="card item" :class="{ vencida: vencida(s) }" :data-testid="'solicitud-' + s.id">
        <header>
          <strong>{{ etiquetaTipo(s.tipo) }}</strong>
          <span class="estado" :class="s.estado">{{ ESTADOS_SOLICITUD[s.estado] }}</span>
          <span v-if="plazo(s)" class="plazo" :class="{ rojo: vencida(s) }">{{ plazo(s) }}</span>
        </header>
        <!-- Solo lo necesario para responder: quién pide y qué pide -->
        <p class="quien">{{ s.perfil?.nombre || 'Sin nombre' }} · {{ s.perfil?.correo }}</p>
        <p v-if="s.detalle" class="detalle">{{ s.detalle }}</p>
        <div v-if="s.estado === 'recibida' || s.estado === 'en_proceso'" class="responder">
          <textarea v-model="respuestas[s.id]" class="form-input" rows="2" maxlength="2000" placeholder="Respuesta para la persona" :data-testid="'respuesta-' + s.id"></textarea>
          <div class="acciones">
            <button v-if="s.estado === 'recibida'" type="button" class="btn btn-secondary" @click="resolver(s, 'en_proceso')">Marcar en proceso</button>
            <button type="button" class="btn btn-primary" :data-testid="'resolver-' + s.id" @click="resolver(s, 'resuelta')">Resolver</button>
            <button type="button" class="btn btn-secondary" @click="resolver(s, 'rechazada')">Rechazar</button>
          </div>
        </div>
        <p v-else-if="s.respuesta" class="detalle"><strong>Respuesta:</strong> {{ s.respuesta }}</p>
      </article>
    </section>

    <!-- ============================================================ INCIDENTES -->
    <section v-else data-testid="panel-incidentes">
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

        <!-- Brecha: solo cuando afecta datos personales (RF92) -->
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
          </div>
        </div>
      </article>
    </section>
  </div>
</template>

<script setup>
import { onMounted, reactive, ref, watch } from 'vue'
import { derechosService, ESTADOS_INCIDENTE, ESTADOS_SOLICITUD, SEVERIDADES, TIPOS_DERECHO, textoPlazo, diasParaVencer } from '../services/derechosService.js'
import { PLAZO_RESPUESTA_DIAS } from '../data/politicaPrivacidad.js'

const PESTANAS = [
  { id: 'solicitudes', texto: 'Solicitudes de derechos' },
  { id: 'incidentes', texto: 'Incidentes y brechas' }
]
const pestana = ref('solicitudes')
const aviso = ref({ texto: '', tipo: 'ok' })
const solicitudes = ref([])
const soloAbiertas = ref(true)
const respuestas = reactive({})
const incidentes = ref([])
const brechas = reactive({})
const nuevo = reactive({ titulo: '', descripcion: '', severidad: 'media', afectaDatosPersonales: false })

const decir = (texto, tipo = 'ok') => { aviso.value = { texto, tipo } }
const etiquetaTipo = (v) => TIPOS_DERECHO.find(t => t.valor === v)?.texto.split(':')[0] || (v === 'revocar_consentimiento' ? 'Retiro del consentimiento' : v)
const fecha = (iso) => new Date(iso).toLocaleDateString('es-CL')
const plazo = (s) => textoPlazo(s.vence_en, s.estado)
const vencida = (s) => (s.estado === 'recibida' || s.estado === 'en_proceso') && diasParaVencer(s.vence_en) < 0

async function cargarSolicitudes() { solicitudes.value = await derechosService.solicitudesAdmin({ soloAbiertas: soloAbiertas.value }) }
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
  r.ok ? decir('Solicitud actualizada.') : decir(r.error, 'error')
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
</script>

<style scoped>
.seguridad-admin { max-width: 900px; margin: 0 auto; display: grid; gap: 1rem; }
.intro { color: var(--color-muted); margin: 0; line-height: 1.5; }
.pestanas { display: flex; flex-wrap: wrap; gap: 0.4rem; }
.pestana { min-height: var(--alto-tactil, 44px); padding: 0 1rem; border: 1px solid var(--color-border); background: var(--color-surface); border-radius: 0.5rem; font-weight: 600; cursor: pointer; color: var(--color-text); }
.pestana.activa { background: var(--color-primary); color: #fff; border-color: var(--color-primary); }
.alerta { padding: 0.7rem 1rem; border-radius: 8px; margin: 0; }
.alerta.ok { background: #ecfdf5; border: 1px solid #a7f3d0; color: #065f46; }
.alerta.error { background: #fef2f2; border: 1px solid #fecaca; color: #991b1b; }
section { display: grid; gap: 0.75rem; }
h2 { font-size: 1.05rem; margin: 0 0 0.5rem; }
.item header { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; }
.item.vencida { border-left: 4px solid #dc2626; }
.estado, .plazo, .sev { font-size: 0.8rem; font-weight: 700; }
.plazo.rojo { color: #b91c1c; }
.sev.alta, .sev.critica { color: #b91c1c; }
.quien { margin: 0.2rem 0; color: var(--color-muted); font-size: 0.88rem; }
.detalle { margin: 0.3rem 0; line-height: 1.5; font-size: 0.93rem; white-space: pre-wrap; }
.responder { margin-top: 0.5rem; display: grid; gap: 0.4rem; }
.acciones { display: flex; flex-wrap: wrap; gap: 0.5rem; }
.fila { display: flex; flex-wrap: wrap; align-items: center; gap: 0.6rem; margin-bottom: 0.5rem; }
.corto { max-width: 180px; }
.estado-select { max-width: 160px; }
.brecha { margin-top: 0.6rem; padding-top: 0.6rem; border-top: 1px dashed var(--color-border); display: grid; gap: 0.4rem; }
.ayuda { margin: 0; font-size: 0.85rem; color: var(--color-muted); }
.check { display: inline-flex; align-items: center; gap: 0.4rem; font-size: 0.9rem; }
.vacio { color: var(--color-muted); }
</style>
