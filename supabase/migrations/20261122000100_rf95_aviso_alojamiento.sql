-- sensor_pulso · RF95: aviso sobre el alojamiento de los datos fuera de Chile y su base legal
--
-- Reemplaza el texto provisional del documento «alojamiento» («Base legal pendiente de revisión») por el aviso
-- vigente. El mismo texto se muestra en la política de privacidad (/privacidad#alojamiento-datos), en el inicio de
-- sesión, en el consentimiento informado, en «Mis datos y mis derechos» y en el pie de página; todos salen de
-- src/data/alojamiento.js, y una prueba comprueba que este contenido coincida con ese archivo.
-- Es repetible: si el documento ya existe, se actualiza; no toca ningún otro dato.

insert into public.documentos_legales (clave, titulo, contenido, version, vigente_desde)
values (
  'alojamiento',
  'Alojamiento de los datos',
  'Los datos se alojan fuera de Chile, en servidores de Estados Unidos. Los tratan: Supabase (base de datos y autenticación), Vercel (aloja la aplicación web y las funciones del servidor), Resend (envía el correo de confirmación de la cuenta), Google (verifica tu identidad al iniciar sesión y envía las invitaciones a las aulas (gmail)). Supabase aloja la base de datos en AWS, región us-east-1. La ficha de salud se guarda cifrada con una clave que el proveedor no tiene. Base legal: tu consentimiento expreso, que puedes retirar en cualquier momento desde «Mis datos y derechos»; los proveedores tratan los datos como encargados de la UNACH, solo para operar la plataforma. Marco legal: Ley N.º 19.628 y Ley N.º 21.719. Texto completo en la ruta /privacidad.',
  '1.1',
  now()
)
on conflict (clave) do update
  set titulo = excluded.titulo,
      contenido = excluded.contenido,
      version = excluded.version,
      vigente_desde = excluded.vigente_desde;
