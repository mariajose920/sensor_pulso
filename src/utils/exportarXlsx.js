/**
 * Generador mínimo de archivos Excel (.xlsx) sin dependencias externas.
 *
 * Un .xlsx es un ZIP con varios XML. Aquí se arma ese ZIP "sin compresión" (método store), suficiente
 * para tablas de unos pocos miles de filas, y se aplican estilos: título, encabezado de color,
 * bordes, filas resaltadas, anchos de columna, fila de encabezado fija y filtros automáticos.
 *
 * Uso:
 *   const bytes = construirXlsx([{ nombre, anchos, filas, combinar, congelarFila, filtro, horizontal }])
 * donde cada fila es { alto?, celdas: [{ v, e, f }] }:
 *   v = valor (texto o número), e = estilo (ESTILO_XLSX), f = true si v es una fecha (serial de Excel).
 */

export const ESTILO_XLSX = Object.freeze({
  NORMAL: 0,
  TITULO: 1,
  SUBTITULO: 2,
  ENCABEZADO: 3,
  CELDA: 4,
  FECHA: 5,
  CELDA_ALERTA: 6,
  FECHA_ALERTA: 7,
  CENTRO: 8,
  CENTRO_ALERTA: 9,
  ETIQUETA: 10,
  NUMERO: 11
})

const codificador = new TextEncoder()

// ---------------------------------------------------------------- utilidades XML
function escaparXml(valor) {
  return String(valor)
    // Caracteres de control no permitidos en XML 1.0
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 0 -> A, 25 -> Z, 26 -> AA */
export function letraColumna(indice) {
  let n = indice + 1
  let letras = ''
  while (n > 0) {
    const resto = (n - 1) % 26
    letras = String.fromCharCode(65 + resto) + letras
    n = Math.floor((n - 1) / 26)
  }
  return letras
}

/** Nombre de hoja válido para Excel: sin \ / ? * [ ] : y de hasta 31 caracteres. */
export function nombreHojaSeguro(nombre, respaldo = 'Hoja') {
  const limpio = String(nombre || '').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31)
  return limpio || respaldo
}

/** Fecha -> número de serie de Excel (días desde 1899-12-30) tomando los componentes tal cual vienen. */
export function serialExcel({ anio, mes, dia, hora = 0, minuto = 0, segundo = 0 }) {
  const dias = Date.UTC(anio, mes - 1, dia) / 86400000 + 25569
  return dias + (hora * 3600 + minuto * 60 + segundo) / 86400
}

// ---------------------------------------------------------------- estilos
const ESTILOS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="dd\\-mm\\-yyyy\\ hh:mm:ss"/></numFmts>
<fonts count="6">
<font><sz val="11"/><color rgb="FF1E293B"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="16"/><color rgb="FF003366"/><name val="Calibri"/><family val="2"/></font>
<font><i/><sz val="10"/><color rgb="FF64748B"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FFB91C1C"/><name val="Calibri"/><family val="2"/></font>
<font><b/><sz val="11"/><color rgb="FF1E293B"/><name val="Calibri"/><family val="2"/></font>
</fonts>
<fills count="5">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF003366"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFFEE2E2"/><bgColor indexed="64"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left style="thin"><color rgb="FFCBD5E1"/></left><right style="thin"><color rgb="FFCBD5E1"/></right><top style="thin"><color rgb="FFCBD5E1"/></top><bottom style="thin"><color rgb="FFCBD5E1"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="12">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
<xf numFmtId="164" fontId="0" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="left" vertical="top"/></xf>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="4" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="top"/></xf>
<xf numFmtId="0" fontId="5" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center"/></xf>
<xf numFmtId="3" fontId="0" fillId="0" borderId="1" xfId="0" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right" vertical="center"/></xf>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

// ---------------------------------------------------------------- hojas
function celdaXml(celda, fila, columna) {
  if (celda === null || celda === undefined) return ''
  const objeto = typeof celda === 'object' ? celda : { v: celda }
  const ref = `${letraColumna(columna)}${fila}`
  const estilo = objeto.e ? ` s="${objeto.e}"` : ''
  const valor = objeto.v
  if (valor === null || valor === undefined || valor === '') {
    return estilo ? `<c r="${ref}"${estilo}/>` : ''
  }
  if (typeof valor === 'number' && Number.isFinite(valor)) {
    return `<c r="${ref}"${estilo}><v>${valor}</v></c>`
  }
  return `<c r="${ref}"${estilo} t="inlineStr"><is><t xml:space="preserve">${escaparXml(valor)}</t></is></c>`
}

function hojaXml(hoja) {
  const filas = hoja.filas || []
  const anchos = hoja.anchos || []
  const horizontal = hoja.horizontal !== false
  let maxColumnas = anchos.length
  for (const f of filas) maxColumnas = Math.max(maxColumnas, (f.celdas || []).length)

  const partes = ['<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
    '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
    '<sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>']

  const ultimaCol = letraColumna(Math.max(0, maxColumnas - 1))
  partes.push(`<dimension ref="A1:${ultimaCol}${Math.max(1, filas.length)}"/>`)

  const congelar = Number.isInteger(hoja.congelarFila) && hoja.congelarFila > 0 ? hoja.congelarFila : 0
  const verGrilla = hoja.grilla === false ? ' showGridLines="0"' : ''
  if (congelar) {
    partes.push(`<sheetViews><sheetView${verGrilla} workbookViewId="0"><pane ySplit="${congelar}" topLeftCell="A${congelar + 1}" activePane="bottomLeft" state="frozen"/><selection pane="bottomLeft" activeCell="A${congelar + 1}" sqref="A${congelar + 1}"/></sheetView></sheetViews>`)
  } else {
    partes.push(`<sheetViews><sheetView${verGrilla} workbookViewId="0"/></sheetViews>`)
  }
  partes.push('<sheetFormatPr defaultRowHeight="15"/>')

  if (anchos.length) {
    partes.push('<cols>' + anchos.map((a, i) =>
      `<col min="${i + 1}" max="${i + 1}" width="${Number(a) || 12}" customWidth="1"/>`).join('') + '</cols>')
  }

  partes.push('<sheetData>')
  filas.forEach((fila, i) => {
    const numero = i + 1
    const alto = fila.alto ? ` ht="${fila.alto}" customHeight="1"` : ''
    const celdas = (fila.celdas || []).map((c, j) => celdaXml(c, numero, j)).join('')
    partes.push(`<row r="${numero}"${alto}>${celdas}</row>`)
  })
  partes.push('</sheetData>')

  if (hoja.filtro) partes.push(`<autoFilter ref="${escaparXml(hoja.filtro)}"/>`)
  const combinar = hoja.combinar || []
  if (combinar.length) {
    partes.push(`<mergeCells count="${combinar.length}">` +
      combinar.map(r => `<mergeCell ref="${escaparXml(r)}"/>`).join('') + '</mergeCells>')
  }
  partes.push('<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>')
  partes.push(`<pageSetup paperSize="9" orientation="${horizontal ? 'landscape' : 'portrait'}" fitToWidth="1" fitToHeight="0"/>`)
  partes.push('</worksheet>')
  return partes.join('')
}

// ---------------------------------------------------------------- ZIP (sin compresión)
let tablaCrc = null
function crc32(bytes) {
  if (!tablaCrc) {
    tablaCrc = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      tablaCrc[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (let i = 0; i < bytes.length; i++) crc = tablaCrc[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function fechaHoraDos(fecha) {
  const hora = (fecha.getHours() << 11) | (fecha.getMinutes() << 5) | Math.floor(fecha.getSeconds() / 2)
  const dia = ((Math.max(1980, fecha.getFullYear()) - 1980) << 9) | ((fecha.getMonth() + 1) << 5) | fecha.getDate()
  return { hora, dia }
}

/** Arma un ZIP con los archivos { nombre, bytes } sin comprimir. */
export function construirZip(archivos, fecha = new Date()) {
  const { hora, dia } = fechaHoraDos(fecha)
  const locales = []
  const centrales = []
  let desplazamiento = 0

  for (const archivo of archivos) {
    const nombre = codificador.encode(archivo.nombre)
    const datos = archivo.bytes
    const crc = crc32(datos)

    const local = new Uint8Array(30 + nombre.length)
    const vl = new DataView(local.buffer)
    vl.setUint32(0, 0x04034b50, true)
    vl.setUint16(4, 20, true)
    vl.setUint16(6, 0x0800, true)
    vl.setUint16(8, 0, true)
    vl.setUint16(10, hora, true)
    vl.setUint16(12, dia, true)
    vl.setUint32(14, crc, true)
    vl.setUint32(18, datos.length, true)
    vl.setUint32(22, datos.length, true)
    vl.setUint16(26, nombre.length, true)
    vl.setUint16(28, 0, true)
    local.set(nombre, 30)

    const central = new Uint8Array(46 + nombre.length)
    const vc = new DataView(central.buffer)
    vc.setUint32(0, 0x02014b50, true)
    vc.setUint16(4, 20, true)
    vc.setUint16(6, 20, true)
    vc.setUint16(8, 0x0800, true)
    vc.setUint16(10, 0, true)
    vc.setUint16(12, hora, true)
    vc.setUint16(14, dia, true)
    vc.setUint32(16, crc, true)
    vc.setUint32(20, datos.length, true)
    vc.setUint32(24, datos.length, true)
    vc.setUint16(28, nombre.length, true)
    vc.setUint32(42, desplazamiento, true)
    central.set(nombre, 46)

    locales.push(local, datos)
    centrales.push(central)
    desplazamiento += local.length + datos.length
  }

  const tamanoCentral = centrales.reduce((s, c) => s + c.length, 0)
  const fin = new Uint8Array(22)
  const vf = new DataView(fin.buffer)
  vf.setUint32(0, 0x06054b50, true)
  vf.setUint16(8, archivos.length, true)
  vf.setUint16(10, archivos.length, true)
  vf.setUint32(12, tamanoCentral, true)
  vf.setUint32(16, desplazamiento, true)

  const partes = [...locales, ...centrales, fin]
  const salida = new Uint8Array(partes.reduce((s, p) => s + p.length, 0))
  let pos = 0
  for (const p of partes) {
    salida.set(p, pos)
    pos += p.length
  }
  return salida
}

// ---------------------------------------------------------------- libro completo
/** Devuelve los bytes de un .xlsx con las hojas indicadas. */
export function construirXlsx(hojas = []) {
  if (!hojas.length) throw new Error('El libro necesita al menos una hoja')
  const nombres = []
  const hojasSeguras = hojas.map((h, i) => {
    let nombre = nombreHojaSeguro(h.nombre, `Hoja${i + 1}`)
    let intento = 2
    while (nombres.some(n => n.toLowerCase() === nombre.toLowerCase())) {
      nombre = `${nombre.slice(0, 28)} ${intento++}`
    }
    nombres.push(nombre)
    return { ...h, nombre }
  })

  const tipos = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
    '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
    '<Default Extension="xml" ContentType="application/xml"/>' +
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
    hojasSeguras.map((_, i) =>
      `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('') +
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
    '</Types>'

  const relaciones = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
    '</Relationships>'

  const libro = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">' +
    '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="24000" windowHeight="12000"/></bookViews>' +
    '<sheets>' + hojasSeguras.map((h, i) =>
      `<sheet name="${escaparXml(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('') + '</sheets>' +
    '</workbook>'

  const relacionesLibro = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
    hojasSeguras.map((_, i) =>
      `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('') +
    `<Relationship Id="rId${hojasSeguras.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>` +
    '</Relationships>'

  const archivos = [
    { nombre: '[Content_Types].xml', bytes: codificador.encode(tipos) },
    { nombre: '_rels/.rels', bytes: codificador.encode(relaciones) },
    { nombre: 'xl/workbook.xml', bytes: codificador.encode(libro) },
    { nombre: 'xl/_rels/workbook.xml.rels', bytes: codificador.encode(relacionesLibro) },
    { nombre: 'xl/styles.xml', bytes: codificador.encode(ESTILOS_XML) },
    ...hojasSeguras.map((h, i) => ({
      nombre: `xl/worksheets/sheet${i + 1}.xml`,
      bytes: codificador.encode(hojaXml(h))
    }))
  ]
  return construirZip(archivos)
}
