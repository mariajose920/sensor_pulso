# RF66 · Límites de Archivos CSV y Detección de Contenido Peligroso

Requerimiento: *Limitar el tamaño y el tipo de los archivos cargados y detectar contenido peligroso.*  
Responsable: **Adán**  
Rama: `rf66-limites-archivo-csv`  
Dependencias:
- **Necesita:** RF65 (Validación y sanitización de entradas).
- **Bloquea a:** RF27 (Carga de bioseñales).

---

## 1. Alcance y Normativa de Ciberseguridad

El requerimiento **RF66** implementa el control de acceso y filtrado perimetral previo para todos los archivos CSV cargados en la plataforma, previniendo vectores de ataque de inyección de código, agotamiento de recursos del cliente y ejecución involuntaria de contenido ejecutable o binario:

- **OWASP Top 10 (A03:2021 — Injection):** Prevención de inyección de fórmulas en hojas de cálculo (*CSV / Formula Injection* - **CWE-1236**).
- **CWE-434 (Unrestricted Upload of File with Dangerous Type):** Restricción estricta de extensiones y detección de tipos MIME y binarios encubiertos.
- **CWE-400 (Uncontrolled Resource Consumption):** Imposición de límites máximos de bytes y de líneas para evitar DoS en el navegador.

---

## 2. Límites y Reglas de Validación

| Parámetro | Límite Configurado | Comportamiento ante Incumplimiento |
|---|---|---|
| **Tamaño máximo en bytes** | `5 MB` (`5 * 1024 * 1024` bytes) | **Rechazo inmediato** antes de leer o procesar en memoria (`tamano_excedido`). |
| **Tipo de archivo** | Estrictamente `.csv` | **Rechazo inmediato** de cualquier otra extensión (`.txt`, `.xlsx`, `.pdf`, `.exe`, etc.). |
| **Límite máximo de filas** | `50.000` filas | **Rechazo inmediato** ante archivos masivos para proteger el rendimiento (`filas_excedidas`). |
| **Límite mínimo de filas** | `5` registros válidos | **Rechazo inmediato** ante archivos vacíos o con datos insuficientes (`filas_insuficientes`). |
| **Detección de binarios** | Firmas mágicas (MZ, ELF, PDF, PK/ZIP, PNG, GIF, JPEG, WASM), bytes nulos `\0` y caracteres de control | **Rechazo inmediato** ante archivos binarios o encubiertos (`archivo_binario`). |
| **Detección de fórmulas** | Celdas que inician con `=`, `@`, `+`, `-` (no numéricos) o `\|` | **Rechazo inmediato** antes de procesarse, indicando fila y columna (`formula_detectada`). |

---

## 3. Criterio de Aceptación

> **Criterio de Aceptación:**  
> *Un archivo grande, de otro tipo o con fórmulas se rechaza antes de procesarse.*

### Flujo de Verificación y Rechazo Previo

```
[ Usuario selecciona / arrastra archivo ]
               │
               ▼
[ 1. Pre-validación de Metadatos (validarMetadatosArchivoCsv) ]
  ├── ¿Extensión distinta de .csv?  ──▶ RECHAZO INMEDIATO (sin leer archivo)
  └── ¿Tamaño > 5 MB?               ──▶ RECHAZO INMEDIATO (sin leer archivo)
               │
               ▼ (Lectura como texto)
[ 2. Detección Binaria (detectarArchivoBinario) ]
  ├── ¿Contiene bytes nulos (\0)?   ──▶ RECHAZO ANTES DE PROCESAR
  ├── ¿Cabecera MZ, ELF, PDF, PK...? ──▶ RECHAZO ANTES DE PROCESAR
  └── ¿Bytes de control no válidos?  ──▶ RECHAZO ANTES DE PROCESAR
               │
               ▼
[ 3. Control de Filas ]
  ├── ¿Total filas > 50.000?        ──▶ RECHAZO ANTES DE PROCESAR
  └── ¿Total filas útiles < 5?       ──▶ RECHAZO ANTES DE PROCESAR
               │
               ▼
[ 4. Detección de Fórmulas Peligrosas (detectarFormulaCsv) ]
  ├── ¿Inicia con '=' o '@'?         ──▶ RECHAZO ANTES DE PROCESAR
  ├── ¿Inicia con '+' o '-' con texto? ──▶ RECHAZO ANTES DE PROCESAR
  └── ¿Comando DDE pipe ('|')?       ──▶ RECHAZO ANTES DE PROCESAR
               │ (Aprobado)
               ▼
[ 5. Procesamiento y Extracción de Bioseñal (RF27 / RF65) ]
  └── Generación de ondas PPG, IR, Rojo y estimación de frecuencia cardíaca (BPM).
```

### Manejo de Falsos Positivos

Para garantizar que datos fisiológicos legítimos no sean rechazados indebidamente:
- Valores numéricos negativos como `-0.5`, `-12.0`, `-0.025` se identifican como números matemáticos y **no** activan la alerta de fórmulas.
- Valores numéricos positivos con signo explícito como `+72.5` o `+100` **no** son rechazados.

---

## 4. Archivos Modificados e Implementados

| Archivo | Rol en RF66 |
|---|---|
| [`src/services/limitesCsvService.js`](file:///c:/Users/adan_/ERP/sensor_pulso/src/services/limitesCsvService.js) | Módulo central de límites `LIMITES_CSV`, detección de fórmulas `detectarFormulaCsv`, detección de binarios `detectarArchivoBinario`, pre-validación de metadatos `validarMetadatosArchivoCsv` y validador integral `validarLimitesArchivoCsv`. |
| [`src/services/sanitizacionService.js`](file:///c:/Users/adan_/ERP/sensor_pulso/src/services/sanitizacionService.js) | Integración perimetral y reexportación de constantes y validadores de límites RF66. |
| [`src/services/senalesService.js`](file:///c:/Users/adan_/ERP/sensor_pulso/src/services/senalesService.js) | Actualización de `cargarDesdeCsv` para aplicar la verificación previa de RF66 antes de procesar cualquier muestra. |
| [`src/components/CargaSenalesCard.vue`](file:///c:/Users/adan_/ERP/sensor_pulso/src/components/CargaSenalesCard.vue) | Interfaz gráfica con `accept=".csv,text/csv"`, pre-validación instantánea antes de `FileReader` y mensajes de rechazo explícitos. |
| [`scripts/test-rf66-limites-csv.js`](file:///c:/Users/adan_/ERP/sensor_pulso/scripts/test-rf66-limites-csv.js) | Suite de pruebas automatizadas con 27 verificaciones unitarias y de integración. |
| [`package.json`](file:///c:/Users/adan_/ERP/sensor_pulso/package.json) | Script de ejecución `npm run test:rf66`. |

---

## 5. Pruebas Automatizadas

Para ejecutar la verificación completa:

```bash
npm run test:rf66
```

Salida esperada:
```
================================================================
  sensor_pulso · Pruebas Automatizadas de RF66
  Límites de Archivos CSV y Detección de Contenido Peligroso
================================================================

--- 1. Definición de Límites (Tamaño Máximo, Tipo .csv y Máximo de Filas) ---
  ✅ [PASS] Límites: Constantes de tamaño (5 MB), tipo .csv y filas (50.000) configuradas
  ✅ [PASS] Límites: Rechazo inmediato de archivo grande (> 5 MB) antes de procesarse
  ✅ [PASS] Límites: Rechazo de archivo que supera el máximo de 50.000 filas
  ✅ [PASS] Límites: Rechazo de archivo vacío o con menos de 5 filas

--- 2. Validación Estricta de Tipo de Archivo (.csv) ---
  ✅ [PASS] Tipo: Rechazo de archivos con extensiones distintas a .csv (.txt, .xlsx, .pdf, .exe)
  ✅ [PASS] Tipo: Aceptación de archivos con extensión .csv (case-insensitive)
  ✅ [PASS] Tipo: validarMetadatosArchivoCsv rechaza archivos no .csv antes de leerlos

--- 3. Detección y Rechazo de Archivos Binarios ---
  ✅ [PASS] Binarios: Detección y rechazo de archivos con caracteres nulos (\0)
  ✅ [PASS] Binarios: Detección y rechazo de ejecutables Windows (firma MZ / PE)
  ✅ [PASS] Binarios: Detección y rechazo de ejecutables Linux ELF (firma \x7fELF)
  ✅ [PASS] Binarios: Detección y rechazo de documentos PDF (firma %PDF-)
  ✅ [PASS] Binarios: Detección y rechazo de paquetes ZIP y documentos Office (firma PK)
  ✅ [PASS] Binarios: Detección y rechazo de imágenes PNG (firma \x89PNG)
  ✅ [PASS] Binarios: Detección de caracteres de control no imprimibles en el cuerpo

--- 4. Detección de Fórmulas Peligrosas (=, +, -, @) ---
  ✅ [PASS] Fórmulas: Detecta fórmulas que empiezan con = (ej: =cmd|' /C calc'!A0, =SUM)
  ✅ [PASS] Fórmulas: Detecta fórmulas que empiezan con @ (ej: @SUM(1+2))
  ✅ [PASS] Fórmulas: Detecta fórmulas y comandos que empiezan con + (ej: +cmd|' /C notepad'!A0)
  ✅ [PASS] Fórmulas: Detecta fórmulas y comandos que empiezan con - (ej: -cmd|' /C dir'!A0, -2+cmd|...)
  ✅ [PASS] Fórmulas: NO genera falsos positivos con números negativos legítimos (-0.5, -42, -0.025)
  ✅ [PASS] Fórmulas: NO genera falsos positivos con números positivos con signo explícito (+72.5, +100)

--- 5. Criterio de Aceptación: Rechazo Antes de Procesarse ---
  ✅ [PASS] Criterio: CSV con fórmula que empieza con = en cabecera se rechaza antes de procesarse
  ✅ [PASS] Criterio: CSV con fórmula que empieza con @ en celda se rechaza antes de procesarse
  ✅ [PASS] Criterio: CSV con fórmula que empieza con + o - en celda se rechaza antes de procesarse
  ✅ [PASS] Criterio: CSV legítimo con valores válidos se acepta y no se rechaza

--- 6. Integración con senalesService y CargaSenalesCard ---
  ✅ [PASS] senalesService.cargarDesdeCsv rechaza archivos con fórmulas antes de procesarlos (RF66)
  ✅ [PASS] senalesService.cargarDesdeCsv procesa exitosamente un CSV legítimo dentro de los límites
  ✅ [PASS] CargaSenalesCard.vue: Configura accept=".csv,text/csv" y restringe a tipo .csv

================================================================
  RESUMEN DE PRUEBAS RF66:
  Total: 27 | Pasadas: 27 | Falladas: 0
================================================================
```
