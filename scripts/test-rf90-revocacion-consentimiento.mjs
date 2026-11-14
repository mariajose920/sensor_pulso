// RF90 · Revocación del consentimiento:
// 1. Al revocar, retirar o anonimizar las publicaciones del usuario en la galería y por enlace.
// 2. Impedir nuevas mediciones y publicaciones hasta que consienta de nuevo.
// 3. Registrar el evento en la auditoría y avisar al usuario de qué cambió.
// Uso: node scripts/test-rf90-revocacion-consentimiento.mjs

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  derechosService,
  revocacion_consentimiento,
  CAMBIOS_REVOCACION_CONSENTIMIENTO
} from '../src/services/derechosService.js'
import {
  consentimientoService,
  consentimientoEstado
} from '../src/services/consentimientoService.js'
import {
  guardarMedicion,
  publicarMedicion,
  registrarPublicacionAnonimaLocal,
  limpiarPublicacionesAnonimasLocales
} from '../src/services/medicionesService.js'
import { evaluarPublicacion, accionHistorial } from '../src/utils/terminarMedicion.js'
import { asignarCanalAutomaticoEstudiante } from '../src/services/canalesService.js'

console.log('Iniciando pruebas automatizadas para RF90 (Revocacion del consentimiento)...')

// Simular localStorage en entorno Node para validar retiro de publicaciones locales y consentimiento
const memoriaLocalStorage = new Map()
globalThis.localStorage = {
  getItem: (k) => (memoriaLocalStorage.has(k) ? memoriaLocalStorage.get(k) : null),
  setItem: (k, v) => memoriaLocalStorage.set(k, String(v)),
  removeItem: (k) => memoriaLocalStorage.delete(k),
  clear: () => memoriaLocalStorage.clear()
}

const usuarioId = 'uid-javiera-rf90'
const tokenEnlace = 'a1b2c3d4e5f60718293a4b5c'

const estadoBd = {
  consentimientos: [
    {
      id: 'cons-rf90-1',
      usuario_id: usuarioId,
      version: '1.0',
      aceptado_en: '2026-11-10T10:00:00Z',
      revocado_en: null
    }
  ],
  mediciones: [
    {
      id: 'med-rf90-1',
      usuario_id: usuarioId,
      fuente: 'sensor',
      fin: '2026-11-10T10:05:00Z',
      bpm_promedio: 74,
      spo2_promedio: 98,
      publica: true
    }
  ],
  publicaciones: [
    {
      id: 'pub-rf90-1',
      medicion_id: 'med-rf90-1',
      autor_id: usuarioId,
      token_enlace: tokenEnlace,
      titulo: 'Medición Basal UNACH',
      rango_edad: '18-24',
      ritmo: 'normal',
      calidad: 'buena',
      bpm_promedio: 74,
      spo2_promedio: 98,
      dentro_de_rango: true,
      confirmada_en: '2026-11-10T10:06:00Z',
      retirada_en: null,
      creada_en: '2026-11-10T10:06:00Z'
    }
  ],
  solicitudes: [],
  auditoria: []
}

// Simulación fiel de las vistas y funciones de Supabase (20261027000600 y 20261027000700)
const supabaseDoble = {
  auth: {
    async getSession() {
      return {
        data: {
          session: {
            access_token: 'tok-rf90',
            user: {
              id: usuarioId,
              email: 'javierarail@alu.unach.cl',
              user_metadata: { nombre: 'Javiera Rail' }
            }
          }
        }
      }
    }
  },
  from(tabla) {
    if (tabla === 'perfiles') {
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: {
                id: usuarioId,
                nombre: 'Javiera Rail',
                correo: 'javierarail@alu.unach.cl',
                rol: 'usuario'
              },
              error: null
            })
          })
        })
      }
    }

    if (tabla === 'consentimientos_aceptados') {
      return {
        select: () => ({
          eq: (_c, val) => ({
            order: () => ({
              limit: async () => ({
                data: estadoBd.consentimientos.filter((c) => c.usuario_id === val),
                error: null
              })
            })
          })
        })
      }
    }

    if (tabla === 'mediciones') {
      return {
        select: () => ({
          eq: async (_c, val) => {
            const m = estadoBd.mediciones.filter((x) => x.usuario_id === val)
            return { data: m, count: m.length, error: null }
          }
        })
      }
    }

    if (tabla === 'solicitudes_derechos') {
      return {
        select: () => ({
          eq: (_c, val) => ({
            order: () => ({
              limit: async () => ({
                data: estadoBd.solicitudes.filter((s) => s.usuario_id === val),
                error: null
              })
            })
          })
        })
      }
    }

    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
    }
  },
  async rpc(nombre) {
    if (nombre === 'revocar_consentimiento') {
      const ahora = new Date().toISOString()
      estadoBd.consentimientos = estadoBd.consentimientos.map((c) =>
        c.usuario_id === usuarioId && c.revocado_en === null ? { ...c, revocado_en: ahora } : c
      )
      estadoBd.publicaciones = estadoBd.publicaciones.map((p) =>
        p.autor_id === usuarioId && p.retirada_en === null ? { ...p, retirada_en: ahora } : p
      )
      estadoBd.mediciones = estadoBd.mediciones.map((m) =>
        m.usuario_id === usuarioId && m.publica ? { ...m, publica: false } : m
      )
      estadoBd.solicitudes.unshift({
        id: `sol-rev-${estadoBd.solicitudes.length + 1}`,
        usuario_id: usuarioId,
        tipo: 'revocar_consentimiento',
        estado: 'resuelta',
        recibida_en: ahora,
        resuelta_en: ahora
      })
      estadoBd.auditoria.push({
        accion: 'revocacion_consentimiento',
        entidad: 'perfiles',
        entidad_id: usuarioId,
        origen: 'bd_rpc'
      })
      return { error: null }
    }
    return { data: null, error: null }
  }
}

derechosService.__probar({
  supabase: supabaseDoble,
  registrarEventoAuditoria: async (ev) => {
    estadoBd.auditoria.push(ev)
    return { ok: true }
  }
})

// Simular que el usuario aceptó consentimiento y tenía una publicación tanto en BD como local
await consentimientoService.aceptarConsentimiento('1.0')
assert.equal(consentimientoEstado.value.vigente, true, 'El consentimiento inicia vigente')

const pubLocalPrevia = registrarPublicacionAnonimaLocal({
  titulo: 'Publicación local previa',
  bpm: 74,
  spo2: 98,
  confirmacionExplicita: true
})
assert.ok(pubLocalPrevia && pubLocalPrevia.id, 'Se registra una publicación anónima local mientras hay consentimiento')

// Vista simulada de galería y enlace público antes de revocar (filtra retirada_en === null)
const consultarGaleriaVisible = () => estadoBd.publicaciones.filter((p) => p.retirada_en === null)
const consultarPorEnlace = (tok) =>
  estadoBd.publicaciones.find((p) => p.token_enlace === tok && p.retirada_en === null) || null

assert.equal(consultarGaleriaVisible().length, 1, 'Antes de revocar, la publicación es visible en la galería')
assert.notEqual(consultarPorEnlace(tokenEnlace), null, 'Antes de revocar, el enlace compartido funciona')

// 1. Ejecutar revocación del consentimiento (RF90)
const resultadoRevocacion = await revocacion_consentimiento()
assert.equal(resultadoRevocacion.ok, true, 'revocacion_consentimiento se ejecuta con éxito')
assert.ok(Array.isArray(resultadoRevocacion.cambios) && resultadoRevocacion.cambios.length === 3, 'Devuelve la lista de qué cambió para avisar al usuario')
assert.equal(
  JSON.stringify(resultadoRevocacion.cambios),
  JSON.stringify(CAMBIOS_REVOCACION_CONSENTIMIENTO),
  'Los cambios informados coinciden con la especificación'
)
assert.ok(/galería/i.test(resultadoRevocacion.mensaje) && /enlace/i.test(resultadoRevocacion.mensaje), 'El aviso explica retiro de galería y enlaces')

// 2. Criterio 1: Tras revocar, sus publicaciones dejan de ser visibles en la galería y por enlace
assert.equal(consultarGaleriaVisible().length, 0, 'Tras revocar, las publicaciones del usuario dejan de ser visibles en la galería')
assert.equal(consultarPorEnlace(tokenEnlace), null, 'Tras revocar, la publicación deja de ser visible por enlace compartido')
assert.equal(estadoBd.mediciones[0].publica, false, 'La medición se desmarca como pública')
assert.equal(globalThis.localStorage.getItem('sensor_publicaciones_anonimas_locales'), null, 'Se retiran también las publicaciones anónimas locales')
console.log('[OK] 1. Tras revocar, las publicaciones dejan de ser visibles en la galeria y por enlace.')

// 3. Criterio 2: No puede publicar ni medir sin un nuevo consentimiento
assert.equal(consentimientoEstado.value.vigente, false, 'El estado reactivo de consentimiento pasa a no vigente')
assert.ok(Boolean(consentimientoEstado.value.revocadoEn), 'Queda marca de tiempo de revocación')

const intentoGuardarMedicion = await guardarMedicion({
  usuarioId,
  fuente: 'sensor',
  bpm: 75,
  spo2: 98,
  calidad: 'buena'
})
assert.equal(intentoGuardarMedicion.ok, false, 'Impide guardar una nueva medición de sensor tras revocar')
assert.equal(intentoGuardarMedicion.motivo, 'consentimiento', 'El motivo de rechazo al medir/guardar es falta de consentimiento')

const intentoPublicar = await publicarMedicion('med-rf90-1', 'Intento tras revocar', true)
assert.equal(intentoPublicar.ok, false, 'Impide publicar tras revocar el consentimiento')
assert.equal(intentoPublicar.motivo, 'consentimiento', 'El motivo de rechazo al publicar es falta de consentimiento')

const intentoPublicarLocal = registrarPublicacionAnonimaLocal({
  titulo: 'Intento local tras revocar',
  bpm: 75,
  spo2: 98,
  confirmacionExplicita: true
})
assert.equal(intentoPublicarLocal, null, 'Impide registrar publicaciones locales mientras el consentimiento está revocado')

const evalPub = evaluarPublicacion({
  haySesion: true,
  rol: 'usuario',
  consentimientoVigente: consentimientoEstado.value.vigente,
  fuente: 'sensor'
})
assert.equal(evalPub.preguntar, false, 'evaluarPublicacion bloquea ofrecer publicación sin consentimiento vigente')
assert.equal(evalPub.codigo, 'sin_consentimiento')

const accHist = accionHistorial(
  { id: 'med-rf90-1', usuarioId, fuente: 'sensor', fin: '2026-11-10T10:05:00Z', publica: false },
  { haySesion: true, sesionReal: true, rol: 'usuario', usuarioActualId: usuarioId, consentimientoVigente: false }
)
assert.equal(accHist.accion, null, 'En Historial no se permite publicar sin consentimiento vigente')
assert.ok(/consentimiento informado vigente/i.test(accHist.motivo || ''), 'Explica que requiere consentimiento vigente')

await assert.rejects(
  () => asignarCanalAutomaticoEstudiante(),
  (err) => err.requisito === 'consentimiento' || /consentimiento|ficha/i.test(err.message),
  'Impide asignar canal de medición cuando el consentimiento no está vigente'
)
console.log('[OK] 2. Impide nuevas mediciones y publicaciones hasta que el usuario consienta de nuevo.')

// 4. Criterio 3: Queda registro de la revocación en auditoría y en solicitudes_derechos
const eventosAuditoriaRevocacion = estadoBd.auditoria.filter((a) => a.accion === 'revocacion_consentimiento')
assert.ok(eventosAuditoriaRevocacion.length >= 2, 'Queda registro de la revocación tanto en BD como en el servicio de auditoría')
const solicitudesTitular = await derechosService.misSolicitudes()
assert.ok(
  solicitudesTitular.some((s) => s.tipo === 'revocar_consentimiento' && s.estado === 'resuelta'),
  'Queda registrada la acción revocar_consentimiento en el historial de solicitudes del titular'
)
console.log('[OK] 3. Queda registro en auditoria y en las solicitudes del titular, avisando al usuario que cambio.')

// 5. Verificar que al otorgar un NUEVO consentimiento vuelve a habilitarse
await consentimientoService.aceptarConsentimiento('1.0')
assert.equal(consentimientoEstado.value.vigente, true, 'Al otorgar un nuevo consentimiento vuelve a quedar vigente')
const evalPubNuevo = evaluarPublicacion({
  haySesion: true,
  rol: 'usuario',
  consentimientoVigente: consentimientoEstado.value.vigente,
  fuente: 'sensor'
})
assert.equal(evalPubNuevo.preguntar, true, 'Con un nuevo consentimiento se habilita nuevamente la publicación')
limpiarPublicacionesAnonimasLocales()
console.log('[OK] 4. Al otorgar un nuevo consentimiento se restablece la capacidad de medir y publicar.')

// 6. Verificación estática de vistas, servicio y migración SQL (cero códigos RF visibles y cero emojis)
const misDatosVue = readFileSync(resolve('src/views/MisDatosView.vue'), 'utf8')
const medicionVue = readFileSync(resolve('src/views/MedicionView.vue'), 'utf8')
const consentSrv = readFileSync(resolve('src/services/consentimientoService.js'), 'utf8')
const migracionSql = readFileSync(resolve('supabase/migrations/20261027000700_seguridad_cumplimiento.sql'), 'utf8')

assert.ok(
  consentSrv.includes(".upsert(") && consentSrv.includes("onConflict: 'usuario_id,version'"),
  'aceptarConsentimiento usa upsert para reactivar en BD un consentimiento previamente revocado'
)

assert.ok(migracionSql.includes('create or replace function public.revocar_consentimiento()'), 'Existe la función SQL revocar_consentimiento')
assert.ok(migracionSql.includes('update public.publicaciones set retirada_en = now()'), 'La función SQL retira las publicaciones en galería')
assert.ok(migracionSql.includes("perform public.registrar_auditoria('revocacion_consentimiento'"), 'La función SQL registra en auditoría')

assert.ok(misDatosVue.includes('data-testid="aviso-cambios-revocacion"'), 'MisDatosView muestra el recuadro de qué cambió tras revocar')
assert.ok(misDatosVue.includes('data-testid="enlace-nuevo-consentimiento"'), 'MisDatosView incluye enlace para otorgar nuevo consentimiento')
assert.ok(medicionVue.includes('data-testid="btn-revocar-consentimiento-medicion"'), 'MedicionView permite revocar desde el Paso 1')
assert.ok(medicionVue.includes('data-testid="aviso-consentimiento-revocado-medicion"'), 'MedicionView avisa cuando el consentimiento fue revocado')

const tplMisDatos = (misDatosVue.match(/<template>([\s\S]*?)<\/template>/)?.[1] || '').replace(/<!--[\s\S]*?-->/g, '')
const tplMedicion = (medicionVue.match(/<template>([\s\S]*?)<\/template>/)?.[1] || '').replace(/<!--[\s\S]*?-->/g, '')
assert.equal(/\bRF\d+\b/i.test(tplMisDatos), false, 'MisDatosView no muestra etiquetas RF en el template')
assert.equal(/\bRF\d+\b/i.test(tplMedicion), false, 'MedicionView no muestra etiquetas RF en el template')

const EMOJI_RE = /[\u{1F300}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}\u{1FA70}-\u{1FAFF}]/u
assert.equal(EMOJI_RE.test(misDatosVue), false, 'MisDatosView no contiene emojis')
assert.equal(EMOJI_RE.test(medicionVue), false, 'MedicionView no contiene emojis')
console.log('[OK] 5. Plantillas y migracion verificadas (sin etiquetas RF visibles ni emojis).')

console.log('\nTodas las pruebas de RF90 pasaron exitosamente (5/5).')
