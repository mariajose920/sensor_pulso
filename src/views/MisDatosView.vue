<template>
  <div class="mis-datos">
    <header class="mis-datos-header">
      <h1 class="card-title">Mis datos y mis derechos</h1>
      <p class="intro">
        Aquí puedes consultar únicamente tus propios datos, corregirlos de inmediato, exportarlos en un archivo,
        retirar tu consentimiento o eliminarlos definitivamente. Respondemos solicitudes adicionales en un máximo de
        {{ PLAZO_RESPUESTA_DIAS }} días. Más información en la
        <router-link to="/privacidad">política de privacidad</router-link>.
      </p>
    </header>

    <p v-if="aviso.texto" class="alerta" :class="aviso.tipo" role="status" data-testid="mis-datos-aviso">
      {{ aviso.texto }}
    </p>

    <!-- 1. CONSULTAR MIS DATOS REGISTRADOS -->
    <section class="card seccion-derecho" data-testid="consultar-datos">
      <div class="seccion-encabezado">
        <h2>1. Consultar mis datos registrados</h2>
        <button
          type="button"
          class="btn btn-secondary btn-sm"
          :disabled="cargandoDatos || ocupado"
          data-testid="boton-actualizar-consulta"
          @click="cargarTodo"
        >
          {{ cargandoDatos ? 'Actualizando…' : 'Actualizar vista' }}
        </button>
      </div>

      <div class="consulta-grid">
        <!-- Columna izquierda: Datos de perfil y cuenta -->
        <div class="consulta-panel" data-testid="resumen-perfil-titular">
          <h3>Datos de perfil y cuenta</h3>
          <dl class="lista-definicion">
            <div class="fila-dato">
              <dt>Nombre completo</dt>
              <dd data-testid="consulta-nombre">{{ resumenDatos.perfil.nombre || 'Sin nombre registrado' }}</dd>
            </div>
            <div class="fila-dato">
              <dt>Correo institucional</dt>
              <dd data-testid="consulta-correo">{{ resumenDatos.perfil.correo || '—' }}</dd>
            </div>
            <div class="fila-dato">
              <dt>Rol</dt>
              <dd>{{ etiquetaRol(resumenDatos.perfil.rol) }}</dd>
            </div>
            <div class="fila-dato">
              <dt>Estado de consentimiento</dt>
              <dd>
                <span
                  class="badge-estado"
                  :class="resumenDatos.consentimiento.vigente ? 'badge-vigente' : 'badge-revocado'"
                  data-testid="consulta-consentimiento"
                >
                  {{ resumenDatos.consentimiento.vigente ? 'Vigente' : 'Sin consentimiento activo' }}
                </span>
              </dd>
            </div>
            <div class="fila-dato">
              <dt>Mediciones</dt>
              <dd data-testid="consulta-mediciones">
                {{ resumenDatos.totalMediciones }} {{ resumenDatos.totalMediciones === 1 ? 'medición' : 'mediciones' }}
              </dd>
            </div>
          </dl>
        </div>

        <!-- Columna derecha: Ficha de salud declarada -->
        <div class="consulta-panel" data-testid="resumen-ficha-titular">
          <h3>Ficha de salud declarada</h3>
          <dl v-if="resumenDatos.fichaSalud" class="lista-definicion">
            <div class="fila-dato">
              <dt>Edad</dt>
              <dd data-testid="consulta-edad">{{ resumenDatos.fichaSalud.edad }} años</dd>
            </div>
            <div class="fila-dato">
              <dt>Nivel de estrés</dt>
              <dd data-testid="consulta-estres">{{ etiquetaEstres(resumenDatos.fichaSalud.nivelEstres) }}</dd>
            </div>
            <div class="fila-dato">
              <dt>Horas de sueño</dt>
              <dd data-testid="consulta-sueno">{{ etiquetaSueno(resumenDatos.fichaSalud.suenoHoras) }}</dd>
            </div>
            <div class="fila-dato">
              <dt>Consumo de cafeína</dt>
              <dd data-testid="consulta-cafeina">{{ etiquetaCafeina(resumenDatos.fichaSalud.cafeina) }}</dd>
            </div>
            <div class="fila-dato">
              <dt>Medicación</dt>
              <dd data-testid="consulta-medicacion">{{ resumenDatos.fichaSalud.medicacion || 'Ninguna' }}</dd>
            </div>
            <div class="fila-dato">
              <dt>Condición</dt>
              <dd data-testid="consulta-condicion">{{ resumenDatos.fichaSalud.condicionSalud || 'Ninguna conocida' }}</dd>
            </div>
          </dl>
          <p v-else class="vacio-ficha" data-testid="consulta-sin-ficha">
            No hay una ficha de salud registrada actualmente. Puedes completarla y guardarla en el formulario de corrección de abajo.
          </p>
        </div>
      </div>
    </section>

    <!-- 2. CORREGIR MIS DATOS (RECTIFICACIÓN INMEDIATA) -->
    <section class="card seccion-derecho" data-testid="corregir-datos">
      <h2>2. Corregir mis datos (Rectificación inmediata)</h2>
      <div class="banner-rectificacion">
        Los cambios se reflejan de inmediato en tu perfil y en tu ficha de salud
      </div>

      <form class="form-rectificacion" @submit.prevent="guardarCorrecciones">
        <div class="grid-rectificacion-4">
          <div class="form-group">
            <label class="form-label" for="rect-nombre">Nombre completo</label>
            <input
              id="rect-nombre"
              v-model="formRectificacion.nombre"
              type="text"
              class="form-input"
              maxlength="120"
              required
              data-testid="rectificar-nombre"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="rect-edad">Edad</label>
            <input
              id="rect-edad"
              v-model.number="formRectificacion.edad"
              type="number"
              min="18"
              max="120"
              class="form-input"
              required
              data-testid="rectificar-edad"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="rect-estres">Nivel de estrés</label>
            <select
              id="rect-estres"
              v-model="formRectificacion.nivelEstres"
              class="form-input"
              required
              data-testid="rectificar-estres"
            >
              <option v-for="opt in NIVELES_ESTRES" :key="opt.id" :value="opt.id">
                {{ opt.label.split('(')[0].trim() }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="rect-sueno">Horas de sueño</label>
            <select
              id="rect-sueno"
              v-model="formRectificacion.suenoHoras"
              class="form-input"
              data-testid="rectificar-sueno"
            >
              <option v-for="opt in OPCIONES_SUENO" :key="opt.id" :value="opt.id">
                {{ opt.label.split('(')[0].trim() }}
              </option>
            </select>
          </div>
        </div>

        <div class="grid-rectificacion-3">
          <div class="form-group">
            <label class="form-label" for="rect-cafeina">Consumo de cafeína</label>
            <select
              id="rect-cafeina"
              v-model="formRectificacion.cafeina"
              class="form-input"
              data-testid="rectificar-cafeina"
            >
              <option v-for="opt in OPCIONES_CAFEINA" :key="opt.id" :value="opt.id">
                {{ opt.label.split('(')[0].trim() }}
              </option>
            </select>
          </div>

          <div class="form-group">
            <label class="form-label" for="rect-medicacion">Medicación</label>
            <input
              id="rect-medicacion"
              v-model="formRectificacion.medicacion"
              type="text"
              class="form-input"
              maxlength="160"
              placeholder="Ninguna"
              data-testid="rectificar-medicacion"
            />
          </div>

          <div class="form-group">
            <label class="form-label" for="rect-condicion">Condición de salud</label>
            <input
              id="rect-condicion"
              v-model="formRectificacion.condicionSalud"
              type="text"
              class="form-input"
              maxlength="160"
              placeholder="Ninguna conocida"
              data-testid="rectificar-condicion"
            />
          </div>
        </div>

        <button
          type="submit"
          class="btn btn-primary btn-guardar-rectificacion"
          :disabled="ocupado"
          data-testid="boton-guardar-correcciones"
        >
          {{ rectificando ? 'Guardando correcciones…' : 'Guardar correcciones' }}
        </button>
      </form>
    </section>

    <!-- 3. EXPORTAR MIS DATOS (PORTABILIDAD) -->
    <section class="card seccion-derecho" data-testid="descargar-datos">
      <h2>3. Exportar mis datos (Portabilidad)</h2>
      <p>
        Obtén un archivo con tu perfil, tus mediciones, tu ficha de salud declarada y tu actividad.
        Puedes descargarlo en formato estructurado <strong>JSON</strong> o como un informe legible en <strong>PDF</strong>.
        No incluye datos de otras personas y la descarga queda registrada en auditoría.
      </p>
      <div class="acciones">
        <button
          type="button"
          class="btn btn-secondary btn-exportar-json"
          :disabled="ocupado"
          data-testid="boton-descargar"
          @click="descargar"
        >
          {{ descargando ? 'Preparando…' : 'Descargar mis datos (JSON)' }}
        </button>
        <button
          type="button"
          class="btn btn-primary btn-exportar-pdf"
          :disabled="ocupado"
          data-testid="boton-descargar-pdf"
          @click="descargarPdf"
        >
          {{ descargandoPdf ? 'Generando PDF…' : 'Descargar informe (PDF)' }}
        </button>
      </div>
    </section>

    <!-- 4. RETIRAR MI CONSENTIMIENTO O ELIMINAR MIS DATOS (SUPRESIÓN) -->
    <section class="card peligro seccion-derecho" data-testid="acciones-delicadas">
      <h2>4. Retirar mi consentimiento o eliminar mis datos (Supresión)</h2>
      <p>
        Tienes el derecho de retirar tu consentimiento o eliminar tus datos en cualquier momento.
        Retirar el consentimiento detiene el tratamiento y retira tus mediciones publicadas.
        Borrar elimina tus mediciones, tu ficha de salud, tus publicaciones y tu copia local; lo eliminado
        ya no se podrá consultar y la acción quedará registrada en la auditoría.
      </p>
      <div class="acciones">
        <button
          type="button"
          class="btn btn-primary"
          :disabled="ocupado"
          data-testid="boton-revocar"
          @click="revocar"
        >
          Retirar mi consentimiento
        </button>
        <button
          type="button"
          class="btn btn-danger"
          :disabled="ocupado"
          data-testid="boton-eliminar"
          @click="pedirConfirmacion = true"
        >
          Borrar mis datos
        </button>
      </div>
      <div v-if="pedirConfirmacion" class="confirmacion" data-testid="confirmar-eliminar">
        <p>Para confirmar, escribe <strong>BORRAR</strong>:</p>
        <input
          v-model="textoConfirmar"
          class="form-input"
          aria-label="Escribe BORRAR para confirmar"
          data-testid="eliminar-texto"
        />
        <div class="acciones">
          <button type="button" class="btn btn-secondary" @click="cancelarEliminar">Cancelar</button>
          <button
            type="button"
            class="btn btn-danger"
            :disabled="textoConfirmar !== 'BORRAR' || ocupado"
            data-testid="eliminar-confirmar"
            @click="eliminar"
          >
            Borrar definitivamente
          </button>
        </div>
      </div>
    </section>

    <!-- Solicitudes adicionales e historial de derechos ejercidos -->
    <section class="card seccion-derecho" data-testid="nueva-solicitud">
      <h2>Enviar solicitud formal adicional</h2>
      <p
        v-if="avisoSolicitud.texto"
        class="alerta alerta-local"
        :class="avisoSolicitud.tipo"
        role="alert"
        data-testid="aviso-solicitud-formal"
      >
        {{ avisoSolicitud.texto }}
      </p>
      <form @submit.prevent="enviar">
        <div class="form-group">
          <label class="form-label" for="tipo">Derecho</label>
          <select id="tipo" v-model="tipo" class="form-input" data-testid="solicitud-tipo">
            <option value="" disabled>Elige una opción</option>
            <option v-for="t in TIPOS_DERECHO" :key="t.valor" :value="t.valor">{{ t.texto }}</option>
          </select>
        </div>
        <div class="form-group">
          <label class="form-label" for="detalle">
            Detalle
            <span v-if="tipo === 'rectificacion'" class="texto-ayuda-obligatorio">
              (obligatorio: mínimo 10 caracteres explicando qué corregir)
            </span>
            <span v-else-if="tipo === 'oposicion'" class="texto-ayuda-obligatorio">
              (indica a qué uso te opones)
            </span>
            <span v-else class="texto-ayuda-opcional">(opcional)</span>
          </label>
          <textarea
            id="detalle"
            v-model="detalle"
            class="form-input"
            rows="3"
            maxlength="1000"
            placeholder="No escribas datos de salud aquí; basta con indicar qué necesitas."
            data-testid="solicitud-detalle"
          ></textarea>
        </div>
        <button type="submit" class="btn btn-primary" :disabled="ocupado" data-testid="solicitud-enviar">
          {{ enviando ? 'Enviando solicitud…' : 'Enviar solicitud' }}
        </button>
      </form>
    </section>

    <section class="card seccion-derecho" data-testid="mis-solicitudes">
      <h2>Mis solicitudes y acciones registradas</h2>
      <p v-if="!solicitudes.length" class="vacio">Aún no has enviado solicitudes.</p>
      <ul v-else class="lista">
        <li
          v-for="s in solicitudes"
          :key="s.id"
          class="item-solicitud-titular"
          :class="clasePlazoTitular(s)"
          :data-testid="'solicitud-' + s.id"
        >
          <div class="fila-cabecera-solicitud">
            <strong>{{ etiquetaTipo(s.tipo) }}</strong>
            <span class="estado" :class="s.estado">{{ ESTADOS_SOLICITUD[s.estado] }}</span>
            <span v-if="estaSolicitudVencida(s)" class="insignia-plazo vencida" data-testid="solicitud-vencida-titular">
              Solicitud vencida · {{ plazo(s) }}
            </span>
            <span v-else-if="esSolicitudProximaAVencer(s)" class="insignia-plazo proxima">
              Próxima a vencer · {{ plazo(s) }}
            </span>
            <span v-else-if="plazo(s)" class="insignia-plazo en-plazo">
              {{ plazo(s) }}
            </span>
          </div>
          <small class="fechas-solicitud">
            Recibida el {{ fecha(s.recibida_en) }}
            <template v-if="s.vence_en"> · <strong>Fecha límite:</strong> {{ fecha(s.vence_en) }}</template>
            <template v-if="s.resuelta_en"> · Respondida el {{ fecha(s.resuelta_en) }}</template>
          </small>
          <p v-if="s.detalle" class="detalle-solicitud"><strong>Detalle enviado:</strong> {{ s.detalle }}</p>
          <div v-if="s.respuesta" class="respuesta-box" data-testid="respuesta-titular">
            <strong>Respuesta del administrador:</strong>
            <p class="respuesta">{{ s.respuesta }}</p>
          </div>
        </li>
      </ul>
    </section>

    <section class="card seccion-derecho">
      <h2>Autenticación de dos factores</h2>
      <p>
        Si tienes una cuenta de usuario, puedes activar esta protección cuando quieras. Si la activas,
        en tus próximos inicios de sesión se te pedirá un código de tu aplicación autenticadora.
      </p>
      <router-link
        v-if="mfaCargado && !factoresMfa.length"
        :to="{ name: 'Mfa', query: { redirect: '/mis-datos' } }"
        class="btn btn-secondary"
      >
        Configurar autenticador
      </router-link>
      <p v-if="mfaCargado && factoresMfa.length">Autenticador activo.</p>
      <button
        v-if="mfaCargado && puedeDesactivarMfa && factoresMfa.length"
        type="button"
        class="btn btn-secondary"
        :disabled="actualizandoMfa"
        @click="desactivarMfa"
      >
        Desactivar autenticador
      </button>
      <p v-if="mensajeMfa" role="status">{{ mensajeMfa }}</p>
    </section>

    <!-- Modal de confirmación de solicitud formal enviada acorde al diseño institucional -->
    <div
      v-if="modalSolicitud.visible"
      class="modal-solicitud-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="titulo-modal-solicitud"
      data-testid="modal-solicitud-enviada"
      @click.self="cerrarModalSolicitud"
    >
      <div class="modal-solicitud-card">
        <div class="modal-solicitud-icono" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <h3 id="titulo-modal-solicitud" class="modal-solicitud-titulo">Solicitud formal enviada</h3>
        <p class="modal-solicitud-texto">
          Tu solicitud de <strong>{{ modalSolicitud.derecho }}</strong> quedó registrada en el sistema y en la bitácora de auditoría.
          Te responderemos en un plazo máximo de {{ PLAZO_RESPUESTA_DIAS }} días.
        </p>
        <p v-if="modalSolicitud.detalle" class="modal-solicitud-detalle">
          <span>Detalle registrado:</span> {{ modalSolicitud.detalle }}
        </p>
        <button
          type="button"
          class="btn btn-primary btn-modal-aceptar"
          data-testid="cerrar-modal-solicitud"
          @click="cerrarModalSolicitud"
        >
          Aceptar
        </button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useAuth } from '../composables/useAuth.js'
import { eliminarFactorMfa, listarFactoresTotp } from '../services/mfaService.js'
import {
  derechosService,
  ESTADOS_SOLICITUD,
  TIPOS_DERECHO,
  textoPlazo,
  estaSolicitudVencida,
  esSolicitudProximaAVencer,
  clasificarPlazoSolicitud
} from '../services/derechosService.js'
import { NIVELES_ESTRES, OPCIONES_SUENO, OPCIONES_CAFEINA } from '../services/pacienteService.js'
import { PLAZO_RESPUESTA_DIAS } from '../data/politicaPrivacidad.js'

const tipo = ref('')
const detalle = ref('')
const solicitudes = ref([])
const aviso = ref({ texto: '', tipo: 'ok' })
const avisoSolicitud = ref({ texto: '', tipo: 'ok' })
const modalSolicitud = ref({ visible: false, derecho: '', detalle: '' })
const cargandoDatos = ref(false)
const descargando = ref(false)
const descargandoPdf = ref(false)
const rectificando = ref(false)
const enviando = ref(false)
const trabajando = ref(false)
const pedirConfirmacion = ref(false)
const textoConfirmar = ref('')

const ocupado = computed(
  () => descargando.value || descargandoPdf.value || rectificando.value || enviando.value || trabajando.value
)

const resumenDatos = ref({
  perfil: {
    nombre: '',
    correo: '',
    rol: 'usuario'
  },
  consentimiento: {
    vigente: false
  },
  totalMediciones: 0,
  fichaSalud: null
})

const formRectificacion = ref({
  nombre: '',
  edad: 22,
  nivelEstres: 'medio',
  suenoHoras: '7_8',
  cafeina: 'ninguna',
  medicacion: 'Ninguna',
  condicionSalud: 'Ninguna conocida'
})

const etiquetaTipo = (v) =>
  TIPOS_DERECHO.find(t => t.valor === v)?.texto.split(':')[0] ||
  (v === 'revocar_consentimiento' ? 'Retiro del consentimiento' : v)
const fecha = (iso) => new Date(iso).toLocaleDateString('es-CL')
const plazo = (s) => textoPlazo(s.vence_en, s.estado)
const clasePlazoTitular = (s) => `plazo-${clasificarPlazoSolicitud(s)}`
const decir = (texto, tipoAviso = 'ok') => { aviso.value = { texto, tipo: tipoAviso } }

function etiquetaRol(rol) {
  if (rol === 'admin') return 'Administrador'
  if (rol === 'profesor') return 'Profesor'
  return 'Estudiante'
}

function etiquetaEstres(id) {
  const encontrado = NIVELES_ESTRES.find(n => n.id === id)
  return encontrado ? encontrado.label.split('(')[0].trim() : (id || 'No especificado')
}

function etiquetaSueno(id) {
  const encontrado = OPCIONES_SUENO.find(s => s.id === id)
  return encontrado ? encontrado.label.split('(')[0].trim() : (id || 'No especificado')
}

function etiquetaCafeina(id) {
  const encontrado = OPCIONES_CAFEINA.find(c => c.id === id)
  return encontrado ? encontrado.label.split('(')[0].trim() : (id || 'Ninguna')
}

async function cargarSolicitudes() {
  solicitudes.value = await derechosService.misSolicitudes()
}

async function cargarDatosTitular() {
  cargandoDatos.value = true
  try {
    const r = await derechosService.consultarMisDatos()
    if (r.ok && r.datos) {
      resumenDatos.value = r.datos
      formRectificacion.value = {
        nombre: r.datos.perfil.nombre || r.datos.fichaSalud?.nombre || '',
        edad: r.datos.fichaSalud?.edad || 22,
        nivelEstres: r.datos.fichaSalud?.nivelEstres || 'medio',
        suenoHoras: r.datos.fichaSalud?.suenoHoras || '7_8',
        cafeina: r.datos.fichaSalud?.cafeina || 'ninguna',
        medicacion: r.datos.fichaSalud?.medicacion || 'Ninguna',
        condicionSalud: r.datos.fichaSalud?.condicionSalud || 'Ninguna conocida'
      }
    }
  } finally {
    cargandoDatos.value = false
  }
}

async function cargarTodo() {
  await Promise.all([cargarDatosTitular(), cargarSolicitudes()])
}

onMounted(cargarTodo)

const { isAdmin, isProfesor, loading } = useAuth()
const puedeDesactivarMfa = computed(() => !loading.value && !isAdmin.value && !isProfesor.value)
const factoresMfa = ref([])
const mfaCargado = ref(false)
const actualizandoMfa = ref(false)
const mensajeMfa = ref('')

const desactivarMfa = async () => {
  if (!puedeDesactivarMfa.value || actualizandoMfa.value) return
  if (!window.confirm('¿Quieres desvincular los autenticadores de esta cuenta?')) return

  actualizandoMfa.value = true
  mensajeMfa.value = ''

  try {
    for (const factor of factoresMfa.value) {
      await eliminarFactorMfa(factor.id)
      factoresMfa.value = factoresMfa.value.filter(item => item.id !== factor.id)
    }

    mensajeMfa.value = 'Autenticador desactivado.'
  } catch (error) {
    mensajeMfa.value = error.message || 'No se pudo desactivar el autenticador.'
  } finally {
    actualizandoMfa.value = false
  }
}

onMounted(async () => {
  try {
    factoresMfa.value = await listarFactoresTotp()
    mfaCargado.value = true
  } catch {
    mensajeMfa.value = 'No se pudo consultar el estado del autenticador. Recarga para reintentar.'
  }
})

async function guardarCorrecciones() {
  rectificando.value = true
  const r = await derechosService.corregirMisDatos({ ...formRectificacion.value })
  rectificando.value = false
  if (!r.ok) {
    return decir(r.error, 'error')
  }
  decir('Tus datos fueron corregidos y ya se reflejan en tu perfil y en tu ficha de salud.')
  await cargarTodo()
}

async function descargar() {
  descargando.value = true
  const r = await derechosService.descargarMisDatos()
  descargando.value = false
  r.ok
    ? decir('Descargamos tus datos en formato JSON. Guárdalos en un lugar seguro: incluyen datos de salud.')
    : decir(r.error, 'error')
  await cargarTodo()
}

async function descargarPdf() {
  descargandoPdf.value = true
  const r = await derechosService.descargarMisDatosPdf()
  descargandoPdf.value = false
  r.ok
    ? decir('Descargamos tu informe de datos en PDF. Guárdalo en un lugar seguro: incluye datos de salud.')
    : decir(r.error, 'error')
  await cargarTodo()
}

function cerrarModalSolicitud() {
  modalSolicitud.value.visible = false
}

async function enviar() {
  avisoSolicitud.value = { texto: '', tipo: 'ok' }
  const derechoElegido = etiquetaTipo(tipo.value)
  const detalleEnviado = String(detalle.value || '').trim()
  enviando.value = true
  const r = await derechosService.crearSolicitud({ tipo: tipo.value, detalle: detalle.value })
  enviando.value = false
  if (!r.ok) {
    avisoSolicitud.value = { texto: r.error, tipo: 'error' }
    return decir(r.error, 'error')
  }
  tipo.value = ''
  detalle.value = ''
  avisoSolicitud.value = {
    texto: 'Solicitud formal enviada. Ya aparece registrada abajo en "Mis solicitudes y acciones registradas".',
    tipo: 'ok'
  }
  modalSolicitud.value = {
    visible: true,
    derecho: derechoElegido,
    detalle: detalleEnviado
  }
  decir('Solicitud formal enviada. Te responderemos dentro del plazo legal.')
  await cargarTodo()
}

async function revocar() {
  trabajando.value = true
  const r = await derechosService.revocarConsentimiento()
  trabajando.value = false
  r.ok
    ? decir('Retiraste tu consentimiento. Para volver a medir deberás aceptarlo de nuevo.')
    : decir(r.error, 'error')
  await cargarTodo()
}

function cancelarEliminar() {
  pedirConfirmacion.value = false
  textoConfirmar.value = ''
}

async function eliminar() {
  if (textoConfirmar.value !== 'BORRAR') return
  trabajando.value = true
  const r = await derechosService.eliminarMisDatos()
  trabajando.value = false
  cancelarEliminar()
  if (r.ok) {
    // Limpiar de inmediato los datos mostrados en pantalla para reflejar la supresión
    resumenDatos.value = {
      ...resumenDatos.value,
      consentimiento: { vigente: false },
      totalMediciones: 0,
      fichaSalud: null
    }
    decir('Borramos tus mediciones, tu ficha de salud y tu progreso. La acción quedó registrada en la auditoría.')
  } else {
    decir(r.error, 'error')
  }
  await cargarTodo()
}
</script>

<style scoped>
.mis-datos {
  max-width: 920px;
  margin: 0 auto;
  display: grid;
  gap: 1.15rem;
  padding-bottom: 2.5rem;
}

.mis-datos-header {
  display: grid;
  gap: 0.35rem;
}

.intro {
  color: var(--color-muted);
  margin: 0;
  line-height: 1.5;
}

.seccion-derecho {
  padding: 1.25rem 1.4rem;
}

.seccion-encabezado {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.85rem;
}

h2 {
  font-size: 1.12rem;
  font-weight: 800;
  color: #0f172a;
  margin: 0 0 0.65rem;
}

.seccion-encabezado h2 {
  margin-bottom: 0;
}

.card p {
  line-height: 1.5;
  font-size: 0.93rem;
}

.consulta-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
  gap: 1rem;
}

.consulta-panel {
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 10px;
  padding: 1rem 1.15rem;
}

.consulta-panel h3 {
  margin: 0 0 0.75rem 0;
  font-size: 0.96rem;
  font-weight: 700;
  color: #0f172a;
}

.lista-definicion {
  margin: 0;
  display: grid;
  gap: 0.5rem;
}

.fila-dato {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  font-size: 0.88rem;
  border-bottom: 1px solid #f1f5f9;
  padding-bottom: 0.35rem;
}

.fila-dato:last-child {
  border-bottom: none;
  padding-bottom: 0;
}

.fila-dato dt {
  color: #475569;
  font-weight: 500;
}

.fila-dato dd {
  margin: 0;
  color: #0f172a;
  font-weight: 600;
  text-align: right;
}

.badge-estado {
  display: inline-block;
  padding: 0.15rem 0.6rem;
  border-radius: 999px;
  font-size: 0.76rem;
  font-weight: 700;
}

.badge-vigente {
  background: #dcfce7;
  color: #166534;
}

.badge-revocado {
  background: #fee2e2;
  color: #991b1b;
}

.vacio-ficha {
  margin: 0;
  color: #64748b;
  font-size: 0.87rem;
}

.banner-rectificacion {
  background: #dcfce7;
  border: 1px solid #86efac;
  color: #14532d;
  padding: 0.6rem 0.9rem;
  border-radius: 8px;
  font-size: 0.86rem;
  font-weight: 600;
  text-align: center;
  margin-bottom: 1rem;
}

.form-rectificacion {
  display: grid;
  gap: 0.9rem;
}

.grid-rectificacion-4 {
  display: grid;
  grid-template-columns: 2fr 0.9fr 1.3fr 1.3fr;
  gap: 0.85rem;
}

.grid-rectificacion-3 {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.85rem;
}

@media (max-width: 760px) {
  .grid-rectificacion-4,
  .grid-rectificacion-3 {
    grid-template-columns: 1fr;
  }
}

.btn-guardar-rectificacion {
  width: 100%;
  justify-content: center;
  margin-top: 0.25rem;
}

.btn-exportar-json {
  background: #ffffff;
  border: 1px solid #cbd5e1;
  color: #0f172a;
  font-weight: 600;
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

.lista {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: 0.75rem;
}

.lista li {
  border: 1px solid var(--color-border);
  border-radius: 8px;
  padding: 0.6rem 0.8rem;
  display: grid;
  gap: 0.2rem;
}

.estado {
  font-size: 0.8rem;
  font-weight: 700;
}

.estado.resuelta {
  color: #166534;
}

.estado.rechazada {
  color: #991b1b;
}

.respuesta {
  margin: 0.2rem 0 0;
}

.vacio {
  color: var(--color-muted);
}

.peligro {
  background: #fef2f2;
  border: 1px solid #fca5a5;
  border-left: 4px solid #dc2626;
}

.acciones {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.5rem;
}

.btn-danger {
  background: #dc2626;
  color: #fff;
  border: 0;
  min-height: var(--alto-tactil, 44px);
  padding: 0 1rem;
  border-radius: 0.5rem;
  font-weight: 600;
  cursor: pointer;
}

.btn-danger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.confirmacion {
  margin-top: 0.75rem;
  padding-top: 0.75rem;
  border-top: 1px solid #fecaca;
}

.alerta-local {
  margin-bottom: 0.85rem;
}

.texto-ayuda-obligatorio {
  font-size: 0.82rem;
  font-weight: 500;
  color: #b45309;
  margin-left: 0.35rem;
}

.texto-ayuda-opcional {
  font-size: 0.82rem;
  font-weight: 400;
  color: #64748b;
  margin-left: 0.35rem;
}

.detalle-solicitud {
  margin: 0.2rem 0 0;
  font-size: 0.88rem;
  color: #334155;
}

.modal-solicitud-backdrop {
  position: fixed;
  inset: 0;
  z-index: 1200;
  background: rgba(15, 23, 42, 0.55);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}

.modal-solicitud-card {
  width: 100%;
  max-width: 440px;
  background: #ffffff;
  border-radius: 14px;
  border: 1px solid #cbd5e1;
  border-top: 5px solid #16a34a;
  box-shadow: 0 20px 45px rgba(15, 23, 42, 0.22);
  padding: 1.6rem 1.5rem;
  text-align: center;
}

.modal-solicitud-icono {
  width: 54px;
  height: 54px;
  margin: 0 auto 0.85rem;
  border-radius: 999px;
  background: #dcfce7;
  color: #15803d;
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-solicitud-titulo {
  margin: 0 0 0.5rem;
  font-size: 1.2rem;
  font-weight: 700;
  color: #0f172a;
}

.modal-solicitud-texto {
  margin: 0 0 0.75rem;
  font-size: 0.94rem;
  line-height: 1.5;
  color: #334155;
}

.modal-solicitud-detalle {
  margin: 0 0 1.1rem;
  padding: 0.65rem 0.85rem;
  background: #f8fafc;
  border: 1px solid #e2e8f0;
  border-radius: 8px;
  font-size: 0.86rem;
  color: #1e293b;
  text-align: left;
}

.modal-solicitud-detalle span {
  font-weight: 600;
  color: #475569;
}

.btn-modal-aceptar {
  width: 100%;
  min-height: 44px;
}

.item-solicitud-titular {
  border-left: 4px solid #cbd5e1;
}

.item-solicitud-titular.plazo-vencida {
  border-left-color: #dc2626;
  background: #fef2f2;
}

.item-solicitud-titular.plazo-proxima {
  border-left-color: #d97706;
  background: #fffbeb;
}

.item-solicitud-titular.plazo-respondida {
  border-left-color: #16a34a;
}

.fila-cabecera-solicitud {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
}

.insignia-plazo {
  font-size: 0.78rem;
  font-weight: 600;
  padding: 0.15rem 0.5rem;
  border-radius: 999px;
}

.insignia-plazo.vencida {
  background: #fee2e2;
  color: #991b1b;
}

.insignia-plazo.proxima {
  background: #fef3c7;
  color: #92400e;
}

.insignia-plazo.en-plazo {
  background: #e0f2fe;
  color: #075985;
}

.fechas-solicitud {
  color: #475569;
  font-size: 0.84rem;
}

.respuesta-box {
  margin-top: 0.35rem;
  padding: 0.6rem 0.8rem;
  border-radius: 8px;
  background: #f0fdf4;
  border: 1px solid #bbf7d0;
  color: #14532d;
  font-size: 0.9rem;
}

.respuesta-box .respuesta {
  margin: 0.25rem 0 0;
}
</style>
