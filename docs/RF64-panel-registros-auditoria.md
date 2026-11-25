# RF64 · Panel de revisión de la auditoría

**Requerimiento:** panel para que el administrador revise los registros y filtre eventos sospechosos (ISO 27001 A.8.15–8.17).
**Depende de:** RF62 (registro de auditoría), RF63 (registros inmutables), RF52/RF97 (rol administrador).
**Dónde está:** `/admin` → «Registro General de Auditoría del Sistema».

## Qué hace

| Función | Detalle |
|---|---|
| Filtro «Solo sospechosos» | Muestra solo los eventos con `sospechoso = true`; las filas se resaltan y muestran el motivo. |
| Filtros | Categoría, acción concreta, rango de fechas, usuario o correo, IP y texto libre. |
| Filtrado en el servidor | Función `listar_auditoria()` (paginada, máx. 200 por consulta). Ya no hay tope de 200 eventos en el navegador. |
| Contadores | `resumen_auditoria()` entrega los totales por categoría y de sospechosos. |
| Detalle | «Ver detalle completo» muestra el JSON del evento (actor, IP, detalle). |
| Exportar Excel | Descarga un `.xlsx` con formato: hoja «Eventos» (encabezado de color, filtros automáticos, fila de títulos fija, filas sospechosas en rojo, fecha real en hora de Chile) y hoja «Resumen» (totales, por categoría y por motivo). Incluye quién lo generó y los filtros aplicados. |
| Exportar CSV | Mismos datos en CSV separado por `;` (para Excel en español), con BOM UTF-8 y sin fórmulas peligrosas. |
| Alcance de la exportación | Todo lo que cumple los filtros (hasta 2000 eventos, los más recientes), no solo la página visible. Cada descarga queda auditada como `descarga` (`auditoria_xlsx` o `auditoria_csv`). |
| Pestañas del panel de administración | Cuentas y roles · Auditoría · Rangos · Contenidos. La sección activa se guarda en la URL (`/admin?seccion=auditoria`). |
| Errores | Si la consulta falla se muestra un aviso con «Reintentar» (antes aparecía «sin eventos»). |

## Qué se marca como sospechoso (servidor, al insertar)

Trigger `auditoria_marcar_sospechoso` (BEFORE INSERT). La marca y el motivo (`detalle.motivo_sospecha`) se fijan al insertar y no se pueden cambiar después (RF63).

- Bloqueo de cuenta por intentos fallidos (ya existente).
- 3 o más `login_fallido` sobre la misma cuenta en 10 minutos.
- Cambio de rol que otorga el privilegio de administrador.
- 10 o más descargas/exportaciones del mismo usuario en 10 minutos.
- 5 o más eliminaciones del mismo usuario en 10 minutos.
- Cambio de rol o de rangos entre 00:00 y 05:59 (hora de Chile).
- Incidentes de severidad alta/crítica (ya existente, RF73).

Los eventos anteriores a esta migración no se reclasifican porque la tabla es inmutable.

## Seguridad

- `listar_auditoria` y `resumen_auditoria` son `security definer`, con `search_path` vacío, y exigen `es_admin()` (incluye MFA). Sin permiso para `anon`.
- La búsqueda escapa `%`, `_` y `\` para que el texto se busque literalmente.
- El panel es de solo lectura: no hay edición ni borrado (RF63).
- Exportar el registro solo lo puede hacer un administrador.

## Archivos

- `supabase/migrations/20261118000100_rf64_panel_auditoria.sql`
- `src/services/auditoriaService.js` (filtros, paginación, resumen, CSV)
- `src/components/RegistroAuditoriaPanel.vue`
- `scripts/test-rf64-panel-auditoria.mjs` → `npm run test:rf64`

## Criterios de aceptación

1. El administrador ve los eventos y los filtra por categoría, fecha, acción, usuario, IP y texto.
2. «Solo sospechosos» muestra únicamente los eventos marcados, con su motivo.
3. Un usuario que no es administrador no puede consultar la auditoría (RLS y funciones).
4. Los registros no se pueden editar ni borrar desde el panel.
5. Exportar el CSV deja un evento `descarga` en la auditoría.
