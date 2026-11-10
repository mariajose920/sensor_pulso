# RF32 - Descargas: informe PDF, datos CSV y gráfico como imagen

Rama: `rf32-descarga-informe`. Se usa en la vista de Comparación (`DescargasPanel.vue`).

## Archivos
- `src/components/DescargasPanel.vue`: tres botones (PDF, CSV, PNG) con estado de carga y mensajes.
- `src/utils/descargas.js`: CSV, imagen del gráfico, nombres de archivo seguros y auditoría.
- `src/utils/exportPdf.js`: informe PDF (jsPDF, cargado bajo demanda).

## Formato del CSV de salida
UTF-8 con BOM, separador coma, saltos CRLF.
- Líneas de metadatos que empiezan con `#`: medición, fecha, BPM, intervalo, amplitud, referencia, frecuencia de muestreo, nota.
- Cabecera: `tiempo_ms,medicion_ppg,plantilla_ppg_reposo,ecg_educativo`.
- 400 filas (4 s a 100 Hz).
- Los textos que empiezan con `=`, `+`, `-` o `@` se prefijan con `'` para evitar inyección de fórmulas.

## Informe PDF
Nombre de la medición, BPM, ciclo, amplitud, diferencia con la plantilla de 72 BPM, estado, gráfico y aviso de que no es un dispositivo médico. Sin datos personales (RF61).

## Auditoría (RF62)
Tras cada descarga se llama a `registrar_descarga` (`informe_pdf`, `datos_csv`, `grafico_imagen`). Esa función exige sesión: sin sesión la descarga funciona, pero no queda registrada y se avisa al usuario.

## Pendiente
- Descargar mediciones del historial cuando RF30 esté en `develop`.
- Decidir si se exigirá sesión para descargar.
