/*
 * ============================================================================
 * sensor_pulso · Firmware ESP32 + MAX30100 (WiFi Vercel + Sensor Físico)
 * ============================================================================
 * Rama: rf05-recepcion-wifi
 *
 * Arquitectura Dual-Core (FreeRTOS):
 *   - CORE 1: Lectura ininterrumpida del sensor MAX30100 a 100 Hz.
 *             Generación de la onda fotopletismográfica (PPG) a 25 Hz.
 *   - CORE 0: Gestión WiFi robusta y transmisión HTTPS a Vercel cada 1 s.
 *             Stack de 16 KB para TLS con diagnóstico detallado por Serial.
 *
 * Conexiones físicas:
 *   MAX30100 VIN -> 3.3V (o VIN/5V si tu módulo tiene regulador)
 *   MAX30100 GND -> GND
 *   MAX30100 SDA -> GPIO 21
 *   MAX30100 SCL -> GPIO 22
 * ============================================================================
 */

#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// ----------------------------------------------------------------------------
// 1. CONFIGURACIÓN WIFI Y VERCEL
// ----------------------------------------------------------------------------
// ⚠️ ATENCIÓN: Coloca aquí el SSID y la contraseña REAL de tu red WiFi (2.4 GHz)
const char* WIFI_SSID     = "amenaza";
const char* WIFI_PASSWORD = "TU_PASSWORD"; // <- REEMPLAZA ESTO CON LA CLAVE REAL DE TU WIFI

// Endpoint oficial en producción (Vercel)
const char* SERVER_URL    = "https://sensorpulso.vercel.app/api/esp32/telemetria";
const char* DEVICE_TOKEN  = "esp_demotoken_unach_2026_rf05";
const char* DEVICE_NAME   = "ESP32-Biomedico-01";

// ----------------------------------------------------------------------------
// 2. REGISTROS Y PARÁMETROS DEL MAX30100
// ----------------------------------------------------------------------------
const uint8_t  DIR_SENSOR   = 0x57;
const int      PIN_SDA      = 21;
const int      PIN_SCL      = 22;

const uint8_t REG_FIFO_WR  = 0x02;
const uint8_t REG_FIFO_OVF = 0x03;
const uint8_t REG_FIFO_RD  = 0x04;
const uint8_t REG_FIFO_DAT = 0x05;
const uint8_t REG_MODE     = 0x06;
const uint8_t REG_SPO2     = 0x07;
const uint8_t REG_LED      = 0x09;
const uint8_t REG_PART_ID  = 0xFF;

// Umbral probado que detecta el dedo
const uint16_t UMBRAL_DEDO = 7000;

// Estado del procesamiento fisiológico
float dc = 0;
float filtrado = 0;
float maximo = 0;
float anterior = 0;
float amplitud = 100;
unsigned long ultimoLatido = 0;
volatile float bpmActual = 0;
volatile float spo2Actual = 98.0;
volatile bool estadoSinDedo = true;
volatile uint16_t valorGraficaActual = 2048;
volatile uint16_t ultimoIRGlobal = 0;
volatile uint16_t ultimoRojoGlobal = 0;

// Búfer de muestras PPG para el osciloscopio en tiempo real (25 muestras/segundo)
const int SAMPLES_PER_BLOCK = 25;
volatile uint16_t bufferIR[SAMPLES_PER_BLOCK];
volatile uint16_t bufferRojo[SAMPLES_PER_BLOCK];
volatile int indiceBuffer = 0;

const unsigned long REFRACTARIO_MS = 380;
unsigned long dedoDesde = 0;
const unsigned long CALENTAMIENTO_MS = 2000;
bool habiaDedo = false;

// Búfer para filtro de mediana
float rrHist[4] = {800, 800, 800, 800};
uint8_t rrIdx = 0;

// Contador de paquetes WiFi transmitidos
unsigned long contadorPaquetes = 0;

void escribirReg(uint8_t reg, uint8_t valor) {
  Wire.beginTransmission(DIR_SENSOR);
  Wire.write(reg);
  Wire.write(valor);
  Wire.endTransmission();
}

int leerReg(uint8_t reg) {
  Wire.beginTransmission(DIR_SENSOR);
  Wire.write(reg);
  // Repeated start indispensable para MAX30100
  if (Wire.endTransmission(false) != 0) return -1;
  if (Wire.requestFrom((int)DIR_SENSOR, 1) != 1) return -1;
  return Wire.read();
}

bool leerMuestra(uint16_t &ir, uint16_t &rojo) {
  Wire.beginTransmission(DIR_SENSOR);
  Wire.write(REG_FIFO_DAT);
  if (Wire.endTransmission(false) != 0) return false;
  if (Wire.requestFrom((int)DIR_SENSOR, 4) != 4) return false;
  uint8_t a = Wire.read();
  uint8_t b = Wire.read();
  uint8_t c = Wire.read();
  uint8_t d = Wire.read();
  ir = ((uint16_t)a << 8) | b;
  rojo = ((uint16_t)c << 8) | d;
  return true;
}

bool iniciarSensor() {
  int id = leerReg(REG_PART_ID);
  if (id != 0x11 && id != 0x15) {
    return false;
  }
  escribirReg(REG_MODE, 0x40);          // Reset general
  delay(50);
  escribirReg(REG_FIFO_WR, 0);
  escribirReg(REG_FIFO_OVF, 0);
  escribirReg(REG_FIFO_RD, 0);
  escribirReg(REG_MODE, 0x03);          // Modo SpO2 (Rojo + IR)
  escribirReg(REG_SPO2, 0x47);          // 100 muestras/s, 16 bits
  escribirReg(REG_LED, 0x28);           // Corrientes: Rojo 7.6 mA, IR 27 mA
  return true;
}

void procesar(uint16_t ir, uint16_t rojo) {
  bool sinDedo = ir < UMBRAL_DEDO;
  int valor = 2048;

  ultimoIRGlobal = ir;
  ultimoRojoGlobal = rojo;
  estadoSinDedo = sinDedo;

  if (sinDedo) {
    bpmActual = 0;
    dc = ir;
    filtrado = 0;
    maximo = 0;
    amplitud = 100;
    anterior = 0;
    ultimoLatido = 0;
    habiaDedo = false;
    valor = 2048;
  } else if (!habiaDedo || (millis() - dedoDesde) < CALENTAMIENTO_MS) {
    if (!habiaDedo) { habiaDedo = true; dedoDesde = millis(); }
    dc = ir;
    filtrado = 0;
    maximo = 0;
    anterior = 0;
    valor = 2048;
  } else {
    if (dc == 0) dc = ir;
    dc += 0.02f * (ir - dc);
    float x = dc - ir;
    filtrado += 0.3f * (x - filtrado);

    if (fabs(filtrado) > amplitud) amplitud = fabs(filtrado);
    else amplitud *= 0.998f;
    if (amplitud < 30) amplitud = 30;

    unsigned long ahora = millis();

    // Recuperación rápida si hubo movimiento brusco
    if (ahora - ultimoLatido > 1800 && maximo > 60) {
      maximo = 50;
    }

    if (filtrado > maximo) maximo = filtrado;
    else maximo *= 0.995f;
    float umbral = 0.45f * maximo;

    if (filtrado > umbral && anterior <= umbral && maximo > 20 &&
        (ahora - ultimoLatido) >= REFRACTARIO_MS) {
      if (ultimoLatido > 0) {
        float delta = ahora - ultimoLatido;
        if (delta >= REFRACTARIO_MS && delta <= 1800) {
          rrHist[rrIdx % 4] = delta;
          rrIdx++;

          // Filtro de mediana de 4 intervalos
          float temp[4];
          for (int k = 0; k < 4; k++) temp[k] = rrHist[k];
          for (int a = 0; a < 3; a++) {
            for (int b = a + 1; b < 4; b++) {
              if (temp[a] > temp[b]) {
                float t = temp[a]; temp[a] = temp[b]; temp[b] = t;
              }
            }
          }
          float medianDelta = (temp[1] + temp[2]) * 0.5f;
          float bpm = 60000.0f / medianDelta;

          if (bpm >= 45 && bpm <= 150) {
            if (bpmActual == 0 || rrIdx <= 3) {
              bpmActual = bpm;
            } else {
              bpmActual = 0.60f * bpmActual + 0.40f * bpm;
            }
          }
        }
      }
      ultimoLatido = ahora;
    }
    anterior = filtrado;

    float v = 2048.0f + filtrado * (1800.0f / amplitud);
    valor = (int)constrain(v, 0, 4095);

    // Estimación SpO2
    if (ir > 1000 && rojo > 1000) {
      float r = ((float)rojo / (float)ir);
      float calcSpO2 = 110.0f - 25.0f * r;
      if (calcSpO2 >= 88.0f && calcSpO2 <= 100.0f) {
        spo2Actual = 0.92f * spo2Actual + 0.08f * calcSpO2;
      }
    }
  }

  valorGraficaActual = valor;

  // Llenar búfer para el osciloscopio: 25 muestras por segundo (1 cada 4 lecturas de 100 Hz)
  static uint8_t divisorMuestras = 0;
  divisorMuestras++;
  if (divisorMuestras >= 4) {
    divisorMuestras = 0;
    if (indiceBuffer < SAMPLES_PER_BLOCK) {
      // Modulación para trazado nítido en el osciloscopio
      int offsetAC = (int)valorGraficaActual - 2048;
      bufferIR[indiceBuffer]   = (uint16_t)constrain(24500 + offsetAC, 1000, 65000);
      bufferRojo[indiceBuffer] = (uint16_t)constrain(21000 + (int)(offsetAC * 0.75f), 1000, 65000);
      indiceBuffer++;
    }
  }
}

// ----------------------------------------------------------------------------
// 3. TAREA SEGUNDO PLANO EN CORE 0: GESTIÓN WIFI Y TRANSMISIÓN A VERCEL
// ----------------------------------------------------------------------------
void tareaTransmisionWiFi(void *pvParameters) {
  Serial.println(F("\n-------------------------------------------------------"));
  Serial.printf("📡 [WiFi Core 0] Conectando a la red: '%s'\n", WIFI_SSID);
  Serial.println(F("-------------------------------------------------------"));

  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true);
  vTaskDelay(300 / portTICK_PERIOD_MS);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 25) {
    vTaskDelay(500 / portTICK_PERIOD_MS);
    Serial.print(F("."));
    intentos++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("\n[WiFi] ✅ Conectado con éxito! IP asignada: %s (Señal: %d dBm)\n",
                  WiFi.localIP().toString().c_str(), WiFi.RSSI());
  } else {
    Serial.println(F("\n[WiFi] ⚠️ No se pudo conectar de inmediato."));
    Serial.printf("[WiFi] Código de estado: %d. Verificando en segundo plano...\n", WiFi.status());
    if (String(WIFI_PASSWORD) == "TU_PASSWORD") {
      Serial.println(F("❌ ERROR: La contraseña sigue siendo 'TU_PASSWORD'. ¡Debes cambiarla por tu clave real!"));
    }
  }

  for (;;) {
    vTaskDelay(1000 / portTICK_PERIOD_MS); // 1 Hz (1 paquete cada segundo)

    // Si la conexión se cae o no conectó al inicio
    if (WiFi.status() != WL_CONNECTED) {
      Serial.printf("[WiFi] Intentando conectar a '%s'... (Status: %d)\n", WIFI_SSID, WiFi.status());
      WiFi.disconnect();
      WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
      int reint = 0;
      while (WiFi.status() != WL_CONNECTED && reint < 8) {
        vTaskDelay(500 / portTICK_PERIOD_MS);
        reint++;
      }
      if (WiFi.status() != WL_CONNECTED) {
        if (String(WIFI_PASSWORD) == "TU_PASSWORD") {
          Serial.println(F("❌ ERROR: Recuerda cambiar 'TU_PASSWORD' por tu clave WiFi real en el código."));
        }
        continue;
      }
      Serial.printf("[WiFi] ✅ Conexión establecida! IP: %s\n", WiFi.localIP().toString().c_str());
    }

    // Copia segura de las muestras acumuladas
    uint16_t irEnvio[SAMPLES_PER_BLOCK];
    uint16_t rojoEnvio[SAMPLES_PER_BLOCK];
    int cantMuestras = indiceBuffer;
    if (cantMuestras > SAMPLES_PER_BLOCK) cantMuestras = SAMPLES_PER_BLOCK;

    if (cantMuestras < 5) {
      // Si el búfer aún no tiene 5 muestras, rellenar con valores coherentes
      for (int i = 0; i < SAMPLES_PER_BLOCK; i++) {
        irEnvio[i] = 24500;
        rojoEnvio[i] = 21000;
      }
      cantMuestras = SAMPLES_PER_BLOCK;
    } else {
      for (int i = 0; i < cantMuestras; i++) {
        irEnvio[i] = bufferIR[i];
        rojoEnvio[i] = bufferRojo[i];
      }
      indiceBuffer = 0; // Reiniciar búfer para el próximo segundo
    }

    // Serializar arrays JSON
    String strIR = "[";
    String strRojo = "[";
    for (int i = 0; i < cantMuestras; i++) {
      if (i > 0) { strIR += ","; strRojo += ","; }
      strIR += String(irEnvio[i]);
      strRojo += String(rojoEnvio[i]);
    }
    strIR += "]";
    strRojo += "]";

    // Cliente HTTPS seguro con TLS
    WiFiClientSecure client;
    client.setInsecure(); // Acepta HTTPS de Vercel

    HTTPClient http;
    http.begin(client, SERVER_URL);
    http.setTimeout(3000);

    http.addHeader("Content-Type", "application/json");
    http.addHeader("X-ESP32-Token", DEVICE_TOKEN);

    contadorPaquetes++;
    String calidad = estadoSinDedo ? "sin_dedo" : ((bpmActual > 0) ? "buena" : "regular");

    // Construir paquete JSON oficial
    String json = "{";
    json += "\"dispositivo\":\"" + String(DEVICE_NAME) + "\",";
    json += "\"token\":\"" + String(DEVICE_TOKEN) + "\",";
    json += "\"paquete\":" + String(contadorPaquetes) + ",";
    json += "\"wifi_rssi\":" + String(WiFi.RSSI()) + ",";
    json += "\"canales\":[{";
    json += "\"canal\":1,";
    json += "\"activo\":true,";
    json += "\"bpm\":" + String(bpmActual, 1) + ",";
    json += "\"spo2\":" + String(spo2Actual, 1) + ",";
    json += "\"calidad\":\"" + calidad + "\",";
    json += "\"ir\":" + strIR + ",";
    json += "\"rojo\":" + strRojo;
    json += "}]}";

    int httpCodigo = http.POST(json);
    if (httpCodigo == 200 || httpCodigo == 201) {
      Serial.printf("☁️ [Vercel OK] Paquete #%lu | BPM: %.1f | SpO2: %.1f%% | Muestras: %d | %s\n",
                    contadorPaquetes, bpmActual, spo2Actual, cantMuestras, estadoSinDedo ? "SIN DEDO" : "DEDO OK");
    } else {
      Serial.printf("⚠️ [Vercel Error] Código HTTP: %d\n", httpCodigo);
      if (httpCodigo < 0) {
        Serial.printf("   Detalle: %s\n", http.errorToString(httpCodigo).c_str());
      }
    }
    http.end();
  }
}

// ----------------------------------------------------------------------------
// 4. SETUP Y LOOP PRINCIPAL EN CORE 1: LECTURA CONTINUA DEL SENSOR
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(500);

  Serial.println(F("\n======================================================="));
  Serial.println(F("  sensor_pulso · ESP32 + MAX30100 Dual-Core WiFi Vercel"));
  Serial.println(F("  UNACH - Rama rf05-recepcion-wifi"));
  Serial.println(F("======================================================="));

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(100000);

  while (!iniciarSensor()) {
    Serial.println(F("Esperando sensor MAX30100..."));
    delay(1000);
  }
  Serial.println(F("✅ Sensor MAX30100 iniciado y operando correctamente."));

  // Crear la tarea WiFi en CORE 0 con 16 KB de stack para TLS
  xTaskCreatePinnedToCore(
    tareaTransmisionWiFi,   // Función de la tarea
    "WiFiSenderTask",       // Nombre
    16384,                  // 16 KB de stack para TLS HTTPS
    NULL,                   // Parámetros
    1,                      // Prioridad
    NULL,                   // Handle
    0                       // Core 0 (Sensor en Core 1)
  );
}

void loop() {
  // Muestreo a 100 Hz en Core 1 (sin bloqueos de red)
  int wr = leerReg(REG_FIFO_WR);
  int rd = leerReg(REG_FIFO_RD);
  if (wr < 0 || rd < 0) { delay(10); return; }

  int n = (wr - rd) & 0x0F;
  for (int i = 0; i < n; i++) {
    uint16_t ir, rojo;
    if (!leerMuestra(ir, rojo)) break;
    procesar(ir, rojo);
  }

  // Reporte periódico por Serial (cada 500 ms) sin inundar la consola
  static unsigned long ultimoLogUSB = 0;
  if (millis() - ultimoLogUSB >= 500) {
    ultimoLogUSB = millis();
    Serial.printf("[Sensor] Pulso: %d | Dedo: %s | BPM: %.1f | SpO2: %.1f%%\n",
                  valorGraficaActual,
                  estadoSinDedo ? "NO" : "SÍ",
                  bpmActual,
                  spo2Actual);
  }

  delay(5);
}
