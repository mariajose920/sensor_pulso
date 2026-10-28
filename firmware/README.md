# Firmware ESP32 - sensor_pulso (RF05, RF54)

Firmware para el microcontrolador ESP32 para la plataforma **sensor_pulso** de la Universidad Adventista de Chile (UNACH).

Cumple con:
- **RF05**: Recepción de datos del ESP32 por WiFi (con datos de prueba y soporte MAX30102).
- **RF54**: Autenticación de dispositivo mediante token único revocable por el administrador.
- **RF08 / RF12**: Soporte para hasta 5 canales simultáneos (BPM, SpO₂ y señal PPG).

---

## 🛠 Requisitos de Hardware y Software

1. **Placa:** Placa de desarrollo ESP32 (NodeMCU-32S, ESP32 DevKit V1 o equivalente).
2. **Entorno de desarrollo:** Arduino IDE (versión 2.x) o VS Code con PlatformIO.
3. **Placa en Arduino IDE:** Instalar `esp32` de Espressif en el Gestor de Tarjetas (`https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`).
4. **Librerías (opcional para sensor físico):**
   - *SparkFun MAX3010x Pulse and Proximity Sensor Library* (si se activa `#define USE_MAX30102`).

---

## ⚙️ Configuración del Firmware

Abrir el archivo `firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino` y ajustar las constantes en la sección `1. CONFIGURACIÓN DE RED Y SERVIDOR`:

```cpp
// 1. Credenciales WiFi
const char* WIFI_SSID     = "MiRedWiFi";
const char* WIFI_PASSWORD = "MiPasswordWiFi";

// 2. URL del servidor
// Para pruebas locales en la misma red WiFi:
const char* SERVER_URL    = "http://192.168.1.100:5173/api/esp32/telemetria";
// Para producción en Vercel:
// const char* SERVER_URL = "https://tu-proyecto.vercel.app/api/esp32/telemetria";

// 3. Token propio del dispositivo (RF54)
// Obtenido al registrar el ESP32 en el panel de administración
const char* DEVICE_TOKEN  = "esp_demotoken_unach_2026_rf05";
```

---

## 🔬 Modo con Datos de Prueba vs. Sensor Físico

- **Modo Datos de Prueba (por defecto):**  
  No requiere ningún sensor conectado físicamente. El ESP32 sintetiza una señal PPG fisiológica real con pico sistólico y muesca dícrota para **5 canales independientes**, variando BPM (~65-80) y SpO₂ (~96-99%) para verificar la recepción y visualización web.
  
- **Modo con Sensor MAX30102 (Físico):**  
  Descomentar `#define USE_MAX30102` en la línea 56.  
  Conectar los pines I2C:
  - `SDA` -> `GPIO 21`
  - `SCL` -> `GPIO 22`
  - `VIN` -> `3.3V`
  - `GND` -> `GND`

---

## 🚀 Carga y Monitoreo

1. Conectar el ESP32 por USB a la computadora.
2. Seleccionar la placa **ESP32 Dev Module** y el puerto COM asignado.
3. Subir el sketch (`Ctrl + U`).
4. Abrir el Monitor Serie a **115200 baudios** para ver los registros de conexión WiFi y la confirmación de envío HTTP POST al servidor.
