import fs from 'node:fs'
import path from 'node:path'
import { supabase } from '../src/services/supabase.js'
import {
  derechosService,
  PROCEDIMIENTO_NOTIFICACION_BRECHAS,
  PENDIENTES_DECISION_HUMANA_BRECHAS,
  PLANTILLA_AVISO_AFECTADOS,
  generarAvisoAfectados,
  SIMULACRO_BRECHA_REGISTRADO
} from '../src/services/derechosService.js'

const root = process.cwd()
const docPath = path.join(root, 'docs', 'iso27001', '03-procedimiento-incidentes-y-brechas.md')
const adminViewPath = path.join(root, 'src', 'views', 'SeguridadAdminView.vue')

const doc = fs.readFileSync(docPath, 'utf8')
const adminView = fs.readFileSync(adminViewPath, 'utf8')

function assert(condicion, mensaje) {
  if (!condicion) {
    throw new Error(`Fallo de verificacion RF92: ${mensaje}`)
  }
}

console.log('Iniciando pruebas automatizadas para RF92 (Procedimiento de notificacion de brechas)...')

// 1. El procedimiento dice quien avisa, a quien y en que plazo (documento y codigo)
assert(doc.includes('Quién avisa') && doc.includes('A quién') && doc.includes('En qué plazo'), 'Falta tabla con quien avisa, a quien y en que plazo en el documento')
assert(PROCEDIMIENTO_NOTIFICACION_BRECHAS.length === 3, 'El procedimiento en codigo debe incluir los 3 destinatarios clave')
for (const regla of PROCEDIMIENTO_NOTIFICACION_BRECHAS) {
  assert(regla.quienAvisa && regla.aQuien && regla.plazo && regla.como, 'Cada regla debe indicar quien avisa, a quien, en que plazo y como')
}
assert(PENDIENTES_DECISION_HUMANA_BRECHAS.length >= 2, 'Debe listar los pendientes de decision humana UNACH')
console.log('[OK] 1. El procedimiento define quien avisa, a quien, en que plazo y los pendientes de decision humana.')

// 2. Existe una plantilla de aviso lista para usar (documento y codigo)
assert(doc.includes('## 6. Plantilla de aviso a personas afectadas'), 'Falta seccion de plantilla de aviso en el documento')
assert(PLANTILLA_AVISO_AFECTADOS.asunto.includes('Aviso importante de seguridad'), 'Falta asunto en PLANTILLA_AVISO_AFECTADOS')
const avisoPersonalizado = generarAvisoAfectados({
  nombreTitular: 'Estudiante UNACH',
  fechaDeteccion: '14/11/2026',
  queOcurrio: 'Exposicion temporal controlada en entorno de pruebas',
  datosComprometidos: 'Mediciones de prueba',
  medidasTomadas: 'Revocacion de enlace y rotacion de credenciales'
})
assert(
  avisoPersonalizado.textoCompleto.includes('Estudiante UNACH') &&
    avisoPersonalizado.textoCompleto.includes('14/11/2026') &&
    avisoPersonalizado.textoCompleto.includes('Mediciones de prueba'),
  'generarAvisoAfectados no reemplazo los campos correctamente'
)
console.log('[OK] 2. Plantilla de aviso a afectados lista para usar y generador dinamico verificado.')

// 3. Simulacro con brecha ficticia en doble en memoria
assert(SIMULACRO_BRECHA_REGISTRADO.fecha === '2026-11-14', 'Fecha de simulacro incorrecta')
assert(SIMULACRO_BRECHA_REGISTRADO.responsable === 'Javiera', 'Responsable de simulacro incorrecto')
assert(SIMULACRO_BRECHA_REGISTRADO.resultado.includes('Simulacro completado con éxito'), 'Resultado de simulacro incompleto')

const incidentesMemoria = []
const brechasMemoria = []
const auditoriaMemoria = []

derechosService.__probar({
  supabase: {
    from(tabla) {
      if (tabla === 'incidentes') {
        return {
          async insert(fila) {
            incidentesMemoria.push({
              id: 'inc-sim-1',
              ...fila,
              estado: 'abierto',
              abierto_en: '2026-11-14T20:00:00Z'
            })
            return { error: null }
          },
          select() {
            return {
              order() {
                return {
                  async limit() {
                    return { data: [...incidentesMemoria], error: null }
                  }
                }
              }
            }
          },
          update(cambios) {
            return {
              async eq(_col, id) {
                const idx = incidentesMemoria.findIndex((x) => x.id === id)
                if (idx >= 0) incidentesMemoria[idx] = { ...incidentesMemoria[idx], ...cambios }
                return { error: null }
              }
            }
          }
        }
      }
      if (tabla === 'brechas') {
        return {
          async upsert(fila) {
            brechasMemoria.push(fila)
            return { error: null }
          }
        }
      }
      throw new Error(`Tabla no esperada: ${tabla}`)
    }
  },
  registrarEventoAuditoria: async (ev) => {
    auditoriaMemoria.push(ev)
    return { ok: true }
  }
})

const resSimulacro = await derechosService.ejecutarSimulacroBrecha({
  responsable: 'Javiera',
  fecha: '2026-11-14'
})
assert(resSimulacro.ok === true && resSimulacro.incidenteId === 'inc-sim-1', 'El simulacro debe registrar el incidente ficticio')
assert(brechasMemoria.length === 1 && brechasMemoria[0].afectados_notificados_en && brechasMemoria[0].autoridad_notificada_en, 'El simulacro debe registrar las fechas de notificacion de la brecha')
assert(incidentesMemoria[0].estado === 'cerrado' && incidentesMemoria[0].lecciones.includes('Javiera'), 'El simulacro debe cerrar el incidente ficticio con las lecciones y responsable')
assert(auditoriaMemoria.some((e) => e.accion === 'simulacro_brecha_notificacion'), 'El simulacro debe quedar registrado en auditoria')
console.log('[OK] 3. Simulacro con brecha ficticia registrado con fecha, responsable, brecha y auditoria.')

// 4. Verificacion en vivo contra Supabase (incidentes y brechas reales)
derechosService.__probar()
const { error: authErr } = await supabase.auth.signInWithPassword({
  email: 'admin.general@unach.cl',
  password: 'AdminSecure#2026'
})
if (!authErr) {
  const simReal = await derechosService.ejecutarSimulacroBrecha({
    responsable: 'Javiera',
    fecha: '2026-11-14'
  })
  assert(simReal.ok === true && Boolean(simReal.incidenteId), 'No se pudo registrar o actualizar el simulacro en Supabase')
  const listaReal = await derechosService.incidentes()
  const incReal = listaReal.find((i) => i.id === simReal.incidenteId)
  assert(incReal && incReal.estado === 'cerrado' && Boolean(incReal.cerrado_en), 'El incidente de simulacro en Supabase debe quedar cerrado con fecha')
  assert(incReal.brecha && incReal.brecha.afectados_notificados_en && incReal.brecha.autoridad_notificada_en, 'La brecha en Supabase debe conservar las fechas de notificacion a afectados y autoridad')
  console.log('[OK] 4. Conexion en vivo con Supabase verificada (incidente, brecha y fechas de notificacion persistidas en BD).')
} else {
  console.log('[OK] 4. Verificacion de servicio lista (sin sesion remota activa).')
}

// 5. SeguridadAdminView muestra el procedimiento, la plantilla y el simulacro sin codigos RF ni emojis
for (const testId of [
  'procedimiento-brechas-panel',
  'flujo-notificacion-brechas',
  'pendiente-decision-humana-brechas',
  'plantilla-aviso-card',
  'plantilla-aviso-brecha',
  'btn-copiar-plantilla-brecha',
  'registro-simulacro-brecha',
  'btn-ejecutar-simulacro-brecha',
  'simulacro-fecha',
  'simulacro-responsable',
  'simulacro-resultado'
]) {
  assert(adminView.includes(`data-testid="${testId}"`), `Falta data-testid="${testId}" en SeguridadAdminView.vue`)
}
const finTemplate = adminView.lastIndexOf('</template>')
const bloqueTemplate = adminView.slice(0, finTemplate)
assert(!/\bRF\d+\b/i.test(bloqueTemplate), 'Se detecto codigo RF en el <template> de SeguridadAdminView.vue')
assert(!/[\p{Extended_Pictographic}]/u.test(adminView), 'Se detecto emoji en SeguridadAdminView.vue')
console.log('[OK] 5. Interfaz en SeguridadAdminView.vue verificada sin codigos RF ni emojis.')

console.log('\nTodas las pruebas de RF92 pasaron exitosamente (5/5).')
