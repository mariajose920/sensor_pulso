# Proveedores que tratan datos (A.5.19 a A.5.23)

Tres proveedores intervienen. Antes de operar con personas reales hay que reunir, por cada uno, la evidencia de la columna «Pendiente». **Nada de lo marcado como pendiente está confirmado**: son tareas, no afirmaciones.

| | Supabase | Vercel | Resend |
|---|---|---|---|
| Para qué | Base de datos y autenticación | Alojar la aplicación web y las funciones `/api` | Enviar correos de confirmación |
| Datos que toca | Todos (cuentas, mediciones, ficha de salud cifrada, auditoría) | Tráfico de la web; claves en variables de entorno | Correo institucional y nombre de destino |
| Ubicación | Región us-east-1 (Estados Unidos), fuera de Chile | Red global; funciones en la región configurada (**por confirmar**) | **Por confirmar** |
| Datos de salud en claro | No: la ficha se guarda cifrada con una clave que el proveedor no tiene | No: la clave está en variables de entorno y los datos pasan cifrados por HTTPS; el descifrado ocurre en la función a pedido del titular | No se envían |
| Transferencia internacional | Sí | Sí | Sí |

## Pendiente por proveedor

| Pendiente | Supabase | Vercel | Resend |
|---|---|---|---|
| Aceptar o firmar el acuerdo de tratamiento de datos (DPA) y guardarlo | ☐ | ☐ | ☐ |
| Revisar la lista de subencargados y avisos de cambios | ☐ | ☐ | ☐ |
| Descargar la certificación o el informe vigente (p. ej. SOC 2 / ISO 27001) del proveedor | ☐ | ☐ | ☐ |
| Confirmar el plan contratado y qué respaldos incluye | ☐ | n/a | n/a |
| Confirmar cómo se notifican los incidentes al cliente y en qué plazo | ☐ | ☐ | ☐ |
| Confirmar quién tiene acceso al panel (lista de personas) y activar MFA | ☐ | ☐ | ☐ |
| Anotar la fecha de la próxima revisión del proveedor | ☐ | ☐ | ☐ |

## Reglas de uso

- Las claves (`CLAVE_CIFRADO_CAMPOS`, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`) viven **solo** en variables de entorno de Vercel. No se escriben en el repositorio, en chats ni en el navegador (variables con prefijo `VITE_` son públicas).
- Quien deja el proyecto pierde de inmediato su acceso a los tres paneles y se rotan las claves que conocía.
- Cada tres meses se revisa la lista de personas con acceso a cada panel.
- La política de privacidad (sección «Quién más interviene y dónde se alojan») debe coincidir con esta tabla. Si cambia un proveedor o su región, se actualiza la política y su versión.

## Revisión

| Fecha | Revisó | Cambios |
|---|---|---|
| *(sin revisiones aún)* | | |
