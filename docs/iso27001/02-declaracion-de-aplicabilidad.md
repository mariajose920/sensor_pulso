# Declaración de aplicabilidad (SoA) · ISO/IEC 27001:2022 Anexo A

Estado posible: **Implementado** (hay evidencia en el sistema) · **Parcial** · **Pendiente** (aplica, falta) · **No aplica** (con motivo) · **Por evaluar** (decide el responsable del SGSI).
La columna «Evidencia» apunta a algo que se puede comprobar. Si no hay evidencia, no se marca como implementado.

## A.5 Controles organizacionales

| Control | Aplica | Estado | Evidencia / nota |
|---|---|---|---|
| 5.1 Políticas de seguridad | Sí | Parcial | `01-alcance-politica-y-riesgos.md` (falta aprobación) |
| 5.2 Roles y responsabilidades | Sí | Parcial | Tabla de roles en 01 (falta asignar personas) |
| 5.3 Segregación de funciones | Sí | Implementado | Roles usuario/profesor/admin; permisos del profesor otorgados por el admin |
| 5.4 Responsabilidades de la dirección | Sí | Pendiente | Aprobación de la política |
| 5.5 Contacto con autoridades | Sí | Pendiente | Definir contacto para brechas (`03-…`) |
| 5.6 Contacto con grupos de interés | Sí | Por evaluar | |
| 5.7 Inteligencia de amenazas | Sí | Por evaluar | |
| 5.8 Seguridad en la gestión de proyectos | Sí | Parcial | Rama por requerimiento, revisión y CI |
| 5.9 Inventario de activos | Sí | Parcial | Tabla en 01 (falta dueños) |
| 5.10 Uso aceptable de la información | Sí | Parcial | Política de privacidad y aviso educativo |
| 5.11 Devolución de activos | Sí | Por evaluar | Tokens de ESP32: `revocar_dispositivo` |
| 5.12 Clasificación de la información | Sí | Implementado | Tabla `clasificacion_datos` |
| 5.13 Etiquetado de la información | Sí | Parcial | Clasificación por columna; sin etiquetas visibles |
| 5.14 Transferencia de información | Sí | Implementado | HTTPS/TLS, HSTS (`vercel.json`) |
| 5.15 Control de acceso | Sí | Implementado | RLS en 49 tablas, rutas por rol |
| 5.16 Gestión de identidades | Sí | Implementado | Correo institucional confirmado (RF96) |
| 5.17 Información de autenticación | Sí | Implementado | Política de contraseñas, bloqueo por intentos |
| 5.18 Derechos de acceso | Sí | Implementado | Permisos de profesor otorgados por el admin y auditados |
| 5.19 Seguridad con proveedores | Sí | Pendiente | `05-proveedores.md` |
| 5.20 Acuerdos con proveedores | Sí | Pendiente | `05-proveedores.md` |
| 5.21 Cadena de suministro TIC | Sí | Parcial | Dependabot, `package-lock.json`, `npm ci` |
| 5.22 Seguimiento de proveedores | Sí | Pendiente | `05-proveedores.md` |
| 5.23 Servicios en la nube | Sí | Parcial | Alojamiento declarado en la política de privacidad |
| 5.24 Planificación de incidentes | Sí | Implementado | `03-procedimiento-incidentes-y-brechas.md` |
| 5.25 Evaluación de eventos | Sí | Implementado | Severidad y «afecta datos personales» en cada incidente |
| 5.26 Respuesta a incidentes | Sí | Implementado | Pantalla `/admin/seguridad` |
| 5.27 Aprender de los incidentes | Sí | Implementado | Campo «lecciones» del incidente |
| 5.28 Recolección de evidencias | Sí | Parcial | Auditoría inmutable |
| 5.29 Seguridad en una interrupción | Sí | Pendiente | `04-continuidad-…` |
| 5.30 TIC para la continuidad | Sí | Pendiente | `04-continuidad-…` |
| 5.31 Requisitos legales | Sí | Parcial | Ley 19.628; Ley 21.719 por revisar con asesoría jurídica |
| 5.32 Propiedad intelectual | Sí | Por evaluar | Licencias de dependencias |
| 5.33 Protección de registros | Sí | Implementado | Auditoría inmutable, retención automática |
| 5.34 Privacidad y datos personales | Sí | Implementado | `/privacidad`, `/mis-datos`, cifrado de salud, descarga de datos |
| 5.35 Revisión independiente | Sí | Pendiente | Auditoría interna (01, sección 9) |
| 5.36 Cumplimiento de políticas | Sí | Pendiente | Revisión anual |
| 5.37 Procedimientos documentados | Sí | Parcial | Esta carpeta y `docs/` |

## A.6 Controles de personas

| Control | Aplica | Estado | Evidencia / nota |
|---|---|---|---|
| 6.1 Selección | Sí | Por evaluar | |
| 6.2 Términos de contratación | Sí | Por evaluar | Compromiso de confidencialidad del equipo |
| 6.3 Concientización y formación | Sí | Pendiente | Capacitación en datos de salud |
| 6.4 Proceso disciplinario | Sí | Por evaluar | Reglamento universitario |
| 6.5 Responsabilidades al terminar | Sí | Pendiente | Revocar accesos de quien deja el proyecto |
| 6.6 Acuerdos de confidencialidad | Sí | Pendiente | |
| 6.7 Trabajo remoto | Sí | Por evaluar | |
| 6.8 Reporte de eventos | Sí | Parcial | Canal de contacto en `/privacidad` |

## A.7 Controles físicos

| Control | Aplica | Estado | Evidencia / nota |
|---|---|---|---|
| 7.1–7.14 (perímetro, acceso físico, oficinas, vigilancia, amenazas físicas, trabajo en áreas seguras, escritorio limpio, ubicación de equipos, seguridad fuera de las instalaciones, medios, servicios de apoyo, cableado, mantenimiento, eliminación de equipos) | Parcial | Por evaluar | El alojamiento es de proveedores en la nube (sus certificaciones cubren lo físico). Aplica a los ESP32 y equipos del laboratorio: **definir** |

## A.8 Controles tecnológicos

| Control | Aplica | Estado | Evidencia / nota |
|---|---|---|---|
| 8.1 Dispositivos de usuario | Sí | Implementado | Cierre por inactividad; ficha de salud solo en la pestaña y borrada al salir (riesgo R8) |
| 8.2 Accesos privilegiados | Sí | Parcial | Rol admin; **falta exigir MFA** |
| 8.3 Restricción de acceso a la información | Sí | Implementado | RLS; endpoints con sesión y titularidad |
| 8.4 Acceso al código fuente | Sí | Parcial | GitHub con PR hacia `develop`; **verificar** que `develop` y `main` estén protegidas (revisión obligatoria, sin push directo) |
| 8.5 Autenticación segura | Sí | Parcial | Bloqueos y contraseñas; MFA pendiente |
| 8.6 Gestión de la capacidad | Sí | Por evaluar | |
| 8.7 Protección contra malware | Sí | Por evaluar | |
| 8.8 Vulnerabilidades técnicas | Sí | Parcial | Dependabot; falta prueba de penetración |
| 8.9 Gestión de la configuración | Sí | Parcial | `vercel.json`, migraciones versionadas |
| 8.10 Eliminación de información | Sí | Implementado | `aplicar_retencion()`, `eliminar_mis_datos()` |
| 8.11 Enmascaramiento de datos | Sí | Parcial | Columnas con `enmascarar` en `clasificacion_datos` |
| 8.12 Prevención de fuga de datos | Sí | Parcial | Exportación mínima; endpoints de datos de salud sin CORS abierto (la telemetría del ESP32 es un endpoint aparte) |
| 8.13 Respaldos | Sí | Pendiente | `04-continuidad-…` |
| 8.14 Redundancia | Sí | Por evaluar | La da el proveedor |
| 8.15 Registro (logs) | Sí | Implementado | Tabla `auditoria` inmutable |
| 8.16 Monitoreo | Sí | Pendiente | Alertas sobre auditoría (`04-…`) |
| 8.17 Sincronización de relojes | Sí | Implementado | Hora de la base de datos (`now()`) |
| 8.18 Programas privilegiados | No aplica | — | Sin programas de utilidad propios |
| 8.19 Instalación de software | Sí | Parcial | Solo desde `package-lock.json` |
| 8.20 Seguridad de redes | Sí | Implementado | TLS, HSTS, CSP |
| 8.21 Servicios de red | Sí | Parcial | Proveedores gestionados |
| 8.22 Segregación de redes | No aplica | — | Servicios gestionados en la nube |
| 8.23 Filtrado web | No aplica | — | No se administra una red de usuarios |
| 8.24 Criptografía | Sí | Implementado | AES-256-GCM en el servidor, sin clave por defecto, rotación por versión, TLS |
| 8.25 Desarrollo seguro | Sí | Parcial | Rama por requerimiento, CI, pruebas |
| 8.26 Requisitos de seguridad de las aplicaciones | Sí | Implementado | Pruebas `scripts/test-*.mjs` |
| 8.27 Arquitectura segura | Sí | Parcial | RLS + endpoints con sesión |
| 8.28 Codificación segura | Sí | Parcial | Detección de secretos (RF74) |
| 8.29 Pruebas de seguridad | Sí | Parcial | Pruebas automáticas; falta prueba de penetración |
| 8.30 Desarrollo subcontratado | No aplica | — | Desarrollo interno |
| 8.31 Separación de entornos | Sí | Parcial | Desarrollo local y producción; falta entorno de pruebas propio |
| 8.32 Gestión de cambios | Sí | Implementado | Ramas, PR, validación de nombre y compilación |
| 8.33 Información de prueba | Sí | Parcial | Datos de ejemplo; no usar datos reales en pruebas |
| 8.34 Protección en auditorías | Sí | Por evaluar | |
