# RF55 · Cifrado en Tránsito (HTTPS/TLS) y en Reposo (AES-256)

Requerimiento: *Cifrado en tránsito (TLS) entre ESP32, web y base de datos, y cifrado en reposo en la base de datos (con integración para campos de salud RF116).*

---

## 1. Alcance y Normativa de Ciberseguridad

El requerimiento **RF55** garantiza la confidencialidad, autenticidad e integridad de la telemetría biomédica y los datos de salud de los estudiantes en todas sus fases de ciclo de vida (en tránsito y en reposo), cumpliendo con los estándares internacionales y la legislación nacional:

- **ISO/IEC 27001:2022**:
  - **A.5.34** — Privacidad y protección de información de identificación personal (PII).
  - **A.8.20** — Seguridad de las redes.
  - **A.8.24** — Uso de criptografía (algoritmos robustos y gestión de claves).
  - **A.8.26** — Seguridad en los servicios de red y protocolos de transporte.
- **Ley N° 19.628 (Chile)** — Protección de datos de la vida privada y datos sensibles de salud.
- **NIST SP 800-52 Rev. 2** — Pautas para la selección y configuración de TLS.

---

## 2. Arquitectura de Cifrado

```
┌──────────────────┐           TLS 1.2+ (HTTPS)           ┌────────────────────────┐
│  Dispositivo     │ ───────────────────────────────────▶ │  API Ingest Vercel     │
│  ESP32 (MAX30100)│   WiFiClientSecure (Puerto 443)      │  /api/esp32/telemetria │
└──────────────────┘                                      └───────────┬────────────┘
                                                                      │
                                                                      │ HTTPS / TLS 1.3
                                                                      ▼
┌──────────────────┐           TLS 1.3 (HTTPS / WSS)      ┌────────────────────────┐
│  Aplicación Web  │ ◀───────────────────────────────────▶│  Supabase PostgreSQL  │
│  (Navegador PWA) │   HSTS Preload + CSP Upgrade         │  - Reposo: AES-256 TDE │
└──────────────────┘                                      │  - Salud: AES-256-GCM  │
                                                          └────────────────────────┘
```

---

## 3. Implementación Detallada

### 3.1 Cifrado en Tránsito (In-Transit Encryption)

1. **ESP32 hacia API Ingest (`firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino`):**
   - Emplea `WiFiClientSecure` con capa TLS negociada sobre el puerto 443.
   - Endpoint configurado exclusivamente con protocolo `https://sensorpulso.vercel.app/api/esp32/telemetria`.
   - Stack FreeRTOS de 16 KB (`16384` bytes) reservado en Core 0 para el intercambio y manejo de claves TLS sin riesgo de stack overflow.
   - Verificación de protocolo en tiempo de arranque (`setup()`) que alerta por Serial si se intenta configurar una URL no cifrada.

2. **Ingest Serverless API (`api/esp32/telemetria.js`):**
   - En entornos de producción (Vercel u hosting), audita la cabecera `x-forwarded-proto`.
   - Rechaza activamente cualquier petición en texto plano HTTP con código `426 Upgrade Required` y solicita elevación a `TLS/1.3`.
   - Emite cabecera estricta `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` y `X-Content-Type-Options: nosniff`.
   - Retorna en las respuestas metadatos de confirmación de cifrado TLS para auditoría pedagógica.

3. **Aplicación Web en Navegador (`vercel.json`):**
   - **HSTS Estricto:** `Strict-Transport-Security` con 2 años (`63072000` segundos), `includeSubDomains` y `preload`.
   - **CSP (Content Security Policy):** Directiva `upgrade-insecure-requests` que eleva automáticamente cualquier petición del navegador a HTTPS.
   - **Restricción de Conexiones:** `connect-src 'self' https://*.supabase.co wss://*.supabase.co` garantiza que la web solo puede enviar o recibir datos mediante canales seguros TLS (HTTPS y WSS).

4. **Cliente de Base de Datos (`src/services/supabase.js`):**
   - Verifica la URL de Supabase y fuerza elevación de `http://` a `https://`.
   - Conexiones en tiempo real configuradas sobre WebSockets seguros (`wss://`).
   - Exporta metadatos `seguridadCanalSupabase` para monitoreo de seguridad.

---

### 3.2 Cifrado en Reposo (At-Rest Encryption)

1. **Cifrado de Volumen en Supabase (TDE):**
   - Todo el almacenamiento de PostgreSQL (tablas, índices, backups y logs WAL) cuenta con cifrado transparente de datos (TDE) mediante **AES-256** administrado a nivel de infraestructura en reposo.

2. **Cifrado de Campos de Salud a Nivel de Aplicación (RF116 / `src/utils/cifradoService.js`):**
   - Para datos médicos de alta sensibilidad (sueño, cafeína, medicación, condición de salud, nivel de estrés):
     - **Algoritmo:** **AES-256-GCM** (Galois/Counter Mode), estándar NIST AEAD que asegura confidencialidad y autenticidad/integridad matemática.
     - **Vector de Inicialización (IV):** 12 bytes criptográficamente pseudoaleatorios (`crypto.getRandomValues`) generados por cada operación de guardado.
     - **Sobre Binario:** Estructura de sobre autenticado con cabecera mágica `SPC` (`0x535043`), versión de clave de 1 byte, IV de 12 bytes y texto cifrado con tag GCM de 16 bytes.
     - **Persistencia PostgreSQL:** Almacenado en formato hexadecimal compatible con la columna `bytea` (`\x53504301...`).
     - **Detección de Manipulación (Tamper Detection):** Cualquier alteración en los bytes almacenados provoca el rechazo automático en la verificación del tag de autenticación.
     - **Retrocompatibilidad:** Capacidad de decodificar de forma transparente registros previos no cifrados o en formato JSON crudo sin pérdida de datos.
     - **Rotación de Claves:** Soporta claves versionadas (`clave_version`) vinculadas a variables de entorno **solo del servidor** (`CLAVE_CIFRADO_CAMPOS`, `SALUD_ENCRYPTION_KEY_V<n>`). El cifrado y el descifrado ocurren en `api/declaraciones/` (RF88/ISO 27001 A.8.24); el navegador no tiene claves y no existe clave por defecto.

3. **Clasificación en Catálogo de Base de Datos:**
   - La tabla `clasificacion_datos` cataloga explícitamente:
     - Tabla: `declaraciones_paciente`
     - Columna: `datos_cifrados`
     - Clase: `sensible_salud`
     - `cifrado_campo = true`
     - `enmascarar = true`

---

## 4. Archivos Modificados e Implementados

| Archivo | Función en RF55 |
|---|---|
| [`src/utils/cifradoService.js`](file:///c:/Users/adan_/ERP/sensor_pulso/src/utils/cifradoService.js) | Módulo criptográfico estándar Web Crypto API (AES-256-GCM, sobre SPC, IV aleatorio, rotación de claves y diagnóstico). |
| [`src/services/pacienteService.js`](file:///c:/Users/adan_/ERP/sensor_pulso/src/services/pacienteService.js) | Cifrado y descifrado de factores de salud antes de la inserción y lectura en `declaraciones_paciente`. |
| [`src/services/supabase.js`](file:///c:/Users/adan_/ERP/sensor_pulso/src/services/supabase.js) | Forzado de HTTPS/TLS en canal con Supabase y exportación de metadatos de seguridad. |
| [`api/esp32/telemetria.js`](file:///c:/Users/adan_/ERP/sensor_pulso/api/esp32/telemetria.js) | Endurecimiento TLS, rechazo de conexiones no cifradas en producción (HTTP 426) y cabeceras HSTS. |
| [`firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino`](file:///c:/Users/adan_/ERP/sensor_pulso/firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino) | Verificación de endpoint HTTPS y transmisión TLS 1.2+ con `WiFiClientSecure`. |
| [`src/components/Esp32WifiStatus.vue`](file:///c:/Users/adan_/ERP/sensor_pulso/src/components/Esp32WifiStatus.vue) | Badge interactivo de Cifrado TLS 1.3 en la barra de estado de conexión del sensor. |
| [`src/components/DatosPacienteCard.vue`](file:///c:/Users/adan_/ERP/sensor_pulso/src/components/DatosPacienteCard.vue) | Indicador visual de cifrado AES-256 + TLS en la ficha de datos de paciente y factores de salud. |
| [`scripts/test-rf55-cifrado.js`](file:///c:/Users/adan_/ERP/sensor_pulso/scripts/test-rf55-cifrado.js) | Suite de 16 pruebas automatizadas de cifrado en tránsito y reposo. |

---

## 5. Pruebas Automatizadas

Para ejecutar la verificación:

```bash
npm run test:rf55
```

Salida esperada:
```
================================================================
  sensor_pulso · Pruebas Automatizadas de RF55
  Cifrado en Tránsito (HTTPS/TLS) y en Reposo (AES-256-GCM / TDE)
================================================================

--- 1. Cifrado en Tránsito Web & Vercel (HSTS y CSP) ---
  ✅ [PASS] Vercel: Cabecera Strict-Transport-Security (HSTS) configurada con max-age >= 1 año
  ✅ [PASS] Vercel: CSP contiene directiva upgrade-insecure-requests para forzar HTTPS
  ✅ [PASS] Vercel: connect-src restringe conexiones a HTTPS y WSS seguros de Supabase

--- 2. Cifrado en Tránsito en API Serverless de Telemetría (/api/esp32/telemetria.js) ---
  ✅ [PASS] API Ingest: Contiene validación y rechazo de peticiones no cifradas (HTTP plano)
  ✅ [PASS] API Ingest: Devuelve metadatos de cifrado TLS en respuesta GET y POST

--- 3. Cifrado en Tránsito en Firmware ESP32 (esp32_wifi_prueba.ino) ---
  ✅ [PASS] ESP32: Utiliza WiFiClientSecure para handshake TLS
  ✅ [PASS] ESP32: Endpoint SERVER_URL configurado estrictamente con protocolo https://
  ✅ [PASS] ESP32: Stack asignado para la tarea FreeRTOS de transmisión WiFi es >= 16 KB (TLS)
  ✅ [PASS] ESP32: Verificación activa de protocolo seguro en setup con aviso por Serial

--- 4. Conexión Segura Cliente-Base de Datos (supabase.js) ---
  ✅ [PASS] supabase.js: Elevación automática forzosa a HTTPS si se configurara HTTP plano
  ✅ [PASS] supabase.js: Exporta metadatos del canal seguro de transporte (seguridadCanalSupabase)

--- 5. Cifrado en Reposo y de Campos de Salud AES-256-GCM (cifradoService.js) ---
  ✅ [PASS] cifradoService: Cifrado y descifrado de factores de salud con AES-256-GCM (Roundtrip)
  ✅ [PASS] cifradoService: Detección de alteración (Tamper Detection) con fallo de autenticación GCM
  ✅ [PASS] cifradoService: Retrocompatibilidad transparente con registros históricos sin cifrar
  ✅ [PASS] cifradoService: Diagnóstico de estado de cifrado (obtenerEstadoCifrado)

--- 6. Clasificación de Datos en Base de Datos (PostgreSQL) ---
  ✅ [PASS] Base de Datos: declaraciones_paciente.datos_cifrados catalogada como sensible_salud con cifrado_campo = true

================================================================
  RESUMEN DE PRUEBAS RF55:
  Total: 16 | Pasadas: 16 | Falladas: 0
================================================================
```
