# RF94 — Aviso de que la plataforma no es un dispositivo médico certificado ni entrega diagnósticos

**Requisito:** aviso de que la plataforma no es un dispositivo médico certificado ni entrega diagnósticos.

El aviso no basta por sí solo: la plataforma tampoco debe **comportarse** como si diagnosticara. Por eso los textos que se muestran a quien midió hablan de **parecido, tendencia y rangos de referencia**, y conservan los nombres correctos (taquicardia, bradicardia, desaturación, fibrilación auricular…) como patrones para aprender, nunca como una condición de la persona.

## Criterio de redacción

| En vez de afirmar… | Se dice… |
|---|---|
| «Taquicardia detectada» | «Alerta educativa: valores que tienden a los parámetros de taquicardia» |
| «Desaturación arterial» | «Saturación por debajo del rango de referencia: se parece a los parámetros de desaturación» |
| «Se clasifica como Bradicardia» | «Tu registro se parece a los parámetros de bradicardia (simulación educativa, no es un diagnóstico)» |
| «Tu frecuencia descarta taquicardia» | «Tu frecuencia no se parece a los parámetros de la taquicardia sinusal de referencia» |
| «Coincide con el patrón taquicárdico» | «Se parece a los parámetros del patrón taquicárdico de referencia: tiende a ese rango, sin que esto sea un diagnóstico» |

Las **lecciones** y la **práctica de evaluaciones** siguen explicando los conceptos con su nombre: enseñar qué es una taquicardia no es diagnosticar a nadie.

## Qué se hizo

| # | Brecha | Estado | Dónde |
|---|---|---|---|
| 1 | Alertas con lenguaje de diagnóstico | **Hecho** | `AlertaFueraRangoBanner.vue` (títulos «tienden a…», aviso dentro de cada alerta), `alertasService.js` («Tendencia a…»), `HistorialView.vue` |
| 2 | Textos de rangos («Normocardia», «Desaturación arterial») | **Hecho** | `comparacionRangos.js` («dentro / por encima / por debajo del rango de referencia… se parece a los parámetros de…»), `spo2Service.js`, `ValorBpmCard.vue`, `MultiCanalMonitor.vue`, `multiCanalService.js`, `MetricsCards.vue`, `ComparadorRangoCard.vue`, `AulaDetalleView.vue` |
| 3 | «Diagnóstico de ritmo en tiempo real» | **Hecho** | `ClasificacionRitmoCard.vue` («Simulación de diagnóstico del ritmo cardíaco», «Se parece a: …»), `ritmoService.js` |
| 4 | Comparador de patologías | **Hecho** | `ComparadorPatologiasCard.vue` («ritmos de referencia para aprender», aviso dentro), `ritmosPatologias.js` (ningún «descarta», «coincide» ni «correlación clínica»; los nombres se conservan) |
| 5 | Cuatro redacciones distintas | **Hecho** | Un solo texto en `src/data/avisoEducativo.js` (con versión 2.0), usado por el pie, las pantallas, el PDF y el consentimiento |
| 6 | `aviso_no_medico` en la base sin uso | **Hecho** | La migración `20261109000100_aviso_no_medico.sql` guarda el mismo texto y versión; la web lo lee del archivo para funcionar sin conexión y una prueba comprueba que coincidan |
| 7 | Pantallas sin aviso | **Hecho** | Simulador, detalle del aula, evaluaciones, rangos y dispositivos (esta con la nota del sensor ESP32) |
| 8 | PDF con el aviso solo al final | **Hecho** | `informePdfService.js`: aviso bajo el título, título «Informe educativo…» y aviso final |
| 9 | Nota del dispositivo ESP32 | **Parcial** | En pantalla (Dispositivos) y README. **Falta la etiqueta física**, ver abajo |
| 10 | Metadatos públicos | **Hecho** | Descripción de la PWA (`vite.config.js`) y README |
| 11 | Versión del aviso | **Hecho** | `AVISO_VERSION` y `documentos_legales.version` |
| 12 | Prueba que vigile el lenguaje | **Hecho** | `scripts/test-rf94-aviso-no-medico.mjs` |

## Pendiente de decisión humana

1. **Etiqueta del ESP32.** Texto sugerido para imprimir y pegar en el dispositivo:
   *«Instrumento didáctico UNACH. No es un dispositivo médico certificado ni entrega diagnósticos.»*
2. **Revisión del texto** por quien corresponda en la UNACH (docente guía o asesoría jurídica) antes de usarlo con personas reales.
3. **Aplicar la migración** `20261109000100_aviso_no_medico.sql` en Supabase.

## Lo que queda fuera a propósito

- Los **ejemplos** del simulador y de la galería pública (por ejemplo «Taquicardia Leve de Esfuerzo»): son casos de muestra, no resultados de una persona.
- Las **leyendas de las escalas** de `ComparadorRangoCard.vue` (Bradicardia < 60, Taquicardia > 100): describen rangos, no a quien midió.
- Los **nombres** de las categorías de `ritmoService.js`: se conservan como patrones de referencia; lo que cambió es cómo se le presentan a la persona.
