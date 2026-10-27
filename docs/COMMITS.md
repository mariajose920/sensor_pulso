# Convención de ramas y commits (RF74)

Reglas del repositorio para llevar un historial ordenado: una rama por requerimiento y mensajes de commit con una estructura fija. Se validan en tu computador (hooks de Git) y en GitHub (Actions).

## 1. Ramas

Una rama por cada requerimiento, creada desde `develop`. Todo en **minúscula**, con palabras separadas por guion (sin mayúsculas, espacios ni guiones bajos):

| Formato | Ejemplo |
|---|---|
| `rfNN-descripcion` | `rf05-recepcion-wifi`, `rf12-esquema-supabase` |
| `rnfNN-descripcion` | `rnf04-latencia-tiempo-real` |
| `docs/tema` | `docs/requerimientos` |
| `hotfix/tema` | `hotfix/token-expirado` |

`main` y `develop` son ramas fijas. El trabajo entra a `develop` por pull request; `main` se actualiza en las reuniones de entrega.

## 2. Estructura del mensaje de commit

```
tipo(alcance): descripción corta en minúscula

Cuerpo opcional: qué cambia y por qué (no cómo).

Co-Authored-By: Nombre <correo>      (opcional)
```

**Encabezado** (primera línea), obligatorio:

- `tipo`: uno de la tabla siguiente.
- `alcance`: el requerimiento (`rf12`, `rnf04`) o un área: `repo`, `db`, `ci`, `docs`, `firmware`, `web`, `deps`. Varios se separan con coma: `feat(rf08,rf114)`.
- `descripción`: al menos 10 caracteres, empieza en minúscula, no termina en punto y está en español. El encabezado completo mide como máximo 100 caracteres.
- Si el cambio rompe compatibilidad, añade `!` antes de los dos puntos: `feat(db)!: renombra la tabla de lecturas`.
- Si hay cuerpo, va separado del encabezado por **una línea en blanco**.

| Tipo | Cuándo usarlo |
|---|---|
| `feat` | funcionalidad nueva |
| `fix` | corrección de un error |
| `docs` | solo documentación |
| `style` | formato, sin cambiar el comportamiento |
| `refactor` | reorganizar código sin cambiar el comportamiento |
| `perf` | mejora de rendimiento |
| `test` | pruebas |
| `build` | dependencias o configuración de compilación |
| `ci` | flujos de GitHub Actions o hooks |
| `chore` | tareas varias de mantenimiento |
| `revert` | deshacer un commit anterior |
| `merge` | unión de ramas escrita a mano |

Los mensajes que genera Git solos (`Merge pull request #3 ...`, `Revert "..."`, `fixup!`) no se validan.

### Ejemplos correctos

```
feat(rf24): comparar medición con plantilla ppg de reposo
fix(rf07): corregir el cálculo de bpm cuando falta un pico
docs(repo): explicar la convención de commits
feat(db): agregar tabla de alertas con rls
chore(deps): actualizar supabase-js a 2.48
feat(rf08,rf114)!: mostrar spo2 por canal
```

### Ejemplos que se rechazan

| Mensaje | Problema |
|---|---|
| `arreglos` | no tiene `tipo(alcance): descripción` |
| `Feat(rf12): Esquema de base de datos` | tipo en mayúscula y descripción con mayúscula inicial |
| `feat: esquema de base de datos` | falta el alcance |
| `feat(rf12): esquema.` | termina en punto |
| `feat(rf12): bd` | descripción muy corta |
| `feature(rf12): esquema de base de datos` | tipo inexistente |
| `feat(tarea5): esquema de base de datos` | alcance no válido |

## 3. Qué se valida y dónde

| Control | Dónde | Archivo |
|---|---|---|
| Formato del mensaje de commit | tu computador (`commit-msg`) y GitHub | `scripts/validar-commit.mjs` |
| Nombre de la rama | tu computador (`pre-commit` y `pre-push`) y GitHub (en cada push y pull request) | `scripts/validar-rama.mjs` |
| Mensajes de los commits que subes | tu computador (`pre-push`) | `scripts/validar-push.mjs` |
| Secretos y archivos `.env` en lo que vas a commitear | tu computador (`pre-commit`) | `scripts/revisar-secretos.mjs` |
| La web instala y compila sin errores | tu computador (`pre-push`, instala con `npm ci` si faltan dependencias) y GitHub | `npm run build` |

**`git push` se detiene** si la rama tiene un nombre fuera de formato, si algún commit nuevo no cumple la convención o si la web no compila. Borrar una rama del remoto siempre se permite.

### Activar los hooks locales

Se activan solos al ejecutar `npm install` (el script `prepare` configura `core.hooksPath`). Para activarlos a mano:

```bash
git config core.hooksPath .githooks
```

Para probar un mensaje sin hacer commit:

```bash
echo "feat(rf12): esquema de base de datos" > /tmp/msg.txt
node scripts/validar-commit.mjs /tmp/msg.txt
```

### Importante

Los hooks locales se pueden saltar (`git commit --no-verify`), por eso se repiten en GitHub Actions. Para que el servidor **bloquee** de verdad un pull request con errores, un administrador del repositorio debe activarlo una vez:

1. GitHub → **Settings → Branches → Add branch ruleset** (o *Add classic branch protection rule*).
2. Rama: `develop` (y `main`).
3. Activar **Require a pull request before merging** y **Require status checks to pass**.
4. Elegir como obligatorios los checks **Commits y nombre de rama** y **Compilación**.

Con esto, un pull request con un mensaje mal formado, una rama mal nombrada o una web que no compila no se puede unir.
