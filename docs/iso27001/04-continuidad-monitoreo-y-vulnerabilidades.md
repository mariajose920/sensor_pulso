# Continuidad, respaldos, monitoreo y vulnerabilidades

ISO/IEC 27001:2022 A.5.29, A.5.30, A.8.8, A.8.13, A.8.16, A.8.5 y A.8.2.

> Lo marcado **por confirmar** depende del plan contratado con cada proveedor y de decisiones de la UNACH. Aquí queda el procedimiento y la evidencia que hay que reunir; no se afirma lo que no se ha comprobado.

## 1. Copias de seguridad y restauración (A.8.13)

| Qué | Dónde | Frecuencia | Retención | Estado |
|---|---|---|---|---|
| Base de datos (Supabase) | Respaldos del proveedor | **por confirmar** según el plan | **por confirmar** | Por confirmar en el panel de Supabase |
| Código | GitHub | En cada push | Historial completo | Implementado |
| Migraciones | `supabase/migrations/` | En cada PR | Historial completo | Implementado |
| Claves de cifrado | Variables de Vercel | Copia en custodia separada (dos personas) | Mientras haya datos cifrados con esa versión | **Pendiente**: sin la clave, la ficha de salud no se puede recuperar |

**Objetivos propuestos:** RPO (pérdida máxima de datos) 24 horas; RTO (tiempo de recuperación) 8 horas hábiles.

### Prueba de restauración (una vez por semestre)

1. Restaurar el último respaldo en un proyecto Supabase **de prueba** (nunca sobre producción).
2. Aplicar las migraciones faltantes y comprobar que arranca la aplicación.
3. Verificar: número de filas de `perfiles` y `mediciones`; una ficha de salud se descifra con la clave guardada.
4. Anotar fecha, tiempo que tomó y problemas en la tabla de abajo.

| Fecha | Quién | Resultado | Tiempo | Observaciones |
|---|---|---|---|---|
| *(sin pruebas aún)* | | | | |

## 2. Continuidad (A.5.29, A.5.30)

| Escenario | Qué pasa | Qué hacer |
|---|---|---|
| Cae la aplicación web (Vercel) | No se puede entrar | Revertir al despliegue anterior en Vercel; los datos siguen a salvo |
| Cae Supabase | No hay sesión ni datos | La app es PWA: la ficha y la medición siguen en el dispositivo (modo sin conexión); se sincroniza al volver |
| Cae Resend | No llegan correos de confirmación | Reintentar reenvío; el acceso de quienes ya tienen cuenta no se afecta |
| Clave de cifrado perdida | La ficha de salud antigua no se puede leer | Restaurar la clave desde la custodia (sección 1) |
| Clave de cifrado expuesta | Riesgo para la ficha de salud | Procedimiento de incidentes: nueva versión de clave y recifrado |
| ESP32 comprometido | Telemetría falsa | `revocar_dispositivo` y emitir un token nuevo |

## 3. Monitoreo de la auditoría (A.8.16)

La tabla `auditoria` registra los hechos relevantes. Falta que alguien la mire. Revisión mínima:

| Señal | Dónde se ve | Frecuencia | Qué hacer |
|---|---|---|---|
| Registros marcados `sospechoso` | `auditoria.sospechoso = true` | Semanal | Investigar y, si corresponde, abrir un incidente |
| Muchos `intentos_login` fallidos | Tabla `intentos_login` | Semanal | Revisar bloqueos; considerar bloquear la cuenta |
| Cambios de rol o de permisos del profesor | `auditoria` (permisos) | Semanal | Confirmar que los autorizó el administrador |
| Descargas masivas de datos (`exportacion_datos`) | `auditoria` | Mensual | Confirmar que son del propio titular |
| Solicitudes de derechos por vencer | Pantalla `/admin/seguridad` | Semanal | Responder antes de 30 días |

Consulta de apoyo (administrador, en el editor SQL de Supabase):

```sql
select ocurrio_en, accion, entidad, actor_id
  from public.auditoria
 where sospechoso and ocurrio_en > now() - interval '7 days'
 order by ocurrio_en desc;
```

**Automatización pendiente:** alerta por correo cuando aparezca un registro sospechoso (función programada o Supabase Log Drain). Decisión: **por asignar**.

## 4. Vulnerabilidades y dependencias (A.8.8)

- **Dependabot** (`.github/dependabot.yml`, incluido en esta rama): propone semanalmente actualizaciones de las dependencias de `npm` y de las acciones de GitHub. Se revisan con el mismo flujo de ramas y PR.
- **Revisión manual mensual:** ejecutar `npm audit --omit=dev` y anotar el resultado. Las de severidad alta se corrigen en el mes.
- **Prueba de penetración:** antes de abrir la plataforma a más usuarios, probar autenticación, RLS (cuentas de cada rol intentando leer datos ajenos), endpoints `/api` y carga de archivos CSV. **Por asignar.**
- **Secretos:** la detección de secretos del repositorio (RF74) sigue activa; las claves viven solo en variables de entorno.

## 5. MFA para administradores (A.8.2, A.8.5)

El esquema tiene `perfiles.mfa_requerido` y Supabase admite factores TOTP. Falta comprobar y exigir:

1. En Supabase Auth, habilitar MFA (TOTP).
2. Marcar `mfa_requerido = true` para toda cuenta con `es_admin = true`.
3. Hacer que la interfaz pida el segundo factor antes de abrir `/admin` y `/admin/seguridad`.
4. Registrar la fecha de activación aquí: **sin activar aún**.

## 6. Concientización (A.6.3)

Una charla anual de 30 minutos para el equipo y los profesores: datos de salud, contraseñas y MFA, qué es un incidente y cómo avisar, uso del mínimo necesario. Asistencia registrada. **Por asignar.**
