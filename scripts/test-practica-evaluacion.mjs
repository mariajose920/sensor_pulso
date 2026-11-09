// Práctica para evaluaciones: banco de preguntas, corrección y acceso sin sesión.
// Uso: node scripts/test-practica-evaluacion.mjs
import { readFileSync } from 'node:fs'

let fallos = 0
const marcar = (ok, texto) => { if (!ok) fallos++; console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`) }
const lee = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

const { PREGUNTAS_PRACTICA } = await import('../src/data/practicaEvaluacion.js')
const { LECCIONES } = await import('../src/data/lecciones.js')
const { armarPractica, corregirPractica, barajar, valoracion } = await import('../src/utils/practica.js')

// Banco
const ids = PREGUNTAS_PRACTICA.map(p => p.id)
marcar(PREGUNTAS_PRACTICA.length >= 112, `El banco tiene suficientes preguntas (${PREGUNTAS_PRACTICA.length})`)
marcar(new Set(ids).size === ids.length, 'Los ids de las preguntas no se repiten')
marcar(PREGUNTAS_PRACTICA.every(p => LECCIONES.some(l => l.slug === p.leccion)), 'Cada pregunta apunta a una lección de estudio que existe')
const SITIO = /plataforma|aplicaci[oó]n|sitio web|p[aá]gina|inici(o|ar) (de )?sesi[oó]n|sin sesi[oó]n|tu cuenta|historial|administrador|token|simulador|galer[ií]a|consentimiento|navegador|aula|profesor|estudiante/i
const textos = PREGUNTAS_PRACTICA.flatMap(p => [p.enunciado, ...p.opciones.flatMap(o => [o.texto, o.porQue])])
const culpables = textos.filter(t => SITIO.test(t))
marcar(culpables.length === 0, 'Ninguna pregunta ni explicación habla del sitio web (cuentas, historial, aulas, administrador…)' + (culpables.length ? ' → ' + culpables[0] : ''))
marcar(LECCIONES.every(l => PREGUNTAS_PRACTICA.some(p => p.leccion === l.slug)), 'Todas las lecciones tienen preguntas')
marcar(PREGUNTAS_PRACTICA.every(p => p.opciones.length === 4 && p.opciones.filter(o => o.correcta).length === 1), 'Cada pregunta tiene 4 opciones y exactamente una correcta')
marcar(PREGUNTAS_PRACTICA.every(p => p.opciones.every(o => o.porQue && o.porQue.length > 15)), 'Toda opción explica por qué es correcta o incorrecta')
marcar(PREGUNTAS_PRACTICA.every(p => p.opciones.some(o => !o.correcta && /correct/i.test(o.porQue) === false)), 'Las explicaciones de los errores no se hacen pasar por la respuesta correcta')

// Cantidades: de 4 en 4, hasta 16 por tema y hasta 28 con todos los temas
const { opcionesDeCantidad } = await import('../src/utils/practica.js')
marcar(LECCIONES.every(l => PREGUNTAS_PRACTICA.filter(p => p.leccion === l.slug).length >= 16), 'Cada tema tiene al menos 16 preguntas')
marcar(LECCIONES.every(l => JSON.stringify(opcionesDeCantidad(PREGUNTAS_PRACTICA, l.slug)) === '[4,8,12,16]'), 'Por tema se ofrece 4, 8, 12 y 16 preguntas')
marcar(JSON.stringify(opcionesDeCantidad(PREGUNTAS_PRACTICA, 'todas')) === '[4,8,12,16,20,24,28]', 'Con todos los temas se ofrece de 4 en 4 hasta 28')
for (const l of LECCIONES) {
  const grande = armarPractica(PREGUNTAS_PRACTICA, { cantidad: 16, leccion: l.slug })
  marcar(grande.length === 16 && new Set(grande.map(p => p.id)).size === 16 && grande.every(p => p.leccion === l.slug), `16 preguntas distintas de «${l.slug}»`)
}
const todas28 = armarPractica(PREGUNTAS_PRACTICA, { cantidad: 28, leccion: 'todas' })
const porTema = {}
todas28.forEach(p => { porTema[p.leccion] = (porTema[p.leccion] || 0) + 1 })
marcar(todas28.length === 28 && new Set(todas28.map(p => p.id)).size === 28, '28 preguntas distintas con todos los temas')
marcar(LECCIONES.every(l => porTema[l.slug] === 4), 'Con 28 se reparten 4 preguntas por cada tema')
const todas4 = armarPractica(PREGUNTAS_PRACTICA, { cantidad: 4, leccion: 'todas' })
marcar(todas4.length === 4 && new Set(todas4.map(p => p.leccion)).size === 4, 'Con pocas preguntas se mezclan temas distintos')

// Cálculos de las preguntas numéricas
const bpmDe = (ms) => 60000 / ms
const res1 = PREGUNTAS_PRACTICA.find(p => p.id === 'res-1').opciones.find(o => o.correcta).texto
const res2 = PREGUNTAS_PRACTICA.find(p => p.id === 'res-2').opciones.find(o => o.correcta).texto
marcar(res1.startsWith(String(bpmDe(800))) && res2.startsWith(String(bpmDe(600))), 'Las respuestas de BPM coinciden con 60 000 ÷ intervalo')

// Armado
let semilla = 7
const azarFijo = () => { semilla = (semilla * 16807) % 2147483647; return semilla / 2147483647 }
const cuestionario = armarPractica(PREGUNTAS_PRACTICA, { cantidad: 8 }, azarFijo)
marcar(cuestionario.length === 8 && new Set(cuestionario.map(p => p.id)).size === 8, 'Arma la cantidad pedida sin repetir preguntas')
marcar(cuestionario.every(p => p.opciones.filter(o => o.correcta).length === 1), 'Al barajar las opciones se conserva la correcta')
const soloSpo2 = armarPractica(PREGUNTAS_PRACTICA, { cantidad: 50, leccion: 'saturacion-de-oxigeno' })
marcar(soloSpo2.length > 0 && soloSpo2.every(p => p.leccion === 'saturacion-de-oxigeno'), 'Filtra por lección y no pide más de las que hay')
marcar(barajar([1, 2, 3, 4, 5]).length === 5, 'Barajar conserva los elementos')
marcar(armarPractica(PREGUNTAS_PRACTICA, { ids: ['fc-1', 'fc-2'] }).length === 2, 'Puede rearmar una práctica solo con ciertas preguntas')
const original = PREGUNTAS_PRACTICA[0].opciones.map(o => o.texto).join('|')
armarPractica(PREGUNTAS_PRACTICA, { cantidad: 30 })
marcar(PREGUNTAS_PRACTICA[0].opciones.map(o => o.texto).join('|') === original, 'Armar la práctica no altera el banco original')

// Corrección: todo bien, un error, sin responder
const indiceCorrecto = (p) => p.opciones.findIndex(o => o.correcta)
const indiceMalo = (p) => p.opciones.findIndex(o => !o.correcta)
const todasBien = Object.fromEntries(cuestionario.map(p => [p.id, indiceCorrecto(p)]))
const r1 = corregirPractica(cuestionario, todasBien)
marcar(r1.correctas === 8 && r1.porcentaje === 100 && r1.leccionesARepasar.length === 0, 'Con todo correcto: 100 % y nada que repasar')

const [a, b, c] = cuestionario
const mixtas = { [a.id]: indiceCorrecto(a), [b.id]: indiceMalo(b) } // c y el resto sin responder
const r2 = corregirPractica(cuestionario, mixtas)
const detB = r2.detalle.find(d => d.id === b.id)
marcar(r2.correctas === 1 && r2.incorrectas === 1 && r2.sinResponder === 6, 'Cuenta correctas, incorrectas y sin responder')
marcar(!detB.ok && detB.elegida === b.opciones[indiceMalo(b)].texto && detB.porQueFalla === b.opciones[indiceMalo(b)].porQue, 'En un error indica lo que eligió y por qué estaba mal')
marcar(detB.correcta === b.opciones[indiceCorrecto(b)].texto && detB.porQueCorrecta.length > 0, 'En un error indica la respuesta correcta y su explicación')
const detC = r2.detalle.find(d => d.id === c.id)
marcar(detC.sinResponder && !detC.ok && detC.porQueFalla === '', 'Una pregunta sin responder no inventa un error')
marcar(r2.leccionesARepasar.includes(b.leccion) && r2.idsFalladas.includes(b.id) && !r2.idsFalladas.includes(a.id), 'Sugiere repasar las lecciones de lo fallado')
marcar(corregirPractica([], {}).porcentaje === 0, 'Corregir una práctica vacía no falla')
marcar(valoracion(90) !== valoracion(70) && valoracion(70) !== valoracion(20), 'Hay una valoración distinta según el puntaje')

// Acceso: abierta sin sesión y enlazada desde Aprendizaje
const router = lee('../src/router/index.js')
const i = router.indexOf("name: 'Practica'")
const bloque = i < 0 ? '' : router.slice(router.lastIndexOf('{', i), router.indexOf('},', i) + 2)
marcar(/path: '\/aprendizaje\/practica'/.test(bloque) && !/requiresAuth/.test(bloque), 'La ruta de práctica no exige sesión')
marcar(router.indexOf("path: '/aprendizaje/practica'") < router.indexOf("path: '/aprendizaje/:slug'"), 'La ruta de práctica va antes de la lección (no se toma como slug)')
const { ENLACES_SOLO_CON_SESION } = await import('../src/utils/accesoSinSesion.js')
marcar(!ENLACES_SOLO_CON_SESION.some(r => r.startsWith('/aprendizaje')), 'Aprendizaje no está entre los enlaces solo con sesión')
const apr = lee('../src/views/AprendizajeView.vue')
marcar(/to="\/aprendizaje\/practica"/.test(apr) && /data-testid="boton-practica-evaluacion"/.test(apr), 'Aprendizaje tiene el botón para practicar')
const vista = lee('../src/views/PracticaView.vue')
marcar(!/useAuth|isAuthenticated|localStorage|supabase/i.test(vista), 'La vista de práctica no depende de la sesión ni guarda datos')
marcar(/data-testid="por-que-fallo"/.test(vista) && /porQueFalla/.test(vista), 'La vista muestra por qué se equivocó')

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1) }
console.log('\nPráctica para evaluaciones: todas las pruebas pasaron')
