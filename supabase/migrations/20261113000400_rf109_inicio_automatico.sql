-- sensor_pulso · RF109 (ampliación): inicio automático de la evaluación en vivo
-- El profesor puede indicar la fecha y hora de inicio (o «dentro de N minutos», que el formulario convierte en fecha)
-- de una evaluación en vivo. Llegada esa hora la evaluación se abre sola, dura su tiempo límite y se cierra sola,
-- sin que el profesor entre al aula a pulsar «Iniciar en vivo». Si no indica fecha, sigue siendo manual.
-- La fuente de verdad es el reloj de la base: `evaluacion_abierta` considera el inicio programado (abre_en),
-- así que funciona aunque nadie abra ninguna pantalla. `activar_evaluaciones_programadas` solo ordena el estado
-- (en_curso + iniciada_en) para los paneles del profesor.

-- ---------------------------------------------------------------- ¿está abierta ahora?
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
          -- En vivo: empieza cuando el profesor la inicia (iniciada_en) o a la hora programada (abre_en)
          e.modo = 'en_vivo'
          and e.estado in ('programada', 'en_curso')
          and coalesce(e.iniciada_en, e.abre_en) is not null
          and e.tiempo_limite_s > 0
          and statement_timestamp() >= coalesce(e.iniciada_en, e.abre_en)
          and statement_timestamp() <
            coalesce(e.iniciada_en, e.abre_en) + make_interval(secs => e.tiempo_limite_s)
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

-- ---------------------------------------------------------------- ordenar el estado de las programadas
-- Pasa a «en_curso» las evaluaciones en vivo cuya hora de inicio ya llegó y siguen dentro de su tiempo límite.
-- Es idempotente y segura de llamar desde cualquier pantalla: solo aplica lo que el reloj ya decidió.
create or replace function public.activar_evaluaciones_programadas()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_n integer;
begin
  update public.evaluaciones as e
     set estado = 'en_curso',
         iniciada_en = e.abre_en
   where e.modo = 'en_vivo'
     and e.estado = 'programada'
     and e.iniciada_en is null
     and e.abre_en is not null
     and e.tiempo_limite_s > 0
     and statement_timestamp() >= e.abre_en
     and statement_timestamp() < e.abre_en + make_interval(secs => e.tiempo_limite_s);
  get diagnostics v_n = row_count;
  return v_n;
end;
$$;

revoke all on function public.activar_evaluaciones_programadas() from public, anon;
grant execute on function public.activar_evaluaciones_programadas() to authenticated;

-- ---------------------------------------------------------------- asignar con inicio automático
-- Igual que antes, pero el modo en vivo acepta una fecha de inicio (p_abre_en, opcional).
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
    -- Inicio automático: la hora no puede estar ya vencida (se tolera un margen de 5 minutos por el reloj del equipo)
    if p_abre_en is not null
       and p_abre_en + make_interval(secs => p_tiempo_limite_s) <= statement_timestamp() then
      raise exception 'La fecha de inicio ya pasó: elige una hora futura.';
    end if;
  else
    raise exception 'Selecciona un modo de aplicación válido.';
  end if;

  update public.evaluaciones as e
  set modo = p_modo,
      estado = 'programada',
      -- ventana: apertura y cierre. en vivo: abre_en es el inicio automático (null = lo inicia el profesor)
      abre_en = p_abre_en,
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

-- ---------------------------------------------------------------- iniciar / cerrar a mano
-- «Iniciar» sigue sirviendo para adelantar el inicio; si la evaluación ya está abierta (por inicio automático) no la reinicia.
-- «Cerrar» también funciona sobre una evaluación abierta automáticamente.
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
    if public.evaluacion_abierta(p_evaluacion_id) then
      raise exception 'La evaluación ya está en curso.';
    end if;

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
      and e.estado in ('programada', 'en_curso')
      and public.evaluacion_abierta(e.id)
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

-- ---------------------------------------------------------------- lo que ve el estudiante
-- El cierre de una evaluación en vivo es inicio (manual o programado) + tiempo límite; si ese tiempo ya pasó, está cerrada.
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
        coalesce(e.iniciada_en, e.abre_en) + make_interval(secs => e.tiempo_limite_s)
      else e.cierra_en
    end,
    case
      when i.fin is not null then 'entregada'
      when public.evaluacion_abierta(e.id) then 'disponible'
      when e.estado in ('cerrada', 'en_curso')
        or (e.modo = 'ventana' and e.cierra_en <= statement_timestamp())
        or (e.modo = 'en_vivo'
            and coalesce(e.iniciada_en, e.abre_en) is not null
            and e.tiempo_limite_s > 0
            and coalesce(e.iniciada_en, e.abre_en) + make_interval(secs => e.tiempo_limite_s) <= statement_timestamp())
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
