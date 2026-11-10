// SpO2 mostrada: mediana de lecturas válidas, sin saltos y sin inventar valores
//   node scripts/test-spo2-estable.mjs
import { readFileSync } from 'node:fs'
import { crearEstabilizadorSpo2, PARAMETROS_ESTABILIZADOR_SPO2 } from '../src/utils/estabilizadorSpo2.js'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }

console.log('Lecturas válidas')
{
  const e = crearEstabilizadorSpo2()
  prueba('sin lecturas no hay valor', e.actualizar(undefined, 0) === null && e.valor() === null)
  prueba('0 y fuera de rango son «sin lectura», no un valor', e.actualizar(0, 1000) === null && e.actualizar(55, 2000) === null && e.actualizar(120, 3000) === null && e.actualizar(NaN, 4000) === null)
  prueba('la primera lectura válida se muestra tal cual', e.actualizar(97.5, 5000) === 97.5)
}

console.log('Estabilidad')
{
  const e = crearEstabilizadorSpo2()
  let t = 0
  const ver = (v) => { t += 2000; return e.actualizar(v, t) }
  ;[97, 97, 98, 97, 97].forEach(ver)
  prueba('un valor aislado muy distinto casi no mueve el número (mediana)', ver(88) === 97 || Math.abs(ver(97) - 97) <= 1)
  const e2 = crearEstabilizadorSpo2()
  let t2 = 0
  const salida = []
  for (const v of [97, 96, 98, 97, 85, 97, 98, 96, 97, 90, 97]) { t2 += 2000; salida.push(e2.actualizar(v, t2)) }
  const saltos = salida.slice(1).map((x, i) => Math.abs(x - salida[i]))
  prueba('con lecturas ruidosas el número cambia como mucho 2 puntos por actualización', Math.max(...saltos) <= PARAMETROS_ESTABILIZADOR_SPO2.maxPaso + 1e-9)
  prueba('y la dispersión mostrada es menor que la de las lecturas', (() => {
    const sd = (v) => { const m = v.reduce((a, b) => a + b) / v.length; return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / v.length) }
    return sd(salida) < sd([97, 96, 98, 97, 85, 97, 98, 96, 97, 90, 97])
  })())
  const e3 = crearEstabilizadorSpo2()
  prueba('una lectura repetida dentro de 1,5 s no cuenta dos veces', (() => { e3.actualizar(95, 0); e3.actualizar(95, 200); e3.actualizar(99, 400); return e3.valor() === 95 })())
}

console.log('Sin lectura')
{
  const e = crearEstabilizadorSpo2()
  e.actualizar(97, 0)
  prueba('un 0 aislado no borra el número de golpe (aguanta 6 s)', e.actualizar(0, 3000) === 97)
  prueba('pasados 6 s sin lectura válida pasa a «sin lectura»', e.actualizar(0, 7000) === null && e.valor() === null)
  prueba('al volver una lectura válida se retoma desde cero (no un valor viejo)', e.actualizar(96, 9000) === 96)
  const f = crearEstabilizadorSpo2()
  f.actualizar(97, 0); f.reiniciar()
  prueba('reiniciar borra todo', f.valor() === null && f.actualizar(0, 1000) === null)
}

console.log('Servicio')
const servicio = readFileSync(new URL('../src/services/esp32Service.js', import.meta.url), 'utf8')
prueba('la SpO2 de cada canal (WiFi y USB) pasa por el estabilizador', servicio.includes("import { crearEstabilizadorSpo2 }") && servicio.includes('e.estabSpo2.actualizar(c.spo2, ahora)') && servicio.includes('spo2: pulso.spo2'))
prueba('sin dedo la SpO2 es «sin lectura»', /sin_dedo[\s\S]{0,300}spo2: null/.test(servicio))
prueba('se conserva lo que mandó la placa (solo informativo)', servicio.includes('spo2Placa'))

console.log(`\n${ok} bien, ${mal} mal`)
process.exit(mal ? 1 : 0)
