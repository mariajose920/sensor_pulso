// RF109 · Pruebas del tiempo que falta para que una evaluación se abra o se cierre (pantalla del estudiante).
// Uso: node scripts/test-tiempo-evaluacion.mjs
import { readFileSync } from 'node:fs'
import { formatearDuracion, tiempoEvaluacion, tiempoParaEntregar, cambioPorTiempo } from '../src/utils/tiempoEvaluacion.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}

const ahora = new Date('2026-11-13T12:00:00Z').getTime()
const en = (ms) => new Date(ahora + ms).toISOString()
const MIN = 60 * 1000
const H = 60 * MIN
const D = 24 * H

// --- Duración legible
marcar(formatearDuracion(45 * 1000) === '45 s', '45 segundos se muestran como «45 s»')
marcar(formatearDuracion(12 * MIN + 5000) === '12 min 05 s', 'Minutos y segundos con segundos de dos cifras')
marcar(formatearDuracion(3 * H + 5 * MIN) === '3 h 05 min', 'Horas y minutos')
marcar(formatearDuracion(2 * D + 3 * H + 15 * MIN) === '2 d 3 h 15 min', 'Días, horas y minutos')
marcar(formatearDuracion(-500) === '0 s' && formatearDuracion('x') === '0 s', 'Un valor negativo o inválido se muestra como 0 s')

// --- Evaluación que aún no abre
let t = tiempoEvaluacion({ disponibilidad: 'pendiente', modo: 'ventana', abre_en: en(2 * D + 3 * H) }, ahora)
marcar(t.tipo === 'espera' && t.texto === 'Estará disponible en 2 d 3 h 0 min', 'Una evaluación con apertura futura dice en cuánto tiempo estará disponible')
t = tiempoEvaluacion({ disponibilidad: 'pendiente', modo: 'ventana', abre_en: en(90 * 1000) }, ahora)
marcar(t.texto === 'Estará disponible en 1 min 30 s', 'Cuando falta poco cuenta los segundos')
t = tiempoEvaluacion({ disponibilidad: 'pendiente', modo: 'en_vivo', abre_en: null }, ahora)
marcar(/cuando tu profesor la inicie/.test(t.texto), 'Una evaluación en vivo sin iniciar avisa que depende del profesor')
t = tiempoEvaluacion({ disponibilidad: 'pendiente', modo: 'ventana', abre_en: en(-1000) }, ahora)
marcar(/unos instantes/.test(t.texto), 'Si la hora de apertura ya llegó pero el estado aún no cambia, dice «en unos instantes»')

// --- Evaluación abierta
t = tiempoEvaluacion({ disponibilidad: 'disponible', modo: 'ventana', cierra_en: en(2 * H) }, ahora)
marcar(t.tipo === 'abierta' && t.texto === 'Disponible ahora · se cierra en 2 h 00 min', 'Una evaluación abierta dice en cuánto se cierra')
t = tiempoEvaluacion({ disponibilidad: 'disponible', modo: 'ventana', cierra_en: en(8 * MIN) }, ahora)
marcar(t.tipo === 'urgente', 'Con 10 minutos o menos se marca como urgente')
t = tiempoEvaluacion({ disponibilidad: 'disponible', modo: 'ventana', cierra_en: en(-5000) }, ahora)
marcar(t.tipo === 'agotada', 'Con el cierre ya pasado se indica que se acabó el tiempo')
t = tiempoEvaluacion({ disponibilidad: 'disponible', modo: 'ventana', cierra_en: null }, ahora)
marcar(t.texto === 'Disponible ahora', 'Sin fecha de cierre solo dice que está disponible')

// --- Estados sin cuenta regresiva
marcar(tiempoEvaluacion({ disponibilidad: 'entregada', cierra_en: en(H) }, ahora) === null, 'Una evaluación entregada no muestra cuenta regresiva')
marcar(tiempoEvaluacion({ disponibilidad: 'cerrada' }, ahora) === null && tiempoEvaluacion(null, ahora) === null, 'Una evaluación cerrada no muestra cuenta regresiva')

// --- Mientras se rinde
t = tiempoParaEntregar({ cierra_en: en(25 * MIN) }, ahora)
marcar(t.tipo === 'abierta' && t.texto === 'Tiempo restante: 25 min 00 s', 'Al rendir se muestra el tiempo restante')
marcar(tiempoParaEntregar({ cierra_en: en(4 * MIN) }, ahora).tipo === 'urgente', 'Con 5 minutos o menos se marca urgente')
marcar(tiempoParaEntregar({ cierra_en: en(-1) }, ahora).tipo === 'agotada', 'Si se agotó el tiempo, se pide entregar ya')
marcar(tiempoParaEntregar({ cierra_en: null }, ahora) === null, 'Sin cierre no hay tiempo restante que mostrar')

// --- Recargar cuando el tiempo cambia el estado
marcar(cambioPorTiempo({ disponibilidad: 'pendiente', abre_en: en(-1000) }, ahora) === 'abrio', 'Cuando llega la hora de apertura se pide el listado de nuevo')
marcar(cambioPorTiempo({ disponibilidad: 'disponible', cierra_en: en(-1000) }, ahora) === 'cerro', 'Cuando llega la hora de cierre se pide el listado de nuevo')
marcar(cambioPorTiempo({ disponibilidad: 'pendiente', abre_en: en(5000) }, ahora) === null && cambioPorTiempo({ disponibilidad: 'entregada', cierra_en: en(-1000) }, ahora) === null, 'Si no cambia nada por el tiempo, no se vuelve a pedir')

// --- La pantalla lo usa
const vista = readFileSync(new URL('../src/views/MisEvaluacionesView.vue', import.meta.url), 'utf8')
marcar(/data-testid="tiempo-evaluacion"/.test(vista) && /tiempoDe\(ev\)/.test(vista), 'Cada tarjeta de Mis evaluaciones muestra cuánto falta')
marcar(/data-testid="tiempo-restante"/.test(vista) && /role="timer"/.test(vista), 'Al rendir se muestra el tiempo restante')
marcar(/setInterval\(/.test(vista) && /clearInterval\(relojTiempo\)/.test(vista), 'El reloj se actualiza cada segundo y se detiene al salir de la pantalla')

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(fallos ? 1 : 0)
