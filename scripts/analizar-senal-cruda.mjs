// Análisis de una captura de la señal CRUDA del sensor (modo diagnóstico del firmware)
//   node scripts/analizar-senal-cruda.mjs captura.csv
// El CSV tiene la forma:  n,ms,ir,rojo   (una fila por lectura del sensor a 100 Hz)
// Dice, con números, por qué el pulso y la SpO2 varían: nivel de luz, amplitud del pulso, ruido, deriva, pérdida de
// muestras, estabilidad del pulso y de la SpO2 (con el método actual del firmware y con una versión más robusta),
// y cómo equilibrar los LED.
import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { filtrarSenalPpg } from '../src/utils/filtroPpg.js'
import { calcularMetricasCanal } from '../src/utils/metricasCanal.js'

export const HZ = 100
const UMBRAL_DEDO = 7000 // el mismo que usa el firmware

const media = (v) => v.reduce((s, x) => s + x, 0) / (v.length || 1)
const rms = (v) => Math.sqrt(media(v.map((x) => x * x)))
const sd = (v) => { const m = media(v); return Math.sqrt(media(v.map((x) => (x - m) ** 2))) }
const mediana = (v) => { const o = [...v].sort((a, b) => a - b); const m = Math.floor(o.length / 2); return o.length ? (o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2) : null }
const r1 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 10) / 10)
const r2 = (x) => (x === null || x === undefined || !Number.isFinite(x) ? null : Math.round(x * 100) / 100)

/** Lee un CSV n,ms,ir,rojo (con o sin cabecera) o las líneas «RAW,n,ms,ir,rojo» tal como salen del puerto. */
export function leerCaptura(texto) {
  const filas = []
  for (const linea of String(texto).split(/\r?\n/)) {
    const t = linea.trim().replace(/^RAW,/, '')
    if (!/^\d+,\d+,\d+,\d+$/.test(t)) continue
    const [n, ms, ir, rojo] = t.split(',').map(Number)
    if (ir > 65535 || rojo > 65535) continue
    filas.push({ n, ms, ir, rojo })
  }
  return filas
}

/** Tramo más largo con dedo (ir sobre el umbral), sin los primeros 2 s de calentamiento. */
function tramoConDedo(filas) {
  let mejor = [0, 0], inicio = null
  for (let i = 0; i <= filas.length; i++) {
    const hay = i < filas.length && filas[i].ir >= UMBRAL_DEDO
    if (hay && inicio === null) inicio = i
    if (!hay && inicio !== null) { if (i - inicio > mejor[1] - mejor[0]) mejor = [inicio, i]; inicio = null }
  }
  const desde = mejor[0] + 2 * HZ
  return desde < mejor[1] ? filas.slice(desde, mejor[1]) : []
}

// ── SpO2 con el método ACTUAL del firmware: «AC» = lectura − media móvil exponencial (α 0,02), ventanas de 2 s ──
function spo2MetodoFirmware(ir, rojo) {
  let dcI = ir[0], dcR = rojo[0]
  let sI = 0, sR = 0, n = 0
  const salida = []
  for (let i = 0; i < ir.length; i++) {
    dcI += 0.02 * (ir[i] - dcI)
    dcR += 0.02 * (rojo[i] - dcR)
    sI += (ir[i] - dcI) ** 2
    sR += (rojo[i] - dcR) ** 2
    n++
    if (n >= 200) {
      const pi = Math.sqrt(sI / n) / dcI
      const pr = Math.sqrt(sR / n) / dcR
      const R = pi > 0 ? pr / pi : NaN
      const v = 110 - 25 * R
      salida.push({ R, spo2: pi > 0.001 && pi < 0.2 && R >= 0.3 && R <= 3 && v >= 70 && v <= 100 ? v : null })
      sI = sR = 0
      n = 0
    }
  }
  return salida
}

// ── SpO2 más robusta: AC con el mismo pasa-banda (0,5–5 Hz) en los dos canales, ventanas de 6 s y DC = media ──
function spo2MetodoBanda(ir, rojo) {
  const bi = filtrarSenalPpg(ir, HZ), br = filtrarSenalPpg(rojo, HZ)
  const salida = []
  const paso = 2 * HZ, ventana = 6 * HZ
  for (let i = 0; i + ventana <= ir.length; i += paso) {
    const dI = media(ir.slice(i, i + ventana)), dR = media(rojo.slice(i, i + ventana))
    const pi = rms(bi.slice(i, i + ventana)) / dI
    const pr = rms(br.slice(i, i + ventana)) / dR
    const R = pi > 0 ? pr / pi : NaN
    const v = 110 - 25 * R
    salida.push({ R, spo2: pi > 0.001 && pi < 0.2 && R >= 0.3 && R <= 3 && v >= 70 && v <= 100 ? v : null })
  }
  return salida
}

// ── Espectro: frecuencia dominante entre 0,7 y 3 Hz (42–180 BPM) ──
function bpmEspectral(serie) {
  let mejor = 0, bpm = null
  const pot = []
  for (let f = 0.7; f <= 3.0; f += 0.02) {
    let re = 0, im = 0
    for (let i = 0; i < serie.length; i++) {
      const a = 2 * Math.PI * f * (i / HZ)
      re += serie[i] * Math.cos(a)
      im += serie[i] * Math.sin(a)
    }
    const p = re * re + im * im
    pot.push(p)
    if (p > mejor) { mejor = p; bpm = f * 60 }
  }
  const med = mediana(pot)
  return { bpm: bpm === null ? null : Math.round(bpm), prominencia: med > 0 ? mejor / med : null }
}

function resumenSerie(valores) {
  const v = valores.filter((x) => Number.isFinite(x))
  if (!v.length) return { n: 0, media: null, sd: null, min: null, max: null }
  return { n: v.length, media: r1(media(v)), sd: r2(sd(v)), min: r1(Math.min(...v)), max: r1(Math.max(...v)) }
}

/** Analiza una captura ya leída. Devuelve un objeto con las medidas y una lista de hallazgos en español. */
export function analizarSenalCruda(filas) {
  const hallazgos = []
  const informe = { muestras: filas.length, hallazgos }
  if (filas.length < 3 * HZ) {
    hallazgos.push({ nivel: 'error', texto: `La captura es muy corta (${filas.length} lecturas = ${r1(filas.length / HZ)} s). Se necesitan al menos 20 s con el dedo apoyado.` })
    return informe
  }

  // Tiempo y muestras perdidas
  const durN = (filas[filas.length - 1].n - filas[0].n + 1) / HZ
  const durMs = (filas[filas.length - 1].ms - filas[0].ms) / 1000
  const perdidas = (filas[filas.length - 1].n - filas[0].n + 1) - filas.length
  informe.tiempo = { duracionS: r1(durMs), lecturas: filas.length, perdidas, hzEfectivo: r1(filas.length / durMs) }
  if (perdidas > 0 || Math.abs(informe.tiempo.hzEfectivo - HZ) > 3) {
    hallazgos.push({ nivel: 'aviso', texto: `Se perdieron o repitieron lecturas (${perdidas} perdidas; frecuencia efectiva ${informe.tiempo.hzEfectivo} Hz en vez de 100). Eso estira o comprime el tiempo y desordena el pulso.` })
  }

  // Dedo
  const conDedo = filas.filter((f) => f.ir >= UMBRAL_DEDO).length
  informe.dedo = { porcentaje: Math.round((conDedo / filas.length) * 100) }
  const tramo = tramoConDedo(filas)
  if (tramo.length < 10 * HZ) {
    hallazgos.push({ nivel: 'error', texto: `Solo hay ${r1(tramo.length / HZ)} s seguidos con dedo (luz infrarroja ≥ ${UMBRAL_DEDO}). Apoya el dedo sin moverlo al menos 20 s.` })
    return informe
  }
  const ir = tramo.map((f) => f.ir), rojo = tramo.map((f) => f.rojo)
  informe.tramoS = r1(tramo.length / HZ)

  // Nivel de luz (DC)
  const dcI = media(ir), dcR = media(rojo)
  const saturadasI = ir.filter((x) => x >= 65000).length, saturadasR = rojo.filter((x) => x >= 65000).length
  informe.luz = { dcIr: Math.round(dcI), dcRojo: Math.round(dcR), cocienteIrRojo: r2(dcI / dcR), saturadasIr: saturadasI, saturadasRojo: saturadasR }
  if (dcI < 15000) hallazgos.push({ nivel: 'aviso', texto: `La luz infrarroja es baja (${Math.round(dcI)}): dedo mal apoyado, muy poco contacto o piel fría. Aumenta la corriente del LED o mejora el contacto.` })
  if (saturadasI > 0 || saturadasR > 0) hallazgos.push({ nivel: 'aviso', texto: `El sensor se satura (${saturadasI} lecturas infrarrojas y ${saturadasR} rojas al máximo): hay que bajar la corriente del LED.` })
  if (dcI / dcR > 2) hallazgos.push({ nivel: 'aviso', texto: `La luz roja es ${r1(dcI / dcR)} veces más débil que la infrarroja. La SpO₂ depende de la razón entre las dos y el rojo queda con mucho ruido relativo: conviene subir la corriente del LED rojo (ver recomendación).` })

  // Amplitud del pulso, ruido y deriva
  const bpI = filtrarSenalPpg(ir, HZ), bpR = filtrarSenalPpg(rojo, HZ)
  const acI = rms(bpI), acR = rms(bpR)
  const ruidoI = rms(filtrarSenalPpg(ir, HZ, { bajaHz: 12, altaHz: 40 }))
  const ruidoR = rms(filtrarSenalPpg(rojo, HZ, { bajaHz: 12, altaHz: 40 }))
  const ventanaDeriva = HZ
  const medias = []
  for (let i = 0; i + ventanaDeriva <= ir.length; i += ventanaDeriva) medias.push(media(ir.slice(i, i + ventanaDeriva)))
  const deriva = (Math.max(...medias) - Math.min(...medias)) / dcI * 100
  informe.pulso = {
    indicePerfusionIrPct: r2(acI / dcI * 100), indicePerfusionRojoPct: r2(acR / dcR * 100),
    snrIr: r1(acI / Math.max(ruidoI, 1e-9)), snrRojo: r1(acR / Math.max(ruidoR, 1e-9)), derivaPct: r1(deriva)
  }
  if (acI / dcI * 100 < 0.2) hallazgos.push({ nivel: 'aviso', texto: `El pulso es muy débil (índice de perfusión ${informe.pulso.indicePerfusionIrPct} %): con menos de 0,2 % cuesta detectar latidos y la SpO₂ sale inestable.` })
  if (informe.pulso.snrIr < 4) hallazgos.push({ nivel: 'aviso', texto: `La señal infrarroja es ruidosa (relación señal/ruido ${informe.pulso.snrIr}): hay mucho ruido rápido comparado con el latido (luz ambiente, cable o placa).` })
  if (informe.pulso.snrRojo < 3) hallazgos.push({ nivel: 'aviso', texto: `La señal roja es mucho más ruidosa (relación señal/ruido ${informe.pulso.snrRojo}): la SpO₂ calculada con ella variará.` })
  if (deriva > 5) hallazgos.push({ nivel: 'aviso', texto: `La línea de base se mueve ${r1(deriva)} % durante la captura (presión del dedo, movimiento o respiración): ensucia el pulso y la SpO₂.` })

  // Pulso: orientación del latido y estabilidad por ventanas de 8 s
  // El detector de la app recibe la onda como la envía la placa: centrada en 24500 y con el latido de ±1500 cuentas
  const escala = (() => { const o = bpI.map(Math.abs).sort((x, y) => x - y); return 1500 / Math.max(1e-9, o[Math.floor(o.length * 0.98)]) })()
  const alto = (x) => x.map((v) => 24500 + v * escala)
  const orientaciones = [{ nombre: 'señal tal cual', serie: bpI }, { nombre: 'señal invertida', serie: bpI.map((v) => -v) }]
  let mejor = null
  for (const o of orientaciones) {
    const m = calcularMetricasCanal({ ir: alto(o.serie), frecuenciaHz: HZ })
    const cv = m.intervalosMs.length > 3 ? sd(m.intervalosMs) / media(m.intervalosMs) : Infinity
    if (!mejor || cv < mejor.cv) mejor = { ...o, cv, m }
  }
  const bpms = [], nulos = []
  const vent = 8 * HZ
  for (let i = 0; i + vent <= bpI.length; i += HZ) {
    const m = calcularMetricasCanal({ ir: alto(mejor.serie.slice(i, i + vent)), frecuenciaHz: HZ })
    if (m.bpm === null) nulos.push(1); else bpms.push(m.bpm)
  }
  const esp = bpmEspectral(bpI)
  informe.frecuenciaCardiaca = {
    orientacion: mejor.nombre, ...resumenSerie(bpms), sinLecturaPct: Math.round((nulos.length / Math.max(1, nulos.length + bpms.length)) * 100),
    bpmEspectral: esp.bpm, prominenciaEspectral: r1(esp.prominencia)
  }
  if (informe.frecuenciaCardiaca.sd > 3) hallazgos.push({ nivel: 'aviso', texto: `El pulso calculado varía mucho (desviación ${informe.frecuenciaCardiaca.sd} BPM entre ventanas de 8 s; de ${informe.frecuenciaCardiaca.min} a ${informe.frecuenciaCardiaca.max}). Con un dedo quieto debería quedar por debajo de 2–3 BPM.` })
  if (informe.frecuenciaCardiaca.sinLecturaPct > 30) hallazgos.push({ nivel: 'aviso', texto: `El detector no pudo dar pulso en el ${informe.frecuenciaCardiaca.sinLecturaPct} % del tiempo: umbrales demasiado exigentes para esta señal o señal débil.` })
  if (esp.bpm && bpms.length && Math.abs(esp.bpm - mediana(bpms)) > 6) hallazgos.push({ nivel: 'aviso', texto: `El detector de latidos (${Math.round(mediana(bpms))} BPM) no coincide con la frecuencia dominante del espectro (${esp.bpm} BPM): puede estar contando la muesca dícrota o ruido.` })

  // SpO2: método actual del firmware frente a uno más robusto
  const actual = spo2MetodoFirmware(ir, rojo), robusto = spo2MetodoBanda(ir, rojo)
  const sa = resumenSerie(actual.map((x) => x.spo2)), sb = resumenSerie(robusto.map((x) => x.spo2))
  informe.spo2 = {
    metodoActualFirmware: { ...sa, sinLecturaPct: Math.round((actual.filter((x) => x.spo2 === null).length / Math.max(1, actual.length)) * 100), R: resumenSerie(actual.map((x) => x.R)) },
    metodoBandaCincoSeis: { ...sb, sinLecturaPct: Math.round((robusto.filter((x) => x.spo2 === null).length / Math.max(1, robusto.length)) * 100), R: resumenSerie(robusto.map((x) => x.R)) }
  }
  if (sa.sd > 1.5) hallazgos.push({ nivel: 'aviso', texto: `La SpO₂ con el método actual del firmware varía ${sa.sd} puntos (de ${sa.min} a ${sa.max} %). Una persona sana quieta debería ver variaciones de ±1 punto o menos.` })
  if (sb.n && sa.n && sb.sd < sa.sd) hallazgos.push({ nivel: 'info', texto: `Con el mismo filtro en rojo e infrarrojo y ventanas de 6 s la variación baja de ${sa.sd} a ${sb.sd} puntos: ese cambio ayuda.` })
  if (sa.media !== null && sa.media < 94) hallazgos.push({ nivel: 'aviso', texto: `La SpO₂ media (${sa.media} %) es baja para una persona sana: el sensor o la fórmula no están calibrados (razón R media ${informe.spo2.metodoActualFirmware.R.media}). Hace falta calibrar contra un oxímetro.` })

  // Recomendación de corriente del LED rojo (la luz crece casi lineal con la corriente)
  const niveles = [0, 4.4, 7.6, 11, 14.2, 17.4, 20.8, 24, 27.1, 30.6, 33.8, 37, 40.2, 43.6, 46.8, 50]
  const objetivo = 7.6 * (dcI / dcR)
  const sugerida = niveles.find((x) => x >= objetivo) ?? 50
  informe.ledRojoSugeridoMa = sugerida
  if (Math.abs(sugerida - 7.6) >= 7) hallazgos.push({ nivel: 'info', texto: `Para igualar la luz roja con la infrarroja la corriente del LED rojo debería ser cercana a ${sugerida} mA (hoy 7,6 mA).` })

  if (!hallazgos.some((h) => h.nivel !== 'info')) hallazgos.push({ nivel: 'ok', texto: 'La señal se ve sana: sin pérdidas, con buena luz, pulso claro y poca variación.' })
  return informe
}

export function textoInforme(i) {
  const L = []
  L.push('ANÁLISIS DE LA SEÑAL CRUDA', '='.repeat(60))
  if (i.tiempo) L.push(`Captura: ${i.tiempo.lecturas} lecturas en ${i.tiempo.duracionS} s (${i.tiempo.hzEfectivo} Hz efectivos, ${i.tiempo.perdidas} perdidas). Con dedo: ${i.dedo.porcentaje} %. Tramo analizado: ${i.tramoS} s.`)
  if (i.luz) L.push(`Luz: infrarroja ${i.luz.dcIr} · roja ${i.luz.dcRojo} (cociente ${i.luz.cocienteIrRojo}); saturadas IR/rojo: ${i.luz.saturadasIr}/${i.luz.saturadasRojo}.`)
  if (i.pulso) L.push(`Pulso: perfusión IR ${i.pulso.indicePerfusionIrPct} % · rojo ${i.pulso.indicePerfusionRojoPct} % · señal/ruido IR ${i.pulso.snrIr} · rojo ${i.pulso.snrRojo} · deriva ${i.pulso.derivaPct} %.`)
  if (i.frecuenciaCardiaca) {
    const f = i.frecuenciaCardiaca
    L.push(`Frecuencia cardíaca (${f.orientacion}): media ${f.media} BPM, desviación ${f.sd}, rango ${f.min}–${f.max}, sin lectura ${f.sinLecturaPct} %; espectro ${f.bpmEspectral} BPM.`)
  }
  if (i.spo2) {
    const a = i.spo2.metodoActualFirmware, b = i.spo2.metodoBandaCincoSeis
    L.push(`SpO₂ método actual: media ${a.media} %, desviación ${a.sd}, rango ${a.min}–${a.max}, sin lectura ${a.sinLecturaPct} % (R media ${a.R.media}).`)
    L.push(`SpO₂ banda 0,5–5 Hz: media ${b.media} %, desviación ${b.sd}, rango ${b.min}–${b.max}, sin lectura ${b.sinLecturaPct} % (R media ${b.R.media}).`)
  }
  L.push('', 'HALLAZGOS')
  for (const h of i.hallazgos) L.push(` ${{ ok: '✓', info: 'i', aviso: '!', error: 'x' }[h.nivel]} ${h.texto}`)
  return L.join('\n')
}

// Uso desde la línea de comandos
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const archivo = process.argv[2]
  if (!archivo) { console.error('Uso: node scripts/analizar-senal-cruda.mjs captura.csv'); process.exit(2) }
  const informe = analizarSenalCruda(leerCaptura(readFileSync(archivo, 'utf8')))
  console.log(textoInforme(informe))
  console.log('\nJSON:\n' + JSON.stringify(informe, null, 2))
}
