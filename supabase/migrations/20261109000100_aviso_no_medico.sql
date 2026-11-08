-- RF94: el aviso de que la plataforma no es un dispositivo médico certificado ni entrega diagnósticos
-- queda en la base con la misma redacción y versión que usa la web (src/data/avisoEducativo.js).
-- La web lo toma de ese archivo para funcionar sin conexión; esta copia deja constancia de qué texto
-- estaba vigente en cada fecha.

update public.documentos_legales
   set titulo = $t$Aviso: plataforma educativa, no es un dispositivo médico$t$,
       contenido = $t$sensor pulso es una plataforma educativa y de laboratorio. No es un dispositivo médico certificado y no entrega diagnósticos: sus resultados (BPM, SpO₂, ritmo y comparaciones) son orientativos, no constituyen un diagnóstico médico ni sustituyen la evaluación de un profesional de la salud. Cuando un valor se parece a un patrón de referencia (por ejemplo, de taquicardia o bradicardia), es un ejercicio de aprendizaje y no una conclusión sobre tu salud. Si tienes síntomas o dudas sobre tu salud, consulta a un profesional.$t$,
       version = '2.0',
       vigente_desde = now()
 where clave = 'aviso_educativo';

update public.documentos_legales
   set titulo = 'No es un dispositivo médico',
       contenido = $t$Plataforma educativa: no es un dispositivo médico certificado ni entrega diagnósticos. El sensor con ESP32 (MAX30102) es un instrumento didáctico: no es un dispositivo médico certificado y no entrega diagnósticos.$t$,
       version = '2.0',
       vigente_desde = now()
 where clave = 'aviso_no_medico';
