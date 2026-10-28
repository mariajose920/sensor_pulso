# Ramas y flujo de trabajo (RF74)

Una rama por requerimiento. Los cambios llegan a `develop` y a `main` **solo por pull request**.

## 1. Nombre de las ramas

El nombre **contiene `RFNN` o `RNFNN`**, donde `NN` es el número del requerimiento, en cualquier posición. El resto es libre. No importan las mayúsculas, minúsculas, puntos ni guiones, y entre `RF` y el número puede haber un guion o un punto.

| Válidas | Inválidas |
|---|---|
| `RF12-esquema-supabase` | `mi-rama` (no menciona el requerimiento) |
| `esquema-rf12` | `RF1234` (el número tiene más de 3 dígitos) |
| `rf-12` | `perf12` (el "rf" es parte de otra palabra) |
| `rf05.recepcion.wifi`, `Rnf04_latencia`, `RF118` | `rf` (falta el número) |

`main` y `develop` son ramas fijas.

## 2. Commits

**Dentro de una rama RFNN / RNFNN los commits no tienen ninguna exigencia**: el mensaje es libre.

## 3. Lo que no se puede hacer

- **Commits directos a `main` o `develop`.** El hook `pre-commit` lo bloquea. Se trabaja en una rama del requerimiento.
- **Subir (`git push`) directamente a `main` o `develop`.** El hook `pre-push` lo bloquea. Se sube la rama del requerimiento y se abre un pull request.
- **Unir ramas hacia `main` o `develop` en tu computador** (`git merge`). El hook `pre-merge-commit` lo bloquea. La unión se hace con el pull request.
- **Subir una rama cuyo nombre no contiene `RFNN` o `RNFNN`.**
- **Subir una rama con errores:** el `pre-push` instala las dependencias si faltan y ejecuta `npm run build`; si falla, no se sube.

Si algo falla, el hook muestra qué corregir. Para renombrar una rama: `git branch -m <nombre-nuevo>`. Borrar una rama del remoto que no sea `main` o `develop` se permite.

Además, `pre-commit` busca secretos (`.env`, claves, llaves privadas) en lo que vas a commitear, para que no se publiquen (RF69).

### Activar los hooks locales

Se activan solos con `npm install` (el script `prepare`). A mano:

```bash
git config core.hooksPath .githooks
```

## 4. Que un pull request con errores NO se pueda unir a `develop`

Los hooks locales se pueden saltar (`--no-verify`) y no actúan cuando se une desde la página de GitHub. Lo que **bloquea de verdad** es la protección de ramas, que activa **una vez** un administrador del repositorio. El flujo `.github/workflows/validar.yml` ejecuta los controles *Nombre de rama* y *Compilación* en cada pull request.

1. GitHub → **Settings → Rules → Rulesets → New ruleset → New branch ruleset**.
2. **Enforcement status:** Active. **Target branches:** `develop` (crea otra regla igual para `main`).
3. Activar:
   - **Restrict deletions** y **Block force pushes**.
   - **Require a pull request before merging**: con esto GitHub rechaza también los push directos a la rama.
   - **Require status checks to pass** y agregar como obligatorios **Nombre de rama** y **Compilación**. Si no aparecen en la lista, abre antes un pull request para que corran por primera vez.
4. Opcional, para impedir que se creen ramas fuera de formato: otro ruleset con **Target: All branches**, activar **Restrict branch names**, método **Regex** y el patrón:
   ```
   ^(main|develop|(.*[^a-zA-Z])?(?i:rf|rnf)[^a-zA-Z0-9]?[0-9]{1,3}([^0-9].*)?)$
   ```

Con esto, un pull request cuya rama no cumple o con la web rota **no se puede unir a `develop`**, y nadie puede subir ni hacer commit directo a `develop` o `main`.
