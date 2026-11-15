insert into public.lecciones (slug, titulo, categoria, publicada)
values ('corazon', 'Cómo funciona el corazón', 'fisiologia', true)
on conflict (slug) do nothing;

insert into public.insignias (codigo, nombre, descripcion)
values
  ('rf42-corazon-completado', 'Corazón completado', 'Entregaste el reto del corazón.'),
  ('rf42-corazon-perfecto', 'Corazón al 100%', 'Acertaste todas las preguntas del reto del corazón.')
on conflict (codigo) do nothing;

-- El usuario puede consultar su progreso. La función calcula y guarda el puntaje.
drop policy if exists progreso_propio on public.progreso_lecciones;

create policy progreso_propio
  on public.progreso_lecciones
  for select
  to authenticated
  using (usuario_id = (select auth.uid()));

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

  if v_leccion_id is null or p_slug is distinct from 'corazon' then
    raise exception 'Este reto no está disponible.';
  end if;

  if jsonb_typeof(p_respuestas) is distinct from 'object' then
    raise exception 'Envía una opción por cada pregunta.';
  end if;

  if (select count(*) from jsonb_each(p_respuestas)) <> 3
     or coalesce(p_respuestas ->> 'corazon-circuito', '') not in ('a', 'b', 'c')
     or coalesce(p_respuestas ->> 'corazon-bombeo', '') not in ('a', 'b', 'c')
     or coalesce(p_respuestas ->> 'corazon-gasto', '') not in ('a', 'b', 'c') then
    raise exception 'Selecciona una opción válida para cada pregunta.';
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
    ('corazon-circuito', 'b'),
    ('corazon-bombeo', 'a'),
    ('corazon-gasto', 'c')
  ) as clave(id, correcta);

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
  where codigo = 'rf42-corazon-completado'
     or (codigo = 'rf42-corazon-perfecto' and v_aciertos = v_total)
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