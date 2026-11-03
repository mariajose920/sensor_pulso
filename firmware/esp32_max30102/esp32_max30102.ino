/* ============================================================
 * SENSOR DE PULSO OPTICO (PPG) — MAX30100 + ESP32 (Entrega 1 - RF17)
 * Protocolo de telemetria hacia la interfaz web:
 *     t_ms, ecg_raw, leads_off, bpm      a 115200 baudios
 *
 * CONEXIONES (ESP32 a 3.3V):
 *   MAX30100 VIN -> ESP32 3V3
 *   MAX30100 GND -> ESP32 GND
 *   MAX30100 SDA -> ESP32 GPIO21 (D21)
 *   MAX30100 SCL -> ESP32 GPIO22 (D22)
 * ============================================================ */
#include <Wire.h>

const uint8_t  DIR_SENSOR = 0x57;
const int      PIN_SDA = 21;
const int      PIN_SCL = 22;

// Registros del MAX30100
const uint8_t REG_FIFO_WR  = 0x02;
const uint8_t REG_FIFO_OVF = 0x03;
const uint8_t REG_FIFO_RD  = 0x04;
const uint8_t REG_FIFO_DAT = 0x05;
const uint8_t REG_MODE     = 0x06;
const uint8_t REG_SPO2     = 0x07;
const uint8_t REG_LED      = 0x09;
const uint8_t REG_PART_ID  = 0xFF;

// Umbral de presencia de dedo (IR sube al colocar el dedo)
const uint16_t UMBRAL_DEDO = 7000;

// Estado del procesamiento
float dc = 0;
float filtrado = 0;
float maximo = 0;
float anterior = 0;
float amplitud = 100;
unsigned long ultimoLatido = 0;
float bpmActual = 0;
const unsigned long REFRACTARIO_MS = 380; // max. 157 lpm (bloquea ondas dicrotas a 180-280 ms)
unsigned long dedoDesde = 0;
const unsigned long CALENTAMIENTO_MS = 2000;
bool habiaDedo = false;

// Bufer para filtro de mediana en microcontrolador (elimina cualquier salto espurio)
float rrHist[4] = {800, 800, 800, 800};
uint8_t rrIdx = 0;

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
  if (id != 0x11) {
    return false;
  }
  escribirReg(REG_MODE, 0x40);          // reset
  delay(50);
  escribirReg(REG_FIFO_WR, 0);
  escribirReg(REG_FIFO_OVF, 0);
  escribirReg(REG_FIFO_RD, 0);
  escribirReg(REG_MODE, 0x03);          // modo SpO2: enciende LED rojo e infrarrojo
  escribirReg(REG_SPO2, 0x47);          // alta resolucion, 100 muestras/s, pulso 1600 us (16 bits)
  escribirReg(REG_LED, 0x28);           // rojo ~7.6 mA (indicador visible), IR ~27 mA
  return true;
}

void setup() {
  Serial.begin(115200);
  delay(300);
  Wire.begin(PIN_SDA, PIN_SCL);
  Wire.setClock(100000);
  while (!iniciarSensor()) {
    delay(1000);
  }
  Serial.println(F("t_ms,ecg_raw,leads_off,bpm"));
}

void procesar(uint16_t ir) {
  bool sinDedo = ir < UMBRAL_DEDO;
  int valor = 2048;

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

    // Recuperacion rapida si hubo un movimiento brusco y paso mas de 1.8 s sin latido
    if (ahora - ultimoLatido > 1800 && maximo > 60) {
      maximo = 50;
    }

    if (filtrado > maximo) maximo = filtrado;
    else maximo *= 0.995f;
    float umbral = 0.45f * maximo; // 45% de amplitud (atrapa pulso agil incluso con respiracion)

    if (filtrado > umbral && anterior <= umbral && maximo > 20 &&
        (ahora - ultimoLatido) >= REFRACTARIO_MS) {
      if (ultimoLatido > 0) {
        float delta = ahora - ultimoLatido;
        if (delta >= REFRACTARIO_MS && delta <= 1800) {
          rrHist[rrIdx % 4] = delta;
          rrIdx++;

          // Filtro de mediana de 4 intervalos en microcontrolador
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
            // Enganche rapido al inicio, y luego suavizado fluido
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
  }

  Serial.print(millis());
  Serial.print(',');
  Serial.print(valor);
  Serial.print(',');
  Serial.print(sinDedo ? 1 : 0);
  Serial.print(',');
  Serial.println(bpmActual, 1);
}

void loop() {
  int wr = leerReg(REG_FIFO_WR);
  int rd = leerReg(REG_FIFO_RD);
  if (wr < 0 || rd < 0) { delay(10); return; }
  int n = (wr - rd) & 0x0F;
  for (int i = 0; i < n; i++) {
    uint16_t ir, rojo;
    if (!leerMuestra(ir, rojo)) break;
    procesar(ir);
  }
  delay(5);
}
