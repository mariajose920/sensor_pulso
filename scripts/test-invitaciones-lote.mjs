// RF100 · Prueba del envío de invitaciones en una sola petición (lote), sin salir a internet:
// se simula `fetch` para el endpoint de Resend y para /api/invitaciones/enviar.
// Uso: node scripts/test-invitaciones-lote.mjs
import { readFileSync } from 'node:fs'

let fallos = 0
const marcar = (ok, texto) => {
  if (!ok) fallos++
  console.log(`${ok ? '  OK ' : ' MAL '} ${texto}`)
}

// --- Simulación de red
const llamadas = []
let comportamientoResend = null
let manejadorApi = null
const fetchOriginal = globalThis.fetch
globalThis.fetch = async (url, opciones = {}) => {
  const direccion = String(url)
  llamadas.push({ url: direccion, opciones })
  if (direccion === 'https://api.resend.com/emails/batch') return comportamientoResend(opciones)
  if (direccion === '/api/invitaciones/enviar') return manejadorApi(opciones)
  throw new Error(`Llamada de red inesperada: ${direccion}`)
}
const json = (estado, cuerpo) => ({ ok: estado >= 200 && estado < 300, status: estado, json: async () => cuerpo })

// --- Respuesta simulada del handler para el cliente
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

process.env.RESEND_API_KEY = 're_clave_de_prueba'
delete process.env.RESEND_FROM
const { default: handler } = await import('../api/invitaciones/enviar.js')
const base = { codigo: 'k8m3x9p2', aulaNombre: 'Fisiología <b>2026</b>', profesorNombre: 'Profe' }
const correos = ['uno@alu.unach.cl', 'dos@alu.unach.cl', 'tres@alu.unach.cl']

// 1. Varios correos = una sola llamada a Resend, con un mensaje por estudiante
comportamientoResend = () => json(200, { data: [{ id: 'id-1' }, { id: 'id-2' }, { id: 'id-3' }] })
let res = crearRespuesta()
llamadas.length = 0
await handler(crearPeticion({ ...base, correos }, '10.0.1.1'), res)
let salida = res.json()
marcar(res.statusCode === 200 && salida.ok && salida.enviados.length === 3 && salida.fallidos.length === 0, 'Tres correos salen en una respuesta correcta')
marcar(llamadas.length === 1 && llamadas[0].url === 'https://api.resend.com/emails/batch', 'Se hace UNA sola llamada al endpoint de lote de Resend')
const enviado = JSON.parse(llamadas[0].opciones.body)
marcar(Array.isArray(enviado) && enviado.length === 3 && enviado.every((m, i) => m.to.length === 1 && m.to[0] === correos[i]), 'Cada estudiante recibe su propio correo, sin ver a los demás')
marcar(enviado.every((m) => m.html.includes('K8M3X9P2') && m.subject.includes('K8M3X9P2')), 'Cada correo lleva el código del aula en mayúsculas')
marcar(!enviado[0].html.includes('<b>2026</b>') && enviado[0].html.includes('&lt;b&gt;'), 'El nombre del aula va escapado en el correo (sin HTML inyectado)')
marcar(llamadas[0].opciones.headers['x-batch-validation'] === 'permissive', 'Un correo rechazado no frena a los demás (modo permissive)')
marcar(llamadas[0].opciones.headers.Authorization === 'Bearer re_clave_de_prueba', 'Usa la clave RESEND_API_KEY del servidor')
marcar(enviado[0].from.includes('onboarding@resend.dev'), 'Sin RESEND_FROM usa el remitente de pruebas de Resend')

// 2. Remitente propio
process.env.RESEND_FROM = 'Sensor Pulso <invitaciones@midominio.cl>'
res = crearRespuesta(); llamadas.length = 0
await handler(crearPeticion({ ...base, correos: [correos[0]] }, '10.0.1.2'), res)
marcar(JSON.parse(llamadas[0].opciones.body)[0].from === 'Sensor Pulso <invitaciones@midominio.cl>', 'RESEND_FROM define el remitente (dominio verificado)')
delete process.env.RESEND_FROM

// 2b. Contenido del correo: curso, profesor, botón para unirse y enlace al sitio
comportamientoResend = () => json(200, { data: [{ id: 'x' }] })
res = crearRespuesta(); llamadas.length = 0
await handler(crearPeticion({ ...base, correos: [correos[0]] }, '10.0.2.1'), res)
const correoEnviado = JSON.parse(llamadas[0].opciones.body)[0]
marcar(/Unirme al aula<\/a>/.test(correoEnviado.html) && correoEnviado.html.includes('href="http://localhost:5173/aulas?unirse=K8M3X9P2"'), 'El correo trae el botón «Unirme al aula» con el enlace que lleva el código')
marcar(correoEnviado.html.includes('Ver la sala en el sitio web') && correoEnviado.html.includes('href="http://localhost:5173/aulas"'), 'El correo trae un enlace al sitio web para ver la sala')
marcar(correoEnviado.html.includes('Profe') && correoEnviado.html.includes('Fisiología'), 'El correo nombra al profesor y al curso')
marcar(correoEnviado.text.includes('unirse=K8M3X9P2') && correoEnviado.text.includes('Profe'), 'La versión en texto también lleva el enlace y el profesor')
// El enlace no se puede apuntar a un sitio ajeno desde la petición
res = crearRespuesta(); llamadas.length = 0
const peticionAjena = crearPeticion({ ...base, correos: [correos[0]] }, '10.0.2.2')
peticionAjena.headers.origin = 'https://sitio-malicioso.example'
peticionAjena.headers.host = 'sitio-malicioso.example'
await handler(peticionAjena, res)
const htmlAjeno = llamadas.length ? JSON.parse(llamadas[0].opciones.body)[0].html : ''
marcar(!htmlAjeno.includes('sitio-malicioso') , 'Un origen externo nunca se usa en los enlaces del correo')
if (htmlAjeno) marcar(htmlAjeno.includes('https://sensorpulso.vercel.app/aulas?unirse=K8M3X9P2'), 'Fuera de localhost los enlaces apuntan a la web publicada')
process.env.APP_URL = 'https://aula.midominio.cl/'
res = crearRespuesta(); llamadas.length = 0
await handler(crearPeticion({ ...base, correos: [correos[0]] }, '10.0.2.3'), res)
marcar(JSON.parse(llamadas[0].opciones.body)[0].html.includes('href="https://aula.midominio.cl/aulas?unirse=K8M3X9P2"'), 'APP_URL define la web de los enlaces')
delete process.env.APP_URL

// 3. Rechazo parcial
comportamientoResend = () => json(200, { data: [{ id: 'id-1' }, { id: 'id-3' }], errors: [{ index: 1, message: 'Dirección rechazada' }] })
res = crearRespuesta()
await handler(crearPeticion({ ...base, correos }, '10.0.1.3'), res)
salida = res.json()
marcar(salida.ok && salida.enviados.map((e) => e.correo).join() === 'uno@alu.unach.cl,tres@alu.unach.cl' && salida.fallidos[0].correo === 'dos@alu.unach.cl' && salida.fallidos[0].error === 'Dirección rechazada',
  'Con un rechazo parcial salen los otros dos y se informa cuál falló y por qué')
marcar(salida.enviados[1].id === 'id-3', 'Cada id del proveedor queda con su correo')

// 4. Error del proveedor: todos fallidos con el motivo
comportamientoResend = () => json(403, { message: 'Solo puedes enviar a tu propio correo mientras no verifiques un dominio' })
res = crearRespuesta()
await handler(crearPeticion({ ...base, correos }, '10.0.1.4'), res)
salida = res.json()
marcar(!salida.ok && salida.fallidos.length === 3 && /dominio/.test(salida.error), 'Si el proveedor rechaza el lote, los tres quedan fallidos con el motivo real')

// 5. Compatibilidad con el envío de un solo correo
comportamientoResend = () => json(200, { data: [{ id: 'solo-1' }] })
res = crearRespuesta()
await handler(crearPeticion({ ...base, correo: 'Uno@alu.unach.cl' }, '10.0.1.5'), res)
salida = res.json()
marcar(salida.ok && salida.id === 'solo-1' && salida.enviados[0].correo === 'uno@alu.unach.cl', 'Sigue aceptando un solo correo (campo `correo`)')

// 6. Validaciones
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
res = crearRespuesta()
llamadas.length = 0
await handler(crearPeticion({ ...base, correos: ['a@alu.unach.cl', 'A@ALU.UNACH.CL', 'a@alu.unach.cl'] }, '10.0.1.10'), res)
marcar(JSON.parse(llamadas[0].opciones.body).length === 1, 'Los correos repetidos se envían una sola vez')
const claveOriginal = process.env.RESEND_API_KEY
delete process.env.RESEND_API_KEY
res = crearRespuesta()
await handler(crearPeticion({ ...base, correos }, '10.0.1.11'), res)
marcar(res.statusCode === 503 && /RESEND_API_KEY/.test(res.json().error), 'Sin RESEND_API_KEY avisa claramente qué variable falta')
process.env.RESEND_API_KEY = claveOriginal

// 7. Cliente y servicio de aulas: una sola petición para toda la lista
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
manejadorApi = () => json(503, { ok: false, error: 'Servicio de correo Resend no configurado. Falta la variable RESEND_API_KEY en el entorno.' })
envio = await enviarCorreosInvitacion({ correos, codigo: 'abc', aulaNombre: 'Aula', profesorNombre: 'P' })
marcar(!envio.success && envio.fallidos.length === 3 && /RESEND_API_KEY/.test(envio.error), 'Si falta la clave, los tres figuran como fallidos con ese motivo')

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
marcar(progresos.length === 2 && progresos[1].hecho === 3, 'Informa el avance al terminar el lote')
resultado = await enviarInvitacionesVarias({ aulaId: aula.id, correos, profesorId: 'otro', esAdmin: false })
marcar(!resultado.success && /permiso/.test(resultado.error) && resultado.fallidos.length === 3, 'Sin ser el dueño del aula no se envía nada')
resultado = await enviarInvitacionesVarias({ aulaId: aula.id, correos: ['uno@alu.unach.cl', 'x@gmail.com'], profesorId: 'prof-lote', esAdmin: false })
marcar(!resultado.success && /x@gmail\.com/.test(resultado.error), 'Si algún correo no es de estudiante, no se envía y se indica cuál')

// 8. La pantalla ya no envía de a uno con pausas
const servicio = readFileSync(new URL('../src/services/aulasService.js', import.meta.url), 'utf8')
marcar(!/pausaMs|dormir\(/.test(servicio), 'El servicio ya no envía de a uno con pausas entre correos')

globalThis.fetch = fetchOriginal
console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodas las pruebas pasaron')
process.exit(fallos ? 1 : 0)
