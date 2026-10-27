-- sensor_pulso · Migración 8: datos iniciales
-- Los valores de referencia son educativos y deben validarse (requerimientos 3.1).
-- El primer administrador NO se crea aquí: se inserta su correo en public.admins_iniciales
-- (ver supabase/seed.example.sql) antes de que esa persona se registre (RF44).

insert into public.actividades (codigo, nombre, descripcion) values
  ('reposo',             'Reposo',              'Sentado y tranquilo, al menos 1 minuto'),
  ('sentado',            'Sentado activo',      'Sentado, estudiando o conversando'),
  ('caminata',           'Caminata',            'Caminata a ritmo normal'),
  ('ejercicio_moderado', 'Ejercicio moderado',  'Trote suave o bicicleta'),
  ('ejercicio_intenso',  'Ejercicio intenso',   'Carrera o esfuerzo alto'),
  ('post_ejercicio',     'Recuperación',        'Primeros minutos tras ejercitarse');

insert into public.rangos (actividad_id, edad_min, edad_max, bpm_min, bpm_max, spo2_min, spo2_max)
select a.id, v.emin, v.emax, v.bmin, v.bmax, 95, 100
from public.actividades a
join (values
  ('reposo',             5, 12,  70, 120),
  ('reposo',            13, 17,  60, 100),
  ('reposo',            18, 64,  60, 100),
  ('reposo',            65,120,  60, 100),
  ('sentado',            5, 17,  70, 120),
  ('sentado',           18,120,  60, 110),
  ('caminata',           5, 17,  80, 130),
  ('caminata',          18,120,  75, 120),
  ('ejercicio_moderado', 5, 17, 100, 160),
  ('ejercicio_moderado',18,120, 100, 150),
  ('ejercicio_intenso',  5, 17, 140, 200),
  ('ejercicio_intenso', 18,120, 140, 190),
  ('post_ejercicio',     5,120,  80, 160)
) as v(codigo, emin, emax, bmin, bmax) on v.codigo = a.codigo;

insert into public.consentimientos_version
  (version, texto, finalidad, datos_recogidos, responsable, plazo_conservacion, activa)
values (
  '1.0',
  'Consiento de forma expresa, previa e informada la medición de mi frecuencia cardíaca y saturación de oxígeno con fines educativos. Entiendo que la plataforma no es un dispositivo médico ni entrega diagnósticos.',
  'Actividad educativa de la asignatura: medir, visualizar y comparar la frecuencia cardíaca.',
  'Nombre, edad, factores declarados (sueño, cafeína, medicación, estrés, actividad previa, condición de salud), señal PPG, BPM y SpO2.',
  'Responsable del tratamiento: equipo del proyecto sensor_pulso (completar con datos oficiales y canal de contacto).',
  'Hasta 12 meses desde la última medición, salvo que el titular solicite antes su eliminación.',
  true);

insert into public.config_plataforma (clave, valor) values
  ('metodo_sincronizacion', '"correlacion_cruzada"'),
  ('metodos_sincronizacion_disponibles', '["correlacion_cruzada","alineacion_por_picos","dtw"]'),
  ('inactividad_sesion_minutos', '30'),
  ('max_estudiantes_por_aula', '100'),
  ('exigir_mfa', 'false'),            -- pasar a true cuando admin y profesores hayan inscrito su 2.º factor (RF49)
  ('segundos_sin_latido_para_perdida', '30'),
  ('canales_por_esp32', '5');

insert into public.insignias (codigo, nombre, descripcion) values
  ('primera_medicion', 'Primera medición', 'Completaste tu primera medición'),
  ('leccion_completa', 'Lección completa', 'Terminaste una lección'),
  ('experto_ppg',      'Experto en PPG',   'Aprobaste los retos de señal PPG'),
  ('comparador',       'Comparador',       'Hiciste tu primera comparación de señales');

insert into public.clasificacion_datos (tabla, columna, clase, cifrado_campo, enmascarar) values
  ('perfiles', 'correo', 'privado', false, true),
  ('perfiles', 'nombre', 'privado', false, true),
  ('declaraciones_paciente', 'nombre', 'privado', false, true),
  ('declaraciones_paciente', 'edad', 'privado', false, false),
  ('declaraciones_paciente', 'datos_cifrados', 'sensible_salud', true, true),
  ('mediciones', 'bpm_promedio', 'sensible_salud', false, false),
  ('mediciones', 'spo2_promedio', 'sensible_salud', false, false),
  ('bloques_senal', 'ir', 'sensible_salud', false, false),
  ('publicaciones', 'bpm_promedio', 'publico', false, false),
  ('lecciones', 'contenido', 'publico', false, false);

insert into public.politicas_retencion (tabla, dias, accion) values
  ('lecturas', 365, 'borrar'),
  ('declaraciones_paciente', 365, 'borrar'),
  ('intentos_login', 90, 'borrar'),
  ('limites_peticiones', 2, 'borrar');

insert into public.documentos_legales (clave, titulo, contenido, version) values
  ('aviso_educativo', 'Aviso educativo',
   'Esta plataforma es educativa y no sustituye un diagnóstico médico.', '1.0'),
  ('aviso_no_medico', 'No es un dispositivo médico',
   'La plataforma no es un dispositivo médico certificado ni entrega diagnósticos. Ante dudas de salud consulta a un profesional.', '1.0'),
  ('politica_privacidad', 'Política de privacidad',
   'Pendiente de redacción: responsable del tratamiento, finalidades, derechos y canal de contacto (RF88).', '0.1'),
  ('alojamiento', 'Alojamiento de los datos',
   'Los datos se alojan en Supabase, región us-east-1 (Estados Unidos), fuera de Chile. Base legal pendiente de revisión (RF95).', '1.0');

-- Retención diaria con pg_cron, si la extensión está disponible.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('sensor_pulso_retencion', '0 4 * * *', 'select public.aplicar_retencion()');
  end if;
end $$;
