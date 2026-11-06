// Prueba del RF22: explicar cómo se obtienen el BPM y la SpO₂.
//   node scripts/test-rf22-explicacion.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import {
  PASOS_BPM,
  PASOS_SPO2,
  NOTA_INTENSIDAD,
  ejemploBpm,
  ejemploSpo2,
  formatoDecimal
} from '../src/data/explicacionResultados.js'

const raiz = join(dirname(fileURLToPath(import.meta.url)), '..')
const leer = (ruta) => readFileSync(join(raiz, ruta), 'utf8')

let fallos = 0
function prueba(nombre, condicion) {
  if (condicion) console.log('  OK  ' + nombre)
  else { console.error('  FALLA  ' + nombre); fallos++ }
}
const todo = (pasos) => pasos.map((p) => `${p.titulo} ${p.texto} ${p.formula || ''}`).join(' ').toLowerCase()

console.log('RF22 · Cómo se obtienen BPM y SpO₂')

// 1. Cadena del BPM: luz infrarroja → intensidad → picos → intervalos → BPM
const bpm = todo(PASOS_BPM)
prueba('BPM: 5 pasos', PASOS_BPM.length === 5)
prueba('BPM: nombra la luz infrarroja de 880 nm', bpm.includes('infrarroja') && bpm.includes('880 nm'))
prueba('BPM: explica la intensidad reflejada', bpm.includes('intensidad'))
prueba('BPM: explica los picos y los intervalos', bpm.includes('picos') && bpm.includes('intervalo'))
prueba('BPM: da la fórmula 60 000 ÷ intervalo', PASOS_BPM.some((p) => p.formula === 'BPM = 60 000 ÷ intervalo (ms)'))
prueba('BPM: los pasos siguen el orden luz, intensidad, picos, intervalos, BPM',
  ['infrarroja', 'intensidad', 'picos', 'intervalos', 'bpm'].every((k, i) => PASOS_BPM[i].titulo.toLowerCase().includes(k)))

// 2. Cadena de la SpO₂: luz roja e infrarroja → absorción → razón → porcentaje
const spo2 = todo(PASOS_SPO2)
prueba('SpO₂: 4 pasos', PASOS_SPO2.length === 4)
prueba('SpO₂: nombra la luz roja de 660 nm y la infrarroja de 880 nm', spo2.includes('660 nm') && spo2.includes('880 nm'))
prueba('SpO₂: explica la absorción distinta de la hemoglobina', spo2.includes('hemoglobina') && spo2.includes('absorbe'))
prueba('SpO₂: da la razón R con AC y DC', spo2.includes('ac rojo') && spo2.includes('dc infrarrojo'))
prueba('SpO₂: da la curva 110 − 25 × R y avisa que es aproximada', spo2.includes('110 − 25 × r') && spo2.includes('aproximada'))
prueba('SpO₂: no habla de 940 nm (el MAX30102 usa 880 nm)', !spo2.includes('940'))

// 3. Aclaración pedida: el sensor entrega intensidad, no nanómetros
prueba('Aclara que los nm son la longitud de onda y el sensor entrega intensidad',
  NOTA_INTENSIDAD.includes('longitud de onda') && NOTA_INTENSIDAD.includes('intensidad'))

// 4. Ejemplos con los números de la persona
prueba('75 BPM = un pico cada 800 ms', ejemploBpm(75)?.intervaloMs === 800)
prueba('60 BPM = un pico cada 1000 ms', ejemploBpm(60)?.intervaloMs === 1000)
prueba('BPM 0 o inválido no da ejemplo', ejemploBpm(0) === null && ejemploBpm(NaN) === null && ejemploBpm(undefined) === null)
const e1 = ejemploSpo2(98, 0.48)
prueba('SpO₂ 98 % con R medida 0,48 usa la R medida', e1?.medida === true && e1.r === 0.48)
const e2 = ejemploSpo2(98, 0)
prueba('SpO₂ 98 % sin R calcula la R equivalente (0,48)', e2?.medida === false && e2.r === 0.48)
const e3 = ejemploSpo2(95, 0.48)
prueba('Si la R medida no cuadra con la SpO₂ se usa la equivalente', e3?.medida === false && e3.r === 0.6)
prueba('La R equivalente reproduce la SpO₂ con la curva', Math.round(110 - 25 * ejemploSpo2(92, 0).r) === 92)
prueba('SpO₂ inválida no da ejemplo', ejemploSpo2(0, 0.5) === null && ejemploSpo2(120, 0.5) === null && ejemploSpo2(NaN, 0.5) === null)
prueba('Los decimales van con coma', formatoDecimal(0.48) === '0,48')

// 5. Las curvas coinciden con las del servicio de la aplicación
const spo2Servicio = leer('src/services/spo2Service.js')
const bpmServicio = leer('src/services/bpmService.js')
prueba('La curva de la explicación es la del servicio de SpO₂ (110 − 25·R)', /110 - 25 \* R/.test(spo2Servicio))
prueba('La conversión de la explicación es la del servicio de BPM (60000 / intervalo)', /60000 \/ /.test(bpmServicio))

// 6. Dónde se muestra
const comp = leer('src/components/ExplicacionResultados.vue')
prueba('El componente tiene los tres modos (bpm, spo2, ambos)', ['bpm', 'spo2', 'ambos'].every((m) => comp.includes(`'${m}'`)))
prueba('El componente muestra el ejemplo y la aclaración', comp.includes('ejemplo-bpm') && comp.includes('ejemplo-spo2') && comp.includes('nota-intensidad'))
prueba('Tarjeta de BPM usa la explicación', leer('src/components/ValorBpmCard.vue').includes('<ExplicacionResultados tipo="bpm"'))
prueba('Tarjeta de SpO₂ usa la explicación', leer('src/components/ValorSpo2Card.vue').includes('<ExplicacionResultados tipo="spo2"'))
const medicion = leer('src/views/MedicionView.vue')
prueba('Resultados de la medición (paso 5) la muestran con BPM y SpO₂', /<ExplicacionResultados\s+tipo="ambos"\s+:bpm="resultadosFinales\.bpm"\s+:spo2="resultadosFinales\.spo2"/.test(medicion))
prueba('Ya no queda la fórmula con símbolos sin renderizar ($P_{sys}$)', !leer('src/components/ValorBpmCard.vue').includes('$P_{sys}$'))

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1) }
console.log('\nTodas las pruebas pasaron')
