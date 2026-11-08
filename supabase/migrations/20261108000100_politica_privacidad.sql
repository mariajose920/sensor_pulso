-- RF88: política de privacidad v1.0 (reemplaza el texto 'Pendiente de redacción').
-- El texto completo y vigente se muestra en la ruta /privacidad (src/data/politicaPrivacidad.js);
-- aquí queda el resumen y la versión para trazabilidad de qué política aceptó cada persona.
update public.documentos_legales
   set titulo = 'Política de privacidad',
       contenido = 'Responsable: Equipo del proyecto sensor pulso, Universidad Adventista de Chile (UNACH), Facultad de Ingeniería y Negocios. '
         || 'Tratamos tu cuenta, tus mediciones de pulso y SpO2 y la ficha de salud que declaras, solo con fines educativos y con tu consentimiento. '
         || 'Conservación: hasta 12 meses para mediciones y ficha; 90 días para intentos de inicio de sesión. '
         || 'Los datos se alojan en Supabase (us-east-1, fuera de Chile). Derechos de acceso, rectificación, supresión, oposición y portabilidad, '
         || 'con respuesta en 30 días. Texto completo en la ruta /privacidad.',
       version = '1.0',
       vigente_desde = now()
 where clave = 'politica_privacidad';
