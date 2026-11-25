insert into public.lecciones (slug, titulo, categoria, publicada)
values
  ('ppg-y-muestreo', 'De la luz a la señal PPG', 'sensor', true),
  ('filtrado-y-picos-ppg', 'De la señal PPG al pulso', 'bpm', true)
on conflict (slug) do nothing;

insert into public.insignias (codigo, nombre, descripcion)
values
  ('rf42-ppg-y-muestreo-completado', 'De la luz a la señal PPG · Reto completado', 'Entregaste todas las respuestas de la lección.'),
  ('rf42-ppg-y-muestreo-perfecto', 'De la luz a la señal PPG · 100%', 'Acertaste todas las preguntas de la lección.'),
  ('rf42-filtrado-y-picos-ppg-completado', 'De la señal PPG al pulso · Reto completado', 'Entregaste todas las respuestas de la lección.'),
  ('rf42-filtrado-y-picos-ppg-perfecto', 'De la señal PPG al pulso · 100%', 'Acertaste todas las preguntas de la lección.')
on conflict (codigo) do nothing;

create or replace function public.resolver_reto_leccion(
  p_slug text,
  p_respuestas jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_usuario_id uuid := auth.uid();
  v_leccion_id uuid;
  v_correccion jsonb;
  v_aciertos integer;
  v_total integer;
  v_puntaje numeric(5,2);
  v_mejor_puntaje numeric(5,2);
begin
  if v_usuario_id is null then
    raise exception 'Inicia sesión para guardar tu progreso.'
      using errcode = '42501';
  end if;

  select id into v_leccion_id
  from public.lecciones
  where slug = p_slug and publicada;

  if v_leccion_id is null then
    raise exception 'Este reto no está disponible.';
  end if;

  if jsonb_typeof(p_respuestas) is distinct from 'object' then
    raise exception 'Envía una opción por cada pregunta.';
  end if;

  select
    jsonb_object_agg(clave.id, jsonb_build_object(
      'acierto', p_respuestas ->> clave.id = clave.correcta,
      'correcta', clave.correcta
    )),
    count(*) filter (where p_respuestas ->> clave.id = clave.correcta),
    count(*)
  into v_correccion, v_aciertos, v_total
  from (values
    ('corazon', 'corazon-circuito', 'b'),
    ('corazon', 'corazon-bombeo', 'a'),
    ('corazon', 'corazon-gasto', 'c'),
    ('frecuencia-cardiaca', 'frecuencia-cardiaca-bpm', 'a'),
    ('frecuencia-cardiaca', 'frecuencia-cardiaca-ejercicio', 'b'),
    ('frecuencia-cardiaca', 'frecuencia-cardiaca-hrv', 'c'),
    ('sensor-max30102', 'sensor-max30102-luz', 'b'),
    ('sensor-max30102', 'sensor-max30102-detector', 'c'),
    ('sensor-max30102', 'sensor-max30102-nm', 'a'),
    ('esp32', 'esp32-lectura', 'b'),
    ('esp32', 'esp32-red', 'a'),
    ('esp32', 'esp32-canales', 'c'),
    ('como-se-obtienen-los-resultados', 'como-se-obtienen-los-resultados-intervalo', 'b'),
    ('como-se-obtienen-los-resultados', 'como-se-obtienen-los-resultados-calculo', 'a'),
    ('como-se-obtienen-los-resultados', 'como-se-obtienen-los-resultados-senal', 'c'),
    ('saturacion-de-oxigeno', 'saturacion-de-oxigeno-significado', 'b'),
    ('saturacion-de-oxigeno', 'saturacion-de-oxigeno-luces', 'a'),
    ('saturacion-de-oxigeno', 'saturacion-de-oxigeno-curva', 'c'),
    ('datos-de-salud', 'datos-de-salud-privacidad', 'a'),
    ('datos-de-salud', 'datos-de-salud-consentimiento', 'b'),
    ('datos-de-salud', 'datos-de-salud-educativo', 'c'),
    ('ppg-y-muestreo', 'ppg-y-muestreo-luz', 'a'),
    ('ppg-y-muestreo', 'ppg-y-muestreo-hz', 'b'),
    ('ppg-y-muestreo', 'ppg-y-muestreo-intervalo', 'c'),
    ('filtrado-y-picos-ppg', 'filtrado-y-picos-ppg-movimiento', 'b'),
    ('filtrado-y-picos-ppg', 'filtrado-y-picos-ppg-filtro', 'a'),
    ('filtrado-y-picos-ppg', 'filtrado-y-picos-ppg-bpm', 'c')
  ) as clave(slug, id, correcta)
  where clave.slug = p_slug;

  if v_total = 0 then
    raise exception 'Este reto no está disponible.';
  end if;

  if (select count(*) from jsonb_each(p_respuestas)) <> v_total
     or exists (
       select 1 from jsonb_object_keys(v_correccion) as pregunta(id)
       where coalesce(p_respuestas ->> pregunta.id, '') not in ('a', 'b', 'c')
     ) then
    raise exception 'Selecciona una opción válida para cada pregunta.';
  end if;

  v_puntaje := round(100.0 * v_aciertos / v_total, 2);

  insert into public.progreso_lecciones as progreso (
    usuario_id, leccion_id, completada, mejor_puntaje
  )
  values (v_usuario_id, v_leccion_id, true, v_puntaje)
  on conflict (usuario_id, leccion_id) do update
    set completada = true,
        mejor_puntaje = greatest(progreso.mejor_puntaje, excluded.mejor_puntaje),
        actualizado_en = now()
  returning mejor_puntaje into v_mejor_puntaje;

  insert into public.insignias_usuario (usuario_id, insignia_id)
  select v_usuario_id, id
  from public.insignias
  where codigo = ('rf42-' || p_slug || '-completado')
     or (codigo = ('rf42-' || p_slug || '-perfecto') and v_aciertos = v_total)
  on conflict (usuario_id, insignia_id) do nothing;

  return jsonb_build_object(
    'aciertos', v_aciertos,
    'total', v_total,
    'puntaje', v_puntaje,
    'mejorPuntaje', v_mejor_puntaje,
    'correccion', v_correccion
  );
end;
$$;

revoke all on function public.resolver_reto_leccion(text, jsonb)
  from public, anon;

grant execute on function public.resolver_reto_leccion(text, jsonb)
  to authenticated;