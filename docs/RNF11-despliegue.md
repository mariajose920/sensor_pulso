# RNF11 · Despliegue en Vercel con base de datos en Supabase

Requerimiento: *la plataforma debe poder desplegarse en Vercel, con la base de datos en Supabase.*

## Cómo queda el despliegue

```
rama RFNN / RNFNN  ──pull request──▶  develop  ──pull request──▶  main
     │                                   │                          │
     ▼                                   ▼                          ▼
 vista previa en Vercel            vista previa en Vercel     PRODUCCIÓN en Vercel
 (URL propia de la rama)           (URL de develop)           https://sensorpulso.vercel.app
                                                                      │
                          todas leen y escriben en el proyecto de Supabase ohdgfdbmnrwndffhtqdg
```

| Tema | Decisión |
|---|---|
| Producción | Rama **`main`**. Se actualiza cuando se une `develop` a `main` (por ejemplo, en cada entrega). |
| Vistas previas | Cada rama y `develop` tienen su propia URL de vista previa. |
| Dirección | `sensorpulso.vercel.app` (la gratuita del proyecto). |
| Acceso | **Público**: cualquier persona abre la web sin cuenta de Vercel. |
| Base de datos | **Un solo proyecto de Supabase** (`ozzehtpqxpicfqvmulcg`) para todo. Ver el riesgo más abajo. |
| Seguridad | Cabeceras completas con política de contenido (CSP), definidas en `vercel.json`. |
| Node | **24.x** en Vercel, en `.nvmrc`, en `engines` de `package.json` y en el flujo de GitHub. |

## Lo que ya está en el código

- `vercel.json`: framework (Vite), comandos de instalación y compilación, carpeta de salida (`dist`), rutas de la aplicación (SPA) y cabeceras:
  - HTTPS estricto, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy` y `Cross-Origin-Opener-Policy`.
  - **Política de contenido:** solo se carga código propio y la conexión permitida es a `*.supabase.co` (HTTP y WebSocket). No permite `eval` ni scripts en línea.
  - Caché larga para `/assets/`, y `sw.js` y el manifiesto sin caché.
- `.nvmrc` y `engines`: versión de Node.
- `scripts/verificar-despliegue.mjs`: comprobación del despliegue (ver más abajo).

## Lo que debes hacer tú en los paneles (una sola vez)

Yo no cambié nada en Vercel ni en Supabase. Estos pasos los hace quien administra las cuentas.

### 1. Vercel · rama de producción
**Settings → Git → Production Branch:** `main`.

### 2. Vercel · variables de entorno
**Settings → Environment Variables.** Hoy existen `NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` solo para Producción, pero la web lee otros nombres. Crea estas dos, marcando **Production, Preview y Development**:

| Nombre | Valor |
|---|---|
| `VITE_SUPABASE_URL` | `https://ozzehtpqxpicfqvmulcg.supabase.co` |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | la clave que empieza con `sb_publishable_` (Supabase → Project Settings → API Keys) |

- La clave publicable es pública por diseño; la seguridad la da el RLS.
- **Nunca** pongas la clave secreta (`sb_secret_...`) con prefijo `VITE_`: Vite expone al navegador todo lo que empieza así.
- Las variables `NEXT_PUBLIC_...` ya no se usan; puedes borrarlas.
- Las variables solo llegan a los despliegues **nuevos**: después de crearlas, vuelve a desplegar (**Deployments → ⋯ → Redeploy**).

### 3. Vercel · acceso público
**Settings → Deployment Protection →** desactiva **Vercel Authentication**. Si queda activa, los enlaces piden iniciar sesión en Vercel y los estudiantes no podrán abrir la web.

### 4. Vercel · Node
**Settings → General → Node.js Version:** `24.x` (ya está así).

### 5. Supabase · direcciones permitidas para el acceso (Auth)
**Authentication → URL Configuration:**

- **Site URL:** `https://sensorpulso.vercel.app`
- **Redirect URLs:**
  - `https://sensorpulso.vercel.app/**`
  - `https://*-mjvilchesaranguiz-8751s-projects.vercel.app/**` (vistas previas)
  - `http://localhost:5173/**` (desarrollo local)

Sin esto, los enlaces del correo de confirmación (RF48) y de recuperar contraseña (RF50) apuntarían a una dirección equivocada o serían rechazados.

### 6. Supabase · integración con GitHub
**Project Settings → Integrations → GitHub:** rama de producción **`main`**, la misma que usa Vercel, para que las migraciones lleguen a la base junto con la web. Una sola rama, no `main, develop`.

### 7. Primer despliegue de producción
Abre un pull request de `develop` a `main`, únelo, espera a que Vercel termine y ejecuta:

```bash
npm run verificar:despliegue -- https://sensorpulso.vercel.app
```

## Verificar un despliegue

```bash
npm install
npm run verificar:despliegue -- --local                          # simula Vercel en tu computador
npm run verificar:despliegue -- https://sensorpulso.vercel.app   # un despliegue real
```

`--local` compila la web y la sirve con las mismas rutas y cabeceras de `vercel.json`, así se prueba **antes** de desplegar. En ambos casos revisa:

1. que la página abra **sin pedir iniciar sesión en Vercel**,
2. que recargar `/medicion`, `/comparacion`, `/aulas`, `/aprendizaje` y `/login` entregue la aplicación,
3. que el código desplegado traiga la URL de Supabase y que sea la del proyecto `ozzehtpqxpicfqvmulcg`,
4. que se pueda instalar (manifiesto, íconos y `sw.js` bien servidos),
5. las cabeceras de seguridad y la política de contenido,
6. que, en un navegador (móvil y computador), las 6 páginas se dibujen **sin errores en la consola ni bloqueos de la política de contenido**.

Si algo falla, indica qué corregir. Para otro proyecto de Supabase: `--proyecto <referencia>`.

## Qué hacer si algo falla

| Síntoma | Causa probable | Solución |
|---|---|---|
| El enlace pide iniciar sesión en Vercel | Vercel Authentication activa | Paso 3 |
| "No aparece ninguna URL de Supabase" | Falta `VITE_SUPABASE_URL` o tiene otro nombre, o no se redesplegó | Paso 2 y volver a desplegar |
| Pantalla en blanco y en la consola "Faltan VITE_SUPABASE_URL…" | Las variables no llegaron a la compilación | Paso 2 y volver a desplegar |
| "El sitio apunta a otro proyecto de Supabase" | La URL de la variable es de otro proyecto | Corregir `VITE_SUPABASE_URL` |
| Al recargar una página sale 404 | Falta `vercel.json` o no se aplicó | Comprobar que el archivo está en la raíz |
| La consola dice que la política de contenido bloqueó algo | Se agregó un recurso externo (fuente, imagen, API) | Agregar su dominio a la CSP de `vercel.json` y volver a verificar |
| El correo de confirmación lleva a otra dirección | Faltan las direcciones permitidas en Supabase | Paso 5 |
| La versión nueva no aparece en la app instalada | La PWA se actualiza al abrir la app | Cerrarla por completo y abrirla (ver `docs/RNF03-pwa.md`) |

## Riesgo aceptado: una sola base de datos

Todas las vistas previas de Vercel, `develop` y producción usan el **mismo** proyecto de Supabase. Una prueba hecha en una rama escribe datos en la base real.

- No pruebes con datos de personas reales fuera de producción.
- El esquema tiene RLS activo (RNF12), pero eso no separa entornos.
- **Pendiente (RF74):** crear un segundo proyecto de Supabase para desarrollo con el mismo esquema (`supabase/migrations`), y usar sus claves en las variables de **Preview** y **Development** de Vercel. Se recomienda hacerlo antes de la entrega.

## Lista de revisión manual

- [ ] `https://sensorpulso.vercel.app` abre desde un celular sin iniciar sesión en Vercel.
- [ ] Recargar `/comparacion` desde el celular funciona (no da 404).
- [ ] Registrarse con un correo `@alu.unach.cl` envía un correo cuyo enlace abre la web oficial.
- [ ] La web se puede instalar como app (ver `docs/RNF03-pwa.md`).
- [ ] La vista previa de un pull request abre y se conecta a Supabase.
- [ ] `npm run verificar:despliegue -- https://sensorpulso.vercel.app` termina sin fallos.
