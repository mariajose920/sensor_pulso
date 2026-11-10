// RF111 · Pruebas de las gráficas de canales propios (por separado / juntas, un color por canal)
//   node scripts/test-rf111-graficas-canales.mjs
import { readFileSync } from 'node:fs'
import {
  COLORES_CANAL, colorDeCanal, canalesGraficables, ofreceElegirVista, vistaEfectiva, puntosPolilinea,
  acumularMuestras, posicionesPicos, trazarSerie, geometriaSerie, textoMetrica, resumenMetricas, ETIQUETA_RUIDO, COLOR_RUIDO, COLOR_RITMO, SEGUNDOS_VENTANA_GRAFICA
} from '../src/utils/graficasCanales.js'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }

const datos = [1, 2, 3, 4, 5].map(canal => ({ canal, ir: [1, 5, 2, 8, 3].map(v => v * canal) }))
const mis = [
  { canal: 1, listo: true },
  { canal: 2, listo: false }, // aún sin ficha/términos/consentimiento
  { canal: 3, listo: true }
]

console.log('Qué canales se grafican')
const g1 = canalesGraficables([mis[0]], datos)
prueba('con un solo canal listo se grafica solo ese', g1.length === 1 && g1[0].canal === 1)
const g = canalesGraficables(mis, datos, c => (c === 3 ? 'Luis' : undefined))
prueba('un canal sin requisitos completos nunca se grafica', !g.some(x => x.canal === 2))
prueba('se grafican los canales listos', g.map(x => x.canal).join() === '1,3')
prueba('trae las muestras de cada canal', g[1].muestras.length === 5 && g[1].muestras[1] === 15)
prueba('trae el nombre de la persona del canal', g[1].nombre === 'Luis' && g[0].nombre === '')
prueba('canal sin datos queda con 0 muestras', canalesGraficables([{ canal: 4, listo: true }], []).at(0).muestras.length === 0)

console.log('Colores')
const colores = Object.values(COLORES_CANAL)
prueba('hay un color por cada canal (1 a 5)', colores.length === 5)
prueba('los 5 colores son distintos', new Set(colores).size === 5)
prueba('cada canal graficado lleva su color', g[0].color === colorDeCanal(1) && g[1].color === colorDeCanal(3) && g[0].color !== g[1].color)

console.log('Vista por separado / juntas')
prueba('con un canal no se ofrece elegir vista', !ofreceElegirVista(g1))
prueba('con dos canales sí se ofrece', ofreceElegirVista(g))
prueba('con un canal siempre es una sola gráfica', vistaEfectiva(g1, 'juntas') === 'separadas')
prueba('con dos canales se respeta «juntas»', vistaEfectiva(g, 'juntas') === 'juntas')
prueba('con dos canales se respeta «separadas»', vistaEfectiva(g, 'separadas') === 'separadas')
prueba('una vista desconocida cae en «separadas»', vistaEfectiva(g, 'otra') === 'separadas')

console.log('Polilínea')
const pts = puntosPolilinea([0, 10], 100, 50, { margen: 5 })
prueba('dos puntos: de abajo a arriba', pts === '0.0,45.0 100.0,5.0')
prueba('menos de 2 muestras no dibuja', puntosPolilinea([1], 100, 50) === '' && puntosPolilinea(null, 100, 50) === '')
prueba('señal plana no rompe (sin NaN)', !puntosPolilinea([5, 5, 5], 100, 50).includes('NaN'))
const a = puntosPolilinea([100, 200], 100, 50)
const b = puntosPolilinea([1000, 2000], 100, 50)
prueba('cada señal se normaliza sola (escalas distintas se superponen)', a === b)

console.log('Métricas visibles por canal (RF111)')
const ext = canalesGraficables([{ canal: 2, listo: true }], [{ canal: 2, ir: [1, 2, 3], rojo: [4, 5, 6], bpm: 72, spo2: 97, calidad: 'buena' }])[0]
prueba('el graficable conserva muestras = ir', ext.muestras === ext.ir && ext.ir.length === 3)
prueba('el graficable trae rojo, bpm, spo2 y calidad', ext.rojo.length === 3 && ext.bpm === 72 && ext.spo2 === 97 && ext.calidad === 'buena')
const sinLectura = canalesGraficables([{ canal: 2, listo: true }], [{ canal: 2, ir: [1], bpm: 0, spo2: 0 }])[0]
prueba('bpm/spo2 en 0 (sin lectura) quedan en null, no se inventan', sinLectura.bpm === null && sinLectura.spo2 === null && sinLectura.calidad === null)
const vacioG = canalesGraficables([{ canal: 1, listo: true }], [])[0]
prueba('canal sin datos: ir/rojo vacíos y bpm null', vacioG.ir.length === 0 && vacioG.rojo.length === 0 && vacioG.bpm === null)
prueba('acumularMuestras agrega y recorta a las últimas', acumularMuestras([1, 2, 3], [4, 5], 4).join() === '2,3,4,5')
prueba('acumularMuestras ignora basura y no revienta', acumularMuestras(null, [1, NaN, 'x', 2]).join() === '1,2' && acumularMuestras(undefined, undefined).length === 0)
const pos = posicionesPicos([0, 10, 0], [{ indice: 1, valor: 10 }], { alto: 100, margen: 10 })
prueba('el pico máximo cae arriba (y = margen) y a mitad del ancho', pos.length === 1 && pos[0].x === 50 && pos[0].y === 10)
prueba('posicionesPicos descarta índices fuera de rango y no da NaN', posicionesPicos([1, 2, 3], [{ indice: 9 }, { indice: -1 }, { indice: 2 }]).length === 1 && !JSON.stringify(posicionesPicos([5, 5, 5], [{ indice: 1 }])).includes('null'))
prueba('textoMetrica muestra «—» sin dato', textoMetrica(null) === '—' && textoMetrica(NaN, 'ms') === '—' && textoMetrica(72, 'BPM') === '72 BPM')
const r0 = resumenMetricas(null)
prueba('resumen sin métricas: todo «—» y 0 picos', r0.bpm === '—' && r0.hrv === '—' && r0.ruido === '—' && r0.ritmo === '—' && r0.spo2 === '—' && r0.pulso === '—' && r0.picos === 0)
const r1 = resumenMetricas({ bpm: 72, hrv: { sdnn: 30, rmssd: 25 }, ruido: { nivel: 'regular' }, ritmo: { clase: 'normal' }, spo2: 97, pulso: 72, picos: [{}, {}] })
prueba('resumen con datos', r1.bpm === '72 BPM' && r1.hrv.includes('SDNN 30') && r1.ruido === ETIQUETA_RUIDO.regular && r1.ritmo === 'Normal' && r1.picos === 2)
prueba('insignias de ruido y ritmo con colores definidos', ['buena', 'regular', 'mala'].every(k => COLOR_RUIDO[k]) && ['normal', 'taquicardia', 'bradicardia', 'irregular'].every(k => COLOR_RITMO[k]))
prueba('ventana de gráfica de varios segundos', SEGUNDOS_VENTANA_GRAFICA >= 3)
const comp = readFileSync(new URL('../src/components/GraficasCanalesPropios.vue', import.meta.url), 'utf8')
prueba('el componente acepta frecuenciaHz y calcula métricas', comp.includes('frecuenciaHz') && comp.includes('calcularMetricasCanal'))
prueba('picos como PUNTO (no triángulo) y gráficos con aria-label', comp.includes('class="punto-pico"') && !comp.includes('class="pico"') && !/border-top: 9px solid/.test(comp) && comp.includes('role="img"') && comp.includes(':aria-label'))
prueba('el punto es un círculo HTML centrado con translate(-50%, -50%)', /\.punto-pico[^}]*border-radius: 50%[^}]*translate\(-50%, -50%\)/.test(comp) && /\.marcas \{[^}]*inset: 0/.test(comp))
prueba('el punto usa la geometría compartida (trazarSerie) y los picos de detectarPicosParaGrafica', comp.includes('trazarSerie(') && comp.includes('picosDeSerie(') && !comp.includes('posicionesPicos') && /detectarPicosParaGrafica/.test(readFileSync(new URL('../src/utils/graficasCanales.js', import.meta.url), 'utf8')))
prueba('la leyenda de texto de picos acompaña al color', comp.includes('leyenda-picos') && comp.includes('textoPicos'))
prueba('curvas con vector-effect non-scaling-stroke', comp.includes('vector-effect="non-scaling-stroke"'))

console.log('Geometría compartida: el punto cae exactamente en el vértice de la polilínea')
{
  const sen = Array.from({ length: 250 }, (_, i) => 5000 + 40 * Math.sin(i / 90) + 300 * Math.max(0, Math.sin((2 * Math.PI * 1.2 * i) / 50)) ** 3)
  const pk = [{ indice: 3 }, { indice: 100 }, { indice: 249 }, { indice: 9999 }, { indice: -1 }, { indice: 1.5 }]
  const t = trazarSerie(sen, 600, 110, { picos: pk })
  const verts = t.polilinea.split(' ').map(q => q.split(',').map(Number))
  prueba('un vértice por muestra y la polilínea sale de geometriaSerie', t.puntos.length === 250 && verts.length === 250 && verts.every((v, i) => v[0] === t.puntos[i].x && v[1] === t.puntos[i].y))
  prueba('se descartan índices inválidos', t.marcas.length === 3)
  prueba('cada marca == vértice de la polilínea en su índice', t.marcas.every(m => verts[m.indice][0] === m.x && verts[m.indice][1] === m.y))
  prueba('xPct/yPct son x/ancho y y/alto en %', t.marcas.every(m => Math.abs(m.xPct - (m.x / 600) * 100) < 1e-9 && Math.abs(m.yPct - (m.y / 110) * 100) < 1e-9))
  const p2 = puntosPolilinea(sen, 600, 110, { margen: 6 })
  const g6 = geometriaSerie(sen, 600, 110, { margen: 6, decimales: 1 })
  prueba('puntosPolilinea y geometriaSerie coinciden', p2 === g6.map(p => p.x.toFixed(1) + ',' + p.y.toFixed(1)).join(' '))
  const pp = posicionesPicos(sen, [{ indice: 100 }], { alto: 110, margen: 6 })
  prueba('posicionesPicos (en %) no tiene desfase con la polilínea', Math.abs(pp[0].x - (geometriaSerie(sen, 100, 110, { margen: 6, decimales: 6 })[100].x)) < 1e-9 && Math.abs(pp[0].y - (geometriaSerie(sen, 600, 110, { margen: 6, decimales: 6 })[100].y / 110) * 100) < 1e-6)
}

console.log('Sensor real, sin valores inventados (MedicionView)')
const vista = readFileSync(new URL('../src/views/MedicionView.vue', import.meta.url), 'utf8')
prueba('ya no hay canales de relleno con valores falsos', !vista.includes('canalesPorDefecto'))
prueba('hay aviso «Sensor no detectado»', vista.includes('data-testid="sensor-no-detectado"'))
prueba('gráficas y valores solo con sensor detectado', vista.includes('canalSeleccionadoListo.value && sensorDetectado.value') && vista.includes('v-if="(sensorDetectado || perdioConexion) && graficablesPropios.length >= 1"'))
prueba('sin lecturas reales no se generan resultados', vista.includes('if (!bpmMedio || !spo2Medio) return'))

console.log(`\n${ok} bien, ${mal} mal`)
process.exit(mal ? 1 : 0)
