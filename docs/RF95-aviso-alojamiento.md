# RF95 · Aviso sobre el alojamiento de los datos fuera de Chile

**Requerimiento:** almacenamiento y transferencias: informar si los datos se alojan fuera de Chile (Supabase usa us-east-1) y su base legal (ISO 27001 A.5.23 y A.5.34).
**Se relaciona con:** RF88 (política de privacidad), RF59/RF76 (consentimiento), RF58/RF90 (derechos y revocación) y el registro de proveedores (`docs/iso27001/05-proveedores.md`).

## Qué se informa

| Pregunta de la persona | Respuesta que da la plataforma |
|---|---|
| ¿Mis datos están en Chile? | No. Se alojan fuera de Chile, en servidores de Estados Unidos. |
| ¿Quién los trata y dónde? | Supabase (base de datos, AWS us-east-1), Vercel (aplicación web y funciones), Resend (correo de confirmación) y Google (inicio de sesión e invitaciones por Gmail). |
| ¿Qué datos toca cada uno? | Cuenta, mediciones, ficha de salud, auditoría (Supabase); tráfico y lecturas del sensor en tránsito (Vercel); correo y nombre (Resend); correo y datos de la invitación (Google). |
| ¿Mi ficha de salud está en claro en el proveedor? | No: se guarda cifrada con una clave que el proveedor no tiene. |
| ¿Con qué base legal? | Su consentimiento expreso (que puede retirar), proveedores que actúan como encargados de la UNACH, y el marco de la Ley 19.628 y la Ley 21.719. |
| ¿Qué puedo hacer? | Retirar el consentimiento, descargar o eliminar sus datos, o no iniciar sesión. |

El texto sale de **un solo archivo**, `src/data/alojamiento.js`. Solo afirma la región de Supabase (la única comprobada); para los demás proveedores dice «Estados Unidos» sin inventar una región.

## Dónde se ve

| Lugar | Versión | Para qué |
|---|---|---|
| Inicio de sesión | Aviso compacto + casilla que ahora dice «…y que mis datos se alojen fuera de Chile (Estados Unidos)» | Se informa y se acepta de forma expresa antes de entrar |
| Consentimiento informado (antes de medir) | Aviso compacto | Recordarlo en el momento de dar el consentimiento |
| Política de privacidad | Sección completa «Dónde se alojan tus datos y con qué base legal» | Proveedores, protecciones, base legal y qué puede hacer |
| Mis datos y mis derechos | Aviso compacto | Que quien ejerce sus derechos vea el alojamiento |
| Pie de página (todas las pantallas) | Enlace «Alojamiento de datos fuera de Chile» | Acceso directo a la sección |

Los enlaces con ancla (`/privacidad#alojamiento-datos`) llevan directo a la sección (el router se desplaza solo cuando el enlace trae ancla).

## Qué se hizo

1. Archivo único de textos y proveedores, y componente `AvisoAlojamiento` con versión compacta y completa.
2. Aviso en los cinco lugares de la tabla anterior.
3. Casilla del inicio de sesión con aceptación expresa del alojamiento fuera de Chile (sigue siendo obligatoria).
4. El documento «alojamiento» de la base ya no dice «base legal pendiente»: la migración lo deja con el texto vigente (versión 1.1), y una prueba verifica que coincida letra por letra con el de la aplicación.
5. La política de privacidad menciona a Google en el inicio de sesión y remite a la explicación de la base legal.
6. Google figura ahora como cuarto proveedor en `docs/iso27001/05-proveedores.md`.

## Archivos

- `src/data/alojamiento.js`, `src/components/AvisoAlojamiento.vue`
- `src/views/LoginView.vue`, `PrivacidadView.vue`, `MisDatosView.vue`, `src/components/ConsentimientoModal.vue`, `src/App.vue`, `src/router/index.js`
- `src/data/politicaPrivacidad.js`
- `supabase/migrations/20261122000100_rf95_aviso_alojamiento.sql`
- `scripts/test-rf95-aviso-alojamiento.mjs` → `npm run test:rf95`

## Criterios de aceptación

1. Antes de iniciar sesión, la persona ve que sus datos se alojan fuera de Chile y debe aceptarlo de forma expresa.
2. La política de privacidad explica dónde están los datos, quién los trata, con qué base legal y qué puede hacer la persona.
3. El aviso es visible desde cualquier pantalla (pie de página) y en «Mis datos».
4. Lo que se afirma coincide con la realidad: la región de Supabase está comprobada y no se inventa la de otros proveedores.
5. El texto de la aplicación y el de la base de datos son idénticos.

## Revisión legal pendiente (no resuelta por este cambio)

El plan de entregas pide criterio legal para el RF95. Este cambio **informa** y **recoge consentimiento**; no valida que eso baste jurídicamente. Conviene que la UNACH o un especialista confirme:

- [ ] Que el consentimiento expreso del titular es una base suficiente para la transferencia internacional, sobre todo con la entrada en vigencia de la Ley 21.719.
- [ ] Los acuerdos de tratamiento (DPA) con Supabase, Vercel, Resend y Google, y las garantías que ofrecen.
- [ ] La región real de Vercel, Resend y Google, para dejar de decir solo «Estados Unidos».
- [ ] Si el cambio de texto justifica subir la versión de la política de privacidad a 1.1 (hoy sigue en 1.0 para no obligar a todos a aceptarla de nuevo).
- [ ] Si conviene que las personas que ya iniciaron sesión vuelvan a aceptar la casilla nueva (hoy solo se pide en inicios de sesión nuevos).
