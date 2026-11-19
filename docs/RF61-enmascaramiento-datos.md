# RF61 · Enmascaramiento de datos personales

**Requerimiento:** enmascaramiento de datos personales en pantallas e informes donde no sean necesarios (ISO 27001 A.8.11).
**Se apoya en:** RF56 (la columna `enmascarar` del catálogo de clasificación dice qué datos se enmascaran) y RF62 (mostrar un dato queda auditado).

## Regla de fondo

Cada persona ve completos **sus propios datos**. Los datos personales de **otras personas** se muestran enmascarados, salvo donde son imprescindibles para actuar. El enmascaramiento es de presentación (pantallas y archivos descargados); la protección en la base la dan el cifrado, las reglas por fila y la clasificación.

| Dato | Cómo se muestra | Ejemplo |
|---|---|---|
| Correo | Primera letra y dominio | `ana.perez@alu.unach.cl` → `a***@alu.unach.cl` |
| Nombre | Inicial de cada palabra | `María José Vilches` → `M*** J*** V***` |
| IP | Solo la red | `190.20.1.4` → `190.20.*.*` |
| Token | Últimos 4 caracteres | `abcdef1234567890` → `****7890` |
| Texto libre | Correos e IP dentro del texto | `Cuenta (ana@unach.cl)` → `Cuenta (a***@unach.cl)` |

No se revela el largo real del dato (siempre `***`).

## Dónde se aplica

| Pantalla | Quién la ve | Qué se enmascara | ¿Se puede mostrar? |
|---|---|---|---|
| Admin → Cuentas y roles | Administrador | Nombre y correo de las cuentas (el propio no) | Sí, 60 s, queda auditado |
| Admin → Auditoría → Registro general | Administrador | Actor, usuario afectado, IP, detalle, ficha y exportaciones | Sí, 60 s, queda auditado |
| Admin → Auditoría → Historial de cambios de rol | Administrador | Administrador responsable y usuario modificado | Sí, 60 s, queda auditado |
| Seguridad → Solicitudes de derechos | Administrador | Nombre y correo del titular | Sí, 60 s, queda auditado |
| Aulas y detalle del aula | Profesor | Correo de estudiantes e invitaciones (el nombre se ve: lo necesita para evaluar) | No (mínimo privilegio) |
| Panel en vivo | Profesor | Correo del estudiante | No |
| Exportar Excel y CSV de auditoría | Administrador | Todo lo anterior, salvo que los haya mostrado | Hereda el estado del panel; el archivo lo indica |
| Auditoría de descarga del informe PDF | Sistema | Ya no guarda el nombre del paciente | — |

**No se enmascaran** (y está justificado): Mis datos y la cabecera con tu propio nombre y correo; el correo al confirmar un cambio de rol (debe verse a qué cuenta exacta se aplica); los correos que el profesor acaba de escribir al invitar (debe corregirlos).

## Mostrar datos (solo administrador)

1. El botón «Mostrar datos personales» registra primero el acceso en la auditoría (`revelacion_datos`).
2. Si no se puede registrar, los datos **siguen enmascarados** y se avisa.
3. Los datos se ven 60 segundos y vuelven a ocultarse solos (o al salir de la pantalla).
4. El servidor solo acepta esa acción del administrador con MFA.
5. Mostrar datos 5 o más veces en 10 minutos se marca como evento sospechoso (RF64).

## Archivos

- `src/utils/enmascarar.js` (reglas), `src/composables/useRevelarDatos.js` (mostrar con registro y tiempo)
- `src/components/DatoEnmascarado.vue`, `BotonRevelarDatos.vue`
- `src/services/auditoriaService.js` (vista enmascarada, ficha y exportaciones), `RegistroAuditoriaPanel.vue`
- `src/views/AdminView.vue`, `SeguridadAdminView.vue`, `AulaDetalleView.vue`, `AulasView.vue`, `src/components/PanelAvanceEnVivo.vue`
- `supabase/migrations/20261120000100_rf61_enmascaramiento.sql`
- `scripts/test-rf61-enmascaramiento.mjs` → `npm run test:rf61`

## Criterios de aceptación

1. Un administrador ve los correos, nombres e IP de otras personas enmascarados por defecto.
2. Al mostrar los datos, quedan visibles un minuto y se registra el acceso en la auditoría.
3. Un profesor no puede ver el correo completo de sus estudiantes.
4. Los archivos exportados salen enmascarados y avisan si traen datos reales.
5. Una pantalla nueva que muestre correos sin enmascarar hace fallar la prueba `test:rf61`.

## Límites y pendientes

- El enmascaramiento es de presentación: el dato completo viaja al navegador del administrador (necesita las reglas por fila y MFA, que ya existen). Enmascarar en el servidor sería un cambio mayor.
- La búsqueda del administrador sigue funcionando sobre los datos reales.
- Los informes del propio paciente (PDF) llevan su nombre: son sus datos.
