/**
 * Pruebas automatizadas para RF115:
 * "El apartado de aprendizaje muestra la saturación de oxígeno medida."
 *
 * Ejecutar con: node scripts/test-rf115-spo2-aprendizaje.mjs
 */

import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { ref } from 'vue'

const leer = ruta => readFileSync(resolve(process.cwd(), ruta), 'utf8')

const u = await import('../src/utils/spo2Aprendizaje.js')
const spo2 = await import('../src/services/spo2Service.js')
const lecciones = await import('../src/data/lecciones.js')
const { crearEstadoSpo2Medida } = await import('../src/composables/spo2MedidaEstado.js')
const offline = await import('../src/pwa/medicionesOffline.js')

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
async function probarAsync(nombre, fn) {
  try {
    await fn()
    pasadas++
    console.log(`  [OK] ${nombre}`)
  } catch (err) {
    console.error(`  [FALLO] ${nombre}`)
    console.error(err)
    process.exit(1)
  }
}

const m = (id, valor, extra = {}) => ({ id, spo2: valor, inicio: `2026-11-${String(20 - id).padStart(2, '0')}T10:00:00Z`, calidad: 'buena', fuente: 'sensor', actividad: 'Reposo', canal: 1, ...extra })

console.log('=== Pruebas RF115: SpO₂ medida en el apartado de aprendizaje ===')

// ------------------------------------------------------------ qué cuenta como «medida»
probar('1. Solo cuentan las mediciones hechas con el sensor y con una SpO₂ válida', () => {
  const items = [
    m(1, 96, { fuente: 'simulador' }),
    m(2, 97, { fuente: 'csv' }),
    m(3, 98, { fuente: 'dataset' }),
    m(4, 99, { fuente: 'referencia' }),
    m(5, null),
    m(6, 'no-es-numero'),
    m(7, 20),
    m(8, 150),
    m(9, '96.5'),
    m(10, 94)
  ]
  const r = u.medicionesConSpo2(items)
  assert.deepEqual(r.map(x => x.id), [9, 10])
  assert.equal(r[0].spo2, 96.5, 'acepta el número que llega como texto')
  assert.deepEqual(u.medicionesConSpo2(null), [])
  assert.deepEqual(u.medicionesConSpo2(undefined), [])
})

probar('2. Sin dato de origen solo se acepta cuando se pide (copias guardadas antes de registrar el origen)', () => {
  const sinOrigen = [m(1, 95, { fuente: undefined }), m(2, 96, { fuente: null })]
  assert.equal(u.medicionesConSpo2(sinOrigen).length, 0)
  assert.equal(u.medicionesConSpo2(sinOrigen, { permitirSinFuente: true }).length, 2)
})

// ------------------------------------------------------------ cuál se muestra
probar('3. Se muestra la medición más reciente con señal confiable', () => {
  const r = u.seleccionarMedida([m(1, 97), m(2, 93), m(3, 91)])
  assert.equal(r.medida.id, 1)
  assert.equal(r.medida.confiable, true)
  assert.equal(r.omitidasPorCalidad, 0)
})

probar('4. Una medición más nueva con mala calidad no se muestra como confiable: se avisa y se usa la anterior', () => {
  const r = u.seleccionarMedida([m(1, 88, { calidad: 'mala' }), m(2, 99, { calidad: 'mala' }), m(3, 96), m(4, 90)])
  assert.equal(r.medida.id, 3)
  assert.equal(r.omitidasPorCalidad, 2)
  assert.equal(r.medida.confiable, true)
})

probar('5. Si todas tienen mala calidad se muestra la más reciente marcada como poco confiable', () => {
  const r = u.seleccionarMedida([m(1, 92, { calidad: 'mala' }), m(2, 95, { calidad: 'mala' })])
  assert.equal(r.medida.id, 1)
  assert.equal(r.medida.confiable, false)
  assert.equal(r.omitidasPorCalidad, 0)
  assert.equal(r.cambio, null, 'no se compara una lectura poco confiable')
})

probar('6. Sin mediciones con sensor no hay valor que mostrar', () => {
  for (const vacio of [[], null, undefined, [m(1, 96, { fuente: 'simulador' })], [m(1, null)]]) {
    const r = u.seleccionarMedida(vacio)
    assert.equal(r.medida, null)
    assert.deepEqual(r.ultimas, [])
    assert.equal(r.cambio, null)
  }
})

probar('7. Se listan hasta 5 mediciones recientes', () => {
  const items = Array.from({ length: 9 }, (_, i) => m(i + 1, 95 + (i % 3)))
  const r = u.seleccionarMedida(items)
  assert.equal(r.ultimas.length, u.MAX_ULTIMAS)
  assert.equal(u.MAX_ULTIMAS, 5)
  assert.deepEqual(r.ultimas.map(x => x.id), [1, 2, 3, 4, 5])
})

// ------------------------------------------------------------ cambio respecto a la anterior
probar('8. El cambio se compara con la medición confiable anterior', () => {
  assert.deepEqual(u.seleccionarMedida([m(1, 97), m(2, 94)]).cambio, { diferencia: 3, sentido: 'sube' })
  assert.deepEqual(u.seleccionarMedida([m(1, 92.5), m(2, 96)]).cambio, { diferencia: -3.5, sentido: 'baja' })
  assert.equal(u.seleccionarMedida([m(1, 96.4), m(2, 96)]).cambio.sentido, 'igual', 'menos de un punto no es un cambio')
  // la anterior con mala calidad se salta
  assert.deepEqual(u.seleccionarMedida([m(1, 97), m(2, 80, { calidad: 'mala' }), m(3, 95)]).cambio, { diferencia: 2, sentido: 'sube' })
  assert.equal(u.seleccionarMedida([m(1, 97)]).cambio, null, 'sin anterior no hay cambio')
})

probar('9. El cambio se explica con palabras y los números llevan coma decimal', () => {
  assert.equal(u.formatearSpo2(96.4), '96,4')
  assert.equal(u.formatearSpo2(100), '100,0')
  assert.equal(u.formatearSpo2('x'), '—')
  assert.match(u.textoCambio({ diferencia: 2.5, sentido: 'sube' }), /Subió 2,5 puntos/)
  assert.match(u.textoCambio({ diferencia: -1.2, sentido: 'baja' }), /Bajó 1,2 puntos/)
  assert.match(u.textoCambio({ diferencia: 0.3, sentido: 'igual' }), /Sin cambios importantes/)
  assert.equal(u.textoCambio(null), '')
})

// ------------------------------------------------------------ escala y estado
probar('10. La escala visual usa los mismos umbrales que el resto de la plataforma', () => {
  const desde = u.ESCALA_SPO2.zonas.map(z => z.desde)
  assert.deepEqual(desde, [80, spo2.SPO2_UMBRAL_HIPOXIA_MODERADA, spo2.SPO2_UMBRAL_HIPOXIA_LEVE, spo2.SPO2_UMBRAL_NORMAL])
  assert.equal(u.ESCALA_SPO2.zonas.at(-1).hasta, 100)
  // La zona donde cae un valor coincide con el estado que calcula el servicio de SpO₂
  const pares = [[97, 'normal', 'success'], [92, 'leve', 'warning'], [87, 'moderada', 'danger'], [82, 'severa', 'danger']]
  for (const [valor, zona, severidad] of pares) {
    const z = u.ESCALA_SPO2.zonas.find(x => valor >= x.desde && valor < x.hasta)
    assert.equal(z.id, zona, `${valor} % cae en la zona ${zona}`)
    assert.equal(spo2.evaluarEstadoSpo2(valor).severidad, severidad)
  }
})

probar('11. El marcador queda en su lugar y nunca se sale de la escala', () => {
  assert.equal(u.posicionEnEscala(80), 0)
  assert.equal(u.posicionEnEscala(90), 50)
  assert.equal(u.posicionEnEscala(95), 75)
  assert.equal(u.posicionEnEscala(100), 100)
  assert.equal(u.posicionEnEscala(70), 0)
  assert.equal(u.posicionEnEscala(105), 100)
  assert.equal(u.posicionEnEscala('x'), 0)
  assert.equal(u.posicionEnEscala(96.5), 82.5)
})

// ------------------------------------------------------------ cómo se calculó
probar('12. El cálculo se explica con el valor de la persona y es coherente con la curva real', () => {
  const c = u.explicarCalculo(95)
  assert.equal(c.formula, 'SpO₂ ≈ 110 − 25 × R')
  assert.equal(c.r, 0.6)
  assert.equal(c.rTexto, '0,60')
  assert.equal(c.sustitucion, '110 − 25 × 0,60 = 95,0 %')
  assert.equal(c.enLimite, false)
  for (const valor of [72, 85.5, 90, 94.2, 97.8, 99.5]) {
    const { r } = u.explicarCalculo(valor)
    assert.ok(Math.abs(spo2.calcularSpo2DesdeR(r) - valor) <= 0.1, `${valor} % debe volver a ${valor} con R = ${r}`)
  }
  assert.equal(u.explicarCalculo(101), null)
  assert.equal(u.explicarCalculo('x'), null)
})

probar('13. En los límites del sensor se avisa que R pudo ser distinta', () => {
  for (const limite of [100, 70]) {
    const c = u.explicarCalculo(limite)
    assert.equal(c.enLimite, true)
    assert.match(c.nota, /limita el resultado entre 70 % y 100 %/)
  }
  assert.doesNotMatch(u.explicarCalculo(95).nota, /limita/)
  // El firmware usa constrain(110 − 25·R, 70, 100): el mismo rango que se avisa
  const firmware = leer('firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino')
  assert.match(firmware, /constrain\(110\.0f - 25\.0f \* r, 70\.0f, 100\.0f\)/)
  assert.deepEqual([u.LIMITE_SENSOR.min, u.LIMITE_SENSOR.max], [70, 100])
})

probar('14. La función de la lección usa la misma regla (sensor y señal confiable)', () => {
  const r = lecciones.ultimaSpo2Medida([m(1, 99, { fuente: 'simulador' }), m(2, 90, { calidad: 'mala' }), m(3, 96.2)])
  assert.deepEqual([r.spo2, r.calidad], [96.2, 'buena'])
  assert.equal(lecciones.ultimaSpo2Medida([m(1, 99, { fuente: 'csv' })]), null)
  assert.equal(lecciones.ultimaSpo2Medida([]), null)
  assert.equal(lecciones.ultimaSpo2Medida(), null)
})

// ------------------------------------------------------------ carga de los datos
await probarAsync('15. La carga pide al historial solo lo hecho con el sensor y muestra lo elegido', async () => {
  const llamadas = []
  const c = crearEstadoSpo2Medida({
    autenticado: ref(true),
    listar: async (op) => { llamadas.push(op); return { items: [m(1, 88, { calidad: 'mala' }), m(2, 96)], sinConexion: false } }
  })
  await c.cargar()
  assert.deepEqual(llamadas, [{ pagina: 0, fuente: 'sensor' }])
  assert.equal(c.medida.value.id, 2)
  assert.equal(c.omitidasPorCalidad.value, 1)
  assert.equal(c.estado.value.estado, 'normal')
  assert.equal(c.cargando.value, false)
  assert.equal(c.error.value, '')
})

await probarAsync('16. Sin sesión no se consulta nada; con error o sin conexión se comporta bien', async () => {
  let llamadas = 0
  const sinSesion = crearEstadoSpo2Medida({ autenticado: ref(false), listar: async () => { llamadas++; return { items: [] } } })
  await sinSesion.cargar()
  assert.equal(llamadas, 0)
  assert.equal(sinSesion.medida.value, null)

  const conError = crearEstadoSpo2Medida({ autenticado: ref(true), listar: async () => ({ items: [], error: 'No se pudo cargar el historial.' }) })
  await conError.cargar()
  assert.equal(conError.error.value, 'No se pudo cargar el historial.')
  assert.equal(conError.medida.value, null)

  const explota = crearEstadoSpo2Medida({ autenticado: ref(true), listar: async () => { throw new Error('sin red') } })
  await explota.cargar()
  assert.equal(explota.error.value, 'sin red')
  assert.equal(explota.cargando.value, false)

  // Sin conexión, las copias guardadas pueden no traer el origen: se aceptan y se avisa
  const offlineCtl = crearEstadoSpo2Medida({ autenticado: ref(true), listar: async () => ({ items: [m(1, 94, { fuente: null })], sinConexion: true }) })
  await offlineCtl.cargar()
  assert.equal(offlineCtl.sinConexion.value, true)
  assert.equal(offlineCtl.medida.value.spo2, 94)
})

await probarAsync('17. Si llegan dos respuestas desordenadas, vale la más nueva', async () => {
  let n = 0
  const c = crearEstadoSpo2Medida({
    autenticado: ref(true),
    listar: async () => {
      const mi = ++n
      await new Promise(r => setTimeout(r, mi === 1 ? 60 : 5))
      return { items: [m(mi, mi === 1 ? 90 : 98)], sinConexion: false }
    }
  })
  const primera = c.cargar()
  const segunda = c.cargar()
  await Promise.all([primera, segunda])
  assert.equal(c.medida.value.spo2, 98, 'la respuesta lenta y vieja no debe pisar la nueva')
})

// ------------------------------------------------------------ sin conexión
probar('18. El caché sin conexión guarda el origen de la medición y nada personal', () => {
  const limpia = offline.reducirMedicion({
    id: 'a', fecha: 'x', actividad: 'Reposo', fuente: 'sensor', bpm: 70, spo2: 96, ritmo: 'normal', calidad: 'buena', dentroDeRango: true,
    nombre: 'Ana', correo: 'ana@alu.unach.cl', edad: 21
  })
  assert.equal(limpia.fuente, 'sensor')
  assert.ok(!('nombre' in limpia) && !('correo' in limpia) && !('edad' in limpia), 'no se guardan datos personales')
  const servicio = leer('src/services/medicionesService.js')
  assert.ok(servicio.includes('fuente: m.fuente, bpm: m.bpm'), 'al guardar la vista se incluye el origen')
  assert.ok(servicio.includes('fuente: v.fuente || null'), 'al leer sin conexión se devuelve el origen')
})

// ------------------------------------------------------------ pantallas
probar('19. El inicio del apartado de aprendizaje y la lección de SpO₂ muestran la saturación medida', () => {
  const hub = leer('src/views/AprendizajeView.vue')
  assert.ok(hub.includes('<Spo2MedidaResumen />'), 'el inicio del apartado muestra la SpO₂ medida')
  const leccionVista = leer('src/views/LeccionView.vue')
  assert.ok(leccionVista.includes("b.tipo === 'spo2_medida'") && leccionVista.includes('<Spo2MedidaLeccion'))
  const leccion = lecciones.LECCIONES.find(l => l.slug === 'saturacion-de-oxigeno')
  assert.ok(leccion.bloques.some(b => b.tipo === 'spo2_medida'), 'la lección de SpO₂ incluye el bloque con el valor medido')
  const resumen = leer('src/components/Spo2MedidaResumen.vue')
  assert.ok(resumen.includes("'/aprendizaje/saturacion-de-oxigeno'"), 'el resumen enlaza a la lección')
})

probar('20. La tarjeta explica el valor: escala, estado, calidad, cambio, cálculo y últimas mediciones', () => {
  const t = leer('src/components/Spo2MedidaLeccion.vue')
  for (const x of ['<EscalaSpo2', 'spo2-poco-fiable', 'spo2-omitidas', 'spo2-aviso-mala', 'spo2-cambio', 'spo2-calculo',
    'spo2-ultimas', 'spo2-sin-sesion', 'spo2-cargando', 'spo2-error', 'spo2-vacio', 'Reintentar',
    'no es un diagnóstico', 'hecha con el sensor', 'Cómo se calculó este valor con tu medición', 'Ver mi evolución completa']) {
    assert.ok(t.includes(x), 'la tarjeta debe incluir: ' + x)
  }
  const escala = leer('src/components/EscalaSpo2.vue')
  assert.ok(escala.includes('role="img"') && escala.includes(':aria-label'), 'la escala es accesible para lectores de pantalla')
})

probar('21. Los textos nuevos no usan emojis ni muestran códigos RFxx', () => {
  const regexEmoji = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{2B50}]/u
  for (const ruta of ['src/utils/spo2Aprendizaje.js', 'src/composables/useSpo2Medida.js', 'src/composables/spo2MedidaEstado.js', 'src/components/EscalaSpo2.vue',
    'src/components/Spo2MedidaLeccion.vue', 'src/components/Spo2MedidaResumen.vue']) {
    const texto = leer(ruta)
    assert.equal(regexEmoji.test(texto), false, `${ruta} no debe tener emojis`)
    const plantilla = texto.match(/<template>([\s\S]*)<\/template>/)
    if (plantilla) assert.equal(/\bRF\d+\b/i.test(plantilla[1]), false, `${ruta} no debe mostrar RFxx`)
  }
})

console.log(`\nTodas las pruebas de RF115 pasaron exitosamente (${pasadas}/${pasadas}).`)
