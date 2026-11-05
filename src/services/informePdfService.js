/**
 * ============================================================================
 * sensor_pulso · Servicio de Generación y Descarga de Informe Clínico PDF
 * Genera y descarga directamente el archivo PDF en el equipo sin abrir ventanas.
 * Contiene exclusivamente: Ficha del Paciente, Biomarcadores y Evaluación AHA (RF18).
 * ============================================================================
 */
import { jsPDF } from 'jspdf'
import { evaluarComparacionRango } from '../utils/comparacionRangos.js'

/**
 * Genera el documento PDF y lo descarga de forma directa en el computador.
 * @param {Object} params
 * @param {Object} params.paciente - Ficha del paciente (RF03)
 * @param {Object} params.resultados - Signos vitales (BPM, SpO2, Estabilidad, PI)
 * @param {Object} params.clasificacion - Diagnóstico médico AHA (RF18)
 */
export function descargarInformeClinicoPdf({ paciente, resultados, clasificacion, comparacion = null, sesion = null }) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  })

  const pageWidth = doc.internal.pageSize.getWidth() // 210 mm
  const pageHeight = doc.internal.pageSize.getHeight() // 297 mm
  const margin = 16
  const contentWidth = pageWidth - (margin * 2) // 178 mm

  // =========================================================================
  // ENCABEZADO INSTITUCIONAL
  // =========================================================================
  doc.setFillColor(2, 132, 199) // #0284c7
  doc.rect(margin, 14, contentWidth, 2, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(13.5)
  doc.setTextColor(3, 105, 161) // #0369a1
  doc.text('UNIVERSIDAD ADVENTISTA DE CHILE', margin, 22)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(100, 116, 139) // #64748b
  doc.text('Facultad de Ingeniería y Negocios · sensor_pulso (Telemetría en Tiempo Real)', margin, 27)

  // Fecha y hora
  const fechaStr = new Date().toLocaleDateString('es-CL', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit'
  })
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.text(`Fecha de emisión: ${fechaStr}`, pageWidth - margin, 27, { align: 'right' })

  // Título del Documento
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(12)
  doc.setTextColor(15, 23, 42) // #0f172a
  doc.text('INFORME DE EVALUACIÓN CLÍNICA Y RITMO CARDÍACO', margin, 36)
  if (sesion && sesion.id) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8.5)
    doc.setTextColor(2, 132, 199)
    doc.text(`Sesión: #${sesion.id.substring(0, 8)} (Ronda ${sesion.ronda || 1})`, pageWidth - margin, 36, { align: 'right' })
  }

  doc.setDrawColor(226, 232, 240) // #e2e8f0
  doc.line(margin, 39, pageWidth - margin, 39)

  let currentY = 44

  // =========================================================================
  // 1. DATOS DEL PARTICIPANTE (RF03)
  // =========================================================================
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(30, 41, 59) // #1e293b
  doc.text('1. FICHA DEL PARTICIPANTE Y FACTORES BASALES', margin, currentY)
  currentY += 4

  const boxHeight = 22
  doc.setFillColor(248, 250, 252) // #f8fafc
  doc.setDrawColor(203, 213, 225) // #cbd5e1
  doc.roundedRect(margin, currentY, contentWidth, boxHeight, 2, 2, 'FD')

  const pNombre = paciente?.nombre || 'No identificado'
  const pEdad = paciente?.edad ? `${paciente.edad} años` : 'Mayor de edad'
  const pEstres = paciente?.nivelEstres ? String(paciente.nivelEstres).toUpperCase() : 'NORMAL'
  const pSueno = paciente?.sueno || paciente?.suenoHoras || '7 a 8 horas'
  const pCafeina = paciente?.cafeina || 'Ninguna'
  const pMedicacion = paciente?.medicacion || 'Ninguna'
  const pActividad = paciente?.actividadNombre || paciente?.actividadPrevia || 'Reposo basal'

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42)

  // Fila 1
  doc.text('Participante: ', margin + 4, currentY + 6)
  doc.setFont('helvetica', 'bold')
  doc.text(`${pNombre} (${pEdad})`, margin + 24, currentY + 6)

  doc.setFont('helvetica', 'normal')
  doc.text('Nivel de Estrés: ', margin + 70, currentY + 6)
  doc.setFont('helvetica', 'bold')
  doc.text(`${pEstres}`, margin + 94, currentY + 6)

  doc.setFont('helvetica', 'normal')
  doc.text('Sueño: ', margin + 128, currentY + 6)
  doc.setFont('helvetica', 'bold')
  doc.text(`${pSueno}`, margin + 140, currentY + 6)

  // Fila 2
  doc.setFont('helvetica', 'normal')
  doc.text('Cafeína previa: ', margin + 4, currentY + 14)
  doc.setFont('helvetica', 'bold')
  doc.text(`${pCafeina}`, margin + 26, currentY + 14)

  doc.setFont('helvetica', 'normal')
  doc.text('Medicación: ', margin + 70, currentY + 14)
  doc.setFont('helvetica', 'bold')
  doc.text(`${pMedicacion}`, margin + 89, currentY + 14)

  doc.setFont('helvetica', 'normal')
  doc.text('Contexto / Actividad: ', margin + 128, currentY + 14)
  doc.setFont('helvetica', 'bold')
  doc.text(`${pActividad}`, margin + 154, currentY + 14)

  currentY += boxHeight + 7

  // =========================================================================
  // 2. BIOMARCADORES FISIOLÓGICOS (4 CAJAS)
  // =========================================================================
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(30, 41, 59)
  doc.text('2. SIGNOS VITALES Y BIOMARCADORES REGISTRADOS EN REPOSO', margin, currentY)
  currentY += 4

  const cardW = (contentWidth - (3 * 3.5)) / 4
  const cardH = 20

  const metricas = [
    { titulo: 'FRECUENCIA CARDÍACA', valor: `${resultados?.bpm || 72}`, unidad: 'BPM', sub: 'Promedio en reposo', color: [15, 23, 42] },
    { titulo: 'SATURACIÓN OXÍGENO', valor: `${resultados?.spo2 || 98}`, unidad: '%', sub: 'SpO2 absorción óptica', color: [2, 132, 199] },
    { titulo: 'ESTABILIDAD / HRV', valor: `${resultados?.estabilidad || 'normal'}`, unidad: '', sub: 'Variabilidad sinusal', color: [16, 185, 129] },
    { titulo: 'ÍNDICE PERFUSIÓN', valor: `${resultados?.pi || '3.2'}`, unidad: '%', sub: 'Pulsatilidad AC/DC', color: [139, 92, 246] }
  ]

  metricas.forEach((m, idx) => {
    const x = margin + (idx * (cardW + 3.5))
    doc.setFillColor(255, 255, 255)
    doc.setDrawColor(203, 213, 225)
    doc.roundedRect(x, currentY, cardW, cardH, 2, 2, 'FD')

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(6.8)
    doc.setTextColor(100, 116, 139)
    doc.text(m.titulo, x + (cardW / 2), currentY + 4.5, { align: 'center' })

    doc.setFont('helvetica', 'bold')
    doc.setFontSize(13)
    doc.setTextColor(m.color[0], m.color[1], m.color[2])
    const valText = m.unidad ? `${m.valor} ${m.unidad}` : m.valor
    doc.text(valText, x + (cardW / 2), currentY + 12, { align: 'center' })

    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.2)
    doc.setTextColor(148, 163, 184)
    doc.text(m.sub, x + (cardW / 2), currentY + 17, { align: 'center' })
  })

  currentY += cardH + 7

  // =========================================================================
  // 3. EVALUACIÓN MÉDICA DEL RITMO (RF18 AHA)
  // =========================================================================
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  doc.setTextColor(22, 101, 52) // #166534
  doc.text('3. EVALUACIÓN CLÍNICA DEL RITMO CARDÍACO (AMERICAN HEART ASSOCIATION - AHA)', margin, currentY)
  currentY += 4

  const ritmoCardY = currentY
  doc.setFillColor(240, 253, 244) // #f0fdf4
  doc.setDrawColor(34, 197, 94) // #22c55e
  doc.setLineWidth(0.6)

  let insideY = currentY + 6

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.setTextColor(22, 101, 52)
  const nombreRitmo = clasificacion?.nombre || 'Ritmo Normal (Normocardia)'
  doc.text(`● ${nombreRitmo} (${clasificacion?.rangoBpm || '60 a 100 BPM en reposo'})`, margin + 4, insideY)
  insideY += 6

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(30, 41, 59)
  const criterio = `Criterio Cuantitativo: ${clasificacion?.criterioNumerico || 'FC dentro del rango fisiológico normal de 60 a 100 BPM en reposo.'}`
  const linesCriterio = doc.splitTextToSize(criterio, contentWidth - 8)
  doc.text(linesCriterio, margin + 4, insideY)
  insideY += (linesCriterio.length * 4) + 2

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42)
  doc.text('Fundamento Clínico y Fisiológico:', margin + 4, insideY)
  insideY += 4.5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(51, 65, 85)
  const explicacion = clasificacion?.explicacionPorque || 'La frecuencia registrada se encuentra dentro del rango normocárdico estándar. Los intervalos entre picos sistólicos detectados por fotopletismografía se mantienen regulares, evidenciando un balance fisiológico adecuado entre el sistema simpático y parasimpático.'
  const linesExplicacion = doc.splitTextToSize(explicacion, contentWidth - 8)
  doc.text(linesExplicacion, margin + 4, insideY)
  insideY += (linesExplicacion.length * 3.8) + 3

  if (clasificacion?.correlacionFactores) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.setTextColor(3, 105, 161)
    doc.text('Correlación con Factores de la Ficha:', margin + 4, insideY)
    insideY += 4

    doc.setFont('helvetica', 'normal')
    doc.setTextColor(30, 41, 59)
    const linesCorrelacion = doc.splitTextToSize(clasificacion.correlacionFactores, contentWidth - 8)
    doc.text(linesCorrelacion, margin + 4, insideY)
    insideY += (linesCorrelacion.length * 3.8) + 3
  }

  doc.setFont('helvetica', 'italic')
  doc.setFontSize(7.5)
  doc.setTextColor(100, 116, 139)
  const fuente = `Fuente Médica Oficial: ${clasificacion?.fuenteOficial || 'American Heart Association (AHA) — All About Heart Rate (heart.org)'}`
  doc.text(fuente, margin + 4, insideY)
  insideY += 4

  const finalBoxHeight = insideY - ritmoCardY + 2
  doc.roundedRect(margin, ritmoCardY, contentWidth, finalBoxHeight, 2, 2, 'S')

  currentY = ritmoCardY + finalBoxHeight + 6

  // =========================================================================
  // 4. COMPARACIÓN CON RANGOS FISIOLÓGICOS DE REFERENCIA (RF20)
  // =========================================================================
  const comp = comparacion || evaluarComparacionRango({
    bpm: resultados?.bpm || 72,
    spo2: resultados?.spo2 || 98,
    edad: paciente?.edad || 25,
    actividad: paciente?.actividadNombre || paciente?.actividadPrevia || 'reposo'
  })

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(9.5)
  const esDentro = comp.dentroDeRango === true
  doc.setTextColor(esDentro ? 22 : 185, esDentro ? 101 : 28, esDentro ? 52 : 28)
  doc.text('4. COMPARACIÓN CON RANGOS FISIOLÓGICOS DE REFERENCIA', margin, currentY)
  currentY += 4

  const compBoxY = currentY
  doc.setFillColor(esDentro ? 240 : 254, esDentro ? 253 : 242, esDentro ? 244 : 242)
  doc.setDrawColor(esDentro ? 134 : 252, esDentro ? 239 : 165, esDentro ? 172 : 165)
  doc.setLineWidth(0.5)

  let compInsideY = currentY + 5.5

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(10)
  doc.setTextColor(esDentro ? 21 : 185, esDentro ? 128 : 28, esDentro ? 61 : 28)
  const tagEstado = esDentro ? '● ESTADO: DENTRO DE RANGO FISIOLÓGICO' : '● ESTADO: FUERA DE RANGO FISIOLÓGICO'
  doc.text(tagEstado, margin + 4, compInsideY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8)
  doc.setTextColor(71, 85, 105)
  doc.text(`Contexto evaluado: ${pActividad} (${pEdad})`, pageWidth - margin - 4, compInsideY, { align: 'right' })
  compInsideY += 5.5

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.5)
  doc.setTextColor(15, 23, 42)
  const detBpm = `Frecuencia Cardíaca: ${resultados?.bpm || 72} BPM (Rango: ${comp.rangoAplicado.bpm_min} - ${comp.rangoAplicado.bpm_max} BPM) · ${comp.bpm.diagnostico}`
  doc.text(detBpm, margin + 4, compInsideY)
  compInsideY += 4.5

  const detSpo2 = `Saturación de Oxígeno: ${resultados?.spo2 || 98}% SpO₂ (Límite: ≥${comp.rangoAplicado.spo2_min}%) · ${comp.spo2.diagnostico}`
  doc.text(detSpo2, margin + 4, compInsideY)
  compInsideY += 4.5

  const compHeight = compInsideY - compBoxY + 1.5
  doc.roundedRect(margin, compBoxY, contentWidth, compHeight, 2, 2, 'FD')

  // =========================================================================
  // PIE DE PÁGINA
  // =========================================================================
  doc.setDrawColor(226, 232, 240)
  doc.setLineWidth(0.3)
  doc.line(margin, pageHeight - 16, pageWidth - margin, pageHeight - 16)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(148, 163, 184)
  doc.text('Evaluación docente orientativa basada en criterios de la American Heart Association (AHA) · Ley 19.628', margin, pageHeight - 11)
  doc.text('sensor_pulso · Universidad Adventista de Chile (UNACH)', pageWidth - margin, pageHeight - 11, { align: 'right' })

  // =========================================================================
  // DESCARGA DIRECTA EN EL COMPUTADOR (SIN ABRIR VENTANAS NI DIÁLOGOS)
  // =========================================================================
  const nombreLimpio = (paciente?.nombre || 'Paciente').replace(/[^a-zA-Z0-9_-]/g, '_')
  const nombreArchivo = `Informe_Clinico_Ritmo_Cardiaco_${nombreLimpio}.pdf`

  doc.save(nombreArchivo)
}
