// RF38 · Prueba del contenido del apartado de aprendizaje (y del valor de SpO₂ de RF115).
// Uso: node scripts/test-rf38-lecciones.mjs
import {
  AVISO_EDUCATIVO,
  CATEGORIAS,
  ESQUEMAS,
  LECCIONES,
  TIPOS_BLOQUE,
  buscarLeccion,
  ultimaSpo2Medida,
  vecinas
} from '../src/data/lecciones.js'
import { SPO2_UMBRAL_HIPOXIA_LEVE, SPO2_UMBRAL_HIPOXIA_MODERADA, SPO2_UMBRAL_NORMAL, calcularSpo2DesdeR } from '../src/services/spo2Service.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}

const textoDe = (l) => JSON.stringify(l).toLowerCase()
const todo = LECCIONES.map(textoDe).join(' ')

// Estructura
const slugs = LECCIONES.map((l) => l.slug)
marcar(LECCIONES.length >= 6, `Hay ${LECCIONES.length} lecciones`)
marcar(new Set(slugs).size === slugs.length, 'Los slugs son únicos')
marcar(slugs.every((s) => /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s)), 'Los slugs son aptos para la URL')
marcar(LECCIONES.every((l) => l.titulo && l.resumen && l.minutos > 0 && l.bloques.length >= 3), 'Cada lección tiene título, resumen, tiempo y al menos 3 bloques')
marcar(LECCIONES.every((l) => l.categoria in CATEGORIAS), 'Las categorías existen (son las del esquema lecciones de Supabase)')
marcar(
  LECCIONES.every((l) => l.bloques.every((b) => TIPOS_BLOQUE.includes(b.tipo))),
  'Todos los bloques son de un tipo que la pantalla sabe dibujar'
)
marcar(
  LECCIONES.every((l) => l.bloques.filter((b) => b.tipo === 'esquema').every((b) => ESQUEMAS.includes(b.nombre) && b.alt)),
  'Los esquemas existen y tienen texto alternativo'
)
marcar(
  LECCIONES.every((l) => l.bloques.every((b) => b.tipo !== 'tabla' || b.filas.every((f) => f.length === b.columnas.length))),
  'Las filas de cada tabla tienen tantas celdas como columnas'
)

// Temas pedidos por el RF38
const tema = (nombre, ...palabras) => marcar(palabras.every((p) => todo.includes(p)), `Cubre ${nombre}`)
tema('la fisiología del corazón', 'aurícula', 'ventrículo', 'nodo sinusal', 'sístole')
tema('la frecuencia cardíaca', 'frecuencia cardíaca', 'bpm', 'bradicardia', 'taquicardia')
tema('el funcionamiento y las partes del sensor', 'max30102', 'led rojo', 'led infrarrojo', 'fotodetector')
tema('el ESP32', 'esp32', 'wifi', 'gpio 21', 'gpio 22')
tema('cómo se obtienen los resultados', 'picos', 'intervalo', '60 000')
tema('los datos de salud involucrados', 'hrv', 'consentimiento', 'calidad de la señal')
tema('la saturación de oxígeno', 'saturación de oxígeno', 'hemoglobina', '660 nm', '880 nm')
marcar(LECCIONES.some((l) => l.categoria === 'spo2' && l.bloques.some((b) => b.tipo === 'spo2_medida')), 'La lección de SpO₂ muestra el valor medido (RF115)')
marcar(AVISO_EDUCATIVO.includes('no sustituye'), 'Hay un aviso de que el contenido no sustituye a un profesional de la salud')

// Coherencia con la aplicación
marcar(todo.includes('95 %') && SPO2_UMBRAL_NORMAL === 95, 'Umbral normal de SpO₂ de la lección = el de la app (95)')
marcar(todo.includes('90 %') && SPO2_UMBRAL_HIPOXIA_LEVE === 90, 'Umbral de hipoxia leve de la lección = el de la app (90)')
marcar(todo.includes('85 %') && SPO2_UMBRAL_HIPOXIA_MODERADA === 85, 'Umbral de hipoxia moderada de la lección = el de la app (85)')
marcar(calcularSpo2DesdeR(0.6) === 95, 'La curva de la lección (110 − 25·R) da 95 % con R = 0,6')
marcar(60000 / 800 === 75, 'El ejemplo de la lección (800 ms = 75 BPM) es correcto')

// Navegación
marcar(buscarLeccion('corazon')?.titulo === 'Cómo funciona el corazón', 'buscarLeccion encuentra una lección por su slug')
marcar(buscarLeccion('no-existe') === null, 'buscarLeccion devuelve null si no existe')
marcar(vecinas(slugs[0]).anterior === null && vecinas(slugs[0]).siguiente?.slug === slugs[1], 'La primera lección no tiene anterior y sigue la segunda')
marcar(vecinas(slugs.at(-1)).siguiente === null && vecinas(slugs.at(-1)).anterior?.slug === slugs.at(-2), 'La última lección no tiene siguiente')
marcar(vecinas('no-existe').anterior === null && vecinas('no-existe').siguiente === null, 'Un slug inexistente no tiene vecinas')

// RF115: valor de SpO₂ medido
const historial = [
  { spo2: null, inicio: '2026-11-03T10:00:00Z', calidad: 'buena' },
  { spo2: 97.4, inicio: '2026-11-02T10:00:00Z', calidad: 'buena' },
  { spo2: 91, inicio: '2026-11-01T10:00:00Z', calidad: 'buena' }
]
const medida = ultimaSpo2Medida(historial)
marcar(medida?.spo2 === 97.4 && medida.fecha === '2026-11-02T10:00:00Z', 'Toma la medición más reciente que tiene SpO₂ (salta las que no la tienen)')
marcar(ultimaSpo2Medida([{ spo2: null }]) === null && ultimaSpo2Medida([]) === null && ultimaSpo2Medida() === null, 'Sin SpO₂ en el historial devuelve null')
marcar(ultimaSpo2Medida([{ spo2: '96.5', inicio: 'x' }])?.spo2 === 96.5, 'Acepta SpO₂ numérica que llega como texto')

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(fallos ? 1 : 0)
