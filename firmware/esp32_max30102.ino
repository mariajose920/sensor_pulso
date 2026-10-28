/*
 * Firmware inicial para ESP32 + MAX30102 (Entrega 1 - RF24)
 * Lee el sensor MAX30102 por I2C y emite la senal por puerto serie a 115200 baudios.
 * Formato de salida: "ir_value,red_value"
 *
 * Conexiones I2C tipicas en ESP32:
 * - SDA: GPIO 21
 * - SCL: GPIO 22
 * - VIN: 3.3V
 * - GND: GND
 *
 * Requiere libreria Arduino: "SparkFun MAX3010x Pulse and Proximity Sensor Library"
 */

#include <Wire.h>
#include "MAX30105.h"

MAX30105 particleSensor;

void setup() {
  Serial.begin(115200);
  delay(1000);

  Wire.begin(21, 22);

  if (!particleSensor.begin(Wire, I2C_SPEED_FAST)) {
    Serial.println("Error: No se encontro el sensor MAX30102. Revisa las conexiones.");
    while (1) {
      delay(1000);
    }
  }

  byte ledBrightness = 60;
  byte sampleAverage = 4;
  byte ledMode = 2; // Rojo + Infrarrojo
  int sampleRate = 100;
  int pulseWidth = 411;
  int adcRange = 4096;

  particleSensor.setup(ledBrightness, sampleAverage, ledMode, sampleRate, pulseWidth, adcRange);
}

void loop() {
  long irValue = particleSensor.getIR();
  long redValue = particleSensor.getRed();

  if (irValue > 50000) {
    Serial.print(irValue);
    Serial.print(",");
    Serial.println(redValue);
  } else {
    Serial.println("0,0");
  }

  delay(10);
}
