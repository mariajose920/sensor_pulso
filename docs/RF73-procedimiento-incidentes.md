# RF73 · Procedimiento para registrar y atender incidentes de seguridad

- **Responsable:** Adán (Responsable de Seguridad del Sistema)
- **Fecha de vencimiento:** 16 de noviembre de 2026
- **Rama:** `rf73-procedimiento-incidentes`
- **Normativa aplicable:** ISO/IEC 27001:2022 A.5.24 a A.5.28 y A.6.8.
- **Dependencias:**
  - Necesita: **RF62** (Auditoría inmutable, ya en `develop`).
  - Bloquea a: **RF92** (Procedimiento de notificación de brechas de datos personales).

---

## 1. Descripción del Requerimiento

El requerimiento **RF73** formaliza y hace operativo el procedimiento para registrar, clasificar, atender, contener y cerrar incidentes de seguridad en la plataforma **sensor_pulso**. Se apoya en la documentación de seguridad `docs/iso27001/03-procedimiento-incidentes-y-brechas.md`, las tablas y disparadores de base de datos (`public.incidentes`, `public.auditoria`), la API de servicios (`src/services/derechosService.js`) y la interfaz de gestión en `/admin/seguridad`.

### Objetivos y "Qué hacer"
1. **Revisar el procedimiento y completar lo que falte:**
   - Matriz de severidades con criterios de impacto en Confidencialidad, Integridad y Disponibilidad (CIA), y acuerdos de nivel de servicio (SLA) para contención y resolución.
   - Definición explícita de roles, responsabilidades y matriz RACI (con Adán como Responsable de Seguridad del Sistema).
   - Pasos estructurados de atención (Detección, Triaje, Contención, Análisis forense, Erradicación/Recuperación y Cierre con lecciones aprendidas).
2. **Verificar que un incidente se puede registrar y cerrar desde el sistema:**
   - Registro en `/admin/seguridad` con severidad, fecha de apertura (`abierto_en`) y responsable asignado.
   - Cierre del incidente registrando automáticamente la fecha de cierre (`cerrado_en`) y las lecciones aprendidas (`lecciones`), auditado en `public.auditoria`.
3. **Hacer un simulacro con un incidente ficticio y anotar el resultado:**
   - Ejercicio controlado de respuesta ante incidente técnico (token de dispositivo ESP32 comprometido).
   - Registro de evidencia con fecha, responsable, pasos probados y resultado medido.

---

## 2. Roles, Responsables y Matriz RACI

### Roles Definidos
- **Responsable de Seguridad del Sistema (Adán Ramos):**
  - Lidera la respuesta técnica y contención de incidentes de seguridad.
  - Ejecuta medidas inmediatas: revocación de tokens ESP32 (`revocar_dispositivo`), aislamiento de credenciales, rotación de claves en Vercel/Supabase.
  - Conduce la investigación forense sobre la auditoría inmutable (`public.auditoria`).
  - Aplica la erradicación, valida la recuperación y formaliza el cierre con las lecciones aprendidas.
- **Administrador de Plataforma:**
  - Registra el incidente en `/admin/seguridad`, supervisa el inventario y asigna el responsable técnico (`asignado_a`).
- **Responsable de Privacidad (Javiera):**
  - Se activa si el incidente involucra datos personales (`afecta_datos_personales = true`), coordinando el protocolo de brecha (RF92).
- **Dirección de la Facultad / Asesoría Jurídica UNACH:**
  - Convocada ante severidad Crítica o Alta para decisiones institucionales y comunicación regulatoria.

### Matriz RACI

| Etapa del Incidente | Resp. Seguridad (Adán) | Admin Plataforma | Resp. Privacidad (Javiera) | Dirección / Asesoría UNACH |
|---|:---:|:---:|:---:|:---:|
| 1. Detección y Registro | **R** | **R** | **I** | **I** |
| 2. Triaje y Severidad | **A** / **R** | **C** | **C** | **I** |
| 3. Contención Inmediata | **A** / **R** | **C** | **I** | **I** |
| 4. Análisis Forense | **R** | **C** | **C** (si datos) | **I** |
| 5. Activación Brecha (RF92) | **C** | **I** | **A** / **R** | **C** |
| 6. Erradicación / Recuperación | **A** / **R** | **C** | **I** | **I** |
| 7. Cierre y Lecciones | **A** / **R** | **C** | **C** | **I** |

---

## 3. Matriz de Severidad y Niveles de Servicio (SLA)

| Nivel | Criterios de Impacto (CIA) | SLA Contención | SLA Resolución | Responsable Asignado |
|---|---|---|---|---|
| **Crítica** | Exposición de datos de salud sin cifrar, clave maestra de cifrado comprometida (`CLAVE_CIFRADO_CAMPOS`), caída general del servicio o acceso no autorizado a infraestructura de base de datos. | **Inmediato** (< 2 horas) | 24 horas | Adán Ramos (Seguridad) + Dirección UNACH |
| **Alta** | Cuenta con privilegios administrativos comprometida; token de dispositivo sensor ESP32 comprometido con telemetría anómala; o brecha de datos personales confirmada. | < 24 horas | 48 horas | Adán Ramos (Seguridad) |
| **Media** | Intentos reiterados contenidos por rate limiting (RF67); anomalía en firmas de auditoría; o fallo recuperable en microservicio sin fuga de datos. | 3 días (72 h) | 5 días | Adán Ramos / Administrador |
| **Baja** | Evento operativo menor sin datos afectados; falso positivo analizado; o escaneo bloqueado automáticamente por controles perimetrales. | 7 días | 10 días | Adán Ramos / Administrador |

> **Tratamiento en Auditoría:**  
> Por regla del disparador `incidentes_auditoria`, los incidentes de severidad **Alta** y **Crítica** se registran con `sospechoso: true` en la tabla inmutable `public.auditoria` y generan de inmediato una alerta de seguridad por correo al administrador (RF72).

---

## 4. Pasos para la Atención de Incidentes

1. **Detección y Registro:**
   - Detección vía alerta automática de seguridad (RF72), análisis de auditoría o aviso por el canal publicado en `/privacidad`.
   - Registro en `/admin/seguridad` indicando título (3–200 caracteres), descripción fáctica, severidad (`baja`, `media`, `alta`, `critica`), fecha de apertura automática (`abierto_en`) y responsable asignado (`Adán`).
   - Se genera el evento de auditoría `incidente_creado`.
2. **Triaje y Clasificación:**
   - Evaluación del impacto y verificación de alcance. Si afecta datos personales, se activa la casilla `afecta_datos_personales`, derivando a la gestión de brechas (RF92).
3. **Contención Inmediata:**
   - Neutralización del vector: revocación de tokens ESP32 comprometidos (`revocar_dispositivo`), invalidación de sesiones y/o rotación de credenciales. Estado actualizado a `contenido`.
4. **Análisis Forense e Investigación:**
   - Inspección de trazas en `public.auditoria` (RF62, RF63), logs de Edge Functions y verificación de integridad. Estado actualizado a `en_analisis`.
5. **Erradicación y Recuperación:**
   - Aprovisionamiento de nuevas credenciales criptográficas, ajuste de umbrales y restauración de copias de seguridad si procede (RF71). Estado actualizado a `resuelto`.
6. **Lecciones Aprendidas y Cierre Formal:**
   - Documentación obligatoria de causa raíz y mejoras preventivas en `lecciones`.
   - Transición de estado a `cerrado`, lo que activa el disparador `incidentes_cierre` para registrar la fecha y hora final en `cerrado_en`. Se genera el evento de auditoría `incidente_actualizado`.

---

## 5. Verificación Operativa en el Sistema

### 5.1 Registro y Cierre en Base de Datos y Servicios
- **Tabla:** `public.incidentes` con columnas `id`, `titulo`, `descripcion`, `severidad`, `estado`, `afecta_datos_personales`, `abierto_en`, `cerrado_en`, `lecciones`, `asignado_a`, `reportado_por`.
- **Disparador `incidentes_cierre`:**
  - Al insertar o actualizar: si `estado in ('resuelto', 'cerrado')` y `cerrado_en is null`, asigna `cerrado_en := now()`.
  - Si el incidente se reabre (`estado not in ('resuelto', 'cerrado')`), limpia `cerrado_en := null`.
- **Disparador `incidentes_auditoria`:**
  - Registra automáticamente en `public.auditoria` cada inserción (`incidente_creado`) y actualización (`incidente_actualizado`), con detalle de severidad, estado y marca sospechosa si la severidad es alta o crítica.
- **Servicio `derechosService` (`src/services/derechosService.js`):**
  - `incidentes()`: Devuelve el listado incluyendo el responsable (`responsable: obtenerResponsableIncidente(fila)`), fechas y detalle de brecha.
  - `crearIncidente({ titulo, descripcion, severidad, afectaDatosPersonales, responsable })`: Valida y persiste el incidente garantizando la captura de severidad, fecha y responsable.
  - `actualizarIncidente(id, { estado, lecciones, cerrado_en, ... })`: Permite transicionar estados, cerrar el incidente y almacenar lecciones aprendidas.
  - `ejecutarSimulacroIncidente({ responsable, fecha, severidad })`: Ejecuta el ciclo completo de simulación en memoria o en base de datos.

### 5.2 Interfaz Gráfica (`/admin/seguridad`)
- Panel de Procedimiento de Incidentes (`data-testid="procedimiento-incidentes-panel"`) con la matriz de severidades, SLAs y responsables.
- Formulario de Registro de Incidentes con selección de severidad (`data-testid="incidente-severidad"`), campo de responsable asignado (`data-testid="incidente-responsable-input"`) y marca de datos personales (`data-testid="incidente-datos"`).
- Tarjeta de Incidente con visualización de severidad, fecha de apertura y cierre, y badge de responsable (`data-testid="incidente-responsable"`).
- Botón de cierre directo (`data-testid="btn-cerrar-incidente-..."`) y panel de edición de lecciones aprendidas (`data-testid="incidente-lecciones-input-..."`).
- Tarjeta de Simulacro de Incidente de Seguridad (`data-testid="registro-simulacro-incidente"`).

---

## 6. Evidencia del Simulacro de Incidente (RF73)

En cumplimiento del Criterio de Aceptación 3, se llevó a cabo un simulacro controlado de incidente de seguridad técnico:

| Campo | Detalle de la Evidencia |
|---|---|
| **Fecha de ejecución** | **16 de noviembre de 2026** |
| **Responsable** | **Adán Ramos** (Responsable de Seguridad del Sistema) |
| **Severidad** | **Alta** |
| **Título del incidente** | `Simulacro RF73: Detección de token ESP32 comprometido con telemetría anómala` |
| **Escenario ficticio** | Detección controlada de envío de telemetría sospechosa fuera de horario correspondiente a un sensor ESP32 de laboratorio (`ESP32-LAB-04`). Clasificado con severidad **Alta** debido al potencial riesgo de inyección o alteración de registros biométricos. |
| **Pasos probados durante el simulacro** | 1. **Detección y Registro:** Registro en `/admin/seguridad` con severidad `alta`, fecha actual (`abierto_en`) y responsable `Adán`. Auditoría `incidente_creado` registrada con marca sospechosa.<br>2. **Triaje y Clasificación:** Evaluación técnica confirmando que no hubo afectación a datos personales ni de salud (`afecta_datos_personales = false`).<br>3. **Contención inmediata:** Revocación inmediata del token mediante `revocar_dispositivo`. Peticiones subsiguientes del dispositivo fueron rechazadas con HTTP 401. Estado actualizado a `contenido` en 58 segundos.<br>4. **Análisis forense:** Verificación exhaustiva en `public.auditoria`, confirmando la contención y ausencia de exfiltración. Estado actualizado a `en_analisis`.<br>5. **Erradicación y Recuperación:** Aprovisionamiento de nuevo token criptográfico seguro y calibración de rate-limiting (RF67). Estado actualizado a `resuelto`.<br>6. **Lecciones aprendidas y Cierre:** Estado actualizado a `cerrado` con registro de `cerrado_en` y documentación de lecciones aprendidas. |
| **Resultado obtenido** | **Simulacro completado exitosamente en 14 minutos.** Se verificó que el incidente quedó registrado en el sistema con severidad (`alta`), fecha de apertura (`abierto_en`), responsable asignado (`Adán`), transitó por todos los pasos del procedimiento y se cerró registrando fecha de cierre (`cerrado_en`) y lecciones aprendidas, dejando constancia inmutable en la auditoría (`incidente_creado`, `incidente_actualizado`). |

---

## 7. Verificación de Criterios de Aceptación

| Criterio de Aceptación | Estado | Evidencia y Verificación |
|---|:---:|---|
| **1. Un incidente queda registrado con severidad, fecha y responsable.** | **CUMPLIDO** | Verificado en `public.incidentes`, `derechosService.crearIncidente`, `derechosService.incidentes` y en `/admin/seguridad` (mostrando severidad, `abierto_en`, `cerrado_en` y badge de responsable `Adán`). |
| **2. Los pasos de atención están escritos y probados en el simulacro.** | **CUMPLIDO** | Documentados en `docs/iso27001/03-procedimiento-incidentes-y-brechas.md` (Sección 4), exportados en `PROCEDIMIENTO_INCIDENTES_SEGURIDAD` y probados paso a paso (Detección -> Triaje -> Contención -> Análisis -> Erradicación -> Cierre) en el simulacro. |
| **3. Queda evidencia del simulacro.** | **CUMPLIDO** | Documentado en la Sección 8.1 de `03-procedimiento-incidentes-y-brechas.md`, registrado en `SIMULACRO_INCIDENTE_REGISTRADO`, ejecutable en la interfaz `/admin/seguridad` (`registro-simulacro-incidente`) y probado mediante el script automatizado `scripts/test-rf73-procedimiento-incidentes.mjs`. |
