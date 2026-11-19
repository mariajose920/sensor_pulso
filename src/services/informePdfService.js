/**
 * ============================================================================
 * sensor_pulso · Servicio de generación y descarga del informe PDF
 * Descarga directamente el archivo PDF en el equipo, sin abrir ventanas.
 *
 * Estructura del informe:
 *   1. Datos del participante      (RF03)
 *   2. Resultados de la medición   (FC, SpO2, estabilidad, perfusión)
 *   3. Evaluación del ritmo        (RF18, criterios AHA)
 *   4. Comparación con rangos      (RF20)
 *   5. Aviso educativo             (RF75, RF94)
 *
 * Reglas de diseño del documento (para que se vea bien en cualquier visor):
 *   - Tipografía Times (serif) en todo el documento.
 *   - Solo caracteres que la fuente estándar del PDF sabe dibujar (WinAnsi): sin viñetas ●, subíndices ₂, ≥ ni
 *     rayas largas; con ellos el PDF mostraba cuadros negros y letras separadas que se salían de la hoja.
 *   - Todo el texto se parte en líneas que caben en el ancho útil y las secciones saltan de página si no caben.
 *   - Cada recuadro se dibuja ANTES que su texto (si no, el relleno tapa el texto).
 * ============================================================================
 */
import { jsPDF } from 'jspdf'
import { evaluarComparacionRango } from '../utils/comparacionRangos.js'
import { AVISO_EDUCATIVO_TEXTO, AVISO_EDUCATIVO_TITULO, AVISO_EDUCATIVO_CORTO } from '../data/avisoEducativo.js'
import { registrarEventoAuditoria } from './auditoriaService.js'

const FUENTE = 'times'

/**
 * Deja solo caracteres que la fuente estándar del PDF puede dibujar.
 * Exportada para poder probarla sin generar el PDF.
 */
export function textoSeguroPdf(valor) {
  return String(valor ?? '')
    .replace(/SpO₂/g, 'SpO2')
    .replace(/₂/g, '2')
    .replace(/[≥]/g, '>=')
    .replace(/[≤]/g, '<=')
    .replace(/[—–]/g, '-')
    .replace(/[●•▪■□▶►]/g, '')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/…/g, '...')
    .replace(/_/g, ' ')
    // cualquier otro símbolo fuera de Latin-1 que la fuente no dibuja
    .replace(/[^ -~ -ÿ]/g, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

const COLOR = {
  titulo: [23, 53, 94],
  texto: [30, 41, 59],
  suave: [100, 116, 139],
  linea: [203, 213, 225],
  fondo: [248, 250, 252],
  ok: [21, 128, 61],
  okFondo: [240, 253, 244],
  okBorde: [134, 239, 172],
  alerta: [185, 28, 28],
  alertaFondo: [254, 242, 242],
  alertaBorde: [252, 165, 165],
  aviso: [30, 58, 138],
  avisoFondo: [239, 246, 255],
  avisoBorde: [191, 219, 254]
}

const MM_POR_PT = 0.3528
const altoLinea = (pt) => pt * MM_POR_PT * 1.18

// La ficha guarda códigos («7_8», «muy_alto»); en el informe se muestran como texto para personas
const TEXTO_SUENO = { menos_5: 'Menos de 5 horas', '5_6': '5 a 6 horas', '7_8': '7 a 8 horas', mas_8: 'Más de 8 horas' }
const TEXTO_ESTRES = { bajo: 'Bajo', medio: 'Medio', alto: 'Alto', muy_alto: 'Muy alto' }
const TEXTO_CAFEINA = { ninguna: 'Ninguna', baja: 'Baja', moderada: 'Moderada', alta: 'Alta' }
const TEXTO_ACTIVIDAD = {
  reposo: 'Reposo basal',
  sentado: 'Sentado activo',
  caminata: 'Caminata leve',
  ejercicio_moderado: 'Ejercicio moderado',
  ejercicio_intenso: 'Ejercicio intenso',
  post_ejercicio: 'Recuperación post-ejercicio'
}
const legible = (tabla, v, porDefecto) => (v ? (tabla[v] || String(v)) : porDefecto)

function valorONulo(v) {
  return typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null
}

/**
 * Genera el documento PDF y lo descarga de forma directa en el computador.
 * @param {Object} params
 * @param {Object} params.paciente - Ficha del participante (RF03)
 * @param {Object} params.resultados - Signos vitales (bpm, spo2, estabilidad, pi)
 * @param {Object} params.clasificacion - Clasificación del ritmo (RF18)
 * @param {Object} [params.comparacion] - Comparación con rangos (RF20); si falta se calcula
 * @param {Object} [params.sesion] - Sesión de medición {id, ronda}
 * @returns {string} nombre del archivo descargado
 */
export function descargarInformeClinicoPdf({ paciente, resultados, clasificacion, comparacion = null, sesion = null }) {
  const doc = generarInformeClinicoPdf({ paciente, resultados, clasificacion, comparacion, sesion })
  const nombreLimpio = (paciente?.nombre || 'Paciente').replace(/[^a-zA-Z0-9_-]/g, '_')
  const nombreArchivo = `Informe_Clinico_Ritmo_Cardiaco_${nombreLimpio}.pdf`
  doc.save(nombreArchivo)
  registrarEventoAuditoria({
    accion: 'descarga',
    entidad: 'descargas',
    entidadId: 'informe_pdf',
    entidadNombre: 'Informe Clínico PDF',
    detalle: { tipo: 'informe_pdf' },
    // La auditoría no guarda el nombre del paciente (RF61): solo qué se descargó
    resumen: 'Archivo exportado: informe_pdf'
  })
  return nombreArchivo
}

/** Arma el documento (sin descargarlo). Separado para poder probarlo. */
export function generarInformeClinicoPdf({ paciente, resultados, clasificacion, comparacion = null, sesion = null, doc: docExterno = null }) {
  // `doc` solo lo pasan las pruebas (para medir cada texto dibujado)
  const doc = docExterno || new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })

  const pageWidth = doc.internal.pageSize.getWidth() // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight() // 297 mm
  const margin = 18
  const contentWidth = pageWidth - margin * 2 // 174 mm
  const limiteInferior = pageHeight - 19 // deja sitio al pie de página
  let y = 12

  // ---------------------------------------------------------------- utilidades de dibujo
  const color = (c) => doc.setTextColor(c[0], c[1], c[2])
  const relleno = (c) => doc.setFillColor(c[0], c[1], c[2])
  const borde = (c) => doc.setDrawColor(c[0], c[1], c[2])

  function fuente(estilo, pt, c = COLOR.texto) {
    doc.setFont(FUENTE, estilo)
    doc.setFontSize(pt)
    color(c)
  }

  function lineas(texto, pt, estilo, ancho) {
    doc.setFont(FUENTE, estilo)
    doc.setFontSize(pt)
    return doc.splitTextToSize(textoSeguroPdf(texto), ancho)
  }

  function asegurarEspacio(alto) {
    if (y + alto > limiteInferior) {
      doc.addPage()
      y = margin
    }
  }

  // Un bloque de texto que cabe en el ancho y pasa de página si hace falta
  function parrafo(texto, { pt = 10, estilo = 'normal', c = COLOR.texto, ancho = contentWidth, x = margin, despues = 2 } = {}) {
    const ls = lineas(texto, pt, estilo, ancho)
    const alto = altoLinea(pt)
    fuente(estilo, pt, c)
    ls.forEach((l) => {
      asegurarEspacio(alto)
      doc.text(l, x, y + pt * MM_POR_PT)
      y += alto
    })
    y += despues
  }

  function seccion(numero, titulo, c = COLOR.titulo) {
    asegurarEspacio(13)
    fuente('bold', 11, c)
    doc.text(textoSeguroPdf(`${numero}. ${titulo}`), margin, y + 11 * MM_POR_PT)
    y += 5.2
    borde(COLOR.linea)
    doc.setLineWidth(0.3)
    doc.line(margin, y, margin + contentWidth, y)
    y += 2.8
  }

  /**
   * Recuadro con fondo: se calcula el alto con el texto ya partido, se dibuja el recuadro y DESPUÉS el texto.
   * @param {{fondo:number[], borde:number[]}} estilo
   * @param {Array<{texto:string, pt?:number, estilo?:string, c?:number[], despues?:number}>} bloques
   */
  function recuadro({ fondo, borde: bordeColor }, bloques, padding = 3) {
    const anchoTexto = contentWidth - padding * 2
    const medidos = bloques.map((b) => {
      const pt = b.pt || 9.2
      const estilo = b.estilo || 'normal'
      return { ...b, pt, estilo, ls: lineas(b.texto, pt, estilo, anchoTexto), despues: b.despues ?? 1 }
    })
    const alto = padding * 2 + medidos.reduce((s, b) => s + b.ls.length * altoLinea(b.pt) + b.despues, 0) - 1
    asegurarEspacio(alto)
    relleno(fondo)
    borde(bordeColor)
    doc.setLineWidth(0.35)
    doc.roundedRect(margin, y, contentWidth, alto, 2, 2, 'FD')
    let cy = y + padding
    medidos.forEach((b) => {
      fuente(b.estilo, b.pt, b.c || COLOR.texto)
      b.ls.forEach((l) => {
        doc.text(l, margin + padding, cy + b.pt * MM_POR_PT)
        cy += altoLinea(b.pt)
      })
      cy += b.despues
    })
    y += alto + 3.5
  }

  // ---------------------------------------------------------------- datos
  const pNombre = paciente?.nombre || 'No identificado'
  const pEdad = paciente?.edad ? `${paciente.edad} años` : 'Mayor de edad'
  const pEstres = legible(TEXTO_ESTRES, paciente?.nivelEstres, 'No declarado')
  const pSueno = legible(TEXTO_SUENO, paciente?.sueno || paciente?.suenoHoras, 'No declarado')
  const pCafeina = legible(TEXTO_CAFEINA, paciente?.cafeina, 'Ninguna')
  const pMedicacion = paciente?.medicacion || 'Ninguna'
  const pActividad = paciente?.actividadNombre || legible(TEXTO_ACTIVIDAD, paciente?.actividadPrevia, 'Reposo basal')
  const pCondicion = paciente?.condicionSalud || 'Ninguna conocida'

  const bpm = valorONulo(resultados?.bpm)
  const spo2 = valorONulo(resultados?.spo2)
  const estabilidad = resultados?.estabilidad || null
  const perfusion = resultados?.pi || null

  // ---------------------------------------------------------------- encabezado
  relleno(COLOR.titulo)
  doc.rect(margin, y, contentWidth, 1.4, 'F')
  y += 4

  fuente('bold', 13.5, COLOR.titulo)
  doc.text('UNIVERSIDAD ADVENTISTA DE CHILE', margin, y + 13.5 * MM_POR_PT)
  y += 5.5
  fuente('normal', 9, COLOR.suave)
  doc.text('Facultad de Ingeniería y Negocios · sensor_pulso', margin, y + 9 * MM_POR_PT)

  const fechaStr = new Date().toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
  doc.text(textoSeguroPdf(`Emitido el ${fechaStr}`), pageWidth - margin, y + 9 * MM_POR_PT, { align: 'right' })
  y += 6.5

  fuente('bold', 12.5, COLOR.texto)
  doc.text('Informe educativo de ritmo cardíaco y SpO2', margin, y + 12.5 * MM_POR_PT)
  y += 5.5
  if (sesion && sesion.id) {
    fuente('normal', 8.5, COLOR.suave)
    doc.text(textoSeguroPdf(`Sesión #${String(sesion.id).substring(0, 8)} · Ronda ${sesion.ronda || 1}`), margin, y + 8.5 * MM_POR_PT)
    y += 4
  }
  parrafo(AVISO_EDUCATIVO_CORTO, { pt: 8.5, estilo: 'italic', c: COLOR.suave, despues: 2.5 })

  // ---------------------------------------------------------------- 1. participante
  seccion(1, 'Datos del participante')
  const datos = [
    ['Participante', pNombre],
    ['Edad', pEdad],
    ['Nivel de estrés', pEstres],
    ['Sueño', pSueno],
    ['Cafeína previa', pCafeina],
    ['Medicación', pMedicacion],
    ['Actividad o contexto', pActividad],
    ['Condición de salud', pCondicion]
  ]
  const columnas = 2
  const anchoCelda = contentWidth / columnas
  const filas = []
  for (let i = 0; i < datos.length; i += columnas) filas.push(datos.slice(i, i + columnas))
  const alturaFila = (fila) => 2 + Math.max(...fila.map(([, v]) => lineas(v, 9.5, 'bold', anchoCelda - 8).length)) * altoLinea(9.5) + altoLinea(7.5) + 1.5
  const altoTabla = filas.reduce((s, f) => s + alturaFila(f), 0)
  asegurarEspacio(altoTabla)
  relleno(COLOR.fondo)
  borde(COLOR.linea)
  doc.setLineWidth(0.3)
  doc.roundedRect(margin, y, contentWidth, altoTabla, 2, 2, 'FD')
  let fy = y
  filas.forEach((fila, idxFila) => {
    const h = alturaFila(fila)
    if (idxFila > 0) doc.line(margin, fy, margin + contentWidth, fy)
    fila.forEach(([etiqueta, valor], idxCol) => {
      const cx = margin + idxCol * anchoCelda + 4
      fuente('normal', 7.5, COLOR.suave)
      doc.text(textoSeguroPdf(etiqueta), cx, fy + 2 + 7.5 * MM_POR_PT)
      fuente('bold', 9.5, COLOR.texto)
      const ls = lineas(valor, 9.5, 'bold', anchoCelda - 8)
      ls.forEach((l, i) => doc.text(l, cx, fy + 2 + altoLinea(7.5) + 9.5 * MM_POR_PT + i * altoLinea(9.5)))
    })
    fy += h
  })
  y += altoTabla + 4

  // ---------------------------------------------------------------- 2. resultados
  seccion(2, 'Resultados de la medición')
  const gap = 4
  const anchoTarjeta = (contentWidth - gap * 3) / 4
  const altoTarjeta = 21
  asegurarEspacio(altoTarjeta)
  const tarjetas = [
    { titulo: 'Frecuencia cardíaca', valor: bpm ? String(Math.round(bpm)) : '-', unidad: bpm ? 'BPM' : '', sub: bpm ? `Promedio (${pActividad})` : 'Sin lectura', c: COLOR.titulo },
    { titulo: 'Saturación de oxígeno', valor: spo2 ? String(Math.round(spo2)) : '-', unidad: spo2 ? '%' : '', sub: spo2 ? 'SpO2 por absorción óptica' : 'Sin lectura válida', c: [2, 112, 168] },
    { titulo: 'Estabilidad (HRV)', valor: estabilidad ? String(estabilidad) : '-', unidad: '', sub: 'Variabilidad sinusal', c: [4, 120, 87] },
    { titulo: 'Índice de perfusión', valor: perfusion ? String(perfusion) : '-', unidad: perfusion ? '%' : '', sub: 'Pulsatilidad AC/DC', c: [109, 40, 217] }
  ]
  tarjetas.forEach((t, i) => {
    const x = margin + i * (anchoTarjeta + gap)
    relleno([255, 255, 255])
    borde(COLOR.linea)
    doc.setLineWidth(0.3)
    doc.roundedRect(x, y, anchoTarjeta, altoTarjeta, 2, 2, 'FD')
    fuente('bold', 7.5, COLOR.suave)
    const tl = lineas(t.titulo, 7.5, 'bold', anchoTarjeta - 4)
    tl.forEach((l, k) => doc.text(l, x + anchoTarjeta / 2, y + 4.2 + k * 3.1, { align: 'center' }))
    fuente('bold', 14.5, t.c)
    const valor = t.unidad ? `${t.valor} ${t.unidad}` : t.valor
    doc.text(textoSeguroPdf(valor), x + anchoTarjeta / 2, y + 13.5, { align: 'center', maxWidth: anchoTarjeta - 3 })
    fuente('normal', 7.2, COLOR.suave)
    const sl = lineas(t.sub, 7.2, 'normal', anchoTarjeta - 4)
    sl.forEach((l, k) => doc.text(l, x + anchoTarjeta / 2, y + 17.8 + k * 2.8, { align: 'center' }))
  })
  y += altoTarjeta + 4

  // ---------------------------------------------------------------- 3. ritmo
  seccion(3, 'Evaluación del ritmo cardíaco (criterios de la American Heart Association)', COLOR.ok)
  const nombreRitmo = clasificacion?.nombre || 'Ritmo normal (normocardia)'
  const rangoRitmo = clasificacion?.rangoBpm || '60 a 100 BPM en reposo'
  const bloquesRitmo = [
    { texto: `${nombreRitmo} (${rangoRitmo})`, pt: 11, estilo: 'bold', c: COLOR.ok, despues: 1.8 },
    { texto: 'Criterio cuantitativo', pt: 8.2, estilo: 'bold', c: COLOR.suave, despues: 0.4 },
    {
      texto: clasificacion?.criterioNumerico || 'Frecuencia cardíaca dentro del rango fisiológico normal de 60 a 100 BPM en reposo.',
      pt: 9.2, despues: 1.8
    },
    { texto: 'Fundamento clínico y fisiológico', pt: 8.2, estilo: 'bold', c: COLOR.suave, despues: 0.4 },
    {
      texto: clasificacion?.explicacionPorque ||
        'La frecuencia registrada se encuentra dentro del rango normocárdico estándar. Los intervalos entre picos sistólicos detectados por fotopletismografía se mantienen regulares, lo que indica un balance fisiológico adecuado entre el sistema simpático y el parasimpático.',
      pt: 9.2, despues: clasificacion?.correlacionFactores ? 1.8 : 1.5
    }
  ]
  if (clasificacion?.correlacionFactores) {
    bloquesRitmo.push(
      { texto: 'Relación con los datos de la ficha', pt: 8.2, estilo: 'bold', c: COLOR.suave, despues: 0.4 },
      { texto: clasificacion.correlacionFactores, pt: 9.2, despues: 1.5 }
    )
  }
  bloquesRitmo.push({
    texto: `Fuente: ${clasificacion?.fuenteOficial || 'American Heart Association (AHA), All About Heart Rate (heart.org)'}`,
    pt: 8, estilo: 'italic', c: COLOR.suave, despues: 0
  })
  recuadro({ fondo: COLOR.okFondo, borde: COLOR.okBorde }, bloquesRitmo)

  // ---------------------------------------------------------------- 4. comparación con rangos
  const comp = comparacion || evaluarComparacionRango({
    bpm: bpm || 0,
    spo2: spo2 || 0,
    edad: paciente?.edad || 25,
    actividad: pActividad
  })
  const dentro = comp?.dentroDeRango === true
  seccion(4, 'Comparación con rangos fisiológicos de referencia', dentro ? COLOR.ok : COLOR.alerta)

  const estadoTexto = dentro ? 'DENTRO DEL RANGO DE REFERENCIA' : 'FUERA DEL RANGO DE REFERENCIA'
  const ra = comp?.rangoAplicado || {}
  const filasComp = [
    ['Parámetro', 'Valor medido', 'Referencia', 'Interpretación'],
    [
      'Frecuencia cardíaca',
      bpm ? `${Math.round(bpm)} BPM` : 'Sin lectura',
      ra.bpm_min != null ? `${ra.bpm_min} a ${ra.bpm_max} BPM` : '-',
      bpm ? (comp?.bpm?.diagnostico || '-') : 'No hay una lectura válida.'
    ],
    [
      'Saturación de oxígeno',
      spo2 ? `${Math.round(spo2)} %` : 'Sin lectura',
      ra.spo2_min != null ? `${ra.spo2_min} % o más` : '-',
      spo2 ? (comp?.spo2?.diagnostico || '-') : 'No hay una lectura válida (sin dedo o señal insuficiente).'
    ]
  ]
  const anchosCol = [38, 26, 30, contentWidth - 38 - 26 - 30]
  const alturasFilas = filasComp.map((f, i) => {
    const pt = i === 0 ? 8.2 : 9.2
    const maxLineas = Math.max(...f.map((celda, k) => lineas(celda, pt, i === 0 ? 'bold' : 'normal', anchosCol[k] - 5).length))
    return 3 + maxLineas * altoLinea(pt)
  })
  const altoEstado = 7.5
  const altoTablaComp = altoEstado + alturasFilas.reduce((s, h) => s + h, 0)
  asegurarEspacio(altoTablaComp + 2)

  // contexto + estado
  relleno(dentro ? COLOR.okFondo : COLOR.alertaFondo)
  borde(dentro ? COLOR.okBorde : COLOR.alertaBorde)
  doc.setLineWidth(0.35)
  doc.roundedRect(margin, y, contentWidth, altoTablaComp, 2, 2, 'FD')
  fuente('bold', 9.5, dentro ? COLOR.ok : COLOR.alerta)
  doc.text(textoSeguroPdf(`Estado: ${estadoTexto}`), margin + 4, y + 5.2)
  fuente('normal', 8.5, COLOR.suave)
  doc.text(textoSeguroPdf(`Contexto: ${pActividad}, ${pEdad}`), margin + contentWidth - 4, y + 5.2, { align: 'right', maxWidth: contentWidth / 2 - 6 })

  let ty = y + altoEstado
  filasComp.forEach((f, i) => {
    const h = alturasFilas[i]
    borde(dentro ? COLOR.okBorde : COLOR.alertaBorde)
    doc.line(margin, ty, margin + contentWidth, ty)
    let cx = margin
    f.forEach((celda, k) => {
      const pt = i === 0 ? 8.2 : 9.2
      fuente(i === 0 ? 'bold' : 'normal', pt, i === 0 ? COLOR.suave : COLOR.texto)
      const ls = lineas(celda, pt, i === 0 ? 'bold' : 'normal', anchosCol[k] - 5)
      ls.forEach((l, n) => doc.text(l, cx + 4, ty + 2.2 + pt * MM_POR_PT + n * altoLinea(pt)))
      cx += anchosCol[k]
    })
    ty += h
  })
  y += altoTablaComp + 4

  // ---------------------------------------------------------------- 5. aviso educativo
  seccion(5, 'Aviso importante', COLOR.aviso)
  recuadro({ fondo: COLOR.avisoFondo, borde: COLOR.avisoBorde }, [
    { texto: AVISO_EDUCATIVO_TITULO, pt: 9.5, estilo: 'bold', c: COLOR.aviso, despues: 1 },
    { texto: AVISO_EDUCATIVO_TEXTO, pt: 8.8, c: COLOR.aviso, despues: 0 }
  ])

  // ---------------------------------------------------------------- pie de página en todas las hojas
  const total = doc.getNumberOfPages()
  for (let p = 1; p <= total; p++) {
    doc.setPage(p)
    borde(COLOR.linea)
    doc.setLineWidth(0.3)
    doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15)
    fuente('normal', 8, COLOR.suave)
    const pie = doc.splitTextToSize(
      textoSeguroPdf('Evaluación docente orientativa (criterios AHA) · Ley 19.628 · ' + AVISO_EDUCATIVO_CORTO),
      contentWidth - 30
    )
    doc.text(pie, margin, pageHeight - 11)
    doc.text('sensor_pulso · UNACH', pageWidth - margin, pageHeight - 11, { align: 'right' })
    doc.text(`Página ${p} de ${total}`, pageWidth - margin, pageHeight - 7, { align: 'right' })
  }

  return doc
}
