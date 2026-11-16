# RF93 — Evaluación de revisión por comité de ética

- **Responsable** · Cristóbal
- **Fecha de revisión documental** · 16 de noviembre de 2026
- **Estado** · Consulta docente respondida. Confirmación institucional pendiente.

## Actividad y datos

Sensor Pulso se utilizará en una práctica de laboratorio con fines docentes. Con un sensor óptico MAX30102 y un ESP32, la plataforma registra una señal fotopletismográfica (PPG) y estima la frecuencia cardíaca (BPM) y la saturación periférica de oxígeno (SpO₂). Los resultados se utilizan para aprender a medir e interpretar señales fisiológicas.

La práctica se limita a personas adultas que otorguen su consentimiento informado explícito antes de la medición. El formulario valida la mayoría de edad a partir de la fecha de nacimiento. El flujo de consentimiento registra la aceptación y su versión, y el esquema permite asociar esa versión a la medición (RF04 y RF59).

Las mediciones guardadas en Supabase se vinculan a la cuenta del usuario. Según el flujo de guardado, pueden incluir la fecha, los BPM, la SpO₂, el ritmo, la calidad y datos de la señal. Las declaraciones de salud, cuando se registran, se almacenan cifradas en una tabla separada. Las mediciones vinculadas a una cuenta contienen información de salud identificable. [Migración de consentimiento y declaraciones](../supabase/migrations/20261027000200_auditoria_consentimiento_catalogos.sql) · [Migración de mediciones](../supabase/migrations/20261027000400_dispositivos_mediciones.sql)

## Fundamento y conclusión

El Decreto 114 define la investigación científica biomédica en seres humanos según su finalidad y el tipo de intervención o interacción. La definición incluye el uso de información identificable en el contexto de una investigación. Para la investigación científica biomédica, el artículo 10 de la Ley 20.120 exige el informe favorable del Comité Ético Científico correspondiente y la autorización expresa del director del establecimiento. El artículo 11 establece el consentimiento previo, expreso, libre e informado y su formalización mediante acta. [Ley 20.120, artículos 10 y 11](https://www.bcn.cl/leychile/navegar?idNorma=253478) · [Decreto 114, artículos 8, 10, 10 bis y 11](https://www.bcn.cl/leychile/navegar?idNorma=1032919)

**Para el alcance docente descrito, el profesor consultado indicó que la práctica no requiere revisión de un Comité Ético Científico ni de otra instancia universitaria.** Indicó que debe obtenerse consentimiento informado explícito antes de medir a los participantes. La conclusión recoge su criterio para esta práctica de laboratorio. Una confirmación formal de la universidad queda pendiente.

Si se propone recolectar o reutilizar las mediciones para investigación, se deberá reevaluar el alcance antes de iniciar esa actividad. Si corresponde a investigación biomédica, los pasos son preparar el protocolo y el consentimiento de investigación, solicitar el informe favorable del comité competente y obtener la autorización expresa del director del establecimiento. [Ley 20.120, artículos 10 y 11](https://www.bcn.cl/leychile/navegar?idNorma=253478) · [Decreto 114](https://www.bcn.cl/leychile/navegar?idNorma=1032919)

## Registro de consulta

- **Persona consultada y cargo** · Darío Sandoval Ortega, docente responsable del proyecto.
- **Fecha de consulta** · 15 / 11 / 2026.
- **Fecha de respuesta** · 15 / 11 / 2026.
- **Criterio recibido** · La práctica descrita no requiere revisión ética según el docente. Debe obtenerse consentimiento informado explícito. La respuesta no especificó resguardos adicionales para el almacenamiento de los resultados.
- **Contacto indicado para confirmación institucional** · Decano de la Facultad de Salud, `decanofacs@unach.cl`. Consulta a Decanatura pendiente.