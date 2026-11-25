# RF56 · Clasificación de los datos

**Requerimiento:** clasificación de los datos (públicos, privados, sensibles de salud) con tratamiento distinto para cada tipo (ISO 27001 A.5.12 y A.5.13).
**Se relaciona con:** RF55 y RF116 (cifrado), RF57 (anonimización al publicar), RF58 (derechos del titular), RF60 (retención) y RF61 (enmascaramiento, en preparación).

## Los tres tipos y su tratamiento

| Aspecto | Público | Privado | Sensible de salud |
|---|---|---|---|
| Quién lo ve | Cualquier persona | Su titular; el profesor lo de su aula; el administrador lo necesario | Su titular; el profesor solo resultados de evaluaciones asignadas |
| Protección | HTTPS | HTTPS, cifrado en reposo, reglas por fila | Lo anterior + cifrado por campo en la ficha declarada |
| Publicación | Sí | Nunca | Solo anonimizado, con vista previa y confirmación explícita |
| Conservación | Mientras esté vigente | Mientras exista la cuenta; accesos técnicos 90 días | Ficha y lecturas hasta 365 días, o antes si el titular las elimina |
| Derechos | No aplica | Consultar, corregir, exportar, eliminar | Los anteriores + revocar consentimiento |
| Registro | Cambios de contenido | Cambios de rol, descargas y eliminaciones | Descargas, publicaciones y eliminaciones (auditoría inmutable) |

Los textos están en `src/data/clasificacionDatos.js` (única fuente para la política, «Mis datos» y el panel).
Solo se describe lo que la plataforma ya hace. El enmascaramiento (RF61) ya está implementado: ver docs/RF61-enmascaramiento-datos.md.

## Qué se hizo

1. **Catálogo completo en la base.** La tabla `clasificacion_datos` pasó de 10 a 250 columnas clasificadas: el 100 % de las columnas con datos de las 50 tablas. Las columnas técnicas (`id`, `..._id`, `..._por`, `..._en`) no se clasifican.
2. **Regla de integridad.** Solo un dato sensible de salud puede llevar cifrado por campo (`clasificacion_cifrado_solo_sensible`).
3. **Funciones de solo administrador** (con MFA): `resumen_clasificacion()` y `columnas_sin_clasificar()`.
4. **Pestaña «Clasificación»** en `/admin`: indicadores, los tres tipos, matriz de tratamiento, catálogo con filtros y la lista de pendientes.
5. **Etiquetas visibles (A.5.13)** en la política de privacidad, «Mis datos y mis derechos», la ficha del paciente y al publicar una medición.
6. **Prueba que protege el futuro:** `npm run test:rf56` falla si una migración nueva agrega una columna sin clasificar.

## Archivos

- `supabase/migrations/20261119000100_rf56_clasificacion_datos.sql`
- `src/data/clasificacionDatos.js`, `src/services/clasificacionService.js`
- `src/components/EtiquetaClaseDato.vue`, `ClasesDatoTarjetas.vue`, `ClasificacionDatosPanel.vue`
- `src/views/AdminView.vue`, `PrivacidadView.vue`, `MisDatosView.vue`
- `src/components/DatosPacienteCard.vue`, `PublicarDesdeHistorialModal.vue`
- `scripts/lib-esquema-sql.mjs`, `scripts/test-rf56-clasificacion-datos.mjs`

## Criterios de aceptación

1. Existen tres tipos de dato y cada uno tiene un tratamiento distinto y documentado.
2. Todas las columnas con datos de la base tienen un tipo asignado.
3. Los datos sensibles de salud son los únicos con cifrado por campo.
4. El administrador ve cómo está clasificada la base, qué falta y cómo se trata cada tipo.
5. Las personas ven el tipo de sus datos donde los usan (ficha, publicar, «Mis datos», política).
6. Un usuario que no es administrador no puede consultar el resumen ni los pendientes.

## Fuera de alcance / pendiente

- Reclasificar columnas desde la interfaz (hoy se hace en Supabase; el administrador puede editar la tabla).
- Auditar los cambios de clasificación en el registro de auditoría.
- Aplicar la retención automática (RF60).
