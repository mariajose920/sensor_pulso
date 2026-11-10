// Captura y análisis de la señal cruda (modo diagnóstico) con señales sintéticas
//   node scripts/test-analizar-senal-cruda.mjs
import { readFileSync } from 'node:fs'
import { generarPpg, rng } from './lib-ppg-sintetico.mjs'
import { analizarSenalCruda, leerCaptura, textoInforme } from './analizar-senal-cruda.mjs'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }
const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

// Lecturas crudas como las del MAX30100: el latido REDUCE la luz recibida (más sangre = más absorción)
function capturaSintetica({ seg = 40, bpm = 72, dcIr = 30000, dcRojo = 28000, ampIr = 600, ampRojo = 280, ruido = 0.04, dedo = true, perdidas = 0, semilla = 5 } = {}) {
  const a = generarPpg({ bpm, hz: 100, seg, ruido, amp: ampIr, dc: 0, semilla })
  const b = generarPpg({ bpm, hz: 100, seg, ruido: ruido * 1.5, amp: ampRojo, dc: 0, semilla: semilla + 1 })
  const rnd = rng(semilla + 9)
  const filas = []
  for (let i = 0; i < a.x.length; i++) {
    if (perdidas && rnd() < perdidas) continue
    const ir = dedo ? Math.round(dcIr - a.x[i]) : 600
    const rojo = dedo ? Math.round(dcRojo - b.x[i]) : 500
    filas.push({ n: i + 1, ms: 1000 + i * 10, ir: Math.max(0, Math.min(65535, ir)), rojo: Math.max(0, Math.min(65535, rojo)) })
  }
  return filas
}
const hallazgo = (inf, trozo) => inf.hallazgos.some((h) => h.texto.includes(trozo))

console.log('Lectura de la captura')
const csv = 'n,ms,ir,rojo\n1,1000,30000,28000\nRAW,2,1010,30010,28010\nbasura\n3,1020,99999,1\n4,1030,30020,28020\n'
const leidas = leerCaptura(csv)
prueba('lee el CSV y las líneas RAW, e ignora cabecera, basura y valores fuera de 16 bits', leidas.length === 3 && leidas[1].ir === 30010)

console.log('Señal sana')
{
  const inf = analizarSenalCruda(capturaSintetica())
  prueba('detecta el tramo con dedo y la frecuencia efectiva de 100 Hz', inf.tiempo.hzEfectivo >= 99 && inf.tiempo.perdidas === 0 && inf.dedo.porcentaje === 100)
  prueba('mide la luz infrarroja y roja', Math.abs(inf.luz.dcIr - 30000) < 300 && Math.abs(inf.luz.dcRojo - 28000) < 300)
  prueba('mide la perfusión (≈ amplitud/DC)', inf.pulso.indicePerfusionIrPct > 0.5 && inf.pulso.indicePerfusionIrPct < 4)
  prueba('reconoce que el latido REDUCE la luz (señal invertida) y el pulso es 72 ±3', /invertida/.test(inf.frecuenciaCardiaca.orientacion) && Math.abs(inf.frecuenciaCardiaca.media - 72) <= 3)
  prueba('el espectro coincide con el detector', Math.abs(inf.frecuenciaCardiaca.bpmEspectral - 72) <= 4)
  prueba('el pulso es estable (desviación ≤ 2 BPM)', inf.frecuenciaCardiaca.sd <= 2)
  prueba('calcula la SpO2 con los dos métodos', inf.spo2.metodoActualFirmware.n > 5 && inf.spo2.metodoBandaCincoSeis.n > 2)
  prueba('sin problemas dice que la señal se ve sana', inf.hallazgos.some((h) => h.nivel === 'ok') || inf.hallazgos.every((h) => h.nivel === 'info' || h.nivel === 'ok'))
  prueba('el texto del informe se arma', /ANÁLISIS DE LA SEÑAL CRUDA/.test(textoInforme(inf)) && /Frecuencia cardíaca/.test(textoInforme(inf)))
}

console.log('Problemas que debe detectar')
{
  const rojoDebil = analizarSenalCruda(capturaSintetica({ dcIr: 40000, dcRojo: 8000, ampRojo: 90 }))
  prueba('LED rojo mucho más débil que el infrarrojo → avisa y sugiere más corriente', hallazgo(rojoDebil, 'veces más débil') && rojoDebil.ledRojoSugeridoMa > 7.6)
  const poca = analizarSenalCruda(capturaSintetica({ dcIr: 11000, dcRojo: 10000, ampIr: 30, ampRojo: 25 }))
  prueba('poca luz y pulso débil → avisa', hallazgo(poca, 'luz infrarroja es baja') && hallazgo(poca, 'pulso es muy débil'))
  const satura = analizarSenalCruda(capturaSintetica({ dcIr: 65200, dcRojo: 30000 }))
  prueba('saturación → avisa que hay que bajar la corriente', hallazgo(satura, 'se satura'))
  const ruidosa = analizarSenalCruda(capturaSintetica({ ruido: 1.2 }))
  prueba('mucho ruido → avisa', hallazgo(ruidosa, 'ruidosa'))
  const perdidas = analizarSenalCruda(capturaSintetica({ perdidas: 0.08 }))
  prueba('lecturas perdidas → avisa del tiempo estirado', perdidas.tiempo.perdidas > 100 && hallazgo(perdidas, 'perdieron'))
  const sinDedo = analizarSenalCruda(capturaSintetica({ dedo: false }))
  prueba('sin dedo → error claro, no números inventados', sinDedo.hallazgos.some((h) => h.nivel === 'error') && !sinDedo.pulso && !sinDedo.spo2)
  const corta = analizarSenalCruda(capturaSintetica({ seg: 2 }))
  prueba('captura muy corta → error claro', corta.hallazgos.some((h) => h.nivel === 'error' && /corta/.test(h.texto)))
}

console.log('Firmware y script de captura')
const ino = leer('../firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino')
prueba('comandos raw_on y raw_off', ino.includes('c.cmd == "raw_on"') && ino.includes('c.cmd == "raw_off"'))
prueba('línea RAW,n,ms,ir,rojo con una sola escritura y mutex', /void emitirMuestraCruda[\s\S]*?"RAW,%lu,%lu,%u,%u\\n"[\s\S]*?xSemaphoreTake\(serMux[\s\S]*?Serial\.write[\s\S]*?xSemaphoreGive\(serMux\)/.test(ino))
prueba('cada lectura del sensor se emite cruda solo si el modo está activo', /if \(rawActivo\) emitirMuestraCruda\(\+\+rawN, millis\(\), ir, rojo\)/.test(ino))
prueba('por defecto apagado y se apaga solo a los 3 minutos', /volatile bool rawActivo = false/.test(ino) && /RAW_DURACION_MAX_MS = 180000/.test(ino) && /ev\\":\\"raw\\",\\"estado\\":\\"fin/.test(ino))
prueba('durante la captura no se imprime el registro de texto (menos tráfico)', /if \(!rawActivo && millis\(\) - ultimoLogUSB >= 500\)/.test(ino))
const ps1 = leer('./capturar-senal-cruda.ps1')
prueba('el script de captura activa, graba y analiza', ps1.includes('raw_on') && ps1.includes('raw_off') && ps1.includes('analizar-senal-cruda.mjs') && ps1.includes("n,ms,ir,rojo"))

console.log(`\n${ok} bien, ${mal} mal`)
process.exit(mal ? 1 : 0)
