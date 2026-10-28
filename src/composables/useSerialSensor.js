import { ref } from 'vue'

/**
 * Composable para conectar y recibir datos en tiempo real de un sensor físico
 * (ESP32 / MAX30102) a través de la Web Serial API (USB/COM).
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
    const readableStreamClosed = port.readable.pipeTo(textDecoder.writable)
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
            if (!trimmed) continue
            rawLine.value = trimmed

            const parts = trimmed.split(/[,;\s]+/).map(Number).filter(n => !isNaN(n))
            if (parts.length > 0) {
              const tMs = performance.now() - t0
              let signalVal = parts[0]
              let ir = parts[0]
              let red = parts.length > 1 ? parts[1] : parts[0]

              if (parts.length >= 3) {
                ir = parts[1]
                red = parts[2]
                signalVal = ir
              }

              emitSample({
                tMs,
                value: signalVal,
                irRaw: ir,
                redRaw: red,
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
    if (reader) {
      try {
        await reader.cancel()
      } catch (e) {
        // Ignorar
      }
      reader = null
    }

    if (port) {
      try {
        await port.close()
      } catch (e) {
        // Ignorar
      }
      port = null
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
