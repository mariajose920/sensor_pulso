# Verificación documentada del cifrado antes de cada entrega (RF118)

| Campo | Detalle |
|---|---|
| **Fecha de verificación** | 2026-11-14 |
| **Responsable** | Javiera |
| **Rama evaluada** | `rf118-verificacion-cifrado` (desde `develop`) |
| **Alcance** | HTTPS y cabeceras del sitio web, TLS del ESP32 (RF55), cifrado en reposo de Supabase, cifrado de campos de salud (RF116) y manejo de claves y secretos (RF69) |

---

## 1. Lista de verificación antes de cada entrega

Cada punto registra su estado únicamente como **`cumple`**, **`no cumple`** o **`pendiente`**. Todo aspecto que no pudo comprobarse de forma directa en esta sesión (por requerir hardware físico conectado o acceso a la consola de infraestructura del proveedor) se deja explícitamente como **`pendiente`**, sin afirmarlo.

| # | Área | Punto de verificación | Evidencia comprobada | Fecha | Responsable | Resultado |
|---|---|---|---|---|---|---|
| 1.1 | **HTTPS y cabeceras del sitio** | Redirección/forzado HTTPS y cabecera `Strict-Transport-Security` (HSTS) en producción y configuración | Comprobado en `vercel.json` (línea 13) y mediante petición HTTP `HEAD` en vivo a `https://sensorpulso.vercel.app` (`status: 200`): devuelve `strict-transport-security: max-age=63072000; includeSubDomains; preload`. | 2026-11-14 | Javiera | **cumple** |
| 1.2 | **HTTPS y cabeceras del sitio** | Cabeceras de protección web (`Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`) | Comprobado en `vercel.json` (líneas 14-23) y en vivo en `https://sensorpulso.vercel.app`: `x-content-type-options: nosniff`, `X-Frame-Options: DENY` y `Content-Security-Policy` con `upgrade-insecure-requests` y `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://sensorpulso.vercel.app`. | 2026-11-14 | Javiera | **cumple** |
| 1.3 | **HTTPS y cabeceras del sitio** | Canal cifrado TLS entre navegador y Supabase (`https://` y `wss://`) | Comprobado en `src/services/supabase.js` (líneas 11-27: elevación forzosa de `http://` a `https://` y metadatos `seguridadCanalSupabase`) y petición `HEAD` a `https://ozzehtpqxpicfqvmulcg.supabase.co/rest/v1/` (`strict-transport-security: max-age=31536000; includeSubDomains; preload`). | 2026-11-14 | Javiera | **cumple** |
| 2.1 | **TLS del ESP32 (RF55)** | Uso de `WiFiClientSecure`, validación de certificado raíz (`setCACert`) sin `setInsecure()` y URL `https://` | Comprobado en `firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino`, `firmware/README.md` y suite `node scripts/test-rf55-cifrado.js` (`23/23` pruebas aprobadas): certificado raíz oficial ISRG Root X1 en formato PEM, sincronización NTP (`configTime`), stack FreeRTOS de 16 KB y URL `https://sensorpulso.vercel.app/api/esp32/telemetria`. | 2026-11-14 | Javiera | **cumple** |
| 2.2 | **TLS del ESP32 (RF55)** | Rechazo de peticiones HTTP en texto plano en la API de telemetría (`/api/esp32/telemetria`) | Comprobado en `api/esp32/telemetria.js` y `node scripts/test-rf55-cifrado.js`: rechaza tráfico no cifrado en producción con `426 Upgrade Required` y reporta el protocolo real del socket TLS (`detectarProtocoloReal`). | 2026-11-14 | Javiera | **cumple** |
| 2.3 | **TLS del ESP32 (RF55)** | Prueba en placa física ESP32 conectada por WiFi real ante certificado inválido/falso | Se verificó en código que `setCACert` está activo y `setInsecure` ausente, pero no se ejecutó una prueba con placa física ESP32 conectada por WiFi contra un servidor con certificado falso durante esta sesión. | 2026-11-14 | Javiera | **pendiente** |
| 3.1 | **Cifrado en reposo de Supabase** | Catálogo de clasificación de datos (`clasificacion_datos`) y columna `bytea` cifrada en PostgreSQL | Comprobado en vivo en Supabase (`https://ozzehtpqxpicfqvmulcg.supabase.co`) consultando `public.clasificacion_datos`: la columna `declaraciones_paciente.datos_cifrados` registra `clase = 'sensible_salud'`, `cifrado_campo = true` y `enmascarar = true`. | 2026-11-14 | Javiera | **cumple** |
| 3.2 | **Cifrado en reposo de Supabase** | Verificación directa del cifrado de disco/volumen (AES-256 TDE) y respaldos en la consola de infraestructura de Supabase/AWS | Documentado en la arquitectura (`docs/RF55-cifrado-en-transito.md`), pero no es comprobable mediante consultas desde el cliente de la aplicación sin acceso administrativo directo al panel de infraestructura de Supabase/AWS. | 2026-11-14 | Javiera | **pendiente** |
| 4.1 | **Cifrado de campos (RF116)** | Cifrado autenticado `AES-256-GCM` exclusivo en servidor para factores declarados de salud (`api/_lib/cifradoSalud.js`) | Comprobado en `api/_lib/cifradoSalud.js`, `api/declaraciones/cifrar.js`, `api/declaraciones/descifrar.js` y `node scripts/test-rf116-cifrado.mjs`: sobre binario con cabecera `SPC` (`\x535043`), versión de clave (1 byte), IV aleatorio de 12 bytes y tag GCM de 16 bytes; rechazo de sobre alterado (`422`); fallo cerrado sin clave (`503`); mediciones continuas (`bpm_promedio`, `spo2_promedio`) sin cifrado por campo. | 2026-11-14 | Javiera | **cumple** |
| 4.2 | **Cifrado de campos (RF116)** | Ausencia de claves criptográficas y de operaciones `subtle.encrypt`/`decrypt` en el cliente navegador | Comprobado en `src/utils/cifradoService.js` y `node scripts/test-rf116-cifrado.mjs`: el navegador no contiene semillas ni variables `VITE_` con claves de cifrado; todo cifrado y descifrado pasa por `/api/declaraciones/cifrar` y `/api/declaraciones/descifrar` validando sesión y titularidad. | 2026-11-14 | Javiera | **cumple** |
| 5.1 | **Claves y secretos (RF69)** | Cero claves ni secretos en el código fuente, `.gitignore`, hook `pre-commit` e historial de commits | Comprobado ejecutando `node scripts/test-rf69-manejo-secretos.js` (`24/24` pruebas aprobadas): `0 secretos` en todos los archivos rastreados del repositorio y en los últimos 20 commits; `.gitignore` bloquea `.env*`, `*.pem`, `*.key`, `*.p12`, `*.crt`; hook `pre-commit` y workflow CI activos. | 2026-11-14 | Javiera | **cumple** |
| 5.2 | **Claves y secretos (RF69)** | Soporte de rotación de claves por versión (`CLAVE_VERSION_ACTIVA`, `SALUD_ENCRYPTION_KEY_V<n>`) | Comprobado en `api/_lib/cifradoSalud.js` (líneas 18-32), `docs/RF69-manejo-secretos.md` (sección 4.5) y `node scripts/test-rf116-cifrado.mjs`: registros cifrados con versión 1 y versión 2 se descifran simultáneamente según el byte de versión del sobre. | 2026-11-14 | Javiera | **cumple** |
| 5.3 | **Claves y secretos (RF69)** | Verificación en el panel de Vercel de las variables de entorno secretas en producción y script de re-cifrado histórico | No se tiene acceso desde este entorno local al panel de variables de entorno del proyecto en Vercel para inspeccionar directamente `CLAVE_CIFRADO_CAMPOS` y `SUPABASE_SECRET_KEY`, y según `docs/RF69-manejo-secretos.md` (sección 4.5) aún no existe un script de re-cifrado masivo para migrar registros antiguos al rotar clave. | 2026-11-14 | Javiera | **pendiente** |

---

## 2. Detalle de la evidencia recolectada

### 2.1 HTTPS y cabeceras del sitio web
- **Comando ejecutado:** inspección de `vercel.json` y consulta `HEAD` en vivo a `https://sensorpulso.vercel.app` y `https://ozzehtpqxpicfqvmulcg.supabase.co/rest/v1/`.
- **Evidencia obtenida:**
  - `https://sensorpulso.vercel.app` respondió `HTTP 200` con:
    - `strict-transport-security: max-age=63072000; includeSubDomains; preload`
    - `x-content-type-options: nosniff`
    - `content-security-policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; ... connect-src 'self' https://*.supabase.co wss://*.supabase.co https://sensorpulso.vercel.app; ... upgrade-insecure-requests`
  - `https://ozzehtpqxpicfqvmulcg.supabase.co/rest/v1/` respondió con:
    - `strict-transport-security: max-age=31536000; includeSubDomains; preload`
    - `x-content-type-options: nosniff`

### 2.2 TLS del ESP32 (RF55)
- **Comando ejecutado:** `node scripts/test-rf55-cifrado.js`
- **Resultado:** `Total: 23 | Pasadas: 23 | Falladas: 0`.
- **Evidencia comprobada:**
  - `firmware/esp32_wifi_prueba/esp32_wifi_prueba.ino` usa `WiFiClientSecure`, configura la CA raíz ISRG Root X1 con `setCACert(ROOT_CA_CERTIFICATE)`, no invoca `setInsecure()`, sincroniza reloj por NTP y apunta a `https://sensorpulso.vercel.app/api/esp32/telemetria`.
  - `api/esp32/telemetria.js` rechaza conexiones HTTP sin TLS en producción (`426 Upgrade Required`).
- **Punto pendiente:** la prueba física en placa ESP32 real frente a un servidor con certificado inválido queda en estado `pendiente` hasta realizarse con el hardware conectado.

### 2.3 Cifrado en reposo de Supabase
- **Consulta en vivo a Supabase (`public.clasificacion_datos`):**
  ```json
  [
    {"tabla":"declaraciones_paciente","columna":"nombre","clase":"privado","cifrado_campo":false,"enmascarar":true},
    {"tabla":"declaraciones_paciente","columna":"edad","clase":"privado","cifrado_campo":false,"enmascarar":false},
    {"tabla":"declaraciones_paciente","columna":"datos_cifrados","clase":"sensible_salud","cifrado_campo":true,"enmascarar":true}
  ]
  ```
- **Consulta en vivo a `public.declaraciones_paciente`:** existen registros almacenados con `clave_version = 1` y columna `datos_cifrados` en formato `bytea`.
- **Punto pendiente:** la comprobación directa del cifrado de volumen AES-256 en la consola de infraestructura de Supabase/AWS queda como `pendiente` por requerir acceso al panel del proveedor.

### 2.4 Cifrado de campos de salud (RF116)
- **Comando ejecutado:** `node scripts/test-rf116-cifrado.mjs`
- **Evidencia comprobada:**
  - Cifrado y descifrado `AES-256-GCM` en `api/_lib/cifradoSalud.js` con cabecera `\x535043`, versión de clave e IV aleatorio de 12 bytes.
  - Los factores de salud (`nivelEstres`, `suenoHoras`, `suenoCalidad`, `cafeina`, `medicacion`, `condicionSalud`) no aparecen en texto claro dentro del sobre hexadecimal.
  - Sin clave configurada en el servidor (`CLAVE_CIFRADO_CAMPOS`), los endpoints `/api/declaraciones/cifrar` y `/api/declaraciones/descifrar` fallan cerrado con `HTTP 503`.
  - Un sobre alterado en tránsito o almacenamiento es rechazado por el tag de autenticación GCM con `HTTP 422`.
  - Observación técnica en la suite: `api/declaraciones/cifrar.js` emite la cabecera endurecida `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate` (más estricta que el literal `'no-store'` que comparaba una aserción de `test-rf116-cifrado.mjs`).

### 2.5 Manejo de claves y secretos (RF69)
- **Comando ejecutado:** `node scripts/test-rf69-manejo-secretos.js`
- **Resultado:** `Total: 24 | Pasadas: 24 | Falladas: 0`.
- **Evidencia comprobada:**
  - Escaneo completo del repositorio actual y de los últimos 20 commits del historial con `scripts/revisar-secretos.mjs`: `0 secretos` detectados.
  - Ningún servicio lee claves privadas desde variables con prefijo público `VITE_`.
  - Procedimiento de rotación cada 90 días o ante incidente documentado en `docs/RF69-manejo-secretos.md`.
- **Punto pendiente:** verificación visual de las variables secretas cargadas en el entorno de producción de Vercel y script de re-cifrado de datos antiguos quedan como `pendiente`.

---

## 3. Procedimiento para repetir esta verificación antes de cada entrega

1. Ejecutar las suites de cifrado y secretos:
   ```bash
   node scripts/test-rf55-cifrado.js
   node scripts/test-rf69-manejo-secretos.js
   node scripts/test-rf118-verificacion-cifrado.mjs
   ```
2. Comprobar cabeceras HTTPS del despliegue en Vercel (`Strict-Transport-Security`, `Content-Security-Policy`, `X-Content-Type-Options`).
3. Actualizar la fecha, el nombre de la persona responsable y el resultado (`cumple`, `no cumple` o `pendiente`) en la tabla de la sección 1 sin afirmar ningún punto que no se haya comprobado en esa entrega.
