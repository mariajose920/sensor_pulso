/**
 * Configuración del WiFi del ESP32 por cable USB (lógica PURA, sin navegador).
 *
 * Protocolo (115200 baudios, una línea por mensaje):
 *   "@SP " + JSON de UNA línea + "\n"
 *   App -> ESP32: {"cmd":"hello"|"scan"|"status"|"forget"} · {"cmd":"wifi","ssid","pass"} · {"cmd":"server","url","token"}
 *   ESP32 -> App: {"ev":"hello"|"status"|"scan"|"wifi"|"forget"|"server"|"error", ...}
 * Las líneas sin el prefijo (muestras, logs del firmware) se ignoran.
 *
 * SEGURIDAD: la clave del WiFi solo viaja dentro del comando "wifi". Nada de lo que este
 * módulo devuelve como texto de estado, error o registro contiene la clave.
 */

export const PREFIJO = '@SP '
export const BAUDIOS = 115200

export const COMANDOS = ['hello', 'scan', 'status', 'forget', 'wifi', 'server']

const MAX_SSID_BYTES = 32
const MAX_PASS_BYTES = 63
const MAX_LINEA = 4096

function bytesUtf8(texto) {
  return new TextEncoder().encode(String(texto)).length
}

// ---------------------------------------------------------------------------
// Codificación de comandos (App -> ESP32)
// ---------------------------------------------------------------------------

/** Escapa también U+2028/U+2029 para que la línea sea siempre de verdad una sola línea. */
const LS = String.fromCharCode(0x2028)
const PS = String.fromCharCode(0x2029)
function jsonUnaLinea(obj) {
  return JSON.stringify(obj).split(LS).join('\\u2028').split(PS).join('\\u2029')
}

/**
 * Devuelve la línea lista para enviar: '@SP {...}\n'.
 * Lanza Error con mensaje en español si el comando o los datos no son válidos.
 * Los mensajes de error nunca incluyen la clave.
 */
export function codificarComando(cmd, datos = {}) {
  if (!COMANDOS.includes(cmd)) throw new Error('Comando desconocido para el ESP32.')
  const d = datos || {}
  let cuerpo = { cmd }

  if (cmd === 'wifi') {
    const ssid = d.ssid
    const pass = d.pass == null ? '' : d.pass
    if (typeof ssid !== 'string' || ssid.length === 0) throw new Error('Escribe el nombre de la red WiFi.')
    if (bytesUtf8(ssid) > MAX_SSID_BYTES) throw new Error('El nombre de la red es demasiado largo (máximo 32 bytes).')
    if (typeof pass !== 'string') throw new Error('La clave del WiFi no es válida.')
    if (bytesUtf8(pass) > MAX_PASS_BYTES) throw new Error('La clave del WiFi es demasiado larga (máximo 63 caracteres).')
    cuerpo = { cmd, ssid, pass }
  } else if (cmd === 'server') {
    if (typeof d.url !== 'string' || !d.url.trim()) throw new Error('Falta la dirección del servidor.')
    cuerpo = { cmd, url: d.url.trim(), token: typeof d.token === 'string' ? d.token : '' }
  }
  return `${PREFIJO}${jsonUnaLinea(cuerpo)}\n`
}

// ---------------------------------------------------------------------------
// Parseo de eventos (ESP32 -> App)
// ---------------------------------------------------------------------------

/** Devuelve el objeto del evento, o null si no es una línea del protocolo o está truncada/inválida. */
export function parsearLinea(linea) {
  if (typeof linea !== 'string') return null
  const t = linea.replace(/^\s+/, '').replace(/\s+$/, '')
  if (!t.startsWith(PREFIJO)) return null
  const json = t.slice(PREFIJO.length).trim()
  if (!json.startsWith('{')) return null
  try {
    const obj = JSON.parse(json)
    if (obj && typeof obj === 'object' && !Array.isArray(obj) && typeof obj.ev === 'string') return obj
  } catch { /* línea cortada o con basura */ }
  return null
}

/**
 * Acumulador de texto/bytes en líneas. Los chunks pueden llegar partidos en cualquier punto
 * (incluso a mitad de un carácter UTF-8 o entre \r y \n). agregar() devuelve las líneas completas.
 */
export function crearAcumuladorLineas({ maxLinea = MAX_LINEA } = {}) {
  let buffer = ''
  const decoder = new TextDecoder('utf-8')
  return {
    agregar(chunk) {
      if (chunk == null) return []
      buffer += typeof chunk === 'string' ? chunk : decoder.decode(chunk, { stream: true })
      const partes = buffer.split('\n')
      buffer = partes.pop()
      if (buffer.length > maxLinea) buffer = '' // línea sin fin: se descarta para no crecer sin límite
      return partes.map((p) => p.replace(/\r$/, ''))
    },
    pendiente() { return buffer },
    reiniciar() { buffer = '' }
  }
}

// ---------------------------------------------------------------------------
// Redes WiFi
// ---------------------------------------------------------------------------

export const AVISO_RED_EMPRESA =
  'Las redes con usuario y contraseña propios, como eduroam, no funcionan: usa el hotspot de un celular o el router del laboratorio.'

const SEGURIDADES = ['abierta', 'wpa2', 'wpa3', 'empresa', 'otra']

/** Nivel de señal según rssi (dBm). */
export function nivelSenal(rssi) {
  const n = Number(rssi)
  if (!Number.isFinite(n) || n === 0) return { nivel: 'débil', barras: 1, texto: 'Señal débil' }
  if (n >= -55) return { nivel: 'excelente', barras: 4, texto: 'Señal excelente' }
  if (n >= -67) return { nivel: 'buena', barras: 3, texto: 'Señal buena' }
  if (n >= -80) return { nivel: 'regular', barras: 2, texto: 'Señal regular' }
  return { nivel: 'débil', barras: 1, texto: 'Señal débil' }
}

export function textoSeguridad(seguridad) {
  switch (seguridad) {
    case 'abierta': return 'Sin clave'
    case 'wpa2': return 'Con clave'
    case 'wpa3': return 'Con clave'
    case 'empresa': return 'Red de empresa'
    default: return 'Con clave'
  }
}

/**
 * Limpia la lista del escaneo: descarta nombres vacíos, quita duplicados (queda la señal más fuerte)
 * y ordena de mayor a menor señal. Cada red sale con { ssid, rssi, seguridad, compatible, nivel, barras }.
 */
export function ordenarRedes(redes) {
  if (!Array.isArray(redes)) return []
  const porNombre = new Map()
  for (const r of redes) {
    if (!r || typeof r.ssid !== 'string' || r.ssid.length === 0) continue
    const rssi = Number.isFinite(Number(r.rssi)) ? Number(r.rssi) : -100
    const seguridad = SEGURIDADES.includes(r.seguridad) ? r.seguridad : 'otra'
    const previa = porNombre.get(r.ssid)
    if (!previa || rssi > previa.rssi) porNombre.set(r.ssid, { ssid: r.ssid, rssi, seguridad })
  }
  return [...porNombre.values()]
    .sort((a, b) => b.rssi - a.rssi || a.ssid.localeCompare(b.ssid))
    .map((r) => {
      const s = nivelSenal(r.rssi)
      return { ...r, compatible: r.seguridad !== 'empresa', nivel: s.nivel, barras: s.barras }
    })
}

// ---------------------------------------------------------------------------
// Textos en español
// ---------------------------------------------------------------------------

const MOTIVOS = {
  clave_incorrecta: { titulo: 'Clave incorrecta', accion: 'Revisa la clave.' },
  no_encontrada: {
    titulo: 'No encuentra esa red',
    accion: 'Acércalo al router; recuerda que solo funciona con redes de 2,4 GHz.'
  },
  tiempo: { titulo: 'No respondió a tiempo', accion: 'Reintenta.' },
  datos_invalidos: { titulo: 'Datos no válidos', accion: 'Revisa el nombre de la red y la clave.' },
  comando_invalido: { titulo: 'El ESP32 no entendió la orden', accion: 'Puede tener un programa antiguo: actualiza su firmware.' },
  sin_respuesta: { titulo: 'El ESP32 no responde', accion: 'Revisa que sea un ESP32 con el programa del laboratorio y que ningún otro programa use el puerto.' }
}

/** Texto breve en español para un motivo de error del firmware. Nunca incluye datos del usuario. */
export function textoMotivo(motivo) {
  const m = MOTIVOS[motivo]
  if (!m) return 'No se pudo conectar. Reintenta.'
  return `${m.titulo}. ${m.accion}`
}

export function textoEstadoWifi(wifi) {
  switch (wifi) {
    case 'conectado': return 'Conectado'
    case 'conectando': return 'Conectando…'
    case 'desconectado': return 'Guardado, sin conexión'
    case 'sin_credenciales': return 'Sin WiFi guardado'
    default: return 'Desconocido'
  }
}

/** Normaliza un evento hello/status del firmware a un objeto de información del dispositivo. */
export function infoDispositivo(ev) {
  const e = ev || {}
  return {
    nombre: typeof e.name === 'string' && e.name ? e.name : 'ESP32',
    mac: typeof e.mac === 'string' ? e.mac : '',
    firmware: typeof e.fw === 'string' ? e.fw : '',
    wifi: typeof e.wifi === 'string' ? e.wifi : 'sin_credenciales',
    ssid: typeof e.ssid === 'string' ? e.ssid : '',
    ip: typeof e.ip === 'string' ? e.ip : '',
    rssi: Number.isFinite(Number(e.rssi)) ? Number(e.rssi) : 0
  }
}

// ---------------------------------------------------------------------------
// Máquina de estados del asistente (reducer puro)
// ---------------------------------------------------------------------------

export const PASOS = ['conectar', 'saludo', 'redes', 'clave', 'conectando', 'resultado']

/** El estado NUNCA guarda la clave: esa vive solo en el campo de entrada del componente. */
export function estadoInicial() {
  return {
    paso: 'conectar',
    ocupado: false, // hay una operación esperando respuesta del ESP32
    info: null,
    redes: [],
    red: null, // { ssid, seguridad, manual }
    resultado: null, // { ok, ssid, ip, motivo, mensaje }
    error: ''
  }
}

/**
 * Acciones: PUERTO_ABIERTO, SALUDO{ev}, ESCANEANDO, REDES{redes}, ELEGIR_RED{ssid,seguridad,manual},
 * ENVIAR, WIFI_OK{ssid,ip}, WIFI_ERROR{motivo}, OLVIDADO, FALLO{mensaje}, VOLVER, REINTENTAR, REINICIAR.
 */
export function reducir(estado, accion) {
  const a = accion || {}
  switch (a.tipo) {
    case 'PUERTO_ABIERTO':
      return { ...estado, paso: 'saludo', ocupado: true, error: '' }
    case 'SALUDO':
      return { ...estado, paso: 'saludo', ocupado: false, info: infoDispositivo(a.ev), error: '' }
    case 'ESCANEANDO':
      if (estado.paso !== 'saludo' && estado.paso !== 'redes') return estado
      return { ...estado, paso: 'redes', ocupado: true, error: '' }
    case 'REDES':
      if (estado.paso !== 'redes') return estado
      return { ...estado, ocupado: false, redes: ordenarRedes(a.redes), error: '' }
    case 'ELEGIR_RED': {
      if (estado.paso !== 'redes') return estado
      const ssid = typeof a.ssid === 'string' ? a.ssid : ''
      if (!ssid) return { ...estado, error: 'Escribe el nombre de la red WiFi.' }
      if (a.seguridad === 'empresa') return { ...estado, error: AVISO_RED_EMPRESA }
      return { ...estado, paso: 'clave', red: { ssid, seguridad: a.seguridad || 'otra', manual: Boolean(a.manual) }, error: '' }
    }
    case 'ENVIAR':
      if (estado.paso !== 'clave' || !estado.red) return estado
      return { ...estado, paso: 'conectando', ocupado: true, error: '', resultado: null }
    case 'WIFI_OK':
      if (estado.paso !== 'conectando') return estado
      return {
        ...estado, paso: 'resultado', ocupado: false, error: '',
        resultado: { ok: true, ssid: a.ssid || estado.red?.ssid || '', ip: a.ip || '', motivo: '', mensaje: '' }
      }
    case 'WIFI_ERROR':
      if (estado.paso !== 'conectando') return estado
      return {
        ...estado, paso: 'resultado', ocupado: false, error: '',
        resultado: { ok: false, ssid: estado.red?.ssid || '', ip: '', motivo: a.motivo || 'tiempo', mensaje: textoMotivo(a.motivo || 'tiempo') }
      }
    case 'OLVIDADO':
      return {
        ...estado, ocupado: false, error: '',
        info: estado.info ? { ...estado.info, wifi: 'sin_credenciales', ssid: '', ip: '', rssi: 0 } : estado.info
      }
    case 'FALLO': {
      // Error de comunicación: desde la fase de conexión no hay a dónde seguir
      const msg = a.mensaje || 'Algo salió mal.'
      if (estado.paso === 'conectar') return { ...estado, ocupado: false, error: msg }
      if (estado.paso === 'conectando') {
        return { ...estado, paso: 'resultado', ocupado: false, error: '', resultado: { ok: false, ssid: estado.red?.ssid || '', ip: '', motivo: 'tiempo', mensaje: msg } }
      }
      return { ...estado, ocupado: false, error: msg }
    }
    case 'VOLVER': {
      const previo = { redes: 'saludo', clave: 'redes', resultado: 'clave' }[estado.paso]
      if (!previo || estado.ocupado) return estado
      return { ...estado, paso: previo, error: '', resultado: previo === 'clave' ? null : estado.resultado }
    }
    case 'REINTENTAR':
      return estado.paso === 'resultado' ? { ...estado, paso: 'clave', resultado: null, error: '' } : estado
    case 'PUERTO_PERDIDO':
      return { ...estadoInicial(), error: a.mensaje || 'Se perdió la conexión con el ESP32.' }
    case 'REINICIAR':
      return estadoInicial()
    default:
      return estado
  }
}

// ---------------------------------------------------------------------------
// Cliente del protocolo: pide y espera respuestas. Independiente del puerto real.
// ---------------------------------------------------------------------------

export class ErrorProvision extends Error {
  constructor(codigo, mensaje) {
    super(mensaje || textoMotivo(codigo))
    this.name = 'ErrorProvision'
    this.codigo = codigo
  }
}

/**
 * @param {object} opciones
 * @param {(texto:string)=>Promise<void>|void} opciones.enviar  escribe la línea al puerto
 * @param {(cb:(evento:object)=>void)=>()=>void} opciones.suscribir  recibe eventos ya parseados
 * @param {object} [opciones.tiempos] plazos en ms (para pruebas): hello, helloIntentos, scan, wifi, forget
 */
export function crearClienteProvision({ enviar, suscribir, tiempos = {}, setTimer = setTimeout, clearTimer = clearTimeout }) {
  const T = { hello: 2000, helloIntentos: 4, scan: 20000, wifi: 45000, forget: 5000, ...tiempos }
  const esperas = new Set()
  let ultimoEstadoWifi = null
  let activo = true

  const desuscribir = suscribir((ev) => {
    if (!ev || typeof ev.ev !== 'string') return
    for (const e of [...esperas]) e.alEvento(ev)
  })

  /** Espera un evento para el que `filtro(ev)` devuelva algo distinto de undefined; si no, vence el plazo. */
  function esperar(filtro, ms, valorTiempo) {
    const promesa = new Promise((resolve, reject) => {
      const espera = {
        alEvento(ev) {
          let r
          try { r = filtro(ev) } catch (err) { return fin(() => reject(err)) }
          if (r !== undefined) fin(() => resolve(r))
        },
        cancelar() { fin(() => reject(new ErrorProvision('cancelado', 'Operación cancelada.'))) }
      }
      const timer = setTimer(() => fin(() => (valorTiempo === undefined ? reject(new ErrorProvision('sin_respuesta')) : resolve(valorTiempo))), ms)
      function fin(accion) {
        if (!esperas.delete(espera)) return
        clearTimer(timer)
        accion()
      }
      esperas.add(espera)
    })
    promesa.catch(() => {}) // evita «unhandled rejection» si se cancela mientras aún se escribe al puerto
    return promesa
  }

  // Un {"ev":"error"} del firmware corta cualquier espera con su motivo
  function conErrorFirmware(ev) {
    if (ev.ev === 'error') throw new ErrorProvision(ev.motivo || 'comando_invalido')
  }

  async function mandar(cmd, datos) {
    if (!activo) throw new ErrorProvision('cancelado', 'Operación cancelada.')
    await enviar(codificarComando(cmd, datos))
  }

  const esEstado = (ev) => (ev.ev === 'hello' || ev.ev === 'status' ? ev : undefined)

  return {
    /** Saluda al firmware (reintenta porque el ESP32 puede estar reiniciándose al abrir el puerto). */
    async hello() {
      for (let i = 0; i < T.helloIntentos; i++) {
        const espera = esperar((ev) => { conErrorFirmware(ev); return esEstado(ev) }, T.hello, null)
        await mandar('hello')
        const ev = await espera
        if (ev) { ultimoEstadoWifi = ev.wifi; return ev }
      }
      throw new ErrorProvision('sin_respuesta')
    },
    async estado() {
      const espera = esperar((ev) => { conErrorFirmware(ev); return esEstado(ev) }, T.hello)
      await mandar('status')
      return espera
    },
    /** @returns {Promise<Array>} redes ya ordenadas y sin duplicados */
    async escanear() {
      const espera = esperar((ev) => { conErrorFirmware(ev); return ev.ev === 'scan' ? ordenarRedes(ev.redes) : undefined }, T.scan)
      await mandar('scan')
      return espera
    },
    /**
     * Envía el WiFi y espera el resultado.
     * @returns {Promise<{ok:true,ssid,ip,rssi}|{ok:false,motivo,mensaje}>}
     */
    async configurarWifi(ssid, pass, { alProgreso } = {}) {
      const linea = codificarComando('wifi', { ssid, pass }) // valida antes de tocar el puerto
      const espera = esperar((ev) => {
        if (ev.ev === 'error') return { ok: false, motivo: ev.motivo || 'datos_invalidos', mensaje: textoMotivo(ev.motivo || 'datos_invalidos') }
        if (ev.ev === 'wifi') {
          if (ev.estado === 'conectando') { try { alProgreso?.('conectando') } catch { /* ignorar */ } return undefined }
          if (ev.estado === 'conectado') return { ok: true, ssid: ev.ssid || ssid, ip: ev.ip || '', rssi: Number(ev.rssi) || 0 }
          if (ev.estado === 'error') return { ok: false, motivo: ev.motivo || 'tiempo', mensaje: textoMotivo(ev.motivo || 'tiempo') }
        }
        // El firmware también anuncia solo (hello) cuando cambia el estado del WiFi
        if (ev.ev === 'hello' && ev.wifi === 'conectado' && ev.ssid === ssid) return { ok: true, ssid: ev.ssid, ip: ev.ip || '', rssi: Number(ev.rssi) || 0 }
        return undefined
      }, T.wifi, { ok: false, motivo: 'tiempo', mensaje: textoMotivo('tiempo') })
      await enviar(linea)
      return espera
    },
    async olvidar() {
      const espera = esperar((ev) => { conErrorFirmware(ev); return ev.ev === 'forget' ? ev.ok !== false : undefined }, T.forget)
      await mandar('forget')
      return espera
    },
    async configurarServidor(url, token) {
      const espera = esperar((ev) => { conErrorFirmware(ev); return ev.ev === 'server' ? ev.ok !== false : undefined }, T.forget)
      await mandar('server', { url, token })
      return espera
    },
    ultimoEstadoWifi() { return ultimoEstadoWifi },
    /** Cancela esperas pendientes y deja de escuchar. */
    destruir() {
      activo = false
      desuscribir?.()
      for (const e of [...esperas]) e.cancelar()
    }
  }
}
