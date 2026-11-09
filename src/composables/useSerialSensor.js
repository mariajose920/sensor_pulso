import { ref } from 'vue'

/**
 * Composable para conectar y recibir datos en tiempo real de un sensor fisico
 * (ESP32 con MAX30100 o MAX30102) a traves de la Web Serial API (USB/COM).
 *
 * Compatible con:
 * - Protocolo 4 columnas: "t_ms, ecg_raw, leads_off, bpm" (MAX30100)
 * - Protocolo 2 columnas: "ir, red" (MAX30102 crudo)
 * - Protocolo 3 columnas: "t_ms, ir, red"
 * - Multicanal (ver src/utils/fuenteMedicion.js): "CH<n>,t_ms,ir,red" y "CH1:ir,red;CH2:ir,red"
 *
 * Ademas de las muestras (subscribe), entrega cada linea de texto cruda (subscribeLinea)
 * para el parseo multicanal, y avisa cuando el puerto se pierde sin que el usuario lo
 * haya pedido (cable desenchufado): onDesconexion.
 */
// Chips USB-serie de las placas ESP32 más comunes (para identificar el puerto sin pedir que lo elijan a ciegas)
export const FILTROS_PUERTO_ESP32 = [
  { usbVendorId: 0x10c4 }, // Silicon Labs CP210x
  { usbVendorId: 0x1a86 }, // WCH CH340 / CH9102
  { usbVendorId: 0x0403 }, // FTDI
  { usbVendorId: 0x303a }  // Espressif (USB nativo)
]

// Prefijo de los mensajes del protocolo de configuración (ver src/utils/provisionWifi.js)
const PREFIJO_PROTOCOLO = '@SP '

export function esPuertoEsp32(info) {
  return FILTROS_PUERTO_ESP32.some(f => f.usbVendorId === info?.usbVendorId)
}

export function useSerialSensor() {
  const isSupported = typeof navigator !== 'undefined' && 'serial' in navigator
  const isConnected = ref(false)
  const isReading = ref(false)
  const portInfo = ref('')
  const errorMessage = ref('')
  const rawLine = ref('')
  const autoDetectado = ref(false)

  let port = null
  let reader = null
  let keepReading = false
  let perdidaNotificada = false

  const listeners = new Set()
  const lineListeners = new Set()
  const disconnectListeners = new Set()

  function subscribe(callback) {
    listeners.add(callback)
    return () => listeners.delete(callback)
  }

  // Cada linea de texto recibida (sin parsear), para el parseo multicanal
  function subscribeLinea(callback) {
    lineListeners.add(callback)
    return () => lineListeners.delete(callback)
  }

  // Se invoca cuando el puerto se pierde sin llamar a disconnect() (p. ej. se desenchufa el USB)
  function onDesconexion(callback) {
    disconnectListeners.add(callback)
    return () => disconnectListeners.delete(callback)
  }

  function emitSample(sample) {
    for (const listener of listeners) {
      listener(sample)
    }
  }

  function onSerialDisconnect(ev) {
    if (port && ev && ev.target === port) manejarPerdida('El cable USB se desconectó.')
  }

  async function manejarPerdida(mensaje) {
    if (perdidaNotificada || !keepReading) return
    perdidaNotificada = true
    keepReading = false
    errorMessage.value = mensaje
    isConnected.value = false
    isReading.value = false
    portInfo.value = ''
    try { await reader?.cancel() } catch { /* el puerto ya no existe */ }
    try { reader?.releaseLock() } catch { /* idem */ }
    reader = null
    try { await port?.close() } catch { /* idem */ }
    port = null
    navigator.serial?.removeEventListener?.('disconnect', onSerialDisconnect)
    for (const cb of disconnectListeners) {
      try { cb(mensaje) } catch { /* un oyente roto no debe afectar al resto */ }
    }
  }

  // Por defecto el puerto se identifica solo: si ya hay UN puerto autorizado de una placa ESP32 se usa sin preguntar;
  // si no, el navegador muestra solo los puertos que parecen un ESP32. Con `manual` muestra todos.
  async function elegirPuerto(manual) {
    autoDetectado.value = false
    if (!manual) {
      try {
        const previos = (await navigator.serial.getPorts?.()) || []
        const candidatos = previos.filter(p => esPuertoEsp32(p.getInfo?.()))
        if (candidatos.length === 1) {
          autoDetectado.value = true
          return candidatos[0]
        }
      } catch { /* sin puertos previos: se pide uno */ }
      return navigator.serial.requestPort({ filters: FILTROS_PUERTO_ESP32 })
    }
    return navigator.serial.requestPort()
  }

  async function connect(baudRate = 115200, { manual = false } = {}) {
    if (!isSupported) {
      errorMessage.value = 'Web Serial no es compatible con este navegador (usa Chrome o Edge).'
      return false
    }

    try {
      errorMessage.value = ''
      perdidaNotificada = false
      port = await elegirPuerto(manual)
      await port.open({ baudRate })
      isConnected.value = true
      navigator.serial.addEventListener?.('disconnect', onSerialDisconnect)

      const info = port.getInfo?.() || {}
      portInfo.value = info.usbVendorId ? `USB: 0x${info.usbVendorId.toString(16)}` : 'Puerto Serie Abierto'

      startReading()
      return true
    } catch (err) {
      if (err.name === 'InvalidStateError' || err.name === 'NetworkError') {
        errorMessage.value = 'No se pudo abrir el puerto: está en uso por otro programa (cierra el Monitor Serie del Arduino IDE) o el cable no es de datos.'
      } else if (err.name !== 'NotFoundError') {
        errorMessage.value = `Error al abrir puerto: ${err.message}`
      }
      port = null
      isConnected.value = false
      return false
    }
  }

  async function startReading() {
    if (!port || !port.readable) return
    keepReading = true
    isReading.value = true

    const textDecoder = new TextDecoderStream()
    port.readable.pipeTo(textDecoder.writable).catch(() => {})
    reader = textDecoder.readable.getReader()

    let buffer = ''
    let descartarFragmento = true // la 1.ª linea puede llegar cortada: se descarta
    const t0 = performance.now()

    try {
      while (keepReading) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          buffer += value
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop()

          if (descartarFragmento && lines.length > 0) {
            // Un mensaje del protocolo de configuración ("@SP ...") completo se conserva
            if (!lines[0].trimStart().startsWith(PREFIJO_PROTOCOLO)) lines.shift()
            descartarFragmento = false
          }

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue // Ignorar lineas de depuracion '#...'
            rawLine.value = trimmed
            for (const cb of lineListeners) {
              try { cb(trimmed) } catch { /* un oyente roto no debe cortar la lectura */ }
            }
            // Las lineas multicanal (CH... / T:...) las procesa subscribeLinea; no son muestras heredadas.
            // Los mensajes "@SP ..." (configuración del WiFi) tampoco son muestras: solo van a subscribeLinea.
            if (/^(?:T:|CH\d)/i.test(trimmed) || trimmed.startsWith(PREFIJO_PROTOCOLO)) continue

            const parts = trimmed.split(/[,;\s]+/).map(Number).filter(n => !isNaN(n))
            if (parts.length > 0) {
              let tMs = performance.now() - t0
              let signalVal = parts[0]
              let leadsOff = false
              let hardwareBpm = 0

              if (parts.length >= 4) {
                // Protocolo: t_ms, ecg_raw/ppg, leads_off, bpm
                tMs = parts[0]
                signalVal = parts[1]
                leadsOff = parts[2] === 1
                hardwareBpm = parts[3]
              } else if (parts.length === 3) {
                // Protocolo: t_ms, ir, red
                tMs = parts[0]
                signalVal = parts[1]
              } else if (parts.length === 2) {
                // Protocolo: ir, red
                signalVal = parts[0]
              }

              emitSample({
                tMs,
                value: signalVal,
                leadsOff,
                hardwareBpm,
                isPhysical: true
              })
            }
          }
        }
      }
    } catch (err) {
      if (keepReading) errorMessage.value = `Error en lectura: ${err.message}`
    } finally {
      isReading.value = false
      // Si el bucle termino sin que el usuario lo pidiera, el dispositivo se perdio
      if (keepReading) manejarPerdida(errorMessage.value || 'Se perdió la conexión con el puerto USB.')
    }
  }

  /** Escribe texto (UTF-8) al puerto abierto. Lanza Error en español si no se puede. */
  async function write(texto) {
    if (!port || !port.writable) throw new Error('El puerto USB no está abierto.')
    const writer = port.writable.getWriter()
    try {
      await writer.write(new TextEncoder().encode(texto))
    } finally {
      try { writer.releaseLock() } catch { /* ya liberado */ }
    }
  }

  async function disconnect() {
    keepReading = false
    navigator.serial?.removeEventListener?.('disconnect', onSerialDisconnect)
    try {
      if (reader) {
        await reader.cancel()
        reader.releaseLock()
        reader = null
      }
      if (port) {
        await port.close()
        port = null
      }
    } catch (err) {
      // Ignorar errores al cerrar
    }
    isConnected.value = false
    isReading.value = false
    portInfo.value = ''
  }

  return {
    isSupported,
    isConnected,
    isReading,
    portInfo,
    errorMessage,
    rawLine,
    autoDetectado,
    connect,
    disconnect,
    write,
    subscribe,
    subscribeLinea,
    onDesconexion
  }
}
