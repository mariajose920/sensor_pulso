// Tolerancia a huecos cortos de la telemetría WiFi (parpadeo «conectado / sin conexión»)
//   node scripts/test-tolerancia-conexion.mjs
import { readFileSync } from 'node:fs'
import { TOLERANCIA_SIN_DATOS_MS, esRespuestaVieja, decidirAnteRespuesta } from '../src/utils/toleranciaConexion.js'

let ok = 0, mal = 0
const prueba = (nombre, cond) => { if (cond) { ok++; console.log('  ✓', nombre) } else { mal++; console.log('  ✗', nombre) } }
const leer = (ruta) => readFileSync(new URL(ruta, import.meta.url), 'utf8')

const ahora = 1_000_000
const base = { conectadoAhora: true, ultimoOkMs: ahora - 3000, ahoraMs: ahora }

console.log('Decisión ante cada respuesta')
prueba('servidor «conectado» → se aplica lo que dice', decidirAnteRespuesta({ ...base, servidorConectado: true }) === 'aplicar')
prueba('servidor «no conectado» tras 3 s → se mantiene (hueco corto)', decidirAnteRespuesta({ ...base, servidorConectado: false }) === 'mantener')
prueba('consulta fallida tras 3 s → se mantiene', decidirAnteRespuesta({ ...base, servidorConectado: null }) === 'mantener')
prueba('hueco de 9 s (envío lento) → se mantiene', decidirAnteRespuesta({ ...base, ultimoOkMs: ahora - 9000, servidorConectado: false }) === 'mantener')
prueba('hueco de 14 s (el peor medido) → se pierde la conexión', decidirAnteRespuesta({ ...base, ultimoOkMs: ahora - 14000, servidorConectado: false }) === 'perder')
prueba('justo en el límite → se pierde', decidirAnteRespuesta({ ...base, ultimoOkMs: ahora - TOLERANCIA_SIN_DATOS_MS, servidorConectado: false }) === 'perder')
prueba('ya se mostraba desconectado → sigue desconectado', decidirAnteRespuesta({ ...base, conectadoAhora: false, servidorConectado: false }) === 'perder')
prueba('nunca hubo datos frescos → se pierde', decidirAnteRespuesta({ ...base, ultimoOkMs: null, servidorConectado: false }) === 'perder')
prueba('la tolerancia es de 10 s', TOLERANCIA_SIN_DATOS_MS === 10000)

console.log('Respuestas viejas de otra instancia del servidor')
prueba('una respuesta más vieja que la mostrada se descarta', esRespuestaVieja('2026-11-09T20:00:10.000Z', '2026-11-09T20:00:05.000Z'))
prueba('una respuesta igual o más nueva se acepta', !esRespuestaVieja('2026-11-09T20:00:10.000Z', '2026-11-09T20:00:10.000Z') && !esRespuestaVieja('2026-11-09T20:00:10.000Z', '2026-11-09T20:00:20.000Z'))
prueba('sin fecha previa o con fecha inválida se acepta', !esRespuestaVieja(null, '2026-11-09T20:00:05.000Z') && !esRespuestaVieja('2026-11-09T20:00:10.000Z', null) && !esRespuestaVieja('x', 'y'))
prueba('si la placa se reinicia (contador en 1) la fecha nueva sí se acepta', !esRespuestaVieja('2026-11-09T20:00:10.000Z', '2026-11-09T20:00:40.000Z'))

console.log('Servicio, servidor y firmware')
const servicio = leer('../src/services/esp32Service.js')
prueba('el servicio usa la tolerancia y descarta respuestas viejas', servicio.includes('decidirAnteRespuesta(') && servicio.includes('esRespuestaVieja('))
prueba('una consulta a la vez (sin respuestas apiladas)', servicio.includes('if (consultando) return null') && servicio.includes('consultando = false'))
prueba('una consulta fallida no vacía la pantalla de inmediato', /servidorConectado: null/.test(servicio))
const api = leer('../api/esp32/telemetria.js')
prueba('el servidor considera «conectado» hasta 15 s sin contacto', api.includes('VENTANA_CONECTADO_MS = 15000') && api.includes('< VENTANA_CONECTADO_MS') && !api.includes('< 5000)'))
const ino = leer('../firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino')
prueba('el firmware desactiva el ahorro de energía del WiFi', (ino.match(/WiFi\.setSleep\(false\)/g) || []).length >= 2)

console.log(`\n${ok} bien, ${mal} mal`)
process.exit(mal ? 1 : 0)
