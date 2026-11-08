# SGSI sensor_pulso · Alcance, política de seguridad y gestión de riesgos

ISO/IEC 27001:2022, cláusulas 4 a 6 y Anexo A 5.1 (políticas). Documento vivo: se revisa al menos una vez al año o ante un cambio importante.

> **Estado:** borrador técnico preparado desde el código y la base de datos. Lo que dice «por asignar» o «por confirmar» necesita una decisión de la UNACH; no se inventó.

## 1. Alcance (cláusula 4.3)

| Elemento | Contenido |
|---|---|
| Qué protege | La plataforma web `sensor_pulso` (Vue/Vite en Vercel), su base de datos y autenticación (Supabase), el envío de correos (Resend) y la recepción de telemetría del dispositivo ESP32 con sensor MAX30102. |
| Datos | Cuenta institucional; mediciones de pulso y SpO₂; ficha de salud declarada (**dato sensible**); aulas, cursos y evaluaciones; auditoría. |
| Personas | Estudiantes (`@alu.unach.cl`), profesores (`@unach.cl`) y administradores. |
| Fuera de alcance | La red y los equipos personales de quienes usan la plataforma; la seguridad física de los dispositivos ESP32 prestados; sistemas de la UNACH distintos de este proyecto. |
| Responsable del SGSI | **Por asignar** (propuesta: docente guía del proyecto) |
| Responsable de privacidad | **Por asignar**; recibe las solicitudes de `/privacidad` |

## 2. Política de seguridad de la información (A.5.1)

1. Se protegen la **confidencialidad, integridad y disponibilidad** de los datos de las personas, con especial cuidado de los datos de salud.
2. **Mínimo necesario:** cada rol ve solo lo que necesita. Estudiantes y profesores sin permiso especial ven únicamente sus propios datos; los permisos del profesor los otorga el administrador.
3. **Consentimiento y propósito:** los datos se usan solo para fines educativos y con consentimiento, según la política de privacidad vigente (`/privacidad`).
4. **Cifrado:** HTTPS en todo el sitio; los datos de salud se cifran en el servidor y las claves nunca están en el código ni en el navegador.
5. **Trazabilidad:** las acciones relevantes quedan en una auditoría que no se puede modificar.
6. **Conservación limitada:** los datos se borran automáticamente al cumplirse los plazos de la política.
7. **Incidentes:** se registran, se contienen y, si afectan datos personales, se notifica a las personas y a la autoridad (ver `03-procedimiento-incidentes-y-brechas.md`).
8. **Cambios seguros:** todo cambio pasa por rama, revisión y comprobaciones automáticas antes de entrar a `develop`.
9. **Mejora continua:** se revisan riesgos, incidentes y controles al menos una vez al año.

Aprobada por: **por asignar** · Fecha: **por asignar**

## 3. Inventario de activos (A.5.9)

| Activo | Clasificación | Dónde está | Dueño |
|---|---|---|---|
| Ficha de salud declarada (`declaraciones_paciente.datos_cifrados`) | Sensible (salud) | Supabase, cifrada por campo | por asignar |
| Mediciones y lecturas (BPM, SpO₂, señal) | Privado | Supabase | por asignar |
| Cuentas y perfiles (correo, nombre, rol) | Privado | Supabase Auth y `perfiles` | por asignar |
| Aulas, cursos, evaluaciones | Privado | Supabase | por asignar |
| Auditoría, incidentes, brechas | Interno | Supabase | por asignar |
| Claves: cifrado de campos, secreta de Supabase, Resend | Secreto | Variables de entorno de Vercel | por asignar |
| Código fuente | Interno | GitHub (`mariajose920/sensor_pulso`) | por asignar |
| Dispositivos ESP32 y sus tokens | Interno | Laboratorio / tabla `dispositivos` | por asignar |

La clasificación por columna vive en la tabla `clasificacion_datos`.

## 4. Metodología de riesgos (cláusula 6.1.2)

Riesgo = **probabilidad** (1 baja a 3 alta) × **impacto** (1 bajo a 3 alto). Se acepta hasta 3; de 4 en adelante se trata.

## 5. Registro de riesgos y tratamiento (cláusula 6.1.3)

| # | Riesgo | P | I | Nivel | Tratamiento / control existente | Pendiente |
|---|---|---|---|---|---|---|
| R1 | Acceso de una persona a datos de otra | 2 | 3 | 6 | RLS en las 49 tablas; rutas por rol; endpoints que exigen sesión y titularidad | Prueba periódica de RLS con cuentas de cada rol |
| R2 | Filtración de la clave de cifrado de salud | 1 | 3 | 3 | Sin clave en el código ni en el navegador; falla cerrado si falta | Rotar con `CLAVE_VERSION_ACTIVA`; custodia de la clave por dos personas |
| R3 | Cuenta de administrador comprometida | 2 | 3 | 6 | Bloqueo por intentos, política de contraseñas, correo institucional | **Exigir MFA a administradores**; revisar `perfiles.mfa_requerido` |
| R4 | Pérdida de datos (borrado, error, caída de Supabase) | 2 | 3 | 6 | Respaldos del proveedor | **Probar una restauración**; ver `04-continuidad-monitoreo-y-vulnerabilidades.md` |
| R5 | Brecha sin detectar | 2 | 3 | 6 | Auditoría inmutable | **Alertas** sobre la auditoría (ver documento 04) |
| R6 | Dependencia con vulnerabilidad conocida | 2 | 2 | 4 | CI de validación, detección de secretos | Dependabot y `npm audit` (configurado en esta rama) |
| R7 | Proveedor (Supabase, Vercel, Resend) sin garantías por escrito | 2 | 2 | 4 | Proveedores con certificaciones públicas | Ver `05-proveedores.md` |
| R8 | Datos de salud en el dispositivo legibles por quien use el mismo equipo | 1 | 2 | 2 | La ficha vive solo en la pestaña (`sessionStorage`), se borra al cerrar sesión y por inactividad | Aceptado; revisar si se vuelve a necesitar uso sin conexión de la ficha |
| R9 | Telemetría falsa o repetida desde un ESP32 | 2 | 2 | 4 | Token por dispositivo, límites de peticiones | Revocación y rotación de tokens documentada |
| R10 | Persona no puede ejercer sus derechos a tiempo | 2 | 2 | 4 | Pantalla «Mis datos», plazo de 30 días con alerta de vencimiento | Designar responsable que revise la bandeja |

## 6. Roles y responsabilidades (A.5.2)

| Rol | Responsabilidad |
|---|---|
| Responsable del SGSI | Mantener estos documentos, el registro de riesgos y la revisión anual |
| Responsable de privacidad | Responder solicitudes de derechos dentro de 30 días |
| Administrador técnico | Claves, accesos, respaldos, actualizaciones, respuesta a incidentes |
| Equipo de desarrollo | Cambios por rama y revisión; no subir secretos |
| Profesores | Usar los datos de su aula solo para la docencia |

## 7. Objetivos medibles (cláusula 6.2)

| Objetivo | Meta | Cómo se mide |
|---|---|---|
| Solicitudes de derechos respondidas a tiempo | 100 % en 30 días | Pantalla de administración (vencidas en rojo) |
| Incidentes con datos personales notificados | 100 % | Tabla `brechas` |
| Dependencias con vulnerabilidad alta abiertas | 0 al cierre de cada mes | Dependabot / `npm audit` |
| Restauración de respaldo probada | 1 vez por semestre | Acta en `04-…` |
| Cuentas de administrador con MFA | 100 % | Revisión trimestral |

## 8. Revisión por la dirección (cláusula 9.3)

Una vez al año, con acta: estado de objetivos, incidentes, resultados de auditoría interna, cambios en el contexto, oportunidades de mejora. **Fecha de la primera revisión: por asignar.**

## 9. Auditoría interna (cláusula 9.2)

Antes de la primera revisión, alguien ajeno al desarrollo comprueba el cumplimiento de `02-declaracion-de-aplicabilidad.md` y deja informe con hallazgos. **Por asignar.**
