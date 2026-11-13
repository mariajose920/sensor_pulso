// RF100 / RF102 · Pruebas de invitar varios correos a la vez, retirar varios estudiantes y eliminar el aula.
// Uso: node scripts/test-aulas-masivo.mjs
import { readFileSync } from 'node:fs'
import { parsearCorreos, quitarCorreoDelTexto, separarCandidatos, MAX_INVITACIONES_POR_ENVIO } from '../src/utils/correosInvitacion.js'
import {
  crearAula, eliminarAula, obtenerAulas, enviarInvitacionesVarias, retirarEstudiantesAula, obtenerEstudiantesAula
} from '../src/services/aulasService.js'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}

// --- Lectura de varios correos
const mezcla = parsearCorreos('uno@alu.unach.cl, dos@alu.unach.cl;\ntres@alu.unach.cl  cuatro@alu.unach.cl')
marcar(mezcla.validos.length === 4, 'Separa por coma, punto y coma, salto de línea y espacio')
const repetidos = parsearCorreos('a@alu.unach.cl A@ALU.UNACH.CL b@alu.unach.cl a@alu.unach.cl')
marcar(repetidos.validos.length === 2 && repetidos.repetidos.length === 1, 'Quita repetidos aunque cambien mayúsculas')
const invalidos = parsearCorreos('ok@alu.unach.cl, profe@unach.cl, nadie@gmail.com, sinarroba')
marcar(invalidos.validos.length === 1 && invalidos.invalidos.length === 3, 'Solo acepta estudiantes @alu.unach.cl; el resto va como no válido')
marcar(parsearCorreos('Ana Pérez <ana@alu.unach.cl>, Luis <luis@alu.unach.cl>').validos.join() === 'ana@alu.unach.cl,luis@alu.unach.cl', 'Entiende el formato «Nombre <correo>»')
marcar(parsearCorreos('').validos.length === 0 && parsearCorreos(null).validos.length === 0, 'Un texto vacío no da correos')
const muchos = Array.from({ length: MAX_INVITACIONES_POR_ENVIO + 5 }, (_, i) => `e${i}@alu.unach.cl`).join('\n')
const limite = parsearCorreos(muchos)
marcar(limite.validos.length === MAX_INVITACIONES_POR_ENVIO && limite.excedidos.length === 5, 'Respeta el máximo por envío y avisa los que sobran')
marcar(quitarCorreoDelTexto('a@alu.unach.cl, b@alu.unach.cl\nc@alu.unach.cl', 'b@alu.unach.cl') === 'a@alu.unach.cl\nc@alu.unach.cl', 'Se puede quitar un correo de la lista')
marcar(separarCandidatos('  A@x.cl ,, ;; b@x.cl ').join() === 'a@x.cl,b@x.cl', 'Ignora separadores repetidos y espacios')

// --- Invitar varios: validaciones previas al envío
let r = await enviarInvitacionesVarias({ aulaId: 'x', correos: [], profesorId: 'p' })
marcar(!r.success && /al menos un correo/i.test(r.error), 'Sin correos no se envía nada')
r = await enviarInvitacionesVarias({ aulaId: 'x', correos: Array.from({ length: MAX_INVITACIONES_POR_ENVIO + 1 }, (_, i) => `e${i}@alu.unach.cl`), profesorId: 'p' })
marcar(!r.success && /hasta/.test(r.error), 'Más del máximo por envío se rechaza')
r = await enviarInvitacionesVarias({ aulaId: 'aula-que-no-existe', correos: ['a@alu.unach.cl', 'b@alu.unach.cl', 'c@alu.unach.cl'], profesorId: 'p', pausaMs: 0 })
marcar(!r.success && r.enviados.length === 0 && r.fallidos.length === 3, 'Si el aula no existe, todos quedan como fallidos con su motivo')

// --- Eliminar aula (modo local)
const creada = await crearAula({ nombre: 'Aula de prueba masiva', descripcion: '', profesorId: 'prof-1', profesorNombre: 'Profe', tienePermiso: true })
marcar(creada.success, 'Se crea un aula de prueba')
const id = creada.data.id
let res = await eliminarAula({ aulaId: id, profesorId: 'otro-profesor', esAdmin: false })
marcar(!res.success && /dueño/.test(res.error), 'Otro profesor no puede eliminar el aula')
marcar((await obtenerAulas({ usuarioId: 'prof-1', esProfesor: true })).data.some((a) => a.id === id), 'El aula sigue existiendo tras el intento ajeno')
res = await eliminarAula({ aulaId: id, profesorId: 'prof-1', esAdmin: false })
marcar(res.success, 'El profesor dueño elimina su aula')
marcar(!(await obtenerAulas({ usuarioId: 'prof-1', esProfesor: true })).data.some((a) => a.id === id), 'El aula ya no aparece en la lista')
res = await eliminarAula({ aulaId: id, profesorId: 'prof-1', esAdmin: false })
marcar(!res.success, 'Eliminar un aula que ya no existe no se da por hecho')
res = await eliminarAula({ aulaId: '', profesorId: 'prof-1' })
marcar(!res.success, 'Sin id de aula se rechaza')
const admin = await crearAula({ nombre: 'Aula del admin', descripcion: '', profesorId: 'prof-2', profesorNombre: 'Otro', tienePermiso: true })
res = await eliminarAula({ aulaId: admin.data.id, profesorId: 'admin-1', esAdmin: true })
marcar(res.success, 'Un administrador puede eliminar cualquier aula')

// --- Retirar varios estudiantes a la vez (ya existía; se verifica con las aulas de ejemplo)
const antes = (await obtenerEstudiantesAula('aula-001')).data.length
const retiro = await retirarEstudiantesAula({
  aulaId: 'aula-001',
  estudiantesIds: ['00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000004'],
  profesorId: 'prof',
  esAdmin: true
})
const despues = (await obtenerEstudiantesAula('aula-001')).data.length
marcar(retiro.success && retiro.count === 2 && despues === antes - 2, 'Se retiran dos estudiantes de una sola vez')
marcar(!(await retirarEstudiantesAula({ aulaId: 'aula-001', estudiantesIds: [], profesorId: 'prof', esAdmin: true })).success, 'Retirar sin elegir a nadie se rechaza')

// --- La pantalla usa todo esto
const vista = readFileSync(new URL('../src/views/AulasView.vue', import.meta.url), 'utf8')
marcar(/data-testid="correos-invitacion"/.test(vista) && /enviarInvitacionesVarias/.test(vista), 'La pantalla de aulas invita con varios correos')
marcar(/data-testid="retirar-seleccionados"/.test(vista) && /retirarEstudiantesAula/.test(vista), 'La pantalla de aulas retira varios estudiantes')
marcar(/data-testid="eliminar-aula"/.test(vista) && /confirmacionNombre\.trim\(\) !== aulaAEliminar\.nombre/.test(vista), 'La pantalla de aulas elimina el aula pidiendo escribir su nombre')
const evaluaciones = readFileSync(new URL('../src/views/EvaluacionesView.vue', import.meta.url), 'utf8')
marcar(!/<p v-if="avisoRegreso"[^>]*>[^<]*<\/p>\s*<div v-else>/.test(evaluaciones), 'El aviso de regreso no rompe el v-if/v-else que muestra el formulario')
marcar(/<div ref="zonaCreacion">/.test(evaluaciones), 'El formulario de la evaluación se muestra siempre, también al volver de crear el aula')

console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(fallos ? 1 : 0)
