import fs from 'node:fs'
import path from 'node:path'

const root = process.cwd()
const docPath = path.join(root, 'docs', 'RF118-verificacion-cifrado.md')
const doc = fs.readFileSync(docPath, 'utf8')

function assert(condicion, mensaje) {
  if (!condicion) {
    throw new Error(`Fallo de verificacion RF118: ${mensaje}`)
  }
}

console.log('Iniciando pruebas automatizadas para RF118 (Verificacion documentada del cifrado)...')

// 1. Existe docs/RF118-verificacion-cifrado.md con fecha y responsable
assert(fs.existsSync(docPath), 'Debe existir docs/RF118-verificacion-cifrado.md')
assert(doc.includes('2026-11-14') && doc.includes('Javiera'), 'El documento debe registrar fecha y responsable')
console.log('[OK] 1. Documento docs/RF118-verificacion-cifrado.md incluye fecha y responsable.')

// 2. Incluye los 5 puntos requeridos: HTTPS y cabeceras del sitio, TLS del ESP32 (RF55), cifrado en reposo de Supabase, cifrado de campos (RF116) y claves (RF69)
assert(doc.includes('HTTPS y cabeceras del sitio'), 'Falta punto HTTPS y cabeceras del sitio')
assert(doc.includes('TLS del ESP32 (RF55)'), 'Falta punto TLS del ESP32 (RF55)')
assert(doc.includes('Cifrado en reposo de Supabase'), 'Falta punto cifrado en reposo de Supabase')
assert(doc.includes('Cifrado de campos (RF116)'), 'Falta punto cifrado de campos (RF116)')
assert(doc.includes('Claves y secretos (RF69)'), 'Falta punto de claves (RF69)')
console.log('[OK] 2. Lista de verificacion cubre HTTPS/cabeceras, TLS ESP32, reposo Supabase, cifrado de campos y claves.')

// 3. Cada punto de la tabla tiene evidencia y un resultado valido (cumple, no cumple, pendiente)
const filasTabla = doc
  .split(/\r?\n/)
  .filter((linea) => /^\|\s*\d+\.\d+\s*\|/.test(linea))

assert(filasTabla.length >= 10, 'La tabla de verificacion debe desglosar todos los controles comprobados y pendientes')

for (const fila of filasTabla) {
  const cols = fila.split('|').map((c) => c.trim()).filter(Boolean)
  assert(cols.length === 7, `Fila con columnas incompletas: ${fila}`)
  const [id, area, punto, evidencia, fecha, responsable, resultadoRaw] = cols
  const resultado = resultadoRaw.replace(/\*/g, '').toLowerCase()
  assert(evidencia.length >= 20, `El punto ${id} (${punto}) debe incluir evidencia detallada`)
  assert(fecha === '2026-11-14', `El punto ${id} debe tener fecha registrada`)
  assert(responsable === 'Javiera', `El punto ${id} debe tener responsable registrado`)
  assert(
    ['cumple', 'no cumple', 'pendiente'].includes(resultado),
    `Resultado invalido en ${id} (${area}): ${resultadoRaw}`
  )
}
console.log(`[OK] 3. Los ${filasTabla.length} puntos de la lista tienen evidencia, fecha, responsable y resultado valido.`)

// 4. Lo no comprobado directamente queda como pendiente sin afirmarlo, y cero emojis
assert(doc.includes('**pendiente**'), 'Los puntos no comprobados directamente deben quedar como pendiente')
assert(!/[\p{Extended_Pictographic}]/u.test(doc), 'El documento no debe contener emojis')
console.log('[OK] 4. Los puntos no comprobados directamente figuran como pendiente y el documento no contiene emojis.')

console.log('\nTodas las pruebas de RF118 pasaron exitosamente (4/4).')
