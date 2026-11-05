# RF111 · Elección de Canal Libre (1 a 5) y Rondas de Estudiantes

Requerimiento: *El estudiante elige un canal libre (1 a 5) y el sistema organiza mediciones en rondas de 5 estudiantes, permitiendo la asignación y corrección por parte del profesor.*

---

## 1. Reglas de Negocio y Arquitectura

1. **Elección Atómica de Canal Libre:**
   - En una sesión de medición activa (RF09, RF11), existen exactamente 5 canales físicos concurrentes (RF08, RF12).
   - Cada estudiante autenticado puede elegir y vincular su cuenta a un canal libre (1 al 5).
   - La asignación es atómica: si dos alumnos intentan tomar el mismo canal simultáneamente, la base de datos o el gestor de estado asigna el canal al primero y rechaza al segundo de forma segura sin sobreescrituras.

2. **Unicidad de Canal por Usuario:**
   - Un estudiante solo puede tener **un único canal** asignado activamente por sesión.
   - Si desea cambiar de canal, debe liberar primero su canal previo.

3. **Control y Corrección Docente:**
   - El docente o administrador puede:
     - Reasignar a un estudiante a cualquier canal.
     - Liberar individualmente cualquier canal ocupado (por ejemplo, si un alumno se ausenta o termina anticipadamente).

4. **Gestión de Rondas de 5 Estudiantes:**
   - Las mediciones se estructuran en rondas sucesivas (`Ronda 1`, `Ronda 2`, ...).
   - La interfaz visualiza el avance de la ronda:
     - Contador de canales ocupados y libres (`X de 5 canales ocupados`).
     - Pista visual de 5 segmentos para los canales CH1..CH5.
     - Detección de tanda completa (`5/5 alumnos asignados`).
   - Al finalizar la tanda de 5 estudiantes, el docente (o el operador de sesión) avanza a la siguiente ronda:
     - Se incrementa atómicamente el número de ronda (`ronda = ronda + 1`).
     - Se liberan los 5 canales de forma masiva para la siguiente tanda.
     - Se preserva la trazabilidad de la ronda en las mediciones históricas (`RF30`).

---

## 2. Componentes y Servicios

| Archivo | Responsabilidad |
|---|---|
| [`src/components/VinculacionCanales.vue`](file:///c:/Users/adan_/ERP/sensor_pulso/src/components/VinculacionCanales.vue) | Interfaz interactiva de selección de canales 1 a 5, barra de progreso de ronda y acciones docentes. |
| [`src/components/SesionMedicionControl.vue`](file:///c:/Users/adan_/ERP/sensor_pulso/src/components/SesionMedicionControl.vue) | Control de la sesión activa con visualizador de ronda y botón de avance rápido. |
| [`src/services/canalesService.js`](file:///c:/Users/adan_/ERP/sensor_pulso/src/services/canalesService.js) | Lógica atómica de vinculación (`vincularMiCuentaACanal`), liberación (`desvincularMiCuenta`), métricas reactivas (`metricasRonda`) y avance de ronda (`abrirSiguienteRonda`). |
| [`src/services/sesionMedicionService.js`](file:///c:/Users/adan_/ERP/sensor_pulso/src/services/sesionMedicionService.js) | Persistencia y sincronización de rondas en base de datos Supabase y `localStorage`. |
| [`scripts/test-rf111-eleccion-canal.js`](file:///c:/Users/adan_/ERP/sensor_pulso/scripts/test-rf111-eleccion-canal.js) | Suite automatizada con 20 pruebas unitarias y de concurrencia. |

---

## 3. Verificación Automatizada

Ejecutar la suite de pruebas:
```bash
node scripts/test-rf111-eleccion-canal.js
```

Resultados: **20 pruebas pasadas (0 fallidas)**.
- ✓ Inicialización de 5 canales en blanco por ronda.
- ✓ Elección atómica de canal libre.
- ✓ Rechazo atómico ante colisiones de canal ocupado.
- ✓ Bloqueo de asignación múltiple (1 canal por estudiante).
- ✓ Liberación voluntaria y reasignación inmediata.
- ✓ Detección de ronda completa (5/5).
- ✓ Corrección y liberación forzada por el profesor.
- ✓ Incremento atómico de ronda y liberación masiva de canales.
