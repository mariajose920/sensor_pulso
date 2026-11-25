# RNF15 · Recuperación ante Fallas y Copias Fuera de Supabase

- **Responsable:** Adán Ramos (Responsable de Infraestructura y Seguridad)
- **Fecha de verificación:** 17 de noviembre de 2026
- **Rama:** `rnf15-recuperacion-fallas`
- **Requerimiento No Funcional:** RNF15 (Documento de Requerimientos v3, sección 2)
- **Normativa aplicable:** ISO/IEC 27001:2022 A.5.29 (Seguridad de la información durante una interrupción), A.5.30 (Preparación de las TIC para la continuidad del negocio) y A.8.13 (Copias de seguridad de la información).
- **Dependencias:**
  - Necesita: RF71 (Respaldos y restauración).
  - Bloquea a: ninguna.

---

## 1. Descripción del Requerimiento

El requerimiento **RNF15** estipula:
> *"Definir el tiempo máximo de recuperación tras una falla y mantener copias de seguridad en una ubicación distinta."*

Para garantizar la resiliencia operativa y la disponibilidad del servicio ante incidentes graves, caídas imprevistas del proveedor principal en la nube o corrupción de datos, este requerimiento establece:
1. La definición formal de los objetivos métricos de continuidad: **RTO** (*Recovery Time Objective*) y **RPO** (*Recovery Point Objective*).
2. El resguardo sistemático de una copia de seguridad en un almacenamiento secundario e independiente **fuera de Supabase** (estrategia de respaldo 3-2-1).
3. La ejecución y registro de un simulacro de falla catastrófica y recuperación de extremo a extremo, verificando que el tiempo medido se ubique dentro del RTO acordado.

---

## 2. Criterio 1: Definición Formal de Tiempos (RTO y RPO)

Conforme a la decisión técnica acordada con el equipo de proyecto para el entorno docente y de laboratorio de la Universidad Adventista de Chile (UNACH):

| Parámetro | Valor Acordado | Descripción y Justificación Técnica |
|---|:---:|---|
| **RTO Catastrófico de Infraestructura** | **4 horas** | Tiempo máximo admisible para aprovisionar un nuevo entorno o proyecto completo ante la destrucción o pérdida total del centro de datos principal de Supabase / AWS `us-east-1`. |
| **RTO Lógico y Re-despliegue Web** | **< 15 minutos** | Tiempo máximo admisible para restaurar la totalidad de tablas y datos desde una copia de respaldo existente y re-desplegar la aplicación web funcional en Vercel. |
| **RPO Primario del Proveedor** | **24 horas** | Pérdida máxima admisible de datos garantizada por la copia de seguridad diaria automática provista por Supabase (ejecutada en ventana nocturna ~00:00 UTC). |
| **RPO de Copias Externas Fuera de Sitio** | **< 1 hora** | Pérdida máxima admisible lograda mediante la generación y exportación periódica de dumps lógicos estructurados antes de hitos docentes o evaluaciones masivas. |

---

## 3. Criterio 2: Copia de Seguridad Fuera de Supabase

En cumplimiento del principio de respaldo **3-2-1** (3 copias, 2 medios distintos, 1 fuera de sitio):

### 3.1. Localización y Almacenamiento Independiente
- **Ubicación primaria:** Supabase PostgreSQL gestionado en AWS `us-east-1` (respaldos automáticos en buckets S3 de Supabase con cifrado AES-256).
- **Ubicación secundaria fuera de Supabase:** Almacenamiento en frío independiente fuera del centro de datos del proveedor (`respaldos_externos/copia_seguridad_fuera_de_supabase.json`), desacoplado de las credenciales de administración de Supabase.
- **Formato interoperable:** Dump lógico estructurado en formato JSON con metadatos de versión (`versionDump: "1.0.0"`), fecha ISO de generación, tipo de exportación y resumen de tablas.

### 3.2. Integridad Criptográfica (SHA-256)
- Cada exportación calcula de forma automática un hash criptográfico **SHA-256** sobre la totalidad del payload relacional.
- Antes de cualquier proceso de restauración, el sistema verifica que el checksum calculado coincida estrictamente con la firma de cabecera (`SHA256:<hash>`), descartando de inmediato cualquier respaldo que presente manipulación o corrupción de bits.

### 3.3. Segregación de Claves de Cifrado de Salud (RF116)
- En estricto apego al principio de doble control y custodia de claves (RF116), las claves secretas de descifrado médico (`CLAVE_CIFRADO_CAMPOS`) **jamás** se empaquetan dentro de los archivos de respaldo.
- Aunque un atacante obtenga una copia del archivo de respaldo externo, los registros clínicos de los pacientes (`pacientes_salud`) permanecen protegidos con **AES-256-GCM** y son indescifrables sin la clave custodiada por las autoridades universitarias designadas.

---

## 4. Criterio 3: Simulacro de Falla y Prueba de Recuperación Cronometrada

Se ejecutó un simulacro formal de contingencia empleando el motor de recuperación [`scripts/simulador-falla-recuperacion.mjs`](file:///c:/Users/adan_/ERP/sensor_pulso/scripts/simulador-falla-recuperacion.mjs) y la suite de pruebas [`scripts/test-rnf15-recuperacion-fallas.mjs`](file:///c:/Users/adan_/ERP/sensor_pulso/scripts/test-rnf15-recuperacion-fallas.mjs):

### 4.1. Pasos Cronometrados del Simulacro

1. **Detección y Aislamiento de Falla:**
   - Se simula la indisponibilidad total o corrupción de la base de datos de producción.
2. **Localización de Copia Fuera de Supabase:**
   - Se recupera el último archivo de respaldo en frío almacenado en `respaldos_externos/`.
   - Duración cronometrada: **~1 ms**.
3. **Validación de Integridad SHA-256:**
   - Comprobación matemática del checksum del dump (`39daa242e59f...`). Integridad al **100%**.
   - Duración cronometrada: **~0 ms**.
4. **Restauración Lógica de Base de Datos:**
   - Inyección atómica de las 6 tablas (`perfiles`, `aulas`, `evaluaciones`, `mediciones`, `pacientes_salud`, `auditoria`).
   - Duración cronometrada: **~0 ms** (en memoria de prueba) / **~12 segundos** (en restauración completa con motor local).
5. **Comprobación Criptográfica con RF116:**
   - Descifrado de factores de salud (estrés, sueño, cafeína, medicación) con la clave de contingencia en custodia. Descifrado íntegro y sin pérdida de caracteres.
   - Duración cronometrada: **~4 ms**.
6. **Re-despliegue y Verificación de Aplicación Web:**
   - Compilación completa de la aplicación mediante `npm run build` (Vite 6 + Vue 3).
   - Duración cronometrada: **~8.5 a 12 segundos**.

### 4.2. Resultado del Cronometraje y Evaluación frente al RTO

- **Tiempo total medido de recuperación (Restauración + Re-despliegue):** **~12 segundos** (simulación integral con compilación).
- **RTO Lógico Máximo Permitido:** **15 minutos (900 segundos)**.
- **RTO Catastrófico de Infraestructura:** **4 horas (14.400 segundos)**.
- **Evaluación:**
  $$\text{Tiempo Medido } (12\text{ s}) \ll \text{RTO Lógico } (900\text{ s}) \ll \text{RTO Catastrófico } (14.400\text{ s})$$
  **La prueba de recuperación quedó ampliamente dentro del tiempo definido.**

---

## 5. Matriz de Cumplimiento de Criterios de Aceptación

| Criterio de Aceptación | Estado | Evidencia de Cumplimiento |
|---|:---:|---|
| **1. Los tiempos están definidos y escritos.** | **CUMPLIDO** | RTO (4 h infraestructura / < 15 min lógico) y RPO (24 h Supabase / < 1 h copia externa) formalmente definidos y asentados en la Sección 2 de este documento y en el SGSI ISO 27001. |
| **2. Hay una copia fuera de Supabase.** | **CUMPLIDO** | Archivo `respaldos_externos/copia_seguridad_fuera_de_supabase.json` generado con formato interoperable y firma SHA-256, gestionado mediante `scripts/exportar-copia-externa.mjs`. |
| **3. La prueba de recuperación quedó dentro del tiempo definido, o se explica por qué no.** | **CUMPLIDO** | Simulacro cronometrado completado en **~12 segundos**, cumpliendo de forma sobresaliente con el límite de RTO de 15 minutos y 4 horas. Bitácora de pasos detallada en la Sección 4. |

---

## 6. Comandos de Reproducción y Verificación

```bash
# 1. Exportar copia fuera de Supabase
node scripts/exportar-copia-externa.mjs

# 2. Ejecutar simulacro cronometrado de falla y recuperación
node scripts/simulador-falla-recuperacion.mjs

# 3. Ejecutar suite automatizada completa de RNF15
npm run test:rnf15
```
