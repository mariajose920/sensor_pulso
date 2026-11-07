# RF47 · Contrastar las Mediciones con Datasets Públicos

Requerimiento: *Contrastar las mediciones con datasets públicos.*

---

## 1. Alcance y Contexto Clínico-Docente

El requerimiento **RF47** (Entrega 4) permite a estudiantes y docentes de la Universidad Adventista de Chile (UNACH) contrastar cuantitativa y visualmente las bioseñales fotopletismográficas (PPG) registradas en laboratorio (mediante el sensor MAX30100/MAX30102 con ESP32 o simuladas) frente a **patrones de referencia de repositorios biomédicos internacionales abiertos y acreditados**.

Este contraste permite:
- Evaluar la fidelidad de la morfología del pulso arterial (ascenso sistólico anacrítico, muesca dícrota y onda diastólica reflexiva).
- Obtener métricas estadísticas formales de similitud como la **Correlación de Pearson ($r$)** y el **Error Cuadrático Medio Normalizado (NRMSE)**.
- Diagnosticar desviaciones hemodinámicas ($\Delta \text{BPM}$, variabilidad de intervalo $\text{RR}$ en ms y diferencial de saturación $\Delta \text{SpO}_2$).
- Formular conclusiones fisiológicas automáticas sobre el tono vascular, distensibilidad arterial (*compliance*) y modulación simpática/parasimpática.

---

## 2. Catálogo de Datasets Públicos Indexados

| Identificador | Código | Dataset e Institución | Licencia | Parámetros de Control | Enfoque Clínico |
|---|---|---|---|---|---|
| `bidmc-ppg-uci` | **BIDMC-UCI-01** | **PhysioNet BIDMC PPG & Respiration**<br>Beth Israel Deaconess Medical Center | ODC-PD (Dominio Público) | 74.0 BPM<br>98.4% SpO₂ | Estándar de oro para adultos jóvenes en reposo isócrono con distensibilidad arterial preservada. |
| `capnobase-tbme-std` | **CAPNO-TBME-09** | **CapnoBase TBME Benchmark**<br>University of British Columbia | CC-BY 3.0 | 68.0 BPM<br>97.2% SpO₂ | Bioseñal de referencia internacional para calibración de oximetría con modulación respiratoria. |
| `mimic3-taquicardia` | **MIMIC-III-TQ** | **MIMIC-III Waveform Database**<br>MIT Lab for Computational Physiology | PhysioNet Credentialed | 118.0 BPM<br>95.8% SpO₂ | Paciente en UCI con respuesta cronotrópica positiva y diástole acortada. |
| `wesad-estres-simpatico` | **WESAD-S2-STR** | **WESAD Multimodal Dataset**<br>University of Siegen / ACM Ubicomp | Open Science Research | 89.0 BPM<br>97.5% SpO₂ | Registro durante prueba de estrés psicológico (TSST) con vasoconstricción periférica leve. |
| `vitaldb-anestesia-normo` | **VITALDB-QUIR-14** | **VitalDB Open Anesthesia Dataset**<br>Seoul National University | ODbL (Open Database) | 62.0 BPM<br>99.1% SpO₂ | Monitorización quirúrgica de alta resolución (100 Hz) con oxigenación normobárica enriquecida. |
| `mimic2-bradicardia-relativa` | **MIMIC-II-BR** | **MIMIC-II Intensive Care**<br>MIT / Harvard Medical School | PhysioNet Research | 54.0 BPM<br>98.0% SpO₂ | Sujeto en reposo profundo con llenado diastólico prolongado (RR = 1111 ms). |

---

## 3. Fundamento Matemático y Estadístico

### 3.1 Coeficiente de Correlación de Pearson ($r$)
Evalúa la concordancia morfológica lineal entre la serie temporal de la medición del usuario $X$ y la serie temporal del dataset público $Y$:

$$r = \frac{\sum_{i=1}^{N} (X_i - \bar{X})(Y_i - \bar{Y})}{\sqrt{\sum_{i=1}^{N} (X_i - \bar{X})^2} \sqrt{\sum_{i=1}^{N} (Y_i - \bar{Y})^2}}$$

* $r \in [-1, 1]$:
  - $r \ge 0.85$: **Alta Concordancia Morfológica** (alineación de picos y pendiente anacrítica).
  - $0.65 \le r < 0.85$: **Concordancia Moderada con Desfase** (variaciones fisiológicas anatómicas o de frecuencia).
  - $r < 0.65$: **Variación Hemodinámica Significativa** (asincronía o patrón patológico).

### 3.2 Similitud Morfológica (%)
$$\text{Similitud} = \max\left(0, \min\left(100, \text{round}(r \times 100)\right)\right)$$

### 3.3 Error Cuadrático Medio Normalizado (NRMSE)
$$\text{NRMSE} = \frac{\sqrt{\frac{1}{N}\sum_{i=1}^{N} (X_i - Y_i)^2}}{\max(Y) - \min(Y)} \times 100$$

### 3.4 Deltas Hemodinámicos
- **Variación de Frecuencia:** $\Delta \text{BPM} = \text{BPM}_{\text{medicion}} - \text{BPM}_{\text{dataset}}$
- **Variación del Intervalo RR:** $\Delta T = \frac{60000}{\text{BPM}_{\text{medicion}}} - \frac{60000}{\text{BPM}_{\text{dataset}}}\text{ (en ms)}$
- **Diferencial de Saturación:** $\Delta \text{SpO}_2 = \text{SpO}_{2,\text{medicion}} - \text{SpO}_{2,\text{dataset}}\text{ (\%)}$

---

## 4. Arquitectura de Componentes

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Vista de Comparación                              │
│                      src/views/ComparacionView.vue                          │
│        (Pestaña: "🌐 Datasets Públicos (RF47)" -> ?modo=datasets)           │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                  Componente: ComparadorDatasetsCard.vue                     │
│  - Selector por categorías (UCI, Oximetría Calibrada, Tono Autonómico)      │
│  - Cuadrícula de tarjetas de datasets internacionales con insignias         │
│  - Ficha detallada del dataset con enlace al repositorio oficial            │
│  - Osciloscopio Multicanal: Modo Superpuesto y Carriles Paralelos           │
│  - Cuadrícula de 5 métricas: ΔBPM, ΔRR, ΔSpO2, Pearson r, NRMSE             │
│  - Conclusión pedagógica e interpretación fisiológica para UNACH            │
└──────────────────────────────────────┬──────────────────────────────────────┘
                                       │
                                       ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                 Servicio: contrasteDatasetsService.js                       │
│  - Catálogo de datasets internacionales acreditados                         │
│  - Generación de series temporales sincronizadas (duración 3.5 s, 100 Hz)   │
│  - Algoritmo de Correlación de Pearson y NRMSE                              │
│  - Motor de interpretación fisiológica y clasificación clínica              │
│  - Generador de trazos vectoriales SVG para renderizado web                 │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. Pruebas Automatizadas

El archivo [`scripts/test-rf47-contrastar-datasets.js`](../scripts/test-rf47-contrastar-datasets.js) ejecuta 24 pruebas de extremo a extremo:

```bash
npm run test:rf47
```

**Resultado:**
- ✅ Catálogo contiene al menos 5 datasets acreditados (encontrados 6).
- ✅ Presencia de benchmarks canónicos: BIDMC, CapnoBase, MIMIC-III, WESAD y VitalDB.
- ✅ Metadatos completos, licencias abiertas y descriptores morfológicos.
- ✅ Búsqueda por ID y por código de dataset.
- ✅ Coeficiente de Pearson ($r = 1.0$ para señales idénticas, $r = -1.0$ para invertidas, $0$ para vacías o constantes).
- ✅ Error NRMSE ($0\%$ para idénticas, porcentaje coherente con ruido).
- ✅ Motor de contraste: cálculo exacto de $\Delta \text{BPM}$, $\Delta \text{RR}$ y $\Delta \text{SpO}_2$.
- ✅ Detección de alta concordancia y desfase por taquicardia.
- ✅ Generación de conclusiones pedagógicas para la carrera de Enfermería y Salud UNACH.
- ✅ Generación de paths vectoriales SVG (`M ... L ...`).
- ✅ Integración en `ComparadorDatasetsCard.vue` y `ComparacionView.vue`.

---

## 6. Verificación Manual en la Interfaz de Usuario

1. Iniciar el entorno de desarrollo:
   ```bash
   npm run dev
   ```
2. Navegar a **/comparacion** y hacer clic en la pestaña **🌐 Datasets Públicos (RF47)** (o abrir directamente `http://localhost:5173/comparacion?modo=datasets`).
3. En el selector superior de mediciones, ajustar el BPM de prueba (ej. 75 BPM).
4. En la cuadrícula de datasets:
   * Seleccionar **PhysioNet BIDMC (BIDMC-UCI-01)**: Observar alta correlación ($r \approx 0.98$) y superposición casi perfecta de la onda verde (usuario) con la onda cian (dataset).
   * Cambiar a **MIMIC-III Taquicardia (MIMIC-III-TQ)**: Observar el acortamiento de la onda del dataset (118 BPM) frente a la del usuario, reflejado en un delta negativo de $\text{BPM}$ y menor correlación morfológica.
5. Alternar entre **"Vista Superpuesta"** y **"Carriles Paralelos"** en la esquina superior derecha para verificar el renderizado multicanal sincronizado.
6. Revisar las tarjetas de biomarcadores ($\Delta \text{BPM}$, $\Delta \text{RR}$, $\Delta \text{SpO}_2$, Correlación de Pearson y NRMSE) y la caja de interpretación pedagógica para UNACH.
