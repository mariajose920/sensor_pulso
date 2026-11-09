// Configuración del WiFi del ESP32 por USB · pruebas en Node puro
//   node scripts/test-provision-wifi.mjs
import {
  PREFIJO, codificarComando, parsearLinea, crearAcumuladorLineas, ordenarRedes, nivelSenal, textoMotivo,
  textoSeguridad, textoEstadoWifi, infoDispositivo, estadoInicial, reducir, crearClienteProvision, AVISO_RED_EMPRESA
} from '../src/utils/provisionWifi.js'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }
const lanza = (fn) => { try { fn(); return null } catch (e) { return e } }
const CLAVE_SECRETA = 'S3cr3t0-"x"\\ñ😀'

console.log('Codificación de comandos')
prueba('prefijo exacto', PREFIJO === '@SP ')
prueba('hello', codificarComando('hello') === '@SP {"cmd":"hello"}\n')
prueba('scan/status/forget', ['scan', 'status', 'forget'].every((c) => codificarComando(c) === `@SP {"cmd":"${c}"}\n`))
{
  const l = codificarComando('wifi', { ssid: 'Casa', pass: 'abcd1234' })
  prueba('wifi bien formado, una sola línea', l.startsWith('@SP ') && l.endsWith('\n') && l.indexOf('\n') === l.length - 1)
  const o = JSON.parse(l.slice(4))
  prueba('wifi contenido', o.cmd === 'wifi' && o.ssid === 'Casa' && o.pass === 'abcd1234')
}
prueba('comando desconocido lanza', lanza(() => codificarComando('reboot'))?.message.includes('desconocido'))
{
  const e = lanza(() => codificarComando('wifi', { ssid: '', pass: 'x' }))
  prueba('ssid vacío lanza en español', e && /nombre de la red/i.test(e.message))
}
prueba('ssid sin dato lanza', lanza(() => codificarComando('wifi', { pass: 'x' })) !== null)
prueba('ssid de 32 bytes vale', lanza(() => codificarComando('wifi', { ssid: 'a'.repeat(32), pass: '' })) === null)
prueba('ssid de 33 bytes falla', lanza(() => codificarComando('wifi', { ssid: 'a'.repeat(33), pass: '' })) !== null)
prueba('tildes cuentan 2 bytes (16 ñ = 32 vale)', lanza(() => codificarComando('wifi', { ssid: 'ñ'.repeat(16), pass: '' })) === null)
prueba('tildes cuentan 2 bytes (17 ñ = 34 falla)', lanza(() => codificarComando('wifi', { ssid: 'ñ'.repeat(17), pass: '' })) !== null)
prueba('emoji = 4 bytes (8 emojis vale, 9 falla)',
  lanza(() => codificarComando('wifi', { ssid: '😀'.repeat(8), pass: '' })) === null &&
  lanza(() => codificarComando('wifi', { ssid: '😀'.repeat(9), pass: '' })) !== null)
prueba('clave vacía vale (red abierta)', lanza(() => codificarComando('wifi', { ssid: 'Abierta', pass: '' })) === null)
prueba('clave sin campo vale como vacía', JSON.parse(codificarComando('wifi', { ssid: 'A' }).slice(4)).pass === '')
prueba('clave de 63 bytes vale, 64 falla',
  lanza(() => codificarComando('wifi', { ssid: 'A', pass: 'p'.repeat(63) })) === null &&
  lanza(() => codificarComando('wifi', { ssid: 'A', pass: 'p'.repeat(64) })) !== null)
{
  const l = codificarComando('wifi', { ssid: 'Mi "Red"\\1', pass: CLAVE_SECRETA })
  const o = JSON.parse(l.slice(4))
  prueba('comillas, barras, ñ y emoji sobreviven al ida y vuelta', o.ssid === 'Mi "Red"\\1' && o.pass === CLAVE_SECRETA)
  prueba('sigue siendo una sola línea', l.split('\n').length === 2)
}
prueba('saltos de línea y U+2028 en la clave no rompen la línea', (() => {
  const l = codificarComando('wifi', { ssid: 'A', pass: 'a\nb\r\u2028c' })
  return l.split('\n').length === 2 && !l.includes('\u2028') && JSON.parse(l.slice(4)).pass === 'a\nb\r\u2028c'
})())
{
  const e = lanza(() => codificarComando('wifi', { ssid: 'A', pass: 'p'.repeat(70) + CLAVE_SECRETA }))
  prueba('el mensaje de error no incluye la clave', e && !e.message.includes(CLAVE_SECRETA) && !e.message.includes('ppp'))
}
prueba('server con url y token', JSON.parse(codificarComando('server', { url: 'https://x.test/api', token: 't' }).slice(4)).url === 'https://x.test/api')
prueba('server sin url lanza', lanza(() => codificarComando('server', {})) !== null)

console.log('Parseo de eventos')
const HELLO = '{"ev":"hello","fw":"2.0","mac":"68:fe:71:87:4d:80","name":"ESP32-Biomedico-01","wifi":"sin_credenciales","ssid":"","ip":"","rssi":0}'
prueba('hello', parsearLinea(`@SP ${HELLO}`)?.name === 'ESP32-Biomedico-01')
prueba('scan', parsearLinea('@SP {"ev":"scan","redes":[{"ssid":"Casa","rssi":-52,"seguridad":"wpa2"}]}')?.redes?.[0]?.ssid === 'Casa')
prueba('wifi conectado', parsearLinea('@SP {"ev":"wifi","estado":"conectado","ssid":"Casa","ip":"192.168.1.9","rssi":-55}')?.ip === '192.168.1.9')
prueba('wifi error', parsearLinea('@SP {"ev":"wifi","estado":"error","motivo":"clave_incorrecta"}')?.motivo === 'clave_incorrecta')
prueba('termina en \\r', parsearLinea(`@SP ${HELLO}\r`)?.ev === 'hello')
prueba('espacios alrededor', parsearLinea(`   @SP ${HELLO}  \t`)?.ev === 'hello')
prueba('sin prefijo -> null', parsearLinea(HELLO) === null)
prueba('muestras -> null', parsearLinea('CH1,1234,5000,4000') === null && parsearLinea('12345, 678') === null)
prueba('log del firmware -> null', parsearLinea('[wifi] conectando...') === null)
prueba('prefijo parecido -> null', parsearLinea('@SPX {"ev":"hello"}') === null && parsearLinea('@sp {"ev":"hello"}') === null)
prueba('línea truncada -> null', parsearLinea('@SP {"ev":"scan","redes":[{"ssid":"Ca') === null)
prueba('JSON inválido -> null', parsearLinea('@SP {ev:hello}') === null)
prueba('JSON sin ev -> null', parsearLinea('@SP {"x":1}') === null)
prueba('JSON no objeto -> null', parsearLinea('@SP [1,2]') === null && parsearLinea('@SP 5') === null)
prueba('vacío / no texto -> null', parsearLinea('') === null && parsearLinea(null) === null && parsearLinea(42) === null)

console.log('Acumulador de líneas')
{
  const ac = crearAcumuladorLineas()
  const l1 = `@SP ${HELLO}`
  const l2 = '@SP {"ev":"forget","ok":true}'
  const todo = `${l1}\r\nbasura\n${l2}\n`
  const sal = []
  for (let i = 0; i < todo.length; i += 7) sal.push(...ac.agregar(todo.slice(i, i + 7)))
  prueba('chunks de 7 caracteres rearman las 3 líneas', sal.length === 3 && sal[0] === l1 && sal[1] === 'basura' && sal[2] === l2)
  prueba('quedan 0 pendientes', ac.pendiente() === '')
  prueba('línea incompleta queda pendiente', ac.agregar('@SP {"ev"').length === 0 && ac.pendiente() === '@SP {"ev"')
  prueba('\\r y \\n separados en distinto chunk', (() => {
    const a = crearAcumuladorLineas()
    return a.agregar('uno\r').length === 0 && a.agregar('\ndos\n').join('|') === 'uno|dos'
  })())
  prueba('bytes UTF-8 partidos a mitad de carácter', (() => {
    const a = crearAcumuladorLineas()
    const bytes = new TextEncoder().encode('ñandú😀\n')
    const salida = []
    for (const b of bytes) salida.push(...a.agregar(Uint8Array.of(b)))
    return salida.length === 1 && salida[0] === 'ñandú😀'
  })())
  prueba('línea sin fin enorme se descarta', (() => {
    const a = crearAcumuladorLineas({ maxLinea: 50 })
    a.agregar('x'.repeat(200))
    return a.pendiente() === '' && a.agregar('ok\n')[0] === 'ok'
  })())
  {
    ac.agregar('parcial'); ac.reiniciar()
    prueba('reiniciar vacía el buffer', ac.pendiente() === '')
  }
}

console.log('Redes y señal')
{
  const redes = ordenarRedes([
    { ssid: 'Débil', rssi: -88, seguridad: 'wpa2' },
    { ssid: 'Casa', rssi: -70, seguridad: 'wpa2' },
    { ssid: 'Casa', rssi: -45, seguridad: 'wpa2' },
    { ssid: '', rssi: -30, seguridad: 'abierta' },
    { ssid: 'eduroam', rssi: -60, seguridad: 'empresa' },
    { ssid: 'Rara', rssi: -75, seguridad: 'inventada' },
    null
  ])
  prueba('quita vacías y duplicadas', redes.length === 4 && redes.filter((r) => r.ssid === 'Casa').length === 1)
  prueba('deja la señal más fuerte del duplicado', redes.find((r) => r.ssid === 'Casa').rssi === -45)
  prueba('orden por señal descendente', redes.map((r) => r.ssid).join(',') === 'Casa,eduroam,Rara,Débil')
  prueba('empresa no compatible', redes.find((r) => r.ssid === 'eduroam').compatible === false && redes[0].compatible === true)
  prueba('seguridad desconocida -> otra', redes.find((r) => r.ssid === 'Rara').seguridad === 'otra')
  prueba('entrada inválida -> []', ordenarRedes(undefined).length === 0)
  prueba('textos de seguridad', textoSeguridad('abierta') === 'Sin clave' && textoSeguridad('empresa') === 'Red de empresa')
}
prueba('niveles de señal', nivelSenal(-40).nivel === 'excelente' && nivelSenal(-55).nivel === 'excelente' && nivelSenal(-60).nivel === 'buena' &&
  nivelSenal(-67).nivel === 'buena' && nivelSenal(-75).nivel === 'regular' && nivelSenal(-80).nivel === 'regular' && nivelSenal(-81).nivel === 'débil')
prueba('barras 4/3/2/1', nivelSenal(-40).barras === 4 && nivelSenal(-60).barras === 3 && nivelSenal(-75).barras === 2 && nivelSenal(-95).barras === 1)
prueba('rssi inválido -> débil 1 barra', nivelSenal(undefined).barras === 1 && nivelSenal('x').nivel === 'débil' && nivelSenal(0).nivel === 'débil')

console.log('Mensajes en español')
prueba('clave_incorrecta', textoMotivo('clave_incorrecta').includes('Revisa la clave'))
prueba('no_encontrada', textoMotivo('no_encontrada').includes('2,4 GHz') && textoMotivo('no_encontrada').includes('Acércalo al router'))
prueba('tiempo', textoMotivo('tiempo').includes('No respondió a tiempo') && textoMotivo('tiempo').includes('Reintenta'))
prueba('motivo desconocido tiene texto genérico', textoMotivo('xyz').length > 5 && !textoMotivo(undefined).includes('undefined'))
prueba('aviso de red de empresa', AVISO_RED_EMPRESA.includes('eduroam') && AVISO_RED_EMPRESA.includes('hotspot'))
prueba('estados de WiFi', textoEstadoWifi('conectado') === 'Conectado' && textoEstadoWifi('sin_credenciales') === 'Sin WiFi guardado' && textoEstadoWifi('zzz') === 'Desconocido')
{
  const i = infoDispositivo(parsearLinea(`@SP ${HELLO}`))
  prueba('infoDispositivo', i.nombre === 'ESP32-Biomedico-01' && i.mac === '68:fe:71:87:4d:80' && i.wifi === 'sin_credenciales' && i.rssi === 0)
  prueba('infoDispositivo tolera vacío', infoDispositivo(null).nombre === 'ESP32')
}

console.log('Máquina de estados')
{
  let s = estadoInicial()
  prueba('empieza en conectar', s.paso === 'conectar' && !s.ocupado)
  s = reducir(s, { tipo: 'PUERTO_ABIERTO' })
  prueba('puerto abierto -> saludo ocupado', s.paso === 'saludo' && s.ocupado && s.info === null)
  s = reducir(s, { tipo: 'SALUDO', ev: parsearLinea(`@SP ${HELLO}`) })
  prueba('saludo con info', s.paso === 'saludo' && !s.ocupado && s.info.mac.startsWith('68:fe'))
  s = reducir(s, { tipo: 'ESCANEANDO' })
  prueba('escaneando -> redes ocupado', s.paso === 'redes' && s.ocupado)
  s = reducir(s, { tipo: 'REDES', redes: [{ ssid: 'Casa', rssi: -50, seguridad: 'wpa2' }, { ssid: 'eduroam', rssi: -40, seguridad: 'empresa' }] })
  prueba('redes ordenadas', !s.ocupado && s.redes[0].ssid === 'eduroam' && s.redes.length === 2)
  const conEmpresa = reducir(s, { tipo: 'ELEGIR_RED', ssid: 'eduroam', seguridad: 'empresa' })
  prueba('red de empresa se rechaza con aviso', conEmpresa.paso === 'redes' && conEmpresa.error === AVISO_RED_EMPRESA)
  prueba('nombre vacío se rechaza', reducir(s, { tipo: 'ELEGIR_RED', ssid: '' }).paso === 'redes')
  prueba('ENVIAR fuera de paso clave se ignora', reducir(s, { tipo: 'ENVIAR' }).paso === 'redes')
  s = reducir(s, { tipo: 'ELEGIR_RED', ssid: 'Casa', seguridad: 'wpa2' })
  prueba('elegir red -> clave', s.paso === 'clave' && s.red.ssid === 'Casa')
  const atras = reducir(s, { tipo: 'VOLVER' })
  prueba('volver desde clave -> redes', atras.paso === 'redes')
  s = reducir(s, { tipo: 'ENVIAR' })
  prueba('enviar -> conectando ocupado', s.paso === 'conectando' && s.ocupado)
  prueba('no se puede volver mientras conecta', reducir(s, { tipo: 'VOLVER' }).paso === 'conectando')
  const ok1 = reducir(s, { tipo: 'WIFI_OK', ssid: 'Casa', ip: '192.168.1.9' })
  prueba('WIFI_OK -> resultado ok', ok1.paso === 'resultado' && ok1.resultado.ok && ok1.resultado.ip === '192.168.1.9')
  for (const [m, t] of [['clave_incorrecta', 'Revisa la clave'], ['no_encontrada', '2,4 GHz'], ['tiempo', 'No respondió a tiempo']]) {
    const e = reducir(s, { tipo: 'WIFI_ERROR', motivo: m })
    prueba(`WIFI_ERROR ${m} -> resultado con texto`, e.paso === 'resultado' && !e.resultado.ok && e.resultado.mensaje.includes(t) && e.resultado.motivo === m)
  }
  const e = reducir(s, { tipo: 'WIFI_ERROR', motivo: 'clave_incorrecta' })
  prueba('reintentar -> clave', reducir(e, { tipo: 'REINTENTAR' }).paso === 'clave')
  prueba('otra red: reintentar y volver -> redes', reducir(reducir(e, { tipo: 'REINTENTAR' }), { tipo: 'VOLVER' }).paso === 'redes')
  prueba('WIFI_OK fuera de conectando se ignora', reducir(estadoInicial(), { tipo: 'WIFI_OK' }).paso === 'conectar')
  const fallo = reducir(s, { tipo: 'FALLO', mensaje: 'Se cayó' })
  prueba('fallo de comunicación al conectar -> resultado de error', fallo.paso === 'resultado' && !fallo.resultado.ok && fallo.resultado.mensaje === 'Se cayó')
  prueba('fallo en conectar queda ahí con mensaje', (() => { const f = reducir(estadoInicial(), { tipo: 'FALLO', mensaje: 'x' }); return f.paso === 'conectar' && f.error === 'x' })())
  const perdido = reducir(s, { tipo: 'PUERTO_PERDIDO', mensaje: 'Cable fuera' })
  prueba('puerto perdido -> vuelve a conectar con aviso', perdido.paso === 'conectar' && perdido.error === 'Cable fuera' && perdido.redes.length === 0)
  const olv = reducir(reducir(reducir(estadoInicial(), { tipo: 'PUERTO_ABIERTO' }), { tipo: 'SALUDO', ev: { ev: 'hello', wifi: 'conectado', ssid: 'Casa', ip: '1.2.3.4' } }), { tipo: 'OLVIDADO' })
  prueba('olvidar -> sin credenciales', olv.info.wifi === 'sin_credenciales' && olv.info.ssid === '')
  prueba('REINICIAR vuelve al inicio', reducir(s, { tipo: 'REINICIAR' }).paso === 'conectar')
  prueba('acción desconocida no cambia el estado', reducir(s, { tipo: 'NADA' }) === s)
}

console.log('La clave nunca aparece en estado, mensajes ni errores')
{
  const textos = []
  let s = estadoInicial()
  const pasos = [
    { tipo: 'PUERTO_ABIERTO' }, { tipo: 'SALUDO', ev: parsearLinea(`@SP ${HELLO}`) }, { tipo: 'ESCANEANDO' },
    { tipo: 'REDES', redes: [{ ssid: 'Casa', rssi: -50, seguridad: 'wpa2' }] },
    { tipo: 'ELEGIR_RED', ssid: 'Casa', seguridad: 'wpa2' }, { tipo: 'ENVIAR' },
    { tipo: 'WIFI_ERROR', motivo: 'clave_incorrecta' }, { tipo: 'REINTENTAR' }, { tipo: 'ENVIAR' }, { tipo: 'WIFI_OK', ssid: 'Casa', ip: '10.0.0.2' }
  ]
  for (const a of pasos) { s = reducir(s, a); textos.push(JSON.stringify(s)) }
  for (const m of ['clave_incorrecta', 'no_encontrada', 'tiempo', 'datos_invalidos', 'comando_invalido', 'sin_respuesta']) textos.push(textoMotivo(m))
  prueba('ningún estado ni texto contiene la clave', textos.every((t) => !t.includes(CLAVE_SECRETA) && !t.includes('S3cr3t0')))
  prueba('el estado no tiene campo de clave', !('pass' in s) && !('clave' in s) && !JSON.stringify(s).includes('"pass"'))
}

// ---------------------------------------------------------------------------
// Firmware simulado: implementa el protocolo y responde por un «puerto» con chunks partidos
// ---------------------------------------------------------------------------
function crearFirmwareFalso({ redOk = 'Casa', claveOk = 'clave1234', existentes = ['Casa', 'Otra'], silencioso = false } = {}) {
  const registro = [] // lo que «imprimió» el firmware (para comprobar que no filtra claves)
  const acumulador = crearAcumuladorLineas()
  const lectoresAcum = crearAcumuladorLineas()
  const oyentes = new Set()
  let wifi = { estado: 'sin_credenciales', ssid: '', ip: '' }
  let tamChunk = 5
  const emitir = (linea) => {
    registro.push(linea)
    // Llega al lado de la app en trozos pequeños, mezclado con basura y \r\n
    const bytes = new TextEncoder().encode(linea + '\r\n')
    for (let i = 0; i < bytes.length; i += tamChunk) {
      for (const l of lectoresAcum.agregar(bytes.slice(i, i + tamChunk))) {
        const ev = parsearLinea(l)
        if (ev) for (const cb of [...oyentes]) cb(ev)
      }
    }
  }
  const imprimir = (obj) => emitir(`@SP ${JSON.stringify(obj)}`)
  const hello = (ev = 'hello') => imprimir({ ev, fw: '2.0', mac: '68:fe:71:87:4d:80', name: 'ESP32-Biomedico-01', wifi: wifi.estado, ssid: wifi.ssid, ip: wifi.ip, rssi: wifi.ip ? -55 : 0 })
  const recibir = (texto) => {
    for (const linea of acumulador.agregar(texto)) {
      if (!linea.startsWith('@SP ')) continue
      let c
      try { c = JSON.parse(linea.slice(4)) } catch { imprimir({ ev: 'error', motivo: 'datos_invalidos' }); continue }
      if (silencioso) continue
      emitir('CH1,100,5000,4000') // muestras mezcladas con el protocolo
      switch (c.cmd) {
        case 'hello': hello('hello'); break
        case 'status': hello('status'); break
        case 'scan':
          imprimir({ ev: 'scan', redes: [
            { ssid: 'Casa', rssi: -52, seguridad: 'wpa2' }, { ssid: 'Casa', rssi: -80, seguridad: 'wpa2' },
            { ssid: 'eduroam', rssi: -60, seguridad: 'empresa' }, { ssid: 'Otra', rssi: -77, seguridad: 'abierta' }
          ] })
          break
        case 'wifi':
          imprimir({ ev: 'wifi', estado: 'conectando' })
          if (!existentes.includes(c.ssid)) imprimir({ ev: 'wifi', estado: 'error', motivo: 'no_encontrada' })
          else if (c.ssid !== redOk || c.pass !== claveOk) imprimir({ ev: 'wifi', estado: 'error', motivo: 'clave_incorrecta' })
          else { wifi = { estado: 'conectado', ssid: c.ssid, ip: '192.168.1.44' }; imprimir({ ev: 'wifi', estado: 'conectado', ssid: c.ssid, ip: wifi.ip, rssi: -55 }) }
          break
        case 'forget': wifi = { estado: 'sin_credenciales', ssid: '', ip: '' }; imprimir({ ev: 'forget', ok: true }); break
        default: imprimir({ ev: 'error', motivo: 'comando_invalido' })
      }
    }
  }
  return {
    registro,
    // «Puerto» visto desde la app
    enviar: async (texto) => {
      // la app escribe en trozos también
      for (let i = 0; i < texto.length; i += 9) recibir(texto.slice(i, i + 9))
    },
    suscribir: (cb) => { oyentes.add(cb); return () => oyentes.delete(cb) },
    wifi: () => wifi
  }
}

console.log('Cliente del protocolo con firmware simulado')
const escritos = []
{
  const fw = crearFirmwareFalso()
  const enviar = async (t) => { escritos.push(t); await fw.enviar(t) }
  const c = crearClienteProvision({ enviar, suscribir: fw.suscribir, tiempos: { hello: 30, scan: 100, wifi: 100, forget: 50 } })
  const h = await c.hello()
  prueba('hello: nombre y MAC', h.name === 'ESP32-Biomedico-01' && h.mac === '68:fe:71:87:4d:80' && h.wifi === 'sin_credenciales')
  const redes = await c.escanear()
  prueba('scan: ordenado, sin duplicados y con empresa marcada', redes.map((r) => r.ssid).join(',') === 'Casa,eduroam,Otra' && redes[1].compatible === false && redes[0].rssi === -52)
  const progreso = []
  const r1 = await c.configurarWifi('Casa', 'clave1234', { alProgreso: (p) => progreso.push(p) })
  prueba('wifi correcto -> ok con IP', r1.ok && r1.ssid === 'Casa' && r1.ip === '192.168.1.44')
  prueba('se informó el progreso «conectando»', progreso.includes('conectando'))
  const r2 = await c.configurarWifi('Casa', 'mala-clave', {})
  prueba('wifi con clave mala -> clave_incorrecta', !r2.ok && r2.motivo === 'clave_incorrecta' && r2.mensaje.includes('Revisa la clave'))
  const r3 = await c.configurarWifi('NoExiste', 'clave1234')
  prueba('wifi con red inexistente -> no_encontrada', !r3.ok && r3.motivo === 'no_encontrada' && r3.mensaje.includes('2,4 GHz'))
  const sinWifi = await c.olvidar()
  prueba('forget -> true y el firmware queda sin WiFi', sinWifi === true && fw.wifi().estado === 'sin_credenciales')
  const st = await c.estado()
  prueba('status', st.ev === 'status' && st.wifi === 'sin_credenciales')
  const malo = await c.configurarWifi('', 'x').then(() => null, (e) => e)
  prueba('ssid vacío se rechaza antes de escribir al puerto', malo && /nombre de la red/i.test(malo.message))
  prueba('los comandos escritos son líneas @SP válidas', escritos.every((t) => t.startsWith('@SP {') && t.endsWith('}\n')))
  prueba('el log del firmware no contiene la clave', fw.registro.every((l) => !l.includes('clave1234') && !l.includes('mala-clave')))
  c.destruir()
}
{
  // Firmware que no responde: hello reintenta y falla; wifi vence con «tiempo»
  const fw = crearFirmwareFalso({ silencioso: true })
  let hellos = 0
  const c = crearClienteProvision({
    enviar: async (t) => { if (t.includes('"hello"')) hellos++; await fw.enviar(t) },
    suscribir: fw.suscribir, tiempos: { hello: 20, helloIntentos: 3, wifi: 40, scan: 40 }
  })
  const e = await c.hello().then(() => null, (x) => x)
  prueba('hello sin respuesta reintenta y falla', e?.codigo === 'sin_respuesta' && hellos === 3)
  const t = await c.configurarWifi('Casa', 'clave1234')
  prueba('wifi sin respuesta -> motivo tiempo', !t.ok && t.motivo === 'tiempo' && t.mensaje.includes('No respondió a tiempo'))
  const es = await c.escanear().then(() => null, (x) => x)
  prueba('scan sin respuesta falla con sin_respuesta', es?.codigo === 'sin_respuesta')
  c.destruir()
}
{
  // El ESP32 se está reiniciando: el primer hello se pierde, el segundo se responde
  const fw = crearFirmwareFalso()
  let n = 0
  const c = crearClienteProvision({
    enviar: async (t) => { if (t.includes('"hello"') && ++n === 1) return; await fw.enviar(t) },
    suscribir: fw.suscribir, tiempos: { hello: 20, helloIntentos: 3 }
  })
  const h = await c.hello()
  prueba('hello se recupera en el segundo intento', h.ev === 'hello' && n === 2)
  c.destruir()
}
{
  // Evento de error del firmware y cancelación
  const oyentes = new Set()
  const c = crearClienteProvision({
    enviar: async () => { for (const cb of oyentes) cb({ ev: 'error', motivo: 'datos_invalidos' }) },
    suscribir: (cb) => { oyentes.add(cb); return () => oyentes.delete(cb) }, tiempos: { scan: 50, wifi: 50 }
  })
  const e = await c.escanear().then(() => null, (x) => x)
  prueba('{"ev":"error"} corta la espera con su motivo', e?.codigo === 'datos_invalidos')
  const w = await c.configurarWifi('Casa', 'clave1234')
  prueba('error en wifi -> resultado no ok con texto', !w.ok && w.motivo === 'datos_invalidos')
  const colgado = crearClienteProvision({ enviar: async () => {}, suscribir: () => () => {}, tiempos: { scan: 10000 } })
  const p = colgado.escanear().then(() => null, (x) => x)
  colgado.destruir()
  prueba('destruir cancela las esperas', (await p)?.codigo === 'cancelado')
  c.destruir()
}
{
  // El firmware anuncia solo (hello) que se conectó, sin llegar a mandar ev:wifi
  const oyentes = new Set()
  const c = crearClienteProvision({
    enviar: async () => { for (const cb of oyentes) cb({ ev: 'hello', wifi: 'conectado', ssid: 'Casa', ip: '10.0.0.9', rssi: -60 }) },
    suscribir: (cb) => { oyentes.add(cb); return () => oyentes.delete(cb) }, tiempos: { wifi: 50 }
  })
  const r = await c.configurarWifi('Casa', 'abcd1234')
  prueba('hello conectado también cuenta como éxito', r.ok && r.ip === '10.0.0.9')
  c.destruir()
}

// ---------------------------------------------------------------------------
// Capa de transporte (esp32Service + useSerialSensor) con un puerto Web Serial simulado
// ---------------------------------------------------------------------------
console.log('Transporte serie del asistente (Web Serial simulado)')
{
  let abierto = false
  let controlLectura = null
  const escrito = []
  const enc = new TextEncoder()
  const crearPuerto = () => ({
    getInfo: () => ({ usbVendorId: 0x10c4 }),
    open: async () => {
      if (abierto) { const e = new Error('ocupado'); e.name = 'InvalidStateError'; throw e }
      abierto = true
    },
    close: async () => { abierto = false },
    get readable() {
      return new ReadableStream({ start(c) { controlLectura = c } })
    },
    writable: new WritableStream({ write(chunk) { escrito.push(new TextDecoder().decode(chunk)) } })
  })
  const puerto = crearPuerto()
  // readable debe ser el MISMO stream mientras el puerto está abierto
  let stream = null
  Object.defineProperty(puerto, 'readable', { get() { return stream ??= new ReadableStream({ start(c) { controlLectura = c } }) } })
  const original = puerto.close
  puerto.close = async () => { stream = null; await original() }
  Object.defineProperty(globalThis, 'navigator', {
    value: { serial: { getPorts: async () => [puerto], requestPort: async () => puerto, addEventListener() {}, removeEventListener() {} } },
    configurable: true
  })
  const svc = await import('../src/services/esp32Service.js')
  const ESPERA = (ms) => new Promise((r) => setTimeout(r, ms))
  const lleva = (texto) => controlLectura.enqueue(enc.encode(texto))

  const r = await svc.abrirPuertoConfiguracion()
  prueba('abre el puerto del ESP32 solo (autodetectado)', r.ok && r.auto === true && r.compartido === false && svc.configUsbState.abierto)
  prueba('usbState no cambia (la fuente USB sigue sin conectar)', svc.usbState.conectado === false)

  const recibidos = []
  const baja = svc.suscribirEventosConfiguracion((ev) => recibidos.push(ev))
  // Primera línea completa «@SP» (no se descarta como fragmento), muestras y basura mezcladas
  lleva('@SP {"ev":"hello","fw":"2.0","mac":"aa","name":"E","wifi":"sin_credenciales","ssid":"","ip":"","rssi":0}\r\nCH1,5,100,90\r\n@SP {"ev":"sc')
  await ESPERA(30)
  lleva('an","redes":[]}\n')
  await ESPERA(30)
  prueba('entrega los eventos @SP aunque lleguen partidos', recibidos.length === 2 && recibidos[0].ev === 'hello' && recibidos[1].ev === 'scan')

  await svc.enviarComandoWifi('wifi', { ssid: 'Casa', pass: 'clave1234' })
  prueba('escribe la línea al puerto en UTF-8', escrito.join('') === '@SP {"cmd":"wifi","ssid":"Casa","pass":"clave1234"}\n')
  const err = await svc.enviarComandoWifi('wifi', { ssid: '' }).then(() => null, (e) => e)
  prueba('un comando inválido lanza y no escribe', err !== null && escrito.length === 1)

  // Las líneas @SP no cuentan como muestras ni como líneas inválidas de la fuente USB
  svc.seleccionarFuente('usb')
  const antes = svc.usbState.lineasInvalidas
  prueba('procesarLineaSerial ignora @SP sin contarlo como inválido', svc.procesarLineaSerial('@SP {"ev":"hello"}') === 0 && svc.usbState.lineasInvalidas === antes)
  const colision = await svc.conectarUsb()
  prueba('conectarUsb con el puerto del asistente abierto avisa y no abre otro', colision === false && /asistente/i.test(svc.usbState.error || ''))

  baja()
  await svc.cerrarPuertoConfiguracion()
  prueba('cerrar libera el puerto (lo abrió el asistente)', abierto === false && svc.configUsbState.abierto === false)
  await svc.cerrarPuertoConfiguracion()
  prueba('cerrar dos veces no falla', true)

  // Puerto compartido con la fuente USB de medición: no se cierra al terminar
  stream = null
  const okUsb = await svc.conectarUsb()
  prueba('la fuente USB abre el puerto', okUsb === true && abierto === true)
  const c = await svc.abrirPuertoConfiguracion()
  prueba('el asistente reutiliza el puerto abierto', c.ok && c.compartido === true)
  escrito.length = 0
  await svc.enviarComandoWifi('hello')
  prueba('escribe por el puerto compartido', escrito.join('') === '@SP {"cmd":"hello"}\n')
  await svc.cerrarPuertoConfiguracion()
  prueba('cerrar el asistente NO cierra el puerto de la fuente USB', abierto === true && svc.usbState.conectado === true)
  await svc.desconectarUsb()
  prueba('desconectarUsb lo cierra', abierto === false)

  // Cable desenchufado mientras el asistente lo usa
  stream = null
  await svc.abrirPuertoConfiguracion()
  let aviso = null
  svc.alPerderPuertoConfiguracion((m) => { aviso = m })
  controlLectura.close() // fin de lectura sin pedirlo = dispositivo perdido
  await ESPERA(60)
  prueba('avisa si se pierde el puerto y queda cerrado', typeof aviso === 'string' && svc.configUsbState.abierto === false)
  await svc.cerrarPuertoConfiguracion()
  const sinAbrir = await svc.enviarComandoWifi('hello').then(() => null, (e) => e)
  prueba('escribir sin puerto abierto lanza en español', sinAbrir && /no está conectado/.test(sinAbrir.message))
}

console.log(`\n${ok} correctas, ${mal} con error`)
if (mal) process.exit(1)
