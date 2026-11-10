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
prueba('SpO2 ya no usa la razón de valores brutos rojo/infrarrojo', !/float r = \(\(float\)rojo \/ \(float\)ir\)/.test(src))
prueba('SpO2 por banda: el rojo tiene sus propios biquads con la misma estructura que el IR', /Biquad bqAltaR/.test(src) && /Biquad bqBajaR/.test(src) && /biquadPaso\(bqBajaR, biquadPaso\(bqAltaR, refRojo - rojo\)\)/.test(src))
prueba('SpO2 en ventanas de 6 s (3 bloques de 2 s) que se recalculan cada 2 s', /SPO2_BLOQUE_N = 200/.test(src) && /SPO2_BLOQUES = 3/.test(src) && /if \(nBloques >= SPO2_BLOQUES\) evaluarSpo2\(\)/.test(src))
prueba('ruido estimado con la 2.ª diferencia de la lectura cruda y restado en cuadratura (piso en 0)', /SPO2_RUIDO_K = 0\.25f/.test(src) && /ir - 2\.0f \* irPrev1 \+ irPrev2/.test(src) && /fmaxf\(0\.0f, rmsIr \* rmsIr - bIr \* bIr\)/.test(src))
prueba('R = (AC_rojo/DC_rojo)/(AC_ir/DC_ir) y SpO2 = 110 - 25·R acotada a 70-100', /float r = \(acRo \/ dcRo\) \/ \(acIr \/ dcIr\)/.test(src) && /constrain\(110\.0f - 25\.0f \* r, 70\.0f, 100\.0f\)/.test(src))
prueba('compuerta: SNR ≥ 3 en ambos canales, perfusión IR ≥ 0,02 % y AC consistente entre bloques', /SPO2_SNR_MIN = 3\.0f/.test(src) && /SPO2_PERFUSION_MIN = 0\.02f/.test(src) && /snrIr < SPO2_SNR_MIN \|\| snrRo < SPO2_SNR_MIN \|\| perfusionIr < SPO2_PERFUSION_MIN/.test(src) && /SPO2_CONSISTENCIA_MAX/.test(src))
prueba('mediana de las últimas 5 aceptadas, ±2 puntos por actualización y mínimo 3 para mostrar', /SPO2_HIST = 5/.test(src) && /SPO2_PASO_MAX = 2\.0f/.test(src) && /SPO2_MIN_ACEPTADAS = 3/.test(src) && /medianaArr\(histSpo2, nHist\)/.test(src))
prueba('12 s sin ventana aceptada: SpO2 = 0 (nunca un número viejo)', /SPO2_CADUCA_N = 1200/.test(src) && /\+\+sinAceptadaN > SPO2_CADUCA_N/.test(src))
prueba('sin dedo o en calentamiento se borra la lectura de SpO2', (src.match(/reiniciarSpo2\(\);/g) || []).length >= 2)
prueba('la SpO2 se documenta como aproximación sin calibrar (recta genérica)', /SIN CALIBRAR/.test(src) && /recta genérica/.test(src))

// Calentamiento real: dedo estable (3-8 s, DC del IR quieto)
prueba('dedo estable: mínimo 3 s y máximo 8 s desde que se apoya', /DEDO_MIN_N = 300/.test(src) && /DEDO_MAX_N = 800/.test(src) && /t >= DEDO_MAX_N \|\| \(t >= DEDO_MIN_N && estCont >= DC_SOSTENIDO_N\)/.test(src))
prueba('dedo estable: variación del DC del IR en 1 s menor que 0,15 % de forma sostenida', /DC_VAR_ESTABLE = 0\.0015f/.test(src) && /emaAnillo\[nMuestra % 100\]/.test(src) && /variacion < DC_VAR_ESTABLE/.test(src))
prueba('hasta que el dedo está estable no hay latidos ni SpO2 (pulso 0 y SpO2 0)', /if \(!dedoEstable\) \{\s+\/\/ Calentamiento/.test(src) && /dedoEstable = false;\s+ledRestaurar\(\)/.test(src))

// Equilibrio automático del LED (RF114)
prueba('tabla de corrientes del MAX30100 (4,4 / 7,6 / 11,0 / 14,2 ... 50,0 mA)', /LED_MA\[16\] = \{ 0\.0f, 4\.4f, 7\.6f, 11\.0f, 14\.2f, 17\.4f, 20\.8f, 24\.0f, 27\.1f, 30\.6f, 33\.8f, 37\.0f, 40\.2f, 43\.6f, 46\.8f, 50\.0f \}/.test(src))
prueba('al iniciar el sensor: rojo 27,1 mA e IR 27,1 mA (0x88), y sin dedo vuelve a ese valor', /LED_INICIAL = 0x88/.test(src) && /escribirReg\(REG_LED, LED_INICIAL\)/.test(src) && /void ledRestaurar\(\)/.test(src))
prueba('REG_LED ya no es un 0x28 fijo: se escribe con ambos nibbles', !/escribirReg\(REG_LED, 0x28\)/.test(src) && /ledReg = \(uint8_t\)\(\(nuevoRojo << 4\) \| nuevoIr\)/.test(src) && /escribirReg\(REG_LED, ledReg\)/.test(src))
prueba('rojo entre 60 % y 100 % del IR y ≤ 56 000; > 58 000 baja de inmediato', /ROJO_REL_MIN = 0\.60f/.test(src) && /DC_ROJO_MAX = 56000/.test(src) && /DC_ROJO_SAT = 58000/.test(src) && /dcRojoLento > DC_ROJO_SAT/.test(src) && /dcRojoLento < ROJO_REL_MIN \* dc/.test(src))
prueba('IR: > 60 000 baja un paso (mínimo 14,2 mA) y < 18 000 sube un paso (máximo 40,2 mA)', /DC_IR_ALTO = 60000/.test(src) && /DC_IR_BAJO = 18000/.test(src) && /LED_IR_MIN = 0x4/.test(src) && /LED_IR_MAX = 0xC/.test(src))
prueba('se evalúa cada 500 ms, con el dedo estable, un solo paso por vez', /LED_AJUSTE_N = 50/.test(src) && /nMuestra % LED_AJUSTE_N != 0/.test(src) && /ajustarLed\(\);/.test(src))
prueba('tras cada cambio: SpO2 en pausa ~1,5 s y ventana reiniciada; filtros reprimados; latidos enmascarados 1 s si cambia el IR', /LED_PAUSA_SPO2_N = 150/.test(src) && /reiniciarVentanaSpo2\(\);\s+\}/.test(src) && /LED_REPRIMAR_N = 20/.test(src) && /LED_MASCARA_N = 100/.test(src) && /if \(ledMascara > 0\)/.test(src))
prueba('la detección de dedo sigue sobre el IR con UMBRAL_DEDO = 7000', /UMBRAL_DEDO = 7000/.test(src) && /bool sinDedo = ir < UMBRAL_DEDO/.test(src))

// Diagnóstico crudo: 6 campos (el último es REG_LED)
prueba('línea RAW con 6 campos: RAW,n,ms,ir,rojo,led', /"RAW,%lu,%lu,%u,%u,%u\\n"/.test(src) && /\(unsigned\)ledReg/.test(src))
prueba('el evento raw/on informa ledInicial y ya no ledIrMa/ledRojoMa', src.includes('ledInicial') && !src.includes('ledIrMa') && !src.includes('ledRojoMa'))

// Pulso: filtro pasa-banda y detección de cresta (sin valores inventados)
prueba('filtro pasa-banda 0,5-5 Hz con dos biquads Butterworth (pasa-altas y pasa-bajas)',
  /struct Biquad/.test(src) && /Biquad bqAlta/.test(src) && /Biquad bqBaja/.test(src) && src.includes('0.978030479f') && src.includes('0.0200833656f') && /biquadPaso\(bqBaja, biquadPaso\(bqAlta/.test(src))
prueba('ya no usa la media móvil exponencial ni el filtro de un polo para el pulso', !/filtrado \+= 0\.3f/.test(src) && !/float maximo/.test(src))
prueba('el dc lento del IR sigue existiendo (ahora también lo usa el equilibrio del LED)', /dc \+= 0\.02f \* \(ir - dc\)/.test(src))
prueba('detección por CRESTA: se confirma al bajar al 72 % del máximo, con instante afinado', /CAIDA_PICO\s*=\s*0\.72f/.test(src) && /f < CAIDA_PICO \* picoVal/.test(src) && /picoPrev - 2\.0f \* picoVal \+ picoNext/.test(src))
prueba('umbral adaptativo con la amplitud de los últimos latidos (ampMedia)', /0\.4f \* ampMedia/.test(src) && /ampMedia = \(ampMedia > 0\)/.test(src))
prueba('refractario adaptativo 0,58 × intervalo mediano, acotado a 280-600 ms', /constrain\(0\.58f \* m, 280\.0f, 600\.0f\)/.test(src))
prueba('intervalos fuera de ±30 % de la mediana se descartan salvo que se repitan 3 veces', /TOLERANCIA_RR\s*=\s*0\.30f/.test(src) && /nAnom >= 3/.test(src) && /cambioRitmo = true/.test(src))
prueba('sin 800 ms inventados: no hay historial de intervalos precargado', !/rrHist/.test(src) && !/\{\s*800,\s*800/.test(src) && /float rr\[RR_MAX\];/.test(src) && /int rrN = 0/.test(src))
prueba('el pulso empieza a mostrarse con 4 intervalos válidos', /rrN < 4/.test(src) && /bpmMostrando/.test(src))
prueba('BPM = 60000 / mediana de hasta 8 intervalos, rango 40-180 y variación limitada', /RR_MAX\s*=\s*8/.test(src) && /60000\.0f \/ m/.test(src) && /bruto < 40\.0f \|\| bruto > 180\.0f/.test(src) && /constrain\(0\.5f \* \(bruto - bpmActual\), -4\.0f, 4\.0f\)/.test(src))
prueba('más de 3 s sin latido válido: pulso = 0 (no se conserva el valor viejo)', /SIN_LATIDO_MS\s*=\s*3000/.test(src) && /> SIN_LATIDO_MS/.test(src) && /void limpiarLatidos\(\)[\s\S]*?bpmActual = 0;/.test(src))
prueba('señal mala (intervalos dispersos o forma que no se repite) no da número', /MAD_MAX/.test(src) && /AUTOCORR_MIN/.test(src) && /float autocorrelacion\(/.test(src))
prueba('sin dedo: pulso en 0; el calentamiento ya no es de 2 s fijos sino «dedo estable»', /if \(sinDedo\) \{\s+bpmActual = 0;/.test(src) && !/CALENTAMIENTO_MS/.test(src) && /UMBRAL_DEDO = 7000/.test(src))

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
