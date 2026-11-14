# RF63 · Registros Inmutables y Sello de Tiempo del Servidor

Requerimiento: *Los registros no se editan ni se borran, y llevan sello de tiempo.*  
Responsable: **Adán**  
Fecha de vencimiento: **12 de noviembre de 2026**  
Rama: `rf63-registros-inmutables`  
Dependencias:
- **Necesita:** RF62 (Registro general de auditoría del sistema).
- **Bloquea a:** Nadie.

---

## 1. Alcance y Normativas de Ciberseguridad

El requerimiento **RF63** complementa la bitácora de auditoría general (RF62) dotándola de garantías criptográficas y arquitectónicas de inmutabilidad y no repudio (*WORM — Write Once, Read Many*):

- **ISO/IEC 27001 (Control A.8.15 — Registro de eventos & Control A.8.10 — Eliminación de información):** Los registros de auditoría que documentan accesos, cambios de rol y eventos de seguridad deben ser protegidos contra alteraciones, falsificaciones y supresión no autorizada.
- **OWASP Top 10 (A09:2021 — Security Logging and Monitoring Failures):** Garantía de integridad del registro de auditoría, impidiendo que un atacante o usuario interno con privilegios elevados borre sus huellas.
- **RFC 3161 (Time-Stamp Protocol):** Cada evento debe sellarse con la hora certera e inalterable del servidor de base de datos (`clock_timestamp()` / `now()`), evitando desincronizaciones o manipulaciones de reloj desde el cliente.
- **Principio de Mínimo Privilegio (PoLP):** Ningún rol (`anon`, `authenticated`, ni siquiera administradores en la interfaz) dispone de permisos `UPDATE`, `DELETE` o `TRUNCATE` sobre la tabla `public.auditoria`.

---

## 2. Arquitectura de Inmutabilidad Multi-Capa

```
                                [ Evento del Sistema ]
                                          │
                                          ▼
                ┌──────────────────────────────────────────────────┐
                │          Capa de Aplicación (Frontend)           │
                │  - Registro inmutable (Object.freeze)            │
                │  - Prohibición de funciones editar/borrar/purgar │
                │  - Interfaz de solo lectura (sin botones mutar)  │
                └─────────────────────────┬────────────────────────┘
                                          │
                                          ▼
                ┌──────────────────────────────────────────────────┐
                │       Capa de Transporte y API (Supabase)        │
                │  - RLS: Solo SELECT autorizado para administradores│
                │  - Cero políticas permisivas de UPDATE o DELETE  │
                │  - REVOKE UPDATE, DELETE, TRUNCATE               │
                └─────────────────────────┬────────────────────────┘
                                          │
                                          ▼
                ┌──────────────────────────────────────────────────┐
                │       Capa de Base de Datos (PostgreSQL)         │
                │  - Trigger 'auditoria_sello_servidor':           │
                │      NEW.ocurrio_en := clock_timestamp();        │
                │  - Trigger 'auditoria_no_update':                │
                │      BEFORE UPDATE OR DELETE -> Excepción 42501  │
                │  - Trigger 'auditoria_no_truncate':              │
                │      BEFORE TRUNCATE -> Excepción 42501          │
                └──────────────────────────────────────────────────┘
```

---

## 3. Implementación Técnica

### 3.1. Protección a Nivel de Base de Datos PostgreSQL (`supabase/migrations/`)
En las migraciones `20261027000200_auditoria_consentimiento_catalogos.sql` y `20261111000300_rf63_registros_inmutables.sql` se configuraron las siguientes reglas estructurales:

1. **Triggers de Inmutabilidad Estricta:**
   ```sql
   create or replace function public.auditoria_inmutable()
   returns trigger language plpgsql set search_path = '' as $$
   begin
     raise exception 'La auditoría no se puede modificar ni borrar (RF63)' using errcode = '42501';
   end;
   $$;

   create trigger auditoria_no_update
     before update or delete on public.auditoria
     for each row execute function public.auditoria_inmutable();

   create trigger auditoria_no_truncate
     before truncate on public.auditoria
     for each statement execute function public.auditoria_inmutable();
   ```

2. **Sello de Tiempo Forzado del Servidor:**
   ```sql
   create or replace function public.auditoria_forzar_sello_servidor()
   returns trigger language plpgsql set search_path = '' as $$
   begin
     new.ocurrio_en := clock_timestamp();
     return new;
   end;
   $$;

   create trigger auditoria_sello_servidor
     before insert on public.auditoria
     for each row execute function public.auditoria_forzar_sello_servidor();
   ```

3. **Revocación Total de Privilegios Mutables:**
   ```sql
   revoke update, delete, truncate on public.auditoria from public, anon, authenticated;
   alter table public.auditoria enable row level security;
   ```

### 3.2. Protección en la Capa de Servicios (`src/services/auditoriaService.js`)
- **Congelamiento Profundo:** Cada evento normalizado se devuelve con `Object.freeze(evento)` y `Object.freeze(evento.detalle)`, haciendo que cualquier intento de asignación lance `TypeError`.
- **Excepciones Preventivas:**
  - `editarEventoAuditoria(id, cambios)`: Lanza excepción inmediata indicando que la auditoría no admite modificaciones.
  - `eliminarEventoAuditoria(id)`: Lanza excepción inmediata indicando que los registros no pueden eliminarse.
  - `vaciarAuditoria()`: Lanza excepción inmediata bloqueando cualquier intento de vaciado masivo.
- **Guardianes de Inmutabilidad:**
  - `intentarModificarRegistroAuditoria(id, cambios)`: Retorna `{ ok: false, bloqueado: true }`.
  - `intentarEliminarRegistroAuditoria(id)`: Retorna `{ ok: false, bloqueado: true }`.
- **Validadores de Integridad:**
  - `validarInmutabilidad(evento)`: Certifica el estado inalterable del objeto.
  - `validarSelloTiempoServidor(ocurrioEn)`: Verifica el formato canónico ISO 8601 del sello temporal del servidor.

### 3.3. Interfaz de Usuario de Solo Lectura (`src/components/RegistroAuditoriaPanel.vue`)
- El panel de administración visualiza los eventos con el distintivo **"Registro Inmutable Activo"**.
- La tabla de auditoría carece deliberadamente de controles o botones para modificar o eliminar registros.
- La consulta consolida los registros remotos y locales ordenados de forma estrictamente descendente por su sello de tiempo.

---

## 4. Verificación de Criterios de Aceptación

| Criterio de Aceptación | Resultado de la Verificación | Evidencia Técnica |
| :--- | :--- | :--- |
| **Intentar editar o borrar un registro falla.** | **CUMPLIDO** | Las funciones `editarEventoAuditoria`, `eliminarEventoAuditoria` y `vaciarAuditoria` arrojan excepciones terminantes. Las llamadas directas de mutación a la base de datos son bloqueadas tanto por triggers `BEFORE UPDATE OR DELETE` con código SQLSTATE `42501` como por políticas RLS y revocación de permisos. Los objetos en memoria están congelados con `Object.freeze`. |
| **Llevan sello de tiempo.** | **CUMPLIDO** | Cada registro incluye la columna `ocurrio_en` con valor por defecto `now()`, blindada por el trigger `auditoria_sello_servidor` que sobreescribe cualquier entrada con `clock_timestamp()` en el motor de base de datos. Validado con `validarSelloTiempoServidor()`. |

---

## 5. Batería de Pruebas Automatizadas

Se implementó el script de pruebas automatizadas `scripts/test-rf63-registros-inmutables.js` con **20 pruebas**:

1. **Intentar Editar un Registro Falla:** 5 pruebas (excepción en editar, bloqueo en helper, TypeError por objeto congelado, TypeError por detalle congelado, función de validación).
2. **Intentar Borrar un Registro Falla:** 3 pruebas (excepción en eliminar, bloqueo en helper, excepción en vaciar/truncar).
3. **Sello de Tiempo del Servidor:** 3 pruebas (validador de fechas ISO 8601, presencia en normalización, generación automática en registro).
4. **Configuración en PostgreSQL:** 7 pruebas (columna `now()`, trigger `no_update`, trigger `no_truncate`, excepción 42501, trigger `sello_servidor` con `clock_timestamp()`, revocación de permisos, RLS sin políticas de update/delete).
5. **Interfaz de Usuario:** 2 pruebas (distintivo inmutable presente, ausencia total de botones de edición/borrado).

### Ejecución:
```bash
npm run test:rf63
```
Resultado: **20 / 20 pruebas aprobadas (100% éxito)**.
