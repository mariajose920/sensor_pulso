import { ref } from 'vue'

/**
 * Composable para conectar y recibir datos en tiempo real de un sensor fisico
 * (ESP32 con MAX30100 o MAX30102) a traves de la Web Serial API (USB/COM).
 *
 * Compatible con:
 * - Protocolo 4 columnas: "t_ms, ecg_raw, leads_off, bpm" (MAX30100)
 * - Protocolo 2 columnas: "ir, red" (MAX30102 crudo)
 * - Protocolo 3 columnas: "t_ms, ir, red"
 */
export function useSerialSensor() {
  const isSupported = typeof navigator !== 'undefined' && 'serial' in navigator
  const isConnected = ref(false)
  const isReading = ref(false)
  const portInfo = ref('')
  const errorMessage = ref('')
  const rawLine = ref('')

  let port = null
  let reader = null
  let keepReading = false

  const listeners = new Set()

  function subscribe(callback) {
    listeners.add(callback)
    return () => listeners.delete(callback)
  }

  function emitSample(sample) {
    for (const listener of listeners) {
      listener(sample)
    }
  }

  async function connect(baudRate = 115200) {
    if (!isSupported) {
      errorMessage.value = 'Web Serial no es compatible con este navegador (usa Chrome o Edge).'
      return false
    }

    try {
      errorMessage.value = ''
      port = await navigator.serial.requestPort()
      await port.open({ baudRate })
      isConnected.value = true

      const info = port.getInfo?.() || {}
      portInfo.value = info.usbVendorId ? `USB: 0x${info.usbVendorId.toString(16)}` : 'Puerto Serie Abierto'

      startReading()
      return true
    } catch (err) {
      if (err.name !== 'NotFoundError') {
        errorMessage.value = `Error al abrir puerto: ${err.message}`
      }
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
    const t0 = performance.now()

    try {
      while (keepReading) {
        const { value, done } = await reader.read()
        if (done) break
        if (value) {
          buffer += value
          const lines = buffer.split(/\r?\n/)
          buffer = lines.pop()

          for (const line of lines) {
            const trimmed = line.trim()
            if (!trimmed || trimmed.startsWith('#')) continue // Ignorar lineas de depuracion '#...'
            rawLine.value = trimmed

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
      errorMessage.value = `Error en lectura: ${err.message}`
    } finally {
      isReading.value = false
    }
  }

  async function disconnect() {
    keepReading = false
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
    connect,
    disconnect,
    subscribe
  }
}
