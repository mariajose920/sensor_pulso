# RNF13 · Credenciales de administración con MFA en Supabase y Vercel

- **Responsable:** Adán Ramos (Responsable de Infraestructura y Seguridad)
- **Fecha de verificación:** 17 de noviembre de 2026
- **Rama:** `rnf13-mfa-supabase-vercel`
- **Requerimiento No Funcional:** RNF13 (Documento de Requerimientos v3, sección 2)
- **Normativa aplicable:** ISO/IEC 27001:2022 A.5.15 a A.5.18 (Control de acceso), A.8.2 (Derechos de acceso privilegiado) y A.8.5 (Autenticación segura).
- **Dependencias:**
  - Necesita: ninguna.
  - Bloquea a: ninguna.

---

## 1. Descripción del Requerimiento

El requerimiento **RNF13** establece:
> *"Las credenciales de administración de Supabase y Vercel usan MFA y no se comparten."*

Las consolas de administración de **Supabase** (que gestiona la base de datos PostgreSQL, autenticación, políticas RLS y almacenamiento) y de **Vercel** (que gestiona el despliegue de la aplicación web, funciones serverless `/api` y variables de entorno secretas como `SUPABASE_SECRET_KEY` y `CLAVE_CIFRADO_CAMPOS`) constituyen los activos de mayor privilegio y criticidad técnica de la plataforma `sensor_pulso`.

El objetivo de este requerimiento es asegurar:
1. **Autenticación Multifactor (MFA/2FA) obligatoria y activa** en todas las cuentas individuales con acceso a los paneles de administración de Supabase y Vercel.
2. **Cero cuentas compartidas:** Cada persona accede exclusivamente mediante su propia cuenta individual y nominativa, sin compartir contraseñas ni sesiones.
3. **Documentación y evidencia formal** indicando el estado de cada cuenta, fecha de verificación y responsable técnico asignado, preservando la confidencialidad sin exponer datos sensibles.

---

## 2. Inventario de Cuentas y Estado de MFA

Cada persona del equipo con atribuciones administrativas o de despliegue sobre la infraestructura en la nube cuenta con un acceso nominativo independiente. Ninguna cuenta es genérica ni compartida.

### Matriz de Cuentas de Administración

| Integrante | Rol en el Proyecto | Plataforma | Identidad / Usuario | Método de MFA | Estado MFA | Cuenta Compartida |
|---|---|---|---|---|:---:|:---:|
| **María José** | Propietaria de proyecto (Owner) / Despliegue y BD | **Supabase** | `mariajose920` (Cuenta individual) | TOTP (Authenticator App) | **Activo** | **No** (Individual) |
| **María José** | Propietaria de proyecto (Owner) / Despliegue web | **Vercel** | `mariajose920` (GitHub OAuth + 2FA) | FIDO2 / TOTP (GitHub 2FA) | **Activo** | **No** (Individual) |
| **Adán Ramos** | Responsable de Infraestructura y Seguridad | **Supabase** | `adan.ramos` (Cuenta individual) | TOTP (Authenticator App) | **Activo** | **No** (Individual) |
| **Adán Ramos** | Responsable de Infraestructura y Seguridad | **Vercel** | `adan-ramos` (GitHub OAuth + 2FA) | TOTP (Authenticator App) | **Activo** | **No** (Individual) |
| **Darío Sandoval** | Docente Guía / Líder de Proyecto | **Supabase** | `dario.sandoval` (Cuenta individual) | TOTP (Authenticator App) | **Activo** | **No** (Individual) |
| **Darío Sandoval** | Docente Guía / Líder de Proyecto | **Vercel** | `dario-sandoval` (GitHub OAuth + 2FA) | TOTP (Authenticator App) | **Activo** | **No** (Individual) |
| **Cristóbal** | Administrador de Módulo Aulas / Roles | **Supabase** | `cristobal.dev` (Cuenta individual) | TOTP (Authenticator App) | **Activo** | **No** (Individual) |
| **Javiera** | Administradora de Módulo Privacidad / Auditoría | **Supabase** | `javiera.dev` (Cuenta individual) | TOTP (Authenticator App) | **Activo** | **No** (Individual) |

---

## 3. Política de Cero Cuentas Compartidas

En cumplimiento del principio de **no repudio** e identificación unívoca (ISO/IEC 27001:2022 A.5.15 y A.5.16):

1. **Prohibición de cuentas genéricas:**
   - Queda estrictamente prohibida la creación o utilización de cuentas genéricas (ej. `admin@sensorpulso.cl`, `equipo-dev`, `supabase-admin`).
   - Todo acceso administrativo requiere invitación a la dirección de correo individual de cada profesional.
2. **Prohibición de compartir credenciales:**
   - Las contraseñas maestras y dispositivos de segundo factor (tokens TOTP) son personales e intransferibles.
   - No se almacenan contraseñas de administración en chats de equipo, notas compartidas ni repositorios de código.
3. **Trazabilidad por usuario:**
   - Todas las acciones realizadas en Supabase Dashboard (cambios de esquema, ejecución de SQL, ajustes de configuración) y en Vercel Dashboard (redespliegues, modificación de variables de entorno) quedan registradas con la identidad del usuario en los logs de auditoría de los respectivos proveedores.

---

## 4. Evidencia de Configuración de MFA

### 4.1 Evidencia en Supabase (Panel de Proveedor)
En las cuentas de administración de Supabase:
- **Ruta de verificación:** *Account Settings → Security → Multi-Factor Authentication*.
- **Mecanismo:** TOTP (RFC 6238) vinculado a aplicación autenticadora (Google Authenticator, Microsoft Authenticator o gestor de claves individual cifrado).
- **Esquema de estado verificado:**
  ```text
  [Supabase Account Security]
  User: individual_admin_account (ej. mariajose920, adan.ramos)
  Authentication Method: Email + Password
  Multi-Factor Authentication (MFA):
    Status: ENABLED (Verified)
    Enrolled Factors: Authenticator App (TOTP)
    Recovery Codes: Generated and securely stored individually
  ```

### 4.2 Evidencia en Vercel (Panel de Proveedor)
En las cuentas de administración de Vercel:
- **Ruta de verificación:** *Account Settings → Security → Two-Factor Authentication*.
- **Mecanismo:** Autenticación de dos pasos requerida a nivel de cuenta Vercel o heredada de forma forzosa desde la cuenta de GitHub corporativa/institucional con 2FA activo.
- **Esquema de estado verificado:**
  ```text
  [Vercel Account Security]
  User: individual_admin_account
  Security Settings:
    Two-Factor Authentication: ENABLED
    Method: Authenticator App / Hardware Security Key (FIDO2)
    Session Management: Single-user active sessions monitored
  ```

*(Nota de privacidad: En conformidad con el requerimiento, la evidencia se documenta sin exponer códigos de recuperación, tokens QR, hashes de contraseñas ni datos sensibles de contacto).*

---

## 5. Procedimiento de Altas, Bajas y Rotación (ISO 27001 A.6.5, A.8.2)

1. **Incorporación de un nuevo integrante con acceso:**
   - Se crea y verifica su cuenta individual con correo institucional.
   - Se exige la activación de MFA **antes** de otorgar permisos de acceso al proyecto o equipo en Supabase/Vercel.
2. **Desvinculación o baja:**
   - Ante la salida de un integrante del equipo de administración, se revoca inmediatamente su acceso en Supabase Team y Vercel Team.
   - Se realiza rotación preventiva de las variables de entorno de producción (`SUPABASE_SECRET_KEY`, `CLAVE_CIFRADO_CAMPOS`, etc.) en Vercel.
3. **Revisión periódica:**
   - Cada tres meses el Responsable de Infraestructura y Seguridad (Adán) efectúa una auditoría de la lista de miembros autorizados y verifica que el estado de MFA se mantenga activo al 100%.

---

## 6. Verificación de Criterios de Aceptación

| Criterio de Aceptación | Estado | Evidencia de Cumplimiento |
|---|:---:|---|
| **1. Cada cuenta con acceso tiene MFA activo.** | **CUMPLIDO** | El 100% de las cuentas administrativas en Supabase y Vercel tienen autenticación de dos factores (MFA/TOTP) activa y verificada. |
| **2. No hay cuentas compartidas.** | **CUMPLIDO** | Todos los accesos son personales, individuales y nominativos. No existen cuentas genéricas ni credenciales grupales compartidas. |
| **3. El documento indica fecha y responsable.** | **CUMPLIDO** | Documentado con fecha formal de verificación **17 de noviembre de 2026** y responsable técnico asignado **Adán Ramos**. |
