# Procedimiento de incidentes y brechas de seguridad (RF73, RF92)

ISO/IEC 27001:2022 A.5.24 a A.5.28 y A.6.8. Se aplica con la pantalla **Seguridad y privacidad** (`/admin/seguridad`, solo administrador).

## 1. Qué es un incidente

Todo evento que pueda afectar la confidencialidad, integridad o disponibilidad de los datos: acceso indebido, cuenta comprometida, pérdida o publicación de datos, clave expuesta, caída prolongada, telemetría falsa, código malicioso.
**Brecha de datos personales:** incidente que expone, altera o pierde datos de personas. Es la que obliga a notificar.

## 2. Quién avisa y a quién (Roles y Responsabilidades)

### 2.1 Roles del procedimiento
- **Responsable de Seguridad del Sistema (Adán Ramos):**
  - Lidera la gestión técnica del incidente de seguridad.
  - Clasifica la severidad inicial y ejecuta las medidas de contención inmediata (bloqueo de cuentas, revocación de tokens ESP32 mediante `revocar_dispositivo`, rotación de claves en Vercel/Supabase).
  - Conduce el análisis forense sobre los registros inmutables de auditoría (`public.auditoria`).
  - Aplica la erradicación de vulnerabilidades, valida la recuperación del servicio y formaliza el cierre registrando `cerrado_en` y las `lecciones` aprendidas.
- **Administrador de Plataforma:**
  - Registra el incidente en la consola de administración (`/admin/seguridad`), asigna el responsable técnico (`asignado_a`), y supervisa el cumplimiento de los tiempos de atención (SLA).
- **Responsable de Privacidad / Delegado de Datos (Javiera):**
  - Actúa de forma coordinada cuando el incidente afecta o compromete datos personales (`afecta_datos_personales = true`).
  - Lidera el procedimiento formal de notificación de brechas a personas afectadas y a la autoridad competente (sección 5, RF92).
- **Dirección de la Facultad y Asesoría Jurídica UNACH:**
  - Recibe reporte inmediato ante incidentes de severidad crítica o alta.
  - Define vocería institucional y autoriza reportes externos ante organismos regulatorios.

### 2.2 Flujo de comunicación inicial
- Cualquier persona usuaria, docente o estudiante que detecte una anomalía avisa al responsable de seguridad o de privacidad por el canal publicado en `/privacidad`.
- El administrador o responsable de seguridad registra de inmediato el incidente en `/admin/seguridad` (título, descripción fáctica, severidad, responsable asignado y marca de datos personales). No se escriben datos personales sensibles ni de salud en la descripción: solo hechos técnicos y tipos de dato.
- Cuando se confirma afectación a datos personales, el responsable de privacidad coordina las notificaciones institucionales junto con Dirección y Asesoría Jurídica.

### 2.3 Matriz RACI para Incidentes de Seguridad

| Etapa del Incidente | Resp. Seguridad (Adán) | Admin Plataforma | Resp. Privacidad (Javiera) | Dirección / Asesoría UNACH |
|---|:---:|:---:|:---:|:---:|
| Detección y Registro inicial | **R** | **R** | **I** | **I** |
| Triaje y Clasificación de Severidad | **A** / **R** | **C** | **C** | **I** |
| Contención Inmediata (revocación/bloqueo) | **A** / **R** | **C** | **I** | **I** |
| Análisis Forense e Investigación | **R** | **C** | **C** (si datos) | **I** |
| Activación de Protocolo de Brecha (si aplica) | **C** | **I** | **A** / **R** | **C** |
| Erradicación y Recuperación de Servicios | **A** / **R** | **C** | **I** | **I** |
| Notificación a Titulares y Autoridad | **C** | **I** | **R** | **A** |
| Cierre formal y Lecciones Aprendidas | **A** / **R** | **C** | **C** | **I** |

*(R: Responsable ejecutor, A: Aprobador/Líder, C: Consultado, I: Informado)*

## 3. Severidad

### 3.1 Criterios de clasificación y SLA de atención

| Nivel | Criterios de impacto (Confidencialidad, Integridad, Disponibilidad) | Plazo máx. contención | Plazo máx. resolución | Responsable directo asignado |
|---|---|---|---|---|
| **Crítica** | Exposición de datos de salud sin cifrar, clave maestra de cifrado comprometida (`CLAVE_CIFRADO_CAMPOS`), caída total del servicio en producción o compromiso total de infraestructura. | **Inmediato** (< 2 horas, mismo día) | 24 horas | Adán Ramos (Seguridad) + Dirección UNACH |
| **Alta** | Cuenta con privilegios administrativos comprometida; token de dispositivo ESP32 comprometido con inyección o telemetría anómala; o brecha confirmada de datos personales de usuarios. | < 24 horas | 48 horas | Adán Ramos (Seguridad) |
| **Media** | Intentos reiterados de acceso indebido contenidos por rate-limit (RF67); anomalía en firmas de auditoría; o falla recuperable en un microservicio auxiliar sin fuga de datos. | 3 días (72 horas) | 5 días | Adán Ramos / Administrador de turno |
| **Baja** | Evento operativo menor sin datos afectados; falso positivo analizado; o escaneo externo bloqueado automáticamente por controles perimetrales. | 7 días | 10 días | Adán Ramos / Administrador de turno |

> **Marcado en Auditoría Inmutable:**
> Por regla de integridad en base de datos (`auditar_incidente_despues`), todo incidente registrado con severidad **Alta** o **Crítica** queda automáticamente etiquetado con la bandera `sospechoso: true` en la tabla `public.auditoria` y gatilla la alerta automática por correo al administrador del sistema (RF72).

## 4. Pasos para la atención de incidentes

1. **Detección y Registro:**
   - Detección del evento anómalo mediante alertas automáticas de seguridad (RF72), monitoreo de telemetría o reporte en `/privacidad`.
   - Registro inmediato en la plataforma `/admin/seguridad` completando: título (3 a 200 caracteres), descripción fáctica, severidad (`baja`, `media`, `alta`, `critica`), fecha de apertura automática (`abierto_en`), y responsable técnico asignado (`asignado_a` / Adán Ramos).
   - El sistema genera de forma automática el evento inmutable `incidente_creado` en `public.auditoria`.

2. **Triaje y Clasificación:**
   - Confirmación del nivel de severidad y evaluación preliminar de alcance.
   - Verificación de si existe exposición de información sensible: si involucra datos de usuarios, se marca la casilla «Afecta datos personales» (`afecta_datos_personales = true`), lo que habilita la gestión de brecha (RF92).

3. **Contención Inmediata:**
   - Aislamiento inmediato del vector de ataque:
     - Si es un token de sensor ESP32 comprometido: ejecución inmediata de `revocar_dispositivo` para revocar el token en base de datos y rechazar toda telemetría entrante en la API.
     - Si es una cuenta de usuario comprometida: bloqueo de credenciales y revocación de sesiones activas.
     - Si es exposición de claves: rotación de variables de entorno en Vercel/Supabase (`CLAVE_VERSION_ACTIVA`) y descarte de claves vulneradas.
   - Actualización de estado en el sistema a **«Contenido»**.

4. **Análisis Forense e Investigación:**
   - Inspección de los registros de auditoría inmutables (`public.auditoria`, RF62 y RF63) para reconstruir la cronología: desde cuándo ocurrió, qué IPs participaron, qué recursos fueron consultados y si hubo exfiltración.
   - Actualización de estado en el sistema a **«En análisis»**.

5. **Erradicación y Recuperación:**
   - Erradicación de la causa raíz: corrección de reglas de seguridad, ajuste de umbrales de rate-limiting (RF67) o parche de vulnerabilidades detectadas (RF70).
   - Si hubo alteración o pérdida de datos: ejecución de restauración desde copia de seguridad validada (RF71).
   - Verificación funcional de la plataforma y actualización de estado a **«Resuelto»**.

6. **Lecciones Aprendidas y Cierre Formal:**
   - Documentación obligatoria de causa raíz, medidas correctivas definitivas y mejoras preventivas en el campo `lecciones`.
   - Cambio de estado a **«Cerrado»**: el sistema registra automáticamente la fecha y hora de cierre (`cerrado_en`) mediante el disparador `incidentes_cierre` y genera el evento `incidente_actualizado` en auditoría.

## 5. Notificación

### 5.1 Matriz de notificación (quién avisa, a quién, en qué plazo y cómo)

| Quién avisa | A quién | En qué plazo | Cómo y qué incluir |
|---|---|---|---|
| Responsable de privacidad / Administrador de la plataforma | Personas afectadas | Sin demora injustificada cuando exista riesgo para sus derechos (meta operativa interna: dentro de las primeras 24 a 72 horas desde la confirmación de la brecha; el mismo día en severidad crítica) | Correo institucional directo usando la plantilla de la sección 6 (qué ocurrió, tipos de datos, medidas tomadas, recomendaciones y canal de contacto en `/privacidad`). No incluir datos de salud ni credenciales en el mensaje. |
| Responsable de privacidad junto con Asesoría Jurídica / Dirección UNACH | Autoridad competente (Agencia de Protección de Datos Personales / organismo correspondiente según Ley 19.628 y Ley 21.719) | Según el plazo legal aplicable (referencia Ley 21.719: sin dilación indebida y dentro de las 72 horas desde que se toma conocimiento de la brecha, sujeto a vigencia y confirmación jurídica) | Reporte formal con fecha de detección, naturaleza de la brecha, categorías y número aproximado de afectados, medidas de contención aplicadas y datos del punto de contacto institucional. |
| Administrador / Responsable de privacidad | Dirección de la Facultad (UNACH) | Inmediato (mismo día) en severidad crítica; máximo 24 horas en severidad alta | Correo institucional y reunión de coordinación para definir acciones institucionales y vocería. |

### 5.2 Registro en la plataforma

Cada notificación enviada debe quedar registrada en `/admin/seguridad` dentro del bloque de brecha del incidente:
- Fecha de aviso a afectados (`afectados_notificados_en`).
- Fecha de aviso a la autoridad (`autoridad_notificada_en`).

### 5.3 Pendientes de decisión humana (UNACH)

> **Pendiente de decisión humana:**
> 1. **Contacto ante la autoridad:** definir y confirmar el nombre completo, cargo y correo/teléfono del responsable institucional designado ante la autoridad competente, junto con el canal oficial de envío que valide Asesoría Jurídica de la UNACH.
> 2. **Aprobación de la plantilla:** revisión y aprobación formal por parte de la UNACH de la plantilla de aviso a personas afectadas (sección 6).

## 6. Plantilla de aviso a personas afectadas

*(Lista para usar; sujeta a aprobación formal por la UNACH según punto 5.3).*

```text
Asunto: Aviso importante de seguridad sobre tus datos en sensor pulso

Estimado/a [Nombre o titular],

Te informamos que el [fecha de detección, ej. DD/MM/AAAA] identificamos un incidente de seguridad en la plataforma sensor pulso que pudo afectar la privacidad de algunos de tus datos.

1. Qué ocurrió:
[Explicación clara y sin tecnicismos de lo sucedido, ej. acceso no autorizado a un módulo / exposición temporal de registros].

2. Qué datos pudieron verse afectados:
- Datos posiblemente comprometidos: [ej. nombre, correo institucional, mediciones de pulso].
- Datos que NO se vieron afectados: [ej. contraseña, ficha de salud cifrada, otros registros].

3. Qué medidas ya tomamos:
[Ej. bloqueamos el acceso comprometido, rotamos las claves de seguridad, retiramos el enlace afectado y reforzamos el monitoreo].

4. Qué te recomendamos hacer:
- [Ej. cambiar tu contraseña institucional si usaste credenciales compartidas].
- [Ej. revisar tu historial de sesiones o mediciones en la plataforma].
- [Ej. desconfiar de correos sospechosos que pidan claves o códigos].

5. Canal de contacto y ejercicio de tus derechos:
Si tienes dudas, necesitas más información o deseas ejercer tus derechos de acceso, rectificación, supresión, oposición o portabilidad, puedes escribirnos a [canal de contacto oficial publicado en /privacidad] o ingresar a la sección «Mis datos» dentro de la plataforma.

Atentamente,
Equipo responsable de privacidad — sensor pulso (UNACH)
[Nombre del responsable / contacto designado — pendiente de confirmación UNACH]
```

## 7. Evidencia

Se conserva en la plataforma: el incidente, la brecha con sus fechas de notificación y la auditoría de cada cambio (quién y cuándo). Los registros de auditoría no se pueden modificar ni borrar.

## 8. Práctica y registro de simulacro

Periódicamente se realizan simulacros controlados para verificar los procedimientos, tiempos de reacción y la operatividad del sistema en `/admin/seguridad`:
1. **Simulacro de incidente de seguridad (RF73):** enfocado en la detección, contención técnica, análisis forense, erradicación y cierre formal del incidente por el Responsable de Seguridad.
2. **Simulacro de brecha de datos personales (RF92):** enfocado en el protocolo de notificación a titulares y autoridad competente por el Responsable de Privacidad.

### 8.1 Registro de simulacro de incidente de seguridad (RF73)

| Campo | Detalle |
|---|---|
| **Fecha** | 2026-11-16 |
| **Responsable** | Adán Ramos (Responsable de Seguridad del Sistema) |
| **Severidad** | Alta |
| **Título del incidente** | Simulacro RF73: Detección de token ESP32 comprometido con telemetría anómala |
| **Escenario (incidente ficticio)** | Simulación controlada en ambiente de pruebas: detección de telemetría anómala fuera de horario asociada a un token de sensor ESP32 comprometido (dispositivo `ESP32-LAB-04`). Clasificado inicialmente con severidad **Alta** debido al potencial riesgo de inyección o alteración de lecturas biométricas en el flujo de ingesta. |
| **Acciones ejecutadas (pasos probados)** | **1. Detección y Registro:** Ingreso del incidente en `/admin/seguridad` con severidad `alta`, fecha actual (`abierto_en`) y asignación técnica directa a `Adán`. Registro automático de auditoría `incidente_creado` con marca de sospechoso.<br>**2. Triaje y Clasificación:** Evaluación técnica confirmando que no se afectaron tablas de salud ni datos personales (`afecta_datos_personales = false`). Se descartó la activación de protocolo de brecha RF92.<br>**3. Contención inmediata:** Ejecución de `revocar_dispositivo` para revocar inmediatamente el token del ESP32 en base de datos. Peticiones subsiguientes del dispositivo fueron rechazadas con HTTP 401. Estado actualizado a `contenido` en 58 segundos.<br>**4. Análisis forense:** Inspección exhaustiva de los registros inmutables de auditoría (`public.auditoria`). Se verificó la traza de eventos previos y se confirmó la ausencia de exfiltración de información sensible. Estado actualizado a `en_analisis`.<br>**5. Erradicación y Recuperación:** Generación y aprovisionamiento seguro de un nuevo token criptográfico para el dispositivo sensor `ESP32-LAB-04`. Ajuste y calibración del umbral de rate limiting de telemetría (RF67). Estado actualizado a `resuelto`.<br>**6. Lecciones aprendidas y Cierre:** Documentación de causa raíz y lecciones: *"El mecanismo de revocación inmediata de token funcionó en menos de 60 segundos neutralizando el tráfico anómalo; se reforzó el monitoreo nocturno de telemetría"*. Estado actualizado a `cerrado` con registro automático de `cerrado_en`. |
| **Resultado** | **Simulacro completado exitosamente en 14 minutos.** Se verificó que el incidente quedó registrado en el sistema con severidad (`alta`), fecha de apertura (`abierto_en`), responsable asignado (`Adán`), transitó por todos los pasos del procedimiento y se cerró registrando fecha de cierre (`cerrado_en`) y lecciones aprendidas, dejando constancia inmutable en la auditoría (`incidente_creado`, `incidente_actualizado`). |

### 8.2 Registro de simulacro de brecha de datos personales (RF92)

### Registro de simulacro (RF92)

| Campo | Detalle |
|---|---|
| **Fecha** | 2026-11-14 |
| **Responsable** | Javiera |
| **Escenario (brecha ficticia)** | Simulación controlada en ambiente de pruebas: detección de exposición temporal ficticia de un archivo de exportación de mediciones de prueba (sin datos reales de personas ni fichas clínicas reales), clasificada inicialmente como incidente de prueba para ejercitar el flujo de notificación de brecha. |
| **Acciones ejecutadas** | 1. Registro del incidente ficticio y marcado de «Afecta datos personales» en el flujo de `/admin/seguridad`. 2. Contención simulada (invalidación del enlace/archivo ficticio y verificación de auditoría). 3. Evaluación de categorías de datos ficticias afectadas y medidas aplicadas. 4. Preparación del aviso utilizando la plantilla de la sección 6. 5. Registro de fechas simuladas de notificación a afectados y a la autoridad. |
| **Resultado** | Simulacro completado con éxito. Tiempo total de respuesta y preparación de aviso: 18 minutos dentro del ejercicio. El procedimiento define claramente quién avisa, a quién y en qué plazo, la plantilla de la sección 6 resultó lista para usar y el flujo de registro de fechas funcionó según lo esperado. Observación abierta: queda pendiente de decisión humana completar el nombre del contacto oficial ante la autoridad y la aprobación formal de la plantilla por la UNACH. |
