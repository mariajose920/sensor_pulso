// RF111 · Gráfico del canal: puntos de picos exactos, herramientas (capturar, CSV, pausa, reanudar, filtros)
//   node scripts/test-grafico-canal-herramientas.mjs
import { readFileSync } from 'node:fs'
import {
  trazarSerie, geometriaSerie, serieMostrada, picosDeSerie, acumularMuestras, acumularSpo2, contarMuestrasValidas,
  trazarSpo2, debeAcumular, reanudarVentana, AJUSTES_POR_DEFECTO, ajustesDe, alternarAjuste, leerAjustes, guardarAjustes,
  _reiniciarAjustes, MARGEN_GRAFICA, SEGUNDOS_VENTANA_GRAFICA, resumenMetricas
} from '../src/utils/graficasCanales.js'
import { detectarPicosParaGrafica } from '../src/utils/picosGrafica.js'
import { filtrarSenalPpg } from '../src/utils/filtroPpg.js'
import { calcularMetricasCanal } from '../src/utils/metricasCanal.js'
import {
  generarCsvCanal, nombreArchivoCanal, tituloCaptura, dibujarCapturaCanal, alturaCaptura, ANCHO_CAPTURA
} from '../src/utils/exportarCanal.js'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }
const leer = (p) => readFileSync(new URL(p, import.meta.url), 'utf8')

// Señal PPG sintética: latidos con muesca, deriva lenta y algo de ruido determinista
function ppg(n, hz, bpm, semilla = 1, base = 50000) {
  let s = semilla * 9301
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647) - 0.5
  const f = bpm / 60
  return Array.from({ length: n }, (_, i) => {
    const t = i / hz
    const fase = (t * f) % 1
    const latido = Math.exp(-((fase - 0.18) ** 2) / 0.004) * 900 + Math.exp(-((fase - 0.45) ** 2) / 0.01) * 260
    return Math.round(base * semilla + 600 * Math.sin(t * 0.4) + latido + rnd() * 60)
  })
}
const HZ = 50
const N = Math.round(SEGUNDOS_VENTANA_GRAFICA * HZ)

console.log('Puntos de picos: exactamente sobre la polilínea y en la cresta (1 a 5 canales, DSP activado y apagado)')
for (const canales of [1, 2, 3, 5]) {
  for (const dsp of [true, false]) {
    let todoOk = true, hayPicos = true, cima = true, igualDetector = true, total = 0
    for (let c = 1; c <= canales; c++) {
      const ir = ppg(N, HZ, 60 + c * 9, c)
      const serie = serieMostrada(ir, HZ, dsp)
      const picos = picosDeSerie(serie, HZ)
      igualDetector = igualDetector && JSON.stringify(picos) === JSON.stringify(detectarPicosParaGrafica(serie, HZ))
      for (const alto of [110, 220]) {
        const t = trazarSerie(serie, 600, alto, { picos })
        const verts = t.polilinea.split(' ').map(q => q.split(',').map(Number))
        if (!picos.length) hayPicos = false
        for (const m of t.marcas) {
          total++
          // la y del punto es la y de la polilínea en ese índice (mismo vértice)
          if (verts[m.indice][0] !== m.x || verts[m.indice][1] !== m.y) todoOk = false
          // y la serie dibujada tiene ahí un máximo local exacto (en pantalla: y menor que la de los vecinos)
          const i = m.indice
          if (!(serie[i] >= serie[i - 1] && serie[i] >= serie[i + 1])) cima = false
          if (!(verts[i][1] <= verts[i - 1][1] && verts[i][1] <= verts[i + 1][1])) cima = false
          // en un radio de 2 muestras no hay nada más alto
          for (let k = Math.max(0, i - 2); k <= Math.min(serie.length - 1, i + 2); k++) if (serie[k] > serie[i]) cima = false
        }
      }
    }
    const etiqueta = `${canales} canal(es), DSP ${dsp ? 'activado' : 'apagado'}`
    prueba(`${etiqueta}: hay picos y los índices vienen de detectarPicosParaGrafica(serieMostrada)`, hayPicos && igualDetector && total > 0)
    prueba(`${etiqueta}: cada punto == vértice de la polilínea`, todoOk)
    prueba(`${etiqueta}: cada punto cae en un máximo local de la serie dibujada`, cima)
  }
}
{
  const ir = ppg(N, HZ, 72, 1)
  const fil = serieMostrada(ir, HZ, true)
  const cru = serieMostrada(ir, HZ, false)
  prueba('DSP activado: la serie mostrada es filtrarSenalPpg(ir, hz) (mismo largo)', JSON.stringify(fil) === JSON.stringify(filtrarSenalPpg(ir, HZ)) && fil.length === ir.length)
  prueba('DSP apagado: la serie mostrada es la cruda tal como llega', cru === ir)
  prueba('serie corta con DSP cae a la cruda (sin romper)', serieMostrada([1, 2], HZ, true).length === 2 && serieMostrada(null, HZ, true).length === 0)
  const t = trazarSerie(fil, 600, 110, { picos: picosDeSerie(fil, HZ) })
  prueba('la y del punto queda dentro de los márgenes (no se corta en la cresta)', t.marcas.every(m => m.y >= MARGEN_GRAFICA - 1e-9 && m.y <= 110 - MARGEN_GRAFICA + 1e-9))
  const geo = geometriaSerie(fil, 600, 110, { margen: MARGEN_GRAFICA })
  prueba('el máximo global de la serie queda en y = margen (arriba del todo)', Math.min(...geo.map(p => p.y)) === MARGEN_GRAFICA)
  prueba('sin picos no hay marcas ni errores', trazarSerie([1, 2, 3], 600, 110).marcas.length === 0 && trazarSerie([], 600, 110).polilinea === '')
}

console.log('CSV del canal')
{
  const fecha = new Date(2026, 10, 9, 14, 5, 7)
  const ir = ppg(N, HZ, 72, 1)
  const rojo = ir.map(v => Math.round(v * 0.9))
  const serie = serieMostrada(ir, HZ, true)
  const picos = picosDeSerie(serie, HZ)
  const spo2 = ir.map((_, i) => (i < 100 ? null : i < 200 ? 97 : 96.5))
  const csv = generarCsvCanal({ canal: 3, paciente: 'Ana, "Pérez"', frecuenciaHz: HZ, fecha, senalMostrada: serie, ir, rojo, picos, bpm: 72, spo2, dsp: true })
  const filas = csv.split('\r\n')
  const cab = filas.findIndex(f => f.startsWith('tiempo_s'))
  prueba('empieza con BOM UTF-8', csv.charCodeAt(0) === 0xFEFF)
  prueba('saltos de línea CRLF (ningún LF suelto)', !/[^\r]\n/.test(csv) && csv.endsWith('\r\n'))
  prueba('cabecera con canal, paciente, frecuencia y fecha', csv.includes('# Canal: 3') && csv.includes('# Paciente: Ana, "Pérez"') && csv.includes('# Frecuencia de muestreo (Hz): 50') && csv.includes('# Fecha: ' + fecha.toISOString()))
  prueba('columnas pedidas', filas[cab] === 'tiempo_s,senal_mostrada,ir_crudo,rojo,pico,bpm,spo2')
  const datos = filas.slice(cab + 1).filter(Boolean)
  prueba('una fila por muestra de la ventana acumulada', datos.length === ir.length)
  prueba('tiempo_s = i / hz con punto decimal', datos[0].startsWith('0.000,') && datos[1].startsWith('0.020,') && datos[50].startsWith('1.000,'))
  const col = (f, k) => f.split(',')[k]
  prueba('ir_crudo y rojo son los de la ventana', datos.every((f, i) => Number(col(f, 2)) === ir[i] && Number(col(f, 3)) === rojo[i]))
  prueba('señal_mostrada es la serie dibujada (filtrada)', datos.every((f, i) => Math.abs(Number(col(f, 1)) - serie[i]) < 1e-3))
  const marcados = datos.map((f, i) => (col(f, 4) === '1' ? i : -1)).filter(i => i >= 0)
  prueba('pico = 1 exactamente en el índice de cada pico, 0 en el resto', JSON.stringify(marcados) === JSON.stringify(picos.map(p => p.indice)) && datos.every(f => ['0', '1'].includes(col(f, 4))))
  prueba('bpm de la métrica en cada fila', datos.every(f => col(f, 5) === '72'))
  prueba('spo2 de ese instante; vacío donde no hay lectura (sin inventar)', col(datos[10], 6) === '' && col(datos[150], 6) === '97' && col(datos[250], 6) === '96.5')
  prueba('sin coma decimal en los números (separador solo coma)', datos.every(f => f.split(',').length === 7))
  prueba('bpm null deja la columna vacía', generarCsvCanal({ canal: 1, senalMostrada: [1, 2], ir: [1, 2], bpm: null }).includes('\r\n0.000,1,1,,0,,'))
  prueba('DSP apagado se anota como señal cruda', generarCsvCanal({ canal: 1, senalMostrada: ir, ir, dsp: false }).includes('# Senal mostrada: cruda'))
  prueba('nombre de archivo canal_N_YYYYMMDD_HHMMSS.csv', nombreArchivoCanal(3, fecha, 'csv') === 'canal_3_20261109_140507.csv' && nombreArchivoCanal(2, fecha, 'png') === 'canal_2_20261109_140507.png')
  prueba('título «Canal N · nombre · fecha y hora»', tituloCaptura(3, 'Ana', fecha) === 'Canal 3 · Ana · 09/11/2026 14:05:07' && tituloCaptura(1, '', fecha) === 'Canal 1 · 09/11/2026 14:05:07')
  const corto = generarCsvCanal({ canal: 1, senalMostrada: [1, 2, 3], ir: [1, 2, 3], rojo: [9], picos: [{ indice: 1 }] })
  prueba('rojo más corto se alinea por el final y deja vacíos al principio', corto.includes('\r\n0.000,1,1,,0,,') && corto.includes('\r\n0.040,3,3,9,0,,'))
}

console.log('Captura PNG (doble de ctx)')
{
  function doble() {
    const llamadas = []
    const ctx = new Proxy({}, {
      get: (o, k) => (k in o ? o[k] : (...a) => { llamadas.push([k, ...a]) }),
      set: (o, k, v) => { o[k] = v; return true }
    })
    return { ctx, llamadas }
  }
  const ir = ppg(N, HZ, 72, 1)
  const serie = serieMostrada(ir, HZ, true)
  const picos = picosDeSerie(serie, HZ)
  const spo2 = ir.map((_, i) => (i % 50 < 10 ? null : 97))
  const resumen = resumenMetricas(calcularMetricasCanal({ ir, frecuenciaHz: HZ, bpmDispositivo: 72, spo2Dispositivo: 97 }))
  const base = { titulo: 'Canal 1 · Ana · 09/11/2026 14:05:07', color: '#38bdf8', serie, picos, spo2, resumen }

  const a = doble()
  const ra = dibujarCapturaCanal(a.ctx, { ...base, mostrarPicos: true, mostrarSpo2: false })
  const nombres = a.llamadas.map(l => l[0])
  prueba('dibuja fondo, curva y métricas con primitivas de canvas', nombres.includes('fillRect') && nombres.includes('moveTo') && nombres.includes('lineTo') && nombres.includes('stroke') && nombres.includes('fillText'))
  prueba('escribe el título y las métricas', a.llamadas.some(l => l[0] === 'fillText' && l[1] === base.titulo) && a.llamadas.some(l => l[0] === 'fillText' && /BPM/.test(String(l[1]))))
  prueba('un arco (punto) por cada pico visible', ra.puntosPicos === picos.length && a.llamadas.filter(l => l[0] === 'arc').length === picos.length && picos.length > 0)
  const arcos = a.llamadas.filter(l => l[0] === 'arc')
  const geo = geometriaSerie(serie, ANCHO_CAPTURA - 48, 220, { margen: MARGEN_GRAFICA })
  prueba('los arcos están centrados en los vértices de la curva (misma geometría)', arcos.every((l, k) => Math.abs(l[1] - (24 + geo[picos[k].indice].x)) < 1e-9 && Math.abs(l[2] - (66 + geo[picos[k].indice].y)) < 1e-9))
  prueba('sin SpO₂ visible no hay segundo gráfico ni etiqueta de SpO₂ en %', !a.llamadas.some(l => l[0] === 'fillText' && /SpO₂ \(70/.test(String(l[1]))) && ra.tieneSpo2 === false)

  const b = doble()
  const rb = dibujarCapturaCanal(b.ctx, { ...base, mostrarPicos: false, mostrarSpo2: true })
  prueba('picos ocultos: no hay arcos', rb.puntosPicos === 0 && !b.llamadas.some(l => l[0] === 'arc'))
  prueba('SpO₂ visible: aparece su gráfica y su valor actual', rb.tieneSpo2 && b.llamadas.some(l => l[0] === 'fillText' && /SpO₂ \(70–100 %\)/.test(String(l[1]))) && b.llamadas.some(l => l[0] === 'fillText' && l[1] === '97 %'))
  prueba('la captura con SpO₂ es más alta', alturaCaptura({ mostrarSpo2: true }) > alturaCaptura({ mostrarSpo2: false }))
  const c = doble()
  dibujarCapturaCanal(c.ctx, { ...base, spo2: [null, null, null], mostrarSpo2: true })
  prueba('SpO₂ sin lecturas: «sin lectura», sin valor inventado', c.llamadas.some(l => l[0] === 'fillText' && l[1] === 'sin lectura'))
  const d = doble()
  let lanzo = false
  try { dibujarCapturaCanal(d.ctx, { titulo: 'x', serie: [], picos: [], spo2: [] }) } catch { lanzo = true }
  prueba('sin datos no revienta', !lanzo)
}

console.log('SpO₂ histórica por canal')
{
  const v1 = acumularSpo2([], contarMuestrasValidas([1, 2, 3]), 97, 300)
  prueba('mismo largo que las muestras nuevas y con el SpO₂ vigente', v1.length === 3 && v1.every(x => x === 97))
  const v2 = acumularSpo2(v1, 2, 0, 300)
  prueba('SpO₂ 0 o ausente = null (hueco), nunca un valor inventado', v2.length === 5 && v2.slice(3).every(x => x === null) && acumularSpo2([], 1, undefined)[0] === null && acumularSpo2([], 1, null)[0] === null)
  prueba('se recorta igual que ir', acumularSpo2([1, 2, 3, 4].map(() => 95), 3, 96, 5).length === 5 && acumularSpo2([95, 95, 95, 95], 3, 96, 5).join() === '95,95,96,96,96')
  let ir = [], sp = []
  for (const [lote, valor] of [[[1, 2, 3, NaN, 5], 97], [[6, 7], 0], [[8, 9, 10, 11], 96]]) {
    ir = acumularMuestras(ir, lote, 8)
    sp = acumularSpo2(sp, contarMuestrasValidas(lote), valor, 8)
  }
  prueba('ir y spo2 quedan alineados aunque haya muestras inválidas y recorte', ir.length === 8 && sp.length === 8 && ir.join() === '3,5,6,7,8,9,10,11' && sp.map(x => (x === null ? 'n' : x)).join() === '97,97,n,n,96,96,96,96')
  const t = trazarSpo2([97, 97, null, null, 96, 96, null, 95], 600, 60)
  prueba('el hueco corta la línea (tramos separados)', t.segmentos.length === 3)
  prueba('el valor actual es el último si existe; si no, null', t.actual === 95 && trazarSpo2([97, null], 600, 60).actual === null)
  prueba('sin lecturas no hay línea', trazarSpo2([null, null, null], 600, 60).segmentos.length === 0 && !trazarSpo2([null, null], 600, 60).hayDatos)
  const y = (v) => Number(trazarSpo2([v, v], 600, 60, { margen: 4 }).segmentos[0].split(' ')[0].split(',')[1])
  prueba('eje 70–100 %: 100 arriba, 70 abajo, 85 al centro', y(100) === 4 && y(70) === 56 && y(85) === 30)
}

console.log('Pausar / reanudar y terminar / reanudar')
{
  prueba('en vivo acumula; en pausa o terminada no', debeAcumular({}) && !debeAcumular({ pausada: true }) && !debeAcumular({ terminada: true }))
  const paquete = [1, 2, 3]
  const v = { ir: [1], rojo: [], spo2: [null], ultimoIr: [0], inicio: 5 }
  const r = reanudarVentana(v, paquete)
  prueba('reanudar conserva la MISMA ventana (ir, spo2, inicio) y marca el paquete actual como ya visto', r.ir === v.ir && r.spo2 === v.spo2 && r.inicio === 5 && r.ultimoIr === paquete)
  const comp = leer('../src/components/GraficasCanalesPropios.vue')
  prueba('el componente no acumula en pausa ni terminada', /debeAcumular\(\{ pausada: Boolean\(pausadas\.value\[g\.canal\]\) \}\)/.test(comp) && /if \(terminadas\.value\[g\.canal\]\)/.test(comp))
  prueba('Pausar/Reanudar en vivo: alternarPausa congela y al reanudar descarta lo recibido', /function alternarPausa/.test(comp) && /reanudarVentana\(v, paqueteActual\(canal\)\)/.test(comp))
  prueba('tras Terminar: botón «Reanudar» (junto a Medir de nuevo y ¿Guardar?) en separadas y en Juntas', (comp.match(/data-testid="reanudar-terminada"/g) || []).length === 2 && (comp.match(/data-testid="medir-de-nuevo"/g) || []).length === 2 && (comp.match(/data-testid="decidir-guardar"/g) || []).length === 2)
  prueba('reanudarTerminada quita el estado terminado y no descarta lo acumulado', /function reanudarTerminada[\s\S]*delete resto\[canal\][\s\S]*reanudarVentana/.test(comp) && !/function reanudarTerminada[\s\S]{0,600}ir: \[\]/.test(comp))
  prueba('Medir de nuevo sigue descartando lo acumulado', /function medirDeNuevo[\s\S]*ir: \[\], rojo: \[\], spo2: \[\]/.test(comp))
  prueba('Terminar y el diálogo de guardar siguen intactos', /function terminarCanal[\s\S]*abrirDialogo\(canal\)/.test(comp) && comp.includes('<TerminarMedicionModal') && comp.includes('armarRegistroTerminado'))
  prueba('las métricas siguen usando ir crudo (no la serie filtrada)', /calcularMetricasCanal\(\{\s*ir, rojo: v\?\.rojo/.test(comp))
}

console.log('Filtros por canal')
{
  _reiniciarAjustes()
  prueba('por defecto: picos visibles, SpO₂ oculta, filtro DSP activado', AJUSTES_POR_DEFECTO.picos === true && AJUSTES_POR_DEFECTO.spo2 === false && AJUSTES_POR_DEFECTO.dsp === true)
  let m = {}
  prueba('canal sin ajustes usa los de por defecto', JSON.stringify(ajustesDe(m, 4)) === JSON.stringify(AJUSTES_POR_DEFECTO))
  m = alternarAjuste(m, 2, 'picos')
  prueba('alternar un ajuste solo afecta a ese canal', ajustesDe(m, 2).picos === false && ajustesDe(m, 1).picos === true && ajustesDe(m, 2).dsp === true)
  m = alternarAjuste(alternarAjuste(m, 2, 'spo2'), 2, 'dsp')
  prueba('SpO₂ se enciende y DSP se apaga', ajustesDe(m, 2).spo2 === true && ajustesDe(m, 2).dsp === false)
  prueba('clave desconocida se ignora', JSON.stringify(alternarAjuste(m, 2, 'otra')) === JSON.stringify(m))
  guardarAjustes(m)
  prueba('el estado se recuerda en memoria durante la sesión', ajustesDe(leerAjustes(), 2).spo2 === true && ajustesDe(leerAjustes(), 2).picos === false)
  // sessionStorage de mentira, con y sin errores
  const claves = {}
  globalThis.sessionStorage = { getItem: (k) => claves[k] ?? null, setItem: (k, v) => { claves[k] = v } }
  guardarAjustes(m)
  _reiniciarAjustes()
  prueba('también se recupera de sessionStorage', Object.keys(claves).length === 1 && ajustesDe(leerAjustes(), 2).dsp === false)
  globalThis.sessionStorage = { getItem: () => { throw new Error('bloqueado') }, setItem: () => { throw new Error('bloqueado') } }
  _reiniciarAjustes()
  let lanzo = false
  try { guardarAjustes(m); leerAjustes() } catch { lanzo = true }
  prueba('sessionStorage bloqueado no rompe', !lanzo)
  delete globalThis.sessionStorage
  _reiniciarAjustes()

  const comp = leer('../src/components/GraficasCanalesPropios.vue')
  const barra = leer('../src/components/BarraHerramientasCanal.vue')
  prueba('apagar «Picos» oculta los puntos (v-if en las dos vistas)', (comp.match(/d\.ajustes\.picos/g) || []).length >= 3 && comp.includes('v-if="d.ajustes.picos"'))
  prueba('apagar «SpO₂» oculta su gráfica (v-if en las dos vistas)', (comp.match(/v-if="d\.ajustes\.spo2"/g) || []).length === 2)
  prueba('«Filtro DSP» decide la serie mostrada', /serieMostrada\(ir, hz\.value, aj\.dsp\)/.test(comp) && /picosDeSerie\(serie, hz\.value\)/.test(comp))
  prueba('barra de herramientas en cada tarjeta y en cada elemento de la leyenda de Juntas', (comp.match(/<BarraHerramientasCanal/g) || []).length === 2)
  prueba('accesibilidad: role=toolbar, aria-pressed, aria-label descriptivos, foco visible', barra.includes('role="toolbar"') && barra.includes(':aria-pressed="ajustes[f.clave]"') && /aria-label="`Capturar la gráfica del canal/.test(barra) && /aria-label="`Exportar los datos del canal/.test(barra) && /focus-visible/.test(barra))
  prueba('los interruptores llevan texto (no solo color o icono)', ['Picos', 'SpO₂', 'Filtro DSP'].every(t => barra.includes(`texto: '${t}'`)) && ['Pausar', 'Reanudar', 'Capturar PNG', 'Exportar'].every(t => barra.includes(t)))
  prueba('móvil: los botones se apilan a ancho completo', /max-width: 600px[\s\S]*flex-direction: column[\s\S]*width: 100%/.test(barra))
  prueba('Capturar y Exportar usan canvas/CSV propios (sin html2canvas)', comp.includes('descargarPngCanal') && comp.includes('descargarCsvCanal') && !/html2canvas/.test(comp + leer('../src/utils/exportarCanal.js')))
  prueba('CSV con el nombre ya mostrado en la tarjeta (sin otros datos del paciente)', /paciente: d\.nombre/.test(comp))
}

console.log('MedicionView: un solo gráfico')
{
  const vista = leer('../src/views/MedicionView.vue')
  prueba('ya no importa ni usa OsciloscopioCanvas', !/OsciloscopioCanvas|<Osciloscopio/.test(vista))
  prueba('no quedan variables sin uso por ese motivo (senalBuffer, repetirMedicionCanal)', !/senalBuffer|repetirMedicionCanal/.test(vista))
  prueba('sigue la gráfica del canal con sus eventos', vista.includes('<GraficasCanalesPropios') && vista.includes('@quitar="quitarCanal"'))
  prueba('el bloque plegable se llama «Valores del canal seleccionado»', vista.includes('Valores del canal seleccionado') && !vista.includes('osciloscopio y valores'))
  prueba('siguen las tarjetas de valores y comparación', ['<ValorBpmCard', '<ValorSpo2Card', '<ComparadorRangoCard', '<AlertaFueraRangoBanner'].every(t => vista.includes(t)))
  prueba('el componente OsciloscopioCanvas.vue no se borró', leer('../src/components/OsciloscopioCanvas.vue').length > 100)
  prueba('flujo docente intacto (agregar canal, finalizar medición)', vista.includes('<CanalesPacientesPanel') && vista.includes('Finalizar Medición y Ver Resultados (Paso 5)'))
}

console.log(`\n${ok} bien, ${mal} mal`)
process.exit(mal ? 1 : 0)
