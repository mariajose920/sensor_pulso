// Informe PDF: estructura, caracteres que la fuente sabe dibujar y texto dentro de la hoja
//   node scripts/test-informe-pdf.mjs
import { jsPDF } from 'jspdf'
import { generarInformeClinicoPdf, textoSeguroPdf } from '../src/services/informePdfService.js'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }

// Se registra cada texto que se dibuja (con la fuente y el tamaño vigentes) para medirlo
const registro = []
function nuevoDoc() {
  const d = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const original = d.text.bind(d)
  d.text = (texto, x, y, opciones, ...resto) => {
    const lista = Array.isArray(texto) ? texto : [texto]
    lista.forEach((t) => {
      const s = String(t)
      registro.push({
        s, x, y,
        ancho: d.getTextWidth(s),
        alinear: opciones && opciones.align,
        maxWidth: opciones && opciones.maxWidth,
        fuente: d.getFont().fontName
      })
    })
    return original(texto, x, y, opciones, ...resto)
  }
  return d
}

const paciente = {
  nombre: 'Profesor Docente', edad: 26, nivelEstres: 'bajo', suenoHoras: '7_8', cafeina: 'ninguna',
  medicacion: 'Ninguna', actividadNombre: 'Reposo basal', condicionSalud: 'Ninguna conocida'
}
const resultados = { bpm: 91, spo2: 95, estabilidad: 'normal', pi: '3.2' }
const clasificacion = {
  nombre: 'Ritmo Normal (Normocardia)', rangoBpm: '60 a 100 BPM en reposo',
  criterioNumerico: 'Frecuencia cardíaca de 91 BPM, situada dentro de la ventana de normalidad fisiológica en reposo (60 - 100 BPM), con intervalos R-R estables (~659 ms) y variabilidad controlada (SDNN: 24 ms).',
  explicacionPorque: 'Tu registro se parece a los parámetros de un ritmo normal (simulación educativa, no es un diagnóstico) porque los 91 BPM registrados se encuentran dentro del rango normocárdico estándar (60 a 100 BPM en adultos) y la distancia entre los picos sistólicos detectados por fotopletismografía se mantiene regular y homogénea. Según la American Heart Association, esto evidencia que el marcapasos sinusal opera con un balance fisiológico adecuado entre el sistema simpático y parasimpático.',
  correlacionFactores: 'Nivel de estrés bajo y sin cafeína previa: coherente con una frecuencia en el rango normal.',
  fuenteOficial: 'American Heart Association (AHA) — All About Heart Rate (heart.org)'
}

console.log('Texto seguro')
prueba('quita viñetas, subíndices y símbolos que la fuente no dibuja', textoSeguroPdf('● SpO₂ ≥ 95 % — normal') === 'SpO2 >= 95 % - normal')
prueba('conserva tildes y la ñ', textoSeguroPdf('Frecuencia cardíaca, sueño, años') === 'Frecuencia cardíaca, sueño, años')
prueba('los guiones bajos de los códigos se vuelven espacios (7_8 → 7 8)', textoSeguroPdf('7_8') === '7 8')

console.log('Informe completo')
const doc = generarInformeClinicoPdf({ doc: nuevoDoc(), paciente, resultados, clasificacion, sesion: { id: 'abcdef12-0000-4000-8000-000000000000', ronda: 1 } })
const pdf = doc.output()
const paginas = doc.getNumberOfPages()
const textos = registro.map(r => r.s)
const ancho = doc.internal.pageSize.getWidth()
const margen = 18

prueba('es un PDF válido', pdf.startsWith('%PDF-') && pdf.includes('%%EOF'))
prueba('cabe en una o dos hojas', paginas >= 1 && paginas <= 2)
prueba('todo el texto usa la fuente Times', registro.every(r => /times/i.test(r.fuente)))
prueba('no queda ningún carácter que la fuente no dibuje', textos.every(t => !/[●₂≥—–•]/.test(t)))
prueba('ningún texto sale como letras separadas (señal de caracteres no soportados)', textos.every(t => !/(?:\S ){8,}\S/.test(t.replace(/\s{2,}/g, ' ')) || /^[A-Z ,.:;()\d-]{0,20}$/.test(t)))
prueba('cada texto cabe dentro de los márgenes de la hoja', registro.every((r) => {
  const w = r.maxWidth ? Math.min(r.ancho, r.maxWidth) : r.ancho
  if (r.alinear === 'right') return r.x - w >= margen - 0.5 && r.x <= ancho - margen + 0.5
  if (r.alinear === 'center') return r.x - w / 2 >= margen - 0.5 && r.x + w / 2 <= ancho - margen + 0.5
  return r.x >= margen - 0.5 && r.x + w <= ancho - margen + 0.5
}))
const orden = ['Datos del participante', 'Resultados de la medición', 'Evaluación del ritmo', 'Comparación con rangos', 'Aviso importante']
const posiciones = orden.map(t => textos.findIndex(x => x.includes(t)))
prueba('las 5 secciones están y en el orden correcto', posiciones.every(p => p >= 0) && posiciones.every((p, i) => i === 0 || p > posiciones[i - 1]))
prueba('muestra los datos del participante en texto legible (no códigos)', textos.includes('Profesor Docente') && textos.includes('26 años') && textos.includes('Bajo') && textos.includes('7 a 8 horas') && !textos.includes('7 8') && !textos.includes('bajo'))
prueba('hay muchos textos dibujados (la medición de márgenes no es vacía)', registro.length > 40)
prueba('muestra FC y SpO2 medidos', textos.some(t => t.includes('91 BPM')) && textos.some(t => t.includes('95 %')))
prueba('hay número de página en cada hoja', Array.from({ length: paginas }, (_, i) => textos.includes(`Página ${i + 1} de ${paginas}`)).every(Boolean))

console.log('Sin lectura de SpO2 no se inventa un valor')
registro.length = 0
const sinSpo2 = generarInformeClinicoPdf({ doc: nuevoDoc(), paciente, resultados: { bpm: 80, spo2: 0 }, clasificacion })
const t2 = registro.map(r => r.s)
prueba('dice «Sin lectura» y no pone 98 %', t2.some(t => /Sin lectura/.test(t)) && !t2.some(t => /\b98 ?%/.test(t)))
prueba('no inventa tampoco la frecuencia cuando falta', (() => {
  registro.length = 0
  generarInformeClinicoPdf({ doc: nuevoDoc(), paciente, resultados: {}, clasificacion })
  const t3 = registro.map(r => r.s)
  return !t3.some(t => /\b72 BPM\b/.test(t)) && t3.some(t => /Sin lectura/.test(t))
})())

console.log('Textos largos pasan de hoja sin salirse')
registro.length = 0
const larga = { ...clasificacion, explicacionPorque: clasificacion.explicacionPorque.repeat(6) }
const docLargo = generarInformeClinicoPdf({ doc: nuevoDoc(), paciente, resultados, clasificacion: larga })
prueba('un fundamento muy largo ocupa más hojas', docLargo.getNumberOfPages() >= 2)
prueba('y sigue dentro de los márgenes', registro.every(r => r.alinear ? true : (r.x >= margen - 0.5 && r.x + (r.maxWidth ? Math.min(r.ancho, r.maxWidth) : r.ancho) <= ancho - margen + 0.5)))

console.log(`\n${ok} bien, ${mal} mal`)
process.exit(mal ? 1 : 0)
