// RF03 · Persistencia y lectura fiable de la ficha propia (nivel de estrés, fecha de nacimiento y demás factores)
//   node scripts/test-ficha-persistencia-lectura.mjs
// Node puro, sin red: dobles de prueba de Supabase y del servicio de cifrado que pueden fallar a voluntad
// (clave distinta, sesión vencida 401, 503, sin conexión, fila ilegible más reciente).
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ErrorCifrado } from '../src/utils/cifradoService.js'
import { estadoFechaNacimiento, fichaIgual } from '../src/utils/fichaPersistencia.js'

const RAIZ = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

// sessionStorage de la pestaña (en Node no existe)
const memoria = new Map()
globalThis.sessionStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => { memoria.set(k, String(v)) },
  removeItem: (k) => { memoria.delete(k) }
}
const { pacienteService, estadoGuardadoFicha, MAX_FILAS_A_DESCIFRAR } = await import('../src/services/pacienteService.js')

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }
const silencio = console.warn
console.warn = () => {} // los avisos esperados de las pruebas no ensucian la salida

// ---------------------------------------------------------------------------------------------------------------
// Dobles de prueba
// ---------------------------------------------------------------------------------------------------------------
function crearMundo({ uid = 'u1', rol = 'estudiante' } = {}) {
  const m = {
    uid, rol,
    claveServidor: 'A',            // clave con la que el servidor cifra y descifra ahora
    sesion: true,                  // false -> el servidor responde 401
    servidorCifrado: true,         // false -> 503
    red: true,                     // false -> sin conexión
    tokenSesion: true,             // false -> no hay sesión en el cliente
    filas: [],                     // tabla declaraciones_paciente
    n: { cifrar: 0, descifrar: 0, insert: 0, update: 0, select: 0, getSession: 0 },
    relojFila: 1,
    retardoCifrar: null            // promesa que se espera antes de cifrar (para probar el guardado en segundo plano)
  }
  m.sembrar = (factores, { clave = 'A', creadoEn, nombre = 'Ana Pérez', edad = 35, id } = {}) => {
    const fila = {
      id: id || `fila-${m.filas.length + 1}`, usuario_id: uid, nombre, edad,
      datos_cifrados: `\\xSPC|${clave}|${JSON.stringify(factores)}`.padEnd(80, '0'),
      clave_version: 1,
      creado_en: creadoEn || new Date(Date.UTC(2026, 10, 1, 12, m.relojFila++)).toISOString(),
      sesion_id: null
    }
    m.filas.push(fila)
    return fila
  }
  const filtrar = () => m.filas.filter(f => f.usuario_id === uid && f.sesion_id === null)
    .sort((a, b) => b.creado_en.localeCompare(a.creado_en))

  m.cifrado = {
    esDatoCifrado: (t) => String(t).startsWith('\\xSPC|'),
    leerSinCifrar: () => ({}),
    async cifrarFactoresSalud(factores) {
      m.n.cifrar++
      if (m.retardoCifrar) await m.retardoCifrar
      if (!m.red) throw new ErrorCifrado('sin conexión', 'red')
      if (!m.sesion) throw new ErrorCifrado('Se requiere una sesión válida.', 'sesion', 401)
      if (!m.servidorCifrado) throw new ErrorCifrado('El cifrado no está disponible.', 'servidor', 503)
      return { datosCifrados: `\\xSPC|${m.claveServidor}|${JSON.stringify(factores)}`.padEnd(80, '0'), claveVersion: 1 }
    },
    async descifrarDeclaracion({ declaracionId }) {
      m.n.descifrar++
      if (!m.red) throw new ErrorCifrado('sin conexión', 'red')
      if (!m.sesion) throw new ErrorCifrado('Se requiere una sesión válida.', 'sesion', 401)
      if (!m.servidorCifrado) throw new ErrorCifrado('El descifrado no está disponible.', 'servidor', 503)
      const fila = m.filas.find(f => f.id === declaracionId)
      if (!fila) throw new ErrorCifrado('no encontrada', 'noEncontrada', 404)
      const [, clave, json] = fila.datos_cifrados.replace(/0+$/, '').split('|')
      if (clave !== m.claveServidor) throw new ErrorCifrado('No se pudo verificar la integridad de los datos.', 'clave', 422)
      return JSON.parse(json)
    }
  }

  m.supabase = {
    auth: {
      async getSession() {
        m.n.getSession++
        return { data: { session: m.tokenSesion ? { access_token: 't', user: { id: uid, app_metadata: { rol } } } : null } }
      }
    },
    from() {
      const consulta = { op: 'select', f: [] }
      const api = {
        select() { if (consulta.op === 'select') m.n.select++; consulta.cols = true; return api },
        eq(c, v) { consulta.f.push([c, v]); return api },
        is() { return api },
        order() { return api },
        limit(n) { consulta.limite = n; return api },
        update(v) { consulta.op = 'update'; consulta.v = v; return api },
        insert(v) { consulta.op = 'insert'; consulta.v = v; return api },
        async maybeSingle() { return ejecutar(true) },
        async single() { return ejecutar(true) },
        then(res, rej) { return ejecutar(false).then(res, rej) }
      }
      async function ejecutar(uno) {
        if (!m.red) return { data: null, error: { message: 'Failed to fetch' } }
        if (consulta.op === 'select') {
          const filas = filtrar().slice(0, consulta.limite || 10)
          return { data: filas, error: null }
        }
        if (consulta.op === 'insert') {
          m.n.insert++
          const fila = { id: `fila-${m.filas.length + 1}`, sesion_id: null, creado_en: new Date(Date.UTC(2026, 10, 2, 12, m.relojFila++)).toISOString(), ...consulta.v }
          m.filas.push(fila)
          return { data: { id: fila.id, creado_en: fila.creado_en }, error: null }
        }
        // update
        const id = consulta.f.find(([c]) => c === 'id')?.[1]
        const fila = m.filas.find(f => f.id === id && f.usuario_id === uid && f.sesion_id === null)
        if (!fila) return { data: null, error: null }
        m.n.update++
        Object.assign(fila, consulta.v)
        return { data: { id: fila.id, creado_en: fila.creado_en }, error: null }
      }
      return api
    }
  }
  return m
}

const FORM = {
  nombre: 'Ana Pérez', fechaNacimiento: '1990-03-15', nivelEstres: 'alto', suenoHoras: '5_6', cafeina: 'alta',
  medicacionTipo: 'ninguna', actividadPrevia: 'reposo', condicionSalud: 'Asma u otra afección respiratoria', observaciones: 'nota'
}
function usar(mundo) {
  memoria.clear()
  pacienteService.__probar({ supabase: mundo.supabase, cifradoService: mundo.cifrado })
}
const ceros = (n) => Object.fromEntries(Object.keys(n).map(k => [k, 0]))
const reiniciarContadores = (m) => { Object.assign(m.n, ceros(m.n)) }
/** «Cerrar sesión y volver a entrar»: la pestaña queda sin copia ni memoria; el servidor conserva las filas. */
const volverAIniciarSesion = (m) => { memoria.clear(); pacienteService.__probar({ supabase: m.supabase, cifradoService: m.cifrado }) }

// ---------------------------------------------------------------------------------------------------------------
console.log('1. Lo guardado se conserva al volver a iniciar sesión (sessionStorage vacío)')
{
  const m = crearMundo(); usar(m)
  const g = await pacienteService.guardarDeclaracion(FORM)
  prueba('guarda en el servidor (1 cifrado + 1 insert)', g.ok && g.declaracionId && m.n.cifrar === 1 && m.n.insert === 1 && m.filas.length === 1)
  volverAIniciarSesion(m); reiniciarContadores(m)
  const a = await pacienteService.obtenerDeclaracionActiva()
  prueba('vuelve completa, con nivel de estrés y fecha de nacimiento', a.estadoLectura === 'completa' && a.nivelEstres === 'alto' && a.fechaNacimiento === '1990-03-15')
  prueba('conserva los demás factores (cafeína, sueño, condición, observaciones)', a.cafeina === 'alta' && a.suenoHoras === '5_6' && a.condicionSalud === 'Asma u otra afección respiratoria' && a.observaciones === 'nota')
  prueba('caso normal: UNA sola llamada de descifrado', m.n.descifrar === 1)
  await pacienteService.obtenerDeclaracionActiva()
  prueba('al volver a pedirla (navegar entre pasos) no se descifra otra vez (caché en memoria)', m.n.descifrar === 1)
  prueba('no se le pide la fecha: ya existe', estadoFechaNacimiento(a) === 'registrada')
  prueba('la copia de la pestaña queda con la ficha completa', JSON.parse(memoria.get('sensor_paciente_declaracion_rf03')).nivelEstres === 'alto')
}

console.log('2. «Pasan 20 días»: la ficha sigue igual salvo que la persona la modifique')
{
  const m = crearMundo(); usar(m)
  m.sembrar({ nivelEstres: 'muy_alto', fechaNacimiento: '1985-07-20', cafeina: 'baja' }, { creadoEn: '2026-10-20T10:00:00Z', edad: 41 })
  const a = await pacienteService.obtenerDeclaracionActiva()
  prueba('muestra el estrés guardado, no uno anterior', a.nivelEstres === 'muy_alto' && a.cafeina === 'baja' && a.fechaNacimiento === '1985-07-20')
  prueba('edad recalculada desde la fecha', a.edad === 41)
}

console.log('3. Guardar sin cambios no llama al servidor')
{
  const m = crearMundo(); usar(m)
  await pacienteService.guardarDeclaracion(FORM)
  volverAIniciarSesion(m)
  const a = await pacienteService.obtenerDeclaracionActiva()
  reiniciarContadores(m)
  // «Continuar» sin tocar nada: el formulario manda los mismos valores que la ficha cargada
  const r = await pacienteService.guardarDeclaracion({ ...FORM })
  prueba('resultado ok marcado como sin cambios', r.ok && r.sinCambios === true && r.declaracionId === a.id)
  prueba('0 cifrados, 0 inserts, 0 updates, 0 getSession', m.n.cifrar === 0 && m.n.insert === 0 && m.n.update === 0 && m.n.getSession === 0)
  const r2 = await pacienteService.guardarDeclaracion({ ...FORM, cafeina: 'ninguna' })
  prueba('si cambió algo, sí se guarda (1 cifrado + 1 update)', r2.ok && !r2.sinCambios && m.n.cifrar === 1 && m.n.update === 1)
}

console.log('4. Una ficha propia vigente: se actualiza la fila, no se acumulan filas')
{
  const m = crearMundo(); usar(m)
  await pacienteService.guardarDeclaracion(FORM)
  await pacienteService.guardarDeclaracion({ ...FORM, cafeina: 'baja' })
  await pacienteService.guardarDeclaracion({ ...FORM, cafeina: 'moderada', nivelEstres: 'medio' })
  prueba('tres guardados -> una sola fila (1 insert + 2 updates)', m.filas.length === 1 && m.n.insert === 1 && m.n.update === 2)
  volverAIniciarSesion(m)
  const a = await pacienteService.obtenerDeclaracionActiva()
  prueba('al releer aparece lo último guardado', a.cafeina === 'moderada' && a.nivelEstres === 'medio' && a.fechaNacimiento === '1990-03-15')
}

console.log('5. Editar un campo no altera los demás')
{
  const m = crearMundo(); usar(m)
  await pacienteService.guardarDeclaracion(FORM)
  volverAIniciarSesion(m)
  await pacienteService.obtenerDeclaracionActiva()
  const r = await pacienteService.guardarDeclaracion({ cafeina: 'ninguna' }) // objeto parcial
  prueba('el guardado parcial conserva estrés, fecha, sueño, condición y nombre', r.data.nivelEstres === 'alto' && r.data.fechaNacimiento === '1990-03-15' && r.data.suenoHoras === '5_6' && r.data.condicionSalud === 'Asma u otra afección respiratoria' && r.data.nombre === 'Ana Pérez')
  prueba('y aplica solo lo que cambió', r.data.cafeina === 'ninguna')
  const r2 = await pacienteService.guardarDeclaracion({ nivelEstres: undefined, observaciones: null, suenoHoras: '7_8' })
  prueba('valores vacíos/indefinidos no borran nada', r2.data.nivelEstres === 'alto' && r2.data.observaciones === 'nota' && r2.data.suenoHoras === '7_8')
  volverAIniciarSesion(m)
  const a = await pacienteService.obtenerDeclaracionActiva()
  prueba('en el servidor quedó todo consistente', a.nivelEstres === 'alto' && a.cafeina === 'ninguna' && a.suenoHoras === '7_8' && a.observaciones === 'nota')
}

console.log('6. Una fila ilegible más reciente no oculta la válida (y se avisa)')
{
  const m = crearMundo(); usar(m)
  m.sembrar({ nivelEstres: 'bajo', fechaNacimiento: '1990-03-15' }, { creadoEn: '2026-10-01T10:00:00Z' })
  m.sembrar({ nivelEstres: 'alto', fechaNacimiento: '1990-03-15' }, { creadoEn: '2026-10-10T10:00:00Z', id: 'valida-media' })
  m.sembrar({ nivelEstres: 'medio' }, { clave: 'B', creadoEn: '2026-10-20T10:00:00Z', id: 'ilegible-nueva' })
  const a = await pacienteService.obtenerDeclaracionActiva()
  prueba('toma la más reciente LEGIBLE', a.id === 'valida-media' && a.nivelEstres === 'alto' && a.estadoLectura === 'completa')
  prueba('avisa de que la más reciente no se pudo leer', /no se pudo leer/i.test(a.advertenciaLectura || '') && /otra clave/.test(a.advertenciaLectura))
  prueba('tope bajo de intentos: 2 llamadas de descifrado (no 10)', m.n.descifrar === 2 && MAX_FILAS_A_DESCIFRAR === 3)
}
{
  const m = crearMundo(); usar(m)
  for (let i = 0; i < 6; i++) m.sembrar({ nivelEstres: 'bajo' }, { clave: 'B' })
  await pacienteService.obtenerDeclaracionActiva()
  prueba('con muchas filas ilegibles nunca pasa de 3 intentos', m.n.descifrar === 3)
}

console.log('7. El descifrado nunca falla en silencio: motivo claro en cada fallo')
const casos = [
  ['sesión vencida (401)', (m) => { m.sesion = false }, /sesión venció/, 1],
  ['clave distinta (otro entorno, 422)', (m) => { m.claveServidor = 'OTRA' }, /otra clave de cifrado/, 3],
  ['servidor sin cifrado (503)', (m) => { m.servidorCifrado = false }, /servidor de cifrado no está disponible/, 1],
  ['sin conexión al descifrar', (m) => { m.red = false; m.cifrado.descifrarDeclaracion = async () => { m.n.descifrar++; throw new ErrorCifrado('x', 'red') } }, /no hay conexión/, 1]
]
for (const [nombre, falla, motivo, maxLlamadas] of casos) {
  const m = crearMundo(); usar(m)
  m.sembrar({ nivelEstres: 'alto', fechaNacimiento: '1990-03-15' }, { creadoEn: '2026-10-01T10:00:00Z' })
  m.sembrar({ nivelEstres: 'alto', fechaNacimiento: '1990-03-15' }, { creadoEn: '2026-10-02T10:00:00Z' })
  const red0 = m.red
  const descifrarOriginal = m.cifrado.descifrarDeclaracion
  falla(m)
  if (nombre.startsWith('sin conexión')) m.red = red0 // la consulta de filas sí responde; falla el descifrado
  const a = await pacienteService.obtenerDeclaracionActiva()
  prueba(`${nombre}: ficha incompleta con el motivo`, a.estadoLectura === 'incompleta' && a.incompleta === true && motivo.test(a.motivoLectura))
  prueba(`${nombre}: nombre y edad se conservan, sin estrés ni fecha inventados`, a.nombre === 'Ana Pérez' && a.edad && !a.nivelEstres && !a.fechaNacimiento)
  prueba(`${nombre}: corte temprano (${m.n.descifrar} llamada(s), máx. ${maxLlamadas})`, m.n.descifrar <= maxLlamadas)
  prueba(`${nombre}: la ficha ilegible NO se guarda en la pestaña`, !memoria.has('sensor_paciente_declaracion_rf03'))
  // Se resuelve el problema y se reintenta
  m.cifrado.descifrarDeclaracion = descifrarOriginal
  m.sesion = true; m.servidorCifrado = true; m.claveServidor = 'A'; m.red = true
  const b = await pacienteService.obtenerDeclaracionActiva({ forzar: true })
  prueba(`${nombre}: «Reintentar lectura» recupera la ficha completa`, b.estadoLectura === 'completa' && b.nivelEstres === 'alto' && b.fechaNacimiento === '1990-03-15')
}
{
  const m = crearMundo(); usar(m); m.red = false
  const a = await pacienteService.obtenerDeclaracionActiva()
  prueba('sin conexión al consultar y sin copia: no se hace pasar por «no existe»', a?.incompleta === true && /no respondió|conexión/.test(a.motivoLectura || '') && !a.nombre)
}
{
  const m = crearMundo({ uid: 'u9' }); usar(m); m.tokenSesion = false
  prueba('sin sesión ni copia -> null (formulario nuevo)', (await pacienteService.obtenerDeclaracionActiva()) === null)
}

console.log('8. Una ficha incompleta/ilegible nunca pisa a una completa')
{
  const m = crearMundo(); usar(m)
  await pacienteService.guardarDeclaracion(FORM)
  const idGuardado = m.filas[0].id
  m.claveServidor = 'OTRA' // ahora la fila no se puede leer, pero la pestaña tiene la copia completa de esa fila
  const a = await pacienteService.obtenerDeclaracionActiva({ forzar: true })
  prueba('con la copia completa de esa misma fila se usa la copia, no una ficha vacía', a.estadoLectura === 'completa' && a.nivelEstres === 'alto' && a.fechaNacimiento === '1990-03-15' && a.id === idGuardado)
  prueba('la copia de la pestaña sigue completa', JSON.parse(memoria.get('sensor_paciente_declaracion_rf03')).nivelEstres === 'alto')
}
{
  const m = crearMundo(); usar(m)
  m.sembrar({ nivelEstres: 'alto', fechaNacimiento: '1990-03-15' }, { creadoEn: '2026-10-01T10:00:00Z', id: 'vieja-legible' })
  m.sembrar({ nivelEstres: 'bajo' }, { clave: 'B', creadoEn: '2026-10-20T10:00:00Z', id: 'nueva-ilegible' })
  memoria.set('sensor_paciente_declaracion_rf03', JSON.stringify({ nombre: 'Ana Pérez', edad: 35, fechaNacimiento: '1990-03-15', nivelEstres: 'muy_alto', id: 'nueva-ilegible', creadoEn: '2026-10-20T10:00:00Z', actualizadoEn: '2026-10-25T10:00:00Z' }))
  const a = await pacienteService.obtenerDeclaracionActiva()
  prueba('fila nueva ilegible + copia completa de esa fila: gana la copia (no retrocede al estrés viejo)', a.nivelEstres === 'muy_alto' && a.id === 'nueva-ilegible')
}
{
  // «Ingresar los datos de nuevo» tras una lectura fallida: la ficha nueva es legible, no se toca la fila ilegible
  const m = crearMundo(); usar(m)
  m.sembrar({ nivelEstres: 'alto' }, { clave: 'B', id: 'ilegible-1' })
  const a = await pacienteService.obtenerDeclaracionActiva()
  prueba('lectura fallida marcada', a.incompleta === true)
  const g = await pacienteService.guardarDeclaracion(FORM)
  prueba('ficha nueva se inserta como fila nueva y NO sobrescribe la ilegible', g.ok && m.n.insert === 1 && m.n.update === 0 && m.filas.find(f => f.id === 'ilegible-1').datos_cifrados.includes('|B|'))
  volverAIniciarSesion(m)
  const b = await pacienteService.obtenerDeclaracionActiva()
  prueba('al releer, la más reciente legible es la nueva', b.nivelEstres === 'alto' && b.fechaNacimiento === '1990-03-15' && b.id === g.declaracionId)
}
{
  // Un guardado que falla en el servidor deja la ficha pendiente: no se pierde y no la pisa una fila vieja
  const m = crearMundo(); usar(m)
  m.sembrar({ nivelEstres: 'bajo', fechaNacimiento: '1990-03-15' }, { creadoEn: '2026-10-01T10:00:00Z', id: 'vieja' })
  await pacienteService.obtenerDeclaracionActiva()
  m.servidorCifrado = false
  const g = await pacienteService.guardarDeclaracion({ ...FORM, nivelEstres: 'muy_alto' })
  prueba('servidor 503 al guardar: ok local, error informado, ficha pendiente', g.ok && g.errorServidor && JSON.parse(memoria.get('sensor_paciente_declaracion_rf03')).pendienteSync === true)
  prueba('estado visible: error', estadoGuardadoFicha.value.estado === 'error')
  const a = await pacienteService.obtenerDeclaracionActiva({ forzar: true })
  prueba('al recargar sigue mandando la ficha pendiente (no vuelve al estrés viejo)', a.nivelEstres === 'muy_alto')
  m.servidorCifrado = true
  await pacienteService.esperarGuardado()
  const s = await pacienteService.reintentarSincronizacion()
  prueba('al reintentar se sincroniza (actualiza la fila existente)', s.declaracionId === 'vieja' && m.n.update === 1 && estadoGuardadoFicha.value.estado === 'guardado')
}

console.log('9. Guardado rápido: la interfaz no espera al servidor')
{
  const m = crearMundo(); usar(m)
  let liberar
  m.retardoCifrar = new Promise(r => { liberar = r })
  const t0 = Date.now()
  const r = pacienteService.guardarDeclaracionRapido(FORM)
  prueba('devuelve ok de inmediato (síncrono), sin esperar a la red', r.ok === true && Date.now() - t0 < 50 && m.n.insert === 0)
  prueba('la copia de la pestaña ya está guardada y pendiente', JSON.parse(memoria.get('sensor_paciente_declaracion_rf03')).pendienteSync === true)
  prueba('aviso «Guardando tu ficha…»', estadoGuardadoFicha.value.estado === 'guardando' && /Guardando tu ficha/.test(estadoGuardadoFicha.value.mensaje))
  liberar(); const s = await r.sincronizacion
  prueba('al terminar: «Ficha guardada» y la ficha recibe su id', s.declaracionId && estadoGuardadoFicha.value.estado === 'guardado' && estadoGuardadoFicha.value.mensaje === 'Ficha guardada' && estadoGuardadoFicha.value.ficha.id === s.declaracionId)
  prueba('la ficha devuelta al instante apunta ya a su fila', r.data.id === s.declaracionId)
}
{
  const m = crearMundo(); usar(m)
  const a = pacienteService.guardarDeclaracionRapido(FORM)
  const b = pacienteService.guardarDeclaracionRapido({ ...FORM, cafeina: 'baja' })
  await Promise.all([a.sincronizacion, b.sincronizacion])
  prueba('dos guardados seguidos no duplican filas (1 insert + 1 update)', m.filas.length === 1 && m.n.insert === 1 && m.n.update === 1)
  const x = pacienteService.guardarDeclaracionRapido({ nombre: 'A' })
  prueba('validación local: datos inválidos no avanzan ni tocan la red', x.ok === false && x.errores.length >= 0 && m.n.cifrar === 2)
}

console.log('10. Fecha de nacimiento: solo se pide si no existe')
prueba('con fecha guardada: registrada (no se pide ni se sugiere)', estadoFechaNacimiento({ fechaNacimiento: '1990-03-15', edad: 36 }) === 'registrada')
prueba('ficha antigua con edad válida y sin fecha: solo sugerencia, se puede continuar', estadoFechaNacimiento({ edad: 40 }) === 'solo_edad')
prueba('sin fecha ni edad: falta (aquí sí se pide)', estadoFechaNacimiento({ nombre: 'A' }) === 'falta' && estadoFechaNacimiento(null) === 'falta')
prueba('edad de menor: falta', estadoFechaNacimiento({ edad: 15 }) === 'falta')
{
  const m = crearMundo(); usar(m)
  m.sembrar({ nivelEstres: 'bajo' }, { edad: 40 })
  const a = await pacienteService.obtenerDeclaracionActiva()
  prueba('ficha antigua (solo edad) carga completa y se puede continuar con esa edad', a.estadoLectura === 'completa' && a.edad === 40 && !a.fechaNacimiento && pacienteService.validarDatos(a).valido)
  const r = await pacienteService.guardarDeclaracion({ ...a })
  prueba('guardarla tal cual no exige la fecha', r.ok)
}
prueba('fichaIgual ignora metadatos y distingue cambios reales', fichaIgual({ nombre: 'A', nivelEstres: 'bajo', fechaNacimiento: '1990-01-01', id: 1 }, { nombre: 'A ', nivelEstres: 'bajo', fechaNacimiento: '1990-01-01', id: 2, origen: 'x' }) && !fichaIgual({ nombre: 'A', nivelEstres: 'bajo' }, { nombre: 'A', nivelEstres: 'alto' }))

console.log('11. Los tres roles usan el mismo camino (estudiante/usuario, profesor, administrador)')
{
  const resultados = []
  for (const rol of ['estudiante', 'profesor', 'admin']) {
    const m = crearMundo({ uid: `u-${rol}`, rol }); usar(m)
    await pacienteService.guardarDeclaracion(FORM)
    volverAIniciarSesion(m); reiniciarContadores(m)
    const a = await pacienteService.obtenerDeclaracionActiva()
    const sin = await pacienteService.guardarDeclaracion({ ...FORM })
    resultados.push({ rol, estres: a.nivelEstres, fecha: a.fechaNacimiento, estado: a.estadoLectura, descifrar: m.n.descifrar, sinCambios: sin.sinCambios, filas: m.filas.length, llamadasGuardarSinCambios: m.n.cifrar + m.n.insert + m.n.update })
  }
  prueba('mismo resultado para estudiante, profesor y admin', resultados.every(r => r.estres === 'alto' && r.fecha === '1990-03-15' && r.estado === 'completa' && r.descifrar === 1 && r.sinCambios === true && r.filas === 1 && r.llamadasGuardarSinCambios === 0))
  const srv = fs.readFileSync(path.join(RAIZ, 'src/services/pacienteService.js'), 'utf8')
  const card = fs.readFileSync(path.join(RAIZ, 'src/components/DatosPacienteCard.vue'), 'utf8')
  prueba('pacienteService no distingue roles', !/\brol(es)?\b|ROLES|isAdmin|esProfesor|esAdmin|app_metadata\.rol/i.test(srv.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')))
  prueba('DatosPacienteCard no distingue roles', !/ROLES|isAdmin|esProfesor|esAdmin|\.rol\b|useRole/i.test(card))
  const router = fs.readFileSync(path.join(RAIZ, 'src/router/index.js'), 'utf8')
  const rutaMedicion = router.match(/path: '\/medicion'[\s\S]*?\n  \}/)[0]
  prueba('la ruta /medicion (donde está la ficha) no restringe por rol', !/roles:/.test(rutaMedicion))
  const rls = fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).map(f => fs.readFileSync(path.join(RAIZ, 'supabase/migrations', f), 'utf8')).join('\n')
  prueba('la RLS de declaraciones_paciente es por titular (for all, usuario_id = auth.uid()), igual para todos los roles', /create policy declaraciones_propias on public\.declaraciones_paciente\s+for all to authenticated\s+using \(usuario_id = \(select auth\.uid\(\)\)\)\s+with check \(usuario_id = \(select auth\.uid\(\)\)\)/.test(rls))
}

console.log('12. Estructura: la tarjeta explica el motivo y ofrece reintentar; Modificar abre el formulario')
{
  const card = fs.readFileSync(path.join(RAIZ, 'src/components/DatosPacienteCard.vue'), 'utf8')
  prueba('tarjeta con aviso de lectura fallida, «Reintentar lectura» e «Ingresar los datos de nuevo»', /Reintentar lectura/.test(card) && /Ingresar los datos de nuevo/.test(card) && /motivoLectura/.test(card))
  prueba('el formulario se abre solo con «Modificar» (o si falta un dato obligatorio)', /@click="abrirEdicion"/.test(card) && /if \(!activo\.nivelEstres\) abrirEdicion\(\)/.test(card))
  prueba('ya no existe el texto que pedía la fecha como obligatoria', !/usa «Modificar» e ingresa la fecha de nacimiento para actualizarla/.test(card))
  const vista = fs.readFileSync(path.join(RAIZ, 'src/views/MedicionView.vue'), 'utf8')
  const ini = vista.indexOf('async function confirmarPaso2')
  const bloque = vista.slice(ini, vista.indexOf('// 4. PASO 3', ini))
  prueba('confirmarPaso2 conserva la validación (nombre, mayor de edad, estrés) y pasa al paso 3 sin esperar al servidor', /datos\.nombre\.trim\(\)\.length < 2/.test(bloque) && /edadNum < 18/.test(bloque) && /!datos\.nivelEstres/.test(bloque) && /pasoActual\.value = 3/.test(bloque) && !/guardarDeclaracion\(/.test(bloque))
}

console.warn = silencio
console.log(`\n${ok} correctas, ${mal} con error`)
process.exit(mal ? 1 : 0)
