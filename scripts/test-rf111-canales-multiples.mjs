// RF111 · Pruebas de «Agregar otro canal» (profesor y administrador)
//   node scripts/test-rf111-canales-multiples.mjs
import { readFileSync } from 'node:fs'
import {
  MAX_CANALES_DOCENTE, esDocente, siguienteCanalLibre, evaluarAgregarCanal,
  canalPrincipal, requisitosCompletos, canalListoParaMedir
} from '../src/utils/canalesMultiples.js'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }

const sesion = () => [1, 2, 3, 4, 5].map(canal => ({ canal, usuario_id: null, asignado_en: null }))
const tomar = (canales, canal, uid, t) => { const c = canales.find(x => x.canal === canal); c.usuario_id = uid; c.asignado_en = t }
const fichaOk = { nombre: 'Ana Pérez', edad: 30, nivelEstres: 'bajo' }
const req = { ficha: fichaOk, politicaVersion: '1.0', consentimientoVersion: '1.0' }
const vig = { politicaVigente: '1.0' }

console.log('Rol')
prueba('profesor y admin son docentes', esDocente('profesor') && esDocente('admin'))
prueba('estudiante y usuario no lo son', !esDocente('estudiante') && !esDocente('usuario') && !esDocente(undefined))

console.log('Botón «Agregar otro canal»')
let c = sesion()
tomar(c, 1, 'prof', '2026-11-09T10:00:00Z')
prueba('no aparece para estudiante', !evaluarAgregarCanal({ rol: 'estudiante', canales: c, usuarioId: 'prof' }).visible)
prueba('no aparece para usuario normal', !evaluarAgregarCanal({ rol: 'usuario', canales: c, usuarioId: 'prof' }).visible)
const sinCanal = evaluarAgregarCanal({ rol: 'profesor', canales: sesion(), usuarioId: 'prof' })
prueba('profesor sin canales ya ve el botón (el primer canal también es automático)', sinCanal.visible && sinCanal.puede && sinCanal.primero)
prueba('admin sin canales ya ve el botón', evaluarAgregarCanal({ rol: 'admin', canales: sesion(), usuarioId: 'adm' }).puede)
prueba('estudiante sin canales no ve el botón (elige a mano)', !evaluarAgregarCanal({ rol: 'estudiante', canales: sesion(), usuarioId: 'est' }).visible)
prueba('aparece y funciona para profesor con 1 canal', evaluarAgregarCanal({ rol: 'profesor', canales: c, usuarioId: 'prof' }).puede)
prueba('aparece y funciona para admin con 1 canal', evaluarAgregarCanal({ rol: 'admin', canales: c, usuarioId: 'prof' }).puede)

console.log('Asignación automática')
prueba('el siguiente libre es el canal 2', siguienteCanalLibre(c) === 2)
tomar(c, 2, 'est', 'x') // un estudiante ocupa el 2
prueba('salta los canales ocupados por otros (da el 3)', siguienteCanalLibre(c) === 3)
prueba('sin libres devuelve null', siguienteCanalLibre(c.map(x => ({ ...x, usuario_id: 'z' }))) === null)

console.log('Tope de 5 canales')
c = sesion()
for (let i = 1; i <= 4; i++) tomar(c, i, 'prof', `2026-11-09T10:0${i}:00Z`)
prueba('con 4 todavía puede agregar el 5.º', evaluarAgregarCanal({ rol: 'profesor', canales: c, usuarioId: 'prof' }).puede)
tomar(c, 5, 'prof', '2026-11-09T10:05:00Z')
const e5 = evaluarAgregarCanal({ rol: 'profesor', canales: c, usuarioId: 'prof' })
prueba('con 5 el botón se detiene', e5.visible && !e5.puede && /5/.test(e5.motivo))
prueba('el máximo es 5', MAX_CANALES_DOCENTE === 5)
c = sesion(); tomar(c, 1, 'prof', 'a'); tomar(c, 2, 'o1', 'b'); tomar(c, 3, 'o2', 'c'); tomar(c, 4, 'o3', 'd'); tomar(c, 5, 'o4', 'e')
prueba('sin canales libres no puede agregar', !evaluarAgregarCanal({ rol: 'profesor', canales: c, usuarioId: 'prof' }).puede)

console.log('Ficha + términos + consentimiento por canal')
c = sesion(); tomar(c, 1, 'prof', '2026-11-09T10:00:00Z'); tomar(c, 2, 'prof', '2026-11-09T10:05:00Z')
prueba('el canal principal es el primero que se tomó', canalPrincipal(c, 'prof') === 1)
prueba('el principal mide sin pasos extra', canalListoParaMedir({ canal: 1, canales: c, usuarioId: 'prof', requisitos: {}, vigentes: vig }))
const medir = (r) => canalListoParaMedir({ canal: 2, canales: c, usuarioId: 'prof', requisitos: { 2: r }, vigentes: vig })
prueba('canal adicional sin nada: no mide', !medir(undefined))
prueba('con los tres: mide', medir(req))
prueba('sin ficha: no mide', !medir({ ...req, ficha: null }))
prueba('ficha de menor de edad: no mide', !medir({ ...req, ficha: { ...fichaOk, edad: 17 } }))
prueba('ficha sin nivel de estrés: no mide', !medir({ ...req, ficha: { ...fichaOk, nivelEstres: '' } }))
prueba('sin términos: no mide', !medir({ ...req, politicaVersion: null }))
prueba('términos de una versión antigua: no mide', !medir({ ...req, politicaVersion: '0.9' }))
prueba('sin consentimiento: no mide', !medir({ ...req, consentimientoVersion: null }))
prueba('faltan se informa', requisitosCompletos({ ...req, consentimientoVersion: null }, vig).faltan.join() === 'consentimiento')

console.log('Sesión real o de demostración')
const srv = readFileSync(new URL('../src/services/canalesService.js', import.meta.url), 'utf8')
prueba('el servidor solo se usa con una sesión real (uuid)', srv.includes('hayCuenta && sesionReal') && srv.includes('esUuid(canalesState.sesionActivaId)'))
const vistaV = readFileSync(new URL('../src/components/CanalesPacientesPanel.vue', import.meta.url), 'utf8')
prueba('ya no existe «Alternar Rol Demo»', !/Alternar Rol Demo|alternarRolDemo/.test(vistaV))

console.log('Migración y archivos')
const sql = readFileSync(new URL('../supabase/migrations/20261109000200_canales_multiples_docente.sql', import.meta.url), 'utf8')
prueba('quita el índice único de un canal por usuario', /drop index if exists public\.sesion_canal_un_usuario/.test(sql))
prueba('trigger limita a un canal a quien no es profesor/admin', /puede_tener_varios_canales\(new\.usuario_id\)/.test(sql) && /before insert or update of usuario_id/.test(sql))
prueba('la función exige profesor o admin', /es_admin\(\) or public\.es_profesor\(\)/.test(sql))
prueba('la función exige ficha, política y consentimiento', /RF03/.test(sql) && /RF88/.test(sql) && /RF04/.test(sql))
prueba('la función no se da a anon', /revoke all on function public\.agregar_canal_automatico[^;]*from public, anon/.test(sql))
prueba('RLS en la tabla de requisitos', /alter table public\.sesion_canal_requisitos enable row level security/.test(sql))
prueba('los clientes no escriben requisitos', /revoke insert, update, delete on public\.sesion_canal_requisitos from authenticated/.test(sql))
const vista = readFileSync(new URL('../src/components/CanalesPacientesPanel.vue', import.meta.url), 'utf8')
prueba('el botón del profesor depende de evaluarAgregarCanal (puede / motivo)', /:disabled="!estadoAgregarCanal\.puede/.test(vista) && /estadoAgregarCanal\.motivo/.test(vista))

console.log(`\n${ok} pruebas pasadas, ${mal} fallidas`)
process.exit(mal ? 1 : 0)
