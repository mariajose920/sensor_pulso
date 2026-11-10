// RF03 · Fecha de nacimiento con edad automática y persistencia de la ficha propia
//   node scripts/test-ficha-fecha-nacimiento.mjs
import {
  calcularEdad, validarFechaNacimiento, validarEdadLegado, fechaHoyIso, parsearFechaIso, textoEdad
} from '../src/utils/edad.js'
import { fusionarFicha, aplicarEdadCalculada, elegirFichaVigente, fichaCompleta } from '../src/utils/fichaPersistencia.js'

// sessionStorage de prueba (en Node no existe): la copia de trabajo de la ficha vive aquí
const memoria = new Map()
globalThis.sessionStorage = {
  getItem: (k) => (memoria.has(k) ? memoria.get(k) : null),
  setItem: (k, v) => { memoria.set(k, String(v)) },
  removeItem: (k) => { memoria.delete(k) }
}
const { pacienteService } = await import('../src/services/pacienteService.js')

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }
const hoy = new Date(2026, 10, 9) // 9-nov-2026 (hora local)

console.log('calcularEdad')
prueba('cumpleaños ya ocurrido este año', calcularEdad('1990-03-15', hoy) === 36)
prueba('cumpleaños aún no ocurrido este año', calcularEdad('1990-12-01', hoy) === 35)
prueba('cumple justo hoy', calcularEdad('2000-11-09', hoy) === 26)
prueba('cumple mañana: todavía no', calcularEdad('2000-11-10', hoy) === 25)
prueba('nacido el 29-feb, antes de marzo en año no bisiesto', calcularEdad('2000-02-29', new Date(2027, 1, 28)) === 26)
prueba('nacido el 29-feb, el 1-mar ya cumplió', calcularEdad('2000-02-29', new Date(2027, 2, 1)) === 27)
prueba('nacido el 29-feb, en año bisiesto el 29-feb cumple', calcularEdad('2000-02-29', new Date(2028, 1, 29)) === 28)
prueba('29-feb de año no bisiesto no existe', calcularEdad('2001-02-29', hoy) === null)
prueba('fecha futura -> null', calcularEdad('2027-01-01', hoy) === null)
prueba('mañana -> null', calcularEdad('2026-11-10', hoy) === null)
prueba('formato inválido -> null', calcularEdad('15/03/1990', hoy) === null && calcularEdad('abc', hoy) === null && calcularEdad('', hoy) === null && calcularEdad(null, hoy) === null)
prueba('mes/día imposibles -> null', calcularEdad('1990-13-01', hoy) === null && calcularEdad('1990-04-31', hoy) === null)
prueba('fechaHoyIso da AAAA-MM-DD local', fechaHoyIso(hoy) === '2026-11-09')
prueba('parsearFechaIso', parsearFechaIso('1990-03-05')?.dia === 5)
prueba('textoEdad singular/plural', textoEdad(1) === '1 año' && textoEdad(34) === '34 años' && textoEdad(undefined) === '')

console.log('validarFechaNacimiento (18 a 100 años)')
prueba('adulto válido', validarFechaNacimiento('1992-05-20', hoy).valido && validarFechaNacimiento('1992-05-20', hoy).edad === 34)
prueba('17 años (cumple 18 mañana) rechazado', !validarFechaNacimiento('2008-11-10', hoy).valido)
prueba('exactamente 18 años hoy aceptado', validarFechaNacimiento('2008-11-09', hoy).valido)
prueba('100 años aceptado', validarFechaNacimiento('1926-11-09', hoy).valido)
prueba('101 años rechazado', !validarFechaNacimiento('1925-11-09', hoy).valido)
prueba('futura rechazada con mensaje', /futura/.test(validarFechaNacimiento('2030-01-01', hoy).error))
prueba('vacía rechazada', !validarFechaNacimiento('', hoy).valido && !validarFechaNacimiento(undefined, hoy).valido)
prueba('formato inválido rechazado', !validarFechaNacimiento('31/12/1990', hoy).valido)
prueba('legado: edad 18-120 entera', validarEdadLegado(18) && validarEdadLegado(120) && !validarEdadLegado(17) && !validarEdadLegado(121) && !validarEdadLegado(30.5) && !validarEdadLegado(null))

console.log('pacienteService.validarDatos')
const base = { nombre: 'Ana Pérez', nivelEstres: 'bajo' }
prueba('acepta fechaNacimiento válida', pacienteService.validarDatos({ ...base, fechaNacimiento: '1990-03-15' }).valido)
prueba('rechaza fecha futura', !pacienteService.validarDatos({ ...base, fechaNacimiento: '2999-01-01' }).valido)
prueba('rechaza menor de 18 por fecha', !pacienteService.validarDatos({ ...base, fechaNacimiento: '2015-01-01' }).valido)
prueba('compatibilidad: acepta edad sin fecha', pacienteService.validarDatos({ ...base, edad: 30 }).valido)
prueba('compatibilidad: rechaza edad 17 sin fecha', !pacienteService.validarDatos({ ...base, edad: 17 }).valido)
prueba('sin fecha ni edad -> error', !pacienteService.validarDatos({ ...base }).valido)
prueba('la fecha manda sobre una edad suelta', !pacienteService.validarDatos({ ...base, edad: 30, fechaNacimiento: '2999-01-01' }).valido)
prueba('sigue exigiendo nombre y estrés', pacienteService.validarDatos({ fechaNacimiento: '1990-03-15' }).errores.length === 2)

console.log('Fusión de la ficha (no borra campos)')
const actual = { nombre: 'Ana', edad: 35, fechaNacimiento: '1990-12-01', nivelEstres: 'alto', cafeina: 'baja', observaciones: 'x' }
const f1 = fusionarFicha(actual, { cafeina: 'alta', nivelEstres: undefined, observaciones: null })
prueba('un objeto parcial conserva el resto', f1.nivelEstres === 'alto' && f1.observaciones === 'x' && f1.nombre === 'Ana')
prueba('lo enviado sobrescribe', f1.cafeina === 'alta')
prueba('cadena vacía enviada sí sobrescribe (edición explícita)', fusionarFicha(actual, { observaciones: '' }).observaciones === '')
prueba('aplicarEdadCalculada recalcula desde la fecha', aplicarEdadCalculada({ edad: 99, fechaNacimiento: '1990-12-01' }, hoy).edad === 35)
prueba('aplicarEdadCalculada conserva edad antigua sin fecha', aplicarEdadCalculada({ edad: 41 }, hoy).edad === 41)
prueba('fichaCompleta', fichaCompleta({ nombre: 'A', edad: 30, nivelEstres: 'bajo' }) && !fichaCompleta({ nombre: 'A', edad: 30 }))

console.log('Elección de la ficha vigente')
const fila = (id, creadoEn, factores) => ({ id, nombre: 'Ana', edad: 30, creadoEn, factores })
const nueva = fila('n', '2026-11-09T12:00:00Z', { nivelEstres: 'medio', cafeina: 'baja', fechaNacimiento: '1990-12-01' })
const vieja = fila('v', '2026-11-01T12:00:00Z', { nivelEstres: 'alto' })
const ilegible = fila('i', '2026-11-09T13:00:00Z', {})
let v = elegirFichaVigente([nueva, vieja], null, hoy)
prueba('toma la más nueva con TODOS sus campos (nivelEstres incluido)', v.id === 'n' && v.nivelEstres === 'medio' && v.cafeina === 'baja')
prueba('edad recalculada desde la fecha', v.edad === 35 && v.fechaNacimiento === '1990-12-01')
v = elegirFichaVigente([ilegible, vieja], null, hoy)
prueba('una fila ilegible más nueva no oculta la válida anterior', v.id === 'v' && v.nivelEstres === 'alto')
v = elegirFichaVigente([ilegible], null, hoy)
prueba('solo ilegible: conserva nombre/edad y se marca incompleta', v.incompleta === true && v.nombre === 'Ana' && v.edad === 30 && !v.nivelEstres)
const localPend = { nombre: 'Ana', edad: 30, nivelEstres: 'muy_alto', pendienteSync: true, actualizadoEn: '2026-11-09T14:00:00Z' }
v = elegirFichaVigente([nueva, vieja], localPend, hoy)
prueba('ficha local pendiente y más nueva gana al servidor', v.nivelEstres === 'muy_alto' && v.pendienteSync === true)
v = elegirFichaVigente([nueva], { ...localPend, actualizadoEn: '2026-11-01T00:00:00Z' }, hoy)
prueba('ficha local pendiente pero más vieja no pisa al servidor', v.id === 'n')
v = elegirFichaVigente([ilegible], { ...localPend, pendienteSync: false, id: 'i', actualizadoEn: '2026-11-09T13:00:00Z' }, hoy)
prueba('fila ilegible pero con copia local de esa misma fila: usa la copia completa', v.nivelEstres === 'muy_alto')
prueba('sin filas ni copia -> null', elegirFichaVigente([], null, hoy) === null)
prueba('sin filas con copia -> copia', elegirFichaVigente([], { nombre: 'A', edad: 20, nivelEstres: 'bajo' }, hoy).nivelEstres === 'bajo')

console.log('guardarDeclaracion (sin sesión: copia de trabajo)')
const completa = { nombre: 'Ana Pérez', fechaNacimiento: '1990-03-15', nivelEstres: 'alto', cafeina: 'alta', suenoHoras: '5_6', condicionSalud: 'Asma u otra afección respiratoria', observaciones: 'nota' }
const r1 = await pacienteService.guardarDeclaracion(completa)
prueba('guarda y calcula la edad desde la fecha', r1.ok && r1.data.edad === calcularEdad('1990-03-15') && r1.data.fechaNacimiento === '1990-03-15')
const r2 = await pacienteService.guardarDeclaracion({ nombre: 'Ana P.', cafeina: 'ninguna' })
prueba('guardado parcial parte de la ficha completa: conserva estrés, fecha y condición', r2.ok && r2.data.nivelEstres === 'alto' && r2.data.fechaNacimiento === '1990-03-15' && r2.data.condicionSalud === 'Asma u otra afección respiratoria' && r2.data.suenoHoras === '5_6')
prueba('y aplica lo modificado', r2.data.nombre === 'Ana P.' && r2.data.cafeina === 'ninguna')
const act = await pacienteService.obtenerDeclaracionActiva()
prueba('al recargar se ve la ficha editada, no la anterior', act?.nombre === 'Ana P.' && act.cafeina === 'ninguna' && act.nivelEstres === 'alto')
const r3 = await pacienteService.guardarDeclaracion({ fechaNacimiento: '2999-01-01' })
prueba('fecha futura no se guarda y no altera la ficha', !r3.ok && (await pacienteService.obtenerDeclaracionActiva()).fechaNacimiento === '1990-03-15')
memoria.clear()
await pacienteService.guardarDeclaracion({ nombre: 'Luis Soto', edad: 40, nivelEstres: 'bajo' })
const leg = await pacienteService.obtenerDeclaracionActiva()
prueba('ficha antigua solo con edad sigue cargando', leg.edad === 40 && !leg.fechaNacimiento && leg.nivelEstres === 'bajo')
const r4 = await pacienteService.guardarDeclaracion({ fechaNacimiento: '1985-06-01' })
prueba('al agregar la fecha a una ficha antigua se actualiza la edad', r4.ok && r4.data.edad === calcularEdad('1985-06-01') && r4.data.nombre === 'Luis Soto')
memoria.clear()
const r5 = await pacienteService.guardarDeclaracion({ nombre: 'Canal 2', fechaNacimiento: '1980-01-01', nivelEstres: 'medio' }, { adicional: true, sesionId: 'x' })
prueba('ficha de canal adicional no pisa la ficha propia', r5.ok && pacienteService.obtenerUltimaDeclaracion() === null)

console.log(`\n${ok} correctas, ${mal} con error`)
process.exit(mal ? 1 : 0)
