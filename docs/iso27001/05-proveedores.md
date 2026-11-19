# Proveedores que tratan datos (A.5.19 a A.5.23)

Cuatro proveedores intervienen. Antes de operar con personas reales hay que reunir, por cada uno, la evidencia de la columna «Pendiente». **Nada de lo marcado como pendiente está confirmado**: son tareas, no afirmaciones.

| | Supabase | Vercel | Resend | Google |
|---|---|---|---|---|
| Para qué | Base de datos y autenticación | Alojar la aplicación web y las funciones `/api` | Enviar correos de confirmación | Verificar la identidad al iniciar sesión con Google y enviar las invitaciones a las aulas (Gmail) |
| Datos que toca | Todos (cuentas, mediciones, ficha de salud cifrada, auditoría) | Tráfico de la web; claves en variables de entorno | Correo institucional y nombre de destino | Correo institucional; en las invitaciones, el nombre del aula y del profesor |
| Ubicación | Región us-east-1 (Estados Unidos), fuera de Chile | Red global; funciones en la región configurada (**por confirmar**) | **Por confirmar** | Infraestructura global del proveedor; fuera de Chile (**región por confirmar**) |
| Datos de salud en claro | No: la ficha se guarda cifrada con una clave que el proveedor no tiene | No: la clave está en variables de entorno y los datos pasan cifrados por HTTPS; el descifrado ocurre en la función a pedido del titular | No se envían | No se envían |
| Transferencia internacional | Sí | Sí | Sí | Sí |

Lo que se informa a las personas sobre estos proveedores (dónde están, qué datos tocan, base legal y qué pueden hacer) sale de un solo archivo, `src/data/alojamiento.js` (RF95). Solo afirma la región de Supabase, que es la única comprobada; para los demás dice «fuera de Chile / Estados Unidos» sin inventar una región. Si se confirma otra región, se actualiza ese archivo y esta tabla.

## Pendiente por proveedor

| Pendiente | Supabase | Vercel | Resend | Google |
|---|---|---|---|---|
| Aceptar o firmar el acuerdo de tratamiento de datos (DPA) y guardarlo | ☐ | ☐ | ☐ | ☐ |
| Revisar la lista de subencargados y avisos de cambios | ☐ | ☐ | ☐ | ☐ |
| Descargar la certificación o el informe vigente (p. ej. SOC 2 / ISO 27001) del proveedor | ☐ | ☐ | ☐ | ☐ |
| Confirmar el plan contratado y qué respaldos incluye | ☐ | n/a | n/a | n/a |
| Confirmar cómo se notifican los incidentes al cliente y en qué plazo | ☐ | ☐ | ☐ | ☐ |
| Confirmar quién tiene acceso al panel (lista de personas) y activar MFA | ☑ (RNF13) | ☑ (RNF13) | ☐ | ☐ (cuenta de Gmail de la plataforma) |
| Confirmar la región en la que opera y actualizar el aviso de alojamiento (RF95) | ☑ us-east-1 | ☐ | ☐ | ☐ |
| Anotar la fecha de la próxima revisión del proveedor | ☐ | ☐ | ☐ | ☐ |

## Reglas de uso

- Las claves (`CLAVE_CIFRADO_CAMPOS`, `SUPABASE_SECRET_KEY`, `RESEND_API_KEY`) viven **solo** en variables de entorno de Vercel. No se escriben en el repositorio, en chats ni en el navegador (variables con prefijo `VITE_` son públicas).
- Quien deja el proyecto pierde de inmediato su acceso a los tres paneles y se rotan las claves que conocía.
- Cada tres meses se revisa la lista de personas con acceso a cada panel.
- La política de privacidad (sección «Quién más interviene y dónde se alojan») debe coincidir con esta tabla. Si cambia un proveedor o su región, se actualiza la política y su versión.

## Revisión

| Fecha | Revisó | Cambios |
|---|---|---|
| 2026-11-18 | María José | RF95: se agrega a Google como cuarto proveedor y se enlaza el aviso de alojamiento fuera de Chile (ver `docs/RF95-aviso-alojamiento.md`) |
| 2026-11-17 | Adán Ramos | RNF13: Verificación de cuentas individuales y activación obligatoria de MFA al 100% en Supabase y Vercel (ver `docs/RNF13-mfa-supabase-vercel.md`) |
