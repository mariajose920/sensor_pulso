# RF70 · Revisión de Dependencias Vulnerables y Lista Pre-despliegue

Requerimiento: *Revisar dependencias vulnerables antes de cada despliegue. Ya existen dependabot.yml y el flujo validar.yml.*  
Responsable: **Adán**  
Fecha de vencimiento: **17 de noviembre de 2026**  
Rama: `rf70-revision-dependencias`  
Dependencias:
- **Necesita:** RF74 (ya en develop).
- **Bloquea a:** Nadie.

---

## 1. Alcance y Normativas de Ciberseguridad

El requerimiento **RF70** establece la política de seguridad y control de vulnerabilidades en dependencias externas para *sensor_pulso*, asegurando que ningún paquete vulnerable de severidad alta o crítica sea desplegado en producción ni integrado a las ramas principales (`develop` y `main`).

- **ISO/IEC 27001:2022 (Control A.8.8 — Gestión de vulnerabilidades técnicas):** Se debe obtener información sobre vulnerabilidades de los componentes en uso, evaluar la exposición de la organización y aplicar medidas oportunas.
- **OWASP Top 10 (A06:2021 — Vulnerable and Outdated Components):** Detección, bloqueo y remediación de dependencias desactualizadas o con vulnerabilidades públicas conocidas (CVE / GHSA).
- **CWE-1395 (Dependency on Vulnerable Third-Party Component):** Mitigación del riesgo de introducción de puertas traseras, ejecución remota de código (RCE) o denegación de servicio (DoS) a través de la cadena de suministro de software.

---

## 2. Integración Continua (validar.yml)

Se incorporó la verificación obligatoria en el flujo de integración continua del repositorio en `.github/workflows/validar.yml`:

```yaml
  auditoria-dependencias:
    name: Auditoría de dependencias (RF70)
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
      - name: Revisar dependencias vulnerables (bloquea ante fallas graves)
        run: npm audit --audit-level=high
```

### Comportamiento del Flujo de CI:
1. **Activación:** Se ejecuta automáticamente en cada `pull_request` con destino a `develop` o `main`, así como en cada `push`.
2. **Criterio de Bloqueo:** El comando `npm audit --audit-level=high` evalúa el árbol completo de dependencias. Si existe alguna vulnerabilidad clasificada como **High** o **Critical**, el proceso finaliza inmediatamente con código de salida `1` (`Exit Code 1`), marcando el chequeo como fallido y **bloqueando la fusión del Pull Request** (criterio de aceptación 1).
3. **Complementariedad con Dependabot:** Trabaja en conjunto con `.github/dependabot.yml`, el cual revisa semanalmente versiones nuevas y abre PRs automatizados hacia `develop`.

---

## 3. Lista Corta de Revisión Antes de Desplegar

Antes de promover cambios a producción en Vercel (o antes de fusionar a la rama `develop`), el responsable de la entrega debe validar los siguientes puntos:

### 📋 Checklist Pre-Despliegue

- [ ] **1. Auditoría de Dependencias (Cero fallas graves):**
  Ejecutar en la terminal:
  ```bash
  npm run auditar:dependencias
  ```
  *Criterio de éxito:* No debe reportar ninguna vulnerabilidad de severidad alta o crítica (código de salida 0).

- [ ] **2. Integridad de Dependencias de Producción:**
  Ejecutar:
  ```bash
  npm audit --omit=dev
  ```
  *Criterio de éxito:* Debe reportar exactamente `found 0 vulnerabilities` en los módulos que viajan a los usuarios finales.

- [ ] **3. Cero Secretos en Código e Historial (RF69):**
  Ejecutar:
  ```bash
  npm run test:rf69
  ```
  *Criterio de éxito:* Pasar todas las validaciones sin claves, tokens ni archivos prohibidos en Git.

- [ ] **4. Compilación de Producción Limpia (RNF11):**
  Ejecutar:
  ```bash
  npm run build
  ```
  *Criterio de éxito:* La carpeta `dist/` se genera correctamente en Vite sin advertencias de sintaxis ni módulos rotos.

- [ ] **5. Verificación de Despliegue y Políticas CSP:**
  Ejecutar la simulación local o prueba remota:
  ```bash
  npm run verificar:despliegue -- --local
  ```
  *Criterio de éxito:* La página abre sin errores de consola, las rutas cargan correctamente y no hay violaciones de Content Security Policy (CSP).

---

## 4. Auditoría de Avisos Actuales: Resolución y Justificación

Al iniciar este requerimiento se detectaron **14 avisos** en el árbol de dependencias (`npm audit`). A continuación se detalla su remediación y justificación técnica:

### Resumen del Análisis:

| Dependencia | Nivel Máximo | Tipo | Vulnerabilidades | Estado / Solución |
|---|---|---|---|---|
| **Dependencias de Producción** (`dependencies`) | N/A | Runtime | 0 vulnerabilidades | **Limpio (0 avisos)** con `npm audit --omit=dev` |
| `puppeteer-core` | **High** | Dev | 9 avisos (`basic-ftp`, `extract-zip`, `zod`) | **Resuelto:** Actualizado de `^23.11.1` a `^25.17.0` |
| `deepmerge` (en `workbox-build`) | Low | Dev | 1 aviso (GHSA-gcqx-w48m-w2h4) | **Justificado:** Herramienta interna de build PWA |
| `glob` / `minimatch` (en `workbox-build`) | Moderate | Dev | 4 avisos (GHSA-3g3m-2fjr-6pw4, GHSA-g3hv-75wg-m249) | **Justificado:** Herramienta interna de build PWA |

### Detalle de Remediaciones:
1. **`puppeteer-core` (9 vulnerabilidades High eliminadas):**
   - Paquetes afectados: `basic-ftp` (ReDoS en listing FTP), `extract-zip` (path traversal en extracción de archivos zip) y `zod` (memory exhaustion en validación masiva vía `chromium-bidi`).
   - **Acción ejecutada:** Se actualizó `puppeteer-core` a su versión segura `25.17.0`.
   - **Resultado:** Las 9 vulnerabilidades altas quedaron totalmente erradicadas del árbol de dependencias.

2. **Herramientas de construcción de la PWA (`workbox-build` vía `vite-plugin-pwa`):**
   - Paquetes afectados: `deepmerge` (Low), `glob` y `minimatch` (Moderate).
   - **Justificación técnica:**
     1. Son dependencias transitivas exclusivas de desarrollo y compilación (`devDependencies`), utilizadas únicamente por Vite al generar el Service Worker (`dist/sw.js`).
     2. No se incluyen en los paquetes enviados al navegador del cliente ni se ejecutan en servidores expuestos a peticiones web de usuarios.
     3. Ninguno de estos avisos alcanza el umbral de severidad `high` o `critical`, por lo que el comando de CI `npm audit --audit-level=high` permite continuar con total seguridad y estabilidad.

---

## 5. Pruebas Automatizadas

Se implementó el script de pruebas de requerimiento `scripts/test-rf70-revision-dependencias.mjs`, ejecutable mediante:

```bash
npm run test:rf70
```

Este script valida de forma autónoma:
1. La existencia y correcta configuración del job en `.github/workflows/validar.yml`.
2. La ejecución exitosa de `npm audit --audit-level=high` sin fallas graves.
3. Cero vulnerabilidades en dependencias de producción (`npm audit --omit=dev`).
4. La disponibilidad de la lista corta pre-despliegue y la justificación de avisos en la documentación.
