# Convención de ramas y commits (RF74)

Una rama por requerimiento, y cada rama y commit indica **de qué requerimiento es**. Es lo único que se exige.

## 1. Ramas

El nombre **comienza con `RFNN` o `RNFNN`**, donde `NN` es el número del requerimiento. Lo que sigue es libre. No importan las mayúsculas, minúsculas ni los puntos.

| Válidas | Inválidas |
|---|---|
| `RF12-esquema-supabase` | `mi-rama` (no menciona el requerimiento) |
| `rf05.recepcion.wifi` | `esquema-rf12` (el requerimiento no está al inicio) |
| `Rnf04_latencia` | `rf-12` (falta el número pegado a RF) |
| `RF118` | `RF1234` (el número tiene más de 3 dígitos) |

`main` y `develop` son ramas fijas.

## 2. Commits

La **primera línea** del mensaje debe mencionar el requerimiento (`RFNN` o `RNFNN`). El resto es libre.

| Válidos | Inválidos |
|---|---|
| `RF12: esquema de base de datos` | `arreglos varios` |
| `feat(rf24): comparar con plantilla ppg` | `rf: sin número` |
| `Corrige el cálculo de bpm (RNF04).` | `esquema de base de datos` |

Los mensajes que genera Git solos (`Merge pull request #3 ...`, `Revert "..."`, `fixup!`) no se validan.

## 3. Qué se valida y dónde

| Momento | Qué se revisa | Dónde |
|---|---|---|
| `git commit` | nombre de la rama, mensaje y secretos (`.env`, claves) | tu computador (`pre-commit`, `commit-msg`) |
| `git push` | nombre de la rama, mensajes de los commits nuevos y que la web instale y compile | tu computador (`pre-push`) |
| `git merge` hacia `develop` o `main` | nombre de la rama que entra, sus commits y que el resultado compile | tu computador (`pre-merge-commit`) |
| Pull request o push en GitHub | los mismos controles | GitHub Actions (`.github/workflows/validar.yml`) |

Si algo falla, se muestra un mensaje que explica qué corregir. Borrar una rama del remoto siempre se permite. Para renombrar una rama: `git branch -m <nombre-nuevo>`.

### Activar los hooks locales

Se activan solos con `npm install` (el script `prepare`). A mano:

```bash
git config core.hooksPath .githooks
```

## 4. Que un pull request con errores NO se pueda unir a `develop`

Los hooks locales se pueden saltar (`--no-verify`) y no actúan cuando se une desde la página de GitHub. Lo que **bloquea de verdad** es la protección de ramas, que activa **una vez** un administrador del repositorio:

1. GitHub → **Settings → Rules → Rulesets → New ruleset → New branch ruleset**.
2. **Enforcement status:** Active. **Target branches:** `develop` (agrega otra regla igual para `main`).
3. Activar:
   - **Require a pull request before merging**.
   - **Require status checks to pass** y agregar como obligatorios **Commits y nombre de rama** y **Compilación**. Si no aparecen en la lista, abre antes un pull request para que corran por primera vez.
   - **Block force pushes**.
4. Opcional, para impedir que se creen ramas fuera de formato: otro ruleset con **Target: All branches**, activar **Restrict branch names**, método **Regex** y el patrón:
   ```
   ^(main|develop|(?i:rf|rnf)[0-9]{1,3}([^0-9].*)?)$
   ```

Con esto, un pull request cuya rama no cumple, con un commit sin `RFNN` o con la web rota, **no se puede unir a `develop`**.
