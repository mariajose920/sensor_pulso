/*
 * ============================================================================
 * sensor_pulso · Firmware ESP32 por WiFi con Datos de Prueba (RF05, RF54)
 * ============================================================================
 * Proyecto: sensor_pulso (UNACH)
 * Requerimiento: RF05 - Recibir los datos del ESP32 por WiFi (firmware con datos de prueba).
 * Requerimiento: RF54 - Autenticación con token propio por dispositivo.
 * 
 * Descripción:
 *   Este firmware conecta el ESP32 a la red WiFi institucional o local y transmite
 *   en tiempo real los datos fisiológicos (BPM, SpO2 y bloques de onda PPG en IR/Rojo)
 *   hacia el endpoint de ingesta de la plataforma (/api/esp32/telemetria).
 * 
 *   Incluye un generador sintetizador de ondas fotopletismográficas (PPG) de alta
 *   fidelidad fisiológica para hasta 5 canales simultáneos (con muesca dícrota,
 *   pico sistólico y variabilidad natural), permitiendo validar el sistema completo
 *   incluso sin los sensores físicos conectados ("datos de prueba").
 *   
 *   Opcionalmente, si se conecta un sensor MAX30102 por I2C (SDA=GPIO21, SCL=GPIO22),
 *   puede habilitarse la lectura real en el canal 1 mediante el define USE_MAX30102.
 * ============================================================================
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <math.h>

// ----------------------------------------------------------------------------
// 1. CONFIGURACIÓN DE RED Y SERVIDOR
// ----------------------------------------------------------------------------
// Ajustar credenciales de la red WiFi local o institucional
const char* WIFI_SSID     = "TU_RED_WIFI";
const char* WIFI_PASSWORD = "TU_PASSWORD_WIFI";

// URL del endpoint de ingesta de la plataforma web sensor_pulso.
// En desarrollo local (misma red WiFi): http://<IP_DE_TU_PC>:5173/api/esp32/telemetria
// En producción (Vercel): https://<tu-app>.vercel.app/api/esp32/telemetria
const char* SERVER_URL    = "http://192.168.1.100:5173/api/esp32/telemetria";

// Token de autenticación del dispositivo ESP32 (RF54)
// Este token es generado por el administrador en la plataforma (/admin o panel de dispositivos)
const char* DEVICE_TOKEN  = "esp_demotoken_unach_2026_rf05";

// Nombre identificador del microcontrolador
const char* DEVICE_NAME   = "ESP32-Biomedico-01";

// Intervalo de transmisión por WiFi en milisegundos (1000 ms = 1 Hz)
const unsigned long TRANSMIT_INTERVAL_MS = 1000;

// Frecuencia de muestreo simulada de la señal PPG (Hz) y número de muestras por paquete
const int PPG_SAMPLE_RATE_HZ = 50;  // 50 muestras por segundo
const int SAMPLES_PER_BLOCK  = 25;  // 25 muestras por bloque transmitido

// Pin de LED de estado (GPIO 2 suele ser el LED integrado en la mayoría de NodeMCU ESP32)
const int LED_PIN = 2;

// Descomentar la siguiente línea si se desea usar un sensor físico MAX30102 por I2C:
// #define USE_MAX30102

#ifdef USE_MAX30102
#include <Wire.h>
#include "MAX30105.h"
MAX30105 max30102Sensor;
bool sensorHardwarePresent = false;
#endif

// ----------------------------------------------------------------------------
// 2. ESTRUCTURA DE DATOS PARA LOS 5 CANALES (RF08, RF12)
// ----------------------------------------------------------------------------
struct CanalData {
  int canal;
  bool activo;
  float bpm;
  float spo2;
  const char* calidad; // "buena", "regular", "mala"
  float irSamples[SAMPLES_PER_BLOCK];
  float redSamples[SAMPLES_PER_BLOCK];
};

CanalData canales[5];
unsigned long lastTransmitTime = 0;
unsigned long packetCounter = 0;
float simPhase[5] = {0.0, 0.5, 1.2, 2.0, 2.7}; // Fases iniciales desfasadas para cada canal

// ----------------------------------------------------------------------------
// 3. SINTETIZADOR DE SEÑAL PPG FISIOLÓGICA (Datos de prueba)
// Genera una forma de onda PPG realista con pico sistólico y muesca dícrota
// ----------------------------------------------------------------------------
float generarMuestraPPG(float phase) {
  // Normalizar fase a rango [0, 2*PI]
  float t = fmod(phase, 2.0 * M_PI);
  if (t < 0) t += 2.0 * M_PI;

  // Curva de onda pulsátil: componente principal (sístole) + onda reflejada (dícrota)
  float s1 = exp(-pow((t - 1.2), 2) / 0.18); // Pico sistólico principal
  float s2 = 0.35 * exp(-pow((t - 2.3), 2) / 0.12); // Pico diastólico tras la incisura
  
  // Nivel de reflexión normalizado entre 0.0 y 1.0
  float forma = (s1 + s2);
  return forma;
}

void actualizarSenalesPrueba() {
  // Parámetros fisiológicos base para los 5 canales de prueba
  float bpmBase[5]     = {72.0, 68.5, 80.0, 75.2, 65.0};
  float spo2Base[5]    = {98.2, 97.5, 99.0, 98.0, 96.8};
  const char* cal[5]   = {"buena", "buena", "buena", "regular", "buena"};

  for (int c = 0; c < 5; c++) {
    canales[c].canal = c + 1;
    canales[c].activo = true;
    canales[c].calidad = cal[c];

    // Variabilidad fisiológica sutil (+- 1.5 BPM, +- 0.3 % SpO2)
    float jitterBpm = (sin((millis() + c * 300) / 4000.0) * 1.5);
    canales[c].bpm = bpmBase[c] + jitterBpm;
    canales[c].spo2 = spo2Base[c] + (cos((millis() + c * 500) / 6000.0) * 0.3);

    // Calcular incremento de fase según el BPM actual
    float freqHz = canales[c].bpm / 60.0;
    float phaseStep = (2.0 * M_PI * freqHz) / (float)PPG_SAMPLE_RATE_HZ;

    // Generar muestras del bloque para IR y RED
    for (int i = 0; i < SAMPLES_PER_BLOCK; i++) {
      simPhase[c] += phaseStep;
      float ppg = generarMuestraPPG(simPhase[c]);

      // Nivel ADC típico de fotodiodo (DC baseline ~ 24000, componente pulsátil AC ~ 1200)
      float dcIr = 24500.0 + (c * 300);
      float acIr = 1400.0 * ppg;
      float ruIdo = ((rand() % 100) - 50) * 0.3; // Pequeño ruido estocástico

      canales[c].irSamples[i] = dcIr + acIr + ruIdo;

      // Señal Roja correlacionada según SpO2
      float ratioSpO2 = (110.0 - canales[c].spo2) / 25.0; // Modelo empírico de absorción
      float dcRed = 21000.0 + (c * 250);
      float acRed = acIr * ratioSpO2;
      canales[c].redSamples[i] = dcRed + acRed + ruIdo;
    }
  }

#ifdef USE_MAX30102
  // Si el hardware real está disponible, sobrescribir canal 1 con lecturas del sensor
  if (sensorHardwarePresent) {
    long irVal = max30102Sensor.getIR();
    long redVal = max30102Sensor.getRed();
    if (irVal > 40000) {
      canales[0].irSamples[SAMPLES_PER_BLOCK - 1] = (float)irVal;
      canales[0].redSamples[SAMPLES_PER_BLOCK - 1] = (float)redVal;
      canales[0].calidad = "buena";
    } else {
      canales[0].calidad = "regular"; // Dedo no detectado firmemente
    }
  }
#endif
}

// ----------------------------------------------------------------------------
// 4. CONSTRUCCIÓN DE PAYLOAD JSON
// Construye el paquete de telemetría optimizado para HTTP POST
// ----------------------------------------------------------------------------
String construirPayloadJSON() {
  String json = "{";
  json += "\"dispositivo\":\"" + String(DEVICE_NAME) + "\",";
  json += "\"token\":\"" + String(DEVICE_TOKEN) + "\",";
  json += "\"paquete\":" + String(packetCounter) + ",";
  json += "\"uptime_ms\":" + String(millis()) + ",";
  json += "\"wifi_rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"frecuencia_hz\":" + String(PPG_SAMPLE_RATE_HZ) + ",";
  json += "\"canales\":[";

  for (int c = 0; c < 5; c++) {
    if (c > 0) json += ",";
    json += "{";
    json += "\"canal\":" + String(canales[c].canal) + ",";
    json += "\"activo\":" + String(canales[c].activo ? "true" : "false") + ",";
    json += "\"bpm\":" + String(canales[c].bpm, 1) + ",";
    json += "\"spo2\":" + String(canales[c].spo2, 1) + ",";
    json += "\"calidad\":\"" + String(canales[c].calidad) + "\",";

    // Muestras IR
    json += "\"ir\":[";
    for (int i = 0; i < SAMPLES_PER_BLOCK; i++) {
      if (i > 0) json += ",";
      json += String(canales[c].irSamples[i], 1);
    }
    json += "],";

    // Muestras Rojo
    json += "\"rojo\":[";
    for (int i = 0; i < SAMPLES_PER_BLOCK; i++) {
      if (i > 0) json += ",";
      json += String(canales[c].redSamples[i], 1);
    }
    json += "]";
    json += "}";
  }

  json += "]}";
  return json;
}

// ----------------------------------------------------------------------------
// 5. ENVÍO DE DATOS POR WIFI (HTTP POST con Token RF54)
// ----------------------------------------------------------------------------
bool enviarTelemetriaPorWiFi(const String& payload) {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("[WiFi] ⚠️ Conexión perdida. Intentando reconectar...");
    WiFi.reconnect();
    return false;
  }

  HTTPClient http;
  http.begin(SERVER_URL);
  http.setTimeout(2500); // Timeout razonable para baja latencia (RNF04)

  // Cabeceras de seguridad y formato
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-ESP32-Token", DEVICE_TOKEN);
  http.addHeader("Authorization", String("Bearer ") + DEVICE_TOKEN);

  unsigned long startRequest = millis();
  int httpResponseCode = http.POST(payload);
  unsigned long latencyMs = millis() - startRequest;

  bool exito = false;
  if (httpResponseCode > 0) {
    String response = http.getString();
    if (httpResponseCode == 200 || httpResponseCode == 201) {
      Serial.printf("[WiFi] ✅ Paquete #%lu enviado | HTTP %d | Latencia: %lu ms | Servidor: %s\n",
                    packetCounter, httpResponseCode, latencyMs, response.c_str());
      exito = true;
      // Parpadeo corto del LED indicador
      digitalWrite(LED_PIN, HIGH);
      delay(30);
      digitalWrite(LED_PIN, LOW);
    } else {
      Serial.printf("[WiFi] ⚠️ Respuesta del servidor HTTP %d: %s\n", httpResponseCode, response.c_str());
    }
  } else {
    Serial.printf("[WiFi] ❌ Error en petición POST: %s (código: %d)\n",
                  http.errorToString(httpResponseCode).c_str(), httpResponseCode);
  }

  http.end();
  return exito;
}

// ----------------------------------------------------------------------------
// 6. SETUP & CONEXIÓN INICIAL
// ----------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(1000);
  pinMode(LED_PIN, OUTPUT);
  digitalWrite(LED_PIN, LOW);

  Serial.println("\n========================================================");
  Serial.println("  sensor_pulso · ESP32 Firmware WiFi (RF05 / RF54)");
  Serial.println("  Universidad Adventista de Chile (UNACH)");
  Serial.println("========================================================");
  Serial.printf("Dispositivo : %s\n", DEVICE_NAME);
  Serial.printf("Endpoint    : %s\n", SERVER_URL);
  Serial.printf("Token       : %s\n", DEVICE_TOKEN);

#ifdef USE_MAX30102
  Wire.begin(21, 22);
  if (max30102Sensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("[I2C] Sensor MAX30102 detectado correctamente.");
    max30102Sensor.setup(60, 4, 2, 100, 411, 4096);
    sensorHardwarePresent = true;
  } else {
    Serial.println("[I2C] No se detectó MAX30102. Usando modo simulador fisiológico.");
  }
#else
  Serial.println("[Modo] Ejecutando en modo datos de prueba fisiológicos (5 canales).");
#endif

  // Conexión WiFi
  Serial.printf("[WiFi] Conectando a SSID: %s ", WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  int intentos = 0;
  while (WiFi.status() != WL_CONNECTED && intentos < 30) {
    delay(400);
    digitalWrite(LED_PIN, !digitalRead(LED_PIN)); // Parpadeo durante conexión
    Serial.print(".");
    intentos++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    digitalWrite(LED_PIN, HIGH);
    Serial.println("\n[WiFi] ✅ Conectado con éxito!");
    Serial.printf("[WiFi] IP Asignada : %s\n", WiFi.localIP().toString().c_str());
    Serial.printf("[WiFi] MAC Address : %s\n", WiFi.macAddress().c_str());
    Serial.printf("[WiFi] Intensidad  : %d dBm\n", WiFi.RSSI());
  } else {
    digitalWrite(LED_PIN, LOW);
    Serial.println("\n[WiFi] ⚠️ No se pudo conectar a la red WiFi. Se reintentará en el loop.");
  }
}

// ----------------------------------------------------------------------------
// 7. LOOP PRINCIPAL
// ----------------------------------------------------------------------------
void loop() {
  unsigned long now = millis();

  // Transmitir periódicamente según el intervalo configurado
  if (now - lastTransmitTime >= TRANSMIT_INTERVAL_MS) {
    lastTransmitTime = now;
    packetCounter++;

    // Generar muestras de señal y métricas para los 5 canales
    actualizarSenalesPrueba();

    // Construir JSON y enviar por WiFi
    String jsonPayload = construirPayloadJSON();
    enviarTelemetriaPorWiFi(jsonPayload);
  }

  delay(20);
}
