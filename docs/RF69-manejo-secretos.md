# RF69 · Manejo Seguro de Secretos y Escáner de Repositorio

Requerimiento: *Los secretos no se guardan en el repositorio.*  
Responsable: **Adán**  
Fecha de vencimiento: **12 de noviembre de 2026**  
Rama: `rf69-manejo-secretos`  
Dependencias:
- **Necesita:** Nada.
- **Bloquea a:** Nadie.

---

## 1. Alcance y Normativas de Ciberseguridad

El requerimiento **RF69** establece el estándar de cero secretos en el control de versiones (*Zero-Secret Repository Policy*) para *sensor_pulso*, garantizando que ninguna credencial, clave de servicio, llave criptográfica o variable sensible se exponga en el código fuente, archivos rastreados o historial de commits de Git:

- **OWASP Top 10 (A05:2021 — Security Misconfiguration & A07:2021 — Identification and Authentication Failures):** Prevención de fuga de credenciales administrativas y llaves de acceso en repositorios de código.
- **CWE-798 (Use of Hard-coded Credentials):** Erradicación total de credenciales quemadas en el código fuente de clientes, APIs y firmware.
- **CWE-200 (Exposure of Sensitive Information) & CWE-532:** Prohibición estricta de prefijos públicos (`VITE_`) en variables que transportan secretos o claves maestras del backend.
- **ISO/IEC 27001 (Controles A.8.9 y A.8.24):** Gestión segura de la configuración y protección del ciclo de vida de claves criptográficas y secretos en variables de entorno custodiadas (Vercel).

---

## 2. Arquitectura de Manejo de Secretos y Escaneo

```
   ┌────────────────────────────────────────────────────────────────────────┐
   │                    Áreas de Vigilancia de Secretos                     │
   ├────────────────────────────────────────────────────────────────────────┤
   │                                                                        │
   │  1. .gitignore                 2. Hook Pre-commit                      │
   │  ┌─────────────────────────┐   ┌───────────────────────────────────┐   │
   │  │ Ignora .env, .env.*,    │   │ Ejecuta revisar-secretos.mjs      │   │
   │  │ *.pem, *.key, *.p12,    │──▶│ Bloquea commits con secretos en   │   │
   │  │ *.crt, id_rsa, creds... │   │ el área staged (git add)          │   │
   │  └─────────────────────────┘   └───────────────────────────────────┘   │
   │                                                  │                     │
   │                                                  ▼                     │
   │  4. GitHub Actions CI          3. Escáner Avanzado (revisar-secretos) │
   │  ┌─────────────────────────┐   ┌───────────────────────────────────┐   │
   │  │ Job 'escaner-secretos'  │◀──│ - Supabase secret keys            │   │
   │  │ en validar.yml bloquea  │   │ - Llaves privadas PEM / RSA / EC  │   │
   │  │ PRs con secretos        │   │ - JWTs, Resend keys, GitHub tokens│   │
   │  └─────────────────────────┘   │ - Detección prefijo público VITE_ │   │
   │                                │ - Escaneo de código e historial   │   │
   │                                └───────────────────────────────────┘   │
   └────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Matriz de Clasificación y Segregación de Variables de Entorno

| Variable | Tipo / Alcance | Exposición Permitida | Ubicación Correcta |
| :--- | :--- | :--- | :--- |
| `VITE_SUPABASE_URL` | Configuración pública del cliente | Sí (navegador / web) | Vercel (Production/Preview) / `.env.local` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Clave anónima pública Supabase | Sí (navegador / web) | Vercel (Production/Preview) / `.env.local` |
| `VITE_CONTACTO_PRIVACIDAD` | Correo de privacidad institucional | Sí (pantalla `/privacidad`) | Vercel (Production/Preview) / `.env.local` |
| `SUPABASE_SECRET_KEY` | Clave maestra administrativa | **NO (Secreto crítico)** | **Solo servidor en Vercel (sin prefijo VITE_)** |
| `CLAVE_CIFRADO_CAMPOS` | Llave AES-256-GCM para datos salud | **NO (Secreto crítico)** | **Solo servidor en Vercel (sin prefijo VITE_)** |
| `RESEND_API_KEY` | Clave API transaccional de correos | **NO (Secreto crítico)** | **Solo servidor en Vercel (sin prefijo VITE_)** |
| `ESP32_TELEMETRIA_TOKEN` | Token de ingesta para hardware | **NO (Secreto de dispositivo)** | Memoria NVS en ESP32 / Servidor Vercel |

> [!CAUTION]
> **Regla de oro de Vite:** Todo identificador con prefijo `VITE_` es incrustado directamente en el bundle JavaScript del navegador en tiempo de compilación. Las variables que contienen secretos nunca deben llevar el prefijo `VITE_`.

---

## 4. Mejoras Implementadas

### 4.1. Mantenimiento y Evolución del Escáner (`scripts/revisar-secretos.mjs`)
- **Ampliación de firmas de detección:**
  - Claves secretas de Supabase (`sb_secret_[A-Za-z0-9_-]{16,}`).
  - Llaves privadas criptográficas (`-----BEGIN (RSA|EC|DSA|OPENSSH|PGP) PRIVATE KEY-----`).
  - Tokens JWT sospechosos de 3 segmentos base64url.
  - Claves de API de Resend (`re_[A-Za-z0-9]{20,}`).
  - Tokens personales de GitHub (`ghp_...`, `github_pat_...`).
  - Credenciales de Amazon Web Services (`AKIA...`).
  - Tokens de Slack y claves secretas en vivo de Stripe (`sk_live_...`).
  - Claves de API de Google (`AIza...`).
  - Asignaciones de variables sensibles en código (`SUPABASE_SECRET_KEY=...`, `CLAVE_CIFRADO_CAMPOS=...`).
  - Prohibición explícita de variables secretas con prefijo público `VITE_` (ej. `VITE_SUPABASE_SECRET_KEY`, `VITE_RESEND_API_KEY`).
- **Soporte multimodelo (CLI y API):**
  - Modo Staged por defecto (`node scripts/revisar-secretos.mjs`) para el hook `pre-commit`.
  - Modo Todo el Repositorio (`--todo` o `--repo`) para escaneo de todos los archivos rastreados.
  - Modo Historial Nuevo (`--historial [N]` o `--rango <A..B>`) para auditar los commits recientes.
  - Exportación de funciones para integración directa con pruebas unitarias (`escanearTexto`, `escanearArchivos`, `escanearRepositorio`, `escanearHistorial`).

### 4.2. Blindaje de Archivos en `.gitignore`
Se añadieron reglas explícitas para impedir que archivos con certificados, claves privadas y credenciales JSON puedan añadirse al repositorio:
- `*.pem`, `*.key`, `*.p12`, `*.pkcs12`, `*.crt`
- `id_rsa`, `id_rsa.pub`, `id_ed25519`, `id_ed25519.pub`
- `credentials.json`, `service-account*.json`, `client_secret*.json`

### 4.3. Corrección de Segregación en `api/invitaciones/enviar.js`
Se eliminó la lectura residual `process.env.VITE_RESEND_API_KEY` restringiendo el acceso exclusivamente a `process.env.RESEND_API_KEY` (secreto serverless).

### 4.4. Automatización en CI (`.github/workflows/validar.yml`)
Se agregó el job `escaner-secretos` en GitHub Actions para verificar en cada pull request o push hacia `develop` o `main` que no existan secretos ni archivos prohibidos.

---

## 5. Verificación de Criterios de Aceptación

| Criterio de Aceptación | Resultado de la Verificación | Evidencia Técnica |
| :--- | :--- | :--- |
| **No hay claves en el código ni en el historial nuevo.** | **CUMPLIDO** | `node scripts/revisar-secretos.mjs --todo` reporta **0 secretos** en la totalidad de archivos rastreados. `node scripts/revisar-secretos.mjs --historial 20` reporta **0 secretos** en los últimos 20 commits. |

---

## 6. Batería de Pruebas Automatizadas

Se implementó el script de pruebas automatizadas `scripts/test-rf69-manejo-secretos.js` con **23 pruebas**:

1. **Detección de Archivos Prohibidos de Entorno y Llaves:** 5 pruebas (.env, .env.local, .pem, .key, credentials.json, permisión de .env.example).
2. **Detección de Patrones de Secretos en Contenido:** 10 pruebas (Supabase secret, PEM, JWT, Resend, variables sensibles, prefijo VITE_, GitHub, AWS, claves publishable).
3. **Criterio de Aceptación 1 (Código Actual):** 3 pruebas (escaneo completo repositorio, .env.example sin claves, servicios limpios).
4. **Criterio de Aceptación 2 (Historial Nuevo):** 1 prueba (escaneo de los últimos 20 commits del historial).
5. **Configuración de Seguridad (.gitignore, Hooks y CI):** 4 pruebas (.gitignore completo, api/invitaciones segregada, pre-commit activo, CI en GitHub Actions).

### Ejecución:
```bash
npm run test:rf69
```
Resultado: **23 / 23 pruebas aprobadas (100% éxito)**.
