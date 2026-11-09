// Prueba ESTÁTICA del firmware: verifica que el protocolo "@SP" de configuración
// WiFi por USB esté presente en el .ino (no compila ni ejecuta el firmware).
// Uso: node scripts/test-firmware-provision-protocolo.mjs
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const aqui = dirname(fileURLToPath(import.meta.url))
const ruta = join(aqui, '..', 'firmware', 'esp32_wifi_prueba', 'esp32_wifi_prueba.ino')
const src = readFileSync(ruta, 'utf8')

let fallos = 0
function prueba(nombre, cond) {
  if (cond) console.log(`✓ ${nombre}`)
  else { console.log(`✗ ${nombre}`); fallos++ }
}

// Prefijo y lectura de líneas
prueba('prefijo "@SP " en emisión', src.includes('"@SP "'))
prueba('entrada ignora líneas sin prefijo (strncmp "@SP ")', /strncmp\(linea,\s*"@SP ",\s*4\)/.test(src))
prueba('lector tolera \\r\\n', src.includes("'\\r'") && src.includes("'\\n'"))
prueba('buffer acotado de 512', /#define\s+LINEA_MAX\s+512/.test(src))

// Comandos app -> ESP32
for (const c of ['hello', 'scan', 'wifi', 'status', 'forget', 'server']) {
  prueba(`comando "${c}"`, src.includes(`c.cmd == "${c}"`))
}

// Eventos ESP32 -> app
for (const e of ['hello', 'scan', 'wifi', 'server', 'forget', 'error']) {
  prueba(`evento "${e}"`, src.includes(`\\"ev\\":\\"${e}\\"`) || src.includes(`"{\\"ev\\":\\"${e}\\"`) || src.includes(`ev\\":\\"${e}`) || (e === 'hello' && /emitirHello\("hello"\)/.test(src)))
}
for (const m of ['clave_incorrecta', 'no_encontrada', 'tiempo', 'datos_invalidos', 'comando_invalido']) {
  prueba(`motivo "${m}"`, src.includes(m))
}
for (const s of ['sin_credenciales', 'conectando', 'conectado', 'desconectado']) {
  prueba(`estado wifi "${s}"`, src.includes(`"${s}"`))
}
for (const s of ['abierta', 'wpa2', 'wpa3', 'empresa', 'otra']) {
  prueba(`seguridad "${s}"`, src.includes(`"${s}"`))
}

// Persistencia
prueba('Preferences con espacio "sensorpulso"', /prefs\.begin\("sensorpulso"/.test(src))
prueba('se guarda ssid y pass en NVS', /putString\("ssid"/.test(src) && /putString\("pass"/.test(src))
prueba('forget borra credenciales de NVS', /prefs\.remove\("ssid"\)/.test(src) && /prefs\.remove\("pass"\)/.test(src))

// Valores por defecto
prueba('sin "TU_PASSWORD"', !src.includes('TU_PASSWORD'))
prueba('sin "amenaza"', !src.includes('amenaza'))
prueba('WIFI_SSID vacío por defecto', /WIFI_SSID\s*=\s*""/.test(src))
prueba('WIFI_PASSWORD vacío por defecto', /WIFI_PASSWORD\s*=\s*""/.test(src))
prueba('SERVER_URL por defecto es producción',
  src.includes('SERVER_URL    = "https://sensorpulso.vercel.app/api/esp32/telemetria"'))
prueba('DEVICE_TOKEN por defecto', src.includes('"esp_demotoken_unach_2026_rf05"'))

// La clave y el token nunca se imprimen por serie
const lineasSerial = src.split('\n').filter(l => /Serial\.print/.test(l))
const imprimeSecreto = lineasSerial.filter(l => /pass|password|token|cfgPass|reqPass/i.test(l))
prueba('ningún Serial.print* menciona clave/token', imprimeSecreto.length === 0)
if (imprimeSecreto.length) imprimeSecreto.forEach(l => console.log('   ->', l.trim()))
const emitConSecreto = src.split('\n').filter(l => /emitir\(/.test(l) && /cfgPass|reqPass|pass\b|cfgToken/.test(l))
prueba('ninguna respuesta @SP incluye clave o token', emitConSecreto.length === 0)

// Validación de longitudes y envío HTTP con token
prueba('valida ssid 1-32 y pass 0-63', /ssid\.length\(\)\s*>\s*32/.test(src) && /pass\.length\(\)\s*>\s*63/.test(src))
prueba('cabecera X-ESP32-Token con token de NVS', /addHeader\("X-ESP32-Token",\s*token\)/.test(src))
prueba('hello al arrancar tras Serial.begin',
  src.indexOf('Serial.begin(115200)') < src.indexOf('emitirHello("hello");', src.indexOf('void setup')))

if (fallos) {
  console.log(`\n${fallos} prueba(s) fallaron`)
  process.exit(1)
}
console.log('\nTodas las pruebas estáticas pasaron')
