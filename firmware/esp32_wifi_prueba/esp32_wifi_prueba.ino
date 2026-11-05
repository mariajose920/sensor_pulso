/*
 * ============================================================================
 * sensor_pulso · Firmware ESP32 + MAX30100 (WiFi Vercel + Sensor Físico)
 * ============================================================================
 * Arquitectura Dual-Core (FreeRTOS):
 *   - CORE 1: Lectura ininterrumpida del sensor MAX30100 a 100 Hz con el
 *             algoritmo exacto que detecta tu dedo a la perfección.
 *   - CORE 0: Transmisión WiFi en segundo plano hacia Vercel (1 Hz)
 *             con reconexión automática ante cualquier red WiFi.
 *
 * Conexiones:
 *   MAX30100 VIN -> 3.3V (o VIN/5V)
 *   MAX30100 GND -> GND
 *   MAX30100 SDA -> GPIO 21 (D21)
 *   MAX30100 SCL -> GPIO 22 (D22)
 * ============================================================================
 */

#include <Wire.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// ----------------------------------------------------------------------------
// 1. CONFIGURACIÓN WIFI Y VERCEL (Coloca aquí los datos de cualquier red WiFi)
// ----------------------------------------------------------------------------
const char* WIFI_SSID     = "amenaza";             // Cambia por cualquier red WiFi
const char* WIFI_PASSWORD = "TU_PASSWORD";         // Contraseña de la red WiFi

// Endpoint oficial en Vercel
const char* SERVER_URL    = "https://sensorpulso.vercel.app/api/esp32/telemetria";
const char* DEVICE_TOKEN  = "esp_demotoken_unach_2026_rf05";
const char* DEVICE_NAME   = "ESP32-Biomedico-01";

// ----------------------------------------------------------------------------
// 2. REGISTROS Y PARÁMETROS DEL MAX30100 (Tu código probado y funcional)
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

// Umbral probado que funciona con tu dedo
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
  escribirReg(REG_MODE, 0x40);          // Reset
  delay(50);
  escribirReg(REG_FIFO_WR, 0);
  escribirReg(REG_FIFO_OVF, 0);
  escribirReg(REG_FIFO_RD, 0);
  escribirReg(REG_MODE, 0x03);          // Modo SpO2
  escribirReg(REG_SPO2, 0x47);          // 100 muestras/s, 16 bits
  escribirReg(REG_LED, 0x28);           // Rojo 7.6 mA, IR 27 mA
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
  } else if (!habiaDedo || (millis() - dedoDesde) < CALENTAMIENTO_MS) {
    if (!habiaDedo) { habiaDedo = true; dedoDesde = millis(); }
    dc = ir;
    filtrado = 0;
    maximo = 0;
    anterior = 0;
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
}

// ----------------------------------------------------------------------------
// 3. TAREA SEGUNDO PLANO EN CORE 0: TRANSMISIÓN WIFI HACIA VERCEL
//    Se ejecuta de forma independiente sin quitarle ni 1 ms al sensor.
// ----------------------------------------------------------------------------
void tareaTransmisionWiFi(void *pvParameters) {
  Serial.printf("[Core 0] Iniciando conexión WiFi a red: %s\n", WIFI_SSID);

  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.persistent(true);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  for (;;) {
    vTaskDelay(1000 / portTICK_PERIOD_MS); // Transmitir cada 1 segundo (1 Hz)

    if (WiFi.status() == WL_CONNECTED) {
      WiFiClientSecure client;
      client.setInsecure(); // Acepta HTTPS de Vercel (RF55)

      HTTPClient http;
      http.begin(client, SERVER_URL);
      http.setTimeout(2500);

      http.addHeader("Content-Type", "application/json");
      http.addHeader("X-ESP32-Token", DEVICE_TOKEN);

      contadorPaquetes++;
      String calidad = estadoSinDedo ? "sin_dedo" : ((bpmActual > 0) ? "buena" : "regular");

      // Construir paquete de telemetría con los datos del sensor
      String json = "{";
      json += "\"dispositivo\":\"" + String(DEVICE_NAME) + "\",";
      json += "\"token\":\"" + String(DEVICE_TOKEN) + "\",";
      json += "\"paquete\":" + String(contadorPaquetes) + ",";
      json += "\"canales\":[{";
      json += "\"canal\":1,";
      json += "\"activo\":true,";
      json += "\"bpm\":" + String(bpmActual, 1) + ",";
      json += "\"spo2\":" + String(spo2Actual, 1) + ",";
      json += "\"calidad\":\"" + calidad + "\",";
      json += "\"ir\":[" + String(ultimoIRGlobal) + "],";
      json += "\"rojo\":[" + String(ultimoRojoGlobal) + "]";
      json += "}]}";

      int httpCodigo = http.POST(json);
      if (httpCodigo == 200 || httpCodigo == 201) {
        Serial.printf("☁️ [Vercel OK] Paquete #%lu | BPM: %.1f | SpO2: %.1f%% | Estado: %s\n",
                      contadorPaquetes, bpmActual, spo2Actual, estadoSinDedo ? "sin_dedo" : "DEDO_OK");
      } else {
        Serial.printf("⚠️ [Vercel] Error HTTP: %d\n", httpCodigo);
      }
      http.end();
    } else {
      Serial.println("🔄 Reconectando a WiFi...");
      WiFi.reconnect();
    }
  }
}

// ----------------------------------------------------------------------------
// 4. SETUP Y LOOP PRINCIPAL EN CORE 1: LECTURA CONTINUA DEL SENSOR
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(300);

  Serial.println(F("\n======================================================="));
  Serial.println(F("  sensor_pulso · ESP32 + MAX30100 Dual-Core WiFi Vercel"));
  Serial.println(F("======================================================="));

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(100000);

  while (!iniciarSensor()) {
    Serial.println(F("Esperando sensor MAX30100..."));
    delay(1000);
  }
  Serial.println(F("✅ Sensor iniciado y operando correctamente."));

  // Crear la tarea WiFi en CORE 0 para que NUNCA congele las lecturas del sensor
  xTaskCreatePinnedToCore(
    tareaTransmisionWiFi,   // Función de la tarea
    "WiFiSenderTask",       // Nombre descriptivo
    8192,                   // Tamaño de pila (stack)
    NULL,                   // Parámetros
    1,                      // Prioridad
    NULL,                   // Handle de tarea
    0                       // Core 0 (el sensor corre en Core 1)
  );

  Serial.println(F("t_ms,ecg_raw,leads_off,bpm"));
}

void loop() {
  // Bucle rápido y exclusivo para el sensor en Core 1 (100% libre de bloqueos de red)
  int wr = leerReg(REG_FIFO_WR);
  int rd = leerReg(REG_FIFO_RD);
  if (wr < 0 || rd < 0) { delay(10); return; }

  int n = (wr - rd) & 0x0F;
  for (int i = 0; i < n; i++) {
    uint16_t ir, rojo;
    if (!leerMuestra(ir, rojo)) break;
    procesar(ir, rojo);
  }

  // Emisión por puerto USB en el formato tradicional
  Serial.print(millis());
  Serial.print(',');
  Serial.print(valorGraficaActual);
  Serial.print(',');
  Serial.print(estadoSinDedo ? 1 : 0);
  Serial.print(',');
  Serial.println(bpmActual, 1);

  delay(5);
}
