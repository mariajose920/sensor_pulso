/**
 * ============================================================================
 * sensor_pulso · Pruebas Automatizadas de RF31
 * Control de Acceso a Medición con Sensor, Publicación y Anonimización (RF57 / RF98)
 * ============================================================================
 */

import assert from 'node:assert'
import fs from 'node:fs'
import path from 'node:path'

import {
  PERMISO_PUBLICAR,
  puedeMedirConSensorPorCuenta,
  puedePublicarPorCuenta,
  evaluarPublicacion,
  vistaPreviaPublica,
  vistaPreviaSinDatosIdentificables,
  rangoDeEdad
} from '../src/utils/terminarMedicion.js'

let passed = 0
let failed = 0

function it(description, fn) {
  try {
    fn()
    console.log(`[PASS] ${description}`)
    passed++
  } catch (err) {
    console.error(`[FAIL] ${description}`)
    console.error(`       Error: ${err.message}`)
    failed++
  }
}

console.log('======================================================================')
console.log('EJECUTANDO SUITE DE PRUEBAS RF31: PERMISOS DE MEDICION Y PUBLICACION')
console.log('======================================================================\n')

// ----------------------------------------------------------------------------
// 1. REGLAS DE MEDICION Y PUBLICACION POR CUENTA Y PERMISOS (RF31 + RF98)
// ----------------------------------------------------------------------------
console.log('--- 1. Control de Acceso para Medir con Sensor y Publicar ---')

it('Visitante sin sesión NO puede medir con sensor ni publicar mediciones', () => {
  const resMedir = puedeMedirConSensorPorCuenta({ haySesion: false })
  const resPub = puedePublicarPorCuenta({ haySesion: false })
  assert.strictEqual(resMedir.puede, false)
  assert.strictEqual(resMedir.codigo, 'sin_sesion')
  assert.strictEqual(resPub.puede, false)
  assert.strictEqual(resPub.codigo, 'sin_sesion')
})

it('Estudiante con sesión (rol usuario) SÍ puede medir con sensor y publicar', () => {
  const resMedir = puedeMedirConSensorPorCuenta({ haySesion: true, rol: 'usuario' })
  const resPub = puedePublicarPorCuenta({ haySesion: true, rol: 'usuario' })
  assert.strictEqual(resMedir.puede, true)
  assert.strictEqual(resPub.puede, true)
})

it('Profesor con sesión SIN permiso granular NO puede medir ni publicar', () => {
  const sinPerm = { [PERMISO_PUBLICAR]: false, crear_aulas: true }
  const resMedir = puedeMedirConSensorPorCuenta({ haySesion: true, rol: 'profesor', permisos: sinPerm })
  const resPub = puedePublicarPorCuenta({ haySesion: true, rol: 'profesor', permisos: sinPerm })
  assert.strictEqual(resMedir.puede, false)
  assert.strictEqual(resMedir.codigo, 'sin_permiso')
  assert.strictEqual(resPub.puede, false)
  assert.strictEqual(resPub.codigo, 'sin_permiso')
})

it('Profesor con sesión CON permiso de galería SÍ puede medir con sensor y publicar', () => {
  const conPerm = { [PERMISO_PUBLICAR]: true }
  const resMedir = puedeMedirConSensorPorCuenta({ haySesion: true, rol: 'profesor', permisos: conPerm })
  const resPub = puedePublicarPorCuenta({ haySesion: true, rol: 'profesor', permisos: conPerm })
  assert.strictEqual(resMedir.puede, true)
  assert.strictEqual(resPub.puede, true)
})

it('Administrador con sesión SÍ puede medir con sensor y publicar siempre', () => {
  const resMedir = puedeMedirConSensorPorCuenta({ haySesion: true, esAdmin: true, rol: 'profesor', permisos: null })
  const resPub = puedePublicarPorCuenta({ haySesion: true, esAdmin: true, rol: 'profesor', permisos: null })
  assert.strictEqual(resMedir.puede, true)
  assert.strictEqual(resPub.puede, true)
})

// ----------------------------------------------------------------------------
// 2. ANONIMIZACION OBLIGATORIA Y VISIBILIDAD PUBLICA (RF57)
// ----------------------------------------------------------------------------
console.log('\n--- 2. Anonimización Garantizada y Visibilidad Pública ---')

it('Vista previa de publicación omite nombre, correo y convierte edad a rango etario', () => {
  const registro = {
    resumen: { bpm: 74, spo2: 98, ritmo: 'normal', calidad: 'buena' },
    datos: { edad: 22 }
  }
  const vista = vistaPreviaPublica(registro)
  assert.strictEqual(vistaPreviaSinDatosIdentificables(vista, 'Constanza Morales'), true)
  const rango = vista.campos.find(c => c.etiqueta === 'Rango de edad')
  assert.strictEqual(rango?.valor, '18-24')
  assert.strictEqual(rangoDeEdad(22), '18-24')
  assert.ok(vista.excluidos.includes('nombre'))
})

it('Servicio de publicaciones públicas consulta solo columnas anonimizadas sin autor_id', () => {
  const serviceCode = fs.readFileSync(path.resolve('src/services/medicionesService.js'), 'utf8')
  assert.ok(serviceCode.includes('listarPublicacionesPublicas'), 'Debe exportar listarPublicacionesPublicas')
  const fnBlock = serviceCode.slice(serviceCode.indexOf('export async function listarPublicacionesPublicas'))
  assert.ok(!fnBlock.includes('autor_id'), 'No debe seleccionar autor_id en la consulta pública')
  assert.ok(!fnBlock.includes('perfiles'), 'No debe hacer join con perfiles personales')
  assert.ok(fnBlock.includes('Participante UNACH (Anónimo)'), 'Debe rotular autor genérico anónimo')
})

it('Galería pública carga publicaciones reales y es accesible sin sesión', () => {
  const galeriaCode = fs.readFileSync(path.resolve('src/data/galeriaPublica.js'), 'utf8')
  assert.ok(galeriaCode.includes('listarPublicacionesPublicas'), 'obtenerMedicionesPublicas debe invocar listarPublicacionesPublicas')
  const routerCode = fs.readFileSync(path.resolve('src/router/index.js'), 'utf8')
  const compMatch = routerCode.match(/name:\s*'Comparacion'[\s\S]{0,120}/)
  assert.ok(compMatch && !compMatch[0].includes('requiresAuth'), 'Comparación debe ser pública sin sesión')
})

// ----------------------------------------------------------------------------
// 3. INTERFACES SIN ETIQUETAS TECNICAS RF Y TEXTOS PERSONALIZADOS
// ----------------------------------------------------------------------------
console.log('\n--- 3. Verificación de Interfaces, Permisos en Vistas y Cero Siglas RF ---')

it('LoginView y MedicionView muestran el aviso exacto solicitado para operar el sensor sin sesión', () => {
  const loginCode = fs.readFileSync(path.resolve('src/views/LoginView.vue'), 'utf8')
  const medicionCode = fs.readFileSync(path.resolve('src/views/MedicionView.vue'), 'utf8')

  const textoTitulo = 'Se requiere inicio de sesión para operar el sensor de pulso'
  const textoDetalle = 'Para conectarte al sensor y registrar bioseñales en tiempo real, debes identificarte con tu cuenta institucional de la UNACH (@alu.unach.cl o @unach.cl).'
  const textoSimulador = 'Continuar en Modo Simulador Educativo'

  assert.ok(loginCode.includes(textoTitulo), 'LoginView debe incluir título personalizado')
  assert.ok(loginCode.includes(textoDetalle), 'LoginView debe incluir detalle personalizado')
  assert.ok(loginCode.includes(textoSimulador), 'LoginView debe incluir acceso al Simulador Educativo')

  assert.ok(medicionCode.includes(textoTitulo), 'MedicionView debe incluir título personalizado')
  assert.ok(medicionCode.includes(textoDetalle), 'MedicionView debe incluir detalle personalizado')
  assert.ok(medicionCode.includes(textoSimulador), 'MedicionView debe incluir acceso al Simulador Educativo')
})

it('MedicionView bloquea sensor para profesor sin permiso y ofrece publicación anónima en Paso 5', () => {
  const medicionCode = fs.readFileSync(path.resolve('src/views/MedicionView.vue'), 'utf8')
  assert.ok(medicionCode.includes('profesorSinPermisoSensor'), 'Debe evaluar permiso del profesor para sensor')
  assert.ok(medicionCode.includes('publicacion-paso5-card'), 'Debe mostrar tarjeta de publicación anónima en Paso 5')
  assert.ok(medicionCode.includes('Garantía de Anonimización Biomédica'), 'Debe detallar qué datos se publican y cuáles nunca')

  // Verificar ausencia de etiquetas RF visibles en plantilla y pasosInfo
  const tplMatch = medicionCode.match(/<template>([\s\S]*?)<\/template>/)
  const tplSinComentarios = (tplMatch ? tplMatch[1] : '').replace(/<!--[\s\S]*?-->/g, '')
  assert.strictEqual(tplSinComentarios.match(/RF\d+/gi), null, 'La plantilla visible de MedicionView no debe mostrar siglas RF')
  assert.ok(!medicionCode.includes('Ficha y factores RF03'), 'pasosInfo no debe mostrar RF03')
})

it('useAuth consulta permisos granulares reales del profesor en BD y almacenamiento local', () => {
  const authCode = fs.readFileSync(path.resolve('src/composables/useAuth.js'), 'utf8')
  assert.ok(authCode.includes('obtenerPermisosProfesor'), 'useAuth debe importar y consultar permisos del profesor')
  assert.ok(authCode.includes('permisosProfesor.value[permiso]'), 'tienePermisoProfesor debe verificar el permiso solicitado')
})

// ----------------------------------------------------------------------------
// 4. AUDITORIA DE CERO EMOJIS EN CODIGO RF31
// ----------------------------------------------------------------------------
console.log('\n--- 4. Auditoría de CERO EMOJIS en Módulos de RF31 ---')

const EMOJI_STRICT = /[\u{1F300}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}\u{1FA70}-\u{1FAFF}]/u
const archivosLimpios = [
  'src/utils/terminarMedicion.js',
  'src/composables/useAuth.js',
  'src/services/adminService.js',
  'src/services/medicionesService.js',
  'src/data/galeriaPublica.js',
  'src/components/ComparadorMedicionesCard.vue',
  'src/views/MedicionView.vue',
  'scripts/test-rf31-permisos-publicacion.mjs'
]

for (const relPath of archivosLimpios) {
  it(`Archivo sin emojis gráficos: ${relPath}`, () => {
    const content = fs.readFileSync(path.resolve(relPath), 'utf8')
    const match = content.match(EMOJI_STRICT)
    assert.strictEqual(match, null, `Se encontró un emoji en ${relPath}: ${match ? match[0] : ''}`)
  })
}

console.log('\n======================================================================')
console.log(`RESULTADO DE LA SUITE RF31: ${passed} APROBADAS / ${failed} FALLADAS`)
console.log('======================================================================')

process.exit(failed > 0 ? 1 : 0)
