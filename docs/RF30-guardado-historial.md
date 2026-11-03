# RF30 · Guardado de mediciones e historial

**Requerimiento:** guardar mediciones en la cuenta (Supabase) y consultar el historial.
**Entrega 2** (lunes 2 de noviembre). Responsable: María José.

## Qué hace
- Botón **Guardar medición** (`GuardarMedicionCard.vue`) en la pantalla Medición:
  - con el sensor USB o el simulador (BPM, HRV, ritmo del RF18),
  - con el canal seleccionado del ESP32 por WiFi (BPM, SpO₂, calidad). Los canales de ejemplo no se guardan.
- Pantalla **Historial** (`/historial`, solo con sesión): mediciones de la cuenta, de la más reciente a la más antigua, con filtro por fuente y «Cargar más» (20 por página).
- **Sin conexión** (RNF03): la medición queda en el dispositivo (`pwa/medicionesPendientes.js`, máximo 20 y 7 días) y se reenvía al volver internet, sin duplicarse. El historial muestra las últimas mediciones vistas. Todo se borra al cerrar sesión.
- **Calidad de la señal (RF16):** una medición con calidad mala no se guarda como válida y se avisa. La regla está en la web (`utils/medicion.js`) y en la base (`mediciones_calidad_no_mala`). Con calidad regular se guarda.
- **Consentimiento (RF04, RF59):** la base rechaza guardar mediciones de sensor sin consentimiento vigente; la web lo avisa y ofrece aceptarlo.

## Qué se guarda
Solo los valores de la medición, en la tabla `mediciones`: BPM y SpO₂ promedio, HRV (RMSSD), regularidad, ritmo y su explicación, calidad y causa, fuente, canal, edad al medir, vínculo con la declaración del paciente, inicio y fin. Los factores declarados (sueño, cafeína, medicación…) **no** se copian: siguen cifrados en `declaraciones_paciente` (RF116).

## Base de datos
Migración `supabase/migrations/20261102000100_guardado_historial_mediciones.sql`:
- columna `id_cliente` e índice único `(usuario_id, id_cliente)` para no duplicar al reenviar;
- restricción `mediciones_calidad_no_mala`.

La tabla `mediciones` y sus políticas RLS ya existen (migración 4): cada usuario ve y escribe solo lo suyo (RNF12). La integración de GitHub con Supabase aplica la migración al unir a la rama de producción; si no, pegarla en el SQL Editor del proyecto `ozzehtpqxpicfqvmulcg`.

## Fuera de este requerimiento
- Actividad (RF14), inicio/fin de sesión (RF09) y `dentro_de_rango` (RF20): quedan vacíos hasta sus entregas.
- Guardar la señal cruda (`bloques_senal`), eliminar y exportar mediciones (RF58, entrega 6), comparar con mediciones guardadas (RF26, entrega 4).

## Pruebas
`node scripts/test-rf30-mediciones.mjs`
