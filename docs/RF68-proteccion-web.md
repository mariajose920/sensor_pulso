# RF68 · Protección Web (XSS, CSRF, Inyección y Cabeceras de Seguridad)

Requerimiento: *Protección contra XSS, CSRF e inyección, con cabeceras de seguridad.*  
Responsable: **Adán**  
Fecha de vencimiento: **12 de noviembre de 2026**  
Rama: `rf68-proteccion-web`  
Dependencias:
- **Necesita:** Nada.
- **Bloquea a:** Nadie.

---

## 1. Alcance y Normativas de Ciberseguridad

El requerimiento **RF68** implementa la defensa en profundidad de la plataforma web y API de *sensor_pulso* frente a las vulnerabilidades web más críticas descritas por los estándares internacionales:

- **OWASP Top 10 (A03:2021 — Injection):** Prevención de inyección SQL y neutralización de código interpretado malicioso.
- **OWASP Top 10 (A01:2021 — Broken Access Control) & CWE-352:** Blindaje contra *Cross-Site Request Forgery* (CSRF) mediante verificación estricta de origen y control de sitios cruzados (*Sec-Fetch-Site*).
- **CWE-79 (Cross-site Scripting - XSS):** Escapado contextual completo de entradas de usuario, sanitización de marcado y neutralización de pseudoprotocolos ejecutables.
- **CWE-89 (SQL Injection):** Auditoría estática y validación de identificadores (UUID RFC 4122) para garantizar que toda consulta use parámetros tipados en PostgREST/Supabase.
- **W3C Content Security Policy Level 3 & RFC 6797 (HSTS):** Despliegue de cabeceras HTTP de endurecimiento del navegador (CSP, HSTS con preload, anti-clickjacking `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, CORP y COOP).

---

## 2. Arquitectura de Protección Implementada

```
                                  [ Petición HTTP ]
                                          │
                                          ▼
                ┌──────────────────────────────────────────────────┐
                │          Cabeceras HTTP de Seguridad             │
                │  - Content-Security-Policy (CSP estricta)        │
                │  - Strict-Transport-Security (HSTS 1 año preload)│
                │  - X-Frame-Options: DENY                         │
                │  - X-Content-Type-Options: nosniff               │
                │  - Referrer-Policy / CORP / COOP                 │
                └─────────────────────────┬────────────────────────┘
                                          │
                                          ▼
                ┌──────────────────────────────────────────────────┐
                │        Guardián CSRF (validarOrigenCsrf)         │
                │  - Métodos seguros (GET, HEAD, OPTIONS): Pasan   │
                │  - M2M ESP32 (X-ESP32-Token): Pasa               │
                │  - Bearer JWT (Authorization): Pasa              │
                │  - Sec-Fetch-Site: cross-site -> 403 Forbidden   │
                │  - Validar Origin / Referer contra whitelist     │
                └─────────────────────────┬────────────────────────┘
                                          │
                     ┌────────────────────┴────────────────────┐
                     ▼                                         ▼
      ┌─────────────────────────────┐           ┌─────────────────────────────┐
      │  Protección contra XSS      │           │  Protección contra SQLi     │
      │  - escaparHtml()            │           │  - esUuidValido()           │
      │  - sanitizarContenidoUsuario│           │  - detectarIntentoInyeccion │
      │  - esUrlSegura()            │           │  - Consultas parametrizadas │
      │  - Contenido inerte         │           │    en Supabase / PostgREST  │
      └─────────────────────────────┘           └─────────────────────────────┘
```

---

## 3. Componentes y Módulos Desarrollados

### 3.1. Servicio Central de Protección Web (`src/services/proteccionWebService.js`)

Centraliza las rutinas de seguridad utilizables tanto en el cliente Vue como en el runtime Node.js de las Serverless Functions:

1. **Escapado y Sanitización contra XSS:**
   - `escaparHtml(texto)`: Convierte de forma exhaustiva los caracteres delimitadores `&`, `<`, `>`, `"`, `'`, `/`, `` ` `` a sus respectivas entidades HTML seguras (`&amp;`, `&lt;`, `&gt;`, `&quot;`, `&#x27;`, `&#x2F;`, `&#x60;`).
   - `escaparAtributoHtml(texto)`: Escapa atributos dinámicos asegurando neutralización de comillas y caracteres de control.
   - `sanitizarContenidoUsuario(texto)`: Elimina bloques `<script>`, `<iframe>`, `<object>`, `<embed>`, `<style>`, manejadores de eventos en línea (`onload`, `onerror`, `onclick`, etc.) y esquemas `javascript:`, `vbscript:`, `data:text/html`.
   - `esUrlSegura(url)`: Valida que enlaces externos o redirecciones únicamente empleen protocolos autorizados (`http:`, `https:`, `mailto:`) o rutas relativas seguras.
   - `contieneCodigoPeligroso(texto)`: Función de análisis rápido para detección de payloads maliciosos.

2. **Protección contra CSRF en la API:**
   - `esOrigenPermitido(origen, env)`: Evalúa si un origen pertenece a los autorizados (`https://sensorpulso.vercel.app`, subdominios de preview oficiales del proyecto en Vercel, o `localhost` / `127.0.0.1` en desarrollo).
   - `validarOrigenCsrf(req)`: Rechaza con HTTP 429/403 orígenes no confiables o ataques con cabecera `Sec-Fetch-Site: cross-site`. Autoriza de manera segura invocaciones M2M con token de dispositivo `X-ESP32-Token` o peticiones autenticadas con `Authorization: Bearer <jwt>`.

3. **Prevención y Detección de Inyección SQL:**
   - `esUuidValido(id)`: Valida el formato canónico de identificadores UUID v4.
   - `detectarIntentoInyeccionSql(texto)`: Detecta patrones clásicos de escape como `' OR '1'='1`, `UNION SELECT`, comentarios `--` o ejecuciones apiladas `; DROP`.

4. **Cabeceras de Seguridad Oficiales:**
   - `CABECERAS_SEGURIDAD_OFICIALES`: Diccionario con las cabeceras recomendadas por OWASP.
   - `aplicarCabecerasSeguridad(res, contexto)`: Inyecta automáticamente los encabezados adecuados en cualquier respuesta HTTP de Vercel/Node.
   - `verificarCabecerasSeguridad(cabeceras)`: Evalúa si un conjunto de cabeceras cumple con la totalidad de los requisitos de endurecimiento.

### 3.2. Módulo de Re-exportación para la API (`api/_lib/proteccionWeb.js`)

Permite a los endpoints serverless de Node.js acceder a las utilidades de protección web manteniendo una única fuente de la verdad sincronizada con el código fuente del proyecto.

### 3.3. Integración en Endpoints Serverless (`api/`)

- **`api/_lib/sesion.js`:**
  - `responder(res, codigo, datos)` ahora invoca automáticamente `aplicarCabecerasSeguridad(res, 'api')` en cada respuesta HTTP emitida por los microservicios.
  - Se implementó el helper `verificarCsrf(req, res)` que interrumpe con código `403 Forbidden` cualquier intento de solicitud cruzada no autorizada.
- **`api/invitaciones/enviar.js`:**
  - Aplica `escaparHtml()` sobre los campos suministrados por el usuario (`nombreAula`, `nombreDocente`, `codigoLimpio`) antes de interpolarlos en la plantilla HTML de correo electrónico, impidiendo ataques de Stored XSS en clientes de correo web.
  - Integra `aplicarCabecerasSeguridad(res, 'api')` y validación CSRF obligatoria en método `POST`.
- **`api/esp32/telemetria.js`:**
  - Inyecta cabeceras de seguridad activas en cada respuesta de ingesta telemétrica y valida el origen de peticiones `POST` permitiendo exclusivamente el token de hardware del dispositivo ESP32 (`X-ESP32-Token`) u orígenes autorizados.
- **`api/declaraciones/cifrar.js`, `api/declaraciones/descifrar.js` y `api/derechos/exportar.js`:**
  - Protegidos con `verificarCsrf(req, res)` y cabeceras de seguridad activas.

### 3.4. Integración en Servicios del Frontend (`src/services/`)

- **`src/services/aulasService.js`:**
  - En `crearAula`, `crearCurso` y `renombrarCurso`, las entradas de texto (`nombre`, `descripcion`) se procesan con `escaparHtml(sanitizarContenidoUsuario(...))` antes de enviarse a Supabase.
- **`src/services/sanitizacionService.js`:**
  - Re-exporta las funciones de `proteccionWebService.js` integrándolas fluidamente con las rutinas existentes de RF65 y RF66.

### 3.5. Configuración de Cabeceras en el Borde (`vercel.json` y `vite.config.js`)

Se reforzó la directiva `headers` global de `vercel.json`:
- `Content-Security-Policy`:
  - `default-src 'self'`
  - `script-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net`
  - `style-src 'self' 'unsafe-inline' https://fonts.googleapis.com`
  - `img-src 'self' data: blob: https://*.googleusercontent.com`
  - `font-src 'self' https://fonts.gstatic.com`
  - `connect-src 'self' https://*.supabase.co wss://*.supabase.co https://sensorpulso.vercel.app`
  - `frame-ancestors 'none'`
  - `base-uri 'self'`
  - `form-action 'self'`
  - `upgrade-insecure-requests`
- `Strict-Transport-Security`: `max-age=31536000; includeSubDomains; preload`
- `X-Content-Type-Options`: `nosniff`
- `X-Frame-Options`: `DENY`
- `Referrer-Policy`: `strict-origin-when-cross-origin`
- `Cross-Origin-Opener-Policy`: `same-origin-allow-popups`
- `Cross-Origin-Resource-Policy`: `same-origin`
- `Permissions-Policy`: `camera=(), microphone=(), geolocation=()`

Adicionalmente, en `vite.config.js` se replicaron estas cabeceras en `server.headers` para garantizar el mismo nivel de protección durante las sesiones de desarrollo local.

---

## 4. Verificación de Criterios de Aceptación

| Criterio de Aceptación | Resultado de la Verificación | Evidencia Técnica |
| :--- | :--- | :--- |
| **1. Un texto con código no se ejecuta.** | **CUMPLIDO** | Las etiquetas `<script>`, `<iframe>` y manejadores en línea son neutralizados y transformados a entidades inertes (`&lt;script&gt;`) o eliminados por completo mediante `escaparHtml()` y `sanitizarContenidoUsuario()`. La CSP prohíbe además la ejecución de scripts no autorizados. |
| **2. Las cabeceras de seguridad están activas.** | **CUMPLIDO** | Verificadas de forma automatizada tanto en la configuración estática de Vercel (`vercel.json`) como dinámicamente en los encabezados HTTP generados por la API serverless (`aplicarCabecerasSeguridad`). |

---

## 5. Batería de Pruebas Automatizadas

Se implementó el script de pruebas unitarias y de integración `scripts/test-rf68-proteccion-web.js` con **28 pruebas** divididas en 5 grupos:

1. **Prevención de XSS y Escapado de Contenido:** 9 pruebas.
2. **Cabeceras de Seguridad Web (CSP y Similares):** 8 pruebas.
3. **Protección contra CSRF en la API:** 5 pruebas.
4. **Revisión y Prevención de Inyección SQL:** 3 pruebas.
5. **Integración en Endpoints y Servicios del Sistema:** 3 pruebas.

### Ejecución:
```bash
npm run test:rf68
```
Resultado: **28 / 28 pruebas aprobadas (100% éxito)**.
