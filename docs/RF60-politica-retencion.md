# RF60 · Política de retención

**Requerimiento:** política de retención: borrado o anonimización automática de datos tras un periodo definido (ISO 27001 A.8.10 y A.5.33).
**Se apoya en:** RF56 (tipo de cada dato), RF62/RF63 (auditoría inmutable) y RF88 (política de privacidad, que debe decir lo mismo).

## Plazos

| Datos | Tipo | Plazo | Qué ocurre |
|---|---|---|---|
| Lecturas de la medición | Sensible | 12 meses | Se elimina |
| Señal PPG cruda | Sensible | 12 meses | Se elimina (no la de mediciones publicadas) |
| Fichas de salud de sesiones y canales | Sensible | 12 meses | Se elimina (la ficha propia se conserva) |
| Alertas fuera de rango | Sensible | 12 meses | Se elimina |
| Comparaciones guardadas | Sensible | 2 años | Se elimina |
| Resumen de las mediciones | Sensible | 2 años | **Se anonimiza** (no las publicadas) |
| Intentos de inicio de sesión | Privado | 90 días | Se elimina |
| Contadores de peticiones | Privado | 2 días | Se elimina |
| Bloqueos de cuenta | Privado | 30 días tras vencer | Se elimina |
| Invitaciones a aulas | Privado | 6 meses | Se elimina |

**Anonimizar** una medición corta el vínculo con la persona (`usuario_id` queda vacío) y limpia lo que permite reconocerla (nota, identificador del navegador, ficha y sesión). Quedan BPM, SpO₂ y ritmo, solo para estadísticas.

**Nunca se toca:** el registro de auditoría (inmutable), lo publicado en la galería mientras su titular no lo retire, la ficha propia de cada persona, y aulas, evaluaciones y calificaciones.

## Qué se hizo

1. **Políticas completas.** Antes había 4 y la acción «anonimizar» no estaba implementada. Ahora hay 10 y las dos acciones funcionan. Una restricción de base de datos asegura que solo las mediciones se anonimicen.
2. **Una sola regla** (`retencion_filas`) decide qué se toca, y la usan la vista previa y la ejecución: lo que se ve como «pendiente» es lo que se aplicará.
3. **Ejecución diaria a las 04:00** con `pg_cron`. La migración agenda el trabajo y el panel avisa si no está programado.
4. **Auditoría por ejecución:** si fue automática o manual, quién la pidió y cuántos registros por tabla. Los cambios de plazo también quedan registrados (con el valor anterior y el nuevo).
5. **Pestaña «Retención»** en `/admin`: indicadores, plazos con pendientes de hoy, editar plazo o pausar una política, aplicar ahora con confirmación, últimas ejecuciones y lo que nunca se toca.
6. **Política de privacidad y tratamiento por tipo** actualizados para decir los mismos plazos que la base (una prueba lo verifica).

## Archivos

- `supabase/migrations/20261121000100_rf60_politica_retencion.sql`
- `src/data/retencion.js`, `src/services/retencionService.js`, `src/components/RetencionPanel.vue`
- `src/views/AdminView.vue`, `src/services/auditoriaService.js`
- `src/data/politicaPrivacidad.js`, `src/data/clasificacionDatos.js`
- `scripts/test-rf60-politica-retencion.mjs` → `npm run test:rf60`

## Criterios de aceptación

1. Pasado el plazo, los datos se eliminan o se anonimizan solos (ejecución diaria).
2. El administrador ve cada plazo, cuántos registros están pendientes y cuándo se ejecutó por última vez.
3. El administrador puede cambiar un plazo o pausar una política, con advertencia al acortar, y queda auditado.
4. Aplicar la retención a mano exige confirmación y queda auditado.
5. Cada ejecución deja en la auditoría el detalle por tabla.
6. Lo publicado, la ficha propia y la auditoría no se tocan.
7. La política de privacidad dice los mismos plazos que la base.

## Límites y pendientes

- Si Supabase no tiene `pg_cron` activado, las políticas no se aplican solas (el panel lo avisa); se pueden aplicar con «Aplicar ahora».
- Los respaldos de Supabase conservan copias de los datos hasta que venzan sus propios plazos.
- No se cambió la versión de la política de privacidad (1.0) para no obligar a todos a aceptarla de nuevo; si se considera un cambio relevante, subirla a 1.1.
