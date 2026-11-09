# RF65 · Validación y Sanitización de Entradas (CSV y Datos del ESP32)

Requerimiento: *Validar y sanitizar entradas (CSV y datos del ESP32).*

---

## 1. Alcance y Normativas de Ciberseguridad

El requerimiento **RF65** (Entrega 4) implementa una capa transversal de blindaje y validación estricta de todas las entradas de datos externos recibidas por la plataforma `sensor_pulso`, tanto desde el hardware IoT (microcontrolador ESP32 por WiFi) como desde archivos suministrados por estudiantes y docentes (archivos CSV de bioseñales).

Este blindaje mitiga activamente las vulnerabilidades críticas definidas por los estándares internacionales de seguridad:

- **OWASP Top 10 (2021)**:
  - **A03:2021 – Injection**: Neutralización de comandos inyectados en celdas de hojas de cálculo y manipulación de parámetros.
  - **A04:2021 – Insecure Design**: Controles defensivos en profundidad y rangos fisiológicos no eludibles.
- **CWE-20: Improper Input Validation**: Validación estricta de esquemas, tipos y coherencia biológica.
- **CWE-79: Improper Neutralization of Input During Web Page Generation (Cross-Site Scripting - XSS)**: Eliminación de etiquetas HTML ejecutables (`<script>`, eventos en línea como `onerror=`, pseudoprotocolos `javascript:`).
- **CWE-1236: Improper Neutralization of Formula Elements in a CSV File (CSV / Formula Injection)**: Escapado y neutralización de celdas que inician con `=`, `+`, `-`, `@`, `|`, `\t`, `\r` antes de su procesamiento o exportación.
- **CWE-1321: Improperly Controlled Modification of Object Prototype (Prototype Pollution)**: Bloqueo de propiedades peligrosas (`__proto__`, `constructor`, `prototype`) en payloads JSON recibidos por la API.

---

## 2. Arquitectura de Sanitización y Validación

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                            Fuentes de Entrada                               │
│   1. Telemetría IoT ESP32 (JSON vía HTTP POST)                             │
│   2. Archivos CSV de Bioseñales (Arrastrar y Soltar / Selector)             │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 Servicio Central: sanitizacionService.js                    │
│  ├── sanitizarTexto(str, maxLen)          -> Remueve scripts, XSS y nulos   │
│  ├── neutralizarFormulaCsv(val)           -> Escapa fórmulas (=, +, @, |)   │
│  ├── verificarSeguridadObjeto(obj)        -> Bloquea Prototype Pollution    │
│  ├── validarYSanitizarTelemetriaEsp32()   -> Valida payload IoT y rangos    │
│  └── validarYSanitizarArchivoCsv()        -> Valida CSV y bioseñales        │
└───────────────────┬─────────────────────────────────────┬───────────────────┘
                    │                                     │
                    ▼                                     ▼
┌──────────────────────────────────────┐  ┌───────────────────────────────────┐
│     API Serverless Ingest (Node)     │  │       Frontend Vue 3 (Cliente)    │
│       api/esp32/telemetria.js        │  │  - senalesService.js              │
│  - HTTP 422 si payload malicioso     │  │  - CargaSenalesCard.vue           │
│  - Acotamiento fisiológico BPM/SpO2  │  │  - Alerta visual de blindaje RF65 │
│  - Máximo 5 canales y 200 muestras   │  │  - Mapeo y filtrado de NaN/Inf    │
└──────────────────────────────────────┘  └───────────────────────────────────┘
```

---

## 3. Implementación Detallada por Vector de Entrada

### 3.1 Telemetría IoT del ESP32 (`api/esp32/telemetria.js`)
Cada paquete JSON enviado por el microcontrolador a través del endpoint `/api/esp32/telemetria` es interceptado y sometido a las siguientes reglas:

1. **Defensa contra Prototype Pollution:** Si el JSON contiene `__proto__` o `constructor`, la petición se rechaza con código `HTTP 422 (Unprocessable Entity)` y cabecera de auditoría `rf65: 'rechazado'`.
2. **Sanitización del Nombre de Dispositivo:** Se eliminan etiquetas `<script>`, caracteres de control y bytes nulos, limitando la longitud a un máximo de 64 caracteres alfanuméricos seguros (`[a-zA-Z0-9_\-\. ]`).
3. **Límite de Canales Simultáneos (RF08/RF111):** El sistema acepta un máximo estricto de **5 canales**. Cualquier canal adicional enviado por saturación es truncado inmediatamente para evitar agotamiento de memoria.
4. **Acotamiento Fisiológico Obligatorio:**
   - **BPM:** Acotado al rango fisiológico humano $[0, 280]$ BPM. Valores negativos, `NaN` o `Infinity` se reemplazan por 0 con advertencia de auditoría.
   - **SpO₂:** Acotado al rango porcentual $[0.0, 100.0]\%$.
   - **Calidad de Señal:** Validada contra una lista blanca (*whitelist*) estricta: `['buena', 'regular', 'mala', 'sin_dedo']`. Valores no autorizados se normalizan automáticamente a `'buena'`.
5. **Muestras Fotopletismográficas ADC (IR y Rojo):**
   - Máximo de **200 muestras por paquete** por canal (prevención de Denial of Service por paquetes sobredimensionados).
   - Cada valor se acota a números enteros dentro del rango de resolución física de 18 bits del sensor MAX30102: $[0, 262143]$ ADC. Valores `NaN` o no numéricos son descartados.

### 3.2 Archivos CSV de Bioseñales (`src/services/senalesService.js`)
Cuando se carga un archivo CSV en el comparador de bioseñales (`/comparacion`):

1. **Límite de Tamaño y Líneas:** Máximo de 5 MB y 100,000 líneas. Archivos que superen este umbral se rechazan con mensaje explicativo.
2. **Defensa contra Null Byte Injection:** Se eliminan bytes nulos (`\0`) que pudieran engañar al parser o a sistemas de almacenamiento de archivos.
3. **Neutralización de Formula Injection (CWE-1236):**
   - Si una celda comienza con caracteres de fórmula (`=`, `+`, `-`, `@`, `|`, `\t`, `\r`), se neutraliza anteponiendo un apóstrofe (`'`) para evitar que software ofimático (Excel, Calc, Google Sheets) interprete macros maliciosas (ej. `=cmd|' /C calc'!A0`).
   - Se preservan números negativos matemáticos legítimos (ej. `-45.82`).
4. **Sanitización XSS en Cabeceras:** Se limpian etiquetas HTML, JavaScript y caracteres no imprimibles en los nombres de columnas.
5. **Filtrado de Registros Corruptos:** Las filas con valores `NaN`, desbordamientos exponenciales (`1e99`) o texto inválido en columnas de datos son descartadas sin interrumpir el procesamiento del resto del archivo.
6. **Feedback Visual:** La interfaz de usuario muestra un banner informativo indicando el número de celdas neutralizadas y las advertencias de seguridad generadas.

---

## 4. Pruebas Automatizadas

La suite [`scripts/test-rf65-validar-sanitizar.js`](../scripts/test-rf65-validar-sanitizar.js) ejecuta **35 pruebas automatizadas**:

```bash
npm run test:rf65
```

**Resultados:**
- ✅ Eliminación de etiquetas `<script>`, eventos `onerror=` y pseudoprotocolos `javascript:`.
- ✅ Eliminación de bytes nulos (`\0`) y truncamiento de longitud máxima.
- ✅ Neutralización de fórmulas DDE (`=cmd|...`, `@SUM...`, `|powershell...`).
- ✅ Preservación de números negativos legítimos.
- ✅ Bloqueo de Prototype Pollution (`__proto__`, `constructor`).
- ✅ Validación y sanitización de telemetría legítima del ESP32.
- ✅ Acotamiento de BPM a 280 y SpO₂ al 100% ante valores extremos.
- ✅ Normalización de calidad desconocida a whitelist segura.
- ✅ Acotamiento de muestras ADC a 18 bits (0 a 262143).
- ✅ Truncamiento de canales masivos a 5 canales máximos.
- ✅ Parseo y detección de Formula Injection en archivos CSV.
- ✅ Limpieza de bytes nulos en CSV y rechazo de archivos corruptos (< 5 muestras).
- ✅ Integración con `senalesService.parsearArchivoCsv`.
- ✅ Integración con endpoint `api/esp32/telemetria.js` (HTTP 200 con telemetría sanitizada, HTTP 422 ante Prototype Pollution).

---

## 5. Verificación Manual en la Interfaz de Usuario

1. Iniciar la aplicación web:
   ```bash
   npm run dev
   ```
2. Navegar a **/comparacion** y abrir la pestaña **📂 Carga de Señales (RF27)**.
3. Crear un archivo de prueba `prueba_seguridad.csv` que contenga una fórmula sospechosa:
   ```csv
   tiempo,ir,rojo
   0.00,24000,18000
   0.02,24500,18200
   0.04,=cmd|' /C calc'!A0,18500
   0.06,25800,18900
   0.08,25200,18400
   0.10,24600,18100
   ```
4. Arrastrar el archivo a la zona de carga:
   * Verificar que la señal se procesa y grafica correctamente.
   * Observar el banner azul de seguridad:
     **🛡️ Blindaje RF65 (Sanitización Exitosa):** *Se neutralizaron 1 celdas con fórmulas potencialmente peligrosas (CWE-1236 / Formula Injection).*
5. Probar un archivo con caracteres nulos o corruptos y verificar que las advertencias se despliegan adecuadamente sin romper la interfaz.
