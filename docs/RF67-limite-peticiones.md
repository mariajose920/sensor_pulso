# RF67 · Límite de Peticiones en Recepción ESP32 y en la API (Rate Limiting)

Requerimiento: *Limitar las peticiones en la recepción del ESP32 y en la API.*  
Responsable: **Adán**  
Rama: `rf67-limite-peticiones`  
Dependencias:
- **Necesita:** RF54 (Autenticación de dispositivo ESP32 - ya en `develop`).
- **Bloquea a:** Nadie.

---

## 1. Alcance y Normativa de Ciberseguridad

El requerimiento **RF67** protege los endpoints de ingesta de bioseñales del ESP32 y los servicios serverless de la plataforma contra abusos, saturación intencional, denegación de servicio (DoS) y fuerza bruta:

- **OWASP Top 10 (A04:2021 — Insecure Design):** Mitigación de agotamiento de recursos (*Rate Limiting* / *Throttling*).
- **CWE-770 (Allocation of Resources Without Limits or Throttling):** Asignación controlada de cuotas de cómputo y ancho de banda por cliente/dispositivo.
- **RFC 6585 (Additional HTTP Status Codes):** Emisión formal del código `429 Too Many Requests` y cabecera estándar `Retry-After`.

---

## 2. Arquitectura de Limitación de Peticiones

```
                     ┌──────────────────────────────────────────────┐
                     │            Petición HTTP entrante           │
                     └──────────────────────┬───────────────────────┘
                                            │
                                            ▼
                     ┌──────────────────────────────────────────────┐
                     │ Guardián Rate Limit (limitePeticiones.js)    │
                     │  - Determina p_clave (token, ip, usuario)   │
                     │  - Calcula ventana temporal y Retry-After    │
                     └──────────────────────┬───────────────────────┘
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     ▼                                             ▼
     [ Conexión Supabase Disponible ]            [ Fallback / Resiliencia Local ]
   ┌───────────────────────────────────┐       ┌────────────────────────────────┐
   │ RPC PostgreSQL `consumir_limite`  │       │ Almacén en Memoria Map         │
   │ sobre tabla `limites_peticiones`  │       │ (mismo algoritmo de ventana)   │
   └─────────────────┬─────────────────┘       └───────────────┬────────────────┘
                     │                                         │
                     └──────────────────────┬──────────────────┘
                                            │
                     ┌──────────────────────┴──────────────────────┐
                     │  ¿Contador <= p_maximo en la ventana?       │
                     └──────────────┬──────────────────────┬───────┘
                                    │                      │
                                 SÍ │                   NO │
                                    ▼                      ▼
                     ┌────────────────────────┐  ┌───────────────────────────────┐
                     │ Permite continuar      │  │ HTTP 429 Too Many Requests    │
                     │ (HTTP 200 normal)      │  │ Cabecera: `Retry-After: <seg>` │
                     │ Cabeceras X-RateLimit  │  │ JSON: rf67: 'limite_excedido' │
                     └────────────────────────┘  └───────────────────────────────┘
```

---

## 3. Configuración de Cuotas y Ventanas

Para satisfacer el criterio de aceptación ***"El uso normal no se ve afectado"***, los límites se calibraron basándose en los ritmos operativos reales del sistema:

| Endpoint / Servicio | Clave de Agrupación (`p_clave`) | Cuota Normal | Límite Máximo (`p_maximo`) | Ventana (`p_segundos`) | Impacto en Uso Normal |
|---|---|---|---|---|---|
| **ESP32 POST** (`/api/esp32/telemetria`) | `esp32:telemetria:<tokenHash>` | 1 Hz (60 peticiones/min) | **120 peticiones** | `60 s` (1 min) | **Sin impacto** (margen de seguridad del 100% para reintentos de red). |
| **ESP32 GET** (`/api/esp32/telemetria`) | `esp32:get:<ip>` | 1 Hz (60 consultas/min) | **120 peticiones** | `60 s` (1 min) | **Sin impacto** (sondeo del osciloscopio web fluye sin restricciones). |
| **API Cifrado** (`/api/declaraciones/cifrar`) | `api:cifrar:<usuario_id>` | 1 cada varios minutos | **60 peticiones** | `60 s` (1 min) | **Sin impacto**. |
| **API Descifrado** (`/api/declaraciones/descifrar`) | `api:descifrar:<usuario_id>` | 1 al cargar ficha | **60 peticiones** | `60 s` (1 min) | **Sin impacto**. |
| **API Invitaciones** (`/api/invitaciones/enviar`) | `api:invitaciones:<ip>` | 1 a 3 esporádicas | **20 peticiones** | `60 s` (1 min) | **Anti-spam** sin afectar a docentes en clases. |
| **API Portabilidad** (`/api/derechos/exportar`) | `api:exportar:<usuario_id>` | 1 descarga | **10 peticiones** | `60 s` (1 min) | Protege generación pesada de JSON. |

---

## 4. Criterios de Aceptación Verificados

1. **Al superar el límite la respuesta es 429 con `Retry-After`:**
   - La respuesta HTTP devuelve estado numérico `429` (*Too Many Requests*).
   - Se incluye obligatoriamente la cabecera `Retry-After` indicando los segundos restantes hasta que la ventana temporal actual expire.
   - Se proporcionan cabeceras adicionales de observabilidad: `X-RateLimit-Limit`, `X-RateLimit-Remaining` y `X-RateLimit-Reset`.
   - El cuerpo de la respuesta es JSON con `{ ok: false, error: "...", retryAfter: N, rf67: "limite_excedido" }`.

2. **El uso normal no se ve afectado:**
   - El ESP32 emite paquetes por WiFi cada 1.000 ms (`1 Hz`, 60 peticiones por minuto). Con un límite de 120 req/min, el dispositivo opera al 50% de la capacidad de la ventana sin bloqueos ni retrasos.
   - El navegador sondea la telemetría en vivo a 1 Hz, operando también al 50% de la cuota asignada.

---

## 5. Implementación en Base de Datos y Código

- **PostgreSQL / Supabase (`supabase/migrations/20261027000700_seguridad_cumplimiento.sql`):**
  - Tabla `limites_peticiones(clave, ventana, contador)`.
  - Función `public.consumir_limite(p_clave text, p_maximo int, p_segundos int default 60)` con `security definer`.
  - Retención automática de registros fijada a 2 días (RF88).
- **Módulo Guardián (`api/_lib/limitePeticiones.js`):**
  - `verificarLimitePeticiones`: consume la cuota vía RPC o mediante fallback en memoria.
  - `aplicarLimitePeticiones`: middleware serverless que emite el 429 y cabecera `Retry-After`.
- **Integración en Endpoints:**
  - [`api/esp32/telemetria.js`](file:///c:/Users/adan_/ERP/sensor_pulso/api/esp32/telemetria.js) (GET y POST).
  - [`api/invitaciones/enviar.js`](file:///c:/Users/adan_/ERP/sensor_pulso/api/invitaciones/enviar.js).
  - [`api/declaraciones/cifrar.js`](file:///c:/Users/adan_/ERP/sensor_pulso/api/declaraciones/cifrar.js).
  - [`api/declaraciones/descifrar.js`](file:///c:/Users/adan_/ERP/sensor_pulso/api/declaraciones/descifrar.js).
  - [`api/derechos/exportar.js`](file:///c:/Users/adan_/ERP/sensor_pulso/api/derechos/exportar.js).

---

## 6. Pruebas Automatizadas

Para ejecutar la verificación:

```bash
npm run test:rf67
```

Salida de la suite:
```
================================================================
  sensor_pulso · Pruebas Automatizadas de RF67
  Límite de Peticiones en Recepción ESP32 y en la API (Rate Limit)
================================================================

--- 1. Esquema y Funciones en Supabase (PostgreSQL) ---
  ✅ [PASS] Base de Datos: Tabla limites_peticiones existe con clave, ventana y contador
  ✅ [PASS] Base de Datos: Función consumir_limite existe con security definer y parámetros (p_clave, p_maximo, p_segundos)
  ✅ [PASS] Base de Datos: Retención de limites_peticiones configurada a 2 días (RF88 Privacidad)

--- 2. Lógica de Rate Limiting y Comunicación con Supabase (consumir_limite) ---
  ✅ [PASS] Supabase RPC: consumir_limite es invocado con los parámetros correctos
  ✅ [PASS] Supabase RPC: Al devolver false, verificarLimitePeticiones retorna permitido = false
  ✅ [PASS] Memoria Fallback: Mantiene conteo y bloquea al superar el límite cuando no hay DB

--- 3. Criterio de Aceptación: Respuesta 429 con cabecera Retry-After ---
  ✅ [PASS] Criterio: Al superar el límite responde HTTP 429 y cabecera Retry-After

--- 4. Recepción de Telemetría ESP32 (/api/esp32/telemetria) ---
  ✅ [PASS] ESP32 POST: El uso normal (1 Hz / 60 req/min) no se ve afectado bajo límite de 120 req/min
  ✅ [PASS] ESP32 POST: Responde HTTP 429 con Retry-After al superar el límite de telemetría
  ✅ [PASS] ESP32 GET: Consultas de telemetría responden 429 con Retry-After al saturar

--- 5. Rutas Adicionales de la API (Declaraciones, Invitaciones, Derechos) ---
  ✅ [PASS] API Invitaciones (/api/invitaciones/enviar): Responde 429 con Retry-After al exceder límite
  ✅ [PASS] API Declaraciones (/api/declaraciones/cifrar): Responde 429 con Retry-After al exceder límite
  ✅ [PASS] API Derechos (/api/derechos/exportar): Responde 429 con Retry-After al exceder límite

================================================================
  RESUMEN DE PRUEBAS RF67:
  Total: 13 | Pasadas: 13 | Falladas: 0
================================================================
```
