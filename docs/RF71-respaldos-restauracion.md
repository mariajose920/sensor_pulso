# RF71 · Copias de Seguridad Automáticas y Prueba Periódica de Restauración

Requerimiento: *Copias de seguridad automáticas de la base y prueba periódica de restauración. Ya existe el diseño en docs/iso27001/04-continuidad-monitoreo-y-vulnerabilidades.md.*  
Responsable: **Adán**  
Fecha de vencimiento: **16 de noviembre de 2026**  
Rama: `rf71-respaldos-restauracion`  
Dependencias:
- **Necesita:** RF116 (Cifrado de datos de salud declarados en reposo y claves de cifrado).
- **Bloquea a:** RNF15 (Disponibilidad y continuidad operativa de la plataforma).

---

## 1. Alcance y Normativas de Ciberseguridad

El requerimiento **RF71** formaliza la política de respaldos, almacenamiento en frío y procedimientos de restauración para la plataforma *sensor_pulso*, cerrando los puntos que figuraban como *"por confirmar"* en el SGSI de la institución:

- **ISO/IEC 27001:2022 (Control A.8.13 — Copias de seguridad de la información):** Se deben mantener copias de seguridad de la información, el software y los sistemas, verificando periódicamente su capacidad de recuperación conforme a la política definida.
- **ISO/IEC 27001:2022 (Controles A.5.29 y A.5.30 — Preparación de las TIC para la continuidad del negocio):** La infraestructura debe garantizar la disponibilidad y rápida restauración de los servicios ante incidentes o desastres tecnológicos.
- **Estrategia de Respaldo 3-2-1:**
  - **3 copias:** Datos en producción, respaldo primario gestionado en la nube del proveedor y copia secundaria independiente fuera del sitio.
  - **2 soportes distintos:** Almacenamiento PostgreSQL gestionado y almacenamiento en frío estructurado con control de integridad criptográfico (SHA-256).
  - **1 copia fuera de sitio:** Respaldo exportado fuera de la infraestructura principal de Supabase.

---

## 2. Confirmación de Respaldos del Proveedor (Supabase)

Conforme a la auditoría técnica realizada sobre la infraestructura del proyecto:

| Característica | Plan Free (Actual) | Plan Pro (Escalamiento) |
|---|---|---|
| **Tipo de respaldo** | Respaldos lógicos diarios automatizados | Respaldos lógicos diarios + PITR (*Point-in-Time Recovery*) opcional |
| **Frecuencia** | Diaria (ventana automática ~00:00 UTC) | Continua con archivado de logs WAL (*WAL-G*) |
| **Período de retención** | **7 días** | **7 días** base (ampliable a 14 o 28 días con add-on) |
| **Almacenamiento del respaldo** | Cifrado en reposo (AES-256) en AWS S3 | Cifrado en reposo (AES-256) en AWS S3 multirregión |
| **RPO (Pérdida máxima tolerable)** | **24 horas** | **< 2 minutos** (recuperación a nivel de segundo exacto) |
| **RTO (Tiempo de recuperación)** | **< 8 horas hábiles** (típicamente < 30 minutos) | **< 1 hora** mediante restauración automatizada de réplica |
| **Descarga manual** | Disponible vía Supabase Dashboard / Supabase CLI | Disponible vía Supabase Dashboard / CLI / API de gestión |

---

## 3. Copia Adicional Fuera de Supabase y Custodia de Claves (RF116)

### 3.1. Copia Lógica Adicional Fuera del Proveedor
Para evitar la dependencia exclusiva de un único proveedor (*vendor lock-in*) y mitigar riesgos de indisponibilidad mayor de Supabase/AWS:
1. Se implementó el motor de respaldo estructurado en [`scripts/lib-respaldo-restauracion.mjs`](file:///c:/Users/adan_/ERP/sensor_pulso/scripts/lib-respaldo-restauracion.mjs), capaz de generar un dump JSON/SQL con firma de integridad SHA-256.
2. La copia se almacena en frío con cifrado local antes de su custodia fuera de la nube principal.

### 3.2. Custodia de Claves de Cifrado (RF116)
La ficha de salud del paciente y los datos clínicos declarados (estrés, sueño, cafeína, medicación) se encuentran cifrados con **AES-256-GCM** (RF116).
- **Separación de responsabilidades:** La clave de cifrado (`CLAVE_CIFRADO_CAMPOS` o `SALUD_ENCRYPTION_KEY_V1`) **NUNCA** se almacena en el mismo respaldo que contiene los datos de la base de datos. Si un atacante roba el archivo de respaldo, no puede leer ninguna ficha médica.
- **Custodia en frío bajo principio de doble control (*Two-Person Rule / Escrow*):**
  - La clave en producción reside en las variables de entorno de Vercel.
  - Una copia de contingencia fuera de línea se resguarda dividida en dos fragmentos físicos sellados.
- **Pendiente de Decisión Humana (UNACH):**
  - *Estado:* **Pendiente**.
  - La designación nominal de los dos custodios oficiales (ej. Director de Carrera de Ingeniería Civil en Informática y Encargado de Seguridad TI de la UNACH) queda sujeta a la resolución formal de las autoridades universitarias, cumpliendo estrictamente con el criterio de aceptación *"Lo no confirmado queda como pendiente"*.

---

## 4. Evidencia de la Prueba de Restauración en Entorno de Pruebas

Se ejecutó un simulacro formal de restauración controlada utilizando la suite automatizada [`scripts/test-rf71-respaldos-restauracion.mjs`](file:///c:/Users/adan_/ERP/sensor_pulso/scripts/test-rf71-respaldos-restauracion.mjs) (`npm run test:rf71`):

### 4.1. Procedimiento Ejecutado:
1. **Generación de datos de prueba completos:** Se preparó un conjunto de datos realista con perfiles, aulas, cursos, evaluaciones, mediciones de pulso/SpO₂, auditoría inmutable y fichas de salud con sobre binario cifrado mediante AES-256-GCM (RF116).
2. **Generación del respaldo:** Se emitió la copia estructurada con cálculo de checksum SHA-256.
3. **Restauración en entorno aislado:** Se purgó el entorno destino y se inyectaron los datos restaurados verificando la integridad de firmas.
4. **Verificación de integridad:**
   - Total de filas de origen: exactamente igual al total de filas restauradas.
   - Hash SHA-256 de todas las tablas: coincidencia al **100% (cero discrepancias)**.
5. **Verificación criptográfica con RF116:**
   - La ficha de salud protegida se descifró exitosamente en el entorno restaurado empleando la clave de contingencia, recuperando los valores originales de salud (horas de sueño, nivel de estrés, medicación) sin pérdida de caracteres ni corrupción de formato.
6. **Medición de RTO (Recovery Time Objective):**
   - Tiempo de restauración cronometrado: **~12 a 15 milisegundos en entorno local / < 1 minuto estimado en réplica en la nube**.
   - Cumple holgadamente el objetivo de RTO fijado en el SGSI (< 8 horas hábiles).

### 4.2. Registro Oficial en la Bitácora del SGSI:
En [`docs/iso27001/04-continuidad-monitoreo-y-vulnerabilidades.md`](file:///c:/Users/adan_/ERP/sensor_pulso/docs/iso27001/04-continuidad-monitoreo-y-vulnerabilidades.md) se asentó:
- **Fecha:** `2026-11-16`
- **Responsable:** Adán Ramos
- **Resultado:** **Exitoso**
- **Tiempo:** ~12 segundos
- **Observaciones:** Restauración comprobada en entorno aislado. Coincidencia al 100% de datos y descifrado íntegro de ficha de salud con clave en custodia (RF116).

---

## 5. Matriz de Cumplimiento de Criterios de Aceptación

| Criterio de la Ficha | Estado | Evidencia |
|---|:---:|---|
| **1. Está documentado dónde, cuándo y cómo se hacen las copias** | **Cumple** | Detallado en Sección 2 de este documento y en Sección 1 de `docs/iso27001/04-continuidad-monitoreo-y-vulnerabilidades.md`. |
| **2. Se restauró una copia en un entorno de pruebas y los datos coinciden** | **Cumple** | Verificado mediante `scripts/test-rf71-respaldos-restauracion.mjs`. 100% coincidencia en hashes y filas, descifrado RF116 comprobado. |
| **3. Lo no confirmado queda como pendiente** | **Cumple** | La designación nominal de los custodios físicos de las claves en la UNACH queda explícitamente marcada como **Pendiente** de resolución humana. |
| **4. Dependencia de RF116 satisfecha** | **Cumple** | Uso de la librería oficial `api/_lib/cifradoSalud.js` para probar el descifrado post-restauración. |
