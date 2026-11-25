import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import {
  derechosService,
  validarRectificacionDatos,
  validarSolicitud
} from '../src/services/derechosService.js'

console.log('Iniciando pruebas automatizadas para RF58 (Derechos del titular: consultar, exportar, corregir, eliminar y revocar)...')

// Estado simulado del sistema para probar el ciclo completo de extremo a extremo
const usuarioTitularId = 'uid-javiera-rf58'
let estadoSistema = {
  perfil: {
    id: usuarioTitularId,
    nombre: 'Javiera Rail',
    correo: 'javiera.rail@alu.unach.cl',
    rol: 'usuario',
    creado_en: '2026-10-01T12:00:00Z',
    politica_version: '1.0',
    politica_aceptada_en: '2026-10-01T12:00:00Z'
  },
  consentimientos: [
    {
      id: 'cons-1',
      usuario_id: usuarioTitularId,
      version: '1.0',
      aceptado_en: '2026-10-01T12:05:00Z',
      revocado_en: null
    }
  ],
  mediciones: [
    { id: 'med-1', usuario_id: usuarioTitularId, bpm_promedio: 72 },
    { id: 'med-2', usuario_id: usuarioTitularId, bpm_promedio: 68 }
  ],
  fichaDeclarada: {
    id: 'decl-1',
    nombre: 'Javiera Rail',
    edad: 22,
    nivelEstres: 'medio',
    suenoHoras: '7_8',
    cafeina: 'ninguna',
    medicacionTipo: 'ninguna',
    medicacion: 'Ninguna',
    condicionSalud: 'Ninguna conocida'
  },
  solicitudes: [],
  auditoria: [],
  cacheLocalLimpia: false
}

const supabaseDoble = {
  auth: {
    async getSession() {
      return {
        data: {
          session: {
            access_token: 'token-prueba-rf58',
            user: {
              id: usuarioTitularId,
              email: estadoSistema.perfil.correo,
              user_metadata: { nombre: estadoSistema.perfil.nombre }
            }
          }
        }
      }
    },
    async updateUser({ data }) {
      if (data?.nombre) estadoSistema.perfil.nombre = data.nombre
      return { data: { user: { id: usuarioTitularId } }, error: null }
    }
  },
  from(tabla) {
    if (tabla === 'perfiles') {
      return {
        select() {
          return {
            eq(_col, val) {
              return {
                async maybeSingle() {
                  if (val !== usuarioTitularId) return { data: null, error: null }
                  return { data: { ...estadoSistema.perfil }, error: null }
                }
              }
            }
          }
        },
        update(cambios) {
          return {
            async eq(_col, val) {
              if (val === usuarioTitularId) {
                estadoSistema.perfil = { ...estadoSistema.perfil, ...cambios }
              }
              return { error: null }
            }
          }
        }
      }
    }

    if (tabla === 'consentimientos_aceptados') {
      return {
        select() {
          return {
            eq(_col, val) {
              return {
                order() {
                  return {
                    async limit() {
                      const propios = estadoSistema.consentimientos.filter(c => c.usuario_id === val)
                      return { data: propios, error: null }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    if (tabla === 'mediciones') {
      return {
        select() {
          return {
            async eq(_col, val) {
              const propios = estadoSistema.mediciones.filter(m => m.usuario_id === val)
              return { data: propios, count: propios.length, error: null }
            }
          }
        },
        delete() {
          return {
            async eq(_col, val) {
              estadoSistema.mediciones = estadoSistema.mediciones.filter(m => m.usuario_id !== val)
              return { error: null }
            }
          }
        }
      }
    }

    if (tabla === 'declaraciones_paciente' || tabla === 'rangos_usuario') {
      return {
        delete() {
          return {
            async eq() {
              if (tabla === 'declaraciones_paciente') {
                estadoSistema.fichaDeclarada = null
              }
              return { error: null }
            }
          }
        }
      }
    }

    if (tabla === 'solicitudes_derechos') {
      return {
        async insert(fila) {
          estadoSistema.solicitudes.unshift({
            id: `sol-${estadoSistema.solicitudes.length + 1}`,
            recibida_en: new Date().toISOString(),
            vence_en: new Date(Date.now() + 30 * 86400000).toISOString(),
            ...fila
          })
          return { error: null }
        },
        select() {
          return {
            eq(_col, val) {
              return {
                order() {
                  return {
                    async limit() {
                      return {
                        data: estadoSistema.solicitudes.filter(s => s.usuario_id === val),
                        error: null
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }

    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) })
    }
  },
  async rpc(nombreFuncion) {
    if (nombreFuncion === 'exportar_mis_datos') {
      estadoSistema.auditoria.push({ accion: 'exportacion_datos', origen: 'rpc' })
      return {
        data: {
          generado_en: new Date().toISOString(),
          perfil: { ...estadoSistema.perfil },
          consentimientos: [...estadoSistema.consentimientos],
          mediciones: [...estadoSistema.mediciones],
          alertas: [],
          comparaciones: [],
          progreso: [],
          aulas: [],
          evaluaciones: [],
          solicitudes: [...estadoSistema.solicitudes]
        },
        error: null
      }
    }

    if (nombreFuncion === 'revocar_consentimiento') {
      estadoSistema.consentimientos = estadoSistema.consentimientos.map(c => ({
        ...c,
        revocado_en: new Date().toISOString()
      }))
      estadoSistema.auditoria.push({ accion: 'revocacion_consentimiento', origen: 'rpc' })
      return { error: null }
    }

    if (nombreFuncion === 'eliminar_mis_datos') {
      estadoSistema.mediciones = []
      estadoSistema.fichaDeclarada = null
      estadoSistema.consentimientos = estadoSistema.consentimientos.map(c => ({
        ...c,
        revocado_en: c.revocado_en || new Date().toISOString()
      }))
      estadoSistema.auditoria.push({ accion: 'supresion_datos', origen: 'rpc' })
      return { error: null }
    }

    return { data: null, error: null }
  }
}

const pacienteServiceDoble = {
  async obtenerDeclaracionActiva() {
    return estadoSistema.fichaDeclarada ? { ...estadoSistema.fichaDeclarada } : null
  },
  async guardarDeclaracion(nuevosDatos) {
    estadoSistema.fichaDeclarada = {
      ...(estadoSistema.fichaDeclarada || {}),
      ...nuevosDatos
    }
    return { ok: true, data: estadoSistema.fichaDeclarada }
  },
  limpiarDeclaracionLocal() {
    estadoSistema.fichaDeclarada = null
    return true
  }
}

derechosService.__probar({
  supabase: supabaseDoble,
  pacienteService: pacienteServiceDoble,
  registrarEventoAuditoria: async (ev) => {
    estadoSistema.auditoria.push(ev)
    return { ok: true }
  },
  limpiarCacheLocal: async () => {
    estadoSistema.fichaDeclarada = null
    estadoSistema.cacheLocalLimpia = true
  }
})

// 1. Derecho de CONSULTA: el titular ve sus propios datos desde "Mis datos"
{
  const consultaInicial = await derechosService.consultarMisDatos()
  assert.equal(consultaInicial.ok, true)
  assert.equal(consultaInicial.datos.perfil.nombre, 'Javiera Rail')
  assert.equal(consultaInicial.datos.perfil.correo, 'javiera.rail@alu.unach.cl')
  assert.equal(consultaInicial.datos.consentimiento.vigente, true)
  assert.equal(consultaInicial.datos.totalMediciones, 2)
  assert.equal(consultaInicial.datos.fichaSalud.edad, 22)
  assert.equal(consultaInicial.datos.fichaSalud.nivelEstres, 'medio')
  console.log('[OK] 1. Derecho de consulta: el titular ve su perfil, consentimiento, mediciones y ficha de salud.')
}

// 2. Derecho de RECTIFICACIÓN (corregir): los datos corregidos se reflejan inmediatamente en el sistema
{
  assert.notEqual(validarRectificacionDatos({ nombre: 'A', edad: 22, nivelEstres: 'medio' }), '', 'Rechaza nombre de 1 letra')
  assert.notEqual(validarRectificacionDatos({ nombre: 'Javiera', edad: 15, nivelEstres: 'medio' }), '', 'Rechaza menores de 18 años')

  const rect = await derechosService.corregirMisDatos({
    nombre: 'Javiera Belén Rail Astudillo',
    edad: 23,
    nivelEstres: 'bajo',
    suenoHoras: 'mas_8',
    cafeina: 'baja',
    medicacion: 'Paracetamol ocasional',
    condicionSalud: 'Sin patologías crónicas'
  })
  assert.equal(rect.ok, true, 'La rectificación válida debe completarse con éxito')

  // Verificar que al volver a consultar, los cambios se reflejan en el sistema
  const consultaTrasCorregir = await derechosService.consultarMisDatos()
  assert.equal(consultaTrasCorregir.datos.perfil.nombre, 'Javiera Belén Rail Astudillo')
  assert.equal(consultaTrasCorregir.datos.fichaSalud.nombre, 'Javiera Belén Rail Astudillo')
  assert.equal(consultaTrasCorregir.datos.fichaSalud.edad, 23)
  assert.equal(consultaTrasCorregir.datos.fichaSalud.nivelEstres, 'bajo')
  assert.equal(consultaTrasCorregir.datos.fichaSalud.suenoHoras, 'mas_8')
  assert.equal(consultaTrasCorregir.datos.fichaSalud.cafeina, 'baja')
  assert.equal(consultaTrasCorregir.datos.fichaSalud.medicacion, 'Paracetamol ocasional')
  assert.equal(consultaTrasCorregir.datos.fichaSalud.condicionSalud, 'Sin patologías crónicas')

  // Verificar que quedó registrada la solicitud resuelta de rectificación y el evento de auditoría
  const solicitudes = await derechosService.misSolicitudes()
  assert.ok(solicitudes.some(s => s.tipo === 'rectificacion' && s.estado === 'resuelta'))
  assert.ok(estadoSistema.auditoria.some(a => a.accion === 'rectificacion_datos'))
  console.log('[OK] 2. Derecho de rectificacion (corregir): los datos corregidos se reflejan en el sistema y se auditan.')
}

// 3. Derecho de PORTABILIDAD (exportar): descarga los datos del titular en JSON y en PDF y audita
{
  const exp = await derechosService.descargarMisDatos()
  assert.equal(exp.ok, true)
  assert.equal(exp.exportacion.perfil.nombre, 'Javiera Belén Rail Astudillo')
  assert.equal(exp.exportacion.mediciones.length, 2)
  assert.ok(estadoSistema.auditoria.some(a => a.accion === 'exportacion_datos' && a.detalle?.formato === 'json'))

  const expPdf = await derechosService.descargarMisDatosPdf()
  assert.equal(expPdf.ok, true)
  assert.equal(expPdf.formato, 'pdf')
  assert.equal(expPdf.exportacion.perfil.nombre, 'Javiera Belén Rail Astudillo')
  assert.ok(estadoSistema.auditoria.some(a => a.accion === 'exportacion_datos' && a.detalle?.formato === 'pdf'))
  console.log('[OK] 3. Derecho de exportacion (portabilidad): genera archivo en JSON y PDF con datos actualizados y audita.')
}

// 4. Derecho de REVOCACIÓN del consentimiento
{
  const rev = await derechosService.revocarConsentimiento()
  assert.equal(rev.ok, true)
  const consultaTrasRevocar = await derechosService.consultarMisDatos()
  assert.equal(consultaTrasRevocar.datos.consentimiento.vigente, false)
  assert.ok(estadoSistema.auditoria.some(a => a.accion === 'revocacion_consentimiento'))
  console.log('[OK] 4. Revocacion de consentimiento: detiene el consentimiento vigente y registra en auditoria.')
}

// 5. Derecho de SUPRESIÓN (eliminar): lo eliminado ya no se puede consultar y la acción queda auditada
{
  const sup = await derechosService.eliminarMisDatos()
  assert.equal(sup.ok, true)
  assert.equal(estadoSistema.cacheLocalLimpia, true, 'Debe limpiar toda copia local/sesión del navegador')

  const consultaTrasEliminar = await derechosService.consultarMisDatos()
  assert.equal(consultaTrasEliminar.datos.totalMediciones, 0, 'Las mediciones eliminadas ya no se pueden consultar')
  assert.equal(consultaTrasEliminar.datos.fichaSalud, null, 'La ficha de salud eliminada ya no se puede consultar')
  assert.equal(consultaTrasEliminar.datos.consentimiento.vigente, false)

  const eventosSupresion = estadoSistema.auditoria.filter(a => a.accion === 'supresion_datos')
  assert.ok(eventosSupresion.length >= 1, 'La supresión de datos debe quedar registrada en la auditoría')
  console.log('[OK] 5. Derecho de supresion (eliminar): no quedan datos de salud/mediciones consultables y queda auditado.')
}

// 6. Verificación de plantilla MisDatosView.vue (sin códigos RF ni emojis)
{
  const vista = readFileSync(resolve('src/views/MisDatosView.vue'), 'utf8')
  for (const testId of [
    'consultar-datos',
    'corregir-datos',
    'boton-guardar-correcciones',
    'descargar-datos',
    'boton-descargar',
    'boton-descargar-pdf',
    'acciones-delicadas',
    'boton-revocar',
    'boton-eliminar',
    'eliminar-confirmar'
  ]) {
    assert.ok(vista.includes(`data-testid="${testId}"`), `MisDatosView.vue debe incluir data-testid="${testId}"`)
  }

  const template = vista.match(/<template>([\s\S]*?)<\/template>/)?.[1] || ''
  assert.equal(/\bRF\d+\b/i.test(template), false, 'El template de MisDatosView no debe mostrar códigos RF')
  assert.equal(/[\p{Extended_Pictographic}]/u.test(vista), false, 'MisDatosView.vue no debe contener emojis')
  assert.equal(validarSolicitud({ tipo: 'acceso', detalle: '' }), '')
  console.log('[OK] 6. Plantilla MisDatosView.vue verificada (4 secciones completas, sin codigos RF ni emojis).')
}

console.log('Todas las pruebas de RF58 pasaron exitosamente (6/6).')
