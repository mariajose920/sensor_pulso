// Sin sesión no hay sensor: solo se puede estudiar o comparar. Uso: node scripts/test-acceso-sin-sesion.mjs
import { readFileSync } from 'node:fs'

let fallos = 0
const marcar = (ok, texto) => { if (!ok) fallos++; console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`) }
const lee = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

const router = lee('../src/router/index.js')
const bloque = (nombre) => {
  const i = router.indexOf(`name: '${nombre}'`)
  return i < 0 ? '' : router.slice(Math.max(0, router.lastIndexOf('{', i)), router.indexOf('},', i) + 2)
}

// Reglas puras
const { motivoDeRuta, mensajeSesionRequerida, ENLACES_SOLO_CON_SESION } = await import('../src/utils/accesoSinSesion.js')
marcar(motivoDeRuta('Medicion') === 'medicion' && motivoDeRuta('Dispositivos') === 'medicion', 'Medición y Dispositivos tienen el motivo «medicion»')
marcar(motivoDeRuta('Aulas') === 'aulas' && motivoDeRuta('AulaDetalle') === 'aulas', 'Aulas y la página de un aula tienen el motivo «aulas»')
marcar(motivoDeRuta('Aprendizaje') === undefined && motivoDeRuta('Comparacion') === undefined, 'Aprendizaje y Comparación no tienen motivo: son libres')
marcar(/sin sesión no hay sensor/i.test(mensajeSesionRequerida('medicion')) && /aulas/i.test(mensajeSesionRequerida('aulas')), 'Cada motivo tiene su aviso')
marcar(/Aprendizaje/.test(mensajeSesionRequerida('aulas')) && /Comparación/.test(mensajeSesionRequerida('aulas')), 'El aviso de aulas indica que se puede estudiar o comparar')
marcar(mensajeSesionRequerida('otro') === '' && mensajeSesionRequerida(undefined) === '', 'Un motivo desconocido no muestra aviso')
marcar(['/medicion', '/dispositivos', '/aulas'].every((r) => ENLACES_SOLO_CON_SESION.includes(r)) && !ENLACES_SOLO_CON_SESION.includes('/aprendizaje') && !ENLACES_SOLO_CON_SESION.includes('/comparacion'), 'El menú oculta Medición, Dispositivos y Aulas, no Aprendizaje ni Comparación')

// Rutas
marcar(/requiresAuth:\s*true/.test(bloque('Aulas')), 'La ruta de Aulas exige sesión')
marcar(/requiresAuth:\s*true/.test(bloque('AulaDetalle')), 'La página de un aula exige sesión')
marcar(/requiresAuth:\s*true/.test(bloque('Medicion')), 'La ruta de Medición exige sesión')
marcar(/requiresAuth:\s*true/.test(bloque('Dispositivos')), 'La gestión de dispositivos ESP32 también exige sesión')
marcar(!/requiresAuth/.test(bloque('Aprendizaje')) && !/requiresAuth/.test(bloque('Leccion')) && !/requiresAuth/.test(bloque('Simulador')), 'Aprendizaje (lecciones y simulador) sigue abierto sin sesión')
marcar(!/requiresAuth/.test(bloque('Comparacion')), 'Comparación sigue abierta sin sesión')
marcar(!/requiresAuth/.test(bloque('Home')) && !/requiresAuth/.test(bloque('Login')), 'Inicio y login siguen abiertos')
marcar(/redirect: to\.fullPath/.test(router) && /motivoDeRuta\(to\.name\)/.test(router), 'Sin sesión, el router manda al login con el motivo y la pantalla pedida')
marcar(/path: '\/asistente',\s*redirect: '\/medicion'/.test(router), 'El atajo /asistente también pasa por Medición (queda protegido)')

// Login
const login = lee('../src/views/LoginView.vue')
marcar(/mensajeSesionRequerida\(route\.query\?\.motivo\)/.test(login), 'El login muestra el aviso según el motivo (medir o aulas)')
marcar(/data-testid="aviso-sesion-requerida"/.test(login), 'El aviso del login es visible')
marcar(/function destinoTrasLogin/.test(login) && /startsWith\('\/'\)/.test(login) && /!pedido\.startsWith\('\/\/'\)/.test(login), 'Tras entrar solo se vuelve a rutas internas (sin redirecciones externas)')
marcar(/router\.push\(destinoTrasLogin\(\)\)/.test(login), 'El login usa el destino pedido')

// Navegación
const app = lee('../src/App.vue')
marcar(/ENLACES_SOLO_CON_SESION\.includes\(e\.to\)/.test(app) && /isAuthenticated\.value\)/.test(app), 'Los enlaces de Medición, Dispositivos y Aulas se ocultan a quien no tiene sesión')
marcar(/watch\(isAuthenticated/.test(app) && /meta\?\.requiresAuth/.test(app), 'Si se cierra la sesión dentro de una pantalla protegida se vuelve al login')

// Comparación
const carga = lee('../src/components/CargaSenalesCard.vue')
marcar(/v-if="isAuthenticated"[\s\S]{0,240}@click="inyectarAMedicion"/.test(carga), 'El botón que inyecta señal a la medición en vivo solo se ve con sesión')

// Comparación de mediciones: sin sesión no hay mediciones «propias»
const comp = lee('../src/components/ComparadorMedicionesCard.vue')
marcar(/v-if="isAuthenticated"[\s\S]{0,200}cambiarOrigen\('propias'\)/.test(comp), 'Sin sesión no se ofrece «Mis Guardadas»')
marcar(/ref\(isAuthenticated\.value \? 'propias' : 'publicas'\)/.test(comp), 'Sin sesión se parte de la galería docente')
marcar(/listaPropias\.value = isAuthenticated\.value \? propias : \[\]/.test(comp), 'Sin sesión la lista de propias queda vacía (no se muestran ni las de ejemplo)')
marcar(/data-testid="nota-sin-sesion"/.test(comp) && /Sin sesión no hay mediciones propias/.test(comp), 'Se explica por qué no hay mediciones propias')
marcar(/watch\(isAuthenticated/.test(comp), 'Si cambia la sesión con la pantalla abierta se rehacen las listas')

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1) }
console.log('\nAcceso sin sesión: todas las pruebas pasaron')
