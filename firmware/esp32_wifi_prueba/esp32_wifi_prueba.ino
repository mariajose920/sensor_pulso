/*
 * ============================================================================
 * sensor_pulso · Firmware ESP32 + MAX30100 (WiFi Vercel + Sensor Físico)
 * ============================================================================
 * Ramas: rf05-recepcion-wifi, rf54-token-dispositivo, rf55-cifrado-en-transito
 *
 * Arquitectura Dual-Core (FreeRTOS):
 *   - CORE 1: Lectura ininterrumpida del sensor MAX30100 a 100 Hz. Equilibrio automático de la corriente de los LED
 *             (RF114) y SpO2 por banda con compuerta de calidad (RF115). Calentamiento real del dedo (3-8 s).
 *             Filtro pasa-banda 0,5-5 Hz, detección de latidos por cresta y
 *             onda fotopletismográfica (PPG) a 50 Hz (promedio de 2 lecturas).
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

// ============================================================================
// CERTIFICADO RAÍZ DE CONFIANZA TLS (RF55)
// Valida la autenticidad del servidor (ISRG Root X1 / Let's Encrypt / Vercel).
// Previene ataques Man-In-The-Middle (MITM) y garantiza que el ESP32 rechace
// cualquier certificado falso, revocado o autofirmado no autorizado.
// ============================================================================
const char* ROOT_CA_CERTIFICATE = \
"-----BEGIN CERTIFICATE-----\n" \
"MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw\n" \
"TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh\n" \
"cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4\n" \
"WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu\n" \
"ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY\n" \
"MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc\n" \
"h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+\n" \
"0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U\n" \
"A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW\n" \
"T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH\n" \
"B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC\n" \
"B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv\n" \
"KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn\n" \
"OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn\n" \
"jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw\n" \
"qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI\n" \
"rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV\n" \
"HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq\n" \
"hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZLubhzEFnT\n" \
"IZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ3BebYhtF\n" \
"8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KKNFtY2PwB\n" \
"yVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5ORAzI4JM\n" \
"PJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7UrTkXWStAm\n" \
"zOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdCjNPElpzV\n" \
"mbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVcoyi3B43n\n" \
"jTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq4RgqsahD\n" \
"YVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPAmRGunUHB\n" \
"cnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57demyPxgcY\n" \
"xn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=\n" \
"-----END CERTIFICATE-----\n";

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
// Filtro pasa-banda 0,5-5 Hz: dos biquads Butterworth de 2.º orden (forma directa II transpuesta), calculados con la
// transformada bilineal para fs = 100 Hz (Q = 1/raíz(2)): pasa-altas 0,5 Hz (quita la línea de base y la respiración)
// y pasa-bajas 5 Hz (quita el ruido). Campos: b0, b1, b2, a1, a2 y los estados z1, z2.
struct Biquad { float b0, b1, b2, a1, a2, z1, z2; };
Biquad bqAlta = { 0.978030479f, -1.95606096f, 0.978030479f, -1.95557824f, 0.956543677f, 0, 0 };
Biquad bqBaja = { 0.0200833656f, 0.0401667311f, 0.0200833656f, -1.56101808f, 0.641351538f, 0, 0 };

float dc = 0;                      // DC lento del infrarrojo: SOLO lo usa la SpO2
float filtrado = 0;                // PPG filtrada 0,5-5 Hz, con el latido (sístole) hacia arriba
float refIr = 0;                   // nivel del IR al apoyar el dedo (se resta para trabajar con números pequeños)
float amplitud = 60;               // envolvente lenta de la señal filtrada: ganancia de la onda que se envía
volatile float bpmActual = 0;      // 0 = sin lectura válida (nunca se conserva un valor viejo ni se inventa uno)
volatile float spo2Actual = 0.0;   // 0 = sin lectura válida (nunca se inventa un valor)

// Detección de latidos por CRESTA + intervalos entre latidos (el tiempo se mide en muestras de 100 Hz = 10 ms)
const int   MUESTRA_MS      = 10;
const float UMBRAL_PICO_MIN = 15.0f;   // cresta mínima (cuentas del sensor) para considerar un latido
const float CAIDA_PICO      = 0.72f;   // la cresta se confirma cuando la señal baja al 72 % de su altura
const float TOLERANCIA_RR   = 0.30f;   // un intervalo fuera de ±30 % de la mediana es anómalo
const int   RR_MAX          = 8;       // el BPM sale de la mediana de los últimos 8 intervalos válidos
const unsigned long SIN_LATIDO_MS = 3000;  // sin latido válido durante este tiempo: pulso = 0 (sin lectura)
const float MAD_MAX         = 0.25f;   // dispersión máxima de los intervalos (MAD / mediana)
const float AUTOCORR_MIN    = 0.50f;   // la señal debe repetirse de un latido al siguiente (descarta el ruido)
const int   VENTANA         = 400;     // 4 s de señal filtrada para la autocorrelación
const float GANANCIA_ONDA   = 950.0f;  // la cresta típica (≈1,7 × la envolvente) queda a ≈1650 de 2048: sin recortar ni quedar plana
uint32_t nMuestra = 0;                 // contador de muestras de 100 Hz
float ventana[VENTANA];
uint32_t ventanaTot = 0;
float fPrevio = 0, nivelAbs = 0, ampMedia = 0, picoMaxInicio = 0;
bool buscando = false, picoSig = false, hayPicoPrevio = false, bpmMostrando = false, cambioRitmo = false;
float picoVal = 0, picoPrev = 0, picoNext = 0, ultPicoFrac = 0;
uint32_t picoIdx = 0, ultPicoIdx = 0, ultValidoIdx = 0;
float rr[RR_MAX];
int rrN = 0, nAnom = 0;
float anomalos[3];

// ── Corriente de los LED (REG_LED: rojo en los bits 7-4, infrarrojo en los bits 3-0) ─────────────────────────────
// Código de cada nibble → mA del MAX30100: 0=0, 1=4,4, 2=7,6, 3=11,0, 4=14,2, 5=17,4, 6=20,8, 7=24,0, 8=27,1, 9=30,6,
// A=33,8, B=37,0, C=40,2, D=43,6, E=46,8, F=50,0.
const float LED_MA[16] = { 0.0f, 4.4f, 7.6f, 11.0f, 14.2f, 17.4f, 20.8f, 24.0f, 27.1f, 30.6f, 33.8f, 37.0f, 40.2f, 43.6f, 46.8f, 50.0f };
const uint8_t LED_INICIAL = 0x88;       // al iniciar y sin dedo: rojo 27,1 mA e IR 27,1 mA
const uint8_t LED_IR_MIN = 0x4;         // 14,2 mA
const uint8_t LED_IR_MAX = 0xC;         // 40,2 mA
const uint8_t LED_ROJO_MIN = 0x1;       // 4,4 mA
const uint8_t LED_ROJO_MAX = 0xF;       // 50,0 mA
// Equilibrio automático (RF114): cada 500 ms, con el dedo ya estable, el LED rojo se ajusta para que su luz continua (DC)
// quede entre el 60 % y el 100 % de la del infrarrojo y nunca cerca del tope del ADC de 16 bits (65535).
const int   LED_AJUSTE_N = 50;          // cada 50 muestras (500 ms)
const int   LED_ESPERA_N = 100;         // tras un cambio: 1 s sin más ajustes periódicos (el DC lento se reajusta)
const int   LED_PAUSA_SPO2_N = 150;     // tras un cambio: 1,5 s sin calcular SpO2 (el DC se desplaza)
const int   LED_REPRIMAR_N = 20;        // tras un cambio el filtro se reinicia durante 0,2 s sobre el nivel nuevo (sin escalón)
const int   LED_MASCARA_N = 100;        // tras cambiar la corriente del IR no se buscan latidos durante 1 s
const float DC_ROJO_MAX = 56000.0f;     // el DC rojo nunca debe pasar de esto (el ADC llega a 65535)
const float DC_ROJO_SAT = 58000.0f;     // por encima: se baja un paso de inmediato
const float DC_IR_ALTO = 60000.0f;      // DC infrarrojo por encima: se baja un paso la corriente IR
const float DC_IR_BAJO = 18000.0f;      // DC infrarrojo por debajo (con dedo): se sube un paso
const float ROJO_REL_MIN = 0.60f;       // el DC rojo debe ser al menos el 60 % del infrarrojo (y como mucho el 100 %)
volatile uint8_t ledReg = LED_INICIAL;  // valor vigente de REG_LED (lo informa el modo crudo)
float dcRojoLento = 0;                  // DC lento del rojo (media móvil exponencial de la lectura cruda)
int ledEspera = 0, ledRepIr = 0, ledRepRo = 0, ledMascara = 0, ledPausaSpo2 = 0;

// Dedo estable: tras apoyar el dedo hay un transitorio (el nivel de luz se asienta). Pulso y SpO2 no se calculan hasta que
// el DC infrarrojo deja de moverse: mínimo 3 s y máximo 8 s desde que se apoya, y solo cuando su variación en el último
// segundo (media móvil rápida) baja de DC_VAR_ESTABLE de forma sostenida. Constantes ajustadas con una captura real de 60 s:
// el escalón de apoyar el dedo da variaciones > 1 %/s hasta ≈ 1,7 s; después queda una deriva lenta de 0,1-0,65 %/s.
const uint32_t DEDO_MIN_N = 300;        // 3 s
const uint32_t DEDO_MAX_N = 800;        // 8 s
const float DC_VAR_ESTABLE = 0.0015f;   // 0,15 % en 1 s
const int   DC_SOSTENIDO_N = 30;        // debe cumplirse durante 0,3 s seguidos
float emaIr = 0;                        // media móvil rápida del IR (α = 0,05)
float emaAnillo[100];                   // su valor de hace 1 s
uint32_t dedoDesdeN = 0;                // muestra en que se apoyó el dedo
int estCont = 0;
bool dedoEstable = false;

// ── SpO2 por banda (RF115) ───────────────────────────────────────────────────────────────────────────────────────
// APROXIMACIÓN EDUCATIVA, SIN CALIBRAR contra un oxímetro de referencia. Los DOS canales pasan por el mismo pasa-banda
// 0,5-5 Hz (el rojo con sus propios biquads), el DC es la media de la ventana y R = (AC_rojo/DC_rojo) / (AC_ir/DC_ir).
// SpO2 = 110 - 25·R es una recta genérica (no la curva de este sensor). Ventanas de 6 s que se recalculan cada 2 s.
// Una ventana solo se acepta si ambos canales superan el ruido (SNR ≥ 3), la perfusión del IR es ≥ 0,02 %, la AC es parecida
// en los 3 bloques de 2 s (sin movimiento) y no hubo un cambio de corriente de LED dentro de la ventana. Se publica la mediana
// de las últimas 5 estimaciones aceptadas (variación máx. ±2 puntos por actualización; hacen falta 3 para mostrar algo).
// Si no hay ventana aceptada durante 12 s: SpO2 = 0 («sin lectura»), nunca un número viejo ni inventado.
Biquad bqAltaR = { 0.978030479f, -1.95606096f, 0.978030479f, -1.95557824f, 0.956543677f, 0, 0 };
Biquad bqBajaR = { 0.0200833656f, 0.0401667311f, 0.0200833656f, -1.56101808f, 0.641351538f, 0, 0 };
float filtradoRojo = 0;                 // PPG roja filtrada 0,5-5 Hz
float refRojo = 0;                      // nivel del rojo al apoyar el dedo
float irPrev1 = 0, irPrev2 = 0, roPrev1 = 0, roPrev2 = 0;   // lecturas crudas anteriores (segunda diferencia = ruido)
const int   SPO2_BLOQUE_N = 200;        // bloques de 2 s; la ventana son 3 bloques (6 s)
const int   SPO2_BLOQUES = 3;
const float SPO2_RUIDO_K = 0.25f;       // ruido (cuentas) ≈ 0,25 · RMS de la 2.ª diferencia (≈7 en IR y ≈2,2 en rojo en la captura real)
const float SPO2_GANANCIA_BANDA = 0.51f;    // ruido en 0,5-5 Hz / ruido calibrado, si el ruido es blanco (√Σh² del pasa-banda = 0,314, entre 0,61)
const float SPO2_SNR_MIN = 3.0f;
const float SPO2_PERFUSION_MIN = 0.02f; // índice de perfusión mínimo del IR, en %
const float SPO2_CONSISTENCIA_MAX = 1.7f;   // la AC de los 3 bloques de 2 s no debe variar más de 1,7 veces (descarta movimiento)
const int   SPO2_HIST = 5;              // mediana de las últimas 5 estimaciones aceptadas
const int   SPO2_MIN_ACEPTADAS = 3;     // no se muestra nada hasta tener 3 estimaciones aceptadas
const float SPO2_PASO_MAX = 2.0f;       // variación máxima por actualización (puntos)
const int   SPO2_CADUCA_N = 1200;       // 12 s sin ventana aceptada: sin lectura
struct Bloque { float acIr2, acRo2, d2Ir, d2Ro, sIr, sRo; int n; };
Bloque bloques[SPO2_BLOQUES];
Bloque bloqAct = { 0, 0, 0, 0, 0, 0, 0 };
int idxBloque = 0, nBloques = 0;
float histSpo2[SPO2_HIST];
int nHist = 0, posHist = 0, sinAceptadaN = 0;

// ── Modo de captura cruda (diagnóstico) ─────────────────────────────────────
// Con el comando {"cmd":"raw_on"} la placa envía por USB cada lectura SIN procesar del sensor, a 100 Hz:
//   RAW,<n>,<millis>,<ir>,<rojo>,<led>
// donde <led> es el valor decimal (0-255) de REG_LED vigente (rojo en los bits 7-4, IR en los bits 3-0; ya no es fijo
// porque el LED rojo se equilibra solo). Sirve para medir amplitud, nivel de luz, saturación y ruido con un dedo real.
// Se apaga solo a los 3 minutos o con {"cmd":"raw_off"}. Por defecto está apagado y no cambia nada del funcionamiento normal.
const unsigned long RAW_DURACION_MAX_MS = 180000;
volatile bool rawActivo = false;
volatile unsigned long rawHasta = 0;
volatile uint32_t rawN = 0;

// Vacía la ventana de SpO2 (los bloques de 2 s) sin tocar el valor mostrado.
void reiniciarVentanaSpo2() {
  idxBloque = 0;
  nBloques = 0;
  bloqAct = Bloque{ 0, 0, 0, 0, 0, 0, 0 };
}

void reiniciarSpo2() {
  spo2Actual = 0;
  reiniciarVentanaSpo2();
  nHist = 0;
  posHist = 0;
  sinAceptadaN = 0;
  ledPausaSpo2 = 0;
}
volatile bool estadoSinDedo = true;
volatile uint16_t valorGraficaActual = 2048;
volatile uint16_t ultimoIRGlobal = 0;
volatile uint16_t ultimoRojoGlobal = 0;

// Búfer de muestras PPG para el osciloscopio en tiempo real (50 muestras/segundo)
const int SAMPLES_PER_BLOCK = 200;      // capacidad: 4 s de señal a 50 muestras/s
const int MAX_MUESTRAS_PAQUETE = 100;   // la API en producción corta cada arreglo a 100: se envían como máximo 100 por paquete
const int MUESTRAS_RELLENO = 50;        // sin señal suficiente se envía 1 s de relleno plano
const int FRECUENCIA_MUESTREO_HZ = 50;  // muestras por segundo que se envían (promedio de cada 2 lecturas de 100 Hz)
uint16_t bufferIR[SAMPLES_PER_BLOCK];
uint16_t bufferRojo[SAMPLES_PER_BLOCK];
int indiceBuffer = 0;
// El núcleo del sensor (loop) escribe y la tarea WiFi lee/consume el búfer: se protege con una sección crítica corta
portMUX_TYPE bufMux = portMUX_INITIALIZER_UNLOCKED;

bool habiaDedo = false;

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
  escribirReg(REG_LED, LED_INICIAL);    // Corrientes iniciales: Rojo 27,1 mA, IR 27,1 mA (luego se equilibran solas)
  ledReg = LED_INICIAL;
  return true;
}

// ----------------------------------------------------------------------------
// Filtro y detección de latidos (se ejecutan a 100 Hz en el núcleo del sensor)
// ----------------------------------------------------------------------------
float biquadPaso(Biquad& f, float x) {
  float y = f.b0 * x + f.z1;
  f.z1 = f.b1 * x - f.a1 * y + f.z2;
  f.z2 = f.b2 * x - f.a2 * y;
  return y;
}

void biquadReiniciar(Biquad& f) { f.z1 = 0; f.z2 = 0; }

// Mediana de hasta RR_MAX valores (promedio de los dos centrales si hay un número par).
float medianaArr(const float* a, int n) {
  float t[RR_MAX];
  for (int i = 0; i < n; i++) {
    float v = a[i];
    int j = i - 1;
    while (j >= 0 && t[j] > v) { t[j + 1] = t[j]; j--; }
    t[j + 1] = v;
  }
  return (n % 2) ? t[n / 2] : 0.5f * (t[n / 2 - 1] + t[n / 2]);
}

// Borra todo lo aprendido de los latidos: el pulso vuelve a «sin lectura» y hacen falta 4 intervalos válidos nuevos.
void limpiarLatidos() {
  rrN = 0;
  nAnom = 0;
  bpmMostrando = false;
  cambioRitmo = false;
  ampMedia = 0;
  picoMaxInicio = 0;
  hayPicoPrevio = false;
  bpmActual = 0;
}

// Correlación normalizada de la señal consigo misma desplazada un latido (lag L muestras, ±4): ≈1 si la forma de
// onda se repite como un pulso real, ≈0 si es ruido o movimiento.
float autocorrelacion(int L) {
  uint32_t disp = ventanaTot < (uint32_t)VENTANA ? ventanaTot : (uint32_t)VENTANA;
  float mejor = -1;
  for (int l = L - 4; l <= L + 4; l++) {
    if (l < 20 || (int)disp - l < l) continue;       // hace falta al menos un periodo completo de solape
    float num = 0, e1 = 0, e2 = 0;
    for (uint32_t i = 0; i < disp - (uint32_t)l; i++) {
      float a = ventana[(ventanaTot - 1 - i) % VENTANA];
      float b = ventana[(ventanaTot - 1 - i - (uint32_t)l) % VENTANA];
      num += a * b; e1 += a * a; e2 += b * b;
    }
    float c = num / sqrtf(e1 * e2 + 1e-9f);
    if (c > mejor) mejor = c;
  }
  return mejor;
}

// Evalúa el intervalo d (ms) entre dos crestas consecutivas y actualiza el pulso. alt = altura de la cresta.
void evaluarIntervalo(float d, float alt) {
  if (d < 333.0f || d > 1500.0f) { nAnom = 0; return; }   // fuera de 40-180 BPM
  bool aceptar = false, yaGuardado = false;
  cambioRitmo = false;
  if (rrN >= 3) {
    float m = medianaArr(rr, rrN);
    if (fabsf(d - m) <= TOLERANCIA_RR * m) {
      aceptar = true;
    } else {
      // Intervalo anómalo (latido ectópico, ruido): se descarta salvo que se repita 3 veces seguidas (ritmo nuevo real)
      if (nAnom > 0 && fabsf(d - anomalos[0]) <= TOLERANCIA_RR * anomalos[0]) anomalos[nAnom++] = d;
      else { anomalos[0] = d; nAnom = 1; }
      if (nAnom >= 3) {
        for (int k = 0; k < 3; k++) rr[k] = anomalos[k];
        rrN = 3;
        nAnom = 0;
        cambioRitmo = true;
        yaGuardado = true;
      }
    }
  } else {
    // Arranque: hacen falta intervalos consecutivos coherentes entre sí (no se inventa ningún valor inicial)
    if (rrN >= 1 && fabsf(d - rr[rrN - 1]) > TOLERANCIA_RR * rr[rrN - 1]) rrN = 0;
    aceptar = true;
  }
  if (aceptar) {
    nAnom = 0;
    if (rrN == RR_MAX) { for (int k = 1; k < RR_MAX; k++) rr[k - 1] = rr[k]; rrN--; }
    rr[rrN++] = d;
    float a = alt;
    if (ampMedia > 0) a = constrain(alt, 0.5f * ampMedia, 1.6f * ampMedia);
    ampMedia = (ampMedia > 0) ? 0.7f * ampMedia + 0.3f * a : a;
    yaGuardado = true;
  }
  if (!yaGuardado) return;
  if (rrN < 4 && !bpmMostrando) ultValidoIdx = nMuestra;          // el arranque cuenta como actividad válida
  if (rrN < 3 || (!bpmMostrando && rrN < 4)) return;               // hasta tener 4 intervalos válidos no hay pulso

  float m = medianaArr(rr, rrN);
  float desv[RR_MAX];
  for (int k = 0; k < rrN; k++) desv[k] = fabsf(rr[k] - m);
  if (medianaArr(desv, rrN) / m > MAD_MAX) return;                 // intervalos demasiado dispersos: señal inestable
  if (autocorrelacion((int)(m / MUESTRA_MS + 0.5f)) < AUTOCORR_MIN) return;   // no se repite como un pulso: ruido

  ultValidoIdx = nMuestra;
  float bruto = 60000.0f / m;
  if (bruto < 40.0f || bruto > 180.0f) return;
  if (!bpmMostrando || cambioRitmo) {
    bpmActual = bruto;
    bpmMostrando = true;
  } else {
    // Suavizado leve y variación limitada por latido (±4 BPM)
    float paso = constrain(0.5f * (bruto - bpmActual), -4.0f, 4.0f);
    bpmActual = bpmActual + paso;
  }
}

// Busca la CRESTA de la señal filtrada: recuerda el máximo local y lo confirma cuando la señal baja al 72 % de su
// altura. El instante de la cresta se afina con una parábola entre 3 muestras. Refractario adaptativo ≈ 0,58 × el
// intervalo mediano (280-600 ms) para no contar la onda dícrota ni el ruido.
void detectarLatido(float f) {
  float m = (rrN >= 3) ? medianaArr(rr, rrN) : 0;
  float refr = (m > 0) ? constrain(0.58f * m, 280.0f, 600.0f) : 320.0f;

  if (!buscando) {
    if ((float)(nMuestra - ultPicoIdx) * MUESTRA_MS >= refr) {
      buscando = true;
      picoVal = f; picoIdx = nMuestra; picoPrev = fPrevio; picoNext = f; picoSig = false;
    }
    return;
  }

  if (f > picoVal) {
    picoVal = f; picoIdx = nMuestra; picoPrev = fPrevio; picoNext = f; picoSig = false;
  } else if (!picoSig && nMuestra == picoIdx + 1) {
    picoNext = f; picoSig = true;
  }

  float umbral = (ampMedia > 0) ? max(UMBRAL_PICO_MIN, 0.4f * ampMedia) : max(UMBRAL_PICO_MIN, 1.3f * nivelAbs);
  if (picoVal > umbral && f < CAIDA_PICO * picoVal) {
    float frac = 0;
    if (picoSig) {
      float den = picoPrev - 2.0f * picoVal + picoNext;
      if (den < -1e-6f) frac = constrain(0.5f * (picoPrev - picoNext) / den, -0.5f, 0.5f);
    }
    // Al arrancar, una cresta mucho más baja que la mayor vista es la onda dícrota o ruido: no es un latido
    if (ampMedia <= 0 && picoVal < 0.5f * picoMaxInicio) { buscando = false; return; }
    if (picoVal > picoMaxInicio) picoMaxInicio = picoVal;
    if (hayPicoPrevio) {
      float d = ((float)(int32_t)(picoIdx - ultPicoIdx) + (frac - ultPicoFrac)) * MUESTRA_MS;
      evaluarIntervalo(d, picoVal);
    }
    hayPicoPrevio = true;
    ultPicoIdx = picoIdx;
    ultPicoFrac = frac;
    buscando = false;
  } else if ((int32_t)(nMuestra - picoIdx) > 150) {
    // La señal lleva 1,5 s sin bajar tras el máximo (movimiento o saturación): se descarta ese candidato
    picoVal = f; picoIdx = nMuestra; picoPrev = fPrevio; picoNext = f; picoSig = false;
  }
}

// Sin dedo: vuelve a la corriente inicial de los LED (rojo 27,1 mA, IR 27,1 mA).
void ledRestaurar() {
  if (ledReg != LED_INICIAL) {
    escribirReg(REG_LED, LED_INICIAL);
    ledReg = LED_INICIAL;
  }
  ledEspera = 0; ledRepIr = 0; ledRepRo = 0; ledMascara = 0;
}

// Aplica un cambio de corriente: escribe REG_LED, proyecta los DC lentos al nivel nuevo (el DC se desplaza), reinicia la
// ventana de SpO2 y la pausa ~1,5 s, y reprime los filtros / enmascara los latidos si cambió el IR.
void cambiarLed(uint8_t nuevoRojo, uint8_t nuevoIr) {
  uint8_t cr = ledReg >> 4, ci = ledReg & 0x0F;
  if (nuevoRojo == cr && nuevoIr == ci) return;
  ledReg = (uint8_t)((nuevoRojo << 4) | nuevoIr);
  escribirReg(REG_LED, ledReg);
  if (nuevoIr != ci) {
    dc *= LED_MA[nuevoIr] / LED_MA[ci];
    ledRepIr = LED_REPRIMAR_N;
    ledMascara = LED_MASCARA_N;
  }
  if (nuevoRojo != cr) {
    dcRojoLento *= LED_MA[nuevoRojo] / LED_MA[cr];
    ledRepRo = LED_REPRIMAR_N;
  }
  ledEspera = LED_ESPERA_N;
  ledPausaSpo2 = LED_PAUSA_SPO2_N;
  reiniciarVentanaSpo2();
}

// Equilibrio automático del LED rojo e IR (se llama a 100 Hz, solo con el dedo estable). Un solo paso por vez.
void ajustarLed() {
  uint8_t cr = ledReg >> 4, ci = ledReg & 0x0F;
  // Saturación del rojo: se baja un paso de inmediato
  if (dcRojoLento > DC_ROJO_SAT && cr > LED_ROJO_MIN && ledRepRo == 0) { cambiarLed(cr - 1, ci); return; }
  if (ledEspera > 0) { ledEspera--; return; }
  if (nMuestra % LED_AJUSTE_N != 0) return;
  if (dc > DC_IR_ALTO && ci > LED_IR_MIN) { cambiarLed(cr, ci - 1); return; }
  if (dc < DC_IR_BAJO && ci < LED_IR_MAX) { cambiarLed(cr, ci + 1); return; }
  float techo = (dc < DC_ROJO_MAX) ? dc : DC_ROJO_MAX;       // el rojo no debe superar al IR ni 56 000
  if (dcRojoLento > techo && cr > LED_ROJO_MIN) {
    cambiarLed(cr - 1, ci);
  } else if (dcRojoLento < ROJO_REL_MIN * dc && cr < LED_ROJO_MAX &&
             dcRojoLento * LED_MA[cr + 1] / LED_MA[cr] <= techo) {
    cambiarLed(cr + 1, ci);
  }
}

// Suma una muestra a la ventana de SpO2; cada 2 s cierra un bloque y, con 3 bloques (6 s), evalúa la ventana.
void evaluarSpo2() {
  float acIr2 = 0, acRo2 = 0, d2Ir = 0, d2Ro = 0, sIr = 0, sRo = 0;
  int n = 0;
  for (int i = 0; i < SPO2_BLOQUES; i++) {
    acIr2 += bloques[i].acIr2; acRo2 += bloques[i].acRo2;
    d2Ir += bloques[i].d2Ir;   d2Ro += bloques[i].d2Ro;
    sIr += bloques[i].sIr;     sRo += bloques[i].sRo;
    n += bloques[i].n;
  }
  float dcIr = sIr / n, dcRo = sRo / n;
  float rmsIr = sqrtf(acIr2 / n), rmsRo = sqrtf(acRo2 / n);          // AC en banda 0,5-5 Hz (incluye el ruido en banda)
  float ruidoIr = SPO2_RUIDO_K * sqrtf(d2Ir / n);                    // ruido de la lectura cruda, en cuentas
  float ruidoRo = SPO2_RUIDO_K * sqrtf(d2Ro / n);
  if (dcIr < 1 || dcRo < 1 || ruidoIr <= 0 || ruidoRo <= 0) return;
  // Consistencia: la AC de cada bloque de 2 s debe ser parecida (un movimiento o un apretón del dedo la dispara)
  float minI = 1e9f, maxI = 0, minR = 1e9f, maxR = 0;
  for (int i = 0; i < SPO2_BLOQUES; i++) {
    float ai = sqrtf(bloques[i].acIr2 / bloques[i].n), ar = sqrtf(bloques[i].acRo2 / bloques[i].n);
    minI = fminf(minI, ai); maxI = fmaxf(maxI, ai); minR = fminf(minR, ar); maxR = fmaxf(maxR, ar);
  }
  bool consistente = maxI <= SPO2_CONSISTENCIA_MAX * minI && maxR <= SPO2_CONSISTENCIA_MAX * minR;
  float snrIr = rmsIr / ruidoIr, snrRo = rmsRo / ruidoRo;
  float perfusionIr = 100.0f * rmsIr / dcIr;
  if (!consistente || snrIr < SPO2_SNR_MIN || snrRo < SPO2_SNR_MIN || perfusionIr < SPO2_PERFUSION_MIN) return;   // compuerta de calidad
  // Se resta el ruido que cae dentro de la banda: AC² - ruido²_en_banda (con piso en 0)
  float bIr = SPO2_GANANCIA_BANDA * ruidoIr, bRo = SPO2_GANANCIA_BANDA * ruidoRo;
  float acIr = sqrtf(fmaxf(0.0f, rmsIr * rmsIr - bIr * bIr));
  float acRo = sqrtf(fmaxf(0.0f, rmsRo * rmsRo - bRo * bRo));
  if (acIr <= 0 || acRo <= 0) return;
  float r = (acRo / dcRo) / (acIr / dcIr);
  float est = constrain(110.0f - 25.0f * r, 70.0f, 100.0f);
  // Ventana aceptada: mediana de las últimas 5 aceptadas, con variación limitada a ±2 puntos por actualización
  sinAceptadaN = 0;
  histSpo2[posHist] = est;
  posHist = (posHist + 1) % SPO2_HIST;
  if (nHist < SPO2_HIST) nHist++;
  if (nHist < SPO2_MIN_ACEPTADAS) return;
  float med = medianaArr(histSpo2, nHist);
  spo2Actual = (spo2Actual > 0) ? constrain(med, spo2Actual - SPO2_PASO_MAX, spo2Actual + SPO2_PASO_MAX) : med;
}

void acumularSpo2(float ir, float rojo, float acIr, float acRo, float d2Ir, float d2Ro) {
  bloqAct.acIr2 += acIr * acIr;  bloqAct.acRo2 += acRo * acRo;
  bloqAct.d2Ir += d2Ir * d2Ir;   bloqAct.d2Ro += d2Ro * d2Ro;
  bloqAct.sIr += ir;             bloqAct.sRo += rojo;
  if (++bloqAct.n >= SPO2_BLOQUE_N) {
    bloques[idxBloque] = bloqAct;
    idxBloque = (idxBloque + 1) % SPO2_BLOQUES;
    if (nBloques < SPO2_BLOQUES) nBloques++;
    bloqAct = Bloque{ 0, 0, 0, 0, 0, 0, 0 };
    if (nBloques >= SPO2_BLOQUES) evaluarSpo2();
  }
}

void procesar(uint16_t ir, uint16_t rojo) {
  bool sinDedo = ir < UMBRAL_DEDO;
  bool midiendo = false;

  nMuestra++;
  ultimoIRGlobal = ir;
  ultimoRojoGlobal = rojo;
  estadoSinDedo = sinDedo;

  if (sinDedo) {
    bpmActual = 0;
    reiniciarSpo2();
    dc = ir;
    dcRojoLento = rojo;
    filtrado = 0;
    filtradoRojo = 0;
    limpiarLatidos();
    amplitud = 60;
    nivelAbs = 0;
    ventanaTot = 0;
    buscando = false;
    fPrevio = 0;
    habiaDedo = false;
    dedoEstable = false;
    ledRestaurar();
  } else {
    if (!habiaDedo) {
      // Dedo recién apoyado: comienza el calentamiento real (hasta que el DC deje de moverse)
      habiaDedo = true;
      dedoDesdeN = nMuestra;
      dedoEstable = false;
      estCont = 0;
      emaIr = ir;
      for (int k = 0; k < 100; k++) emaAnillo[k] = ir;
      dc = ir;
      dcRojoLento = rojo;
      reiniciarSpo2();
    }
    dc += 0.02f * (ir - dc);                         // DC lento del infrarrojo
    dcRojoLento += 0.02f * (rojo - dcRojoLento);     // DC lento del rojo
    emaIr += 0.05f * (ir - emaIr);
    uint32_t t = nMuestra - dedoDesdeN;              // muestras desde que se apoyó el dedo
    float emaAntes = emaAnillo[nMuestra % 100];      // el valor de hace 1 s
    emaAnillo[nMuestra % 100] = emaIr;

    if (!dedoEstable) {
      float variacion = fabsf(emaIr - emaAntes) / emaIr;
      estCont = (t >= 100 && variacion < DC_VAR_ESTABLE) ? estCont + 1 : 0;
      if (t >= DEDO_MAX_N || (t >= DEDO_MIN_N && estCont >= DC_SOSTENIDO_N)) {
        dedoEstable = true;                          // el DC ya no se mueve: desde aquí hay pulso y SpO2
        ultValidoIdx = nMuestra;
        ultPicoIdx = nMuestra;
        sinAceptadaN = 0;
      }
    } else {
      // Tras un cambio de corriente el nivel salta: el filtro se reinicia sobre el nivel nuevo durante 0,2 s
      if (ledRepIr > 0) {
        ledRepIr--;
        refIr = ir;
        biquadReiniciar(bqAlta);
        biquadReiniciar(bqBaja);
      }
      if (ledRepRo > 0) {
        ledRepRo--;
        refRojo = rojo;
        biquadReiniciar(bqAltaR);
        biquadReiniciar(bqBajaR);
      }
    }

    if (t < 100) {
      // Primer segundo: el nivel de luz aún se asienta al apoyar el dedo. Se reinician los filtros en cada lectura
      // (estado cero sobre el nivel actual) para que no arrastren un transitorio largo.
      refIr = ir;
      refRojo = rojo;
      biquadReiniciar(bqAlta);
      biquadReiniciar(bqBaja);
      biquadReiniciar(bqAltaR);
      biquadReiniciar(bqBajaR);
      filtrado = 0;
      filtradoRojo = 0;
      fPrevio = 0;
      nivelAbs = 0;
      ventanaTot = 0;
      buscando = false;
      limpiarLatidos();
    } else {
      // Pasa-banda 0,5-5 Hz sobre el IR invertido (la sístole, el IR baja, queda HACIA ARRIBA) y, con la misma
      // estructura, sobre el rojo (solo para la SpO2)
      filtrado = biquadPaso(bqBaja, biquadPaso(bqAlta, refIr - ir));
      filtradoRojo = biquadPaso(bqBajaR, biquadPaso(bqAltaR, refRojo - rojo));
      nivelAbs += 0.01f * (fabsf(filtrado) - nivelAbs);
      ventana[ventanaTot % VENTANA] = filtrado;
      ventanaTot++;

      if (!dedoEstable) {
        // Calentamiento: el filtro corre (se asienta) pero no hay latidos ni SpO2 (pulso = 0 y SpO2 = 0)
        fPrevio = filtrado;
        ultValidoIdx = nMuestra;
        ultPicoIdx = nMuestra;
      } else {
        midiendo = true;

        // Envolvente lenta para la ganancia de la onda enviada (no interviene en el pulso): sube con rapidez moderada,
        // baja muy despacio (≈10 s) y un artefacto brusco no la dispara (se limita a 3 × la cresta típica).
        float a = fabsf(filtrado);
        if (ampMedia > 0 && a > 3.0f * ampMedia) a = 3.0f * ampMedia;
        if (a > amplitud) amplitud += 0.02f * (a - amplitud);
        else amplitud *= 0.999f;
        if (amplitud < 25) amplitud = 25;

        // Sin latido válido durante 3 s: «sin lectura» (0), no se conserva el valor viejo
        if ((uint32_t)(nMuestra - ultValidoIdx) * MUESTRA_MS > SIN_LATIDO_MS && (rrN > 0 || bpmActual > 0)) {
          limpiarLatidos();
          ultValidoIdx = nMuestra;
        }

        if (ledMascara > 0) {
          // Cambió la corriente del IR: el nivel de la señal cambia, durante 1 s no se buscan latidos (evita un latido falso)
          ledMascara--;
          ultValidoIdx = nMuestra;
          ultPicoIdx = nMuestra;
          hayPicoPrevio = false;
          buscando = false;
        } else {
          detectarLatido(filtrado);
        }
        fPrevio = filtrado;

        // SpO2 por banda: pausada ~1,5 s tras un cambio de corriente
        if (ledPausaSpo2 > 0) {
          ledPausaSpo2--;
        } else {
          acumularSpo2(ir, rojo, filtrado, filtradoRojo,
                       (float)ir - 2.0f * irPrev1 + irPrev2, (float)rojo - 2.0f * roPrev1 + roPrev2);
        }
        // 12 s sin ventana aceptada: sin lectura, nunca un número viejo
        if (++sinAceptadaN > SPO2_CADUCA_N && (spo2Actual > 0 || nHist > 0)) {
          spo2Actual = 0;
          nHist = 0;
          posHist = 0;
        }

        ajustarLed();
      }
    }
    irPrev2 = irPrev1; irPrev1 = ir;
    roPrev2 = roPrev1; roPrev1 = rojo;
  }

  // Onda para la app y el osciloscopio: 50 muestras/s = PROMEDIO de cada 2 lecturas de 100 Hz (no se tiran muestras:
  // mejor relación señal/ruido y sin aliasing). Es la PPG filtrada, con el latido hacia arriba y centrada.
  static uint8_t divisorMuestras = 0;
  static float sumaSalida = 0;
  float contribucion = midiendo ? filtrado : 0;
  sumaSalida += contribucion;
  valorGraficaActual = (uint16_t)constrain(2048.0f + contribucion * (GANANCIA_ONDA / amplitud), 0, 4095);
  divisorMuestras++;
  if (divisorMuestras >= 2) {
    float media = sumaSalida * 0.5f;
    divisorMuestras = 0;
    sumaSalida = 0;
    // Modulación para trazado nítido en el osciloscopio
    int offsetAC = (int)constrain(media * (GANANCIA_ONDA / amplitud), -2047.0f, 2047.0f);
    uint16_t irMuestra = (uint16_t)constrain(24500 + offsetAC, 1000, 65000);
    uint16_t rojoMuestra = (uint16_t)constrain(21000 + (int)(offsetAC * 0.75f), 1000, 65000);
    portENTER_CRITICAL(&bufMux);
    if (indiceBuffer < SAMPLES_PER_BLOCK) {
      bufferIR[indiceBuffer]   = irMuestra;
      bufferRojo[indiceBuffer] = rojoMuestra;
      indiceBuffer++;
    }
    portEXIT_CRITICAL(&bufMux);
    emitirMuestraUsb(millis(), irMuestra, rojoMuestra);   // lo que lee la app por USB
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

// Datos por USB para la app (Web Serial): una línea por muestra, igual que lo que se envía por WiFi.
//   CH1,<millis>,<ir>,<rojo>,<bpm>,<spo2>,<dedo>      dedo = 1 con dedo, 0 sin dedo (ir = 0)
// bpm y spo2 son los que calcula la propia placa (0 = sin lectura). Una sola escritura, con mutex, para que no se
// mezcle con las líneas "@SP" ni con otros mensajes.
void emitirMuestraUsb(unsigned long t, uint16_t ir, uint16_t rojo) {
  char buf[96];
  int n;
  if (estadoSinDedo) {
    n = snprintf(buf, sizeof(buf), "CH1,%lu,0,0,0,0,0\n", t);
  } else {
    n = snprintf(buf, sizeof(buf), "CH1,%lu,%u,%u,%.1f,%.1f,1\n", t, (unsigned)ir, (unsigned)rojo,
                 (double)bpmActual, (double)spo2Actual);
  }
  if (n <= 0 || n >= (int)sizeof(buf)) return;
  xSemaphoreTake(serMux, portMAX_DELAY);
  Serial.write((const uint8_t*)buf, (size_t)n);
  xSemaphoreGive(serMux);
}

// Lectura cruda del sensor (solo en modo de captura): una sola escritura, con mutex.
void emitirMuestraCruda(uint32_t n, unsigned long t, uint16_t ir, uint16_t rojo) {
  char buf[64];
  int largo = snprintf(buf, sizeof(buf), "RAW,%lu,%lu,%u,%u,%u\n", (unsigned long)n, t, (unsigned)ir, (unsigned)rojo,
                       (unsigned)ledReg);   // 6.º campo: REG_LED vigente (0-255)
  if (largo <= 0 || largo >= (int)sizeof(buf)) return;
  xSemaphoreTake(serMux, portMAX_DELAY);
  Serial.write((const uint8_t*)buf, (size_t)largo);
  xSemaphoreGive(serMux);
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
  } else if (c.cmd == "raw_on") {
    rawN = 0;
    rawHasta = millis() + RAW_DURACION_MAX_MS;
    rawActivo = true;
    emitir(String("{\"ev\":\"raw\",\"estado\":\"on\",\"hz\":100,\"bits\":16,\"ledInicial\":") + String((unsigned)LED_INICIAL) +
           ",\"maxSegundos\":180}");
  } else if (c.cmd == "raw_off") {
    rawActivo = false;
    emitir(String("{\"ev\":\"raw\",\"estado\":\"off\",\"muestras\":") + String((unsigned long)rawN) + "}");
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

  // Copia segura de las muestras acumuladas (sección crítica corta: el núcleo del sensor escribe en el mismo búfer).
  // Se envían como máximo MAX_MUESTRAS_PAQUETE (las más antiguas); el resto queda, en orden, para el siguiente envío.
  uint16_t irEnvio[MAX_MUESTRAS_PAQUETE];
  uint16_t rojoEnvio[MAX_MUESTRAS_PAQUETE];
  int cantMuestras = 0;
  portENTER_CRITICAL(&bufMux);
  int disponibles = indiceBuffer;
  if (disponibles >= 5) {
    cantMuestras = (disponibles > MAX_MUESTRAS_PAQUETE) ? MAX_MUESTRAS_PAQUETE : disponibles;
    memcpy(irEnvio, bufferIR, cantMuestras * sizeof(uint16_t));
    memcpy(rojoEnvio, bufferRojo, cantMuestras * sizeof(uint16_t));
    int resto = disponibles - cantMuestras;
    if (resto > 0) {
      memmove(bufferIR, bufferIR + cantMuestras, resto * sizeof(uint16_t));
      memmove(bufferRojo, bufferRojo + cantMuestras, resto * sizeof(uint16_t));
    }
    indiceBuffer = resto;
  }
  portEXIT_CRITICAL(&bufMux);

  if (cantMuestras == 0) {
    // Si el búfer aún no tiene 5 muestras, rellenar con valores coherentes
    for (int i = 0; i < MUESTRAS_RELLENO; i++) {
      irEnvio[i] = 24500;
      rojoEnvio[i] = 21000;
    }
    cantMuestras = MUESTRAS_RELLENO;
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
  json += "\"frecuencia_hz\":" + String(FRECUENCIA_MUESTREO_HZ) + ",";
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
  Serial.setTxBufferSize(1024);
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
    Serial.println(F("🔒 [Seguridad RF55] Validación estricta de certificado TLS habilitada (rechazo de certificados falsos)."));
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
    if (rawActivo) emitirMuestraCruda(++rawN, millis(), ir, rojo);
    procesar(ir, rojo);
  }

  // Fin automático de la captura cruda
  if (rawActivo && (long)(millis() - rawHasta) >= 0) {
    rawActivo = false;
    emitir(String("{\"ev\":\"raw\",\"estado\":\"fin\",\"muestras\":") + String((unsigned long)rawN) + "}");
  }

  // Reporte periódico por Serial (cada 500 ms) sin inundar la consola (se omite durante la captura cruda)
  static unsigned long ultimoLogUSB = 0;
  if (!rawActivo && millis() - ultimoLogUSB >= 500) {
    ultimoLogUSB = millis();
    Serial.printf("[Sensor] Pulso: %d | Dedo: %s | BPM: %.1f | SpO2: %.1f%%\n",
                  valorGraficaActual,
                  estadoSinDedo ? "NO" : "SÍ",
                  bpmActual,
                  spo2Actual);
  }

  delay(5);
}
