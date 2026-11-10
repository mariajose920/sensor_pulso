// Fuente de medición (WiFi / USB) · pruebas en Node puro
//   node scripts/test-fuente-medicion.mjs
import {
  FUENTES, esFuenteValida, validarFuente, parsearLineaSerial, crearAgregadorSerial,
  estimarFrecuenciaHz, MENSAJE_USB_NO_SOPORTADO
} from '../src/utils/fuenteMedicion.js'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }
const cerca = (a, b, tol) => typeof a === 'number' && Math.abs(a - b) <= tol

// Ruido determinista (no depende de Math.random)
let semilla = 12345
const azar = () => { semilla = (semilla * 1664525 + 1013904223) % 4294967296; return semilla / 4294967296 }

// Pulso PPG sintético: pico sistólico + onda dícrota
const ppg = (fase) => Math.exp(-Math.pow(fase - 1.2, 2) / 0.18) + 0.35 * Math.exp(-Math.pow(fase - 2.3, 2) / 0.12)

function generarSenal({ bpm = 72, fs = 50, segundos = 12, spo2 = 98, ruido = 8 }) {
  const n = Math.round(segundos * fs)
  const f = bpm / 60
  const R = (110 - spo2) / 25
  const filas = []
  for (let i = 0; i < n; i++) {
    const t = i / fs
    const fase = (t * f * 2 * Math.PI) % (2 * Math.PI)
    const p = ppg(fase)
    const ir = 24500 + 1400 * p + (azar() - 0.5) * ruido
    const rojo = 21000 + 1400 * p * R * (21000 / 24500) + (azar() - 0.5) * ruido
    filas.push({ tMs: Math.round(t * 1000), ir: Math.round(ir), rojo: Math.round(rojo) })
  }
  return filas
}

console.log('Fuente de medición: validación')
prueba('FUENTES tiene wifi y usb', FUENTES.wifi === 'wifi' && FUENTES.usb === 'usb')
prueba('esFuenteValida acepta wifi/usb', esFuenteValida('wifi') && esFuenteValida('usb'))
prueba('esFuenteValida rechaza otros valores', !esFuenteValida('bluetooth') && !esFuenteValida(null) && !esFuenteValida(undefined) && !esFuenteValida(''))
prueba('null = aún no eligió (no válida)', !validarFuente(null).valida)
prueba('wifi válida aunque no haya Web Serial', validarFuente('wifi', { usbSoportado: false }).valida)
const usbNo = validarFuente('usb', { usbSoportado: false })
prueba('usb sin Web Serial: inválida con aviso «USB requiere Chrome o Edge»', !usbNo.valida && usbNo.motivo === MENSAJE_USB_NO_SOPORTADO && usbNo.motivo === 'USB requiere Chrome o Edge')
prueba('usb con Web Serial: válida', validarFuente('usb', { usbSoportado: true }).valida)
prueba('fuente desconocida inválida', !validarFuente('serial').valida)

console.log('Parseo de líneas: formatos heredados (canal 1)')
let m = parsearLineaSerial('84210,70311')
prueba('«ir,red»', m.length === 1 && m[0].canal === 1 && m[0].ir === 84210 && m[0].rojo === 70311 && m[0].tMs === null)
m = parsearLineaSerial('1523,84210,70311')
prueba('«t_ms,ir,red»', m.length === 1 && m[0].tMs === 1523 && m[0].ir === 84210 && m[0].rojo === 70311)
m = parsearLineaSerial('1523,8200,0,72')
prueba('«t_ms,ecg_raw,leads_off,bpm» (sin rojo)', m.length === 1 && m[0].tMs === 1523 && m[0].ir === 8200 && m[0].rojo === null && !m[0].leadsOff && m[0].hardwareBpm === 72)
prueba('leads_off=1 se reconoce', parsearLineaSerial('1523,8200,1,0')[0].leadsOff === true)
prueba('«0,0» (sin dedo) es una muestra con ir=0', parsearLineaSerial('0,0')[0]?.ir === 0)
prueba('CRLF y espacios', parsearLineaSerial('  84210,70311\r')[0]?.ir === 84210)

console.log('Parseo de líneas: multicanal')
m = parsearLineaSerial('CH2,15230,84210,70311')
prueba('«CH<n>,t_ms,ir,red»', m.length === 1 && m[0].canal === 2 && m[0].tMs === 15230 && m[0].ir === 84210 && m[0].rojo === 70311)
prueba('minúsculas «ch5,...»', parsearLineaSerial('ch5,100,5000,4000')[0]?.canal === 5)
m = parsearLineaSerial('T:15230;CH1:84210,70311;CH2:80100,66200;CH3:0,0')
prueba('trama «T:ms;CH1:ir,red;CH2:...» da 3 muestras', m.length === 3 && m[1].canal === 2 && m[1].ir === 80100 && m[1].tMs === 15230 && m[2].ir === 0)
m = parsearLineaSerial('CH1:84210,70311;CH4:1000,900')
prueba('trama sin timestamp', m.length === 2 && m[0].tMs === null && m[1].canal === 4)

console.log('Parseo de líneas: vacías, basura, truncadas')
prueba('vacía', parsearLineaSerial('').length === 0 && parsearLineaSerial('   ').length === 0)
prueba('no-texto (null/número)', parsearLineaSerial(null).length === 0 && parsearLineaSerial(42).length === 0)
prueba('depuración «#...»', parsearLineaSerial('# arrancando').length === 0)
prueba('mensaje de error del firmware', parsearLineaSerial('Error: No se encontro el sensor MAX30102. Revisa las conexiones.').length === 0)
prueba('mezcla texto y números', parsearLineaSerial('ir=84210,red=70311').length === 0)
prueba('NaN / Infinity', parsearLineaSerial('NaN,5').length === 0 && parsearLineaSerial('Infinity,5').length === 0)
prueba('CH sin números', parsearLineaSerial('CH1,abc,def,ghi').length === 0)
prueba('CH truncada (faltan campos)', parsearLineaSerial('CH1,1523,84210').length === 0 && parsearLineaSerial('CH1,').length === 0 && parsearLineaSerial('CH2').length === 0)
prueba('CH con canal fuera de 1..5', parsearLineaSerial('CH0,1,2,3').length === 0 && parsearLineaSerial('CH6,1,2,3').length === 0)
prueba('trama truncada se descarta entera', parsearLineaSerial('T:15230;CH1:84210,70311;CH2:801').length === 0 && parsearLineaSerial('T:15230;CH1:84210,70311;CH').length === 0)
prueba('valor fuera del rango de 18 bits', parsearLineaSerial('CH1,1,999999999,5').length === 0 && parsearLineaSerial('999999,5').length === 0)
prueba('valores negativos', parsearLineaSerial('-5,3').length === 0)
prueba('demasiados campos', parsearLineaSerial('1,2,3,4,5,6').length === 0)
prueba('línea pegada/gigante', parsearLineaSerial('1,2,'.repeat(100)).length === 0)

console.log('Frecuencia de muestreo')
prueba('sin timestamps -> 50 Hz por defecto', estimarFrecuenciaHz([]) === 50)
prueba('timestamps cada 10 ms -> 100 Hz', cerca(estimarFrecuenciaHz(Array.from({ length: 50 }, (_, i) => i * 10)), 100, 0.5))
prueba('timestamps cada 20 ms -> 50 Hz', cerca(estimarFrecuenciaHz(Array.from({ length: 50 }, (_, i) => i * 20)), 50, 0.5))

console.log('Agregador por canal')
for (const fs of [50, 100]) {
  const ag = crearAgregadorSerial()
  for (const f of generarSenal({ bpm: 72, fs, spo2: 98 })) ag.agregarLinea(`CH1,${f.tMs},${f.ir},${f.rojo}`)
  const [c1] = ag.instantanea()
  prueba(`${fs} Hz con timestamps: BPM≈72 (±3) -> ${c1?.bpm}`, c1 && cerca(c1.bpm, 72, 3))
  prueba(`${fs} Hz: SpO2≈98 (±2) con rojo -> ${c1?.spo2}`, c1 && cerca(c1.spo2, 98, 2))
  prueba(`${fs} Hz: frecuencia estimada ≈ ${fs}`, cerca(ag.frecuenciaHz(), fs, 1.5))
  prueba(`${fs} Hz: entrega las muestras nuevas y luego las consume`, c1.ir.length === fs * 12 && ag.instantanea()[0].ir.length === 0)
}

{
  // Sin timestamps (formato «ir,red») a 50 Hz por defecto
  const ag = crearAgregadorSerial()
  for (const f of generarSenal({ bpm: 72, fs: 50 })) ag.agregarLinea(`${f.ir},${f.rojo}`)
  const [c1] = ag.instantanea()
  prueba(`sin timestamps (50 Hz por defecto): BPM≈72 -> ${c1?.bpm}`, c1 && cerca(c1.bpm, 72, 3))
  prueba('sin timestamps: frecuenciaHz = 50', ag.frecuenciaHz() === 50)
}

for (const bpm of [55, 100, 130]) {
  const ag = crearAgregadorSerial()
  for (const f of generarSenal({ bpm, fs: 100 })) ag.agregarLinea(`CH1,${f.tMs},${f.ir},${f.rojo}`)
  const [c1] = ag.instantanea()
  prueba(`otro ritmo ${bpm} BPM -> ${c1?.bpm}`, c1 && cerca(c1.bpm, bpm, 3))
}

{
  // SpO2 con distintos valores reales de saturación
  for (const spo2 of [92, 96]) {
    const ag = crearAgregadorSerial()
    for (const f of generarSenal({ bpm: 70, fs: 100, spo2, ruido: 4 })) ag.agregarLinea(`CH1,${f.tMs},${f.ir},${f.rojo}`)
    const [c] = ag.instantanea()
    prueba(`SpO2 ${spo2} recuperada ±2 -> ${c?.spo2}`, c && cerca(c.spo2, spo2, 2))
  }
}

{
  // Sin rojo (formato MAX30100 de 4 columnas): spo2 null, BPM sí
  const ag = crearAgregadorSerial()
  for (const f of generarSenal({ bpm: 72, fs: 100 })) ag.agregarLinea(`${f.tMs},${f.ir},0,0`)
  const [c1] = ag.instantanea()
  prueba('sin rojo: spo2 null', c1 && c1.spo2 === null)
  prueba('sin rojo: BPM se calcula igual', c1 && cerca(c1.bpm, 72, 3))
}

{
  // Pocas muestras: todo null
  const ag = crearAgregadorSerial()
  for (const f of generarSenal({ bpm: 72, fs: 50, segundos: 1.5 })) ag.agregarLinea(`CH1,${f.tMs},${f.ir},${f.rojo}`)
  const [c1] = ag.instantanea()
  prueba('pocas muestras: bpm null y spo2 null', c1 && c1.bpm === null && c1.spo2 === null)
}

{
  // 3.5 s: BPM aún null (<4 s) pero SpO2 ya se puede (>=3 s)
  const ag = crearAgregadorSerial()
  for (const f of generarSenal({ bpm: 72, fs: 50, segundos: 3.5 })) ag.agregarLinea(`CH1,${f.tMs},${f.ir},${f.rojo}`)
  const [c1] = ag.instantanea()
  prueba('3,5 s: bpm null (insuficiente) y spo2 con valor', c1 && c1.bpm === null && cerca(c1.spo2, 98, 3))
}

{
  // Señal sin pulso (constante + ruido) -> null; nunca se inventan valores
  const ag = crearAgregadorSerial()
  for (let i = 0; i < 1000; i++) ag.agregarLinea(`CH1,${i * 10},${30000 + Math.round((azar() - 0.5) * 6)},${25000 + Math.round((azar() - 0.5) * 6)}`)
  const [c1] = ag.instantanea()
  prueba(`señal plana con ruido: bpm=${c1?.bpm} spo2=${c1?.spo2} (null)`, c1 && c1.bpm === null && c1.spo2 === null)
  const ag2 = crearAgregadorSerial()
  for (let i = 0; i < 1000; i++) ag2.agregarLinea(`CH1,${i * 10},30000,25000`)
  const [c2] = ag2.instantanea()
  prueba('señal totalmente constante: null', c2 && c2.bpm === null && c2.spo2 === null)
}

{
  // Multicanal: 3 sensores con ritmos distintos en la misma trama
  const ag = crearAgregadorSerial()
  const s1 = generarSenal({ bpm: 60, fs: 100 }), s2 = generarSenal({ bpm: 80, fs: 100 }), s3 = generarSenal({ bpm: 100, fs: 100 })
  for (let i = 0; i < s1.length; i++) {
    ag.agregarLinea(`T:${s1[i].tMs};CH1:${s1[i].ir},${s1[i].rojo};CH2:${s2[i].ir},${s2[i].rojo};CH4:${s3[i].ir},${s3[i].rojo}`)
  }
  const cs = ag.instantanea()
  prueba('detecta 3 canales (1, 2 y 4)', cs.length === 3 && cs.map((c) => c.canal).join() === '1,2,4')
  prueba('cada canal con su BPM (60/80/100 ±3)', cerca(cs[0].bpm, 60, 3) && cerca(cs[1].bpm, 80, 3) && cerca(cs[2].bpm, 100, 3))
  prueba('canales independientes en SpO2', cs.every((c) => cerca(c.spo2, 98, 2)))
}

{
  // Tolerancia: basura intercalada no rompe nada
  const ag = crearAgregadorSerial()
  let lineas = 0
  for (const f of generarSenal({ bpm: 72, fs: 100 })) {
    ag.agregarLinea('ruido ???'); ag.agregarLinea(''); ag.agregarLinea(`CH1,${f.tMs},${f.ir}`)
    lineas += ag.agregarLinea(`CH1,${f.tMs},${f.ir},${f.rojo}`)
  }
  const [c1] = ag.instantanea()
  prueba('basura/truncadas intercaladas: BPM sigue ≈72', lineas === 1200 && c1 && cerca(c1.bpm, 72, 3))
}

{
  // Sin dedo («0,0») -> canal detectado, sin valores
  const ag = crearAgregadorSerial()
  for (const f of generarSenal({ bpm: 72, fs: 100 })) ag.agregarLinea(`${f.ir},${f.rojo}`)
  ag.agregarLinea('0,0')
  const [c1] = ag.instantanea()
  prueba('«0,0»: canal detectado pero sinDedo, bpm/spo2 null', c1 && c1.sinDedo && c1.bpm === null && c1.spo2 === null && c1.calidad === 'sin_senal')
}

{
  // Canal que deja de enviar desaparece (sensor no detectado)
  let reloj = 1000
  const ag = crearAgregadorSerial({ ahora: () => reloj })
  ag.agregarLinea('CH1,10,5000,4000')
  prueba('canal visto', ag.canalesDetectados().length === 1)
  reloj += 6000
  prueba('tras 6 s sin datos: sin canales', ag.canalesDetectados().length === 0 && ag.instantanea().length === 0)
}

{
  // Reinicio del ESP32: el reloj retrocede -> la ventana se reinicia
  const ag = crearAgregadorSerial()
  for (const f of generarSenal({ bpm: 72, fs: 100, segundos: 6 })) ag.agregarLinea(`CH1,${f.tMs + 100000},${f.ir},${f.rojo}`)
  ag.agregarLinea('CH1,50,30000,25000')
  const [c1] = ag.instantanea()
  prueba('reloj que retrocede reinicia la ventana (bpm null)', c1 && c1.bpm === null)
}

console.log('Servicio esp32Service: seleccionarFuente (con Web Serial simulado)')
{
  const almacen = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (almacen.has(k) ? almacen.get(k) : null),
    setItem: (k, v) => { almacen.set(k, String(v)) },
    removeItem: (k) => { almacen.delete(k) }
  }
  Object.defineProperty(globalThis, 'navigator', { value: { serial: {} }, configurable: true })
  const fetchLlamadas = []
  globalThis.fetch = async (...a) => { fetchLlamadas.push(a); return { ok: true, json: async () => ({ conectado: true, canales: [], paquete: 3 }) } }

  const srv = await import('../src/services/esp32Service.js')
  const { esp32State, usbState, senalBuffer, seleccionarFuente, fuenteElegida, iniciarSondeoWiFi, detenerSondeoWiFi,
    consultarTelemetriaWiFi, procesarLineaSerial, publicarMuestrasUsb, desconectarUsb } = srv

  prueba('al inicio la fuente es null y fuenteElegida=false', esp32State.fuente === null && fuenteElegida.value === false)
  prueba('USB soportado (simulado)', usbState.soportado === true)

  iniciarSondeoWiFi(50)
  await new Promise((r) => setTimeout(r, 200))
  prueba('con fuente null el sondeo WiFi no arranca', fetchLlamadas.length === 0)
  prueba('consultarTelemetriaWiFi con fuente null no hace nada', (await consultarTelemetriaWiFi()) === null && fetchLlamadas.length === 0)

  prueba('rechaza una fuente inválida', seleccionarFuente('bluetooth') === false && esp32State.fuente === null)

  prueba('seleccionar wifi', seleccionarFuente('wifi') === true && esp32State.fuente === 'wifi' && fuenteElegida.value === true)
  prueba('se persiste en sessionStorage', almacen.get('sensor_pulso_fuente_medicion') === 'wifi')
  await new Promise((r) => setTimeout(r, 200))
  prueba('al elegir wifi arranca el sondeo que MedicionView había pedido', fetchLlamadas.length > 0 && esp32State.paquete === 3)

  prueba('cambiar a usb: fuente usb, dispositivo «ESP32 (USB)»', seleccionarFuente('usb') === true && esp32State.fuente === 'usb' && esp32State.dispositivo === 'ESP32 (USB)')
  prueba('al cambiar se limpian canales y paquete', esp32State.canales.length === 0 && esp32State.paquete === 0 && esp32State.conectado === false)
  const antes = fetchLlamadas.length
  await new Promise((r) => setTimeout(r, 200))
  prueba('con usb ya no se sondea WiFi', fetchLlamadas.length === antes && (await consultarTelemetriaWiFi()) === null)
  prueba('persistido usb', almacen.get('sensor_pulso_fuente_medicion') === 'usb')

  // Llenar esp32State desde líneas seriales
  const senal = generarSenal({ bpm: 72, fs: 100, segundos: 12 })
  for (const f of senal) procesarLineaSerial(`CH1,${f.tMs},${f.ir},${f.rojo}`)
  procesarLineaSerial('basura')
  const inst = publicarMuestrasUsb()
  prueba('esp32State.canales se llena desde USB', esp32State.canales.length === 1 && esp32State.canales[0].canal === 1)
  prueba('BPM y SpO2 reales en esp32State', cerca(esp32State.canales[0].bpm, 72, 3) && cerca(esp32State.canales[0].spo2, 98, 2))
  prueba('frecuenciaHz ≈ 100 y paquete incrementado', cerca(esp32State.frecuenciaHz, 100, 2) && esp32State.paquete === 1)
  prueba('senalBuffer recibe las muestras IR/rojo del canal 1', senalBuffer.ir.length === 500 && senalBuffer.rojo.length === 500)
  prueba('ultimoContacto definido y calidad presente', !!esp32State.ultimoContacto && typeof esp32State.canales[0].calidad === 'string' && Array.isArray(inst))
  prueba('líneas inválidas contadas', usbState.lineasInvalidas === 1)

  // desconexión
  esp32State.conectado = true
  await desconectarUsb()
  prueba('desconectarUsb -> conectado=false y sin canales', esp32State.conectado === false && esp32State.canales.length === 0 && usbState.conectado === false)

  prueba('volver a wifi limpia y vuelve a sondear', seleccionarFuente('wifi') && esp32State.fuente === 'wifi' && esp32State.canales.length === 0)
  prueba('con wifi las líneas seriales se ignoran', procesarLineaSerial('CH1,1,5000,4000') === 0)
  prueba('seleccionar la misma fuente no hace nada', seleccionarFuente('wifi') === true)
  detenerSondeoWiFi()
  seleccionarFuente('usb') // detiene cualquier temporizador

  // Navegador sin Web Serial
  Object.defineProperty(globalThis, 'navigator', { value: {}, configurable: true })
  const { conectarUsb } = srv
  seleccionarFuente('wifi')
  prueba('sin Web Serial: seleccionar usb falla con aviso', seleccionarFuente('usb') === false && esp32State.fuente === 'wifi' && usbState.error === 'USB requiere Chrome o Edge')
  prueba('sin Web Serial: conectarUsb devuelve false', (await conectarUsb()) === false)
  seleccionarFuente('wifi')
}

console.log(`\n${ok} correctas, ${mal} con fallo`)
if (mal) process.exit(1)
process.exit(0)
