// USB con los datos de la placa (formato CH1,t,ir,rojo,bpm,spo2,dedo) y frecuencia real de la señal por WiFi
//   node scripts/test-usb-placa-y-frecuencia.mjs
import { readFileSync } from 'node:fs'
import { parsearLineaSerial, crearAgregadorSerial } from '../src/utils/fuenteMedicion.js'
import { crearEstimadorFrecuencia, elegirFrecuencia, frecuenciaValida } from '../src/utils/estimarFrecuencia.js'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }
const cerca = (a, b, tol) => typeof a === 'number' && Math.abs(a - b) <= tol
const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

// Onda que envía la placa: ya filtrada, hacia arriba en cada latido, centrada en 24500, a 25 muestras por segundo
function lineasDePlaca({ bpm = 72, segundos = 12, hz = 25, spo2 = 97.5, dedo = true, t0 = 5000 } = {}) {
  const lineas = []
  const n = Math.round(segundos * hz)
  for (let i = 0; i < n; i++) {
    const t = t0 + Math.round((i * 1000) / hz)
    if (!dedo) { lineas.push(`CH1,${t},0,0,0,0,0`); continue }
    const fase = ((i / hz) * (bpm / 60)) % 1
    const ir = Math.round(24500 + 1500 * Math.exp(-Math.pow((fase - 0.15) / 0.07, 2)) - 300 * fase)
    const rojo = Math.round(21000 + 0.75 * (ir - 24500))
    lineas.push(`CH1,${t},${ir},${rojo},${bpm.toFixed(1)},${spo2.toFixed(1)},1`)
  }
  return lineas
}

console.log('Formato de la placa (7 campos)')
const p = parsearLineaSerial('CH1,15230,24480,20990,72.0,97.5,1')
prueba('se entiende la línea con bpm, spo2 y dedo', p.length === 1 && p[0].canal === 1 && p[0].tMs === 15230 && p[0].ir === 24480 && p[0].hardwareBpm === 72 && p[0].hardwareSpo2 === 97.5 && p[0].dePlaca === true && p[0].leadsOff === false)
const sd = parsearLineaSerial('CH1,15230,0,0,0,0,0')
prueba('sin dedo (ir = 0, dedo = 0) se entiende', sd.length === 1 && sd[0].ir === 0 && sd[0].leadsOff === true)
prueba('el formato de 4 campos sigue funcionando', parsearLineaSerial('CH2,15230,84210,70311').length === 1)
prueba('con 5 o 6 campos se descarta (probable línea cortada)', parsearLineaSerial('CH1,15230,24480,20990,72.0').length === 0 && parsearLineaSerial('CH1,15230,24480,20990,72.0,97.5').length === 0)
prueba('valores fuera de rango se descartan', parsearLineaSerial('CH1,1,24480,20990,500,97.5,1').length === 0 && parsearLineaSerial('CH1,1,24480,20990,72,140,1').length === 0 && parsearLineaSerial('CH1,1,24480,20990,72,97,2').length === 0)
prueba('los textos de registro de la placa se ignoran', parsearLineaSerial('[Sensor] Pulso: 2048 | Dedo: NO | BPM: 0.0 | SpO2: 98.0%').length === 0)

console.log('Agregador con los valores de la placa')
{
  const ag = crearAgregadorSerial({ intervaloCalculoMs: 0 })
  for (const l of lineasDePlaca({ bpm: 72, spo2: 97.5 })) ag.agregarLinea(l)
  const c = ag.instantanea()[0]
  prueba('usa el pulso de la placa (el mismo que por WiFi)', c && c.bpm === 72 && c.bpmOrigen === 'dispositivo')
  prueba('usa la SpO2 de la placa y no recalcula una inventada con el rojo del trazo', c && c.spo2 === 97.5)
  prueba('la frecuencia sale de los tiempos de la placa: 25 Hz', c && cerca(c.frecuenciaHz, 25, 0.6))
  prueba('trae las muestras para graficar', c && c.ir.length > 200 && c.rojo.length === c.ir.length)
}
{
  const ag = crearAgregadorSerial({ intervaloCalculoMs: 0 })
  for (const l of lineasDePlaca({ bpm: 72, spo2: 0 })) ag.agregarLinea(l)
  const c = ag.instantanea()[0]
  prueba('SpO2 = 0 en la placa → sin lectura (null), no un número', c && c.spo2 === null)
}
{
  const ag = crearAgregadorSerial({ intervaloCalculoMs: 0 })
  for (const l of lineasDePlaca({ dedo: false, segundos: 3 })) ag.agregarLinea(l)
  const c = ag.instantanea()[0]
  prueba('sin dedo: el canal existe (sensor detectado) pero sin pulso ni SpO2', c && c.canal === 1 && c.sinDedo === true && c.bpm === null && c.spo2 === null)
}

console.log('Servicio: lo que ve la pantalla con USB')
{
  const almacen = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => { almacen.set(k, String(v)) },
    removeItem: (k) => { almacen.delete(k) }
  }
  Object.defineProperty(globalThis, 'navigator', { value: { serial: {} }, configurable: true })
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ conectado: false, canales: [] }) })
  const srv = await import('../src/services/esp32Service.js')
  const { esp32State, seleccionarFuente, procesarLineaSerial, publicarMuestrasUsb, detenerSondeoWiFi } = srv
  seleccionarFuente('usb')
  for (const l of lineasDePlaca({ bpm: 80, spo2: 96.5, segundos: 10 })) procesarLineaSerial(l)
  publicarMuestrasUsb()
  const c = esp32State.canales[0]
  prueba('con la placa conectada hay un canal con pulso y SpO2 como por WiFi', c && c.bpm === 80 && c.spo2 === 96.5 && c.activo === true)
  prueba('la frecuencia que usa la pantalla es 25 Hz (no 50)', cerca(esp32State.frecuenciaHz, 25, 0.6))
  for (const l of lineasDePlaca({ dedo: false, segundos: 2, t0: 20000 })) procesarLineaSerial(l)
  publicarMuestrasUsb()
  prueba('sin dedo la calidad es «sin_dedo» (la pantalla avisa que apoye el dedo)', esp32State.canales[0] && esp32State.canales[0].calidad === 'sin_dedo')
  detenerSettings()
  function detenerSettings() { detenerSondeoWiFi(); seleccionarFuente('wifi'); detenerSondeoWiFi() }
}

console.log('Frecuencia de la señal por WiFi')
{
  const e = crearEstimadorFrecuencia()
  prueba('sin datos suficientes no estima', e.estimar() === null)
  const base = Date.parse('2026-11-09T20:00:00.000Z')
  for (let i = 0; i < 10; i++) e.agregar({ paquete: 100 + i, ultimoContacto: new Date(base + i * 1000 + (i % 3) * 40).toISOString(), muestras: 25 })
  prueba('25 muestras por segundo → 25 Hz', cerca(e.estimar(), 25, 1.5))
  e.agregar({ paquete: 111, ultimoContacto: new Date(base + 11000).toISOString(), muestras: 25 }) // se saltó el 110
  prueba('si se pierde un paquete se empieza de nuevo (no mezcla huecos)', e.estimar() === null)
  const f = crearEstimadorFrecuencia()
  for (let i = 0; i < 10; i++) f.agregar({ paquete: 1 + i, ultimoContacto: new Date(base + i * 500).toISOString(), muestras: 25 })
  prueba('25 muestras cada 0,5 s → 50 Hz (el simulador)', cerca(f.estimar(), 50, 1.5))
  f.agregar({ paquete: 11, ultimoContacto: new Date(base + 4500).toISOString(), muestras: 25 }) // fecha anterior: se ignora
  prueba('un paquete repetido o más viejo se ignora', cerca(f.estimar(), 50, 1.5))
  prueba('la que informa la placa manda sobre la estimada', elegirFrecuencia(25, 50, 50) === 25)
  prueba('sin la de la placa se usa la estimada', elegirFrecuencia(undefined, 25, 50) === 25)
  prueba('sin ninguna se mantiene la actual', elegirFrecuencia(null, null, 50) === 50)
  prueba('una frecuencia absurda no se acepta', !frecuenciaValida(0) && !frecuenciaValida(5000) && !frecuenciaValida(NaN) && frecuenciaValida(25))
}

console.log('Firmware, API y pantalla')
const ino = leer('../firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino')
prueba('el firmware envía por USB una línea CH1 con tiempo, ir, rojo, pulso, SpO2 y dedo', ino.includes('"CH1,%lu,%u,%u,%.1f,%.1f,1\\n"') && ino.includes('"CH1,%lu,0,0,0,0,0\\n"'))
prueba('la línea USB se escribe con el mutex (no se mezcla con @SP)', /void emitirMuestraUsb[\s\S]*?xSemaphoreTake\(serMux[\s\S]*?Serial\.write[\s\S]*?xSemaphoreGive\(serMux\)/.test(ino))
prueba('se emite una línea por muestra, esté o no lleno el búfer del WiFi', /emitirMuestraUsb\(millis\(\), irMuestra, rojoMuestra\)/.test(ino))
prueba('el paquete WiFi informa su frecuencia real (25 Hz)', ino.includes('"\\"frecuencia_hz\\":" + String(FRECUENCIA_MUESTREO_HZ)') && /FRECUENCIA_MUESTREO_HZ = 25/.test(ino))
prueba('el búfer guarda hasta 4 s: no se pierden muestras mientras un envío tarda', /SAMPLES_PER_BLOCK = 100/.test(ino) && ino.includes('MUESTRAS_RELLENO = 25'))
prueba('la API devuelve la frecuencia informada', /frecuenciaHz: ultimaTelemetria\.frecuenciaHz \|\| null/.test(leer('../api/esp32/telemetria.js')))
const servicio = leer('../src/services/esp32Service.js')
prueba('la pantalla usa esa frecuencia (informada o estimada) con WiFi', servicio.includes('elegirFrecuencia(data.frecuenciaHz, estimadorFrecuenciaWifi.estimar(), esp32State.frecuenciaHz)'))

console.log(`\n${ok} bien, ${mal} mal`)
process.exit(mal ? 1 : 0)
