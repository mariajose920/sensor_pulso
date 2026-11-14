create or replace function public.controlar_evaluacion_en_vivo(
  p_evaluacion_id uuid,
  p_accion text
)
returns public.evaluaciones
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_evaluacion public.evaluaciones;
begin
  if auth.uid() is null
     or not public.profesor_de_evaluacion(p_evaluacion_id) then
    raise exception 'Solo el profesor del aula puede controlar la evaluación.'
      using errcode = '42501';
  end if;

  if p_accion = 'iniciar' then
    update public.evaluaciones as e
    set estado = 'en_curso',
        iniciada_en = statement_timestamp()
    where e.id = p_evaluacion_id
      and e.modo = 'en_vivo'
      and e.estado = 'programada'
      and e.tiempo_limite_s > 0
    returning e.* into v_evaluacion;

    if not found then
      raise exception 'La evaluación debe estar programada en vivo y tener una duración válida.';
    end if;

  elsif p_accion = 'cerrar' then
    update public.evaluaciones as e
    set estado = 'cerrada'
    where e.id = p_evaluacion_id
      and e.modo = 'en_vivo'
      and e.estado = 'en_curso'
    returning e.* into v_evaluacion;

    if not found then
      raise exception 'La evaluación debe estar en curso para cerrarla.';
    end if;

  else
    raise exception 'Acción no válida. Usa iniciar o cerrar.';
  end if;

  return v_evaluacion;
end;
$$;

revoke all on function public.controlar_evaluacion_en_vivo(uuid, text)
  from public, anon;

grant execute on function public.controlar_evaluacion_en_vivo(uuid, text)
  to authenticated;

create or replace function public.asignar_evaluacion_rf109(
  p_evaluacion_id uuid,
  p_modo text,
  p_alcance text,
  p_abre_en timestamptz default null,
  p_cierra_en timestamptz default null,
  p_tiempo_limite_s integer default null,
  p_curso_id uuid default null,
  p_estudiantes_ids uuid[] default null
)
returns public.evaluaciones
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_evaluacion public.evaluaciones;
begin
  if auth.uid() is null
     or not public.profesor_de_evaluacion(p_evaluacion_id) then
    raise exception 'Solo el profesor del aula puede asignar la evaluación.'
      using errcode = '42501';
  end if;

  if p_modo = 'ventana' then
    if p_abre_en is null
       or p_cierra_en is null
       or p_cierra_en <= p_abre_en then
      raise exception 'Indica una fecha de cierre posterior a la apertura.';
    end if;
  elsif p_modo = 'en_vivo' then
    if p_tiempo_limite_s is null or p_tiempo_limite_s <= 0 then
      raise exception 'Indica una duración mayor que cero para el modo en vivo.';
    end if;
  else
    raise exception 'Selecciona un modo de aplicación válido.';
  end if;

  update public.evaluaciones as e
  set modo = p_modo,
      estado = 'programada',
      abre_en = case when p_modo = 'ventana' then p_abre_en end,
      cierra_en = case when p_modo = 'ventana' then p_cierra_en end,
      tiempo_limite_s = case when p_modo = 'en_vivo' then p_tiempo_limite_s end,
      iniciada_en = null
  where e.id = p_evaluacion_id
    and e.estado in ('borrador', 'programada')
    and not public.evaluacion_abierta(e.id)
  returning e.* into v_evaluacion;

  if not found then
    raise exception 'Solo puedes configurar una evaluación antes de que abra.';
  end if;

  if p_alcance = 'curso' then
    if not exists (
      select 1
      from public.cursos as c
      where c.id = p_curso_id
        and c.aula_id = v_evaluacion.aula_id
    ) then
      raise exception 'Selecciona un curso de esta aula.';
    end if;
  elsif p_alcance = 'estudiante' then
    if coalesce(cardinality(p_estudiantes_ids), 0) = 0 then
      raise exception 'Selecciona al menos un estudiante.';
    end if;

    if exists (
      select 1
      from unnest(p_estudiantes_ids) as seleccionado(usuario_id)
      where not exists (
        select 1
        from public.aula_estudiantes as m
        where m.aula_id = v_evaluacion.aula_id
          and m.usuario_id = seleccionado.usuario_id
          and m.estado = 'activo'
      )
    ) then
      raise exception 'Todos los estudiantes seleccionados deben estar activos en esta aula.';
    end if;
  elsif p_alcance is distinct from 'aula' then
    raise exception 'Selecciona un alcance válido.';
  end if;

  delete from public.evaluacion_asignaciones
  where evaluacion_id = p_evaluacion_id;

  if p_alcance = 'estudiante' then
    insert into public.evaluacion_asignaciones (
      evaluacion_id, alcance, usuario_id
    )
    select distinct p_evaluacion_id, p_alcance, seleccionado.usuario_id
    from unnest(p_estudiantes_ids) as seleccionado(usuario_id);
  else
    insert into public.evaluacion_asignaciones (
      evaluacion_id, alcance, curso_id
    )
    values (
      p_evaluacion_id,
      p_alcance,
      case when p_alcance = 'curso' then p_curso_id end
    );
  end if;

  return v_evaluacion;
end;
$$;

revoke all on function public.asignar_evaluacion_rf109(
  uuid, text, text, timestamptz, timestamptz, integer, uuid, uuid[]
) from public, anon;

grant execute on function public.asignar_evaluacion_rf109(
  uuid, text, text, timestamptz, timestamptz, integer, uuid, uuid[]
) to authenticated;

create or replace function public.evaluacion_abierta(p_eval uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.evaluaciones as e
    where e.id = p_eval
      and (
        (
          e.modo = 'en_vivo'
          and e.estado = 'en_curso'
          and e.iniciada_en is not null
          and e.tiempo_limite_s > 0
          and statement_timestamp() >= e.iniciada_en
          and statement_timestamp() <
            e.iniciada_en + make_interval(secs => e.tiempo_limite_s)
        )
        or (
          e.modo = 'ventana'
          and e.estado in ('programada', 'en_curso')
          and e.abre_en is not null
          and e.cierra_en is not null
          and statement_timestamp() >= e.abre_en
          and statement_timestamp() < e.cierra_en
        )
      )
  );
$$;

create or replace function public.mis_evaluaciones_rf109()
returns table (
  id uuid,
  titulo text,
  descripcion text,
  tipo text,
  ejercicio text,
  modo text,
  abre_en timestamptz,
  cierra_en timestamptz,
  disponibilidad text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    e.id,
    e.titulo,
    e.descripcion,
    e.tipo,
    e.ejercicio,
    e.modo,
    e.abre_en,
    case
      when e.modo = 'en_vivo' then
        e.iniciada_en + make_interval(secs => e.tiempo_limite_s)
      else e.cierra_en
    end,
    case
      when i.fin is not null then 'entregada'
      when public.evaluacion_abierta(e.id) then 'disponible'
      when e.estado in ('cerrada', 'en_curso')
        or (e.modo = 'ventana' and e.cierra_en <= statement_timestamp())
        then 'cerrada'
      else 'pendiente'
    end
  from public.evaluaciones as e
  left join public.intentos_evaluacion as i
    on i.evaluacion_id = e.id and i.usuario_id = auth.uid()
  where e.estado <> 'borrador'
    and public.evaluacion_asignada_a_mi(e.id)
  order by e.creado_en desc;
$$;

revoke all on function public.mis_evaluaciones_rf109()
  from public, anon;

grant execute on function public.mis_evaluaciones_rf109()
  to authenticated;

create or replace function public.entregar_evaluacion_rf109(
  p_evaluacion_id uuid,
  p_intento_id uuid,
  p_respuestas jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_pregunta_id uuid;
  v_respuesta jsonb;
begin
  if not public.evaluacion_asignada_a_mi(p_evaluacion_id) then
    raise exception 'La evaluación ya no está asignada a tu cuenta.';
  end if;

  if not public.evaluacion_abierta(p_evaluacion_id) then
    raise exception 'La evaluación está cerrada.';
  end if;

  if not exists (
    select 1
    from public.intentos_evaluacion as i
    where i.id = p_intento_id
      and i.evaluacion_id = p_evaluacion_id
      and i.usuario_id = auth.uid()
      and i.fin is null
  ) then
    raise exception 'El intento no está disponible.';
  end if;

  if jsonb_typeof(p_respuestas) is distinct from 'object'
     or p_respuestas = '{}'::jsonb then
    raise exception 'Envía al menos una respuesta.';
  end if;

  for v_pregunta_id, v_respuesta in
    select clave::uuid, valor
    from jsonb_each(p_respuestas) as respuesta(clave, valor)
  loop
    perform public.responder_pregunta(
      p_intento_id, v_pregunta_id, v_respuesta
    );
  end loop;

  perform public.finalizar_intento(p_intento_id);
end;
$$;

revoke all on function public.entregar_evaluacion_rf109(uuid, uuid, jsonb)
  from public, anon;

grant execute on function public.entregar_evaluacion_rf109(uuid, uuid, jsonb)
  to authenticated;