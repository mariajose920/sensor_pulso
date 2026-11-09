# Firmware ESP32 - sensor_pulso (RF05, RF54)

Firmware del microcontrolador ESP32 de la plataforma **sensor_pulso** (UNACH). Lee el sensor de pulso/SpO₂ (MAX30100), envía la telemetría por WiFi al servidor y se configura **desde la app web por cable USB**, sin editar código.

Cumple con:
- **RF05**: recepción de datos del ESP32 por WiFi (HTTPS, un paquete por segundo).
- **RF54**: autenticación del dispositivo mediante token único revocable.
- **RF55**: cifrado en tránsito (HTTPS/TLS).

---

## Para estudiantes: configurar el WiFi (sin programar)

Ya **no se editan constantes ni se usa el Arduino IDE**. El WiFi se configura desde la app web:

1. Conecta el ESP32 a la computadora con un cable USB (de datos, no solo de carga).
2. Abre la app en Chrome o Edge y entra a **Medición → WiFi → «Configurar WiFi del ESP32 por USB»**.
3. Elige el puerto de la placa, selecciona tu red, escribe la clave y pulsa conectar.
4. El ESP32 guarda la red en su memoria y **se conecta solo cada vez que se enciende**. No hay que repetir el proceso, salvo que cambies de red.

Requisitos de la red:
- Debe ser de **2,4 GHz** (el ESP32 no ve redes de 5 GHz).
- **No sirven** redes que piden usuario y contraseña propios (tipo *eduroam*) ni redes con portal de inicio de sesión (páginas de «acepto los términos»). Usa el router del laboratorio o el **hotspot (zona WiFi) de un celular**.

Si el ESP32 no tiene red guardada, no intenta conectarse y avisa por el puerto serie cada ~10 s que falta configurar el WiFi.

---

## Requisitos de hardware y software (para quien compila el firmware)

1. **Placa:** ESP32 (NodeMCU-32S, ESP32 DevKit V1 o equivalente; probado el diseño con ESP32-D0WD-V3).
2. **Sensor:** MAX30100 por I2C: `SDA` → GPIO 21, `SCL` → GPIO 22, `VIN` → 3.3 V, `GND` → GND.
3. **Entorno:** Arduino IDE 2.x (o `arduino-cli`) con el core `esp32` de Espressif (3.x) instalado desde el Gestor de Tarjetas (`https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`).
4. **Librerías:** ninguna adicional. Solo se usan las incluidas en el core (`WiFi`, `HTTPClient`, `Preferences`, `Wire`); el JSON del protocolo se interpreta con un parser mínimo propio.

Carga (la hace el docente/desarrollador, una sola vez):
1. Seleccionar la placa **ESP32 Dev Module** y el puerto COM.
2. Subir el sketch `firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino` (`Ctrl + U`).
3. Opcional: Monitor Serie a **115200 baudios** para ver los registros (las líneas que empiezan con `@SP ` son del protocolo de configuración; el resto son mensajes para humanos).

Compilar por línea de comandos: `arduino-cli compile --fqbn esp32:esp32:esp32 firmware/esp32_wifi_prueba`.

---

## Valores por defecto y almacenamiento (NVS)

Las constantes del `.ino` son solo **valores por defecto**:

| Constante | Valor por defecto |
|---|---|
| `WIFI_SSID` / `WIFI_PASSWORD` | vacíos (sin red: espera configuración) |
| `SERVER_URL` | `https://sensorpulso.vercel.app/api/esp32/telemetria` |
| `DEVICE_TOKEN` | `esp_demotoken_unach_2026_rf05` |
| `DEVICE_NAME` | `ESP32-Biomedico-01` |

Lo configurado desde la app se guarda con `Preferences` (NVS, espacio `sensorpulso`, claves `ssid`, `pass`, `url`, `token`) y tiene prioridad sobre los valores por defecto. Un cambio de red por comando se aplica **sin reiniciar**. La clave WiFi y el token **nunca** se imprimen ni se devuelven por serie.

---

## Protocolo de configuración por USB `@SP` (para desarrolladores)

Serie a **115200 baudios**. Es un protocolo de líneas de texto: cada mensaje es una línea que empieza con el prefijo exacto `@SP ` (con espacio) seguido de un **JSON de una sola línea**, terminada en `\n`.

- El ESP32 ignora cualquier línea de entrada que no empiece con `@SP ` y tolera `\r\n`.
- Líneas de entrada de más de 512 bytes se descartan completas.
- La app web debe ignorar las líneas de salida sin el prefijo (son logs de depuración).
- Al arrancar, el ESP32 emite solo un evento `hello` (para que la app reconozca la placa) y lo repite cuando el WiFi pasa a conectado/desconectado.

### Comandos (app → ESP32)

| Comando | Campos | Respuesta |
|---|---|---|
| `{"cmd":"hello"}` | — | evento `hello` |
| `{"cmd":"status"}` | — | evento `status` (mismo contenido que `hello`) |
| `{"cmd":"scan"}` | — | evento `scan` (puede tardar unos segundos) |
| `{"cmd":"wifi","ssid":"...","pass":"..."}` | `ssid` 1–32 bytes, `pass` 0–63 | `wifi/conectando`, luego `wifi/conectado` o `wifi/error` |
| `{"cmd":"forget"}` | — | `{"ev":"forget","ok":true}` |
| `{"cmd":"server","url":"https://...","token":"..."}` | `url` y `token` opcionales; cadena vacía = restaurar el valor por defecto | `{"ev":"server","ok":true}` |

### Eventos (ESP32 → app)

| Evento | Ejemplo / contenido |
|---|---|
| `hello` / `status` | `{"ev":"hello","fw":"2.0","mac":"68:fe:71:87:4d:80","name":"ESP32-Biomedico-01","wifi":"conectado","ssid":"Casa","ip":"192.168.1.20","rssi":-55}` |
| `scan` | `{"ev":"scan","redes":[{"ssid":"Casa","rssi":-52,"seguridad":"wpa2"}]}` — ordenadas por `rssi` descendente, sin SSID repetidos ni vacíos, máximo 15 |
| `wifi` | `{"ev":"wifi","estado":"conectando"}`, `{"ev":"wifi","estado":"conectado","ssid":"...","ip":"x.x.x.x","rssi":-55}` o `{"ev":"wifi","estado":"error","motivo":"..."}` |
| `forget` / `server` | `{"ev":"forget","ok":true}` / `{"ev":"server","ok":true}` |
| `error` | `{"ev":"error","motivo":"..."}` |

Valores:
- `wifi` (en `hello`/`status`): `sin_credenciales`, `conectando`, `conectado`, `desconectado`. `ssid` es la red **guardada**; `ip` y `rssi` valen vacío/0 si no hay conexión.
- `seguridad`: `abierta`, `wpa2`, `wpa3`, `empresa`, `otra`.
- `motivo` de `wifi/error`: `clave_incorrecta`, `no_encontrada`, `tiempo` (timeout de ~15 s). Si falla, **no se guardan** las credenciales y se conservan las anteriores.
- `motivo` de `error`: `comando_invalido` (JSON inválido o comando desconocido), `datos_invalidos` (longitudes fuera de rango), `ocupado` (hay un `scan`/`wifi` en curso), `escaneo_fallido`.

Ejemplo de sesión:

```
> @SP {"cmd":"scan"}
< @SP {"ev":"scan","redes":[{"ssid":"Lab","rssi":-48,"seguridad":"wpa2"}]}
> @SP {"cmd":"wifi","ssid":"Lab","pass":"clave1234"}
< @SP {"ev":"wifi","estado":"conectando"}
< @SP {"ev":"wifi","estado":"conectado","ssid":"Lab","ip":"192.168.0.23","rssi":-50}
```

### Notas de implementación

- `loop()` (núcleo 1) lee la entrada serie de forma no bloqueante; el escaneo y la conexión los ejecuta la tarea WiFi (núcleo 0), que también hace el envío HTTP, de modo que no se interrumpe el muestreo del sensor.
- La tarea WiFi se crea antes de esperar al sensor, así la placa se puede configurar aunque el MAX30100 no esté conectado.
- Prueba estática del protocolo: `node scripts/test-firmware-provision-protocolo.mjs`.
