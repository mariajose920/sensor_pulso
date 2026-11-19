/**
 * Pruebas automatizadas para RF56:
 * "Clasificación de los datos (públicos, privados, sensibles de salud) con tratamiento distinto para cada tipo."
 *
 * Ejecutar con: node scripts/test-rf56-clasificacion-datos.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { leerEsquemaDeMigraciones, esColumnaTecnica } from './lib-esquema-sql.mjs'

const leer = ruta => readFileSync(resolve(process.cwd(), ruta), 'utf8')

const datos = await import('../src/data/clasificacionDatos.js')
const servicio = await import('../src/services/clasificacionService.js')
const { CLASES, ORDEN_CLASES, TRATAMIENTOS, nombreTabla, etiquetaClase, metaClase } = datos

let pasadas = 0
function probar(nombre, fn) {
  try {
    fn()
    pasadas++
    console.log(`  [OK] ${nombre}`)
  } catch (err) {
    console.error(`  [FALLO] ${nombre}`)
    console.error(err)
    process.exit(1)
  }
}

// ---- Insumos: migración de RF56, migración original y esquema reconstruido
const RUTA_MIGRACION = 'supabase/migrations/20261119000100_rf56_clasificacion_datos.sql'
const migracion = leer(RUTA_MIGRACION)
const migracionBase = leer('supabase/migrations/20261027000200_auditoria_consentimiento_catalogos.sql') +
  leer('supabase/migrations/20261027000700_seguridad_cumplimiento.sql') +
  leer('supabase/migrations/20261027000800_datos_iniciales.sql')
const esquema = leerEsquemaDeMigraciones(resolve(process.cwd(), 'supabase/migrations'))

function leerFilas(sql) {
  const filas = []
  const re = /\(\s*'(\w+)'\s*,\s*'(\w+)'\s*,\s*'(publico|privado|sensible_salud)'\s*,\s*(true|false)\s*,\s*(true|false)\s*\)/g
  let m
  while ((m = re.exec(sql))) {
    filas.push({ tabla: m[1], columna: m[2], clase: m[3], cifrado: m[4] === 'true', enmascarar: m[5] === 'true' })
  }
  return filas
}
const filasCatalogo = leerFilas(migracion)
const claveFila = f => `${f.tabla}.${f.columna}`
const porClave = new Map(filasCatalogo.map(f => [claveFila(f), f]))

console.log('=== Pruebas RF56: Clasificación de los datos ===')

// ------------------------------------------------------------ los tres tipos y su tratamiento
probar('1. Existen exactamente tres tipos de dato, ordenados de menos a más protegido', () => {
  assert.deepEqual([...ORDEN_CLASES], ['publico', 'privado', 'sensible_salud'])
  assert.deepEqual(Object.keys(CLASES).sort(), ['privado', 'publico', 'sensible_salud'])
  const niveles = ORDEN_CLASES.map(id => CLASES[id].nivel)
  assert.deepEqual(niveles, [1, 2, 3])
  for (const id of ORDEN_CLASES) {
    const c = CLASES[id]
    assert.ok(c.etiqueta && c.resumen && c.descripcion, `${id} debe tener etiqueta, resumen y descripción`)
    assert.ok(c.ejemplos.length >= 3, `${id} debe tener al menos 3 ejemplos`)
  }
  assert.equal(etiquetaClase('sensible_salud'), 'Sensible de salud')
  assert.equal(etiquetaClase('otra'), 'Sin clasificar')
  assert.equal(metaClase('otra'), null)
})

probar('2. Cada tipo tiene un tratamiento distinto en cada aspecto', () => {
  const aspectos = TRATAMIENTOS.map(t => t.id)
  for (const a of ['acceso', 'proteccion', 'publicacion', 'conservacion', 'derechos', 'registro']) {
    assert.ok(aspectos.includes(a), `falta el aspecto ${a}`)
  }
  assert.equal(new Set(aspectos).size, aspectos.length, 'sin aspectos repetidos')
  for (const t of TRATAMIENTOS) {
    for (const id of ORDEN_CLASES) assert.ok(t[id] && t[id].length > 10, `${t.id}/${id} sin texto`)
    const textos = ORDEN_CLASES.map(id => t[id])
    assert.equal(new Set(textos).size, 3, `el aspecto ${t.id} debe tratar distinto a cada tipo`)
  }
})

probar('3. Lo que se promete coincide con lo que existe (cifrado por campo, publicación y retención)', () => {
  const t = Object.fromEntries(TRATAMIENTOS.map(x => [x.id, x]))
  assert.match(t.proteccion.sensible_salud, /cifrado por campo/i)
  assert.doesNotMatch(t.proteccion.privado, /cifrado por campo/i)
  assert.match(t.publicacion.privado, /nunca/i)
  assert.match(t.publicacion.sensible_salud, /anonimizado/i)
  assert.match(t.publicacion.sensible_salud, /confirmaci[oó]n expl[ií]cita/i)
  // Los plazos del texto deben ser los de la política de retención sembrada en la base
  assert.match(migracionBase, /\('declaraciones_paciente',\s*365,\s*'borrar'\)/)
  assert.match(migracionBase, /\('intentos_login',\s*90,\s*'borrar'\)/)
  assert.match(t.conservacion.sensible_salud, /365 días/)
  assert.match(t.conservacion.privado, /90 días/)
  // El enmascaramiento ya existe (src/utils/enmascarar.js): puede describirse, pero no para datos públicos
  assert.match(t.visualizacion.privado, /enmascarad/i)
  assert.doesNotMatch(t.visualizacion.publico, /enmascarad/i)
})

// ------------------------------------------------------------ migración y catálogo
probar('4. La migración agrega la regla de integridad del cifrado por campo', () => {
  assert.match(migracion, /add constraint clasificacion_cifrado_solo_sensible\s+check \(not cifrado_campo or clase = 'sensible_salud'\)/)
  assert.match(migracion, /on conflict \(tabla, columna\) do nothing/i, 'no debe pisar cambios del administrador')
})

probar('5. El catálogo no repite columnas y solo usa los tres tipos válidos', () => {
  assert.ok(filasCatalogo.length >= 140, `el catálogo debe ser amplio (hay ${filasCatalogo.length})`)
  assert.equal(porClave.size, filasCatalogo.length, 'hay columnas repetidas en el catálogo')
  for (const f of filasCatalogo) assert.ok(ORDEN_CLASES.includes(f.clase), claveFila(f))
})

probar('6. Solo los datos sensibles de salud llevan cifrado por campo', () => {
  const cifradas = filasCatalogo.filter(f => f.cifrado)
  assert.deepEqual(cifradas.map(claveFila), ['declaraciones_paciente.datos_cifrados'])
  for (const f of cifradas) assert.equal(f.clase, 'sensible_salud')
})

probar('7. Todas las columnas del catálogo existen en el esquema real de la base', () => {
  assert.ok(esquema.size >= 40, 'el lector de esquema debe encontrar las tablas')
  const faltantes = filasCatalogo.filter(f => !esquema.get(f.tabla)?.has(f.columna)).map(claveFila)
  assert.deepEqual(faltantes, [], 'columnas clasificadas que no existen: ' + faltantes.join(', '))
})

probar('8. TODA la base está clasificada (si una migración futura agrega una columna, esta prueba falla hasta clasificarla)', () => {
  assert.ok(esquema.size >= 45, 'se esperan al menos 45 tablas en las migraciones (hay ' + esquema.size + ')')
  const sinClase = []
  let evaluadas = 0
  for (const [tabla, columnas] of esquema) {
    for (const c of columnas) {
      if (esColumnaTecnica(c)) continue
      evaluadas++
      if (!porClave.has(tabla + '.' + c)) sinClase.push(tabla + '.' + c)
    }
  }
  assert.ok(evaluadas >= 200, 'debe evaluar todas las columnas no técnicas (' + evaluadas + ')')
  assert.deepEqual(sinClase, [], 'columnas sin clasificar: ' + sinClase.join(', '))
})

probar('8b. Toda tabla del catálogo tiene un nombre entendible para las personas', () => {
  const tablas = [...new Set(filasCatalogo.map(f => f.tabla))]
  const sinNombre = tablas.filter(t => !datos.NOMBRES_TABLAS[t])
  assert.deepEqual(sinNombre, [], 'tablas sin nombre legible: ' + sinNombre.join(', '))
})

probar('9. La clase respeta la naturaleza del dato (sin identificadores públicos ni salud sin proteger)', () => {
  // Columnas que identifican a una persona (o su equipo): nunca públicas y marcadas para enmascarar
  const tablasDePersonas = new Set(['perfiles', 'declaraciones_paciente', 'intentos_login', 'invitaciones_aula', 'bloqueos_cuenta', 'admins_iniciales', 'auditoria'])
  for (const f of filasCatalogo) {
    const identifica = /^(correo|ip|token_hash)$/.test(f.columna) || (f.columna === 'nombre' && tablasDePersonas.has(f.tabla))
    if (identifica) {
      assert.notEqual(f.clase, 'publico', claveFila(f) + ' identifica a una persona y no puede ser público')
      assert.equal(f.enmascarar, true, claveFila(f) + ' debe marcarse para enmascarar')
    }
  }
  for (const k of ['mediciones.bpm_promedio', 'mediciones.spo2_promedio', 'mediciones.ritmo', 'lecturas.bpm', 'lecturas.spo2',
    'bloques_senal.ir', 'bloques_senal.rojo', 'declaraciones_paciente.datos_cifrados', 'comparaciones.analisis']) {
    assert.equal(porClave.get(k)?.clase, 'sensible_salud', `${k} debe ser sensible de salud`)
  }
  for (const f of filasCatalogo.filter(x => x.tabla === 'publicaciones')) {
    assert.equal(f.clase, 'publico', `${claveFila(f)}: lo publicado es público (ya anonimizado)`)
  }
  for (const f of filasCatalogo.filter(x => ['perfiles', 'auditoria', 'intentos_login', 'respuestas'].includes(x.tabla))) {
    assert.equal(f.clase, 'privado', `${claveFila(f)} debe ser privado`)
  }
})

probar('10. La publicación convierte salud en público: mismas medidas, distinta clase', () => {
  assert.equal(porClave.get('mediciones.bpm_promedio').clase, 'sensible_salud')
  assert.equal(porClave.get('publicaciones.bpm_promedio').clase, 'publico')
  assert.equal(porClave.get('mediciones.spo2_promedio').clase, 'sensible_salud')
  assert.equal(porClave.get('publicaciones.spo2_promedio').clase, 'publico')
  // La publicación no copia identificadores: ninguna columna de publicaciones identifica a la persona
  const prohibidas = ['correo', 'nombre', 'edad', 'declaracion_id']
  for (const c of prohibidas) assert.ok(!esquema.get('publicaciones').has(c), `publicaciones no debe tener ${c}`)
})

// ------------------------------------------------------------ funciones del servidor
probar('11. Las funciones de resumen exigen administrador y no se otorgan a anon', () => {
  for (const fn of ['columnas_sin_clasificar', 'resumen_clasificacion']) {
    assert.match(migracion, new RegExp(`create or replace function public\\.${fn}\\(\\)`))
    assert.match(migracion, new RegExp(`revoke all on function public\\.${fn}\\(\\) from public, anon`))
    assert.match(migracion, new RegExp(`grant execute on function public\\.${fn}\\(\\) to authenticated`))
  }
  assert.ok((migracion.match(/if not public\.es_admin\(\)/g) || []).length >= 2)
  assert.equal((migracion.match(/security definer/g) || []).length, 2)
  assert.equal((migracion.match(/set search_path = ''/g) || []).length, 2)
  assert.ok(migracion.includes('(^id$|_id$|_en$|_por$)'), 'la regla de columnas técnicas debe coincidir con la de las pruebas')
  assert.ok(!/\b(update|delete)\s+(from\s+)?public\.clasificacion_datos\b/i.test(migracion), 'la migración no debe modificar ni borrar el catálogo existente')
})

// ------------------------------------------------------------ servicio (funciones puras)
const filasDemo = [
  { tabla: 'perfiles', columna: 'correo', clase: 'privado', cifrado_campo: false, enmascarar: true },
  { tabla: 'perfiles', columna: 'rol', clase: 'privado', cifrado_campo: false, enmascarar: false },
  { tabla: 'mediciones', columna: 'bpm_promedio', clase: 'sensible_salud', cifrado_campo: false, enmascarar: false },
  { tabla: 'declaraciones_paciente', columna: 'datos_cifrados', clase: 'sensible_salud', cifrado_campo: true, enmascarar: true },
  { tabla: 'publicaciones', columna: 'bpm_promedio', clase: 'publico', cifrado_campo: false, enmascarar: false },
  { tabla: 'lecciones', columna: 'contenido', clase: 'rara', cifrado_campo: false, enmascarar: false }
].map(servicio.normalizarFila)

probar('12. Se cuentan, filtran y agrupan las columnas', () => {
  assert.equal(filasDemo[5].clase, 'privado', 'una clase desconocida se trata como privada (la más prudente de las no públicas)')
  const c = servicio.contarPorClase(filasDemo)
  assert.deepEqual([c.total, c.publico, c.privado, c.sensible_salud], [6, 1, 3, 2])
  assert.equal(servicio.filtrarClasificacion(filasDemo, { clase: 'sensible_salud' }).length, 2)
  assert.equal(servicio.filtrarClasificacion(filasDemo, { busqueda: 'CORREO' }).length, 1)
  assert.equal(servicio.filtrarClasificacion(filasDemo, { busqueda: 'cuentas y perfiles' }).length, 2, 'se busca también por el nombre legible')
  assert.equal(servicio.filtrarClasificacion(filasDemo, { soloCifradas: true }).length, 1)
  assert.equal(servicio.filtrarClasificacion(filasDemo, { soloEnmascaradas: true }).length, 2)
  const g = servicio.agruparPorTabla(filasDemo)
  assert.equal(g.length, 5)
  const decl = g.find(x => x.tabla === 'declaraciones_paciente')
  assert.equal(decl.nombre, 'Ficha de salud declarada')
  assert.equal(decl.claseMasAlta, 'sensible_salud')
  assert.equal(nombreTabla('tabla_nueva'), 'tabla nueva')
})

probar('13. La cobertura y el resumen del servidor se interpretan con valores seguros', () => {
  assert.equal(servicio.calcularCobertura(150, 0), 100)
  assert.equal(servicio.calcularCobertura(150, 50), 75)
  assert.equal(servicio.calcularCobertura(0, 0), 100)
  const r = servicio.normalizarResumen({
    total: 140, por_clase: { publico: 40, privado: 70, sensible_salud: 30 }, cifrados: 1, enmascaradas: 9,
    sin_clasificar: 10, huerfanas: ['a.b']
  })
  assert.equal(r.cobertura, 93)
  assert.deepEqual(r.porClase, { publico: 40, privado: 70, sensible_salud: 30 })
  assert.deepEqual(r.huerfanas, ['a.b'])
  const vacio = servicio.normalizarResumen(null)
  assert.deepEqual([vacio.total, vacio.sinClasificar, vacio.cobertura], [0, 0, 100])
})

// ------------------------------------------------------------ interfaz
probar('14. El panel del administrador muestra tipos, indicadores, catálogo y pendientes', () => {
  const panel = leer('src/components/ClasificacionDatosPanel.vue')
  for (const t of ['Clasificación de los datos', 'Columnas clasificadas', 'Cobertura de la base', 'Cifradas por campo',
    'Marcadas para enmascarar', 'Pendientes de clasificar', 'Catálogo de columnas', 'Solo cifradas por campo',
    'Buscar tabla o columna', 'ClasesDatoTarjetas', 'role="alert"', 'Reintentar']) {
    assert.ok(panel.includes(t), 'el panel debe incluir: ' + t)
  }
  const vista = leer('src/views/AdminView.vue')
  assert.ok(vista.includes("id: 'clasificacion'") && vista.includes('<ClasificacionDatosPanel'))
  assert.ok(/v-if="seccionActiva === 'clasificacion'"/.test(vista))
  assert.ok(!/supabase\s*\.\s*from\([^)]*\)\s*\.\s*(update|delete|insert)/.test(panel), 'el panel es de solo lectura')
})

probar('15. Las etiquetas visibles están en los lugares donde se ven los datos', () => {
  assert.ok(leer('src/views/PrivacidadView.vue').includes('<ClasesDatoTarjetas'))
  assert.ok(leer('src/views/MisDatosView.vue').includes('<ClasesDatoTarjetas'))
  const ficha = leer('src/components/DatosPacienteCard.vue')
  assert.ok((ficha.match(/<EtiquetaClaseDato clase="sensible_salud"/g) || []).length >= 2, 'la ficha muestra la etiqueta en el resumen y en el formulario')
  const modal = leer('src/components/PublicarDesdeHistorialModal.vue')
  assert.ok(modal.includes('<EtiquetaClaseDato clase="sensible_salud"') && modal.includes('<EtiquetaClaseDato clase="publico"'))
  const etiqueta = leer('src/components/EtiquetaClaseDato.vue')
  for (const c of ['etiqueta-clase--publico', 'etiqueta-clase--privado', 'etiqueta-clase--sensible_salud']) assert.ok(etiqueta.includes(c))
})

probar('16. Los componentes nuevos no muestran códigos RFxx ni usan emojis', () => {
  const regexEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}]/u
  for (const ruta of ['src/components/EtiquetaClaseDato.vue', 'src/components/ClasesDatoTarjetas.vue',
    'src/components/ClasificacionDatosPanel.vue', 'src/data/clasificacionDatos.js', 'src/services/clasificacionService.js']) {
    const texto = leer(ruta)
    assert.equal(regexEmoji.test(texto), false, `${ruta} no debe tener emojis`)
    const plantilla = texto.match(/<template>([\s\S]*)<\/template>/)
    if (plantilla) assert.equal(/\bRF\d+\b/i.test(plantilla[1]), false, `${ruta} no debe mostrar RFxx`)
  }
  assert.equal(/\bRF\d+\b/i.test(JSON.stringify([CLASES, TRATAMIENTOS])), false, 'los textos al usuario no llevan códigos RFxx')
})

console.log(`\nTodas las pruebas de RF56 pasaron exitosamente (${pasadas}/${pasadas}).`)
