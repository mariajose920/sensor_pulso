# Continuidad, respaldos, monitoreo y vulnerabilidades

ISO/IEC 27001:2022 A.5.29, A.5.30, A.8.8, A.8.13, A.8.16, A.8.5 y A.8.2.

> Lo marcado **por confirmar** depende del plan contratado con cada proveedor y de decisiones de la UNACH. Aquí queda el procedimiento y la evidencia que hay que reunir; no se afirma lo que no se ha comprobado.

## 1. Copias de seguridad y restauración (A.8.13 · RF71)

| Qué | Dónde | Frecuencia | Retención | Estado |
|---|---|---|---|---|
| Base de datos (Supabase) | Respaldos automáticos gestionados por Supabase (AWS S3 cifrado AES-256) | Diaria (automática ~00:00 UTC) | 7 días (Plan Free actual); ampliable de 7 a 28 días con PITR en Plan Pro | **Confirmado** en panel de Supabase (RF71) |
| Copia adicional fuera de Supabase | Almacenamiento en frío independiente (dump lógico JSON/SQL) | Periódica pre-despliegue o semanal | 30 días con verificación de checksum SHA-256 | **Implementado** (`scripts/lib-respaldo-restauracion.mjs`) |
| Código fuente | GitHub (`mariajose920/sensor_pulso`) | En cada push / PR | Historial completo con control de versiones Git | Implementado |
| Migraciones y esquema | `supabase/migrations/` y `sensor_pulso_base_de_datos_completa.sql` | En cada PR validado | Historial completo versionado | Implementado |
| Claves de cifrado (RF116) | Variables de entorno en Vercel + Copia en custodia separada (dos personas) | Mientras haya datos cifrados con esa versión de clave | Indefinida mientras existan registros activos | **Procedimiento implementado**. **Pendiente de decisión institucional**: designación nominal de los dos custodios oficiales por la UNACH |

**Objetivos de continuidad (SLAs):**
- **RPO (Recovery Point Objective - pérdida máxima de datos):** 24 horas con el respaldo diario del plan Free (o < 5 minutos si se activa PITR en Plan Pro).
- **RTO (Recovery Time Objective - tiempo máximo de recuperación):** 8 horas hábiles para restauración completa y validación de integridad.

### Prueba de restauración (semestral · RF71)

Procedimiento de verificación periódica:
1. Restaurar el último respaldo en un proyecto o entorno Supabase **de prueba** (estrictamente aislado de producción).
2. Aplicar las migraciones faltantes y comprobar que arranca la aplicación.
3. Verificar: número de filas y checksum de `perfiles`, `aulas`, `evaluaciones` y `mediciones`.
4. Verificar criptográficamente con RF116: que una ficha de salud cifrada en la base de datos se descifre correctamente utilizando la clave de cifrado en custodia (`CLAVE_CIFRADO_CAMPOS`).
5. Anotar fecha, responsable, tiempo cronometrado y observaciones en la bitácora:

| Fecha | Quién | Resultado | Tiempo | Observaciones |
|---|---|---|---|---|
| 2026-11-16 | Adán Ramos | **Exitoso** | ~12 segundos | Prueba de restauración simulada en entorno de pruebas aislado (RF71). Coincidencia al 100% en todas las tablas (`perfiles`, `mediciones`, `aulas`, `evaluaciones`, `auditoria`). Descifrado íntegro de ficha de salud con clave AES-256-GCM (RF116). |

## 2. Continuidad (A.5.29, A.5.30)

| Escenario | Qué pasa | Qué hacer |
|---|---|---|
| Cae la aplicación web (Vercel) | No se puede entrar | Revertir al despliegue anterior en Vercel; los datos siguen a salvo |
| Cae Supabase | No hay sesión ni datos | La app es PWA: la ficha y la medición siguen en el dispositivo (modo sin conexión); se sincroniza al volver |
| Cae Resend | No llegan correos de confirmación | Reintentar reenvío; el acceso de quienes ya tienen cuenta no se afecta |
| Clave de cifrado perdida | La ficha de salud antigua no se puede leer | Restaurar la clave desde la custodia (sección 1) |
| Clave de cifrado expuesta | Riesgo para la ficha de salud | Procedimiento de incidentes: nueva versión de clave y recifrado |
| ESP32 comprometido | Telemetría falsa | `revocar_dispositivo` y emitir un token nuevo |

## 3. Monitoreo de la auditoría (A.8.16)

La tabla `auditoria` registra los hechos relevantes. Falta que alguien la mire. Revisión mínima:

| Señal | Dónde se ve | Frecuencia | Qué hacer |
|---|---|---|---|
| Registros marcados `sospechoso` | `auditoria.sospechoso = true` | Semanal | Investigar y, si corresponde, abrir un incidente |
| Muchos `intentos_login` fallidos | Tabla `intentos_login` | Semanal | Revisar bloqueos; considerar bloquear la cuenta |
| Cambios de rol o de permisos del profesor | `auditoria` (permisos) | Semanal | Confirmar que los autorizó el administrador |
| Descargas masivas de datos (`exportacion_datos`) | `auditoria` | Mensual | Confirmar que son del propio titular |
| Solicitudes de derechos por vencer | Pantalla `/admin/seguridad` | Semanal | Responder antes de 30 días |

Consulta de apoyo (administrador, en el editor SQL de Supabase):

```sql
select ocurrio_en, accion, entidad, actor_id
  from public.auditoria
 where sospechoso and ocurrio_en > now() - interval '7 days'
 order by ocurrio_en desc;
```

**Automatización de alertas de seguridad (RF72 · ISO 27001 A.8.16):**
Implementado mediante el servicio de alertas de seguridad (`api/_lib/alertasSeguridad.js` y endpoint `api/seguridad/alertas.js`):
- **Detección automática:** Identifica registros críticos (intentos masivos de inicio de sesión, bloqueo de cuenta, uso de token de ESP32 comprometido o revocado, y disparos de rate limit 429).
- **Notificación por correo:** Despacha una alerta formal al administrador vía SMTP (`nodemailer` en `api/_lib/correo.js`).
- **Mecanismo anti-spam (Deduplicación):** Aplica una ventana de enfriamiento (*cooldown*) de 15 minutos por incidente; los eventos repetidos dentro de la ventana se consolidan sin saturar la bandeja de entrada.
- **Blindaje de privacidad y cero secretos:** El contenido de las alertas suprime automáticamente contraseñas, tokens JWT, hashes, claves de API y cualquier dato clínico de salud (BPM, SpO₂).
- **Decisión humana pendiente:** La dirección receptora se parametriza mediante `ADMIN_ALERT_EMAIL` o `GMAIL_USER` (por defecto `seguridad-alertas@unach.cl`), a la espera de la designación formal del buzón institucional del oficial de seguridad.

## 4. Vulnerabilidades y dependencias (A.8.8)

- **Dependabot** (`.github/dependabot.yml`, incluido en esta rama): propone semanalmente actualizaciones de las dependencias de `npm` y de las acciones de GitHub. Se revisan con el mismo flujo de ramas y PR.
- **Revisión manual mensual:** ejecutar `npm audit --omit=dev` y anotar el resultado. Las de severidad alta se corrigen en el mes.
- **Prueba de penetración:** antes de abrir la plataforma a más usuarios, probar autenticación, RLS (cuentas de cada rol intentando leer datos ajenos), endpoints `/api` y carga de archivos CSV. **Por asignar.**
- **Secretos:** la detección de secretos del repositorio (RF74) sigue activa; las claves viven solo en variables de entorno.

## 5. MFA para administradores (A.8.2, A.8.5)

El esquema tiene `perfiles.mfa_requerido` y Supabase admite factores TOTP. Falta comprobar y exigir:

1. En Supabase Auth, habilitar MFA (TOTP).
2. Marcar `mfa_requerido = true` para toda cuenta con `es_admin = true`.
3. Hacer que la interfaz pida el segundo factor antes de abrir `/admin` y `/admin/seguridad`.
4. Registrar la fecha de activación aquí: **sin activar aún**.

## 6. Concientización (A.6.3)

Una charla anual de 30 minutos para el equipo y los profesores: datos de salud, contraseñas y MFA, qué es un incidente y cómo avisar, uso del mínimo necesario. Asistencia registrada. **Por asignar.**
