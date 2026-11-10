// UN SOLO pulso para toda la app, igual por WiFi y por USB (esp32Service: acumulador por canal)
//   node scripts/test-pulso-unico.mjs
// El BPM del canal (`bpm`) es el que calcula la app con los mismos picos que se dibujan; el de la placa queda en `bpmPlaca`.
import { generarPpg } from './lib-ppg-sintetico.mjs'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }

const almacen = new Map()
globalThis.sessionStorage = {
  getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
  setItem: (k, v) => { almacen.set(k, String(v)) },
  removeItem: (k) => { almacen.delete(k) }
}
Object.defineProperty(globalThis, 'navigator', { value: { serial: {} }, configurable: true })
// Reloj falso: el servicio recalcula una vez por segundo de reloj
let reloj = Date.parse('2026-11-10T10:00:00.000Z')
Date.now = () => reloj
const FECHA = (ms) => new Date(ms).toISOString()

let paqueteWifi = null
globalThis.fetch = async () => ({ ok: true, json: async () => paqueteWifi || { conectado: false, canales: [] } })

const srv = await import('../src/services/esp32Service.js')
const { esp32State, seleccionarFuente, procesarLineaSerial, publicarMuestrasUsb, consultarTelemetriaWiFi, detenerSondeoWiFi } = srv

const BPM_PLACA_ERRONEO = 123 // lo que "dice" la placa: no debe llegar a `bpm`

/** Señal a hz, en lotes de 1/5 s (USB) o 1 s (WiFi); devuelve el estado del canal 1 tras cada lote. */
function lineasUsb(x, hz, t0, bpmPlaca) {
  return x.map((v, i) => {
    const ir = Math.round(v)
    const rojo = Math.round(ir * 0.85)
    return `CH1,${t0 + Math.round((i * 1000) / hz)},${ir},${rojo},${bpmPlaca.toFixed(1)},97.5,1`
  })
}

console.log('USB: el pulso es el de la app, no el de la placa')
for (const hz of [25, 50]) {
  seleccionarFuente('usb')
  const bpm = 78
  const { x } = generarPpg({ bpm, hz, seg: 20, ruido: 0.05, derivaAmp: 0.8, semilla: 5, dc: 24500, amp: 1500 })
  const lineas = lineasUsb(x, hz, 5000, BPM_PLACA_ERRONEO)
  const porLote = hz / 5
  const serie = []
  for (let i = 0; i < lineas.length; i += porLote) {
    for (const l of lineas.slice(i, i + porLote)) procesarLineaSerial(l)
    reloj += 200
    publicarMuestrasUsb()
    const c = esp32State.canales[0]
    if (c) serie.push(c)
  }
  const c = esp32State.canales[0]
  prueba(`${hz} Hz: bpm de la app ${c.bpm} ≈ ${bpm} (no ${BPM_PLACA_ERRONEO})`, c.bpm !== null && Math.abs(c.bpm - bpm) <= 2)
  prueba(`${hz} Hz: bpmPlaca conserva lo que mandó la placa (${c.bpmPlaca}) y confianza = ${c.confianza}`, c.bpmPlaca === BPM_PLACA_ERRONEO && ['alta', 'media'].includes(c.confianza))
  const mostrados = serie.map((s) => s.bpm).filter((v) => v !== null)
  const ultimos = mostrados.slice(-25)
  const saltoMax = Math.max(...ultimos.slice(1).map((v, i) => Math.abs(v - ultimos[i])))
  prueba(`${hz} Hz: el valor mostrado no salta (máx. ${saltoMax} BPM entre lotes de 0,2 s)`, saltoMax <= 3)
  prueba(`${hz} Hz: antes de reunir ~3 s no se muestra un número dudoso`, serie.slice(0, 5).every((s) => s.bpm === null))
  // sin dedo
  for (let k = 0; k < 15; k++) procesarLineaSerial(`CH1,${5000 + 30000 + k * 20},0,0,0,0,0`)
  reloj += 200
  publicarMuestrasUsb()
  const sd = esp32State.canales[0]
  prueba(`${hz} Hz: sin dedo → bpm null y confianza baja (se reinicia el acumulador)`, sd.calidad === 'sin_dedo' && sd.bpm === null && sd.confianza === 'baja')
  seleccionarFuente('wifi')
  detenerSondeoWiFi()
}

console.log('WiFi: mismo pulso con la misma señal')
{
  seleccionarFuente('wifi')
  detenerSondeoWiFi()
  const hz = 25, bpm = 66
  const { x } = generarPpg({ bpm, hz, seg: 20, ruido: 0.05, derivaAmp: 0.8, semilla: 5, dc: 24500, amp: 1500 })
  let paquete = 100
  for (let s = 0; s < 20; s++) {
    reloj += 1000
    paquete++
    const ir = x.slice(s * hz, (s + 1) * hz).map((v) => Math.round(v))
    paqueteWifi = {
      conectado: true, ultimoContacto: FECHA(reloj), dispositivo: 'ESP32', ip: '1.2.3.4', rssi: -55, paquete, frecuenciaHz: hz,
      canales: [{ canal: 1, activo: true, bpm: BPM_PLACA_ERRONEO, spo2: 97.2, calidad: 'buena', ir, rojo: ir.map((v) => Math.round(v * 0.85)) }]
    }
    await consultarTelemetriaWiFi()
  }
  const c = esp32State.canales[0]
  prueba(`bpm de la app ${c?.bpm} ≈ ${bpm}`, c && c.bpm !== null && Math.abs(c.bpm - bpm) <= 2)
  prueba('bpmPlaca = lo que mandó la placa y la SpO₂ sigue siendo la de la placa', c && c.bpmPlaca === BPM_PLACA_ERRONEO && c.spo2 === 97.2)
  prueba(`confianza ${c?.confianza}`, c && ['alta', 'media'].includes(c.confianza))

  // la placa deja de ver dedo: sin lectura
  reloj += 1000
  paqueteWifi = { ...paqueteWifi, ultimoContacto: FECHA(reloj), paquete: paquete + 1, canales: [{ canal: 1, activo: true, bpm: 0, spo2: 0, calidad: 'sin_dedo', ir: [], rojo: [] }] }
  await consultarTelemetriaWiFi()
  const sd = esp32State.canales[0]
  prueba('sin dedo por WiFi → bpm null', sd && sd.bpm === null && sd.bpmPlaca === null)

  // ruido muy alto: sin lectura, no un número dudoso
  seleccionarFuente('usb'); seleccionarFuente('wifi'); detenerSondeoWiFi()
  const ruido = generarPpg({ bpm: 70, hz, seg: 20, ruido: 0.9, semilla: 8, dc: 24500, amp: 1500 }).x
  for (let s = 0; s < 20; s++) {
    reloj += 1000; paquete++
    const ir = ruido.slice(s * hz, (s + 1) * hz).map((v) => Math.round(v))
    paqueteWifi = { conectado: true, ultimoContacto: FECHA(reloj), paquete, frecuenciaHz: hz, canales: [{ canal: 1, activo: true, bpm: 70, spo2: 97, calidad: 'buena', ir }] }
    await consultarTelemetriaWiFi()
  }
  const r = esp32State.canales[0]
  prueba(`ruido muy alto: sin lectura (bpm ${r?.bpm}, confianza ${r?.confianza}), la placa sigue informada (${r?.bpmPlaca})`, r && r.bpm === null && r.confianza === 'baja' && r.bpmPlaca === 70)
}

seleccionarFuente('usb'); detenerSondeoWiFi()
console.log(`\n${ok} bien, ${mal} mal`)
process.exit(mal ? 1 : 0)
