# Procedimiento de incidentes y brechas de seguridad (RF73, RF92)

ISO/IEC 27001:2022 A.5.24 a A.5.28 y A.6.8. Se aplica con la pantalla **Seguridad y privacidad** (`/admin/seguridad`, solo administrador).

## 1. Qué es un incidente

Todo evento que pueda afectar la confidencialidad, integridad o disponibilidad de los datos: acceso indebido, cuenta comprometida, pérdida o publicación de datos, clave expuesta, caída prolongada, telemetría falsa, código malicioso.
**Brecha de datos personales:** incidente que expone, altera o pierde datos de personas. Es la que obliga a notificar.

## 2. Quién avisa y a quién

- Cualquier persona que detecte un incidente o brecha avisa al **responsable de privacidad** por el canal indicado en `/privacidad`.
- El administrador lo registra en `/admin/seguridad` (título, qué pasó, severidad, si afecta datos personales). No se escriben datos personales ni de salud en la descripción: solo hechos y tipos de dato.
- Cuando se confirma una brecha de datos personales, el **responsable de privacidad / administrador** coordina y ejecuta las notificaciones correspondientes junto con la Dirección de la Facultad y asesoría jurídica de la UNACH (ver sección 5).

## 3. Severidad

| Nivel | Cuándo | Plazo para contener |
|---|---|---|
| Crítica | Datos de salud expuestos o clave de cifrado comprometida | Inmediato (mismo día) |
| Alta | Cuenta de administrador comprometida; datos personales expuestos | 24 horas |
| Media | Intento de acceso indebido contenido; falla de un control | 3 días |
| Baja | Evento sin datos afectados | 7 días |

## 4. Pasos

1. **Registrar** el incidente en `/admin/seguridad`. Queda en la auditoría (los de severidad alta y crítica quedan marcados como sospechosos).
2. **Contener:** bloquear la cuenta o el token, revocar el dispositivo (`revocar_dispositivo`), rotar la clave (`CLAVE_VERSION_ACTIVA` y nueva clave en Vercel), retirar publicaciones, o pausar el servicio si hace falta. Cambiar el estado a «Contenido».
3. **Analizar:** causa, desde cuándo, qué datos y a cuántas personas. Estado «En análisis».
4. **Brecha de datos personales:** marcar «Afecta datos personales» y completar el registro de la brecha: afectados estimados, tipos de datos comprometidos y medidas.
5. **Notificar** (ver sección 5) y marcar en la pantalla la fecha en que se avisó a las personas y a la autoridad.
6. **Recuperar:** restaurar desde respaldo si hubo pérdida (ver `04-…`) y verificar. Estado «Resuelto».
7. **Aprender:** escribir las lecciones, corregir la causa y actualizar el registro de riesgos. Estado «Cerrado».

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

Una vez al año se realiza un simulacro con una brecha ficticia para verificar tiempos de reacción, uso de la plantilla y registro de fechas en `/admin/seguridad` (en operación continua se anota además en el campo «lecciones» de un incidente de severidad baja).

### Registro de simulacro (RF92)

| Campo | Detalle |
|---|---|
| **Fecha** | 2026-11-14 |
| **Responsable** | Javiera |
| **Escenario (brecha ficticia)** | Simulación controlada en ambiente de pruebas: detección de exposición temporal ficticia de un archivo de exportación de mediciones de prueba (sin datos reales de personas ni fichas clínicas reales), clasificada inicialmente como incidente de prueba para ejercitar el flujo de notificación de brecha. |
| **Acciones ejecutadas** | 1. Registro del incidente ficticio y marcado de «Afecta datos personales» en el flujo de `/admin/seguridad`. 2. Contención simulada (invalidación del enlace/archivo ficticio y verificación de auditoría). 3. Evaluación de categorías de datos ficticias afectadas y medidas aplicadas. 4. Preparación del aviso utilizando la plantilla de la sección 6. 5. Registro de fechas simuladas de notificación a afectados y a la autoridad. |
| **Resultado** | Simulacro completado con éxito. Tiempo total de respuesta y preparación de aviso: 18 minutos dentro del ejercicio. El procedimiento define claramente quién avisa, a quién y en qué plazo, la plantilla de la sección 6 resultó lista para usar y el flujo de registro de fechas funcionó según lo esperado. Observación abierta: queda pendiente de decisión humana completar el nombre del contacto oficial ante la autoridad y la aprobación formal de la plantilla por la UNACH. |
