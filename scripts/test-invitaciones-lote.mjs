// RF100 · Prueba del envío de invitaciones desde Gmail a uno o varios estudiantes en una sola petición.
// No sale a internet: el transporte SMTP se reemplaza por uno simulado y `fetch` por una respuesta falsa.
// Uso: node scripts/test-invitaciones-lote.mjs
import { readFileSync } from 'node:fs'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}

// --- Simulación de red (solo para el cliente → /api) y del transporte SMTP
const llamadas = []
let manejadorApi = null
const fetchOriginal = globalThis.fetch
globalThis.fetch = async (url, opciones = {}) => {
  llamadas.push({ url: String(url), opciones })
  if (String(url) === '/api/invitaciones/enviar') return manejadorApi(opciones)
  throw new Error(`Llamada de red inesperada: ${url}`)
}
const json = (estado, cuerpo) => ({ ok: estado >= 200 && estado < 300, status: estado, json: async () => cuerpo })

const enviadosSmtp = []
let comportamientoSmtp = async (mensaje) => ({ messageId: `<${mensaje.to}@gmail>` })
const transporteFalso = {
  sendMail: async (mensaje) => {
    enviadosSmtp.push(mensaje)
    return comportamientoSmtp(mensaje)
  }
}

const crearRespuesta = () => {
  const r = { statusCode: 0, cabeceras: {}, cuerpo: '' }
  r.setHeader = (k, v) => { r.cabeceras[k.toLowerCase()] = v }
  r.getHeader = (k) => r.cabeceras[k.toLowerCase()]
  r.end = (c) => { r.cuerpo = c || ''; return r }
  r.json = () => JSON.parse(r.cuerpo)
  return r
}
const crearPeticion = (cuerpo, ip = '10.0.0.1') => ({
  method: 'POST',
  headers: { host: 'localhost:5173', origin: 'http://localhost:5173', 'x-forwarded-for': ip, 'content-type': 'application/json' },
  socket: { remoteAddress: ip },
  body: JSON.stringify(cuerpo)
})

process.env.GMAIL_USER = 'sensorpulso@gmail.com'
process.env.GMAIL_APP_PASSWORD = 'abcd efgh ijkl mnop'
delete process.env.APP_URL
const { usarTransporte, leerConfiguracionCorreo, traducirErrorCorreo } = await import('../api/_lib/correo.js')
usarTransporte(transporteFalso)
const { default: handler } = await import('../api/invitaciones/enviar.js')
const base = { codigo: 'k8m3x9p2', aulaNombre: 'Fisiología <b>2026</b>', profesorNombre: 'Profe' }
const correos = ['uno@alu.unach.cl', 'dos@alu.unach.cl', 'tres@alu.unach.cl']

// --- Configuración
const cfg = leerConfiguracionCorreo()
marcar(cfg.configurado && cfg.usuario === 'sensorpulso@gmail.com' && cfg.clave === 'abcdefghijklmnop', 'Lee GMAIL_USER y GMAIL_APP_PASSWORD (quita los espacios de la contraseña de aplicación)')

// 1. Varios correos en una petición: un correo por estudiante, desde la cuenta de Gmail
let res = crearRespuesta()
enviadosSmtp.length = 0
await handler(crearPeticion({ ...base, correos }, '10.0.1.1'), res)
let salida = res.json()
marcar(res.statusCode === 200 && salida.ok && salida.enviados.length === 3 && salida.fallidos.length === 0 && salida.provider === 'gmail', 'Tres correos salen en una sola petición')
marcar(enviadosSmtp.length === 3 && enviadosSmtp.every((m, i) => m.to === correos[i]), 'Cada estudiante recibe su propio correo, sin ver a los demás')
marcar(enviadosSmtp.every((m) => m.from === '"Sensor Pulso UNACH" <sensorpulso@gmail.com>'), 'Todos salen desde sensorpulso@gmail.com')
marcar(enviadosSmtp.every((m) => m.html.includes('K8M3X9P2') && m.subject.includes('K8M3X9P2')), 'Cada correo lleva el código del aula en mayúsculas')
marcar(!enviadosSmtp[0].html.includes('<b>2026</b>') && enviadosSmtp[0].html.includes('&lt;b&gt;'), 'El nombre del aula va escapado en el correo (sin HTML inyectado)')
marcar(salida.enviados.every((e) => e.id), 'Cada correo enviado devuelve el id del mensaje')

// 2. Contenido del correo: curso, profesor, botón para unirse y enlace al sitio
const correo = enviadosSmtp[0]
marcar(/Unirme al aula<\/a>/.test(correo.html) && correo.html.includes('href="http://localhost:5173/aulas?unirse=K8M3X9P2"'), 'El correo trae el botón «Unirme al aula» con el enlace que lleva el código')
marcar(correo.html.includes('Ver la sala en el sitio web') && correo.html.includes('href="http://localhost:5173/aulas"'), 'El correo trae un enlace al sitio web para ver la sala')
marcar(correo.html.includes('Profe') && correo.html.includes('Fisiología'), 'El correo nombra al profesor y al curso')
marcar(correo.text.includes('unirse=K8M3X9P2') && correo.text.includes('Profe'), 'La versión en texto también lleva el enlace y el profesor')

// 3. Los enlaces nunca apuntan a un sitio ajeno
const peticionAjena = crearPeticion({ ...base, correos: [correos[0]] }, '10.0.2.2')
peticionAjena.headers.origin = 'https://sitio-malicioso.example'
res = crearRespuesta(); enviadosSmtp.length = 0
await handler(peticionAjena, res)
const htmlAjeno = enviadosSmtp[0]?.html || ''
marcar(!htmlAjeno.includes('sitio-malicioso'), 'Un origen externo nunca se usa en los enlaces del correo')
process.env.APP_URL = 'https://aula.midominio.cl/'
res = crearRespuesta(); enviadosSmtp.length = 0
await handler(crearPeticion({ ...base, correos: [correos[0]] }, '10.0.2.3'), res)
marcar(enviadosSmtp[0].html.includes('href="https://aula.midominio.cl/aulas?unirse=K8M3X9P2"'), 'APP_URL define la web de los enlaces')
delete process.env.APP_URL

// 4. Un correo rechazado no frena a los demás
comportamientoSmtp = async (m) => {
  if (m.to.startsWith('dos')) throw Object.assign(new Error('550 5.1.1 User unknown'), { response: '550 5.1.1 The email account that you tried to reach does not exist' })
  return { messageId: `<${m.to}>` }
}
res = crearRespuesta()
await handler(crearPeticion({ ...base, correos }, '10.0.1.3'), res)
salida = res.json()
marcar(salida.ok && salida.enviados.map((e) => e.correo).join() === 'uno@alu.unach.cl,tres@alu.unach.cl' && salida.fallidos.length === 1 && salida.fallidos[0].correo === 'dos@alu.unach.cl', 'Con un rechazo salen los otros dos y se informa cuál falló')
marcar(/no existe|rechazó/i.test(salida.fallidos[0].error), 'El motivo del rechazo se explica en español')

// 5. Contraseña de aplicación incorrecta: todos fallan con un mensaje claro
comportamientoSmtp = async () => { throw Object.assign(new Error('Invalid login'), { code: 'EAUTH', responseCode: 535, response: '535-5.7.8 Username and Password not accepted' }) }
res = crearRespuesta()
await handler(crearPeticion({ ...base, correos }, '10.0.1.4'), res)
salida = res.json()
marcar(!salida.ok && salida.fallidos.length === 3 && /contraseña de aplicación/.test(salida.error), 'Con credenciales malas los tres quedan fallidos y se explica qué revisar')
marcar(/límite diario/.test(traducirErrorCorreo({ response: '550 5.4.5 Daily user sending limit exceeded' })), 'Traduce el límite diario de Gmail')
marcar(/conectar con Gmail/.test(traducirErrorCorreo({ code: 'ETIMEDOUT' })), 'Traduce los errores de conexión')
comportamientoSmtp = async (m) => ({ messageId: `<${m.to}>` })

// 6. Un solo correo (compatibilidad)
res = crearRespuesta()
await handler(crearPeticion({ ...base, correo: 'Uno@alu.unach.cl' }, '10.0.1.5'), res)
salida = res.json()
marcar(salida.ok && salida.enviados[0].correo === 'uno@alu.unach.cl' && /exitosamente/.test(salida.mensaje), 'Sigue aceptando un solo correo (campo `correo`)')

// 7. Validaciones
res = crearRespuesta()
await handler(crearPeticion({ ...base, correos: ['uno@alu.unach.cl', 'profe@unach.cl'] }, '10.0.1.6'), res)
marcar(res.statusCode === 400 && res.json().invalidos?.[0] === 'profe@unach.cl', 'Un correo que no es de estudiante rechaza el envío y dice cuál')
res = crearRespuesta()
await handler(crearPeticion({ ...base, correos: [] }, '10.0.1.7'), res)
marcar(res.statusCode === 400, 'Una lista vacía se rechaza')
res = crearRespuesta()
await handler(crearPeticion({ ...base, correos: Array.from({ length: 31 }, (_, i) => `e${i}@alu.unach.cl`) }, '10.0.1.8'), res)
marcar(res.statusCode === 400 && /hasta 30/.test(res.json().error), 'Más de 30 correos se rechaza')
res = crearRespuesta()
await handler(crearPeticion({ correos }, '10.0.1.9'), res)
marcar(res.statusCode === 400 && /código/i.test(res.json().error), 'Sin código del aula se rechaza')
res = crearRespuesta(); enviadosSmtp.length = 0
await handler(crearPeticion({ ...base, correos: ['a@alu.unach.cl', 'A@ALU.UNACH.CL', 'a@alu.unach.cl'] }, '10.0.1.10'), res)
marcar(enviadosSmtp.length === 1, 'Los correos repetidos se envían una sola vez')
const usuarioOriginal = process.env.GMAIL_USER
delete process.env.GMAIL_USER
res = crearRespuesta()
await handler(crearPeticion({ ...base, correos }, '10.0.1.11'), res)
marcar(res.statusCode === 503 && /GMAIL_USER/.test(res.json().error) && /GMAIL_APP_PASSWORD/.test(res.json().error), 'Sin las variables avisa claramente cuáles faltan')
process.env.GMAIL_USER = usuarioOriginal

// 8. Cliente y servicio de aulas: una sola petición para toda la lista
const { enviarCorreosInvitacion } = await import('../src/services/emailService.js')
const { enviarInvitacionesVarias, crearAula } = await import('../src/services/aulasService.js')
manejadorApi = (opciones) => {
  const pedido = JSON.parse(opciones.body)
  return json(200, { ok: true, enviados: pedido.correos.map((c, i) => ({ correo: c, id: `m${i}` })), fallidos: [] })
}
llamadas.length = 0
let envio = await enviarCorreosInvitacion({ correos, codigo: 'abc', aulaNombre: 'Aula', profesorNombre: 'P' })
marcar(envio.success && envio.enviados.length === 3 && llamadas.length === 1, 'El cliente manda toda la lista en una sola petición al servidor')
marcar(JSON.parse(llamadas[0].opciones.body).correos.length === 3 && JSON.parse(llamadas[0].opciones.body).codigo === 'ABC', 'La petición lleva todos los correos y el código')
manejadorApi = () => json(503, { ok: false, error: 'Servicio de correo no configurado. Faltan las variables GMAIL_USER y GMAIL_APP_PASSWORD en el entorno.' })
envio = await enviarCorreosInvitacion({ correos, codigo: 'abc', aulaNombre: 'Aula', profesorNombre: 'P' })
marcar(!envio.success && envio.fallidos.length === 3 && /GMAIL_APP_PASSWORD/.test(envio.error), 'Si falta la configuración, los tres figuran como fallidos con ese motivo')

const aula = (await crearAula({ nombre: 'Aula lote', descripcion: '', profesorId: 'prof-lote', profesorNombre: 'Profe', tienePermiso: true })).data
manejadorApi = (opciones) => {
  const pedido = JSON.parse(opciones.body)
  const falla = pedido.correos.find((c) => c.startsWith('dos'))
  return json(200, {
    ok: true,
    enviados: pedido.correos.filter((c) => c !== falla).map((c, i) => ({ correo: c, id: `m${i}` })),
    fallidos: falla ? [{ correo: falla, error: 'Dirección rechazada' }] : []
  })
}
llamadas.length = 0
const progresos = []
let resultado = await enviarInvitacionesVarias({
  aulaId: aula.id, correos, profesorId: 'prof-lote', profesorNombre: 'Profe', esAdmin: false, alProgresar: (p) => progresos.push(p)
})
marcar(resultado.success && resultado.enviados.length === 2 && resultado.fallidos.length === 1 && resultado.fallidos[0].correo === 'dos@alu.unach.cl', 'El servicio de aulas reparte enviados y fallidos de un solo envío')
marcar(llamadas.filter((l) => l.url === '/api/invitaciones/enviar').length === 1, 'Toda la lista viaja en una sola petición, no una por estudiante')
marcar(progresos.length === 2 && progresos[1].hecho === 3, 'Informa el avance al terminar')
resultado = await enviarInvitacionesVarias({ aulaId: aula.id, correos, profesorId: 'otro', esAdmin: false })
marcar(!resultado.success && /permiso/.test(resultado.error) && resultado.fallidos.length === 3, 'Sin ser el dueño del aula no se envía nada')
resultado = await enviarInvitacionesVarias({ aulaId: aula.id, correos: ['uno@alu.unach.cl', 'x@gmail.com'], profesorId: 'prof-lote', esAdmin: false })
marcar(!resultado.success && /x@gmail\.com/.test(resultado.error), 'Si algún correo no es de estudiante, no se envía y se indica cuál')

// 9. Ya no queda nada de Resend en el código que envía
const archivos = ['../api/invitaciones/enviar.js', '../api/_lib/correo.js', '../src/services/emailService.js', '../src/services/aulasService.js', '../src/views/AulasView.vue']
marcar(archivos.every((a) => !/resend/i.test(readFileSync(new URL(a, import.meta.url), 'utf8'))), 'El código de envío ya no menciona Resend')
marcar(!/pausaMs|dormir\(/.test(readFileSync(new URL('../src/services/aulasService.js', import.meta.url), 'utf8')), 'El servicio no envía de a uno con pausas')

globalThis.fetch = fetchOriginal
console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(fallos ? 1 : 0)
