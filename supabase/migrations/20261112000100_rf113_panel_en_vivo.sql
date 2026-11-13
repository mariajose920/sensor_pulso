-- ============================================================================
-- sensor_pulso · Migración RF113: Panel en Vivo y Monitoreo de Avance
-- Requerimiento RF113: "Panel que muestra en tiempo real el avance de los estudiantes."
-- ============================================================================

-- 1. Habilitación de tablas en publicación supabase_realtime para eventos en vivo
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'respuestas'
    ) then
      alter publication supabase_realtime add table public.respuestas;
    end if;

    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'intentos_evaluacion'
    ) then
      alter publication supabase_realtime add table public.intentos_evaluacion;
    end if;
  end if;
end $$;

-- 2. Columnas de estado de conexión y heartbeat en intentos_evaluacion
alter table public.intentos_evaluacion
  add column if not exists ultimo_heartbeat timestamptz default now(),
  add column if not exists conectado boolean default false;

create index if not exists intentos_eval_heartbeat_idx
  on public.intentos_evaluacion (evaluacion_id, ultimo_heartbeat desc);

-- 3. Función RPC para que el estudiante informe presencia / latido de conexión en vivo
create or replace function public.ping_presencia_estudiante_rf113(
  p_evaluacion_id uuid,
  p_intento_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_afectadas integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Sesión requerida' using errcode = '42501';
  end if;

  update public.intentos_evaluacion
  set ultimo_heartbeat = statement_timestamp(),
      conectado = true
  where id = p_intento_id
    and evaluacion_id = p_evaluacion_id
    and usuario_id = auth.uid()
    and fin is null;

  get diagnostics v_afectadas = row_count;
  return v_afectadas > 0;
end;
$$;

revoke all on function public.ping_presencia_estudiante_rf113(uuid, uuid) from public, anon;
grant execute on function public.ping_presencia_estudiante_rf113(uuid, uuid) to authenticated;

-- 4. Función RPC para desconectar estudiante al salir de la evaluación
create or replace function public.desconectar_estudiante_rf113(
  p_evaluacion_id uuid,
  p_intento_id uuid
)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_afectadas integer := 0;
begin
  if auth.uid() is null then
    return false;
  end if;

  update public.intentos_evaluacion
  set conectado = false,
      ultimo_heartbeat = statement_timestamp()
  where id = p_intento_id
    and evaluacion_id = p_evaluacion_id
    and usuario_id = auth.uid();

  get diagnostics v_afectadas = row_count;
  return v_afectadas > 0;
end;
$$;

revoke all on function public.desconectar_estudiante_rf113(uuid, uuid) from public, anon;
grant execute on function public.desconectar_estudiante_rf113(uuid, uuid) to authenticated;

-- 5. Función RPC principal del panel en vivo para el profesor
create or replace function public.obtener_avance_en_vivo_rf113(
  p_evaluacion_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_eval record;
  v_total_preguntas integer := 0;
  v_total_asignados integer := 0;
  v_total_respuestas integer := 0;
  v_conectados integer := 0;
  v_en_progreso integer := 0;
  v_finalizados integer := 0;
  v_estudiantes jsonb := '[]'::jsonb;
  v_avance_global numeric(5,2) := 0;
begin
  -- 1. Validar que la evaluación existe y que el solicitante es profesor del aula o admin
  select e.id, e.aula_id, e.titulo, e.tipo, e.modo, e.estado, e.tiempo_limite_s, e.iniciada_en
    into v_eval
    from public.evaluaciones e
   where e.id = p_evaluacion_id;

  if not found then
    raise exception 'Evaluación no encontrada' using errcode = 'P0002';
  end if;

  if not (public.profesor_de_evaluacion(p_evaluacion_id) or public.es_admin()) then
    raise exception 'Solo el profesor del aula puede ver el avance en vivo.' using errcode = '42501';
  end if;

  -- 2. Cantidad de preguntas de la evaluación
  select count(*)::integer into v_total_preguntas
    from public.evaluacion_preguntas
   where evaluacion_id = p_evaluacion_id;

  -- 3. Estudiantes asignados y activos en el aula (RF102 / RF117)
  with estudiantes_elegibles as (
    select distinct m.usuario_id, p.nombre, p.correo
      from public.aula_estudiantes m
      join public.perfiles p on p.id = m.usuario_id
      join public.evaluaciones e on e.aula_id = m.aula_id
      join public.evaluacion_asignaciones a on a.evaluacion_id = e.id
     where e.id = p_evaluacion_id
       and m.estado = 'activo'
       and (
         a.alcance = 'aula'
         or (a.alcance = 'estudiante' and a.usuario_id = m.usuario_id)
         or (a.alcance = 'curso' and exists (
               select 1 from public.curso_estudiantes c
                where c.curso_id = a.curso_id and c.usuario_id = m.usuario_id
            ))
       )
  ),
  resumen_intentos as (
    select
      ee.usuario_id,
      ee.nombre,
      ee.correo,
      i.id as intento_id,
      i.inicio,
      i.fin,
      i.puntaje,
      i.puntaje_maximo,
      i.porcentaje,
      i.nivel,
      i.ultimo_heartbeat,
      coalesce(
        i.conectado = true and i.fin is null and i.ultimo_heartbeat >= statement_timestamp() - interval '60 seconds',
        false
      ) as esta_conectado,
      case
        when i.fin is not null then 'finalizado'
        when i.inicio is not null then 'en_progreso'
        else 'no_iniciado'
      end as estado_alumno,
      coalesce((
        select count(*)::integer
          from public.respuestas r
         where r.intento_id = i.id
      ), 0) as respuestas_alumno
    from estudiantes_elegibles ee
    left join public.intentos_evaluacion i
      on i.evaluacion_id = p_evaluacion_id and i.usuario_id = ee.usuario_id
  )
  select
    count(*)::integer,
    count(*) filter (where esta_conectado)::integer,
    count(*) filter (where estado_alumno = 'en_progreso')::integer,
    count(*) filter (where estado_alumno = 'finalizado')::integer,
    coalesce(sum(respuestas_alumno), 0)::integer,
    coalesce(jsonb_agg(
      jsonb_build_object(
        'usuario_id', usuario_id,
        'nombre', nombre,
        'correo', correo,
        'intento_id', intento_id,
        'conectado', esta_conectado,
        'estado', estado_alumno,
        'respuestas_guardadas', respuestas_alumno,
        'total_preguntas', v_total_preguntas,
        'porcentaje_avance', case
          when v_total_preguntas > 0 then round((respuestas_alumno::numeric / v_total_preguntas::numeric) * 100, 1)
          else 0
        end,
        'puntaje', puntaje,
        'porcentaje_calificacion', porcentaje,
        'nivel', nivel,
        'ultimo_heartbeat', ultimo_heartbeat,
        'inicio', inicio,
        'fin', fin
      ) order by esta_conectado desc, respuestas_alumno desc, nombre asc
    ), '[]'::jsonb)
    into
      v_total_asignados,
      v_conectados,
      v_en_progreso,
      v_finalizados,
      v_total_respuestas,
      v_estudiantes
    from resumen_intentos;

  -- 4. Cálculo del avance global
  if v_total_asignados > 0 and v_total_preguntas > 0 then
    v_avance_global := round((v_total_respuestas::numeric / (v_total_asignados * v_total_preguntas)::numeric) * 100, 1);
    if v_avance_global > 100 then
      v_avance_global := 100;
    end if;
  else
    v_avance_global := 0;
  end if;

  return jsonb_build_object(
    'evaluacion_id', v_eval.id,
    'aula_id', v_eval.aula_id,
    'titulo', v_eval.titulo,
    'tipo', v_eval.tipo,
    'modo', v_eval.modo,
    'estado', v_eval.estado,
    'tiempo_limite_s', v_eval.tiempo_limite_s,
    'iniciada_en', v_eval.iniciada_en,
    'total_asignados', v_total_asignados,
    'total_preguntas', v_total_preguntas,
    'conectados', v_conectados,
    'en_progreso', v_en_progreso,
    'finalizados', v_finalizados,
    'total_respuestas', v_total_respuestas,
    'porcentaje_avance_global', v_avance_global,
    'actualizado_en', statement_timestamp(),
    'estudiantes', v_estudiantes
  );
end;
$$;

revoke all on function public.obtener_avance_en_vivo_rf113(uuid) from public, anon;
grant execute on function public.obtener_avance_en_vivo_rf113(uuid) to authenticated;
