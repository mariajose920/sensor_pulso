// RF46 · Prueba de la lógica del panel de administración (método de sincronización y contenidos).
// Uso: node scripts/test-rf46-panel.mjs
import { LECCIONES } from '../src/data/lecciones.js'
import {
  METODOS_SINCRONIZACION, METODO_POR_DEFECTO, metodoValido, validarLeccion, parsearBloques,
  combinarLecciones, describirPropuesta
} from '../src/utils/panelAdmin.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}

// Método de sincronización: los mismos que deja la migración de datos iniciales
marcar(JSON.stringify(Object.keys(METODOS_SINCRONIZACION)) === JSON.stringify(['correlacion_cruzada', 'alineacion_por_picos', 'dtw']),
  'Los métodos coinciden con metodos_sincronizacion_disponibles de la base')
marcar(metodoValido('dtw') === 'dtw', 'Un método disponible se acepta')
marcar(metodoValido('inventado') === METODO_POR_DEFECTO, 'Un método desconocido vuelve al de por defecto')
marcar(metodoValido('dtw', ['correlacion_cruzada']) === METODO_POR_DEFECTO, 'Un método no habilitado vuelve al de por defecto')

// Validación de lecciones: las precargadas deben ser editables sin errores
const base = LECCIONES[0]
marcar(LECCIONES.every((l) => validarLeccion(l).length === 0), 'Todas las lecciones precargadas son válidas')
marcar(validarLeccion({ ...base, titulo: '  ' }).length === 1, 'Título vacío se rechaza')
marcar(validarLeccion({ ...base, resumen: '' }).length === 1, 'Resumen vacío se rechaza')
marcar(validarLeccion({ ...base, categoria: 'x' }).length === 1, 'Categoría inexistente se rechaza')
marcar(validarLeccion({ ...base, minutos: 0 }).length === 1, 'Minutos fuera de rango se rechazan')
marcar(validarLeccion({ ...base, slug: 'Mal Slug' }).length === 1, 'Slug no apto se rechaza')
marcar(validarLeccion({ ...base, bloques: [] }).length === 1, 'Lección sin bloques se rechaza')
marcar(validarLeccion({ ...base, bloques: [{ tipo: 'video' }] }).length === 1, 'Bloque de tipo desconocido se rechaza')

// Editor de bloques
marcar(parsearBloques('no es json').error, 'JSON inválido da error')
marcar(parsearBloques('{"a":1}').error, 'Un objeto (no lista) da error')
marcar(Array.isArray(parsearBloques(JSON.stringify(base.bloques)).bloques), 'La lista de bloques se lee bien')

// Combinar lecciones precargadas con cambios de la base
marcar(combinarLecciones(LECCIONES, []).length === LECCIONES.length, 'Sin cambios en la base quedan las precargadas')
const cambio = { slug: base.slug, titulo: 'Título nuevo', categoria: base.categoria, publicada: true,
  contenido: { resumen: 'Resumen nuevo', minutos: 9, bloques: [{ tipo: 'texto', texto: 'Hola' }] } }
const unida = combinarLecciones(LECCIONES, [cambio])
marcar(unida[0].titulo === 'Título nuevo' && unida[0].resumen === 'Resumen nuevo' && unida[0].minutos === 9 && unida[0].bloques.length === 1,
  'Un cambio aprobado reemplaza título, resumen, minutos y bloques')
marcar(unida.length === LECCIONES.length && unida[1].slug === LECCIONES[1].slug, 'Las demás lecciones y el orden no cambian')
marcar(combinarLecciones(LECCIONES, [{ ...cambio, publicada: false }]).length === LECCIONES.length - 1, 'Una lección despublicada se oculta')
marcar(combinarLecciones(LECCIONES, [{ slug: base.slug, titulo: 'X', categoria: 'zzz', contenido: [] }])[0].bloques === base.bloques,
  'Un contenido mal formado en la base no rompe la lección precargada')
marcar(combinarLecciones(LECCIONES, [{ slug: 'otra', titulo: 'X', categoria: 'bpm', contenido: {}, publicada: true }]).length === LECCIONES.length,
  'Una fila con slug desconocido se ignora')

// Descripción de propuestas
marcar(describirPropuesta({ tipo: 'metodo_sync', propuesta: { metodo: 'dtw' } }).includes('DTW'), 'Describe una propuesta de método')
marcar(describirPropuesta({ tipo: 'leccion', entidad_id: 'esp32', propuesta: { titulo: 'ESP32', contenido: { bloques: [1, 2] } } }).includes('2 bloques'), 'Describe una propuesta de lección')

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1) }
console.log('\nRF46: todas las pruebas pasaron')
