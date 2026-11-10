# RF27 · Carga de Señales por CSV, Simuladas, Datasets o Referencia Validada

Requerimiento: *Cargar señales por CSV, simuladas, de dataset o de referencia validada.*

---

## 1. Alcance y Contexto Clínico-Docente

El requerimiento **RF27** (Entrega 4) provee a estudiantes y docentes de la Universidad Adventista de Chile (UNACH) la capacidad de ingresar y procesar bioseñales fotopletismográficas (PPG) desde **cuatro fuentes heterogéneas**, permitiendo realizar análisis comparativos, pruebas offline y contraste fisiológico incluso en ausencia de hardware físico ESP32:

1. **Archivos CSV:** Carga manual o arrastrar/soltar de registros externos con detección inteligente de delimitadores (`,`, `;`, `\t`, `|`), mapeo automático de columnas y cálculo preliminar de BPM.
2. **Señales Simuladas:** Modelado paramétrico de pulsos arteriales fisiológicos usando suma de funciones gaussianas asimétricas (onda sistólica, muesca dícrota y onda diastólica reflexiva), variabilidad de frecuencia (40–180 BPM), modulación respiratoria y ruido Gaussiano SNR configurable.
3. **Datasets Públicos Indexados:** Integración directa con bancos de datos biomédicos de prestigio internacional (PhysioNet BIDMC PPG, CapnoBase TBME, MIMIC-III Waveform y WESAD Stress).
4. **Señales de Referencia Validadas:** Biblioteca de patrones clínicos clasificados según directrices de la American Heart Association (AHA) para docencia (reposo normocárdico, taquicardia sinusal, bradicardia atlética y arritmia sinusal respiratoria).

---

## 2. Arquitectura de Componentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                       Interfaz de Usuario (Vue 3)                           │
│  - /comparacion -> Pestaña "📂 Carga de Señales (RF27)"                     │
│  - Componente: CargaSenalesCard.vue (Selector de 4 fuentes + Osciloscopio)  │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 Servicio Central: senalesService.js                         │
│  ├── parsearCsvSenal(texto, nombre)      -> Valida, sanea y formatea CSV   │
│  ├── generarSenalSimulada(opciones)      -> Modelo doble-Gaussiano PPG      │
│  ├── obtenerDatasetsPublicos()           -> Metadatos y acceso a datasets   │
│  ├── cargarSenalDataset(datasetId)       -> Extrae serie temporal real      │
│  ├── obtenerSenalesReferenciaValidadas() -> Banco docente validado AHA      │
│  ├── guardarSenalEnSupabase(senal)       -> Persiste en senales_referencia  │
│  └── generarCsvPlantillaEjemplo()        -> Descarga plantilla de prueba    │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                   Base de Datos (Supabase PostgreSQL)                       │
│  - Enum: public.fuente_senal ('sensor', 'simulador', 'csv',                 │
│                              'dataset', 'referencia')                       │
│  - Tabla: public.senales_referencia (tipo IN 'csv','simulada',              │
│                                           'dataset','validada')             │
│  - RLS: Propietario o docente del aula                                      │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Implementación Técnica

### 3.1 Procesamiento y Sanitización de CSV (`parsearCsvSenal`)
* **Detección de delimitador:** Inspección de la cabecera identificando comas, puntos y comas, tabulaciones o plecas.
* **Mapeo dinámico de columnas:** Reconoce nombres como `tiempo`, `time`, `t`, `segundos`, `ir`, `infrared`, `rojo`, `red`, `ppg`, `valor` o `val`.
* **Sanitización y control de límites (RF65 / RF66):**
  - Rechaza archivos vacíos o con formato corrupto.
  - Conversión estricta a punto flotante numérico descartando valores `NaN`.
  - Normalización temporal y centrado en cero para análisis espectral.
  - Estimación automática de picos sistólicos y cálculo de BPM medio.

### 3.2 Simulador Fisiológico Paramétrico (`generarSenalSimulada`)
Implementa la ecuación de modelado de pulso arterial:
$$\text{PPG}(t) = A_1 e^{-\frac{(t - \mu_1)^2}{2\sigma_1^2}} + A_2 e^{-\frac{(t - \mu_2)^2}{2\sigma_2^2}} + \text{Arritmia Resp.} + \text{Ruido}$$
Donde:
* $A_1, \mu_1, \sigma_1$: Amplitud, retardo y ancho de la onda sistólica anterógrada principal.
* $A_2, \mu_2, \sigma_2$: Amplitud, retardo y ancho de la onda dicrotica reflejada.
* Modulación de línea base por ciclo respiratorio (frecuencia típica 0.25 Hz).
* Ruido blanco ajustable por factor de SNR.

### 3.3 Catálogo de Datasets Públicos Indexados
* **PhysioNet BIDMC PPG and Respiration Dataset:** Pacientes de cuidados intensivos, monitoreo simultáneo de PPG y respiración.
* **CapnoBase TBME Respiratory Benchmark:** Bioseñales de capnografía y fotopletismografía calibrada para validación de algoritmos.
* **MIMIC-III Waveform Database:** Base de datos clínica de UCI de PhysioNet con formas de onda arteriales completas.
* **WESAD (Wearable Stress and Affect Detection):** Bioseñales bajo diferentes estados de estrés y relajación.

### 3.4 Persistencia y Seguridad en Supabase
* Almacena las señales importadas en la tabla `senales_referencia` asociadas al `propietario_id = auth.uid()`.
* Las señales cargadas pueden inyectarse directamente en el visor de comparación (`/comparacion`) o utilizarse como fuente simulada para mediciones educativas.

---

## 4. Pruebas Automatizadas

El archivo [`scripts/test-rf27-cargar-senales.js`](../scripts/test-rf27-cargar-senales.js) ejecuta 14 pruebas de extremo a extremo:

```bash
npm run test:rf27
```

Resultados:
- ✅ Parseo de CSV con cabeceras estándar (tiempo, ir, rojo).
- ✅ Soporte de delimitadores alternativos (`;`, `\t`).
- ✅ Soporte de columna única PPG.
- ✅ Validación y rechazo de archivos corruptos o vacíos (RF65, RF66).
- ✅ Generación de bioseñales simuladas en reposo (72 BPM), taquicardia (130 BPM) y bradicardia (48 BPM).
- ✅ Opciones paramétricas de frecuencia, ruido y duración.
- ✅ Indexación y extracción de datasets públicos (PhysioNet BIDMC, CapnoBase, MIMIC-III, WESAD).
- ✅ Obtención de señales de referencia validadas AHA.
- ✅ Integración de esquema PostgreSQL (enum `fuente_senal` y tabla `senales_referencia`).
- ✅ Integración en `ComparacionView.vue` y `CargaSenalesCard.vue`.

---

## 5. Verificación Manual en la Interfaz de Usuario

1. Iniciar la aplicación (`npm run dev`) y navegar a **/comparacion**.
2. Hacer clic en la pestaña **📂 Carga de Señales (RF27)**.
3. Probar las 4 fuentes disponibles:
   * **CSV:** Hacer clic en "Descargar Plantilla CSV de Ejemplo" y arrastrar el archivo descargado a la zona de carga; verificar la gráfica generada y el cálculo de BPM.
   * **Simulador:** Ajustar la frecuencia cardíaca a 85 BPM, seleccionar "Ruido Leve" y presionar "Generar Onda Simulada"; observar la forma de onda fisiológica con sístole y muesca dícrota.
   * **Datasets Públicos:** Seleccionar "PhysioNet BIDMC PPG Dataset" y presionar "Cargar Muestra del Dataset"; verificar los metadatos clínicos y la serie temporal.
   * **Señales Validadas:** Seleccionar "Reposo Basal Fisiológico (Normocardia)" y presionar "Cargar Patrón Validado".
4. En cualquiera de los 4 casos, pulsar **"Comparar en esta Pantalla"** para superponer la señal cargada contra el rango fisiológico de referencia.
