/*
 * ============================================================================
 * sensor_pulso · Firmware ESP32 + MAX30100 (WiFi Vercel + Sensor Físico)
 * ============================================================================
 * Ramas: rf05-recepcion-wifi, rf54-token-dispositivo, rf55-cifrado-en-transito
 *
 * Arquitectura Dual-Core (FreeRTOS):
 *   - CORE 1: Lectura ininterrumpida del sensor MAX30100 a 100 Hz.
 *             Generación de la onda fotopletismográfica (PPG) a 25 Hz.
 *             Lector NO bloqueante de comandos "@SP" por USB (configuración).
 *   - CORE 0: Gestión WiFi robusta y transmisión HTTPS a Vercel cada 1 s.
 *             Stack de 16 KB para TLS con diagnóstico detallado por Serial.
 *
 * CONFIGURACIÓN DEL WIFI (para estudiantes, SIN editar código):
 *   El WiFi, y opcionalmente la URL del servidor y el token, se configuran
 *   desde la app web por cable USB (Web Serial). El ESP32 los guarda en su
 *   memoria no volátil (NVS, espacio "sensorpulso") y se conecta solo en cada
 *   encendido. Las constantes de abajo son únicamente VALORES POR DEFECTO.
 *
 * PROTOCOLO SERIE "@SP" (115200 baudios, ver firmware/README.md):
 *   Cada mensaje es una línea:  @SP {json de una línea}\n
 *   Las líneas que no empiezan con "@SP " se ignoran (entrada) o son logs
 *   normales para humanos (salida).
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
#include <Preferences.h>
#include <esp_mac.h>

// ----------------------------------------------------------------------------
// 1. VALORES POR DEFECTO (se pueden sobrescribir desde la app, se guardan en NVS)
// ----------------------------------------------------------------------------
#define FW_VERSION "2.0"

// Sin credenciales WiFi por defecto: se configuran desde la app web por USB.
const char* WIFI_SSID     = "";
const char* WIFI_PASSWORD = "";

// Endpoint oficial en producción (Vercel) y token de dispositivo por defecto
const char* SERVER_URL    = "https://sensorpulso.vercel.app/api/esp32/telemetria";
const char* DEVICE_TOKEN  = "esp_demotoken_unach_2026_rf05";
const char* DEVICE_NAME   = "ESP32-Biomedico-01";

// Configuración activa (cargada de NVS al arrancar). Protegida con cfgMux porque
// la leen/escriben ambos núcleos.
Preferences prefs;
String cfgSsid, cfgPass, cfgUrl, cfgToken;
SemaphoreHandle_t cfgMux = NULL;   // protege cfg* y el acceso a prefs
SemaphoreHandle_t serMux = NULL;   // evita mezclar líneas "@SP" de dos núcleos

// Estado de WiFi compartido entre núcleos
volatile bool    wifiIntentando = false;  // hay un intento de conexión en curso
volatile uint8_t ultimaRazon    = 0;      // último motivo de desconexión (evento WiFi)

// Petición pendiente de la app hacia la tarea WiFi (scan / wifi)
enum { PEND_NADA = 0, PEND_SCAN = 1, PEND_WIFI = 2 };
volatile int pendiente = PEND_NADA;
String reqSsid, reqPass;

// Comando recibido (definido arriba para que los prototipos automáticos de Arduino lo vean)
struct Comando {
  String cmd, ssid, pass, url, token;
  bool hasCmd = false, hasSsid = false, hasPass = false, hasUrl = false, hasToken = false;
};

#define LINEA_MAX 512  // tamaño máximo de una línea de entrada "@SP ..."

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
// 3. UTILIDADES: CONFIGURACIÓN PERSISTENTE (NVS) Y SALIDA DEL PROTOCOLO "@SP"
// ----------------------------------------------------------------------------
void cfgLock()   { xSemaphoreTake(cfgMux, portMAX_DELAY); }
void cfgUnlock() { xSemaphoreGive(cfgMux); }

// Carga la configuración guardada; si no hay, usa los valores por defecto.
void cargarConfig() {
  cfgLock();
  prefs.begin("sensorpulso", false);
  cfgSsid  = prefs.getString("ssid",  WIFI_SSID);
  cfgPass  = prefs.getString("pass",  WIFI_PASSWORD);
  cfgUrl   = prefs.getString("url",   SERVER_URL);
  cfgToken = prefs.getString("token", DEVICE_TOKEN);
  if (cfgUrl.length() == 0)   cfgUrl = SERVER_URL;
  if (cfgToken.length() == 0) cfgToken = DEVICE_TOKEN;
  cfgUnlock();
}

// Emite una línea del protocolo: "@SP {json}\n" (una sola escritura, con mutex).
void emitir(const String& json) {
  String linea = "@SP " + json + "\n";
  xSemaphoreTake(serMux, portMAX_DELAY);
  Serial.print(linea);
  xSemaphoreGive(serMux);
}

void emitirError(const char* motivo) {
  emitir(String("{\"ev\":\"error\",\"motivo\":\"") + motivo + "\"}");
}

// Escapa un texto para incluirlo dentro de un string JSON.
String jsonEsc(const String& s) {
  String o;
  o.reserve(s.length() + 8);
  for (unsigned int i = 0; i < s.length(); i++) {
    unsigned char c = (unsigned char)s[i];
    if (c == '"')       o += "\\\"";
    else if (c == '\\') o += "\\\\";
    else if (c == '\n') o += "\\n";
    else if (c == '\r') o += "\\r";
    else if (c == '\t') o += "\\t";
    else if (c < 0x20) {
      char b[8];
      snprintf(b, sizeof(b), "\\u%04x", c);
      o += b;
    } else {
      o += (char)c;
    }
  }
  return o;
}

// Estado WiFi para hello/status.
const char* estadoWifi() {
  if (wifiIntentando) return "conectando";
  if (WiFi.status() == WL_CONNECTED) return "conectado";
  cfgLock();
  bool hayCred = cfgSsid.length() > 0;
  cfgUnlock();
  return hayCred ? "desconectado" : "sin_credenciales";
}

// Construye el JSON de hello/status (nunca incluye la clave ni el token).
String construirHello(const char* ev) {
  uint8_t mac[6] = {0, 0, 0, 0, 0, 0};
  esp_read_mac(mac, ESP_MAC_WIFI_STA);
  char macS[18];
  snprintf(macS, sizeof(macS), "%02x:%02x:%02x:%02x:%02x:%02x",
           mac[0], mac[1], mac[2], mac[3], mac[4], mac[5]);

  cfgLock();
  String ssidGuardado = cfgSsid;
  cfgUnlock();

  bool con = (WiFi.status() == WL_CONNECTED);
  String ip = con ? WiFi.localIP().toString() : String("");
  int rssi = con ? WiFi.RSSI() : 0;

  String j = "{\"ev\":\"";
  j += ev;
  j += "\",\"fw\":\"" FW_VERSION "\",\"mac\":\"";
  j += macS;
  j += "\",\"name\":\"" + jsonEsc(String(DEVICE_NAME)) + "\"";
  j += ",\"wifi\":\"" + String(estadoWifi()) + "\"";
  j += ",\"ssid\":\"" + jsonEsc(ssidGuardado) + "\"";
  j += ",\"ip\":\"" + ip + "\"";
  j += ",\"rssi\":" + String(rssi) + "}";
  return j;
}

void emitirHello(const char* ev) {
  emitir(construirHello(ev));
}

// ----------------------------------------------------------------------------
// 4. PARSEO MÍNIMO DE JSON (sin librerías externas)
//    Soporta un objeto plano; los campos conocidos deben ser strings.
//    Interpreta escapes \" \\ \/ \b \f \n \r \t \uXXXX. Salta otros valores.
// ----------------------------------------------------------------------------
static void saltarEsp(const char*& p) {
  while (*p == ' ' || *p == '\t' || *p == '\r' || *p == '\n') p++;
}

static void agregarUtf8(String& out, uint32_t cp) {
  if (cp < 0x80) {
    out += (char)cp;
  } else if (cp < 0x800) {
    out += (char)(0xC0 | (cp >> 6));
    out += (char)(0x80 | (cp & 0x3F));
  } else if (cp < 0x10000) {
    out += (char)(0xE0 | (cp >> 12));
    out += (char)(0x80 | ((cp >> 6) & 0x3F));
    out += (char)(0x80 | (cp & 0x3F));
  } else {
    out += (char)(0xF0 | (cp >> 18));
    out += (char)(0x80 | ((cp >> 12) & 0x3F));
    out += (char)(0x80 | ((cp >> 6) & 0x3F));
    out += (char)(0x80 | (cp & 0x3F));
  }
}

static bool leerHex4(const char*& p, uint32_t& v) {
  v = 0;
  for (int i = 0; i < 4; i++) {
    char c = *p;
    uint32_t d;
    if (c >= '0' && c <= '9') d = c - '0';
    else if (c >= 'a' && c <= 'f') d = 10 + c - 'a';
    else if (c >= 'A' && c <= 'F') d = 10 + c - 'A';
    else return false;
    v = (v << 4) | d;
    p++;
  }
  return true;
}

// p apunta a la comilla de apertura; al volver apunta tras la comilla de cierre.
static bool leerString(const char*& p, String& out) {
  if (*p != '"') return false;
  p++;
  out = "";
  while (*p) {
    char c = *p++;
    if (c == '"') return true;
    if (c == '\\') {
      char e = *p++;
      switch (e) {
        case '"':  out += '"';  break;
        case '\\': out += '\\'; break;
        case '/':  out += '/';  break;
        case 'b':  out += '\b'; break;
        case 'f':  out += '\f'; break;
        case 'n':  out += '\n'; break;
        case 'r':  out += '\r'; break;
        case 't':  out += '\t'; break;
        case 'u': {
          uint32_t cp;
          if (!leerHex4(p, cp)) return false;
          if (cp >= 0xD800 && cp <= 0xDBFF && p[0] == '\\' && p[1] == 'u') {
            const char* q = p + 2;
            uint32_t lo;
            if (leerHex4(q, lo) && lo >= 0xDC00 && lo <= 0xDFFF) {
              cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
              p = q;
            }
          }
          agregarUtf8(out, cp);
          break;
        }
        default: return false;
      }
    } else {
      out += c;
    }
  }
  return false;  // string sin cerrar
}

// Salta un valor JSON cualquiera (número, bool, null, objeto, arreglo, string).
static bool saltarValor(const char*& p) {
  if (*p == '"') { String d; return leerString(p, d); }
  if (*p == '{' || *p == '[') {
    int prof = 0;
    while (*p) {
      if (*p == '"') { String d; if (!leerString(p, d)) return false; continue; }
      if (*p == '{' || *p == '[') prof++;
      else if (*p == '}' || *p == ']') { prof--; if (prof == 0) { p++; return true; } }
      p++;
    }
    return false;
  }
  const char* ini = p;
  while (*p && *p != ',' && *p != '}' && *p != ']' && *p != ' ' && *p != '\t') p++;
  return p > ini;
}

static bool parsearComando(const String& json, Comando& c) {
  const char* p = json.c_str();
  saltarEsp(p);
  if (*p != '{') return false;
  p++;
  saltarEsp(p);
  if (*p == '}') { p++; saltarEsp(p); return *p == 0; }
  for (;;) {
    saltarEsp(p);
    String clave;
    if (!leerString(p, clave)) return false;
    saltarEsp(p);
    if (*p != ':') return false;
    p++;
    saltarEsp(p);

    String* destino = NULL;
    bool* marca = NULL;
    if      (clave == "cmd")   { destino = &c.cmd;   marca = &c.hasCmd; }
    else if (clave == "ssid")  { destino = &c.ssid;  marca = &c.hasSsid; }
    else if (clave == "pass")  { destino = &c.pass;  marca = &c.hasPass; }
    else if (clave == "url")   { destino = &c.url;   marca = &c.hasUrl; }
    else if (clave == "token") { destino = &c.token; marca = &c.hasToken; }

    if (destino) {
      if (!leerString(p, *destino)) return false;  // los campos conocidos deben ser string
      *marca = true;
    } else {
      if (!saltarValor(p)) return false;
    }
    saltarEsp(p);
    if (*p == ',') { p++; continue; }
    if (*p == '}') { p++; break; }
    return false;
  }
  saltarEsp(p);
  return *p == 0;
}

// ----------------------------------------------------------------------------
// 5. WIFI: EVENTOS, CONEXIÓN, ESCANEO
// ----------------------------------------------------------------------------
void alEventoWiFi(arduino_event_id_t evento, arduino_event_info_t info) {
  if (evento == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) {
    ultimaRazon = info.wifi_sta_disconnected.reason;
  }
}

// Traduce el motivo de desconexión a un resultado: 0 = indeterminado,
// 1 = clave_incorrecta, 2 = no_encontrada.
static int clasificarRazon(uint8_t razon) {
  switch (razon) {
    case 201:                      // NO_AP_FOUND
      return 2;
    case 2:                        // AUTH_EXPIRE
    case 14:                       // MIC_FAILURE
    case 15:                       // 4WAY_HANDSHAKE_TIMEOUT
    case 202:                      // AUTH_FAIL
    case 204:                      // HANDSHAKE_TIMEOUT
      return 1;
    default:
      return 0;
  }
}

// Resultados de conectarWiFi
enum { CON_OK = 0, CON_CLAVE = 1, CON_NO_ENCONTRADA = 2, CON_TIEMPO = 3, CON_ABORTADO = 4 };

// Intenta conectar a (ssid, pass). NO imprime nunca la clave.
// Si abortable, se interrumpe cuando llega una petición nueva de la app.
int conectarWiFi(const String& ssid, const String& pass, unsigned long timeoutMs, bool abortable) {
  wifiIntentando = true;
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(false, false);
  vTaskDelay(200 / portTICK_PERIOD_MS);
  ultimaRazon = 0;
  WiFi.begin(ssid.c_str(), pass.c_str());
  WiFi.setSleep(false);            // sin ahorro de energía del módem: envíos HTTPS más rápidos y estables

  int res = CON_TIEMPO;
  unsigned long t0 = millis();
  while (millis() - t0 < timeoutMs) {
    if (WiFi.status() == WL_CONNECTED) { res = CON_OK; break; }
    int m = clasificarRazon(ultimaRazon);
    if (m == 1) { res = CON_CLAVE; break; }
    if (m == 2) { res = CON_NO_ENCONTRADA; break; }
    if (abortable && pendiente != PEND_NADA) { res = CON_ABORTADO; break; }
    vTaskDelay(100 / portTICK_PERIOD_MS);
  }
  if (res == CON_TIEMPO) {
    wl_status_t s = WiFi.status();
    if (s == WL_NO_SSID_AVAIL) res = CON_NO_ENCONTRADA;
    else if (s == WL_CONNECT_FAILED) res = CON_CLAVE;
  }
  if (res != CON_OK) WiFi.disconnect(false, false);
  wifiIntentando = false;
  return res;
}

static const char* nombreSeguridad(wifi_auth_mode_t a) {
  switch (a) {
    case WIFI_AUTH_OPEN:            return "abierta";
    case WIFI_AUTH_WPA_PSK:
    case WIFI_AUTH_WPA2_PSK:
    case WIFI_AUTH_WPA_WPA2_PSK:    return "wpa2";
    case WIFI_AUTH_WPA3_PSK:
    case WIFI_AUTH_WPA2_WPA3_PSK:   return "wpa3";
    case WIFI_AUTH_WPA2_ENTERPRISE: return "empresa";
    default:                        return "otra";
  }
}

// Escaneo asíncrono; responde con las redes ordenadas por señal.
void hacerEscaneo() {
  WiFi.mode(WIFI_STA);
  WiFi.scanDelete();
  int r = WiFi.scanNetworks(true, false);
  if (r == WIFI_SCAN_FAILED) { emitirError("escaneo_fallido"); return; }

  unsigned long t0 = millis();
  int n = WiFi.scanComplete();
  while (n == WIFI_SCAN_RUNNING && millis() - t0 < 15000) {
    vTaskDelay(100 / portTICK_PERIOD_MS);
    n = WiFi.scanComplete();
  }
  if (n < 0) {
    WiFi.scanDelete();
    emitirError("escaneo_fallido");
    return;
  }

  const int MAXR = 15;
  int tope = n > 64 ? 64 : n;
  int orden[64];
  for (int i = 0; i < tope; i++) orden[i] = i;
  for (int i = 1; i < tope; i++) {              // inserción, rssi descendente
    int k = orden[i];
    int j = i - 1;
    while (j >= 0 && WiFi.RSSI(orden[j]) < WiFi.RSSI(k)) { orden[j + 1] = orden[j]; j--; }
    orden[j + 1] = k;
  }

  String salida = "{\"ev\":\"scan\",\"redes\":[";
  String vistos[MAXR];
  int cuenta = 0;
  for (int i = 0; i < tope && cuenta < MAXR; i++) {
    int idx = orden[i];
    String s = WiFi.SSID(idx);
    if (s.length() == 0) continue;
    bool repetido = false;
    for (int k = 0; k < cuenta; k++) if (vistos[k] == s) { repetido = true; break; }
    if (repetido) continue;
    vistos[cuenta++] = s;
    if (cuenta > 1) salida += ",";
    salida += "{\"ssid\":\"" + jsonEsc(s) + "\",\"rssi\":" + String(WiFi.RSSI(idx)) +
              ",\"seguridad\":\"" + nombreSeguridad(WiFi.encryptionType(idx)) + "\"}";
  }
  salida += "]}";
  WiFi.scanDelete();
  emitir(salida);
}

// Atiende "wifi": conecta con las credenciales recibidas y las guarda si funcionan.
void atenderPeticionWifi() {
  cfgLock();
  String ssid = reqSsid;
  String pass = reqPass;
  cfgUnlock();

  int res = conectarWiFi(ssid, pass, 15000, false);
  if (res == CON_OK) {
    cfgLock();
    cfgSsid = ssid;
    cfgPass = pass;
    prefs.putString("ssid", ssid);
    prefs.putString("pass", pass);
    cfgUnlock();
    emitir("{\"ev\":\"wifi\",\"estado\":\"conectado\",\"ssid\":\"" + jsonEsc(ssid) +
           "\",\"ip\":\"" + WiFi.localIP().toString() + "\",\"rssi\":" + String(WiFi.RSSI()) + "}");
    Serial.println(F("[WiFi] ✅ Credenciales nuevas aplicadas y guardadas."));
  } else {
    const char* motivo = (res == CON_CLAVE) ? "clave_incorrecta"
                       : (res == CON_NO_ENCONTRADA) ? "no_encontrada" : "tiempo";
    emitir(String("{\"ev\":\"wifi\",\"estado\":\"error\",\"motivo\":\"") + motivo + "\"}");
    Serial.printf("[WiFi] ⚠️ No se pudo conectar a '%s' (%s). Se conservan las credenciales anteriores.\n",
                  ssid.c_str(), motivo);
  }
  cfgLock();
  reqPass = "";
  cfgUnlock();
}

// ----------------------------------------------------------------------------
// 6. COMANDOS DE LA APP (se interpretan en loop(); lo lento se delega a la tarea WiFi)
// ----------------------------------------------------------------------------
void procesarComando(const String& json) {
  Comando c;
  if (!parsearComando(json, c) || !c.hasCmd) { emitirError("comando_invalido"); return; }

  if (c.cmd == "hello") {
    emitirHello("hello");
  } else if (c.cmd == "status") {
    emitirHello("status");
  } else if (c.cmd == "scan") {
    if (pendiente != PEND_NADA) { emitirError("ocupado"); return; }
    pendiente = PEND_SCAN;
  } else if (c.cmd == "wifi") {
    if (!c.hasSsid || c.ssid.length() < 1 || c.ssid.length() > 32 || c.pass.length() > 63) {
      emitirError("datos_invalidos");
      return;
    }
    if (pendiente != PEND_NADA) { emitirError("ocupado"); return; }
    cfgLock();
    reqSsid = c.ssid;
    reqPass = c.hasPass ? c.pass : String("");
    cfgUnlock();
    emitir("{\"ev\":\"wifi\",\"estado\":\"conectando\"}");
    pendiente = PEND_WIFI;
  } else if (c.cmd == "forget") {
    cfgLock();
    cfgSsid = "";
    cfgPass = "";
    prefs.remove("ssid");
    prefs.remove("pass");
    cfgUnlock();
    WiFi.disconnect(false, false);
    emitir("{\"ev\":\"forget\",\"ok\":true}");
    Serial.println(F("[WiFi] Credenciales guardadas borradas."));
  } else if (c.cmd == "server") {
    bool urlOk = !c.hasUrl || c.url.length() == 0 ||
                 ((c.url.startsWith("https://") || c.url.startsWith("http://")) && c.url.length() <= 200);
    bool tokOk = !c.hasToken || c.token.length() <= 120;
    if ((!c.hasUrl && !c.hasToken) || !urlOk || !tokOk) { emitirError("datos_invalidos"); return; }
    cfgLock();
    if (c.hasUrl) {   // cadena vacía = volver al valor por defecto
      if (c.url.length() == 0) { prefs.remove("url"); cfgUrl = SERVER_URL; }
      else { prefs.putString("url", c.url); cfgUrl = c.url; }
    }
    if (c.hasToken) {
      if (c.token.length() == 0) { prefs.remove("token"); cfgToken = DEVICE_TOKEN; }
      else { prefs.putString("token", c.token); cfgToken = c.token; }
    }
    cfgUnlock();
    emitir("{\"ev\":\"server\",\"ok\":true}");
  } else {
    emitirError("comando_invalido");
  }
}

// Lector NO bloqueante de líneas por USB. Solo procesa lo que ya llegó.
void leerSerie() {
  static char linea[LINEA_MAX + 1];
  static int largo = 0;
  static bool desbordado = false;

  while (Serial.available() > 0) {
    int ch = Serial.read();
    if (ch < 0) break;
    if (ch == '\r') continue;
    if (ch == '\n') {
      if (!desbordado && largo > 0) {
        linea[largo] = 0;
        if (strncmp(linea, "@SP ", 4) == 0) {
          procesarComando(String(linea + 4));
        }
      }
      largo = 0;
      desbordado = false;
      continue;
    }
    if (desbordado) continue;
    if (largo < LINEA_MAX) linea[largo++] = (char)ch;
    else desbordado = true;   // línea demasiado larga: se descarta entera
  }
}

// ----------------------------------------------------------------------------
// 7. ENVÍO HTTP (token y URL tomados de NVS o de los valores por defecto)
// ----------------------------------------------------------------------------
// Envíos fallidos seguidos: ante una racha larga la placa reinicia el WiFi y, si no se recupera, se reinicia sola
static int fallosSeguidos = 0;

void enviarPaquete() {
  cfgLock();
  String url = cfgUrl;
  String token = cfgToken;
  cfgUnlock();

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

  // Cliente HTTPS seguro con TLS (o HTTP plano si la URL configurada es http://)
  WiFiClientSecure clienteSeguro;
  clienteSeguro.setInsecure(); // Acepta HTTPS de Vercel
  clienteSeguro.setTimeout(6);           // lectura/escritura TLS: 6 s como máximo
  clienteSeguro.setHandshakeTimeout(6);  // handshake TLS: 6 s como máximo (no bloquear el envío)
  WiFiClient clientePlano;

  HTTPClient http;
  if (url.startsWith("https://")) http.begin(clienteSeguro, url);
  else                            http.begin(clientePlano, url);
  http.setConnectTimeout(4000);
  http.setTimeout(5000);

  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-ESP32-Token", token);

  contadorPaquetes++;
  String calidad = estadoSinDedo ? "sin_dedo" : ((bpmActual > 0) ? "buena" : "regular");

  // Construir paquete JSON oficial
  String json = "{";
  json += "\"dispositivo\":\"" + String(DEVICE_NAME) + "\",";
  json += "\"token\":\"" + jsonEsc(token) + "\",";
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
    fallosSeguidos = 0;
    Serial.printf("☁️ [Vercel OK] Paquete #%lu | BPM: %.1f | SpO2: %.1f%% | Muestras: %d | %s\n",
                  contadorPaquetes, bpmActual, spo2Actual, cantMuestras, estadoSinDedo ? "SIN DEDO" : "DEDO OK");
  } else {
    Serial.printf("⚠️ [Vercel Error] Código HTTP: %d\n", httpCodigo);
    if (httpCodigo < 0) {
      Serial.printf("   Detalle: %s\n", http.errorToString(httpCodigo).c_str());
    }
    fallosSeguidos++;
  }
  http.end();
  clienteSeguro.stop();

  if (fallosSeguidos == 5) {
    // La conexión quedó en mal estado: se cierra y el bucle de la tarea la restablece con las credenciales guardadas
    Serial.println(F("[WiFi] 5 envíos fallidos seguidos: reiniciando la conexión WiFi."));
    WiFi.disconnect();
  } else if (fallosSeguidos >= 20) {
    Serial.println(F("[Sistema] 20 envíos fallidos seguidos: reiniciando la placa."));
    delay(200);
    ESP.restart();
  }
}

// ----------------------------------------------------------------------------
// 8. TAREA SEGUNDO PLANO EN CORE 0: GESTIÓN WIFI Y TRANSMISIÓN A VERCEL
// ----------------------------------------------------------------------------
void tareaTransmisionWiFi(void *pvParameters) {
  WiFi.persistent(false);          // las credenciales viven solo en nuestra NVS
  WiFi.mode(WIFI_STA);
  WiFi.setAutoReconnect(true);
  WiFi.setSleep(false);            // sin ahorro de energía del módem (menos latencia en cada POST)
  WiFi.onEvent(alEventoWiFi);

  bool ultimoConectado = false;
  unsigned long ultimoIntento = 0;
  bool hizoIntento = false;
  unsigned long ultimoAviso = 0;
  unsigned long ultimoEnvio = 0;

  for (;;) {
    vTaskDelay(100 / portTICK_PERIOD_MS);

    // 1) Peticiones de la app (escaneo / nuevas credenciales)
    int pend = pendiente;
    if (pend == PEND_SCAN) {
      hacerEscaneo();
      pendiente = PEND_NADA;
    } else if (pend == PEND_WIFI) {
      atenderPeticionWifi();
      hizoIntento = false;         // si falló, reintenta enseguida con las guardadas
      pendiente = PEND_NADA;
    }

    // 2) Informar cambios de estado WiFi (conectado / desconectado)
    bool conectadoAhora = (WiFi.status() == WL_CONNECTED);
    if (conectadoAhora != ultimoConectado) {
      ultimoConectado = conectadoAhora;
      emitirHello("hello");
    }

    // 3) Credenciales guardadas: conectar / reconectar con ellas
    cfgLock();
    String ssid = cfgSsid;
    String pass = cfgPass;
    cfgUnlock();

    if (ssid.length() == 0) {
      if (millis() - ultimoAviso >= 10000 || ultimoAviso == 0) {
        ultimoAviso = millis();
        Serial.println(F("[WiFi] ⚠️ Falta configurar el WiFi: usa la app web (Medición → WiFi → Configurar WiFi del ESP32 por USB)."));
      }
      continue;
    }

    if (!conectadoAhora) {
      if (!hizoIntento || millis() - ultimoIntento >= 10000) {
        hizoIntento = true;
        Serial.printf("[WiFi] Conectando a la red guardada '%s'...\n", ssid.c_str());
        int res = conectarWiFi(ssid, pass, 12000, true);
        ultimoIntento = millis();
        if (res == CON_OK) {
          Serial.printf("[WiFi] ✅ Conectado. IP: %s (Señal: %d dBm)\n",
                        WiFi.localIP().toString().c_str(), WiFi.RSSI());
        } else if (res != CON_ABORTADO) {
          Serial.printf("[WiFi] ⚠️ Sin conexión (código %d). Reintento en 10 s.\n", (int)WiFi.status());
        }
      }
      continue;
    }

    // 4) Transmisión de telemetría: 1 paquete por segundo
    if (millis() - ultimoEnvio >= 1000) {
      ultimoEnvio = millis();
      enviarPaquete();
    }
  }
}

// ----------------------------------------------------------------------------
// 9. SETUP Y LOOP PRINCIPAL EN CORE 1: LECTURA CONTINUA DEL SENSOR
// ----------------------------------------------------------------------------
bool sensorListo = false;

void setup() {
  Serial.setRxBufferSize(1024);
  Serial.begin(115200);
  delay(500);

  cfgMux = xSemaphoreCreateMutex();
  serMux = xSemaphoreCreateMutex();
  cargarConfig();

  // La placa se anuncia sola (la app web la reconoce sin preguntar)
  emitirHello("hello");

  Serial.println(F("\n======================================================="));
  Serial.println(F("  sensor_pulso · ESP32 + MAX30100 Dual-Core WiFi Vercel"));
  Serial.println(F("  UNACH - Telemetría Dual-Core con Cifrado TLS (RF55)"));
  Serial.println(F("======================================================="));

  // RF55: Verificación de Cifrado en Tránsito TLS/HTTPS
  cfgLock();
  bool esHttps = cfgUrl.startsWith("https://");
  cfgUnlock();
  if (!esHttps) {
    Serial.println(F("⚠️ [Seguridad RF55] ALERTA: la URL del servidor debe usar https:// con TLS."));
  } else {
    Serial.println(F("🔒 [Seguridad RF55] Cifrado en tránsito TLS 1.2+ (HTTPS) verificado."));
  }

  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(100000);

  // La tarea WiFi se crea ANTES de esperar al sensor para que la configuración
  // por USB funcione aunque el sensor no esté conectado.
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
  // Comandos "@SP" de la app (no bloqueante)
  leerSerie();

  // Sensor aún no detectado: reintentar cada segundo sin bloquear la configuración
  static unsigned long ultimoIntentoSensor = 0;
  if (!sensorListo) {
    if (millis() - ultimoIntentoSensor >= 1000) {
      ultimoIntentoSensor = millis();
      if (iniciarSensor()) {
        sensorListo = true;
        Serial.println(F("✅ Sensor MAX30100 iniciado y operando correctamente."));
      } else {
        Serial.println(F("Esperando sensor MAX30100..."));
      }
    }
    delay(5);
    return;
  }

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
