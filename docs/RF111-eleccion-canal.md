# RF111 · Elección de Canal Libre (1 a 5) y Rondas de Estudiantes

Requerimiento: *El estudiante elige un canal libre (1 a 5) y el sistema organiza mediciones en rondas de 5 estudiantes, permitiendo la asignación y corrección por parte del profesor.*

---

## 1. Reglas de Negocio y Arquitectura

1. **Elección Atómica de Canal Libre:**
   - En una sesión de medición activa (RF09, RF11), existen exactamente 5 canales físicos concurrentes (RF08, RF12).
   - Cada estudiante autenticado puede elegir y vincular su cuenta a un canal libre (1 al 5).
   - La asignación es atómica: si dos alumnos intentan tomar el mismo canal simultáneamente, la base de datos o el gestor de estado asigna el canal al primero y rechaza al segundo de forma segura sin sobreescrituras.

2. **Unicidad de Canal por Usuario (según el rol):**
   - Un estudiante o usuario normal solo puede tener **un único canal** asignado activamente por sesión.
   - Si desea cambiar de canal, debe liberar primero su canal previo.
   - **Excepción: el profesor y el administrador pueden tener hasta 5 canales** en su sesión (ver sección 1.1). La regla la aplica la base de datos con un trigger (reemplaza al antiguo índice único `sesion_canal_un_usuario`).

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

### 1.1 «Agregar otro canal» (profesor y administrador)

- Para profesor y administrador **no hay elección manual de canal**: el botón **«Agregar canal»** (desde el primero; después **«Agregar otro canal»**) es la única forma de tomar canales y se detiene al llegar a **5**. Sin ningún canal no se mide ni se grafica. Los estudiantes siguen eligiendo su canal libre a mano. Profesor y administrador **solo ven los canales tomados**: un canal libre no muestra nada (ni tarjeta ni monitor). El asistente de la ficha usa el mismo estilo visual que el modal de consentimiento.
- **La asignación es automática**: el sistema toma el siguiente canal libre (el de número más bajo) con la función `agregar_canal_automatico()`. Nadie elige el número a mano. Es atómica (`for update skip locked`) y solo puede ejecutarla un profesor o administrador (RNF12).
- **Por cada canal agregado** se piden de nuevo, antes de poder medir en él, **dos pasos**:
  1. La **ficha del paciente** de esa persona (RF03: nombre, edad ≥ 18, nivel de estrés, sueño, cafeína, medicación, actividad previa y condición de salud).
  2. **Términos y consentimiento en una sola vista**: términos y condiciones, política de privacidad vigente (RF88) y consentimiento informado vigente (RF04, RF59), con **una sola casilla** («ha leído los términos y condiciones, la política de privacidad y el consentimiento informado, y los acepta»). No hay una casilla aparte para «usar sus datos en esta cuenta»: el consentimiento ya declara finalidad, datos recogidos, responsable y plazo, y el texto avisa que los datos quedan en la cuenta de quien mide; una segunda casilla repetiría lo mismo.
- Sin esos dos pasos el canal queda como «no se puede medir»: no se muestran la gráfica ni los monitores y no se generan resultados. Si se recarga la página, los canales adicionales vuelven a pedir los pasos («Completar requisitos»), igual que el consentimiento del RF04.
- La base de datos guarda la constancia en `sesion_canal_requisitos` (RLS: solo su dueño y el administrador la leen; los clientes no escriben) y la ficha de cada canal queda ligada a la sesión en `declaraciones_paciente.sesion_id`, sin reemplazar la ficha propia de la cuenta.
- La ficha RF03 se cifra en el servidor como siempre (RF116).

---

## 2. Componentes y Servicios

| Archivo | Responsabilidad |
|---|---|
| [`src/components/VinculacionCanales.vue`](file:///c:/Users/adan_/ERP/sensor_pulso/src/components/VinculacionCanales.vue) | Interfaz interactiva de selección de canales 1 a 5, barra de progreso de ronda y acciones docentes. |
| [`src/components/SesionMedicionControl.vue`](file:///c:/Users/adan_/ERP/sensor_pulso/src/components/SesionMedicionControl.vue) | Control de la sesión activa con visualizador de ronda y botón de avance rápido. |
| `src/components/AgregarCanalModal.vue` | Asistente de 3 pasos (ficha, términos, consentimiento) para cada canal agregado. |
| `src/utils/canalesMultiples.js` | Reglas puras: rol, tope de 5, siguiente canal libre, requisitos completos. |
| `supabase/migrations/20261109000200_canales_multiples_docente.sql` | Trigger por rol, `agregar_canal_automatico()` y tabla `sesion_canal_requisitos` con RLS. |
| `scripts/test-rf111-canales-multiples.mjs` | 33 pruebas de las reglas de «Agregar otro canal». |
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

### 1.2 Gráficas de los canales propios (profesor y administrador)

- Con **un solo canal** listo se ve solo su gráfica (el osciloscopio del canal).
- Al agregar otro canal y completar sus tres requisitos aparece **«Gráficas de tus canales»**, con dos vistas: **«Por separado»** (una gráfica por canal) y **«Juntas»** (una sola gráfica con una línea de color distinto por canal). La leyenda indica el color y la persona de cada canal.
- Un canal que aún no completa ficha, términos y consentimiento no se grafica.
- Código: `src/components/GraficasCanalesPropios.vue`, `src/utils/graficasCanales.js`, `scripts/test-rf111-graficas-canales.mjs` (19 pruebas).

---

## Lote de modificaciones (rama `modificaciones`)

| Cambio | RF tocados | Archivos principales |
|---|---|---|
| Medición y Aulas exigen sesión; Comparación sin «mediciones propias» sin sesión | RF31 | `utils/accesoSinSesion.js`, `router/index.js`, `ComparadorMedicionesCard.vue` |
| «Agregar canal» (profesor/admin, hasta 5): ficha + términos + consentimiento, asignación automática | RF111, RF12, RF08, RF03, RF04, RF88, RF59 | `AgregarCanalModal.vue`, `canalesService.js`, migración `20261109000200` |
| Ficha propia: se guarda y se carga completa (incluido nivel de estrés) | RF03 | `pacienteService.js`, `utils/fichaPersistencia.js`, `DatosPacienteCard.vue` |
| Fecha de nacimiento con edad automática (solo mayores de 18) | RF03 | `utils/edad.js`, `DatosPacienteCard.vue`, `AgregarCanalModal.vue` |
| Medición sin valores inventados: «Sensor no detectado» | RF05, RF06, RF07, RF08 | `MedicionView.vue` |
| Fuente de medición a elegir: **WiFi o USB (Web Serial)** | RF05 (cambia: vuelve el USB como opción; ver RNF02: WiFi sigue funcionando en cualquier navegador) | `esp32Service.js`, `utils/fuenteMedicion.js`, `FuenteMedicionSelector.vue`, `useSerialSensor.js` |
| Gráficos por canal ocupado, unibles por color, con BPM, HRV, ruido, ritmo, picos sistólicos, SpO₂ y pulso | RF06, RF08, RF15, RF17, RF18, RF114 | `GraficasCanalesPropios.vue`, `utils/metricasCanal.js` |

Orden de la pantalla de Medición (paso 4): fuente → sesión y canales → avisos → gráficos → detalle del canal → monitor de canales → herramientas de prueba (plegadas).

Pendiente: el firmware actual solo imprime `ir,red` de un sensor por USB; para varios sensores debe imprimir `CH<n>,millis(),ir,red` (ver encabezado de `utils/fuenteMedicion.js`).

### Pantalla de Medición del docente/administrador (paso 4)

1. **Identificación primero:** «Identificado como docente» (sin ID de medición: el identificador interno no aporta a la medición y no se muestra) y si su consentimiento es válido o no.
2. **¿Cómo se mide?** WiFi o USB. Con **WiFi**: mensaje de conectado, o el porqué y los pasos si no lo está. Con **USB**: botón «Conectar por USB», el puerto se identifica solo (chips CP210x, CH340/CH9102, FTDI y Espressif; «Elegir otro puerto» para el resto), mensaje de conectado o pasos para conectarlo.
3. **Aviso «Solo con fines de aprendizaje»** visible con cualquiera de las dos fuentes.
4. **Solo un botón «Agregar canal» / «Agregar otro canal»** (con WiFi y con USB), sin lista ni asignación de canales. Por cada paciente se piden sus datos, los términos y el consentimiento; al terminar aparece de inmediato su gráfica, la pantalla se mueve para dejarla en el centro y el botón sigue disponible (hasta 5). Cada gráfica tiene «Quitar».
5. **Gráficas:** por separado o todas a la vez con un color por canal.

**Evaluaciones formativas sin sesión:** «Practicar para las evaluaciones» (Aprendizaje) es abierta con o sin sesión (`/aprendizaje/practica`); no se guarda ni cuenta como evaluación.
Pruebas: `scripts/test-medicion-flujo-docente.mjs`, `scripts/test-practica-evaluacion.mjs`.

### Configurar el WiFi del ESP32 desde la app (sin tocar código)

- En Medición, con la fuente **WiFi**, el botón **«Configurar WiFi del ESP32 por USB»** abre un asistente: conecta el puerto USB (se identifica solo), muestra el estado de la placa, lista las redes que ve el ESP32, pide la clave y confirma «Conectado». Después se puede desconectar el cable y alimentar la placa con un cargador: se conecta sola en cada encendido.
- El ESP32 guarda el WiFi en su memoria (NVS). Ya no se editan constantes en el `.ino`; solo hay que cargar el firmware una vez.
- Solo redes de 2,4 GHz; las redes con usuario y contraseña propios (tipo eduroam) o con portal de inicio de sesión no funcionan (usar router del laboratorio o hotspot de un celular).
- Protocolo por serie (prefijo `@SP ` + JSON de una línea): documentado en `firmware/README.md`. Código: `utils/provisionWifi.js`, `ConfigurarWifiAsistente.vue`, `esp32_wifi_prueba.ino`.
- Pruebas: `scripts/test-provision-wifi.mjs`, `scripts/test-firmware-provision-protocolo.mjs`. **No probado con la placa real.**

### Estabilidad del WiFi y botón «Terminar»

- **Análisis:** la placa no perdía el WiFi; el parpadeo «conectado / sin conexión» venía de envíos HTTPS lentos (3 a 9 s, a veces mucho más si el handshake TLS se colgaba), de una ventana de «conectado» de 5 s y de una app que vaciaba los canales al primer hueco.
- **App:** `utils/toleranciaConexion.js` — se conservan canales y «conectado» hasta 10 s sin datos nuevos, se descartan respuestas más viejas que lo mostrado y las consultas no se solapan. **Servidor:** ventana de «conectado» de 15 s (`api/esp32/telemetria.js`; aplica cuando se despliegue). **Firmware:** sin ahorro de energía del módem, tiempos máximos de 4–6 s en el envío (conexión, lectura y handshake TLS) y recuperación automática (a los 5 envíos fallidos seguidos reinicia el WiFi; a los 20 reinicia la placa).
- **Botón «Terminar»** en cada gráfica: congela el canal y pregunta si guardar; si la persona puede publicar (admin, o profesor con el permiso de RF98) pregunta además si publicar de forma anónima (RF57). Código: `TerminarMedicionModal.vue`, `utils/terminarMedicion.js`. Sin una sesión de medición real en la base, la medición se guarda igual en la cuenta (sin ligarla a una sesión). Si el paciente se agregó con «Agregar canal», al publicar quien mide marca una casilla confirmando que el paciente autorizó la publicación anónima (su consentimiento no menciona publicar).
- Pruebas: `scripts/test-tolerancia-conexion.mjs`, `scripts/test-terminar-medicion.mjs`.

### SpO₂: cálculo corregido en el firmware

- **Antes:** el firmware usaba `110 − 25 × (rojo/infrarrojo)` con valores brutos (físicamente incorrecto), arrancaba en 98 % y casi nunca cambiaba.
- **Ahora:** razón de razones `R = (AC_rojo/DC_rojo) / (AC_ir/DC_ir)` en ventanas de 2 s, con la recta empírica `110 − 25·R`, solo con dedo apoyado y señal pulsátil válida. Sin dedo, en calentamiento o con señal inservible el valor es **0 = sin lectura** y la app muestra «—». Nunca se inventa un valor.
- **Límite:** sigue siendo una aproximación educativa **sin calibrar** contra un oxímetro de referencia; no es una medición clínica.

### Por qué «No se pudo guardar la medición» (base sin la migración de RF30)

- **Causa:** la web envía `id_cliente` al guardar (para no duplicar mediciones reenviadas) y a la base de la app le faltaba esa columna (migración `20261102000100_guardado_historial_mediciones.sql` sin aplicar). La base rechazaba el insert y la pantalla mostraba el mensaje genérico.
- **Arreglo en la app:** si la columna no existe, `guardarMedicion` reintenta sin `id_cliente` (la medición se guarda igual) y los errores genéricos muestran su detalle.
- **Recomendado:** aplicar esa migración (es idempotente) para recuperar la protección contra duplicados y la regla de la base «una medición con calidad mala no se guarda como válida» (RF16).
