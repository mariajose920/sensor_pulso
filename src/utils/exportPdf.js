/**
 * RF32: informe PDF de la comparación. jsPDF se carga bajo demanda para no engordar el bundle inicial.
 * No incluye datos personales (RF61): solo nombre de la medición, métricas y gráfico.
 */
import { renderizarGrafico, nombreSeguro, marcaFecha } from './descargas.js'

function estado(bpm) {
  if (bpm >= 60 && bpm <= 80) return 'Ritmo normal en reposo (60 a 80 BPM)'
  if (bpm > 80) return 'Por encima del reposo (frecuencia elevada)'
  return 'Por debajo del reposo (frecuencia baja)'
}

export async function descargarPdf({ nombre, bpm, intervaloMs, amplitud }) {
  const { jsPDF } = await import('jspdf')
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const margen = 15
  const ancho = 210 - margen * 2
  let y = 20

  const texto = (t, tam = 11, negrita = false, color = [30, 41, 59]) => {
    doc.setFont('helvetica', negrita ? 'bold' : 'normal')
    doc.setFontSize(tam)
    doc.setTextColor(...color)
    const lineas = doc.splitTextToSize(String(t), ancho)
    doc.text(lineas, margen, y)
    y += lineas.length * (tam * 0.45) + 2
  }

  texto('sensor_pulso - Informe de comparacion', 18, true)
  texto(`Generado: ${new Date().toLocaleString('es-CL')}`, 9, false, [100, 116, 139])
  y += 2

  texto('Medicion', 13, true)
  texto(`Nombre: ${nombre}`)
  texto(`Frecuencia cardiaca: ${bpm} BPM`)
  texto(`Duracion del ciclo: ${intervaloMs} ms`)
  texto(`Amplitud relativa: ${amplitud} %`)
  y += 2

  texto('Comparacion con la referencia de reposo', 13, true)
  const dif = bpm - 72
  texto(`Plantilla PPG de reposo: 72 BPM (ciclo de 833 ms)`)
  texto(`Diferencia: ${dif > 0 ? '+' : ''}${dif} BPM y ${intervaloMs - 833 > 0 ? '+' : ''}${intervaloMs - 833} ms`)
  texto(`Estado: ${estado(bpm)}`)
  y += 2

  const canvas = renderizarGrafico({ nombre, bpm, amplitud, ancho: 1200, alto: 520 })
  const alto = (ancho * canvas.height) / canvas.width
  doc.addImage(canvas.toDataURL('image/png'), 'PNG', margen, y, ancho, alto)
  y += alto + 6

  texto('El ECG se muestra solo como referencia educativa: el sensor mide pulso por luz (PPG), no actividad electrica del corazon.', 9, false, [100, 116, 139])
  y += 2
  texto('Aviso: sensor_pulso es una herramienta educativa y no un dispositivo medico. Los resultados no constituyen un diagnostico; ante dudas de salud consulte a un profesional.', 9, true, [180, 83, 9])

  doc.save(`sensor_pulso_informe_${nombreSeguro(nombre)}_${marcaFecha()}.pdf`)
}
