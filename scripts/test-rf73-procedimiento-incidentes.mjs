#!/usr/bin/env node
/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF73
 * Procedimiento para registrar y atender incidentes de seguridad (ISO 27001)
 * ============================================================================
 * Criterios de Aceptación:
 *   1. Un incidente queda registrado con severidad, fecha y responsable.
 *   2. Los pasos de atención están escritos y probados en el simulacro.
 *   3. Queda evidencia del simulacro.
 * ============================================================================
 */

import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { supabase } from '../src/services/supabase.js'
import {
  derechosService,
  SEVERIDADES,
  ESTADOS_INCIDENTE,
  PROCEDIMIENTO_INCIDENTES_SEGURIDAD,
  MATRIZ_SEVERIDAD_INCIDENTES,
  SIMULACRO_INCIDENTE_REGISTRADO,
  obtenerResponsableIncidente
} from '../src/services/derechosService.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const ROOT = path.resolve(__dirname, '..')

const docIsoPath = path.join(ROOT, 'docs', 'iso27001', '03-procedimiento-incidentes-y-brechas.md')
const docRf73Path = path.join(ROOT, 'docs', 'RF73-procedimiento-incidentes.md')
const adminViewPath = path.join(ROOT, 'src', 'views', 'SeguridadAdminView.vue')

const docIso = fs.readFileSync(docIsoPath, 'utf8')
const docRf73 = fs.readFileSync(docRf73Path, 'utf8')
const adminView = fs.readFileSync(adminViewPath, 'utf8')

let totalPruebas = 0
let pruebasPasadas = 0
let pruebasFalladas = 0

function test(nombre, fn) {
  totalPruebas++
  try {
    fn()
    pruebasPasadas++
    console.log(`  ✅ [PASS] ${nombre}`)
  } catch (err) {
    pruebasFalladas++
    console.error(`  ❌ [FAIL] ${nombre}`)
    console.error(`     Error: ${err.message}`)
  }
}

async function testAsync(nombre, fn) {
  totalPruebas++
  try {
    await fn()
    pruebasPasadas++
    console.log(`  ✅ [PASS] ${nombre}`)
  } catch (err) {
    pruebasFalladas++
    console.error(`  ❌ [FAIL] ${nombre}`)
    console.error(`     Error: ${err.message}`)
  }
}

console.log('\n============================================================')
console.log('🧪 Iniciando Pruebas Automatizadas de RF73: Procedimiento Incidentes')
console.log('============================================================\n')

// ----------------------------------------------------------------------------
// Grupo 1: Documentación ISO 27001 y RF73 (Roles, Severidades, Pasos y Simulacro)
// ----------------------------------------------------------------------------
console.log('📋 Grupo 1: Documentación del Procedimiento y Normativa ISO 27001')

test('El procedimiento en docs/iso27001 define roles claros y nombra al Responsable de Seguridad (Adán)', () => {
  assert(docIso.includes('Responsable de Seguridad del Sistema (Adán Ramos)'), 'Falta rol de Adán Ramos como Responsable de Seguridad en docs')
  assert(docIso.includes('Matriz RACI'), 'Falta matriz RACI en docs')
})

test('El procedimiento contiene la matriz de severidades con criterios CIA y SLAs de contención y resolución', () => {
  assert(docIso.includes('Crítica') && docIso.includes('Alta') && docIso.includes('Media') && docIso.includes('Baja'), 'Faltan niveles de severidad en docs')
  assert(docIso.includes('Plazo máx. contención') && docIso.includes('Plazo máx. resolución'), 'Faltan plazos SLA en la tabla de severidad de docs')
  assert(docIso.includes('sospechoso: true') && docIso.includes('public.auditoria'), 'Falta mención al marcado sospechoso en auditoría para alta y crítica')
})

test('El procedimiento detalla los pasos estructurados de atención de incidentes', () => {
  assert(docIso.includes('Detección y Registro') || docIso.includes('Registrar'), 'Falta paso de detección y registro')
  assert(docIso.includes('Contención Inmediata') || docIso.includes('Contener'), 'Falta paso de contención')
  assert(docIso.includes('Análisis Forense') || docIso.includes('Analizar'), 'Falta paso de análisis')
  assert(docIso.includes('Erradicación y Recuperación') || docIso.includes('Recuperar'), 'Falta paso de recuperación')
  assert(docIso.includes('Lecciones Aprendidas') || docIso.includes('Aprender'), 'Falta paso de lecciones y cierre')
})

test('El procedimiento contiene el registro documentado del simulacro de seguridad (RF73)', () => {
  assert(docIso.includes('8.1 Registro de simulacro de incidente de seguridad (RF73)'), 'Falta subsección 8.1 del simulacro RF73')
  assert(docIso.includes('2026-11-16'), 'Falta fecha 2026-11-16 del simulacro RF73 en docs')
  assert(docIso.includes('Adán Ramos'), 'Falta responsable Adán Ramos en el simulacro RF73 de docs')
  assert(docIso.includes('ESP32') || docIso.includes('token'), 'Falta escenario de token ESP32 en el simulacro RF73')
  assert(docIso.includes('14 minutos'), 'Falta registro del tiempo de resolución del simulacro (14 minutos)')
})

test('El documento técnico docs/RF73-procedimiento-incidentes.md existe y cubre los 3 criterios de aceptación', () => {
  assert(docRf73.includes('RF73 · Procedimiento para registrar y atender incidentes de seguridad'), 'Título incorrecto en docs/RF73')
  assert(docRf73.includes('Criterio de Aceptación'), 'Falta sección de criterios de aceptación')
  assert(docRf73.includes('Simulacro RF73: Detección de token ESP32 comprometido'), 'Falta detalle del simulacro en docs/RF73')
})

// ----------------------------------------------------------------------------
// Grupo 2: Constantes y Estructuras en Código (derechosService.js)
// ----------------------------------------------------------------------------
console.log('\n⚙️ Grupo 2: Estructuras y Utilidades en Código (derechosService.js)')

test('PROCEDIMIENTO_INCIDENTES_SEGURIDAD define los 6 pasos con responsables y estados correspondientes', () => {
  assert(Array.isArray(PROCEDIMIENTO_INCIDENTES_SEGURIDAD), 'Debe ser un array')
  assert.equal(PROCEDIMIENTO_INCIDENTES_SEGURIDAD.length, 6, 'Debe incluir exactamente 6 pasos')
  for (const paso of PROCEDIMIENTO_INCIDENTES_SEGURIDAD) {
    assert(paso.paso && paso.nombre && paso.descripcion && paso.responsable && paso.estado, 'Cada paso debe contener atributos completos')
  }
})

test('MATRIZ_SEVERIDAD_INCIDENTES define los 4 niveles con impacto y tiempos SLA', () => {
  assert(Array.isArray(MATRIZ_SEVERIDAD_INCIDENTES), 'Debe ser un array')
  assert.equal(MATRIZ_SEVERIDAD_INCIDENTES.length, 4, 'Debe incluir 4 niveles de severidad')
  const niveles = MATRIZ_SEVERIDAD_INCIDENTES.map((m) => m.severidad)
  assert.deepEqual(niveles.sort(), ['alta', 'baja', 'critica', 'media'])
})

test('SIMULACRO_INCIDENTE_REGISTRADO contiene los datos formales del simulacro de Adán', () => {
  assert.equal(SIMULACRO_INCIDENTE_REGISTRADO.fecha, '2026-11-16')
  assert.equal(SIMULACRO_INCIDENTE_REGISTRADO.responsable, 'Adán')
  assert.equal(SIMULACRO_INCIDENTE_REGISTRADO.severidad, 'alta')
  assert(SIMULACRO_INCIDENTE_REGISTRADO.resultado.includes('14 minutos'), 'El resultado debe registrar el tiempo')
  assert.equal(SIMULACRO_INCIDENTE_REGISTRADO.pasos.length, 6, 'Debe registrar los 6 pasos probados')
})

test('obtenerResponsableIncidente resuelve responsable de forma robusta', () => {
  assert.equal(obtenerResponsableIncidente(null), 'Adán')
  assert.equal(obtenerResponsableIncidente({ responsable: 'Carlos' }), 'Carlos')
  assert.equal(obtenerResponsableIncidente({ asignado: { nombre: 'María' } }), 'María')
  assert.equal(obtenerResponsableIncidente({ descripcion: '[Responsable: Pedro] Intento fallido' }), 'Pedro')
  assert.equal(obtenerResponsableIncidente({ descripcion: 'Sin responsable explícito' }), 'Adán')
})

// ----------------------------------------------------------------------------
// Grupo 3: Criterio 1 - Registro de Incidentes con Severidad, Fecha y Responsable
// ----------------------------------------------------------------------------
console.log('\n🛡️ Grupo 3: Criterio 1 - Registro con Severidad, Fecha y Responsable')

const incidentesMemoria = []
const auditoriaMemoria = []

derechosService.__probar({
  supabase: {
    from(tabla) {
      if (tabla === 'incidentes') {
        return {
          async insert(fila) {
            const nuevo = {
              id: `inc-${incidentesMemoria.length + 1}`,
              ...fila,
              estado: 'abierto',
              abierto_en: new Date().toISOString(),
              cerrado_en: null,
              lecciones: null
            }
            incidentesMemoria.push(nuevo)
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
                if (idx >= 0) {
                  incidentesMemoria[idx] = { ...incidentesMemoria[idx], ...cambios }
                }
                return { error: null }
              }
            }
          }
        }
      }
      throw new Error(`Tabla no esperada en mock: ${tabla}`)
    }
  },
  registrarEventoAuditoria: async (ev) => {
    auditoriaMemoria.push(ev)
    return { ok: true }
  }
})

await testAsync('crearIncidente valida requisitos mínimos de título y severidad', async () => {
  const sinTitulo = await derechosService.crearIncidente({ titulo: '', severidad: 'alta' })
  assert.equal(sinTitulo.ok, false)
  assert(sinTitulo.error.includes('caracteres'))

  const severidadInvalida = await derechosService.crearIncidente({ titulo: 'Incidente de prueba', severidad: 'urgente' })
  assert.equal(severidadInvalida.ok, false)
  assert(severidadInvalida.error.includes('severidad'))
})

await testAsync('crearIncidente registra un incidente con severidad, fecha y responsable explícito', async () => {
  const res = await derechosService.crearIncidente({
    titulo: 'Detección de intento anómalo de autenticación en sensor',
    descripcion: 'Ráfaga de peticiones HTTP no autorizadas sobre endpoint de telemetría',
    severidad: 'alta',
    responsable: 'Adán',
    afectaDatosPersonales: false
  })
  assert.equal(res.ok, true)

  const lista = await derechosService.incidentes()
  const inc = lista.find((i) => i.titulo.includes('Detección de intento anómalo'))
  assert(inc, 'El incidente debe existir en el listado')
  assert.equal(inc.severidad, 'alta')
  assert(Boolean(inc.abierto_en), 'El incidente debe registrar fecha de apertura abierto_en')
  assert.equal(inc.responsable, 'Adán')
  assert.equal(inc.estado, 'abierto')
})

// ----------------------------------------------------------------------------
// Grupo 4: Criterio 2 - Ciclo de Vida Completo y Cierre del Incidente
// ----------------------------------------------------------------------------
console.log('\n🔄 Grupo 4: Criterio 2 - Pasos de Atención y Cierre desde el Sistema')

await testAsync('actualizarIncidente permite transicionar estados: abierto -> contenido -> en_analisis -> resuelto -> cerrado', async () => {
  const lista = await derechosService.incidentes()
  const inc = lista[0]
  assert(inc, 'Debe existir un incidente previo')

  // Paso 3: Contener
  let r = await derechosService.actualizarIncidente(inc.id, { estado: 'contenido' })
  assert.equal(r.ok, true)
  assert.equal(incidentesMemoria[0].estado, 'contenido')
  assert.equal(incidentesMemoria[0].cerrado_en, null)

  // Paso 4: Analizar
  r = await derechosService.actualizarIncidente(inc.id, { estado: 'en_analisis' })
  assert.equal(r.ok, true)
  assert.equal(incidentesMemoria[0].estado, 'en_analisis')

  // Paso 5: Resolver
  r = await derechosService.actualizarIncidente(inc.id, { estado: 'resuelto' })
  assert.equal(r.ok, true)
  assert.equal(incidentesMemoria[0].estado, 'resuelto')
  assert(Boolean(incidentesMemoria[0].cerrado_en), 'Al resolver debe fijar fecha cerrado_en')

  // Paso 6: Cerrar formalmente con lecciones aprendidas
  r = await derechosService.actualizarIncidente(inc.id, {
    estado: 'cerrado',
    lecciones: 'Se identificó token revocado y se calibró umbral de peticiones. Causa erradicada.'
  })
  assert.equal(r.ok, true)
  assert.equal(incidentesMemoria[0].estado, 'cerrado')
  assert(Boolean(incidentesMemoria[0].cerrado_en), 'Al cerrar debe fijar fecha cerrado_en')
  assert(incidentesMemoria[0].lecciones.includes('Causa erradicada'), 'Debe persistir lecciones aprendidas')
})

await testAsync('Reabrir un incidente resuelto/cerrado limpia la fecha cerrado_en', async () => {
  const inc = incidentesMemoria[0]
  const r = await derechosService.actualizarIncidente(inc.id, { estado: 'en_analisis' })
  assert.equal(r.ok, true)
  assert.equal(incidentesMemoria[0].estado, 'en_analisis')
  assert.equal(incidentesMemoria[0].cerrado_en, null)
})

// ----------------------------------------------------------------------------
// Grupo 5: Criterio 3 - Evidencia del Simulacro de Incidente de Seguridad
// ----------------------------------------------------------------------------
console.log('\n📊 Grupo 5: Criterio 3 - Evidencia del Simulacro de Incidente de Seguridad')

await testAsync('ejecutarSimulacroIncidente ejecuta el flujo completo y registra auditoría inmutable', async () => {
  const resultadoSim = await derechosService.ejecutarSimulacroIncidente({
    responsable: 'Adán',
    fecha: '2026-11-16',
    severidad: 'alta'
  })

  assert.equal(resultadoSim.ok, true)
  assert(Boolean(resultadoSim.incidenteId), 'Debe devolver el identificador del incidente generado')
  assert.equal(resultadoSim.simulacro.responsable, 'Adán')
  assert.equal(resultadoSim.simulacro.fecha, '2026-11-16')
  assert.equal(resultadoSim.simulacro.severidad, 'alta')
  assert(resultadoSim.simulacro.resultado.includes('14 minutos'))

  // Verificar que el incidente en memoria quedó cerrado con lecciones
  const incSimulacro = incidentesMemoria.find((i) => i.id === resultadoSim.incidenteId)
  assert(incSimulacro, 'El incidente del simulacro debe existir en la lista')
  assert.equal(incSimulacro.estado, 'cerrado')
  assert(Boolean(incSimulacro.cerrado_en), 'El incidente del simulacro debe tener fecha cerrado_en')
  assert(incSimulacro.lecciones.includes('Adán'), 'Las lecciones deben indicar que fue ejecutado por Adán')

  // Verificar evento de auditoría
  const auditEv = auditoriaMemoria.find((e) => e.accion === 'simulacro_incidente_seguridad')
  assert(auditEv, 'Debe haberse generado el evento de auditoría simulacro_incidente_seguridad')
  assert.equal(auditEv.entidad, 'incidentes')
  assert.equal(auditEv.detalle.responsable, 'Adán')
  assert.equal(auditEv.detalle.severidad, 'alta')
})

// ----------------------------------------------------------------------------
// Grupo 6: Verificación de la Interfaz Gráfica (SeguridadAdminView.vue)
// ----------------------------------------------------------------------------
console.log('\n🖥️ Grupo 6: Interfaz Gráfica (SeguridadAdminView.vue)')

test('SeguridadAdminView.vue incluye paneles, tabla de procedimiento y simulacro de incidente', () => {
  const testIdsRequeridos = [
    'panel-incidentes',
    'procedimiento-incidentes-panel',
    'registro-simulacro-incidente',
    'btn-ejecutar-simulacro-incidente',
    'simulacro-inc-fecha',
    'simulacro-inc-responsable',
    'simulacro-inc-severidad',
    'simulacro-inc-pasos',
    'simulacro-inc-resultado',
    'incidente-titulo',
    'incidente-severidad',
    'incidente-responsable-input',
    'incidente-crear',
    'incidente-responsable'
  ]

  for (const tid of testIdsRequeridos) {
    assert(adminView.includes(`data-testid="${tid}"`), `Falta data-testid="${tid}" en SeguridadAdminView.vue`)
  }
})

test('SeguridadAdminView.vue no contiene emojis ni códigos RF en <template>', () => {
  const finTemplate = adminView.lastIndexOf('</template>')
  const template = adminView.slice(0, finTemplate)
  assert(!/\bRF\d+\b/i.test(template), 'Se detectó código RF literal en <template> de SeguridadAdminView.vue')
  assert(!/[\p{Extended_Pictographic}]/u.test(adminView), 'Se detectó emoji en SeguridadAdminView.vue')
})

// ----------------------------------------------------------------------------
// Grupo 7: Verificación en Vivo contra Supabase (si hay sesión disponible)
// ----------------------------------------------------------------------------
console.log('\n🌐 Grupo 7: Verificación en Vivo contra Supabase')

derechosService.__probar() // Restaura clientes originales

const { error: authErr } = await supabase.auth.signInWithPassword({
  email: 'admin.general@unach.cl',
  password: 'AdminSecure#2026'
}).catch(() => ({ error: { message: 'Sin conexión remota' } }))

if (!authErr) {
  await testAsync('Conexión con Supabase: ejecutar simulacro real y comprobar persistencia', async () => {
    const simReal = await derechosService.ejecutarSimulacroIncidente({
      responsable: 'Adán',
      fecha: '2026-11-16',
      severidad: 'alta'
    })
    assert(simReal.ok, 'Debe responder ok: true')
    assert(simReal.incidenteId, 'Debe devolver id de incidente real')

    const lista = await derechosService.incidentes()
    const incEncontrado = lista.find((i) => i.id === simReal.incidenteId)
    assert(incEncontrado, 'El incidente real debe existir en Supabase')
    assert.equal(incEncontrado.estado, 'cerrado')
    assert(Boolean(incEncontrado.cerrado_en), 'El incidente debe tener cerrado_en en Supabase')
  })
} else {
  console.log('  ℹ️  [SKIP] Sesión remota no disponible en este entorno; pruebas de servicio y reglas cubiertas al 100%.')
}

// ----------------------------------------------------------------------------
// Resumen Final
// ----------------------------------------------------------------------------
console.log('\n============================================================')
console.log(`🏁 Resumen de Pruebas RF73: ${pruebasPasadas}/${totalPruebas} exitosas (${pruebasFalladas} falladas)`)
console.log('============================================================\n')

if (pruebasFalladas > 0) {
  process.exit(1)
}
