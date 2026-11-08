# Procedimiento de incidentes y brechas de seguridad (RF73, RF92)

ISO/IEC 27001:2022 A.5.24 a A.5.28 y A.6.8. Se aplica con la pantalla **Seguridad y privacidad** (`/admin/seguridad`, solo administrador).

## 1. Qué es un incidente

Todo evento que pueda afectar la confidencialidad, integridad o disponibilidad de los datos: acceso indebido, cuenta comprometida, pérdida o publicación de datos, clave expuesta, caída prolongada, telemetría falsa, código malicioso.
**Brecha de datos personales:** incidente que expone, altera o pierde datos de personas. Es la que obliga a notificar.

## 2. Quién avisa y a quién

- Cualquier persona que lo note avisa al **responsable de privacidad** por el canal indicado en `/privacidad`.
- El administrador lo registra en la pantalla (título, qué pasó, severidad, si afecta datos personales). No se escriben datos personales ni de salud en la descripción: solo hechos y tipos de dato.

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

| A quién | Cuándo | Cómo |
|---|---|---|
| Personas afectadas | Sin demora injustificada, si hay riesgo para sus derechos | Correo institucional, con qué pasó, qué datos, qué hacer y a quién escribir |
| Autoridad competente | Según lo exija la ley vigente (Ley 19.628 y, desde su entrada en vigencia, la Ley 21.719) | **Por confirmar con asesoría jurídica de la UNACH**: autoridad, plazo y formato |
| Dirección de la Facultad | Siempre en severidad alta o crítica | Correo y reunión |

> Pendiente de decisión humana: nombre del contacto ante la autoridad y plantilla de aviso aprobada por la UNACH.

## 6. Plantilla de aviso a personas afectadas

> Asunto: Aviso de seguridad sobre tus datos en sensor pulso
> El [fecha] detectamos [qué pasó, sin tecnicismos]. Pudo afectar [tipos de datos: p. ej. tus mediciones de pulso]. No se vieron afectados [lo que no se afectó].
> Ya hicimos [medidas]. Te recomendamos [acciones: p. ej. cambiar tu contraseña].
> Si tienes dudas o quieres ejercer tus derechos, escribe a [canal de contacto de /privacidad].

## 7. Evidencia

Se conserva en la plataforma: el incidente, la brecha con sus fechas de notificación y la auditoría de cada cambio (quién y cuándo). Los registros de auditoría no se pueden modificar ni borrar.

## 8. Práctica

Una vez al año se hace un simulacro (por ejemplo: «se filtró una clave») y se anota el tiempo de reacción en el campo «lecciones» de un incidente de severidad baja.
