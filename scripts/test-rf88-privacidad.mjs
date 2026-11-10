// RF88: política de privacidad visible, en español, con responsable y canal de contacto.
// Uso: node scripts/test-rf88-privacidad.mjs
import { readFileSync } from 'node:fs'

let fallos = 0
const marcar = (ok, texto) => { if (!ok) fallos++; console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`) }
const lee = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

const P = await import('../src/data/politicaPrivacidad.js')
const texto = P.textoPlano()

marcar(/UNACH|Universidad Adventista/.test(P.RESPONSABLE) && texto.includes(P.RESPONSABLE), 'Indica el responsable del tratamiento (UNACH)')
marcar(/^\d+\.\d+$/.test(P.POLITICA_VERSION) && /^\d{4}-\d{2}-\d{2}$/.test(P.POLITICA_VIGENTE_DESDE), 'Tiene versión y fecha de vigencia')
const ids = P.SECCIONES.map(s => s.id)
for (const id of ['responsable', 'datos', 'finalidad', 'base', 'plazos', 'destinatarios', 'derechos', 'seguridad', 'brechas', 'no-medico']) {
  marcar(ids.includes(id), `Tiene la sección «${id}»`)
}
marcar(new Set(ids).size === ids.length, 'Las secciones no se repiten')
marcar(/acceso/.test(texto) && /rectificaci/.test(texto) && /supresi/.test(texto) && /oposici/.test(texto) && /portabilidad/.test(texto), 'Nombra los cinco derechos del titular (RF89)')
marcar(/revocar/i.test(texto), 'Explica que se puede revocar el consentimiento (RF90)')
marcar(/us-east-1/.test(texto) && /fuera de Chile/.test(texto), 'Informa el alojamiento fuera de Chile (RF95)')
marcar(/no es un dispositivo m[eé]dico|no constituyen un diagn[oó]stico/i.test(texto), 'Recuerda que no es dispositivo médico (RF94)')
marcar(/confirmaci[oó]n adicional y expl[ií]cita/.test(texto), 'Dice que nada se publica sin confirmación explícita (RF91)')
marcar(/brecha/i.test(texto), 'Informa qué pasa ante una brecha (RF92)')
marcar(!/pendiente de|lorem|TODO/.test(texto), 'No quedan textos pendientes')

// Canal de contacto: solo se acepta un correo institucional y no se inventa uno
marcar(P.canalContacto('privacidad@unach.cl').tipo === 'correo', 'Con un correo @unach.cl configurado, lo muestra como canal')
marcar(P.canalContacto('alguien@gmail.com').tipo === 'equipo', 'Un correo no institucional no se acepta como canal')
marcar(P.canalContacto('').tipo === 'equipo' && P.canalContacto('').texto.length > 20, 'Sin correo configurado igual indica un canal (el equipo del proyecto)')
marcar(!/[\w.-]+@[\w.-]+\.[a-z]{2,}/i.test(texto), 'La política no trae ninguna dirección de correo inventada')

// Coherencia con la retención real de la base de datos y con el consentimiento
const datosIniciales = lee('../supabase/migrations/20261027000800_datos_iniciales.sql')
const bloqueRetencion = datosIniciales.slice(datosIniciales.indexOf('insert into public.politicas_retencion'))
const dias = (tabla) => { const k = bloqueRetencion.indexOf("('" + tabla + "',"); return k < 0 ? NaN : parseInt(bloqueRetencion.slice(k + tabla.length + 4), 10) }
marcar(dias('lecturas') === 365 && /12 meses/.test(texto), 'Mediciones: 365 días en la base = 12 meses en la política')
marcar(dias('declaraciones_paciente') === 365, 'Ficha declarada: 365 días en la base = 12 meses en la política')
marcar(dias('intentos_login') === 90 && /90 d[ií]as/.test(texto), 'Intentos de inicio de sesión: 90 días en la base y en la política')
marcar(dias('limites_peticiones') === 2 && /2 d[ií]as/.test(texto), 'Contadores de peticiones: 2 días en la base y en la política')
const consent = lee('../src/services/consentimientoService.js')
marcar(/Hasta 12 meses/.test(consent), 'El consentimiento informado dice los mismos 12 meses')
marcar(consent.includes(P.RESPONSABLE), 'El responsable es el mismo que el del consentimiento informado')

// Pantalla, ruta y enlaces
const router = lee('../src/router/index.js')
const i = router.indexOf("name: 'Privacidad'")
const bloque = i < 0 ? '' : router.slice(router.lastIndexOf('{', i), router.indexOf('},', i) + 2)
marcar(/path: '\/privacidad'/.test(bloque) && !/requiresAuth/.test(bloque), 'La ruta /privacidad es pública (no exige sesión)')
const vista = lee('../src/views/PrivacidadView.vue')
marcar(/data-testid="politica-contacto"/.test(vista) && /VITE_CONTACTO_PRIVACIDAD/.test(vista), 'La pantalla muestra el canal de contacto configurable')
marcar(!/supabase|localStorage|fetch\(/i.test(vista), 'La pantalla es pública y no consulta la red ni guarda datos')
marcar(/to="\/privacidad"/.test(lee('../src/App.vue')), 'El pie de página enlaza a la política')
marcar(/to="\/privacidad"/.test(lee('../src/views/LoginView.vue')), 'El registro y el inicio de sesión enlazan a la política')
marcar(/VITE_CONTACTO_PRIVACIDAD/.test(lee('../.env.example')), '.env.example documenta la variable de contacto')
const mig = lee('../supabase/migrations/20261108000100_politica_privacidad.sql')
marcar(/politica_privacidad/.test(mig) && new RegExp(`version = '${P.POLITICA_VERSION.replace('.', '\.')}'`).test(mig), 'La migración deja la política en la base con la misma versión')

// Política aceptada al registrarse (evidencia por versión)
const login = lee('../src/views/LoginView.vue')
marcar(/data-testid="acepta-politica"/.test(login) && /!aceptaPolitica/.test(login), 'El registro exige marcar la casilla de la política')
marcar(/register\(email\.value, password\.value, nombre\.value, POLITICA_VERSION\)/.test(login), 'El registro envía la versión vigente de la política')
marcar(/politica_version: politicaVersion/.test(lee('../src/composables/useAuth.js')), 'La versión viaja con el alta de la cuenta')
const migPol = lee('../supabase/migrations/20261108000300_politica_aceptada.sql')
marcar(/politica_aceptada_en/.test(migPol) && /now\(\)/.test(migPol) && /is distinct from v_vigente/.test(migPol), 'La base pone la fecha y solo acepta la versión vigente')
marcar(/La política aceptada no se puede modificar/.test(migPol), 'La persona no puede alterar la evidencia de su aceptación')
marcar(/politica_version/.test(lee('../api/derechos/exportar.js')), 'La descarga de datos incluye la política que aceptó')

// Ficha de salud en el dispositivo: solo en la pestaña y borrada al salir
const paciente = lee('../src/services/pacienteService.js')
marcar(!/localStorage\.(setItem|getItem)/.test(paciente), 'La ficha de salud ya no se guarda en localStorage')
marcar(/sessionStorage\.setItem/.test(paciente) && /localStorage\.removeItem\(LOCAL_STORAGE_KEY\)/.test(paciente), 'La ficha vive en sessionStorage y se borra la copia antigua')
marcar(/pacienteService\.limpiarDeclaracionLocal\(\)/.test(lee('../src/pwa/limpiarAlSalir.js')), 'Al cerrar sesión se borra la ficha local')

if (fallos) { console.error(`\n${fallos} prueba(s) fallaron`); process.exit(1) }
console.log('\nRF88: todas las pruebas pasaron')
