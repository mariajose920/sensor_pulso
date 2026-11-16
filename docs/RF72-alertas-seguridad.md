# RF72 · Notificación Automática de Alertas de Seguridad al Administrador

Requerimiento: *Notificar al administrador ante eventos de seguridad (intentos masivos, token de ESP32 comprometido). La documentación deja esta automatización como pendiente.*  
Responsable: **Adán**  
Fecha de vencimiento: **17 de noviembre de 2026**  
Rama: `rf72-alertas-seguridad`  
Dependencias:
- **Necesita:** RF62, RF63 (ya en develop).
- **Bloquea a:** Nadie.

---

## 1. Alcance y Normativas de Ciberseguridad

El requerimiento **RF72** automatiza el ciclo de respuesta a incidentes de seguridad para *sensor_pulso*, cerrando la brecha identificada en el diseño inicial del Sistema de Gestión de Seguridad de la Información (SGSI) donde el monitoreo de la auditoría se realizaba únicamente de forma manual y periódica:

- **ISO/IEC 27001:2022 (Control A.8.16 — Monitoreo de actividades):** Los registros de auditoría deben ser monitoreados activamente para detectar comportamientos anómalos o de riesgo, y disparar acciones correctivas oportunas.
- **OWASP Top 10 (A09:2021 — Security Logging and Monitoring Failures):** Previene la falta de visibilidad operativa garantizando que los ataques de fuerza bruta, el abuso de APIs o el compromiso de dispositivos de hardware generen alertas inmediatas al equipo de respuesta.
- **CWE-117 (Improper Output Handling for Logs) & CWE-200 (Exposure of Sensitive Information):** Asegura que las alertas enviadas por correo nunca incluyan secretos, tokens de acceso ni datos clínicos de salud (BPM, SpO₂).

---

## 2. Arquitectura de Detección y Notificación

```
   ┌────────────────────────────────────────────────────────────────────────┐
   │                Flujo de Alerta de Seguridad Automática                 │
   ├────────────────────────────────────────────────────────────────────────┤
   │                                                                        │
   │  1. Eventos Críticos Detectados en Auditoría (RF62 / RF63)             │
   │     - Intentos masivos fallidos de login / bloqueo de cuenta           │
   │     - Telemetría ESP32 con token no autorizado o revocado (RF54)       │
   │     - Superación del Rate Limit (HTTP 429) persistente (RF67)          │
   │     - Registros con flag `sospechoso: true`                            │
   │                                   │                                    │
   │                                   ▼                                    │
   │  2. Filtro Anti-Spam (Deduplicación con Cooldown de 15 min)            │
   │     - Clave única de incidente: tipo:entidad_id                        │
   │     - Si ocurre más de 1 vez en 15 min, consolida y no satura bandeja  │
   │                                   │                                    │
   │                                   ▼                                    │
   │  3. Filtro Estricto de Privacidad y Cero Secretos                      │
   │     - SUPRIME: Contraseñas, tokens de sesión, JWTs, claves privadas    │
   │     - SUPRIME: Datos de salud clínica (BPM, SpO₂, ritmo, curvas)       │
   │     - ANONIMIZA: Direcciones IP conservando solo subred forense        │
   │                                   │                                    │
   │                                   ▼                                    │
   │  4. Despacho SMTP (api/_lib/correo.js vía Nodemailer)                  │
   │     - Envío seguro vía SMTP (Gmail institucional / Relay Vercel)       │
   │     - Destinatario configurable por entorno (decisión humana)          │
   │                                                                        │
   └────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Criterios de Aceptación Cumplidos

### Criterio 1: Un evento sospechoso simulado genera un correo al administrador
El servicio `api/_lib/alertasSeguridad.js` y el endpoint `api/seguridad/alertas.js` analizan las entradas mediante `esEventoCritico()`. Al recibir eventos clasificados como sospechosos (por ejemplo, `token_esp32_revocado` o `login_fallido_masivo`), se genera inmediatamente un correo electrónico formateado con tarjeta de advertencia roja, metadatos forenses y recomendaciones de mitigación.

### Criterio 2: No se repite el mismo aviso muchas veces (Deduplicación)
Para evitar que un ataque automatizado (ej. 500 intentos de inicio de sesión en un minuto) colapse la bandeja del administrador con cientos de correos:
* Se implementó `comprobarDeduplicacion()` con una ventana de enfriamiento (*cooldown*) de **15 minutos** por incidente.
* La primera ocurrencia genera el correo inmediato.
* Las ocurrencias subsiguientes dentro de la ventana se contabilizan en memoria como `suprimidos`.
* Al pasar la ventana, el siguiente correo incluye una notificación indicando cuántos eventos adicionales fueron suprimidos/consolidados.

### Criterio 3: El aviso no incluye secretos ni datos de salud
La función `sanitizarDetallesParaAlerta()` aplica una lista de exclusión y expresiones regulares forenses que garantizan:
1. **Cero Secretos:** Se eliminan o reemplazan por `[RESERVADO_POR_SEGURIDAD]` claves privadas, tokens `sb_secret_...`, tokens ESP32 completos (`esp_...`), contraseñas y JWTs.
2. **Cero Datos de Salud:** Se eliminan campos y valores de `bpm`, `spo2`, frecuencias, saturación o etiquetas de patología médica.
3. **Anonimización de IP:** Las direcciones IPv4 se enmascaran en su último octeto (ej. `192.168.1.xxx`).

---

## 4. Pendiente de Decisión Humana: Destinatario de Avisos

Conforme a lo especificado en la tarjeta del requerimiento:
* **Estado:** Pendiente de designación formal por la jefatura del proyecto o la institución.
* **Manejo en la aplicación:** El sistema no fuerza un correo personal quemado en el código. Lee dinámicamente:
  1. `process.env.ADMIN_ALERT_EMAIL` (Variable de entorno en Vercel/local).
  2. `process.env.CORREO_ADMIN_ALERTAS`.
  3. `process.env.GMAIL_USER` (como fallback del sistema).
  4. Valor por defecto auditable: `seguridad-alertas@unach.cl`.
* En cuanto la administración decida el correo exacto del oficial de ciberseguridad, basta con definir `ADMIN_ALERT_EMAIL` en las variables de entorno sin modificar una sola línea de código fuente.

---

## 5. Verificación y Pruebas Automatizadas

Se implementó la suite completa en `scripts/test-rf72-alertas-seguridad.mjs`, ejecutable mediante:

```bash
npm run test:rf72
```

La suite valida automáticamente:
1. Detección certera de eventos críticos vs no críticos.
2. Despacho exitoso de correos con transporte simulado (`usarTransporte`).
3. Resistencia a ráfagas y no repetición de correos en ventana de 15 minutos (Deduplicación anti-spam).
4. Erradicación total de contraseñas, tokens y datos médicos en los correos generados.
5. Disponibilidad del endpoint `/api/seguridad/alertas`.
