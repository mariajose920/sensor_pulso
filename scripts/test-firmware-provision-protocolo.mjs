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

// SpO2: sin valores inventados
prueba('SpO2 arranca en 0 (sin lectura), no en 98', /volatile float spo2Actual = 0\.0/.test(src))
prueba('SpO2 usa la razón de razones con componente pulsátil (AC) y continua (DC)', src.includes('sumaAcRojo2') && src.includes('indiceRojo / indiceIr'))
prueba('SpO2 ya no usa la razón de valores brutos rojo/infrarrojo', !/float r = \(\(float\)rojo \/ \(float\)ir\)/.test(src))
prueba('sin dedo o en calentamiento se borra la lectura de SpO2', (src.match(/reiniciarSpo2\(\);/g) || []).length >= 2)
prueba('una señal inservible da «sin lectura» (0) y no un número', /ventanasSpo2Invalidas >= 3/.test(src) && /spo2Actual = 0;\s+\/\/ señal inservible/.test(src))

// Pulso: filtro pasa-banda y detección de cresta (sin valores inventados)
prueba('filtro pasa-banda 0,5-5 Hz con dos biquads Butterworth (pasa-altas y pasa-bajas)',
  /struct Biquad/.test(src) && /Biquad bqAlta/.test(src) && /Biquad bqBaja/.test(src) && src.includes('0.978030479f') && src.includes('0.0200833656f') && /biquadPaso\(bqBaja, biquadPaso\(bqAlta/.test(src))
prueba('ya no usa la media móvil exponencial ni el filtro de un polo para el pulso', !/filtrado \+= 0\.3f/.test(src) && !/float maximo/.test(src))
prueba('el dc lento sigue existiendo solo para la SpO2 (no se tocó su cálculo)', /dc \+= 0\.02f \* \(ir - dc\)/.test(src) && /float indiceIr = \(dc > 1\)/.test(src))
prueba('detección por CRESTA: se confirma al bajar al 72 % del máximo, con instante afinado', /CAIDA_PICO\s*=\s*0\.72f/.test(src) && /f < CAIDA_PICO \* picoVal/.test(src) && /picoPrev - 2\.0f \* picoVal \+ picoNext/.test(src))
prueba('umbral adaptativo con la amplitud de los últimos latidos (ampMedia)', /0\.4f \* ampMedia/.test(src) && /ampMedia = \(ampMedia > 0\)/.test(src))
prueba('refractario adaptativo 0,58 × intervalo mediano, acotado a 280-600 ms', /constrain\(0\.58f \* m, 280\.0f, 600\.0f\)/.test(src))
prueba('intervalos fuera de ±30 % de la mediana se descartan salvo que se repitan 3 veces', /TOLERANCIA_RR\s*=\s*0\.30f/.test(src) && /nAnom >= 3/.test(src) && /cambioRitmo = true/.test(src))
prueba('sin 800 ms inventados: no hay historial de intervalos precargado', !/rrHist/.test(src) && !/\{\s*800,\s*800/.test(src) && /float rr\[RR_MAX\];/.test(src) && /int rrN = 0/.test(src))
prueba('el pulso empieza a mostrarse con 4 intervalos válidos', /rrN < 4/.test(src) && /bpmMostrando/.test(src))
prueba('BPM = 60000 / mediana de hasta 8 intervalos, rango 40-180 y variación limitada', /RR_MAX\s*=\s*8/.test(src) && /60000\.0f \/ m/.test(src) && /bruto < 40\.0f \|\| bruto > 180\.0f/.test(src) && /constrain\(0\.5f \* \(bruto - bpmActual\), -4\.0f, 4\.0f\)/.test(src))
prueba('más de 3 s sin latido válido: pulso = 0 (no se conserva el valor viejo)', /SIN_LATIDO_MS\s*=\s*3000/.test(src) && /> SIN_LATIDO_MS/.test(src) && /void limpiarLatidos\(\)[\s\S]*?bpmActual = 0;/.test(src))
prueba('señal mala (intervalos dispersos o forma que no se repite) no da número', /MAD_MAX/.test(src) && /AUTOCORR_MIN/.test(src) && /float autocorrelacion\(/.test(src))
prueba('sin dedo y calentamiento: pulso en 0 y se conserva la lógica de calentamiento', /if \(sinDedo\) \{\s+bpmActual = 0;/.test(src) && /CALENTAMIENTO_MS = 2000/.test(src) && /UMBRAL_DEDO = 7000/.test(src))

// Señal enviada: 50 Hz promediando, máximo 100 muestras por paquete, búfer protegido
prueba('frecuencia enviada 50 Hz, búfer de 4 s (200), relleno de 1 s (50)', /FRECUENCIA_MUESTREO_HZ = 50;/.test(src) && /SAMPLES_PER_BLOCK = 200;/.test(src) && /MUESTRAS_RELLENO = 50;/.test(src))
prueba('se promedian pares de lecturas de 100 Hz (no se tiran muestras)', /divisorMuestras >= 2/.test(src) && /sumaSalida \* 0\.5f/.test(src) && !/divisorMuestras >= 4/.test(src))
prueba('la onda va hacia arriba en el latido (IR invertido) y centrada en 24500', /refIr - ir/.test(src) && /24500 \+ offsetAC/.test(src) && /21000 \+ \(int\)\(offsetAC \* 0\.75f\)/.test(src))
prueba('ganancia lenta y estable: baja con factor 0,999 y sube suave (0,02)', /amplitud \*= 0\.999f/.test(src) && /amplitud \+= 0\.02f/.test(src) && /GANANCIA_ONDA/.test(src))
prueba('como máximo 100 muestras por paquete; el resto se conserva en orden para el siguiente', /MAX_MUESTRAS_PAQUETE = 100;/.test(src) && /uint16_t irEnvio\[MAX_MUESTRAS_PAQUETE\]/.test(src) && /memmove\(bufferIR, bufferIR \+ cantMuestras/.test(src) && /indiceBuffer = resto;/.test(src))
prueba('el búfer se escribe y se consume dentro de una sección crítica', /portMUX_TYPE bufMux/.test(src) && (src.match(/portENTER_CRITICAL\(&bufMux\)/g) || []).length >= 2 && (src.match(/portEXIT_CRITICAL\(&bufMux\)/g) || []).length >= 2)
prueba('la API acepta hasta 250 muestras por canal', readFileSync(join(aqui, '..', 'api', 'esp32', 'telemetria.js'), 'utf8').includes('ch.ir.slice(0, 250)'))

if (fallos) {
  console.log(`\n${fallos} prueba(s) fallaron`)
  process.exit(1)
}
console.log('\nTodas las pruebas estáticas pasaron')
