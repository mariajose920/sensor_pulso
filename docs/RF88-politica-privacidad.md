# RF88 — Política de privacidad (y brechas frente a ISO/IEC 27001:2022)

**Requisito:** política de privacidad visible en español, con el responsable del tratamiento y un canal de contacto.

## Qué entrega esta rama

| Pieza | Archivo |
|---|---|
| Texto de la política (datos puros, versionado) | `src/data/politicaPrivacidad.js` |
| Pantalla pública `/privacidad` | `src/views/PrivacidadView.vue`, ruta en `src/router/index.js` |
| Enlace en el pie de todas las páginas y en el login/registro | `src/App.vue`, `src/views/LoginView.vue` |
| Canal de contacto configurable (`VITE_CONTACTO_PRIVACIDAD`) | `.env.example` |
| Política vigente en la base (reemplaza «Pendiente de redacción») | `supabase/migrations/20261108000100_politica_privacidad.sql` |
| Pruebas (37 comprobaciones, incluida la coherencia de plazos con la base) | `scripts/test-rf88-privacidad.mjs` |

Los plazos de conservación de la política salen de `politicas_retencion` y del consentimiento informado; la prueba falla si dejan de coincidir.

## Pendiente de decisión humana (no lo puede resolver el código)

1. **Correo de contacto.** No existe ninguno en el repositorio y no se inventó. Definir un correo institucional `@unach.cl` y ponerlo en `VITE_CONTACTO_PRIVACIDAD` (Vercel). Mientras tanto la política indica «el equipo del proyecto, Facultad de Ingeniería y Negocios».
2. **Revisión legal.** Base legal y transferencia internacional (Supabase us-east-1) y la entrada en vigencia de la Ley 21.719 deben ser validadas por quien corresponda en la UNACH (RF93, RF95).
3. **Aplicar la migración** `20261108000100_politica_privacidad.sql` en Supabase.

## Cómo se relaciona con ISO 27001 (Anexo A, 2022)

La política cubre **A.5.34** (privacidad y protección de datos personales) y apoya **A.5.31** (requisitos legales) y **A.5.12/A.5.13** (clasificación de la información). Una política sola no certifica nada: ISO 27001 exige un sistema de gestión (SGSI) y evidencia de que los controles funcionan.

### Ya existe en el sistema

| Control | Evidencia |
|---|---|
| A.5.15 / A.8.3 Control de acceso | RLS activo en las 49 tablas; roles `usuario`, `profesor`, `admin` y rutas por rol |
| A.8.5 Autenticación segura | bloqueo de cuentas e `intentos_login` (RF50), política de contraseñas, correo institucional confirmado |
| A.8.15 Registro | `auditoria` inmutable (trigger que impide update/delete) |
| A.8.10 / A.8.13 Eliminación | `politicas_retencion` + `aplicar_retencion()` diaria (RF60) |
| A.8.20 / A.8.24 Red y cifrado en tránsito | HSTS, CSP, X-Frame-Options, TLS (RF55) en `vercel.json` |
| A.5.12 Clasificación | tabla `clasificacion_datos` (público / privado / sensible salud) |
| A.5.24–A.5.26 Incidentes | tablas `incidentes` y `brechas` (RF73, RF92) |
| A.8.28 Desarrollo seguro | CI `validar.yml`, detección de secretos (RF74) |

### Brechas detectadas y estado

| # | Brecha | Estado | Dónde |
|---|---|---|---|
| 1 | Clave de cifrado por defecto en el código y cifrado en el navegador (A.8.24) | **Cerrada en código** | `api/_lib/cifradoSalud.js`, `api/declaraciones/cifrar.js` y `descifrar.js`; el cliente `src/utils/cifradoService.js` ya no tiene claves ni criptografía |
| 2 | Derechos del titular sin pantalla (RF89, RF90) | **Cerrada** | `/mis-datos` (titular) y `/admin/seguridad` (administrador), servicio `derechosService.js` |
| 3 | Sin descarga completa de «mis datos» (portabilidad) | **Cerrada** | `api/derechos/exportar.js` + botón en `/mis-datos` |
| 4 | Brechas e incidentes sin interfaz (RF73, RF92) | **Cerrada** | `/admin/seguridad`, pestaña «Incidentes y brechas»; `03-procedimiento-incidentes-y-brechas.md` |
| 5 | Documentación del SGSI | **Borrador entregado** | `docs/iso27001/` (alcance, política, riesgos, SoA, incidentes, continuidad, proveedores) |
| 6 | Proveedores sin acuerdos documentados (A.5.19–A.5.23) | **Pendiente de la UNACH** | Lista de tareas en `docs/iso27001/05-proveedores.md` |
| 7 | MFA para administradores (A.8.5) | **Pendiente** | Pasos en `docs/iso27001/04-…`, sección 5 |
| 8 | Respaldos probados y continuidad (A.8.13) | **Pendiente** | Procedimiento y registro de pruebas en `docs/iso27001/04-…` |
| 9 | Monitoreo de la auditoría (A.8.16) | **Parcial** | Rutina semanal y consulta SQL documentadas; falta la alerta automática |
| 10 | Dependencias (A.8.8) | **Parcial** | `.github/dependabot.yml`; falta prueba de penetración |
| 11 | Concientización (A.6.3) | **Pendiente** | `docs/iso27001/04-…`, sección 6 |
| 12 | Versión de la política aceptada por cada persona | **Cerrada** | Casilla obligatoria en el registro; la base guarda versión y fecha en `perfiles` (`20261108000300_politica_aceptada.sql`) y la persona no puede alterarlas |
| 13 | Ficha de salud guardada en claro en `localStorage` del dispositivo (riesgo R8) | **Cerrada** | `pacienteService.js` la guarda solo en la pestaña (`sessionStorage`), borra la copia antigua y `limpiarAlSalir.js` la elimina al cerrar sesión. Ya no sobrevive al cierre del navegador |

### Mínimo necesario para estudiantes y profesores sin permiso

- **Estudiantes y profesores sin permisos especiales** solo ven sus propios datos: `/mis-datos` consulta únicamente por su `usuario_id` y la base lo refuerza con RLS. No ven solicitudes ajenas, incidentes ni brechas.
- **Seguridad e incidentes** es solo del administrador: ruta restringida, menú visible solo para él y RLS en la base.
- **El administrador** ve de quien pide solo nombre y correo (lo necesario para responder), no su rol ni sus datos de salud.
- **La descarga de datos** entrega solo datos de la propia persona y solo los campos que le sirven: sin banderas internas (`es_admin`, `mfa_requerido`), sin identificadores de otras personas y sin la auditoría.
- **Los endpoints** leen el registro desde la base con la sesión de la persona y no confían en lo que envía el navegador; una declaración ajena y una inexistente responden igual.

### Qué hay que hacer al desplegar

1. **Definir `CLAVE_CIFRADO_CAMPOS` en Vercel** (aleatoria, mínimo 16 caracteres) y guardar una copia en custodia. Sin ella la ficha de salud no se guarda en la base (queda solo en el dispositivo) y no se puede leer.
2. **Fichas ya guardadas con la clave por defecto antiguas:** quedaron cifradas con una clave que estaba en el repositorio y **no se podrán leer** con la clave nueva. Si hay datos reales, hay que descifrarlas una vez con la clave antigua y volver a cifrarlas antes de desplegar; si son solo datos de prueba, se pueden borrar.
3. **Aplicar las migraciones** `20261108000100_politica_privacidad.sql`, `20261108000200_derechos_incidentes_integridad.sql` y `20261108000300_politica_aceptada.sql` en Supabase (en ese orden; la 0300 usa la versión que deja la 0100).
4. Definir `VITE_CONTACTO_PRIVACIDAD` (correo `@unach.cl`).
5. Completar los puntos «por asignar» de `docs/iso27001/`.
